const COURSE_KEYWORDS = ['课程', '训练营', '陪跑', '讲座', '音频课', '视频课'];

const resolveProductTypeByCategoryName = (categoryName = '') => {
  const normalized = String(categoryName || '').trim();
  if (!normalized) {
    return 'physical';
  }

  return COURSE_KEYWORDS.some((keyword) => normalized.includes(keyword))
    ? 'course'
    : 'physical';
};

module.exports = {
  resolveProductTypeByCategoryName
};
