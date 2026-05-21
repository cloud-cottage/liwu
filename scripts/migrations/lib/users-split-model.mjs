#!/usr/bin/env node

export const TARGET_COLLECTIONS = {
  userProfiles: 'user_profiles',
  userWallets: 'user_wallets',
  userMemberships: 'user_memberships',
  userReferrals: 'user_referrals',
  userPartnerIdentities: 'user_partner_identities',
  userOperationalStates: 'user_operational_states'
};

export const nowDate = () => new Date();

export const buildUserProfileDocument = (user = {}) => ({
  _openid: user._openid || '',
  user_id: user._id || user.id || '',
  name: user.name || '',
  note_name: user.note_name || user.noteName || '',
  avatar: user.avatar || '',
  avatar_index: Number(user.avatar_index ?? user.avatarIndex ?? 0),
  bio: user.bio || '',
  location: user.location || '',
  age: user.age ?? '',
  name_updated_at: user.name_updated_at || user.nameUpdatedAt || '',
  created_at: user.created_at || nowDate(),
  updated_at: nowDate()
});

export const buildUserWalletDocument = (user = {}) => ({
  _openid: user._openid || '',
  user_id: user._id || user.id || '',
  balance: Number(user.balance || 0),
  reward_claims: user.reward_claims || user.rewardClaims || {},
  created_at: user.created_at || nowDate(),
  updated_at: nowDate()
});

export const buildUserMembershipDocument = (user = {}) => ({
  _openid: user._openid || '',
  user_id: user._id || user.id || '',
  is_student: Boolean(user.is_student ?? user.isStudent),
  student_expire_at: user.student_expire_at || user.studentExpireAt || '',
  student_membership_plan_key: user.student_membership_plan_key || user.studentMembershipPlanKey || '',
  created_at: user.created_at || nowDate(),
  updated_at: nowDate()
});

export const buildUserReferralDocument = (user = {}) => ({
  _openid: user._openid || '',
  user_id: user._id || user.id || '',
  inviter_user_id: user.inviter_user_id || user.inviterUserId || '',
  source: user.inviter_user_id || user.inviterUserId ? 'legacy_users_field' : '',
  created_at: user.created_at || nowDate(),
  updated_at: nowDate()
});

export const buildUserPartnerIdentityDocument = (user = {}) => ({
  _openid: user._openid || '',
  user_id: user._id || user.id || '',
  store_id: user.store_id || user.storeId || '',
  store_name: user.store_name || user.storeName || '',
  store_role: user.store_role || user.storeRole || '',
  store_owner_user_id: user.store_owner_user_id || user.storeOwnerUserId || '',
  store_description: user.store_description || user.storeDescription || '',
  store_contact: user.store_contact || user.storeContact || '',
  created_at: user.created_at || nowDate(),
  updated_at: nowDate()
});

export const buildUserOperationalStateDocument = (user = {}) => ({
  _openid: user._openid || '',
  user_id: user._id || user.id || '',
  beans_daily_settled_at: user.beans_daily_settled_at || user.beansDailySettledAt || '',
  beans_last_extinguished_at: user.beans_last_extinguished_at || user.beansLastExtinguishedAt || '',
  beans_last_ignited_at: user.beans_last_ignited_at || user.beansLastIgnitedAt || '',
  created_at: user.created_at || nowDate(),
  updated_at: nowDate()
});

export const hasReferralData = (user = {}) => Boolean(user.inviter_user_id || user.inviterUserId);

export const hasPartnerIdentityData = (user = {}) => (
  Boolean(
    user.store_id
    || user.storeId
    || user.store_name
    || user.storeName
    || user.store_role
    || user.storeRole
    || user.store_owner_user_id
    || user.storeOwnerUserId
    || user.store_description
    || user.storeDescription
    || user.store_contact
    || user.storeContact
  )
);

export const hasOperationalStateData = (user = {}) => (
  Boolean(
    user.beans_daily_settled_at
    || user.beansDailySettAt
    || user.beansDailySettledAt
    || user.beans_last_extinguished_at
    || user.beansLastExtinguishedAt
    || user.beans_last_ignited_at
    || user.beansLastIgnitedAt
  )
);

export const summarizeUsersFieldCoverage = (users = []) => ({
  totalUsers: users.length,
  withProfile: users.filter((user) => Boolean(
    user.name
    || user.note_name
    || user.noteName
    || user.avatar
    || user.avatar_index
    || user.avatarIndex
    || user.bio
    || user.location
    || user.age
  )).length,
  withWallet: users.filter((user) => (
    Number(user.balance || 0) !== 0
    || Array.isArray(user.wealth_history || user.wealthHistory)
    || Boolean(user.reward_claims || user.rewardClaims)
  )).length,
  withMembership: users.filter((user) => Boolean(
    user.is_student
    || user.isStudent
    || user.student_expire_at
    || user.studentExpireAt
    || user.student_membership_plan_key
    || user.studentMembershipPlanKey
  )).length,
  withReferral: users.filter(hasReferralData).length,
  withPartnerIdentity: users.filter(hasPartnerIdentityData).length,
  withOperationalState: users.filter(hasOperationalStateData).length
});
