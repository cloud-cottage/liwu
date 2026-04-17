const TAB_PAGES = new Set([
  '/pages/home/index',
  '/pages/shop/index',
  '/pages/aware/index',
  '/pages/profile/index'
])

const openMiniRoute = (url) => {
  if (TAB_PAGES.has(url)) {
    wx.switchTab({ url })
    return
  }

  wx.navigateTo({ url })
}

module.exports = {
  openMiniRoute
}
