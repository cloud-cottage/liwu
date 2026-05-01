const { listPopularTags } = require('./aware')
const { getLocalProfile } = require('./storage')
const { getDb } = require('./cloudbase')
const { listShopCategories, listShopProducts } = require('./shop')

const APP_SETTINGS = 'app_settings'
const BRAND_CAROUSEL_SETTINGS_KEY = 'brand_carousel_settings'

const DEFAULT_SLIDES = [
  {
    id: 'brand_slide_1',
    caption: '最珍贵的财富，是此刻内心的宁静。',
    imageUrl: ''
  },
  {
    id: 'brand_slide_2',
    caption: '给生活一点留白，也给心一点回声。',
    imageUrl: ''
  },
  {
    id: 'brand_slide_3',
    caption: '每一次安住，都是与自己重新相认。',
    imageUrl: ''
  },
  {
    id: 'brand_slide_4',
    caption: '让呼吸轻轻落下，时间也会慢下来。',
    imageUrl: ''
  }
]

const resolveSlideImageUrls = async (slides = []) => {
  const fileList = slides.map((slide) => slide.fileId).filter(Boolean)
  if (fileList.length === 0) {
    return slides
  }

  try {
    const result = await wx.cloud.getTempFileURL({ fileList })
    const urlMap = new Map(
      (result.fileList || []).map((item) => [
        item.fileID || item.fileId,
        item.tempFileURL || ''
      ])
    )

    return slides.map((slide) => ({
      ...slide,
      imageUrl: urlMap.get(slide.fileId) || slide.imageUrl || ''
    }))
  } catch {
    return slides
  }
}

const getBrandSlides = async () => {
  try {
    const db = getDb()
    const result = await db.collection(APP_SETTINGS).where({ key: BRAND_CAROUSEL_SETTINGS_KEY }).limit(1).get()
    const document = (result.data || [])[0] || {}
    const rawSlides = Array.isArray(document.slides) ? document.slides : []
    const normalizedSlides = DEFAULT_SLIDES.map((fallbackSlide, index) => {
      const currentSlide = rawSlides[index] || {}
      return {
        id: currentSlide.id || fallbackSlide.id,
        caption: currentSlide.caption || fallbackSlide.caption,
        fileId: currentSlide.file_id || currentSlide.fileId || '',
        imageUrl: currentSlide.image_url || currentSlide.imageUrl || fallbackSlide.imageUrl
      }
    })

    return resolveSlideImageUrls(normalizedSlides)
  } catch {
    return DEFAULT_SLIDES
  }
}

const decorateShowcaseItems = (products = [], categories = []) => (
  products.slice(0, 4).map((product, index) => {
    const category = categories.find((item) => item.id === product.categoryId)
    return {
      id: product.id,
      name: product.name,
      imageUrl: product.coverImage || '',
      categoryName: category?.name || '工坊',
      monogram: (product.name || '礼').slice(0, 1),
      layoutClass: `showcase-tile-${index + 1}`
    }
  })
)

const getHomePageData = async () => {
  const profile = getLocalProfile()
  const [tags, slides, categories, products] = await Promise.all([
    listPopularTags(12),
    getBrandSlides(),
    listShopCategories(),
    listShopProducts({ limit: 8 })
  ])

  return {
    profile,
    tags,
    slides,
    showcaseItems: decorateShowcaseItems(products, categories)
  }
}

module.exports = {
  getHomePageData
}
