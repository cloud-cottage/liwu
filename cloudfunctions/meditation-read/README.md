# meditation-read（冥想只读云函数 · 腾讯云函数）

第二批第 ② 项（规范 §7 执行顺序：转码执行器 → **D6 只读云函数** → 端侧双轨播放 → D10）。
是**端侧读取 `med_tracks` / `med_section_audios` 的唯一通道**（规范 §5 / §7 的 **D6**，
R30 已把它从「优化项」升为**第二批硬前置**）：据 R28-①「`med_*` 仅创建者可读写」，
端侧身份**直连 DB 只会得到静默空集**，所以端侧必须走本函数。

- **只读**：本函数**没有任何写路径**——不 `update` / 不 `add` / 不 `remove` / 不 `set` 任何集合；
  唯一对外调用是 `getTempFileURL`（签发临时链接）。`license` 无、无定时触发器。
- **不暴露超出范围的数据**：下发字段做**最小化白名单**（见 §3），不带任何后台管理字段
  （录制人、文本快照、`paragraph_ids_snapshot`、`original_file_id`、`transcode_error` 等一律不下发）。
- 参考实现模式：`cloudfunctions/getUserPhone` / `cloudfunctions/getHomePageData`（既有只读云函数）。
  读侧 SDK 用 `@cloudbase/node-sdk`（与 `cloudfunctions/meditation-transcoder` 一致）。

## 1. 入参 / 出参

调用形如 `cloudbase functions:invoke meditation-read -e <envId> --params '{"action":"getTrack"}'`。
入参非法 / 缺失一律返回**结构化错误**（不抛未捕获异常、**不返回部分数据当成功**）：

```json
{ "ok": false, "error": "INVALID_PARAMS", "message": "未知 section_type：sec-foo", "details": { "…": "…" } }
```

| `action` | 必填参数 | 说明 |
|---|---|---|
| `getTrack`（**缺省值**） | 无（可选 `track_key` / `track_id`） | 返回一个 Track（六章模板归一化后）＋ 六章模板 ＋ **按 `section_type` 分组的可交付音频池** |
| `listTracks` | 无 | 只返回**启用** Track 的配置（不含任何音频、不签发链接） |
| `getSectionAudios` | `section_types`（数组）或 `section_type`（单个字符串） | 只返回指定 `section_type` 的可交付音频池（用于定向取/重签） |

- `getTrack` 的 Track 解析顺序：显式 `track_id` → 显式 `track_key` → `is_default: true` → 业务键 `track-default`。
- `getTrack` 只取该 Track **启用章**覆盖的 `section_type` 音频（禁用章的音频不下发）；
  `action` 省略即等价 `getTrack`；未知 `action` / 非字符串 `action` ⇒ `INVALID_ACTION`。
- 其它参数（例如 `limit`）一律忽略，不做隐式转换。

成功返回骨架：

```json
{
  "ok": true,
  "data": {
    "track": { "_id": "…", "track_key": "track-default", "version": 3, "enabled": true, "chapters": [ … 6 项 … ],
               "background_track": { "playback_mode": "loop", "volume": 0.33, "section_types": ["sec-nature","sec-bowl"] },
               "voice_track": { "playback_mode": "sequence", "volume": 1, "section_types": [ … 9 项 … ] } },
    "chapter_template": [ { "chapter_key": "chapter-nature", "order": 1, "label": "自然库",
                            "section_types": ["sec-nature"], "gap_after_seconds_default": 141, … }, … ],
    "section_audio_pools": {
      "sec-nature": [ { "_id": "…", "section_type": "sec-nature", "section_raw_id": "", "label": "自然库 take-1",
                        "duration": 301.2, "transcoded_formats": ["opus","mp3"],
                        "formats": [
                          { "format": "opus", "url": "https://…", "mime_type": "audio/ogg; codecs=\"opus\"", "is_fallback": false },
                          { "format": "mp3",  "url": "https://…", "mime_type": "audio/mpeg",                    "is_fallback": true  }
                        ] } ]
    },
    "url_policy": { "max_age_seconds": 7200, "issued_at": "…", "expires_at": "…", "reissue": "call_again" },
    "stats": { "delivered_audio_count": 7, "excluded_audio_count": 2, "excluded": { "incomplete_transcode": 1, "transcode_failed": 1,
               "transcode_in_progress": 0, "missing_file_id": 0, "signing_failed": 0 },
               "truncated_section_types": [], "track_version": 3, "…": "…" }
  },
  "meta": { "request_id": "mrd_…", "action": "getTrack", "generated_at": "…", "url_max_age_seconds": 7200 }
}
```

