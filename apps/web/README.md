# @liwu/web

Web 客户端与管理后台。

## 架构

- 作为 Web 壳层运行，复用 `apps/app/src` 中的功能模块。
- 修改 `apps/app/src` 的共享模块会立即反映到本包。
- Partner 管理功能位于 `src/admin/`。
- 规范管理路由：`/partner`；`/admin` 保留为兼容重定向。

## 开发

```bash
# 在仓库根目录
npm run dev:web
```

本地开发端口：**5175**

## 构建与部署

根目录 `npm run build` 会构建本包并将产物复制到仓库根 `dist/`，用于 Vercel 等部署。

## 管理后台

管理端数据库服务：`src/admin/services/database.js`

包含品牌方后台、代理商后台等 Partner 管理界面，入口页面为 `src/pages/Partner.jsx`。