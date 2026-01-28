import React, { createContext, useState, useEffect, useContext } from 'react';

const WealthContext = createContext();

export const useWealth = () => useContext(WealthContext);

export const WealthProvider = ({ children }) => {
    const [balance, setBalance] = useState(() => {
        const saved = localStorage.getItem('wealth_balance');
        return saved ? parseInt(saved, 10) : 0;
    });

    const [history, setHistory] = useState(() => {
        const saved = localStorage.getItem('wealth_history');
        return saved ? JSON.parse(saved) : [];
    });

    const [dreams, setDreams] = useState(() => {
        const saved = localStorage.getItem('wealth_dreams');
        return saved ? JSON.parse(saved) : [];
    });

    const [inventory, setInventory] = useState(() => {
        const saved = localStorage.getItem('wealth_inventory');
        return saved ? JSON.parse(saved) : [];
    });

    const [challenges, setChallenges] = useState(() => {
        const saved = localStorage.getItem('wealth_challenges');
        if (saved) return JSON.parse(saved);
        return [
            { id: 1, title: '七日静心', description: '连续7天完成每日冥想', reward: '50 荣誉点', type: 'Meditation', completed: false },
            { id: 2, title: '断舍离达人', description: '本周记录5件断舍离物品', reward: '100 荣誉点', type: 'Declutter', completed: false },
            { id: 3, title: '晨曦守望者', description: '连续3天在早晨8点前开启冥想', reward: '30 荣誉点', type: 'Meditation', completed: false },
        ];
    });

    const [meditationStats, setMeditationStats] = useState(() => {
        const saved = localStorage.getItem('meditation_stats');
        return saved ? JSON.parse(saved) : {
            totalDuration: 120, // Initial dummy data
            medals: 3,
            sessionCount: 0
        };
    });

    useEffect(() => {
        localStorage.setItem('wealth_balance', balance);
        localStorage.setItem('wealth_history', JSON.stringify(history));
        localStorage.setItem('wealth_dreams', JSON.stringify(dreams));
        localStorage.setItem('wealth_inventory', JSON.stringify(inventory));
        localStorage.setItem('wealth_challenges', JSON.stringify(challenges));
        localStorage.setItem('meditation_stats', JSON.stringify(meditationStats));
    }, [balance, history, dreams, inventory, challenges, meditationStats]);

    const addWealth = (amount, description) => {
        setBalance(prev => prev + amount);
        setHistory(prev => [{
            id: Date.now(),
            amount,
            description,
            date: new Date().toISOString(),
            type: 'EARN'
        }, ...prev]);
    };

    const addDream = (name, price) => {
        setDreams(prev => [...prev, {
            id: Date.now(),
            name,
            price,
            acquired: false
        }]);
    };

    const buyDream = (dreamId) => {
        const dream = dreams.find(d => d.id === dreamId);
        if (!dream) return;
        if (balance >= dream.price) {
            setBalance(prev => prev - dream.price);
            setDreams(prev => prev.map(d => d.id === dreamId ? { ...d, acquired: true } : d));
            setInventory(prev => [...prev, { ...dream, acquiredDate: new Date().toISOString() }]);
            setHistory(prev => [{
                id: Date.now(),
                amount: -dream.price,
                description: `实现了梦想：${dream.name}`,
                date: new Date().toISOString(),
                type: 'SPEND'
            }, ...prev]);
        } else {
            alert('虚拟金钱不足，请通过断舍离积累更多财富。');
        }
    };

    const updateMeditationStats = (duration) => {
        setMeditationStats(prev => ({
            ...prev,
            totalDuration: prev.totalDuration + duration,
            sessionCount: prev.sessionCount + 1,
            // Simple logic for medals: 1 medal per 5 sessions or some other rule
            medals: Math.max(prev.medals, Math.floor((prev.totalDuration + duration) / 40)) 
        }));
    };

    const completeChallenge = (challengeId) => {
        setChallenges(prev => prev.map(c => 
            c.id === challengeId ? { ...c, completed: true } : c
        ));
    };

    return (
        <WealthContext.Provider value={{
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
            completeChallenge
        }}>
            {children}
        </WealthContext.Provider>
    );
};
