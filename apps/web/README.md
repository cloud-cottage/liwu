# @liwu/web

This is the dedicated user-facing web client.

Current relationship with `apps/app`:

- `apps/web` runs as a web shell
- It reuses feature modules from `apps/app/src`
- Changes to shared modules in `apps/app` are immediately reflected in `apps/web`
- Admin functionality now lives inside `apps/web/src/admin` and is exposed through the hidden `/admin` route
