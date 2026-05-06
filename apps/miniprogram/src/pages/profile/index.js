const { getProfilePageData, saveLocalProfile } = require('../../utils/profile')
const { openMiniRoute, syncMiniTabBar } = require('../../utils/navigation')

Page({
  data: {
    loading: true,
    saving: false,
    showEditor: false,
    profile: null,
    recentTags: [],
    recentWealthEntries: [],
    awareCount: 0,
    form: {
      name: '',
      phone: '',
      bio: ''
    }
  },

  onLoad() {
    void this.loadPageData()
  },

  onShow() {
    syncMiniTabBar(this, '/pages/profile/index')
  },

  async onPullDownRefresh() {
    await this.loadPageData()
    wx.stopPullDownRefresh()
  },

  async loadPageData() {
    this.setData({ loading: true })

    try {
      const pageData = await getProfilePageData()
      this.setData({
        loading: false,
        profile: pageData.profile,
        profileInitial: (pageData.profile.name || '悟').slice(0, 1),
        hasBoundPhone: Boolean(pageData.profile.phone),
        recentTags: pageData.tags,
        recentWealthEntries: pageData.recentWealthEntries,
        awareCount: pageData.awareCount,
        form: {
          name: pageData.profile.name,
          phone: pageData.profile.phone,
          bio: pageData.profile.bio
        }
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '资料加载失败',
        icon: 'none'
      })
    }
  },

  handleInput(event) {
    const { field } = event.currentTarget.dataset
    this.setData({
      [`form.${field}`]: event.detail.value
    })
  },

  handleToggleEditor() {
    this.setData({
      showEditor: !this.data.showEditor
    })
  },

  async handleSave() {
    this.setData({ saving: true })

    try {
      const nextProfile = saveLocalProfile(this.data.form)
      const app = getApp()
      app.globalData.profile = nextProfile
      this.setData({
        saving: false,
        profile: {
          ...this.data.profile,
          ...nextProfile
        },
        profileInitial: (nextProfile.name || '悟').slice(0, 1)
      })
      wx.showToast({
        title: '已保存',
        icon: 'success'
      })
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({
        title: error.message || '保存失败',
        icon: 'none'
      })
    }
  },

  handleGoShop() {
    openMiniRoute('/pages/shop/index')
  },

  handleGoAddresses() {
    openMiniRoute('/pages/profile/addresses/index')
  },

  handleGoOrders() {
    openMiniRoute('/pages/shop/orders/index')
  },

  handleShowAlbumSoon() {
    openMiniRoute('/pages/profile/album/index')
  },

  onShareAppMessage() {
    return {
      title: '我的理悟小程序',
      path: '/pages/profile/index'
    }
  }
})
