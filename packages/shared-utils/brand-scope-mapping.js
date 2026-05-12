export const BRAND_SCOPE_DEFINITIONS = [
  {
    tagName: '禅品',
    categoryName: '不妨坐下',
    slug: 'bufang-zuoxia',
    color: '#8FA58A',
    keywords: ['坐', '禅', '静', '钵', '垫', '冥想', '蒲团']
  },
  {
    tagName: '文品',
    categoryName: '心随笔追',
    slug: 'xin-sui-bi-zhui',
    color: '#8B7355',
    keywords: ['文', '笔', '书', '写', '纸', '本', '字']
  },
  {
    tagName: '香品',
    categoryName: '一炉烟起',
    slug: 'yi-lu-yan-qi',
    color: '#A67C52',
    keywords: ['香', '炉', '烟', '薰', '熏', '沉香']
  },
  {
    tagName: '茶品',
    categoryName: '且吃茶去',
    slug: 'qie-chi-cha-qu',
    color: '#6B8E6E',
    keywords: ['茶', '壶', '杯', '饮', '盏']
  },
  {
    tagName: '理悟课程',
    categoryName: '课程',
    slug: 'courses',
    color: '#5B6CFA',
    keywords: ['课', '课程', '营', '班', '训练']
  }
];

export const resolveProductTypeByCategoryName = (categoryName = '') => {
  const normalizedCategoryName = String(categoryName || '').trim();
  if (normalizedCategoryName === '课程') {
    return 'service';
  }

  return 'physical';
};
