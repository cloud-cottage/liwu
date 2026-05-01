const { TAB_META, formatBadgeBonusText, getBadgeAlbumPageData, equipBadge } = require('../../../utils/badges')

Page({
  data: {
    loading: true,
    saving: false,
    activeTab: 'growth',
    groupedBadges: {
      growth: [],
      builder: []
    },
    summary: {
      growth: { unlockedSeriesCount: 0, totalSeriesCount: 0 },
      builder: { unlockedSeriesCount: 0, totalSeriesCount: 0 }
    },
    activeBadge: null,
    showBadgeModal: false
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
      const pageData = await getBadgeAlbumPageData()
      this.setData({
        loading: false,
        groupedBadges: pageData.groupedBadges,
        summary: pageData.summary
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '纪念册加载失败',
        icon: 'none'
      })
    }
  },

  handleTabChange(event) {
    const { tabKey } = event.currentTarget.dataset
    this.setData({
      activeTab: tabKey
    })
  },

  handleBadgeTap(event) {
    const { badge } = event.currentTarget.dataset
    this.setData({
      activeBadge: {
        ...badge,
        bonusSummary: formatBadgeBonusText(badge)
      },
      showBadgeModal: true
    })
  },

  handleCloseModal() {
    this.setData({
      activeBadge: null,
      showBadgeModal: false
    })
  },

  async handleEquipBadge() {
    const badge = this.data.activeBadge
    if (!badge || !badge.earned) {
      return
    }

    this.setData({ saving: true })

    try {
      const pageData = await equipBadge(badge.badgeId)
      const activeTabBadges = pageData.groupedBadges[this.data.activeTab] || []
      const nextActiveBadge = activeTabBadges.find((item) => item.badgeId === badge.badgeId) || null

      this.setData({
        saving: false,
        groupedBadges: pageData.groupedBadges,
        summary: pageData.summary,
        activeBadge: nextActiveBadge ? { ...nextActiveBadge, bonusSummary: formatBadgeBonusText(nextActiveBadge) } : null,
        showBadgeModal: Boolean(nextActiveBadge)
      })
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({
        title: error.message || '佩戴失败',
        icon: 'none'
      })
    }
  },

  noop() {},

  onShareAppMessage() {
    return {
      title: '来理悟看看我的花开纪念册',
      path: '/pages/profile/album/index'
    }
  }
})
