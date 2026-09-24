# Partner 后台冥想页面设计规范

**主规范**：请参考 [`meditation.admin.partner.spec.md`](./meditation.admin.partner.spec.md)（唯一权威口径；新规则 B = Paragraph→Section-Raw→Section→Chapter→Track）

本文件作为 `/partner` 管理后台冥想相关设计的别名/入口，便于团队引用。

- 对应组件：`apps/web/src/admin/components/Dashboard/MeditationPage.jsx`
- 子模块（**实际 7 项**，顺序与口径以正本 §1.2 为准）：
  - 新链路（规则 B，活跃）：段落文本库（`paragraph`）、原始音频库（`section-raw`）、冥想轨道（`med-tracks`）—— **前 3 项为新**
  - 老四 tab（冻结只读，规则 A）：音频库（`library`）、冥想库（`presets`）、冥想设置（`composition`）、冥想日历（`calendar`）—— **后 4 项冻结、待 D10**
- 奖励设置：`MeditationSettings.jsx`

更新日期：2026-09-24
