#!/usr/bin/env node

/**
 * 种子脚本 — 为目标环境创建最小可用数据
 * 用法：TARGET_ACCESS_KEY=xxx node scripts/migrations/20260805_seed.mjs
 */

import cloudbase from '@cloudbase/node-sdk';

const ENV = 'liwu-d8gek6jjdab1d087c';

const key = process.env.TARGET_ACCESS_KEY;
if (!key) { console.error('需要 TARGET_ACCESS_KEY'); process.exit(1); }

const app = cloudbase.init({ env: ENV, accessKey: key });
const db = app.database();
const _ = db.command;

const now = () => new Date().toISOString();

const ensureColl = async (name) => {
  try { await db.createCollection(name); console.log(`  ✅ ${name}`); }
  catch(e) { if (!e.message?.includes('exist')) console.log(`  ⚠️ ${name}: ${e.message?.slice(0,60)}`); }
};

const main = async () => {
  console.log('📦 创建集合...');
  for (const c of ['users','tags','tag_categories','user_tags','app_settings','awareness_records',
    'shop_categories','shop_products','shop_product_skus','shop_orders','shop_order_items',
    'partner_orders','partner_sub_orders','partner_brands','partner_brand_members','partner_brand_invites',
    'user_addresses','point_ledger','badge_profiles','user_profiles','user_wallets','user_memberships',
    'user_referrals','user_partner_identities','user_operational_states','audio_transcode_jobs']) {
    await ensureColl(c);
  }

  console.log('\n👤 创建管理员用户...');
  const user = {
    uid: 102, name: '我最棒', phone: '16601061656',
    auth_uid: 'admin_test_102',
    inviteCode: 'INVITE102',
    balance: 0, wealthHistory: [], rewardClaims: {},
    status: 'active', store_id: 'store_102', store_name: '102店铺',
    created_at: now(), updated_at: now(), last_active: now()
  };
  const userResult = await db.collection('users').add(user);
  const userId = userResult.id;
  console.log(`  ✅ users: ${userId}`);

  console.log('\n🏷️ 创建标签...');
  const tagDefs = [
    { name:'超级管理员', category:'admin', type:'role' },
    { name:'管理员', category:'admin', type:'role' },
    { name:'代理商', category:'admin', type:'role' },
    { name:'品牌方', category:'admin', type:'role' },
    { name:'品牌方主理人', category:'admin', type:'role' },
    { name:'禅品', category:'brand', type:'brand' },
    { name:'文品', category:'brand', type:'brand' },
    { name:'香品', category:'brand', type:'brand' },
    { name:'茶品', category:'brand', type:'brand' },
    { name:'理悟课程', category:'brand', type:'brand' },
  ];
  const tagMap = {};
  for (const t of tagDefs) {
    const r = await db.collection('tags').add({ ...t, created_at:now(), updated_at:now() });
    tagMap[t.name] = r.id;
  }
  console.log(`  ✅ ${tagDefs.length} 个标签`);

  console.log('\n🔗 分配用户标签...');
  const userTags = ['超级管理员','管理员','代理商','品牌方','品牌方主理人'];
  for (const tn of userTags) {
    await db.collection('user_tags').add({
      user_id: userId, tag_id: tagMap[tn], tag_name: tn,
      created_at: now(), updated_at: now()
    });
  }
  console.log(`  ✅ ${userTags.length} 个标签`);

  console.log('\n⚙️ 创建 app_settings...');
  const settings = { key:'meditation_reward_settings', reward_points:50, allow_repeat_rewards:true, inviter_reward_rate:0 };
  await db.collection('app_settings').add({ ...settings, created_at:now(), updated_at:now() });
  console.log('  ✅ meditation_reward_settings');

  console.log('\n✅ 种子数据创建完成！');
  console.log(`   用户: phone=16601061656, uid=102`);
  console.log(`   角色: 超级管理员+管理员+代理商+品牌方+品牌方主理人`);
};

main().catch(e => { console.error(e); process.exit(1); });
