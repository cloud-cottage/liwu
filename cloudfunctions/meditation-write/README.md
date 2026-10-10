# meditation-write —— 冥想写侧云函数（后台 `med_*` CRUD ＋ 最小鉴权）

腾讯云函数 SCF；`cloudbaserc.json` 登记名 **`meditation-write`**。
为后台提供 `med_paragraphs` / `med_section_raws` / `med_section_audios` / `med_tracks`
（含 `chapters[].slots`）的**增 / 改 / 删 / 查**，用 **SCF 内置凭证**读写（服务端凭证豁免安全规则）。

---

## 0. 与 `meditation-read` 的职责边界（硬）

| 维度 | `meditation-read`（D6） | `meditation-write`（本函数） |
|------|--------------------------|-------------------------------|
| 面向 | **端侧**（App / 小程序）匿名收听 | **后台**（管理端）运维 |
| 权限 | **无鉴权**（现为口径；R39-⑩） | **必须鉴权**（本函数 §3；除 `whoami`） |
| 写路径 | **零写路径**（不 add/update/remove/set） | 即本函数的全部职责 |
| 调用方 | 不需要用户身份 | 必须能解析出**带管理标签**的后台用户 |
| 对外调用 | `getTempFileURL` 现签 | **不签发任何 URL**（只读写落库字段） |
| 依据 | R39 / R51 | 本 README（B.7 v4.40 方向 1 的写侧通道） |

> **本函数不改 `meditation-read` 的任何既有 action 行为**——端侧 D6 读通道保持无鉴权，
> **匿名用户（未登录 / 匿名身份）必须能听到音频**（Kevin 2026-10-10 硬要求，B.7 v4.40 注 二）。

---

## 1. 入参 / 出参

**入参**（`event`）：`{ action, user_id, auth_uid?, id?, data?, limit?, cascade? }`

**出参**：成功 `{ ok:true, data:{...}, meta:{request_id,action,generated_at,duration_ms} }`；
失败 `{ ok:false, error:'<CODE>', message, details?, meta? }`（**调用方按 `error` 分支、不解析 message**）。

错误码：`INVALID_EVENT` / `INVALID_ACTION` / `INVALID_PARAMS` / `DOC_NOT_FOUND` /
`AUTH_REQUIRED` / `AUTH_USER_NOT_FOUND` / `AUTH_IDENTITY_MISMATCH` / `AUTH_IDENTITY_UNVERIFIED` /
`AUTH_NOT_ADMIN` / `WRITE_FAILED`。

---

## 2. action 清单（21 条，逐条）

统一约定：`list*`→`{ collection, count, documents }`；`get*`→`{ collection, document }`；
`create*`→`{ collection, id, document }`；`update*`→`{ collection, id, updated, read_back_verified }`；
`remove*`→`{ collection, id, deleted }`。

| # | action | 入参 | 说明 |
|---|--------|------|------|
| 1 | `whoami` | `user_id?`、`auth_uid?` | **唯一不抛**的动作：回报 `{authorized, error_code, binding, user_id, is_admin, framework_identity_present, framework_identity_source}`。供后台判定登录态。 |
| 2 | `listParagraphs` | `limit?` | 列 `med_paragraphs`（≤500）。 |
| 3 | `getParagraph` | `id` | 取单条。 |
| 4 | `createParagraph` | `data` | 建（默认 `paragraph_type`＝权威首项、`created_at/updated_at` 落位）。 |
| 5 | `updateParagraph` | `id`、`data` | 改（补 `updated_at`；**R40 读回比对**）。 |
| 6 | `removeParagraph` | `id` | 删（**R38-① `deleted<1` 抛**）。 |
| 7 | `listSectionRaws` | `limit?` | 列 `med_section_raws`。 |
| 8 | `getSectionRaw` | `id` | 取单条。 |
| 9 | `createSectionRaw` | `data` | 建。 |
| 10 | `updateSectionRaw` | `id`、`data` | 改（**R40 读回比对**）。 |
| 11 | `removeSectionRaw` | `id`、`cascade?` | 删；**默认拒绝**删除仍挂候选音频的 raw（返回 `INVALID_PARAMS`＋`cascade_required:true`）；`cascade:true` 才**连带删除**该 raw 的 `med_section_audios`（挂账 **C9**）。返回 `removed_candidate_audio_count`。 |
| 12 | `listSectionAudios` | `limit?` | 列 `med_section_audios`。 |
| 13 | `getSectionAudio` | `id` | 取单条。 |
| 14 | `createSectionAudio` | `data` | 建；**字段白名单**（未知键丢弃，防从后台误写服务端字段）；`transcoded_formats` 归一为 `['opus','mp3']`。 |
| 15 | `updateSectionAudio` | `id`、`data` | 改（白名单；**R40 读回比对**）。 |
| 16 | `removeSectionAudio` | `id` | 删（**R38-① 断言**）。 |
| 17 | `listTracks` | `limit?` | 列 `med_tracks`。 |
| 18 | `getTrack` | `id` | 取单条（**原样返回落库文档**，不做读侧折回；折回属 `meditation-read`）。 |
| 19 | `createTrack` | `data` | 建；`chapters` 走**权威归一**（六章模板、末章 gap=0、**槽位白名单 4 键**）；`version=1`；**写入前槽位校验**（非法 ⇒ 抛、逐项文案）。 |
| 20 | `updateTrack` | `id`、`data` | 改；`version+1`；**槽位校验**；**R40 读回比对**。 |
| 21 | `removeTrack` | `id` | 删（**R38-① 断言**）。 |

