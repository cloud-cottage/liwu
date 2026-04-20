import cloudbase from '@cloudbase/js-sdk';
import { DATABASE_CONFIG } from '../config/database.js';
import {
  BADGE_ACTIVITY_TYPES,
  BADGE_BONUS_ACTIVITY_MAP,
  BADGE_BONUS_TYPES,
  BADGE_INTERNAL_CATEGORIES,
  BADGE_METRIC_TYPES,
  BADGE_PROFILE_COLLECTION,
  BADGE_SETTINGS_KEY,
  BADGE_SLOT_KEYS,
  createDefaultBadgeSettings,
  flattenBadgeSeries,
  formatBadgeBonusText,
  normalizeBadgeSettings
} from '@liwu/shared-utils/badge-system.js';

const { cloudbase: { env, region, publishableKey, wechatProviderId }, collections } = DATABASE_CONFIG;
const PENDING_INVITE_STORAGE_KEY = 'liwu_pending_invite_code';
const PENDING_AUTH_PHONE_STORAGE_KEY = 'liwu_pending_auth_phone';
const MOCK_PHONE_OTP_STORAGE_KEY = 'liwu_mock_phone_otp_session';
const MOCK_PHONE_AUTH_STORAGE_KEY = 'liwu_mock_phone_auth_session';
const AWARENESS_AUTHOR_KEY_STORAGE_KEY = 'liwu_awareness_author_key';
const REWARD_SETTINGS_KEY = 'meditation_rewards';
const AWARENESS_TAG_SETTINGS_KEY = 'awareness_tag_settings';
const MAX_WEALTH_HISTORY_ITEMS = 50;
const DEFAULT_WECHAT_PROVIDER_ID = wechatProviderId || 'wx_open';
const MOCK_PHONE_OTP_CODE = '1234';
const CLOUDBASE_PROXY_PATH = '/api/cloudbase-proxy';
const SHANGHAI_TIMEZONE = 'Asia/Shanghai';

const shouldUseCloudBaseProxy = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.hostname === 'liwu.yunduojihua.com';
};

const isCloudBaseApiUrl = (value = '') => {
  try {
    const nextUrl = new URL(String(value));
    return nextUrl.hostname.endsWith('.tcb-api.tencentcloudapi.com');
  } catch {
    return false;
  }
};

const toProxyUrl = (targetUrl) => `${CLOUDBASE_PROXY_PATH}?target=${encodeURIComponent(targetUrl)}`;

const installCloudBaseRequestProxy = () => {
  if (typeof window === 'undefined' || !shouldUseCloudBaseProxy() || window.__liwuCloudBaseProxyInstalled) {
    return;
  }

  const originalOpen = window.XMLHttpRequest.prototype.open;

  window.XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
    const nextUrl = typeof url === 'string' && isCloudBaseApiUrl(url) ? toProxyUrl(url) : url;
    return originalOpen.call(this, method, nextUrl, ...rest);
  };

  window.__liwuCloudBaseProxyInstalled = true;
};

installCloudBaseRequestProxy();

const app = cloudbase.init({
  env,
  ...(region ? { region } : {}),
  ...(publishableKey ? { publishableKey } : {})
});

const db = app.database();
const auth = app.auth({ persistence: 'local' });
const _ = db.command;

let loginPromise = null;
let currentProfilePromise = null;
let currentProfileCache = null;

const isMissingCollectionResponse = (response) => response?.code === 'DATABASE_COLLECTION_NOT_EXIST';

const getResponseData = (response, collectionName) => {
  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (response?.data && typeof response.data === 'object') {
    return [response.data];
  }

  if (isMissingCollectionResponse(response)) {
    return [];
  }

  throw new Error(response?.message || `CloudBase query failed for collection "${collectionName}"`);
};

const getFirstDocument = (response, collectionName) => getResponseData(response, collectionName)[0] || null;

const getDocumentId = (document) => document?._id || document?.id || '';

const resolveCurrentUser = async () => auth.currentUser || auth.getCurrentUser();

const resolveCurrentSession = async () => {
  if (typeof auth.getSession !== 'function') {
    return null;
  }

  try {
    const sessionResult = await auth.getSession();
    return sessionResult?.data?.session || null;
  } catch {
    return null;
  }
};

const rememberPendingInviteCode = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const inviteCode = new URL(window.location.href).searchParams.get('invite')?.trim();
  if (inviteCode) {
    window.localStorage.setItem(PENDING_INVITE_STORAGE_KEY, inviteCode);
    return inviteCode;
  }

  return window.localStorage.getItem(PENDING_INVITE_STORAGE_KEY) || '';
};

const clearPendingInviteCode = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
  }
};

const rememberPendingAuthPhone = (phone = '') => {
  if (typeof window === 'undefined') {
    return '';
  }

  const normalizedPhone = String(phone || '').trim();
  if (normalizedPhone) {
    window.sessionStorage.setItem(PENDING_AUTH_PHONE_STORAGE_KEY, normalizedPhone);
    return normalizedPhone;
  }

  return window.sessionStorage.getItem(PENDING_AUTH_PHONE_STORAGE_KEY) || '';
};

const clearPendingAuthPhone = () => {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(PENDING_AUTH_PHONE_STORAGE_KEY);
  }
};

const readLocalStorageValue = (key) => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(key) || '';
};

const writeLocalStorageValue = (key, value) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, value);
};

const readSessionStorageJSON = (key) => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
};

const writeSessionStorageJSON = (key, value) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(key, JSON.stringify(value));
};

const readLocalStorageJSON = (key) => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
};

const writeLocalStorageJSON = (key, value) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
};

const clearMockPhoneOtpSession = () => {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(MOCK_PHONE_OTP_STORAGE_KEY);
  }
};

const readMockPhoneAuthSession = () => readLocalStorageJSON(MOCK_PHONE_AUTH_STORAGE_KEY);

const writeMockPhoneAuthSession = (value) => {
  writeLocalStorageJSON(MOCK_PHONE_AUTH_STORAGE_KEY, value);
};

const clearMockPhoneAuthSession = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(MOCK_PHONE_AUTH_STORAGE_KEY);
  }
};

const clearCurrentProfileCache = () => {
  currentProfileCache = null;
  currentProfilePromise = null;
};

