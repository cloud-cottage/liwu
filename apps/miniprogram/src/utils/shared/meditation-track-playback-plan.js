// 【防漂移】本文件内的回退常量（音量 0.33 / 1、章数 6、Section 名单）**非权威源**；运行时一律以 D6 云函数（meditation-read）响应为准，**绝不**可覆盖响应值。
// ─── 端侧双轨播放计划的纯函数组装（D9 / R10 / D7；零 IO、可注入 rng） ──────────────────────
//
// 【规范依据】docs/meditation.admin.partner.spec.md（v4.8）
//   · D9 / §5：端侧**不再算老 plan**，改为「读 `med_tracks`（经 D6）＋ 按 `section_type` 从候选池抽一条
//     ＋ 按固定顺序拼接」；老 `session-plan` **冻结为兼容层** ⇒ 本模块**零 import**（尤其不 import 老
//     `meditation-session-plan.js`），也不调用它。
//   · R10 / R39 ⑦：**章序与章内 Section 顺序只读** —— 一律取自 `chapter_template`（缺省时取 Track 响应
//     的 `chapters`），端侧**不得重排**、不得用数据覆盖顺序。
//   · §「播放模型（双轨，唯一口径）」：背景轨 `background`（`sec-nature` / `sec-bowl`）`loop`
//     铺底、音量 **0.33**；人声轨 `voice`（9 个 `section_type`）`sequence` 顺序拼接、音量 **1**。
//     音量**取自响应**里的 `background_track.volume` / `voice_track.volume`，响应缺省时才回退常量。
//   · §「留白配置层级（章间级）」＋ R11：`gap_after_seconds` 只在**章间**、末章固定 `0`、
//     **禁用章的 gap 不计入**；实现层禁止写死 `141`（读 `med_tracks.chapters[].gap_after_seconds`）。
//   · D7：抽中候选**固化**（`section_type` → 抽中 `med_section_audios._id` ＋ Track `version`）
//     —— 本模块只**组装载荷**（`buildSessionSolidification`），**不落盘**（落点待裁）。
//
// 【设计口径】（本模块自有，规范未逐字规定，已报告 Zang）
//   ① `segments` 覆盖**启用章**的全部 `section_type`（含背景轨成员），顺序＝模板顺序；每段附
//      `track`（`'background'` / `'voice'`）**附加字段**用于路由（字面契约只列 5 个键，附加键不破坏契约）；
//   ② `background.audio` ＝ 计划里**第一个背景轨段**已抽中的音频（通常 `sec-nature`）**复用同一抽签结果**，
//      **不额外抽签** ⇒ 一次运行内 `rng` 调用次数 ＝ 池非空的 `section_type` 数（可测）；
//   ③ 抽签**只从「有可用格式」的候选中抽**（池非空但全无可用 URL ⇒ `NO_PLAYABLE_FORMAT`；
//      池缺失 / 空数组 ⇒ `EMPTY_POOL`）；这两类**只跳过该段并记 warning，不整场失败**；
//   ④ 空池 / 无可用格式的段落**不产生** `segment` 也不产生 `selection`；
//   ⑤ `duration_seconds` 一律取响应的**实测** `duration`（`>0` 才用，否则记 `0`），**不使用标称值**；
//   ⑥ 章间留白只挂在**该章最后一个可用段**上，且仅当该章有可用段时才计入 ⇒ 恒有
//      `totals.gap_seconds === Σ segments[].gap_after_seconds`（可测不变量）；最后一个**有可用段的**章
//      恒 `0`（末章全部取不到音频时不留尾部静默）；
//   ⑦ `starts_after_gap` ＝ 该段是本章首段且上一章尾留白 `> 0`（用于端侧判断「是否需先静默等待」）；
//   ⑧ 播放模式是双轨唯一口径的**常量**（`loop` / `sequence`），不是可配项 ⇒ 不读响应的 `playback_mode`；
//   ⑨ 秒数统一取到毫秒精度（`roundSeconds`），避免浮点尾尘导致同输入不同输出；
//   ⑩ 零 IO、纯 ESM、无外部依赖。

// ─── 常量 ────────────────────────────────────────────────────────────────────

const MEDITATION_PLAYBACK_TRACK_KEYS = Object.freeze({
  background: 'background',
  voice: 'voice'
})

