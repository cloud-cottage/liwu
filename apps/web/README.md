# @liwu/web

This is the dedicated user-facing web client.

Current relationship with `apps/app`:

- `apps/web` runs as a web shell
- It reuses feature modules from `apps/app/src`
- Changes to shared modules in `apps/app` are immediately reflected in `apps/web`
- Partner management functionality now lives inside `apps/web/src/admin`
- The canonical management route is `/partner`; `/admin` remains as a compatibility redirect
