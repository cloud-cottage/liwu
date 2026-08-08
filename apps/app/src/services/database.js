import { DATABASE_CONFIG } from '../config/database.js';
import app, { db, ensureAnonymousLogin, proxyCloudBaseMediaUrl } from './cloudbase.js';
import {
  normalizeAwarenessTagSettings,
  toAwarenessTagSettingsPayload
} from '@liwu/shared-utils/awareness-tag-settings-database.js';
import {
  attachTagsToUsers,
  normalizeCategory,
  normalizeTag,
  normalizeUser,
  toCategoryPayload,
  toTagPayload,
  toUserPayload
} from '@liwu/shared-utils/admin-database-user-helpers.js';
import {
  getDocumentId,
  getDocuments,
  isMissingCollectionIssue
} from '@liwu/shared-utils/cloudbase-document-helpers.js';
import { createBuildTempUrlMap } from '@liwu/shared-utils/database-temp-url.js';
import {
  normalizeMeditationAudioLibrary,
  normalizeMeditationCalendar,
  normalizeMeditationCompositionSettings,
  normalizeMeditationLibrary
} from '@liwu/shared-utils/meditation-database-normalizers.js';
import {
  DEFAULT_MEDITATION_AUDIO_LIBRARY,
  DEFAULT_MEDITATION_CALENDAR,
  DEFAULT_MEDITATION_COMPOSITION_SETTINGS,
  DEFAULT_MEDITATION_LIBRARY,
  getDefaultMeditationAudioGroupId,
  getDefaultMeditationAudioGroups,
  MEDITATION_AUDIO_GROUP_TEMPLATES,
  MEDITATION_AUDIO_LIBRARY_KEY,
  MEDITATION_AUDIO_LIBRARY_TYPES,
  MEDITATION_CALENDAR_KEY,
  MEDITATION_COMPOSITION_SETTINGS_KEY,
  MEDITATION_LIBRARY_KEY
} from '@liwu/shared-utils/meditation-audio-library.js';
import {
  DEFAULT_MEDITATION_SETTINGS,
  MEDITATION_SETTINGS_KEY,
  normalizeMeditationSettings,
  toMeditationSettingsPayload
} from '@liwu/shared-utils/meditation-reward-settings.js';

const { collections } = DATABASE_CONFIG;
const AWARENESS_TAG_SETTINGS_KEY = 'awareness_tag_settings';
const MEDITATION_CALENDAR_OPTIONS = { arraySlots: true };
const buildTempUrlMap = createBuildTempUrlMap(app);

export {
  DEFAULT_MEDITATION_AUDIO_LIBRARY,
  DEFAULT_MEDITATION_CALENDAR,
  DEFAULT_MEDITATION_COMPOSITION_SETTINGS,
  DEFAULT_MEDITATION_LIBRARY,
  DEFAULT_MEDITATION_SETTINGS,
  getDefaultMeditationAudioGroupId,
  getDefaultMeditationAudioGroups,
  MEDITATION_AUDIO_GROUP_TEMPLATES,
  MEDITATION_AUDIO_LIBRARY_TYPES
};

export const DEFAULT_AWARENESS_TAG_SETTINGS = {
  documentId: null,
  tagsByKey: {},
  missingCollection: false
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
        ...toAwarenessTagSettingsPayload(settingsData, AWARENESS_TAG_SETTINGS_KEY),
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

      const documents = getDocuments(result, collections.appSettings);
      const document = documents[0];
      if (!document) {
        return { ...DEFAULT_MEDITATION_AUDIO_LIBRARY };
      }

      const normalizedLibrary = normalizeMeditationAudioLibrary(document);
      const tempUrlMap = await buildTempUrlMap(normalizedLibrary.items.map((item) => item.fileId));

      return {
        ...normalizedLibrary,
        items: normalizedLibrary.items.map((item) => ({
          ...item,
          audioUrl: proxyCloudBaseMediaUrl(tempUrlMap.get(item.fileId) || item.audioUrl || '')
        }))
      };
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return { ...DEFAULT_MEDITATION_AUDIO_LIBRARY, missingCollection: true };
      }

      console.error('Error fetching meditation audio library:', error);
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

      const documents = getDocuments(result, collections.appSettings);
      const document = documents[0];
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

      const documents = getDocuments(result, collections.appSettings);
      const document = documents[0];
      if (!document) {
        return { ...DEFAULT_MEDITATION_CALENDAR };
      }

      return normalizeMeditationCalendar(document, MEDITATION_CALENDAR_OPTIONS);
    } catch (error) {
      if (isMissingCollectionIssue(error)) {
        return { ...DEFAULT_MEDITATION_CALENDAR, missingCollection: true };
      }

      console.error('Error fetching meditation calendar:', error);
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

      const documents = getDocuments(result, collections.appSettings);
      const document = documents[0];
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

  static async getAudioTempUrl(fileId = '') {
    if (!fileId) {
      return '';
    }

    try {
      const tempUrlMap = await buildTempUrlMap([fileId]);
      return proxyCloudBaseMediaUrl(tempUrlMap.get(fileId) || '');
    } catch (error) {
      console.error('Error fetching audio temp url:', error);
      return '';
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
