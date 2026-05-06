Component({
  data: {
    selectedPath: '/pages/home/index',
    tabs: [
      {
        key: 'home',
        pagePath: '/pages/home/index',
        text: '首页',
        icon: '/assets/tabbar-custom/home.svg',
        iconClass: 'tabbar-icon-home'
      },
      {
        key: 'shop',
        pagePath: '/pages/shop/index',
        text: '工坊',
        icon: '/assets/tabbar-custom/shop.svg',
        iconClass: 'tabbar-icon-shop'
      },
      {
        key: 'aware',
        pagePath: '/pages/aware/index',
        text: '觉察',
        icon: '/assets/tabbar-custom/aware.svg',
        iconClass: 'tabbar-icon-aware'
      },
      {
        key: 'profile',
        pagePath: '/pages/profile/index',
        text: '我的',
        icon: '/assets/tabbar-custom/profile.svg',
        iconClass: 'tabbar-icon-profile'
      }
    ]
  },

  lifetimes: {
    attached() {
      this.updateSelectedPath()
    }
  },

  pageLifetimes: {
    show() {
      this.updateSelectedPath()
    }
  },

  methods: {
    updateSelectedPath() {
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      const currentPath = currentPage ? `/${currentPage.route}` : '/pages/home/index'

      this.setData({
        selectedPath: currentPath
      })
    },

    handleTabTap(event) {
      const { path } = event.currentTarget.dataset
      if (!path || path === this.data.selectedPath) {
        return
      }

      wx.switchTab({ url: path })
    }
  }
})
