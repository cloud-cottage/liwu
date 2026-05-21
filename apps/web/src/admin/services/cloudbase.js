import cloudbase from '@cloudbase/js-sdk';
import { createAuthService, readSession } from '@liwu/auth';
import { DATABASE_CONFIG } from '../config/database.js';

const { cloudbase: { env, region, publishableKey, wechatProviderId }, collections } = DATABASE_CONFIG;
const PENDING_INVITE_STORAGE_KEY = 'liwu_pending_invite_code';
const PENDING_AUTH_PHONE_STORAGE_KEY = 'liwu_pending_auth_phone';
const AWARENESS_AUTHOR_KEY_STORAGE_KEY = 'liwu_awareness_author_key';
const REWARD_SETTINGS_KEY = 'meditation_rewards';
const AWARENESS_TAG_SETTINGS_KEY = 'awareness_tag_settings';
const MAX_WEALTH_HISTORY_ITEMS = 50;
const DEFAULT_WECHAT_PROVIDER_ID = wechatProviderId || 'wx_open';
const CLOUDBASE_PROXY_PATH = '/api/cloudbase-proxy';
const CLOUDBASE_PROXY_TRACE_KEY = '__liwuCloudBaseProxyTrace';

const isLocalDevHost = (hostname = '') => (
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '0.0.0.0'
);

const shouldUseCloudBaseProxy = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.hostname === 'liwu.yunduojihua.com' || isLocalDevHost(window.location.hostname);
};

const isCloudBaseApiUrl = (value = '') => {
  try {
    const nextUrl = new URL(String(value));
    return (
      nextUrl.hostname.endsWith('.tcb-api.tencentcloudapi.com') ||
      nextUrl.hostname.endsWith('.myqcloud.com') ||
      nextUrl.hostname.endsWith('.qcloud.la')
    );
  } catch {
    return false;
  }
};

