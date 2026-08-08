const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 首页数据聚合云函数
 * 一次性查询所有首页需要的集合数据，替代客户端多次直连 DB。
 */
exports.main = async (event = {}) => {
  try {
    const [
      categoriesResult,
      productsResult,
      recordsResult,
      tagSettingsResult,
      displaySettingsResult
    ] = await Promise.all([
      db.collection('shop_categories').limit(50).get(),
      db.collection('shop_products').limit(50).get(),
      db.collection('awareness_records')
        .orderBy('createdAt', 'desc')
        .limit(5000)
        .get(),
      db.collection('app_settings')
        .where({ key: 'awareness_tag_settings' })
        .limit(1)
        .get(),
      db.collection('app_settings')
        .where({ key: 'awareness_display_settings' })
        .limit(1)
        .get()
    ]);

    return {
      ok: true,
      data: {
        categories: categoriesResult.data || [],
        products: productsResult.data || [],
        records: recordsResult.data || [],
        tagSettings: tagSettingsResult.data ? (tagSettingsResult.data[0] || null) : null,
        displaySettings: displaySettingsResult.data ? (displaySettingsResult.data[0] || null) : null
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || 'getHomePageData_failed'
    };
  }
};
