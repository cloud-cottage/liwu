const { getDocumentId, isMissingCollectionResponse } = require('./cloudbase-document-helpers')
const { normalizeCurrentUserProfile } = require('./cloudbase-user-profile')
const {
  buildUserMembershipFields,
  buildUserOperationalStateFields,
  buildUserPartnerIdentityFields,
  buildUserProfileFields,
  buildUserReferralFields,
  buildUserWalletFields,
  buildSplitDocumentPayload,
  hasOperationalStateFields,
  hasPartnerIdentityFields,
  hasReferralFields,
  USER_SPLIT_COLLECTIONS
} = require('./users-split-fields')

const pickDefined = (target = {}, fields = {}) => {
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined) {
      target[key] = value
    }
  })
  return target
}

const mergeUserBundleIntoLegacyDocument = (identity = {}, parts = {}) => {
  const merged = { ...identity }
  const {
    profile = null,
    wallet = null,
    membership = null,
    referral = null,
    partnerIdentity = null,
    operationalState = null
  } = parts

  if (profile) {
    pickDefined(merged, buildUserProfileFields(profile))
  }

  if (wallet) {
    pickDefined(merged, buildUserWalletFields(wallet))
  }

  if (membership) {
    pickDefined(merged, buildUserMembershipFields(membership))
  }

  if (referral) {
    pickDefined(merged, buildUserReferralFields(referral))
  }

  if (partnerIdentity) {
    pickDefined(merged, buildUserPartnerIdentityFields(partnerIdentity))
  }

  if (operationalState) {
    pickDefined(merged, buildUserOperationalStateFields(operationalState))
  }

  return merged
}

const splitLegacyUserPatch = (patch = {}) => {
  const identityPatch = {}
  const profilePatch = {}
  const walletPatch = {}
  const membershipPatch = {}
  const referralPatch = {}
  const partnerIdentityPatch = {}
  const operationalStatePatch = {}

  Object.entries(patch).forEach(([key, value]) => {
    switch (key) {
      case 'phone':
      case 'email':
      case 'auth_uid':
      case 'authUid':
      case 'status':
      case 'uid':
      case 'join_date':
      case 'joinDate':
      case 'last_active':
      case 'lastActive':
      case 'created_at':
      case 'updated_at':
        identityPatch[key] = value
        break
      case 'name':
      case 'note_name':
      case 'noteName':
      case 'avatar':
      case 'avatar_index':
      case 'avatarIndex':
      case 'bio':
      case 'location':
      case 'age':
      case 'name_updated_at':
      case 'nameUpdatedAt':
        profilePatch[key] = value
        break
      case 'balance':
      case 'reward_claims':
      case 'rewardClaims':
      case 'wealth_history':
      case 'wealthHistory':
        walletPatch[key] = value
        break
      case 'is_student':
      case 'isStudent':
      case 'student_expire_at':
      case 'studentExpireAt':
      case 'student_membership_plan_key':
      case 'studentMembershipPlanKey':
        membershipPatch[key] = value
        break
      case 'inviter_user_id':
      case 'inviterUserId':
        referralPatch[key] = value
        break
      case 'store_id':
      case 'storeId':
      case 'store_name':
      case 'storeName':
      case 'store_role':
      case 'storeRole':
      case 'store_owner_user_id':
      case 'storeOwnerUserId':
      case 'store_description':
      case 'storeDescription':
      case 'store_contact':
      case 'storeContact':
        partnerIdentityPatch[key] = value
        break
      case 'beans_daily_settled_at':
      case 'beansDailySettledAt':
      case 'beans_last_extinguished_at':
      case 'beansLastExtinguishedAt':
      case 'beans_last_ignited_at':
      case 'beansLastIgnitedAt':
        operationalStatePatch[key] = value
        break
      default:
        profilePatch[key] = value
        break
    }
  })

  return {
    identityPatch,
    profilePatch,
    walletPatch,
    membershipPatch,
    referralPatch,
    partnerIdentityPatch,
    operationalStatePatch
  }
}

