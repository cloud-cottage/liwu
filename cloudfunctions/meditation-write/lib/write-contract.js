// ─── 写侧云函数（meditation-write）的入参 / 出参契约与写侧纯逻辑 ─────────────────────
//
// 【职责】为后台提供 `med_*`（`med_paragraphs` / `med_section_raws` / `med_section_audios` /
//   `med_tracks`，含 `chapters[].slots`）的增 / 改 / 删 / 查能力。与只读云函数
//   `meditation-read` **完全分离**：端侧 D6 读通道保持无鉴权、零写路径（R39-⑩ / R39-⑫）。
//
// 【权威源（authoritative source）】本文件为云函数自足副本，口径来自：
//   · `packages/shared-utils/meditation-track-normalizers.js`（槽位白名单 / 归一）
//   · `apps/web/src/admin/utils/meditationTrackSlots.js`（写入前槽位校验，与 UI 同一份）
//   · `apps/web/src/admin/services/database.js`（各集合 create / update 载荷形状）
//   · `packages/shared-utils/meditation-section-audio.js`（`med_section_audios` 字段）
//   云函数只打包函数目录、**不能** require 仓库内共享模块（Zang 裁定 D-B2-8）⇒ 本副本。
//
// 【写成功判据（硬；R40）】`update` **不得**用 `updated >= 1` 判成功——`updated:0` 三义同形
//   （值本来相同 / 无权写 / 文档不存在，R40-②）且含对象数组载荷时 `updated` 非确定（R40-③）。
//   本模块只提供**读回比对**所需的纯函数（`toComparable` / `deepEqualLoose` / `pickComparableSubset`），
//   判定动作在 `index.js` 的 `updateDocumentAndVerify` 完成。
//
// 【删除影响条数（硬；R38-①）】`deleted < 1` 必须抛错——本模块提供 `resolveDeletedCount`。

const {
  MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS,
  normalizeMeditationTranscodedFormats
} = require('./meditation-formats.js')

const {
  MEDITATION_TRACK_CHAPTER_TEMPLATE,
  MEDITATION_TRACK_SLOT_POLICIES,
  MEDITATION_TRACK_SLOT_SELECTOR_KINDS,
  MEDITATION_PARAGRAPH_TYPE_ORDER,
  normalizeMeditationSectionCode
} = require('./meditation-track-template.js')

const {
  MEDITATION_TRACK_COLLECTION,
  toMedTrackPayload
} = require('./meditation-track-normalizers.js')

// ─── 集合名 ──────────────────────────────────────────────────────────────────
const COLLECTIONS = Object.freeze({
  medParagraphs: 'med_paragraphs',
  medSectionRaws: 'med_section_raws',
  medSectionAudios: 'med_section_audios',
  medTracks: MEDITATION_TRACK_COLLECTION,
  users: 'users',
  tags: 'tags',
  userTags: 'user_tags'
})

// ─── 结构化错误码（调用方按 code 分支，不解析 message） ───────────────────────────
const ERROR_CODES = Object.freeze({
  invalidEvent: 'INVALID_EVENT',
  invalidAction: 'INVALID_ACTION',
  invalidParams: 'INVALID_PARAMS',
  docNotFound: 'DOC_NOT_FOUND',
  // 鉴权（写侧 / 后台侧 action 全部要求；任一不满足 ⇒ 显式拒绝，**绝不静默**）：
  authRequired: 'AUTH_REQUIRED',
  authUserNotFound: 'AUTH_USER_NOT_FOUND',
  authIdentityMismatch: 'AUTH_IDENTITY_MISMATCH',
  authIdentityUnverified: 'AUTH_IDENTITY_UNVERIFIED',
  authNotAdmin: 'AUTH_NOT_ADMIN',
  writeFailed: 'WRITE_FAILED'
})

// ─── action 集（按集合分组：listX / getX / createX / updateX / removeX ＋ whoami） ──
const ACTIONS = Object.freeze({
  // 诊断（只读自身鉴权结果，不抛）
  whoami: 'whoami',
  // med_paragraphs
  listParagraphs: 'listParagraphs',
  getParagraph: 'getParagraph',
  createParagraph: 'createParagraph',
  updateParagraph: 'updateParagraph',
  removeParagraph: 'removeParagraph',
  // med_section_raws
  listSectionRaws: 'listSectionRaws',
  getSectionRaw: 'getSectionRaw',
  createSectionRaw: 'createSectionRaw',
  updateSectionRaw: 'updateSectionRaw',
  removeSectionRaw: 'removeSectionRaw',
  // med_section_audios
  listSectionAudios: 'listSectionAudios',
  getSectionAudio: 'getSectionAudio',
  createSectionAudio: 'createSectionAudio',
  updateSectionAudio: 'updateSectionAudio',
  removeSectionAudio: 'removeSectionAudio',
  // med_tracks（含 chapters[].slots）
  listTracks: 'listTracks',
  getTrack: 'getTrack',
  createTrack: 'createTrack',
  updateTrack: 'updateTrack',
  removeTrack: 'removeTrack'
})

