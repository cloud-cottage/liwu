// ─── meditation-session 写云函数（action `reportCompletion`）的端侧调用包装 ──────────────
// （纯函数 / 零 IO / `callFunction` 由调用方注入；**镜像同目录 `meditation-read-client.js`**，
//  复用仓库既有的「同一套 callFunction 注入 ＋ envelope 归一」习惯，不自造新通道。）
//
// 【规范依据】docs/meditation.admin.partner.spec.md 的：
//   · **R50**（完成度上报与福豆发放口径 ①~⑦）—— 上报 + 校验 + 发放**全部由云函数完成**，
//     **客户端不再直写 `users` / `user_wallets` 余额**（C39~C42 的修复落点）；
//   · **R49-④ v4.33 修订注** —— 播放过程不写服务端，**只在「完播」或用户主动结束时上报一次**；
//   · **R50-②**（完播定义）—— 端侧累加秒数**只能来自媒体元素 `currentTime` 增量**（不得用墙钟 /
//     定时器 tick）；拖动 / 快进到末尾不算完播；网络失败跳段不归咎用户、不影响判定；
//   · **R50-④**（幂等与失败纪律）—— `session_key` 为幂等键、重复上报不重复发放、失败必须取消。
//   ＋ `cloudfunctions/meditation-session/README.md`（**入参白名单 / 错误码 / 幂等 / 返回骨架逐字照用，
//     不得自创字段**）。
//
// 【设计口径】（镜像 meditation-read-client；规范未逐字规定处已按 README 口径实现）
//   ① **零 IO / 零 import**：不 import 任何 SDK、不碰 window / localStorage / wx / uni —— `callFunction`
//      由调用方注入（App 传 `app.callFunction.bind(app)`）；
//   ② 兼容两种返回形态：`res.result`（wx.cloud / CloudBase js-sdk v1）与 `res`（v2 直接返回 result），
//      并对「result 是 JSON 字符串」的形态做一次解析（最多 4 层包装，防死循环）；
//   ③ **只按 `ok` 与 `error` 码分支**：错误码原样透传到 `MeditationSessionError.code`（未知码不吞、
//      不猜、不按文本归类）；本地另有 2 个**自产码**：`INVALID_PAYLOAD`（响应形状不合法）、
//      `CALL_FAILED`（callFunction 本身抛错）；
//   ④ **零 fixture 分支**：桩一律由测试侧注入 `callFunction`，本模块零开关。
//
// 【纯 ESM】可在浏览器 / Vite 下直接 `import { createMeditationSessionClient } from
//   '@liwu/shared-utils/meditation-session-client.js'`。

export const MEDITATION_SESSION_FUNCTION_NAME = 'meditation-session'

export const MEDITATION_SESSION_ACTIONS = Object.freeze({
  reportCompletion: 'reportCompletion'
})

// 缺省 action（对齐 README §1：缺省 = reportCompletion）。
export const MEDITATION_SESSION_DEFAULT_ACTION = MEDITATION_SESSION_ACTIONS.reportCompletion

// 「完成一致性」比例（R50-② / README §3-5）：与云函数 `lib/reward-contract.js#COMPLETION_MIN_RATIO`
// **同值**（此处为端侧自检用，不改云端口径；改这里＝改口径，先读正本 R50-② 与 README §3）。
export const MEDITATION_REPORT_COMPLETION_MIN_RATIO = 0.95

// 上报 `session_key` 字段长度上限（README §1：string(≤128)）。
export const MEDITATION_SESSION_KEY_MAX_LENGTH = 128

// 端侧自检用的「段时长 / 计划总时长」容差（与云函数 DURATION_TOLERANCE_SECONDS 同值，仅自检参考）。
export const MEDITATION_REPORT_DURATION_TOLERANCE_SECONDS = 2

// 错误码：服务端下发的码（README §2；**逐字照用**）＋ 本地 2 个自产码。
export const MEDITATION_SESSION_ERROR_CODES = Object.freeze({
  // 服务端下发（README §2）
  invalidEvent: 'INVALID_EVENT',
  invalidAction: 'INVALID_ACTION',
  invalidParams: 'INVALID_PARAMS',
  invalidSelections: 'INVALID_SELECTIONS',
  audioNotFound: 'AUDIO_NOT_FOUND',
  forgedDuration: 'FORGED_DURATION',
  forgedListenedSeconds: 'FORGED_LISTENED_SECONDS',
  incompleteListen: 'INCOMPLETE_LISTEN',
  sessionKeyConflict: 'SESSION_KEY_CONFLICT',
  dailyAwardLimit: 'DAILY_AWARD_LIMIT',
  userNotFound: 'USER_NOT_FOUND',
  awardCanceled: 'AWARD_CANCELED',
  reportFailed: 'REPORT_FAILED',
  // 本地自产（服务端不下发这两个）
  invalidPayload: 'INVALID_PAYLOAD',
  callFailed: 'CALL_FAILED'
})