const buildProxyRequestId = () => `cbreq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const rememberProxyTrace = (trace = {}) => {
  if (typeof window === 'undefined') {
    return;
  }

  window[CLOUDBASE_PROXY_TRACE_KEY] = {
    ...trace,
    recordedAt: Date.now()
  };
};

export const getLatestCloudBaseProxyTrace = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const trace = window[CLOUDBASE_PROXY_TRACE_KEY] || null;
  if (!trace?.requestId) {
    return null;
  }

  if (Date.now() - Number(trace.recordedAt || 0) > 2 * 60 * 1000) {
    return null;
  }

  return trace;
};

const toProxyUrl = (targetUrl, requestId) => `${CLOUDBASE_PROXY_PATH}?target=${encodeURIComponent(targetUrl)}${requestId ? `&requestId=${encodeURIComponent(requestId)}` : ''}`;

const installCloudBaseRequestProxy = () => {
  if (typeof window === 'undefined' || !shouldUseCloudBaseProxy() || window.__liwuCloudBaseProxyInstalled) {
    return;
  }

  const originalOpen = window.XMLHttpRequest.prototype.open;
  const originalSend = window.XMLHttpRequest.prototype.send;
  const originalFetch = window.fetch.bind(window);

  window.XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
    if (typeof url === 'string' && isCloudBaseApiUrl(url)) {
      const requestId = buildProxyRequestId();
      this.__liwuCloudBaseRequestId = requestId;
      this.__liwuCloudBaseTarget = url;
      rememberProxyTrace({ requestId, target: url, stage: 'request_started', transport: 'xhr' });
      const nextUrl = toProxyUrl(url, requestId);
      return originalOpen.call(this, method, nextUrl, ...rest);
    }

    const nextUrl = url;
    return originalOpen.call(this, method, nextUrl, ...rest);
  };

  window.XMLHttpRequest.prototype.send = function patchedSend(...args) {
    if (this.__liwuCloudBaseRequestId) {
      this.addEventListener('loadend', () => {
        rememberProxyTrace({
          requestId: this.__liwuCloudBaseRequestId,
          target: this.__liwuCloudBaseTarget || '',
          stage: this.status >= 400 ? 'response_error' : 'response_finished',
          transport: 'xhr',
          status: this.status
        });
      }, { once: true });
    }

    return originalSend.apply(this, args);
  };

  window.fetch = function patchedFetch(input, init) {
    const rawUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input?.url;

    if (!rawUrl || !isCloudBaseApiUrl(rawUrl)) {
      return originalFetch(input, init);
    }

    const requestId = buildProxyRequestId();
    rememberProxyTrace({ requestId, target: rawUrl, stage: 'request_started', transport: 'fetch' });

    if (typeof input === 'string' || input instanceof URL) {
      return originalFetch(toProxyUrl(rawUrl, requestId), init).then((response) => {
        rememberProxyTrace({
          requestId,
          target: rawUrl,
          stage: response.ok ? 'response_finished' : 'response_error',
          transport: 'fetch',
          status: response.status,
          proxyRequestId: response.headers.get('x-liwu-proxy-request-id') || requestId
        });
        return response;
      });
    }

    return originalFetch(new Request(toProxyUrl(rawUrl, requestId), input), init).then((response) => {
      rememberProxyTrace({
        requestId,
        target: rawUrl,
        stage: response.ok ? 'response_finished' : 'response_error',
        transport: 'fetch',
        status: response.status,
        proxyRequestId: response.headers.get('x-liwu-proxy-request-id') || requestId
      });
      return response;
    });
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

const removeLocalStorageByPrefix = (prefix = '') => {
  if (typeof window === 'undefined' || !prefix) {
    return;
  }

  const keysToRemove = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    window.localStorage.removeItem(key);
  });
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
    timestamp: getRecordTimestamp(record)
  };
};

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
      lastUsedAt: record.timestamp,
      lastUserName: record.userName || '匿名用户',
      description: tagSettingsByKey[record.tagKey]?.description || ''
    };

    existingTag[countField] += 1;

    if (new Date(record.timestamp || 0).getTime() >= new Date(existingTag.lastUsedAt || 0).getTime()) {
      existingTag.lastUsedAt = record.timestamp;
      existingTag.lastUserName = record.userName || '匿名用户';
    }

    existingTag.description = tagSettingsByKey[record.tagKey]?.description || '';

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
      tagsByKey: document?.tags_by_key || document?.tagsByKey || {}
    };
  } catch (error) {
    console.error('获取觉察标签配置失败:', error);
    return { tagsByKey: {} };
  }
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
  const liwuSession = readSession();
  if (liwuSession?.phone) {
    return {
      hasSession: true,
      authUid: liwuSession.authUid || buildPhoneAuthUid(liwuSession.phone),
      phoneNumber: liwuSession.phone,
      displayName: liwuSession.displayName || '',
      provider: 'phone',
      loginMethod: 'phone',
      isAnonymous: false,
      isAuthenticated: true,
      isMockSession: false
    };
  }

  let currentUser = await resolveCurrentUser().catch(() => null);
  let session = await resolveCurrentSession();

  if (!currentUser && !session && allowAnonymous) {
    await ensureAnonymousLogin();
    currentUser = await resolveCurrentUser().catch(() => null);
    session = await resolveCurrentSession();
  }

  return normalizeAuthStatus({ session, currentUser });
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
    const { refresh = false } = options;

    if (!refresh && currentProfileCache) {
      return currentProfileCache;
    }

    if (!refresh && currentProfilePromise) {
      return currentProfilePromise;
    }

    currentProfilePromise = (async () => {
      const session = readSession();
      if (!session?.phone) {
        clearCurrentProfileCache();
        return null;
      }

      await ensureAnonymousLogin();

      if (session.userId) {
        const docResult = await db.collection(collections.users).doc(session.userId).get().catch(() => ({ data: [] }));
        const document = getFirstDocument(docResult, collections.users);
        if (document) {
          const nowIso = new Date().toISOString();
          await db.collection(collections.users).doc(session.userId).update({
            last_active: nowIso,
            updated_at: new Date()
          }).catch(() => {});

          const profile = normalizeCurrentUserProfile({ ...document, last_active: nowIso, _id: session.userId });
          return updateCurrentProfileCache(profile);
        }
      }

      const phoneResult = await db.collection(collections.users).where({ phone: session.phone }).limit(10).get();
      const phoneDocs = getResponseData(phoneResult, collections.users);
      if (phoneDocs.length > 0) {
        const userDoc = phoneDocs.length === 1
          ? phoneDocs[0]
          : phoneDocs.filter((d) => Number(d.uid) > 0).sort((a, b) => (Number(a.uid) || Infinity) - (Number(b.uid) || Infinity))[0] || phoneDocs[0];
        const docId = getDocumentId(userDoc);
        const nowIso = new Date().toISOString();
        await db.collection(collections.users).doc(docId).update({
          last_active: nowIso,
          updated_at: new Date()
        }).catch(() => {});

        const profile = normalizeCurrentUserProfile({ ...userDoc, last_active: nowIso, _id: docId });
        return updateCurrentProfileCache(profile);
      }

      clearCurrentProfileCache();
      return null;
    })().finally(() => {
      currentProfilePromise = null;
    });

    return currentProfilePromise;
  },

  async getCurrentProfile(options = {}) {
    return this.ensureCurrentProfile(options);
  },

  async updateCurrentProfile(profilePatch) {
    const currentProfile = await this.ensureCurrentProfile();
    if (!currentProfile) {
      return null;
    }
    const updatePayload = {
      ...profilePatch,
      updated_at: new Date()
    };

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
    return settings.tagsByKey?.[tagKey] || {};
  },

  async addRecord(content, options = {}) {
    try {
      const trimmedContent = content.trim();
      const awarenessIdentity = await resolveAwarenessIdentity();
      const accessType = normalizeAccessType(options.accessType || 'public');

      if (!trimmedContent) {
        throw new Error('请输入标签内容');
      }

      if (trimmedContent.length > 6) {
        throw new Error('标签长度不能超过 6 个字符');
      }

      if (accessType === 'student' && !awarenessIdentity.isStudent) {
        throw new Error('学员觉察标签仅学员可发布');
      }

      const nowIso = new Date().toISOString();
      const basePayload = {
        author_key: awarenessIdentity.authorKey,
        user_id: awarenessIdentity.userId,
        auth_uid: awarenessIdentity.authUid,
        user_name: awarenessIdentity.userName,
        content: trimmedContent,
        access_type: accessType,
        tag_key: `${trimmedContent}::${accessType}`,
        timestamp: nowIso,
        created_at_client: nowIso
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

      return {
        success: true,
        id: result.id,
        record: normalizeAwarenessRecord({
          ...basePayload,
          _id: result.id
        })
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
      }
    }

    return {
      rewarded: true,
      rewardAmount: normalizedAmount,
      repeatedRewardBlocked: false,
      inviterBonusAmount,
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

const _liwuAuthService = createAuthService({ db, auth, collections: { users: collections.users } });

export const authService = {
  async getAuthStatus() {
    return _liwuAuthService.getAuthStatus();
  },

  async loginAnonymously() {
    try {
      await ensureAnonymousLogin();
      return { success: true, authStatus: await _liwuAuthService.getAuthStatus() };
    } catch (error) {
      return { success: false, error };
    }
  },

  async requestPhoneOtp(phone) {
    return _liwuAuthService.requestOtp(phone);
  },

  async verifyPhoneOtp({ phone, code }) {
    const result = await _liwuAuthService.verifyOtp(phone, code);
    clearCurrentProfileCache();
    return result;
  },

  hasOAuthRedirectParams() {
    if (typeof window === 'undefined') return false;
    const searchParams = new URLSearchParams(window.location.search);
    return Boolean(searchParams.get('code') && searchParams.get('state'));
  },

  async signOut() {
    _liwuAuthService.logout();
    clearCurrentProfileCache();
    return { success: true };
  },

  getCurrentUser() {
    return auth.currentUser;
  },

  async getCurrentSession() {
    return _liwuAuthService.getSession();
  },

  onSessionChange(callback) {
    return _liwuAuthService.onSessionChange(callback);
  }
};

export { db, auth };
export default app;
