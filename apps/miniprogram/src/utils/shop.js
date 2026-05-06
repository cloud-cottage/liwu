const { getDb } = require('./cloudbase')
const { getLocalProfile } = require('./storage')

const SHOP_CATEGORIES = 'shop_categories'
const SHOP_PRODUCTS = 'shop_products'
const SHOP_PRODUCT_SKUS = 'shop_product_skus'
const SHOP_ORDERS = 'shop_orders'
const SHOP_ORDER_ITEMS = 'shop_order_items'
const USER_ADDRESSES = 'user_addresses'
const USERS = 'users'
const POINT_LEDGER = 'point_ledger'
const APP_SETTINGS = 'app_settings'
const SHOP_HOME_LIVING_SETTINGS_KEY = 'shop_home_living_settings'
const DEFAULT_USER_NAME_PREFIX = '觉醒伙伴'
const DEFAULT_SHOP_HOME_LIVING_CARDS = Array.from({ length: 6 }, (_, index) => ({
  id: `shop_living_${index + 1}`,
  fileId: '',
  imageUrl: `/assets/shop-living/living-${index + 1}.svg`,
  productId: '',
  width: 700,
  height: 700
}))

const parseNaturalNumber = (value = '') => {
  const normalizedValue = String(value || '').trim()
  if (!/^\d+$/.test(normalizedValue)) {
    return 0
  }

  const parsedValue = Number(normalizedValue)
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    return 0
  }

  return parsedValue
}

const formatNaturalNumber = (value) => String(Math.max(1, Number(value) || 1))

const buildDefaultUserName = (uid = '') => `${DEFAULT_USER_NAME_PREFIX}${formatNaturalNumber(uid)}`

const isSystemGeneratedUserName = (value = '') => {
  const normalizedValue = String(value || '').trim()

  return (
    !normalizedValue ||
    /^用户\d*$/.test(normalizedValue) ||
    /^小悟[\da-z]+$/i.test(normalizedValue) ||
    /^觉醒伙伴\d+$/.test(normalizedValue)
  )
}

const getUserUid = (user = {}) => (
  parseNaturalNumber(user.uid)
)

const normalizeCategory = (category = {}) => ({
  id: category._id || category.id || '',
  name: category.name || '',
  slug: category.slug || '',
  sortOrder: Number(category.sort_order ?? category.sortOrder ?? 0),
  status: category.status || 'active',
  description: category.description || '',
  coverImage: category.cover_image || category.coverImage || ''
})

const normalizeProduct = (product = {}) => ({
  id: product._id || product.id || '',
  name: product.name || '',
  subtitle: product.subtitle || '',
  categoryId: product.category_id || product.categoryId || '',
  relatedProductId: product.related_product_id || product.relatedProductId || '',
  productType: product.product_type || product.productType || 'physical',
  coverImage: product.cover_image || product.coverImage || '',
  description: product.description || '',
  status: product.status || 'draft',
  skuMode: product.sku_mode || product.skuMode || 'single',
  pricePointsFrom: Number(product.price_points_from ?? product.pricePointsFrom ?? 0),
  priceCashFrom: Number(product.price_cash_from ?? product.priceCashFrom ?? 0),
  stockTotal: Number(product.stock_total ?? product.stockTotal ?? 0),
  salesCount: Number(product.sales_count ?? product.salesCount ?? 0),
  limitPerUser: Number(product.limit_per_user ?? product.limitPerUser ?? 0),
  sortOrder: Number(product.sort_order ?? product.sortOrder ?? 0)
})

const normalizeSku = (sku = {}) => ({
  id: sku._id || sku.id || '',
  productId: sku.product_id || sku.productId || '',
  skuName: sku.sku_name || sku.skuName || '',
  pricePoints: Number(sku.price_points ?? sku.pricePoints ?? 0),
  priceCash: Number(sku.price_cash ?? sku.priceCash ?? 0),
  rewardPointsReturn: Number(sku.reward_points_return ?? sku.rewardPointsReturn ?? 0),
  stock: Number(sku.stock ?? 0),
  status: sku.status || 'active'
})

