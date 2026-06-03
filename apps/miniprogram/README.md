# @liwu/miniprogram

## Open In WeChat DevTools

1. If you only need the mini program source, you can open `apps/miniprogram`.
2. If you need to manage CloudBase functions in DevTools, open the repository root `/Users/kevin/git/liwu` instead. The root [project.config.json](/Users/kevin/git/liwu/project.config.json) points:
   - `miniprogramRoot` -> `apps/miniprogram/src/`
   - `cloudfunctionRoot` -> `cloudfunctions/`
3. Copy `project.private.config.example.json` to `project.private.config.json` for local-only IDE settings.

## CloudBase

- Current env: `liwu-0gtd91eebd863ccf`
- The mini program uses `wx.cloud.database()` directly in `src/utils/cloudbase.js`
- WeChat mini program credentials should be provided via local environment variables:
  - `WECHAT_MINIPROGRAM_APP_ID`
  - `WECHAT_MINIPROGRAM_APP_SECRET`
- Aware data reads/writes:
  - `awareness_records`
  - `app_settings`

## Current Pages

- `pages/home`: Home dashboard
- `pages/aware`: Publish aware tags and view the community tag cloud
- `pages/profile`: Maintain local profile and inspect aware history
- `pages/shop`: Reserved workshop page
