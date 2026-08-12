#!/usr/bin/env node

/**
 * 一键：导出源数据 + 清空目标 + 保留_id重新迁移
 * 
 * 导出文件存在 scripts/migrations/exports/ 下
 *
 * 用法：
 *   SOURCE_ACCESS_KEY=xxx TARGET_ACCESS_KEY=xxx node scripts/migrations/20260805_migrate_v2.mjs
 *   SOURCE_ACCESS_KEY=xxx TARGET_ACCESS_KEY=xxx node scripts/migrations/20260805_migrate_v2.mjs --export-only
 */

import cloudbase from '@cloudbase/node-sdk';
import fs from 'node:fs';
import path from 'node:path';
import { parseFlag, hasFlag } from './lib/cloudbase-nosql.mjs';

const SOURCE_ENV = 'liwu-0gtd91eebd863ccf';
const TARGET_ENV = 'liwu-d8gek6jjdab1d087c';
const BATCH = 200;
const EXPORT_DIR = path.join(import.meta.dirname, 'exports');

const COLLECTIONS = [
  'users','tag_categories','tags','user_tags','app_settings',
  'awareness_records','shop_categories','shop_products','shop_product_skus',
  'shop_orders','shop_order_items','partner_orders','partner_sub_orders',
  'partner_brands','partner_brand_members','partner_brand_invites',
  'user_addresses','point_ledger','badge_profiles','user_profiles',
  'user_wallets','user_memberships','user_referrals',
  'user_partner_identities','user_operational_states','audio_transcode_jobs'
];

const pause = (ms) => new Promise(r => setTimeout(r, ms));

// === EXPORT ===

const exportCollection = async (db, name) => {
  const docs = [];
  let skip = 0;
  while (true) {
    const { data } = await db.collection(name).limit(BATCH).skip(skip).get();
    if (!data.length) break;
    docs.push(...data);
    skip += data.length;
    if (data.length < BATCH) break;
  }
  return docs;
};

const exportAll = async (db) => {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  let total = 0;
  for (const name of COLLECTIONS) {
    try {
      const docs = await exportCollection(db, name);
      if (docs.length === 0) { console.log(`  ${name}: 0 (跳过)`); continue; }
      const file = path.join(EXPORT_DIR, `${name}.json`);
      fs.writeFileSync(file, JSON.stringify(docs, null, 2));
      console.log(`  ✅ ${name}: ${docs.length} docs → ${file}`);
      total += docs.length;
      await pause(100);
    } catch(e) {
      console.log(`  ❌ ${name}: ${e.message?.slice(0,60)}`);
    }
  }
  return total;
};

// === CLEAN TARGET ===

const cleanCollection = async (db, name) => {
  let deleted = 0;
  while (true) {
    const { data } = await db.collection(name).limit(BATCH).get();
    if (!data.length) break;
    for (const doc of data) {
      await db.collection(name).doc(doc._id).remove().catch(() => {});
      deleted++;
    }
    await pause(100);
  }
  return deleted;
};

// === MIGRATE ===

const migrateCollection = async (sourceDb, targetDb, name) => {
  const docs = await exportCollection(sourceDb, name);
  if (!docs.length) return 0;

  // Ensure collection exists in target
  try { await targetDb.createCollection(name); } catch {}

  let migrated = 0;
  for (const doc of docs) {
    const clean = { ...doc };
    // IMPORTANT: keep _openid — see stripSystemFields in 20260805_migrate_to_new_env.mjs
    try {
      await targetDb.collection(name).add(clean);
      migrated++;
    } catch(e) {
      // If duplicate _id or other non-fatal error, log and continue
      if (migrated < 3) console.log(`  ⚠️ ${name} doc error: ${e.message?.slice(0, 80)}`);
    }
    if (migrated % 50 === 0) await pause(100);
  }
  return migrated;
};

// === MAIN ===

const main = async () => {
  const exportOnly = hasFlag('--export-only');
  const srcKey = process.env.SOURCE_ACCESS_KEY;
  const tgtKey = process.env.TARGET_ACCESS_KEY;

  if (!srcKey) { console.error('需要 SOURCE_ACCESS_KEY'); process.exit(1); }
  if (!tgtKey && !exportOnly) { console.error('需要 TARGET_ACCESS_KEY'); process.exit(1); }

  const srcApp = cloudbase.init({ env: SOURCE_ENV, accessKey: srcKey });
  const srcDb = srcApp.database();
  let tgtDb = null;
  if (!exportOnly) {
    const tgtApp = cloudbase.init({ env: TARGET_ENV, accessKey: tgtKey });
    tgtDb = tgtApp.database();
  }

  const startTime = Date.now();

  // 1. EXPORT
  console.log('📤 导出源环境数据...');
  const exported = await exportAll(srcDb);
  const exportTime = ((Date.now() - startTime)/1000).toFixed(1);
  console.log(`\n✅ 导出完成: ${exported} 条文档 (${exportTime}s)\n`);

  if (exportOnly) {
    console.log('--export-only 模式，跳过迁移。');
    return;
  }

  // 2. CLEAN
  console.log('🧹 清空目标环境...');
  let cleaned = 0;
  for (const name of COLLECTIONS) {
    const c = await tgtDb.collection(name).count().catch(() => ({ total: 0 }));
    if (!c.total) continue;
    const n = await cleanCollection(tgtDb, name);
    cleaned += n;
    console.log(`  ${name}: 删 ${n} 条`);
  }
  const cleanTime = ((Date.now() - startTime)/1000).toFixed(1);
  console.log(`\n✅ 清空完成: ${cleaned} 条 (${cleanTime}s)\n`);

  // 3. MIGRATE
  console.log('🚀 重新迁移（保留 _id）...');
  let migrated = 0;
  for (const name of COLLECTIONS) {
    const docs = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, `${name}.json`), 'utf8'));
    if (docs.length === 0) continue;

    // Create collection
    try { await tgtDb.createCollection(name); } catch {}

    let ok = 0;
    for (const doc of docs) {
      const clean = { ...doc };
      delete clean._openid;
      try { await tgtDb.collection(name).add(clean); ok++; } catch {}
      if (ok % 100 === 0) await pause(50);
    }
    migrated += ok;
    console.log(`  ✅ ${name}: ${ok}/${docs.length}`);
    await pause(100);
  }
  const totalTime = ((Date.now() - startTime)/1000).toFixed(1);
  console.log(`\n✅ 迁移完成: ${migrated} 条 (${totalTime}s)`);
};

main().catch(e => { console.error(e); process.exit(1); });
