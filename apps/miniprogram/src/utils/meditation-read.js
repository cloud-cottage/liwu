// ─── 小程序端 D6 读客户端（meditation-read）入口 ──────────────────────────────────
//
// 【规范依据】docs/meditation.admin.partner.spec.md（v4.13）R44-① / R41-① / R39 / D9。
//   · 数据源**只经 D6 只读云函数**：本模块把 `({ name, data }) => wx.cloud.callFunction({ name, data })`
//     注入共享客户端（`packages/shared-utils/meditation-read-client.js`，经 `npm run miniprogram:sync`
//     同步到 `utils/shared/`，**禁止手抄 CJS 副本**，R44-⑪）；
//   · 端侧**不得直连 DB 读 `med_*`**（R28-①：直连只会得到静默空集）、**不读老 5 项 `app_settings`**、
//     **不算老 plan**（R44-① / R41-① / D9）⇒ 冥想页的取数入口只能是本模块。
//
// 【零 fixture 纪律（R44-⑬）】本文件**没有任何 DEV 开关 / 桩分支 / 调试入口**；测试桩一律打在
// **测试侧**（替换 `wx.cloud.callFunction`），产品代码不参与。

const {
  MEDITATION_READ_FUNCTION_NAME,
  MEDITATION_READ_ERROR_CODES,
  createMeditationReadClient,
  isMeditationReadError
} = require('./shared/meditation-read-client')

// 注入契约（R44-①）：`({ name, data }) => Promise<res>`。
// 刻意写成薄包装而不是 `wx.cloud.callFunction.bind(wx.cloud)`：`wx.cloud` **在调用时才读取**
// ⇒ 模块加载期零副作用（页面 `require` 本模块不会碰 `wx`），共享层也不依赖注入方的 `this`。
const callMeditationReadFunction = ({ name, data }) => wx.cloud.callFunction({ name, data })

const meditationReadClient = createMeditationReadClient({
  callFunction: callMeditationReadFunction
})

module.exports = {
  MEDITATION_READ_FUNCTION_NAME,
  MEDITATION_READ_ERROR_CODES,
  isMeditationReadError,
  callMeditationReadFunction,
  meditationReadClient
}
