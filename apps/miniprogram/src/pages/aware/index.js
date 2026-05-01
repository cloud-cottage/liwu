const { listPopularTags, listUserTags, publishAwareTag, getTagDetailByKey } = require('../../utils/aware')
const { openMiniRoute, syncMiniTabBar } = require('../../utils/navigation')

const PENDING_PRODUCT_STORAGE_KEY = 'liwu_mp_pending_shop_product_id'

const getFontSize = (count, maxCount) => {
  if (!maxCount || count >= maxCount) {
    return 40
  }

  if (count >= Math.max(2, Math.ceil(maxCount * 0.66))) {
    return 34
  }

  if (count >= Math.max(2, Math.ceil(maxCount * 0.4))) {
    return 30
  }

  return 26
}

Page({
  data: {
    loading: true,
    saving: false,
    inputValue: '',
    myTags: [],
    popularTags: [],
    activeTag: null,
    showTagModal: false
  },

  onLoad(options = {}) {
    this.pendingTagKey = options.tagKey ? decodeURIComponent(options.tagKey) : ''
    void this.loadPageData()
  },

  onShow() {
    syncMiniTabBar(this, '/pages/aware/index')
  },

  async onPullDownRefresh() {
    await this.loadPageData()
    wx.stopPullDownRefresh()
  },

  async loadPageData() {
    this.setData({ loading: true })

    try {
      const [myTags, popularTags] = await Promise.all([
        listUserTags(8),
        listPopularTags()
      ])

      const maxCount = popularTags.reduce((currentMax, tag) => Math.max(currentMax, tag.totalCount || 0), 0)

      this.setData({
        loading: false,
        myTags,
        popularTags: popularTags.map((tag) => ({
          ...tag,
          fontSize: getFontSize(tag.totalCount || 0, maxCount)
        }))
      })
      await this.openPendingTag()
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '觉察数据加载失败',
        icon: 'none'
      })
    }
  },

  handleInput(event) {
    this.setData({ inputValue: event.detail.value })
  },

  async handlePublish() {
    const content = (this.data.inputValue || '').trim()
    if (!content) {
      wx.showToast({ title: '请输入标签内容', icon: 'none' })
      return
    }

    this.setData({ saving: true })

    try {
      await publishAwareTag({ content })
      this.setData({
        saving: false,
        inputValue: '',
        showTagModal: false,
        activeTag: null
      })
      wx.showToast({ title: '发布成功', icon: 'success' })
      await this.loadPageData()
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({
        title: error.message || '发布失败',
        icon: 'none'
      })
    }
  },

  handleTagTap(event) {
    const tag = event.currentTarget.dataset.tag
    this.setData({
      activeTag: tag,
      showTagModal: true
    })
  },

  handleCloseTagModal() {
    this.setData({
      showTagModal: false,
      activeTag: null
    })
  },

  noop() {},

  async handleRepublishTag() {
    if (!this.data.activeTag) {
      return
    }

    this.setData({
      inputValue: this.data.activeTag.content
    })
    await this.handlePublish()
  },

  handleOpenRelatedProduct() {
    const productId = this.data.activeTag?.relatedProduct?.id
    if (!productId) {
      return
    }

    wx.setStorageSync(PENDING_PRODUCT_STORAGE_KEY, productId)
    this.handleCloseTagModal()
    openMiniRoute('/pages/shop/index')
  },

  async openPendingTag() {
    if (!this.pendingTagKey) {
      return
    }

    const tagKey = this.pendingTagKey
    this.pendingTagKey = ''

    try {
      const tagDetail = await getTagDetailByKey(tagKey)
      if (!tagDetail) {
        return
      }

      this.setData({
        activeTag: tagDetail,
        showTagModal: true
      })
    } catch {
      // ignore shared tag resolution failures
    }
  },

  onShareAppMessage(event) {
    if (event?.from === 'button' && event.target?.dataset?.shareType === 'tag' && this.data.activeTag) {
      const activeTag = this.data.activeTag
      return {
        title: `刚刚在「理悟」记录下此刻的觉察：${activeTag.content}`,
        path: `/pages/aware/index?tagKey=${encodeURIComponent(activeTag.key || '')}`
      }
    }

    return {
      title: '来理悟小程序，一起觉察当下',
      path: '/pages/aware/index'
    }
  }
})
