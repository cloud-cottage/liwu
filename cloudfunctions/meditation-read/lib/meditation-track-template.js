// ─── 六章固定模板 / Section 类型：只读云函数用的「精简等价模块」 ────────────────
//
// 【权威源（authoritative source）】
//   ① packages/shared-utils/meditation-track-template.js
//        MEDITATION_CHAPTER_LABELS / MEDITATION_TRACK_CHAPTER_TEMPLATE /
//        MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT / MEDITATION_SECTION_TYPE_LABELS /
//        MEDITATION_SECTION_EN_LABELS / MEDITATION_SECTION_TYPE_META /
//        MEDITATION_SECTION_TYPE_ORDER / MEDITATION_SECTION_CODE_ALIASES /
//        MEDITATION_CHAPTER_CODE_ALIASES / normalizeMeditationSectionCode /
//        normalizeMeditationChapterCode / MEDITATION_TRACK_BACKGROUND_CONFIG / MEDITATION_TRACK_VOICE_CONFIG /
//        MEDITATION_PARAGRAPH_TYPE_LABELS / getMeditationParagraphTypeDisplayLabel
//   ② packages/shared-utils/meditation-session-plan.js
//        MEDITATION_TRACK_VOLUMES（0.33 / 1）与 DEFAULT_MEDITATION_SESSION_SECONDS（15 分钟基准）
//
// 云函数（SCF）只打包函数目录，**不能** require 仓库内共享模块（Zang 裁定 D-B2-8）⇒ 本副本。
// 【同步责任】权威源里上述导出的改动（章名 / Section 名 / 章内 Section 序列 / 章时长上限 /
//   留白默认值 / 音量 / 命名别名与归一）**必须同步本文件**；责任方＝修改权威源的人；不一致时**以权威源为准**。
//
// 【命名体系变更 v4.18 / R46（2026-09-24）】
//   - 10 个人声切片改用**新代号**为权威值（1~10：anchorGreeting … joyfulClosing），
//     旧 `sec-*` 降为**兼容别名**（MEDITATION_SECTION_CODE_ALIASES ⇒ 读侧归一、写侧只写新值）。
//   - 4 个章换**新组 key**：section-start / section-breath / section-truth / section-end
//     （中文章节名值不变：问候库 / 呼吸库 / 心语库 / 告别库）。
//   - 新增第 9 段 innerIntegration（收摄能量・整合身心）；末章（section-end）上限 30→90，
//     段序列＝[innerIntegration, joyfulClosing]（收摄在前、回向在后）。
//   - 背景两轨 `sec-nature` / `sec-bowl` 与章 key `chapter-nature` / `chapter-bowl` **保留原样**。
//
// 规范依据（docs/meditation.admin.partner.spec.md v4.6）：
//   - 六章顺序固定、不可重复；章内 Section 序列固定、**只读**（R10：数据不得覆盖模板顺序）。
//   - Section 名 / 章节名的**源是代码常量**，规范内对照表只是镜像（R21）。
//   - 章间留白默认 `141`（末章固定 0），**禁止在代码中硬编码**（此处即唯一常量落点，与权威源同值）。
//   - 双轨播放：背景 `sec-nature` / `sec-bowl` 走 `loop`、人声 10 类走 `sequence`（§5、D3）。

const MEDITATION_TRACK_VOLUMES = Object.freeze({
  background: 0.33,
  voice: 1
})

const DEFAULT_MEDITATION_SESSION_SECONDS = 15 * 60

const MEDITATION_CHAPTER_LABELS = Object.freeze({
  'chapter-nature': '自然库',
  'chapter-bowl': '颂钵库',
  'section-start': '问候库',
  'section-breath': '呼吸库',
  'section-truth': '心语库',
  'section-end': '告别库'
})

const MEDITATION_TRACK_CHAPTER_TEMPLATE = Object.freeze([
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
    // 旧 key `chapter-closing` → 新 key `section-end`（告别库，段 9~10）；末章上限 30→90
    chapter_key: 'section-end',
    order: 6,
    label: MEDITATION_CHAPTER_LABELS['section-end'],
    section_types: Object.freeze(['innerIntegration', 'joyfulClosing']),
    max_duration_seconds: 90
  })
])

// 章间留白默认秒数（六章之间 5 个位置；最后一章固定 0）。
const MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT = 141

