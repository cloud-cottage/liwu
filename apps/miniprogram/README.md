# @liwu/miniprogram

微信小程序客户端。

## 用微信开发者工具打开

1. 仅需小程序源码时，打开 `apps/miniprogram` 目录。
2. 需同时管理 CloudBase 云函数时，打开**仓库根目录** `/Users/kevin/git/liwu`。根目录 `project.config.json` 配置：
   - `miniprogramRoot` → `apps/miniprogram/src/`
   - `cloudfunctionRoot` → `cloudfunctions/`
3. 复制 `project.private.config.example.json` 为 `project.private.config.json` 存放本地 IDE 配置。

## 环境

- CloudBase 环境 ID：`liwu-d8gek6jjdab1d087c`
- 数据库访问：`src/utils/cloudbase.js`（`wx.cloud.database()`）
- 微信凭证通过本地环境变量提供：
  - `WECHAT_MINIPROGRAM_APP_ID`
  - `WECHAT_MINIPROGRAM_APP_SECRET`

## 页面结构

底部导航栏四个页面：

| 页面 | 路径 | 说明 |
|---|---|---|
| 首页 | `pages/home` | 首页仪表盘 |
| 工坊 | `pages/shop` | 工坊（预留） |
| 觉察 | `pages/aware` | 发布觉察标签、查看社群标签云 |
| 我的 | `pages/profile` | 个人资料与觉察历史 |

另有 `pages/meditation` 冥想页面。

## 数据集合

- `awareness_records` — 觉察记录
- `app_settings` — 应用设置

## 组件

可复用组件放在 `src/components/` 目录。

## 云函数说明

`apps/miniprogram/cloudfunctions/` 目录仅用于让微信开发者工具识别云开发项目，**实际云函数代码在仓库根目录 `cloudfunctions/`**。