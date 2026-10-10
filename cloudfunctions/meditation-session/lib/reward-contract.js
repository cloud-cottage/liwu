// ─── meditation-session / reportCompletion 的「纯口径」模块（零 IO） ─────────────
//
// 【规范依据】docs/meditation.admin.partner.spec.md（正本）：
//   · R50（完成度上报与福豆发放口径，v4.33，①~⑦）—— 上报 + 校验 + 发放全部由云函数完成；
//     客户端不再直写 users / user_wallets 余额（顺带修 C39 客户端直写余额、C40 无服务端校验、
//     C41 幂等失效、C42 匿名写授权四个缺口）。
//   · R50-④ 幂等与失败纪律：`session_key` 为幂等键、重复上报不重复发放、失败必须取消绝不重复创建。
//   · R50-⑤ 新集合 `med_play_sessions` ＝ 客户端不可读写、仅云函数（服务端凭证）写。
//   · R50-⑥ 服务端校验最小集：① session_key 幂等；② 分级计时单调、各段 ≤ 该段时长、总和 ≤ 计划总时长；
//     ③ 上报 audio_id 必须真实存在于库；④ 涉账号的单日发放上限；⑤ 身份必须绑定用户账号
//     （匿名 `_openid` 不作为发放依据）。
//   · R39（D6 读契约的错误码风格）与 cloudfunctions/meditation-read/index.js 的形状对齐：
//     非法 / 缺失参数一律返回结构化错误 `{ok:false,error,message}`，不抛未捕获异常、不返回部分数据当成功。
//
// 【本文件职责】只做**常量 + 纯函数**（校验 / 归一 / 组装），**零 IO、零 SDK 依赖**——IO 与编排在 index.js。
//   这样「白名单 / 伪造拒绝的判据」可被单测直接用桩驱动（对齐 meditation-read 的 read-contract.js）。

// ─── action ─────────────────────────────────────────────────────────────────

const ACTIONS = Object.freeze({
  reportCompletion: 'reportCompletion'
})

const DEFAULT_ACTION = ACTIONS.reportCompletion

// ─── 错误码（调用方按 `error` 分支，不解析 message） ──────────────────────────

const ERROR_CODES = Object.freeze({
  invalidEvent: 'INVALID_EVENT',
  invalidAction: 'INVALID_ACTION',
  // 入参白名单 / 必填 / 类型
  invalidParams: 'INVALID_PARAMS',
  invalidSessionKey: 'INVALID_SESSION_KEY',
  invalidSelections: 'INVALID_SELECTIONS',
  invalidListenedSeconds: 'INVALID_LISTENED_SECONDS',
  invalidCompleted: 'INVALID_COMPLETED',
  // 伪造拒绝（R50-⑤ / ⑥）
  audioNotFound: 'AUDIO_NOT_FOUND',
  forgedDuration: 'FORGED_DURATION',
  forgedListenedSeconds: 'FORGED_LISTENED_SECONDS',
  incompleteListen: 'INCOMPLETE_LISTEN',
  sessionKeyConflict: 'SESSION_KEY_CONFLICT',
  dailyAwardLimit: 'DAILY_AWARD_LIMIT',
  userNotFound: 'USER_NOT_FOUND',
  // 写入 / 发放
  awardCanceled: 'AWARD_CANCELED',
  reportFailed: 'REPORT_FAILED'
})

// ─── 常量（口径单点定义；改这些值即改口径，先读正本 R50 再动） ─────────────────

// 入参白名单：**只有这些顶层字段会被处理并入库**，其余一律忽略（见 index.js 的 buildReportInput）。
// 说明：cloud 框架会向 event 注入 `userInfo` 等**框架字段**，故**不能**对未知顶层字段一律报错——
// 否则真实端侧调用会被框架字段误拒；「字段白名单校验」在此处的正确语义＝**只取白名单字段入库**。
const REPORT_INPUT_FIELDS = Object.freeze([
  'action',
  'track_key',
  'track_version',
  'session_key',
  'date_key',
  'selections',
  'listened_seconds',
  'completed',
  'ended_reason',
  'mode',
  'user_id'
])

// selection 条目白名单。
const SELECTION_INPUT_FIELDS = Object.freeze(['slot_index', 'audio_id', 'duration_seconds'])

