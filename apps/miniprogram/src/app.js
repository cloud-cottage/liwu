const { initCloudbase } = require('./utils/cloudbase')
const { getLocalProfile } = require('./utils/storage')
const { applyMiniProgramTheme } = require('./utils/theme')

App({
  globalData: {
    envId: 'liwu-0gtd91eebd863ccf',
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
