import { DATABASE_CONFIG } from '../config/database.js';
import app, { db, ensureAnonymousLogin } from './cloudbase.js';
import {
  BADGE_ACTIVITY_TYPES,
  BADGE_BONUS_TYPES,
  BADGE_SETTINGS_KEY,
  createDefaultBadgeSettings,
  flattenBadgeSeries,
  normalizeBadgeSettings
} from '@liwu/shared-utils/badge-system.js';
import {
  CLIENT_THEME_SETTINGS_KEY,
  DEFAULT_CLIENT_THEME_SETTINGS,
  normalizeClientThemeSettings,
  toClientThemeSettingsPayload
} from '@liwu/shared-utils/theme-system.js';
import {
  BRAND_CAROUSEL_SETTINGS_KEY,
  DEFAULT_BRAND_CAROUSEL_SETTINGS,
  normalizeBrandCarouselSettings,
  toBrandCarouselSettingsPayload
} from '@liwu/shared-utils/home-carousel-settings.js';
import {
  AWARENESS_DISPLAY_SETTINGS_KEY,
  DEFAULT_AWARENESS_DISPLAY_SETTINGS,
  normalizeAwarenessDisplaySettings,
  toAwarenessDisplaySettingsPayload
} from '@liwu/shared-utils/awareness-display-settings.js';
import {
  DEFAULT_PAGE_MASTHEAD_SETTINGS,
  normalizePageMastheadSettings,
  PAGE_MASTHEAD_SETTINGS_KEY,
  toPageMastheadSettingsPayload
} from '@liwu/shared-utils/page-masthead-settings.js';
import {
  DEFAULT_USER_AVATAR_OPTIONS_SETTINGS,
  USER_AVATAR_OPTIONS_SETTINGS_KEY,
  normalizeUserAvatarOptionsSettings,
  toUserAvatarOptionsPayload
} from '@liwu/shared-utils/avatar-options.js';
import {
  DEFAULT_STUDENT_MEMBERSHIP_SETTINGS as SHARED_DEFAULT_STUDENT_MEMBERSHIP_SETTINGS,
  STUDENT_MEMBERSHIP_SETTINGS_KEY,
  getStudentMembershipPlan,
  normalizeStudentMembershipSettings,
  toStudentMembershipSettingsPayload
} from '@liwu/shared-utils/student-membership-settings.js';

const { collections } = DATABASE_CONFIG;
const MEDITATION_SETTINGS_KEY = 'meditation_rewards';
const MEDITATION_AUDIO_LIBRARY_KEY = 'meditation_audio_library';
const MEDITATION_COMPOSITION_SETTINGS_KEY = 'meditation_composition_settings';
const MEDITATION_CALENDAR_KEY = 'meditation_calendar';
const MEDITATION_LIBRARY_KEY = 'meditation_library';
const AWARENESS_TAG_SETTINGS_KEY = 'awareness_tag_settings';
const AWARENESS_MOCK_LIBRARY_SETTINGS_KEY = 'awareness_mock_library';
const CLIENT_DISTRIBUTION_SETTINGS_KEY = 'client_distribution_settings';
const SHOP_HOME_LIVING_SETTINGS_KEY = 'shop_home_living_settings';
const STUDENT_MEMBERSHIP_ORDER_BIZ_TYPE = 'student_membership';
const LIFETIME_STUDENT_EXPIRES_AT = '2999-12-31T23:59:59.000Z';
const AWARENESS_MOCK_USER_UID_START = 33;
const AWARENESS_MOCK_USER_UID_END = 66;
const MAX_AWARENESS_MOCK_RECORDS_PER_RUN = 1000;
const DASHBOARD_SERIES_DAYS = 7;
const DASHBOARD_TIMEZONE = 'Asia/Shanghai';

export const DEFAULT_MEDITATION_SETTINGS = {
  rewardPoints: 50,
  allowRepeatRewards: true,
  inviterRewardRate: 0,
  documentId: null,
  missingCollection: false
};

export const DEFAULT_AWARENESS_TAG_SETTINGS = {
  documentId: null,
  tagsByKey: {},
  missingCollection: false
};

export const DEFAULT_AWARENESS_MOCK_LIBRARY_SETTINGS = {
  documentId: null,
  lexicon: [
    '合十礼',
    '点油灯',
    '观呼吸',
    '安住',
    '放轻松',
    '心灯',
    '向内看',
    '照见',
    '归于静',
    '松肩',
    '喝热水',
    '伸展',
    '静坐',
    '写清理',
    '落笔',
    '缓一缓',
    '晨间光',
    '晚风',
    '停一下',
    '谢谢自己'
  ],
  missingCollection: false
};

export const DEFAULT_BADGE_SETTINGS = {
  ...normalizeBadgeSettings(createDefaultBadgeSettings()),
  missingCollection: false
};

export const DEFAULT_THEME_SETTINGS = {
  ...DEFAULT_CLIENT_THEME_SETTINGS
};

export const DEFAULT_AWARENESS_DISPLAY = {
  ...DEFAULT_AWARENESS_DISPLAY_SETTINGS
};

export const DEFAULT_BRAND_CAROUSEL = {
  ...DEFAULT_BRAND_CAROUSEL_SETTINGS
};

export const DEFAULT_USER_AVATAR_OPTIONS = {
  ...DEFAULT_USER_AVATAR_OPTIONS_SETTINGS
};

export const DEFAULT_CLIENT_DISTRIBUTION_SETTINGS = {
  documentId: null,
  previewUrl: '',
  androidApkUrl: '',
  iosDistributionUrl: '',
  missingCollection: false
};

export const DEFAULT_PAGE_MASTHEAD = {
  ...DEFAULT_PAGE_MASTHEAD_SETTINGS
};

export const DEFAULT_SHOP_HOME_LIVING_SETTINGS = {
  documentId: null,
  imageWidth: 700,
  imageHeight: 700,
  cards: Array.from({ length: 6 }, (_, index) => ({
    id: `shop_living_${index + 1}`,
    fileId: '',
    imageUrl: '',
    productId: ''
  })),
  missingCollection: false
};

export const DEFAULT_STUDENT_MEMBERSHIP_SETTINGS = {
  ...SHARED_DEFAULT_STUDENT_MEMBERSHIP_SETTINGS
};

export const MEDITATION_AUDIO_LIBRARY_TYPES = ['bowl', 'greeting', 'nature', 'breath', 'quote', 'goodbye'];

export const DEFAULT_MEDITATION_AUDIO_LIBRARY = {
  documentId: null,
  items: [],
  missingCollection: false
};

export const DEFAULT_MEDITATION_COMPOSITION_SETTINGS = {
  documentId: null,
  segments: [],
  missingCollection: false
};

export const DEFAULT_MEDITATION_CALENDAR = {
  documentId: null,
  days: {},
  missingCollection: false
};

export const DEFAULT_MEDITATION_LIBRARY = {
  documentId: null,
  meditations: [],
  missingCollection: false
};

export const DEFAULT_DASHBOARD_OVERVIEW_STATS = {
  awarenessDailyCounts: [],
  meditationDailyCounts: [],
  meditationDailyDurationMinutes: []
};

const isMissingCollectionIssue = (value) => {
  const message = value?.message || '';

  return (
    value?.code === 'DATABASE_COLLECTION_NOT_EXIST' ||
    message.includes('DATABASE_COLLECTION_NOT_EXIST') ||
    message.includes('Db or Table not exist')
  );
};

const getDocumentId = (document) => document?._id || document?.id;

const getDocuments = (result, collectionName) => {
  if (Array.isArray(result?.data)) {
    return result.data;
  }

  if (result?.data && typeof result.data === 'object') {
    return [result.data];
  }

  if (result?.message) {
    throw new Error(result.message);
  }

  throw new Error(`CloudBase query failed for collection "${collectionName}"`);
};

const getFirstDocument = (result, collectionName) => getDocuments(result, collectionName)[0] || null;

const buildTempUrlMap = async (fileIds = []) => {
  const normalizedFileIds = [...new Set(fileIds.filter(Boolean))];
  if (normalizedFileIds.length === 0) {
    return new Map();
  }

  const tempUrlResult = await app.getTempFileURL({ fileList: normalizedFileIds });
  return new Map(
    (tempUrlResult?.fileList || tempUrlResult?.data?.fileList || []).map((item) => [
      item.fileID || item.fileId,
      item.tempFileURL || item.download_url || item.downloadUrl || ''
    ])
  );
};

const normalizeCategory = (category) => ({
  id: getDocumentId(category),
  name: category.name,
  color: category.color,
  description: category.description || ''
});

const normalizeTag = (tag, categoriesById = new Map()) => {
  const categoryId = tag.category_id || tag.categoryId || '';
  const category = categoriesById.get(categoryId);

  return {
    id: getDocumentId(tag),
    name: tag.name,
    categoryId,
    categoryName: tag.categoryName || category?.name || '',
    startDate: tag.start_date || tag.startDate || '',
    endDate: tag.end_date || tag.endDate || '',
    color: tag.color || category?.color || '#666'
  };
};

const normalizeShopCategory = (category = {}) => ({
  id: getDocumentId(category),
  name: category.name || '',
  slug: category.slug || '',
  description: category.description || '',
  status: category.status || 'active',
  sortOrder: Number(category.sort_order ?? category.sortOrder ?? 0)
});

const normalizeShopProduct = (product = {}) => ({
  id: getDocumentId(product),
  name: product.name || '',
  subtitle: product.subtitle || '',
  categoryId: product.category_id || product.categoryId || '',
  relatedProductId: product.related_product_id || product.relatedProductId || '',
  productType: product.product_type || product.productType || 'physical',
  coverImage: product.cover_image || product.coverImage || '',
  gallery: Array.isArray(product.gallery) ? product.gallery : [],
  showcaseMedia: Array.isArray(product.showcase_media || product.showcaseMedia) ? (product.showcase_media || product.showcaseMedia) : [],
  description: product.description || '',
  status: product.status || 'draft',
  skuMode: product.sku_mode || product.skuMode || 'single',
  pricePointsFrom: Number(product.price_points_from ?? product.pricePointsFrom ?? 0),
  priceCashFrom: Number(product.price_cash_from ?? product.priceCashFrom ?? 0),
  rewardPointsReturnFrom: Number(product.reward_points_return_from ?? product.rewardPointsReturnFrom ?? 0),
  stockTotal: Number(product.stock_total ?? product.stockTotal ?? 0),
  salesCount: Number(product.sales_count ?? product.salesCount ?? 0),
  limitPerUser: Number(product.limit_per_user ?? product.limitPerUser ?? 0),
  sortOrder: Number(product.sort_order ?? product.sortOrder ?? 0)
});

