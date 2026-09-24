import { DEFAULT_MEDITATION_SESSION_SECONDS } from './meditation-session-plan.js'
import {
  MEDITATION_TRACK_BACKGROUND_CONFIG,
  MEDITATION_TRACK_CHAPTER_TEMPLATE,
  MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
  MEDITATION_TRACK_VOICE_CONFIG
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
  section_types: [...templateChapter.section_types]
})

export const normalizeMedTrackChapters = (chapters = []) => {
  const sourceChapters = Array.isArray(chapters) ? chapters : []

  return MEDITATION_TRACK_CHAPTER_TEMPLATE.map((templateChapter, index) => {
    const matchedChapter = sourceChapters.find((chapter) => chapter?.chapter_key === templateChapter.chapter_key)

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
