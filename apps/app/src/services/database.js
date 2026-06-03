import { DATABASE_CONFIG } from '../config/database.js';
import app, { db, ensureAnonymousLogin, proxyCloudBaseMediaUrl } from './cloudbase.js';

const { collections } = DATABASE_CONFIG;
const MEDITATION_SETTINGS_KEY = 'meditation_rewards';
const MEDITATION_AUDIO_LIBRARY_KEY = 'meditation_audio_library';
const MEDITATION_COMPOSITION_SETTINGS_KEY = 'meditation_composition_settings';
const MEDITATION_CALENDAR_KEY = 'meditation_calendar';
const MEDITATION_LIBRARY_KEY = 'meditation_library';
const AWARENESS_TAG_SETTINGS_KEY = 'awareness_tag_settings';

export const MEDITATION_AUDIO_LIBRARY_TYPES = ['bowl', 'greeting', 'nature', 'breath', 'quote', 'goodbye'];
export const MEDITATION_AUDIO_GROUP_TEMPLATES = Object.freeze({
  bowl: Object.freeze([
    Object.freeze({ id: 'bowl-default', key: 'default', name: '默认音频组' })
  ]),
  greeting: Object.freeze([
    Object.freeze({ id: 'greeting-self-intro', key: 'self_intro', name: '自我介绍' }),
    Object.freeze({ id: 'greeting-settling', key: 'settling', name: '居心地' }),
    Object.freeze({ id: 'greeting-posture', key: 'posture', name: '坐姿' }),
    Object.freeze({ id: 'greeting-breath-guidance', key: 'breath_guidance', name: '呼吸引导' })
  ]),
  nature: Object.freeze([
    Object.freeze({ id: 'nature-default', key: 'default', name: '默认音频组' })
  ]),
  breath: Object.freeze([
    Object.freeze({ id: 'breath-opening', key: 'opening', name: '呼吸开始' }),
    Object.freeze({ id: 'breath-main', key: 'main', name: '呼吸正文' })
  ]),
  quote: Object.freeze([
    Object.freeze({ id: 'quote-logic', key: 'logic', name: '逻辑' }),
    Object.freeze({ id: 'quote-reinforcement', key: 'reinforcement', name: '强化' })
  ]),
  goodbye: Object.freeze([
    Object.freeze({ id: 'goodbye-default', key: 'default', name: '默认音频组' })
  ])
});

export const getDefaultMeditationAudioGroups = () => MEDITATION_AUDIO_LIBRARY_TYPES.flatMap((type) => (
  (MEDITATION_AUDIO_GROUP_TEMPLATES[type] || []).map((group, index) => ({
    ...group,
    type,
    sortOrder: index
  }))
));

export const getDefaultMeditationAudioGroupId = (type = 'bowl') => {
  const groups = MEDITATION_AUDIO_GROUP_TEMPLATES[type] || [];
  return groups[0]?.id || '';
};

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