const normalizeShopSku = (sku = {}) => ({
  id: getDocumentId(sku),
  productId: sku.product_id || sku.productId || '',
  skuName: sku.sku_name || sku.skuName || '',
  skuCode: sku.sku_code || sku.skuCode || '',
  pricePoints: Number(sku.price_points ?? sku.pricePoints ?? 0),
  priceCash: Number(sku.price_cash ?? sku.priceCash ?? 0),
  rewardPointsReturn: Number(sku.reward_points_return ?? sku.rewardPointsReturn ?? 0),
  stock: Number(sku.stock ?? 0),
  status: sku.status || 'active'
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
  paidAt: order.paid_at || order.paidAt || '',
  createdAt: order.created_at || order.createdAt || ''
});

const normalizeShopOrderItem = (item = {}) => ({
  id: getDocumentId(item),
  orderId: item.order_id || item.orderId || '',
  productId: item.product_id || item.productId || '',
  skuId: item.sku_id || item.skuId || '',
  productName: item.product_name_snapshot || item.productNameSnapshot || '',
  skuName: item.sku_name_snapshot || item.skuNameSnapshot || '',
  quantity: Number(item.quantity ?? 0),
  subtotalPoints: Number(item.subtotal_points ?? item.subtotalPoints ?? 0),
  subtotalCash: Number(item.subtotal_cash ?? item.subtotalCash ?? 0),
  rewardPointsReturn: Number(item.reward_points_return_snapshot ?? item.rewardPointsReturnSnapshot ?? 0),
  productType: item.product_type || item.productType || 'physical'
});

const normalizeClientDistributionSettings = (document = {}) => ({
  documentId: getDocumentId(document) || null,
  previewUrl: document.preview_url || document.previewUrl || '',
  androidApkUrl: document.android_apk_url || document.androidApkUrl || '',
  iosDistributionUrl: document.ios_distribution_url || document.iosDistributionUrl || '',
  missingCollection: false
});

const normalizeShopHomeLivingSettings = (document = {}) => {
  const rawCards = Array.isArray(document.cards) ? document.cards : [];

  return {
    documentId: getDocumentId(document) || null,
    imageWidth: Number(document.image_width ?? document.imageWidth ?? 700),
    imageHeight: Number(document.image_height ?? document.imageHeight ?? 700),
    cards: DEFAULT_SHOP_HOME_LIVING_SETTINGS.cards.map((fallbackCard, index) => {
      const currentCard = rawCards[index] || {};
      return {
        id: currentCard.id || fallbackCard.id,
        fileId: currentCard.file_id || currentCard.fileId || '',
        imageUrl: currentCard.image_url || currentCard.imageUrl || '',
        productId: currentCard.product_id || currentCard.productId || ''
      };
    }),
    missingCollection: false
  };
};

const toShopHomeLivingSettingsPayload = (settingsData = {}) => ({
  key: SHOP_HOME_LIVING_SETTINGS_KEY,
  image_width: Number(settingsData.imageWidth || 700),
  image_height: Number(settingsData.imageHeight || 700),
  cards: (settingsData.cards || []).map((card, index) => ({
    id: card.id || `shop_living_${index + 1}`,
    file_id: card.fileId || '',
    image_url: card.imageUrl || '',
    product_id: card.productId || ''
  }))
});

const toShopProductPayload = (productData = {}) => ({
  name: productData.name || '',
  subtitle: productData.subtitle || '',
  category_id: productData.categoryId || '',
  related_product_id: productData.relatedProductId || '',
  product_type: productData.productType || 'physical',
  cover_image: productData.coverImage || '',
  gallery: productData.gallery || [],
  showcase_media: productData.showcaseMedia || [],
  description: productData.description || '',
  detail_blocks: productData.detailBlocks || [],
  status: productData.status || 'draft',
  sku_mode: productData.skuMode || 'single',
  price_points_from: Number(productData.pricePointsFrom || 0),
  price_cash_from: Number(productData.priceCashFrom || 0),
  reward_points_return_from: Number(productData.rewardPointsReturnFrom || 0),
  stock_total: Number(productData.stockTotal || 0),
  sales_count: Number(productData.salesCount || 0),
  limit_per_user: Number(productData.limitPerUser || 0),
  sort_order: Number(productData.sortOrder || 0),
  tags: productData.tags || []
});

const toShopSkuPayload = (skuData = {}, productId) => ({
  product_id: productId,
  sku_name: skuData.skuName || '',
  sku_code: skuData.skuCode || '',
  attrs: skuData.attrs || {},
  price_points: Number(skuData.pricePoints || 0),
  price_cash: Number(skuData.priceCash || 0),
  reward_points_return: Number(skuData.rewardPointsReturn || 0),
  stock: Number(skuData.stock || 0),
  lock_stock: Number(skuData.lockStock || 0),
  status: skuData.status || 'active',
  weight: Number(skuData.weight || 0)
});

const toClientDistributionSettingsPayload = (settingsData = {}) => ({
  key: CLIENT_DISTRIBUTION_SETTINGS_KEY,
  preview_url: String(settingsData.previewUrl || '').trim(),
  android_apk_url: String(settingsData.androidApkUrl || '').trim(),
  ios_distribution_url: String(settingsData.iosDistributionUrl || '').trim()
});

const createWealthHistoryEntry = ({ amount, description, source, relatedUserId = '' }) => ({
  id: `admin_${Date.now()}`,
  amount,
  description,
  date: new Date().toISOString(),
  type: amount >= 0 ? 'EARN' : 'SPEND',
  source,
  relatedUserId
});

const getEquippedBadgeBonusForActivity = async ({ userId, activityType, baseAmount = 0 }) => {
  if (!userId || !activityType) {
    return { rewardAmount: 0, badgeId: '' };
  }

  const [settings, badgeProfileResult] = await Promise.all([
    DatabaseService.getBadgeSettings(),
    db.collection(collections.badgeProfiles).where({ user_id: userId }).limit(1).get().catch(() => ({ data: [] }))
  ]);

  const badgeProfile = getDocuments(badgeProfileResult, collections.badgeProfiles)[0] || null;
  const equippedBadgeId = badgeProfile?.equipped_badge_id || badgeProfile?.equippedBadgeId || '';
  if (!equippedBadgeId) {
    return { rewardAmount: 0, badgeId: '' };
  }

  const badge = flattenBadgeSeries(settings).find((item) => item.badgeId === equippedBadgeId);
  if (!badge || badge.bonusActivity !== activityType) {
    return { rewardAmount: 0, badgeId: '' };
  }

  const normalizedBaseAmount = Math.max(0, Number(baseAmount || 0));
  const normalizedBonusValue = Math.max(0, Number(badge.bonusValue || 0));
  if (normalizedBonusValue <= 0) {
    return { rewardAmount: 0, badgeId: equippedBadgeId };
  }

  return {
    badgeId: equippedBadgeId,
    rewardAmount: badge.bonusType === BADGE_BONUS_TYPES.fixed
      ? normalizedBonusValue
      : Math.floor((normalizedBaseAmount * normalizedBonusValue) / 100)
  };
};

const normalizeUser = (user) => ({
  id: getDocumentId(user),
  uid: Number(user.uid || 0),
  name: user.name || '',
  noteName: user.note_name || user.noteName || '',
  avatar: user.avatar || '',
  avatarIndex: Number(user.avatar_index ?? user.avatarIndex ?? 0),
  email: user.email || '',
  phone: user.phone || '',
  joinDate: user.join_date || user.joinDate || '',
  lastActive: user.last_active || user.lastActive || '',
  status: user.status || 'inactive',
  authUid: user.auth_uid || user.authUid || '',
  isStudent: Boolean(user.is_student ?? user.isStudent),
  studentExpireAt: user.student_expire_at || user.studentExpireAt || '',
  studentMembershipPlanKey: user.student_membership_plan_key || user.studentMembershipPlanKey || '',
  inviteCode: user.uid ? String(user.uid) : '',
  inviterUserId: user.inviter_user_id || user.inviterUserId || '',
  balance: Number(user.balance || 0),
  bio: user.bio || '',
  location: user.location || '',
  age: user.age ?? '',
  tags: []
});

const normalizeMeditationSettings = (settings = {}) => ({
  rewardPoints: Number(settings.reward_points ?? settings.rewardPoints ?? DEFAULT_MEDITATION_SETTINGS.rewardPoints),
  allowRepeatRewards:
    settings.allow_repeat_rewards ?? settings.allowRepeatRewards ?? DEFAULT_MEDITATION_SETTINGS.allowRepeatRewards,
  inviterRewardRate: Math.min(
    20,
    Math.max(0, Number(settings.inviter_reward_rate ?? settings.inviterRewardRate ?? DEFAULT_MEDITATION_SETTINGS.inviterRewardRate))
  ),
  documentId: getDocumentId(settings) || null,
  missingCollection: false
});

const normalizeAwarenessTagSettingEntry = (entry = {}) => ({
  description: entry.description || '',
  rewardPoints: Math.max(0, Number(entry.reward_points ?? entry.rewardPoints ?? 0)),
  relatedProductId: entry.related_product_id || entry.relatedProductId || ''
});

const ADMIN_AWARENESS_TAG_MAX_LENGTH = 18;

const getAwarenessTagLength = (value = '') => (
  Array.from(String(value || '')).reduce((total, character) => (
    total + (/[\u3400-\u9FFF\uF900-\uFAFF]/u.test(character) ? 2 : 1)
  ), 0)
);

const normalizeAwarenessTagContent = (value = '') => String(value || '').trim();

const normalizeAwarenessTagSettingsMap = (tagsByKey = {}) => (
  Object.fromEntries(
    Object.entries(tagsByKey || {}).map(([tagKey, entry]) => [tagKey, normalizeAwarenessTagSettingEntry(entry)])
  )
);

const normalizeAwarenessTagSettings = (settings = {}) => ({
  documentId: getDocumentId(settings) || null,
  tagsByKey: normalizeAwarenessTagSettingsMap(settings.tags_by_key || settings.tagsByKey || {}),
  missingCollection: false
});

const normalizeAwarenessMockLexicon = (entries = []) => {
  const values = Array.isArray(entries)
    ? entries
    : String(entries || '')
      .split(/\r?\n/g);

  return Array.from(
    new Set(
      values
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .slice(0, 200)
    )
  );
};

const normalizeAwarenessMockLibrarySettings = (settings = {}) => ({
  documentId: getDocumentId(settings) || null,
  lexicon: normalizeAwarenessMockLexicon(settings.lexicon || settings.words || DEFAULT_AWARENESS_MOCK_LIBRARY_SETTINGS.lexicon),
  missingCollection: false
});

