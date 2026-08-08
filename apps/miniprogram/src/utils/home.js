const { getLocalProfile } = require('./storage')
const { getAppSettings } = require('./app-settings-cache')
const { getDb } = require('./cloudbase')
const { COLLECTIONS } = require('./shared/database-config')
const {
  PAGE_MASTHEAD_SETTINGS_KEY,
  DEFAULT_PAGE_MASTHEAD_SETTINGS,
  normalizePageMastheadSettings
} = require('./shared/page-masthead-settings')
const {
  BRAND_CAROUSEL_SETTINGS_KEY,
  DEFAULT_BRAND_CAROUSEL_ITEMS,
  normalizeBrandCarouselSettings
} = require('./shared/home-carousel-settings')

/* ═══════ 云函数调用 ═══════ */

const callGetHomePageData = async () => {
  try {
    const res = await wx.cloud.callFunction({ name: 'getHomePageData' })
    if (res.result && res.result.ok) return res.result.data
    return null
  } catch {
    return null
  }
}

/* ═══════ 数据处理：类目 ═══════ */

const normalizeCategory = (category) => ({
  id: category._id || category.id || '',
  name: category.name || '',
  slug: category.slug || '',
  sortOrder: Number(category.sort_order != null ? category.sort_order : (category.sortOrder != null ? category.sortOrder : 0)),
  status: category.status || 'active',
  description: category.description || '',
  coverImage: category.cover_image || category.coverImage || ''
})

const processCategories = (rawCategories = []) =>
  rawCategories
    .map(normalizeCategory)
    .filter((category) => category.status === 'active')
    .sort((a, b) => a.sortOrder - b.sortOrder)

/* ═══════ 数据处理：商品 ═══════ */

const normalizeProduct = (product) => ({
  id: product._id || product.id || '',
  name: product.name || '',
  subtitle: product.subtitle || '',
  categoryId: product.category_id || product.categoryId || '',
  productType: product.product_type || product.productType || 'physical',
  coverImage: product.cover_image || product.coverImage || '',
  description: product.description || '',
  status: product.status || 'draft',
  skuMode: product.sku_mode || product.skuMode || 'single',
  pricePointsFrom: Number(product.price_points_from != null ? product.price_points_from : (product.pricePointsFrom != null ? product.pricePointsFrom : 0)),
  priceCashFrom: Number(product.price_cash_from != null ? product.price_cash_from : (product.priceCashFrom != null ? product.priceCashFrom : 0)),
  stockTotal: Number(product.stock_total != null ? product.stock_total : (product.stockTotal != null ? product.stockTotal : 0)),
  salesCount: Number(product.sales_count != null ? product.sales_count : (product.salesCount != null ? product.salesCount : 0)),
  limitPerUser: Number(product.limit_per_user != null ? product.limit_per_user : (product.limitPerUser != null ? product.limitPerUser : 0)),
  sortOrder: Number(product.sort_order != null ? product.sort_order : (product.sortOrder != null ? product.sortOrder : 0))
})

const processProducts = (rawProducts = []) =>
  rawProducts
    .map(normalizeProduct)
    .filter((product) => product.status === 'active')
    .sort((a, b) => a.sortOrder - b.sortOrder || b.salesCount - a.salesCount)

/* ═══════ 数据处理：标签（热门） ═══════ */

const normalizeRecord = (record) => {
  const content = (record.content || '').trim()
  const accessType = record.access_type || record.accessType || 'public'
  return {
    id: record._id || record.id || '',
    tagKey: record.tag_key || `${content}::${accessType}`,
    content,
    accessType,
    userName: record.user_name || record.userName || '匿名用户',
    authorKey: record.author_key || record.authorKey || '',
    timestamp: record.created_at_client || record.timestamp || record.created_at || record.createdAt || ''
  }
}

