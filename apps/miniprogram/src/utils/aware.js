const { getDb } = require('./cloudbase')
const { getLocalProfile } = require('./storage')

const AWARENESS_RECORDS = 'awareness_records'
const APP_SETTINGS = 'app_settings'
const AWARENESS_TAG_SETTINGS_KEY = 'awareness_tag_settings'
const AWARENESS_DISPLAY_SETTINGS_KEY = 'awareness_display_settings'
const AWARENESS_TAG_REUSE_MAX_LENGTH = 18
const DEFAULT_POPULAR_TAG_COUNT = 33
const POPULAR_TAG_RECORD_WINDOW = 5000
const RECORD_BATCH_LIMIT = 20

const getAwarenessTagLength = (value = '') => (
  Array.from(String(value || '')).reduce((total, character) => (
    total + (/[\u3400-\u9FFF\uF900-\uFAFF]/u.test(character) ? 2 : 1)
  ), 0)
)

const getTimestamp = (record = {}) =>
  record.created_at_client || record.timestamp || record.created_at || record.createdAt || ''

const getWeeklyStartTime = () => Date.now() - 7 * 24 * 60 * 60 * 1000

const normalizeRecord = (record = {}) => {
  const content = (record.content || '').trim()
  const accessType = record.access_type || record.accessType || 'public'

  return {
    id: record._id || record.id || '',
    tagKey: record.tag_key || `${content}::${accessType}`,
    content,
    accessType,
    userName: record.user_name || record.userName || '匿名用户',
    authorKey: record.author_key || record.authorKey || '',
    timestamp: getTimestamp(record)
  }
}

const buildTagProductCard = (product = {}) => {
  if (!(product.id || product._id)) {
    return null
  }

  return {
    id: product.id || product._id || '',
    name: product.name || '',
    subtitle: product.subtitle || product.description || '去工坊看看这件与你此刻觉察相关的物品。',
    coverImage: product.cover_image || product.coverImage || ''
  }
}

const resolveRelatedProductMap = async (relatedProductIds = []) => {
  const uniqueIds = [...new Set((relatedProductIds || []).filter(Boolean))]
  if (uniqueIds.length === 0) {
    return new Map()
  }

  try {
    const db = getDb()
    const productsResult = await Promise.all(uniqueIds.map((productId) => db.collection('shop_products').doc(productId).get()))
    return new Map(
      productsResult
        .map((result) => result.data || {})
        .filter((product) => product._id || product.id)
        .map((product) => [product._id || product.id, buildTagProductCard(product)])
    )
  } catch {
    return new Map()
  }
}

const getTagSettings = async () => {
  const db = getDb()
  const result = await db.collection(APP_SETTINGS).where({ key: AWARENESS_TAG_SETTINGS_KEY }).limit(1).get()
  const document = (result.data || [])[0]

  return {
    tagsByKey: document?.tags_by_key || document?.tagsByKey || {}
  }
}

const getAwarenessDisplaySettings = async () => {
  try {
    const db = getDb()
    const result = await db.collection(APP_SETTINGS).where({ key: AWARENESS_DISPLAY_SETTINGS_KEY }).limit(1).get()
    const document = (result.data || [])[0] || {}
    return {
      popularTagCount: Math.max(1, Number(document.popular_tag_count ?? document.popularTagCount ?? DEFAULT_POPULAR_TAG_COUNT))
    }
  } catch {
    return {
      popularTagCount: DEFAULT_POPULAR_TAG_COUNT
    }
  }
}

const buildWeeklySummary = (records = []) => {
  const weeklyStartTime = getWeeklyStartTime()
  const weeklyRecords = records.filter((record) => new Date(record.timestamp || 0).getTime() >= weeklyStartTime)
  const championMap = {}

  weeklyRecords.forEach((record) => {
    const userName = record.userName || '匿名用户'
    championMap[userName] = (championMap[userName] || 0) + 1
  })

  const championEntries = Object.entries(championMap).sort((left, right) => right[1] - left[1])

  return {
    weeklyCount: weeklyRecords.length,
    weeklyChampionName: championEntries[0]?.[0] || '',
    weeklyChampionCount: championEntries[0]?.[1] || 0
  }
}

const aggregateTags = (records = [], tagSettingsByKey = {}) => {
  const tagMap = {}

  records.forEach((record) => {
    if (!record.content) {
      return
    }

    const currentTag = tagMap[record.tagKey] || {
      key: record.tagKey,
      content: record.content,
      accessType: record.accessType,
      totalCount: 0,
      lastUsedAt: record.timestamp,
      lastUserName: record.userName || '匿名用户',
      description: tagSettingsByKey[record.tagKey]?.description || '',
      relatedProductId: tagSettingsByKey[record.tagKey]?.related_product_id || tagSettingsByKey[record.tagKey]?.relatedProductId || '',
      relatedProduct: null,
      weeklyCount: 0,
      weeklyChampionName: '',
      weeklyChampionCount: 0,
      participantKeys: []
    }

    currentTag.totalCount += 1
    currentTag.participantKeys = [...new Set([
      ...currentTag.participantKeys,
      record.authorKey || record.userName || ''
    ].filter(Boolean))]

    if (new Date(record.timestamp || 0).getTime() >= new Date(currentTag.lastUsedAt || 0).getTime()) {
      currentTag.lastUsedAt = record.timestamp
      currentTag.lastUserName = record.userName || '匿名用户'
    }

    currentTag.description = tagSettingsByKey[record.tagKey]?.description || ''
    currentTag.relatedProductId = tagSettingsByKey[record.tagKey]?.related_product_id || tagSettingsByKey[record.tagKey]?.relatedProductId || ''
    tagMap[record.tagKey] = currentTag
  })

  return Object.values(tagMap)
    .map((tag) => {
      const { participantKeys = [], ...rest } = tag
      return {
        ...rest,
        participantCount: participantKeys.length
      }
    })
    .sort((left, right) => {
      if (right.totalCount !== left.totalCount) {
        return right.totalCount - left.totalCount
      }

      return new Date(right.lastUsedAt || 0).getTime() - new Date(left.lastUsedAt || 0).getTime()
    })
}