const toUserPayload = (userData) => {
  const rest = { ...userData };
  const joinDate = rest.joinDate;
  const lastActive = rest.lastActive;

  delete rest.id;
  delete rest._id;
  delete rest.tags;
  delete rest.joinDate;
  delete rest.lastActive;
  delete rest.authUid;
  delete rest.uid;
  delete rest.noteName;
  delete rest.isStudent;
  delete rest.inviteCode;
  delete rest.inviterUserId;
  delete rest.balance;
  delete rest.created_at;
  delete rest.updated_at;

  return {
    ...rest,
    ...(userData.uid !== undefined ? { uid: Math.max(1, Number(userData.uid) || 1) } : {}),
    ...(userData.noteName !== undefined ? { note_name: String(userData.noteName || '').trim() } : {}),
    ...(joinDate !== undefined ? { join_date: joinDate } : {}),
    ...(lastActive !== undefined ? { last_active: lastActive } : {}),
    ...(userData.authUid !== undefined ? { auth_uid: userData.authUid } : {}),
    ...(userData.isStudent !== undefined ? { is_student: Boolean(userData.isStudent) } : {}),
    ...(userData.inviterUserId !== undefined ? { inviter_user_id: userData.inviterUserId } : {}),
    ...(userData.balance !== undefined ? { balance: Math.max(0, Number(userData.balance) || 0) } : {})
  };
};

const toCategoryPayload = (categoryData) => {
  const rest = { ...categoryData };
  delete rest.id;
  delete rest._id;
  delete rest.created_at;
  delete rest.updated_at;
  return rest;
};

const toTagPayload = (tagData) => {
  const rest = { ...tagData };
  const categoryId = rest.categoryId;
  const startDate = rest.startDate;
  const endDate = rest.endDate;

  delete rest.id;
  delete rest._id;
  delete rest.categoryId;
  delete rest.categoryName;
  delete rest.startDate;
  delete rest.endDate;
  delete rest.assignedDate;
  delete rest.created_at;
  delete rest.updated_at;

  return {
    ...rest,
    ...(categoryId !== undefined ? { category_id: categoryId } : {}),
    ...(startDate !== undefined ? { start_date: startDate } : {}),
    ...(endDate !== undefined ? { end_date: endDate } : {})
  };
};

const toMeditationSettingsPayload = (settingsData) => ({
  key: MEDITATION_SETTINGS_KEY,
  reward_points: Math.max(0, Number(settingsData.rewardPoints ?? DEFAULT_MEDITATION_SETTINGS.rewardPoints)),
  allow_repeat_rewards: Boolean(settingsData.allowRepeatRewards),
  inviter_reward_rate: Math.min(
    20,
    Math.max(0, Number(settingsData.inviterRewardRate ?? DEFAULT_MEDITATION_SETTINGS.inviterRewardRate))
  )
});

const toAwarenessTagSettingsPayload = (settingsData) => ({
  key: AWARENESS_TAG_SETTINGS_KEY,
  tags_by_key: Object.fromEntries(
    Object.entries(settingsData.tagsByKey || {}).map(([tagKey, entry]) => [
      tagKey,
      normalizeAwarenessTagSettingEntry(entry)
    ])
  )
});

const toAwarenessMockLibraryPayload = (settingsData = {}) => ({
  key: AWARENESS_MOCK_LIBRARY_SETTINGS_KEY,
  lexicon: normalizeAwarenessMockLexicon(settingsData.lexicon || [])
});

const toBadgeSettingsPayload = (settingsData = {}) => ({
  key: BADGE_SETTINGS_KEY,
  version: Math.max(1, Number(settingsData.version || 1)),
  series: normalizeBadgeSettings(settingsData).series
});

const addMonthsToIso = (baseDateInput, monthsToAdd) => {
  const nextDate = new Date(baseDateInput || new Date());
  if (Number.isNaN(nextDate.getTime())) {
    return new Date().toISOString();
  }

  nextDate.setMonth(nextDate.getMonth() + Math.max(0, Number(monthsToAdd) || 0));
  return nextDate.toISOString();
};

const resolveStudentMembershipPlanKeyFromOrder = (orderDocument = {}, orderItems = []) => {
  if ((orderDocument.biz_type || orderDocument.bizType || '') === STUDENT_MEMBERSHIP_ORDER_BIZ_TYPE) {
    return (
      orderDocument.biz_meta?.plan_key ||
      orderDocument.bizMeta?.planKey ||
      orderDocument.membership_plan_key ||
      orderDocument.membershipPlanKey ||
      ''
    );
  }

  const membershipItem = orderItems.find((item) => (
    item.attrs_snapshot?.membership_plan_key ||
    item.attrs_snapshot?.membershipPlanKey ||
    item.attrsSnapshot?.membership_plan_key ||
    item.attrsSnapshot?.membershipPlanKey
  ));

  return (
    membershipItem?.attrs_snapshot?.membership_plan_key ||
    membershipItem?.attrs_snapshot?.membershipPlanKey ||
    membershipItem?.attrsSnapshot?.membership_plan_key ||
    membershipItem?.attrsSnapshot?.membershipPlanKey ||
    ''
  );
};

const chunkArray = (items = [], chunkSize = 50) => {
  const normalizedChunkSize = Math.max(1, Number(chunkSize) || 1);
  const result = [];

  for (let index = 0; index < items.length; index += normalizedChunkSize) {
    result.push(items.slice(index, index + normalizedChunkSize));
  }

  return result;
};

const getRandomItem = (items = []) => items[Math.floor(Math.random() * items.length)];

const DEFAULT_USER_DASHBOARD_STATS = {
  earnedBadgeCount: 0,
  recentSevenDayPoints: 0,
  meditationCount: 0,
  awarenessCount: 0
};

const getTimestampValue = (value) => {
  const nextTimestamp = new Date(value || 0).getTime();
  return Number.isFinite(nextTimestamp) ? nextTimestamp : 0;
};

const dashboardDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DASHBOARD_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const toDashboardDateKey = (value = new Date()) => (
  dashboardDateFormatter.format(new Date(value))
);

const buildRecentDateKeys = (days = DASHBOARD_SERIES_DAYS) => {
  const result = [];
  const today = new Date();

  for (let index = days - 1; index >= 0; index -= 1) {
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() - index);
    result.push(toDashboardDateKey(nextDate));
  }

  return result;
};

const buildDashboardSeries = (records = [], getDateKey, getValue, days = DASHBOARD_SERIES_DAYS) => {
  const targetDateKeys = buildRecentDateKeys(days);
  const aggregatedMap = new Map(targetDateKeys.map((dateKey) => [dateKey, 0]));

  records.forEach((record) => {
    const dateKey = getDateKey(record);
    if (!aggregatedMap.has(dateKey)) {
      return;
    }

    aggregatedMap.set(dateKey, Number(aggregatedMap.get(dateKey) || 0) + Number(getValue(record) || 0));
  });

  return targetDateKeys.map((dateKey) => ({
    dateKey,
    value: Number(aggregatedMap.get(dateKey) || 0)
  }));
};

const buildDashboardUserStatsMap = ({
  pointLedgerEntries = [],
  awarenessRecords = [],
  badgeProfiles = []
} = {}) => {
  const recentRewardCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const meditationCountMap = new Map();
  const awarenessCountMap = new Map();
  const recentSevenDayPointsMap = new Map();
  const earnedBadgeCountMap = new Map();

  const incrementMap = (targetMap, userId, amount = 1) => {
    if (!userId) {
      return;
    }

    targetMap.set(userId, Number(targetMap.get(userId) || 0) + Number(amount || 0));
  };

  pointLedgerEntries.forEach((entry) => {
    const userId = entry.user_id || entry.userId || '';
    if (!userId) {
      return;
    }

    if ((entry.biz_type || entry.bizType || '') === BADGE_ACTIVITY_TYPES.meditation) {
      incrementMap(meditationCountMap, userId, 1);
    }

    const delta = Number(entry.delta || 0);
    const createdAt = entry.created_at || entry.createdAt || '';
    if (delta > 0 && getTimestampValue(createdAt) >= recentRewardCutoff) {
      incrementMap(recentSevenDayPointsMap, userId, delta);
    }
  });

  awarenessRecords.forEach((record) => {
    incrementMap(awarenessCountMap, record.user_id || record.userId || '', 1);
  });

  badgeProfiles.forEach((profile) => {
    const userId = profile.user_id || profile.userId || '';
    const unlockedBadgeIds = Array.isArray(profile.unlocked_badge_ids || profile.unlockedBadgeIds)
      ? [...new Set((profile.unlocked_badge_ids || profile.unlockedBadgeIds).filter(Boolean))]
      : [];

    if (userId) {
      earnedBadgeCountMap.set(userId, unlockedBadgeIds.length);
    }
  });

  const userStatsById = new Map();
  const allUserIds = new Set([
    ...meditationCountMap.keys(),
    ...awarenessCountMap.keys(),
    ...recentSevenDayPointsMap.keys(),
    ...earnedBadgeCountMap.keys()
  ]);

  allUserIds.forEach((userId) => {
    userStatsById.set(userId, {
      earnedBadgeCount: Number(earnedBadgeCountMap.get(userId) || 0),
      recentSevenDayPoints: Number(recentSevenDayPointsMap.get(userId) || 0),
      meditationCount: Number(meditationCountMap.get(userId) || 0),
      awarenessCount: Number(awarenessCountMap.get(userId) || 0)
    });
  });

  return userStatsById;
};

const buildDashboardOverviewStats = ({
  pointLedgerEntries = [],
  awarenessRecords = []
} = {}) => {
  const awarenessDailyCounts = buildDashboardSeries(
    awarenessRecords,
    (record) => toDashboardDateKey(record.created_at_client || record.timestamp || record.created_at || record.createdAt || new Date()),
    () => 1
  );

  const meditationEntries = pointLedgerEntries.filter((entry) => (
    (entry.biz_type || entry.bizType || '') === BADGE_ACTIVITY_TYPES.meditation
  ));

  const meditationDailyCounts = buildDashboardSeries(
    meditationEntries,
    (entry) => entry.activity_date_key || entry.activityDateKey || toDashboardDateKey(entry.created_at || entry.createdAt || new Date()),
    () => 1
  );

  const meditationDailyDurationMinutes = buildDashboardSeries(
    meditationEntries,
    (entry) => entry.activity_date_key || entry.activityDateKey || toDashboardDateKey(entry.created_at || entry.createdAt || new Date()),
    (entry) => Math.max(0, Number(entry.meta?.duration || 0)) / 60
  ).map((item) => ({
    ...item,
    value: Number(item.value.toFixed(1))
  }));

  return {
    awarenessDailyCounts,
    meditationDailyCounts,
    meditationDailyDurationMinutes
  };
};