const createFetchSplitDocumentByUserId = ({
  db,
  collections,
  getFirstDocument,
  isMissingCollectionIssue
}) => async (collectionKey, userId) => {
  const collectionName = collections[collectionKey] || USER_SPLIT_COLLECTIONS[collectionKey]
  if (!collectionName || !userId) {
    return null
  }

  try {
    const result = await db.collection(collectionName).where({ user_id: userId }).limit(1).get()
    if (isMissingCollectionResponse(result)) {
      return null
    }

    return getFirstDocument(result, collectionName)
  } catch (error) {
    if (isMissingCollectionIssue?.(error)) {
      return null
    }
    throw error
  }
}

const upsertSplitDocumentByUserId = async ({
  db,
  collectionName,
  userId,
  openId,
  fields,
  getFirstDocument
}) => {
  const existingResult = await db.collection(collectionName).where({ user_id: userId }).limit(1).get()
  if (isMissingCollectionResponse(existingResult)) {
    return { action: 'skipped', reason: 'missing_collection' }
  }

  const existingDocument = getFirstDocument(existingResult, collectionName)
  const payload = buildSplitDocumentPayload({
    userId,
    openId,
    profileFields: fields,
    createdAt: existingDocument?.created_at || existingDocument?.createdAt || null
  })

  if (existingDocument) {
    await db.collection(collectionName).doc(getDocumentId(existingDocument)).update(payload)
    return { action: 'updated' }
  }

  await db.collection(collectionName).add(payload)
  return { action: 'inserted' }
}

const createLoadMergedUserDocument = ({
  db,
  collections,
  getFirstDocument,
  isMissingCollectionIssue
}) => {
  const fetchSplitDocumentByUserId = createFetchSplitDocumentByUserId({
    db,
    collections,
    getFirstDocument,
    isMissingCollectionIssue
  })

  return async (userId = '') => {
    const normalizedUserId = String(userId || '').trim()
    if (!normalizedUserId) {
      return null
    }

    const identityResult = await db.collection(collections.users).doc(normalizedUserId).get().catch(() => ({ data: [] }))
    const identity = getFirstDocument(identityResult, collections.users)
    if (!identity) {
      return null
    }

    const [
      profile,
      wallet,
      membership,
      referral,
      partnerIdentity,
      operationalState
    ] = await Promise.all([
      fetchSplitDocumentByUserId('userProfiles', normalizedUserId),
      fetchSplitDocumentByUserId('userWallets', normalizedUserId),
      fetchSplitDocumentByUserId('userMemberships', normalizedUserId),
      fetchSplitDocumentByUserId('userReferrals', normalizedUserId),
      fetchSplitDocumentByUserId('userPartnerIdentities', normalizedUserId),
      fetchSplitDocumentByUserId('userOperationalStates', normalizedUserId)
    ])

    return mergeUserBundleIntoLegacyDocument(identity, {
      profile,
      wallet,
      membership,
      referral,
      partnerIdentity,
      operationalState
    })
  }
}

const createGetCurrentUserProfileBundle = (deps) => {
  const loadMergedUserDocument = createLoadMergedUserDocument(deps)

  return async (userId = '') => {
    const mergedDocument = await loadMergedUserDocument(userId)
    if (!mergedDocument) {
      return null
    }

    return normalizeCurrentUserProfile(mergedDocument)
  }
}

const createGetAdminUserBundle = (deps) => createGetCurrentUserProfileBundle(deps)

