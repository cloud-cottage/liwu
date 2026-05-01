# @liwu/miniprogram

## Open In WeChat DevTools

1. Open `apps/miniprogram` as the project root in WeChat DevTools.
2. The project now declares `cloudfunctionRoot` / `cloudbaseRoot` in `project.config.json`, so DevTools should recognize CloudBase automatically.
3. Copy `project.private.config.example.json` to `project.private.config.json` for local-only IDE settings.

## CloudBase

- Current env: `liwu-0gtd91eebd863ccf`
- The mini program uses `wx.cloud.database()` directly in `src/utils/cloudbase.js`
- Aware data reads/writes:
  - `awareness_records`
  - `app_settings`

## Current Pages

- `pages/home`: Home dashboard
- `pages/aware`: Publish aware tags and view the community tag cloud
- `pages/profile`: Maintain local profile and inspect aware history
- `pages/shop`: Reserved workshop page