const getOrCreateAwarenessAuthorKey = () => {
  const existingKey = readLocalStorageValue(AWARENESS_AUTHOR_KEY_STORAGE_KEY);
  if (existingKey) {
    return existingKey;
  }

  const nextKey = `aware_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  writeLocalStorageValue(AWARENESS_AUTHOR_KEY_STORAGE_KEY, nextKey);
  return nextKey;
};

const DEFAULT_USER_NAME_PREFIX = '觉醒伙伴';
const AWARENESS_TAG_REUSE_MAX_LENGTH = 18;

const parseNaturalNumber = (value = '') => {
  const normalizedValue = String(value || '').trim();
  if (!/^\d+$/.test(normalizedValue)) {
    return 0;
  }

  const parsedValue = Number(normalizedValue);
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    return 0;
  }

  return parsedValue;
};

const formatNaturalNumber = (value) => String(Math.max(1, Number(value) || 1));

const buildDefaultUserName = (uid = '') => `${DEFAULT_USER_NAME_PREFIX}${formatNaturalNumber(uid)}`;

const isSystemGeneratedUserName = (value = '') => {
  const normalizedValue = String(value || '').trim();

  return (
    !normalizedValue ||
    /^用户\d*$/.test(normalizedValue) ||
    /^小悟[\da-z]+$/i.test(normalizedValue) ||
    /^觉醒伙伴\d+$/.test(normalizedValue)
  );
};

const getUserUid = (document = {}) => (
  parseNaturalNumber(document.uid)
);

const getUserInviteCode = (document = {}) => {
  const existingUid = getUserUid(document);
  return existingUid ? formatNaturalNumber(existingUid) : '';
};

const getNextUserUid = async () => {
  const usersResult = await db.collection(collections.users).limit(2000).get();
  const maxUserUid = getResponseData(usersResult, collections.users).reduce((currentMax, document) => (
    Math.max(currentMax, getUserUid(document))
  ), 0);

  return Number(formatNaturalNumber(maxUserUid + 1));
};

const normalizeAccessType = (value) => (value === 'student' ? 'student' : 'public');

const normalizePhone = (value = '') => {
  const digitsOnlyValue = String(value || '').replace(/[^\d]/g, '');

  if (/^00861\d{10}$/.test(digitsOnlyValue)) {
    return digitsOnlyValue.slice(4);
  }

  if (/^861\d{10}$/.test(digitsOnlyValue)) {
    return digitsOnlyValue.slice(2);
  }

  return digitsOnlyValue;
};

const normalizeProfileName = (value = '') => String(value || '').trim().slice(0, 16);

const buildPhoneAuthUid = (phoneNumber = '') => {
  const normalizedPhoneNumber = normalizePhone(phoneNumber);
  return normalizedPhoneNumber ? `mock_phone_${normalizedPhoneNumber}` : '';
};

const getAuthProviderLabel = (provider = '') => {
  const normalizedProvider = String(provider || '').toLowerCase();

  if (!normalizedProvider || normalizedProvider === 'anonymous') {
    return 'anonymous';
  }

  if (normalizedProvider.includes('wx') || normalizedProvider.includes('wechat')) {
    return 'wechat';
  }

  if (normalizedProvider.includes('phone')) {
    return 'phone';
  }

  return normalizedProvider;
};

const isAnonymousDisplayName = (value = '') => {
  const normalizedValue = String(value || '').trim().toLowerCase();
  return !normalizedValue || normalizedValue === 'anonymous' || normalizedValue === 'anon';
};

const buildMockPhoneSession = ({ phoneNumber, authUid = '', displayName = '' }) => ({
  authUid: buildPhoneAuthUid(phoneNumber) || authUid || `mock_phone_${normalizePhone(phoneNumber)}`,
  phoneNumber: normalizePhone(phoneNumber),
  displayName: displayName || `用户${normalizePhone(phoneNumber).slice(-4)}`,
  loginMethod: 'phone',
  signedInAt: new Date().toISOString()
});

const getDocumentTimestamp = (document = {}) => {
  const rawTimestamp =
    document.created_at?.$date ||
    document.created_at ||
    document.updated_at?.$date ||
    document.updated_at ||
    document.join_date ||
    0;
  const parsedTimestamp = new Date(rawTimestamp).getTime();
  return Number.isNaN(parsedTimestamp) ? 0 : parsedTimestamp;
};

const selectCanonicalUserDocument = (documents = []) => (
  [...documents]
    .filter(Boolean)
    .sort((left, right) => {
      const leftUid = getUserUid(left) || Number.MAX_SAFE_INTEGER;
      const rightUid = getUserUid(right) || Number.MAX_SAFE_INTEGER;
      if (leftUid !== rightUid) {
        return leftUid - rightUid;
      }

      const leftTimestamp = getDocumentTimestamp(left);
      const rightTimestamp = getDocumentTimestamp(right);
      if (leftTimestamp !== rightTimestamp) {
        return leftTimestamp - rightTimestamp;
      }

      return String(getDocumentId(left)).localeCompare(String(getDocumentId(right)));
    })[0] || null
);

const getAwarenessTagLength = (value = '') => (
  Array.from(String(value || '')).reduce((total, character) => (
    total + (/[\u3400-\u9FFF\uF900-\uFAFF]/u.test(character) ? 2 : 1)
  ), 0)
);

const clampInviterRewardRate = (value) => {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return 0;
  }

  return Math.min(20, Math.max(0, Math.round(nextValue)));
};

const normalizeWealthEntry = (entry = {}) => ({
  id: entry.id || `wealth_${Date.now()}`,
  amount: Number(entry.amount || 0),
  description: entry.description || '',
  date: entry.date || new Date().toISOString(),
  type: entry.type || 'EARN',
  source: entry.source || '',
  rewardKey: entry.rewardKey || '',
  relatedUserId: entry.relatedUserId || ''
});

const normalizeWealthHistory = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeWealthEntry)
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, MAX_WEALTH_HISTORY_ITEMS);
};

const normalizeRewardClaims = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
};

const normalizeCurrentUserProfile = (document = {}) => ({
  id: getDocumentId(document),
  uid: getUserUid(document) || 0,
  authUid: document.auth_uid || document.authUid || '',
  name: document.name || buildDefaultUserName(getUserUid(document) || 1),
  email: document.email || '',
  phone: document.phone || '',
  status: document.status || 'active',
  level: Number(document.level ?? 1),
  experience: Number(document.experience ?? 0),
  isStudent: Boolean(document.is_student ?? document.isStudent),
  inviteCode: getUserInviteCode(document),
  inviterUserId: document.inviter_user_id || document.inviterUserId || '',
  balance: Number(document.balance || 0),
  wealthHistory: normalizeWealthHistory(document.wealth_history || document.wealthHistory),
  rewardClaims: normalizeRewardClaims(document.reward_claims || document.rewardClaims),
  joinDate: document.join_date || document.joinDate || '',
  lastActive: document.last_active || document.lastActive || ''
});

const getRecordTimestamp = (record = {}) =>
  record.created_at_client || record.timestamp || record.created_at || record.createdAt || null;

const normalizeAwarenessRecord = (record = {}) => {
  const content = (record.content || '').trim();
  const accessType = normalizeAccessType(record.access_type || record.accessType);

  return {
    id: getDocumentId(record),
    authorKey: record.author_key || record.authorKey || record.auth_uid || record.user_id || '',
    userId: record.user_id || record.userId || '',
    authUid: record.auth_uid || record.authUid || '',
    userName: record.user_name || record.userName || '匿名用户',
    content,
    accessType,
    tagKey: record.tag_key || `${content}::${accessType}`,
    recordSource: record.record_source || record.recordSource || 'manual',
    timestamp: getRecordTimestamp(record),
    rewardPointsAwarded: Math.max(0, Number(record.reward_points_awarded ?? record.rewardPointsAwarded ?? 0))
  };
};

const normalizeShopCategory = (category = {}) => ({
  id: getDocumentId(category),
  name: category.name || '',
  slug: category.slug || '',
  sortOrder: Number(category.sort_order ?? category.sortOrder ?? 0),
  status: category.status || 'active',
  coverImage: category.cover_image || category.coverImage || '',
  description: category.description || ''
});

const normalizeShopProduct = (product = {}) => ({
  id: getDocumentId(product),
  name: product.name || '',
  subtitle: product.subtitle || '',
  categoryId: product.category_id || product.categoryId || '',
  productType: product.product_type || product.productType || 'physical',
  coverImage: product.cover_image || product.coverImage || '',
  gallery: product.gallery || [],
  description: product.description || '',
  detailBlocks: product.detail_blocks || product.detailBlocks || [],
  status: product.status || 'draft',
  skuMode: product.sku_mode || product.skuMode || 'single',
  pricePointsFrom: Number(product.price_points_from ?? product.pricePointsFrom ?? 0),
  priceCashFrom: Number(product.price_cash_from ?? product.priceCashFrom ?? 0),
  rewardPointsReturnFrom: Number(product.reward_points_return_from ?? product.rewardPointsReturnFrom ?? 0),
  stockTotal: Number(product.stock_total ?? product.stockTotal ?? 0),
  salesCount: Number(product.sales_count ?? product.salesCount ?? 0),
  limitPerUser: Number(product.limit_per_user ?? product.limitPerUser ?? 0),
  sortOrder: Number(product.sort_order ?? product.sortOrder ?? 0),
  tags: product.tags || []
});

const normalizeShopSku = (sku = {}) => ({
  id: getDocumentId(sku),
  productId: sku.product_id || sku.productId || '',
  skuName: sku.sku_name || sku.skuName || '',
  skuCode: sku.sku_code || sku.skuCode || '',
  attrs: sku.attrs || {},
  pricePoints: Number(sku.price_points ?? sku.pricePoints ?? 0),
  priceCash: Number(sku.price_cash ?? sku.priceCash ?? 0),
  rewardPointsReturn: Number(sku.reward_points_return ?? sku.rewardPointsReturn ?? 0),
  stock: Number(sku.stock ?? 0),
  lockStock: Number(sku.lock_stock ?? sku.lockStock ?? 0),
  status: sku.status || 'active',
  weight: Number(sku.weight ?? 0)
});

const normalizeAddress = (address = {}) => ({
  id: getDocumentId(address),
  userId: address.user_id || address.userId || '',
  receiverName: address.receiver_name || address.receiverName || '',
  phone: address.phone || '',
  province: address.province || '',
  city: address.city || '',
  district: address.district || '',
  detailAddress: address.detail_address || address.detailAddress || '',
  postalCode: address.postal_code || address.postalCode || '',
  label: address.label || '',
  isDefault: Boolean(address.is_default ?? address.isDefault)
});

const normalizeShopOrder = (order = {}) => ({
  id: getDocumentId(order),
  orderNo: order.order_no || order.orderNo || '',
  userId: order.user_id || order.userId || '',
  orderType: order.order_type || order.orderType || 'points',
  status: order.status || 'pending_payment',
  totalPoints: Number(order.total_points ?? order.totalPoints ?? 0),
  totalCash: Number(order.total_cash ?? order.totalCash ?? 0),
  rewardPointsReturnTotal: Number(order.reward_points_return_total ?? order.rewardPointsReturnTotal ?? 0),
  rewardPointsAwarded: Number(order.reward_points_awarded ?? order.rewardPointsAwarded ?? 0),
  badgeBonusPointsAwarded: Number(order.badge_bonus_points_awarded ?? order.badgeBonusPointsAwarded ?? 0),
  createdAt: order.created_at || order.createdAt || ''
});

const normalizeAwarenessTagSettingEntry = (entry = {}) => ({
  description: entry.description || '',
  rewardPoints: Math.max(0, Number(entry.reward_points ?? entry.rewardPoints ?? 0))
});

const normalizeAwarenessTagSettingsMap = (tagsByKey = {}) => (
  Object.fromEntries(
    Object.entries(tagsByKey || {}).map(([tagKey, entry]) => [tagKey, normalizeAwarenessTagSettingEntry(entry)])
  )
);

const toAddressPayload = (addressData = {}, userId) => ({
  user_id: userId,
  receiver_name: addressData.receiverName || '',
  phone: addressData.phone || '',
  province: addressData.province || '',
  city: addressData.city || '',
  district: addressData.district || '',
  detail_address: addressData.detailAddress || '',
  postal_code: addressData.postalCode || '',
  label: addressData.label || '',
  is_default: Boolean(addressData.isDefault)
});

const generateOrderNo = () => `LW${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Date.now().toString().slice(-6)}`

const groupAwarenessTags = (records, countField, tagSettingsByKey = {}) => {
  const tagMap = new Map();

  records.forEach((record) => {
    if (!record.content) {
      return;
    }

    const existingTag = tagMap.get(record.tagKey) || {
      key: record.tagKey,
      content: record.content,
      accessType: record.accessType,
      [countField]: 0,
      rewardPoints: tagSettingsByKey[record.tagKey]?.rewardPoints || 0,
      totalRewardPoints: 0,
      lastUsedAt: record.timestamp,
      lastUserName: record.userName || '匿名用户',
      description: tagSettingsByKey[record.tagKey]?.description || ''
    };

    existingTag[countField] += 1;
    existingTag.totalRewardPoints += Math.max(0, Number(record.rewardPointsAwarded || 0));

    if (new Date(record.timestamp || 0).getTime() >= new Date(existingTag.lastUsedAt || 0).getTime()) {
      existingTag.lastUsedAt = record.timestamp;
      existingTag.lastUserName = record.userName || '匿名用户';
    }

    existingTag.description = tagSettingsByKey[record.tagKey]?.description || '';
    existingTag.rewardPoints = tagSettingsByKey[record.tagKey]?.rewardPoints || 0;

    tagMap.set(record.tagKey, existingTag);
  });

  return Array.from(tagMap.values()).sort((left, right) => {
    if (right[countField] !== left[countField]) {
      return right[countField] - left[countField];
    }

    return new Date(right.lastUsedAt || 0).getTime() - new Date(left.lastUsedAt || 0).getTime();
  });
};

const getAwarenessTagSettings = async () => {
  try {
    await ensureAnonymousLogin();
    const result = await db
      .collection(collections.appSettings)
      .where({ key: AWARENESS_TAG_SETTINGS_KEY })
      .limit(1)
      .get();

    if (isMissingCollectionResponse(result)) {
      return { tagsByKey: {} };
    }

    const document = getFirstDocument(result, collections.appSettings);
    return {
      tagsByKey: normalizeAwarenessTagSettingsMap(document?.tags_by_key || document?.tagsByKey || {})
    };
  } catch (error) {
    console.error('获取觉察标签配置失败:', error);
    return { tagsByKey: {} };
  }
};

const shanghaiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHANGHAI_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const shanghaiHourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SHANGHAI_TIMEZONE,
  hour: '2-digit',
  hour12: false
});

const toShanghaiDateKey = (value = new Date()) => (
  shanghaiDateFormatter.format(new Date(value))
);

const toShanghaiHour = (value = new Date()) => (
  Number(shanghaiHourFormatter.format(new Date(value)))
);

const getMeditationSlotKey = (value = new Date()) => {
  const hour = toShanghaiHour(value);

  if (hour >= 5 && hour < 11) {
    return BADGE_SLOT_KEYS.dawn;
  }

  if (hour >= 11 && hour < 14) {
    return BADGE_SLOT_KEYS.noon;
  }

  if (hour >= 14 && hour < 18) {
    return BADGE_SLOT_KEYS.afternoon;
  }

  return BADGE_SLOT_KEYS.evening;
};

const buildStreakStats = (dateKeys = []) => {
  const uniqueDateKeys = [...new Set(dateKeys.filter(Boolean))].sort();
  if (uniqueDateKeys.length === 0) {
    return {
      totalDays: 0,
      longestStreak: 0
    };
  }

  let longestStreak = 1;
  let currentStreak = 1;

  for (let index = 1; index < uniqueDateKeys.length; index += 1) {
    const previousDate = new Date(`${uniqueDateKeys[index - 1]}T00:00:00+08:00`);
    const currentDate = new Date(`${uniqueDateKeys[index]}T00:00:00+08:00`);
    const dayDifference = Math.round((currentDate.getTime() - previousDate.getTime()) / 86400000);

    if (dayDifference === 1) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  return {
    totalDays: uniqueDateKeys.length,
    longestStreak
  };
};

const normalizeBadgeProfile = (document = {}) => ({
  id: getDocumentId(document),
  userId: document.user_id || document.userId || '',
  equippedBadgeId: document.equipped_badge_id || document.equippedBadgeId || '',
  unlockedBadgeIds: Array.isArray(document.unlocked_badge_ids || document.unlockedBadgeIds)
    ? [...new Set((document.unlocked_badge_ids || document.unlockedBadgeIds).filter(Boolean))]
    : [],
  unlockedAtMap:
    document.unlocked_at_map && typeof document.unlocked_at_map === 'object' && !Array.isArray(document.unlocked_at_map)
      ? document.unlocked_at_map
      : (document.unlockedAtMap && typeof document.unlockedAtMap === 'object' && !Array.isArray(document.unlockedAtMap)
          ? document.unlockedAtMap
          : {}),
  lastCloudSignDate: document.last_cloud_sign_date || document.lastCloudSignDate || '',
  updatedAt: document.updated_at || document.updatedAt || '',
  missingCollection: false
});

const createEmptyBadgeProfile = (userId = '') => ({
  id: '',
  userId,
  equippedBadgeId: '',
  unlockedBadgeIds: [],
  unlockedAtMap: {},
  lastCloudSignDate: '',
  updatedAt: '',
  missingCollection: false
});

const getBadgeMetricKey = (metricType = '', metricTarget = '') => (
  metricTarget ? `${metricType}::${metricTarget}` : metricType
);

const getBadgeMetricValue = (metrics = {}, metricType = '', metricTarget = '') => (
  Number(metrics[getBadgeMetricKey(metricType, metricTarget)] || 0)
);

const recordPointLedgerEvent = async ({
  userId,
  delta = 0,
  balanceAfter = 0,
  bizType = '',
  bizId = '',
  description = '',
  activityDateKey = '',
  activitySlot = '',
  meta = {},
  createdAt = new Date().toISOString()
}) => {
  await db.collection(collections.pointLedger).add({
    user_id: userId,
    delta: Number(delta || 0),
    balance_after: Number(balanceAfter || 0),
    biz_type: bizType,
    biz_id: bizId,
    description,
    activity_date_key: activityDateKey || toShanghaiDateKey(createdAt),
    activity_slot: activitySlot || '',
    meta,
    operator_id: '',
    created_at: createdAt
  });
};

const getBadgeSettings = async () => {
  try {
    await ensureAnonymousLogin();
    const result = await db
      .collection(collections.appSettings)
      .where({ key: BADGE_SETTINGS_KEY })
      .limit(1)
      .get();

    if (isMissingCollectionResponse(result)) {
      return {
        ...normalizeBadgeSettings(createDefaultBadgeSettings()),
        missingCollection: true
      };
    }

    const document = getFirstDocument(result, collections.appSettings);
    if (!document) {
      return normalizeBadgeSettings(createDefaultBadgeSettings());
    }

    return normalizeBadgeSettings(document);
  } catch (error) {
    console.error('获取徽章配置失败:', error);
    return normalizeBadgeSettings(createDefaultBadgeSettings());
  }
};

const getBadgeProfileByUserId = async (userId = '') => {
  if (!userId) {
    return createEmptyBadgeProfile();
  }

  try {
    await ensureAnonymousLogin();
    const result = await db
      .collection(collections.badgeProfiles)
      .where({ user_id: userId })
      .limit(1)
      .get();

    if (isMissingCollectionResponse(result)) {
      return {
        ...createEmptyBadgeProfile(userId),
        missingCollection: true
      };
    }

    const document = getFirstDocument(result, collections.badgeProfiles);
    return document ? normalizeBadgeProfile(document) : createEmptyBadgeProfile(userId);
  } catch (error) {
    console.error('获取用户徽章档案失败:', error);
    return createEmptyBadgeProfile(userId);
  }
};

const saveBadgeProfileByUserId = async (userId = '', nextProfile = {}) => {
  if (!userId) {
    return createEmptyBadgeProfile();
  }

  const existingProfile = await getBadgeProfileByUserId(userId);
  if (existingProfile.missingCollection) {
    return existingProfile;
  }

  const payload = {
    user_id: userId,
    equipped_badge_id: nextProfile.equippedBadgeId || '',
    unlocked_badge_ids: [...new Set((nextProfile.unlockedBadgeIds || []).filter(Boolean))],
    unlocked_at_map: nextProfile.unlockedAtMap || {},
    last_cloud_sign_date: nextProfile.lastCloudSignDate || '',
    updated_at: new Date()
  };

  if (existingProfile.id) {
    await db.collection(collections.badgeProfiles).doc(existingProfile.id).update(payload);
    return normalizeBadgeProfile({
      ...existingProfile,
      ...payload,
      _id: existingProfile.id
    });
  }

  const createResult = await db.collection(collections.badgeProfiles).add({
    ...payload,
    created_at: new Date()
  });

  return normalizeBadgeProfile({
    ...payload,
    _id: createResult.id
  });
};

const awardUserById = async ({
  userId,
  amount,
  description,
  source = 'badge_bonus',
  rewardKey = '',
  relatedUserId = ''
}) => {
  const normalizedAmount = Math.max(0, Number(amount) || 0);
  if (!userId || normalizedAmount <= 0) {
    return {
      rewarded: false,
      rewardAmount: 0
    };
  }

  const userResult = await db.collection(collections.users).doc(userId).get();
  const userDocument = getFirstDocument(userResult, collections.users);
  if (!userDocument) {
    return {
      rewarded: false,
      rewardAmount: 0
    };
  }

  const targetProfile = normalizeCurrentUserProfile(userDocument);
  if (rewardKey && targetProfile.rewardClaims[rewardKey]) {
    return {
      rewarded: false,
      rewardAmount: 0,
      repeatedRewardBlocked: true,
      balance: targetProfile.balance,
      history: targetProfile.wealthHistory
    };
  }

  const nowIso = new Date().toISOString();
  const historyEntry = normalizeWealthEntry({
    id: `badge_${Date.now()}`,
    amount: normalizedAmount,
    description,
    date: nowIso,
    type: 'EARN',
    source,
    rewardKey,
    relatedUserId
  });

  const rewardClaims = rewardKey
    ? {
        ...targetProfile.rewardClaims,
        [rewardKey]: nowIso
      }
    : targetProfile.rewardClaims;

  await db.collection(collections.users).doc(userId).update({
    balance: _.inc(normalizedAmount),
    wealth_history: _.unshift(historyEntry),
    ...(rewardKey ? { reward_claims: rewardClaims } : {}),
    updated_at: new Date()
  });

  if (currentProfileCache?.id === userId) {
    updateCurrentProfileCache({
      ...targetProfile,
      balance: targetProfile.balance + normalizedAmount,
      wealthHistory: [historyEntry, ...targetProfile.wealthHistory].slice(0, MAX_WEALTH_HISTORY_ITEMS),
      rewardClaims
    });
  }

  return {
    rewarded: true,
    rewardAmount: normalizedAmount,
    repeatedRewardBlocked: false,
    balance: targetProfile.balance + normalizedAmount,
    history: [historyEntry, ...targetProfile.wealthHistory].slice(0, MAX_WEALTH_HISTORY_ITEMS)
  };
};

const computeBadgeMetricsForUser = async (currentProfile = null) => {
  if (!currentProfile?.id) {
    return {};
  }

  const [pointLedgerResult, awarenessResult, inviteUsersResult, shopOrdersResult] = await Promise.all([
    db.collection(collections.pointLedger).where({ user_id: currentProfile.id }).limit(2000).get().catch(() => ({ data: [] })),
    db.collection(collections.awarenessRecords).where({ user_id: currentProfile.id }).limit(2000).get().catch(() => ({ data: [] })),
    db.collection(collections.users).where({ inviter_user_id: currentProfile.id }).limit(1000).get().catch(() => ({ data: [] })),
    db.collection(collections.shopOrders).where({ user_id: currentProfile.id }).limit(1000).get().catch(() => ({ data: [] }))
  ]);

  const pointLedgerEntries = getResponseData(pointLedgerResult, collections.pointLedger);
  const awarenessEntries = getResponseData(awarenessResult, collections.awarenessRecords);
  const inviteUsers = getResponseData(inviteUsersResult, collections.users);
  const shopOrders = getResponseData(shopOrdersResult, collections.shopOrders);

  const cloudSignDateKeys = pointLedgerEntries
    .filter((entry) => entry.biz_type === BADGE_ACTIVITY_TYPES.cloudSign)
    .map((entry) => entry.activity_date_key || toShanghaiDateKey(entry.created_at || new Date()));

  const cloudSignStats = buildStreakStats(cloudSignDateKeys);

  const meditationEntries = pointLedgerEntries.filter((entry) => entry.biz_type === BADGE_ACTIVITY_TYPES.meditation);
  const meditationDateKeys = meditationEntries.map((entry) => entry.activity_date_key || toShanghaiDateKey(entry.created_at || new Date()));
  const meditationStats = buildStreakStats(meditationDateKeys);

  const meditationSlotStats = Object.values(BADGE_SLOT_KEYS).reduce((accumulator, slotKey) => {
    const slotDateKeys = meditationEntries
      .filter((entry) => (entry.activity_slot || '') === slotKey)
      .map((entry) => entry.activity_date_key || toShanghaiDateKey(entry.created_at || new Date()));

    return {
      ...accumulator,
      [slotKey]: buildStreakStats(slotDateKeys)
    };
  }, {});

  const awarenessDateKeys = awarenessEntries.map((entry) => toShanghaiDateKey(entry.created_at_client || entry.created_at || entry.timestamp || new Date()));
  const awarenessStats = buildStreakStats(awarenessDateKeys);
  const awarenessFollowCount = awarenessEntries.filter((entry) => (entry.record_source || entry.recordSource || 'manual') === 'follow').length;
  const awarenessCreatedCount = Math.max(0, awarenessEntries.length - awarenessFollowCount);

  const inPersonCount = pointLedgerEntries.filter((entry) => entry.biz_type === BADGE_ACTIVITY_TYPES.inPerson).length;
  const shopSpendTotalAmount = shopOrders
    .filter((order) => ['paid', 'processing', 'shipped', 'completed'].includes(order.status || ''))
    .filter((order) => Math.max(0, Number(order.total_cash ?? order.totalCash ?? 0)) > 0)
    .reduce((total, order) => total + Math.max(0, Number(order.total_cash ?? order.totalCash ?? 0)), 0);

  return {
    [BADGE_METRIC_TYPES.cloudSignTotalDays]: cloudSignStats.totalDays,
    [BADGE_METRIC_TYPES.cloudSignStreakDays]: cloudSignStats.longestStreak,
    [BADGE_METRIC_TYPES.meditationTotalDays]: meditationStats.totalDays,
    [BADGE_METRIC_TYPES.meditationTotalStreakDays]: meditationStats.longestStreak,
    [getBadgeMetricKey(BADGE_METRIC_TYPES.meditationSlotTotalDays, BADGE_SLOT_KEYS.dawn)]: meditationSlotStats.dawn.totalDays,
    [getBadgeMetricKey(BADGE_METRIC_TYPES.meditationSlotStreakDays, BADGE_SLOT_KEYS.dawn)]: meditationSlotStats.dawn.longestStreak,
    [getBadgeMetricKey(BADGE_METRIC_TYPES.meditationSlotTotalDays, BADGE_SLOT_KEYS.noon)]: meditationSlotStats.noon.totalDays,
    [getBadgeMetricKey(BADGE_METRIC_TYPES.meditationSlotStreakDays, BADGE_SLOT_KEYS.noon)]: meditationSlotStats.noon.longestStreak,
    [getBadgeMetricKey(BADGE_METRIC_TYPES.meditationSlotTotalDays, BADGE_SLOT_KEYS.afternoon)]: meditationSlotStats.afternoon.totalDays,
    [getBadgeMetricKey(BADGE_METRIC_TYPES.meditationSlotStreakDays, BADGE_SLOT_KEYS.afternoon)]: meditationSlotStats.afternoon.longestStreak,
    [getBadgeMetricKey(BADGE_METRIC_TYPES.meditationSlotTotalDays, BADGE_SLOT_KEYS.evening)]: meditationSlotStats.evening.totalDays,
    [getBadgeMetricKey(BADGE_METRIC_TYPES.meditationSlotStreakDays, BADGE_SLOT_KEYS.evening)]: meditationSlotStats.evening.longestStreak,
    [BADGE_METRIC_TYPES.awarenessCreatedTotal]: awarenessCreatedCount,
    [BADGE_METRIC_TYPES.awarenessFollowTotal]: awarenessFollowCount,
    [BADGE_METRIC_TYPES.awarenessStreakDays]: awarenessStats.longestStreak,
    [BADGE_METRIC_TYPES.inviteTotal]: inviteUsers.length,
    [BADGE_METRIC_TYPES.shopSpendTotalAmount]: shopSpendTotalAmount,
    [BADGE_METRIC_TYPES.inPersonTotalCount]: inPersonCount
  };
};

const syncBadgeProfileForCurrentUser = async ({ currentProfile = null, profileOverrides = {} } = {}) => {
  if (!currentProfile?.id) {
    return {
      settings: normalizeBadgeSettings(createDefaultBadgeSettings()),
      badgeProfile: createEmptyBadgeProfile(),
      badges: [],
      groupedBadges: {
        growth: [],
        builder: []
      }
    };
  }

  const [settings, existingBadgeProfile, metrics] = await Promise.all([
    getBadgeSettings(),
    getBadgeProfileByUserId(currentProfile.id),
    computeBadgeMetricsForUser(currentProfile)
  ]);

  const flattenedBadges = flattenBadgeSeries(settings).filter((badge) => badge.enabled !== false);
  const nowIso = new Date().toISOString();
  const unlockedBadgeIds = [...new Set([
    ...existingBadgeProfile.unlockedBadgeIds,
    ...flattenedBadges
      .filter((badge) => getBadgeMetricValue(metrics, badge.metricType, badge.metricTarget) >= badge.threshold)
      .map((badge) => badge.badgeId)
  ])];

  const unlockedAtMap = { ...existingBadgeProfile.unlockedAtMap };
  unlockedBadgeIds.forEach((badgeId) => {
    if (!unlockedAtMap[badgeId]) {
      unlockedAtMap[badgeId] = nowIso;
    }
  });

  const enabledBadgeIds = new Set(flattenedBadges.map((badge) => badge.badgeId));
  const nextEquippedBadgeId = unlockedBadgeIds.includes(existingBadgeProfile.equippedBadgeId) &&
    enabledBadgeIds.has(existingBadgeProfile.equippedBadgeId)
    ? existingBadgeProfile.equippedBadgeId
    : '';

  const mergedProfile = {
    ...existingBadgeProfile,
    ...profileOverrides,
    equippedBadgeId: profileOverrides.equippedBadgeId !== undefined ? profileOverrides.equippedBadgeId : nextEquippedBadgeId,
    unlockedBadgeIds,
    unlockedAtMap
  };

  const savedProfile = existingBadgeProfile.missingCollection
    ? {
        ...normalizeBadgeProfile(mergedProfile),
        missingCollection: true
      }
    : await saveBadgeProfileByUserId(currentProfile.id, mergedProfile);

  const badges = flattenedBadges.map((badge) => ({
    ...badge,
    earned: savedProfile.unlockedBadgeIds.includes(badge.badgeId),
    equipped: savedProfile.equippedBadgeId === badge.badgeId,
    unlockedAt: savedProfile.unlockedAtMap[badge.badgeId] || '',
    progressValue: getBadgeMetricValue(metrics, badge.metricType, badge.metricTarget),
    bonusSummary: formatBadgeBonusText(badge)
  }));

  return {
    settings,
    badgeProfile: savedProfile,
    badges,
    groupedBadges: {
      growth: badges.filter((badge) => badge.visibleGroup === 'growth'),
      builder: badges.filter((badge) => badge.visibleGroup === 'builder')
    }
  };
};

const calculateBadgeBonusAmount = (badge = {}, baseAmount = 0) => {
  const normalizedBaseAmount = Math.max(0, Number(baseAmount) || 0);
  const normalizedBonusValue = Math.max(0, Number(badge.bonusValue || 0));

  if (normalizedBonusValue <= 0) {
    return 0;
  }

  if (badge.bonusType === BADGE_BONUS_TYPES.fixed) {
    return normalizedBonusValue;
  }

  return Math.floor((normalizedBaseAmount * normalizedBonusValue) / 100);
};

const applyEquippedBadgeBonusForUser = async ({
  userId,
  activityType,
  baseAmount = 0,
  eventKey = '',
  description = ''
}) => {
  if (!userId || !activityType || !eventKey) {
    return {
      rewarded: false,
      rewardAmount: 0
    };
  }

  const currentProfile = currentProfileCache?.id === userId
    ? currentProfileCache
    : normalizeCurrentUserProfile(getFirstDocument(await db.collection(collections.users).doc(userId).get(), collections.users) || {});

  const { badges, badgeProfile } = await syncBadgeProfileForCurrentUser({ currentProfile });
  const equippedBadge = badges.find((badge) => badge.badgeId === badgeProfile.equippedBadgeId);

  if (!equippedBadge || equippedBadge.bonusActivity !== activityType || !equippedBadge.earned) {
    return {
      rewarded: false,
      rewardAmount: 0
    };
  }

  const rewardAmount = calculateBadgeBonusAmount(equippedBadge, baseAmount);
  if (rewardAmount <= 0) {
    return {
      rewarded: false,
      rewardAmount: 0,
      badge: equippedBadge
    };
  }

  const rewardDescription = description || `${equippedBadge.name}佩戴加成`;
  const rewardKey = `badge_bonus:${equippedBadge.badgeId}:${eventKey}`;

  const result = await awardUserById({
    userId,
    amount: rewardAmount,
    description: rewardDescription,
    source: `badge_bonus_${activityType}`,
    rewardKey
  });

  return {
    ...result,
    badge: equippedBadge
  };
};

const claimDailyCloudSign = async () => {
  const currentProfile = await userProfileService.getCurrentProfile({ refresh: true, allowAnonymous: true });
  if (!currentProfile?.id) {
    return {
      claimed: false,
      rewardAmount: 0
    };
  }

  const existingProfile = await getBadgeProfileByUserId(currentProfile.id);
  const dateKey = toShanghaiDateKey();

  if (existingProfile.lastCloudSignDate === dateKey) {
    return {
      claimed: false,
      rewardAmount: 0
    };
  }

  if (existingProfile.missingCollection) {
    const existingCloudSignResult = await db
      .collection(collections.pointLedger)
      .where({
        user_id: currentProfile.id,
        biz_type: BADGE_ACTIVITY_TYPES.cloudSign,
        activity_date_key: dateKey
      })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));

    if (getFirstDocument(existingCloudSignResult, collections.pointLedger)) {
      return {
        claimed: false,
        rewardAmount: 0
      };
    }
  }

  const nowIso = new Date().toISOString();
  await recordPointLedgerEvent({
    userId: currentProfile.id,
    delta: 0,
    balanceAfter: currentProfile.balance,
    bizType: BADGE_ACTIVITY_TYPES.cloudSign,
    bizId: `cloud_sign:${currentProfile.id}:${dateKey}`,
    description: '每日云签',
    activityDateKey: dateKey,
    meta: {
      timezone: SHANGHAI_TIMEZONE
    },
    createdAt: nowIso
  });

  const bonusResult = await applyEquippedBadgeBonusForUser({
    userId: currentProfile.id,
    activityType: BADGE_ACTIVITY_TYPES.cloudSign,
    baseAmount: 0,
    eventKey: `${currentProfile.id}:${dateKey}`,
    description: '云签佩戴加成'
  });

  await syncBadgeProfileForCurrentUser({
    currentProfile,
    profileOverrides: {
      lastCloudSignDate: dateKey
    }
  });

  return {
    claimed: true,
    rewardAmount: bonusResult.rewardAmount || 0,
    badge: bonusResult.badge || null
  };
};

const buildShareLinks = ({ title, text, url }) => {
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);

  return {
    weibo: `https://service.weibo.com/share/share.php?title=${encodedText}&url=${encodedUrl}`,
    x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    linkedIn: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    native: { title, text, url }
  };
};