错误码：`INVALID_EVENT` / `INVALID_ACTION` / `INVALID_PARAMS` / `TRACK_NOT_FOUND` / `TRACK_DISABLED` / `READ_FAILED`
（调用方按 `error` 分支，不要解析 `message`；堆栈只进日志、不下发）。

## 2. 下发判据（**硬**：只下发「交付格式齐备」的音频）

规范 D3 双格式交付 ⇒ **只有 `transcoded_formats` 同时含 `opus` 与 `mp3` 才可下发**。下列情形**一律不下发**
（逐条计数落进 `stats.excluded`，不静默丢弃）：

| 不下发原因（`stats.excluded` 键） | 判据 |
|---|---|
| `incomplete_transcode` | 交付格式不齐（只有 `['opus']` ⇒ 规范视为**未完成交付**） |
| `transcode_in_progress` | `transcode_status` ∈ `{queued, processing}`（虽然格式齐了，但状态仍是进行中/不一致文档） |
| `transcode_failed` | `transcode_status === 'failed'` |
| `missing_file_id` | 交付双格式对应的 `file_id`（mp3 侧读 `fallback_file_id`，兼容历史 `mp3_file_id`）缺失 ⇒ **无法重新签发链接** |
| `signing_failed` | `getTempFileURL` 未回该 fileID 的链接（半条音频不得下发） |

- 未发布 / 对外不可用内容：Track 以 **`enabled`** 为唯一判断依据字段——`getTrack` 遇到
  `enabled === false` 直接返回 `TRACK_DISABLED`，`listTracks` 只列 `enabled !== false` 的 Track；
  音频侧以 `transcoded_formats` 齐备为唯一交付判据（规范未对 `med_section_audios` 定义「草稿」状态）。
- `stale`（Paragraph 变更标记）**不阻断**（规范：「stale 不阻断…仅提示」），故不参与过滤；
  `stale` 也不下发给端侧（数据最小化，重录提示属后台视角）。
- 每个 `section_type` 最多下发 `MAX_CANDIDATES_PER_SECTION_TYPE = 10` 条（端侧只抽一条）；
  被截断的 `section_type` 如实列进 `stats.truncated_section_types`（不假装全量）。

## 3. 临时链接（有效期 2 小时）与端侧缓存建议

- **每次调用现签**：所有 `file_id` → 临时 URL 都在这**一次** `getTempFileURL` 调用里签发，
  `maxAge = 7200`（**与规范 C11 / 质检计划 X14 的口径一致**，即 2 小时）；
  **绝不透传**落库的 `audio_url` / `fallback_audio_url`（那些是上一轮签发的，可能早已过期）。
- 去重后按需签发：只为**判定可交付**的音频签发（不齐/失败/进行中的条目连链接都不签）。
- `url_policy.expires_at` 即本批链接的失效时刻（服务端时钟）。
- **端侧缓存建议（端侧实现属第三项，这里只给口径）**：
  1. 端侧**不得把 `url` 当长期标识**；长期标识是音频记录的 `_id`（候选固化用，规范 D7）；
  2. 建议本地缓存**不超过 `max_age_seconds` 的一半（≈1 小时）**即视为陈旧，或直接以
     `url_policy.expires_at` 为准；过期 / 播放 `onerror` 时**重新调用本函数**（同参重放即得新链接）；
  3. 播放器切换曲目时按 `formats[]` 顺序尝试（`opus` → `mp3`，规范：`canPlayType` 只作选择、
     **必须**保留 `onerror` 运行时降级为 mp3；小程序侧无 `canPlayType`，直接取 mp3）。
- 端侧**永不直连 DB 读 `med_*`**（规范 §5 / R30）；本函数用 SCF 内置凭证读取，`med_*` 对匿名保持关闭。

## 4. 字段最小化白名单（下发字段）

- Track：`_id` / `track_key` / `name` / `description` / `enabled` / `is_default` / `version` /
  `total_target_seconds` / `chapters[]` / `background_track` / `voice_track`。
  **不下发**：`created_by` / `updated_by` / `created_at` 等管理审计字段。
- 音频条目：`_id` / `section_type` / `section_raw_id` / `label` / `duration` / `transcoded_formats` / `formats[]`
  （`format` / `url` / `mime_type` / `is_fallback`）。
  **不下发**：`file_id`（端侧无需持有，重签一律回调本函数）、`audio_url`（可能过期，见 §3）、
  `original_file_id` / `original_url`（原始录制件不对外）、`recorded_by` / `paragraph_ids_snapshot` /
  `text_snapshot` / `char_count` / `transcode_error` / `created_at` / `updated_at` / `stale`。

