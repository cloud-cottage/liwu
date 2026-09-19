#!/usr/bin/env node

/**
 * 清空目标环境所有数据，保留集合结构
 * 为重新迁移做准备
 *
 * 用法：node scripts/migrations/20260805_clean_target.mjs --write
 */

import cloudbase from '@cloudbase/node-sdk';
import { parseFlag, hasFlag } from './lib/cloudbase-nosql.mjs';

const TARGET_ENV = 'liwu-d8gek6jjdab1d087c';

const COLLECTIONS = [
  'users', 'tag_categories', 'tags', 'user_tags', 'app_settings',
  'awareness_records', 'shop_categories', 'shop_products', 'shop_product_skus',
  'shop_orders', 'shop_order_items', 'partner_orders', 'partner_sub_orders',
  'partner_brands', 'partner_brand_members', 'partner_brand_invites',
  'user_addresses', 'point_ledger', 'badge_profiles', 'user_profiles',
  'user_wallets', 'user_memberships', 'user_referrals',
  'user_partner_identities', 'user_operational_states', 'audio_transcode_jobs'
];

const pause = (ms) => new Promise(r => setTimeout(r, ms));
const BATCH = 200;

const cleanCollection = async (db, name) => {
  let deleted = 0;
  while (true) {
    const { data } = await db.collection(name).limit(BATCH).get();
    if (!data.length) break;
    for (const doc of data) {
      await db.collection(name).doc(doc._id).remove().catch(() => {});
      deleted++;
    }
    console.log(`  ${name}: 已删 ${deleted}`);
    await pause(200);
  }
  return deleted;
};

const main = async () => {
  const dryRun = !hasFlag('--write');
  const key = process.env.TARGET_ACCESS_KEY;
  if (!key) { console.error('需要 TARGET_ACCESS_KEY'); process.exit(1); }

  const app = cloudbase.init({ env: TARGET_ENV, accessKey: key });
  const db = app.database();

  console.log('目标:', TARGET_ENV, dryRun ? 'DRY-RUN' : 'WRITE');

  let total = 0;
  for (const name of COLLECTIONS) {
    const c = await db.collection(name).count().catch(() => ({ total: 0 }));
    if (!c.total) { console.log(`${name}: 空, 跳过`); continue; }
    if (dryRun) { console.log(`${name}: 将删除 ${c.total} 条`); total += c.total; continue; }
    const n = await cleanCollection(db, name);
    total += n;
    console.log(`${name}: ✅ 删 ${n} 条`);
  }

  console.log(`\n总计: ${total} 条${dryRun ? ' (DRY-RUN)' : ''}`);
  if (dryRun) console.log('加 --write 实际执行');
};

main().catch(e => { console.error(e); process.exit(1); });