const normalizeAuthStatus = ({ session, currentUser } = {}) => {
  const sessionUser = session?.user || null;
  const provider =
    sessionUser?.app_metadata?.provider ||
    sessionUser?.app_metadata?.providers?.[0] ||
    currentUser?.loginType ||
    '';
  const loginMethod = getAuthProviderLabel(provider);
  const authUid = sessionUser?.id || sessionUser?.sub || currentUser?.uid || '';
  const phoneNumber = normalizePhone(sessionUser?.phone || sessionUser?.phone_number || currentUser?.phoneNumber || '');
  const email = sessionUser?.email || currentUser?.email || '';
  const displayName =
    sessionUser?.user_metadata?.name ||
    sessionUser?.user_metadata?.nickName ||
    sessionUser?.user_metadata?.username ||
    currentUser?.name ||
    currentUser?.username ||
    buildDefaultUserName(authUid);
  const isAnonymous = Boolean(
    sessionUser?.is_anonymous ||
    loginMethod === 'anonymous' ||
    currentUser?.loginType === 'ANONYMOUS'
  );

  return {
    hasSession: Boolean(sessionUser),
    authUid,
    phoneNumber,
    email,
    displayName: isAnonymousDisplayName(displayName) && isAnonymous ? buildDefaultUserName(authUid) : displayName,
    provider,
    loginMethod,
    isAnonymous,
    isAuthenticated: Boolean(sessionUser) && !isAnonymous,
    isMockSession: false
  };
};

