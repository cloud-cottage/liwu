import { getDocumentId } from './cloudbase-document-helpers.js'
import { normalizePhone } from './cloudbase-user-identity.js'

export const DEFAULT_USER_DASHBOARD_STATS = {
  earnedBadgeCount: 0,
  recentSevenDayPoints: 0,
  meditationCount: 0,
  awarenessCount: 0
}

export const normalizeCategory = (category) => ({
  id: getDocumentId(category),
  name: category.name,
  color: category.color,
  description: category.description || ''
})

export const normalizeTag = (tag, categoriesById = new Map()) => {
  const categoryId = tag.category_id || tag.categoryId || ''
  const category = categoriesById.get(categoryId)

  return {
    id: getDocumentId(tag),
    name: tag.name,
    categoryId,
    categoryName: tag.categoryName || category?.name || '',
    startDate: tag.start_date || tag.startDate || '',
    endDate: tag.end_date || tag.endDate || '',
    color: tag.color || category?.color || '#666'
  }
}

export const normalizeUser = (user) => ({
  id: getDocumentId(user),
  uid: Number(user.uid || 0),
  name: user.name || '',
  noteName: user.note_name || user.noteName || '',
  avatar: user.avatar || '',
  avatarIndex: Number(user.avatar_index ?? user.avatarIndex ?? 0),
  email: user.email || '',
  phone: user.phone || '',
  joinDate: user.join_date || user.joinDate || '',
  lastActive: user.last_active || user.lastActive || '',
  status: user.status || 'inactive',
  level: Number(user.level ?? 1),
  experience: Number(user.experience ?? 0),
  authUid: user.auth_uid || user.authUid || '',
  isStudent: Boolean(user.is_student ?? user.isStudent),
  studentExpireAt: user.student_expire_at || user.studentExpireAt || '',
  studentMembershipPlanKey: user.student_membership_plan_key || user.studentMembershipPlanKey || '',
  inviteCode: user.uid ? String(user.uid) : '',
  inviterUserId: user.inviter_user_id || user.inviterUserId || '',
  balance: Number(user.balance || 0),
  bio: user.bio || '',
  location: user.location || '',
  age: user.age ?? '',
  storeId: user.store_id || user.storeId || '',
  storeName: user.store_name || user.storeName || '',
  storeRole: user.store_role || user.storeRole || '',
  storeOwnerUserId: user.store_owner_user_id || user.storeOwnerUserId || '',
  storeDescription: user.store_description || user.storeDescription || '',
  storeContact: user.store_contact || user.storeContact || '',
  beansDailySettledAt: user.beans_daily_settled_at || user.beansDailySettledAt || '',
  beansLastExtinguishedAt: user.beans_last_extinguished_at || user.beansLastExtinguishedAt || '',
  beansLastIgnitedAt: user.beans_last_ignited_at || user.beansLastIgnitedAt || '',
  tags: []
})

export const toUserPayload = (userData) => {
  const rest = { ...userData }
  const joinDate = rest.joinDate
  const lastActive = rest.lastActive

  delete rest.id
  delete rest._id
  delete rest.tags
  delete rest.joinDate
  delete rest.lastActive
  delete rest.authUid
  delete rest.uid
  delete rest.noteName
  delete rest.isStudent
  delete rest.inviteCode
  delete rest.inviterUserId
  delete rest.balance
  delete rest.storeId
  delete rest.storeName
  delete rest.storeRole
  delete rest.storeOwnerUserId
  delete rest.storeDescription
  delete rest.storeContact
  delete rest.created_at
  delete rest.updated_at

  return {
    ...rest,
    ...(userData.uid !== undefined ? { uid: Math.max(1, Number(userData.uid) || 1) } : {}),
    ...(userData.noteName !== undefined ? { note_name: String(userData.noteName || '').trim() } : {}),
    ...(joinDate !== undefined ? { join_date: joinDate } : {}),
    ...(lastActive !== undefined ? { last_active: lastActive } : {}),
    ...(userData.authUid !== undefined ? { auth_uid: userData.authUid } : {}),
    ...(userData.isStudent !== undefined ? { is_student: Boolean(userData.isStudent) } : {}),
    ...(userData.inviterUserId !== undefined ? { inviter_user_id: userData.inviterUserId } : {}),
    ...(userData.balance !== undefined ? { balance: Math.max(0, Number(userData.balance) || 0) } : {}),
    ...(userData.storeId !== undefined ? { store_id: String(userData.storeId || '').trim() } : {}),
    ...(userData.storeName !== undefined ? { store_name: String(userData.storeName || '').trim() } : {}),
    ...(userData.storeRole !== undefined ? { store_role: String(userData.storeRole || '').trim() } : {}),
    ...(userData.storeOwnerUserId !== undefined ? { store_owner_user_id: String(userData.storeOwnerUserId || '').trim() } : {}),
    ...(userData.storeDescription !== undefined ? { store_description: String(userData.storeDescription || '').trim() } : {}),
    ...(userData.storeContact !== undefined ? { store_contact: String(userData.storeContact || '').trim() } : {})
  }
}