> `chapters[].slots[]` 形状＝`{ slot_index, section_type, selector, policy }`；`selector` 只认
> `pinned(audio_id)` / `pool(section_type, tags[])`；`policy ∈ {random, no_repeat}`；槽位 `section_type`
> **取值域＝该槽所在章的「章模板 `section_types`」**（越界 ⇒ 显式拒绝，v4.39 / R49-②）。**绝不放行 URL / file_id**。

---

## 3. 鉴权（最小但**非纯自报**）——含**强度登记**

所有 action（`whoami` 除外）都要求：`user_id`（调用者自身用户标识）**能关联到调用者自己的身份**，
**且**该用户带【管理员 / 超级管理员】标签。任一不满足 ⇒ **显式拒绝**（结构化错误码），绝不静默。

### 3.1 身份信号来源（侦察结论）
- **框架身份**：`app.auth().getUserInfo()`（`@cloudbase/node-sdk`）读取 **SCF 上下文环境变量**
  `TCB_UUID` / `TCB_CUSTOM_USER_ID` / `WX_OPENID` / `TCB_ISANONYMOUS_USER`——**由平台注入、非客户端自报**。
  web 客户端经 `callFunction` 调用时携带（CLI 直调通常不带）。
- **库内可关联字段**：`users._openid`（CloudBase uuid）／`users.auth_uid`（`phone_<11位手机号>`，
  见 `packages/auth/src/normalize.js#buildAuthUid`）／`users.uid`（数字邀请码）。本函数按
  `_id` → `auth_uid` → `uid` 逐级解析 `users` 文档。

### 3.2 判定流程
1. 缺 `user_id` ⇒ `AUTH_REQUIRED`。
2. `user_id` 解析不到 `users` 文档 ⇒ `AUTH_USER_NOT_FOUND`。
3. **身份关联**：
   - **框架身份可用**（`hasContext`）⇒ `users._openid` 或 `users.auth_uid` 必须命中框架身份
     ⇒ 否则 `AUTH_IDENTITY_MISMATCH`。**绑定强度＝`framework_context`（强）**。
   - **框架身份不可用** ⇒ 要求入参 `auth_uid` 与 `users.auth_uid` 一致
     ⇒ 缺 `auth_uid` = `AUTH_IDENTITY_UNVERIFIED`；不一致 = `AUTH_IDENTITY_MISMATCH`。
     **绑定强度＝`claimed_auth_uid`（弱）**。
4. **管理标签**：服务端读 `user_tags`（`user_id`）→ `tags`（`tag_id`）取标签名，命中
   `ADMIN_ROLE_TAG_NAMES = ['超级管理员','管理员']`（**复用后台既有口径**
   `apps/web/src/pages/Partner.jsx` 的 `adminAuthorized`，**不新造第二套角色**）⇒ 否则 `AUTH_NOT_ADMIN`。
   该判定**纯服务端读库**，**不可由调用方自报**。

