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
//     铺底、音量 **0.33**；人声轨 `voice`（10 个 `section_type`，新代号 1~10）`sequence` 顺序拼接、
//     音量 **1**。
//     音量**取自响应**里的 `background_track.volume` / `voice_track.volume`，响应缺省时才回退常量。
//   · §「留白配置层级（章间级）」＋ R11：`gap_after_seconds` 只在**章间**、末章固定 `0`、
//     **禁用章的 gap 不计入**；实现层禁止写死 `141`（读 `med_tracks.chapters[].gap_after_seconds`）。
//   · D7：抽中候选**固化**（`section_type` → 抽中 `med_section_audios._id` ＋ Track `version`）
//     —— 本模块只**组装载荷**（`buildSessionSolidification`），**不落盘**（落点待裁）。
//   · **R45（v4.22，端侧混合播放口径）**：产品口径＝人声与背景**必须同时出声**；技术路径＝
//     **服务端预混单流**（App 单个音频元素 / 小程序 `BackgroundAudioManager`，前后台同源）
//     ⇒ D6 Track 响应里的 **`mix_audio`**（`version` / `duration` / `ogg_url` / `mp3_url`）
//     决定播放来源：**有可播混音产物 ⇒ 单流播混音**；**混音产物缺失 ⇒ 回退现有双轨（仅前台）**，
//     并在本计划里**标注**（`playback_source` ＋ `mix_audio` ＋ warning 码 `MIX_AUDIO_UNAVAILABLE`）。
//     **回退路径的双轨数据照旧组装**（`background` / `voice` / `segments` / `selections` / `totals`
//     语义与取值不变）⇒ 两种来源共用同一份计划结构，端侧按 `playback_source` 分流。
//   · **R49（v4.32，段落音频组合化与端侧组装）**：配方＝发行单位 ＋ 每章**有序槽位** `chapters[].slots[]`
//     （`{ slot_index, section_type, selector: pinned(audio_id) | pool(section_type, tags[]), policy }`）。
//     **有 `slots` ⇒ 以 slots 为准（章内顺序＝数组序）**、段/选择均带 `slot_index`；**无 `slots` 的老 Track
//     ⇒（R49-③）逐字回退现有 `section_types` 一类型一槽语义**（不写迁移脚本、现网数据不失效）。
//     `policy` 至少两档：`random`（池内随机）与 `no_repeat`（**一条配方内不重复**，本函数内去重、
//     不重抽到已用过的 `audio_id`）；槽内抽签仍走 `selectMeditationPlaybackAudio`（`rng` 可注入）。
//
// 【设计口径】（本模块自有，规范未逐字规定，已报告 Zang）
//   ① `segments` 覆盖**启用章**的全部 `section_type`（含背景轨成员），顺序＝模板顺序；每段附
//      `track`（`'background'` / `'voice'`）**附加字段**用于路由（字面契约只列 5 个键，附加键不破坏契约）；
//   ② `background.audio` ＝ 计划里**第一个背景轨段**已抽中的音频（通常 `sec-nature`）**复用同一抽签结果**，
//      **不额外抽签** ⇒ 一次运行内 `rng` 调用次数 ＝ 池非空的 `section_type` 数（可测）；
//   ③ 抽签**只从「可选中」的候选中抽** —— 可选中判据（R51-① 配套）＝**优先**池条目的可交付标记
//      `deliverable`（`true` ⇒ 可选中、`false` ⇒ 不可选中，**两者都不看 URL**）；**缺该标记**（老响应 /
//      过渡态）才回退旧判据「存在可用 URL 格式」。（池非空但无一可选中 ⇒ `NO_PLAYABLE_FORMAT`；
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

export const MEDITATION_PLAYBACK_TRACK_KEYS = Object.freeze({
  background: 'background',
  voice: 'voice'
})

// 双轨播放模式（唯一口径；非可配项）。
export const MEDITATION_PLAYBACK_MODES = Object.freeze({
  background: 'loop',
  voice: 'sequence'
})