export const toCategoryPayload = (categoryData) => {
  const rest = { ...categoryData }
  delete rest.id
  delete rest._id
  delete rest.created_at
  delete rest.updated_at
  return rest
}

export const toTagPayload = (tagData) => {
  const rest = { ...tagData }
  const categoryId = rest.categoryId
  const startDate = rest.startDate
  const endDate = rest.endDate

  delete rest.id
  delete rest._id
  delete rest.categoryId
  delete rest.categoryName
  delete rest.startDate
  delete rest.endDate
  delete rest.assignedDate
  delete rest.created_at
  delete rest.updated_at

  return {
    ...rest,
    ...(categoryId !== undefined ? { category_id: categoryId } : {}),
    ...(startDate !== undefined ? { start_date: startDate } : {}),
    ...(endDate !== undefined ? { end_date: endDate } : {})
  }
}

export const attachTagsToUsers = (
  users,
  tags,
  categories,
  userTagLinks,
  { userStatsById = null, resolveUserIdAliases = false } = {}
) => {
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const normalizedTags = tags.map((tag) => normalizeTag(tag, categoriesById))
  const tagsById = new Map(normalizedTags.map((tag) => [tag.id, tag]))
  const userIdAliases = new Map()

  if (resolveUserIdAliases) {
    users.forEach((user) => {
      const normalizedUser = normalizeUser(user)
      const documentId = String(normalizedUser.id || '').trim()
      const uidAlias = normalizedUser.uid > 0 ? String(normalizedUser.uid) : ''
      const authUidAlias = String(normalizedUser.authUid || '').trim()
      const phoneAlias = normalizePhone(normalizedUser.phone || '')

      if (documentId) {
        userIdAliases.set(documentId, documentId)
      }
      if (uidAlias) {
        userIdAliases.set(uidAlias, documentId || uidAlias)
      }
      if (authUidAlias) {
        userIdAliases.set(authUidAlias, documentId || authUidAlias)
      }
      if (phoneAlias) {
        userIdAliases.set(phoneAlias, documentId || phoneAlias)
      }
    })
  }

  const tagsByUserId = new Map()

  for (const link of userTagLinks) {
    const tag = tagsById.get(link.tag_id)
    if (!tag) {
      continue
    }

    const rawUserId = String(link.user_id || link.userId || '').trim()
    const normalizedUserId = resolveUserIdAliases
      ? (userIdAliases.get(rawUserId) || rawUserId)
      : rawUserId

    const userTag = {
      ...tag,
      assignedDate: link.assigned_date || link.assignedDate || ''
    }

    if (!tagsByUserId.has(normalizedUserId)) {
      tagsByUserId.set(normalizedUserId, [])
    }

    tagsByUserId.get(normalizedUserId).push(userTag)
  }

  const normalizedUsers = users.map((user) => {
    const normalizedUser = normalizeUser(user)
    return {
      ...normalizedUser,
      ...(resolveUserIdAliases || userStatsById ? {
        ...DEFAULT_USER_DASHBOARD_STATS,
        ...(userStatsById?.get(normalizedUser.id) || {})
      } : {}),
      tags: tagsByUserId.get(normalizedUser.id) || []
    }
  })

  return {
    users: normalizedUsers,
    tags: normalizedTags,
    categories: categories.map(normalizeCategory)
  }
}