const { initCloudbase } = require('./utils/cloudbase')
const { getLocalProfile } = require('./utils/storage')

App({
  globalData: {
    envId: 'liwu-0gtd91eebd863ccf',
    profile: null
  },

  onLaunch() {
    initCloudbase()
    this.globalData.profile = getLocalProfile()
  }
})
