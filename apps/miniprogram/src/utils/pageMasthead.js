const { getDb } = require('./cloudbase')

const APP_SETTINGS = 'app_settings'
const PAGE_MASTHEAD_SETTINGS_KEY = 'page_masthead_settings'

const DEFAULT_PAGE_MASTHEAD_SETTINGS = {
  homeSlogan: '礼敬物品，礼赞生命。',
  awarenessSlogan: '把此刻命名清楚，再安静地把它交还给自己。',
  shopSlogan: '适合静心、阅读与日常安住的小器物。',
  meditationSlogan: '给自己 15 分钟的留白。在呼吸间寻回内在的秩序。'
}

const sanitizeSlogan = (value = '', fallback = '') => String(value || fallback || '').trim().slice(0, 60)

const getPageMastheadSettings = async () => {
  try {
    const db = getDb()
    const result = await db.collection(APP_SETTINGS).where({ key: PAGE_MASTHEAD_SETTINGS_KEY }).limit(1).get()
    const document = (result.data || [])[0] || {}

    return {
      homeSlogan: sanitizeSlogan(document.home_slogan ?? document.homeSlogan, DEFAULT_PAGE_MASTHEAD_SETTINGS.homeSlogan),
      awarenessSlogan: sanitizeSlogan(document.awareness_slogan ?? document.awarenessSlogan, DEFAULT_PAGE_MASTHEAD_SETTINGS.awarenessSlogan),
      shopSlogan: sanitizeSlogan(document.shop_slogan ?? document.shopSlogan, DEFAULT_PAGE_MASTHEAD_SETTINGS.shopSlogan),
      meditationSlogan: sanitizeSlogan(document.meditation_slogan ?? document.meditationSlogan, DEFAULT_PAGE_MASTHEAD_SETTINGS.meditationSlogan)
    }
  } catch {
    return {
      ...DEFAULT_PAGE_MASTHEAD_SETTINGS
    }
  }
}

module.exports = {
  DEFAULT_PAGE_MASTHEAD_SETTINGS,
  getPageMastheadSettings
}
