const { getDb } = require('./cloudbase')
const { COLLECTIONS } = require('./shared/database-config')
const { getCurrentShopProfile } = require('./shop')
const {
  BADGE_SETTINGS_KEY,
  BADGE_PROFILE_COLLECTION,
  BADGE_VISIBLE_GROUPS,
  BADGE_VISIBLE_GROUP_LABELS,
  BADGE_DIFFICULTIES,
  normalizeBadgeSettings,
  flattenBadgeSeries,
  formatBadgeBonusText
} = require('./shared/badge-system')

const TAB_META = {
  growth: {
    key: BADGE_VISIBLE_GROUPS.growth,
    label: BADGE_VISIBLE_GROUP_LABELS[BADGE_VISIBLE_GROUPS.growth],
    description: '记录你在觉察、冥想与云签中的持续投入。'
  },
  builder: {
    key: BADGE_VISIBLE_GROUPS.builder,
    label: BADGE_VISIBLE_GROUP_LABELS[BADGE_VISIBLE_GROUPS.builder],
    description: '记录你对社区同行、护持与共建的投入。'
  }
}

const DIFFICULTY_ORDER = BADGE_DIFFICULTIES.map((item) => item.key)

const DIFFICULTY_LABELS = BADGE_DIFFICULTIES.reduce((labels, item) => {
  labels[item.key] = item.label
  return labels
}, {})

const getBadgeSeriesProgress = (badges = []) => {
  const grouped = {}

  badges.forEach((badge) => {
    if (!grouped[badge.seriesId]) {
      grouped[badge.seriesId] = []
    }
    grouped[badge.seriesId].push(badge)
  })

  const seriesList = Object.values(grouped)
  return {
    totalSeriesCount: seriesList.length,
    unlockedSeriesCount: seriesList.filter((seriesBadges) => seriesBadges.some((badge) => badge.earned)).length
  }
}

const getVisibleSeriesBadges = (seriesBadges = []) => {
  const sortedBadges = [...seriesBadges].sort((left, right) => (
    DIFFICULTY_ORDER.indexOf(left.difficulty) - DIFFICULTY_ORDER.indexOf(right.difficulty)
  ))

  const highestEarnedIndex = sortedBadges.reduce((currentIndex, badge, index) => (
    badge.earned ? index : currentIndex
  ), -1)

  return sortedBadges.filter((badge, index) => (
    badge.earned || index === highestEarnedIndex + 1 || (highestEarnedIndex < 0 && index === 0)
  ))
}

const buildVisibleBadges = (badges = []) => {
  const seriesMap = {}

  badges.forEach((badge) => {
    if (!seriesMap[badge.seriesId]) {
      seriesMap[badge.seriesId] = []
    }
    seriesMap[badge.seriesId].push(badge)
  })

  return Object.values(seriesMap).flatMap(getVisibleSeriesBadges)
}

const getOrCreateBadgeProfile = async (userId = '') => {
  const db = getDb()
  const result = await db.collection(BADGE_PROFILE_COLLECTION).where({ user_id: userId }).limit(1).get()
  const existingProfile = (result.data || [])[0] || null

  if (existingProfile) {
    return existingProfile
  }

  const payload = {
    user_id: userId,
    equipped_badge_id: '',
    unlocked_badge_ids: [],
    unlocked_at_map: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  const createResult = await db.collection(BADGE_PROFILE_COLLECTION).add({ data: payload })
  return {
    _id: createResult._id || createResult.id || '',
    ...payload
  }
}

const getBadgeSettingsDocument = async () => {
  const db = getDb()
  const result = await db.collection(COLLECTIONS.appSettings).where({ key: BADGE_SETTINGS_KEY }).limit(1).get()
  return (result.data || [])[0] || { series: [] }
}

const buildBadgeState = (settingsDocument = {}, profileDocument = {}) => {
  const unlockedBadgeIds = Array.isArray(profileDocument.unlocked_badge_ids || profileDocument.unlockedBadgeIds)
    ? [...new Set((profileDocument.unlocked_badge_ids || profileDocument.unlockedBadgeIds).filter(Boolean))]
    : []
  const equippedBadgeId = profileDocument.equipped_badge_id || profileDocument.equippedBadgeId || ''
  const normalizedSettings = normalizeBadgeSettings(settingsDocument)

  const allBadges = flattenBadgeSeries(normalizedSettings)
    .filter((badge) => badge.enabled !== false)
    .map((badge) => ({
      ...badge,
      difficultyLabel: DIFFICULTY_LABELS[badge.difficulty] || badge.difficulty,
      earned: unlockedBadgeIds.includes(badge.badgeId),
      equipped: badge.badgeId === equippedBadgeId
    }))

  const groupedBadges = {
    growth: allBadges.filter((badge) => badge.visibleGroup === BADGE_VISIBLE_GROUPS.growth),
    builder: allBadges.filter((badge) => badge.visibleGroup === BADGE_VISIBLE_GROUPS.builder)
  }

  return {
    groupedBadges: {
      growth: buildVisibleBadges(groupedBadges.growth),
      builder: buildVisibleBadges(groupedBadges.builder)
    },
    summary: {
      growth: getBadgeSeriesProgress(groupedBadges.growth),
      builder: getBadgeSeriesProgress(groupedBadges.builder)
    },
    equippedBadgeId
  }
}

const getBadgeAlbumPageData = async () => {
  const currentProfile = await getCurrentShopProfile()
  if (!currentProfile.id) {
    return {
      profile: currentProfile,
      groupedBadges: { growth: [], builder: [] },
      summary: {
        growth: { unlockedSeriesCount: 0, totalSeriesCount: 0 },
        builder: { unlockedSeriesCount: 0, totalSeriesCount: 0 }
      }
    }
  }

  const [badgeSettingsDocument, badgeProfileDocument] = await Promise.all([
    getBadgeSettingsDocument(),
    getOrCreateBadgeProfile(currentProfile.id)
  ])

  return {
    profile: currentProfile,
    ...buildBadgeState(badgeSettingsDocument, badgeProfileDocument)
  }
}

const equipBadge = async (badgeId = '') => {
  const currentProfile = await getCurrentShopProfile()
  const badgeProfile = await getOrCreateBadgeProfile(currentProfile.id)
  const badgeSettingsDocument = await getBadgeSettingsDocument()
  const currentState = buildBadgeState(badgeSettingsDocument, badgeProfile)
  const targetBadge = [...currentState.groupedBadges.growth, ...currentState.groupedBadges.builder].find((badge) => badge.badgeId === badgeId)

  if (!targetBadge) {
    throw new Error('未找到该徽章')
  }

  if (!targetBadge.earned) {
    throw new Error('尚未获得该徽章')
  }

  const nextEquippedBadgeId = currentState.equippedBadgeId === badgeId ? '' : badgeId
  const db = getDb()
  await db.collection(BADGE_PROFILE_COLLECTION).doc(badgeProfile._id || badgeProfile.id || '').update({
    data: {
      equipped_badge_id: nextEquippedBadgeId,
      updated_at: new Date().toISOString()
    }
  })

  return getBadgeAlbumPageData()
}

module.exports = {
  TAB_META,
  formatBadgeBonusText,
  getBadgeAlbumPageData,
  equipBadge
}