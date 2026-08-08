import cloudbase from '@cloudbase/js-sdk';
import { createAuthService, readSession } from '@liwu/auth';
import { DATABASE_CONFIG } from '../config/database.js';
import { createAuthResolvers, createEnsureAnonymousLogin } from '@liwu/shared-utils/cloudbase-auth-runtime.js';
import {
  createPendingAuthPhoneHelpers,
  createPendingInviteHelpers,
  getOrCreateAwarenessAuthorKey,
  readLocalStorageJSON,
  readLocalStorageValue,
  readSessionStorageJSON,
  removeLocalStorageByPrefix,
  writeLocalStorageJSON,
  writeLocalStorageValue,
  writeSessionStorageJSON
} from '@liwu/shared-utils/cloudbase-browser-storage.js';
import {
  getDocumentId,
  getFirstDocument,
  getResponseData,
  isMissingCollectionIssue,
  isMissingCollectionResponse
} from '@liwu/shared-utils/cloudbase-document-helpers.js';
import {
  createLoadMergedUserDocument,
  createSaveCurrentUserProfileBundle
} from '@liwu/shared-utils/user-bundle.js';
import { createCloudBaseProxyRuntime } from '@liwu/shared-utils/cloudbase-proxy.js';
import { createCloudBaseSdk } from '@liwu/shared-utils/cloudbase-sdk-factory.js';
import {
  buildShareLinks,
  createGetAwarenessTagSettings,
  createResolveAwarenessIdentity,
  groupAwarenessTags,
  normalizeAccessType,
  normalizeAwarenessRecord
} from '@liwu/shared-utils/cloudbase-awareness-core.js';
import { createResolveAuthStatus } from '@liwu/shared-utils/cloudbase-auth-status.js';
import { normalizeCurrentUserProfile } from '@liwu/shared-utils/cloudbase-user-profile.js';
import { clampInviterRewardRate } from '@liwu/shared-utils/cloudbase-user-identity.js';
import {
  MAX_WEALTH_HISTORY_ITEMS,
  normalizeWealthEntry
} from '@liwu/shared-utils/cloudbase-wealth-snapshot.js';
import { MEDITATION_SETTINGS_KEY } from '@liwu/shared-utils/meditation-reward-settings.js';

const { cloudbase: { env, region, publishableKey, wechatProviderId }, collections } = DATABASE_CONFIG;
const AWARENESS_TAG_SETTINGS_KEY = 'awareness_tag_settings';
const DEFAULT_WECHAT_PROVIDER_ID = wechatProviderId || 'wx_open';

const {
  proxyCloudBaseMediaUrl,
  installCloudBaseRequestProxy,
  getLatestCloudBaseProxyTrace
} = createCloudBaseProxyRuntime({ enableTrace: true });

export { getLatestCloudBaseProxyTrace, proxyCloudBaseMediaUrl };

const shouldInstallProxy = typeof window === 'undefined' || window.location.hostname !== 'localhost' || typeof __DEV_PROXY__ !== 'undefined';
if (shouldInstallProxy) {
  installCloudBaseRequestProxy();
}

const { app, db, auth, command: _ } = createCloudBaseSdk(cloudbase, { env, region, publishableKey });

let currentProfilePromise = null;
let currentProfileCache = null;

const { resolveCurrentUser, resolveCurrentSession } = createAuthResolvers(auth);
const ensureAnonymousLogin = createEnsureAnonymousLogin({ auth, resolveCurrentUser });
const { rememberPendingInviteCode, clearPendingInviteCode } = createPendingInviteHelpers({
  queryKeys: ['invite']
});
const { rememberPendingAuthPhone, clearPendingAuthPhone } = createPendingAuthPhoneHelpers();

const resolveAuthStatus = createResolveAuthStatus({
  readSession,
  resolveCurrentUser,
  resolveCurrentSession,
  ensureAnonymousLogin
});
const getAwarenessTagSettings = createGetAwarenessTagSettings({
  db,
  collections,
  ensureAnonymousLogin,
  getFirstDocument,
  isMissingCollectionResponse,
  settingsKey: AWARENESS_TAG_SETTINGS_KEY
});
const loadMergedUserDocument = createLoadMergedUserDocument({
  db,
  collections,
  getFirstDocument,
  isMissingCollectionIssue
});
const saveCurrentUserProfileBundle = createSaveCurrentUserProfileBundle({
  db,
  collections,
  getFirstDocument,
  isMissingCollectionIssue,
  dualWriteLegacyUsers: true
});

const resolveCachedUserProfile = async (userId, lastActiveIso) => {
  const mergedDocument = await loadMergedUserDocument(userId);
  if (!mergedDocument) {
    return null;
  }

  return normalizeCurrentUserProfile({
    ...mergedDocument,
    last_active: lastActiveIso || mergedDocument.last_active || mergedDocument.lastActive || '',
    _id: userId
  });
};

const clearCurrentProfileCache = () => {
  currentProfileCache = null;
  currentProfilePromise = null;
};

const updateCurrentProfileCache = (nextProfile) => {
  currentProfileCache = nextProfile;
  return currentProfileCache;
};

export { ensureAnonymousLogin };

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
        const nowIso = new Date().toISOString();
        await db.collection(collections.users).doc(session.userId).update({
          last_active: nowIso,
          updated_at: new Date()
        }).catch(() => {});

        const profile = await resolveCachedUserProfile(session.userId, nowIso);
        if (profile) {
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

        const profile = await resolveCachedUserProfile(docId, nowIso);
        if (profile) {
          return updateCurrentProfileCache(profile);
        }
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

    const { profile } = await saveCurrentUserProfileBundle(currentProfile.id, updatePayload);
    return updateCurrentProfileCache(profile);
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

const resolveAwarenessIdentity = createResolveAwarenessIdentity({
  getOrCreateAwarenessAuthorKey,
  resolveAuthStatus,
  getCurrentProfile: (options) => userProfileService.getCurrentProfile(options)
});

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
        .where({ key: MEDITATION_SETTINGS_KEY })
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
