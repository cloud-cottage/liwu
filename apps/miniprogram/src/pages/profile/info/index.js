const { getProfilePageData, saveLocalProfile } = require('../../../utils/profile')
const { bindPhoneFromWechatCode } = require('../../../utils/auth')

Page({
  data: {
    loading: true,
    saving: false,
    profile: null,
    profileInitial: '悟',
    hasBoundPhone: false,
    form: {
      name: '',
      phone: '',
      bio: ''
    }
  },

  onLoad() {
    void this.loadPageData()
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
        form: {
          name: pageData.profile.name || '',
          phone: pageData.profile.phone || '',
          bio: pageData.profile.bio || ''
        }
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '个人信息加载失败',
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

  async handleWechatPhoneBind(event) {
    const code = event && event.detail ? (event.detail.code || '') : ''
    if (!code) {
      wx.showToast({
        title: '手机号授权已取消',
        icon: 'none'
      })
      return
    }

    this.setData({ saving: true })
    try {
      await bindPhoneFromWechatCode(code)
      await this.loadPageData()
      this.setData({ saving: false })
      wx.showToast({
        title: '手机号绑定成功',
        icon: 'success'
      })
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({
        title: error.message || '手机号绑定失败',
        icon: 'none'
      })
    }
  },

  async handleSave() {
    this.setData({ saving: true })

    try {
      const nextProfile = saveLocalProfile({
        name: this.data.form.name,
        bio: this.data.form.bio
      })
      const app = getApp()
      app.globalData.profile = nextProfile
      this.setData({
        saving: false,
        profile: {
          ...this.data.profile,
          ...nextProfile
        },
        profileInitial: (nextProfile.name || '悟').slice(0, 1),
        hasBoundPhone: Boolean(nextProfile.phone)
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
  }
})