const attachTagsToUsers = (users, tags, categories, userTagLinks, userStatsById = new Map()) => {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const normalizedTags = tags.map((tag) => normalizeTag(tag, categoriesById));
  const tagsById = new Map(normalizedTags.map((tag) => [tag.id, tag]));
  const tagsByUserId = new Map();

  for (const link of userTagLinks) {
    const tag = tagsById.get(link.tag_id);
    if (!tag) {
      continue;
    }

    const userTag = {
      ...tag,
      assignedDate: link.assigned_date || link.assignedDate || ''
    };

    if (!tagsByUserId.has(link.user_id)) {
      tagsByUserId.set(link.user_id, []);
    }

    tagsByUserId.get(link.user_id).push(userTag);
  }

  const normalizedUsers = users.map((user) => {
    const normalizedUser = normalizeUser(user);
    return {
      ...normalizedUser,
      ...DEFAULT_USER_DASHBOARD_STATS,
      ...(userStatsById.get(normalizedUser.id) || {}),
      tags: tagsByUserId.get(normalizedUser.id) || []
    };
  });

  return {
    users: normalizedUsers,
    tags: normalizedTags,
    categories: categories.map(normalizeCategory)
  };
};

const normalizeMeditationAudioItem = (item = {}) => ({
  id: item._id || item.id || '',
  type: item.type || 'bowl',
  title: item.title || '',
  fileId: item.file_id || item.fileId || '',
  audioUrl: item.audio_url || item.audioUrl || '',
  duration: Number(item.duration ?? 0),
  ttsText: item.tts_text || item.ttsText || '',
  createdAt: item.created_at || item.createdAt || ''
});

const normalizeMeditationAudioLibrary = (doc = {}) => ({
  documentId: getDocumentId(doc) || null,
  items: Array.isArray(doc.items) ? doc.items.map(normalizeMeditationAudioItem) : [],
  missingCollection: false
});

const normalizeMeditationSegment = (seg = {}) => ({
  id: seg.id || '',
  type: seg.type || 'bowl',
  startSeconds: Number(seg.start_seconds ?? seg.startSeconds ?? 0),
  durationSeconds: Number(seg.duration_seconds ?? seg.durationSeconds ?? 0),
  audioItemId: seg.audio_item_id || seg.audioItemId || ''
});

const normalizeMeditationCompositionSettings = (doc = {}) => ({
  documentId: getDocumentId(doc) || null,
  segments: Array.isArray(doc.segments) ? doc.segments.map(normalizeMeditationSegment) : [],
  missingCollection: false
});

const normalizeMeditationCalendarDay = (day = {}) => ({
  morning: day.morning || '',
  noon: day.noon || '',
  afternoon: day.afternoon || '',
  evening: day.evening || ''
});

const normalizeMeditationCalendar = (doc = {}) => ({
  documentId: getDocumentId(doc) || null,
  days: Object.fromEntries(
    Object.entries(doc.days || {}).map(([dateKey, day]) => [dateKey, normalizeMeditationCalendarDay(day)])
  ),
  missingCollection: false
});

const toMeditationAudioLibraryPayload = (data = {}) => ({
  key: MEDITATION_AUDIO_LIBRARY_KEY,
  items: Array.isArray(data.items) ? data.items.map((item) => ({
    id: item.id || '',
    type: item.type || 'bowl',
    title: item.title || '',
    file_id: item.fileId || item.file_id || '',
    audio_url: item.audioUrl || item.audio_url || '',
    duration: Number(item.duration ?? 0),
    tts_text: item.ttsText || item.tts_text || '',
    created_at: item.createdAt || item.created_at || new Date().toISOString()
  })) : []
});

const toMeditationCompositionSettingsPayload = (data = {}) => ({
  key: MEDITATION_COMPOSITION_SETTINGS_KEY,
  segments: Array.isArray(data.segments) ? data.segments.map((seg) => ({
    id: seg.id || '',
    type: seg.type || 'bowl',
    start_seconds: Number(seg.startSeconds ?? seg.start_seconds ?? 0),
    duration_seconds: Number(seg.durationSeconds ?? seg.duration_seconds ?? 0),
    audio_item_id: seg.audioItemId || seg.audio_item_id || ''
  })) : []
});

const toMeditationCalendarPayload = (data = {}) => ({
  key: MEDITATION_CALENDAR_KEY,
  days: Object.fromEntries(
    Object.entries(data.days || {}).map(([dateKey, day]) => [dateKey, {
      morning: day.morning || '',
      noon: day.noon || '',
      afternoon: day.afternoon || '',
      evening: day.evening || ''
    }])
  )
});

const normalizeMeditationLibraryItem = (item = {}) => ({
  id: item.id || '',
  name: item.name || '',
  sections: {
    bowl: Array.isArray(item.sections?.bowl) ? item.sections.bowl : [],
    greeting: Array.isArray(item.sections?.greeting) ? item.sections.greeting : [],
    nature: Array.isArray(item.sections?.nature) ? item.sections.nature : [],
    breath: Array.isArray(item.sections?.breath) ? item.sections.breath : [],
    quote: Array.isArray(item.sections?.quote) ? item.sections.quote : [],
    goodbye: Array.isArray(item.sections?.goodbye) ? item.sections.goodbye : []
  }
});

const normalizeMeditationLibrary = (doc = {}) => ({
  documentId: getDocumentId(doc) || null,
  meditations: Array.isArray(doc.meditations) ? doc.meditations.map(normalizeMeditationLibraryItem) : [],
  missingCollection: false
});

const toMeditationLibraryPayload = (data = {}) => ({
  key: MEDITATION_LIBRARY_KEY,
  meditations: Array.isArray(data.meditations) ? data.meditations.map((item) => ({
    id: item.id || '',
    name: item.name || '',
    sections: {
      bowl: Array.isArray(item.sections?.bowl) ? item.sections.bowl : [],
      greeting: Array.isArray(item.sections?.greeting) ? item.sections.greeting : [],
      nature: Array.isArray(item.sections?.nature) ? item.sections.nature : [],
      breath: Array.isArray(item.sections?.breath) ? item.sections.breath : [],
      quote: Array.isArray(item.sections?.quote) ? item.sections.quote : [],
      goodbye: Array.isArray(item.sections?.goodbye) ? item.sections.goodbye : []
    }
  })) : []
});

