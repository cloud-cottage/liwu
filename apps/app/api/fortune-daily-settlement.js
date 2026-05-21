import tcb from '@cloudbase/node-sdk';
import { DATABASE_CONFIG } from '../src/config/database.js';
import { runFortuneDailySettlement } from '../../../packages/shared-utils/fortune-daily-settlement-core.js';

const { cloudbase: { env }, collections } = DATABASE_CONFIG;
const CRON_SECRET = process.env.CRON_SECRET || '';

const buildRequestId = () => `fds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const logSettlementEvent = (requestId, stage, details = {}) => {
  console.log(JSON.stringify({
    scope: 'fortune-daily-settlement',
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

  const result = await db.collection(collections.appSettings).where({ key: 'system_fortune_settings' }).limit(1).get().catch(() => ({ data: [] }));
  const existingDocument = getDocuments(result)[0] || null;
  const currentBalance = Math.max(0, Number(existingDocument?.system_beans_balance ?? existingDocument?.systemBeansBalance ?? 0));
  const payload = {
    key: 'system_fortune_settings',
    system_beans_balance: currentBalance + normalizedDelta,
    updated_at: new Date()
  };

  if (existingDocument) {
    await db.collection(collections.appSettings).doc(existingDocument._id || existingDocument.id).update(payload).catch(() => {});
    return;
  }

  await db.collection(collections.appSettings).add({
    ...payload,
    created_at: new Date()
  }).catch(() => {});
};

export default async function handler(req, res) {
  const requestId = buildRequestId();
  const startedAt = Date.now();

  if (req.method !== 'GET' && req.method !== 'POST') {
    logSettlementEvent(requestId, 'method_not_allowed', { method: req.method });
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const authorization = String(req.headers.authorization || '');
  const expectedAuthorization = CRON_SECRET ? `Bearer ${CRON_SECRET}` : '';
  if (!CRON_SECRET || authorization !== expectedAuthorization) {
    logSettlementEvent(requestId, 'unauthorized', {
      method: req.method,
      hasSecret: Boolean(CRON_SECRET),
      authorizationPresent: Boolean(authorization)
    });
    res.status(401).json({ ok: false, error: 'unauthorized', requestId });
    return;
  }

  try {
    const app = tcb.init({
      env,
      credentials: { env }
    });
    const db = app.database();

    logSettlementEvent(requestId, 'started', { method: req.method });

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
    res.status(200).json({ ...result, requestId });
  } catch (error) {
    logSettlementEvent(requestId, 'failed', {
      durationMs: Date.now() - startedAt,
      message: error?.message || 'Unknown error',
      stack: error?.stack || ''
    });
    res.status(500).json({
      ok: false,
      error: 'fortune_daily_settlement_failed',
      message: error?.message || 'Unknown error',
      requestId
    });
  }
}