const normalizeAddress = (address = {}) => ({
  id: address._id || address.id || '',
  userId: address.user_id || address.userId || '',
  receiverName: address.receiver_name || address.receiverName || '',
  phone: address.phone || '',
  province: address.province || '',
  city: address.city || '',
  district: address.district || '',
  detailAddress: address.detail_address || address.detailAddress || '',
  postalCode: address.postal_code || address.postalCode || '',
  label: address.label || '',
  isDefault: Boolean(address.is_default ?? address.isDefault)
})

const getOrCreateCurrentUser = async () => {
  const db = getDb()
  const profile = getLocalProfile()
  let existingUser = null

  if (profile.authorKey) {
    const result = await db.collection(USERS).where({ auth_uid: profile.authorKey }).limit(1).get()
    existingUser = (result.data || [])[0] || null
  }

  if (!existingUser && profile.phone) {
    const phoneResult = await db.collection(USERS).where({ phone: profile.phone }).limit(1).get()
    existingUser = (phoneResult.data || [])[0] || null
  }

  if (existingUser) {
    const resolvedUid = getUserUid(existingUser) || await getNextUserUid(db)
    const updatePayload = {
      updated_at: new Date().toISOString(),
      last_active: new Date().toISOString()
    }

    if (profile.authorKey && (existingUser.auth_uid || '') !== profile.authorKey) {
      updatePayload.auth_uid = profile.authorKey
    }

    if (profile.phone && (existingUser.phone || '') !== profile.phone) {
      updatePayload.phone = profile.phone
    }

    if (Number(existingUser.uid || 0) !== resolvedUid) {
      updatePayload.uid = resolvedUid
    }

    if (isSystemGeneratedUserName(existingUser.name)) {
      updatePayload.name = buildDefaultUserName(resolvedUid)
    }

    if (Object.keys(updatePayload).length > 2) {
      await db.collection(USERS).doc(existingUser._id || existingUser.id || '').update({ data: updatePayload })
      existingUser = {
        ...existingUser,
        ...updatePayload
      }
    }

    return {
      ...profile,
      id: existingUser._id || existingUser.id || '',
      uid: getUserUid(existingUser) || resolvedUid,
      inviteCode: formatNaturalNumber(getUserUid(existingUser) || resolvedUid),
      name: existingUser.name || buildDefaultUserName(resolvedUid),
      phone: existingUser.phone || profile.phone || '',
      isStudent: Boolean(existingUser.is_student ?? existingUser.isStudent),
      studentExpireAt: existingUser.student_expire_at || existingUser.studentExpireAt || '',
      balance: Number(existingUser.balance || 0),
      wealthHistory: existingUser.wealth_history || []
    }
  }

  const nextUid = await getNextUserUid(db)
  const now = new Date().toISOString()
  const payload = {
    uid: nextUid,
    auth_uid: profile.authorKey,
    name: buildDefaultUserName(nextUid),
    phone: profile.phone,
    status: 'active',
    level: 1,
    experience: 0,
    is_student: false,
    inviter_user_id: '',
    balance: 0,
    wealth_history: [],
    reward_claims: {},
    join_date: now.slice(0, 10),
    last_active: now,
    created_at: now,
    updated_at: now
  }

  const createResult = await db.collection(USERS).add({ data: payload })
  return {
    ...profile,
    id: createResult._id || createResult.id || '',
    uid: nextUid,
    inviteCode: formatNaturalNumber(nextUid),
    phone: payload.phone,
    isStudent: false,
    studentExpireAt: '',
    balance: 0,
    wealthHistory: [],
    name: payload.name
  }
}

const getNextUserUid = async (dbInstance = getDb()) => {
  const result = await dbInstance.collection(USERS).limit(2000).get()
  const maxUserUid = (result.data || []).reduce((currentMax, user) => (
    Math.max(currentMax, getUserUid(user))
  ), 0)

  return Number(formatNaturalNumber(maxUserUid + 1))
}

