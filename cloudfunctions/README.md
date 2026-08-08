# cloudfunctions

腾讯云函数部署目录，由根目录 `cloudbaserc.json` 管理。

## 环境

- 环境 ID：`liwu-d8gek6jjdab1d087c`
- 函数根目录：本目录（`cloudfunctions/`）

## 已纳入部署的函数

| 函数 | 说明 |
|---|---|
| `fortuneDailySettlement` | 心灯日结，含每日 04:00 timer trigger |
| `getUserPhone` | 获取用户手机号 |

## 部署

```bash
# 部署单个函数
cloudbase functions:deploy fortuneDailySettlement -e liwu-d8gek6jjdab1d087c

# 按 cloudbaserc.json 全量部署（含 trigger）
cloudbase deploy

# 手动触发验证
cloudbase functions:invoke fortuneDailySettlement -e liwu-d8gek6jjdab1d087c
```

## 共享逻辑

`fortuneDailySettlement` 的核心结算逻辑在 `packages/shared-utils/fortune-daily-settlement-core.js`，修改业务规则时请同步更新云函数与共享包。