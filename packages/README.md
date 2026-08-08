# packages

跨端共享包，供 App、Web、小程序、云函数共同引用。

## 包一览

| 目录 | 包名 | 说明 |
|---|---|---|
| [auth](./auth/) | `@liwu/auth` | 登录、会话、用户解析、微信/手机号绑定 |
| [shared-utils](./shared-utils/) | `@liwu/shared-utils` | 业务规则常量、结算逻辑、主题与展示配置、生产域名 |
| [shared-types](./shared-types/) | `@liwu/shared-types` | 共享 TypeScript 类型 |

## 使用原则

- 跨端复用的业务常量（如平台技术服务费、会员设置、结算核心）放在 `shared-utils`，不要在各 app 中重复定义。
- 认证相关逻辑统一走 `auth` 包；小程序通过 `@liwu/auth/miniprogram` 入口引用。
- 新增共享包时在根 `package.json` 的 `workspaces` 中注册。