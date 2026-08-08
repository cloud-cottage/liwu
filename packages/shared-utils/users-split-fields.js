export const USER_SPLIT_COLLECTIONS = {
  userProfiles: 'user_profiles',
  userWallets: 'user_wallets',
  userMemberships: 'user_memberships',
  userReferrals: 'user_referrals',
  userPartnerIdentities: 'user_partner_identities',
  userOperationalStates: 'user_operational_states'
}

export const buildUserProfileFields = (source = {}) => ({
  name: source.name || '',
  note_name: source.note_name || source.noteName || '',
  avatar: source.avatar || '',
  avatar_index: Number(source.avatar_index ?? source.avatarIndex ?? 0),
  bio: source.bio || '',
  location: source.location || '',
  age: source.age ?? '',
  name_updated_at: source.name_updated_at || source.nameUpdatedAt || ''
})

export const buildUserWalletFields = (source = {}) => ({
  balance: Number(source.balance || 0),
  reward_claims: source.reward_claims || source.rewardClaims || {}
})

export const buildUserMembershipFields = (source = {}) => ({
  is_student: Boolean(source.is_student ?? source.isStudent),
  student_expire_at: source.student_expire_at || source.studentExpireAt || '',
  student_membership_plan_key: source.student_membership_plan_key || source.studentMembershipPlanKey || ''
})

export const buildUserReferralFields = (source = {}) => ({
  inviter_user_id: source.inviter_user_id || source.inviterUserId || ''
})

export const buildUserPartnerIdentityFields = (source = {}) => ({
  store_id: source.store_id || source.storeId || '',
  store_name: source.store_name || source.storeName || '',
  store_role: source.store_role || source.storeRole || '',
  store_owner_user_id: source.store_owner_user_id || source.storeOwnerUserId || '',
  store_description: source.store_description || source.storeDescription || '',
  store_contact: source.store_contact || source.storeContact || ''
})

export const buildUserOperationalStateFields = (source = {}) => ({
  beans_daily_settled_at: source.beans_daily_settled_at || source.beansDailySettledAt || '',
  beans_last_extinguished_at: source.beans_last_extinguished_at || source.beansLastExtinguishedAt || '',
  beans_last_ignited_at: source.beans_last_ignited_at || source.beansLastIgnitedAt || ''
})

export const hasReferralFields = (source = {}) => Boolean(source.inviter_user_id || source.inviterUserId)

export const hasPartnerIdentityFields = (source = {}) => Boolean(
  source.store_id
  || source.storeId
  || source.store_name
  || source.storeName
  || source.store_role
  || source.storeRole
  || source.store_owner_user_id
  || source.storeOwnerUserId
  || source.store_description
  || source.storeDescription
  || source.store_contact
  || source.storeContact
)

export const hasOperationalStateFields = (source = {}) => Boolean(
  source.beans_daily_settled_at
  || source.beansDailySettledAt
  || source.beans_last_extinguished_at
  || source.beansLastExtinguishedAt
  || source.beans_last_ignited_at
  || source.beansLastIgnitedAt
)

export const buildSplitDocumentPayload = ({
  userId = '',
  openId = '',
  profileFields = {},
  createdAt = null
}) => ({
  _openid: openId || '',
  user_id: userId,
  ...profileFields,
  ...(createdAt ? { created_at: createdAt } : {}),
  updated_at: new Date()
})