class DatabaseService {
  static async getShopManagementData() {
    try {
      await ensureAnonymousLogin();
      const [categoriesResult, productsResult, skusResult, ordersResult, orderItemsResult] = await Promise.all([
        db.collection(collections.shopCategories).limit(200).get(),
        db.collection(collections.shopProducts).limit(500).get(),
        db.collection(collections.shopProductSkus).limit(1000).get(),
        db.collection(collections.shopOrders).limit(1000).get(),
        db.collection(collections.shopOrderItems).limit(2000).get()
      ]);

      return {
        categories: getDocuments(categoriesResult, collections.shopCategories)
          .map(normalizeShopCategory)
          .sort((left, right) => left.sortOrder - right.sortOrder),
        products: getDocuments(productsResult, collections.shopProducts)
          .map(normalizeShopProduct)
          .sort((left, right) => {
            if (left.sortOrder !== right.sortOrder) {
              return left.sortOrder - right.sortOrder;
            }

            return right.salesCount - left.salesCount;
          }),
        skus: getDocuments(skusResult, collections.shopProductSkus)
          .map(normalizeShopSku)
          .sort((left, right) => left.pricePoints - right.pricePoints),
        orders: getDocuments(ordersResult, collections.shopOrders)
          .map(normalizeShopOrder)
          .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()),
        orderItems: getDocuments(orderItemsResult, collections.shopOrderItems)
          .map(normalizeShopOrderItem)
      };
    } catch (error) {
      console.error('Error fetching shop management data:', error);
      throw error;
    }
  }

  static async saveShopProduct(productData) {
    try {
      await ensureAnonymousLogin();
      const skus = Array.isArray(productData.skus) ? productData.skus : [];
      const derivedRewardPointsReturnFrom = skus.length > 0
        ? Math.min(...skus.map((sku) => Math.max(0, Number(sku.rewardPointsReturn || 0))))
        : Math.max(0, Number(productData.rewardPointsReturnFrom || 0));

      const productPayload = {
        ...toShopProductPayload({
          ...productData,
          rewardPointsReturnFrom: derivedRewardPointsReturnFrom
        }),
        updated_at: new Date()
      };

      let productId = productData.id;

      if (productId) {
        await db.collection(collections.shopProducts).doc(productId).update(productPayload);
        await db.collection(collections.shopProductSkus).where({ product_id: productId }).remove();
      } else {
        const result = await db.collection(collections.shopProducts).add({
          ...productPayload,
          created_at: new Date()
        });
        productId = result.id || result._id;
      }

      for (const sku of skus) {
        await db.collection(collections.shopProductSkus).add({
          ...toShopSkuPayload(sku, productId),
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      return productId;
    } catch (error) {
      console.error('Error saving shop product:', error);
      throw error;
    }
  }

  static async updateShopOrderStatus(orderId, nextStatus) {
    try {
      await ensureAnonymousLogin();

      let orderDocument = getFirstDocument(await db.collection(collections.shopOrders).doc(orderId).get(), collections.shopOrders);

      if (!orderDocument && orderId) {
        orderDocument = getFirstDocument(
          await db.collection(collections.shopOrders).where({ order_no: orderId }).limit(1).get(),
          collections.shopOrders
        );
      }

      if (!orderDocument) {
        throw new Error('订单不存在');
      }

      const order = normalizeShopOrder(orderDocument);
      const resolvedOrderId = order.id || getDocumentId(orderDocument) || orderId;
      const nowIso = new Date().toISOString();
      const updatePayload = {
        status: nextStatus,
        updated_at: nowIso
      };

      if (nextStatus === 'paid') {
        updatePayload.paid_at = nowIso;
      }

      if (nextStatus === 'shipped') {
        updatePayload.shipped_at = nowIso;
      }

      if (nextStatus === 'completed') {
        updatePayload.completed_at = nowIso;
      }

      if (nextStatus === 'paid' && order.status !== 'paid' && order.totalCash > 0 && (order.rewardPointsAwarded + order.badgeBonusPointsAwarded) === 0) {
        const userDocument = getFirstDocument(await db.collection(collections.users).doc(order.userId).get(), collections.users);
        const orderItemsResult = await db.collection(collections.shopOrderItems).where({ order_id: resolvedOrderId }).limit(20).get().catch(() => ({ data: [] }));
        const orderItems = getDocuments(orderItemsResult, collections.shopOrderItems);
        const membershipPlanKey = resolveStudentMembershipPlanKeyFromOrder(orderDocument, orderItems);

        if (userDocument) {
          const configuredRewardPoints = Math.max(0, Number(order.rewardPointsReturnTotal || 0));
          const badgeBonus = await getEquippedBadgeBonusForActivity({
            userId: order.userId,
            activityType: BADGE_ACTIVITY_TYPES.shopSpend,
            baseAmount: order.totalCash
          });
          const totalRewardPoints = configuredRewardPoints + Math.max(0, Number(badgeBonus.rewardAmount || 0));

          if (totalRewardPoints > 0) {
            const nextBalance = Number(userDocument.balance || 0) + totalRewardPoints;
            const wealthHistoryEntry = createWealthHistoryEntry({
              amount: totalRewardPoints,
              description: `工坊消费奖励：${order.orderNo}`,
              source: 'shop_cash_reward',
              relatedUserId: order.userId
            });

            await db.collection(collections.pointLedger).add({
              user_id: order.userId,
              delta: totalRewardPoints,
              balance_after: nextBalance,
              biz_type: 'shop_cash_reward',
              biz_id: resolvedOrderId,
              description: `工坊消费奖励：${order.orderNo}`,
              operator_id: 'admin',
              created_at: nowIso
            });

            await db.collection(collections.users).doc(order.userId).update({
              balance: nextBalance,
              wealth_history: [wealthHistoryEntry].concat(userDocument.wealth_history || []),
              updated_at: nowIso
            });

            updatePayload.reward_points_awarded = configuredRewardPoints;
            updatePayload.badge_bonus_points_awarded = Math.max(0, Number(badgeBonus.rewardAmount || 0));
          }

          if (membershipPlanKey) {
            const membershipSettings = await DatabaseService.getStudentMembershipSettings();
            const membershipPlan = getStudentMembershipPlan(membershipSettings, membershipPlanKey);

            if (membershipPlan) {
              const currentExpireAt = userDocument.student_expire_at || userDocument.studentExpireAt || '';
              const currentExpireTimestamp = new Date(currentExpireAt || 0).getTime();
              const membershipBaseDate = Number.isFinite(currentExpireTimestamp) && currentExpireTimestamp > Date.now()
                ? new Date(currentExpireAt)
                : new Date(nowIso);
              const nextExpireAt = membershipPlan.isLifetime
                ? LIFETIME_STUDENT_EXPIRES_AT
                : addMonthsToIso(membershipBaseDate, membershipPlan.durationMonths);

              await db.collection(collections.users).doc(order.userId).update({
                is_student: true,
                student_expire_at: nextExpireAt,
                student_membership_plan_key: membershipPlan.key,
                updated_at: nowIso
              });
            }
          }
        }
      }

      if ((nextStatus === 'cancelled' || nextStatus === 'refunded') && order.totalPoints > 0 && order.status !== 'cancelled' && order.status !== 'refunded') {
        const userDocument = getFirstDocument(await db.collection(collections.users).doc(order.userId).get(), collections.users);

        if (userDocument) {
          const nextBalance = Number(userDocument.balance || 0) + order.totalPoints;
          const wealthHistoryEntry = createWealthHistoryEntry({
            amount: order.totalPoints,
            description: `工坊退款：${order.orderNo}`,
            source: 'shop_refund',
            relatedUserId: order.userId
          });

          await db.collection(collections.pointLedger).add({
            user_id: order.userId,
            delta: order.totalPoints,
            balance_after: nextBalance,
            biz_type: 'shop_refund',
            biz_id: resolvedOrderId,
            description: `工坊退款：${order.orderNo}`,
            operator_id: 'admin',
            created_at: nowIso
          });

          await db.collection(collections.users).doc(order.userId).update({
            balance: nextBalance,
            wealth_history: [wealthHistoryEntry].concat(userDocument.wealth_history || []),
            updated_at: nowIso
          });
        }
      }

      if ((nextStatus === 'cancelled' || nextStatus === 'refunded') && (order.rewardPointsAwarded > 0 || order.badgeBonusPointsAwarded > 0) && order.status !== 'cancelled' && order.status !== 'refunded') {
        const userDocument = getFirstDocument(await db.collection(collections.users).doc(order.userId).get(), collections.users);

        if (userDocument) {
          const totalRewardToRevoke = order.rewardPointsAwarded + order.badgeBonusPointsAwarded;
          const nextBalance = Number(userDocument.balance || 0) - totalRewardToRevoke;
          const wealthHistoryEntry = createWealthHistoryEntry({
            amount: -totalRewardToRevoke,
            description: `工坊奖励撤回：${order.orderNo}`,
            source: 'shop_reward_reversal',
            relatedUserId: order.userId
          });

          await db.collection(collections.pointLedger).add({
            user_id: order.userId,
            delta: -totalRewardToRevoke,
            balance_after: nextBalance,
            biz_type: 'shop_reward_reversal',
            biz_id: resolvedOrderId,
            description: `工坊奖励撤回：${order.orderNo}`,
            operator_id: 'admin',
            created_at: nowIso
          });

          await db.collection(collections.users).doc(order.userId).update({
            balance: nextBalance,
            wealth_history: [wealthHistoryEntry].concat(userDocument.wealth_history || []),
            updated_at: nowIso
          });

          updatePayload.reward_points_awarded = 0;
          updatePayload.badge_bonus_points_awarded = 0;
        }
      }

      await db.collection(collections.shopOrders).doc(resolvedOrderId).update(updatePayload);
    } catch (error) {
      console.error('Error updating shop order status:', error);
      throw error;
    }
  }

  static async getAwarenessTagSettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: AWARENESS_TAG_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return {
          ...DEFAULT_AWARENESS_TAG_SETTINGS,
          missingCollection: true
        };
      }

      const documents = getDocuments(result, collections.appSettings);
      const document = documents[0];

      if (!document) {
        return { ...DEFAULT_AWARENESS_TAG_SETTINGS };
      }

      return normalizeAwarenessTagSettings(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return {
          ...DEFAULT_AWARENESS_TAG_SETTINGS,
          missingCollection: true
        };
      }

      console.error('Error fetching awareness tag settings:', error);
      throw error;
    }
  }

  static async saveAwarenessTagSettings(settingsData) {
    try {
      await ensureAnonymousLogin();
      const rename = settingsData.rename || null;
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: AWARENESS_TAG_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocuments = getDocuments(existingResult, collections.appSettings);
      if (rename && rename.fromKey && rename.toKey && rename.fromKey !== rename.toKey) {
        const normalizedContent = normalizeAwarenessTagContent(rename.toContent);
        if (!normalizedContent) {
          throw new Error('请输入觉察标签名称');
        }

        if (getAwarenessTagLength(normalizedContent) > ADMIN_AWARENESS_TAG_MAX_LENGTH) {
          throw new Error('标签名称最多 9 个汉字（18 个字符）');
        }

        const conflictingResult = await db
          .collection(collections.awarenessRecords)
          .where({ tag_key: rename.toKey })
          .limit(1)
          .get();

        if (getDocuments(conflictingResult, collections.awarenessRecords).length > 0) {
          throw new Error('已存在同名觉察标签，请更换名称');
        }

        const recordsResult = await db
          .collection(collections.awarenessRecords)
          .where({ tag_key: rename.fromKey })
          .limit(2000)
          .get();

        const records = getDocuments(recordsResult, collections.awarenessRecords);
        await Promise.all(
          records.map((record) => (
            db.collection(collections.awarenessRecords).doc(getDocumentId(record)).update({
              content: normalizedContent,
              access_type: rename.toAccessType === 'student' ? 'student' : 'public',
              tag_key: rename.toKey,
              updated_at: new Date()
            })
          ))
        );
      }

      const payload = {
        ...toAwarenessTagSettingsPayload(settingsData),
        updated_at: new Date()
      };

      if (existingDocuments.length > 0) {
        const existingDocument = existingDocuments[0];

        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);

        return normalizeAwarenessTagSettings({
          ...existingDocument,
          ...payload
        });
      }

      const createResult = await db.collection(collections.appSettings).add({
        ...payload,
        created_at: new Date()
      });

      return normalizeAwarenessTagSettings({
        ...payload,
        _id: createResult.id
      });
    } catch (error) {
      console.error('Error saving awareness tag settings:', error);
      throw error;
    }
  }

  static async getAwarenessTagOverview(limit = 200) {
    try {
      await ensureAnonymousLogin();
      const [recordsResult, settings] = await Promise.all([
        db.collection(collections.awarenessRecords).limit(2000).get(),
        this.getAwarenessTagSettings()
      ]);

      const tagMap = new Map();

      getDocuments(recordsResult, collections.awarenessRecords).forEach((record) => {
        const content = (record.content || '').trim();
        const accessType = record.access_type || record.accessType || 'public';
        const tagKey = record.tag_key || `${content}::${accessType}`;
        const timestamp = record.created_at_client || record.timestamp || record.created_at || record.createdAt || '';

        if (!content) {
          return;
        }

        const existingTag = tagMap.get(tagKey) || {
          key: tagKey,
          content,
          accessType,
          totalCount: 0,
          rewardPoints: settings.tagsByKey?.[tagKey]?.rewardPoints || 0,
          totalRewardPoints: 0,
          lastUsedAt: timestamp,
          lastUserName: record.user_name || record.userName || '匿名用户',
          description: settings.tagsByKey?.[tagKey]?.description || ''
        };

        existingTag.totalCount += 1;
        existingTag.totalRewardPoints += Math.max(
          0,
          Number(
            record.reward_points_awarded ??
            record.rewardPointsAwarded ??
            record.reward_points_setting_snapshot ??
            record.rewardPointsSettingSnapshot ??
            0
          )
        );

        if (new Date(timestamp || 0).getTime() >= new Date(existingTag.lastUsedAt || 0).getTime()) {
          existingTag.lastUsedAt = timestamp;
          existingTag.lastUserName = record.user_name || record.userName || '匿名用户';
        }

        existingTag.description = settings.tagsByKey?.[tagKey]?.description || '';
        existingTag.rewardPoints = settings.tagsByKey?.[tagKey]?.rewardPoints || 0;
        tagMap.set(tagKey, existingTag);
      });

      return Array.from(tagMap.values())
        .sort((left, right) => {
          if (right.totalCount !== left.totalCount) {
            return right.totalCount - left.totalCount;
          }

          return new Date(right.lastUsedAt || 0).getTime() - new Date(left.lastUsedAt || 0).getTime();
        })
        .slice(0, limit);
    } catch (error) {
      console.error('Error fetching awareness tag overview:', error);
      throw error;
    }
  }

  static async getAwarenessMockLibrarySettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: AWARENESS_MOCK_LIBRARY_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return {
          ...DEFAULT_AWARENESS_MOCK_LIBRARY_SETTINGS,
          missingCollection: true
        };
      }

      const document = getFirstDocument(result, collections.appSettings);
      if (!document) {
        return { ...DEFAULT_AWARENESS_MOCK_LIBRARY_SETTINGS };
      }

      return normalizeAwarenessMockLibrarySettings(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return {
          ...DEFAULT_AWARENESS_MOCK_LIBRARY_SETTINGS,
          missingCollection: true
        };
      }

      console.error('Error fetching awareness mock library settings:', error);
      throw error;
    }
  }

  static async saveAwarenessMockLibrarySettings(settingsData) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: AWARENESS_MOCK_LIBRARY_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const lexicon = normalizeAwarenessMockLexicon(settingsData.lexicon || []);
      if (lexicon.length === 0) {
        throw new Error('请至少保留 1 条模拟词库词条。');
      }

      const existingDocument = getFirstDocument(existingResult, collections.appSettings);
      const payload = {
        ...toAwarenessMockLibraryPayload({ lexicon }),
        updated_at: new Date()
      };

      if (existingDocument) {
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizeAwarenessMockLibrarySettings({
          ...existingDocument,
          ...payload
        });
      }

      const createResult = await db.collection(collections.appSettings).add({
        ...payload,
        created_at: new Date()
      });

      return normalizeAwarenessMockLibrarySettings({
        ...payload,
        _id: createResult.id
      });
    } catch (error) {
      console.error('Error saving awareness mock library settings:', error);
      throw error;
    }
  }

  static async simulateAwarenessRecords(recordCount) {
    try {
      await ensureAnonymousLogin();
      const normalizedCount = Math.floor(Number(recordCount) || 0);

      if (normalizedCount <= 0) {
        throw new Error('请输入大于 0 的模拟条数。');
      }

      if (normalizedCount > MAX_AWARENESS_MOCK_RECORDS_PER_RUN) {
        throw new Error(`单次最多生成 ${MAX_AWARENESS_MOCK_RECORDS_PER_RUN} 条模拟数据。`);
      }

      const [usersResult, mockLibrarySettings] = await Promise.all([
        db.collection(collections.users).limit(5000).get(),
        this.getAwarenessMockLibrarySettings()
      ]);

      const lexicon = normalizeAwarenessMockLexicon(mockLibrarySettings.lexicon);
      if (lexicon.length === 0) {
        throw new Error('模拟词库为空，请先保存词库内容。');
      }

      const eligibleUsers = getDocuments(usersResult, collections.users)
        .map(normalizeUser)
        .filter((user) => user.uid >= AWARENESS_MOCK_USER_UID_START && user.uid <= AWARENESS_MOCK_USER_UID_END);

      if (eligibleUsers.length === 0) {
        throw new Error(`未找到 uid ${AWARENESS_MOCK_USER_UID_START}-${AWARENESS_MOCK_USER_UID_END} 的用户。`);
      }

      const expectedUids = Array.from(
        { length: AWARENESS_MOCK_USER_UID_END - AWARENESS_MOCK_USER_UID_START + 1 },
        (_, index) => AWARENESS_MOCK_USER_UID_START + index
      );
      const existingUidSet = new Set(eligibleUsers.map((user) => user.uid));
      const missingUids = expectedUids.filter((uid) => !existingUidSet.has(uid));

      const nowIso = new Date().toISOString();
      const createdAt = new Date(nowIso);
      const records = Array.from({ length: normalizedCount }, () => {
        const targetUser = getRandomItem(eligibleUsers);
        const content = getRandomItem(lexicon);
        const accessType = 'public';
        const userName = targetUser.name || `觉醒伙伴${targetUser.uid}`;
        const authorKey = targetUser.authUid || targetUser.id || `uid_${targetUser.uid}`;

        return {
          author_key: authorKey,
          user_id: targetUser.id,
          auth_uid: targetUser.authUid || '',
          user_name: userName,
          content,
          access_type: accessType,
          tag_key: `${content}::${accessType}`,
          share_tag_code: '',
          record_source: 'admin_mock_seed',
          reward_points_awarded: 0,
          reward_points_setting_snapshot: 0,
          created_at: createdAt,
          created_at_client: nowIso,
          timestamp: nowIso,
          updated_at: createdAt
        };
      });

      for (const chunk of chunkArray(records, 50)) {
        await Promise.all(
          chunk.map((record) => db.collection(collections.awarenessRecords).add(record))
        );
      }

      return {
        insertedCount: normalizedCount,
        executedAt: nowIso,
        usedUserCount: eligibleUsers.length,
        missingUids,
        lexiconSize: lexicon.length
      };
    } catch (error) {
      console.error('Error simulating awareness records:', error);
      throw error;
    }
  }

  static async getMeditationSettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: MEDITATION_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return {
          ...DEFAULT_MEDITATION_SETTINGS,
          missingCollection: true
        };
      }

      const documents = getDocuments(result, collections.appSettings);
      const document = documents[0];

      if (!document) {
        return { ...DEFAULT_MEDITATION_SETTINGS };
      }

      return normalizeMeditationSettings(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return {
          ...DEFAULT_MEDITATION_SETTINGS,
          missingCollection: true
        };
      }

      console.error('Error fetching meditation settings:', error);
      throw error;
    }
  }

  static async saveMeditationSettings(settingsData) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: MEDITATION_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocuments = getDocuments(existingResult, collections.appSettings);
      const payload = {
        ...toMeditationSettingsPayload(settingsData),
        updated_at: new Date()
      };

      if (existingDocuments.length > 0) {
        const existingDocument = existingDocuments[0];

        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);

        return normalizeMeditationSettings({
          ...existingDocument,
          ...payload
        });
      }

      const createResult = await db.collection(collections.appSettings).add({
        ...payload,
        created_at: new Date()
      });

      return normalizeMeditationSettings({
        ...payload,
        _id: createResult.id
      });
    } catch (error) {
      console.error('Error saving meditation settings:', error);
      throw error;
    }
  }

  static async getBadgeSettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: BADGE_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return {
          ...DEFAULT_BADGE_SETTINGS,
          missingCollection: true
        };
      }

      const documents = getDocuments(result, collections.appSettings);
      const document = documents[0];

      if (!document) {
        return { ...DEFAULT_BADGE_SETTINGS };
      }

      return normalizeBadgeSettings(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return {
          ...DEFAULT_BADGE_SETTINGS,
          missingCollection: true
        };
      }

      console.error('Error fetching badge settings:', error);
      throw error;
    }
  }

  static async saveBadgeSettings(settingsData) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: BADGE_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocuments = getDocuments(existingResult, collections.appSettings);
      const payload = {
        ...toBadgeSettingsPayload(settingsData),
        updated_at: new Date()
      };

      if (existingDocuments.length > 0) {
        const existingDocument = existingDocuments[0];

        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);

        return normalizeBadgeSettings({
          ...existingDocument,
          ...payload
        });
      }

      const createResult = await db.collection(collections.appSettings).add({
        ...payload,
        created_at: new Date()
      });

      return normalizeBadgeSettings({
        ...payload,
        _id: createResult.id
      });
    } catch (error) {
      console.error('Error saving badge settings:', error);
      throw error;
    }
  }

  static async getThemeSettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: CLIENT_THEME_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return {
          ...DEFAULT_THEME_SETTINGS,
          missingCollection: true
        };
      }

      const documents = getDocuments(result, collections.appSettings);
      const document = documents[0];

      if (!document) {
        return { ...DEFAULT_THEME_SETTINGS };
      }

      return normalizeClientThemeSettings(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return {
          ...DEFAULT_THEME_SETTINGS,
          missingCollection: true
        };
      }

      console.error('Error fetching theme settings:', error);
      throw error;
    }
  }

  static async getAwarenessDisplaySettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: AWARENESS_DISPLAY_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return {
          ...DEFAULT_AWARENESS_DISPLAY,
          missingCollection: true
        };
      }

      const documents = getDocuments(result, collections.appSettings);
      const document = documents[0];

      if (!document) {
        return { ...DEFAULT_AWARENESS_DISPLAY };
      }

      return normalizeAwarenessDisplaySettings(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return {
          ...DEFAULT_AWARENESS_DISPLAY,
          missingCollection: true
        };
      }

      console.error('Error fetching awareness display settings:', error);
      throw error;
    }
  }

  static async getStudentMembershipSettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: STUDENT_MEMBERSHIP_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return {
          ...DEFAULT_STUDENT_MEMBERSHIP_SETTINGS,
          missingCollection: true
        };
      }

      const documents = getDocuments(result, collections.appSettings);
      const document = documents[0];

      if (!document) {
        return { ...DEFAULT_STUDENT_MEMBERSHIP_SETTINGS };
      }

      return normalizeStudentMembershipSettings(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return {
          ...DEFAULT_STUDENT_MEMBERSHIP_SETTINGS,
          missingCollection: true
        };
      }

      console.error('Error fetching student membership settings:', error);
      throw error;
    }
  }

  static async saveStudentMembershipSettings(settingsData) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: STUDENT_MEMBERSHIP_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocuments = getDocuments(existingResult, collections.appSettings);
      const payload = {
        ...toStudentMembershipSettingsPayload(settingsData),
        updated_at: new Date()
      };

      if (existingDocuments.length > 0) {
        const existingDocument = existingDocuments[0];
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizeStudentMembershipSettings({
          ...existingDocument,
          ...payload
        });
      }

      const createResult = await db.collection(collections.appSettings).add({
        ...payload,
        created_at: new Date()
      });

      return normalizeStudentMembershipSettings({
        ...payload,
        _id: createResult.id
      });
    } catch (error) {
      console.error('Error saving student membership settings:', error);
      throw error;
    }
  }

  static async saveThemeSettings(settingsData) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: CLIENT_THEME_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocuments = getDocuments(existingResult, collections.appSettings);
      const payload = {
        ...toClientThemeSettingsPayload(settingsData),
        updated_at: new Date()
      };

      if (existingDocuments.length > 0) {
        const existingDocument = existingDocuments[0];
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizeClientThemeSettings({
          ...existingDocument,
          ...payload
        });
      }

      const createResult = await db.collection(collections.appSettings).add({
        ...payload,
        created_at: new Date()
      });

      return normalizeClientThemeSettings({
        ...payload,
        _id: createResult.id
      });
    } catch (error) {
      console.error('Error saving theme settings:', error);
      throw error;
    }
  }

  static async saveAwarenessDisplaySettings(settingsData) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: AWARENESS_DISPLAY_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocuments = getDocuments(existingResult, collections.appSettings);
      const payload = {
        ...toAwarenessDisplaySettingsPayload(settingsData),
        updated_at: new Date()
      };

      if (existingDocuments.length > 0) {
        const existingDocument = existingDocuments[0];
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizeAwarenessDisplaySettings({
          ...existingDocument,
          ...payload
        });
      }

      const createResult = await db.collection(collections.appSettings).add({
        ...payload,
        created_at: new Date()
      });

      return normalizeAwarenessDisplaySettings({
        ...payload,
        _id: createResult.id
      });
    } catch (error) {
      console.error('Error saving awareness display settings:', error);
      throw error;
    }
  }

  static async getBrandCarouselSettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: BRAND_CAROUSEL_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return {
          ...DEFAULT_BRAND_CAROUSEL,
          missingCollection: true
        };
      }

      const documents = getDocuments(result, collections.appSettings);
      const document = documents[0];

      if (!document) {
        return { ...DEFAULT_BRAND_CAROUSEL };
      }

      const normalizedSettings = normalizeBrandCarouselSettings(document);
      const tempUrlMap = await buildTempUrlMap(normalizedSettings.slides.map((slide) => slide.fileId));

      return {
        ...normalizedSettings,
        slides: normalizedSettings.slides.map((slide) => ({
          ...slide,
          imageUrl: tempUrlMap.get(slide.fileId) || slide.imageUrl || ''
        }))
      };
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return {
          ...DEFAULT_BRAND_CAROUSEL,
          missingCollection: true
        };
      }

      console.error('Error fetching brand carousel settings:', error);
      throw error;
    }
  }

  static async getUserAvatarOptionsSettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: USER_AVATAR_OPTIONS_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return {
          ...DEFAULT_USER_AVATAR_OPTIONS,
          missingCollection: true
        };
      }

      const document = getFirstDocument(result, collections.appSettings);
      if (!document) {
        return { ...DEFAULT_USER_AVATAR_OPTIONS };
      }

      const normalizedSettings = normalizeUserAvatarOptionsSettings(document);
      const tempUrlMap = await buildTempUrlMap(normalizedSettings.avatars.map((avatar) => avatar.fileId));

      return {
        ...normalizedSettings,
        avatars: normalizedSettings.avatars.map((avatar) => ({
          ...avatar,
          imageUrl: tempUrlMap.get(avatar.fileId) || avatar.imageUrl || ''
        }))
      };
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return {
          ...DEFAULT_USER_AVATAR_OPTIONS,
          missingCollection: true
        };
      }

      console.error('Error fetching user avatar options settings:', error);
      throw error;
    }
  }

  static async saveBrandCarouselSettings(settingsData) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: BRAND_CAROUSEL_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocuments = getDocuments(existingResult, collections.appSettings);
      const payload = {
        ...toBrandCarouselSettingsPayload(settingsData),
        updated_at: new Date()
      };

      if (existingDocuments.length > 0) {
        const existingDocument = existingDocuments[0];
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizeBrandCarouselSettings({
          ...existingDocument,
          ...payload
        });
      }

      const createResult = await db.collection(collections.appSettings).add({
        ...payload,
        created_at: new Date()
      });

      return normalizeBrandCarouselSettings({
        ...payload,
        _id: createResult.id
      });
    } catch (error) {
      console.error('Error saving brand carousel settings:', error);
      throw error;
    }
  }

  static async saveUserAvatarOptionsSettings(settingsData) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: USER_AVATAR_OPTIONS_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocument = getFirstDocument(existingResult, collections.appSettings);
      const payload = {
        ...toUserAvatarOptionsPayload(settingsData),
        updated_at: new Date()
      };

      if (existingDocument) {
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizeUserAvatarOptionsSettings({
          ...existingDocument,
          ...payload
        });
      }

      const createResult = await db.collection(collections.appSettings).add({
        ...payload,
        created_at: new Date()
      });

      return normalizeUserAvatarOptionsSettings({
        ...payload,
        _id: createResult.id
      });
    } catch (error) {
      console.error('Error saving user avatar options settings:', error);
      throw error;
    }
  }

  static async getClientDistributionSettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: CLIENT_DISTRIBUTION_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return {
          ...DEFAULT_CLIENT_DISTRIBUTION_SETTINGS,
          missingCollection: true
        };
      }

      const document = getFirstDocument(result, collections.appSettings);
      if (!document) {
        return { ...DEFAULT_CLIENT_DISTRIBUTION_SETTINGS };
      }

      return normalizeClientDistributionSettings(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return {
          ...DEFAULT_CLIENT_DISTRIBUTION_SETTINGS,
          missingCollection: true
        };
      }

      console.error('Error fetching client distribution settings:', error);
      throw error;
    }
  }

  static async getShopHomeLivingSettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: SHOP_HOME_LIVING_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return {
          ...DEFAULT_SHOP_HOME_LIVING_SETTINGS,
          missingCollection: true
        };
      }

      const document = getFirstDocument(result, collections.appSettings);
      if (!document) {
        return { ...DEFAULT_SHOP_HOME_LIVING_SETTINGS };
      }

      const normalizedSettings = normalizeShopHomeLivingSettings(document);
      const tempUrlMap = await buildTempUrlMap(normalizedSettings.cards.map((card) => card.fileId));

      return {
        ...normalizedSettings,
        cards: normalizedSettings.cards.map((card) => ({
          ...card,
          imageUrl: tempUrlMap.get(card.fileId) || card.imageUrl || ''
        }))
      };
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return {
          ...DEFAULT_SHOP_HOME_LIVING_SETTINGS,
          missingCollection: true
        };
      }

      console.error('Error fetching shop home living settings:', error);
      throw error;
    }
  }

  static async getPageMastheadSettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: PAGE_MASTHEAD_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return {
          ...DEFAULT_PAGE_MASTHEAD,
          missingCollection: true
        };
      }

      const document = getFirstDocument(result, collections.appSettings);
      if (!document) {
        return { ...DEFAULT_PAGE_MASTHEAD };
      }

      return normalizePageMastheadSettings(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return {
          ...DEFAULT_PAGE_MASTHEAD,
          missingCollection: true
        };
      }

      console.error('Error fetching page masthead settings:', error);
      throw error;
    }
  }

  static async saveClientDistributionSettings(settingsData) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: CLIENT_DISTRIBUTION_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocument = getFirstDocument(existingResult, collections.appSettings);
      const payload = {
        ...toClientDistributionSettingsPayload(settingsData),
        updated_at: new Date()
      };

      if (existingDocument) {
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizeClientDistributionSettings({
          ...existingDocument,
          ...payload
        });
      }

      const createResult = await db.collection(collections.appSettings).add({
        ...payload,
        created_at: new Date()
      });

      return normalizeClientDistributionSettings({
        ...payload,
        _id: createResult.id
      });
    } catch (error) {
      console.error('Error saving client distribution settings:', error);
      throw error;
    }
  }

  static async saveShopHomeLivingSettings(settingsData) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: SHOP_HOME_LIVING_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocument = getFirstDocument(existingResult, collections.appSettings);
      const payload = {
        ...toShopHomeLivingSettingsPayload(settingsData),
        updated_at: new Date()
      };

      if (existingDocument) {
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizeShopHomeLivingSettings({
          ...existingDocument,
          ...payload
        });
      }

      const createResult = await db.collection(collections.appSettings).add({
        ...payload,
        created_at: new Date()
      });

      return normalizeShopHomeLivingSettings({
        ...payload,
        _id: createResult.id
      });
    } catch (error) {
      console.error('Error saving shop home living settings:', error);
      throw error;
    }
  }

  static async savePageMastheadSettings(settingsData) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: PAGE_MASTHEAD_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocument = getFirstDocument(existingResult, collections.appSettings);
      const payload = {
        ...toPageMastheadSettingsPayload(settingsData),
        updated_at: new Date()
      };

      if (existingDocument) {
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizePageMastheadSettings({
          ...existingDocument,
          ...payload
        });
      }

      const createResult = await db.collection(collections.appSettings).add({
        ...payload,
        created_at: new Date()
      });

      return normalizePageMastheadSettings({
        ...payload,
        _id: createResult.id
      });
    } catch (error) {
      console.error('Error saving page masthead settings:', error);
      throw error;
    }
  }

  static async getUsers() {
    try {
      await ensureAnonymousLogin();
      const result = await db.collection(collections.users).limit(1000).get();
      return getDocuments(result, collections.users).map(normalizeUser);
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  }

  static async createUser(userData) {
    try {
      await ensureAnonymousLogin();
      const result = await db.collection(collections.users).add({
        ...toUserPayload(userData),
        created_at: new Date(),
        updated_at: new Date()
      });
      return result.id;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  static async updateUser(userId, userData) {
    try {
      await ensureAnonymousLogin();
      await db.collection(collections.users).doc(userId).update({
        ...toUserPayload(userData),
        updated_at: new Date()
      });
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  static async deleteUser(userId) {
    try {
      await ensureAnonymousLogin();
      await db.collection(collections.userTags).where({ user_id: userId }).remove();
      await db.collection(collections.users).doc(userId).remove();
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  static async getTagCategories() {
    try {
      await ensureAnonymousLogin();
      const result = await db.collection(collections.tagCategories).limit(1000).get();
      return getDocuments(result, collections.tagCategories).map(normalizeCategory);
    } catch (error) {
      console.error('Error fetching tag categories:', error);
      throw error;
    }
  }

  static async createCategory(categoryData) {
    try {
      await ensureAnonymousLogin();
      const result = await db.collection(collections.tagCategories).add({
        ...toCategoryPayload(categoryData),
        created_at: new Date(),
        updated_at: new Date()
      });
      return result.id;
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }

  static async updateCategory(categoryId, categoryData) {
    try {
      await ensureAnonymousLogin();
      await db.collection(collections.tagCategories).doc(categoryId).update({
        ...toCategoryPayload(categoryData),
        updated_at: new Date()
      });
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }

  static async deleteCategory(categoryId) {
    try {
      await ensureAnonymousLogin();
      const tags = await db.collection(collections.tags).where({ category_id: categoryId }).limit(1000).get();

      for (const tag of getDocuments(tags, collections.tags)) {
        await this.deleteTag(getDocumentId(tag));
      }

      await db.collection(collections.tagCategories).doc(categoryId).remove();
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  }

  static async getTags() {
    try {
      await ensureAnonymousLogin();
      const [tagsResult, categories] = await Promise.all([
        db.collection(collections.tags).limit(1000).get(),
        this.getTagCategories()
      ]);

      const categoriesById = new Map(categories.map((category) => [category.id, category]));
      return getDocuments(tagsResult, collections.tags).map((tag) => normalizeTag(tag, categoriesById));
    } catch (error) {
      console.error('Error fetching tags:', error);
      throw error;
    }
  }

  static async createTag(tagData) {
    try {
      await ensureAnonymousLogin();
      const result = await db.collection(collections.tags).add({
        ...toTagPayload(tagData),
        created_at: new Date(),
        updated_at: new Date()
      });
      return result.id;
    } catch (error) {
      console.error('Error creating tag:', error);
      throw error;
    }
  }

  static async updateTag(tagId, tagData) {
    try {
      await ensureAnonymousLogin();
      await db.collection(collections.tags).doc(tagId).update({
        ...toTagPayload(tagData),
        updated_at: new Date()
      });
    } catch (error) {
      console.error('Error updating tag:', error);
      throw error;
    }
  }

  static async deleteTag(tagId) {
    try {
      await ensureAnonymousLogin();
      await db.collection(collections.userTags).where({ tag_id: tagId }).remove();
      await db.collection(collections.tags).doc(tagId).remove();
    } catch (error) {
      console.error('Error deleting tag:', error);
      throw error;
    }
  }

  static async getUserTags(userId) {
    try {
      await ensureAnonymousLogin();
      const [userTagsResult, tags, categories] = await Promise.all([
        db.collection(collections.userTags).where({ user_id: userId }).limit(1000).get(),
        db.collection(collections.tags).limit(1000).get(),
        this.getTagCategories()
      ]);

      const categoriesById = new Map(categories.map((category) => [category.id, category]));
      const tagsById = new Map(
        getDocuments(tags, collections.tags).map((tag) => {
          const normalizedTag = normalizeTag(tag, categoriesById);
          return [normalizedTag.id, normalizedTag];
        })
      );

      return getDocuments(userTagsResult, collections.userTags)
        .map((link) => {
          const tag = tagsById.get(link.tag_id);
          if (!tag) {
            return null;
          }

          return {
            ...tag,
            assignedDate: link.assigned_date || link.assignedDate || ''
          };
        })
        .filter(Boolean);
    } catch (error) {
      console.error('Error fetching user tags:', error);
      throw error;
    }
  }

  static async assignTagToUser(userId, tagId) {
    try {
      await ensureAnonymousLogin();
      await db.collection(collections.userTags).add({
        user_id: userId,
        tag_id: tagId,
        assigned_date: new Date().toISOString().split('T')[0],
        created_at: new Date()
      });
    } catch (error) {
      console.error('Error assigning tag to user:', error);
      throw error;
    }
  }

  static async removeTagFromUser(userId, tagId) {
    try {
      await ensureAnonymousLogin();
      await db.collection(collections.userTags).where({ user_id: userId, tag_id: tagId }).remove();
    } catch (error) {
      console.error('Error removing tag from user:', error);
      throw error;
    }
  }

  static async updateUserTags(userId, tagIds) {
    try {
      await ensureAnonymousLogin();
      await db.collection(collections.userTags).where({ user_id: userId }).remove();

      for (const tagId of tagIds) {
        await this.assignTagToUser(userId, tagId);
      }
    } catch (error) {
      console.error('Error updating user tags:', error);
      throw error;
    }
  }

  static async getMeditationAudioLibrary() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: MEDITATION_AUDIO_LIBRARY_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return { ...DEFAULT_MEDITATION_AUDIO_LIBRARY, missingCollection: true };
      }

      const document = getFirstDocument(result, collections.appSettings);
      if (!document) {
        return { ...DEFAULT_MEDITATION_AUDIO_LIBRARY };
      }

      return normalizeMeditationAudioLibrary(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return { ...DEFAULT_MEDITATION_AUDIO_LIBRARY, missingCollection: true };
      }
      console.error('Error fetching meditation audio library:', error);
      throw error;
    }
  }

  static async saveMeditationAudioLibrary(data) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: MEDITATION_AUDIO_LIBRARY_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocuments = getDocuments(existingResult, collections.appSettings);
      const payload = { ...toMeditationAudioLibraryPayload(data), updated_at: new Date() };

      if (existingDocuments.length > 0) {
        const existingDocument = existingDocuments[0];
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizeMeditationAudioLibrary({ ...existingDocument, ...payload });
      }

      const createResult = await db.collection(collections.appSettings).add({ ...payload, created_at: new Date() });
      return normalizeMeditationAudioLibrary({ ...payload, _id: createResult.id });
    } catch (error) {
      console.error('Error saving meditation audio library:', error);
      throw error;
    }
  }

  static async getMeditationCompositionSettings() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: MEDITATION_COMPOSITION_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return { ...DEFAULT_MEDITATION_COMPOSITION_SETTINGS, missingCollection: true };
      }

      const document = getFirstDocument(result, collections.appSettings);
      if (!document) {
        return { ...DEFAULT_MEDITATION_COMPOSITION_SETTINGS };
      }

      return normalizeMeditationCompositionSettings(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return { ...DEFAULT_MEDITATION_COMPOSITION_SETTINGS, missingCollection: true };
      }
      console.error('Error fetching meditation composition settings:', error);
      throw error;
    }
  }

  static async saveMeditationCompositionSettings(data) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: MEDITATION_COMPOSITION_SETTINGS_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocuments = getDocuments(existingResult, collections.appSettings);
      const payload = { ...toMeditationCompositionSettingsPayload(data), updated_at: new Date() };

      if (existingDocuments.length > 0) {
        const existingDocument = existingDocuments[0];
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizeMeditationCompositionSettings({ ...existingDocument, ...payload });
      }

      const createResult = await db.collection(collections.appSettings).add({ ...payload, created_at: new Date() });
      return normalizeMeditationCompositionSettings({ ...payload, _id: createResult.id });
    } catch (error) {
      console.error('Error saving meditation composition settings:', error);
      throw error;
    }
  }

  static async getMeditationCalendar() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: MEDITATION_CALENDAR_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return { ...DEFAULT_MEDITATION_CALENDAR, missingCollection: true };
      }

      const document = getFirstDocument(result, collections.appSettings);
      if (!document) {
        return { ...DEFAULT_MEDITATION_CALENDAR };
      }

      return normalizeMeditationCalendar(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return { ...DEFAULT_MEDITATION_CALENDAR, missingCollection: true };
      }
      console.error('Error fetching meditation calendar:', error);
      throw error;
    }
  }

  static async saveMeditationCalendar(data) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: MEDITATION_CALENDAR_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocuments = getDocuments(existingResult, collections.appSettings);
      const payload = { ...toMeditationCalendarPayload(data), updated_at: new Date() };

      if (existingDocuments.length > 0) {
        const existingDocument = existingDocuments[0];
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizeMeditationCalendar({ ...existingDocument, ...payload });
      }

      const createResult = await db.collection(collections.appSettings).add({ ...payload, created_at: new Date() });
      return normalizeMeditationCalendar({ ...payload, _id: createResult.id });
    } catch (error) {
      console.error('Error saving meditation calendar:', error);
      throw error;
    }
  }

  static async getMeditationLibrary() {
    try {
      await ensureAnonymousLogin();
      const result = await db
        .collection(collections.appSettings)
        .where({ key: MEDITATION_LIBRARY_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(result)) {
        return { ...DEFAULT_MEDITATION_LIBRARY, missingCollection: true };
      }

      const document = getFirstDocument(result, collections.appSettings);
      if (!document) {
        return { ...DEFAULT_MEDITATION_LIBRARY };
      }

      return normalizeMeditationLibrary(document);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return { ...DEFAULT_MEDITATION_LIBRARY, missingCollection: true };
      }
      console.error('Error fetching meditation library:', error);
      throw error;
    }
  }

  static async saveMeditationLibrary(data) {
    try {
      await ensureAnonymousLogin();
      const existingResult = await db
        .collection(collections.appSettings)
        .where({ key: MEDITATION_LIBRARY_KEY })
        .limit(1)
        .get();

      if (isMissingCollectionIssue(existingResult)) {
        throw new Error(
          `CloudBase 已连接，但缺少集合 ${collections.appSettings}。请先创建该集合并配置前端可读写权限。`
        );
      }

      const existingDocuments = getDocuments(existingResult, collections.appSettings);
      const payload = { ...toMeditationLibraryPayload(data), updated_at: new Date() };

      if (existingDocuments.length > 0) {
        const existingDocument = existingDocuments[0];
        await db.collection(collections.appSettings).doc(getDocumentId(existingDocument)).update(payload);
        return normalizeMeditationLibrary({ ...existingDocument, ...payload });
      }

      const createResult = await db.collection(collections.appSettings).add({ ...payload, created_at: new Date() });
      return normalizeMeditationLibrary({ ...payload, _id: createResult.id });
    } catch (error) {
      console.error('Error saving meditation library:', error);
      throw error;
    }
  }

  static async getDashboardData() {
    try {
      await ensureAnonymousLogin();
      const [usersResult, tagsResult, categoriesResult, userTagsResult, pointLedgerResult, awarenessRecordsResult, badgeProfilesResult, userAvatarOptionsSettings] = await Promise.all([
        db.collection(collections.users).limit(1000).get(),
        db.collection(collections.tags).limit(1000).get(),
        db.collection(collections.tagCategories).limit(1000).get(),
        db.collection(collections.userTags).limit(5000).get(),
        db.collection(collections.pointLedger).limit(5000).get().catch(() => ({ data: [] })),
        db.collection(collections.awarenessRecords).limit(5000).get().catch(() => ({ data: [] })),
        db.collection(collections.badgeProfiles).limit(2000).get().catch(() => ({ data: [] })),
        this.getUserAvatarOptionsSettings()
      ]);

      const pointLedgerEntries = getDocuments(pointLedgerResult, collections.pointLedger);
      const awarenessRecords = getDocuments(awarenessRecordsResult, collections.awarenessRecords);
      const badgeProfiles = getDocuments(badgeProfilesResult, collections.badgeProfiles);
      const userStatsById = buildDashboardUserStatsMap({
        pointLedgerEntries,
        awarenessRecords,
        badgeProfiles
      });
      const overviewStats = buildDashboardOverviewStats({
        pointLedgerEntries,
        awarenessRecords
      });

      const dashboardData = attachTagsToUsers(
        getDocuments(usersResult, collections.users),
        getDocuments(tagsResult, collections.tags),
        getDocuments(categoriesResult, collections.tagCategories),
        getDocuments(userTagsResult, collections.userTags),
        userStatsById
      );

      const avatarUrlByIndex = new Map(
        (userAvatarOptionsSettings.avatars || [])
          .filter((avatar) => avatar.imageUrl)
          .map((avatar) => [avatar.index, avatar.imageUrl])
      );

      return {
        ...dashboardData,
        overviewStats,
        users: dashboardData.users.map((user) => ({
          ...user,
          avatar: avatarUrlByIndex.get(user.avatarIndex) || user.avatar || ''
        }))
      };
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw error;
    }
  }
}

export default DatabaseService;
