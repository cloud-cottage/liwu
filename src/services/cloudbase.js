import cloudbase from '@cloudbase/js-sdk';

// 腾讯云开发配置
const app = cloudbase.init({
    env: 'liwu-0gtd91eebd863ccf' // 您的环境 ID
});

// 获取数据库引用
const db = app.database();

// 获取认证引用
const auth = app.auth();

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
            const user = auth.currentUser;
            const userId = user?.uid || 'anonymous';

            const result = await db.collection(COLLECTIONS.AWARENESS_RECORDS).add({
                userId,
                content,
                timestamp: new Date(),
                createdAt: db.serverDate()
            });

            return { success: true, id: result.id };
        } catch (error) {
            console.error('添加觉察记录失败:', error);
            return { success: false, error };
        }
    },

    // 获取用户的觉察记录
    async getUserRecords(limit = 100) {
        try {
            const user = auth.currentUser;
            const userId = user?.uid || 'anonymous';

            const result = await db.collection(COLLECTIONS.AWARENESS_RECORDS)
                .where({
                    userId
                })
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();

            return { success: true, data: result.data };
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
            // 获取最近的记录(比如最近1000条)
            const result = await db.collection(COLLECTIONS.AWARENESS_RECORDS)
                .orderBy('createdAt', 'desc')
                .limit(1000)
                .get();

            // 本地聚合统计
            const tagMap = {};
            result.data.forEach(record => {
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
            await auth.anonymousAuthProvider().signIn();
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
