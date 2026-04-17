const { listPopularTags, listUserTags, publishAwareTag } = require('../../utils/aware')

const getFontSize = (count, maxCount) => {
  if (!maxCount || count >= maxCount) {
    return 42
  }

  if (count >= Math.max(2, Math.ceil(maxCount * 0.66))) {
    return 36
  }

  if (count >= Math.max(2, Math.ceil(maxCount * 0.4))) {
    return 32
  }

  return 28
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
      const [myTags, popularTags] = await Promise.all([
        listUserTags(8),
        listPopularTags(18)
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

  onShareAppMessage() {
    return {
      title: '来理悟小程序，一起觉察当下',
      path: '/pages/aware/index'
    }
  }
})
