#!/usr/bin/env node

import {
  fetchAllCollection,
  getDocumentId,
  getEnvId,
  hasFlag,
  insertDocument,
  queryCollection,
  updateDocument
} from './lib/cloudbase-nosql.mjs';
import {
  buildUserMembershipDocument,
  buildUserOperationalStateDocument,
  buildUserPartnerIdentityDocument,
  buildUserProfileDocument,
  buildUserReferralDocument,
  buildUserWalletDocument,
  hasOperationalStateData,
  hasPartnerIdentityData,
  hasReferralData,
  TARGET_COLLECTIONS
} from './lib/users-split-model.mjs';

const upsertByUserId = async ({
  envId,
  collectionName,
  document,
  dryRun
}) => {
  const userId = String(document.user_id || '').trim();
  if (!userId) {
    return { action: 'skipped', reason: 'missing_user_id' };
  }

  const existing = await queryCollection({
    envId,
    collectionName,
    filter: { user_id: userId },
    limit: 2
  });

  if (existing.length > 1) {
    return {
      action: 'skipped',
      reason: 'duplicate_target_documents',
      documentIds: existing.map((item) => getDocumentId(item))
    };
  }

  if (dryRun) {
    return {
      action: existing.length === 1 ? 'would_update' : 'would_insert'
    };
  }

  if (existing.length === 1) {
    await updateDocument({
      envId,
      collectionName,
      filter: { _id: getDocumentId(existing[0]) },
      patch: {
        ...document,
        updated_at: document.updated_at
      }
    });
    return { action: 'updated' };
  }

  await insertDocument({
    envId,
    collectionName,
    document
  });
  return { action: 'inserted' };
};

const createWriters = (user = {}) => ([
  {
    collectionName: TARGET_COLLECTIONS.userProfiles,
    document: buildUserProfileDocument(user),
    enabled: true
  },
  {
    collectionName: TARGET_COLLECTIONS.userWallets,
    document: buildUserWalletDocument(user),
    enabled: true
  },
  {
    collectionName: TARGET_COLLECTIONS.userMemberships,
    document: buildUserMembershipDocument(user),
    enabled: true
  },
  {
    collectionName: TARGET_COLLECTIONS.userReferrals,
    document: buildUserReferralDocument(user),
    enabled: hasReferralData(user)
  },
  {
    collectionName: TARGET_COLLECTIONS.userPartnerIdentities,
    document: buildUserPartnerIdentityDocument(user),
    enabled: hasPartnerIdentityData(user)
  },
  {
    collectionName: TARGET_COLLECTIONS.userOperationalStates,
    document: buildUserOperationalStateDocument(user),
    enabled: hasOperationalStateData(user)
  }
]);

const main = async () => {
  const envId = getEnvId();
  const dryRun = !hasFlag('--write');
  const users = await fetchAllCollection({
    envId,
    collectionName: 'users',
    sort: { uid: 1, _id: 1 }
  });

  const summary = {};

  for (const user of users) {
    for (const writer of createWriters(user)) {
      if (!writer.enabled) {
        continue;
      }

      const result = await upsertByUserId({
        envId,
        collectionName: writer.collectionName,
        document: writer.document,
        dryRun
      });

      if (!summary[writer.collectionName]) {
        summary[writer.collectionName] = {
          inserted: 0,
          updated: 0,
          would_insert: 0,
          would_update: 0,
          skipped: 0
        };
      }

      if (summary[writer.collectionName][result.action] !== undefined) {
        summary[writer.collectionName][result.action] += 1;
      } else {
        summary[writer.collectionName].skipped += 1;
      }
    }
  }

  console.log(JSON.stringify({
    envId,
    dryRun,
    usersProcessed: users.length,
    summary
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
