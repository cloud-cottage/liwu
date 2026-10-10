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
  MEDITATION_TRACK_CHAPTER_TEMPLATE,
  MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
  getMeditationSectionDisplayLabel,
  isMeditationSectionType,
  normalizeMeditationSectionCode
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
  listTracks: 'listTracks',
  // ── R51（v4.34）新增能力：池元数据下发 ＋ 按 audio_id 批量现签（登记附录 C / C35 · C44） ──
  // 只增不改：既有三个 action 的入参 / 出参 / 行为一律不变。
  getPools: 'getPools',
  signAudios: 'signAudios'
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

// ─── R51（v4.34）新增能力的上限常量（登记附录 C / C35 · C44；改这些数 = 改口径，先读 R51） ──
//
// ① 池元数据（getPools）单次**每个 section_type** 最多下发多少条**元数据条目**。
//    取值理由 = 收敛 R39-⑨「查询 50 / 下发 10」的现有口径：池要覆盖「同类型更多段落」
//    （组合化后同 section_type 会有多段），故比 getSectionAudios 的 10 条宽；但又必须远小于
//    查询窗口 50（否则响应体随库规模爆炸）。取 20 = 10 的 2 倍、仍 < 50 ⇒ 登记到 C35。
const MAX_POOL_CANDIDATES_PER_SECTION_TYPE = 20
// ② 单次 getTempFileURL 现签的 fileID 硬上限（R51-②；实测 51 即报
//    INVALID_PARAM Cannot operate more than 50 files one time ⇒ 超过必须分批、逐批 ≤ 50）。
const MAX_TEMP_URL_BATCH_SIZE = 50
// ③ signAudios 单次请求允许的最大分批数（4 批 × 单批 50 = 单次最多 200 个 audio_id）。
//    超出**报显式错误**（INVALID_PARAMS），**不得静默截断**（对齐 R39-③ 不返回部分数据当成功）。
const MAX_SIGN_BATCH_COUNT = 4
const MAX_SIGN_AUDIO_IDS_PER_REQUEST = MAX_TEMP_URL_BATCH_SIZE * MAX_SIGN_BATCH_COUNT
// ④ 原始上载前缀（R51-④）：端侧可签性地图实测 0/32 不可签 ⇒ 新动作一律不签该前缀对象。
const MEDITATION_SECTION_AUDIO_RAW_PREFIX = 'meditation-audio-raw/'

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

  // 读侧归一：库/端侧传来的旧 `sec-*` 码一律归一到新代号（写侧只写新值）。
  const requested = (Array.isArray(rawValues) ? rawValues : [])
    .map((value) => normalizeMeditationSectionCode(getString(value)))
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
  // 段码一律出新值：调用方给的（已归一的）段码优先，缺省时把库中段码归一再输出。
  section_type: sectionType || normalizeMeditationSectionCode(getString(audio.section_type)),
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
  // ⚠ `mix_audio` **不在本函数内**（R45-⑤）：它的两个链接必须**现签**，而 `listTracks`
  //   按口径「不签发链接、不读音频集合」⇒ 只有 `getTrack` 在签发之后才挂上该键
  //   （见 `buildTrackMixAudioEntry` 与 index.js 的 handleGetTrack）。
})

// ─── Track 级混音产物（R45-⑤：D6 下发 `mix_audio`；**file_id 仍不下发**） ─────────────
//
// 库内形状（写侧＝cloudfunctions/meditation-transcoder，落 `med_tracks.mix_audio`）：
//   { version, duration, ogg_file_id, mp3_file_id } —— **逐字 4 键、整体覆盖写**。
// 下发形状（本文件）：`mix_audio = { version, duration, ogg_url, mp3_url }` —— 两个 `*_file_id`
//   一律换成**现签临时链接**（与 section_audio 的 `formats[].url` 同一签发机制 / 同一次批量签发 /
//   同一 `maxAge`）；**长期标识绝不下发**（R46-⑥ 白名单增量：`ogg_file_id` / `mp3_file_id` 禁发）。
//
// 混音产物**不是**逐条音频的可交付判定（那是 R39-④：`transcoded_formats` 双格式 ＋ file_id 齐备）：
// 它本身就是交付产物 ⇒ 判据＝① `mix_audio` 存在且为对象、② `version` 为正整数、③ `duration > 0`、
// ④ 两个 `*_file_id` 非空、⑤ 两个链接**都签发成功**。任一不满足 ⇒ **不下发 `mix_audio` 键**
// （**不返回半条混音**，对齐 R39-⑤；端侧据此回退双轨，见 packages/shared-utils/meditation-track-playback-plan.js）。
const MEDITATION_TRACK_MIX_AUDIO_KEYS = Object.freeze({
  version: 'version',
  duration: 'duration',
  oggUrl: 'ogg_url',
  mp3Url: 'mp3_url'
})

