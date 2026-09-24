// 【防漂移】本文件内的回退 / 校验常量（章数 6 等）**非权威源**；运行时一律以 D6 云函数（meditation-read）响应为准，**绝不**可覆盖响应值。
// ─── D6 只读云函数（meditation-read）的端侧调用包装（纯函数 / 零 IO / callFunction 由调用方注入） ──
//
// 【规范依据】docs/meditation.admin.partner.spec.md（v4.8）
//   · D6 / R30 / R39 ①②③：端侧读 `med_tracks` / `med_section_audios` 的**唯一通道**是
//     `cloudfunctions/meditation-read/`（函数名 `meditation-read`，3 个 action＝getTrack / getSectionAudios /
//     listTracks）。成功 `{ok:true,data,meta}`、失败 `{ok:false,error,message,details?}`；
//     **调用方按 `error` 码分支、不解析 `message` 文本**（README §1 同样口径）。
//   · R39 ⑤ / C11：临时链接 `maxAge = 7200`（2 小时）、端侧缓存 **≤ 半有效期（≈1 小时）** 或按
//     `url_policy.expires_at` 判陈旧 ⇒ 本模块导出 `MEDITATION_READ_URL_MAX_AGE_SECONDS`。
//   · R39 ③：**不把「没报错」当「读到了」、不返回部分数据当成功** ⇒ 本模块 `ok !== true` 一律抛错，
//     绝不把部分 / 残缺数据当成功返回。
//
// 【设计口径】（本模块自有，规范未逐字规定，已报告 Zang）
//   ① **零 IO、零 import**：不 import 任何 SDK、不碰 window / localStorage / wx / uni ——
//      `callFunction` 由调用方注入（App 传 `app.callFunction`，后台传同一 js-sdk 的方法）；
//   ② 兼容两种返回形态：`res.result`（wx.cloud / CloudBase js-sdk v1）与 `res`（v2 直接返回 result），
//      并对「result 是 JSON 字符串」的形态做一次解析（最多解 4 层包装，防死循环）；
//   ③ 只按 `ok` 与 `error` 码分支：错误码原样透传到 `MeditationReadError.code`（未知码不吞、
//      不猜、不按文本归类）；本地另有 3 个**自产码**：`INVALID_PARAMS`（调用前本地入参校验）、
//      `INVALID_PAYLOAD`（响应形状 / 关键字段不合法）、`CALL_FAILED`（callFunction 本身抛错）；
//   ④ 轻量响应校验（R39 ⑦ / R10）：`data.track.chapters` 恒 **6** 项、末章 `gap_after_seconds === 0`、
//      `section_audio_pools` 是对象、`url_policy.max_age_seconds` 是正数 —— 任一不满足抛 `INVALID_PAYLOAD`；
//   ⑤ **不接受任何 fixture / 开关**：桩一律由测试侧注入 `callFunction`，本模块零分支开关。
//
// 【返回形态】成功时返回 `{ ok: true, data, meta }`（与云函数成功骨架同形，`data` 已通过校验）：
//   const { data } = await client.getTrack()
//   data.track / data.chapter_template / data.section_audio_pools / data.url_policy / data.stats
//   ※ 失败**不返回**，直接抛 `MeditationReadError`（`error.code` 即分支依据）；失败 envelope 的
//     `meta` 也保留在错误对象上（`error.meta` / `error.requestId`，requestId 取值优先级
//     `meta.request_id` → `meta.requestId` → `details.request_id`），便于错误文案附加排查标识。
//
// 【纯 ESM】可在浏览器 / Vite 下直接 `import { createMeditationReadClient } from '@liwu/shared-utils/meditation-read-client.js'`。

export const MEDITATION_READ_FUNCTION_NAME = 'meditation-read'

// 临时链接有效期（秒）：与规范 C11 / 质检 X14 的 `maxAge = 7200` 一致。
export const MEDITATION_READ_URL_MAX_AGE_SECONDS = 7200