const getString = (value) => (value == null ? '' : String(value))

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

// 稳定的本地错误：`code` 是唯一分支依据（**不得**解析 message 文本）。
export class MeditationSessionError extends Error {
  constructor(code, message, details = null, meta = null) {
    super(message || `冥想上报失败（${code}）`)

    this.name = 'MeditationSessionError'
    this.code = code || MEDITATION_SESSION_ERROR_CODES.callFailed
    this.details = isPlainObject(details) ? details : null
    // 保留失败 envelope 的 `meta`（只读不解释，分支仍只看 `code`）。
    this.meta = isPlainObject(meta) ? meta : null
    this.requestId = getString(this.meta?.request_id || this.meta?.requestId || this.details?.request_id).trim()
  }
}

export const isMeditationSessionError = (error) => error instanceof MeditationSessionError

// ─── 入参组装（README §1 字段白名单；**只发白名单字段，不夹带任何多余键**） ──────────────────

// `plan.selections`（端侧计划层形状：`{ section_type, audio_id, duration_seconds }`）⇒ 上报形状
// （`{ slot_index, audio_id, duration_seconds }`）。
// 【本批口径】未做槽位化（属下一单）⇒ `slot_index` ＝ 本轮计划「已抽中」选择在稳定次序里的下标
//   （`plan.selections` 已按固定段顺序稳定排序，见 `buildMeditationTrackPlaybackPlan`）——
//   **稳定、可复现、不含 `Date.now()`**。缺 `audio_id` 的条目丢弃后重新编号。
export const resolveMeditationReportSelections = (planSelections = []) => (
  (Array.isArray(planSelections) ? planSelections : [])
    .map((selection) => ({
      audio_id: getString(selection?.audio_id).trim(),
      duration_seconds: Math.max(0, Number(selection?.duration_seconds) || 0)
    }))
    .filter((selection) => Boolean(selection.audio_id))
    .map((selection, index) => ({ slot_index: index, ...selection }))
)

// 上报入参组装（字段名逐字照 README §1；不含 action，由 client 统一补）。
export const buildMeditationReportCompletionParams = ({
  trackKey = '',
  trackVersion = null,
  sessionKey = '',
  dateKey = '',
  selections = [],
  listenedSeconds = 0,
  completed = false,
  endedReason = '',
  mode = 'app',
  userId = ''
} = {}) => ({
  track_key: getString(trackKey).trim(),
  track_version: Number(trackVersion),
  session_key: getString(sessionKey).trim(),
  date_key: getString(dateKey).trim(),
  selections: resolveMeditationReportSelections(selections),
  listened_seconds: Math.max(0, Number(listenedSeconds) || 0),
  completed: completed === true,
  ended_reason: getString(endedReason).trim(),
  mode: getString(mode).trim() || 'app',
  user_id: getString(userId).trim()
})

// ─── 幂等键（R50-④）── **含 `track_key ＋ date_key ＋ 本场会话标识`，绝不含 `Date.now()`** ──────────
// `sessionId` 由端侧在**每场会话开始时一次性生成**（同一场内重入 / 重试复用同一值 ⇒ 幂等成立）。
// 生成一律**不用 `Date.now()`**（R50-④ 硬口径）：优先 `crypto.randomUUID()`，无则退随机串（仍在会话内恒定）。
export const createMeditationSessionId = () => {
  const cryptoObject = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined

  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID().replace(/-/g, '')
  }

  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

export const buildMeditationSessionKey = ({ trackKey = '', dateKey = '', sessionId = '' } = {}) => {
  const normalizedTrackKey = getString(trackKey).trim()
  const normalizedDateKey = getString(dateKey).trim()
  const normalizedSessionId = getString(sessionId).trim()

  if (!normalizedTrackKey || !normalizedDateKey || !normalizedSessionId) {
    throw new MeditationSessionError(
      MEDITATION_SESSION_ERROR_CODES.invalidParams,
      '构造 session_key 缺少 track_key / date_key / 本场会话标识',
      { track_key: normalizedTrackKey, date_key: normalizedDateKey, session_id: normalizedSessionId }
    )
  }

  const sessionKey = `med:${normalizedTrackKey}:${normalizedDateKey}:${normalizedSessionId}`

  if (sessionKey.length > MEDITATION_SESSION_KEY_MAX_LENGTH) {
    throw new MeditationSessionError(
      MEDITATION_SESSION_ERROR_CODES.invalidParams,
      `session_key 超长（>${MEDITATION_SESSION_KEY_MAX_LENGTH}）`,
      { length: sessionKey.length }
    )
  }

  return sessionKey
}

