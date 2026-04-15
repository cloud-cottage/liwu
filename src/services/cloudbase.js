import cloudbase from '@cloudbase/js-sdk';
import { DATABASE_CONFIG } from '../config/database.js';

const { env, region, publishableKey } = DATABASE_CONFIG.cloudbase;

const app = cloudbase.init({
    env,
    ...(region ? { region } : {}),
    ...(publishableKey ? { publishableKey } : {})
});

const db = app.database();
const auth = app.auth({ persistence: 'local' });
let loginPromise = null;

const isMissingCollectionResponse = (response) => response?.code === 'DATABASE_COLLECTION_NOT_EXIST';

const getResponseData = (response, collectionName) => {
    if (Array.isArray(response?.data)) {
        return response.data;
    }

    if (isMissingCollectionResponse(response)) {
        return [];
    }

    throw new Error(response?.message || `CloudBase query failed for collection "${collectionName}"`);
};

const resolveCurrentUser = async () => auth.currentUser || auth.getCurrentUser();

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

// 集合名称
const COLLECTIONS = {
    AWARENESS_RECORDS: 'awareness_records', // 觉察记录
    USERS: 'users', // 用户信息
    CHALLENGES: 'challenges', // 挑战数据
    WEALTH_HISTORY: 'wealth_history', // 财富历史
    DREAMS: 'dreams', // 梦想清单
};

/**
 * 觉察记录相关操作
 */
export const awarenessService = {
    // 添加觉察记录
    async addRecord(content) {
        try {
            const user = await ensureAnonymousLogin();
            const userId = user?.uid || 'anonymous';

            const result = await db.collection(COLLECTIONS.AWARENESS_RECORDS).add({
                userId,
                content,
                timestamp: new Date(),
                createdAt: db.serverDate()
            });

            if (!result?.id) {
                throw new Error(result?.message || '添加觉察记录失败');
            }

            return { success: true, id: result.id };
        } catch (error) {
            console.error('添加觉察记录失败:', error);
            return { success: false, error };
        }
    },

    // 获取用户的觉察记录
    async getUserRecords(limit = 100) {
        try {
            const user = await ensureAnonymousLogin();
            const userId = user?.uid || 'anonymous';

            const result = await db.collection(COLLECTIONS.AWARENESS_RECORDS)
                .where({
                    userId
                })
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();

            return { success: true, data: getResponseData(result, COLLECTIONS.AWARENESS_RECORDS) };
        } catch (error) {
            console.error('获取用户觉察记录失败:', error);
            return { success: false, error };
        }
    },

    // 获取用户的标签统计
    async getUserTags() {
        try {
            const recordsResult = await this.getUserRecords();
            if (!recordsResult.success) return { success: false };

            const records = recordsResult.data;

            // 本地聚合统计
            const tagMap = {};
            records.forEach(record => {
                if (tagMap[record.content]) {
                    tagMap[record.content].count++;
                } else {
                    tagMap[record.content] = {
                        content: record.content,
                        count: 1
                    };
                }
            });

            const tags = Object.values(tagMap).sort((a, b) => b.count - a.count);
            return { success: true, data: tags };
        } catch (error) {
            console.error('获取用户标签统计失败:', error);
            return { success: false, error };
        }
    },

    // 获取社群热门标签
    async getPopularTags(limit = 10) {
        try {
            await ensureAnonymousLogin();
            // 获取最近的记录(比如最近1000条)
            const result = await db.collection(COLLECTIONS.AWARENESS_RECORDS)
                .orderBy('createdAt', 'desc')
                .limit(1000)
                .get();

            // 本地聚合统计
            const tagMap = {};
            getResponseData(result, COLLECTIONS.AWARENESS_RECORDS).forEach(record => {
                if (tagMap[record.content]) {
                    tagMap[record.content].totalCount++;
                } else {
                    tagMap[record.content] = {
                        content: record.content,
                        totalCount: 1
                    };
                }
            });

            const tags = Object.values(tagMap)
                .sort((a, b) => b.totalCount - a.totalCount)
                .slice(0, limit);

            return { success: true, data: tags };
        } catch (error) {
            console.error('获取热门标签失败:', error);
            return { success: false, error };
        }
    }
};

/**
 * 用户认证相关操作
 */
export const authService = {
    // 匿名登录
    async loginAnonymously() {
        try {
            await ensureAnonymousLogin();
            return { success: true };
        } catch (error) {
            console.error('匿名登录失败:', error);
            return { success: false, error };
        }
    },

    // 获取当前用户
    getCurrentUser() {
        return auth.currentUser;
    },

    // 监听登录状态变化
    onLoginStateChanged(callback) {
        return auth.onLoginStateChanged(callback);
    }
};

export { db, auth };
export default app;
