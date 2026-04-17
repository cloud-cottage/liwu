const { getHomePageData } = require('../../utils/home')

Page({
  data: {
    loading: true,
    profile: null,
    tags: [],
    cards: [
      { title: '觉察', subtitle: '进入 aware 页面记录当下状态', path: '/pages/aware/index' },
      { title: '工坊', subtitle: '查看工坊占位页', path: '/pages/shop/index' },
      { title: '我的', subtitle: '维护本地小程序资料', path: '/pages/profile/index' }
    ]
  },

  onLoad() {
    void this.loadPageData()
  },

  async loadPageData() {
    this.setData({ loading: true })

    try {
      const pageData = await getHomePageData()
      this.setData({
        loading: false,
        profile: pageData.profile,
        tags: pageData.tags
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '首页加载失败',
        icon: 'none'
      })
    }
  },

  handleCardTap(event) {
    const { path } = event.currentTarget.dataset
    wx.navigateTo({ url: path })
  },

  handleAwareTap() {
    wx.navigateTo({ url: '/pages/aware/index' })
  }
})
