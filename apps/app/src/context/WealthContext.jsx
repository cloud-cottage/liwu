/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import FortuneBeanIcon from '../components/Icons/FortuneBeanIcon.jsx';
import { badgeService, wealthService } from '../services/cloudbase';

const WealthContext = createContext();
const WALLET_SYNC_INTERVAL_MS = 15000;
const REWARD_MODAL_MARKER_KEY = 'wealth_reward_toast_marker';
const MEDITATION_TIMEZONE = 'Asia/Shanghai';
const MEDITATION_MIN_VALID_SECONDS = 180;

export const useWealth = () => useContext(WealthContext);

const readStoredJSON = (key, fallback) => {
  const storedValue = localStorage.getItem(key);
  return storedValue ? JSON.parse(storedValue) : fallback;
};

const readSessionJSON = (key, fallback) => {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const storedValue = window.sessionStorage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallback;
  } catch {
    return fallback;
  }
};

const writeSessionJSON = (key, value) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(key, JSON.stringify(value));
};

const removeSessionValue = (key) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(key);
};

const meditationDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MEDITATION_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const getMeditationDateKey = (value = new Date()) => meditationDateFormatter.format(new Date(value));

const normalizeMeditationStats = (value = {}) => {
  const todayKey = getMeditationDateKey();
  const storedTodayKey = value.todayKey || value.todayDate || '';
  const totalDuration = Math.max(0, Number(value.totalDuration || 0));
  const sessionCount = Math.max(0, Number(value.sessionCount || 0));
  const todayCount = storedTodayKey === todayKey ? Math.max(0, Number(value.todayCount || 0)) : 0;

  return {
    totalDuration,
    sessionCount,
    todayCount,
    todayKey,
    medals: Math.max(0, Number(value.medals || 0))
  };
};

const isRewardEntry = (entry = {}) => entry?.type === 'EARN' && Number(entry.amount || 0) > 0;

const getEntryTimestamp = (entry = {}) => {
  const parsedTime = new Date(entry.date || entry.createdAt || 0).getTime();
  return Number.isNaN(parsedTime) ? 0 : parsedTime;
};

const getLatestRewardEntry = (entries = []) => entries.find(isRewardEntry) || null;

const createRewardMarker = (entry = null) => (
  entry
    ? {
        id: entry.id || '',
        timestamp: getEntryTimestamp(entry)
      }
    : {
        id: '',
        timestamp: 0
      }
);

const getNewRewardEntries = (entries = [], marker = createRewardMarker()) => (
  entries
    .filter(isRewardEntry)
    .filter((entry) => {
      const entryTimestamp = getEntryTimestamp(entry);
      return entryTimestamp > marker.timestamp || (entryTimestamp === marker.timestamp && entry.id !== marker.id);
    })
    .sort((left, right) => getEntryTimestamp(left) - getEntryTimestamp(right))
);

const getRewardToastEntry = (result = {}) => (
  Array.isArray(result.history) ? result.history.find(isRewardEntry) || null : null
);

const RewardArrivalToast = ({ entry, balance, onClose }) => {
  if (!entry) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '18px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 70,
        display: 'flex',
        justifyContent: 'center',
        width: 'calc(100% - 32px)',
        maxWidth: '420px',
        pointerEvents: 'none'
      }}
    >
      <div
        style={{
          width: '100%',
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          borderRadius: '20px',
          padding: '14px 16px',
          boxShadow: '0 18px 44px rgba(15, 23, 42, 0.28)',
          color: '#fff',
          pointerEvents: 'auto',
          backdropFilter: 'blur(14px)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(214, 140, 101, 0.18) 0%, rgba(214, 140, 101, 0.32) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            fontWeight: 700,
            color: '#f6caa9',
            flexShrink: 0
          }}
        >
          <FortuneBeanIcon size={26} />
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            reward_notice
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#f6caa9', lineHeight: 1 }}>
              +{entry.amount}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
              <span>当前</span>
              <span>{balance}</span>
              <FortuneBeanIcon size={14} style={{ color: '#f6caa9' }} aria-label="福豆" />
            </div>
          </div>
          <div style={{ marginTop: '6px', fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
            {entry.description || '你获得了一笔新的福豆奖励。'}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            border: 'none',
            borderRadius: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.14)',
            color: '#fff',
            padding: '10px 12px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          收起
        </button>
      </div>
    </div>
  );
};

