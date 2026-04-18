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
