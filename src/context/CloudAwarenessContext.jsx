/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { awarenessService, authService, userProfileService } from '../services/cloudbase';

const CloudAwarenessContext = createContext();
const LIVE_REFRESH_INTERVAL_MS = 6000;

export const useCloudAwareness = () => useContext(CloudAwarenessContext);

export const CloudAwarenessProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userTags, setUserTags] = useState([]);
  const [popularTags, setPopularTags] = useState([]);
  const [recentRecords, setRecentRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      const [nextCurrentUser, userTagsResult, popularTagsResult, recentRecordsResult] = await Promise.all([
        userProfileService.getCurrentProfile({ refresh: silent }),
        awarenessService.getUserTags(),
        awarenessService.getPopularTags(),
        awarenessService.getRecentRecords()
      ]);

      setCurrentUser(nextCurrentUser);
      setUserTags(userTagsResult.success ? userTagsResult.data : []);
      setPopularTags(popularTagsResult.success ? popularTagsResult.data : []);
      setRecentRecords(recentRecordsResult.success ? recentRecordsResult.data : []);
      setLastUpdatedAt(new Date().toISOString());

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
  }, []);

  useEffect(() => {
    let disposed = false;
    let timerId = null;

    const initializeCloudbase = async () => {
      try {
        const currentAuthUser = authService.getCurrentUser();

        if (!currentAuthUser) {
          const loginResult = await authService.loginAnonymously();
          if (!loginResult.success) {
            throw loginResult.error || new Error('匿名登录失败');
          }
        }

        if (disposed) {
          return;
        }

        setIsLoggedIn(true);
        await loadData();

        timerId = window.setInterval(() => {
          void loadData({ silent: true });
        }, LIVE_REFRESH_INTERVAL_MS);
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
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
  }, [loadData]);

  const addAwarenessRecord = useCallback(async (content, options = {}) => {
    try {
      const result = await awarenessService.addRecord(content, options);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const sharePayload = await awarenessService.buildSharePayload(content.trim());
      await loadData({ silent: true });

      return {
        success: true,
        record: result.record,
        sharePayload
      };
    } catch (submitError) {
      console.error('提交觉察失败:', submitError);
      return { success: false, error: submitError };
    }
  }, [loadData]);

  const refreshData = useCallback(async () => {
    await loadData({ silent: true });
  }, [loadData]);

  const contextValue = useMemo(() => ({
    currentUser,
    userTags,
    popularTags,
    recentRecords,
    loading,
    refreshing,
    error,
    isLoggedIn,
    lastUpdatedAt,
    addAwarenessRecord,
    refreshData
  }), [
    addAwarenessRecord,
    currentUser,
    error,
    isLoggedIn,
    lastUpdatedAt,
    loading,
    popularTags,
    recentRecords,
    refreshData,
    refreshing,
    userTags
  ]);

  return (
    <CloudAwarenessContext.Provider value={contextValue}>
      {children}
    </CloudAwarenessContext.Provider>
  );
};
