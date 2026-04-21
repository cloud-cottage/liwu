export const BRAND_CAROUSEL_SETTINGS_KEY = 'brand_carousel_settings';

export const DEFAULT_BRAND_CAROUSEL_ITEMS = [
  {
    id: 'brand_slide_1',
    caption: '最珍贵的财富，是此刻内心的宁静。',
    fileId: '',
    imageUrl: ''
  },
  {
    id: 'brand_slide_2',
    caption: '给生活一点留白，也给心一点回声。',
    fileId: '',
    imageUrl: ''
  },
  {
    id: 'brand_slide_3',
    caption: '每一次安住，都是与自己重新相认。',
    fileId: '',
    imageUrl: ''
  },
  {
    id: 'brand_slide_4',
    caption: '让呼吸轻轻落下，时间也会慢下来。',
    fileId: '',
    imageUrl: ''
  }
];

export const DEFAULT_BRAND_CAROUSEL_SETTINGS = {
  documentId: null,
  slides: DEFAULT_BRAND_CAROUSEL_ITEMS,
  missingCollection: false
};

const normalizeSlide = (slide = {}, fallback = {}) => ({
  id: slide.id || fallback.id || '',
  caption: slide.caption || fallback.caption || '',
  fileId: slide.file_id || slide.fileId || fallback.fileId || '',
  imageUrl: slide.image_url || slide.imageUrl || fallback.imageUrl || ''
});

export const normalizeBrandCarouselSettings = (value = {}) => {
  const sourceSlides = Array.isArray(value.slides) ? value.slides : DEFAULT_BRAND_CAROUSEL_ITEMS;

  return {
    documentId: value.documentId || value._id || null,
    slides: DEFAULT_BRAND_CAROUSEL_ITEMS.map((fallbackSlide, index) => (
      normalizeSlide(sourceSlides[index] || {}, fallbackSlide)
    )),
    missingCollection: false
  };
};

export const toBrandCarouselSettingsPayload = (settings = {}) => {
  const normalized = normalizeBrandCarouselSettings(settings);

  return {
    key: BRAND_CAROUSEL_SETTINGS_KEY,
    slides: normalized.slides.map((slide) => ({
      id: slide.id,
      caption: slide.caption,
      file_id: slide.fileId || '',
      image_url: slide.imageUrl || ''
    }))
  };
};