const getCurrentShopProfile = async () => {
  const currentUser = await getOrCreateCurrentUser()

  return {
    id: currentUser.id,
    name: currentUser.name || '',
    uid: Number(currentUser.uid || 0),
    inviteCode: currentUser.inviteCode || '',
    phone: currentUser.phone || '',
    isStudent: Boolean(currentUser.isStudent),
    studentExpireAt: currentUser.studentExpireAt || '',
    balance: Number(currentUser.balance || 0),
    wealthHistory: currentUser.wealthHistory || []
  }
}

const generateOrderNo = () => `MP${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Date.now().toString().slice(-6)}`

const listShopCategories = async () => {
  const db = getDb()
  const result = await db.collection(SHOP_CATEGORIES).limit(50).get()

  return (result.data || [])
    .map(normalizeCategory)
    .filter((category) => category.status === 'active')
    .sort((left, right) => left.sortOrder - right.sortOrder)
}

const listShopProducts = async ({ categoryId = '', limit = 100 } = {}) => {
  const db = getDb()
  const result = await db.collection(SHOP_PRODUCTS).limit(limit).get()

  return (result.data || [])
    .map(normalizeProduct)
    .filter((product) => product.status === 'active')
    .filter((product) => (categoryId ? product.categoryId === categoryId : true))
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder
      }

      return right.salesCount - left.salesCount
    })
}

const getShopHomeLivingSettings = async () => {
  try {
    const db = getDb()
    const result = await db.collection(APP_SETTINGS).where({ key: SHOP_HOME_LIVING_SETTINGS_KEY }).limit(1).get()
    const document = (result.data || [])[0] || {}
    const rawCards = Array.isArray(document.cards) ? document.cards : []
    const imageWidth = Number(document.image_width ?? document.imageWidth ?? 700)
    const imageHeight = Number(document.image_height ?? document.imageHeight ?? 700)
    const cards = DEFAULT_SHOP_HOME_LIVING_CARDS.map((fallbackCard, index) => {
      const currentCard = rawCards[index] || {}
      return {
        ...fallbackCard,
        id: currentCard.id || fallbackCard.id,
        fileId: currentCard.file_id || currentCard.fileId || '',
        imageUrl: currentCard.image_url || currentCard.imageUrl || fallbackCard.imageUrl,
        productId: currentCard.product_id || currentCard.productId || '',
        width: imageWidth,
        height: imageHeight
      }
    })

    const fileList = cards.map((card) => card.fileId).filter(Boolean)
    if (fileList.length === 0) {
      return {
        imageWidth,
        imageHeight,
        cards
      }
    }

    try {
      const tempResult = await wx.cloud.getTempFileURL({ fileList })
      const urlMap = new Map(
        (tempResult.fileList || []).map((item) => [
          item.fileID || item.fileId,
          item.tempFileURL || ''
        ])
      )

      return {
        imageWidth,
        imageHeight,
        cards: cards.map((card) => ({
          ...card,
          imageUrl: urlMap.get(card.fileId) || card.imageUrl || ''
        }))
      }
    } catch {
      return {
        imageWidth,
        imageHeight,
        cards
      }
    }
  } catch {
    return {
      imageWidth: 700,
      imageHeight: 700,
      cards: DEFAULT_SHOP_HOME_LIVING_CARDS
    }
  }
}