// 需要「后台管理员」鉴权的 action（＝除缺省 / 非法之外的全部；whoami 只回报不抛）。
const ADMIN_ACTIONS = Object.freeze(
  Object.values(ACTIONS).filter((action) => action !== ACTIONS.whoami)
)

// 重复角色口径 = 后台既有 SYSTEM_ROLE_TAG_NAMES 中的管理档（**不新造第二套角色**）：
// 与 apps/web/src/pages/Partner.jsx 的 `adminAuthorized` 同口径（标签名精确为 超级管理员 / 管理员）。
const ADMIN_ROLE_TAG_NAMES = Object.freeze(['超级管理员', '管理员'])

// 列表上限（防超大响应；后台按需分页）。
const MAX_LIST_PER_REQUEST = 500
// `where in` 分块大小（与既有云函数一致：单次 ≤ 50）。
const MAX_QUERY_BATCH_SIZE = 50

const getString = (value) => (value == null ? '' : String(value))

const isPlainObject = (value) => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && !(value instanceof Date)
)

const buildError = (code, message, details = null) => ({
  ok: false,
  error: code,
  message,
  ...(details && typeof details === 'object' ? { details } : {})
})

// ─── 入参解析 ────────────────────────────────────────────────────────────────

// action 校验：**缺省非法**（写函数缺省无「安全」动作，必须显式指定）。
const resolveAction = (event = {}) => {
  const rawAction = event?.action

  if (rawAction === undefined || rawAction === null || rawAction === '') {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidAction, 'action 必填（写函数无缺省 action）', {
        allowed_actions: Object.values(ACTIONS)
      })
    }
  }

  if (typeof rawAction !== 'string') {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidAction, `action 必须是字符串，收到 ${typeof rawAction}`, {
        received_type: typeof rawAction
      })
    }
  }

  const action = rawAction.trim()
  if (!Object.values(ACTIONS).includes(action)) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidAction, `未知 action：${action}`, {
        allowed_actions: Object.values(ACTIONS)
      })
    }
  }

  return { ok: true, action }
}

// 读取单个文档 id（get* / update* / remove* 用；必填、非空字符串）。
const readRequiredId = (event = {}, key = 'id') => {
  const raw = event?.[key]

  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, error: buildError(ERROR_CODES.invalidParams, `缺少参数：${key}`, { param: key }) }
  }

  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidParams, `${key} 必须是字符串`, { param: key, received_type: typeof raw })
    }
  }

  const value = String(raw).trim()
  if (!value) {
    return { ok: false, error: buildError(ERROR_CODES.invalidParams, `缺少参数：${key}`, { param: key }) }
  }

  return { ok: true, value }
}

// 读取写入载荷（create* / update* 用；必填、普通对象）。
const readRequiredData = (event = {}, key = 'data') => {
  const raw = event?.[key]

  if (raw === undefined || raw === null) {
    return { ok: false, error: buildError(ERROR_CODES.invalidParams, `缺少参数：${key}（对象）`, { param: key }) }
  }

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidParams, `${key} 必须是对象`, { param: key, received_type: Array.isArray(raw) ? 'array' : typeof raw })
    }
  }

  return { ok: true, value: raw }
}

// 读取可选列表上限（正整数，封顶 MAX_LIST_PER_REQUEST）。
const readOptionalLimit = (event = {}, key = 'limit', fallback = MAX_LIST_PER_REQUEST) => {
  const raw = event?.[key]

  if (raw === undefined || raw === null || raw === '') {
    return fallback
  }

  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    return fallback
  }

  return Math.min(Math.floor(value), MAX_LIST_PER_REQUEST)
}

// ─── 比较口径（R40-⑤ 读回比对用；纯函数） ──────────────────────────────────────

// `Date` 归一为 ISO 字符串；数组 / 普通对象递归；其余原样（数字与字符串**不互相强转**）。
const toComparable = (value) => {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map(toComparable)
  }

  if (value && typeof value === 'object') {
    const out = {}
    Object.keys(value).forEach((key) => { out[key] = toComparable(value[key]) })
    return out
  }

  return value
}

