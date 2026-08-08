#!/usr/bin/env node

/**
 * 跨 CloudBase 环境数据迁移（串行模式，避免令牌缓存冲突）
 *
 * 需要环境变量（源和目标各自独立）：
 *   SOURCE_ACCESS_KEY   源账号 API Key (JWT)
 *   TARGET_ACCESS_KEY   目标账号 API Key (JWT)
 *
 * 用法：
 *   node scripts/migrations/20260805_migrate_to_new_env.mjs           # dry-run
 *   node scripts/migrations/20260805_migrate_to_new_env.mjs --write   # 实际写入
 *   node scripts/migrations/20260805_migrate_to_new_env.mjs --write --collection users
 */

import cloudbase from '@cloudbase/node-sdk';
import { parseFlag, hasFlag } from './lib/cloudbase-nosql.mjs';

// --- 配置 ---

const SOURCE_ENV_ID = parseFlag('--source-env') || 'liwu-0gtd91eebd863ccf';
const TARGET_ENV_ID = parseFlag('--target-env') || 'liwu-d8gek6jjdab1d087c';
const BATCH_SIZE = Math.max(1, Number(parseFlag('--batch-size')) || 200);

const COLLECTIONS_TO_MIGRATE = [
  'users',
  'tag_categories',
  'tags',
  'user_tags',
  'app_settings',
  'awareness_records',
  'shop_categories',
  'shop_products',
  'shop_product_skus',
  'shop_orders',
  'shop_order_items',
  'partner_orders',
  'partner_sub_orders',
  'partner_brands',
  'partner_brand_members',
  'partner_brand_invites',
  'user_addresses',
  'point_ledger',
  'badge_profiles',
  'user_profiles',
  'user_wallets',
  'user_memberships',
  'user_referrals',
  'user_partner_identities',
  'user_operational_states',
  'audio_transcode_jobs'
];

// --- 工具函数 ---

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 用指定的 API Key 创建 SDK 实例。
 * 为了避免令牌缓存冲突，通过设置 process.env.CLOUDBASE_APIKEY 来切换。
 */
const createApp = (envId, accessKey) => {
  process.env.CLOUDBASE_APIKEY = accessKey;
  return cloudbase.init({ env: envId });
};

const stripSystemFields = (doc) => {
  const cleaned = { ...doc };
  delete cleaned._id;
  delete cleaned._openid;
  return cleaned;
};

// --- 集合操作 ---

const fetchAllDocs = async (db, collectionName, batchSize = 200) => {
  const allDocs = [];
  let cursor = null;

  while (true) {
    let query = db.collection(collectionName).limit(batchSize);
    if (cursor) query = query.skip(cursor);

    const result = await query.get();
    const docs = result.data || [];
    if (docs.length === 0) break;

    allDocs.push(...docs);
    cursor = (cursor || 0) + docs.length;
    if (docs.length < batchSize) break;
  }

  return allDocs;
};

const countDocs = async (db, collectionName) => {
  try {
    const result = await db.collection(collectionName).count();
    return result.total || 0;
  } catch {
    return 0;
  }
};

// --- 迁移单集合 ---

const migrateOne = async ({
  collectionName,
  sourceAccessKey,
  targetAccessKey,
  dryRun,
  batchSize
}) => {
  console.log(`\n📦 [${collectionName}]`);

  // 阶段 1：用源账号读取数据
  let sourceApp, sourceDb, sourceCount, allDocs;
  try {
    sourceApp = createApp(SOURCE_ENV_ID, sourceAccessKey);
    sourceDb = sourceApp.database();
    sourceCount = await countDocs(sourceDb, collectionName);
    console.log(`   源: ${sourceCount} 条`);

    if (sourceCount === 0) {
      console.log(`   ⏭️  跳过（空）`);
      return { collectionName, sourceCount: 0, migrated: 0, skipped: 0, failed: 0 };
    }

    if (!dryRun) {
      allDocs = await fetchAllDocs(sourceDb, collectionName, batchSize);
      console.log(`   已读取 ${allDocs.length} 条`);
    }
  } catch (error) {
    console.error(`   ❌ 源读取失败: ${error.message}`);
    return { collectionName, sourceCount: 0, migrated: 0, skipped: 0, failed: 0, error: error.message };
  }

  // 阶段 2：切换到目标账号
  let targetApp, targetDb, targetCount;
  try {
    targetApp = createApp(TARGET_ENV_ID, targetAccessKey);
    targetDb = targetApp.database();
    targetCount = await countDocs(targetDb, collectionName);
    console.log(`   目标已有: ${targetCount} 条`);
  } catch (error) {
    console.error(`   ❌ 目标连接失败: ${error.message}`);
    return { collectionName, sourceCount, migrated: 0, skipped: 0, failed: sourceCount, error: error.message };
  }

  if (dryRun) {
    console.log(`   🔍 [DRY-RUN] 将迁移 ${sourceCount} 条`);
    return { collectionName, sourceCount, targetCount, migrated: 0, skipped: 0, failed: 0, dryRun: true };
  }

  // 阶段 2.5：确保目标集合存在
  try {
    await targetDb.createCollection(collectionName);
    console.log(`   ✅ 已创建集合`);
  } catch (err) {
    const msg = err?.message || '';
    if (!msg.includes('already exist') && !msg.includes('ResourceConflict')) {
      console.log(`   ⚠️  建集合: ${msg.substring(0, 80)}`);
    }
  }

  // 阶段 3：写入目标
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of allDocs) {
    const clean = stripSystemFields(doc);
    try {
      await targetDb.collection(collectionName).add(clean);
      migrated += 1;
    } catch (error) {
      const msg = error?.message || String(error);
      if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('ResourceConflict') || msg.includes('E11000')) {
        skipped += 1;
      } else {
        failed += 1;
        if (failed <= 3) {
          console.error(`   ❌ 写入失败: ${msg.substring(0, 150)}`);
        }
      }
    }
  }

  console.log(`   📊 migrated=${migrated} skipped=${skipped} failed=${failed}`);
  return { collectionName, sourceCount, targetCount, migrated, skipped, failed };
};

