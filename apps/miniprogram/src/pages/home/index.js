const { getHomePageData } = require('../../utils/home')
const { openMiniRoute, syncMiniTabBar } = require('../../utils/navigation')

Page({
  data: {
    loading: true,
    profile: null,
    tags: [],
    slides: [],
    showcaseItems: [],
    cards: [
      { title: '静寂', subtitle: '开始今日 15 分钟冥想', path: '/pages/meditation/index' },
      { title: '工坊', subtitle: '看看今日可兑换的物品', path: '/pages/shop/index' },
      { title: '我的', subtitle: '管理资料与收货地址', path: '/pages/profile/index' }
    ]
  },

  onLoad() {
    void this.loadPageData()
  },

  onShow() {
    syncMiniTabBar(this, '/pages/home/index')
  },

  async loadPageData() {
    this.setData({ loading: true })

    try {
      const pageData = await getHomePageData()
      this.setData({
        loading: false,
        profile: pageData.profile,
        tags: pageData.tags,
        slides: (pageData.slides || []).map((slide) => ({
          ...slide,
          hasImage: !!slide.imageUrl,
          heroStyle: slide.imageUrl
            ? `background-image: linear-gradient(180deg, rgba(15, 23, 42, 0.08) 0%, rgba(15, 23, 42, 0.28) 100%), url(${slide.imageUrl});`
            : ''
        })),
        showcaseItems: pageData.showcaseItems
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
    openMiniRoute(path)
  },

  handleAwareTap() {
    openMiniRoute('/pages/meditation/index')
  },

  handleShopTap() {
    openMiniRoute('/pages/shop/index')
  },

  onShareAppMessage() {
    return {
      title: '理悟小程序',
      path: '/pages/home/index'
    }
  }
})