// 各段 `duration_seconds` 允许比库内 `duration` 多的**容差**（只为吸收端侧取整；超过即为伪造）。
const DURATION_TOLERANCE_SECONDS = 2

// `listened_seconds` 允许比「计划总时长（Σ 声明段时长）」多的**容差**（R50-⑥②）。
const PLAN_TOTAL_TOLERANCE_SECONDS = 5

// `completed === true` 时，`listened_seconds` 至少须达到计划总时长的**比例**——
// 低于此即判「明显小于时长」⇒ 拒（R50-⑤⑤ / 任务硬口径 ⑤）。容差吸收端侧秒级取整与少量跳段。
const COMPLETION_MIN_RATIO = 0.95

// 同一身份（此处＝发奖账号 `user_id`）**单日发放上限**（R50-⑥④）。
// 这是**滥用兜底**，不是产品配额：当 `allow_repeat_rewards=false` 时真实上限更紧（每个账号只发一次）。
// 取值理由：一场冥想 ≈15 分钟，单日 6 次已远超正常使用；出现超限即视为异常/脚本刷量。
const MAX_DAILY_REWARDS_PER_IDENTITY = 6

// 上传/上报的硬性上限（防御性，防响应体/库膨胀）。
const MAX_SELECTIONS = 200
const MAX_AUDIO_ID_QUERY_BATCH = 50 // CloudBase `where in` 单次不宜过大（对齐 R39 / R51 的 50 口径）
const MAX_LISTENED_SECONDS = 24 * 60 * 60
const SESSION_KEY_MAX_LENGTH = 128
const STRING_FIELD_MAX_LENGTH = 128

// 奖励配置键（= apps/app/src/services/cloudbase.js 的 MEDITATION_SETTINGS_KEY，
//   = packages/shared-utils/meditation-reward-settings.js 的 MEDITATION_SETTINGS_KEY）。
const MEDITATION_REWARD_SETTINGS_KEY = 'meditation_rewards'

// 后端读取 app_settings 里冥想奖励配置时的**快照字段名**（照 normalizeMeditationSettings 的取值口径：
//   `reward_points` ?? `rewardPoints`，`allow_repeat_rewards` ?? `allowRepeatRewards`）。
const REWARD_SETTINGS_DEFAULTS = Object.freeze({
  rewardPoints: 50,
  allowRepeatRewards: true
})

// ─── 基础工具 ────────────────────────────────────────────────────────────────

const getString = (value) => (typeof value === 'string' ? value : '')

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const buildError = (code, message, details) => ({
  ok: false,
  error: code,
  message,
  ...(details ? { details } : {})
})

const roundHundredths = (value) => Math.round(Number(value || 0) * 100) / 100

// action 解析：缺省 = reportCompletion（对齐 meditation-read「缺省 = getTrack」的既有约定）；
// 非字符串 / 未知值一律报错（不猜、不静默落到缺省）。
const resolveAction = (event = {}) => {
  const raw = event.action

  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, action: DEFAULT_ACTION }
  }

  if (typeof raw !== 'string') {
    return { ok: false, error: buildError(ERROR_CODES.invalidAction, 'action 必须是字符串', { received_type: typeof raw }) }
  }

  if (raw !== ACTIONS.reportCompletion) {
    return { ok: false, error: buildError(ERROR_CODES.invalidAction, `未知 action：${raw}`, { allowed: [ACTIONS.reportCompletion] }) }
  }

  return { ok: true, action: raw }
}

// ─── 入参白名单与必填校验 ─────────────────────────────────────────────────────

// 从 event 中**只挑白名单字段**（其余忽略、不入库），并回传被忽略的键名（可观测、非静默）。
const buildReportInput = (event = {}) => {
  const input = {}
  const ignoredFields = []

  Object.keys(event).forEach((key) => {
    if (REPORT_INPUT_FIELDS.includes(key)) {
      input[key] = event[key]
    } else {
      ignoredFields.push(key)
    }
  })

  return { input, ignoredFields }
}