// --- 主流程 ---

const main = async () => {
  const dryRun = !hasFlag('--write');
  const specifiedCollection = parseFlag('--collection');

  const sourceAccessKey = process.env.SOURCE_ACCESS_KEY;
  const targetAccessKey = process.env.TARGET_ACCESS_KEY;

  if (!sourceAccessKey || !targetAccessKey) {
    console.error('缺少 API Key。请设置：');
    console.error('  export SOURCE_ACCESS_KEY=源账号APIKey');
    console.error('  export TARGET_ACCESS_KEY=目标账号APIKey');
    process.exit(1);
  }

  console.log('========================================');
  console.log('  CloudBase 跨环境数据迁移（串行模式）');
  console.log('========================================');
  console.log(`  源: ${SOURCE_ENV_ID}`);
  console.log(`  目标: ${TARGET_ENV_ID}`);
  console.log(`  模式: ${dryRun ? 'DRY-RUN' : 'WRITE'}`);
  console.log('========================================');

  const collections = specifiedCollection ? [specifiedCollection] : COLLECTIONS_TO_MIGRATE;
  const results = [];
  let totalMigrated = 0, totalSkipped = 0, totalFailed = 0, totalSourceDocs = 0;
  const startTime = Date.now();

  for (const name of collections) {
    try {
      const r = await migrateOne({
        collectionName: name,
        sourceAccessKey,
        targetAccessKey,
        dryRun,
        batchSize: BATCH_SIZE
      });
      results.push(r);
      totalMigrated += r.migrated || 0;
      totalSkipped += r.skipped || 0;
      totalFailed += r.failed || 0;
      totalSourceDocs += r.sourceCount || 0;
      await pause(200);
    } catch (error) {
      console.error(`\n❌ [${name}] 异常: ${error.message}`);
      results.push({ collectionName: name, sourceCount: 0, migrated: 0, skipped: 0, failed: 1, error: error.message });
      totalFailed += 1;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n========================================');
  console.log('  汇总');
  console.log('========================================');
  console.log(`  耗时: ${elapsed}s | 集合: ${collections.length} | 源总文档: ${totalSourceDocs}`);
  console.log(`  已迁移: ${totalMigrated} | 跳过: ${totalSkipped} | 失败: ${totalFailed}`);
  console.log('========================================');

  for (const r of results) {
    const icon = r.error ? '❌' : r.dryRun ? '🔍' : r.failed > 0 ? '⚠️' : '✅';
    const parts = [`源=${r.sourceCount || 0}`];
    if (!r.dryRun) parts.push(`迁=${r.migrated || 0}`, `跳=${r.skipped || 0}`, `败=${r.failed || 0}`);
    if (r.error) parts.push(`err=${r.error.substring(0, 60)}`);
    console.log(`  ${icon} ${r.collectionName}: ${parts.join(' ')}`);
  }

  if (dryRun) {
    console.log('\n🔍 Dry-run 完成。确认无误后执行 --write。');
  } else if (totalFailed === 0) {
    console.log('\n✅ 迁移完成！');
  } else {
    console.log(`\n⚠️  ${totalFailed} 条失败。`);
  }
};

main().catch((error) => {
  console.error('\n❌ 异常:', error);
  process.exit(1);
});
