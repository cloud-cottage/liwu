/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useWealth } from './WealthContext.jsx';
import { awarenessService, authService, badgeService, userProfileService } from '../services/cloudbase';

const CloudAwarenessContext = createContext();
const PUBLIC_CACHE_KEY = 'liwu_awareness_public_cache_v1';
const USER_CACHE_PREFIX = 'liwu_awareness_user_cache_v1';
const PUBLIC_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_RECENT_RECORDS = 40;
const MAX_POPULAR_TAGS = 16;

const readCache = (key) => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cachedValue = window.localStorage.getItem(key);
    return cachedValue ? JSON.parse(cachedValue) : null;
  } catch (error) {
    console.error('读取觉察缓存失败:', error);
    return null;
  }
};

const writeCache = (key, value) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('写入觉察缓存失败:', error);
  }
};

const isExpired = (fetchedAt, ttl) => {
  if (!fetchedAt) {
    return true;
  }

  return Date.now() - new Date(fetchedAt).getTime() > ttl;
};

const upsertTagCount = (tags, record, countField) => {
  const nextTags = [...tags];
  const matchedIndex = nextTags.findIndex((item) => item.key === record.tagKey);

  if (matchedIndex >= 0) {
    nextTags[matchedIndex] = {
      ...nextTags[matchedIndex],
      [countField]: (nextTags[matchedIndex][countField] || 0) + 1,
      lastUsedAt: record.timestamp
    };
  } else {
    nextTags.unshift({
      key: record.tagKey,
      content: record.content,
      accessType: record.accessType,
      [countField]: 1,
      lastUsedAt: record.timestamp
    });
  }

  return nextTags
    .sort((left, right) => {
      if ((right[countField] || 0) !== (left[countField] || 0)) {
        return (right[countField] || 0) - (left[countField] || 0);
      }

      return new Date(right.lastUsedAt || 0).getTime() - new Date(left.lastUsedAt || 0).getTime();
    })
    .slice(0, countField === 'totalCount' ? MAX_POPULAR_TAGS : nextTags.length);
};

const prependRecentRecord = (records, record) => [
  record,
  ...records.filter((item) => item.id !== record.id)
].slice(0, MAX_RECENT_RECORDS);

const buildUserCacheKey = (authUid = 'guest') => `${USER_CACHE_PREFIX}:${authUid || 'guest'}`;

export const useCloudAwareness = () => useContext(CloudAwarenessContext);