const getShopProductDetail = async (productId) => {
  const db = getDb()
  const [productResult, skuResult, categories] = await Promise.all([
    db.collection(SHOP_PRODUCTS).doc(productId).get(),
    db.collection(SHOP_PRODUCT_SKUS).where({ product_id: productId, status: 'active' }).limit(50).get(),
    listShopCategories()
  ])

  const productDoc = productResult.data || {}
  if (!(productDoc._id || productDoc.id)) {
    return null
  }

  const product = normalizeProduct(productDoc)
  let relatedProduct = null

  if (product.relatedProductId) {
    try {
      const relatedProductResult = await db.collection(SHOP_PRODUCTS).doc(product.relatedProductId).get()
      const relatedProductDocument = relatedProductResult.data || {}
      if (relatedProductDocument._id || relatedProductDocument.id) {
        relatedProduct = normalizeProduct(relatedProductDocument)
      }
    } catch (error) {
      relatedProduct = null
    }
  }

  return {
    ...product,
    category: categories.find((item) => item.id === product.categoryId) || null,
    skus: (skuResult.data || []).map(normalizeSku),
    relatedProduct
  }
}

const listUserAddresses = async () => {
  const db = getDb()
  const currentUser = await getOrCreateCurrentUser()
  const result = await db.collection(USER_ADDRESSES).where({ user_id: currentUser.id }).limit(20).get()
  return (result.data || [])
    .map(normalizeAddress)
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
}

const saveUserAddress = async (addressData = {}) => {
  const db = getDb()
  const currentUser = await getOrCreateCurrentUser()

  if (!addressData.receiverName || !addressData.phone || !addressData.province || !addressData.city || !addressData.detailAddress) {
    throw new Error('请填写完整地址信息')
  }

  const payload = {
    user_id: currentUser.id,
    receiver_name: addressData.receiverName,
    phone: addressData.phone,
    province: addressData.province,
    city: addressData.city,
    district: addressData.district || '',
    detail_address: addressData.detailAddress,
    postal_code: addressData.postalCode || '',
    label: addressData.label || '',
    is_default: Boolean(addressData.isDefault),
    updated_at: new Date().toISOString()
  }

  if (payload.is_default) {
    const addresses = await listUserAddresses()
    await Promise.all(addresses.map((address) => (
      db.collection(USER_ADDRESSES).doc(address.id).update({ data: { is_default: false, updated_at: new Date().toISOString() } })
    )))
  }

  if (addressData.id) {
    await db.collection(USER_ADDRESSES).doc(addressData.id).update({ data: payload })
    return normalizeAddress({ _id: addressData.id, ...payload })
  }

  const result = await db.collection(USER_ADDRESSES).add({ data: { ...payload, created_at: new Date().toISOString() } })
  return normalizeAddress({ _id: result._id || result.id || '', ...payload })
}

