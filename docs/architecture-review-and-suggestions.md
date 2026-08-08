# Liwu 项目架构评审与演进建议

**日期**: 2026-07-01  
**评审人**: Zang (Macro Administrator)  
**聚焦范围**: /liwu monorepo 整体架构  
**目的**: 从架构角度提供结构化建议，帮助团队稳定当前系统、降低技术债、支持业务增长。

## 1. 当前架构概述

Liwu 是一个多端礼物/觉察/冥想/伙伴商业平台，采用 **monorepo + npm workspaces** 管理。

### 核心目录结构
```
liwu/
├── apps/
│   ├── app/          # React + Vite + Capacitor (移动端)
│   ├── web/          # React 壳层 + /partner 管理后台 (复用 app)
│   ├── miniprogram/  # 微信小程序 (独立实现)
│   └── server/       # Node 后端骨架 (待扩展)
├── packages/
│   ├── auth/         # 登录、会话、用户解析 (OTP、微信绑定等)
│   ├── shared-utils/ # 业务核心、CloudBase 封装、设置、结算逻辑
│   ├── shared-types/ # 共享 TS 类型
│   └── shared-assets/# 图标/资源同步
├── cloudfunctions/   # 腾讯云函数 (fortuneDailySettlement 等)
├── scripts/          # 构建、同步、迁移
├── api/              # Vercel 代理处理
├── cloudbaserc.json  # CloudBase 配置
└── vercel.json       # Web 部署配置
```