## 5. 环境变量与凭据

| 变量 | 默认 | 说明 |
|---|---|---|
| `CLOUDBASE_ENV_ID` / `TCB_ENV` / `SCF_NAMESPACE` | `liwu-d8gek6jjdab1d087c` | 环境 ID（优先取运行环境变量） |
| `TENCENT_SECRET_ID` → `TENCENTCLOUD_SECRET_ID` → `VITE_TENCENT_SECRET_ID` | 空 | **云函数内不用填**（用 SCF 角色内置凭证）；命名与既有 worker / 执行器一致，仅本地手动 invoke 时用 |
| `TENCENT_SECRET_KEY` → `TENCENTCLOUD_SECRET_KEY` → `VITE_TENCENT_SECRET_KEY` | 空 | 同上 |

密钥**不入日志**（只记录「是否提供了密钥」的布尔值），本函数**不硬编码任何密钥**。

## 6. 部署

```bash
# 单个函数（含依赖安装）
cloudbase functions:deploy meditation-read -e liwu-d8gek6jjdab1d087c

# 按 cloudbaserc.json 全量部署
cloudbase deploy

# 手动验证（读默认 Track + 音频池）
cloudbase functions:invoke meditation-read -e liwu-d8gek6jjdab1d087c --params '{"action":"getTrack"}'
cloudbase functions:invoke meditation-read -e liwu-d8gek6jjdab1d087c --params '{"action":"getSectionAudios","section_types":["sec-bowl"]}'
```

函数条目（内存 128MB / 超时 30s / 无触发器）登记在仓库根 `cloudbaserc.json`。
**建议配置**：256MB 亦可（读取 + 一次批量签发，实际耗时取决于 DB 与 COS），超时 30s 足够。

## 7. 共享代码同步责任（D-B2-8）

云函数**不能** require 仓库内共享模块（SCF 只打包函数目录）⇒ `lib/*.js` 是权威源的精简等价副本：

| 本目录副本 | 权威源 |
|---|---|
| `lib/meditation-formats.js` | `packages/shared-utils/meditation-section-audio.js` |
| `lib/meditation-track-template.js` | `packages/shared-utils/meditation-track-template.js` ＋ `packages/shared-utils/meditation-session-plan.js`（音量 / 15 分钟基准） |
| `lib/meditation-track-normalizers.js` | `packages/shared-utils/meditation-track-normalizers.js` |

`lib/read-contract.js` 是**本函数自有**的入参 / 出参契约（非副本）。
**改权威源必须同步副本**；两侧不一致时一律**以权威源为准**。字段名、章节模板、Section 名单、音量、
交付格式顺序都属于「改了要同步」的范围。

## 8. 本地自测 / 举证

自测脚本（**脚本与产物均不进仓库**）：
`/Users/kevin/.hermes/profiles/zang/cache/scratch/kong-b2-d6/selftest.mjs`

```bash
node /Users/kevin/.hermes/profiles/zang/cache/scratch/kong-b2-d6/selftest.mjs
```

用**桩 db / 桩 storage** 驱动**真实函数入口**（`exports.main` 与 `exports.__test__`），断言：
正常入参返回形状、各类非法入参的结构化错误、未完成 / 失败转码的过滤、临时链接签发次数与 `maxAge=7200`、
以及**零写调用**（桩 db 的任何写方法一被触碰即失败，另加源码写动词静态扫描）。

## 9. 已知遗留（报告给 Zang，本单未处理）

- 端侧**消费**本函数属第二批第 ③ 项（先 App、后小程序），本单不含；`session-plan` 冻结为兼容层（D9）。
- `med_*` 权限收紧（仅管理员可写）不得单独执行（R29），方案待人工拍板（附录 B.7）；本函数不受影响。
- `med_tracks` 集合**已创建**（2026-09-24 实测可写：`add` 成功且返回无错、正对照同形、两轮端到端写入/读回/删除均成功；
  规范附录 C / **C7 已关闭**）⇒ 集合创建**不再是阻塞项、无需人工再建**。本地无真实联调环境时（集合暂无 Track 文档），
  Track 类请求可能返回 `TRACK_NOT_FOUND`（空集）；音频池仍可单独用 `getSectionAudios` 验证。
- 本函数**不做身份校验**（只读、且只下发「启用 Track + 交付齐备」的播放数据）；
  若后续要收紧到「仅登录用户」，需在 `index.js` 的 `exports.main` 入口加会话校验（挂账，待裁）。
