const { getHomePageData } = require('../../utils/home')
const { openMiniRoute, syncMiniTabBar } = require('../../utils/navigation')
const { getPageMastheadSettings } = require('../../utils/pageMasthead')

const APP_TAGLINES = [
  'be clear with Liwu',
  'be smart with Liwu',
  'be rich with Liwu',
  'be healthy with Liwu'
]

Page({
  data: {
    loading: true,
    profile: null,
    slides: [],
    showcaseItems: [],
    taglineIndex: 0,
    taglines: APP_TAGLINES,
    homeSlogan: '礼敬物品，礼赞生命。'
  },

  onLoad() {
    void this.loadPageData()
    this.startTaglineRotation()
  },

  onShow() {
    syncMiniTabBar(this, '/pages/home/index')
  },

  onHide() {
    this.stopTaglineRotation()
  },

  onUnload() {
    this.stopTaglineRotation()
  },

  async loadPageData() {
    this.setData({ loading: true })

    try {
      const [pageData, mastheadSettings] = await Promise.all([
        getHomePageData(),
        getPageMastheadSettings()
      ])
      this.setData({
        loading: false,
        profile: pageData.profile,
        homeSlogan: mastheadSettings.homeSlogan || '礼敬物品，礼赞生命。',
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

  startTaglineRotation() {
    this.stopTaglineRotation()
    this.taglineTimer = setInterval(() => {
      const nextIndex = (this.data.taglineIndex + 1) % APP_TAGLINES.length
      this.setData({ taglineIndex: nextIndex })
    }, 2200)
  },

  stopTaglineRotation() {
    if (this.taglineTimer) {
      clearInterval(this.taglineTimer)
      this.taglineTimer = null
    }
  },

  handleMeditationTap() {
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