### 关键技术栈
- **前端**: React 19 + Vite + React Router
- **移动**: Capacitor (iOS/Android)
- **小程序**: 原生微信 (wx.cloud)
- **后端/BaaS**: 腾讯 CloudBase (数据库 + 云函数 + 认证) + 部分 Vercel 代理
- **数据**: NoSQL 集合 (users 拆分中、point_ledger 事件源、partner_brands 等)
- **共享**: packages/ + Vite alias (@liwu/* + @app for web)
- **部署**: Vercel (Web) + CloudBase (DB/funcs) + 微信平台

### 关键设计决策与现状
- **共享策略**: packages/ 承载业务逻辑 (shared-utils 非常丰富)，web 通过 `@app` alias 直接复用 app/src 部分模块。
- **数据访问**: 客户端通过 shared-utils/cloudbase-* 封装访问 DB，直接 _openid 权限 + 云函数。
- **身份与伙伴**: packages/auth 实现复杂解析 (phone OTP、anonymous、wechat、user-resolver)，但近期有大量探针调试文件，说明仍不稳定。
- **业务规则**: 集中放在 shared-utils/*-settings.js (服务费 A 9%/B 3.3%、结算、心灯口径等)，文档严格约束。
- **数据模型演进**: users 集合正在拆分为纯身份 + user_profiles / user_wallets / user_memberships / user_partner_identities 等，point_ledger 作为财富事件源。
- **同步机制**: miniprogram 依赖 scripts 进行 assets/packages 同步。

## 2. 架构优势

1. **业务逻辑集中提取**：shared-utils 包含大量领域设置、核心计算 (fortune-daily-settlement-core、platform-service-fee-settings 等)，减少重复。
2. **多端复用起点好**：packages/auth 和 shared-utils 已在 app/web 使用，Vite alias 工作正常。
3. **事件溯源雏形**：point_ledger 作为财富历史单一真相来源，方向正确。
4. **快速迭代能力**：CloudBase 让小程序和认证开箱即用，适合早期产品。
5. **文档与约束完善**：agents.md、README、业务规则文档清晰（尤其对 AI 协作者）。
6. **代理与本地开发支持**：web 有自定义 vite 插件处理云函数代理、TTS 等。

## 3. 架构问题与风险（优先级排序）

### P0 - 关键风险（需立即关注）
- **用户身份与伙伴解析脆弱**：大量 .tmp_liwu_probe_* 文件表明 partner resolution、profile、session 状态存在 bug。直接操作 users 集合 + 复杂 resolver 容易引入不一致。
- **users 集合拆分未完成**：当前 users 仍混合身份/资料/钱包/会员/代理，违反单一职责。迁移脚本存在，但前置条件（身份冲突解决）未明确验证。
- **平台间紧耦合**：web 通过 `@app` alias 直接依赖 app/src，导致修改 app 必须手动验证 web。miniprogram 独立 + sync 脚本易碎。
- **直接 DB 访问缺乏抽象**：客户端/云函数大量直接 collection 操作，权限散落，难以做事务、审计、版本、限流。

### P1 - 高优先级问题
- **Monorepo 工具链落后**：npm workspaces + 根 package-lock.json（非最佳实践）。安装慢、无严格 peerDeps、无构建缓存。sync 脚本是症状。
- **缺少统一 API 层**：无 BFF 或后端服务，业务逻辑部分在客户端、部分在云函数、部分在 shared-utils。切换后端或加复杂查询困难。
- **小程序代码重复**：独立实现 + 手动同步，无法共享 React 组件/逻辑。
- **部署与配置碎片化**：Vercel + CloudBase + 域名过渡期 (liwu.nvshen.love / liwu2026.vercel.app)。无可见 CI/CD 流水线。
- **类型与一致性**：shared-types 存在但使用少，大量 .js，运行时错误风险高。

### P2 - 中长期关注
- **后端骨架闲置**：apps/server/ 几乎为空，无法支撑复杂结算或自定义逻辑。
- **前端状态与数据获取**：依赖 context + 自定义 services，无 TanStack Query / SWR 等缓存/同步策略。
- **可观测性缺失**：无统一日志、错误追踪、性能监控。
- **测试与质量门禁**：未见测试套件、E2E 或 contract 测试。
- **平台演进路径模糊**：三端长期维护成本高。

## 4. 架构演进建议（具体、可执行）

### 4.1 立即稳定（P0，1-2 周内）
1. **固化 Auth 层**
   - 完成 packages/auth 的全面测试（尤其是 user-resolver.js、resolveUserByPhone/Id）。
   - 清理所有 .tmp_liwu_probe_* 文件，替换为正式调试工具或单元测试。
   - 引入 session 版本或校验机制，防止状态漂移。

2. **推进 users 拆分**
   - 优先解决身份冲突（重复 auth_uid/phone）。
   - 按照 agents.md 规划创建 user_profiles、user_wallets、user_partner_identities 等集合。
   - 在 shared-utils 提供兼容 bundle API (getCurrentUserProfileBundle 等)。
   - 双读双写过渡期至少 2 周，带回滚脚本。

3. **解耦 app/web**
   - 将 web 真正依赖的 UI/业务模块逐步迁移到 packages/ (e.g. packages/ui 或 packages/shared-components，如果适用)。
   - 移除或最小化 `@app` alias，只允许 packages 导入。
   - 更新 web/README.md 和 agents.md 反映新现实。

### 4.2 工具链与共享现代化（P1，2-4 周）
4. **升级 Monorepo 管理**
   - 迁移到 pnpm（推荐）：
     - 添加 pnpm-workspace.yaml
     - 替换 package-lock.json
     - 更新所有 scripts（dev、build 等）
   - 引入 Turborepo（或 Nx）用于任务编排、缓存、依赖图可视化。
   - 统一 lint / format / typecheck 脚本。

5. **加强共享与类型**
   - 把 shared-utils 部分文件迁移到 src/ 并导出干净 index。
   - 扩大 shared-types 使用（为关键实体建模：User, PointLedgerEvent, PartnerBrand 等）。
   - 为 miniprogram 提供更好的共享策略（TypeScript 转译或专用 shared-weapp 包）。

6. **小程序共享改进**
   - 评估是否值得引入 Taro（可同时输出小程序 + Web + 移动），或保持现状但用代码生成/模板减少 sync。
   - 至少把业务常量和 utils 彻底通过 packages 共享。

### 4.3 后端与数据抽象（P1，4-8 周）
7. **建立 API 层**
   - 激活/扩展 apps/server/ 或在 cloudfunctions/ 之上建 BFF。
   - 选项 A（推荐短期）：用 CloudBase 云函数 + shared-utils 封装业务用例函数。
   - 选项 B（中长期）：引入 NestJS / Express + tRPC 或 REST，客户端只调 API。
   - 目标：客户端不再直接知道集合名和 _openid 规则。

8. **强化数据访问**
   - 在 shared-utils 创建 Repository / Service 层（e.g. UserRepository, LedgerService）。
   - 所有 DB 操作走封装，支持事务模拟、审计日志、软删除。
   - 云函数也只调用这些服务。

9. **迁移关键业务逻辑到后端**
   - 把结算、心灯销售额计算、平台服务费严格放在云函数或 server 中。
   - 客户端只接收计算好的结果。

### 4.4 基础设施与运维（P1 并行）
10. **部署与 CI**
    - 添加 GitHub Actions：lint → typecheck → build → deploy (vercel + cloudbase)。
    - 统一环境配置（使用 client-hosts.js 作为单一来源）。
    - 为 CloudBase 函数添加版本和回滚策略。

11. **可观测性**
    - 集成 Sentry / LogRocket 到所有客户端。
    - CloudBase + 云函数日志集中。
    - 关键路径（登录、结算、下单）加指标。

12. **安全与合规**
    - 强化现有业务规则（A/B 类费用、品牌方口径）通过配置 + 代码双重守护。
    - 定期审计 _openid 权限和云函数。

### 4.5 长期愿景（P2，6+ 月）
- 评估后端自建 vs CloudBase 混合模式。
- 统一前端框架或采用跨端方案（Taro / React Native Web + Mini）。
- 引入领域驱动设计 (DDD) 边界上下文（User、Partner、Ledger、Awareness）。
- 事件驱动架构（CloudBase + 消息队列或云函数触发）替换定时器结算。
- 完善测试金字塔：单元（shared packages）+ 集成（云函数）+ E2E。

## 5. 推荐里程碑与分工计划（Zang 视角）

### 里程碑 1: 基础稳定 (目标：2 周内，消除 P0 风险)
- **里程碑负责人**: Zang 协调
- **任务分解**:
  1. Auth 固化 & 测试 (Kong 实现, Neng 审查)
  2. Users 拆分第一阶段 (身份冲突清理 + 新集合创建) (Kong)
  3. App/Web 初步解耦 (移除部分 @app 依赖) (Kong)
- **验收**: 无探针文件，登录/partner 流程稳定，迁移脚本可跑，web 不依赖 app/src 核心服务。
- **工具**: 委托 delegate_task 给 Kong/Neng。

### 里程碑 2: 工具链与共享升级 (目标：3 周)
- pnpm + Turborepo 迁移
- 共享包清理 + 类型增强
- 小程序共享 pipeline 改进
- **分工**: Kong 负责迁移脚本，Jing 做整合测试 (全端 dev/build)。

### 里程碑 3: API 层与数据抽象 (目标：6 周)
- 建立 Repository 层
- 试点一个业务用例 (e.g. 每日结算) 走 API
- 更新所有客户端调用
- **验收**: 客户端 DB 直接调用减少 50%+，有可观测 API。

### 里程碑 4: 基础设施完善 (并行)
- CI/CD 流水线
- 可观测性
- 文档同步 (更新 agents.md、README)

**跨里程碑原则**:
- 所有变更必须通过 Neng 代码审查 + Jing 整合测试。
- 严格遵守 agents.md 禁令（尤其是费用文案、users 身份唯一性）。
- 每阶段结束由 Zang 汇总汇报关键节点。
- 优先使用 packages/ 共享，避免新复制。

## 6. 风险、权衡与开放问题

**风险**:
- 拆分 users 期间数据不一致（需强双写 + 验证）。
- pnpm 迁移可能破坏现有 node_modules/Capacitor 构建。
- 引入 API 层短期增加复杂度。
- 小程序共享改造工作量大。

**权衡**:
- 短期：保持 CloudBase 快速 vs 长期自建后端灵活。
- 共享深度：完全共享 vs 接受平台差异（UI 天然不同）。
- 迁移节奏：大爆炸 vs 增量。

**开放问题** (建议团队讨论):
1. 是否值得现在投入 Taro 重构三端？
2. CloudBase 成本与限制在当前规模如何？
3. Partner 后台与普通用户端的权限模型是否需要更细粒度 RBAC？
4. 未来是否需要独立微服务（e.g. 结算服务、通知服务）？

## 7. 建议的下一步行动

1. 立即：Zang 组织团队 review 本文档，确认 P0 项优先级。
2. 本周：启动 Auth 稳定 + users 拆分冲突审计。
3. 使用本计划作为委托任务基础，调用 delegate_task 给 Kong 实现具体任务。
4. 每两周 Zing 做进度总结。
5. 必要时更新此文档（追加 "更新日志" 部分）。

**参考资料**:
- agents.md (AI 约束与业务规则)
- README.md (各端说明)
- scripts/migrations/ (现有迁移)
- packages/shared-utils/ (当前共享核心)
- cloudbaserc.json / vercel.json

---

**结论**: Liwu 当前架构实用但处于技术债积累期。重点是**先稳住身份与数据模型**，**再解耦与抽象**，**最后升级基础设施**。遵循此路线可显著提升可维护性与扩展性。

如需我（Zang）制定具体任务列表、分配给 Kong/Neng/Jing，或进一步深入某个领域（如 Auth 详细评审），请告知。