// 播放来源（R45：混音单流 / 回退双轨）——由响应 `track.mix_audio` 是否可播决定，**不可配**。
// 【键名】`mix_audio` 与 D6 响应字段**同名**（不自造别名）；`dual_track` 指既有双轨口径
//   （背景 loop ＋ 人声 sequence，仅前台）。
export const MEDITATION_PLAYBACK_SOURCES = Object.freeze({
  mixAudio: 'mix_audio',
  dualTrack: 'dual_track'
})

// 槽位（R49-②）的 selector 类型 / policy 档位 —— 值即权威（镜像
//   `packages/shared-utils/meditation-track-template.js` 的 `MEDITATION_TRACK_SLOT_*`；本模块按 §D9
//   零 import ⇒ **模板改值时必须同步本处**）。`no_repeat`＝一条配方内不重复（同一次组装不得抽到重复条目）。
export const MEDITATION_PLAYBACK_SLOT_SELECTOR_KINDS = Object.freeze({
  pinned: 'pinned',
  pool: 'pool'
})

export const MEDITATION_PLAYBACK_SLOT_POLICIES = Object.freeze({
  random: 'random',
  noRepeat: 'no_repeat'
})

// 混音产物两键 → 播放格式名：与权威源 `MEDITATION_SECTION_AUDIO_FORMATS` 的取值**逐字一致**
// （`opus` / `mp3`，opus 在前、mp3 兜底）。本模块零 import ⇒ 只能逐字镜像，口径改动时须同步本处。
const MEDITATION_PLAYBACK_MIX_FORMATS = Object.freeze({
  opus: 'opus',
  mp3: 'mp3'
})

// 音量回退常量（响应缺省时才用）：与 `MEDITATION_TRACK_VOLUMES` 同值（0.33 / 1）。
export const MEDITATION_PLAYBACK_VOLUME_DEFAULTS = Object.freeze({
  background: 0.33,
  voice: 1
})

// 轨道成员（回退常量：响应里的 `background_track.section_types` / `voice_track.section_types` 优先）。
// 【防漂移】本两处名单与权威源 `meditation-track-template.js` 的 `MEDITATION_TRACK_BACKGROUND_SECTION_TYPES`
//   / `MEDITATION_TRACK_VOICE_SECTION_TYPES` / `MEDITATION_SECTION_TYPE_ORDER` **必须同值同序**；
//   本模块按规范 §D9 保持零 import（不 import 老 `meditation-session-plan.js`，也不 import 模板模块），
//   故**不直接引用**模板常量 ⇒ 模板改段名单时**必须同步本文件**（同步脚本产物见 miniprogram utils/shared）。
export const MEDITATION_PLAYBACK_BACKGROUND_SECTION_TYPES = Object.freeze(['sec-nature', 'sec-bowl'])

export const MEDITATION_PLAYBACK_VOICE_SECTION_TYPES = Object.freeze([
  'anchorGreeting', // 1 旧 sec-intro
  'basePreparation', // 2 旧 sec-place
  'corpusAlignment', // 3 旧 sec-posture
  'deeperAwareness', // 4 旧 sec-bridge
  'essentialBreath', // 5 旧 sec-prelude
  'flowingRespiration', // 6 旧 sec-breath
  'gnosisElaboration', // 7 旧 sec-verse
  'heartAffirmation', // 8 旧 sec-chorus
  'innerIntegration', // 9 新增段（无旧码）
  'joyfulClosing' // 10 旧 sec-outro
])

// 固定段顺序（固化载荷排序用；与六章模板的章内序列一致）。
export const MEDITATION_PLAYBACK_SECTION_TYPE_ORDER = Object.freeze([
  'sec-nature',
  'sec-bowl',
  'anchorGreeting',
  'basePreparation',
  'corpusAlignment',
  'deeperAwareness',
  'essentialBreath',
  'flowingRespiration',
  'gnosisElaboration',
  'heartAffirmation',
  'innerIntegration',
  'joyfulClosing'
])

