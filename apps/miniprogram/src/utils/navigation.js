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

const syncMiniTabBar = (pageInstance, path = '') => {
  if (!pageInstance || typeof pageInstance.getTabBar !== 'function') {
    return
  }

  const tabBar = pageInstance.getTabBar()
  if (!tabBar || typeof tabBar.setData !== 'function') {
    return
  }

  tabBar.setData({
    selectedPath: path
  })
}

module.exports = {
  openMiniRoute,
  syncMiniTabBar
}