export const CloudAwarenessProvider = ({ children }) => {
  const { pushRewardToast, syncWalletFromCloud } = useWealth();
  const [authStatus, setAuthStatus] = useState({
    hasSession: false,
    authUid: '',
    phoneNumber: '',
    email: '',
    displayName: '',
    provider: '',
    loginMethod: 'anonymous',
    isAnonymous: true,
    isAuthenticated: false
  });
  const [currentUser, setCurrentUser] = useState(null);
  const [userTags, setUserTags] = useState([]);
  const [popularTags, setPopularTags] = useState([]);
  const [recentRecords, setRecentRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const hydrateCaches = useCallback((authUid = 'guest') => {
    const publicCache = readCache(PUBLIC_CACHE_KEY);
    const userCache = readCache(buildUserCacheKey(authUid));

    if (publicCache?.popularTags) {
      setPopularTags(publicCache.popularTags);
    }

    if (publicCache?.recentRecords) {
      setRecentRecords(publicCache.recentRecords);
    }

    if (publicCache?.fetchedAt) {
      setLastUpdatedAt(publicCache.fetchedAt);
    }

    if (userCache?.userTags) {
      setUserTags(userCache.userTags);
    } else {
      setUserTags([]);
    }

    return {
      hasPublicCache: Boolean(publicCache),
      hasUserCache: Boolean(userCache),
      publicStale: isExpired(publicCache?.fetchedAt, PUBLIC_CACHE_TTL_MS),
      userStale: isExpired(userCache?.fetchedAt, USER_CACHE_TTL_MS)
    };
  }, []);

  const persistCaches = useCallback((nextAuthUid, nextUserTags, nextPopularTags, nextRecentRecords, fetchedAt) => {
    writeCache(PUBLIC_CACHE_KEY, {
      fetchedAt,
      popularTags: nextPopularTags,
      recentRecords: nextRecentRecords
    });

    writeCache(buildUserCacheKey(nextAuthUid), {
      fetchedAt,
      userTags: nextUserTags
    });
  }, []);

  const syncAuthState = useCallback(async ({ allowAnonymous = false } = {}) => {
    const nextAuthStatus = await authService.getAuthStatus({ allowAnonymous });
    setAuthStatus(nextAuthStatus);

    if (!nextAuthStatus.hasSession && !allowAnonymous) {
      setCurrentUser(null);
      setUserTags([]);
    }

    return nextAuthStatus;
  }, []);

  const loadData = useCallback(async ({
    silent = false,
    force = false,
    allowAnonymous = true
  } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      const nextCurrentUser = await userProfileService.getCurrentProfile({
        refresh: force,
        allowAnonymous
      });

      const nextAuthStatus = await authService.getAuthStatus({ allowAnonymous: false });
      setAuthStatus(nextAuthStatus);
      setCurrentUser(nextCurrentUser);

      if (nextCurrentUser?.id) {
        void badgeService.claimDailyCloudSign();
      }

      const cacheSummary = hydrateCaches(nextCurrentUser?.authUid || nextAuthStatus.authUid || 'guest');
      if (!force && cacheSummary.hasPublicCache && cacheSummary.hasUserCache && !cacheSummary.publicStale && !cacheSummary.userStale) {
        return;
      }

      const [userTagsResult, popularTagsResult, recentRecordsResult] = await Promise.all([
        nextCurrentUser ? awarenessService.getUserTags() : Promise.resolve({ success: true, data: [] }),
        awarenessService.getPopularTags(),
        awarenessService.getRecentRecords(MAX_RECENT_RECORDS)
      ]);

      const nextUserTags = userTagsResult.success ? userTagsResult.data : [];
      const nextPopularTags = popularTagsResult.success ? popularTagsResult.data : [];
      const nextRecentRecords = recentRecordsResult.success ? recentRecordsResult.data : [];
      const fetchedAt = new Date().toISOString();

      setUserTags(nextUserTags);
      setPopularTags(nextPopularTags);
      setRecentRecords(nextRecentRecords);
      setLastUpdatedAt(fetchedAt);

      if (nextCurrentUser?.authUid) {
        persistCaches(nextCurrentUser.authUid, nextUserTags, nextPopularTags, nextRecentRecords, fetchedAt);
      } else {
        writeCache(PUBLIC_CACHE_KEY, {
          fetchedAt,
          popularTags: nextPopularTags,
          recentRecords: nextRecentRecords
        });
      }

      const nextError =
        userTagsResult.error?.message ||
        popularTagsResult.error?.message ||
        recentRecordsResult.error?.message ||
        '';

      setError(nextError);
    } catch (loadError) {
      console.error('加载觉察数据失败:', loadError);
      setError(loadError.message || '加载觉察数据失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hydrateCaches, persistCaches]);

  useEffect(() => {
    let disposed = false;

    const initializeCloudbase = async () => {
      try {
        let cacheSummary = hydrateCaches('guest');

        if (authService.hasOAuthRedirectParams()) {
          if (!disposed) {
            setLoading(false);
          }
          return;
        }

        const currentAuthStatus = await authService.getAuthStatus({ allowAnonymous: false });
        if (currentAuthStatus.authUid) {
          cacheSummary = hydrateCaches(currentAuthStatus.authUid);
        }

        if (disposed) {
          return;
        }

        const shouldFetch =
          !cacheSummary.hasPublicCache ||
          cacheSummary.publicStale ||
          !cacheSummary.hasUserCache ||
          cacheSummary.userStale;

        await loadData({
          silent: cacheSummary.hasPublicCache,
          force: shouldFetch,
          allowAnonymous: true
        });
      } catch (initializeError) {
        console.error('初始化觉察云端失败:', initializeError);
        if (!disposed) {
          setError(initializeError.message || '初始化觉察云端失败');
          setLoading(false);
        }
      }
    };

    void initializeCloudbase();

    return () => {
      disposed = true;
    };
  }, [hydrateCaches, loadData]);

  const addAwarenessRecord = useCallback(async (content, options = {}) => {
    try {
      const result = await awarenessService.addRecord(content, options);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const nextCurrentUser = await userProfileService.getCurrentProfile({ refresh: true, allowAnonymous: true });
      const nextUserTags = upsertTagCount(userTags, result.record, 'count');
      const nextPopularTags = upsertTagCount(popularTags, result.record, 'totalCount');
      const nextRecentRecords = prependRecentRecord(recentRecords, result.record);
      const fetchedAt = new Date().toISOString();
      const sharePayload = await awarenessService.buildSharePayloadFromRecord(result.record);

      setCurrentUser(nextCurrentUser);
      setUserTags(nextUserTags);
      setPopularTags(nextPopularTags);
      setRecentRecords(nextRecentRecords);
      setLastUpdatedAt(fetchedAt);

      if (nextCurrentUser?.authUid) {
        persistCaches(nextCurrentUser.authUid, nextUserTags, nextPopularTags, nextRecentRecords, fetchedAt);
      }

      const rewardEntry = Array.isArray(result.reward?.history)
        ? result.reward.history.find((entry) => entry?.type === 'EARN' && Number(entry.amount || 0) > 0) || null
        : null;
      if (rewardEntry) {
        pushRewardToast(rewardEntry);
        void syncWalletFromCloud({ refresh: true, allowAnonymous: true });
      }

      return {
        success: true,
        record: result.record,
        sharePayload,
        reward: result.reward
      };
    } catch (submitError) {
      console.error('提交觉察失败:', submitError);
      return { success: false, error: submitError };
    }
  }, [persistCaches, popularTags, pushRewardToast, recentRecords, syncWalletFromCloud, userTags]);

  const refreshData = useCallback(async (options = {}) => {
    await loadData({
      silent: true,
      force: options.force ?? true,
      allowAnonymous: options.allowAnonymous ?? true
    });
  }, [loadData]);

  const contextValue = useMemo(() => ({
    authStatus,
    currentUser,
    userTags,
    popularTags,
    recentRecords,
    loading,
    refreshing,
    error,
    isLoggedIn: authStatus.isAuthenticated,
    lastUpdatedAt,
    addAwarenessRecord,
    refreshData,
    syncAuthState
  }), [
    addAwarenessRecord,
    authStatus,
    currentUser,
    error,
    lastUpdatedAt,
    loading,
    popularTags,
    recentRecords,
    refreshData,
    refreshing,
    syncAuthState,
    userTags
  ]);

  return (
    <CloudAwarenessContext.Provider value={contextValue}>
      {children}
    </CloudAwarenessContext.Provider>
  );
};
