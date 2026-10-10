// ─── med_tracks 规范化：写侧云函数（meditation-write）用的「精简等价模块」 ──────────────
//
// 【权威源（authoritative source）】packages/shared-utils/meditation-track-normalizers.js
//   云函数（SCF）只打包函数目录，**不能** require 仓库内共享模块（Zang 裁定 D-B2-8）⇒ 本副本。
//   与只读云函数的同名副本（cloudfunctions/meditation-read/lib/meditation-track-normalizers.js）
//   的差异＝**只为写侧多搬运** `createDefaultMeditationTrack` / `toMedTrackPayload`（读侧不用）；
//   归一规则（槽位白名单、章序折回、末章留白固定 0、脏值回退默认）**逐字一致**。
//
// 【同步责任】权威源里导出与归一化规则的任一改动 **必须同时同步本文件与只读侧副本**；
//   责任方＝修改权威源的人；不一致时**一律以权威源为准**。
//
// 规范依据（docs/meditation.admin.partner.spec.md）：
//   - §med_tracks 字段定义 + **R10**：章序 / 章内 Section 序列**只读**，脏文档一律折回六章模板；
//   - **R49-② / R49-③**：`chapters[].slots[]` 槽位白名单只含 `slot_index` / `section_type` /
//     `selector` / `policy`，**绝不放行任何 URL / file_id**（对齐 R39-⑥）；无 `slots` 的老 Track
//     ⇒ 空数组（不迁移）；
//   - `version` 新建从 `1` 起、每次成功保存 +1（R5）——本模块只做归一，不自作改写既有 `version`。

const {
  MEDITATION_TRACK_CHAPTER_TEMPLATE,
  MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
  MEDITATION_TRACK_BACKGROUND_CONFIG,
  MEDITATION_TRACK_VOICE_CONFIG,
  MEDITATION_TRACK_SLOT_POLICIES,
  MEDITATION_TRACK_SLOT_SELECTOR_KINDS,
  DEFAULT_MEDITATION_SESSION_SECONDS,
  normalizeMeditationChapterCode
} = require('./meditation-track-template.js')

const MEDITATION_TRACK_COLLECTION = 'med_tracks'
const MEDITATION_TRACK_DEFAULT_KEY = 'track-default'
const MEDITATION_TRACK_DEFAULT_NAME = '默认冥想轨道'

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
// （D6 字段白名单，R39-⑥）。selector 只认 `pinned(audio_id)` / `pool(section_type, tags[])`。
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

const normalizeChapterSlots = (slots = []) => (
  (Array.isArray(slots) ? slots : [])
    .map((slot, index) => {
      if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
        return null
      }

      const selector = normalizeSlotSelector(slot.selector)
      const declaredSectionType = slot.section_type != null ? String(slot.section_type).trim() : ''
      const sectionType = declaredSectionType || (selector ? selector.section_type : '') || ''
      const rawSlotIndex = Number(slot.slot_index)
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
  // 槽位（R49-②）：有序槽位数组；**无 `slots` 的老 Track ⇒ 空数组**（R49-③ 向后兼容）。
  slots: normalizeChapterSlots(chapter.slots)
})

const normalizeMedTrackChapters = (chapters = []) => {
  const sourceChapters = Array.isArray(chapters) ? chapters : []

  return MEDITATION_TRACK_CHAPTER_TEMPLATE.map((templateChapter, index) => {
    // 读侧归一：库里的旧章 key 归一到新组 key 后与模板比对（旧值章也能取回自己的留白 / 上限 / 开关），
    // 折回结果的章 key 与段码一律为新值（R10：数据不得覆盖模板顺序）。
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

const createDefaultMeditationTrack = ({
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

const normalizeMedTrack = (doc = {}) => {
  // 入参归一（C25，与权威源同口径）：显式 `null` 与 `undefined` **同等**处理。
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

const toMedTrackPayload = (track = {}) => {
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

module.exports = {
  MEDITATION_TRACK_COLLECTION,
  MEDITATION_TRACK_DEFAULT_KEY,
  MEDITATION_TRACK_DEFAULT_NAME,
  createDefaultMeditationTrack,
  normalizeSlotSelector,
  normalizeChapterSlots,
  normalizeMedTrackChapters,
  normalizeMedTrack,
  toMedTrackPayload
}
