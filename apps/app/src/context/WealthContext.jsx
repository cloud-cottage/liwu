/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { badgeService, wealthService } from '../services/cloudbase';

const WealthContext = createContext();
const WALLET_SYNC_INTERVAL_MS = 15000;
const REWARD_MODAL_MARKER_KEY = 'wealth_reward_modal_marker';

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

const RewardArrivalModal = ({ entry, balance, onClose }) => {
  if (!entry) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backgroundColor: 'rgba(15, 23, 42, 0.45)'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#fff',
          borderRadius: '24px',
          padding: '24px',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.22)',
          textAlign: 'center'
        }}
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            margin: '0 auto 18px',
            background: 'linear-gradient(135deg, rgba(214, 140, 101, 0.18) 0%, rgba(214, 140, 101, 0.32) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '30px',
            fontWeight: 700,
            color: '#9a3412'
          }}
        >
          福
        </div>

        <div style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          reward_notice
        </div>
        <h3 style={{ margin: '10px 0 0', fontSize: '26px', color: '#111827' }}>福豆到账</h3>
        <div style={{ marginTop: '14px', fontSize: '40px', fontWeight: 700, color: '#9a3412', lineHeight: 1 }}>
          +{entry.amount}
        </div>
        <div style={{ marginTop: '8px', fontSize: '15px', fontWeight: 600, color: '#334155' }}>
          当前福豆 {balance}
        </div>

        <div
          style={{
            marginTop: '18px',
            borderRadius: '16px',
            backgroundColor: '#f8fafc',
            padding: '16px',
            color: '#475569',
            fontSize: '14px',
            lineHeight: 1.7
          }}
        >
          {entry.description || '你获得了一笔新的福豆奖励。'}
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: '18px',
            border: 'none',
            borderRadius: '14px',
            backgroundColor: '#111827',
            color: '#fff',
            padding: '13px 16px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          我知道了
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
  const [challenges, setChallenges] = useState(() => {
    const savedChallenges = localStorage.getItem('wealth_challenges');
    if (savedChallenges) {
      return JSON.parse(savedChallenges);
    }

    return [
      { id: 1, title: '七日静心', description: '连续7天完成每日冥想', reward: '50 福豆', type: 'Meditation', completed: false },
      { id: 2, title: '断舍离达人', description: '本周觉察5件断舍离物品', reward: '100 福豆', type: 'Declutter', completed: false },
      { id: 3, title: '晨曦守望者', description: '连续3天在早晨8点前开启冥想', reward: '30 福豆', type: 'Meditation', completed: false }
    ];
  });

  const [meditationStats, setMeditationStats] = useState(() => {
    const savedMeditationStats = localStorage.getItem('meditation_stats');
    return savedMeditationStats
      ? JSON.parse(savedMeditationStats)
      : {
          totalDuration: 120,
          medals: 3,
          sessionCount: 0
        };
  });
  const [rewardModalQueue, setRewardModalQueue] = useState([]);
  const rewardTrackingReadyRef = useRef(false);

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
    localStorage.setItem('wealth_challenges', JSON.stringify(challenges));
    localStorage.setItem('meditation_stats', JSON.stringify(meditationStats));
  }, [balance, challenges, dreams, history, inventory, meditationStats]);

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
  }, [balance, history, processRewardHistoryUpdate]);

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
    setMeditationStats((currentStats) => ({
      ...currentStats,
      totalDuration: currentStats.totalDuration + duration,
      sessionCount: currentStats.sessionCount + 1,
      medals: Math.max(currentStats.medals, Math.floor((currentStats.totalDuration + duration) / 40))
    }));
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

  const completeChallenge = useCallback((challengeId) => {
    setChallenges((currentChallenges) => currentChallenges.map((challenge) => (
      challenge.id === challengeId ? { ...challenge, completed: true } : challenge
    )));
  }, []);

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
        challenges,
        meditationStats,
        addWealth,
        addDream,
        buyDream,
        updateMeditationStats,
        completeMeditationSession,
        completeChallenge,
        syncWalletFromCloud
      }}
    >
      {children}
      <RewardArrivalModal
        entry={rewardModalQueue[0] || null}
        balance={balance}
        onClose={closeRewardModal}
      />
    </WealthContext.Provider>
  );
};