// 库内 `mix_audio` 的源键名（写侧落库口径，读侧原样取；**不下发**）。
const MEDITATION_TRACK_MIX_AUDIO_SOURCE_KEYS = Object.freeze({
  version: 'version',
  duration: 'duration',
  oggFileId: 'ogg_file_id',
  mp3FileId: 'mp3_file_id'
})

const roundHundredths = (value) => Math.round((Number(value) || 0) * 100) / 100

// 待签发链接的混音 file_id（顺序＝opus / mp3；缺项一律过滤 ⇒ 不齐时后续判据会拒绝下发）。
const collectTrackMixAudioFileIds = (track = {}) => {
  const mixAudio = track?.mix_audio

  if (!mixAudio || typeof mixAudio !== 'object' || Array.isArray(mixAudio)) {
    return []
  }

  return [
    getString(mixAudio[MEDITATION_TRACK_MIX_AUDIO_SOURCE_KEYS.oggFileId]).trim(),
    getString(mixAudio[MEDITATION_TRACK_MIX_AUDIO_SOURCE_KEYS.mp3FileId]).trim()
  ].filter(Boolean)
}

const resolveTrackMixAudioDeliverability = ({ track = {}, urls = new Map() } = {}) => {
  const mixAudio = track?.mix_audio

  if (!mixAudio || typeof mixAudio !== 'object' || Array.isArray(mixAudio)) {
    return { deliverable: false, reason: 'missing_mix_audio' }
  }

  const version = Number(mixAudio[MEDITATION_TRACK_MIX_AUDIO_SOURCE_KEYS.version])
  if (!Number.isFinite(version) || version <= 0) {
    return { deliverable: false, reason: 'missing_mix_version' }
  }

  const duration = Number(mixAudio[MEDITATION_TRACK_MIX_AUDIO_SOURCE_KEYS.duration])
  if (!Number.isFinite(duration) || duration <= 0) {
    return { deliverable: false, reason: 'missing_mix_duration' }
  }

  const oggFileId = getString(mixAudio[MEDITATION_TRACK_MIX_AUDIO_SOURCE_KEYS.oggFileId]).trim()
  const mp3FileId = getString(mixAudio[MEDITATION_TRACK_MIX_AUDIO_SOURCE_KEYS.mp3FileId]).trim()
  if (!oggFileId || !mp3FileId) {
    return { deliverable: false, reason: 'missing_mix_file_id' }
  }

  const urlMap = urls instanceof Map ? urls : new Map()
  const oggUrl = getString(urlMap.get(oggFileId)).trim()
  const mp3Url = getString(urlMap.get(mp3FileId)).trim()
  if (!oggUrl || !mp3Url) {
    return { deliverable: false, reason: 'signing_failed' }
  }

  return {
    deliverable: true,
    reason: '',
    version: Math.max(1, Math.floor(version)),
    duration: roundHundredths(duration),
    file_ids: { [MEDITATION_SECTION_AUDIO_FORMATS.opus]: oggFileId, [MEDITATION_SECTION_AUDIO_FORMATS.mp3]: mp3FileId },
    urls: {
      [MEDITATION_TRACK_MIX_AUDIO_KEYS.oggUrl]: oggUrl,
      [MEDITATION_TRACK_MIX_AUDIO_KEYS.mp3Url]: mp3Url
    }
  }
}

// 出参（最小化白名单，**逐字 4 键**）：`version` / `duration` / `ogg_url` / `mp3_url`。
// 不可交付（缺失 / 不齐 / 签发失败）⇒ **返回 null**（调用方不下发该键；端侧回退双轨）。
const buildTrackMixAudioEntry = ({ track = {}, urls = new Map() } = {}) => {
  const assessment = resolveTrackMixAudioDeliverability({ track, urls })

  if (!assessment.deliverable) {
    return null
  }

  return {
    [MEDITATION_TRACK_MIX_AUDIO_KEYS.version]: assessment.version,
    [MEDITATION_TRACK_MIX_AUDIO_KEYS.duration]: assessment.duration,
    [MEDITATION_TRACK_MIX_AUDIO_KEYS.oggUrl]: assessment.urls[MEDITATION_TRACK_MIX_AUDIO_KEYS.oggUrl],
    [MEDITATION_TRACK_MIX_AUDIO_KEYS.mp3Url]: assessment.urls[MEDITATION_TRACK_MIX_AUDIO_KEYS.mp3Url]
  }
}

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
    // 上屏标签＝「中文名｜英文名」（共享 display helper 拼写；背景两轨英文名空缺 ⇒ 只出中文名，不自拟）。
    // 一律先归一：库里的旧码行也能出中文名（不得显示为原始代码或空白）。
    chapter.section_types.map((sectionType) => [
      sectionType,
      getMeditationSectionDisplayLabel(sectionType)
    ])
  )
}))