// ─── 端侧「实际听秒数」累加器（R50-②；**只吃媒体元素 `currentTime` 增量**） ─────────────────
//
// 【为何这样取】R50-② 硬口径：端侧累加秒数**只能来自媒体元素 `currentTime` 增量**（不得用墙钟 /
//   定时器 tick）。多次采样之间 `currentTime` 的**正增量**才算「实际在播」——暂停 / 缓冲期间
//   `currentTime` 不动 ⇒ 自然不计入，杜绝墙钟把「停顿 / 缓冲」算成收听。
//
// 【口径】按媒体元素键（`background` / `voice` / `mix_audio`）分别累加，取**各元素累计的最大值**为
//   本场累计秒数（同一时刻多个元素同播时，最大值＝会话推进的最远位置，不重复计数）：
//     · 增量 `0 < Δ ≤ seekToleranceSeconds` ⇒ 计入；
//     · 增量 `Δ > seekToleranceSeconds` ⇒ **前跳 / 拖动快进** ⇒ **不计入**，且置 `forwardSkipDetected`；
//     · 增量 `Δ < 0`（段切换 / 回退 / loop 重置）⇒ 只更新基准、不计入。
//   ⇒ 「拖动 / 快进到末尾不算完播」由 `forwardSkipDetected` 兜底；网络失败跳段**不产生** `currentTime`
//     增量、也**不是**前跳 ⇒ **不置位、不影响判定**（R50-②(c)/(d)）。
export const createMeditationListenTracker = ({ seekToleranceSeconds = 3 } = {}) => {
  const tolerance = Number.isFinite(Number(seekToleranceSeconds)) && Number(seekToleranceSeconds) > 0
    ? Number(seekToleranceSeconds)
    : 3
  const entries = new Map()
  let forwardSkipDetected = false

  const sample = (mediaKey, currentTimeSeconds) => {
    const key = getString(mediaKey).trim()
    const currentTime = Number(currentTimeSeconds)

    if (!key || !Number.isFinite(currentTime) || currentTime < 0) {
      return
    }

    const entry = entries.get(key) || { last: null, seconds: 0 }

    if (entry.last !== null) {
      const delta = currentTime - entry.last

      if (delta > 0 && delta <= tolerance) {
        entry.seconds += delta
      } else if (delta > tolerance) {
        // 前跳 / 拖动快进 ⇒ 不计入并标记（完播判定据此排除「拖到末尾」）。
        forwardSkipDetected = true
      }
      // delta < 0（段切换 / 回退 / loop 重置）：只更新基准，不计入。
    }

    entry.last = currentTime
    entries.set(key, entry)
  }

  const getSeconds = () => {
    let max = 0
    entries.forEach((entry) => {
      if (entry.seconds > max) {
        max = entry.seconds
      }
    })
    return max
  }

  return Object.freeze({
    sample,
    getSeconds,
    hasForwardSkip: () => forwardSkipDetected,
    reset: () => {
      entries.clear()
      forwardSkipDetected = false
    }
  })
}

// ─── 完播判定（R50-②(b)(c)(d)） ──────────────────────────────────────────────
// `completed` 仅在：到达计划末尾（naturalEnd，由播放器在整场自然结束时置位）
//   且**无前跳 / 拖动**（tracker.hasForwardSkip() === false）
//   且**实际听秒数 ≥ 计划总时长 × MEDITATION_REPORT_COMPLETION_MIN_RATIO**（与云函数同一比例，端侧自洽）。
export const resolveMeditationReportCompletion = ({
  reachedNaturalEnd = false,
  forwardSkipDetected = false,
  listenedSeconds = 0,
  planTotalSeconds = 0
} = {}) => {
  if (reachedNaturalEnd !== true) {
    return false
  }

  if (forwardSkipDetected === true) {
    return false
  }

  const listened = Math.max(0, Number(listenedSeconds) || 0)
  const planTotal = Math.max(0, Number(planTotalSeconds) || 0)

  return listened >= planTotal * MEDITATION_REPORT_COMPLETION_MIN_RATIO
}

