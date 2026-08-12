#!/usr/bin/env node

/**
 * 删除目标环境中所有未支付（pending_payment）的工坊订单及关联商品。
 *
 * 用法：
 *   CLOUDBASE_ADMIN_API_KEY=eyJ... node scripts/clean-pending-orders.mjs
 *   CLOUDBASE_ADMIN_API_KEY=eyJ... node scripts/clean-pending-orders.mjs --dry-run
 */

import cloudbase from '@cloudbase/node-sdk';
import { parseFlag, hasFlag } from './lib/cloudbase-nosql.mjs';

const ENV = 'liwu-d8gek6jjdab1d087c';

const key = process.env.CLOUDBASE_ADMIN_API_KEY;
if (!key) {
  console.error('需要 CLOUDBASE_ADMIN_API_KEY 环境变量');
  process.exit(1);
}

const app = cloudbase.init({ env: ENV, accessKey: key });
const db = app.database();

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchAll = async (collection, filter = {}) => {
  const docs = [];
  let skip = 0;
  const BATCH = 200;
  while (true) {
    let query = db.collection(collection).limit(BATCH).skip(skip);
    if (Object.keys(filter).length > 0) query = query.where(filter);
    const { data } = await query.get();
    if (!data.length) break;
    docs.push(...data);
    skip += data.length;
    if (data.length < BATCH) break;
  }
  return docs;
};

const main = async () => {
  const dryRun = hasFlag('--dry-run');
  const write = hasFlag('--write');

  if (!dryRun && !write) {
    console.log('请指定 --dry-run (预览) 或 --write (执行删除)');
    process.exit(1);
  }

  console.log(`目标环境: ${ENV}${dryRun ? ' [DRY-RUN]' : ' [WRITE]'}`);

  // 1. 查找未支付的 shop_orders
  console.log('\n📋 查找未支付订单 (pending_payment)...');
  const pendingOrders = await fetchAll('shop_orders', { status: 'pending_payment' });
  console.log(`   找到 ${pendingOrders.length} 条`);

  if (pendingOrders.length === 0) {
    console.log('✅ 没有未支付订单，无需清理。');
    return;
  }

  // 2. 查找关联的 shop_order_items
  const orderIds = pendingOrders.map((o) => o._id);
  console.log('\n📋 查找关联订单商品...');
  let orderItems = [];
  for (const oid of orderIds) {
    const items = await fetchAll('shop_order_items', { order_id: oid });
    orderItems.push(...items);
  }
  console.log(`   找到 ${orderItems.length} 条关联商品`);

  if (dryRun) {
    console.log('\n🔍 [DRY-RUN] 将删除：');
    console.log(`   shop_orders: ${pendingOrders.length} 条`);
    pendingOrders.slice(0, 5).forEach((o) => {
      console.log(`     - ${o.order_no || o._id} | ${o.total_cash ? '¥' + o.total_cash : '纯福豆'} | ${o.created_at || '无日期'}`);
    });
    if (pendingOrders.length > 5) console.log(`     ... 还有 ${pendingOrders.length - 5} 条`);
    console.log(`   shop_order_items: ${orderItems.length} 条`);
    console.log('\n加 --write 实际执行删除');
    return;
  }

  // 3. 删除
  console.log('\n🗑️  删除关联商品...');
  let deletedItems = 0;
  for (const item of orderItems) {
    try {
      await db.collection('shop_order_items').doc(item._id).remove();
      deletedItems++;
    } catch (e) {
      console.error(`   ❌ 删除商品失败 ${item._id}: ${e.message?.slice(0, 60)}`);
    }
    if (deletedItems % 20 === 0) await pause(100);
  }
  console.log(`   ✅ 已删除 ${deletedItems} 条`);

  console.log('\n🗑️  删除未支付订单...');
  let deletedOrders = 0;
  for (const order of pendingOrders) {
    try {
      await db.collection('shop_orders').doc(order._id).remove();
      deletedOrders++;
    } catch (e) {
      console.error(`   ❌ 删除订单失败 ${order._id}: ${e.message?.slice(0, 60)}`);
    }
    if (deletedOrders % 20 === 0) await pause(100);
  }
  console.log(`   ✅ 已删除 ${deletedOrders} 条`);

  console.log(`\n🎉 清理完成！删除了 ${deletedOrders} 条订单 + ${deletedItems} 条关联商品。`);
};

main().catch((e) => { console.error(e); process.exit(1); });
