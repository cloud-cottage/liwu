import { getDocumentId } from './cloudbase-document-helpers.js'

export const normalizeAwarenessTagSettingEntry = (entry = {}) => ({
  description: entry.description || '',
  rewardPoints: Math.max(0, Number(entry.reward_points ?? entry.rewardPoints ?? 0)),
  relatedProductId: entry.related_product_id || entry.relatedProductId || ''
})

export const normalizeAwarenessTagSettingsMap = (tagsByKey = {}) => (
  Object.fromEntries(
    Object.entries(tagsByKey || {}).map(([tagKey, entry]) => [tagKey, normalizeAwarenessTagSettingEntry(entry)])
  )
)

export const normalizeAwarenessTagSettings = (settings = {}, { normalizeEntries = false } = {}) => ({
  documentId: getDocumentId(settings) || null,
  tagsByKey: normalizeEntries
    ? normalizeAwarenessTagSettingsMap(settings.tags_by_key || settings.tagsByKey || {})
    : (settings.tags_by_key || settings.tagsByKey || {}),
  missingCollection: false
})

export const toAwarenessTagSettingsPayload = (settingsData, settingsKey, { normalizeEntries = false } = {}) => ({
  key: settingsKey,
  tags_by_key: normalizeEntries
    ? Object.fromEntries(
      Object.entries(settingsData.tagsByKey || {}).map(([tagKey, entry]) => [
        tagKey,
        normalizeAwarenessTagSettingEntry(entry)
      ])
    )
    : (settingsData.tagsByKey || {})
})