### 3.3 强度登记（**如实，不得写成强鉴权**）
- **`framework_context` 路径**＝强绑定：身份由 SCF 上下文注入，客户端无法伪造。
- **`claimed_auth_uid` 路径**＝**弱绑定 / 可伪造**：`auth_uid` 形如 `phone_<手机号>`，**知悉目标手机号即可伪造**；
  仅因**当前 dev 环境**（web 为匿名登录、无登录入口——R36-③；CLI 直调无上下文身份）无法取得框架身份而保留。
  **本路径下唯一不可伪造的是「管理标签」这一条服务端读库判定**——故**非纯自报**，但**身份关联本身可伪造**。
- **B 阶段（后续单）**：随 B.7 定稿把后台换成**非匿名登录 ＋ 真实身份**，届时 `framework_context` 成为唯一路径、
  `claimed_auth_uid` 弱绑定回退**应被移除**（本函数已把回退写成独立分支，便于一刀关闭）。

### 3.4 真调证据（拒绝对照）
- 无 `user_id` ⇒ `AUTH_REQUIRED`；`user_id='nope'` ⇒ `AUTH_USER_NOT_FOUND`；
- 无管理标签的普通用户 ⇒ `AUTH_NOT_ADMIN`；`auth_uid` 不符 ⇒ `AUTH_IDENTITY_MISMATCH`；
- 无框架身份且缺 `auth_uid` ⇒ `AUTH_IDENTITY_UNVERIFIED`。

---

## 4. 写成功判据（R40）与删除断言（R38-①）

- **`update` 不得用 `updated >= 1` 判成功**：`updated:0` **三义同形**（值本来相同 / 无权写静默 / 文档不存在，
  R40-②），且含对象数组载荷时 `updated` **非确定**（R40-③）。本函数 `updateDocumentAndVerify`：
  `updated >= 1` ⇒ 直接过；`updated < 1` 且无 `code` ⇒ **一次性读回比对**
  （`Date` 归一 ISO、**键序无关**深比较）：一致＝幂等 no-op 成功、不一致 ⇒ 抛
  「**{entityLabel}保存失败：未能确认写入生效（未检测到任何变化）**」（**文案不声称「无权限」**）；
  读回缺失 ⇒ 独立文案。
- **`remove` 断言影响条数**：`deleted < 1` ⇒ 抛「**{entityLabel}删除失败：影响条数为 0（文档不存在或无权删除）**」。
- CloudBase 以 **resolve** 返回 `{code,message}`（权限静默 / 集合缺失）⇒ 一律**显式抛错**，不把「没报错」当「写到了」。

---

## 5. 部署

- `cloudbaserc.json` 已登记 `meditation-write`（`timeout 30` / `memorySize 128` / `runtime Nodejs18.15` /
  `installDependency true` / **无触发器**）。
- 部署：`./scripts/deploy-meditation-functions.sh write --yes --force`
  （`scripts/deploy-meditation-functions.sh` 的 `assert_cfg` 已含本函数期望值）。
- 部署后复核：
  `cloudbase functions:invoke meditation-write -e <envId> --params '{"action":"whoami","user_id":"..."}'`
- **权限前提**：写入用 SCF 内置凭证（服务端豁免安全规则）；`med_*` 的**客户端**权限规则**本单不动**
  （B.7 权限收紧另单执行，见正本附录 B.7 v4.40 注）。

---

## 6. 目录与同步责任

```
cloudfunctions/meditation-write/
  index.js                          函数入口（鉴权 / 写原语 / CRUD handler / dispatch）
  lib/write-contract.js             错误码 · action · 入参校验 · R40 深比较 · 槽位校验 · 各集合载荷
  lib/meditation-track-normalizers.js  med_tracks 归一（含写侧 toMedTrackPayload / createDefault）
  lib/meditation-track-template.js     六章模板 · 段类型 · 槽位取值域（权威源的精简等价副本）
  lib/meditation-formats.js            med_section_audios 交付格式口径（精简等价副本）
```

- **D-B2-8**：SCF 只打包函数目录，`lib/*.js` 为权威源（`packages/shared-utils/*`、
  `apps/web/src/admin/utils/meditationTrackSlots.js`）的**精简等价副本**，各自文件头注明权威源与同步责任；
  不一致时一律以权威源为准。
- 桩测：`node scripts/tests/meditation-write.test.mjs`（69 条，桩面 / 静态；**不等于**真实 CloudBase 往返）。