// 端侧缓存陈旧阈值（秒）：R39 ⑪「缓存 ≤ max_age_seconds 的一半（≈1 小时）」。
export const MEDITATION_READ_URL_STALE_AFTER_SECONDS = MEDITATION_READ_URL_MAX_AGE_SECONDS / 2

// ─── 临时 URL 陈旧判定（R39 ⑤ / ⑪；纯函数，供 App / 小程序共用） ─────────────────────
// 背景：响应**不下发 `file_id`** ⇒ 端侧「重签」＝**同参重调 getTrack**；本函数只回答「什么时候该调」。
// 口径（**时钟偏移免疫**，这是刻意的）：
//   ① 以**端侧收到该响应的本地时刻**（`receivedAtMs`，或端侧写入策略对象的 `received_at_ms`）起算已用时长，
//      **不**拿本地绝对时钟去减服务端 `issued_at` / 与 `expires_at` 直接比较——两端时钟不同步时，
//      刚拿到手的链接会被判成「已过期」，于是每段播放前都重签一次（正是要禁止的「无脑重调」）；
//   ② 阈值＝有效期的一半（`max_age_seconds / 2`，默认 7200/2 ＝ 3600s）⇒「距过期不足半有效期」即判陈旧；
//   ③ `max_age_seconds` 缺失 / 非正数时，退用 `issued_at → expires_at` 的**跨度**当有效期（同一基准）；
//   ④ 无策略 / 时间戳不可解析 / 缺收到时刻 ⇒ `stale: false`（**不**据此重签，交给 403 兜底），
//      并回 `reason` 供调用方记录；**不抛错**（判定失败不得阻断播放）。
export const resolveMeditationUrlPolicyStaleness = ({
  urlPolicy = null,
  receivedAtMs = null,
  nowMs = Date.now()
} = {}) => {
  const policy = isPlainObject(urlPolicy) ? urlPolicy : null
  const now = toFiniteNumberOrNull(nowMs)
  const explicitReceivedAtMs = toFiniteNumberOrNull(receivedAtMs)
  const receivedAt = explicitReceivedAtMs !== null ? explicitReceivedAtMs : toFiniteNumberOrNull(policy?.received_at_ms)
  const declaredMaxAgeSeconds = toFiniteNumberOrNull(policy?.max_age_seconds)
  const issuedAtMs = Date.parse(getString(policy?.issued_at))
  const expiresAtMs = Date.parse(getString(policy?.expires_at))
  const parsedIssuedAtMs = Number.isFinite(issuedAtMs) ? issuedAtMs : null
  const parsedExpiresAtMs = Number.isFinite(expiresAtMs) ? expiresAtMs : null
  const spanSeconds = parsedIssuedAtMs !== null && parsedExpiresAtMs !== null && parsedExpiresAtMs > parsedIssuedAtMs
    ? (parsedExpiresAtMs - parsedIssuedAtMs) / 1000
    : null
  const maxAgeSeconds = declaredMaxAgeSeconds !== null && declaredMaxAgeSeconds > 0
    ? declaredMaxAgeSeconds
    : spanSeconds
  const staleAfterSeconds = maxAgeSeconds !== null && maxAgeSeconds > 0 ? maxAgeSeconds / 2 : null

  if (!policy) {
    return { stale: false, reason: 'no_policy', age_seconds: null, stale_after_seconds: staleAfterSeconds, max_age_seconds: maxAgeSeconds }
  }

  if (staleAfterSeconds === null || receivedAt === null || now === null) {
    return { stale: false, reason: 'unknown_validity', age_seconds: null, stale_after_seconds: staleAfterSeconds, max_age_seconds: maxAgeSeconds }
  }

  const ageSeconds = Math.max(0, (now - receivedAt) / 1000)
  const stale = ageSeconds >= staleAfterSeconds

  return {
    stale,
    reason: stale ? 'half_life_elapsed' : 'fresh',
    age_seconds: ageSeconds,
    stale_after_seconds: staleAfterSeconds,
    max_age_seconds: maxAgeSeconds
  }
}

