# 数据迁移脚本

本目录存放一次性或分阶段的数据迁移脚本。

## `users` 集合拆分计划

当前 `users` 集合混合了身份、资料、钱包、会员、邀请、代理商门店和运营状态。目标是将 `users` 收敛为纯身份文档，其余职责拆到独立集合（`user_profiles`、`user_wallets`、`user_memberships` 等）。

完整的技术约束与代码影响范围见根目录 [`agents.md`](../../agents.md) 中的「数据模型：users 集合拆分」章节。

## 执行顺序

| 步骤 | 脚本 | 说明 |
|---|---|---|
| 1 | `20260516_users_split_audit.mjs` | 只读盘点与冲突报告 |
| 2 | `20260516_users_split_backfill.mjs` | 创建并回填拆分集合 |
| 3 | `20260516_users_split_verify.mjs` | 对比数量与抽样校验 |

## 生产环境禁令

在以下身份冲突解决之前，**禁止**对生产环境执行写入型迁移：

- 重复的 `auth_uid`
- 重复的 `phone`
- 规范用户选择冲突

## 辅助库

- `lib/users-split-model.mjs` — 拆分字段映射模型
- `lib/cloudbase-nosql.mjs` — CloudBase NoSQL 操作封装