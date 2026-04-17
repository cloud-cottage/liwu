const { listShopCategories, listShopProducts, getShopProductDetail, listUserAddresses, saveUserAddress, createPointsOrder } = require('../../utils/shop')

Page({
  data: {
    loading: true,
    submitting: false,
    categories: [],
    products: [],
    addresses: [],
    activeCategoryId: '',
    activeProduct: null,
    showProductModal: false,
    selectedSkuId: '',
    addressDraft: {
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
      const [categories, products, addresses] = await Promise.all([
        listShopCategories(),
        listShopProducts(),
        listUserAddresses()
      ])

      this.setData({
        loading: false,
        categories,
        products,
        addresses
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
      this.setData({
        loading: false,
        products
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
        activeProduct: detail,
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
      addressDraft: {
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
      this.setData({ submitting: false })
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

  noop() {}
})

const addressesToDraft = (addresses = []) => {
  const currentAddress = addresses.find((item) => item.isDefault) || addresses[0]

  if (!currentAddress) {
    return {
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
  }

  return {
    ...currentAddress
  }
}
