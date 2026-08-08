# 管理员后台 - 设置页面规范

## 概述
设置页面是管理员后台的系统配置中心，用于管理主题、页面文案、功能参数、客户端分发等全局设置。

**所属范围**：管理员后台（Admin Partner Dashboard）
**上级规范**：[`admin.partner.spec.md`](./admin.partner.spec.md)
**对应组件**：`apps/web/src/admin/components/Dashboard/ThemeSettings.jsx`

## 页面结构
设置页面顶部有 7 个子 tab 按钮，分别对应不同的设置分类：

| Tab | Key | 说明 |
|-----|-----|------|
| 首页 | `home` | 首页相关设置 |
| 工坊 | `shop` | 工坊相关设置 |
| 冥想 | `meditation` | 冥想相关设置 |
| 觉察 | `awareness` | 觉察相关设置 |
| AI | `ai` | AI相关设置 |
| 我的 | `avatar` | 我的页面相关设置 |
| 版本 | `distribution` | 客户端版本分发设置 |

---

## 1. 首页设置（home）

### 1.1 首页 PageMasthead
- **功能**：设置首页页眉的 slogan 文案
- **字段**：`homeSlogan`
- **限制**：不超过 60 字符，纯文字
- **说明**：PageMasthead 指页眉处的三行组合：英文标签、页面标题、slogan 文案

### 1.2 主题设置
- **功能**：选择和预览系统主题
- **字段**：`theme`
- **选项**：从 `THEME_PRESETS` 中选择
- **预览**：
  - 主按钮样式预览
  - 卡片背景样式预览
  - 主题色板预览（4个主色）
- **保存按钮**：保存主题设置

### 1.3 品牌轮播图
- **功能**：维护首页轮播的品牌图片与对应文案
- **字段**：`brandCarouselSettings.slides`（数组）
- **数量**：4 张轮播图
- **每张图包含**：
  - 图片上传（上传到 CloudBase 云存储，格式为 WebP）
  - 图片文案（textarea，多行）
- **保存按钮**：保存轮播图设置

---

## 2. 工坊设置（shop）

### 2.1 工坊 PageMasthead
- **功能**：设置工坊页面页眉的 slogan 文案
- **字段**：`shopSlogan`
- **限制**：不超过 60 字符，纯文字

### 2.2 平台技术服务费
- **功能**：设置平台技术服务费费率
- **字段**：`platformServiceFeeSettings`
- **包含**：
  - 消费者费率（consumerRate）
  - 代理商费率（partnerAgentRate）

### 2.3 代理商折扣梯度
- **功能**：设置代理商折扣定价梯度
- **字段**：`shopPartnerPricingSettings.tiers`（数组）
- **说明**：不同层级的代理商享受不同的折扣价格

### 2.4 工坊返豆比例
- **功能**：设置工坊消费返豆比例
- **字段**：`shopRewardSettings.rewardBeansPerYuan`
- **说明**：每消费 1 元返还多少福豆

---

## 3. 冥想设置（meditation）

### 3.1 冥想 PageMasthead
- **功能**：设置冥想页面页眉的 slogan 文案
- **字段**：`meditationSlogan`
- **限制**：不超过 60 字符，纯文字

### 3.2 冥想设置
- **功能**：冥想相关的详细配置
- **组件**：`MeditationSettings.jsx`
- **说明**：使用独立的 MeditationSettings 组件，具体内容详见该组件

---

## 4. 觉察设置（awareness）

### 4.1 觉察 PageMasthead
- **功能**：设置觉察页面页眉的 slogan 文案
- **字段**：`awarenessSlogan`
- **限制**：不超过 60 字符，纯文字

### 4.2 词云显示数量
- **功能**：设置觉察页面词云中最多显示多少个标签
- **字段**：`awarenessDisplaySettings.popularTagCount`
- **默认值**：33
- **说明**：该参数会影响同心照亮词云聚合区

---

## 5. 我的设置（avatar）

### 5.1 调试卡片
- **功能**：控制【我的】页面中的调试卡片显示与否
- **字段**：`showDebugCard`
- **类型**：开关（Boolean）
- **说明**：便于后续统一隐藏调试信息

### 5.2 用户头像
- **功能**：设置用户可选的默认头像选项
- **字段**：`userAvatarOptionsSettings.avatars`（数组）
- **功能**：
  - 上传头像图片
  - 管理头像列表
- **保存按钮**：保存头像选项设置

### 5.3 徽章设置
- **功能**：徽章系统相关配置
- **组件**：`BadgeSettings.jsx`
- **说明**：使用独立的 BadgeSettings 组件，具体内容详见该组件

---

## 6. 版本设置（distribution）

### 6.1 客户端分发
- **功能**：配置客户端下载和预览地址
- **字段**：`clientDistributionSettings`
- **包含**：
  - 预览地址（previewUrl）
  - Android APK 地址（androidApkUrl）
  - iOS 分发地址（iosDistributionUrl）

### 6.2 本地构建状态
- **功能**：显示本地构建状态（仅本地管理员可见）
- **字段**：`localBuildStatus`
- **包含**：
  - 是否正在构建（building）
  - 最后构建时间（lastBuiltAt）
  - 最后错误（lastError）
  - 最后日志（lastLog）
  - APK 地址（apkUrl）
  - APK 是否存在（apkExists）
- **权限**：仅 `isLocalAdmin` 为 true 时可见

---

## 数据存储
所有设置数据存储在 CloudBase 云数据库中，通过 `DatabaseService` 进行读写。

### 相关数据库集合
- `theme_settings` - 主题设置
- `awareness_display_settings` - 觉察显示设置
- `brand_carousel_settings` - 品牌轮播设置
- `user_avatar_options_settings` - 用户头像选项设置
- `client_distribution_settings` - 客户端分发设置
- `page_masthead_settings` - 页面页眉设置
- `meditation_settings` - 冥想设置
- `badge_settings` - 徽章设置
- `platform_service_fee_settings` - 平台服务费设置
- `shop_reward_settings` - 工坊奖励设置
- `shop_partner_pricing_settings` - 工坊合作伙伴定价设置

## 并列页面规范
- [`meditation.admin.partner.spec.md`](./meditation.admin.partner.spec.md) — 冥想页面
