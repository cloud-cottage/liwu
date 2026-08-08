# apps

本目录包含礼物项目的全部客户端与后端应用。

## 应用一览

| 目录 | 包名 | 说明 |
|---|---|---|
| [app](./app/) | `@liwu/app` | 手机端 React/Vite 客户端，支持 Capacitor 打包 |
| [web](./web/) | `@liwu/web` | Web 客户端壳层，含 `/partner` 管理后台 |
| [miniprogram](./miniprogram/) | `@liwu/miniprogram` | 微信小程序 |
| [server](./server/) | `@liwu/server` | Node 后端骨架 |

## 模块复用关系

- `apps/web` 作为 Web 壳层，复用 `apps/app/src` 中的功能模块。
- 修改 `apps/app/src` 的共享模块会立即反映到 `apps/web`。
- Partner 管理功能位于 `apps/web/src/admin`，规范路由为 `/partner`（`/admin` 为兼容重定向）。

## 开发命令

在仓库根目录执行：

```bash
npm run dev:app          # 手机端，端口 5176
npm run dev:web          # Web 端，端口 5175
npm run build:app
npm run build:web
npm run build:miniprogram
npm run build:server
```