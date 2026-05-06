export const PAGE_MASTHEAD_SETTINGS_KEY = 'page_masthead_settings'

export const DEFAULT_PAGE_MASTHEAD_SETTINGS = {
  documentId: null,
  homeSlogan: '礼敬物品，礼赞生命。',
  awarenessSlogan: '把此刻命名清楚，再安静地把它交还给自己。',
  shopSlogan: '用福豆兑换适合静心、阅读与日常安住的小器物。',
  meditationSlogan: '给自己 15 分钟的留白。在呼吸间寻回内在的秩序。',
  missingCollection: false
}

const sanitizeSlogan = (value = '', fallback = '') => String(value || fallback || '').trim().slice(0, 60)

export const normalizePageMastheadSettings = (document = {}) => ({
  documentId: document._id || document.id || null,
  homeSlogan: sanitizeSlogan(document.home_slogan ?? document.homeSlogan, DEFAULT_PAGE_MASTHEAD_SETTINGS.homeSlogan),
  awarenessSlogan: sanitizeSlogan(document.awareness_slogan ?? document.awarenessSlogan, DEFAULT_PAGE_MASTHEAD_SETTINGS.awarenessSlogan),
  shopSlogan: sanitizeSlogan(document.shop_slogan ?? document.shopSlogan, DEFAULT_PAGE_MASTHEAD_SETTINGS.shopSlogan),
  meditationSlogan: sanitizeSlogan(document.meditation_slogan ?? document.meditationSlogan, DEFAULT_PAGE_MASTHEAD_SETTINGS.meditationSlogan),
  missingCollection: false
})

export const toPageMastheadSettingsPayload = (settings = {}) => ({
  key: PAGE_MASTHEAD_SETTINGS_KEY,
  home_slogan: sanitizeSlogan(settings.homeSlogan, DEFAULT_PAGE_MASTHEAD_SETTINGS.homeSlogan),
  awareness_slogan: sanitizeSlogan(settings.awarenessSlogan, DEFAULT_PAGE_MASTHEAD_SETTINGS.awarenessSlogan),
  shop_slogan: sanitizeSlogan(settings.shopSlogan, DEFAULT_PAGE_MASTHEAD_SETTINGS.shopSlogan),
  meditation_slogan: sanitizeSlogan(settings.meditationSlogan, DEFAULT_PAGE_MASTHEAD_SETTINGS.meditationSlogan)
})
