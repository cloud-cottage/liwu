import { DEFAULT_MEDITATION_SESSION_SECONDS } from './meditation-session-plan.js'
import {
  MEDITATION_TRACK_BACKGROUND_CONFIG,
  MEDITATION_TRACK_CHAPTER_TEMPLATE,
  MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
  MEDITATION_TRACK_SLOT_POLICIES,
  MEDITATION_TRACK_SLOT_SELECTOR_KINDS,
  MEDITATION_TRACK_VOICE_CONFIG,
  normalizeMeditationChapterCode
} from './meditation-track-template.js'

// ─── med_tracks（CloudBase 集合）规范化 ──────────────────────────────────────
// 字段严格对齐 meditation.admin.partner.spec.md「med_tracks」定义。
// 章节结构由固定模板决定：顺序、数量、章内 Section 序列一律不可由数据覆盖。

export const MEDITATION_TRACK_COLLECTION = 'med_tracks'
export const MEDITATION_TRACK_DEFAULT_KEY = 'track-default'
export const MEDITATION_TRACK_DEFAULT_NAME = '默认冥想轨道'

const toPositiveNumber = (value, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

const toNonNegativeNumber = (value, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

// ─── 槽位归一（R49-②；字段白名单硬约束） ───────────────────────────────────
// 只保留 `slot_index` / `section_type` / `selector` / `policy` —— **绝不放行任何 URL / file_id**
// （D6 字段白名单，R39-⑥）。selector 只认 `pinned(audio_id)` / `pool(section_type, tags[])`；
// 无法判定 ⇒ selector 为 null（槽位仍保留，供端侧识别与告警，不静默丢序）。
const normalizeSlotSelector = (selector) => {
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
    return null
  }

  const kind = selector.kind != null ? String(selector.kind).trim() : ''

  if (kind === MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pinned) {
    const audioId = selector.audio_id != null ? String(selector.audio_id).trim() : ''
    return audioId ? { kind: MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pinned, audio_id: audioId } : null
  }

  if (kind === MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pool) {
    const sectionType = selector.section_type != null ? String(selector.section_type).trim() : ''
    const tags = (Array.isArray(selector.tags) ? selector.tags : [])
      .map((tag) => String(tag).trim())
      .filter(Boolean)
    return sectionType
      ? { kind: MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pool, section_type: sectionType, tags }
      : null
  }

  return null
}

export const normalizeChapterSlots = (slots = []) => (
  (Array.isArray(slots) ? slots : [])
    .map((slot, index) => {
      if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
        return null
      }

      const selector = normalizeSlotSelector(slot.selector)
      const declaredSectionType = slot.section_type != null ? String(slot.section_type).trim() : ''
      const sectionType = declaredSectionType || (selector ? selector.section_type : '') || ''
      const rawSlotIndex = Number(slot.slot_index)
      // `slot_index`＝该槽在章内的顺序号；缺失 / 非法时**防御性**回退数组下标（D6 正常路径恒有值）。
      const slotIndex = Number.isInteger(rawSlotIndex) && rawSlotIndex >= 0 ? rawSlotIndex : index
      const policy = (slot.policy != null ? String(slot.policy).trim() : '') || MEDITATION_TRACK_SLOT_POLICIES.random

      return { slot_index: slotIndex, section_type: sectionType, selector, policy }
    })
    .filter(Boolean)
)

const normalizeChapterEntry = (chapter = {}, templateChapter = {}, isLastChapter = false) => ({
  chapter_key: templateChapter.chapter_key,
  order: templateChapter.order,
  label: chapter.label || templateChapter.label,
  enabled: chapter.enabled !== false,
  max_duration_seconds: toPositiveNumber(chapter.max_duration_seconds, templateChapter.max_duration_seconds),
  // 章间留白只在六章之间有效：最后一章固定 0。
  gap_after_seconds: isLastChapter
    ? 0
    : toNonNegativeNumber(chapter.gap_after_seconds, MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT),
  section_types: [...templateChapter.section_types],
  // 槽位（R49-②）：有序槽位数组；**无 `slots` 的老 Track ⇒ 空数组**（R49-③ 向后兼容，
  // 端侧据「空数组 ⇒ 回退旧 `section_types` 一类型一槽语义」）。
  slots: normalizeChapterSlots(chapter.slots)
})