// 该 Track 启用章覆盖的 section_type（禁用章不下发其音频）。
const resolveTrackSectionTypes = (track = {}) => {
  const chapters = Array.isArray(track.chapters) ? track.chapters : []

  return MEDITATION_SECTION_TYPE_ORDER.filter((sectionType) => chapters.some((chapter) => (
    chapter?.enabled !== false
    && Array.isArray(chapter?.section_types)
    // 读侧归一：库中旧码也要能与新代号模板序列对上。
    && chapter.section_types.map((value) => normalizeMeditationSectionCode(value)).includes(sectionType)
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
    // 读侧归一：库中 `med_section_audios.section_type` 为旧 `sec-*` 码时也要能落进新代号候选池。
    const sectionCandidates = candidates.filter((audio) => (
      normalizeMeditationSectionCode(getString(audio?.section_type)) === sectionType
    ))
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

// ─── R51 新增能力：池元数据下发（getPools）＋ 批量现签出参（signAudios）的**纯函数** ──────
//     （无 IO；查询与现签在 index.js。既有 resolveSectionAudioDeliverability 一字不动。）

// 通用分块（signAudios 的 DB 查询与现签都以 MAX_TEMP_URL_BATCH_SIZE 为块大小）。
const chunkArray = (items = [], size = 1) => {
  const chunkSize = Math.max(1, Math.floor(Number(size) || 1))
  const source = Array.isArray(items) ? items : []
  const chunks = []

  for (let index = 0; index < source.length; index += chunkSize) {
    chunks.push(source.slice(index, index + chunkSize))
  }

  return chunks
}

const isRawUploadFileId = (fileId = '') => getString(fileId).includes(MEDITATION_SECTION_AUDIO_RAW_PREFIX)

// **新增动作共用**的「可交付」判定：先过 R39-④ 判据，再按 R51-④ 排除原始上载前缀对象。
// ⚠ 刻意**不复用 / 不修改** resolveSectionAudioDeliverability，以保证现网 getTrack / getSectionAudios
//   行为逐字不变（硬纪律「只增不改」）。
const resolveNewActionDeliverability = (audio = {}) => {
  const assessment = resolveSectionAudioDeliverability(audio)

  if (!assessment.deliverable) {
    return assessment
  }

  const fileIds = assessment.file_ids || {}
  const rawFormats = MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS.filter((format) => isRawUploadFileId(fileIds[format]))

  if (rawFormats.length > 0) {
    return { deliverable: false, reason: 'raw_prefix_not_signable', raw_formats: rawFormats }
  }

  return assessment
}

// 池元数据条目（R51-①：**只** id / section_type / duration / 标签；**绝不含任何 URL / file_id**）。
const buildPoolMetadataEntry = ({ audio = {}, sectionType = '' } = {}) => ({
  id: getString(audio._id || audio.id).trim(),
  section_type: sectionType || normalizeMeditationSectionCode(getString(audio.section_type)),
  duration: Number(audio.duration) > 0 ? Number(audio.duration) : 0,
  label: getString(audio.label)
})

// 按 section_type 分组的池**元数据**（R51-①）。池 = 候选集（**不按可交付过滤**——可交付过滤发生在
// signAudios；依据 R43-⑤ 的「池空 / 池非空但无可用格式」两分：池本身可含不可用候选）。
// 每个 section_type 截断到 limit（默认 20）并如实回报截断标记（不假装全量，对齐 R39-⑨）。
const buildSectionAudioPoolsMetadata = ({ requestedSectionTypes = [], candidates = [], limit = MAX_POOL_CANDIDATES_PER_SECTION_TYPE } = {}) => {
  const pools = {}
  const countBySectionType = {}
  const truncatedSectionTypes = []
  const source = Array.isArray(candidates) ? candidates : []
  let totalEntryCount = 0

  requestedSectionTypes.forEach((sectionType) => {
    // 读侧归一：库中 `sec-*` 旧码也要能落进新代号池。
    const sectionCandidates = source.filter((audio) => (
      normalizeMeditationSectionCode(getString(audio?.section_type)) === sectionType
    ))
    const entries = []

    sectionCandidates.forEach((audio) => {
      if (entries.length >= limit) {
        if (!truncatedSectionTypes.includes(sectionType)) {
          truncatedSectionTypes.push(sectionType)
        }
        return
      }

      entries.push(buildPoolMetadataEntry({ audio, sectionType }))
    })

    pools[sectionType] = entries
    countBySectionType[sectionType] = entries.length
    totalEntryCount += entries.length
  })

  return {
    pools,
    stats: {
      total_pool_entry_count: totalEntryCount,
      pool_entry_count_by_section_type: countBySectionType,
      pool_limit_per_section_type: limit,
      truncated_section_types: truncatedSectionTypes,
      truncated: truncatedSectionTypes.length > 0
    }
  }
}

// 入参 `audio_ids`：非空**字符串**数组，去重后返回（**不做隐式转换**，对齐 R39-②；非字符串一律报错）。
// 超上限（> MAX_SIGN_AUDIO_IDS_PER_REQUEST）**报显式错误**，不静默截断。
const readAudioIds = (event = {}) => {
  const raw = event?.audio_ids

  if (!Array.isArray(raw)) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidParams, 'audio_ids 必须是字符串数组', {
        param: 'audio_ids',
        received_type: typeof raw
      })
    }
  }

  const nonString = raw.find((value) => typeof value !== 'string')
  if (nonString !== undefined) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidParams, 'audio_ids 元素必须是字符串', {
        param: 'audio_ids',
        received_type: typeof nonString
      })
    }
  }

  const ids = [...new Set(raw.map((value) => value.trim()).filter(Boolean))]

  if (ids.length === 0) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.invalidParams, '缺少参数：audio_ids（非空字符串数组）', { param: 'audio_ids' })
    }
  }

  if (ids.length > MAX_SIGN_AUDIO_IDS_PER_REQUEST) {
    return {
      ok: false,
      error: buildError(
        ERROR_CODES.invalidParams,
        `audio_ids 数量超限（${ids.length} > ${MAX_SIGN_AUDIO_IDS_PER_REQUEST}）——不静默截断，请分批调用`,
        {
          param: 'audio_ids',
          max: MAX_SIGN_AUDIO_IDS_PER_REQUEST,
          received: ids.length,
          max_batch_count: MAX_SIGN_BATCH_COUNT,
          max_batch_size: MAX_TEMP_URL_BATCH_SIZE
        }
      )
    }
  }

  return { ok: true, value: ids }
}