const resolveAuthStatus = async ({ allowAnonymous = false } = {}) => {
  let currentUser = await resolveCurrentUser().catch(() => null);
  let session = await resolveCurrentSession();

  if (!currentUser && !session && allowAnonymous) {
    await ensureAnonymousLogin();
    currentUser = await resolveCurrentUser().catch(() => null);
    session = await resolveCurrentSession();
  }

  const baseStatus = normalizeAuthStatus({ session, currentUser });
  const mockPhoneAuthSession = readMockPhoneAuthSession();

  if (baseStatus.isAuthenticated) {
    return baseStatus;
  }

  if (!mockPhoneAuthSession) {
    return baseStatus;
  }

  return {
    ...baseStatus,
    hasSession: true,
    authUid: mockPhoneAuthSession.authUid || baseStatus.authUid,
    phoneNumber: mockPhoneAuthSession.phoneNumber || baseStatus.phoneNumber,
    displayName: mockPhoneAuthSession.displayName || baseStatus.displayName,
    provider: 'mock_phone',
    loginMethod: 'phone',
    isAnonymous: false,
    isAuthenticated: true,
    isMockSession: true
  };
};

const resolveAwarenessIdentity = async () => {
  const fallbackAuthorKey = getOrCreateAwarenessAuthorKey();
  let authStatus = {
    authUid: '',
    displayName: '',
    isAuthenticated: false
  };
  let currentProfile = null;

  try {
    authStatus = await resolveAuthStatus({ allowAnonymous: true });
  } catch (error) {
    console.error('读取觉察身份状态失败:', error);
  }

  try {
    currentProfile = await userProfileService.getCurrentProfile({
      refresh: false,
      allowAnonymous: true
    });
  } catch (error) {
    console.error('读取觉察用户档案失败:', error);
  }

  const authorKey = currentProfile?.authUid || authStatus.authUid || fallbackAuthorKey;
  const userId = currentProfile?.id || authorKey;
  const authUid = currentProfile?.authUid || authStatus.authUid || authorKey;
  const userName =
    currentProfile?.name ||
    authStatus.displayName ||
    buildDefaultUserName(authUid);

  return {
    authorKey,
    userId,
    authUid,
    userName,
    isAuthenticated: Boolean(authStatus.isAuthenticated),
    isStudent: Boolean(currentProfile?.isStudent),
    profile: currentProfile
  };
};

