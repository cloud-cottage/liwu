import { DATABASE_CONFIG } from '../config/database.js';
import { db, ensureAnonymousLogin } from './cloudbase.js';

const { collections } = DATABASE_CONFIG;
const MEDITATION_SETTINGS_KEY = 'meditation_rewards';
const AWARENESS_TAG_SETTINGS_KEY = 'awareness_tag_settings';

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

  if (result?.message) {
    throw new Error(result.message);
  }

  throw new Error(`CloudBase query failed for collection "${collectionName}"`);
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
  productType: product.product_type || product.productType || 'physical',
  coverImage: product.cover_image || product.coverImage || '',
  description: product.description || '',
  status: product.status || 'draft',
  skuMode: product.sku_mode || product.skuMode || 'single',
  pricePointsFrom: Number(product.price_points_from ?? product.pricePointsFrom ?? 0),
  priceCashFrom: Number(product.price_cash_from ?? product.priceCashFrom ?? 0),
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
  productType: item.product_type || item.productType || 'physical'
});

const toShopProductPayload = (productData = {}) => ({
  name: productData.name || '',
  subtitle: productData.subtitle || '',
  category_id: productData.categoryId || '',
  product_type: productData.productType || 'physical',
  cover_image: productData.coverImage || '',
  gallery: productData.gallery || [],
  description: productData.description || '',
  detail_blocks: productData.detailBlocks || [],
  status: productData.status || 'draft',
  sku_mode: productData.skuMode || 'single',
  price_points_from: Number(productData.pricePointsFrom || 0),
  price_cash_from: Number(productData.priceCashFrom || 0),
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
  stock: Number(skuData.stock || 0),
  lock_stock: Number(skuData.lockStock || 0),
  status: skuData.status || 'active',
  weight: Number(skuData.weight || 0)
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

const normalizeUser = (user) => ({
  id: getDocumentId(user),
  name: user.name || '',
  avatar: user.avatar || '',
  email: user.email || '',
  phone: user.phone || '',
  joinDate: user.join_date || user.joinDate || '',
  lastActive: user.last_active || user.lastActive || '',
  status: user.status || 'inactive',
  level: Number(user.level ?? 1),
  experience: Number(user.experience ?? 0),
  authUid: user.auth_uid || user.authUid || '',
  isStudent: Boolean(user.is_student ?? user.isStudent),
  inviteCode: user.invite_code || user.inviteCode || '',
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
  rewardPoints: Math.max(0, Number(entry.reward_points ?? entry.rewardPoints ?? 0))
});

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
  delete rest.isStudent;
  delete rest.inviteCode;
  delete rest.inviterUserId;
  delete rest.balance;
  delete rest.created_at;
  delete rest.updated_at;

  return {
    ...rest,
    ...(joinDate !== undefined ? { join_date: joinDate } : {}),
    ...(lastActive !== undefined ? { last_active: lastActive } : {}),
    ...(userData.authUid !== undefined ? { auth_uid: userData.authUid } : {}),
    ...(userData.isStudent !== undefined ? { is_student: Boolean(userData.isStudent) } : {}),
    ...(userData.inviteCode !== undefined ? { invite_code: userData.inviteCode } : {}),
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

const attachTagsToUsers = (users, tags, categories, userTagLinks) => {
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
      tags: tagsByUserId.get(normalizedUser.id) || []
    };
  });

  return {
    users: normalizedUsers,
    tags: normalizedTags,
    categories: categories.map(normalizeCategory)
  };
};

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

      const productPayload = {
        ...toShopProductPayload(productData),
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

      const skus = Array.isArray(productData.skus) ? productData.skus : [];
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

      const orderResult = await db.collection(collections.shopOrders).doc(orderId).get();
      const orderDocument = getDocumentId(orderResult?.data || {}) ? orderResult.data : null;
      if (!orderDocument) {
        throw new Error('订单不存在');
      }

      const order = normalizeShopOrder(orderDocument);
      const nowIso = new Date().toISOString();
      const updatePayload = {
        status: nextStatus,
        updated_at: nowIso
      };

      if (nextStatus === 'shipped') {
        updatePayload.shipped_at = nowIso;
      }

      if (nextStatus === 'completed') {
        updatePayload.completed_at = nowIso;
      }

      if ((nextStatus === 'cancelled' || nextStatus === 'refunded') && order.totalPoints > 0 && order.status !== 'cancelled' && order.status !== 'refunded') {
        const userResult = await db.collection(collections.users).doc(order.userId).get();
        const userDocument = getDocumentId(userResult?.data || {}) ? userResult.data : null;

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
            biz_id: order.id,
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

      await db.collection(collections.shopOrders).doc(orderId).update(updatePayload);
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

  static async getDashboardData() {
    try {
      await ensureAnonymousLogin();
      const [usersResult, tagsResult, categoriesResult, userTagsResult] = await Promise.all([
        db.collection(collections.users).limit(1000).get(),
        db.collection(collections.tags).limit(1000).get(),
        db.collection(collections.tagCategories).limit(1000).get(),
        db.collection(collections.userTags).limit(5000).get()
      ]);

      return attachTagsToUsers(
        getDocuments(usersResult, collections.users),
        getDocuments(tagsResult, collections.tags),
        getDocuments(categoriesResult, collections.tagCategories),
        getDocuments(userTagsResult, collections.userTags)
      );
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw error;
    }
  }
}

export default DatabaseService;
