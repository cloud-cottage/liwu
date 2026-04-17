# Liwu Monorepo

`liwu` is organized as a workspace monorepo for the APP client, WeChat Mini Program, and Node backend.

## Structure

```text
liwu/
├── apps/
│   ├── app/                # Existing React/Vite app client
│   ├── web/                # Future dedicated web client
│   ├── admin/              # Dedicated admin panel
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
npm run dev:app
npm run dev:web
npm run dev:admin
npm run build:app
npm run build:web
npm run build:admin
npm run build:miniprogram
npm run build:server
```

## Notes

- `apps/app` keeps the current production client and Vercel proxy logic.
- `apps/web` is a reserved package for the future standalone web client.
- `apps/admin` is a dedicated admin panel package and currently reuses the existing dashboard implementation.
- `apps/miniprogram` is a source scaffold intended for WeChat DevTools.
- `apps/server` is a TypeScript-oriented backend skeleton ready for module expansion.
- `packages/*` are shared packages for cross-client reuse.