// signAudios 单条出参（复用 R39-⑥ 音频条目白名单：`_id` / `section_type` / `section_raw_id` /
//   `label` / `duration` / `transcoded_formats` / `formats[]`；**`file_id` 仍不下发**）。
// 不可交付 / 现签结果缺任一条 ⇒ 返回 null（由调用方剔除并计数，**不得下发半条音频**）。
const buildSignedAudioEntry = ({ audio = {}, sectionType = '', urls = new Map() } = {}) => {
  const assessment = resolveNewActionDeliverability(audio)

  if (!assessment.deliverable) {
    return null
  }

  const urlMap = urls instanceof Map ? urls : new Map()
  const opusUrl = getString(urlMap.get(assessment.file_ids[MEDITATION_SECTION_AUDIO_FORMATS.opus])).trim()
  const mp3Url = getString(urlMap.get(assessment.file_ids[MEDITATION_SECTION_AUDIO_FORMATS.mp3])).trim()

  if (!opusUrl || !mp3Url) {
    return null
  }

  return buildSectionAudioEntry({
    audio,
    sectionType,
    urls: {
      [MEDITATION_SECTION_AUDIO_FORMATS.opus]: opusUrl,
      [MEDITATION_SECTION_AUDIO_FORMATS.mp3]: mp3Url
    }
  })
}

module.exports = {
  ERROR_CODES,
  ACTIONS,
  DEFAULT_ACTION,
  MAX_CANDIDATES_PER_SECTION_TYPE,
  MAX_QUERY_PER_SECTION_TYPE,
  MAX_SECTION_TYPES_PER_REQUEST,
  MAX_TRACKS_PER_REQUEST,
  MAX_POOL_CANDIDATES_PER_SECTION_TYPE,
  MAX_TEMP_URL_BATCH_SIZE,
  MAX_SIGN_BATCH_COUNT,
  MAX_SIGN_AUDIO_IDS_PER_REQUEST,
  MEDITATION_SECTION_AUDIO_RAW_PREFIX,
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
  MEDITATION_TRACK_MIX_AUDIO_KEYS,
  MEDITATION_TRACK_MIX_AUDIO_SOURCE_KEYS,
  collectTrackMixAudioFileIds,
  resolveTrackMixAudioDeliverability,
  buildTrackMixAudioEntry,
  buildChapterTemplate,
  resolveTrackSectionTypes,
  resolveTrackQueryPlan,
  buildSectionAudioPools,
  collectSignableFileIds,
  buildUrlPolicy,
  // ── R51 新增（getPools / signAudios） ──
  chunkArray,
  isRawUploadFileId,
  resolveNewActionDeliverability,
  buildPoolMetadataEntry,
  buildSectionAudioPoolsMetadata,
  readAudioIds,
  buildSignedAudioEntry
}
