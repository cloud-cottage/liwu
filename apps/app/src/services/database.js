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

const normalizeUser = (user) => ({
  id: getDocumentId(user),
  uid: Number(user.uid || 0),
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

const normalizeAwarenessTagSettings = (settings = {}) => ({
  documentId: getDocumentId(settings) || null,
  tagsByKey: settings.tags_by_key || settings.tagsByKey || {},
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
  delete rest.isStudent;
  delete rest.inviteCode;
  delete rest.inviterUserId;
  delete rest.balance;
  delete rest.created_at;
  delete rest.updated_at;

  return {
    ...rest,
    ...(userData.uid !== undefined ? { uid: Math.max(1, Number(userData.uid) || 1) } : {}),
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
  tags_by_key: settingsData.tagsByKey || {}
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
          lastUsedAt: timestamp,
          lastUserName: record.user_name || record.userName || '匿名用户',
          description: settings.tagsByKey?.[tagKey]?.description || ''
        };

        existingTag.totalCount += 1;

        if (new Date(timestamp || 0).getTime() >= new Date(existingTag.lastUsedAt || 0).getTime()) {
          existingTag.lastUsedAt = timestamp;
          existingTag.lastUserName = record.user_name || record.userName || '匿名用户';
        }

        existingTag.description = settings.tagsByKey?.[tagKey]?.description || '';
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