const buildTagWeeklySummary = (records = []) => {
  const weeklyStart = Date.now() - 7 * 24 * 60 * 60 * 1000
  const weekly = records.filter((r) => new Date(r.timestamp || 0).getTime() >= weeklyStart)
  const champ = {}
  weekly.forEach((r) => {
    const name = r.userName || '匿名用户'
    champ[name] = (champ[name] || 0) + 1
  })
  const sorted = Object.entries(champ).sort((a, b) => b[1] - a[1])
  return {
    weeklyCount: weekly.length,
    weeklyChampionName: sorted[0] ? sorted[0][0] : '',
    weeklyChampionCount: sorted[0] ? sorted[0][1] : 0
  }
}

const aggregateTags = (records = [], tagSettingsByKey = {}) => {
  const tagMap = {}
  records.forEach((record) => {
    if (!record.content) return
    const existing = tagMap[record.tagKey] || {
      key: record.tagKey,
      content: record.content,
      accessType: record.accessType,
      totalCount: 0,
      lastUsedAt: record.timestamp,
      lastUserName: record.userName || '匿名用户',
      description: (tagSettingsByKey[record.tagKey] && tagSettingsByKey[record.tagKey].description) || '',
      relatedProductId: (tagSettingsByKey[record.tagKey] && (tagSettingsByKey[record.tagKey].related_product_id || tagSettingsByKey[record.tagKey].relatedProductId)) || '',
      participantKeys: []
    }
    existing.totalCount += 1
    existing.participantKeys = [...new Set([...existing.participantKeys, record.authorKey || record.userName || ''].filter(Boolean))]
    if (new Date(record.timestamp || 0).getTime() >= new Date(existing.lastUsedAt || 0).getTime()) {
      existing.lastUsedAt = record.timestamp
      existing.lastUserName = record.userName || '匿名用户'
    }
    tagMap[record.tagKey] = existing
  })

  return Object.values(tagMap)
    .map(({ participantKeys, ...rest }) => ({ ...rest, participantCount: participantKeys.length }))
    .sort((a, b) => b.totalCount - a.totalCount || new Date(b.lastUsedAt || 0).getTime() - new Date(a.lastUsedAt || 0).getTime())
}

const processTags = async (records = [], tagSettings, displaySettings, limit = 12) => {
  const tagsByKey = (tagSettings && (tagSettings.tags_by_key || tagSettings.tagsByKey)) || {}
  const popularTagCount = Math.max(1, Number(
    (displaySettings && (displaySettings.popular_tag_count ?? displaySettings.popularTagCount)) || 33
  ))
  const resolvedLimit = limit || popularTagCount
  const normalizedRecords = (records || []).map(normalizeRecord)
  const aggregated = aggregateTags(normalizedRecords, tagsByKey).slice(0, resolvedLimit)

  const relatedProductIds = [...new Set(aggregated.map((tag) => tag.relatedProductId).filter(Boolean))]
  let productMap = new Map()
  if (relatedProductIds.length > 0) {
    try {
      const db = getDb()
      const results = await Promise.all(
        relatedProductIds.map((id) =>
          db.collection(COLLECTIONS.shopProducts).doc(id).get().catch(() => null)
        )
      )
      productMap = new Map(
        results.filter(Boolean).map((r) => {
          const d = r.data || {}
          return [d._id || d.id, {
            id: d._id || d.id || '',
            name: d.name || '',
            subtitle: d.subtitle || d.description || '',
            coverImage: d.cover_image || d.coverImage || ''
          }]
        })
      )
    } catch { /* related products are optional */ }
  }

  return aggregated.map((tag) => ({
    ...tag,
    ...buildTagWeeklySummary(normalizedRecords.filter((r) => r.tagKey === tag.key)),
    relatedProduct: productMap.get(tag.relatedProductId) || null
  }))
}

/* ═══════ 轮播图（app_settings 缓存） ═══════ */

const TEMPURL_CACHE_KEY = 'liwu_tempfileurl_cache'
const TEMPURL_CACHE_TTL_MS = 6 * 60 * 60 * 1000

let tempUrlMemoryCache = null

const readTempUrlCache = () => {
  if (tempUrlMemoryCache) return tempUrlMemoryCache
  try {
    const stored = wx.getStorageSync(TEMPURL_CACHE_KEY)
    if (stored && Date.now() - stored.timestamp < TEMPURL_CACHE_TTL_MS) {
      tempUrlMemoryCache = stored.map
      return tempUrlMemoryCache
    }
  } catch { /* ignore */ }
  return {}
}

