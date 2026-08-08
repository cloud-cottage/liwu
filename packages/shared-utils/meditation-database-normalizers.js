import { getDocumentId } from './cloudbase-document-helpers.js'
import {
  MEDITATION_AUDIO_GROUP_TEMPLATES,
  MEDITATION_AUDIO_LIBRARY_TYPES,
  getDefaultMeditationAudioGroupId
} from './meditation-audio-library.js'

const normalizeMeditationAudioItem = (item = {}) => ({
  id: item._id || item.id || '',
  type: item.type || 'bowl',
  groupId: item.group_id || item.groupId || '',
  title: item.title || '',
  fileId: item.file_id || item.fileId || '',
  audioUrl: item.audio_url || item.audioUrl || '',
  duration: Number(item.duration ?? 0),
  ttsText: item.tts_text || item.ttsText || '',
  isSSML: Boolean(item.is_ssml ?? item.isSSML ?? false),
  createdAt: item.created_at || item.createdAt || ''
})

const normalizeMeditationAudioGroup = (group = {}, fallbackType = 'bowl', fallbackIndex = 0) => {
  const nextType = group.type || fallbackType || 'bowl'
  const templateGroups = MEDITATION_AUDIO_GROUP_TEMPLATES[nextType] || []
  const templateMatch = templateGroups.find((templateGroup) => templateGroup.id === group.id || templateGroup.key === group.key)

  return {
    id: group.id || templateMatch?.id || `${nextType}-${fallbackIndex}`,
    type: nextType,
    key: group.key || templateMatch?.key || '',
    name: group.name || templateMatch?.name || '默认音频组',
    sortOrder: Number(group.sort_order ?? group.sortOrder ?? fallbackIndex)
  }
}

const buildNormalizedMeditationAudioGroups = (groups = []) => {
  const normalizedGroups = []
  const seenGroupIds = new Set()

  MEDITATION_AUDIO_LIBRARY_TYPES.forEach((type) => {
    const rawGroupsForType = Array.isArray(groups)
      ? groups.filter((group) => (group.type || type) === type)
      : []

    const sourceGroups = rawGroupsForType.length > 0
      ? rawGroupsForType
      : (MEDITATION_AUDIO_GROUP_TEMPLATES[type] || []).map((group) => ({ ...group, type }))

    sourceGroups
      .map((group, index) => normalizeMeditationAudioGroup(group, type, index))
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .forEach((group, index) => {
        const normalizedGroup = { ...group, sortOrder: index }
        if (!seenGroupIds.has(normalizedGroup.id)) {
          seenGroupIds.add(normalizedGroup.id)
          normalizedGroups.push(normalizedGroup)
        }
      })
  })

  return normalizedGroups
}

const resolveMeditationAudioItemGroupId = (item = {}, groups = []) => {
  const itemType = item.type || 'bowl'
  const requestedGroupId = item.groupId || item.group_id || ''

  if (requestedGroupId && groups.some((group) => group.id === requestedGroupId && group.type === itemType)) {
    return requestedGroupId
  }

  return groups.find((group) => group.type === itemType)?.id || getDefaultMeditationAudioGroupId(itemType)
}

export const normalizeMeditationAudioLibrary = (doc = {}) => ({
  documentId: getDocumentId(doc) || null,
  groups: buildNormalizedMeditationAudioGroups(doc.groups),
  items: (() => {
    const groups = buildNormalizedMeditationAudioGroups(doc.groups)
    return Array.isArray(doc.items)
      ? doc.items.map((item) => {
          const normalizedItem = normalizeMeditationAudioItem(item)
          return {
            ...normalizedItem,
            groupId: resolveMeditationAudioItemGroupId(normalizedItem, groups)
          }
        })
      : []
  })(),
  missingCollection: false
})

const normalizeMeditationSegment = (seg = {}) => ({
  id: seg.id || '',
  type: seg.type || 'bowl',
  groupId: seg.group_id || seg.groupId || getDefaultMeditationAudioGroupId(seg.type || 'bowl'),
  startSeconds: Number(seg.start_seconds ?? seg.startSeconds ?? 0),
  durationSeconds: Number(seg.duration_seconds ?? seg.durationSeconds ?? 0),
  audioItemId: seg.audio_item_id || seg.audioItemId || ''
})

export const normalizeMeditationCompositionSettings = (doc = {}) => ({
  documentId: getDocumentId(doc) || null,
  segments: Array.isArray(doc.segments) ? doc.segments.map(normalizeMeditationSegment) : [],
  missingCollection: false
})

const normalizeMeditationCalendarDay = (day = {}) => ({
  morning: day.morning || '',
  noon: day.noon || '',
  afternoon: day.afternoon || '',
  evening: day.evening || ''
})

export const normalizeMeditationCalendar = (doc = {}) => ({
  documentId: getDocumentId(doc) || null,
  days: Object.fromEntries(
    Object.entries(doc.days || {}).map(([dateKey, day]) => [dateKey, normalizeMeditationCalendarDay(day)])
  ),
  missingCollection: false
})

export const normalizeMeditationLibrary = (doc = {}) => ({
  documentId: getDocumentId(doc) || null,
  meditations: Array.isArray(doc.meditations) ? doc.meditations : [],
  missingCollection: false
})
