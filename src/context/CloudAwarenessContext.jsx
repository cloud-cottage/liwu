import React, { createContext, useState, useEffect, useContext } from 'react';
import { awarenessService, authService } from '../services/cloudbase';

const CloudAwarenessContext = createContext();

export const useCloudAwareness = () => useContext(CloudAwarenessContext);

export const CloudAwarenessProvider = ({ children }) => {
    const [userTags, setUserTags] = useState([]);
    const [popularTags, setPopularTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    // 初始化：登录并加载数据
    useEffect(() => {
        initializeCloudbase();
    }, []);

    const initializeCloudbase = async () => {
        try {
            // 检查登录状态
            const currentUser = authService.getCurrentUser();

            if (!currentUser) {
                // 如果未登录，进行匿名登录
                const loginResult = await authService.loginAnonymously();
                if (!loginResult.success) {
                    console.error('登录失败');
                    setLoading(false);
                    return;
                }
            }

            setIsLoggedIn(true);

            // 加载数据
            await loadData();
        } catch (error) {
            console.error('初始化失败:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadData = async () => {
        try {
            // 并行加载用户标签和热门标签
            const [userTagsResult, popularTagsResult] = await Promise.all([
                awarenessService.getUserTags(),
                awarenessService.getPopularTags()
            ]);

            if (userTagsResult.success) {
                setUserTags(userTagsResult.data);
            }

            if (popularTagsResult.success) {
                setPopularTags(popularTagsResult.data);
            }
        } catch (error) {
            console.error('加载数据失败:', error);
        }
    };

    // 添加觉察记录
    const addAwarenessRecord = async (content) => {
        try {
            const result = await awarenessService.addRecord(content);

            if (result.success) {
                // 重新加载数据以更新统计
                await loadData();
                return { success: true };
            } else {
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('添加觉察记录失败:', error);
            return { success: false, error };
        }
    };

    // 刷新数据
    const refreshData = async () => {
        setLoading(true);
        await loadData();
        setLoading(false);
    };

    return (
        <CloudAwarenessContext.Provider value={{
            userTags,
            popularTags,
            loading,
            isLoggedIn,
            addAwarenessRecord,
            refreshData
        }}>
            {children}
        </CloudAwarenessContext.Provider>
    );
};
