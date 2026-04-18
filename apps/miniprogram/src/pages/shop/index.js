const {
  listShopCategories,
  listShopProducts,
  getShopProductDetail,
  listUserAddresses,
  saveUserAddress,
  createPointsOrder,
  getCurrentShopProfile
} = require('../../utils/shop')
const { openMiniRoute } = require('../../utils/navigation')

const EMPTY_ADDRESS = {
  receiverName: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  detailAddress: '',
  postalCode: '',
  label: '家',
  isDefault: true
}

const PRODUCT_TYPE_LABELS = {
  physical: '实物寄送',
  digital: '数字内容',
  service: '服务体验'
}

const PRODUCT_STATUS_LABELS = {
  active: '可兑换',
  draft: '待上架',
  archived: '已归档',
  sold_out: '已售罄'
}

const SHOP_TONES = [
  {
    gradient: 'linear-gradient(135deg, #f8d8b8 0%, #f0a271 100%)',
    accent: '#8f4d28',
    shadow: 'rgba(201, 111, 39, 0.22)'
  },
  {
    gradient: 'linear-gradient(135deg, #d9e7f2 0%, #8eb6cd 100%)',
    accent: '#365e73',
    shadow: 'rgba(54, 94, 115, 0.2)'
  },
  {
    gradient: 'linear-gradient(135deg, #e7decc 0%, #bca781 100%)',
    accent: '#695237',
    shadow: 'rgba(105, 82, 55, 0.2)'
  },
  {
    gradient: 'linear-gradient(135deg, #e1ecd6 0%, #92ab7e 100%)',
    accent: '#4f6742',
    shadow: 'rgba(79, 103, 66, 0.2)'
  }
]

Page({
  data: {
    loading: true,
    submitting: false,
    categories: [],
    products: [],
    addresses: [],
    walletBalance: 0,
    activeCategoryId: '',
    selectedCategory: null,
    selectedCategoryName: '全部',
    selectedCategoryDescription: '从日常仪式、空间器物到心意礼物，挑一件适合此刻练习的物品。',
    activeProduct: null,
    showProductModal: false,
    selectedSkuId: '',
    addressDraft: { ...EMPTY_ADDRESS }
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
      const activeCategoryId = this.data.activeCategoryId || ''
      const [categories, products, addresses, profile] = await Promise.all([
        listShopCategories(),
        listShopProducts({ categoryId: activeCategoryId }),
        listUserAddresses(),
        getCurrentShopProfile()
      ])

      const selectedCategory = getSelectedCategory(categories, activeCategoryId)
      this.setData({
        loading: false,
        categories,
        products: decorateProducts(products, categories),
        addresses,
        walletBalance: profile.balance,
        selectedCategory,
        ...getCategoryPresentation(selectedCategory)
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '工坊加载失败',
        icon: 'none'
      })
    }
  },

  async handleCategoryTap(event) {
    const categoryId = event.currentTarget.dataset.categoryId || ''
    this.setData({
      activeCategoryId: categoryId,
      loading: true
    })

    try {
      const products = await listShopProducts({ categoryId })
      const selectedCategory = getSelectedCategory(this.data.categories, categoryId)
      this.setData({
        loading: false,
        products: decorateProducts(products, this.data.categories),
        selectedCategory,
        ...getCategoryPresentation(selectedCategory)
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '商品加载失败',
        icon: 'none'
      })
    }
  },

  async handleProductTap(event) {
    const { productId } = event.currentTarget.dataset

    try {
      const detail = await getShopProductDetail(productId)
      if (!detail) {
        wx.showToast({
          title: '商品详情不存在',
          icon: 'none'
        })
        return
      }

      this.setData({
        activeProduct: decorateProduct(detail, this.data.categories),
        showProductModal: true,
        selectedSkuId: detail.skus[0]?.id || '',
        addressDraft: addressesToDraft(this.data.addresses)
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '详情加载失败',
        icon: 'none'
      })
    }
  },

  handleCloseProductModal() {
    this.setData({
      activeProduct: null,
      showProductModal: false,
      selectedSkuId: '',
      addressDraft: { ...EMPTY_ADDRESS }
    })
  },

  handleSkuTap(event) {
    this.setData({
      selectedSkuId: event.currentTarget.dataset.skuId
    })
  },

  handleAddressInput(event) {
    const { field } = event.currentTarget.dataset
    this.setData({
      [`addressDraft.${field}`]: event.detail.value
    })
  },

  async handleSaveAddress() {
    try {
      const address = await saveUserAddress(this.data.addressDraft)
      const addresses = await listUserAddresses()
      this.setData({
        addresses,
        addressDraft: {
          ...address,
          receiverName: address.receiverName,
          detailAddress: address.detailAddress,
          postalCode: address.postalCode
        }
      })
      wx.showToast({
        title: '地址已保存',
        icon: 'success'
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '地址保存失败',
        icon: 'none'
      })
    }
  },

  async handleCreateOrder() {
    if (!this.data.activeProduct) {
      return
    }

    this.setData({ submitting: true })

    try {
      const result = await createPointsOrder({
        productId: this.data.activeProduct.id,
        skuId: this.data.selectedSkuId,
        addressId: this.data.addressDraft.id || ''
      })
      this.setData({
        submitting: false,
        walletBalance: result.balance
      })
      wx.showToast({
        title: `兑换成功：${result.orderNo}`,
        icon: 'success'
      })
      this.handleCloseProductModal()
    } catch (error) {
      this.setData({ submitting: false })
      wx.showToast({
        title: error.message || '兑换失败',
        icon: 'none'
      })
    }
  },

  handleGoOrders() {
    openMiniRoute('/pages/shop/orders/index')
  },

  handleGoAddresses() {
    openMiniRoute('/pages/profile/addresses/index')
  },

  noop() {}
})