// 校验单个 selection 条目。
const validateSelectionItem = (item, index) => {
  const issues = []

  if (!isPlainObject(item)) {
    return { ok: false, issues: [`selections[${index}] 必须是对象`] }
  }

  const slotIndex = toFiniteNumber(item.slot_index)
  if (slotIndex === null || !Number.isInteger(slotIndex) || slotIndex < 0) {
    issues.push(`selections[${index}].slot_index 必须是非负整数`)
  }

  const audioId = getString(item.audio_id).trim()
  if (!audioId) {
    issues.push(`selections[${index}].audio_id 必须是非空字符串`)
  }

  const duration = toFiniteNumber(item.duration_seconds)
  if (duration === null || duration < 0) {
    issues.push(`selections[${index}].duration_seconds 必须是非负数`)
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    value: {
      slot_index: slotIndex,
      audio_id: audioId,
      duration_seconds: roundHundredths(duration)
    }
  }
}

// 校验 selections 数组（非空、长度上限、逐条合法）。
const validateSelections = (raw) => {
  if (!Array.isArray(raw)) {
    return { ok: false, error: buildError(ERROR_CODES.invalidSelections, 'selections 必须是数组', { received_type: typeof raw }) }
  }

  if (raw.length === 0) {
    return { ok: false, error: buildError(ERROR_CODES.invalidSelections, 'selections 不得为空数组') }
  }

  if (raw.length > MAX_SELECTIONS) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidSelections, `selections 条数超上限（${raw.length} > ${MAX_SELECTIONS}）`, {
        max: MAX_SELECTIONS,
        received: raw.length
      })
    }
  }

  const value = []
  const issues = []

  raw.forEach((item, index) => {
    const result = validateSelectionItem(item, index)
    if (!result.ok) {
      issues.push(...result.issues)
      return
    }
    value.push(result.value)
  })

  if (issues.length > 0) {
    return { ok: false, error: buildError(ERROR_CODES.invalidSelections, 'selections 存在非法条目', { issues }) }
  }

  return { ok: true, value }
}

// 必填 / 类型校验（R50 上报最小集）。返回规范化后的 payload 或结构化错误。
const validateReportInput = ({ input = {}, ignoredFields = [] } = {}) => {
  const missing = []
  const invalid = []

  const readRequiredString = (key, { maxLength = STRING_FIELD_MAX_LENGTH } = {}) => {
    const value = getString(input[key]).trim()
    if (!value) {
      missing.push(key)
      return ''
    }
    if (value.length > maxLength) {
      invalid.push(`${key} 超长（>${maxLength}）`)
      return ''
    }
    return value
  }

  const trackKey = readRequiredString('track_key')
  const sessionKey = readRequiredString('session_key', { maxLength: SESSION_KEY_MAX_LENGTH })
  const dateKey = readRequiredString('date_key')
  const endedReason = readRequiredString('ended_reason')
  const mode = readRequiredString('mode')
  const userId = readRequiredString('user_id')

  const trackVersion = toFiniteNumber(input.track_version)
  if (trackVersion === null) {
    invalid.push('track_version 必须是数字')
  }

  if (dateKey && !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    invalid.push('date_key 必须是 YYYY-MM-DD')
  }

  if (typeof input.completed !== 'boolean') {
    missing.push('completed')
  }

  const listenedSeconds = toFiniteNumber(input.listened_seconds)
  if (listenedSeconds === null) {
    invalid.push('listened_seconds 必须是数字')
  } else if (listenedSeconds < 0) {
    invalid.push('listened_seconds 不得为负')
  } else if (listenedSeconds > MAX_LISTENED_SECONDS) {
    invalid.push(`listened_seconds 超上限（>${MAX_LISTENED_SECONDS}）`)
  }

  const selectionsResult = validateSelections(input.selections)
  if (!selectionsResult.ok) {
    if (input.selections === undefined) {
      missing.push('selections')
    } else {
      return { ok: false, error: selectionsResult.error }
    }
  }

  if (missing.length > 0 || invalid.length > 0) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidParams, '上报入参不完整或类型不合法', {
        missing: [...new Set(missing)],
        invalid: [...new Set(invalid)]
      })
    }
  }

  const selections = selectionsResult.value
  const planTotalSeconds = roundHundredths(selections.reduce((sum, item) => sum + item.duration_seconds, 0))

  return {
    ok: true,
    value: {
      track_key: trackKey,
      track_version: trackVersion,
      session_key: sessionKey,
      date_key: dateKey,
      selections,
      listened_seconds: roundHundredths(listenedSeconds),
      completed: input.completed,
      ended_reason: endedReason,
      mode,
      user_id: userId,
      plan_total_seconds: planTotalSeconds,
      ignored_fields: ignoredFields
    }
  }
}