export const DEFAULT_MEDITATION_AUDIO_LIBRARY = {
  documentId: null,
  groups: getDefaultMeditationAudioGroups(),
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

const normalizeMeditationAudioItem = (item = {}) => ({
  id: item._id || item.id || '',
  type: item.type || 'bowl',
  groupId: item.group_id || item.groupId || '',
  title: item.title || '',
  fileId: item.file_id || item.fileId || '',
  audioUrl: item.audio_url || item.audioUrl || '',
  duration: Number(item.duration ?? 0),
  ttsText: item.tts_text || item.ttsText || '',
  isSSML: Boolean(item.is_ssml ?? item.isSSML ?? false),
  createdAt: item.created_at || item.createdAt || ''
});

const normalizeMeditationAudioGroup = (group = {}, fallbackType = 'bowl', fallbackIndex = 0) => {
  const nextType = group.type || fallbackType || 'bowl';
  const templateGroups = MEDITATION_AUDIO_GROUP_TEMPLATES[nextType] || [];
  const templateMatch = templateGroups.find((templateGroup) => templateGroup.id === group.id || templateGroup.key === group.key);

  return {
    id: group.id || templateMatch?.id || `${nextType}-${fallbackIndex}`,
    type: nextType,
    key: group.key || templateMatch?.key || '',
    name: group.name || templateMatch?.name || '默认音频组',
    sortOrder: Number(group.sort_order ?? group.sortOrder ?? fallbackIndex)
  };
};

const buildNormalizedMeditationAudioGroups = (groups = []) => {
  const normalizedGroups = [];
  const seenGroupIds = new Set();

  MEDITATION_AUDIO_LIBRARY_TYPES.forEach((type) => {
    const rawGroupsForType = Array.isArray(groups)
      ? groups.filter((group) => (group.type || type) === type)
      : [];

    const sourceGroups = rawGroupsForType.length > 0
      ? rawGroupsForType
      : (MEDITATION_AUDIO_GROUP_TEMPLATES[type] || []).map((group) => ({ ...group, type }));

    sourceGroups
      .map((group, index) => normalizeMeditationAudioGroup(group, type, index))
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .forEach((group, index) => {
        const normalizedGroup = { ...group, sortOrder: index };
        if (!seenGroupIds.has(normalizedGroup.id)) {
          seenGroupIds.add(normalizedGroup.id);
          normalizedGroups.push(normalizedGroup);
        }
      });
  });

  return normalizedGroups;
};

const resolveMeditationAudioItemGroupId = (item = {}, groups = []) => {
  const itemType = item.type || 'bowl';
  const requestedGroupId = item.groupId || item.group_id || '';

  if (requestedGroupId && groups.some((group) => group.id === requestedGroupId && group.type === itemType)) {
    return requestedGroupId;
  }

  return groups.find((group) => group.type === itemType)?.id || getDefaultMeditationAudioGroupId(itemType);
};

const normalizeMeditationAudioLibrary = (doc = {}) => {
  const groups = buildNormalizedMeditationAudioGroups(doc.groups);

  return {
    documentId: getDocumentId(doc) || null,
    groups,
    items: Array.isArray(doc.items)
      ? doc.items.map((item) => {
        const normalizedItem = normalizeMeditationAudioItem(item);
        return {
          ...normalizedItem,
          groupId: resolveMeditationAudioItemGroupId(normalizedItem, groups)
        };
      })
      : [],
    missingCollection: false
  };
};

const normalizeMeditationSegment = (seg = {}) => ({
  id: seg.id || '',
  type: seg.type || 'bowl',
  groupId: seg.group_id || seg.groupId || getDefaultMeditationAudioGroupId(seg.type || 'bowl'),
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
  morning: Array.isArray(day.morning) ? day.morning : [],
  noon: Array.isArray(day.noon) ? day.noon : [],
  afternoon: Array.isArray(day.afternoon) ? day.afternoon : [],
  evening: Array.isArray(day.evening) ? day.evening : []
});

const normalizeMeditationCalendar = (doc = {}) => ({
  documentId: getDocumentId(doc) || null,
  days: Object.fromEntries(
    Object.entries(doc.days || {}).map(([dateKey, day]) => [dateKey, normalizeMeditationCalendarDay(day)])
  ),
  missingCollection: false
});

const buildDefaultMeditationGroupSelections = () => Object.fromEntries(
  getDefaultMeditationAudioGroups().map((group) => [group.id, []])
);

const aggregateMeditationSectionsFromGroupSelections = (groupSelections = {}) => Object.fromEntries(
  MEDITATION_AUDIO_LIBRARY_TYPES.map((type) => {
    const groupIds = (MEDITATION_AUDIO_GROUP_TEMPLATES[type] || []).map((group) => group.id);
    return [type, groupIds.flatMap((groupId) => Array.isArray(groupSelections[groupId]) ? groupSelections[groupId] : [])];
  })
);

const normalizeMeditationGroupSelections = (groupSelections = {}, legacySections = {}) => {
  const normalizedSelections = buildDefaultMeditationGroupSelections();
  const hasExplicitGroups = groupSelections && typeof groupSelections === 'object' && Object.keys(groupSelections).length > 0;

  Object.keys(normalizedSelections).forEach((groupId) => {
    if (hasExplicitGroups && Array.isArray(groupSelections[groupId])) {
      normalizedSelections[groupId] = [...groupSelections[groupId]];
    }
  });

  if (!hasExplicitGroups) {
    MEDITATION_AUDIO_LIBRARY_TYPES.forEach((type) => {
      const defaultGroupId = getDefaultMeditationAudioGroupId(type);
      if (defaultGroupId && Array.isArray(legacySections[type])) {
        normalizedSelections[defaultGroupId] = [...legacySections[type]];
      }
    });
  }

  return normalizedSelections;
};

const normalizeMeditationLibraryItem = (item = {}) => ({
  id: item.id || '',
  name: item.name || '',
  groupSelections: normalizeMeditationGroupSelections(
    item.group_selections || item.groupSelections || item.audio_groups || item.audioGroups,
    item.sections || {}
  ),
  sections: aggregateMeditationSectionsFromGroupSelections(
    normalizeMeditationGroupSelections(
      item.group_selections || item.groupSelections || item.audio_groups || item.audioGroups,
      item.sections || {}
    )
  )
});

const normalizeMeditationLibrary = (doc = {}) => ({
  documentId: getDocumentId(doc) || null,
  meditations: Array.isArray(doc.meditations) ? doc.meditations.map(normalizeMeditationLibraryItem) : [],
  missingCollection: false
});

const buildTempUrlMap = async (fileIds = []) => {
  const normalizedFileIds = [...new Set((Array.isArray(fileIds) ? fileIds : []).filter(Boolean))];

  if (normalizedFileIds.length === 0) {
    return new Map();
  }

  const tempUrlResult = await app.getTempFileURL({ fileList: normalizedFileIds });
  return new Map(
    (tempUrlResult?.fileList || tempUrlResult?.data?.fileList || []).map((item) => [
      item.fileID || item.fileId,
      item.tempFileURL || item.download_url || item.tempFileUrl || ''
    ])
  );
};

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

      return normalizeMeditationCalendar(document);
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