export const MEDITATION_READ_ACTIONS = Object.freeze({
  getTrack: 'getTrack',
  getSectionAudios: 'getSectionAudios',
  listTracks: 'listTracks'
})

// 缺省 action＝端侧主路径（R39 ②）。
export const MEDITATION_READ_DEFAULT_ACTION = MEDITATION_READ_ACTIONS.getTrack

// 六章固定模板的章数（R10 / R39 ⑦：Track 一律折回六章模板，`chapters` 恒 6）。
export const MEDITATION_READ_REQUIRED_CHAPTER_COUNT = 6

export const MEDITATION_READ_ERROR_CODES = Object.freeze({
  // 服务端下发的 error 码（R39 ③）
  readFailed: 'READ_FAILED',
  invalidEvent: 'INVALID_EVENT',
  invalidAction: 'INVALID_ACTION',
  invalidParams: 'INVALID_PARAMS',
  trackNotFound: 'TRACK_NOT_FOUND',
  trackDisabled: 'TRACK_DISABLED',
  // 本地自产码（服务端不下发这两个）
  invalidPayload: 'INVALID_PAYLOAD',
  callFailed: 'CALL_FAILED'
})

// 稳定的本地错误：`code` 是唯一分支依据（**不得**解析 message 文本）。
//
// 【失败分支同样保留 envelope 的 `meta`】服务端（meditation-read）的成功 / 失败 envelope 都可能带
// `meta`（如 `meta.request_id`）；此前错误对象只带 `{code,message,details}`、`meta` 被丢弃
// ⇒ 端侧错误文案永远附不上 requestId。取值优先级：`meta.request_id` → `meta.requestId` →
// `details.request_id`；三者皆无则为空串（**不抛错、不连坐**）。`code` 语义与抛错时机不变。
const resolveMeditationReadRequestId = (meta, details) => {
  const readString = (value) => (value == null ? '' : String(value).trim())
  const candidates = [
    readString(meta?.request_id),
    readString(meta?.requestId),
    readString(details?.request_id)
  ]

  return candidates.find(Boolean) || ''
}

export class MeditationReadError extends Error {
  constructor(code, message, details = null, meta = null) {
    super(message || `冥想读取失败（${code}）`)

    this.name = 'MeditationReadError'
    this.code = code || MEDITATION_READ_ERROR_CODES.callFailed
    this.details = details && typeof details === 'object' ? details : null
    // 保留失败 envelope 的 `meta`（只读不解释，分支仍只看 `code`）。
    this.meta = isPlainObject(meta) ? meta : null
    this.requestId = resolveMeditationReadRequestId(this.meta, this.details)
  }
}

export const isMeditationReadError = (error) => (
  error instanceof MeditationReadError
)

const getString = (value) => (value == null ? '' : String(value))

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const toFiniteNumberOrNull = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
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

