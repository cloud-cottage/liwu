const tcb = require('@cloudbase/node-sdk');
const { runFortuneDailySettlement } = require('./core.js');

const env = process.env.TCB_ENV || process.env.SCF_NAMESPACE || process.env.CLOUDBASE_ENV_ID || '';

const collections = {
  users: 'users',
  tags: 'tags',
  userTags: 'user_tags',
  shopCategories: 'shop_categories',
  shopProducts: 'shop_products',
  shopOrders: 'shop_orders',
  shopOrderItems: 'shop_order_items',
  partnerOrders: 'partner_orders',
  partnerSubOrders: 'partner_sub_orders',
  partnerBrands: 'partner_brands',
  pointLedger: 'point_ledger'
};

const buildRequestId = () => `cft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const logSettlementEvent = (requestId, stage, details = {}) => {
  console.log(JSON.stringify({
    scope: 'cloudbase-fortune-daily-settlement',
    requestId,
    stage,
    ...details
  }));
};

const getDocuments = (result) => Array.isArray(result?.data) ? result.data : [];

const updateSystemFortune = async (db, delta) => {
  const normalizedDelta = Math.max(0, Number(delta || 0));
  if (!normalizedDelta) {
    return;
  }

  const result = await db.collection('app_settings').where({ key: 'system_fortune_settings' }).limit(1).get().catch(() => ({ data: [] }));
  const existingDocument = getDocuments(result)[0] || null;
  const currentBalance = Math.max(0, Number(existingDocument?.system_beans_balance ?? existingDocument?.systemBeansBalance ?? 0));
  const payload = {
    key: 'system_fortune_settings',
    system_beans_balance: currentBalance + normalizedDelta,
    updated_at: new Date()
  };

  if (existingDocument) {
    await db.collection('app_settings').doc(existingDocument._id || existingDocument.id).update(payload).catch(() => {});
    return;
  }

  await db.collection('app_settings').add({
    ...payload,
    created_at: new Date()
  }).catch(() => {});
};

exports.main = async () => {
  const requestId = buildRequestId();
  const startedAt = Date.now();

  try {
    const app = tcb.init({ env });
    const db = app.database();

    logSettlementEvent(requestId, 'started', { env });

    const result = await runFortuneDailySettlement({
      collections,
      queryAll: async (collectionName, limit = 2000) => {
        const response = await db.collection(collectionName).limit(limit).get().catch(() => ({ data: [] }));
        return getDocuments(response);
      },
      updateBrand: async (brandId, payload) => db.collection(collections.partnerBrands).doc(brandId).update(payload).catch(() => {}),
      updateUser: async (userId, payload) => db.collection(collections.users).doc(userId).update(payload).catch(() => {}),
      updateSystemFortune: async (delta) => updateSystemFortune(db, delta),
      addPointLedger: async (payload) => db.collection(collections.pointLedger).add(payload).catch(() => {}),
      log: (stage, details) => logSettlementEvent(requestId, stage, details)
    });

    logSettlementEvent(requestId, 'completed', {
      durationMs: Date.now() - startedAt,
      brandSettlements: result.brandSettlements,
      agentSettlements: result.agentSettlements,
      platformYesterdayTotalSales: result.platformYesterdayTotalSales
    });

    return {
      requestId,
      ...result
    };
  } catch (error) {
    logSettlementEvent(requestId, 'failed', {
      durationMs: Date.now() - startedAt,
      message: error?.message || 'Unknown error',
      stack: error?.stack || ''
    });
    throw error;
  }
};
