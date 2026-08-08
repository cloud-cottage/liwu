const { getDocumentId } = require('./cloudbase-document-helpers')
const { buildDefaultUserName, getUserInviteCode, getUserUid } = require('./cloudbase-user-identity')
const { normalizeRewardClaims, normalizeWealthHistory } = require('./cloudbase-wealth-snapshot')

const normalizeCurrentUserProfile = (document = {}) => ({
  id: getDocumentId(document),
  uid: getUserUid(document) || 0,
  authUid: document.auth_uid || document.authUid || '',
  name: document.name || buildDefaultUserName(getUserUid(document) || 1),
  avatar: document.avatar || '',
  avatarIndex: Number(document.avatar_index ?? document.avatarIndex ?? 0),
  email: document.email || '',
  phone: document.phone || '',
  status: document.status || 'active',
  level: Number(document.level ?? 1),
  experience: Number(document.experience ?? 0),
  isStudent: Boolean(document.is_student ?? document.isStudent),
  studentExpireAt: document.student_expire_at || document.studentExpireAt || '',
  studentMembershipPlanKey: document.student_membership_plan_key || document.studentMembershipPlanKey || '',
  inviteCode: getUserInviteCode(document),
  inviterUserId: document.inviter_user_id || document.inviterUserId || '',
  balance: Number(document.balance || 0),
  wealthHistory: normalizeWealthHistory(document.wealth_history || document.wealthHistory),
  rewardClaims: normalizeRewardClaims(document.reward_claims || document.rewardClaims),
  nameUpdatedAt: document.name_updated_at || document.nameUpdatedAt || '',
  joinDate: document.join_date || document.joinDate || '',
  lastActive: document.last_active || document.lastActive || '',
  storeId: document.store_id || document.storeId || '',
  storeName: document.store_name || document.storeName || '',
  storeRole: document.store_role || document.storeRole || '',
  storeOwnerUserId: document.store_owner_user_id || document.storeOwnerUserId || '',
  storeDescription: document.store_description || document.storeDescription || '',
  storeContact: document.store_contact || document.storeContact || ''
})

module.exports = {
  normalizeCurrentUserProfile
}