const updateCurrentProfileCache = (nextProfile) => {
  currentProfileCache = nextProfile;
  return currentProfileCache;
};

export const ensureAnonymousLogin = async () => {
  const existingUser = await resolveCurrentUser();
  if (existingUser) {
    return existingUser;
  }

  const existingLoginState = auth.hasLoginState() || await auth.getLoginState();
  if (existingLoginState) {
    return resolveCurrentUser();
  }

  if (!loginPromise) {
    loginPromise = auth.signInAnonymously()
      .then(() => resolveCurrentUser())
      .finally(() => {
        loginPromise = null;
      });
  }

  return loginPromise;
};

export const userProfileService = {
  async ensureCurrentProfile(options = {}) {
    const { refresh = false, allowAnonymous = true } = options;

    if (!refresh && currentProfileCache) {
      return currentProfileCache;
    }

    if (!refresh && currentProfilePromise) {
      return currentProfilePromise;
    }

    currentProfilePromise = (async () => {
      rememberPendingInviteCode();

      const authStatus = await resolveAuthStatus({ allowAnonymous });
      const authUid = authStatus?.authUid || '';
      const normalizedPhoneNumber = normalizePhone(authStatus.phoneNumber);
      const nowIso = new Date().toISOString();

      if (!authUid) {
        clearCurrentProfileCache();
        return null;
      }

      let authUidDocument = null;
      let phoneMatchedDocuments = [];

      if (authUid) {
        const existingResult = await db.collection(collections.users).where({ auth_uid: authUid }).limit(1).get();
        authUidDocument = getFirstDocument(existingResult, collections.users);
      }

      if (normalizedPhoneNumber) {
        const phoneMatchedResult = await db.collection(collections.users).where({ phone: normalizedPhoneNumber }).limit(20).get();
        phoneMatchedDocuments = getResponseData(phoneMatchedResult, collections.users);
      }

      const existingDocument = phoneMatchedDocuments.length > 0
        ? selectCanonicalUserDocument([authUidDocument, ...phoneMatchedDocuments])
        : authUidDocument;

      if (existingDocument) {
        const existingProfile = normalizeCurrentUserProfile(existingDocument);
        const rawExistingUid = getUserUid(existingDocument);
        const resolvedUid = existingProfile.uid || await getNextUserUid();
        const resolvedDefaultName = buildDefaultUserName(resolvedUid);
        const updatePayload = {
          last_active: nowIso,
          updated_at: new Date()
        };

        if (authUid && existingProfile.authUid !== authUid) {
          updatePayload.auth_uid = authUid;
        }

        if (authStatus.email && existingProfile.email !== authStatus.email) {
          updatePayload.email = authStatus.email;
        }

        if (normalizedPhoneNumber && existingProfile.phone !== normalizedPhoneNumber) {
          updatePayload.phone = normalizedPhoneNumber;
        }

        if (rawExistingUid !== resolvedUid) {
          updatePayload.uid = resolvedUid;
        }

        if (!existingProfile.name || isSystemGeneratedUserName(existingProfile.name)) {
          updatePayload.name = resolvedDefaultName;
        }

        if (!Array.isArray(existingDocument.wealth_history)) {
          updatePayload.wealth_history = existingProfile.wealthHistory;
        }

        if (!existingDocument.reward_claims || typeof existingDocument.reward_claims !== 'object') {
          updatePayload.reward_claims = existingProfile.rewardClaims;
        }

        await db.collection(collections.users).doc(existingProfile.id).update(updatePayload);

        clearPendingInviteCode();

        return updateCurrentProfileCache(
          normalizeCurrentUserProfile({
            ...existingDocument,
            ...updatePayload,
            _id: existingProfile.id
          })
        );
      }

      const pendingInviteCode = rememberPendingInviteCode();
      let inviterUserId = '';

      if (pendingInviteCode) {
        const inviterUid = parseNaturalNumber(pendingInviteCode);
        const inviterResult = await db
          .collection(collections.users)
          .where({ uid: inviterUid })
          .limit(1)
          .get();
        const inviterDocument = getFirstDocument(inviterResult, collections.users);

        if (inviterDocument && (inviterDocument.auth_uid || inviterDocument.authUid) !== authUid) {
          inviterUserId = getDocumentId(inviterDocument);
        }
      }

      const newUserPayload = {
        uid: await getNextUserUid(),
        auth_uid: authUid,
        name: '',
        email: authStatus.email,
        phone: normalizedPhoneNumber,
        status: 'active',
        level: 1,
        experience: 0,
        is_student: false,
        inviter_user_id: inviterUserId,
        balance: 0,
        wealth_history: [],
        reward_claims: {},
        join_date: nowIso.slice(0, 10),
        last_active: nowIso,
        created_at: new Date(),
        updated_at: new Date()
      };
      newUserPayload.name = buildDefaultUserName(newUserPayload.uid);

      const createResult = await db.collection(collections.users).add(newUserPayload);
      clearPendingInviteCode();

      return updateCurrentProfileCache(
        normalizeCurrentUserProfile({
          ...newUserPayload,
          _id: createResult.id
        })
      );
    })().finally(() => {
      currentProfilePromise = null;
    });

    return currentProfilePromise;
  },

  async getCurrentProfile(options = {}) {
    return this.ensureCurrentProfile(options);
  },

  async updateCurrentProfile(profilePatch) {
    const authStatus = await resolveAuthStatus({ allowAnonymous: false });
    if (!authStatus.isAuthenticated) {
      throw new Error('请先登录后再修改资料');
    }

    const currentProfile = await this.ensureCurrentProfile({ allowAnonymous: false });
    if (!currentProfile) {
      return null;
    }
    const updatePayload = {
      ...profilePatch,
      updated_at: new Date()
    };

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'name')) {
      const normalizedName = normalizeProfileName(updatePayload.name);
      if (!normalizedName) {
        throw new Error('请输入用户名');
      }

      updatePayload.name = normalizedName;
    }

    await db.collection(collections.users).doc(currentProfile.id).update(updatePayload);

    return updateCurrentProfileCache(
      normalizeCurrentUserProfile({
        ...currentProfile,
        ...updatePayload,
        _id: currentProfile.id
      })
    );
  },

  async buildInviteLink({ tagContent } = {}) {
    const currentProfile = await this.ensureCurrentProfile();

    if (typeof window === 'undefined') {
      return `/record?invite=${encodeURIComponent(currentProfile.inviteCode)}`;
    }

    const shareUrl = new URL('/aware', window.location.origin);
    shareUrl.searchParams.set('invite', currentProfile.inviteCode);

    if (tagContent) {
      shareUrl.searchParams.set('tag', tagContent.trim().slice(0, 6));
    }

    return shareUrl.toString();
  }
};