// 键序无关深比较（R40-③：对象数组子文档读回键序会被改写为字典序 ⇒ 必须与键序无关）。
const deepEqualLoose = (left, right) => {
  const a = toComparable(left)
  const b = toComparable(right)

  if (a === b) {
    return true
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }
    return a.every((item, index) => deepEqualLoose(item, b[index]))
  }

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) {
      return false
    }
    return keysA.every((key) => (
      Object.prototype.hasOwnProperty.call(b, key) && deepEqualLoose(a[key], b[key])
    ))
  }

  return false
}

// 从读回文档中取与载荷同键的子集（只比对「本次写入的键」，忽略文档其它既有字段）。
const pickComparableSubset = (document = {}, payload = {}) => {
  const picked = {}
  Object.keys(payload).forEach((key) => {
    picked[key] = document ? document[key] : undefined
  })
  return picked
}

// ─── 删除影响条数（R38-①） ─────────────────────────────────────────────────────
// `deleted` 兼容顶层与 `data.deleted`；非数字 ⇒ 0（调用方据此抛错）。
const resolveDeletedCount = (result) => {
  const raw = result?.deleted ?? result?.data?.deleted
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

// ─── 写入前槽位校验（与 UI 同一份口径，不新造第二套） ──────────────────────────────
// 空 `slots` ⇒ 老语义（R49-③）：不校验、不报错。非法槽位 **显式拒绝、逐项给文案**（R49-② / v4.39）。
const buildSlotValidationMessage = (result = {}) => {
  const errors = Array.isArray(result?.errors) ? result.errors : []

  if (errors.length === 0) {
    return ''
  }

  const lines = errors.map((error) => (
    `· ${error.chapter_label ? `【${error.chapter_label}】` : ''}${error.message}`
  ))

  return `槽位配置有 ${errors.length} 处错误，已阻止保存：\n${lines.join('\n')}`
}

const isBlank = (value) => value == null || String(value).trim() === ''

const validateMeditationTrackSlots = ({
  chapters = [],
  chapterTemplate = MEDITATION_TRACK_CHAPTER_TEMPLATE
} = {}) => {
  const errors = []
  const chapterList = Array.isArray(chapters) ? chapters : []
  const template = Array.isArray(chapterTemplate) && chapterTemplate.length
    ? chapterTemplate
    : MEDITATION_TRACK_CHAPTER_TEMPLATE
  const policyValues = Object.values(MEDITATION_TRACK_SLOT_POLICIES)
  const selectorKindValues = Object.values(MEDITATION_TRACK_SLOT_SELECTOR_KINDS)

  chapterList.forEach((chapter) => {
    const slots = Array.isArray(chapter?.slots) ? chapter.slots : []

    if (slots.length === 0) {
      return
    }

    const chapterKey = chapter?.chapter_key || ''
    const templateChapter = template.find((item) => item.chapter_key === chapterKey)
    const chapterLabel = templateChapter?.label || chapter?.label || chapterKey
    // v4.39：槽位 `section_type` 取值域＝该槽位所在章的「章模板 section_types」；越界 ⇒ 显式拒绝。
    const allowedSectionTypes = templateChapter ? [...templateChapter.section_types] : []
    const seenSlotIndexes = new Set()
    let previousSlotIndex = -Infinity

    slots.forEach((slot, index) => {
      const push = (code, message) => errors.push({
        chapter_key: chapterKey,
        chapter_label: chapterLabel,
        slot_index: slot?.slot_index,
        index,
        code,
        message
      })
      const position = `第 ${index + 1} 槽`

      const rawSlotIndex = Number(slot?.slot_index)
      if (!Number.isInteger(rawSlotIndex) || rawSlotIndex < 0) {
        push('SLOT_INDEX_INVALID', `${position}的 slot_index 非法（须为非负整数）`)
      } else {
        if (seenSlotIndexes.has(rawSlotIndex)) {
          push('SLOT_INDEX_DUPLICATE', `${position}的 slot_index ${rawSlotIndex} 在同章内重复（须唯一）`)
        }
        seenSlotIndexes.add(rawSlotIndex)
        if (rawSlotIndex <= previousSlotIndex) {
          push('SLOT_INDEX_UNORDERED', `${position}的 slot_index ${rawSlotIndex} 未按序递增（须有序）`)
        }
        previousSlotIndex = rawSlotIndex
      }

      const declaredSectionType = isBlank(slot?.section_type) ? '' : String(slot.section_type).trim()
      const normalizedSectionType = normalizeMeditationSectionCode(declaredSectionType)
      if (!declaredSectionType) {
        push('SECTION_TYPE_EMPTY', `${position}未设置段类型（无推荐映射，不得写空）`)
      } else if (!allowedSectionTypes.includes(normalizedSectionType)) {
        push(
          'SECTION_TYPE_OUT_OF_RANGE',
          `${position}的段类型「${declaredSectionType}」不属于本章允许范围（${allowedSectionTypes.join(' / ') || '无'}）`
        )
      }

      const selector = slot?.selector
      if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
        push('SELECTOR_INVALID', `${position}未选择选择器类型（须 pinned 或 pool）`)
      } else {
        const kind = isBlank(selector.kind) ? '' : String(selector.kind).trim()
        if (!selectorKindValues.includes(kind)) {
          push('SELECTOR_INVALID', `${position}的选择器类型「${selector.kind ?? ''}」非法（须 pinned 或 pool）`)
        } else if (kind === MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pinned && isBlank(selector.audio_id)) {
          push('PINNED_AUDIO_EMPTY', `${position}为 pinned 但未选择具体音频`)
        } else if (kind === MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pool && isBlank(selector.section_type)) {
          push('POOL_SECTION_TYPE_EMPTY', `${position}为 pool 但未设置抽签段类型`)
        }
      }

      const policy = isBlank(slot?.policy) ? '' : String(slot.policy).trim()
      if (!policyValues.includes(policy)) {
        push('POLICY_INVALID', `${position}的策略「${slot?.policy ?? ''}」非法（须 ${policyValues.join(' 或 ')}）`)
      }
    })
  })

  return { ok: errors.length === 0, errors, errorCount: errors.length }
}

