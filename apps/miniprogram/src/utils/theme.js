const { getDb } = require('./cloudbase')

const THEME_SETTINGS_KEY = 'client_theme_settings'

const MINIPROGRAM_THEME_PRESETS = {
  OrangeGold: {
    name: 'OrangeGold',
    navigationBarBackgroundColor: '#F5F5F0',
    navigationBarTextStyle: 'black',
    backgroundColor: '#F5F5F0',
    pageBackground: '#f7f4ef',
    textPrimary: '#1f2937'
  },
  Starbuck2026: {
    name: 'Starbuck2026',
    navigationBarBackgroundColor: '#E0F0ED',
    navigationBarTextStyle: 'black',
    backgroundColor: '#E0F0ED',
    pageBackground: '#E0F0ED',
    textPrimary: '#26334A'
  }
}

const getThemePreset = (themeName = 'OrangeGold') => (
  MINIPROGRAM_THEME_PRESETS[themeName] || MINIPROGRAM_THEME_PRESETS.OrangeGold
)

const getThemeSettings = async () => {
  try {
    const db = getDb()
    const result = await db.collection('app_settings').where({ key: THEME_SETTINGS_KEY }).limit(1).get()
    const document = Array.isArray(result?.data) ? result.data[0] : null
    return {
      theme: getThemePreset(document?.theme || 'OrangeGold').name
    }
  } catch (error) {
    return {
      theme: 'OrangeGold',
      error
    }
  }
}

const applyMiniProgramTheme = async () => {
  const settings = await getThemeSettings()
  const preset = getThemePreset(settings.theme)

  try {
    wx.setNavigationBarColor({
      frontColor: preset.navigationBarTextStyle === 'white' ? '#ffffff' : '#000000',
      backgroundColor: preset.navigationBarBackgroundColor
    })
  } catch (error) {
    // ignore runtime theme bridge failures in unsupported clients
  }

  return {
    ...settings,
    preset
  }
}

module.exports = {
  MINIPROGRAM_THEME_PRESETS,
  getThemePreset,
  getThemeSettings,
  applyMiniProgramTheme
}