export const MEDITATION_PLAYBACK_WARNING_CODES = Object.freeze({
  emptyPool: 'EMPTY_POOL',
  noPlayableFormat: 'NO_PLAYABLE_FORMAT',
  // R45-⑥：混音产物缺失 ⇒ 回退双轨（计划级标注，**无 `section_type`**：不是段级跳过）。
  mixAudioUnavailable: 'MIX_AUDIO_UNAVAILABLE',
  // R49 槽位路径专用（**不改变旧 `section_types` 语义**）：selector 非法 / pinned 目标不可用 /
  //   `no_repeat` 下可播候选被全量剔除（与「池本来为空」区分）。均按「跳过该槽 ＋ 记 warning」处置。
  slotSelectorInvalid: 'SLOT_SELECTOR_INVALID',
  pinnedAudioUnavailable: 'PINNED_AUDIO_UNAVAILABLE',
  noRepeatExhausted: 'NO_REPEAT_EXHAUSTED'
})

export const MEDITATION_PLAYBACK_PLAN_ERROR_CODES = Object.freeze({
  invalidPlanInput: 'INVALID_PLAN_INPUT',
  invalidSolidificationInput: 'INVALID_SOLIDIFICATION_INPUT'
})

export class MeditationPlaybackPlanError extends Error {
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
export const resolveMeditationPlaybackChapters = ({ track = null, chapterTemplate = null } = {}) => {
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
export const resolveMeditationChapterGapSeconds = ({ chapter = null, trackChapter = null } = {}) => {
  const trackGap = toNonNegativeSecondsOrNull(trackChapter?.gap_after_seconds)

  if (trackGap !== null) {
    return roundSeconds(trackGap)
  }

  const templateGap = toNonNegativeSecondsOrNull(chapter?.gap_after_seconds_default)

  return templateGap !== null ? roundSeconds(templateGap) : 0
}

// 段属于哪条轨：响应里的 `background_track.section_types` / `voice_track.section_types` 优先，缺省用回退常量。
export const resolveMeditationPlaybackTrackKey = ({ sectionType = '', track = null } = {}) => {
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
export const resolveMeditationPlayableFormats = (audio = {}) => (
  (Array.isArray(audio?.formats) ? audio.formats : [])
    .map((format) => ({
      format: getString(format?.format).trim().toLowerCase(),
      url: getString(format?.url).trim(),
      mime_type: getString(format?.mime_type),
      is_fallback: format?.is_fallback === true
    }))
    .filter((format) => Boolean(format.format) && Boolean(format.url))
)

// 交付双格式（R39-④：可交付 ⇔ `transcoded_formats` 同时含 opus 与 mp3 且 file_id 齐备）。
//   元数据-only 池（R51-①：池只下发 `id` / `section_type` / `duration` / `标签`，**无 URL**）里
//   条目没有可播 URL，故据「可交付标记」判定可选中后，按此**派生**格式清单，使端侧仍能据
//   `formats[].format` 组装播放清单（真实 URL 由 `signAudios` 抽中后现签）。**不改变**带 URL 候选的输出。
const MEDITATION_PLAYBACK_DELIVERED_FORMATS = Object.freeze(['opus', 'mp3'])

// 可交付标记（D6 池元数据新增；R51-① 配套）：`audio.deliverable` 为布尔时以其为准（**URL 一律忽略**）；
//   缺该键（老响应 / 过渡态）⇒ 返回 `null` ⇒ 调用方回退旧判据（存在可用 URL 格式）。
//   `deliverable === false` ⇒ 恒不可选中（不可交付项不得被抽中）。
export const resolveMeditationAudioDeliverable = (audio = {}) => (
  isPlainObject(audio) && typeof audio.deliverable === 'boolean' ? audio.deliverable : null
)

// 「可选中」判据（R49-⑤⑧ / R51-①）：**优先**可交付标记（存在即以其为准、**不要求 `formats[].url`**）；
//   无标记 ⇒ 回退旧判据（`formats[].url` 非空）。**向后兼容**：URL 池（无标记）逐字沿用旧行为。
export const isMeditationAudioSelectable = (audio = {}) => {
  const deliverable = resolveMeditationAudioDeliverable(audio)
  return deliverable !== null ? deliverable : resolveMeditationPlayableFormats(audio).length > 0
}

const buildPlayableAudio = ({ audio = {}, sectionType = '' }) => {
  const explicitFormats = resolveMeditationPlayableFormats(audio)
  // 可交付标记为真、但池未带可播 URL（R51-① 元数据-only 池）⇒ 按交付契约（R39-④ 双格式）派生格式清单。
  const formats = explicitFormats.length > 0
    ? explicitFormats
    : (resolveMeditationAudioDeliverable(audio) === true
      ? MEDITATION_PLAYBACK_DELIVERED_FORMATS.map((format) => ({
        format,
        url: '',
        mime_type: '',
        is_fallback: format === MEDITATION_PLAYBACK_MIX_FORMATS.mp3
      }))
      : [])
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

// 抽 1 条：先滤掉「不可选中」的候选（可交付标记为准、无标记才要求可用 URL），再从可选中候选里按 `rng` 抽（默认 `Math.random`）。
export const selectMeditationPlayableAudio = ({ sectionType = '', pool = null, rng = Math.random } = {}) => {
  if (!Array.isArray(pool) || pool.length === 0) {
    return { ok: false, code: MEDITATION_PLAYBACK_WARNING_CODES.emptyPool }
  }

  const playableCandidates = pool
    .filter((audio) => isMeditationAudioSelectable(audio))
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

// ─── 槽位（R49-②③④）：章内有序槽位解析与抽签 ──────────────────────────────────
//
// 规范依据：R49-②（slot 形状 `{ slot_index, section_type, selector, policy }`）、R49-③（**无 `slots`
//   的老 Track 回退现有 `section_types` 语义**）、R49-④（`slot_index` 为固化字段，**不得再用稳定下标充当**）。
// 键名口径：以库 / D6 下发的 snake_case 为准（`selector.kind` / `selector.audio_id` /
//   `selector.section_type` / `selector.tags`）；`kind` 缺失时按字段**容忍推断**（有 audio_id ⇒ pinned、
//   有 section_type ⇒ pool）——不吞、不猜语义、不抛。

// selector 归一：只认 `pinned(audio_id)` / `pool(section_type, tags[])`；无法判定 ⇒ null。
const resolveSlotSelector = (selector) => {
  if (!isPlainObject(selector)) {
    return null
  }

  const kind = getString(selector.kind).trim().toLowerCase()
  const audioId = getString(selector.audio_id != null ? selector.audio_id : selector.audioId).trim()
  const sectionType = getString(
    selector.section_type != null ? selector.section_type : selector.sectionType
  ).trim()
  const tags = (Array.isArray(selector.tags) ? selector.tags : [])
    .map((tag) => getString(tag).trim())
    .filter(Boolean)

  if (kind === MEDITATION_PLAYBACK_SLOT_SELECTOR_KINDS.pinned || (!kind && audioId)) {
    return audioId ? { kind: MEDITATION_PLAYBACK_SLOT_SELECTOR_KINDS.pinned, audio_id: audioId } : null
  }

  if (kind === MEDITATION_PLAYBACK_SLOT_SELECTOR_KINDS.pool || (!kind && sectionType)) {
    return { kind: MEDITATION_PLAYBACK_SLOT_SELECTOR_KINDS.pool, section_type: sectionType, tags }
  }

  return null
}

// 章内槽位定义：`trackChapter.slots[]` 非空数组 ⇒ 以 slots 为准（**章内顺序＝数组序**）；
//   否则返回 `null` ⇒ 调用方走旧 `section_types` 一类型一槽语义（R49-③，逐字不变）。
const resolveChapterSlotDefinitions = (trackChapter) => {
  const slots = Array.isArray(trackChapter?.slots) ? trackChapter.slots : []

  if (slots.length === 0) {
    return null
  }

  return slots.map((slot, index) => {
    const selector = resolveSlotSelector(slot?.selector)
    const declaredSectionType = getString(slot?.section_type).trim()
    const sectionType = declaredSectionType || (selector ? selector.section_type : '') || ''
    const policy = getString(slot?.policy).trim() || MEDITATION_PLAYBACK_SLOT_POLICIES.random
    const rawSlotIndex = Number(slot?.slot_index)
    // `slot_index` 用**数据里的值**（R49-④；不得拿数组下标充当）；缺失 / 非法时才防御性回退下标。
    const slotIndex = Number.isInteger(rawSlotIndex) && rawSlotIndex >= 0 ? rawSlotIndex : index

    return { slot_index: slotIndex, section_type: sectionType, selector, policy }
  })
}

// 定位 pinned 音频：优先该槽 `section_type` 的池，缺则全池扫描（容忍历史数据段码与槽不一致）。
const resolvePinnedSlotAudio = ({ pools, sectionType, audioId }) => {
  const poolsObject = isPlainObject(pools) ? pools : {}
  const scopedPool = Array.isArray(poolsObject[sectionType]) ? poolsObject[sectionType] : []
  const otherPools = Object.keys(poolsObject)
    .filter((key) => key !== sectionType)
    .map((key) => (Array.isArray(poolsObject[key]) ? poolsObject[key] : []))
  const candidatePools = [scopedPool, ...otherPools]

  for (const pool of candidatePools) {
    const match = pool.find((audio) => getString(audio?._id || audio?.id).trim() === audioId)

    if (match) {
      if (!isMeditationAudioSelectable(match)) {
        return { ok: false, code: MEDITATION_PLAYBACK_WARNING_CODES.noPlayableFormat }
      }

      return {
        ok: true,
        audio: buildPlayableAudio({
          audio: match,
          sectionType: getString(match?.section_type).trim() || sectionType
        })
      }
    }
  }

  return { ok: false, code: MEDITATION_PLAYBACK_WARNING_CODES.pinnedAudioUnavailable }
}

// 抽一个槽的音频：pinned ⇒ 锁定；pool ⇒ 走 `selectMeditationPlayableAudio`（`rng` 可注入）。
// `no_repeat` ⇒ 先剔除「本配方已用过的 audio_id」，**不得重抽到已用过的**（用尽则记 `NO_REPEAT_EXHAUSTED`）。
const drawSlotSelection = ({ slotDefinition, pools, usedAudioIds, rng }) => {
  const selector = slotDefinition.selector

  if (!selector) {
    return { ok: false, code: MEDITATION_PLAYBACK_WARNING_CODES.slotSelectorInvalid }
  }

  if (selector.kind === MEDITATION_PLAYBACK_SLOT_SELECTOR_KINDS.pinned) {
    return resolvePinnedSlotAudio({
      pools,
      sectionType: slotDefinition.section_type,
      audioId: selector.audio_id
    })
  }

  const poolSectionType = selector.section_type || slotDefinition.section_type
  const rawPool = isPlainObject(pools) && Array.isArray(pools[poolSectionType]) ? pools[poolSectionType] : []
  const noRepeat = slotDefinition.policy === MEDITATION_PLAYBACK_SLOT_POLICIES.noRepeat

  if (!noRepeat) {
    return selectMeditationPlayableAudio({ sectionType: poolSectionType, pool: rawPool, rng })
  }

  const filteredPool = rawPool.filter((audio) => {
    const id = getString(audio?._id || audio?.id).trim()
    return !id || !usedAudioIds.has(id)
  })
  const selection = selectMeditationPlayableAudio({ sectionType: poolSectionType, pool: filteredPool, rng })

  // 原池非空、但候选被 `no_repeat` 全量剔除 ⇒ 单独记码（与「池本来为空」区分）。
  if (!selection.ok && rawPool.length > 0 && filteredPool.length === 0) {
    return { ok: false, code: MEDITATION_PLAYBACK_WARNING_CODES.noRepeatExhausted }
  }

  return selection
}

// ─── 混音单流（R45）：响应 `track.mix_audio` → 可播混音条目 ────────────────────────────
//
// 口径（**只认响应，不拼路径、不猜 URL**）：
//   ① 可播判据＝`mix_audio` 是对象 **且** `duration > 0` **且** 至少一条链接（`ogg_url` / `mp3_url`）非空；
//      任一不满足 ⇒ 返回 `null`＝「混音产物缺失」（端侧回退双轨，见 buildMeditationTrackPlaybackPlan）；
//   ② 格式顺序＝**opus 在前、mp3 兜底**（与候选音频同序）：本模块零 import ⇒ 两键到格式名的映射
//      逐字镜像 `MEDITATION_SECTION_AUDIO_FORMATS`（见 MEDITATION_PLAYBACK_MIX_FORMATS）；
//   ③ 音量**不在此处**：混音产物的配比（voice 1.0 / background 0.33）已由服务端烘焙进单流
//      ⇒ 端侧按 `1` 播放（不得再叠加配比）；
//   ④ `version` 原样透传（缺省填 `0`）——**不做**「与 `track.version` 比对」这类端侧改判
//      （R45 未规定该比对，端侧不得自创失效规则）；
//   ⑤ 产出形状与段内 `audio` 同形（`formats[]` / `duration_seconds`），端侧可直接复用播放清单构造。
export const resolveMeditationMixPlayback = (track = null) => {
  const mixAudio = track?.mix_audio

  if (!isPlainObject(mixAudio)) {
    return null
  }

  const durationSeconds = toPositiveSecondsOrZero(mixAudio.duration)

  if (durationSeconds <= 0) {
    return null
  }

  const formats = resolveMeditationPlayableFormats({
    formats: [
      {
        format: MEDITATION_PLAYBACK_MIX_FORMATS.opus,
        url: getString(mixAudio.ogg_url).trim(),
        is_fallback: false
      },
      {
        format: MEDITATION_PLAYBACK_MIX_FORMATS.mp3,
        url: getString(mixAudio.mp3_url).trim(),
        is_fallback: true
      }
    ]
  })

  if (formats.length === 0) {
    return null
  }

  const version = Number(mixAudio.version)

  return {
    version: Number.isFinite(version) && version > 0 ? Math.floor(version) : 0,
    duration_seconds: durationSeconds,
    // 混音产物**没有**单条音频的 `_id` / `section_type`（它不是 `med_section_audios` 行）
    // ⇒ 这两项恒为空串（端侧不得据此回查 DB）。
    audio: {
      id: '',
      section_type: '',
      label: '',
      duration_seconds: durationSeconds,
      format: formats[0].format,
      url: formats[0].url,
      mime_type: formats[0].mime_type,
      formats
    }
  }
}

// ─── 播放计划组装（D9） ───────────────────────────────────────────────────────

export const buildMeditationTrackPlaybackPlan = ({
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

  // R45：播放来源由响应的 `mix_audio` 是否可播决定（混音单流 / 回退双轨）。
  // 双轨数据**两种来源都照旧组装**（回退路径随时可用、`totals` 语义不变）；
  // 混音缺失时记一条**计划级** warning（无 `section_type`：不是段级跳过，端侧不得当跳段处理）——
  // 该条**追加在所有段级 warning 之后**（原有段级 warning 的相对次序与含义不变）。
  const mixAudio = resolveMeditationMixPlayback(track)

  // 第一遍：按模板顺序逐章抽签（章序 / 段序只读，不重排、不排序）。
  // `usedAudioIds`＝本配方**已抽中**的 audio_id 集合（供 `no_repeat` 去重；跨章共享为一「配方」）。
  const usedAudioIds = new Set()

  chapters.forEach((chapter) => {
    const trackChapter = trackChapterMap.get(getString(chapter?.chapter_key).trim())

    if (!isChapterEnabled({ chapter, trackChapter })) {
      return
    }

    const chapterSegments = []
    // R49：有 `slots` ⇒ 以 slots 为准（章内顺序＝数组序）；无 ⇒ null ⇒ 走旧语义。
    const slotDefinitions = resolveChapterSlotDefinitions(trackChapter)

    if (slotDefinitions) {
      // ── 槽位路径（R49-②③④）：段 / 选择均带 `slot_index`（固化字段，不得用稳定下标充当）。 ──
      slotDefinitions.forEach((slotDefinition) => {
        const selection = drawSlotSelection({ slotDefinition, pools, usedAudioIds, rng })

        // 槽不可用（selector 非法 / pinned 缺失 / 池空 / 无可用格式 / no_repeat 用尽）⇒ 跳过该槽并记码。
        if (!selection.ok) {
          warnings.push({
            slot_index: slotDefinition.slot_index,
            section_type: slotDefinition.section_type,
            code: selection.code
          })
          return
        }

        const sectionType = slotDefinition.section_type || getString(selection.audio.section_type).trim()
        const trackKey = resolveMeditationPlaybackTrackKey({ sectionType, track })
        const segment = {
          slot_index: slotDefinition.slot_index,
          section_type: sectionType,
          track: trackKey,
          audio: selection.audio,
          duration_seconds: selection.audio.duration_seconds,
          gap_after_seconds: 0,
          starts_after_gap: false
        }

        chapterSegments.push(segment)
        selections.push({
          slot_index: slotDefinition.slot_index,
          section_type: sectionType,
          audio_id: selection.audio.id,
          duration_seconds: selection.audio.duration_seconds
        })

        if (selection.audio.id) {
          usedAudioIds.add(selection.audio.id)
        }
      })
    } else {
      // ── 旧路径（R49-③ 向后兼容，逐字不变）：一类型一槽、**不产生 `slot_index`**。 ──
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

        if (selection.audio.id) {
          usedAudioIds.add(selection.audio.id)
        }
      })
    }

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

  // 混音产物缺失 ⇒ 追加计划级标注（无 `section_type`）。
  if (!mixAudio) {
    warnings.push({ code: MEDITATION_PLAYBACK_WARNING_CODES.mixAudioUnavailable })
  }

  return {
    // R45-⑥：播放来源标注（`mix_audio` ＝ 单流播混音版；`dual_track` ＝ 回退既有双轨、仅前台）。
    playback_source: mixAudio ? MEDITATION_PLAYBACK_SOURCES.mixAudio : MEDITATION_PLAYBACK_SOURCES.dualTrack,
    // 可播混音产物（`{version, duration_seconds, audio}`）或 `null`（＝产物缺失 ⇒ 回退双轨）。
    mix_audio: mixAudio,
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

export const buildSessionSolidification = ({
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

  const seenKeys = new Set()
  const normalizedSelections = []

  ;(Array.isArray(selections) ? selections : []).forEach((selection) => {
    const sectionType = getString(selection?.section_type).trim()
    const audioId = getString(selection?.audio_id).trim()
    const rawSlotIndex = Number(selection?.slot_index)
    // R49-④：`slot_index` 为固化字段（有则透传，**只增不减**；旧载荷无该键 ⇒ 逐字不变）。
    const hasSlotIndex = Number.isInteger(rawSlotIndex) && rawSlotIndex >= 0

    // 缺 id 的项不固化（无 id 无法复现）。
    if (!sectionType || !audioId) {
      return
    }

    // 去重键：有 `slot_index` ⇒ 按槽去重（同 `section_type` 的多槽各自保留）；
    //   无 ⇒ 沿用旧口径「同一 section_type 只固化第一条」（确定性、逐字不变）。
    const dedupeKey = hasSlotIndex ? `slot:${rawSlotIndex}` : `section:${sectionType}`

    if (seenKeys.has(dedupeKey)) {
      return
    }

    seenKeys.add(dedupeKey)

    const entry = {
      section_type: sectionType,
      audio_id: audioId,
      duration_seconds: toPositiveSecondsOrZero(selection?.duration_seconds)
    }

    if (hasSlotIndex) {
      entry.slot_index = rawSlotIndex
    }

    normalizedSelections.push(entry)
  })

  return {
    track_id: normalizedTrackId,
    track_version: version,
    date_key: normalizedDateKey,
    session_key: normalizedSessionKey,
    selections: sortSelectionsBySectionTypeOrder(normalizedSelections)
  }
}
