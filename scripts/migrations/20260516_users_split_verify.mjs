#!/usr/bin/env node

import { fetchAllCollection, getEnvId } from './lib/cloudbase-nosql.mjs';
import {
  hasOperationalStateData,
  hasPartnerIdentityData,
  hasReferralData,
  summarizeUsersFieldCoverage,
  TARGET_COLLECTIONS
} from './lib/users-split-model.mjs';

const buildUserIdSet = (documents = []) => new Set(
  documents
    .map((document) => String(document.user_id || document.userId || '').trim())
    .filter(Boolean)
);

const main = async () => {
  const envId = getEnvId();
  const users = await fetchAllCollection({
    envId,
    collectionName: 'users',
    sort: { uid: 1, _id: 1 }
  });

  const [profiles, wallets, memberships, referrals, partnerIdentities, operationalStates] = await Promise.all([
    fetchAllCollection({ envId, collectionName: TARGET_COLLECTIONS.userProfiles, sort: { user_id: 1, _id: 1 } }),
    fetchAllCollection({ envId, collectionName: TARGET_COLLECTIONS.userWallets, sort: { user_id: 1, _id: 1 } }),
    fetchAllCollection({ envId, collectionName: TARGET_COLLECTIONS.userMemberships, sort: { user_id: 1, _id: 1 } }),
    fetchAllCollection({ envId, collectionName: TARGET_COLLECTIONS.userReferrals, sort: { user_id: 1, _id: 1 } }),
    fetchAllCollection({ envId, collectionName: TARGET_COLLECTIONS.userPartnerIdentities, sort: { user_id: 1, _id: 1 } }),
    fetchAllCollection({ envId, collectionName: TARGET_COLLECTIONS.userOperationalStates, sort: { user_id: 1, _id: 1 } })
  ]);

  const userIds = users.map((user) => String(user._id || user.id || '').trim()).filter(Boolean);
  const profileIds = buildUserIdSet(profiles);
  const walletIds = buildUserIdSet(wallets);
  const membershipIds = buildUserIdSet(memberships);
  const referralIds = buildUserIdSet(referrals);
  const partnerIdentityIds = buildUserIdSet(partnerIdentities);
  const operationalStateIds = buildUserIdSet(operationalStates);

  const coverage = summarizeUsersFieldCoverage(users);

  const report = {
    envId,
    generatedAt: new Date().toISOString(),
    sourceUsers: users.length,
    splitCounts: {
      user_profiles: profiles.length,
      user_wallets: wallets.length,
      user_memberships: memberships.length,
      user_referrals: referrals.length,
      user_partner_identities: partnerIdentities.length,
      user_operational_states: operationalStates.length
    },
    missingRequiredDocuments: {
      user_profiles: userIds.filter((userId) => !profileIds.has(userId)),
      user_wallets: userIds.filter((userId) => !walletIds.has(userId)),
      user_memberships: userIds.filter((userId) => !membershipIds.has(userId))
    },
    optionalCoverage: {
      expectedReferrals: coverage.withReferral,
      actualReferrals: referrals.length,
      missingReferralDocs: users
        .filter(hasReferralData)
        .map((user) => String(user._id || user.id || '').trim())
        .filter((userId) => !referralIds.has(userId)),
      expectedPartnerIdentities: coverage.withPartnerIdentity,
      actualPartnerIdentities: partnerIdentities.length,
      missingPartnerIdentityDocs: users
        .filter(hasPartnerIdentityData)
        .map((user) => String(user._id || user.id || '').trim())
        .filter((userId) => !partnerIdentityIds.has(userId)),
      expectedOperationalStates: coverage.withOperationalState,
      actualOperationalStates: operationalStates.length,
      missingOperationalStateDocs: users
        .filter(hasOperationalStateData)
        .map((user) => String(user._id || user.id || '').trim())
        .filter((userId) => !operationalStateIds.has(userId))
    }
  };

  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
