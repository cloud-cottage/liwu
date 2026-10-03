import { MEDITATION_TRACK_VOLUMES } from './meditation-session-plan.js'

// ─── 六章固定模板（meditation.admin.partner.spec.md 唯一口径） ──────────────────
// 顺序固定、不可改、不可重复；章内 Section 类型与顺序固定不可改。
// 管理员只能调整「章开关」「章时长上限」「章间留白秒数」。
//
// 【命名体系变更 v4.18 / R46（2026-09-24）】
//   ① 10 个人声切片改用**新代号**为权威值（1~10：anchorGreeting … joyfulClosing）；
//      旧 `sec-*` 降为**兼容别名**（MEDITATION_SECTION_CODE_ALIASES ⇒ 读侧归一、写侧只写新值）。
//   ② 4 个章换**新组 key**：section-start / section-breath / section-truth / section-end
//      （中文章节名值不变：问候库 / 呼吸库 / 心语库 / 告别库）。
//   ③ 新增第 9 段 innerIntegration（收摄能量・整合身心），末章（section-end）上限 30→90。
//   ④ 背景两轨 `sec-nature` / `sec-bowl` 与章 key `chapter-nature` / `chapter-bowl`
//      **保留原样**（仍为权威值，不给新代号）。

export const MEDITATION_CHAPTER_LABELS = Object.freeze({
  'chapter-nature': '自然库',
  'chapter-bowl': '颂钵库',
  'section-start': '问候库',
  'section-breath': '呼吸库',
  'section-truth': '心语库',
  'section-end': '告别库'
})

export const MEDITATION_TRACK_CHAPTER_TEMPLATE = Object.freeze([
  Object.freeze({
    chapter_key: 'chapter-nature',
    order: 1,
    label: MEDITATION_CHAPTER_LABELS['chapter-nature'],
    section_types: Object.freeze(['sec-nature']),
    max_duration_seconds: 300
  }),
  Object.freeze({
    chapter_key: 'chapter-bowl',
    order: 2,
    label: MEDITATION_CHAPTER_LABELS['chapter-bowl'],
    section_types: Object.freeze(['sec-bowl']),
    max_duration_seconds: 30
  }),
  Object.freeze({
    // 旧 key `chapter-opening` → 新 key `section-start`（问候库，段 1~4）
    chapter_key: 'section-start',
    order: 3,
    label: MEDITATION_CHAPTER_LABELS['section-start'],
    section_types: Object.freeze(['anchorGreeting', 'basePreparation', 'corpusAlignment', 'deeperAwareness']),
    max_duration_seconds: 130
  }),
  Object.freeze({
    // 旧 key `chapter-breath` → 新 key `section-breath`（呼吸库，段 5~6）
    chapter_key: 'section-breath',
    order: 4,
    label: MEDITATION_CHAPTER_LABELS['section-breath'],
    section_types: Object.freeze(['essentialBreath', 'flowingRespiration']),
    max_duration_seconds: 150
  }),
  Object.freeze({
    // 旧 key `chapter-verse` → 新 key `section-truth`（心语库，段 7~8）
    chapter_key: 'section-truth',
    order: 5,
    label: MEDITATION_CHAPTER_LABELS['section-truth'],
    section_types: Object.freeze(['gnosisElaboration', 'heartAffirmation']),
    max_duration_seconds: 270
  }),
  Object.freeze({
    // 旧 key `chapter-closing` → 新 key `section-end`（告别库，段 9~10）
    // 唯一数值变更：末章上限 30 → 90（容纳新增段 innerIntegration，顺序：收摄在前、回向在后）
    chapter_key: 'section-end',
    order: 6,
    label: MEDITATION_CHAPTER_LABELS['section-end'],
    section_types: Object.freeze(['innerIntegration', 'joyfulClosing']),
    max_duration_seconds: 90
  })
])

// 章间留白默认秒数（六章之间 5 个位置；最后一章固定 0）。
// 唯一常量落点：渲染/预估逻辑一律引用这里，不得在别处硬编码。
export const MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT = 141

// ─── Section 定义（12 种 ＝ 10 人声 + 2 背景） ────────────────────────────────

