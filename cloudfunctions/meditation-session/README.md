# meditation-session（冥想「完成度上报 + 福豆发放」写云函数 · 腾讯云函数）

**第二批（R50 实现单）**：把「完成度上报 → 服务端校验 → 福豆发放」收敛到**服务端**完成，
**客户端不再直写 `users` / `user_wallets` 余额**。这是 **R50-③「一次到位」** 的落地：
一次修掉四个既有缺口（附录 C）：**C39 客户端直写余额 / C40 无服务端校验 / C41 幂等失效 / C42 匿名写授权**。

- **规范依据**：`docs/meditation.admin.partner.spec.md` 的 **R50**（①~⑦，v4.33）＋ **R49-④ v4.33 修订注**
  （播放过程不写服务端，**只在完播 / 主动结束时上报一次**）＋ **R39**（错误码 / 响应形状风格）＋
  附录 C **C39~C42**（本函数即为四缺口的修复落点）。
- **与单 A 的区别**：单 A（`meditation-read` 扩 action）是**只读**；本函数是**独立新函数（写侧）**，
  保持 `meditation-read` 的「零写路径」不被污染（R39-⑫ 职责边界）。
- **只有一个 action**：`reportCompletion`（缺省值）。
- 参考实现模式：`cloudfunctions/meditation-read`（同款 `@cloudbase/node-sdk`、同款凭据回退链、同款错误码风格）。

---

## 1. 入参（**字段白名单**；见 §4 校验）

调用形如：

```bash
cloudbase functions:invoke meditation-session -e liwu-d8gek6jjdab1d087c --params '{"action":"reportCompletion", ...}'
```

> ⚠ **参数只能走 `--params`**：stdin 管道会被当空事件、缺省落到默认 action。

**白名单字段（只有这些会被处理并入库；其余顶层字段一律忽略、不入库）**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `action` | string | 否 | 缺省 = `reportCompletion`；未知值 ⇒ `INVALID_ACTION` |
| `track_key` | string | 是 | 本场 Track 业务键（D6 下发） |
| `track_version` | number | 是 | 本场 Track 版本 |
| `session_key` | string(≤128) | 是 | **幂等键**（本场唯一）；重复上报只发一次 |
| `date_key` | string `YYYY-MM-DD` | 是 | 上海时区日期键（端侧 `getShanghaiDateKey`） |
| `selections` | array | 是 | **分段证据**：`[{slot_index, audio_id, duration_seconds}]`，长度 1~200 |
| `listened_seconds` | number ≥0 | 是 | 端侧累加秒数（**只能来自 `currentTime` 增量**，R50-②） |
| `completed` | boolean | 是 | 是否完播（R50-②） |
| `ended_reason` | string(≤128) | 是 | 结束原因（如 `completed` / `user_ended`；自由字符串） |
| `mode` | string(≤128) | 是 | 端侧标识（如 `app` / `miniprogram`） |
| `user_id` | string(≤128) | 是 | **发奖账号**（`users` 文档 `_id`）——见 §6 身份与 C42 缺口 |

`selections[i]` 白名单：`slot_index`（非负整数）/ `audio_id`（非空字符串）/ `duration_seconds`（≥0 数字）。

> **「字段白名单校验，多余字段不得入库」的实现语义**：本函数**只挑白名单字段**参与校验与入库，
> 其余顶层键（含云框架注入的 `userInfo` 等）一律**忽略**、**绝不入库**（被忽略的键名回传在
> `data.ignored_fields` 里，**可观测、非静默**）。**不对未知顶层字段报错**——否则真实端侧调用会被
> 框架注入的 `userInfo` 误拒（这正是白名单此处不能写成「未知即拒」的原因）。

返回骨架：

```json
{
  "ok": true,
  "data": {
    "repeated": false,
    "awarded": true,
    "reward_points": 18,
    "balance_after": 118,
    "award_skip_reason": "",
    "session_id": "…med_play_sessions._id…",
    "point_ledger_id": "…point_ledger._id…",
    "track_key": "track-default",
    "track_version": 3,
    "date_key": "2026-10-10",
    "identity": { "source": "user_info", "verified": true },
    "ignored_fields": []
  },
  "meta": { "request_id": "msn_…", "action": "reportCompletion", "generated_at": "…", "duration_ms": 42 }
}
```

