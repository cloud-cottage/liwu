// ─── 只读云函数（meditation-read）的入参 / 出参契约（纯函数，无 IO，可用桩对象直接单测） ──
//
// 规范依据：docs/meditation.admin.partner.spec.md v4.6
//   - §5 / §7（D6 / R30）：端侧读 Track 与 Section 音频**唯一通道**；本函数只读、只下发**可交付**内容。
//   - 「交付格式与 C 端兜底策略」（D3）：只有 `transcoded_formats` **同时含 opus 与 mp3** 才算交付完成
//     （只有 ['opus'] 视为**未完成交付**）⇒ 未完成 / 转码中的音频**不得下发**。
//   - 附录 C / C11 ＋ 质检计划 §8.1 / X14：`audio_url` 是 2 小时临时 URL ⇒ 本函数必须承担
//     `file_id` → 临时 URL 的重新签发；**不得透传已落库的（可能已过期的）audio_url**。
//   - R10：章序 / 章内 Section 序列只读 ⇒ 返回的 Track 一律折回六章固定模板（见 meditation-track-normalizers.js）。
//   - D9 / D7：端侧「拉 Track 配置 → 按 section_type 从候选池抽一条 → 拼接」，抽中固化在**端侧会话记录**中
//     ⇒ 本函数只负责**按 section_type 分组的候选池**，不做抽签、不写会话记录。
//
// 设计口径（本函数自有，规范未逐字规定，报告里已列为假设）：
//   ① 错误一律**结构化返回**（`{ ok:false, error:<CODE>, message }`），不抛未捕获异常；
//   ② **不返回部分数据当成功**——查询失败 / 签发失败（批次整体失败）一律整单报错；
//   ③ 下发字段做**最小化白名单**（只给播放所需），不带任何后台管理字段（录制人、文本快照、转码错误等）；
//   ④ `getSectionAudios` 的每个 `section_type` 候选**上限** MAX_CANDIDATES_PER_SECTION_TYPE，截断情况如实回报。

const {
  MEDITATION_SECTION_AUDIO_FORMATS,
  MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE,
  MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS,
  MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS,
  resolveMeditationSectionAudioTranscodedFormats
} = require('./meditation-formats.js')

const {
  MEDITATION_SECTION_TYPE_ORDER,
  MEDITATION_SECTION_TYPE_LABELS,
  MEDITATION_TRACK_CHAPTER_TEMPLATE,
  MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
  isMeditationSectionType
} = require('./meditation-track-template.js')

// 结构化错误码（调用方按 code 分支，不解析 message）。
const ERROR_CODES = Object.freeze({
  invalidEvent: 'INVALID_EVENT',
  invalidAction: 'INVALID_ACTION',
  invalidParams: 'INVALID_PARAMS',
  trackNotFound: 'TRACK_NOT_FOUND',
  trackDisabled: 'TRACK_DISABLED',
  readFailed: 'READ_FAILED'
})

const ACTIONS = Object.freeze({
  getTrack: 'getTrack',
  getSectionAudios: 'getSectionAudios',
  listTracks: 'listTracks'
})

// 默认 action：端侧主路径（读默认 Track 及其可交付音频池）。
const DEFAULT_ACTION = ACTIONS.getTrack

// 单个 section_type 最多下发多少条候选（端侧只抽一条，池子无需更大）。
const MAX_CANDIDATES_PER_SECTION_TYPE = 10
// 单次查询单个 section_type 的最多取样条数（用于过滤「未完成交付」后再截断）。
const MAX_QUERY_PER_SECTION_TYPE = 50
// 同一次调用最多查询多少个 section_type（= 模板 Section 总数，防超大请求）。
const MAX_SECTION_TYPES_PER_REQUEST = MEDITATION_SECTION_TYPE_ORDER.length
// listTracks 最多返回多少个 Track。
const MAX_TRACKS_PER_REQUEST = 20

// 临时链接有效期（秒）：**必须与规范 C11 的 `maxAge = 7200` 一致**（2 小时）。
const TEMP_URL_MAX_AGE_SECONDS = 7200

const getString = (value) => (value == null ? '' : String(value))

const buildError = (code, message, details = null) => ({
  ok: false,
  error: code,
  message,
  ...(details && typeof details === 'object' ? { details } : {})
})

