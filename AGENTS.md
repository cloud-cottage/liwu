# AI 工作权限

本文件面向 AI 代理。人类开发者请阅读各级 `README.md`。

权限细则见 [`.ai.permission.md`](./.ai.permission.md)。

## 你能做什么

### 代码

- 修改 `apps/`、`packages/`、`cloudfunctions/`、`scripts/`、`api/` 下的源代码。
- 在 `apps/app` 与 `apps/web` 之间复用模块时，优先改共享源（`apps/app/src`），再确认 `apps/web` 是否正常引用。
- 使用根目录 workspace 命令进行本地验证：`npm run dev:app`、`npm run dev:web`、`npm run lint`。
- 新增跨端逻辑时，优先放入 `packages/shared-utils` 或 `packages/auth`，避免在多个 app 中复制粘贴。

### 书面文件（仅 Grok build / HERMES）

- 可修改 `agents.md`、`.ai.permission.md` 及任意 `README.md`。
- 其他 AI 不得修改上述文件；如需更新文档，在代码变更说明中提出建议，由 Grok build 或 HERMES 落盘。

## 你不能做什么

### 所有 AI 通用禁令

- **不要** 提交、打印或硬编码密钥。`.env`、`project.private.config.json` 等敏感文件只读，不在回复中暴露其内容。
- **不要** 对生产环境执行写入型数据迁移（`scripts/migrations/` 中带写操作的脚本），除非用户明确要求且身份冲突已解决。
- **不要** 擅自修改平台技术服务费规则（A 类 9%、B 类 3.3%）或在代理商/用户端暴露「平台技术服务费」概念。
- **不要** 破坏 `users` 身份唯一性：`auth_uid` 与 `phone` 必须一对一映射到规范用户。
- **不要** 将 `wealth_history` 重新嵌入 `users`；事件账本以 `point_ledger` 为准。
- **不要** 删除 `apps/web` 的 `/partner` 管理路由；`/admin` 仅为兼容重定向。
- **不要** 在品牌方后台心灯销售额计算中包含第五类「课程」商品。
- **不要** 保留或新建本仓库约定之外的散落说明文档；说明内容应归入 `README.md`（人类）或 `agents.md`（AI）。
- **不要** 在页面上添加临时性的调试组件、手动刷新按钮、开关等小组件来掩盖代码缺陷；数据加载、状态同步等问题应从数据流层面修复，而非通过 UI 打补丁。
- **不要** 留下未使用的 import、state、console.log 或废弃代码。

### 其他 AI 额外禁令

- **不要** 修改任何书面文件（见 `.ai.permission.md`）。

## 项目结构

```text
liwu/
├── apps/
│   ├── app/          # 手机端 React/Vite 客户端（Capacitor）
│   ├── web/          # Web 客户端 + /partner 管理后台
│   ├── miniprogram/  # 微信小程序
│   └── server/       # Node 后端骨架（待扩展）
├── docs/             # 项目页面规范目录
│   ├── .spec.md      # 仅限于本地 AI 阅读的项目总规范
│   ├── spec.md      # 项目总规范，包括 UI 规范
│   ├── anypage.spec.md       # .次级规范
│   └── anypage.anypage.spec.md      # .次次级规范
├── packages/
│   ├── auth/           # 登录、会话、用户解析
│   ├── shared-utils/   # 业务规则与共享工具
│   └── shared-types/   # 共享类型
├── cloudfunctions/     # 腾讯云函数（根目录部署）
├── scripts/            # 构建与迁移脚本
└── api/                # Vercel 代理等

```