// ─── 各集合的写入载荷组装（与后台 database.js 的 create / update 同口径） ─────────────
// 口径：① 先铺默认值（与写侧同字面），② 再 `...data` 覆盖（与 database.js 一致，调用方给什么写什么），
//       ③ create 补 `created_at` / `updated_at`；update 补 `updated_at`（Track 另 +1 version）。

const buildParagraphCreatePayload = (data = {}, nowIso = '') => ({
  text: data?.text || '',
  tags: Array.isArray(data?.tags) ? data.tags : [],
  category: data?.category || '',
  paragraph_type: data?.paragraph_type || MEDITATION_PARAGRAPH_TYPE_ORDER[0],
  usage_count: typeof data?.usage_count === 'number' ? data.usage_count : 0,
  source: data?.source || 'manual',
  ai_rewritten_from: data?.ai_rewritten_from || null,
  created_at: nowIso,
  updated_at: nowIso,
  created_by: data?.created_by || '',
  ...(isPlainObject(data) ? data : {})
})

const buildParagraphUpdatePayload = (data = {}, nowIso = '') => ({
  ...(isPlainObject(data) ? data : {}),
  updated_at: nowIso
})

const buildSectionRawCreatePayload = (data = {}, nowIso = '') => ({
  section_type: data?.section_type || '',
  paragraph_ids: Array.isArray(data?.paragraph_ids) ? data.paragraph_ids : [],
  target_char_count: typeof data?.target_char_count === 'number' ? data.target_char_count : 0,
  current_char_count: typeof data?.current_char_count === 'number' ? data.current_char_count : 0,
  word_count_status: data?.word_count_status || '',
  audio_id: data?.audio_id || '',
  audio_candidates: Array.isArray(data?.audio_candidates) ? data.audio_candidates : [],
  stale: Boolean(data?.stale),
  stale_reason: data?.stale_reason || '',
  stale_paragraph_ids: Array.isArray(data?.stale_paragraph_ids) ? data.stale_paragraph_ids : [],
  stale_at: data?.stale_at || '',
  text_snapshot: data?.text_snapshot || '',
  record_granularity: data?.record_granularity || 'paragraph',
  recorded_at: data?.recorded_at || '',
  created_at: nowIso,
  updated_at: nowIso,
  created_by: data?.created_by || '',
  ...(isPlainObject(data) ? data : {})
})

const buildSectionRawUpdatePayload = (data = {}, nowIso = '') => ({
  ...(isPlainObject(data) ? data : {}),
  updated_at: nowIso
})

