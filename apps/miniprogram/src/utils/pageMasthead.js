const { getAppSettings } = require('./app-settings-cache')
const {
  PAGE_MASTHEAD_SETTINGS_KEY,
  DEFAULT_PAGE_MASTHEAD_SETTINGS,
  normalizePageMastheadSettings
} = require('./shared/page-masthead-settings')

const getPageMastheadSettings = async () => {
  try {
    const result = await getAppSettings([PAGE_MASTHEAD_SETTINGS_KEY])
    const document = result[PAGE_MASTHEAD_SETTINGS_KEY] || {}
    return normalizePageMastheadSettings(document)
  } catch {
    return { ...DEFAULT_PAGE_MASTHEAD_SETTINGS }
  }
}

module.exports = {
  DEFAULT_PAGE_MASTHEAD_SETTINGS,
  getPageMastheadSettings
}