// ─── 入参校验 ────────────────────────────────────────────────────────────────

const resolveAction = (event = {}) => {
  const rawAction = event?.action

  // 缺省 action 合法（= getTrack）；**存在但不是非空字符串**一律非法（不做隐式转换）。
  if (rawAction === undefined || rawAction === null || rawAction === '') {
    return { ok: true, action: DEFAULT_ACTION }
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

const readOptionalIdentifier = (event = {}, key = '') => {
  const value = event?.[key]

  if (value === undefined || value === null || value === '') {
    return { ok: true, value: '' }
  }

  if (typeof value !== 'string') {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidParams, `${key} 必须是字符串`, { param: key, received_type: typeof value })
    }
  }

  return { ok: true, value: value.trim() }
}

// section_types / section_type 归一化：→ 去重后的有序数组（按模板顺序）。
const resolveRequestedSectionTypes = (event = {}, { required = false } = {}) => {
  const hasList = event?.section_types !== undefined && event?.section_types !== null
  const hasSingle = event?.section_type !== undefined && event?.section_type !== null && event?.section_type !== ''
  const rawValues = hasList ? event.section_types : (hasSingle ? [event.section_type] : [])

  if (hasList && !Array.isArray(event.section_types)) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidParams, 'section_types 必须是字符串数组', {
        param: 'section_types',
        received_type: typeof event.section_types
      })
    }
  }

  if (hasSingle && typeof event.section_type !== 'string') {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidParams, 'section_type 必须是字符串', {
        param: 'section_type',
        received_type: typeof event.section_type
      })
    }
  }

  const requested = (Array.isArray(rawValues) ? rawValues : [])
    .map((value) => getString(value).trim())
    .filter(Boolean)

  if (required && requested.length === 0) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidParams, '缺少参数：section_types（或 section_type）', {
        param: 'section_types'
      })
    }
  }

  const unknownTypes = [...new Set(requested)].filter((sectionType) => !isMeditationSectionType(sectionType))
  if (unknownTypes.length > 0) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidParams, `未知 section_type：${unknownTypes.join(', ')}`, {
        param: 'section_types',
        unknown_section_types: unknownTypes,
        allowed_section_types: [...MEDITATION_SECTION_TYPE_ORDER]
      })
    }
  }

  const unique = [...new Set(requested)]

  if (unique.length > MAX_SECTION_TYPES_PER_REQUEST) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidParams, `section_types 数量超限（${unique.length}）`, {
        param: 'section_types',
        max: MAX_SECTION_TYPES_PER_REQUEST
      })
    }
  }

  // 按模板顺序输出（与 §med_tracks 的固定序列一致）。
  return {
    ok: true,
    value: MEDITATION_SECTION_TYPE_ORDER.filter((sectionType) => unique.includes(sectionType))
  }
}

// ─── 可交付判定（核心硬口径） ─────────────────────────────────────────────────

// 交付双格式对应的 file_id（读路径兼容历史 mp3_file_id；写侧只写 fallback_file_id）。
const resolveSectionAudioFileIds = (audio = {}) => ({
  [MEDITATION_SECTION_AUDIO_FORMATS.opus]: getString(audio.file_id).trim(),
  [MEDITATION_SECTION_AUDIO_FORMATS.mp3]: getString(audio.fallback_file_id || audio.mp3_file_id).trim()
})

// 是否可下发。**不得下发**的情形：交付不齐 / 转码中 / 转码失败 / 缺 file_id（无法重新签发临时链接）。
const resolveSectionAudioDeliverability = (audio = {}) => {
  const deliveredFormats = resolveMeditationSectionAudioTranscodedFormats(audio)
  const missingFormats = MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS
    .filter((format) => !deliveredFormats.includes(format))

  if (missingFormats.length > 0) {
    return { deliverable: false, reason: 'incomplete_transcode', missing_formats: missingFormats }
  }

  const status = getString(audio.transcode_status).trim()
  if (status === MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.failed) {
    return { deliverable: false, reason: 'transcode_failed' }
  }

  if (
    status === MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.queued
    || status === MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.processing
  ) {
    return { deliverable: false, reason: 'transcode_in_progress' }
  }

  const fileIds = resolveSectionAudioFileIds(audio)
  const missingFileIdFormats = MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS.filter((format) => !fileIds[format])
  if (missingFileIdFormats.length > 0) {
    return { deliverable: false, reason: 'missing_file_id', missing_formats: missingFileIdFormats }
  }

  return { deliverable: true, reason: '', file_ids: fileIds, transcoded_formats: deliveredFormats }
}