export const normalizeMedTrackChapters = (chapters = []) => {
  const sourceChapters = Array.isArray(chapters) ? chapters : []

  return MEDITATION_TRACK_CHAPTER_TEMPLATE.map((templateChapter, index) => {
    // 读侧归一：库里的旧章 key（chapter-opening / chapter-breath / chapter-verse / chapter-closing）
    // 归一到新组 key（section-start / section-breath / section-truth / section-end）后与模板比对，
    // 使旧值章也能取回自己的 `gap_after_seconds` / `max_duration_seconds` / `enabled`（折回仍是新 key）。
    const matchedChapter = sourceChapters.find((chapter) => (
      normalizeMeditationChapterCode(chapter?.chapter_key) === templateChapter.chapter_key
    ))

    return normalizeChapterEntry(
      matchedChapter || {},
      templateChapter,
      index === MEDITATION_TRACK_CHAPTER_TEMPLATE.length - 1
    )
  })
}

export const createDefaultMeditationTrack = ({
  trackKey = MEDITATION_TRACK_DEFAULT_KEY,
  name = MEDITATION_TRACK_DEFAULT_NAME,
  createdBy = ''
} = {}) => {
  const now = new Date().toISOString()

  return {
    track_key: trackKey,
    name,
    description: '',
    enabled: true,
    is_default: true,
    version: 1,
    total_target_seconds: DEFAULT_MEDITATION_SESSION_SECONDS,
    chapters: normalizeMedTrackChapters([]),
    background_track: { ...MEDITATION_TRACK_BACKGROUND_CONFIG },
    voice_track: { ...MEDITATION_TRACK_VOICE_CONFIG },
    created_at: now,
    updated_at: now,
    created_by: createdBy
  }
}

// 默认种子 Track（六章固定模板顺序 + 章间留白默认 141 秒）。
export const DEFAULT_MEDITATION_TRACK = createDefaultMeditationTrack()

export const normalizeMedTrack = (doc = {}) => {
  // 入参归一（C25）：显式 `null` 与 `undefined` **同等**处理，都走 `= {}` 的既有默认路径。
  // 否则下一行取 `doc._id` 会抛 TypeError: Cannot read properties of null (reading '_id')。
  doc = doc ?? {}
  const now = new Date().toISOString()
  const id = doc._id || doc.id || ''

  return {
    _id: id,
    id,
    track_key: doc.track_key || MEDITATION_TRACK_DEFAULT_KEY,
    name: doc.name || MEDITATION_TRACK_DEFAULT_NAME,
    description: doc.description || '',
    enabled: doc.enabled !== false,
    is_default: doc.is_default !== false,
    version: toPositiveNumber(doc.version, 1),
    total_target_seconds: toPositiveNumber(doc.total_target_seconds, DEFAULT_MEDITATION_SESSION_SECONDS),
    chapters: normalizeMedTrackChapters(doc.chapters),
    background_track: { ...MEDITATION_TRACK_BACKGROUND_CONFIG },
    voice_track: { ...MEDITATION_TRACK_VOICE_CONFIG },
    created_at: doc.created_at || now,
    updated_at: doc.updated_at || now,
    created_by: doc.created_by || '',
    updated_by: doc.updated_by || ''
  }
}

export const toMedTrackPayload = (track = {}) => {
  const normalizedTrack = normalizeMedTrack(track)

  return {
    track_key: normalizedTrack.track_key,
    name: normalizedTrack.name,
    description: normalizedTrack.description,
    enabled: normalizedTrack.enabled,
    is_default: normalizedTrack.is_default,
    version: normalizedTrack.version,
    total_target_seconds: normalizedTrack.total_target_seconds,
    chapters: normalizedTrack.chapters,
    background_track: normalizedTrack.background_track,
    voice_track: normalizedTrack.voice_track,
    updated_by: normalizedTrack.updated_by
  }
}