const writeTempUrlCache = (map) => {
  tempUrlMemoryCache = map
  try {
    wx.setStorageSync(TEMPURL_CACHE_KEY, { map, timestamp: Date.now() })
  } catch { /* ignore */ }
}

const resolveSlideImageUrls = async (slides = []) => {
  const fileList = slides.map((slide) => slide.fileId).filter(Boolean)
  if (fileList.length === 0) return slides
  const urlCache = readTempUrlCache()
  const missing = fileList.filter((id) => !urlCache[id])
  if (missing.length > 0) {
    try {
      const result = await wx.cloud.getTempFileURL({ fileList: missing })
      ;(result.fileList || []).forEach((item) => {
        const key = item.fileID || item.fileId
        if (key) urlCache[key] = item.tempFileURL || ''
      })
      writeTempUrlCache(urlCache)
    } catch { /* use cached */ }
  }
  return slides.map((s) => ({ ...s, imageUrl: urlCache[s.fileId] || s.imageUrl || '' }))
}

const getBrandSlides = async () => {
  try {
    const result = await getAppSettings([BRAND_CAROUSEL_SETTINGS_KEY])
    const document = result[BRAND_CAROUSEL_SETTINGS_KEY] || {}
    const slides = normalizeBrandCarouselSettings(document).slides
    return resolveSlideImageUrls(slides)
  } catch {
    return DEFAULT_BRAND_CAROUSEL_ITEMS
  }
}

const getHomeMastheadSettings = async () => {
  try {
    const result = await getAppSettings([PAGE_MASTHEAD_SETTINGS_KEY])
    const document = result[PAGE_MASTHEAD_SETTINGS_KEY] || {}
    return normalizePageMastheadSettings(document)
  } catch {
    return { ...DEFAULT_PAGE_MASTHEAD_SETTINGS }
  }
}

/* ═══════ 首页橱窗 ═══════ */

const decorateShowcaseItems = (products = [], categories = []) =>
  products.slice(0, 4).map((product, index) => {
    const category = categories.find((item) => item.id === product.categoryId)
    return {
      id: product.id,
      name: product.name,
      imageUrl: product.coverImage || '',
      categoryName: category ? (category.name || '工坊') : '工坊',
      monogram: (product.name || '礼').slice(0, 1),
      layoutClass: `showcase-tile-${index + 1}`
    }
  })

/* ═══════ 首页数据聚合（1 次云函数调用 + 2 次缓存读） ═══════ */

const getHomePageData = async () => {
  const profile = getLocalProfile()

  // 优先走云函数聚合；失败时降级为客户端直连 DB（向后兼容）
  const cloudData = await callGetHomePageData()

  if (cloudData) {
    const categories = processCategories(cloudData.categories)
    const products = processProducts(cloudData.products)
    const tags = await processTags(cloudData.records, cloudData.tagSettings, cloudData.displaySettings, 12)

    const [slides, mastheadSettings] = await Promise.all([
      getBrandSlides(),
      getHomeMastheadSettings()
    ])

    return {
      profile,
      tags,
      slides,
      homeSlogan: mastheadSettings.homeSlogan || '礼敬物品，礼赞生命。',
      showcaseItems: decorateShowcaseItems(products, categories)
    }
  }

  // 降级：走客户端直连
  const { listPopularTags } = require('./aware')
  const { listShopCategories, listShopProducts } = require('./shop')

  const [tags, slides, categories, products, mastheadSettings] = await Promise.all([
    listPopularTags(12),
    getBrandSlides(),
    listShopCategories(),
    listShopProducts({ limit: 8 }),
    getHomeMastheadSettings()
  ])

  return {
    profile,
    tags,
    slides,
    homeSlogan: mastheadSettings.homeSlogan || '礼敬物品，礼赞生命。',
    showcaseItems: decorateShowcaseItems(products, categories)
  }
}

module.exports = {
  getHomePageData
}
