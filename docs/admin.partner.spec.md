# 管理员后台页面规范

## 概述
管理员后台是管理后台的最高权限角色，可访问所有功能模块，负责全局配置和系统管理。

**所属范围**：管理后台（Partner Dashboard）
**上级规范**：[`partner.spec.md`](./partner.spec.md)

## 角色权限
- 拥有管理后台的全部功能权限
- 可查看和管理所有用户、店铺、品牌
- 可进行全局系统配置
- 可进行福豆调账等敏感操作

## 功能模块
管理员后台包含以下完整功能模块：

| 模块 | 页面规范 | 说明 |
|------|----------|------|
| 总览 | - | 数据概览、关键指标统计 |
| 用户 | - | 用户列表、用户编辑、标签管理 |
| 工坊 | - | 商品管理、订单管理、店铺设置 |
| 福豆 | - | 福豆管理、调账、结算 |
| 冥想 | [`meditation.admin.partner.spec.md`](./meditation.admin.partner.spec.md) | 冥想内容管理、冥想设置 |
| 觉察 | - | 觉察标签管理、觉察内容设置 |
| 设置 | [`setting.admin.partner.spec.md`](./setting.admin.partner.spec.md) | 主题设置、页面配置、系统参数 |
| 人工智能 | - | AI 相关配置 |
| 版本 | - | 客户端版本管理、分发设置 |

## 页面结构
- 左侧：侧边栏导航（240px 宽）
- 右侧：主内容区域
- 顶部：无独立顶部导航，侧边栏包含系统信息

## 相关组件
- 主入口：`apps/web/src/pages/Partner.jsx`
- 侧边栏：Partner.jsx 内联实现
- 各功能模块：`apps/web/src/admin/components/Dashboard/` 目录下

## 并列页面规范
- [`setting.admin.partner.spec.md`](./setting.admin.partner.spec.md) — 设置页面
- [`meditation.admin.partner.spec.md`](./meditation.admin.partner.spec.md) — 冥想页面
