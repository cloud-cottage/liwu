# scripts

构建、部署与数据迁移脚本。

## 脚本一览

| 文件 | 说明 |
|---|---|
| `build-deploy.mjs` | 构建 `apps/web` 并将产物复制到根 `dist/` |
| `deploy-fortune-daily-settlement.sh` | 心灯日结云函数部署辅助 |
| `audio-transcode-worker.mjs` | 冥想音频转码后台 worker |
| [migrations/](./migrations/) | 数据库迁移脚本（含 `users` 集合拆分） |

> **上线纪律**：`audio-transcode-worker` 与云函数 `meditation-transcoder` **共用同一队列但按 `transcode_profile` 分区消费（老 worker 跳 section_audio）；启用新执行器前先停 audio:transcode-worker:loop，同一时刻只允许一侧消费**。

## 常用命令

```bash
# 根目录构建部署产物
npm run build

# 音频转码 worker
npm run audio:transcode-worker
npm run audio:transcode-worker:loop
```

## 迁移注意

数据迁移脚本详见 [migrations/README.md](./migrations/README.md)。**不要在生产环境执行写入型迁移**，除非身份冲突已解决且经人工确认。