// ─── 用户可见文案（R41-⑦ / R50-④：失败可见且不静默） ─────────────────────────────
// 入参＝云函数成功骨架的 `data`（README §1）：`{ awarded, repeated, reward_points, … }`（**蛇形为准**，
// 兼容驼峰 `rewardPoints`）。
export const resolveMeditationReportSuccessMessage = (result = {}) => {
  const repeated = result?.repeated === true
  const awarded = result?.awarded === true
  const rewardPoints = Number(result?.reward_points ?? result?.rewardPoints ?? 0) || 0

  if (repeated === true) {
    return '本次冥想已记入，本次不重复发放福豆。'
  }

  if (awarded === true && rewardPoints > 0) {
    return `本次冥想已记入，获得 ${rewardPoints} 颗福豆。`
  }

  return '本次冥想已记入。'
}

// 上报失败的用户可见文案（沿用既有结尾提示风格；**不静默当成功**、也不重发金额）。
export const describeMeditationReportError = (error) => {
  const code = getString(error?.code).trim()

  return code
    ? `本次冥想福豆上报失败（${code}），请稍后重试。`
    : '本次冥想福豆上报失败，请稍后重试。'
}

// ─── 返回形态归一（res.result / res / JSON 字符串；defensive，不依赖任何 SDK 实现） ──────────

const tryParseJson = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const text = value.trim()
  if (!text || (text[0] !== '{' && text[0] !== '[')) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const unwrapMeditationSessionResult = (raw, { maxDepth = 4 } = {}) => {
  let current = raw

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (typeof current === 'string') {
      const parsed = tryParseJson(current)
      if (!parsed) {
        return { ok: false, reason: '返回体是字符串且不是合法 JSON' }
      }

      current = parsed
      continue
    }

    if (isPlainObject(current) && current.ok === undefined && current.result !== undefined) {
      current = current.result
      continue
    }

    break
  }

  if (!isPlainObject(current)) {
    return { ok: false, reason: `返回体不是对象（收到 ${Array.isArray(current) ? 'array' : typeof current}）` }
  }

  if (typeof current.ok !== 'boolean') {
    return { ok: false, reason: '返回体缺少布尔的 ok 字段（既非 ok:true 也非 ok:false）' }
  }

  return { ok: true, envelope: current }
}

// ─── 客户端工厂（D-write 调用包装） ──────────────────────────────────────────────

// `callFunction` 必须由调用方注入：形如 `({ name, data }) => Promise<res>`。
export const createMeditationSessionClient = ({ callFunction, thisArg = undefined } = {}) => {
  if (typeof callFunction !== 'function') {
    throw new TypeError('createMeditationSessionClient 需要注入 callFunction（形如 ({ name, data }) => Promise<res>）')
  }

  const call = async ({ action = MEDITATION_SESSION_DEFAULT_ACTION, params = {} } = {}) => {
    const data = { action, ...params }
    let raw

    try {
      raw = await callFunction.call(thisArg, { name: MEDITATION_SESSION_FUNCTION_NAME, data })
    } catch (error) {
      throw new MeditationSessionError(
        MEDITATION_SESSION_ERROR_CODES.callFailed,
        `调用 ${MEDITATION_SESSION_FUNCTION_NAME} 失败：${error?.message || 'UNKNOWN_ERROR'}`,
        { action, cause: error?.message || String(error || '') }
      )
    }

    const unwrapped = unwrapMeditationSessionResult(raw)

    if (!unwrapped.ok) {
      throw new MeditationSessionError(
        MEDITATION_SESSION_ERROR_CODES.invalidPayload,
        `响应形状非法：${unwrapped.reason}`,
        { action }
      )
    }

    const envelope = unwrapped.envelope

    // 只按 ok / error 码分支；message 只作兜底文案，**不参与判断**。
    if (envelope.ok !== true) {
      const code = getString(envelope.error).trim()

      throw new MeditationSessionError(
        code || MEDITATION_SESSION_ERROR_CODES.reportFailed,
        getString(envelope.message) || `上报失败（${code || MEDITATION_SESSION_ERROR_CODES.reportFailed}）`,
        isPlainObject(envelope.details) ? envelope.details : null,
        isPlainObject(envelope.meta) ? envelope.meta : null
      )
    }

    return {
      ok: true,
      data: isPlainObject(envelope.data) ? envelope.data : {},
      meta: isPlainObject(envelope.meta) ? envelope.meta : {}
    }
  }

  return Object.freeze({
    reportCompletion: (params = {}) => call({ action: MEDITATION_SESSION_ACTIONS.reportCompletion, params })
  })
}
