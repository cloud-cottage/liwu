import cloudbase from '@cloudbase/js-sdk';
import { DATABASE_CONFIG } from '../config/database.js';

const { cloudbase: { env, region, publishableKey, wechatProviderId }, collections } = DATABASE_CONFIG;
const PENDING_INVITE_STORAGE_KEY = 'liwu_pending_invite_code';
const PENDING_AUTH_PHONE_STORAGE_KEY = 'liwu_pending_auth_phone';
const MOCK_PHONE_OTP_STORAGE_KEY = 'liwu_mock_phone_otp_session';
const MOCK_PHONE_AUTH_STORAGE_KEY = 'liwu_mock_phone_auth_session';
const REWARD_SETTINGS_KEY = 'meditation_rewards';
const MAX_WEALTH_HISTORY_ITEMS = 50;
const DEFAULT_WECHAT_PROVIDER_ID = wechatProviderId || 'wx_open';
const MOCK_PHONE_OTP_CODE = '1234';

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

const buildDefaultUserName = (authUid = '') => `用户${(authUid || '0000').slice(-4)}`;

const generateInviteCode = (authUid = '') =>
  `LW${(authUid || '000000').slice(-6).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;

const normalizeAccessType = (value) => (value === 'student' ? 'student' : 'public');

const normalizePhone = (value = '') => String(value || '').trim().replace(/\s+/g, '');

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
  authUid: document.auth_uid || document.authUid || '',
  name: document.name || buildDefaultUserName(document.auth_uid || document.authUid || ''),
  email: document.email || '',
  phone: document.phone || '',
  status: document.status || 'active',
  level: Number(document.level ?? 1),
  experience: Number(document.experience ?? 0),
  isStudent: Boolean(document.is_student ?? document.isStudent),
  inviteCode: document.invite_code || document.inviteCode || '',
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
    userId: record.user_id || record.userId || '',
    authUid: record.auth_uid || record.authUid || '',
    userName: record.user_name || record.userName || '匿名用户',
    content,
    accessType,
    tagKey: record.tag_key || `${content}::${accessType}`,
    timestamp: getRecordTimestamp(record)
  };
};

const groupAwarenessTags = (records, countField) => {
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
      lastUsedAt: record.timestamp
    };

    existingTag[countField] += 1;
    existingTag.lastUsedAt =
      new Date(record.timestamp || 0).getTime() > new Date(existingTag.lastUsedAt || 0).getTime()
        ? record.timestamp
        : existingTag.lastUsedAt;

    tagMap.set(record.tagKey, existingTag);
  });

  return Array.from(tagMap.values()).sort((left, right) => {
    if (right[countField] !== left[countField]) {
      return right[countField] - left[countField];
    }

    return new Date(right.lastUsedAt || 0).getTime() - new Date(left.lastUsedAt || 0).getTime();
  });
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

  if (mockPhoneAuthSession.authUid && baseStatus.authUid && mockPhoneAuthSession.authUid !== baseStatus.authUid) {
    clearMockPhoneAuthSession();
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
      const nowIso = new Date().toISOString();

      if (!authUid) {
        clearCurrentProfileCache();
        return null;
      }

      const existingResult = await db.collection(collections.users).where({ auth_uid: authUid }).limit(1).get();
      const existingDocument = getFirstDocument(existingResult, collections.users);

      if (existingDocument) {
        const existingProfile = normalizeCurrentUserProfile(existingDocument);
        const updatePayload = {
          last_active: nowIso,
          updated_at: new Date()
        };

        if (authStatus.displayName && (!existingProfile.name || existingProfile.name.startsWith('用户'))) {
          updatePayload.name = authStatus.displayName;
        }

        if (authStatus.email && existingProfile.email !== authStatus.email) {
          updatePayload.email = authStatus.email;
        }

        if (authStatus.phoneNumber && existingProfile.phone !== authStatus.phoneNumber) {
          updatePayload.phone = authStatus.phoneNumber;
        }

        if (!existingProfile.inviteCode) {
          updatePayload.invite_code = generateInviteCode(authUid);
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
        const inviterResult = await db
          .collection(collections.users)
          .where({ invite_code: pendingInviteCode })
          .limit(1)
          .get();
        const inviterDocument = getFirstDocument(inviterResult, collections.users);

        if (inviterDocument && (inviterDocument.auth_uid || inviterDocument.authUid) !== authUid) {
          inviterUserId = getDocumentId(inviterDocument);
        }
      }

      const newUserPayload = {
        auth_uid: authUid,
        name: authStatus.displayName || buildDefaultUserName(authUid),
        email: authStatus.email,
        phone: authStatus.phoneNumber,
        status: 'active',
        level: 1,
        experience: 0,
        is_student: false,
        invite_code: generateInviteCode(authUid),
        inviter_user_id: inviterUserId,
        balance: 0,
        wealth_history: [],
        reward_claims: {},
        join_date: nowIso.slice(0, 10),
        last_active: nowIso,
        created_at: new Date(),
        updated_at: new Date()
      };

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

    const shareUrl = new URL('/record', window.location.origin);
    shareUrl.searchParams.set('invite', currentProfile.inviteCode);

    if (tagContent) {
      shareUrl.searchParams.set('tag', tagContent.trim().slice(0, 6));
    }

    return shareUrl.toString();
  }
};

export const awarenessService = {
  async addRecord(content, options = {}) {
    try {
      const trimmedContent = content.trim();
      const currentProfile = await userProfileService.ensureCurrentProfile();
      const accessType = normalizeAccessType(options.accessType || 'public');

      if (!trimmedContent) {
        throw new Error('请输入标签内容');
      }

      if (trimmedContent.length > 6) {
        throw new Error('标签长度不能超过 6 个字符');
      }

      if (accessType === 'student' && !currentProfile.isStudent) {
        throw new Error('学员觉察标签仅学员可发布');
      }

      const nowIso = new Date().toISOString();
      const payload = {
        user_id: currentProfile.id,
        auth_uid: currentProfile.authUid,
        user_name: currentProfile.name,
        content: trimmedContent,
        access_type: accessType,
        tag_key: `${trimmedContent}::${accessType}`,
        timestamp: nowIso,
        created_at_client: nowIso,
        createdAt: db.serverDate(),
        created_at: db.serverDate()
      };

      const result = await db.collection(collections.awarenessRecords).add(payload);

      if (!result?.id) {
        throw new Error(result?.message || '添加觉察记录失败');
      }

      return {
        success: true,
        id: result.id,
        record: normalizeAwarenessRecord({
          ...payload,
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
      const currentProfile = await userProfileService.ensureCurrentProfile();
      const result = await db
        .collection(collections.awarenessRecords)
        .where({ user_id: currentProfile.id })
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      return {
        success: true,
        data: getResponseData(result, collections.awarenessRecords).map(normalizeAwarenessRecord)
      };
    } catch (error) {
      console.error('获取用户觉察记录失败:', error);
      return { success: false, error };
    }
  },

  async getRecentRecords(limit = 40) {
    try {
      await userProfileService.ensureCurrentProfile();
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
      const recordsResult = await this.getUserRecords();
      if (!recordsResult.success) {
        return { success: false, error: recordsResult.error };
      }

      return {
        success: true,
        data: groupAwarenessTags(recordsResult.data, 'count')
      };
    } catch (error) {
      console.error('获取用户标签统计失败:', error);
      return { success: false, error };
    }
  },

  async getPopularTags(limit = 16) {
    try {
      const recentRecordsResult = await this.getRecentRecords(1000);
      if (!recentRecordsResult.success) {
        return { success: false, error: recentRecordsResult.error };
      }

      return {
        success: true,
        data: groupAwarenessTags(recentRecordsResult.data, 'totalCount').slice(0, limit)
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

    await ensureAnonymousLogin();
    clearPendingAuthPhone();
    clearMockPhoneOtpSession();

    clearCurrentProfileCache();
    let profile = await userProfileService.ensureCurrentProfile({ refresh: true, allowAnonymous: false });
    if (profile?.phone !== normalizedPhone) {
      profile = await userProfileService.updateCurrentProfile({ phone: normalizedPhone });
    }

    writeMockPhoneAuthSession({
      authUid: profile?.authUid || '',
      phoneNumber: normalizedPhone,
      displayName: profile?.name || buildDefaultUserName(profile?.authUid || ''),
      loginMethod: 'phone',
      signedInAt: new Date().toISOString()
    });

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
