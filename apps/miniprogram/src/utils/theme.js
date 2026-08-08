const { getAppSettings } = require('./app-settings-cache')
const {
  CLIENT_THEME_SETTINGS_KEY,
  DEFAULT_CLIENT_THEME_SETTINGS,
  getThemePreset,
  normalizeClientThemeSettings
} = require('./shared/theme-system')

const toMiniProgramThemePreset = (themeName = DEFAULT_CLIENT_THEME_SETTINGS.theme) => {
  const preset = getThemePreset(themeName)
  const miniprogram = preset.miniprogram || {}
  const pageBackground = miniprogram.pageBackground || '#F3F0EA'

  return {
    name: preset.name,
    navigationBarBackgroundColor: pageBackground,
    navigationBarTextStyle: 'black',
    backgroundColor: pageBackground,
    pageBackground,
    textPrimary: miniprogram.textPrimary || '#353A36'
  }
}

const getThemeSettings = async () => {
  try {
    const result = await getAppSettings([CLIENT_THEME_SETTINGS_KEY])
    const document = result[CLIENT_THEME_SETTINGS_KEY] || null
    const normalized = normalizeClientThemeSettings(document || {})

    return {
      theme: normalized.theme
    }
  } catch (error) {
    return {
      theme: DEFAULT_CLIENT_THEME_SETTINGS.theme,
      error
    }
  }
}

const applyMiniProgramTheme = async () => {
  const settings = await getThemeSettings()
  const preset = toMiniProgramThemePreset(settings.theme)

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
  getThemePreset: toMiniProgramThemePreset,
  getThemeSettings,
  applyMiniProgramTheme
}