export const WealthProvider = ({ children }) => {
  const [balance, setBalance] = useState(() => {
    const saved = localStorage.getItem('wealth_balance');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [history, setHistory] = useState(() => readStoredJSON('wealth_history', []));
  const [dreams, setDreams] = useState(() => readStoredJSON('wealth_dreams', []));
  const [inventory, setInventory] = useState(() => readStoredJSON('wealth_inventory', []));

  const [meditationStats, setMeditationStats] = useState(() => {
    const savedMeditationStats = localStorage.getItem('meditation_stats');
    return savedMeditationStats
      ? normalizeMeditationStats(JSON.parse(savedMeditationStats))
      : normalizeMeditationStats({
          totalDuration: 120,
          sessionCount: 0,
          todayCount: 0
        });
  });
  const [rewardModalQueue, setRewardModalQueue] = useState([]);
  const rewardTrackingReadyRef = useRef(false);

  useEffect(() => {
    if (rewardModalQueue.length === 0) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setRewardModalQueue((currentQueue) => currentQueue.slice(1));
    }, 3200);

    return () => window.clearTimeout(timerId);
  }, [rewardModalQueue]);

  const enqueueRewardEntries = useCallback((entries = []) => {
    if (entries.length === 0) {
      return;
    }

    setRewardModalQueue((currentQueue) => {
      const queuedIds = new Set(currentQueue.map((entry) => entry.id));
      const entriesToAppend = entries.filter((entry) => entry.id && !queuedIds.has(entry.id));
      return entriesToAppend.length > 0 ? [...currentQueue, ...entriesToAppend] : currentQueue;
    });
  }, []);

  const pushRewardToast = useCallback((entry = null) => {
    if (!entry || !entry.id) {
      return;
    }

    enqueueRewardEntries([entry]);
    writeSessionJSON(REWARD_MODAL_MARKER_KEY, createRewardMarker(entry));
  }, [enqueueRewardEntries]);

  const processRewardHistoryUpdate = useCallback((nextHistory = []) => {
    if (!rewardTrackingReadyRef.current) {
      return;
    }

    const latestRewardEntry = getLatestRewardEntry(nextHistory);
    const storedMarker = readSessionJSON(REWARD_MODAL_MARKER_KEY, null);

    if (!latestRewardEntry) {
      return;
    }

    if (!storedMarker) {
      writeSessionJSON(REWARD_MODAL_MARKER_KEY, createRewardMarker(latestRewardEntry));
      return;
    }

    const nextRewardEntries = getNewRewardEntries(nextHistory, storedMarker);
    if (nextRewardEntries.length === 0) {
      return;
    }

    enqueueRewardEntries(nextRewardEntries);
    writeSessionJSON(REWARD_MODAL_MARKER_KEY, createRewardMarker(nextRewardEntries[nextRewardEntries.length - 1]));
  }, [enqueueRewardEntries]);

  useEffect(() => {
    localStorage.setItem('wealth_balance', String(balance));
    localStorage.setItem('wealth_history', JSON.stringify(history));
    localStorage.setItem('wealth_dreams', JSON.stringify(dreams));
    localStorage.setItem('wealth_inventory', JSON.stringify(inventory));
    localStorage.setItem('meditation_stats', JSON.stringify(meditationStats));
  }, [balance, dreams, history, inventory, meditationStats]);

  useEffect(() => {
    if (rewardTrackingReadyRef.current) {
      return;
    }

    rewardTrackingReadyRef.current = true;
    const storedMarker = readSessionJSON(REWARD_MODAL_MARKER_KEY, null);
    const latestRewardEntry = getLatestRewardEntry(history);

    if (!storedMarker && latestRewardEntry) {
      writeSessionJSON(REWARD_MODAL_MARKER_KEY, createRewardMarker(latestRewardEntry));
    }
  }, [history]);

  useEffect(() => {
    const syncMeditationStatsDate = () => {
      setMeditationStats((currentStats) => normalizeMeditationStats(currentStats));
    };

    syncMeditationStatsDate();
    window.addEventListener('focus', syncMeditationStatsDate);

    return () => {
      window.removeEventListener('focus', syncMeditationStatsDate);
    };
  }, []);

  const syncWalletFromCloud = useCallback(async (options = {}) => {
    try {
      const wallet = await wealthService.getCurrentWallet(options);

      if (!wallet) {
        setBalance(0);
        setHistory([]);
        setRewardModalQueue([]);
        removeSessionValue(REWARD_MODAL_MARKER_KEY);
        return null;
      }

      setBalance(wallet.balance);
      setHistory(wallet.history);
      processRewardHistoryUpdate(wallet.history);
      return wallet;
    } catch (error) {
      console.error('同步云端福豆失败:', error);
      return null;
    }
  }, [processRewardHistoryUpdate]);

  useEffect(() => {
    let disposed = false;

    const syncOnce = async () => {
      await syncWalletFromCloud({ refresh: true });
    };

    void syncOnce();

    const handleFocus = () => {
      if (!disposed) {
        void syncWalletFromCloud({ refresh: true });
      }
    };

    window.addEventListener('focus', handleFocus);
    const timerId = window.setInterval(() => {
      if (!disposed) {
        void syncWalletFromCloud({ refresh: true });
      }
    }, WALLET_SYNC_INTERVAL_MS);

    return () => {
      disposed = true;
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(timerId);
    };
  }, [syncWalletFromCloud]);

  const addWealth = useCallback(async (amount, description, options = {}) => {
    try {
      const result = await wealthService.awardCurrentUser({
        amount,
        description,
        source: options.source || 'manual',
        rewardKey: options.rewardKey || '',
        allowRepeatReward: options.allowRepeatReward ?? true
      });

      setBalance(result.balance);
      setHistory(result.history);
      if (result.rewarded) {
        const rewardEntry = getRewardToastEntry(result);
        if (rewardEntry) {
          pushRewardToast(rewardEntry);
        }
      }
      processRewardHistoryUpdate(result.history);
      return result;
    } catch (error) {
      console.error('云端福豆发放失败:', error);
      return {
        rewarded: false,
        rewardAmount: 0,
        repeatedRewardBlocked: false,
        inviterBonusAmount: 0,
        balance,
        history,
        error
      };
    }
  }, [balance, history, processRewardHistoryUpdate, pushRewardToast]);

  const addDream = useCallback((name, price) => {
    setDreams((currentDreams) => [
      ...currentDreams,
      {
        id: Date.now(),
        name,
        price,
        acquired: false
      }
    ]);
  }, []);

  const buyDream = useCallback(async (dreamId) => {
    const dream = dreams.find((item) => item.id === dreamId);
    if (!dream) {
      return { success: false };
    }

    let spendResult;

    try {
      spendResult = await wealthService.spendCurrentUser({
        amount: dream.price,
        description: `实现了梦想：${dream.name}`,
        source: 'dream_purchase'
      });
    } catch (error) {
      console.error('云端梦想兑换失败:', error);
      return { success: false, error };
    }

    if (!spendResult.success) {
      if (spendResult.insufficientBalance) {
        window.alert('虚拟金钱不足，请通过断舍离积累更多财富。');
      }

      return spendResult;
    }

    setBalance(spendResult.balance);
    setHistory(spendResult.history);
    setDreams((currentDreams) => currentDreams.map((item) => (
      item.id === dreamId ? { ...item, acquired: true } : item
    )));
    setInventory((currentInventory) => [
      ...currentInventory,
      {
        ...dream,
        acquiredDate: new Date().toISOString()
      }
    ]);

    return spendResult;
  }, [dreams]);

  const updateMeditationStats = useCallback((duration) => {
    const normalizedDuration = Math.max(0, Number(duration) || 0);
    const todayKey = getMeditationDateKey();

    if (normalizedDuration <= 0) {
      return;
    }

    setMeditationStats((currentStats) => {
      const nextStats = normalizeMeditationStats(currentStats);
      const nextTodayCount = nextStats.todayKey === todayKey ? nextStats.todayCount + 1 : 1;

      return {
        ...nextStats,
        totalDuration: nextStats.totalDuration + normalizedDuration,
        sessionCount: nextStats.sessionCount + 1,
        todayCount: nextTodayCount,
        todayKey
      };
    });
  }, []);

  const completeMeditationSession = useCallback(async ({
    duration,
    rewardAmount = 0,
    allowRepeatReward = true,
    rewardKey = 'default_meditation_program',
    rewardDescription = '完成一次冥想'
  }) => {
    updateMeditationStats(duration);

    const normalizedRewardAmount = Math.max(0, Number(rewardAmount) || 0);
    if (normalizedRewardAmount <= 0) {
      try {
        await badgeService.recordMeditationCompletion({
          duration,
          rewardAmount: 0,
          description: rewardDescription
        });
      } catch (badgeError) {
        console.error('记录冥想徽章进度失败:', badgeError);
      }

      return {
        rewarded: false,
        rewardAmount: 0,
        repeatedRewardBlocked: false,
        inviterBonusAmount: 0,
        balance
      };
    }

    const rewardResult = await addWealth(normalizedRewardAmount, rewardDescription, {
      source: 'meditation',
      rewardKey,
      allowRepeatReward
    });

    try {
      const badgeResult = await badgeService.recordMeditationCompletion({
        duration,
        rewardAmount: rewardResult.rewardAmount ?? normalizedRewardAmount,
        description: rewardDescription
      });

      return {
        ...rewardResult,
        badgeBonusAmount: badgeResult.badgeBonusAmount || 0,
        meditationSlot: badgeResult.slot || ''
      };
    } catch (badgeError) {
      console.error('记录冥想徽章进度失败:', badgeError);
      return rewardResult;
    }
  }, [addWealth, balance, updateMeditationStats]);

  const closeRewardModal = useCallback(() => {
    setRewardModalQueue((currentQueue) => currentQueue.slice(1));
  }, []);

  return (
    <WealthContext.Provider
      value={{
        balance,
        history,
        dreams,
        inventory,
        meditationStats,
        addWealth,
        addDream,
        buyDream,
        updateMeditationStats,
        completeMeditationSession,
        syncWalletFromCloud,
        pushRewardToast
      }}
    >
      {children}
      <RewardArrivalToast
        entry={rewardModalQueue[0] || null}
        balance={balance}
        onClose={closeRewardModal}
      />
    </WealthContext.Provider>
  );
};
