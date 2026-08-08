import { getDocumentId } from './cloudbase-document-helpers.js'
import { buildDefaultUserName } from './cloudbase-user-identity.js'

export const normalizeAccessType = (value) => (value === 'student' ? 'student' : 'public')

export const getRecordTimestamp = (record = {}) =>
  record.created_at_client || record.timestamp || record.created_at || record.createdAt || null

export const normalizeAwarenessRecord = (record = {}) => {
  const content = (record.content || '').trim()
  const accessType = normalizeAccessType(record.access_type || record.accessType)

  return {
    id: getDocumentId(record),
    authorKey: record.author_key || record.authorKey || record.auth_uid || record.user_id || '',
    userId: record.user_id || record.userId || '',
    authUid: record.auth_uid || record.authUid || '',
    userName: record.user_name || record.userName || '匿名用户',
    content,
    accessType,
    tagKey: record.tag_key || `${content}::${accessType}`,
    shortCode: record.share_tag_code || record.shareTagCode || '',
    recordSource: record.record_source || record.recordSource || 'manual',
    timestamp: getRecordTimestamp(record),
    rewardPointsAwarded: Math.max(0, Number(record.reward_points_awarded ?? record.rewardPointsAwarded ?? 0))
  }
}

export const groupAwarenessTags = (records, countField, tagSettingsByKey = {}) => {
  const tagMap = new Map()

  records.forEach((record) => {
    if (!record.content) {
      return
    }

    const existingTag = tagMap.get(record.tagKey) || {
      key: record.tagKey,
      content: record.content,
      accessType: record.accessType,
      [countField]: 0,
      rewardPoints: tagSettingsByKey[record.tagKey]?.rewardPoints || 0,
      totalRewardPoints: 0,
      lastUsedAt: record.timestamp,
      lastUserName: record.userName || '匿名用户',
      description: tagSettingsByKey[record.tagKey]?.description || ''
    }

    existingTag[countField] += 1
    existingTag.totalRewardPoints += Math.max(0, Number(record.rewardPointsAwarded || 0))

    if (new Date(record.timestamp || 0).getTime() >= new Date(existingTag.lastUsedAt || 0).getTime()) {
      existingTag.lastUsedAt = record.timestamp
      existingTag.lastUserName = record.userName || '匿名用户'
    }

    existingTag.description = tagSettingsByKey[record.tagKey]?.description || ''
    existingTag.rewardPoints = tagSettingsByKey[record.tagKey]?.rewardPoints || 0

    tagMap.set(record.tagKey, existingTag)
  })

  return Array.from(tagMap.values()).sort((left, right) => {
    if (right[countField] !== left[countField]) {
      return right[countField] - left[countField]
    }

    return new Date(right.lastUsedAt || 0).getTime() - new Date(left.lastUsedAt || 0).getTime()
  })
}

export const buildShareLinks = ({ title, text, url }) => {
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(text)

  return {
    weibo: `https://service.weibo.com/share/share.php?title=${encodedText}&url=${encodedUrl}`,
    x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    linkedIn: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    native: { title, text, url }
  }
}

export const createGetAwarenessTagSettings = ({
  db,
  collections,
  ensureAnonymousLogin,
  getFirstDocument,
  isMissingCollectionResponse,
  settingsKey,
  normalizeTagsByKey = (tagsByKey) => tagsByKey
}) => async () => {
  try {
    await ensureAnonymousLogin()
    const result = await db
      .collection(collections.appSettings)
      .where({ key: settingsKey })
      .limit(1)
      .get()

    if (isMissingCollectionResponse(result)) {
      return { tagsByKey: {} }
    }

    const document = getFirstDocument(result, collections.appSettings)
    return {
      tagsByKey: normalizeTagsByKey(document?.tags_by_key || document?.tagsByKey || {})
    }
  } catch (error) {
    console.error('获取觉察标签配置失败:', error)
    return { tagsByKey: {} }
  }
}

export const createResolveAwarenessIdentity = ({
  getOrCreateAwarenessAuthorKey,
  resolveAuthStatus,
  getCurrentProfile
}) => async () => {
  const fallbackAuthorKey = getOrCreateAwarenessAuthorKey()
  let authStatus = {
    authUid: '',
    displayName: '',
    isAuthenticated: false
  }
  let currentProfile = null

  try {
    authStatus = await resolveAuthStatus({ allowAnonymous: true })
  } catch (error) {
    console.error('读取觉察身份状态失败:', error)
  }

  try {
    currentProfile = await getCurrentProfile({
      refresh: false,
      allowAnonymous: true
    })
  } catch (error) {
    console.error('读取觉察用户档案失败:', error)
  }

  const authorKey = currentProfile?.authUid || authStatus.authUid || fallbackAuthorKey
  const userId = currentProfile?.id || authorKey
  const authUid = currentProfile?.authUid || authStatus.authUid || authorKey
  const userName =
    currentProfile?.name ||
    authStatus.displayName ||
    buildDefaultUserName(authUid)

  return {
    authorKey,
    userId,
    authUid,
    userName,
    isAuthenticated: Boolean(authStatus.isAuthenticated),
    isStudent: Boolean(currentProfile?.isStudent),
    profile: currentProfile
  }
}