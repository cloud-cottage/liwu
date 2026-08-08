# P6: users 集合拆分 恢复计划

**日期**: 2026-07-01 (更新)  
**状态**: 用户信息冲突已延后；前端细节任务已从 Jing 转移给 Neng；当前焦点 P6-extend-dualwrite，按 A → B → C 顺序执行。

## 用户最新指示（2026-07-01）
- 用户信息冲突全部延后。
- 继续其他事务（主要推进双写代码）。
- **前端细节任务转移**：
  - 本地环境搭建（5175 端口可访问）
  - 前端细节验证（UI 布局、交互、数据展示效果）
  - 以上全部从 Jing 转移给 Neng。
- 其他角色保持不变。
- 按照顺序 **A → B → C** 逐个执行。

### 确认后的角色定义（已写入本计划，作为当前 SOUL 操作补充）
- **Zang（管理员）**：最高统筹、仲裁、审批。任务下发、规范审批、分歧裁决、上线决策。
- **Kong（操作员）**：开发执行、功能产出。依据规范完成全部功能开发，输出合规代码。
- **Neng（质检员）**：测试、质量校验 + **前端细节验证**。
  - 依照规范编写用例、执行全量测试、出具报告。
  - **一旦代码有改动，随时进行测试验证**（持续测试职责）。
  - 负责本地环境搭建（5175 端口可访问）。
  - 负责前端细节验证（UI 布局、交互、数据展示效果）。
  - 与 Kong 形成审查-测试闭环。
- **Jing（规范员）**：制定标准、合规监督。编写全套规范、核查交付物合规性、监督测试流程（不直接执行前端测试或环境搭建）。

**更新日志**：前端细节任务（env 5175 + UI verification）已从 Jing 转移给 Neng。Neng 现为综合质检 + 前端细节负责人。

## 执行顺序（按用户要求 A → B → C）

### A. Miniprogram profile 流 bundle 集成
**Kong 实现任务**（部分落地）：
- shop.js 已引入 bundle helpers（createLoadMergedUserDocument, createGetCurrentUserProfileBundle, createSaveCurrentUserProfileBundle）。
- getCurrentShopProfile 已更新为优先使用 bundle reader（getCurrentUserProfileBundle）获取 merged 数据（balance, wealthHistory, isStudent 等），带 fallback。
- getOrCreateCurrentUser 仍保留部分 direct users 逻辑（主要用于创建/身份初始化路径）。
- profile.js 保持调用 getCurrentShopProfile（现可获得 bundle 数据）。

**Neng 审查 + 前端验证**（已完成）：
- 5175 运行中（Neng 负责）。
- 前端验证（5175/profile）：布局正常，福豆 0，暂无记录，游客/付费学员，无 breakage。
- Code review：bundle 读路径正确，行为保留，agents.md 合规。
- 差距（非阻塞）：getOrCreate 仍 legacy heavy；新用户仅创建 users doc；miniprogram 用本地 shared 副本；guest 模式数据为 0。
- **结论**：A 良好，**go-ahead for B**。

### B. App wealthService spendCurrentUser bundle 扩展
**Kong 实现任务**（已落地）：
- apps/app/src/services/cloudbase.js（wealthService）已更新。
- spendCurrentUser 现使用 saveCurrentUserProfileBundle（balance + wealth_history），与 awardCurrentUser 模式一致。
- 保持原有签名、early returns、cache updates、inviter logic、return shape、behavior 完全一致（dualWriteLegacyUsers 保持 true）。
- 其他 award 路径之前已合规。
- 添加了 bundle 使用注释。
- 仅修改此文件，未触碰 miniprogram / cloudfunctions / 其他。

**Neng 审查 + 测试 + 前端验证**（进行中）：
- 代码变更已直接验证：bundle 调用落地，行为一致。
- 5175 前端验证（Neng 负责）：UI 正常，当前数据 0/暂无记录（过渡期一致，无 breakage）。
- 待 Neng 出具正式审查报告。

### C. 持续测试 + 前端细节验证（Neng 负责）
- 每次代码变更后 Neng 执行测试 + 前端细节验证。
- 包括 5175 环境维护和 UI/数据展示确认（福豆、wealth 记录、学生状态等）。
- 出具报告。

## 当前状态（2026-07-01，直接验证）
- 5175 环境：运行中（Neng 负责）。
- Miniprogram profile 流：bundle 基础设施已就位，getCurrentShopProfile 已切换为 bundle 优先。
- App wealth：B 已落地（spendCurrentUser 使用 bundle）。
- Neng 审查任务：A 已完成（良好），B + 5175 前端验证进行中。
- 冲突解决：延后（按用户指示）。

## 里程碑状态
- P6-recovery-audit：已完成
- P6-resolve-conflicts：延后
- P6-backfill-verify：延后
- P6-extend-dualwrite：进行中（A Neng 审查通过，B 实现落地）
- P6-switch-mainwrite：待开始
- P6-testing：Neng 持续负责（含前端细节）

## 团队角色（最终确认）
- Kong：实现
- Neng：审查 + 持续测试 + 前端细节验证（5175 env + UI/数据展示）
- Jing：标准制定与合规监督
- Zang：统筹

下一步：Neng 审查 B + 5175 前端细节验证（A 已确认）。B 实现已完成，A Neng 审查通过。冲突解决保持延后。

---
*更新日志*
- 2026-07-01：前端细节（5175 + UI 验证）从 Jing 转移给 Neng。角色定义更新。A B C 顺序确认。A Neng 审查完成（良好，go-ahead）。B 实现落地。计划同步。