const { listUserAddresses, saveUserAddress } = require('../../../utils/shop')

const createEmptyAddress = () => ({
  id: '',
  receiverName: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  detailAddress: '',
  postalCode: '',
  label: '家',
  isDefault: true
})

Page({
  data: {
    loading: true,
    saving: false,
    addresses: [],
    draft: createEmptyAddress()
  },

  onLoad() {
    void this.loadAddresses()
  },

  async onPullDownRefresh() {
    await this.loadAddresses()
    wx.stopPullDownRefresh()
  },

  async loadAddresses() {
    this.setData({ loading: true })
    try {
      const addresses = await listUserAddresses()
      this.setData({
        loading: false,
        addresses,
        draft: addresses[0] ? { ...addresses[0] } : createEmptyAddress()
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '地址加载失败',
        icon: 'none'
      })
    }
  },

  handleInput(event) {
    const { field } = event.currentTarget.dataset
    this.setData({
      [`draft.${field}`]: event.detail.value
    })
  },

  handleAddressTap(event) {
    const { address } = event.currentTarget.dataset
    this.setData({
      draft: {
        ...address
      }
    })
  },

  async handleSave() {
    this.setData({ saving: true })
    try {
      await saveUserAddress(this.data.draft)
      this.setData({ saving: false })
      wx.showToast({
        title: '地址已保存',
        icon: 'success'
      })
      await this.loadAddresses()
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({
        title: error.message || '地址保存失败',
        icon: 'none'
      })
    }
  }
})
