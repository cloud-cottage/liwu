import { normalizePhone, buildAuthUid, buildDefaultUserName } from './normalize.js';

const getDocumentTimestamp = (document = {}) => {
  const rawTimestamp =
    document.last_active ||
    document.lastActive ||
    document.updated_at?.$date ||
    document.updated_at ||
    document.created_at?.$date ||
    document.created_at ||
    document.join_date ||
    0;
  const parsedTimestamp = new Date(rawTimestamp).getTime();
  return Number.isNaN(parsedTimestamp) ? 0 : parsedTimestamp;
};

const isSystemGeneratedUserName = (value = '') => {
  const normalizedValue = String(value || '').trim();
  return !normalizedValue || /^觉醒伙伴\d+$/.test(normalizedValue) || /^用户[\da-z_]+$/i.test(normalizedValue);
};

const getResolutionScore = (document = {}, normalizedPhone = '') => {
  let score = 0;

  if (normalizedPhone && normalizePhone(document.phone || '') === normalizedPhone) {
    score += 1000;
  }

  if (Number(document.uid || 0) > 0) {
    score += 100;
  }

  if (!isSystemGeneratedUserName(document.name || '')) {
    score += 80;
  }

  if (Boolean(document.is_student ?? document.isStudent)) {
    score += 50;
  }

  if (Number(document.balance || 0) > 0) {
    score += 20;
  }

  if (
    document.store_id ||
    document.storeId ||
    document.store_role ||
    document.storeRole ||
    document.store_owner_user_id ||
    document.storeOwnerUserId
  ) {
    score += 500;
  }

  if (Array.isArray(document.wealth_history || document.wealthHistory) && (document.wealth_history || document.wealthHistory).length > 0) {
    score += Math.min((document.wealth_history || document.wealthHistory).length, 20);
  }

  return score;
};

export const resolveUserByPhone = async (db, collectionName, phone) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const result = await db.collection(collectionName).where({ phone: normalized }).limit(10).get();
  const docs = result.data || [];
  if (docs.length === 0) return null;
  if (docs.length === 1) return docs[0];

  return [...docs].sort((left, right) => {
    const leftScore = getResolutionScore(left, normalized);
    const rightScore = getResolutionScore(right, normalized);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    const leftTimestamp = getDocumentTimestamp(left);
    const rightTimestamp = getDocumentTimestamp(right);
    if (leftTimestamp !== rightTimestamp) {
      return rightTimestamp - leftTimestamp;
    }

    return (Number(right.uid || 0) || 0) - (Number(left.uid || 0) || 0);
  })[0] || null;
};

export const resolveUserById = async (db, collectionName, userId) => {
  if (!userId) return null;
  try {
    const result = await db.collection(collectionName).doc(userId).get();
    const data = result.data;
    if (Array.isArray(data)) return data[0] || null;
    return data || null;
  } catch {
    return null;
  }
};

export const createUser = async (db, collectionName, { phone, getNextUid }) => {
  const uid = await getNextUid();
  const authUid = buildAuthUid(phone);
  const now = new Date();
  const payload = {
    uid,
    auth_uid: authUid,
    name: buildDefaultUserName(uid),
    phone,
    email: '',
    status: 'active',
    level: 1,
    experience: 0,
    is_student: false,
    balance: 0,
    wealth_history: [],
    reward_claims: {},
    join_date: now.toISOString().slice(0, 10),
    last_active: now.toISOString(),
    created_at: now,
    updated_at: now
  };

  const addResult = await db.collection(collectionName).add(payload);
  return { _id: addResult.id, ...payload };
};

export const normalizeUserProfile = (document = {}) => ({
  id: document._id || document.id || '',
  uid: Number(document.uid || 0),
  authUid: document.auth_uid || document.authUid || '',
  name: document.name || buildDefaultUserName(Number(document.uid) || 1),
  phone: document.phone || '',
  email: document.email || '',
  status: document.status || 'active'
});
