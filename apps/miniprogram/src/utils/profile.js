const { getLocalProfile, saveLocalProfile } = require('./storage')
const { listUserTags } = require('./aware')
const { getCurrentShopProfile } = require('./shop')
const { getDb } = require('./cloudbase')

const APP_SETTINGS = 'app_settings'
const BADGE_SETTINGS_KEY = 'badge_system_settings'
const BADGE_PROFILES = 'badge_profiles'

const formatRelativeTime = (value = '') => {
  const timestamp = new Date(value).getTime()
  if (!timestamp || Number.isNaN(timestamp)) {
    return ''
  }

  const diffMs = Math.max(0, Date.now() - timestamp)
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) {
    return '刚刚'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  const remainingMinutes = diffMinutes % 60

  if (diffHours < 24) {
    return remainingMinutes > 0 ? `${diffHours} 小时 ${remainingMinutes} 分钟前` : `${diffHours} 小时前`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) {
    return `${diffDays} 天前`
  }

  const date = new Date(timestamp)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

const formatStudentExpireAt = (value = '') => {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

const flattenBadgeSeries = (settings = {}) => {
  const series = Array.isArray(settings.series) ? settings.series : []

  return series.flatMap((group) => {
    const levels = Array.isArray(group.levels) ? group.levels : []
    return levels.map((level) => ({
      badgeId: level.id || `${group.id}:${level.difficulty || ''}`,
      displayName: group.seriesName || level.displayName || level.name || '',
      levelName: level.name || '',
      summary: group.summary || level.description || ''
    }))
  })
}

const getBadgeSummary = async (userId = '') => {
  if (!userId) {
    return {
      equippedBadgeName: '',
      unlockedBadgeCount: 0
    }
  }

  try {
    const db = getDb()
    const [profileResult, settingsResult] = await Promise.all([
      db.collection(BADGE_PROFILES).where({ user_id: userId }).limit(1).get(),
      db.collection(APP_SETTINGS).where({ key: BADGE_SETTINGS_KEY }).limit(1).get()
    ])

    const badgeProfile = (profileResult.data || [])[0] || {}
    const badgeSettings = (settingsResult.data || [])[0] || {}
    const equippedBadgeId = badgeProfile.equipped_badge_id || badgeProfile.equippedBadgeId || ''
    const unlockedBadgeIds = Array.isArray(badgeProfile.unlocked_badge_ids || badgeProfile.unlockedBadgeIds)
      ? [...new Set((badgeProfile.unlocked_badge_ids || badgeProfile.unlockedBadgeIds).filter(Boolean))]
      : []
    const allBadges = flattenBadgeSeries(badgeSettings)
    const equippedBadge = allBadges.find((badge) => badge.badgeId === equippedBadgeId) || null

    return {
      equippedBadgeName: equippedBadge?.displayName || equippedBadge?.levelName || '',
      unlockedBadgeCount: unlockedBadgeIds.length
    }
  } catch {
    return {
      equippedBadgeName: '',
      unlockedBadgeCount: 0
    }
  }
}

const getProfilePageData = async () => {
  const localProfile = getLocalProfile()
  const [tags, remoteProfile] = await Promise.all([
    listUserTags(10),
    getCurrentShopProfile()
  ])
  const badgeSummary = await getBadgeSummary(remoteProfile.id)
  const awareCount = tags.reduce((sum, tag) => sum + tag.totalCount, 0)
  const recentWealthEntries = (remoteProfile.wealthHistory || [])
    .slice(0, 5)
    .map((entry) => ({
      id: entry.id || '',
      description: entry.description || '福豆变动',
      amount: Number(entry.amount || 0),
      type: entry.type || 'EARN',
      timeLabel: formatRelativeTime(entry.date || entry.createdAt || '')
    }))

  return {
    profile: {
      ...localProfile,
      name: remoteProfile.name || localProfile.name,
      phone: remoteProfile.phone || localProfile.phone,
      inviteCode: remoteProfile.inviteCode || '',
      balance: Number(remoteProfile.balance || 0),
      isStudent: Boolean(remoteProfile.isStudent),
      studentExpireAt: formatStudentExpireAt(remoteProfile.studentExpireAt),
      equippedBadgeName: badgeSummary.equippedBadgeName || '',
      unlockedBadgeCount: badgeSummary.unlockedBadgeCount || 0
    },
    tags,
    awareCount,
    recentWealthEntries
  }
}

module.exports = {
  getProfilePageData,
  saveLocalProfile
}
