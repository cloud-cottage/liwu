const { listUserOrders } = require('../../../utils/shop')

const ORDER_STATUS_LABELS = {
  pending_payment: '待支付',
  paid: '已支付',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消'
}

const formatOrderTime = (value = '') => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}/${month}/${day} ${hour}:${minute}`
}

const decorateOrders = (orders = []) => (
  orders.map((order) => ({
    ...order,
    statusLabel: ORDER_STATUS_LABELS[order.status] || '处理中',
    createdAtLabel: formatOrderTime(order.createdAt),
    itemCount: (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  }))
)

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
      const orders = decorateOrders(await listUserOrders())
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