// med_section_audios 字段白名单（对齐 `toMedSectionAudioPayload`）：调用方传入的未知键**不落库**，
// 避免把服务端字段（`mix_audio` / 转码产物）从后台误写。
const MEDITATION_SECTION_AUDIO_WRITABLE_KEYS = Object.freeze([
  'section_raw_id', 'section_type', 'file_id', 'audio_url', 'duration', 'mime_type',
  'transcoded_formats', 'fallback_file_id', 'fallback_audio_url', 'fallback_mime_type',
  'label', 'original_file_id', 'original_url', 'original_mime_type', 'target_format',
  'transcode_status', 'transcode_error', 'source_kind', 'paragraph_ids_snapshot',
  'text_snapshot', 'char_count', 'stale', 'recorded_by', 'source_size'
])

const pickWritableAudioKeys = (data = {}) => {
  const picked = {}
  MEDITATION_SECTION_AUDIO_WRITABLE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      picked[key] = data[key]
    }
  })
  return picked
}

const buildSectionAudioCreatePayload = (data = {}, nowIso = '') => {
  const picked = pickWritableAudioKeys(data)
  const sourceSize = Number(picked.source_size)
  const hasSourceSize = Number.isFinite(sourceSize) && sourceSize >= 0

  const payload = {
    section_raw_id: picked.section_raw_id || '',
    section_type: picked.section_type || '',
    file_id: picked.file_id || '',
    audio_url: picked.audio_url || '',
    duration: Number(picked.duration ?? 0),
    mime_type: picked.mime_type || '',
    transcoded_formats: normalizeMeditationTranscodedFormats(picked.transcoded_formats),
    fallback_file_id: picked.fallback_file_id || '',
    fallback_audio_url: picked.fallback_audio_url || '',
    fallback_mime_type: picked.fallback_mime_type || '',
    label: picked.label || '',
    original_file_id: picked.original_file_id || '',
    original_url: picked.original_url || '',
    original_mime_type: picked.original_mime_type || '',
    target_format: picked.target_format || 'opus',
    transcode_status: picked.transcode_status || MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.idle,
    transcode_error: picked.transcode_error || '',
    source_kind: picked.source_kind || 'recording',
    paragraph_ids_snapshot: Array.isArray(picked.paragraph_ids_snapshot) ? picked.paragraph_ids_snapshot : [],
    text_snapshot: picked.text_snapshot || '',
    char_count: Number(picked.char_count ?? 0),
    stale: Boolean(picked.stale),
    recorded_by: picked.recorded_by || '',
    ...(hasSourceSize ? { source_size: Math.round(sourceSize) } : {}),
    created_at: nowIso,
    updated_at: nowIso
  }

  return payload
}

const buildSectionAudioUpdatePayload = (data = {}, nowIso = '') => {
  const picked = pickWritableAudioKeys(data)
  const sourceSize = Number(picked.source_size)
  const hasSourceSize = Number.isFinite(sourceSize) && sourceSize >= 0
  const payload = { ...picked }

  if (hasSourceSize) {
    payload.source_size = Math.round(sourceSize)
  } else {
    delete payload.source_size
  }

  return { ...payload, updated_at: nowIso }
}

const buildTrackCreatePayload = (data = {}, nowIso = '') => {
  const trackPayload = toMedTrackPayload(data)

  return {
    ...trackPayload,
    // 新建 Track 版本从 1 开始（version 递增只在保存路径发生，与 database.js 一致）。
    version: 1,
    created_at: nowIso,
    updated_at: nowIso,
    created_by: data?.created_by || ''
  }
}

const buildTrackUpdatePayload = (data = {}, nowIso = '') => {
  const trackPayload = toMedTrackPayload(data)

  return {
    ...trackPayload,
    // 版本推进：每次保存 version +1（D7 可复现追溯以版本号为准）。
    version: trackPayload.version + 1,
    updated_at: nowIso
  }
}

module.exports = {
  COLLECTIONS,
  ERROR_CODES,
  ACTIONS,
  ADMIN_ACTIONS,
  ADMIN_ROLE_TAG_NAMES,
  MAX_LIST_PER_REQUEST,
  MAX_QUERY_BATCH_SIZE,
  MEDITATION_SECTION_AUDIO_WRITABLE_KEYS,
  getString,
  isPlainObject,
  buildError,
  resolveAction,
  readRequiredId,
  readRequiredData,
  readOptionalLimit,
  toComparable,
  deepEqualLoose,
  pickComparableSubset,
  resolveDeletedCount,
  buildSlotValidationMessage,
  validateMeditationTrackSlots,
  buildParagraphCreatePayload,
  buildParagraphUpdatePayload,
  buildSectionRawCreatePayload,
  buildSectionRawUpdatePayload,
  buildSectionAudioCreatePayload,
  buildSectionAudioUpdatePayload,
  buildTrackCreatePayload,
  buildTrackUpdatePayload
}
