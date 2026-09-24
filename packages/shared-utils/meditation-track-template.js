import { MEDITATION_TRACK_VOLUMES } from './meditation-session-plan.js'

// ─── 六章固定模板（meditation.admin.partner.spec.md 唯一口径） ──────────────────
// 顺序固定、不可改、不可重复；章内 Section 类型与顺序固定不可改。
// 管理员只能调整「章开关」「章时长上限」「章间留白秒数」。

export const MEDITATION_CHAPTER_LABELS = Object.freeze({
  'chapter-nature': '自然库',
  'chapter-bowl': '颂钵库',
  'chapter-opening': '问候库',
  'chapter-breath': '呼吸库',
  'chapter-verse': '心语库',
  'chapter-closing': '告别库'
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
    chapter_key: 'chapter-opening',
    order: 3,
    label: MEDITATION_CHAPTER_LABELS['chapter-opening'],
    section_types: Object.freeze(['sec-intro', 'sec-place', 'sec-posture', 'sec-bridge']),
    max_duration_seconds: 130
  }),
  Object.freeze({
    chapter_key: 'chapter-breath',
    order: 4,
    label: MEDITATION_CHAPTER_LABELS['chapter-breath'],
    section_types: Object.freeze(['sec-prelude', 'sec-breath']),
    max_duration_seconds: 150
  }),
  Object.freeze({
    chapter_key: 'chapter-verse',
    order: 5,
    label: MEDITATION_CHAPTER_LABELS['chapter-verse'],
    section_types: Object.freeze(['sec-verse', 'sec-chorus']),
    max_duration_seconds: 270
  }),
  Object.freeze({
    chapter_key: 'chapter-closing',
    order: 6,
    label: MEDITATION_CHAPTER_LABELS['chapter-closing'],
    section_types: Object.freeze(['sec-outro']),
    max_duration_seconds: 30
  })
])

// 章间留白默认秒数（六章之间 5 个位置；最后一章固定 0）。
// 唯一常量落点：渲染/预估逻辑一律引用这里，不得在别处硬编码。
export const MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT = 141

// ─── Section 定义（11 种） ────────────────────────────────────────────────────

export const MEDITATION_SECTION_TYPE_LABELS = Object.freeze({
  'sec-nature': '自然',
  'sec-bowl': '颂钵',
  'sec-intro': '开场问候',
  'sec-place': '安顿',
  'sec-posture': '坐姿',
  'sec-bridge': '过渡',
  'sec-prelude': '呼吸前奏',
  'sec-breath': '呼吸正文',
  'sec-verse': '心语正文',
  'sec-chorus': '心语复唱',
  'sec-outro': '告别'
})

// target_char_count 为硬约束；纯音频段（sec-nature / sec-bowl）不判字数。
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
  'sec-intro': Object.freeze({
    section_type: 'sec-intro',
    chapter_key: 'chapter-opening',
    label: MEDITATION_SECTION_TYPE_LABELS['sec-intro'],
    max_duration_seconds: 20,
    target_char_count: 30,
    text_required: true
  }),
  'sec-place': Object.freeze({
    section_type: 'sec-place',
    chapter_key: 'chapter-opening',
    label: MEDITATION_SECTION_TYPE_LABELS['sec-place'],
    max_duration_seconds: 30,
    target_char_count: 40,
    text_required: true
  }),
  'sec-posture': Object.freeze({
    section_type: 'sec-posture',
    chapter_key: 'chapter-opening',
    label: MEDITATION_SECTION_TYPE_LABELS['sec-posture'],
    max_duration_seconds: 40,
    target_char_count: 50,
    text_required: true
  }),
  'sec-bridge': Object.freeze({
    section_type: 'sec-bridge',
    chapter_key: 'chapter-opening',
    label: MEDITATION_SECTION_TYPE_LABELS['sec-bridge'],
    max_duration_seconds: 40,
    target_char_count: 50,
    text_required: true
  }),
  'sec-prelude': Object.freeze({
    section_type: 'sec-prelude',
    chapter_key: 'chapter-breath',
    label: MEDITATION_SECTION_TYPE_LABELS['sec-prelude'],
    max_duration_seconds: 70,
    target_char_count: 90,
    text_required: true
  }),
  'sec-breath': Object.freeze({
    section_type: 'sec-breath',
    chapter_key: 'chapter-breath',
    label: MEDITATION_SECTION_TYPE_LABELS['sec-breath'],
    max_duration_seconds: 80,
    target_char_count: 100,
    text_required: true
  }),
  'sec-verse': Object.freeze({
    section_type: 'sec-verse',
    chapter_key: 'chapter-verse',
    label: MEDITATION_SECTION_TYPE_LABELS['sec-verse'],
    max_duration_seconds: 120,
    target_char_count: 150,
    text_required: true
  }),
  'sec-chorus': Object.freeze({
    section_type: 'sec-chorus',
    chapter_key: 'chapter-verse',
    label: MEDITATION_SECTION_TYPE_LABELS['sec-chorus'],
    max_duration_seconds: 150,
    target_char_count: 40,
    text_required: true
  }),
  'sec-outro': Object.freeze({
    section_type: 'sec-outro',
    chapter_key: 'chapter-closing',
    label: MEDITATION_SECTION_TYPE_LABELS['sec-outro'],
    max_duration_seconds: 30,
    target_char_count: 40,
    text_required: true
  })
})

export const MEDITATION_SECTION_TYPE_ORDER = Object.freeze([
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
export const getMeditationSectionTypeMeta = (sectionType = '') => (
  MEDITATION_SECTION_TYPE_META[sectionType] || null
)

export const isMeditationAudioOnlySectionType = (sectionType = '') => (
  !getMeditationSectionTypeMeta(sectionType)?.text_required
)

export const getMeditationSectionTargetCharCount = (sectionType = '') => (
  getMeditationSectionTypeMeta(sectionType)?.target_char_count ?? null
)

// ─── Paragraph 类型 ↔ Section 类型 推荐匹配（不强制） ──────────────────────────

export const MEDITATION_PARAGRAPH_TYPE_ORDER = Object.freeze([
  'intro',
  'place',
  'posture',
  'bridge',
  'prelude',
  'breath',
  'verse',
  'chorus',
  'outro'
])

export const MEDITATION_PARAGRAPH_TYPE_TO_SECTION_TYPE = Object.freeze({
  intro: 'sec-intro',
  place: 'sec-place',
  posture: 'sec-posture',
  bridge: 'sec-bridge',
  prelude: 'sec-prelude',
  breath: 'sec-breath',
  verse: 'sec-verse',
  chorus: 'sec-chorus',
  outro: 'sec-outro'
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
  SECTION_TYPE_TO_PARAGRAPH_TYPES[sectionType] || []
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
      sum + (measuredSeconds[index] ?? MEDITATION_SECTION_TYPE_META[sectionType]?.max_duration_seconds ?? 0)
    ), 0)

    return {
      chapter_key: chapter?.chapter_key || '',
      order: Number(chapter?.order ?? 0),
      label: chapter?.label || MEDITATION_CHAPTER_LABELS[chapter?.chapter_key] || '',
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
