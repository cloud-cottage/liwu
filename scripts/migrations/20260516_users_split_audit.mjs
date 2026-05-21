#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { fetchAllCollection, getEnvId, hasFlag, parseFlag } from './lib/cloudbase-nosql.mjs';
import { summarizeUsersFieldCoverage, TARGET_COLLECTIONS } from './lib/users-split-model.mjs';

const groupBy = (items, keyFn) => {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!key) {
      return;
    }
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  });
  return map;
};

const normalizePhone = (value = '') => String(value || '').replace(/[^\d]/g, '');

const main = async () => {
  const envId = getEnvId();
  const outputPath = parseFlag('--output');
  const includeSamples = hasFlag('--samples');

  const users = await fetchAllCollection({
    envId,
    collectionName: 'users',
    sort: { uid: 1, _id: 1 }
  });

  const splitCollections = await Promise.all(
    Object.values(TARGET_COLLECTIONS).map(async (collectionName) => ({
      collectionName,
      documents: await fetchAllCollection({
        envId,
        collectionName,
        sort: { user_id: 1, _id: 1 }
      })
    }))
  );

  const authUidDuplicates = [...groupBy(users, (user) => String(user.auth_uid || user.authUid || '').trim()).entries()]
    .filter(([, group]) => group.length > 1)
    .map(([authUid, group]) => ({
      authUid,
      count: group.length,
      users: group.map((user) => ({
        id: user._id || user.id || '',
        uid: Number(user.uid || 0),
        phone: user.phone || '',
        name: user.name || '',
        store_id: user.store_id || user.storeId || '',
        last_active: user.last_active || user.lastActive || ''
      }))
    }));

  const phoneDuplicates = [...groupBy(users, (user) => normalizePhone(user.phone)).entries()]
    .filter(([phone, group]) => phone && group.length > 1)
    .map(([phone, group]) => ({
      phone,
      count: group.length,
      users: group.map((user) => ({
        id: user._id || user.id || '',
        uid: Number(user.uid || 0),
        auth_uid: user.auth_uid || user.authUid || '',
        name: user.name || '',
        store_id: user.store_id || user.storeId || '',
        last_active: user.last_active || user.lastActive || ''
      }))
    }));

  const uidDuplicates = [...groupBy(users, (user) => String(Number(user.uid || 0) || '')).entries()]
    .filter(([uid, group]) => uid && uid !== '0' && group.length > 1)
    .map(([uid, group]) => ({
      uid: Number(uid),
      count: group.length,
      users: group.map((user) => ({
        id: user._id || user.id || '',
        auth_uid: user.auth_uid || user.authUid || '',
        phone: user.phone || '',
        name: user.name || ''
      }))
    }));

  const splitCounts = Object.fromEntries(
    splitCollections.map(({ collectionName, documents }) => [collectionName, documents.length])
  );

  const duplicateUserIdsInSplitCollections = splitCollections.map(({ collectionName, documents }) => {
    const duplicates = [...groupBy(documents, (document) => String(document.user_id || document.userId || '').trim()).entries()]
      .filter(([userId, group]) => userId && group.length > 1)
      .map(([userId, group]) => ({
        userId,
        count: group.length,
        documentIds: group.map((document) => document._id || document.id || '')
      }));

    return {
      collectionName,
      duplicates
    };
  }).filter((entry) => entry.duplicates.length > 0);

  const report = {
    envId,
    generatedAt: new Date().toISOString(),
    summary: {
      usersCount: users.length,
      ...summarizeUsersFieldCoverage(users),
      splitCounts,
      authUidDuplicateCount: authUidDuplicates.length,
      phoneDuplicateCount: phoneDuplicates.length,
      uidDuplicateCount: uidDuplicates.length
    },
    duplicates: {
      authUid: authUidDuplicates,
      phone: phoneDuplicates,
      uid: uidDuplicates,
      splitCollections: duplicateUserIdsInSplitCollections
    },
    samples: includeSamples
      ? {
          firstUsers: users.slice(0, 10)
        }
      : undefined
  };

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Wrote audit report to ${outputPath}`);
  }

  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