// 双轨播放模式（唯一口径；非可配项）。
const MEDITATION_PLAYBACK_MODES = Object.freeze({
  background: 'loop',
  voice: 'sequence'
})

// 音量回退常量（响应缺省时才用）：与 `MEDITATION_TRACK_VOLUMES` 同值（0.33 / 1）。
const MEDITATION_PLAYBACK_VOLUME_DEFAULTS = Object.freeze({
  background: 0.33,
  voice: 1
})

// 轨道成员（回退常量：响应里的 `background_track.section_types` / `voice_track.section_types` 优先）。
const MEDITATION_PLAYBACK_BACKGROUND_SECTION_TYPES = Object.freeze(['sec-nature', 'sec-bowl'])

const MEDITATION_PLAYBACK_VOICE_SECTION_TYPES = Object.freeze([
  'sec-intro',
  'sec-place',
  'sec-posture',
  'sec-bridge',
  'sec-prelude',
  'sec-breath',
  'sec-verse',
  'sec-chorus',
  'sec-outro'
])

// 固定段顺序（固化载荷排序用；与六章模板的章内序列一致）。
const MEDITATION_PLAYBACK_SECTION_TYPE_ORDER = Object.freeze([
  'sec-nature',
  'sec-bowl',
  'sec-intro',
  'sec-place',
  'sec-posture',
  'sec-bridge',
  'sec-prelude',
  'sec-breath',
  'sec-verse',
  'sec-chorus',
  'sec-outro'
])

const MEDITATION_PLAYBACK_WARNING_CODES = Object.freeze({
  emptyPool: 'EMPTY_POOL',
  noPlayableFormat: 'NO_PLAYABLE_FORMAT'
})

const MEDITATION_PLAYBACK_PLAN_ERROR_CODES = Object.freeze({
  invalidPlanInput: 'INVALID_PLAN_INPUT',
  invalidSolidificationInput: 'INVALID_SOLIDIFICATION_INPUT'
})

class MeditationPlaybackPlanError extends Error {
  constructor(code, message, details = null) {
    super(message || `播放计划组装失败（${code}）`)

    this.name = 'MeditationPlaybackPlanError'
    this.code = code || MEDITATION_PLAYBACK_PLAN_ERROR_CODES.invalidPlanInput
    this.details = details && typeof details === 'object' ? details : null
  }
}

// ─── 小工具 ──────────────────────────────────────────────────────────────────

const getString = (value) => (value == null ? '' : String(value))

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const roundSeconds = (value) => Math.round((Number(value) || 0) * 1000) / 1000

const toPositiveSecondsOrZero = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? roundSeconds(number) : 0
}

const toNonNegativeSecondsOrNull = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

