const { getDb } = require('./cloudbase')
const { getLocalProfile } = require('./storage')

const AWARENESS_RECORDS = 'awareness_records'
const APP_SETTINGS = 'app_settings'
const AWARENESS_TAG_SETTINGS_KEY = 'awareness_tag_settings'

const getTimestamp = (record = {}) =>
  record.created_at_client || record.timestamp || record.created_at || record.createdAt || ''

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

const getTagSettings = async () => {
  const db = getDb()
  const result = await db.collection(APP_SETTINGS).where({ key: AWARENESS_TAG_SETTINGS_KEY }).limit(1).get()
  const document = (result.data || [])[0]

  return {
    tagsByKey: document?.tags_by_key || document?.tagsByKey || {}
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
      description: tagSettingsByKey[record.tagKey]?.description || ''
    }

    currentTag.totalCount += 1

    if (new Date(record.timestamp || 0).getTime() >= new Date(currentTag.lastUsedAt || 0).getTime()) {
      currentTag.lastUsedAt = record.timestamp
      currentTag.lastUserName = record.userName || '匿名用户'
    }

    currentTag.description = tagSettingsByKey[record.tagKey]?.description || ''
    tagMap[record.tagKey] = currentTag
  })

  return Object.values(tagMap).sort((left, right) => {
    if (right.totalCount !== left.totalCount) {
      return right.totalCount - left.totalCount
    }

    return new Date(right.lastUsedAt || 0).getTime() - new Date(left.lastUsedAt || 0).getTime()
  })
}

const listRecentRecords = async (limit = 200) => {
  const db = getDb()
  const result = await db.collection(AWARENESS_RECORDS).orderBy('createdAt', 'desc').limit(limit).get()
  return (result.data || []).map(normalizeRecord)
}

const listPopularTags = async (limit = 20) => {
  const [records, settings] = await Promise.all([
    listRecentRecords(2000),
    getTagSettings()
  ])

  return aggregateTags(records, settings.tagsByKey).slice(0, limit)
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

  if (trimmedContent.length > 6) {
    throw new Error('标签长度不能超过 6 个字')
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
  publishAwareTag
}
