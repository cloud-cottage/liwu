const { listUserOrders } = require('../../../utils/shop')

Page({
  data: {
    loading: true,
    orders: []
  },

  onLoad() {
    void this.loadOrders()
  },

  async onPullDownRefresh() {
    await this.loadOrders()
    wx.stopPullDownRefresh()
  },

  async loadOrders() {
    this.setData({ loading: true })

    try {
      const orders = await listUserOrders()
      this.setData({
        loading: false,
        orders
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '订单加载失败',
        icon: 'none'
      })
    }
  }
})