const createPointsOrder = async ({ productId, skuId, quantity = 1, addressId = '' }) => {
  const db = getDb()
  const currentUser = await getOrCreateCurrentUser()
  const product = await getShopProductDetail(productId)

  if (!product) {
    throw new Error('商品不存在')
  }

  const sku = product.skus.find((item) => item.id === skuId) || product.skus[0] || null
  if (!sku) {
    throw new Error('该商品暂无可下单规格')
  }

  const normalizedQuantity = Math.max(1, Number(quantity) || 1)
  const totalPoints = sku.pricePoints * normalizedQuantity
  const totalCash = sku.priceCash * normalizedQuantity

  if (totalCash > 0) {
    throw new Error('小程序端当前仅支持纯福豆兑换')
  }

  if (currentUser.balance < totalPoints) {
    throw new Error('福豆余额不足')
  }

  let receiverSnapshot = null
  if (product.productType === 'physical') {
    const addresses = await listUserAddresses()
    const address = addresses.find((item) => item.id === addressId) || addresses.find((item) => item.isDefault) || null
    if (!address) {
      throw new Error('请先填写收货地址')
    }

    receiverSnapshot = {
      receiver_name: address.receiverName,
      phone: address.phone,
      province: address.province,
      city: address.city,
      district: address.district,
      detail_address: address.detailAddress,
      postal_code: address.postalCode,
      label: address.label
    }
  }

  const now = new Date().toISOString()
  const nextBalance = currentUser.balance - totalPoints
  const orderPayload = {
    order_no: generateOrderNo(),
    user_id: currentUser.id,
    order_type: 'points',
    status: 'paid',
    address_id: addressId || '',
    receiver_snapshot: receiverSnapshot,
    total_points: totalPoints,
    total_cash: 0,
    shipping_fee: 0,
    discount_cash: 0,
    discount_points: 0,
    pay_channel: 'points',
    pay_transaction_id: '',
    remark: '',
    cancel_reason: '',
    paid_at: now,
    shipped_at: '',
    completed_at: '',
    created_at: now,
    updated_at: now
  }

  const orderResult = await db.collection(SHOP_ORDERS).add({ data: orderPayload })
  const orderId = orderResult._id || orderResult.id || ''

  await db.collection(SHOP_ORDER_ITEMS).add({
    data: {
      order_id: orderId,
      product_id: product.id,
      sku_id: sku.id,
      product_name_snapshot: product.name,
      sku_name_snapshot: sku.skuName || '默认规格',
      cover_snapshot: product.coverImage,
      attrs_snapshot: {},
      price_points_snapshot: sku.pricePoints,
      price_cash_snapshot: sku.priceCash,
      quantity: normalizedQuantity,
      subtotal_points: totalPoints,
      subtotal_cash: 0,
      product_type: product.productType,
      created_at: now
    }
  })

  await db.collection(POINT_LEDGER).add({
    data: {
      user_id: currentUser.id,
      delta: -totalPoints,
      balance_after: nextBalance,
      biz_type: 'shop_spend',
      biz_id: orderId,
      description: `工坊兑换：${product.name}`,
      operator_id: '',
      created_at: now
    }
  })

  const wealthHistoryEntry = {
    id: `shop_spend_${Date.now()}`,
    amount: -totalPoints,
    description: `工坊兑换：${product.name}`,
    date: now,
    type: 'SPEND',
    source: 'shop_spend',
    relatedUserId: currentUser.id
  }

  await db.collection(USERS).doc(currentUser.id).update({
    data: {
      balance: nextBalance,
      wealth_history: [wealthHistoryEntry].concat(currentUser.wealthHistory || []),
      updated_at: now
    }
  })

  return {
    orderId,
    orderNo: orderPayload.order_no,
    balance: nextBalance
  }
}

const listUserOrders = async () => {
  const db = getDb()
  const currentUser = await getOrCreateCurrentUser()
  const [ordersResult, itemsResult] = await Promise.all([
    db.collection(SHOP_ORDERS).where({ user_id: currentUser.id }).limit(100).get(),
    db.collection(SHOP_ORDER_ITEMS).limit(500).get()
  ])

  const itemsByOrderId = {}
  ;(itemsResult.data || []).forEach((item) => {
    const orderId = item.order_id || item.orderId || ''
    if (!itemsByOrderId[orderId]) {
      itemsByOrderId[orderId] = []
    }
    itemsByOrderId[orderId].push(item)
  })

  return (ordersResult.data || [])
    .map((order) => ({
      id: order._id || order.id || '',
      orderNo: order.order_no || order.orderNo || '',
      status: order.status || 'pending_payment',
      totalPoints: Number(order.total_points ?? order.totalPoints ?? 0),
      totalCash: Number(order.total_cash ?? order.totalCash ?? 0),
      createdAt: order.created_at || order.createdAt || '',
      items: (itemsByOrderId[order._id || order.id || ''] || []).map((item) => ({
        id: item._id || item.id || '',
        productName: item.product_name_snapshot || item.productNameSnapshot || '',
        skuName: item.sku_name_snapshot || item.skuNameSnapshot || '',
        quantity: Number(item.quantity ?? 0),
        subtotalPoints: Number(item.subtotal_points ?? item.subtotalPoints ?? 0)
      }))
    }))
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
}

module.exports = {
  listShopCategories,
  listShopProducts,
  getShopHomeLivingSettings,
  getShopProductDetail,
  listUserAddresses,
  saveUserAddress,
  createPointsOrder,
  listUserOrders,
  getCurrentShopProfile
}
