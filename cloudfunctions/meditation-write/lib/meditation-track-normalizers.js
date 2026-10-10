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

// ─── 部分更新：chapters 逐章合并（updateTrack 部分更新语义） ──────────────────────
// 规则（只更新传入的子字段，绝不重建未提及的章）：
//   · 按 `chapter_key` 定位（旧别名先归一）；**未出现的章原样保留**（不折回模板默认值）；
//   · 出现的章只覆盖传入的子字段（label / enabled / max_duration_seconds /
//     gap_after_seconds / slots），未传的子字段保留库内原值；
//   · `slots` 传入 ⇒ **整体替换该章槽位**（随后由调用方跑槽位校验 + 归一白名单）；未传 ⇒ 保留原值；
//   · 章序 `order` / `section_types` **不可由调用方改**（由模板派生，归一即折回模板）。
const TRACK_CHAPTER_OVERRIDABLE_KEYS = Object.freeze([
  'label',
  'enabled',
  'max_duration_seconds',
  'gap_after_seconds',
  'slots'
])

const mergeMedTrackChapterEntry = (existing = {}, patch = {}) => {
  const source = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}
  const incoming = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
  const merged = { ...source }

  TRACK_CHAPTER_OVERRIDABLE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      merged[key] = incoming[key] // slots ⇒ 整体替换（非逐槽合并）
    }
  })

  return merged
}

const resolveTrackChapterKey = (chapter = {}) => {
  const raw = chapter?.chapter_key
  const normalized = normalizeMeditationChapterCode(raw)
  return normalized || (raw != null ? String(raw).trim() : '')
}

const mergeMedTrackChapters = ({ incoming = [], existing = [] } = {}) => {
  const incomingList = Array.isArray(incoming) ? incoming : []
  const existingList = Array.isArray(existing) ? existing : []

  const incomingByKey = new Map()
  incomingList.forEach((chapter) => {
    const key = resolveTrackChapterKey(chapter)
    if (key && !incomingByKey.has(key)) {
      incomingByKey.set(key, chapter)
    }
  })
  const existingKeys = new Set(existingList.map((chapter) => resolveTrackChapterKey(chapter)))

  // 以库内章为基（保序、保原值），逐章按 key 覆盖传入子字段；未出现的章**原样保留**。
  const merged = existingList.map((chapter) => {
    const patch = incomingByKey.get(resolveTrackChapterKey(chapter))
    return patch ? mergeMedTrackChapterEntry(chapter, patch) : chapter
  })
  // 传入但库内不存在的章（罕见）⇒ 追加后由归一折回六章模板。
  incomingList.forEach((chapter) => {
    const key = resolveTrackChapterKey(chapter)
    if (key && !existingKeys.has(key)) {
      merged.push(chapter)
    }
  })

  // 归一（六章模板折回 + 槽位白名单 4 键）：对**已归一**文档幂等，故未提及的章逐字段保真。
  return normalizeMedTrackChapters(merged)
}

module.exports = {
  MEDITATION_TRACK_COLLECTION,
  MEDITATION_TRACK_DEFAULT_KEY,
  MEDITATION_TRACK_DEFAULT_NAME,
  createDefaultMeditationTrack,
  normalizeSlotSelector,
  normalizeChapterSlots,
  normalizeMedTrackChapters,
  mergeMedTrackChapterEntry,
  mergeMedTrackChapters,
  normalizeMedTrack,
  toMedTrackPayload
}