export const awarenessService = {
  async getTagMetadata(tagKey) {
    const settings = await getAwarenessTagSettings();
    return normalizeAwarenessTagSettingEntry(settings.tagsByKey?.[tagKey] || {});
  },

  async findExistingTagByContent(content) {
    try {
      const normalizedContent = String(content || '').trim();
      if (!normalizedContent) {
        return { success: true, data: null };
      }

      const [recordsResult, awarenessTagSettings] = await Promise.all([
        db.collection(collections.awarenessRecords).where({ content: normalizedContent }).limit(500).get(),
        getAwarenessTagSettings()
      ]);

      const tags = groupAwarenessTags(
        getResponseData(recordsResult, collections.awarenessRecords).map(normalizeAwarenessRecord),
        'totalCount',
        awarenessTagSettings.tagsByKey
      );

      if (tags.length === 0) {
        return { success: true, data: null };
      }

      const sortedTags = [...tags].sort((left, right) => {
        if (left.accessType !== right.accessType) {
          if (left.accessType === 'public') {
            return -1;
          }
          if (right.accessType === 'public') {
            return 1;
          }
        }

        if ((right.totalCount || 0) !== (left.totalCount || 0)) {
          return (right.totalCount || 0) - (left.totalCount || 0);
        }

        return new Date(right.lastUsedAt || 0).getTime() - new Date(left.lastUsedAt || 0).getTime();
      });

      return {
        success: true,
        data: sortedTags[0]
      };
    } catch (error) {
      console.error('查询既有觉察标签失败:', error);
      return { success: false, error };
    }
  },

  async addRecord(content, options = {}) {
    try {
      const trimmedContent = content.trim();
      const awarenessIdentity = await resolveAwarenessIdentity();
      const accessType = normalizeAccessType(options.accessType || 'public');
      const recordSource = options.recordSource === 'follow' ? 'follow' : 'manual';

      if (!awarenessIdentity.isAuthenticated || !awarenessIdentity.profile?.id) {
        throw new Error('请先登录后再发布觉察标签');
      }

      if (!trimmedContent) {
        throw new Error('请输入标签内容');
      }

      if (getAwarenessTagLength(trimmedContent) > AWARENESS_TAG_REUSE_MAX_LENGTH) {
        throw new Error('标签长度不能超过 9 个汉字');
      }

      if (accessType === 'student' && !awarenessIdentity.isStudent) {
        throw new Error('学员觉察标签仅学员可发布');
      }

      const nowIso = new Date().toISOString();
      const tagKey = `${trimmedContent}::${accessType}`;
      const tagMetadata = await this.getTagMetadata(tagKey);
      const configuredRewardPoints = Math.max(0, Number(tagMetadata.rewardPoints || 0));
      const basePayload = {
        author_key: awarenessIdentity.authorKey,
        user_id: awarenessIdentity.userId,
        auth_uid: awarenessIdentity.authUid,
        user_name: awarenessIdentity.userName,
        content: trimmedContent,
        access_type: accessType,
        tag_key: tagKey,
        record_source: recordSource,
        timestamp: nowIso,
        created_at_client: nowIso,
        reward_points_setting_snapshot: configuredRewardPoints,
        reward_points_awarded: 0
      };

      let result;

      try {
        result = await db.collection(collections.awarenessRecords).add({
          ...basePayload,
          createdAt: db.serverDate(),
          created_at: db.serverDate()
        });
      } catch (primaryError) {
        console.error('觉察写入使用 serverDate 失败，改用本地时间重试:', primaryError);
        result = await db.collection(collections.awarenessRecords).add({
          ...basePayload,
          createdAt: new Date(),
          created_at: new Date()
        });
      }

      if (!result?.id) {
        throw new Error(result?.message || '添加觉察记录失败');
      }

      let rewardResult = {
        rewarded: false,
        rewardAmount: 0,
        inviterBonusAmount: 0
      };
      let badgeBonusResult = {
        rewarded: false,
        rewardAmount: 0
      };

      if (configuredRewardPoints > 0) {
        try {
          rewardResult = await wealthService.awardCurrentUser({
            amount: configuredRewardPoints,
            description: `觉察奖励：${trimmedContent}`,
            source: 'awareness_tag',
            rewardKey: `${tagKey}::${result.id}`,
            allowRepeatReward: true
          });

          if (rewardResult.rewardAmount > 0) {
            await db.collection(collections.awarenessRecords).doc(result.id).update({
              reward_points_awarded: rewardResult.rewardAmount,
              updated_at: new Date()
            });
          }
        } catch (rewardError) {
          console.error('发放觉察标签奖励失败:', rewardError);
        }
      }

      try {
        badgeBonusResult = await applyEquippedBadgeBonusForUser({
          userId: awarenessIdentity.userId,
          activityType: BADGE_ACTIVITY_TYPES.awareness,
          baseAmount: rewardResult.rewardAmount || configuredRewardPoints,
          eventKey: result.id,
          description: `觉察佩戴加成：${trimmedContent}`
        });
      } catch (badgeBonusError) {
        console.error('发放觉察徽章加成失败:', badgeBonusError);
      }

      const totalRewardAwarded = Math.max(0, Number(rewardResult.rewardAmount || 0)) + Math.max(0, Number(badgeBonusResult.rewardAmount || 0));
      if (totalRewardAwarded > 0) {
        await db.collection(collections.awarenessRecords).doc(result.id).update({
          reward_points_awarded: totalRewardAwarded,
          updated_at: new Date()
        });
      }

      if (awarenessIdentity.profile?.id) {
        void syncBadgeProfileForCurrentUser({
          currentProfile: awarenessIdentity.profile
        });
      }

      return {
        success: true,
        id: result.id,
        record: normalizeAwarenessRecord({
          ...basePayload,
          reward_points_awarded: totalRewardAwarded,
          _id: result.id
        }),
        reward: {
          ...rewardResult,
          badgeBonusAmount: badgeBonusResult.rewardAmount || 0,
          rewardAmount: totalRewardAwarded
        }
      };
    } catch (error) {
      console.error('添加觉察记录失败:', error);
      return { success: false, error };
    }
  },

  async getUserRecords(limit = 100) {
    try {
      const awarenessIdentity = await resolveAwarenessIdentity();
      const queries = [
        awarenessIdentity.authorKey ? { author_key: awarenessIdentity.authorKey } : null,
        awarenessIdentity.profile?.id ? { user_id: awarenessIdentity.profile.id } : null,
        awarenessIdentity.authUid && awarenessIdentity.authUid !== awarenessIdentity.authorKey
          ? { auth_uid: awarenessIdentity.authUid }
          : null
      ].filter(Boolean);

      const results = await Promise.all(
        queries.map(async (query) => {
          const result = await db
            .collection(collections.awarenessRecords)
            .where(query)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();

          return getResponseData(result, collections.awarenessRecords).map(normalizeAwarenessRecord);
        })
      );

      const recordsById = new Map();
      results.flat().forEach((record) => {
        if (record.id) {
          recordsById.set(record.id, record);
        }
      });

      return {
        success: true,
        data: Array.from(recordsById.values())
          .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime())
          .slice(0, limit)
      };
    } catch (error) {
      console.error('获取用户觉察记录失败:', error);
      return { success: false, error };
    }
  },

  async getRecentRecords(limit = 40) {
    try {
      const result = await db
        .collection(collections.awarenessRecords)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const records = getResponseData(result, collections.awarenessRecords)
        .map(normalizeAwarenessRecord)
        .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime());

      return { success: true, data: records };
    } catch (error) {
      console.error('获取最新觉察失败:', error);
      return { success: false, error };
    }
  },

  async getUserTags() {
    try {
      const [recordsResult, awarenessTagSettings] = await Promise.all([
        this.getUserRecords(),
        getAwarenessTagSettings()
      ]);
      if (!recordsResult.success) {
        return { success: false, error: recordsResult.error };
      }

      return {
        success: true,
        data: groupAwarenessTags(recordsResult.data, 'count', awarenessTagSettings.tagsByKey)
      };
    } catch (error) {
      console.error('获取用户标签统计失败:', error);
      return { success: false, error };
    }
  },

  async getPopularTags(limit = 16) {
    try {
      const [recentRecordsResult, awarenessTagSettings] = await Promise.all([
        this.getRecentRecords(5000),
        getAwarenessTagSettings()
      ]);
      if (!recentRecordsResult.success) {
        return { success: false, error: recentRecordsResult.error };
      }

      return {
        success: true,
        data: groupAwarenessTags(recentRecordsResult.data, 'totalCount', awarenessTagSettings.tagsByKey).slice(0, limit)
      };
    } catch (error) {
      console.error('获取热门标签失败:', error);
      return { success: false, error };
    }
  },

  async buildSharePayload(content) {
    const shareUrl = await userProfileService.buildInviteLink({ tagContent: content });
    const shareText = `我刚刚在理悟记录了此刻的觉察：「${content}」。一起进入应用，安住当下。`;

    return {
      title: '理悟 · 觉察此刻',
      text: shareText,
      url: shareUrl,
      links: buildShareLinks({
        title: '理悟 · 觉察此刻',
        text: shareText,
        url: shareUrl
      })
    };
  }
};

export const rewardSettingsService = {
  async getSettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: REWARD_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionResponse(result)) {
        return {
          rewardPoints: 50,
          allowRepeatRewards: true,
          inviterRewardRate: 0
        };
      }

      const document = getFirstDocument(result, collections.appSettings);

      return {
        rewardPoints: Number(document?.reward_points ?? document?.rewardPoints ?? 50),
        allowRepeatRewards: Boolean(document?.allow_repeat_rewards ?? document?.allowRepeatRewards ?? true),
        inviterRewardRate: clampInviterRewardRate(document?.inviter_reward_rate ?? document?.inviterRewardRate ?? 0)
      };
    } catch (error) {
      console.error('获取奖励设置失败:', error);
      return {
        rewardPoints: 50,
        allowRepeatRewards: true,
        inviterRewardRate: 0
      };
    }
  }
};