// ─── 伪造拒绝（R50-⑤ / ⑥；任务硬口径 ①②③⑤） ────────────────────────────────

// ①③：各段 `audio_id` 必须真实存在（`docById` 由 index.js 按 id 批量取回）且 `duration_seconds` 不得超库内时长。
const validateSelectionAudios = ({ selections = [], audioById = new Map() } = {}) => {
  const missingAudioIds = []

  selections.forEach((item) => {
    if (!audioById.has(item.audio_id)) {
      missingAudioIds.push(item.audio_id)
    }
  })

  if (missingAudioIds.length > 0) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.audioNotFound, '上报的 audio_id 不存在于库', {
        audio_ids: [...new Set(missingAudioIds)]
      })
    }
  }

  const forged = []

  selections.forEach((item) => {
    const doc = audioById.get(item.audio_id) || {}
    const libraryDuration = toFiniteNumber(doc.duration)
    if (libraryDuration === null) {
      // 库内时长缺失 / 非法 ⇒ 无法证明「不超时长」，按伪造拒绝（不静默放行）。
      forged.push({ slot_index: item.slot_index, audio_id: item.audio_id, declared: item.duration_seconds, library: null })
      return
    }

    if (item.duration_seconds > libraryDuration + DURATION_TOLERANCE_SECONDS) {
      forged.push({
        slot_index: item.slot_index,
        audio_id: item.audio_id,
        declared: item.duration_seconds,
        library: roundHundredths(libraryDuration),
        tolerance: DURATION_TOLERANCE_SECONDS
      })
    }
  })

  if (forged.length > 0) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.forgedDuration, '存在时长越界的段（声明段时长超过库内时长）', {
        tolerance_seconds: DURATION_TOLERANCE_SECONDS,
        invalid_selections: forged
      })
    }
  }

  return { ok: true }
}

// ②⑤：`listened_seconds` 上界（≤ 计划总时长 + 容差）与「completed 为真但明显小于时长」。
const assessListening = ({ listenedSeconds, planTotalSeconds, completed } = {}) => {
  if (listenedSeconds > planTotalSeconds + PLAN_TOTAL_TOLERANCE_SECONDS) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.forgedListenedSeconds, 'listened_seconds 超过计划总时长（含容差）', {
        listened_seconds: listenedSeconds,
        plan_total_seconds: planTotalSeconds,
        tolerance_seconds: PLAN_TOTAL_TOLERANCE_SECONDS
      })
    }
  }

  if (completed === true) {
    const required = planTotalSeconds * COMPLETION_MIN_RATIO
    if (listenedSeconds < required) {
      return {
        ok: false,
        error: buildError(ERROR_CODES.incompleteListen, 'completed 为真但 listened_seconds 明显小于计划总时长', {
          listened_seconds: listenedSeconds,
          plan_total_seconds: planTotalSeconds,
          min_ratio: COMPLETION_MIN_RATIO,
          required_seconds: roundHundredths(required)
        })
      }
    }
  }

  return { ok: true }
}

// ─── 奖励配置归一（照 apps/app/src/services/cloudbase.js#getMeditationRewardSettings 口径） ─

const normalizeMeditationRewardSettings = (document = {}) => {
  const source = isPlainObject(document) ? document : {}

  return {
    rewardPoints: Number(source.reward_points ?? source.rewardPoints ?? REWARD_SETTINGS_DEFAULTS.rewardPoints),
    allowRepeatRewards: Boolean(source.allow_repeat_rewards ?? source.allowRepeatRewards ?? REWARD_SETTINGS_DEFAULTS.allowRepeatRewards),
    settings_id: getString(source._id || source.id)
  }
}

