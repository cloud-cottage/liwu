# cloudfunctions

腾讯云函数部署目录，由根目录 `cloudbaserc.json` 管理。

## 环境

- 环境 ID：`liwu-d8gek6jjdab1d087c`
- 函数根目录：本目录（`cloudfunctions/`）

## 已纳入部署的函数

| 函数 | 说明 |
|---|---|
| `fortuneDailySettlement` | 心灯日结，含每日 04:00 timer trigger |
| `getUserPhone` | 获取用户手机号 |
| `meditation-transcoder` | 冥想音频转码执行器（第二批①）：每分钟 timer 扫描 `audio_transcode_jobs`，单次 ffmpeg 双路输出 Opus `.ogg` + mp3 兜底并回写 `med_section_audios`。**需挂载 ffmpeg 层**，部署说明见 `meditation-transcoder/README.md` |
| `meditation-read` | 冥想**只读**云函数（第二批②＝D6 / X14）：端侧读 `med_tracks` / `med_section_audios` 的唯一通道（`med_*` 对匿名保持关闭）。只下发**交付格式齐备**（`transcoded_formats` 含 opus ＋ mp3）的音频，并按 `file_id` **现签** 2 小时临时 URL（`maxAge = 7200`）。**零写路径**，入参 / 出参见 `meditation-read/README.md` |

## 部署

⚠ **上线纪律（D-B2-9 队列分区）**：`meditation-transcoder` 与 `scripts/audio-transcode-worker.mjs`
消费同一个 `audio_transcode_jobs` 队列，**同一时刻只允许一侧消费**——启用新执行器前先停掉
`npm run audio:transcode-worker:loop`（反向回滚同理）。分区过滤、`section_audio` profile 口径与
详细顺序见 `meditation-transcoder/README.md` §1.1。

```bash
# 部署单个函数
cloudbase functions:deploy fortuneDailySettlement -e liwu-d8gek6jjdab1d087c

# 按 cloudbaserc.json 全量部署（含 trigger）
cloudbase deploy

# 手动触发验证
cloudbase functions:invoke fortuneDailySettlement -e liwu-d8gek6jjdab1d087c
```

## 共享逻辑

`fortuneDailySettlement` 的核心结算逻辑在 `packages/shared-utils/fortune-daily-settlement-core.js`，修改业务规则时请同步更新云函数与共享包。