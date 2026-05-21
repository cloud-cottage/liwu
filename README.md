# Liwu Monorepo

`liwu` is organized as a workspace monorepo for the APP client, WeChat Mini Program, and Node backend.

## Structure

```text
liwu/
├── apps/
│   ├── app/                # Existing React/Vite app client
│   ├── web/                # User-facing web client
│   ├── admin/              # Dedicated admin panel (/admin)
│   ├── miniprogram/        # WeChat Mini Program scaffold
│   └── server/             # Node backend scaffold
├── packages/
│   ├── shared-types/       # Shared domain types
│   └── shared-utils/       # Shared helper functions
├── docker-compose.yml
└── package.json            # Workspace root
```

## Workspace Commands

```bash
npm run dev
npm run build
npm run lint
```

App-specific shortcuts:

```bash
 npm run dev:web
 npm run dev:admin
 npm run dev:app
 npm run build:app
 npm run build:web
 npm run build:admin
npm run build:miniprogram
npm run build:server
```

## Notes

- `apps/app` keeps the current production client and Vercel proxy logic.
- Root `npm run build` assembles a deployable output where the main site comes from `apps/web` and the admin panel comes from `apps/admin`.
- `apps/web` is a runnable web client package that currently reuses `apps/app` feature modules for fast iteration.
- `apps/admin` is a dedicated admin panel package with its own source tree and is intended to be served from `/admin`.
- `apps/miniprogram` now includes runnable `home / aware / profile / shop` page scaffolds for WeChat DevTools.
- `apps/server` is a TypeScript-oriented backend skeleton ready for module expansion.
- `packages/*` are shared packages for cross-client reuse.

## Business Rules

- 平台技术服务费分为两类全局变量：`A 类` 面向全平台普通用户消费，默认 `9%`；`B 类` 面向 partner 代理商在 web 客户端后台下单，默认 `3.3%`。
- 平台技术服务费是品牌方经营视角的数据，只允许在品牌方后台展示。代理商后台与普通用户端不展示“平台技术服务费”概念、字段或文案，只展示各自应付金额。
- 品牌方后台心灯系统在计算销售额输入变量时，统一采用“全网实物商品”口径：同时包含 `A 类` 与 `B 类` 成交，且明确排除第五类“课程”。