export const wealthService = {
  async getCurrentWallet(options = {}) {
    const currentProfile = await userProfileService.getCurrentProfile(options);

    if (!currentProfile) {
      return null;
    }

    return {
      balance: currentProfile.balance,
      history: currentProfile.wealthHistory
    };
  },

  async awardCurrentUser({ amount, description, source = 'manual', rewardKey = '', allowRepeatReward = true }) {
    const normalizedAmount = Math.max(0, Number(amount) || 0);
    const currentProfile = await userProfileService.getCurrentProfile({ refresh: true });

    if (!allowRepeatReward && rewardKey && currentProfile.rewardClaims[rewardKey]) {
      return {
        rewarded: false,
        rewardAmount: 0,
        repeatedRewardBlocked: true,
        inviterBonusAmount: 0,
        balance: currentProfile.balance,
        history: currentProfile.wealthHistory
      };
    }

    if (normalizedAmount <= 0) {
      return {
        rewarded: false,
        rewardAmount: 0,
        repeatedRewardBlocked: false,
        inviterBonusAmount: 0,
        balance: currentProfile.balance,
        history: currentProfile.wealthHistory
      };
    }

    const nowIso = new Date().toISOString();
    const historyEntry = normalizeWealthEntry({
      id: `wealth_${Date.now()}`,
      amount: normalizedAmount,
      description,
      date: nowIso,
      type: 'EARN',
      source,
      rewardKey
    });

    const rewardClaims = !allowRepeatReward && rewardKey
      ? {
          ...currentProfile.rewardClaims,
          [rewardKey]: nowIso
        }
      : currentProfile.rewardClaims;

    await db.collection(collections.users).doc(currentProfile.id).update({
      balance: _.inc(normalizedAmount),
      wealth_history: _.unshift(historyEntry),
      ...(rewardClaims !== currentProfile.rewardClaims ? { reward_claims: rewardClaims } : {}),
      last_active: nowIso,
      updated_at: new Date()
    });

    const nextProfile = updateCurrentProfileCache({
      ...currentProfile,
      balance: currentProfile.balance + normalizedAmount,
      wealthHistory: [historyEntry, ...currentProfile.wealthHistory].slice(0, MAX_WEALTH_HISTORY_ITEMS),
      rewardClaims,
      lastActive: nowIso
    });

    let inviterBonusAmount = 0;
    let inviterBadgeBonusAmount = 0;

    if (currentProfile.inviterUserId) {
      const rewardSettings = await rewardSettingsService.getSettings();
      inviterBonusAmount = Math.floor((normalizedAmount * clampInviterRewardRate(rewardSettings.inviterRewardRate)) / 100);

      if (inviterBonusAmount > 0) {
        const inviterEntry = normalizeWealthEntry({
          id: `invite_${Date.now()}`,
          amount: inviterBonusAmount,
          description: `邀请奖励：${nextProfile.name} 获得福豆`,
          date: nowIso,
          type: 'EARN',
          source: 'invite_bonus',
          rewardKey: rewardKey ? `${rewardKey}__invite_bonus__${currentProfile.id}` : '',
          relatedUserId: currentProfile.id
        });

        await db.collection(collections.users).doc(currentProfile.inviterUserId).update({
          balance: _.inc(inviterBonusAmount),
          wealth_history: _.unshift(inviterEntry),
          updated_at: new Date()
        });

        const inviterBadgeBonusResult = await applyEquippedBadgeBonusForUser({
          userId: currentProfile.inviterUserId,
          activityType: BADGE_ACTIVITY_TYPES.invite,
          baseAmount: inviterBonusAmount,
          eventKey: rewardKey ? `${rewardKey}__invite_bonus__${currentProfile.id}` : `${currentProfile.inviterUserId}:${currentProfile.id}:${nowIso}`,
          description: `邀请佩戴加成：${nextProfile.name} 完成奖励`
        });
        inviterBadgeBonusAmount = inviterBadgeBonusResult.rewardAmount || 0;
      }
    }

    return {
      rewarded: true,
      rewardAmount: normalizedAmount,
      repeatedRewardBlocked: false,
      inviterBonusAmount: inviterBonusAmount + inviterBadgeBonusAmount,
      balance: nextProfile.balance,
      history: nextProfile.wealthHistory
    };
  },

  async spendCurrentUser({ amount, description, source = 'spend' }) {
    const normalizedAmount = Math.max(0, Number(amount) || 0);
    const currentProfile = await userProfileService.getCurrentProfile({ refresh: true });

    if (normalizedAmount <= 0) {
      return {
        success: false,
        balance: currentProfile.balance,
        history: currentProfile.wealthHistory
      };
    }

    if (currentProfile.balance < normalizedAmount) {
      return {
        success: false,
        insufficientBalance: true,
        balance: currentProfile.balance,
        history: currentProfile.wealthHistory
      };
    }

    const nowIso = new Date().toISOString();
    const historyEntry = normalizeWealthEntry({
      id: `spend_${Date.now()}`,
      amount: -normalizedAmount,
      description,
      date: nowIso,
      type: 'SPEND',
      source
    });

    await db.collection(collections.users).doc(currentProfile.id).update({
      balance: _.inc(-normalizedAmount),
      wealth_history: _.unshift(historyEntry),
      updated_at: new Date()
    });

    const nextProfile = updateCurrentProfileCache({
      ...currentProfile,
      balance: currentProfile.balance - normalizedAmount,
      wealthHistory: [historyEntry, ...currentProfile.wealthHistory].slice(0, MAX_WEALTH_HISTORY_ITEMS)
    });

    return {
      success: true,
      balance: nextProfile.balance,
      history: nextProfile.wealthHistory
    };
  }
};

export const shopService = {
  async getCategories() {
    try {
      await ensureAnonymousLogin();
      const result = await db.collection(collections.shopCategories).where({ status: 'active' }).limit(100).get();
      return getResponseData(result, collections.shopCategories)
        .map(normalizeShopCategory)
        .sort((left, right) => left.sortOrder - right.sortOrder);
    } catch (error) {
      console.error('获取工坊分类失败:', error);
      return [];
    }
  },

  async getProducts({ categoryId = '', limit = 100 } = {}) {
    try {
      await ensureAnonymousLogin();
      const query = categoryId
        ? { status: 'active', category_id: categoryId }
        : { status: 'active' };
      const result = await db.collection(collections.shopProducts).where(query).limit(limit).get();
      return getResponseData(result, collections.shopProducts)
        .map(normalizeShopProduct)
        .sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
          }

          return right.salesCount - left.salesCount;
        });
    } catch (error) {
      console.error('获取工坊商品失败:', error);
      return [];
    }
  },

  async getProductDetail(productId) {
    try {
      await ensureAnonymousLogin();
      const [productResult, skuResult, categories] = await Promise.all([
        db.collection(collections.shopProducts).doc(productId).get(),
        db.collection(collections.shopProductSkus).where({ product_id: productId, status: 'active' }).limit(100).get(),
        this.getCategories()
      ]);

      const productDocument = getFirstDocument(productResult, collections.shopProducts);
      if (!productDocument) {
        return null;
      }

      const product = normalizeShopProduct(productDocument);
      const category = categories.find((item) => item.id === product.categoryId) || null;
      const skus = getResponseData(skuResult, collections.shopProductSkus)
        .map(normalizeShopSku)
        .sort((left, right) => left.pricePoints - right.pricePoints);

      return {
        ...product,
        category,
        skus
      };
    } catch (error) {
      console.error('获取工坊商品详情失败:', error);
      return null;
    }
  },

  async getUserAddresses() {
    try {
      const currentProfile = await userProfileService.getCurrentProfile({ refresh: true });
      if (!currentProfile) {
        return [];
      }

      const result = await db.collection(collections.userAddresses).where({ user_id: currentProfile.id }).limit(50).get();
      return getResponseData(result, collections.userAddresses)
        .map(normalizeAddress)
        .sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
    } catch (error) {
      console.error('获取收货地址失败:', error);
      return [];
    }
  },

  async saveUserAddress(addressData) {
    const currentProfile = await userProfileService.getCurrentProfile({ refresh: true });
    if (!currentProfile) {
      throw new Error('请先登录后再保存地址');
    }

    if (!addressData.receiverName || !addressData.phone || !addressData.province || !addressData.city || !addressData.detailAddress) {
      throw new Error('请填写完整地址信息');
    }

    const payload = {
      ...toAddressPayload(addressData, currentProfile.id),
      updated_at: new Date()
    };

    if (payload.is_default) {
      const existingAddresses = await this.getUserAddresses();
      await Promise.all(existingAddresses.map((address) => (
        db.collection(collections.userAddresses).doc(address.id).update({ is_default: false, updated_at: new Date() })
      )));
    }

    if (addressData.id) {
      await db.collection(collections.userAddresses).doc(addressData.id).update(payload);
      return normalizeAddress({ _id: addressData.id, ...payload });
    }

    const result = await db.collection(collections.userAddresses).add({
      ...payload,
      created_at: new Date()
    });

    return normalizeAddress({ _id: result.id, ...payload });
  },

  async createPointsOrder({
    productId,
    skuId,
    quantity = 1,
    addressId = ''
  }) {
    const currentProfile = await userProfileService.getCurrentProfile({ refresh: true });
    if (!currentProfile) {
      throw new Error('请先登录后再下单');
    }

    const product = await this.getProductDetail(productId);
    if (!product) {
      throw new Error('商品不存在');
    }

    const sku = product.skus.find((item) => item.id === skuId) || product.skus[0] || null;
    if (!sku) {
      throw new Error('该商品暂无可下单规格');
    }

    const normalizedQuantity = Math.max(1, Number(quantity) || 1);
    const totalPoints = sku.pricePoints * normalizedQuantity;
    const totalCash = sku.priceCash * normalizedQuantity;
    const totalRewardPointsReturn = Math.max(0, Number(sku.rewardPointsReturn || 0)) * normalizedQuantity;
    const isCashOrder = totalCash > 0;

    if (currentProfile.balance < totalPoints) {
      throw new Error('福豆余额不足');
    }

    let receiverSnapshot = null;
    if (product.productType === 'physical') {
      const addresses = await this.getUserAddresses();
      const address = addresses.find((item) => item.id === addressId) || addresses.find((item) => item.isDefault) || null;
      if (!address) {
        throw new Error('请先填写收货地址');
      }

      receiverSnapshot = {
        receiver_name: address.receiverName,
        phone: address.phone,
        province: address.province,
        city: address.city,
        district: address.district,
        detail_address: address.detailAddress,
        postal_code: address.postalCode,
        label: address.label
      };
    }

    const nowIso = new Date().toISOString();
    const orderNo = generateOrderNo();
    const orderType = isCashOrder ? (totalPoints > 0 ? 'mixed' : 'cash') : 'points';
    const orderPayload = {
      order_no: orderNo,
      user_id: currentProfile.id,
      order_type: orderType,
      status: isCashOrder ? 'pending_payment' : 'paid',
      address_id: addressId || '',
      receiver_snapshot: receiverSnapshot,
      total_points: totalPoints,
      total_cash: totalCash,
      reward_points_return_total: totalRewardPointsReturn,
      reward_points_awarded: 0,
      badge_bonus_points_awarded: 0,
      shipping_fee: 0,
      discount_cash: 0,
      discount_points: 0,
      pay_channel: isCashOrder ? 'cash_pending' : 'points',
      pay_transaction_id: '',
      remark: '',
      cancel_reason: '',
      paid_at: isCashOrder ? '' : nowIso,
      shipped_at: '',
      completed_at: '',
      created_at: nowIso,
      updated_at: nowIso
    };

    const orderResult = await db.collection(collections.shopOrders).add(orderPayload);
    const orderId = orderResult.id;

    const orderItemPayload = {
      order_id: orderId,
      product_id: product.id,
      sku_id: sku.id,
      product_name_snapshot: product.name,
      sku_name_snapshot: sku.skuName || '默认规格',
      cover_snapshot: product.coverImage,
      attrs_snapshot: sku.attrs || {},
      price_points_snapshot: sku.pricePoints,
      price_cash_snapshot: sku.priceCash,
      reward_points_return_snapshot: sku.rewardPointsReturn || 0,
      quantity: normalizedQuantity,
      subtotal_points: totalPoints,
      subtotal_cash: totalCash,
      product_type: product.productType,
      created_at: nowIso
    };

    await db.collection(collections.shopOrderItems).add(orderItemPayload);

    const nextBalance = currentProfile.balance - totalPoints;
    let pointLedgerPayload = null;

    if (totalPoints > 0) {
      pointLedgerPayload = {
        user_id: currentProfile.id,
        delta: -totalPoints,
        balance_after: nextBalance,
        biz_type: 'shop_spend',
        biz_id: orderId,
        description: isCashOrder ? `工坊下单占用福豆：${product.name}` : `工坊兑换：${product.name}`,
        activity_date_key: toShanghaiDateKey(nowIso),
        operator_id: '',
        created_at: nowIso
      };

      await db.collection(collections.pointLedger).add(pointLedgerPayload);

      const wealthHistoryEntry = normalizeWealthEntry({
        id: `shop_spend_${Date.now()}`,
        amount: -totalPoints,
        description: isCashOrder ? `工坊下单占用福豆：${product.name}` : `工坊兑换：${product.name}`,
        date: nowIso,
        type: 'SPEND',
        source: 'shop_spend',
        relatedUserId: currentProfile.id
      });

      await db.collection(collections.users).doc(currentProfile.id).update({
        balance: nextBalance,
        wealth_history: _.unshift(wealthHistoryEntry),
        updated_at: new Date()
      });

      updateCurrentProfileCache({
        ...currentProfile,
        balance: nextBalance,
        wealthHistory: [wealthHistoryEntry, ...currentProfile.wealthHistory].slice(0, MAX_WEALTH_HISTORY_ITEMS)
      });
    }

    if (!isCashOrder) {
      void syncBadgeProfileForCurrentUser({
        currentProfile: {
          ...currentProfile,
          balance: nextBalance
        }
      });
    }

    return {
      order: normalizeShopOrder({
        _id: orderId,
        ...orderPayload
      }),
      item: orderItemPayload,
      pointLedger: pointLedgerPayload,
      balance: nextBalance,
      badgeBonusAmount: 0
    };
  }
};