// 键＝新代号（背景 `sec-nature` / `sec-bowl` 保留原码），值＝中文名（逐字）。
export const MEDITATION_SECTION_TYPE_LABELS = Object.freeze({
  'sec-nature': '自然',
  'sec-bowl': '颂钵',
  anchorGreeting: '开场・同频问候', // ← 旧 sec-intro
  basePreparation: '场域安顿・静心入境', // ← 旧 sec-place
  corpusAlignment: '正身调姿・安身定气', // ← 旧 sec-posture
  deeperAwareness: '闭目觉察・温柔过渡', // ← 旧 sec-bridge
  essentialBreath: '调息锚定・呼吸引导前奏', // ← 旧 sec-prelude
  flowingRespiration: '三阶净息・平和呼吸练习', // ← 旧 sec-breath
  gnosisElaboration: '理悟立论・核心心法论证', // ← 旧 sec-verse
  heartAffirmation: '深度赋能・心语三遍复唱', // ← 旧 sec-chorus
  innerIntegration: '收摄能量・整合身心', // ← 新增段（无旧码）
  joyfulClosing: '圆满回向・祝福告别' // ← 旧 sec-outro
})

// 英文名（上屏并列用）。背景两轨由 Kevin 命名（2026-09-28，Zang 代录、**逐字照用**；
// 中文名不动，仍为「自然」/「颂钵」）；键序与 MEDITATION_SECTION_TYPE_LABELS 保持既有相对关系。
export const MEDITATION_SECTION_EN_LABELS = Object.freeze({
  'sec-nature': 'Nature Ambience', // Kevin 命名（2026-09-28）
  'sec-bowl': 'Singing Bowl', // Kevin 命名（2026-09-28）
  anchorGreeting: 'Anchor Greeting',
  basePreparation: 'Base Preparation',
  corpusAlignment: 'Corpus Alignment',
  deeperAwareness: 'Deeper Awareness',
  essentialBreath: 'Essential Breath',
  flowingRespiration: 'Flowing Respiration',
  gnosisElaboration: 'Gnosis Elaboration',
  heartAffirmation: 'Heart Affirmation',
  innerIntegration: 'Inner Integration',
  joyfulClosing: 'Joyful Closing'
})

// target_char_count 为硬约束；纯音频段（sec-nature / sec-bowl）不判字数。
// 数值逐项照旧，**唯一例外**＝新增段 innerIntegration：60s / 70 字；
// 末段 joyfulClosing 沿用原 sec-outro 的 30 / 40。
export const MEDITATION_SECTION_TYPE_META = Object.freeze({
  'sec-nature': Object.freeze({
    section_type: 'sec-nature',
    chapter_key: 'chapter-nature',
    label: MEDITATION_SECTION_TYPE_LABELS['sec-nature'],
    max_duration_seconds: 300,
    target_char_count: null,
    text_required: false
  }),
  'sec-bowl': Object.freeze({
    section_type: 'sec-bowl',
    chapter_key: 'chapter-bowl',
    label: MEDITATION_SECTION_TYPE_LABELS['sec-bowl'],
    max_duration_seconds: 30,
    target_char_count: null,
    text_required: false
  }),
  anchorGreeting: Object.freeze({
    section_type: 'anchorGreeting',
    chapter_key: 'section-start',
    label: MEDITATION_SECTION_TYPE_LABELS.anchorGreeting,
    max_duration_seconds: 20,
    target_char_count: 30,
    text_required: true
  }),
  basePreparation: Object.freeze({
    section_type: 'basePreparation',
    chapter_key: 'section-start',
    label: MEDITATION_SECTION_TYPE_LABELS.basePreparation,
    max_duration_seconds: 30,
    target_char_count: 40,
    text_required: true
  }),
  corpusAlignment: Object.freeze({
    section_type: 'corpusAlignment',
    chapter_key: 'section-start',
    label: MEDITATION_SECTION_TYPE_LABELS.corpusAlignment,
    max_duration_seconds: 40,
    target_char_count: 50,
    text_required: true
  }),
  deeperAwareness: Object.freeze({
    section_type: 'deeperAwareness',
    chapter_key: 'section-start',
    label: MEDITATION_SECTION_TYPE_LABELS.deeperAwareness,
    max_duration_seconds: 40,
    target_char_count: 50,
    text_required: true
  }),
  essentialBreath: Object.freeze({
    section_type: 'essentialBreath',
    chapter_key: 'section-breath',
    label: MEDITATION_SECTION_TYPE_LABELS.essentialBreath,
    max_duration_seconds: 70,
    target_char_count: 90,
    text_required: true
  }),
  flowingRespiration: Object.freeze({
    section_type: 'flowingRespiration',
    chapter_key: 'section-breath',
    label: MEDITATION_SECTION_TYPE_LABELS.flowingRespiration,
    max_duration_seconds: 80,
    target_char_count: 100,
    text_required: true
  }),
  gnosisElaboration: Object.freeze({
    section_type: 'gnosisElaboration',
    chapter_key: 'section-truth',
    label: MEDITATION_SECTION_TYPE_LABELS.gnosisElaboration,
    max_duration_seconds: 120,
    target_char_count: 150,
    text_required: true
  }),
  heartAffirmation: Object.freeze({
    section_type: 'heartAffirmation',
    chapter_key: 'section-truth',
    label: MEDITATION_SECTION_TYPE_LABELS.heartAffirmation,
    max_duration_seconds: 150,
    target_char_count: 40,
    text_required: true
  }),
  innerIntegration: Object.freeze({
    section_type: 'innerIntegration',
    chapter_key: 'section-end',
    label: MEDITATION_SECTION_TYPE_LABELS.innerIntegration,
    // 新增段：唯一数值新增（60s / 70 字）
    max_duration_seconds: 60,
    target_char_count: 70,
    text_required: true
  }),
  joyfulClosing: Object.freeze({
    section_type: 'joyfulClosing',
    chapter_key: 'section-end',
    label: MEDITATION_SECTION_TYPE_LABELS.joyfulClosing,
    max_duration_seconds: 30,
    target_char_count: 40,
    text_required: true
  })
})

