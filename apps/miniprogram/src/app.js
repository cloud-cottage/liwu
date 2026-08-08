const { initCloudbase } = require('./utils/cloudbase')
const { DEFAULT_CLOUDBASE_ENV } = require('./utils/shared/database-config')
const { getLocalProfile } = require('./utils/storage')
const { applyMiniProgramTheme } = require('./utils/theme')

App({
  globalData: {
    envId: DEFAULT_CLOUDBASE_ENV,
    profile: null,
    theme: 'IvoryAndSage',
    themePreset: null
  },

  onLaunch() {
    initCloudbase()
    this.globalData.profile = getLocalProfile()
    applyMiniProgramTheme().then((result) => {
      this.globalData.theme = result.theme
      this.globalData.themePreset = result.preset
    })
  }
})