错误骨架（**不抛未捕获异常、不返回部分数据当成功**）：

```json
{ "ok": false, "error": "FORGED_DURATION", "message": "存在时长越界的段（声明段时长超过库内时长）",
  "details": { "tolerance_seconds": 2, "invalid_selections": [ … ] }, "meta": { "request_id": "…", "action": "reportCompletion" } }
```

---

## 2. 错误码（调用方按 `error` 分支，**不解析 `message`**）

| 错误码 | 触发条件（**均为显式拒绝，绝不静默当成功**） |
|---|---|
| `INVALID_EVENT` | 入参不是对象 |
| `INVALID_ACTION` | `action` 非字符串 / 未知值 |
| `INVALID_PARAMS` | 必填缺失 / 类型非法（`details.missing` / `details.invalid` 逐项列出） |
| `INVALID_SELECTIONS` | `selections` 非数组 / 空 / 超 200 / 条目非法（`details.issues`） |
| `AUDIO_NOT_FOUND` | 上报的 `audio_id` **不存在于库**（R50-⑥③） |
| `FORGED_DURATION` | 某段 `duration_seconds` 超过该 `audio_id` 在库 `duration`（+容差 2s）（R50-⑥②） |
| `FORGED_LISTENED_SECONDS` | `listened_seconds` > 计划总时长（Σ 声明段时长）+ 容差 5s（R50-⑥②） |
| `INCOMPLETE_LISTEN` | `completed=true` 但 `listened_seconds` < 计划总时长 × 95%（「明显小于时长」，R50-⑤⑤） |
| `SESSION_KEY_CONFLICT` | `session_key` 已被**其它身份**占用 |
| `DAILY_AWARD_LIMIT` | 同一身份单日发放数 ≥ 上限（`MAX_DAILY_REWARDS_PER_IDENTITY = 6`）（R50-⑥④） |
| `USER_NOT_FOUND` | 发奖账号（`user_id`）不存在（先于任何写入判定，**不写**） |
| `AWARD_CANCELED` | 发放过程中某步失败 ⇒ **已回滚**（删账本 + 还原余额 + 会话标 `award_failed`），**不留半发** |
| `REPORT_FAILED` | 兜底：任何未捕获异常收敛成此码（堆栈只进日志、不下发） |

**重复上报不是错误**：同一 `session_key`（同身份）第二次 ⇒ `ok:true` 且 **`data.repeated:true`**
（`awarded` 反映首发的实际结果），**不报错成失败、不静默重发**。

---

## 3. 服务端校验（R50-⑥；**硬**，任一不过即显式拒绝）

1. **字段白名单 + 必填 + 类型**（§1）。
2. **`audio_id` 真实存在**（按 id 批量取 `med_section_audios`；缺失 ⇒ `AUDIO_NOT_FOUND`）。
3. **各段时长 ≤ 库内时长**（`duration_seconds ≤ audio.duration + 2s`；越界 ⇒ `FORGED_DURATION`）。
   库内该文档 `duration` 缺失 / 非法时**同样拒绝**（无法证明不越界 ⇒ 不静默放行）。
4. **计时上界**：`listened_seconds ≤ Σ声明时长 + 5s` 且 `≥ 0`（越界 ⇒ `FORGED_LISTENED_SECONDS`）。
5. **完成一致性**：`completed=true` 时 `listened_seconds ≥ Σ声明时长 × 0.95`（否则 ⇒ `INCOMPLETE_LISTEN`）。
6. **单日发放上限**：同一 `user_id` 当日**真实发放**（`point_ledger.delta>0`）数 ≥ 6 ⇒ `DAILY_AWARD_LIMIT`。
7. **身份**：见 §6。

> 容差常量单点定义在 `lib/reward-contract.js`（`DURATION_TOLERANCE_SECONDS` / `PLAN_TOTAL_TOLERANCE_SECONDS` /
> `COMPLETION_MIN_RATIO` / `MAX_DAILY_REWARDS_PER_IDENTITY`）——**改这些值即改口径，先读正本 R50 再动**。