// 音量：响应给的正数才用，否则回退常量（音量 0 视为未配置，避免静音事故）。
const resolvePlaybackVolume = (value, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

// ─── 章节 / 段落（顺序只读） ───────────────────────────────────────────────────

// 章节源：`chapter_template` 优先，缺省取 Track 响应的 `chapters`；**一律沿用给定顺序，不排序**。
const resolveMeditationPlaybackChapters = ({ track = null, chapterTemplate = null } = {}) => {
  if (Array.isArray(chapterTemplate) && chapterTemplate.length > 0) {
    return chapterTemplate
  }

  if (Array.isArray(track?.chapters) && track.chapters.length > 0) {
    return track.chapters
  }

  return []
}

const buildTrackChapterMap = (track) => {
  const map = new Map()

  ;(Array.isArray(track?.chapters) ? track.chapters : []).forEach((chapter) => {
    const chapterKey = getString(chapter?.chapter_key).trim()

    if (chapterKey && !map.has(chapterKey)) {
      map.set(chapterKey, chapter)
    }
  })

  return map
}

const resolveChapterSectionTypes = (chapter) => (
  (Array.isArray(chapter?.section_types) ? chapter.section_types : [])
    .map((sectionType) => getString(sectionType).trim())
    .filter(Boolean)
)

// 启用态：Track 响应为准（缺该章时看模板的 `enabled_by_default`，都没有则视为启用）。
const isChapterEnabled = ({ chapter, trackChapter }) => {
  if (isPlainObject(trackChapter)) {
    return trackChapter.enabled !== false
  }

  return chapter?.enabled_by_default !== false
}

// 章间留白：Track 响应 `chapters[].gap_after_seconds` 为权威，缺省回退模板的 `gap_after_seconds_default`。
const resolveMeditationChapterGapSeconds = ({ chapter = null, trackChapter = null } = {}) => {
  const trackGap = toNonNegativeSecondsOrNull(trackChapter?.gap_after_seconds)

  if (trackGap !== null) {
    return roundSeconds(trackGap)
  }

  const templateGap = toNonNegativeSecondsOrNull(chapter?.gap_after_seconds_default)

  return templateGap !== null ? roundSeconds(templateGap) : 0
}

// 段属于哪条轨：响应里的 `background_track.section_types` / `voice_track.section_types` 优先，缺省用回退常量。
const resolveMeditationPlaybackTrackKey = ({ sectionType = '', track = null } = {}) => {
  const backgroundSectionTypes = Array.isArray(track?.background_track?.section_types)
    ? track.background_track.section_types
    : MEDITATION_PLAYBACK_BACKGROUND_SECTION_TYPES
  const voiceSectionTypes = Array.isArray(track?.voice_track?.section_types)
    ? track.voice_track.section_types
    : MEDITATION_PLAYBACK_VOICE_SECTION_TYPES
  const normalizedType = getString(sectionType).trim()

  if (backgroundSectionTypes.map(getString).includes(normalizedType)) {
    return MEDITATION_PLAYBACK_TRACK_KEYS.background
  }

  if (voiceSectionTypes.map(getString).includes(normalizedType)) {
    return MEDITATION_PLAYBACK_TRACK_KEYS.voice
  }

  // 既非背景轨成员也非人声轨成员：按回退常量判定（默认人声，绝不静默丢段）。
  return MEDITATION_PLAYBACK_BACKGROUND_SECTION_TYPES.includes(normalizedType)
    ? MEDITATION_PLAYBACK_TRACK_KEYS.background
    : MEDITATION_PLAYBACK_TRACK_KEYS.voice
}

// ─── 抽签（格式顺序＝响应 `formats[]` 序：opus 在前、mp3 兜底） ──────────────────────────

// 可用格式：只保留 `url` 非空的条目，**保持响应给的顺序**（不重排、不按扩展名猜）。
const resolveMeditationPlayableFormats = (audio = {}) => (
  (Array.isArray(audio?.formats) ? audio.formats : [])
    .map((format) => ({
      format: getString(format?.format).trim().toLowerCase(),
      url: getString(format?.url).trim(),
      mime_type: getString(format?.mime_type),
      is_fallback: format?.is_fallback === true
    }))
    .filter((format) => Boolean(format.format) && Boolean(format.url))
)

const buildPlayableAudio = ({ audio = {}, sectionType = '' }) => {
  const formats = resolveMeditationPlayableFormats(audio)
  const primary = formats[0] || null

  return {
    id: getString(audio?._id || audio?.id).trim(),
    section_type: sectionType || getString(audio?.section_type).trim(),
    label: getString(audio?.label),
    duration_seconds: toPositiveSecondsOrZero(audio?.duration),
    format: primary ? primary.format : '',
    url: primary ? primary.url : '',
    mime_type: primary ? primary.mime_type : '',
    formats
  }
}

// 抽 1 条：先滤掉「无可用格式」的候选，再从可播候选里按 `rng` 抽（默认 `Math.random`）。
const selectMeditationPlayableAudio = ({ sectionType = '', pool = null, rng = Math.random } = {}) => {
  if (!Array.isArray(pool) || pool.length === 0) {
    return { ok: false, code: MEDITATION_PLAYBACK_WARNING_CODES.emptyPool }
  }

  const playableCandidates = pool
    .filter((audio) => resolveMeditationPlayableFormats(audio).length > 0)
    .map((audio) => buildPlayableAudio({ audio, sectionType }))

  if (playableCandidates.length === 0) {
    return { ok: false, code: MEDITATION_PLAYBACK_WARNING_CODES.noPlayableFormat }
  }

  const randomFn = typeof rng === 'function' ? rng : Math.random
  const randomValue = Number(randomFn())
  const safeRandomValue = Number.isFinite(randomValue) ? Math.min(Math.max(randomValue, 0), 0.999999999) : 0
  const index = Math.floor(safeRandomValue * playableCandidates.length)

  return { ok: true, audio: playableCandidates[Math.min(index, playableCandidates.length - 1)] }
}

// ─── 播放计划组装（D9） ───────────────────────────────────────────────────────

const buildMeditationTrackPlaybackPlan = ({
  track = null,
  chapterTemplate = null,
  sectionAudioPools = null,
  rng = Math.random
} = {}) => {
  const chapters = resolveMeditationPlaybackChapters({ track, chapterTemplate })

  if (chapters.length === 0) {
    throw new MeditationPlaybackPlanError(
      MEDITATION_PLAYBACK_PLAN_ERROR_CODES.invalidPlanInput,
      '缺少章节模板：chapter_template 与 track.chapters 均不可用（端侧不得自行重排 / 造章）'
    )
  }

  const pools = isPlainObject(sectionAudioPools) ? sectionAudioPools : {}
  const trackChapterMap = buildTrackChapterMap(track)
  const warnings = []
  const selections = []
  const chapterEntries = []

  // 第一遍：按模板顺序逐章抽签（章序 / 段序只读，不重排、不排序）。
  chapters.forEach((chapter) => {
    const trackChapter = trackChapterMap.get(getString(chapter?.chapter_key).trim())

    if (!isChapterEnabled({ chapter, trackChapter })) {
      return
    }

    const chapterSegments = []

    resolveChapterSectionTypes(chapter).forEach((sectionType) => {
      const selection = selectMeditationPlayableAudio({
        sectionType,
        pool: pools[sectionType],
        rng
      })

      // 空池 / 无可用格式 ⇒ 跳过该段并记码（**不整场失败**）。
      if (!selection.ok) {
        warnings.push({ section_type: sectionType, code: selection.code })
        return
      }

      const trackKey = resolveMeditationPlaybackTrackKey({ sectionType, track })
      const segment = {
        section_type: sectionType,
        track: trackKey,
        audio: selection.audio,
        duration_seconds: selection.audio.duration_seconds,
        gap_after_seconds: 0,
        starts_after_gap: false
      }

      chapterSegments.push(segment)
      selections.push({
        section_type: sectionType,
        audio_id: selection.audio.id,
        duration_seconds: selection.audio.duration_seconds
      })
    })

    chapterEntries.push({
      segments: chapterSegments,
      gap_seconds: resolveMeditationChapterGapSeconds({ chapter, trackChapter })
    })
  })

  // 第二遍：章间留白只挂在「有可用段的章」的最后一段上；**末（有内容的）章恒 0**。
  const contentEntries = chapterEntries.filter((entry) => entry.segments.length > 0)
  const segments = []
  let previousChapterHadGap = false

  contentEntries.forEach((entry, entryIndex) => {
    const gapSeconds = entryIndex === contentEntries.length - 1 ? 0 : entry.gap_seconds

    entry.segments.forEach((segment, segmentIndex) => {
      segment.starts_after_gap = segmentIndex === 0 ? previousChapterHadGap : false
    })

    entry.segments[entry.segments.length - 1].gap_after_seconds = gapSeconds
    previousChapterHadGap = gapSeconds > 0
    segments.push(...entry.segments)
  })

  // 背景轨铺底音频：复用计划里第一个背景轨段**已抽中**的结果（不额外抽签）。
  const backgroundSegment = segments.find((segment) => segment.track === MEDITATION_PLAYBACK_TRACK_KEYS.background) || null
  const voiceSeconds = segments
    .filter((segment) => segment.track === MEDITATION_PLAYBACK_TRACK_KEYS.voice)
    .reduce((sum, segment) => sum + segment.duration_seconds, 0)
  const gapSeconds = segments.reduce((sum, segment) => sum + segment.gap_after_seconds, 0)

  return {
    background: {
      audio: backgroundSegment ? backgroundSegment.audio : null,
      playback_mode: MEDITATION_PLAYBACK_MODES.background,
      volume: resolvePlaybackVolume(track?.background_track?.volume, MEDITATION_PLAYBACK_VOLUME_DEFAULTS.background)
    },
    voice: {
      playback_mode: MEDITATION_PLAYBACK_MODES.voice,
      volume: resolvePlaybackVolume(track?.voice_track?.volume, MEDITATION_PLAYBACK_VOLUME_DEFAULTS.voice)
    },
    segments,
    selections,
    totals: {
      voice_seconds: roundSeconds(voiceSeconds),
      gap_seconds: roundSeconds(gapSeconds),
      total_seconds: roundSeconds(voiceSeconds + gapSeconds)
    },
    warnings
  }
}

// ─── 抽中候选固化载荷（D7；只组装、不落盘） ─────────────────────────────────────

const SECTION_TYPE_ORDER_INDEX = new Map(MEDITATION_PLAYBACK_SECTION_TYPE_ORDER.map((sectionType, index) => [sectionType, index]))
const SECTION_TYPE_ORDER_FALLBACK = MEDITATION_PLAYBACK_SECTION_TYPE_ORDER.length

const resolveSectionTypeOrderIndex = (sectionType) => (
  SECTION_TYPE_ORDER_INDEX.has(sectionType)
    ? SECTION_TYPE_ORDER_INDEX.get(sectionType)
    : SECTION_TYPE_ORDER_FALLBACK
)

// 稳定排序：先按固定段顺序，未知类型排在已知之后并**保持原相对次序**（同输入同输出）。
const sortSelectionsBySectionTypeOrder = (selections = []) => selections
  .map((selection, index) => ({ selection, index }))
  .sort((left, right) => (
    resolveSectionTypeOrderIndex(left.selection.section_type)
      - resolveSectionTypeOrderIndex(right.selection.section_type)
      || left.index - right.index
  ))
  .map((entry) => entry.selection)

const buildSessionSolidification = ({
  trackId = '',
  trackVersion = null,
  dateKey = '',
  sessionKey = '',
  selections = []
} = {}) => {
  const normalizedTrackId = getString(trackId).trim()
  const normalizedDateKey = getString(dateKey).trim()
  const normalizedSessionKey = getString(sessionKey).trim()
  const version = Number(trackVersion)

  if (!normalizedTrackId) {
    throw new MeditationPlaybackPlanError(
      MEDITATION_PLAYBACK_PLAN_ERROR_CODES.invalidSolidificationInput,
      '固化载荷缺少 track_id'
    )
  }

  if (!Number.isFinite(version) || version <= 0) {
    throw new MeditationPlaybackPlanError(
      MEDITATION_PLAYBACK_PLAN_ERROR_CODES.invalidSolidificationInput,
      '固化载荷缺少合法的 track_version',
      { received: trackVersion }
    )
  }

  if (!normalizedDateKey || !normalizedSessionKey) {
    throw new MeditationPlaybackPlanError(
      MEDITATION_PLAYBACK_PLAN_ERROR_CODES.invalidSolidificationInput,
      '固化载荷缺少 date_key / session_key',
      { date_key: normalizedDateKey, session_key: normalizedSessionKey }
    )
  }

  const seenSectionTypes = new Set()
  const normalizedSelections = []

  ;(Array.isArray(selections) ? selections : []).forEach((selection) => {
    const sectionType = getString(selection?.section_type).trim()
    const audioId = getString(selection?.audio_id).trim()

    // 缺 id 的项不固化（无 id 无法复现）；同一 section_type 只固化第一条（确定性）。
    if (!sectionType || !audioId || seenSectionTypes.has(sectionType)) {
      return
    }

    seenSectionTypes.add(sectionType)
    normalizedSelections.push({
      section_type: sectionType,
      audio_id: audioId,
      duration_seconds: toPositiveSecondsOrZero(selection?.duration_seconds)
    })
  })

  return {
    track_id: normalizedTrackId,
    track_version: version,
    date_key: normalizedDateKey,
    session_key: normalizedSessionKey,
    selections: sortSelectionsBySectionTypeOrder(normalizedSelections)
  }
}


module.exports = {
  MEDITATION_PLAYBACK_TRACK_KEYS,
  MEDITATION_PLAYBACK_MODES,
  MEDITATION_PLAYBACK_VOLUME_DEFAULTS,
  MEDITATION_PLAYBACK_BACKGROUND_SECTION_TYPES,
  MEDITATION_PLAYBACK_VOICE_SECTION_TYPES,
  MEDITATION_PLAYBACK_SECTION_TYPE_ORDER,
  MEDITATION_PLAYBACK_WARNING_CODES,
  MEDITATION_PLAYBACK_PLAN_ERROR_CODES,
  MeditationPlaybackPlanError,
  resolveMeditationPlaybackChapters,
  resolveMeditationChapterGapSeconds,
  resolveMeditationPlaybackTrackKey,
  resolveMeditationPlayableFormats,
  selectMeditationPlayableAudio,
  buildMeditationTrackPlaybackPlan,
  buildSessionSolidification
}