// 解包：字符串 → 对象；`{ result: … }`（无 `ok`）→ 内层。最多 4 层。
const unwrapMeditationReadResult = (raw, { maxDepth = 4 } = {}) => {
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

// ─── 轻量响应校验（R39 ⑦ / R10） ───────────────────────────────────────────────

const collectGetTrackIssues = (data) => {
  const issues = []
  const track = data.track

  if (!isPlainObject(track)) {
    issues.push('track 必须是对象')
  } else {
    const chapters = track.chapters

    if (!Array.isArray(chapters)) {
      issues.push('track.chapters 必须是数组')
    } else {
      if (chapters.length !== MEDITATION_READ_REQUIRED_CHAPTER_COUNT) {
        issues.push(`track.chapters 必须是 ${MEDITATION_READ_REQUIRED_CHAPTER_COUNT} 项（收到 ${chapters.length}）`)
      }

      chapters.forEach((chapter, index) => {
        if (!isPlainObject(chapter)) {
          issues.push(`track.chapters[${index}] 必须是对象`)
        }
      })

      const lastChapter = chapters[chapters.length - 1]
      const lastGapSeconds = isPlainObject(lastChapter) ? toFiniteNumberOrNull(lastChapter.gap_after_seconds) : null

      if (lastGapSeconds !== 0) {
        issues.push(`末章 gap_after_seconds 必须是 0（收到 ${getString(lastChapter?.gap_after_seconds) || 'undefined'}）`)
      }
    }
  }

  return issues
}

// `section_audio_pools` + `url_policy` 只对「取音频池」的两个 action 有意义（listTracks 不签发链接、不读音频集合）。
const collectPoolDataIssues = (data) => {
  const issues = []

  if (!isPlainObject(data.section_audio_pools)) {
    issues.push('section_audio_pools 必须是对象')
  }

  const maxAgeSeconds = isPlainObject(data.url_policy)
    ? toFiniteNumberOrNull(data.url_policy.max_age_seconds)
    : null

  if (maxAgeSeconds === null || maxAgeSeconds <= 0) {
    issues.push('url_policy.max_age_seconds 必须是正数')
  }

  return issues
}

// 校验响应数据（纯函数；`{ ok, issues }`，不抛）。action 决定用哪一组规则。
export const validateMeditationReadPayload = ({ action = MEDITATION_READ_DEFAULT_ACTION, data = null } = {}) => {
  const issues = []

  if (!isPlainObject(data)) {
    issues.push('data 必须是对象')
    return { ok: false, issues }
  }

  if (action === MEDITATION_READ_ACTIONS.getTrack || action === MEDITATION_READ_ACTIONS.getSectionAudios) {
    issues.push(...collectPoolDataIssues(data))
  }

  if (issues.length === 0 && action === MEDITATION_READ_ACTIONS.getTrack) {
    issues.push(...collectGetTrackIssues(data))
  }

  if (issues.length === 0 && action === MEDITATION_READ_ACTIONS.listTracks && !Array.isArray(data.tracks)) {
    issues.push('listTracks 的 tracks 必须是数组')
  }

  if (issues.length === 0 && data.chapter_template !== undefined && !Array.isArray(data.chapter_template)) {
    issues.push('chapter_template 必须是数组')
  }

  return { ok: issues.length === 0, issues }
}

// 校验 + 抛错版（内部与测试共用；不合法 ⇒ `INVALID_PAYLOAD`）。
export const assertMeditationReadPayload = ({ action, data } = {}) => {
  const validation = validateMeditationReadPayload({ action, data })

  if (!validation.ok) {
    throw new MeditationReadError(
      MEDITATION_READ_ERROR_CODES.invalidPayload,
      `响应数据非法：${validation.issues.join('；')}`,
      { action, issues: validation.issues }
    )
  }

  return data
}

// ─── 入参归一（按 action 白名单；与云函数 README §1 的键名一致，snake_case） ────────────────

const READ_PARAM_KEYS_BY_ACTION = Object.freeze({
  [MEDITATION_READ_ACTIONS.getTrack]: Object.freeze(['track_id', 'track_key']),
  [MEDITATION_READ_ACTIONS.getSectionAudios]: Object.freeze(['section_types', 'section_type']),
  [MEDITATION_READ_ACTIONS.listTracks]: Object.freeze([])
})

const readOptionalStringParam = (params, key) => {
  const value = params?.[key]

  if (value === undefined || value === null || value === '') {
    return ''
  }

  if (typeof value !== 'string') {
    throw new MeditationReadError(
      MEDITATION_READ_ERROR_CODES.invalidParams,
      `${key} 必须是字符串`,
      { param: key, received_type: typeof value }
    )
  }

  return value.trim()
}

const resolveSectionTypesParam = (params = {}) => {
  if (params.section_types !== undefined && params.section_types !== null) {
    if (!Array.isArray(params.section_types)) {
      throw new MeditationReadError(
        MEDITATION_READ_ERROR_CODES.invalidParams,
        'section_types 必须是字符串数组',
        { param: 'section_types', received_type: typeof params.section_types }
      )
    }

    const sectionTypes = params.section_types.map((value) => getString(value).trim()).filter(Boolean)

    if (sectionTypes.length === 0) {
      throw new MeditationReadError(
        MEDITATION_READ_ERROR_CODES.invalidParams,
        'section_types 不能为空',
        { param: 'section_types' }
      )
    }

    return { section_types: sectionTypes }
  }

  const single = readOptionalStringParam(params, 'section_type')

  if (!single) {
    throw new MeditationReadError(
      MEDITATION_READ_ERROR_CODES.invalidParams,
      '缺少参数：section_types（或 section_type）',
      { param: 'section_types' }
    )
  }

  return { section_type: single }
}

// 只透传该 action 认识的关键字（其余键与云函数口径一致：忽略，不做隐式转换）。
const normalizeReadParams = ({ action, params } = {}) => {
  if (action === MEDITATION_READ_ACTIONS.getSectionAudios) {
    return resolveSectionTypesParam(params)
  }

  const allowedKeys = READ_PARAM_KEYS_BY_ACTION[action] || []
  const normalized = {}

  allowedKeys.forEach((key) => {
    const value = readOptionalStringParam(params, key)

    if (value) {
      normalized[key] = value
    }
  })

  return normalized
}

// ─── 客户端工厂（D6 调用包装） ─────────────────────────────────────────────────

// `callFunction` 必须由调用方注入：形如 `({ name, data }) => Promise<res>`。
// `thisArg` 可选（wx/CloudBase 的 `app.callFunction` 若依赖 this，可传 `{ callFunction: app.callFunction, thisArg: app }`）。
export const createMeditationReadClient = ({ callFunction, thisArg = undefined } = {}) => {
  if (typeof callFunction !== 'function') {
    throw new TypeError('createMeditationReadClient 需要注入 callFunction（形如 ({ name, data }) => Promise<res>）')
  }

  const call = async ({ action, params = {} } = {}) => {
    const data = { action, ...normalizeReadParams({ action, params }) }
    let raw

    try {
      raw = await callFunction.call(thisArg, { name: MEDITATION_READ_FUNCTION_NAME, data })
    } catch (error) {
      throw new MeditationReadError(
        MEDITATION_READ_ERROR_CODES.callFailed,
        `调用 ${MEDITATION_READ_FUNCTION_NAME} 失败：${error?.message || 'UNKNOWN_ERROR'}`,
        { action, cause: error?.message || String(error || '') }
      )
    }

    const unwrapped = unwrapMeditationReadResult(raw)

    if (!unwrapped.ok) {
      throw new MeditationReadError(
        MEDITATION_READ_ERROR_CODES.invalidPayload,
        `响应形状非法：${unwrapped.reason}`,
        { action }
      )
    }

    const envelope = unwrapped.envelope

    // 只按 ok / error 码分支；message 只作兜底文案，**不参与判断**。
    if (envelope.ok !== true) {
      const code = getString(envelope.error).trim()

      throw new MeditationReadError(
        code || MEDITATION_READ_ERROR_CODES.readFailed,
        getString(envelope.message) || `读取失败（${code || MEDITATION_READ_ERROR_CODES.readFailed}）`,
        isPlainObject(envelope.details) ? envelope.details : null,
        // 失败 envelope 的 `meta` 一并保留（`error.meta` / `error.requestId`），不改变上面的 code 语义。
        isPlainObject(envelope.meta) ? envelope.meta : null
      )
    }

    assertMeditationReadPayload({ action, data: envelope.data })

    return {
      ok: true,
      data: envelope.data,
      meta: isPlainObject(envelope.meta) ? envelope.meta : {}
    }
  }

  return Object.freeze({
    getTrack: (params = {}) => call({ action: MEDITATION_READ_ACTIONS.getTrack, params }),
    getSectionAudios: (params = {}) => call({ action: MEDITATION_READ_ACTIONS.getSectionAudios, params }),
    listTracks: (params = {}) => call({ action: MEDITATION_READ_ACTIONS.listTracks, params })
  })
}