---

## 4. 幂等（R50-④；**硬**）

- **幂等键 = `session_key`（＋身份）**：以 `session_key` 查 `med_play_sessions`。
  - 命中且**同身份**、且该会话为**终态**（`awarded:true` 或 `status ∈ {recorded, awarded}`）⇒ 返回 **`repeated:true`**，**不再写任何东西**。
  - 命中且**异身份** ⇒ `SESSION_KEY_CONFLICT`（防冒用他人 `session_key`）。
  - 命中但为**非终态**（`pending` / `award_failed`，即上次中途失败）⇒ **复用该会话文档重试发放**（不新建）。
- **账本侧二次幂等**：发放前按 `point_ledger.biz_type='meditation'` + **`biz_id = session_key`** 查一次；
  已存在则**采用**（`balance_after` 对齐、不新增）⇒ **同一 `session_key` 最多一条账本**。
  `biz_id` **必须是 `session_key`，绝不用 `Date.now()`**（旧写法 `mp_meditation_${Date.now()}` 已废弃）。
- **失败纪律**：发放中任一步失败 ⇒ 回滚（删本步新建的账本条目 + 还原 `users` / `user_wallets` 余额 +
  会话标 `award_failed`）并返回 `AWARD_CANCELED` ⇒ **失败必须取消、绝不创建重复发放**。

---

## 5. 发放与落库（R50-③ / ⑤；**硬**）

**成功发放时写 3 处（顺序固定，任一失败即回滚全部）：**

1. **`point_ledger`（事件账本＝权威）**：字段结构照端侧既有流水形状
   （`apps/app/src/services/cloudbase.js` 的 `recordPointLedger` / `apps/miniprogram/src/utils/meditation.js`
   的 `recordMeditationCompletion`）——`user_id` / `delta` / `balance_after` / `biz_type:'meditation'` /
   `biz_id (=session_key)` / `description` / `activity_date_key` / `activity_slot` / `meta` / `operator_id` / `created_at`。
   **不得把 `wealth_history` 嵌回 `users`**（账本为权威）。
2. **同步余额**：`users.balance` **＋** `user_wallets.balance`（后者是打包读 `saveCurrentUserProfileBundle`
   的生效来源；`user_wallets` 不存在则按 `user_id` upsert 新建）。每次写后**读回校验**（项目硬口径
   R17/R38/R40：`updated:0` 三义同形、不作成功证据）。
3. **`med_play_sessions`**：本场会话固化记录（见 §7），落 `awarded:true` / `reward_points` / `balance_after` /
   `point_ledger_id` / `status:'awarded'`。

**奖励配置读现有 `app_settings`**（键 `meditation_rewards`；字段照 `normalizeMeditationSettings`）：

| 字段（蛇形优先，兼容驼峰） | 作用 |
|---|---|
| `reward_points` ?? `rewardPoints` | 每次发放福豆数（缺省 50） |
| `allow_repeat_rewards` ?? `allowRepeatRewards` | **是否允许重复发放**（缺省 `true`）。为 `false` 且该账号**已发过**（存在 `point_ledger.delta>0` 的冥想条目）⇒ 本次 `awarded:false`、`award_skip_reason:'allow_repeat_disabled'`（**记录会话但不发放**，仍 `ok:true`） |

`reward_points ≤ 0` ⇒ `awarded:false`、`award_skip_reason:'zero_reward'`（记录会话、不写账本）。

---

## 6. 身份与 C42 缺口（R50-⑥⑤；**硬**）

发放必须能追溯到调用者身份，**匿名 `_openid` 不作为发放依据**。`lib/reward-contract.js#resolveCallerIdentity`
按下述次序解析（**不假造 uid**）：

1. **框架注入的 `event.userInfo`**（真实端侧调用时云开发注入）⇒ 取 `openId` / `uid` / `customUserId` 之一，
   `source:'user_info'`、`verified:true`；
2. 没有 ⇒ 回退端侧上报的 `user_id`，`source:'client_user_id'`、**`verified:false`**。