// 出参裁剪（最小化白名单）：只给端侧播放与计划所需字段，不含任何后台管理字段。
const buildSectionAudioEntry = ({ audio = {}, sectionType = '', urls = {} }) => ({
  _id: getString(audio._id || audio.id).trim(),
  section_type: sectionType || getString(audio.section_type).trim(),
  section_raw_id: getString(audio.section_raw_id).trim(),
  label: getString(audio.label),
  duration: Number(audio.duration) > 0 ? Number(audio.duration) : 0,
  transcoded_formats: resolveMeditationSectionAudioTranscodedFormats(audio),
  formats: [
    {
      format: MEDITATION_SECTION_AUDIO_FORMATS.opus,
      url: getString(urls[MEDITATION_SECTION_AUDIO_FORMATS.opus]),
      mime_type: MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE.opus,
      is_fallback: false
    },
    {
      format: MEDITATION_SECTION_AUDIO_FORMATS.mp3,
      url: getString(urls[MEDITATION_SECTION_AUDIO_FORMATS.mp3]),
      mime_type: MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE.mp3,
      is_fallback: true
    }
  ]
})

const buildTrackEntry = (track = {}) => ({
  _id: getString(track._id || track.id).trim(),
  track_key: getString(track.track_key),
  name: getString(track.name),
  description: getString(track.description),
  enabled: track.enabled !== false,
  is_default: track.is_default !== false,
  version: Number(track.version) > 0 ? Number(track.version) : 1,
  total_target_seconds: Number(track.total_target_seconds) > 0 ? Number(track.total_target_seconds) : 0,
  chapters: Array.isArray(track.chapters) ? track.chapters : [],
  background_track: track.background_track || null,
  voice_track: track.voice_track || null
})

// 六章固定模板（端侧按此顺序拼接；章序 / 章内序列只读，R10）。
// 内容源＝代码常量（R21：章名 / Section 名的源是代码常量），端侧**不得**用数据覆盖顺序。
const buildChapterTemplate = () => MEDITATION_TRACK_CHAPTER_TEMPLATE.map((chapter, index) => ({
  chapter_key: chapter.chapter_key,
  order: chapter.order,
  label: chapter.label,
  enabled_by_default: true,
  max_duration_seconds: chapter.max_duration_seconds,
  // 章间留白默认值（末章固定 0；实际生效值以 Track 的 chapters[].gap_after_seconds 为准）。
  gap_after_seconds_default: index === MEDITATION_TRACK_CHAPTER_TEMPLATE.length - 1
    ? 0
    : MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
  section_types: [...chapter.section_types],
  section_labels: Object.fromEntries(
    chapter.section_types.map((sectionType) => [sectionType, MEDITATION_SECTION_TYPE_LABELS[sectionType] || ''])
  )
}))

// 该 Track 启用章覆盖的 section_type（禁用章不下发其音频）。
const resolveTrackSectionTypes = (track = {}) => {
  const chapters = Array.isArray(track.chapters) ? track.chapters : []

  return MEDITATION_SECTION_TYPE_ORDER.filter((sectionType) => chapters.some((chapter) => (
    chapter?.enabled !== false && Array.isArray(chapter?.section_types) && chapter.section_types.includes(sectionType)
  )))
}

// 缺省 Track 解析顺序：显式 track_id → 显式 track_key → `is_default` → 业务键 `track-default`。
const resolveTrackQueryPlan = ({ trackId = '', trackKey = '', defaultKey = 'track-default' } = {}) => {
  if (trackId) {
    return [{ kind: 'id', value: trackId }]
  }

  if (trackKey) {
    return [{ kind: 'key', value: trackKey }]
  }

  return [
    { kind: 'default', value: 'is_default' },
    { kind: 'key', value: defaultKey }
  ]
}