// ─── 身份（R50-⑥⑤ / C42） ────────────────────────────────────────────────────
//
// 【身份纪律】发放必须能追溯到调用者身份；**匿名 `_openid` 不作为发放依据**（R50-⑥⑤）。
//   本函数按以下次序解析调用者身份（**不假造 uid**）：
//     ① 框架注入的 `event.userInfo`（微信/云开发在真实端侧调用时注入；CLI 直调时通常没有）
//        —— 取 openId / uid / customUserId 之一作为**服务端可溯源身份**（verified = true）；
//     ② 都没有 ⇒ 回退到端侧上报的 `user_id`，并显式标注 **verified = false**
//        （＝ C42 的「匿名写授权 / 身份双轨」缺口：`user_id` 由端侧提供、服务端无法验证）。
//   身份一旦解析，**作为幂等键的一部分**并写入 `med_play_sessions` 供审计。
const resolveCallerIdentity = ({ event = {}, userId = '' } = {}) => {
  const userInfo = isPlainObject(event.userInfo) ? event.userInfo : null

  if (userInfo) {
    const candidate = getString(userInfo.openId || userInfo.openid || userInfo.uid || userInfo.customUserId || '').trim()
    if (candidate) {
      return {
        identity_key: candidate,
        source: 'user_info',
        verified: true
      }
    }
  }

  return {
    identity_key: userId,
    source: 'client_user_id',
    verified: false
  }
}

// ─── 出参 / 入库载荷组装 ──────────────────────────────────────────────────────

// `med_play_sessions` 文档载荷（写入侧）。**只含白名单字段**，不夹带 event 原文。
const buildSessionRecord = ({
  payload,
  identity,
  planTotalSeconds,
  status,
  nowIso
} = {}) => ({
  session_key: payload.session_key,
  identity_key: identity.identity_key,
  identity_source: identity.source,
  identity_verified: identity.verified,
  user_id: payload.user_id,
  mode: payload.mode,
  track_key: payload.track_key,
  track_version: payload.track_version,
  date_key: payload.date_key,
  selections: payload.selections,
  listened_seconds: payload.listened_seconds,
  plan_total_seconds: planTotalSeconds,
  completed: payload.completed,
  ended_reason: payload.ended_reason,
  awarded: false,
  reward_points: 0,
  balance_after: null,
  point_ledger_id: '',
  status,
  created_at: nowIso,
  updated_at: nowIso
})

// `point_ledger` 文档载荷（**事件账本为权威**；字段结构照 apps/app/src/services/cloudbase.js
//   的 recordPointLedger / miniprogram utils/meditation.js 的既有流水形状；**biz_id = session_key**
//   为幂等值——**绝不用 Date.now()**）。
const buildPointLedgerEntry = ({ payload, rewardPoints, balanceAfter, nowIso } = {}) => ({
  user_id: payload.user_id,
  delta: rewardPoints,
  balance_after: balanceAfter,
  biz_type: 'meditation',
  biz_id: payload.session_key,
  description: '完成一次冥想（完播）',
  activity_date_key: payload.date_key,
  activity_slot: '',
  meta: {
    track_key: payload.track_key,
    track_version: payload.track_version,
    listened_seconds: payload.listened_seconds,
    plan_total_seconds: payload.plan_total_seconds,
    completed: payload.completed,
    ended_reason: payload.ended_reason,
    mode: payload.mode,
    session_key: payload.session_key
  },
  operator_id: '',
  created_at: nowIso
})

module.exports = {
  ACTIONS,
  DEFAULT_ACTION,
  ERROR_CODES,
  REPORT_INPUT_FIELDS,
  SELECTION_INPUT_FIELDS,
  DURATION_TOLERANCE_SECONDS,
  PLAN_TOTAL_TOLERANCE_SECONDS,
  COMPLETION_MIN_RATIO,
  MAX_DAILY_REWARDS_PER_IDENTITY,
  MAX_SELECTIONS,
  MAX_AUDIO_ID_QUERY_BATCH,
  MAX_LISTENED_SECONDS,
  SESSION_KEY_MAX_LENGTH,
  MEDITATION_REWARD_SETTINGS_KEY,
  REWARD_SETTINGS_DEFAULTS,
  getString,
  isPlainObject,
  toFiniteNumber,
  roundHundredths,
  buildError,
  resolveAction,
  buildReportInput,
  validateSelections,
  validateReportInput,
  validateSelectionAudios,
  assessListening,
  normalizeMeditationRewardSettings,
  resolveCallerIdentity,
  buildSessionRecord,
  buildPointLedgerEntry
}