> **已登记缺口（C42）**：当前 **App 为 Web 端匿名登录**，`user_id`（发奖账号）由端侧提供、**服务端无法验证**；
> 小程序路径若由云开发注入 `userInfo` 则可溯源。⇒ **本函数如实登记 `identity.verified`**（入参 / 出参 / 会话记录三处），
> **不假造 uid、不静默当已验证**。真正把身份绑定到账号（非匿名）属后续批次（与附录 B.7 的权限收紧同源）。
> **登记期间不得据「匿名写授权」判本函数负**（对齐 C42 的「登记期间」口径）。

---

## 7. 新集合 `med_play_sessions`（R50-⑤；**权限硬**）

- **用途**：每次实际播放场次的**服务端权威固化**（R49-④）；与 `med_tracks`（发行单位 / 内容资产）语义分离、**不得混入**。
- **写入载荷**（`buildSessionRecord`，只含白名单字段）：`session_key` / `identity_key` / `identity_source` /
  `identity_verified` / `user_id` / `mode` / `track_key` / `track_version` / `date_key` / `selections` /
  `listened_seconds` / `plan_total_seconds` / `completed` / `ended_reason` / `awarded` / `reward_points` /
  `balance_after` / `point_ledger_id` / `status` / 时间戳。
- **⚠ 权限（必须在云开发控制台设置）**：本集合**客户端不可读写、仅云函数（服务端凭证）可写**。
  **绝不**建一个客户端可写的集合（R50-⑤；对齐附录 B.7 方案 1 的目标）。
  控制台路径：**云开发控制台 → 数据库 → `med_play_sessions` → 权限设置 → 选「仅管理端可读写」**
  （或自定义规则 `{ "read": false, "write": false }`）。
  > 云函数用 SCF 内置凭证，**不受**该客户端权限规则限制；把客户端关死才能保证「发奖不给普通用户任何 DB 写权限」。
- **集合创建**：函数在 `add` 命中 `COLLECTION_NOT_EXIST` 时**按需自建**（服务端凭证）作为兜底；
  但**权限仍须人工在控制台关死**（自建不会替你设权限）。

---

## 8. 部署（含 `--force`）

1. 领取 `cloudbaserc.json` 中本函数条目（`30s / 128MB / Nodejs18.15 / installDependency`）与
   `scripts/deploy-meditation-functions.sh` 的 `assert_cfg` 期望值**已同步**。
2. 部署（**覆盖同名函数必须带 `--force`**，否则新版 CLI 在无 TTY 时会卡在交互确认、脚本 exit 130）：

```bash
./scripts/deploy-meditation-functions.sh session --yes --force
# 或：cloudbase functions:deploy meditation-session -e liwu-d8gek6jjdab1d087c --force
```

3. 控制台把 `med_play_sessions` 客户端权限关死（§7）。
4. **真调验收**（参数只能走 `--params`）：

```bash
# 正常上报
cloudbase functions:invoke meditation-session -e liwu-d8gek6jjdab1d087c --params '{"action":"reportCompletion","track_key":"track-default","track_version":1,"session_key":"sess_demo_001","date_key":"2026-10-10","selections":[{"slot_index":0,"audio_id":"096043316ac2e45902bf6e5f54d51a04","duration_seconds":25.49}],"listened_seconds":25.49,"completed":true,"ended_reason":"completed","mode":"app","user_id":"<users._id>"}'

# 重复同一 session_key ⇒ repeated:true（只发一次）
# 伪造（某段时长越界 / audio_id 不存在）⇒ FORGED_DURATION / AUDIO_NOT_FOUND
# 缺字段（如缺 session_key / selections）⇒ INVALID_PARAMS
```

---

## 9. 已知边界 / 后续

- **端侧接入是后续单**：本单只交付云函数；`apps/**` 不动（App `awardCurrentUser` 仍直写余额属
  C39，随端侧接入单切换为调本函数后才能关闭）。
- **身份 verified=false（C42）**：见 §6。
- **单日上限 = 兜底常量**（6），非产品配额；`allow_repeat_rewards=false` 时真实上限更紧。
- **`med_play_sessions` 权限需人工在控制台关死**（§7）——脚本无法只读确认权限。