// 空池补位：模板里的每个 section_type 都出现（端侧无需判 undefined）。
const buildSectionAudioPools = ({ requestedSectionTypes = [], candidates = [], urls = new Map() } = {}) => {
  const pools = {}
  const excluded = {
    incomplete_transcode: 0,
    transcode_failed: 0,
    transcode_in_progress: 0,
    missing_file_id: 0,
    signing_failed: 0
  }
  const truncatedSectionTypes = []
  let deliveredAudioCount = 0

  requestedSectionTypes.forEach((sectionType) => {
    const sectionCandidates = candidates.filter((audio) => getString(audio?.section_type).trim() === sectionType)
    const deliverableEntries = []
    let accepted = 0

    sectionCandidates.forEach((audio) => {
      const assessment = resolveSectionAudioDeliverability(audio)
      if (!assessment.deliverable) {
        excluded[assessment.reason] = (excluded[assessment.reason] || 0) + 1
        return
      }

      const urlsById = urls instanceof Map ? urls : new Map()
      const opusUrl = getString(urlsById.get(assessment.file_ids[MEDITATION_SECTION_AUDIO_FORMATS.opus])).trim()
      const mp3Url = getString(urlsById.get(assessment.file_ids[MEDITATION_SECTION_AUDIO_FORMATS.mp3])).trim()

      // 签发结果缺失（fileList 未回该 fileID） ⇒ 该条不可下发（**不得**下发半条音频）。
      if (!opusUrl || !mp3Url) {
        excluded.signing_failed += 1
        return
      }

      if (accepted >= MAX_CANDIDATES_PER_SECTION_TYPE) {
        if (!truncatedSectionTypes.includes(sectionType)) {
          truncatedSectionTypes.push(sectionType)
        }
        return
      }

      accepted += 1
      deliveredAudioCount += 1
      deliverableEntries.push(buildSectionAudioEntry({
        audio,
        sectionType,
        urls: {
          [MEDITATION_SECTION_AUDIO_FORMATS.opus]: opusUrl,
          [MEDITATION_SECTION_AUDIO_FORMATS.mp3]: mp3Url
        }
      }))
    })

    pools[sectionType] = deliverableEntries
  })

  return {
    pools,
    stats: {
      delivered_audio_count: deliveredAudioCount,
      excluded_audio_count: Object.values(excluded).reduce((sum, count) => sum + count, 0),
      excluded,
      truncated_section_types: truncatedSectionTypes
    }
  }
}

// 待签发链接的 file_id（只含**可交付**的音频；去重后一次批量签发）。
const collectSignableFileIds = (candidates = []) => {
  const fileIds = []

  candidates.forEach((audio) => {
    const assessment = resolveSectionAudioDeliverability(audio)
    if (!assessment.deliverable) {
      return
    }

    MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS.forEach((format) => {
      const fileId = assessment.file_ids[format]
      if (fileId && !fileIds.includes(fileId)) {
        fileIds.push(fileId)
      }
    })
  })

  return fileIds
}

// 临时链接策略：`maxAge` 与规范一致（7200s），端侧按 expires_at 到期重签（不得缓存过期 URL）。
const buildUrlPolicy = ({ issuedAtMs = Date.now(), maxAgeSeconds = TEMP_URL_MAX_AGE_SECONDS } = {}) => ({
  max_age_seconds: maxAgeSeconds,
  issued_at: new Date(issuedAtMs).toISOString(),
  expires_at: new Date(issuedAtMs + (Number(maxAgeSeconds) || 0) * 1000).toISOString(),
  reissue: 'call_again'
})

module.exports = {
  ERROR_CODES,
  ACTIONS,
  DEFAULT_ACTION,
  MAX_CANDIDATES_PER_SECTION_TYPE,
  MAX_QUERY_PER_SECTION_TYPE,
  MAX_SECTION_TYPES_PER_REQUEST,
  MAX_TRACKS_PER_REQUEST,
  TEMP_URL_MAX_AGE_SECONDS,
  getString,
  buildError,
  resolveAction,
  readOptionalIdentifier,
  resolveRequestedSectionTypes,
  resolveSectionAudioFileIds,
  resolveSectionAudioDeliverability,
  buildSectionAudioEntry,
  buildTrackEntry,
  buildChapterTemplate,
  resolveTrackSectionTypes,
  resolveTrackQueryPlan,
  buildSectionAudioPools,
  collectSignableFileIds,
  buildUrlPolicy
}