// 键＝新代号（背景 `sec-nature` / `sec-bowl` 保留原码），值＝中文名（逐字）。
const MEDITATION_SECTION_TYPE_LABELS = Object.freeze({
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

// 英文名（上屏并列用，与权威源**同值同序**）。背景两轨由 Kevin 命名（2026-09-28，Zang 代录、
// **逐字照用**；中文名不动，仍为「自然」/「颂钵」）。
const MEDITATION_SECTION_EN_LABELS = Object.freeze({
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

// 数值逐项照旧；唯一例外＝新增段 innerIntegration（60s / 70 字），末段沿用原 sec-outro 的 30 / 40。
const MEDITATION_SECTION_TYPE_META = Object.freeze({
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

const MEDITATION_SECTION_TYPE_ORDER = Object.freeze([
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
const MEDITATION_SECTION_CODE_ALIASES = Object.freeze({
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
const MEDITATION_CHAPTER_CODE_ALIASES = Object.freeze({
  'chapter-opening': 'section-start', // 问候库
  'chapter-breath': 'section-breath', // 呼吸库
  'chapter-verse': 'section-truth', // 心语库
  'chapter-closing': 'section-end' // 告别库
})

// 段码归一：trim → 已是权威段码原样返回 → 命中别名返回新码 → 其它**原样返回**（不吞、不猜、不抛）。
const normalizeMeditationSectionCode = (value = '') => {
  const code = String(value ?? '').trim()
  if (MEDITATION_SECTION_TYPE_ORDER.includes(code)) {
    return code
  }
  return MEDITATION_SECTION_CODE_ALIASES[code] || code
}

// 章码归一：同上口径（背景两章 key 已是权威值，原样返回）。
const normalizeMeditationChapterCode = (value = '') => {
  const code = String(value ?? '').trim()
  if (Object.prototype.hasOwnProperty.call(MEDITATION_CHAPTER_LABELS, code)) {
    return code
  }
  return MEDITATION_CHAPTER_CODE_ALIASES[code] || code
}

// 英文名查询（归一后查；背景/未知码 → 空串）。
const getMeditationSectionEnglishLabel = (sectionType = '') => (
  MEDITATION_SECTION_EN_LABELS[normalizeMeditationSectionCode(sectionType)] || ''
)

// 上屏标签＝「中文名｜英文名」（英文名为空时只返回中文名）。
const getMeditationSectionDisplayLabel = (sectionType = '') => {
  const code = normalizeMeditationSectionCode(sectionType)
  const chinese = MEDITATION_SECTION_TYPE_LABELS[code] || ''
  const english = MEDITATION_SECTION_EN_LABELS[code] || ''
  return english ? `${chinese}｜${english}` : chinese
}

// 上屏标签（带新代号）＝「中文名｜英文名（新代号）」。空值口径与权威源一致：空 / null /
// undefined / 纯空白 ⇒ 空串（否则空壳标签「（）」会被下游 `||` 当**真值**吞掉回退）。
const getMeditationSectionDisplayLabelWithCode = (sectionType = '') => {
  const code = normalizeMeditationSectionCode(sectionType)
  if (!code) {
    return ''
  }

  const chinese = MEDITATION_SECTION_TYPE_LABELS[code] || ''
  const english = MEDITATION_SECTION_EN_LABELS[code] || ''
  return english ? `${chinese}｜${english}（${code}）` : `${chinese}（${code}）`
}

// 元数据查询：**先归一再查**，使旧码与新码查到同一结果。
const getMeditationSectionTypeMeta = (sectionType = '') => (
  MEDITATION_SECTION_TYPE_META[normalizeMeditationSectionCode(sectionType)] || null
)

// ─── 段落类型（Paragraph）中文名与上屏标签：与权威源**同值同序** ──────────────
// 键序＝权威源 MEDITATION_PARAGRAPH_TYPE_ORDER 的逐项同序（integration 收摄 在 outro 圆满回向 之前）。
const MEDITATION_PARAGRAPH_TYPE_LABELS = Object.freeze({
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

// 上屏标签＝「中文名（代号）」；括号**全角**（U+FF08 / U+FF09）。
// 归一风格与同文件 getMeditationSectionDisplayLabel 一致：空值 / null / undefined ⇒ 空串；
// 未知非空码**原样返回**（不吞、不猜、不自拟中文名）。
const getMeditationParagraphTypeDisplayLabel = (paragraphType = '') => {
  const code = String(paragraphType ?? '').trim()
  if (!code) {
    return ''
  }

  const chinese = MEDITATION_PARAGRAPH_TYPE_LABELS[code]
  return chinese ? `${chinese}（${code}）` : code
}

const MEDITATION_TRACK_BACKGROUND_SECTION_TYPES = Object.freeze(['sec-nature', 'sec-bowl'])

const MEDITATION_TRACK_VOICE_SECTION_TYPES = Object.freeze([
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

const MEDITATION_TRACK_BACKGROUND_CONFIG = Object.freeze({
  section_types: MEDITATION_TRACK_BACKGROUND_SECTION_TYPES,
  playback_mode: 'loop',
  volume: MEDITATION_TRACK_VOLUMES.background
})

const MEDITATION_TRACK_VOICE_CONFIG = Object.freeze({
  section_types: MEDITATION_TRACK_VOICE_SECTION_TYPES,
  playback_mode: 'sequence',
  volume: MEDITATION_TRACK_VOLUMES.voice
})

// 段码合法性判定：归一后判定（旧码在新体系下仍视为已知段）。
const isMeditationSectionType = (sectionType = '') => MEDITATION_SECTION_TYPE_ORDER.includes(
  normalizeMeditationSectionCode(sectionType)
)

module.exports = {
  MEDITATION_TRACK_VOLUMES,
  DEFAULT_MEDITATION_SESSION_SECONDS,
  MEDITATION_CHAPTER_LABELS,
  MEDITATION_TRACK_CHAPTER_TEMPLATE,
  MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
  MEDITATION_SECTION_TYPE_LABELS,
  MEDITATION_SECTION_EN_LABELS,
  MEDITATION_SECTION_TYPE_META,
  MEDITATION_SECTION_TYPE_ORDER,
  MEDITATION_SECTION_CODE_ALIASES,
  MEDITATION_CHAPTER_CODE_ALIASES,
  MEDITATION_PARAGRAPH_TYPE_LABELS,
  getMeditationParagraphTypeDisplayLabel,
  normalizeMeditationSectionCode,
  normalizeMeditationChapterCode,
  getMeditationSectionEnglishLabel,
  getMeditationSectionDisplayLabel,
  getMeditationSectionDisplayLabelWithCode,
  getMeditationSectionTypeMeta,
  MEDITATION_TRACK_BACKGROUND_SECTION_TYPES,
  MEDITATION_TRACK_VOICE_SECTION_TYPES,
  MEDITATION_TRACK_BACKGROUND_CONFIG,
  MEDITATION_TRACK_VOICE_CONFIG,
  isMeditationSectionType
}