const createSaveCurrentUserProfileBundle = ({
  db,
  collections,
  getFirstDocument,
  isMissingCollectionIssue,
  dualWriteLegacyUsers = true
}) => async (userId = '', patch = {}) => {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) {
    throw new Error('Missing user id for profile bundle save')
  }

  const identityResult = await db.collection(collections.users).doc(normalizedUserId).get()
  const identity = getFirstDocument(identityResult, collections.users)
  if (!identity) {
    throw new Error('User identity document not found')
  }

  const {
    identityPatch,
    profilePatch,
    walletPatch,
    membershipPatch,
    referralPatch,
    partnerIdentityPatch,
    operationalStatePatch
  } = splitLegacyUserPatch(patch)

  const usersPatch = {
    ...patch,
    ...identityPatch,
    updated_at: patch.updated_at || new Date()
  }

  if (dualWriteLegacyUsers) {
    await db.collection(collections.users).doc(normalizedUserId).update(usersPatch)
  } else if (Object.keys(identityPatch).length > 0) {
    await db.collection(collections.users).doc(normalizedUserId).update({
      ...identityPatch,
      updated_at: usersPatch.updated_at
    })
  }

  const openId = identity._openid || ''
  const splitWrites = []

  if (Object.keys(profilePatch).length > 0) {
    splitWrites.push(upsertSplitDocumentByUserId({
      db,
      collectionName: collections.userProfiles,
      userId: normalizedUserId,
      openId,
      fields: buildUserProfileFields(profilePatch),
      getFirstDocument
    }))
  }

  if (Object.keys(walletPatch).length > 0) {
    splitWrites.push(upsertSplitDocumentByUserId({
      db,
      collectionName: collections.userWallets,
      userId: normalizedUserId,
      openId,
      fields: buildUserWalletFields(walletPatch),
      getFirstDocument
    }))
  }

  if (Object.keys(membershipPatch).length > 0) {
    splitWrites.push(upsertSplitDocumentByUserId({
      db,
      collectionName: collections.userMemberships,
      userId: normalizedUserId,
      openId,
      fields: buildUserMembershipFields(membershipPatch),
      getFirstDocument
    }))
  }

  if (Object.keys(referralPatch).length > 0 && hasReferralFields(referralPatch)) {
    splitWrites.push(upsertSplitDocumentByUserId({
      db,
      collectionName: collections.userReferrals,
      userId: normalizedUserId,
      openId,
      fields: buildUserReferralFields(referralPatch),
      getFirstDocument
    }))
  }

  if (Object.keys(partnerIdentityPatch).length > 0 && hasPartnerIdentityFields(partnerIdentityPatch)) {
    splitWrites.push(upsertSplitDocumentByUserId({
      db,
      collectionName: collections.userPartnerIdentities,
      userId: normalizedUserId,
      openId,
      fields: buildUserPartnerIdentityFields(partnerIdentityPatch),
      getFirstDocument
    }))
  }

  if (Object.keys(operationalStatePatch).length > 0 && hasOperationalStateFields(operationalStatePatch)) {
    splitWrites.push(upsertSplitDocumentByUserId({
      db,
      collectionName: collections.userOperationalStates,
      userId: normalizedUserId,
      openId,
      fields: buildUserOperationalStateFields(operationalStatePatch),
      getFirstDocument
    }))
  }

  const splitResults = await Promise.all(splitWrites)
  const mergedDocument = mergeUserBundleIntoLegacyDocument(
    dualWriteLegacyUsers ? { ...identity, ...usersPatch } : { ...identity, ...identityPatch },
    {
      profile: Object.keys(profilePatch).length > 0 ? profilePatch : null,
      wallet: Object.keys(walletPatch).length > 0 ? walletPatch : null,
      membership: Object.keys(membershipPatch).length > 0 ? membershipPatch : null,
      referral: Object.keys(referralPatch).length > 0 ? referralPatch : null,
      partnerIdentity: Object.keys(partnerIdentityPatch).length > 0 ? partnerIdentityPatch : null,
      operationalState: Object.keys(operationalStatePatch).length > 0 ? operationalStatePatch : null
    }
  )

  return {
    profile: normalizeCurrentUserProfile({
      ...mergedDocument,
      _id: normalizedUserId
    }),
    splitResults
  }
}

const createSaveAdminUserBundle = (deps) => createSaveCurrentUserProfileBundle(deps)

module.exports = {
  mergeUserBundleIntoLegacyDocument,
  splitLegacyUserPatch,
  createLoadMergedUserDocument,
  createGetCurrentUserProfileBundle,
  createGetAdminUserBundle,
  createSaveCurrentUserProfileBundle,
  createSaveAdminUserBundle
}
