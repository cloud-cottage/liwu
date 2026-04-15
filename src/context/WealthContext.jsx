/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { wealthService } from '../services/cloudbase';

const WealthContext = createContext();
const WALLET_SYNC_INTERVAL_MS = 15000;

export const useWealth = () => useContext(WealthContext);

const readStoredJSON = (key, fallback) => {
  const storedValue = localStorage.getItem(key);
  return storedValue ? JSON.parse(storedValue) : fallback;
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

  useEffect(() => {
    localStorage.setItem('wealth_balance', String(balance));
    localStorage.setItem('wealth_history', JSON.stringify(history));
    localStorage.setItem('wealth_dreams', JSON.stringify(dreams));
    localStorage.setItem('wealth_inventory', JSON.stringify(inventory));
    localStorage.setItem('wealth_challenges', JSON.stringify(challenges));
    localStorage.setItem('meditation_stats', JSON.stringify(meditationStats));
  }, [balance, challenges, dreams, history, inventory, meditationStats]);

  const syncWalletFromCloud = useCallback(async (options = {}) => {
    try {
      const wallet = await wealthService.getCurrentWallet(options);
      setBalance(wallet.balance);
      setHistory(wallet.history);
    } catch (error) {
      console.error('同步云端福豆失败:', error);
    }
  }, []);

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
  }, [balance, history]);

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
      return {
        rewarded: false,
        rewardAmount: 0,
        repeatedRewardBlocked: false,
        inviterBonusAmount: 0,
        balance
      };
    }

    return addWealth(normalizedRewardAmount, rewardDescription, {
      source: 'meditation',
      rewardKey,
      allowRepeatReward
    });
  }, [addWealth, balance, updateMeditationStats]);

  const completeChallenge = useCallback((challengeId) => {
    setChallenges((currentChallenges) => currentChallenges.map((challenge) => (
      challenge.id === challengeId ? { ...challenge, completed: true } : challenge
    )));
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
    </WealthContext.Provider>
  );
};