const addressesToDraft = (addresses = []) => {
  const currentAddress = addresses.find((item) => item.isDefault) || addresses[0]

  if (!currentAddress) {
    return { ...EMPTY_ADDRESS }
  }

  return {
    ...currentAddress
  }
}

const hashValue = (value = '') => (
  String(value)
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0)
)

const getShopTone = (seed = '') => SHOP_TONES[hashValue(seed) % SHOP_TONES.length]

const formatCash = (value) => (value ? `¥${Number(value).toFixed(2)}` : '')

const formatPriceLabel = (points, cash) => `${Number(points || 0)} 福豆${cash ? ` + ${formatCash(cash)}` : ''}`

const getSelectedCategory = (categories = [], categoryId = '') => (
  categories.find((item) => item.id === categoryId) || null
)

const getCategoryPresentation = (category) => ({
  selectedCategoryName: category ? category.name : '全部陈列',
  selectedCategoryDescription: category && category.description
    ? category.description
    : '从日常仪式、空间器物到心意礼物，挑一件适合此刻练习的物品。'
})

const getCoverStyle = (product = {}, tone) => (
  product.coverImage
    ? `background-image: linear-gradient(180deg, rgba(15, 23, 42, 0.08) 0%, rgba(15, 23, 42, 0.34) 100%), url(${product.coverImage}); background-size: cover; background-position: center;`
    : `background-image: ${tone.gradient};`
)

const decorateProduct = (product = {}, categories = []) => {
  const category = getSelectedCategory(categories, product.categoryId)
  const tone = getShopTone(product.categoryId || product.name)

  return {
    ...product,
    categoryName: category ? category.name : '工坊',
    subtitleText: product.subtitle || product.description || '等待补充商品描述',
    priceLabel: formatPriceLabel(product.pricePointsFrom, product.priceCashFrom),
    badgeLabel: product.limitPerUser ? `限兑 ${product.limitPerUser}` : (PRODUCT_TYPE_LABELS[product.productType] || '福豆兑换'),
    statusLabel: PRODUCT_STATUS_LABELS[product.status] || PRODUCT_STATUS_LABELS.active,
    monogram: (product.name || '礼').slice(0, 1),
    coverStyle: getCoverStyle(product, tone),
    accentColor: tone.accent,
    shadowColor: tone.shadow,
    skus: (product.skus || []).map((sku) => ({
      ...sku,
      priceLabel: formatPriceLabel(sku.pricePoints, sku.priceCash)
    }))
  }
}

const decorateProducts = (products = [], categories = []) => products.map((product) => decorateProduct(product, categories))