const listRecentRecords = async (limit = 200) => {
  const db = getDb()
  const targetLimit = Math.max(1, Number(limit || 0))
  let offset = 0
  const records = []

  while (records.length < targetLimit) {
    const batchLimit = Math.min(RECORD_BATCH_LIMIT, targetLimit - records.length)
    const result = await db
      .collection(AWARENESS_RECORDS)
      .orderBy('createdAt', 'desc')
      .skip(offset)
      .limit(batchLimit)
      .get()

    const batchRecords = (result.data || []).map(normalizeRecord)
    records.push(...batchRecords)

    if (batchRecords.length < batchLimit) {
      break
    }

    offset += batchLimit
  }

  return records
}

const listPopularTags = async (limit = 0) => {
  const [records, settings, displaySettings] = await Promise.all([
    listRecentRecords(POPULAR_TAG_RECORD_WINDOW),
    getTagSettings(),
    getAwarenessDisplaySettings()
  ])

  const resolvedLimit = limit || displaySettings.popularTagCount || DEFAULT_POPULAR_TAG_COUNT
  const aggregatedTags = aggregateTags(records, settings.tagsByKey).slice(0, resolvedLimit)
  const relatedProductIds = [...new Set(aggregatedTags.map((tag) => tag.relatedProductId).filter(Boolean))]

  try {
    const productMap = await resolveRelatedProductMap(relatedProductIds)

    return aggregatedTags.map((tag) => ({
      ...tag,
      ...buildWeeklySummary(records.filter((record) => record.tagKey === tag.key)),
      relatedProduct: productMap.get(tag.relatedProductId) || null
    }))
  } catch {
    return aggregatedTags.map((tag) => ({
      ...tag,
      ...buildWeeklySummary(records.filter((record) => record.tagKey === tag.key))
    }))
  }
}

const getTagDetailByKey = async (tagKey = '') => {
  const normalizedTagKey = String(tagKey || '').trim()
  if (!normalizedTagKey) {
    return null
  }

  const db = getDb()
  const [recordsResult, settings] = await Promise.all([
    db.collection(AWARENESS_RECORDS).where({ tag_key: normalizedTagKey }).limit(500).get(),
    getTagSettings()
  ])

  const records = (recordsResult.data || []).map(normalizeRecord)
  if (records.length === 0) {
    return null
  }

  const tag = aggregateTags(records, settings.tagsByKey)[0] || null
  if (!tag) {
    return null
  }

  const productMap = await resolveRelatedProductMap([tag.relatedProductId])
  return {
    ...tag,
    ...buildWeeklySummary(records),
    relatedProduct: productMap.get(tag.relatedProductId) || null
  }
}

const listUserTags = async (limit = 20) => {
  const db = getDb()
  const profile = getLocalProfile()
  const [result, settings] = await Promise.all([
    db.collection(AWARENESS_RECORDS).where({ author_key: profile.authorKey }).orderBy('createdAt', 'desc').limit(300).get(),
    getTagSettings()
  ])

  return aggregateTags((result.data || []).map(normalizeRecord), settings.tagsByKey).slice(0, limit)
}

const publishAwareTag = async ({ content, accessType = 'public' }) => {
  const trimmedContent = (content || '').trim()
  if (!trimmedContent) {
    throw new Error('请输入标签内容')
  }

  if (getAwarenessTagLength(trimmedContent) > AWARENESS_TAG_REUSE_MAX_LENGTH) {
    throw new Error('标签长度不能超过 9 个汉字')
  }

  const db = getDb()
  const profile = getLocalProfile()
  const now = new Date().toISOString()

  const payload = {
    author_key: profile.authorKey,
    user_id: profile.authorKey,
    auth_uid: profile.authorKey,
    user_name: profile.name,
    content: trimmedContent,
    access_type: accessType,
    tag_key: `${trimmedContent}::${accessType}`,
    timestamp: now,
    created_at_client: now,
    createdAt: db.serverDate(),
    created_at: db.serverDate()
  }

  const result = await db.collection(AWARENESS_RECORDS).add({ data: payload })
  return {
    id: result._id || result.id || '',
    ...payload
  }
}

module.exports = {
  listRecentRecords,
  listPopularTags,
  listUserTags,
  publishAwareTag,
  getTagDetailByKey
}