export const MEDITATION_SECTION_TYPE_ORDER = Object.freeze([
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

// ─── 兼容层（旧码 → 新码）：写侧只写新值，读侧归一 ────────────────────────────
// 溯源：旧 9 项人声码在新体系里各自对应一个新代号，逐行保留旧→新对照。
export const MEDITATION_SECTION_CODE_ALIASES = Object.freeze({
  'sec-intro': 'anchorGreeting', // 开场・同频问候
  'sec-place': 'basePreparation', // 场域安顿・静心入境
  'sec-posture': 'corpusAlignment', // 正身调姿・安身定气
  'sec-bridge': 'deeperAwareness', // 闭目觉察・温柔过渡
  'sec-prelude': 'essentialBreath', // 调息锚定・呼吸引导前奏
  'sec-breath': 'flowingRespiration', // 三阶净息・平和呼吸练习
  'sec-verse': 'gnosisElaboration', // 理悟立论・核心心法论证
  'sec-chorus': 'heartAffirmation', // 深度赋能・心语三遍复唱
  'sec-outro': 'joyfulClosing' // 圆满回向・祝福告别
})

// 旧章 key → 新组 key（背景两章 key 未变、不入别名表）。
export const MEDITATION_CHAPTER_CODE_ALIASES = Object.freeze({
  'chapter-opening': 'section-start', // 问候库
  'chapter-breath': 'section-breath', // 呼吸库
  'chapter-verse': 'section-truth', // 心语库
  'chapter-closing': 'section-end' // 告别库
})

// 段码归一：trim → 已是权威段码原样返回 → 命中别名返回新码 → 其它**原样返回**（不吞、不猜、不抛）。
export const normalizeMeditationSectionCode = (value = '') => {
  const code = String(value ?? '').trim()
  if (MEDITATION_SECTION_TYPE_ORDER.includes(code)) {
    return code
  }
  return MEDITATION_SECTION_CODE_ALIASES[code] || code
}

// 章码归一：同上口径（背景两章 key 已是权威值，原样返回）。
export const normalizeMeditationChapterCode = (value = '') => {
  const code = String(value ?? '').trim()
  if (Object.prototype.hasOwnProperty.call(MEDITATION_CHAPTER_LABELS, code)) {
    return code
  }
  return MEDITATION_CHAPTER_CODE_ALIASES[code] || code
}

// 英文名查询（归一后查；背景/未知码 → 空串）。
export const getMeditationSectionEnglishLabel = (sectionType = '') => (
  MEDITATION_SECTION_EN_LABELS[normalizeMeditationSectionCode(sectionType)] || ''
)

// 上屏标签＝「中文名｜英文名」（英文名为空时只返回中文名）。
export const getMeditationSectionDisplayLabel = (sectionType = '') => {
  const code = normalizeMeditationSectionCode(sectionType)
  const chinese = MEDITATION_SECTION_TYPE_LABELS[code] || ''
  const english = MEDITATION_SECTION_EN_LABELS[code] || ''
  return english ? `${chinese}｜${english}` : chinese
}

// 上屏标签（带新代号）＝「中文名｜英文名（新代号）」。空值口径与上方一致：空 / null /
// undefined / 纯空白 ⇒ 空串（否则空壳标签「（）」会被下游 `||` 当**真值**吞掉回退）。
// 未知非空码仍出「（码）」（保持原样，不吞、不猜），已知码取值一字不变。
export const getMeditationSectionDisplayLabelWithCode = (sectionType = '') => {
  const code = normalizeMeditationSectionCode(sectionType)
  if (!code) {
    return ''
  }

  const chinese = MEDITATION_SECTION_TYPE_LABELS[code] || ''
  const english = MEDITATION_SECTION_EN_LABELS[code] || ''
  return english ? `${chinese}｜${english}（${code}）` : `${chinese}（${code}）`
}

// 按所属章分组（用于下拉 optgroup 与列表分组展示）。
export const MEDITATION_SECTION_TYPE_GROUPS = Object.freeze(
  MEDITATION_TRACK_CHAPTER_TEMPLATE.map((chapter) => Object.freeze({
    chapter_key: chapter.chapter_key,
    chapter_label: chapter.label,
    order: chapter.order,
    max_duration_seconds: chapter.max_duration_seconds,
    section_types: Object.freeze(chapter.section_types.map((sectionType) => MEDITATION_SECTION_TYPE_META[sectionType]))
  }))
)

// 纯音频段不经 Paragraph 文本链路（口径：不建 Section-Raw，直接建 med_section_audios）。
// 所有标签/元数据查询一律**先归一再查**，使旧码与新码查到同一结果。
export const getMeditationSectionTypeMeta = (sectionType = '') => (
  MEDITATION_SECTION_TYPE_META[normalizeMeditationSectionCode(sectionType)] || null
)

export const isMeditationAudioOnlySectionType = (sectionType = '') => (
  !getMeditationSectionTypeMeta(sectionType)?.text_required
)

export const getMeditationSectionTargetCharCount = (sectionType = '') => (
  getMeditationSectionTypeMeta(sectionType)?.target_char_count ?? null
)

// ─── Paragraph 类型 ↔ Section 类型 推荐匹配（不强制） ──────────────────────────

// Zang 2026-09-24 代裁：新增段落类型 `integration`，中文名「收摄」，
// 为新增段 innerIntegration 提供段落挂载能力；排在 `outro` 之前（新增段在末段之前）。
export const MEDITATION_PARAGRAPH_TYPE_ORDER = Object.freeze([
  'intro',
  'place',
  'posture',
  'bridge',
  'prelude',
  'breath',
  'verse',
  'chorus',
  'integration',
  'outro'
])

// 段落类型中文名（10 类）：键序与上表 MEDITATION_PARAGRAPH_TYPE_ORDER **逐项同序**
// （integration 收摄 排在 outro 圆满回向 之前）⇒ 派生下拉/筛选时可直接按序取值，无需再排。
export const MEDITATION_PARAGRAPH_TYPE_LABELS = Object.freeze({
  intro: '开场',
  place: '场域安顿',
  posture: '正身调姿',
  bridge: '闭目觉察',
  prelude: '调息锚定',
  breath: '三阶净息',
  verse: '理悟立论',
  chorus: '深度赋能',
  integration: '收摄',
  outro: '圆满回向'
})

// 段落类型上屏字母前缀（A~J）＝**按 MEDITATION_PARAGRAPH_TYPE_ORDER 的序派生**：A=intro、
// B=place、C=posture、D=bridge、E=prelude、F=breath、G=verse、H=chorus、I=integration、J=outro。
// **单点权威：字母↔段落类型映射只此一处，禁止在别处硬编码第二份。**
export const MEDITATION_PARAGRAPH_TYPE_LETTERS = Object.freeze(
  MEDITATION_PARAGRAPH_TYPE_ORDER.reduce((accumulator, paragraphType, index) => ({
    ...accumulator,
    [paragraphType]: String.fromCharCode(65 + index)
  }), {})
)

export const MEDITATION_PARAGRAPH_TYPE_TO_SECTION_TYPE = Object.freeze({
  intro: 'anchorGreeting',
  place: 'basePreparation',
  posture: 'corpusAlignment',
  bridge: 'deeperAwareness',
  prelude: 'essentialBreath',
  breath: 'flowingRespiration',
  verse: 'gnosisElaboration',
  chorus: 'heartAffirmation',
  integration: 'innerIntegration',
  outro: 'joyfulClosing'
})

export const getMeditationRecommendedSectionType = (paragraphType = '') => (
  MEDITATION_PARAGRAPH_TYPE_TO_SECTION_TYPE[paragraphType] || ''
)

const SECTION_TYPE_TO_PARAGRAPH_TYPES = Object.freeze(
  Object.entries(MEDITATION_PARAGRAPH_TYPE_TO_SECTION_TYPE).reduce((accumulator, [paragraphType, sectionType]) => ({
    ...accumulator,
    [sectionType]: [...(accumulator[sectionType] || []), paragraphType]
  }), {})
)

export const getMeditationSectionTypeParagraphTypes = (sectionType = '') => (
  SECTION_TYPE_TO_PARAGRAPH_TYPES[normalizeMeditationSectionCode(sectionType)] || []
)

export const isMeditationParagraphTypeMatchSectionType = (paragraphType = '', sectionType = '') => {
  if (!sectionType) {
    return true
  }

  const expectedTypes = getMeditationSectionTypeParagraphTypes(sectionType)
  if (expectedTypes.length === 0) {
    return false
  }

  return expectedTypes.includes(paragraphType)
}

// 段落类型上屏标签＝「字母 空格 中文名（代号）」（如 `A 开场（intro）`）。字母前缀由
// MEDITATION_PARAGRAPH_TYPE_ORDER 的序派生（A=intro … J=outro），**不硬编码**；括号**全角**
// （U+FF08 / U+FF09），与段名上屏的「（新代号）」同字形，不得用半角括号或其它字符。
// 归一风格与同文件 getMeditationSectionDisplayLabel 一致：先 `String(value ?? '').trim()`；
// 空值 / null / undefined ⇒ 空串；未知非空码**原样返回**（不吞、不猜、不自拟中文名）。
export const getMeditationParagraphTypeDisplayLabel = (paragraphType = '') => {
  const code = String(paragraphType ?? '').trim()
  if (!code) {
    return ''
  }

  const chinese = MEDITATION_PARAGRAPH_TYPE_LABELS[code]
  if (!chinese) {
    return code
  }

  const letter = MEDITATION_PARAGRAPH_TYPE_LETTERS[code]
  return letter ? `${letter} ${chinese}（${code}）` : `${chinese}（${code}）`
}

// ─── 字数硬、时长软 ──────────────────────────────────────────────────────────

export const MEDITATION_WORD_COUNT_STATUS = Object.freeze({
  ok: 'ok',
  slightlyOver: 'slightly_over',
  over: 'over',
  slightlyUnder: 'slightly_under',
  under: 'under'
})

export const MEDITATION_WORD_COUNT_STATUS_LABELS = Object.freeze({
  ok: '字数达标',
  slightly_over: '字数略超',
  over: '字数超限',
  slightly_under: '字数略少',
  under: '字数不足'
})

// 偏差 ≤10% = ok；>10% = slightly_over / slightly_under；>25% = over / under。
export const MEDITATION_WORD_COUNT_DEVIATION_THRESHOLDS = Object.freeze({
  slight: 0.1,
  severe: 0.25
})

export const countMeditationChars = (text = '') => String(text || '').length

export const countMeditationSectionChars = (paragraphTexts = []) => (
  (Array.isArray(paragraphTexts) ? paragraphTexts : [])
    .reduce((sum, text) => sum + countMeditationChars(text), 0)
)

// 录制文本快照：与 med_section_raws.text_snapshot 同口径（换行拼接）。
export const buildMeditationSectionRawTextSnapshot = (paragraphTexts = []) => (
  (Array.isArray(paragraphTexts) ? paragraphTexts : [])
    .map((text) => String(text || ''))
    .filter(Boolean)
    .join('\n')
)

export const resolveMeditationWordCountStatus = (currentCharCount, targetCharCount) => {
  const current = Number(currentCharCount)
  const target = Number(targetCharCount)

  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(current)) {
    return ''
  }

  const deviation = (current - target) / target
  const magnitude = Math.abs(deviation)
  const { slight, severe } = MEDITATION_WORD_COUNT_DEVIATION_THRESHOLDS

  if (magnitude <= slight) {
    return MEDITATION_WORD_COUNT_STATUS.ok
  }

  if (deviation > 0) {
    return magnitude > severe ? MEDITATION_WORD_COUNT_STATUS.over : MEDITATION_WORD_COUNT_STATUS.slightlyOver
  }

  return magnitude > severe ? MEDITATION_WORD_COUNT_STATUS.under : MEDITATION_WORD_COUNT_STATUS.slightlyUnder
}

export const getMeditationWordCountStatusTone = (status = '') => {
  if (status === MEDITATION_WORD_COUNT_STATUS.ok) {
    return 'ok'
  }

  if (status === MEDITATION_WORD_COUNT_STATUS.slightlyOver || status === MEDITATION_WORD_COUNT_STATUS.slightlyUnder) {
    return 'warning'
  }

  if (status === MEDITATION_WORD_COUNT_STATUS.over || status === MEDITATION_WORD_COUNT_STATUS.under) {
    return 'danger'
  }

  return 'muted'
}

export const MEDITATION_WORD_COUNT_STATUS_TONES = Object.freeze({
  ok: { color: '#16a34a', backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  warning: { color: '#b45309', backgroundColor: '#fffbeb', borderColor: '#fde047' },
  danger: { color: '#b91c1c', backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  muted: { color: '#64748b', backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }
})

// ─── Track 播放模型（双轨） ───────────────────────────────────────────────────

export const MEDITATION_TRACK_BACKGROUND_SECTION_TYPES = Object.freeze(['sec-nature', 'sec-bowl'])
export const MEDITATION_TRACK_VOICE_SECTION_TYPES = Object.freeze([
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

export const MEDITATION_TRACK_BACKGROUND_CONFIG = Object.freeze({
  section_types: MEDITATION_TRACK_BACKGROUND_SECTION_TYPES,
  playback_mode: 'loop',
  volume: MEDITATION_TRACK_VOLUMES.background
})

export const MEDITATION_TRACK_VOICE_CONFIG = Object.freeze({
  section_types: MEDITATION_TRACK_VOICE_SECTION_TYPES,
  playback_mode: 'sequence',
  volume: MEDITATION_TRACK_VOLUMES.voice
})

// ─── Track 时长预估（实测优先，无实测用标称值） ───────────────────────────────

export const buildMeditationTrackDurationEstimate = ({
  chapters = [],
  sectionDurationSecondsByType = {}
} = {}) => {
  const chapterEstimates = (Array.isArray(chapters) ? chapters : []).map((chapter) => {
    const sectionTypes = Array.isArray(chapter?.section_types) ? chapter.section_types : []
    const measuredSeconds = sectionTypes.map((sectionType) => {
      const measured = Number(sectionDurationSecondsByType?.[sectionType])
      return Number.isFinite(measured) && measured > 0 ? measured : null
    })
    const sectionSeconds = sectionTypes.reduce((sum, sectionType, index) => (
      sum + (measuredSeconds[index] ?? getMeditationSectionTypeMeta(sectionType)?.max_duration_seconds ?? 0)
    ), 0)

    return {
      chapter_key: chapter?.chapter_key || '',
      order: Number(chapter?.order ?? 0),
      label: chapter?.label || MEDITATION_CHAPTER_LABELS[normalizeMeditationChapterCode(chapter?.chapter_key)] || '',
      enabled: chapter?.enabled !== false,
      section_types: sectionTypes,
      seconds: sectionSeconds,
      max_duration_seconds: Number(chapter?.max_duration_seconds ?? 0),
      gap_after_seconds: Number(chapter?.gap_after_seconds ?? 0),
      has_measured_data: sectionTypes.length > 0 && measuredSeconds.every((value) => value !== null),
      exceeds_max_duration: sectionSeconds > Number(chapter?.max_duration_seconds ?? 0)
    }
  })

  const enabledChapters = chapterEstimates.filter((chapter) => chapter.enabled)
  const contentSeconds = enabledChapters.reduce((sum, chapter) => sum + chapter.seconds, 0)
  const gapSeconds = enabledChapters.reduce((sum, chapter) => sum + chapter.gap_after_seconds, 0)

  return {
    chapters: chapterEstimates,
    content_seconds: contentSeconds,
    gap_seconds: gapSeconds,
    total_seconds: contentSeconds + gapSeconds,
    // 有任何启用章缺实测数据即为「预估」（口径：无实测数据时用标称值并标注预估）。
    estimated: enabledChapters.some((chapter) => !chapter.has_measured_data)
  }
}