export const badgeService = {
  async getCurrentUserBadgeState(options = {}) {
    const currentProfile = await userProfileService.getCurrentProfile({
      refresh: options.refresh ?? false,
      allowAnonymous: options.allowAnonymous ?? true
    });

    return syncBadgeProfileForCurrentUser({ currentProfile });
  },

  async equipBadge(badgeId = '') {
    const currentProfile = await userProfileService.getCurrentProfile({ refresh: true, allowAnonymous: true });
    if (!currentProfile?.id) {
      throw new Error('请先登录后再佩戴徽章');
    }

    const syncedState = await syncBadgeProfileForCurrentUser({ currentProfile });
    if (syncedState.badgeProfile?.missingCollection) {
      throw new Error(`请先在 CloudBase 创建集合 ${collections.badgeProfiles}`);
    }

    const targetBadge = syncedState.badges.find((badge) => badge.badgeId === badgeId);

    if (!targetBadge) {
      throw new Error('未找到该徽章');
    }

    if (!targetBadge.earned) {
      throw new Error('尚未获得该徽章，暂时不能佩戴');
    }

    const nextEquippedBadgeId = syncedState.badgeProfile.equippedBadgeId === badgeId ? '' : badgeId;
    return syncBadgeProfileForCurrentUser({
      currentProfile,
      profileOverrides: {
        equippedBadgeId: nextEquippedBadgeId
      }
    });
  },

  async claimDailyCloudSign() {
    return claimDailyCloudSign();
  },

  async recordMeditationCompletion({
    duration = 0,
    rewardAmount = 0,
    description = '完成一次冥想'
  } = {}) {
    const currentProfile = await userProfileService.getCurrentProfile({ refresh: true, allowAnonymous: true });
    if (!currentProfile?.id) {
      return {
        slot: '',
        badgeBonusAmount: 0
      };
    }

    const nowIso = new Date().toISOString();
    const slotKey = getMeditationSlotKey(nowIso);
    const eventKey = `meditation:${currentProfile.id}:${Date.now()}`;

    await recordPointLedgerEvent({
      userId: currentProfile.id,
      delta: 0,
      balanceAfter: currentProfile.balance,
      bizType: BADGE_ACTIVITY_TYPES.meditation,
      bizId: eventKey,
      description,
      activityDateKey: toShanghaiDateKey(nowIso),
      activitySlot: slotKey,
      meta: {
        duration
      },
      createdAt: nowIso
    });

    const badgeBonusResult = await applyEquippedBadgeBonusForUser({
      userId: currentProfile.id,
      activityType: BADGE_ACTIVITY_TYPES.meditation,
      baseAmount: rewardAmount,
      eventKey,
      description: '冥想佩戴加成'
    });

    await syncBadgeProfileForCurrentUser({ currentProfile });

    return {
      slot: slotKey,
      badgeBonusAmount: badgeBonusResult.rewardAmount || 0,
      badge: badgeBonusResult.badge || null
    };
  },

  async syncCurrentUserBadgeState(options = {}) {
    const currentProfile = await userProfileService.getCurrentProfile({
      refresh: options.refresh ?? true,
      allowAnonymous: options.allowAnonymous ?? true
    });

    return syncBadgeProfileForCurrentUser({ currentProfile });
  }
};

export const authService = {
  async getAuthStatus(options = {}) {
    return resolveAuthStatus(options);
  },

  async loginAnonymously() {
    try {
      await ensureAnonymousLogin();
      const authStatus = await resolveAuthStatus({ allowAnonymous: true });
      return { success: true, authStatus };
    } catch (error) {
      console.error('匿名登录失败:', error);
      return { success: false, error };
    }
  },

  async requestPhoneOtp(phone) {
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      throw new Error('请输入手机号');
    }

    rememberPendingAuthPhone(normalizedPhone);
    writeSessionStorageJSON(MOCK_PHONE_OTP_STORAGE_KEY, {
      phoneNumber: normalizedPhone,
      requestedAt: new Date().toISOString(),
      code: MOCK_PHONE_OTP_CODE
    });

    return {
      success: true,
      mockCode: MOCK_PHONE_OTP_CODE
    };
  },

  async verifyPhoneOtp({ phone, code }) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedCode = String(code || '').trim();

    if (!normalizedPhone) {
      throw new Error('请输入手机号');
    }

    if (!normalizedCode) {
      throw new Error('请输入验证码');
    }

    const mockPhoneOtpSession = readSessionStorageJSON(MOCK_PHONE_OTP_STORAGE_KEY);

    if (!mockPhoneOtpSession || mockPhoneOtpSession.phoneNumber !== normalizedPhone) {
      throw new Error('请先获取验证码');
    }

    if (normalizedCode !== MOCK_PHONE_OTP_CODE) {
      throw new Error('验证码错误，请输入 1234');
    }

    clearPendingAuthPhone();
    clearMockPhoneOtpSession();

    let currentAuthStatus = {
      authUid: '',
      displayName: ''
    };

    try {
      currentAuthStatus = await resolveAuthStatus({ allowAnonymous: true });
    } catch (error) {
      console.error('读取当前匿名态失败:', error);
    }

    let profile = null;
    let mockSession = buildMockPhoneSession({
      phoneNumber: normalizedPhone,
      authUid: currentAuthStatus.authUid,
      displayName: currentAuthStatus.displayName && !isAnonymousDisplayName(currentAuthStatus.displayName)
        ? currentAuthStatus.displayName
        : ''
    });

    writeMockPhoneAuthSession(mockSession);

    try {
      await ensureAnonymousLogin();
      clearCurrentProfileCache();
      profile = await userProfileService.ensureCurrentProfile({ refresh: true, allowAnonymous: true });
      if (profile?.phone !== normalizedPhone) {
        profile = await userProfileService.updateCurrentProfile({ phone: normalizedPhone });
      }

      if (profile) {
        mockSession = buildMockPhoneSession({
          phoneNumber: normalizedPhone,
          authUid: profile.authUid,
          displayName: profile.name
        });
        writeMockPhoneAuthSession(mockSession);
      }
    } catch (error) {
      console.error('模拟手机号登录云端同步失败:', error);
    }

    return {
      success: true,
      profile,
      authStatus: await resolveAuthStatus({ allowAnonymous: false })
    };
  },

  hasOAuthRedirectParams() {
    if (typeof window === 'undefined') {
      return false;
    }

    const searchParams = new URLSearchParams(window.location.search);
    return Boolean(searchParams.get('code') && searchParams.get('state'));
  },

  async startWechatLogin({ phone, redirectTo } = {}) {
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      throw new Error('请输入手机号');
    }

    rememberPendingAuthPhone(normalizedPhone);

    const signInResult = await auth.signInWithOAuth({
      provider: DEFAULT_WECHAT_PROVIDER_ID,
      options: {
        redirectTo
      }
    });

    if (signInResult?.error) {
      clearPendingAuthPhone();
      throw new Error(signInResult.error.message || '微信登录跳转失败');
    }

    return { success: true, data: signInResult?.data };
  },

  async completeWechatLogin() {
    const verifyResult = await auth.verifyOAuth({
      provider: DEFAULT_WECHAT_PROVIDER_ID
    });

    if (verifyResult?.error) {
      clearPendingAuthPhone();
      throw new Error(verifyResult.error.message || '微信登录失败');
    }

    clearCurrentProfileCache();
    let profile = await userProfileService.ensureCurrentProfile({ refresh: true, allowAnonymous: false });
    const pendingPhone = rememberPendingAuthPhone();

    if (pendingPhone && profile?.phone !== pendingPhone) {
      profile = await userProfileService.updateCurrentProfile({ phone: pendingPhone });
    }

    clearPendingAuthPhone();

    return {
      success: true,
      profile,
      authStatus: await resolveAuthStatus({ allowAnonymous: false })
    };
  },

  async signOut() {
    try {
      const currentStatus = await resolveAuthStatus({ allowAnonymous: false });
      clearPendingAuthPhone();
      clearMockPhoneOtpSession();
      clearMockPhoneAuthSession();
      clearCurrentProfileCache();

      if (currentStatus.hasSession && !currentStatus.isAnonymous && !currentStatus.isMockSession) {
        await auth.signOut();
      }

      return { success: true };
    } catch (error) {
      console.error('退出登录失败:', error);
      return { success: false, error };
    }
  },

  getCurrentUser() {
    return auth.currentUser;
  },

  async getCurrentSession() {
    return resolveCurrentSession();
  },

  onLoginStateChanged(callback) {
    return auth.onLoginStateChanged(callback);
  },

  onAuthStateChange(callback) {
    if (typeof auth.onAuthStateChange !== 'function') {
      return null;
    }

    return auth.onAuthStateChange(callback);
  }
};

export { db, auth };
export default app;
