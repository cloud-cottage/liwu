# 理悟（liwu）

理悟是一个 monorepo 项目，包含手机 App、Web 客户端、微信小程序和 Node 后端骨架，统一使用 npm workspaces 管理。

## 目录结构

```text
liwu/
├── apps/
│   ├── app/          # 手机端 React/Vite 客户端（Capacitor）
│   ├── web/          # Web 客户端与 /partner 管理后台
│   ├── miniprogram/  # 微信小程序
│   └── server/       # Node 后端骨架
├── packages/
│   ├── auth/           # 登录与会话
│   ├── shared-utils/   # 共享业务工具
│   └── shared-types/   # 共享类型
├── cloudfunctions/     # 腾讯云函数
├── scripts/            # 构建与迁移脚本
└── package.json        # Workspace 根配置
```

## 快速开始

```bash
# 安装依赖（在仓库根目录）
npm install

# 启动 Web 客户端（默认）
npm run dev

# 启动手机端
npm run dev:app

# 构建
npm run build

# 代码检查
npm run lint
```

## 本地端口

| 应用 | 端口 | 命令 |
|---|---|---|
| Web 客户端 | 5175 | `npm run dev:web` |
| 手机端 | 5176 | `npm run dev:app` |

## 各端说明

| 目录 | 说明 |
|---|---|
| [apps/app](./apps/app/) | 手机端，底部导航：首页、冥想、觉察、我的 |
| [apps/web](./apps/web/) | Web 壳层，复用 app 模块；管理后台在 `/partner` |
| [apps/miniprogram](./apps/miniprogram/) | 微信小程序，底部导航：首页、工坊、觉察、我的 |
| [apps/server](./apps/server/) | 后端骨架，待选型与扩展 |
| [packages](./packages/) | 跨端共享包 |
| [cloudfunctions](./cloudfunctions/) | 云函数部署目录 |
| [scripts](./scripts/) | 构建部署与数据迁移 |

## 业务规则

- 平台技术服务费分两类：**A 类**面向全平台普通用户消费，默认 **9%**；**B 类**面向 partner 代理商在 Web 后台下单，默认 **3.3%**。
- 平台技术服务费是品牌方经营视角的数据，**仅**在品牌方后台展示。代理商后台与普通用户端不展示「平台技术服务费」概念、字段或文案，只展示各自应付金额。
- 品牌方后台心灯系统在计算销售额时，统一采用「全网实物商品」口径：同时包含 A 类与 B 类成交，**排除**第五类「课程」。

## 访问域名

| 域名 | 状态 |
|---|---|
| `liwu.nvshen.love` | **当前主站**（停服替代期） |
| `liwu2026.vercel.app` | **当前备用站**（停服替代期） |
| `liwu.yunduojihua.com` | 预计停服约 3 个月，恢复前勿依赖 |

停服期间请将 CloudBase Web 安全域名、分享链接、客户端分发地址等配置切换到上表两个替代域名。域名常量见 `packages/shared-utils/client-hosts.js`。

## 腾讯云开发

### 环境信息

- 环境 ID：`liwu-d8gek6jjdab1d087c`
- 控制台：https://tcb.cloud.tencent.com/dev?envId=liwu-d8gek6jjdab1d087c

### Web 安全域名

在控制台 **设置 → 安全配置 → Web 安全域名** 中添加：

- `localhost:5175`（Web 本地开发）
- `localhost:5176`（App 本地开发）
- `liwu.nvshen.love`
- `liwu2026.vercel.app`

### 核心数据库集合

| 集合 | 用途 |
|---|---|
| `awareness_records` | 觉察记录 |
| `users` | 用户身份（拆分迁移进行中，详见 [scripts/migrations](./scripts/migrations/)） |
| `point_ledger` | 积分/财富事件账本 |
| `partner_brands` | 品牌工作区 |
| `partner_brand_members` | 品牌成员 |

觉察集合 `awareness_records` 建议权限：

```json
{
  "read": true,
  "write": "doc._openid == auth.openid"
}
```

### 云函数部署

前提：已安装并登录 CloudBase CLI。

```bash
npm install -g @cloudbase/cli
cloudbase login
```

部署日结函数：

```bash
cloudbase functions:deploy fortuneDailySettlement -e liwu-d8gek6jjdab1d087c
# 或按 cloudbaserc.json 一并部署 timer trigger
cloudbase deploy
```

手动触发验证：

```bash
cloudbase functions:invoke fortuneDailySettlement -e liwu-d8gek6jjdab1d087c
```

成功标志：返回 `ok: true`，且包含 `brandSettlements`、`agentSettlements`、`platformYesterdayTotalSales`。

### 常见问题

| 问题 | 排查 |
|---|---|
| 登录失败 | 检查环境 ID 与安全域名 |
| 数据库操作失败 | 检查集合是否创建、权限是否正确 |
| 跨域错误 | 确认控制台已添加当前域名 |

## AI 协作者

- AI 工作约束见 [`agents.md`](./agents.md)
- AI 权限定义见 [`.ai.permission.md`](./.ai.permission.md)