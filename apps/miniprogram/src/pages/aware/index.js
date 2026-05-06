const { listPopularTags, listUserTags, publishAwareTag, getTagDetailByKey } = require('../../utils/aware')
const { openMiniRoute, syncMiniTabBar } = require('../../utils/navigation')
const { getPageMastheadSettings } = require('../../utils/pageMasthead')

const PENDING_PRODUCT_STORAGE_KEY = 'liwu_mp_pending_shop_product_id'
const CLOUD_WIDTH_RPX = 610
const CLOUD_MIN_HEIGHT_RPX = 1220
const CLOUD_GAP_RPX = 10
const CLOUD_SCAN_STEP_RPX = 8
const CLOUD_PADDING_X_RPX = 36
const CLOUD_PADDING_Y_RPX = 24

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

const getStableSeedFromText = (value = '') => (
  String(value || '')
    .split('')
    .reduce((sum, char, index) => sum + (char.charCodeAt(0) * (index + 1)), 0)
)

const estimateTagBox = (tag = {}, fontSize = 26) => {
  const content = String(tag.content || '')
  const charWeight = content.split('').reduce((total, char) => (
    total + (/[\u3400-\u9FFF\uF900-\uFAFF]/u.test(char) ? 1 : 0.62)
  ), 0)

  return {
    width: Math.max(92, Math.round((charWeight * fontSize) + CLOUD_PADDING_X_RPX)),
    height: Math.max(48, Math.round(fontSize * 1.35) + CLOUD_PADDING_Y_RPX)
  }
}

const overlaps = (left, right, gap = CLOUD_GAP_RPX) => !(
  left.x + left.width + gap <= right.x ||
  right.x + right.width + gap <= left.x ||
  left.y + left.height + gap <= right.y ||
  right.y + right.height + gap <= left.y
)

const inBounds = (rect, width, height) => (
  rect.x >= 0 &&
  rect.y >= 0 &&
  rect.x + rect.width <= width &&
  rect.y + rect.height <= height
)

const buildWordCloudLayout = (tags = []) => {
  const width = CLOUD_WIDTH_RPX
  const height = Math.max(CLOUD_MIN_HEIGHT_RPX, 520 + (tags.length * 18))
  const centerX = width / 2
  const centerY = height / 2
  const placed = []

  const items = tags.map((tag, index) => {
    const fontSize = getFontSize(tag.totalCount || 0, tags[0]?.totalCount || 0)
    const box = estimateTagBox(tag, fontSize)
    const seed = getStableSeedFromText(tag.key || tag.content || String(index))
    let chosen = null

    for (let attempt = 0; attempt < 900; attempt += 1) {
      const angle = (seed % 360) * (Math.PI / 180) + (attempt * 0.58)
      const radius = 4 + Math.pow(attempt, 0.88) * 4.2
      const rect = {
        x: Math.round(centerX + Math.cos(angle) * radius - (box.width / 2)),
        y: Math.round(centerY + Math.sin(angle) * radius * 0.78 - (box.height / 2)),
        width: box.width,
        height: box.height
      }

      if (!inBounds(rect, width, height)) {
        continue
      }

      if (placed.every((itemRect) => !overlaps(rect, itemRect))) {
        chosen = rect
        break
      }
    }

    if (!chosen) {
      outerLoop:
      for (let top = CLOUD_SCAN_STEP_RPX; top <= height - box.height - CLOUD_SCAN_STEP_RPX; top += CLOUD_SCAN_STEP_RPX) {
        for (let left = CLOUD_SCAN_STEP_RPX; left <= width - box.width - CLOUD_SCAN_STEP_RPX; left += CLOUD_SCAN_STEP_RPX) {
          const rect = {
            x: left,
            y: top,
            width: box.width,
            height: box.height
          }

          if (placed.every((itemRect) => !overlaps(rect, itemRect, 4))) {
            chosen = rect
            break outerLoop
          }
        }
      }
    }

    if (!chosen) {
      chosen = {
        x: Math.max(0, Math.round(centerX - (box.width / 2))),
        y: Math.min(height - box.height, Math.max(0, (index * (box.height + 8)) % Math.max(box.height + 8, height - box.height))),
        width: box.width,
        height: box.height
      }
    }

    placed.push(chosen)

    return {
      ...tag,
      fontSize,
      _rect: chosen
    }
  })

  const bounds = items.reduce((result, item) => ({
    minX: Math.min(result.minX, item._rect.x),
    minY: Math.min(result.minY, item._rect.y),
    maxX: Math.max(result.maxX, item._rect.x + item._rect.width),
    maxY: Math.max(result.maxY, item._rect.y + item._rect.height)
  }), {
    minX: width,
    minY: height,
    maxX: 0,
    maxY: 0
  })

  const offsetX = Math.round((width / 2) - ((bounds.minX + bounds.maxX) / 2))
  const offsetY = Math.round((height / 2) - ((bounds.minY + bounds.maxY) / 2))

  const layout = items.map((item) => {
    const left = Math.min(Math.max(0, item._rect.x + offsetX), width - item._rect.width)
    const top = Math.min(Math.max(0, item._rect.y + offsetY), height - item._rect.height)

    return {
      ...item,
      style: `left:${left}rpx;top:${top}rpx;font-size:${item.fontSize}rpx;`
    }
  })

  const maxBottom = layout.reduce((currentMax, item) => Math.max(currentMax, item._rect.height + Number(item.style.match(/top:(\d+)rpx;/)?.[1] || 0)), 0)

  return {
    cloudHeight: Math.max(CLOUD_MIN_HEIGHT_RPX, maxBottom + 24),
    items: layout
  }
}

Page({
  data: {
    loading: true,
    saving: false,
    inputValue: '',
    myTags: [],
    popularTags: [],
    cloudHeight: CLOUD_MIN_HEIGHT_RPX,
    awarenessSlogan: '把此刻命名清楚，再安静地把它交还给自己。',
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
      const [myTags, popularTags, mastheadSettings] = await Promise.all([
        listUserTags(8),
        listPopularTags(),
        getPageMastheadSettings()
      ])

      const maxCount = popularTags.reduce((currentMax, tag) => Math.max(currentMax, tag.totalCount || 0), 0)
      const cloudLayout = buildWordCloudLayout(
        popularTags.map((tag) => ({
          ...tag,
          fontSize: getFontSize(tag.totalCount || 0, maxCount)
        }))
      )

      this.setData({
        loading: false,
        myTags,
        popularTags: cloudLayout.items,
        cloudHeight: cloudLayout.cloudHeight,
        awarenessSlogan: mastheadSettings.awarenessSlogan || '把此刻命名清楚，再安静地把它交还给自己。'
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
