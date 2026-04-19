export const BADGE_SETTINGS_KEY = 'badge_system_settings';
export const BADGE_PROFILE_COLLECTION = 'badge_profiles';

export const BADGE_VISIBLE_GROUPS = {
  growth: 'growth',
  builder: 'builder'
};

export const BADGE_INTERNAL_CATEGORIES = {
  cloudSign: 'cloud_sign',
  meditation: 'meditation',
  awareness: 'awareness',
  invite: 'invite',
  consumption: 'consumption',
  inPerson: 'in_person'
};

export const BADGE_ACTIVITY_TYPES = {
  cloudSign: 'cloud_sign',
  shopSpend: 'shop_spend',
  meditation: 'meditation',
  invite: 'invite',
  awareness: 'awareness',
  inPerson: 'in_person'
};

export const BADGE_BONUS_TYPES = {
  percent: 'percent',
  fixed: 'fixed'
};

export const BADGE_DIFFICULTIES = [
  { key: 'gentle', label: '微光', defaultBonusValue: 5 },
  { key: 'steady', label: '进阶', defaultBonusValue: 10 },
  { key: 'resolute', label: '砥砺', defaultBonusValue: 15 },
  { key: 'radiant', label: '稀有', defaultBonusValue: 20 }
];

export const BADGE_VISIBLE_GROUP_LABELS = {
  [BADGE_VISIBLE_GROUPS.growth]: '成长徽章',
  [BADGE_VISIBLE_GROUPS.builder]: '建设徽章'
};

export const BADGE_INTERNAL_CATEGORY_LABELS = {
  [BADGE_INTERNAL_CATEGORIES.cloudSign]: '云签徽章',
  [BADGE_INTERNAL_CATEGORIES.meditation]: '冥想徽章',
  [BADGE_INTERNAL_CATEGORIES.awareness]: '觉察徽章',
  [BADGE_INTERNAL_CATEGORIES.invite]: '邀请徽章',
  [BADGE_INTERNAL_CATEGORIES.consumption]: '消费徽章',
  [BADGE_INTERNAL_CATEGORIES.inPerson]: '面授徽章'
};

export const BADGE_ACTIVITY_LABELS = {
  [BADGE_ACTIVITY_TYPES.cloudSign]: '云签',
  [BADGE_ACTIVITY_TYPES.shopSpend]: '工坊消费',
  [BADGE_ACTIVITY_TYPES.meditation]: '冥想',
  [BADGE_ACTIVITY_TYPES.invite]: '邀请',
  [BADGE_ACTIVITY_TYPES.awareness]: '觉察',
  [BADGE_ACTIVITY_TYPES.inPerson]: '面授'
};

export const BADGE_BONUS_ACTIVITY_MAP = {
  [BADGE_INTERNAL_CATEGORIES.inPerson]: BADGE_ACTIVITY_TYPES.cloudSign,
  [BADGE_INTERNAL_CATEGORIES.cloudSign]: BADGE_ACTIVITY_TYPES.shopSpend,
  [BADGE_INTERNAL_CATEGORIES.consumption]: BADGE_ACTIVITY_TYPES.meditation,
  [BADGE_INTERNAL_CATEGORIES.meditation]: BADGE_ACTIVITY_TYPES.invite,
  [BADGE_INTERNAL_CATEGORIES.invite]: BADGE_ACTIVITY_TYPES.awareness,
  [BADGE_INTERNAL_CATEGORIES.awareness]: BADGE_ACTIVITY_TYPES.inPerson
};

export const BADGE_METRIC_TYPES = {
  cloudSignTotalDays: 'cloud_sign_total_days',
  cloudSignStreakDays: 'cloud_sign_streak_days',
  meditationSlotTotalDays: 'meditation_slot_total_days',
  meditationSlotStreakDays: 'meditation_slot_streak_days',
  meditationTotalDays: 'meditation_total_days',
  meditationTotalStreakDays: 'meditation_total_streak_days',
  awarenessCreatedTotal: 'awareness_created_total',
  awarenessFollowTotal: 'awareness_follow_total',
  awarenessStreakDays: 'awareness_streak_days',
  inviteTotal: 'invite_total',
  shopSpendTotalAmount: 'shop_spend_total_amount',
  inPersonTotalCount: 'in_person_total_count'
};

export const BADGE_SLOT_KEYS = {
  dawn: 'dawn',
  noon: 'noon',
  afternoon: 'afternoon',
  evening: 'evening'
};

export const BADGE_SLOT_LABELS = {
  [BADGE_SLOT_KEYS.dawn]: '晨曦',
  [BADGE_SLOT_KEYS.noon]: '午间',
  [BADGE_SLOT_KEYS.afternoon]: '下午',
  [BADGE_SLOT_KEYS.evening]: '傍晚'
};

const DIFFICULTY_NAME_SUFFIX = {
  gentle: '初光',
  steady: '映照',
  resolute: '长明',
  radiant: '曜华'
};

const buildBadgeLevelName = (seriesName, difficultyKey) => `${seriesName}${DIFFICULTY_NAME_SUFFIX[difficultyKey] || '徽章'}`;

const buildDifficultyLevels = ({ seriesId, seriesName, thresholds, unit = '次', bonusType = BADGE_BONUS_TYPES.percent }) => (
  BADGE_DIFFICULTIES.map((difficulty, index) => ({
    id: `${seriesId}:${difficulty.key}`,
    difficulty: difficulty.key,
    name: buildBadgeLevelName(seriesName, difficulty.key),
    threshold: Number(thresholds[index] || 0),
    unit,
    bonusType,
    bonusValue: difficulty.defaultBonusValue,
    image: '',
    description: ''
  }))
);

const createBadgeSeries = ({
  id,
  visibleGroup,
  internalCategory,
  seriesName,
  summary,
  metricType,
  metricTarget = '',
  unit = '次',
  thresholds = [3, 7, 21, 90],
  bonusType = BADGE_BONUS_TYPES.percent
}) => ({
  id,
  visibleGroup,
  internalCategory,
  seriesName,
  summary,
  metricType,
  metricTarget,
  bonusActivity: BADGE_BONUS_ACTIVITY_MAP[internalCategory],
  enabled: true,
  levels: buildDifficultyLevels({
    seriesId: id,
    seriesName,
    thresholds,
    unit,
    bonusType
  })
});

export const createDefaultBadgeSettings = () => ({
  key: BADGE_SETTINGS_KEY,
  version: 1,
  series: [
    createBadgeSeries({
      id: 'cloud_sign_total_days',
      visibleGroup: BADGE_VISIBLE_GROUPS.growth,
      internalCategory: BADGE_INTERNAL_CATEGORIES.cloudSign,
      seriesName: '云签累成',
      summary: '累计完成云签的总天数。',
      metricType: BADGE_METRIC_TYPES.cloudSignTotalDays,
      unit: '天'
    }),
    createBadgeSeries({
      id: 'cloud_sign_streak_days',
      visibleGroup: BADGE_VISIBLE_GROUPS.growth,
      internalCategory: BADGE_INTERNAL_CATEGORIES.cloudSign,
      seriesName: '云签连成',
      summary: '连续完成云签的最长天数。',
      metricType: BADGE_METRIC_TYPES.cloudSignStreakDays,
      unit: '天'
    }),
    ...Object.entries(BADGE_SLOT_LABELS).flatMap(([slotKey, slotLabel]) => ([
      createBadgeSeries({
        id: `meditation_${slotKey}_total_days`,
        visibleGroup: BADGE_VISIBLE_GROUPS.growth,
        internalCategory: BADGE_INTERNAL_CATEGORIES.meditation,
        seriesName: `${slotLabel}静修`,
        summary: `累计在${slotLabel}时段完成冥想的总天数。`,
        metricType: BADGE_METRIC_TYPES.meditationSlotTotalDays,
        metricTarget: slotKey,
        unit: '天'
      }),
      createBadgeSeries({
        id: `meditation_${slotKey}_streak_days`,
        visibleGroup: BADGE_VISIBLE_GROUPS.growth,
        internalCategory: BADGE_INTERNAL_CATEGORIES.meditation,
        seriesName: `${slotLabel}恒修`,
        summary: `连续在${slotLabel}时段完成冥想的最长天数。`,
        metricType: BADGE_METRIC_TYPES.meditationSlotStreakDays,
        metricTarget: slotKey,
        unit: '天'
      })
    ])),
    createBadgeSeries({
      id: 'meditation_total_days',
      visibleGroup: BADGE_VISIBLE_GROUPS.growth,
      internalCategory: BADGE_INTERNAL_CATEGORIES.meditation,
      seriesName: '静心累行',
      summary: '累计完成冥想的总天数。',
      metricType: BADGE_METRIC_TYPES.meditationTotalDays,
      unit: '天'
    }),
    createBadgeSeries({
      id: 'meditation_total_streak_days',
      visibleGroup: BADGE_VISIBLE_GROUPS.growth,
      internalCategory: BADGE_INTERNAL_CATEGORIES.meditation,
      seriesName: '静心连行',
      summary: '连续完成冥想的最长天数。',
      metricType: BADGE_METRIC_TYPES.meditationTotalStreakDays,
      unit: '天'
    }),
    createBadgeSeries({
      id: 'awareness_created_total',
      visibleGroup: BADGE_VISIBLE_GROUPS.growth,
      internalCategory: BADGE_INTERNAL_CATEGORIES.awareness,
      seriesName: '自明觉照',
      summary: '累计主动新建觉察标签的次数。',
      metricType: BADGE_METRIC_TYPES.awarenessCreatedTotal,
      unit: '次'
    }),
    createBadgeSeries({
      id: 'awareness_follow_total',
      visibleGroup: BADGE_VISIBLE_GROUPS.growth,
      internalCategory: BADGE_INTERNAL_CATEGORIES.awareness,
      seriesName: '同心相照',
      summary: '累计跟随社区已有标签完成觉察的次数。',
      metricType: BADGE_METRIC_TYPES.awarenessFollowTotal,
      unit: '次'
    }),
    createBadgeSeries({
      id: 'awareness_streak_days',
      visibleGroup: BADGE_VISIBLE_GROUPS.growth,
      internalCategory: BADGE_INTERNAL_CATEGORIES.awareness,
      seriesName: '觉照长明',
      summary: '连续发布觉察标签的最长天数。',
      metricType: BADGE_METRIC_TYPES.awarenessStreakDays,
      unit: '天'
    }),
    createBadgeSeries({
      id: 'invite_total',
      visibleGroup: BADGE_VISIBLE_GROUPS.builder,
      internalCategory: BADGE_INTERNAL_CATEGORIES.invite,
      seriesName: '同行点灯',
      summary: '累计邀请注册的社区成员人数。',
      metricType: BADGE_METRIC_TYPES.inviteTotal,
      unit: '人'
    }),
    createBadgeSeries({
      id: 'shop_spend_total_amount',
      visibleGroup: BADGE_VISIBLE_GROUPS.builder,
      internalCategory: BADGE_INTERNAL_CATEGORIES.consumption,
      seriesName: '工坊护持',
      summary: '在工坊累计消费的总金额。',
      metricType: BADGE_METRIC_TYPES.shopSpendTotalAmount,
      unit: '元',
      thresholds: [100, 1000, 3000, 10000]
    }),
    createBadgeSeries({
      id: 'in_person_total_count',
      visibleGroup: BADGE_VISIBLE_GROUPS.builder,
      internalCategory: BADGE_INTERNAL_CATEGORIES.inPerson,
      seriesName: '相见共修',
      summary: '累计参与线下面授活动的次数。',
      metricType: BADGE_METRIC_TYPES.inPersonTotalCount,
      unit: '次',
      thresholds: [1, 3, 7, 21]
    })
  ],
  createdAt: null,
  updatedAt: null
});

export const normalizeBadgeLevel = (level = {}, fallbackId = '') => ({
  id: level.id || fallbackId,
  difficulty: level.difficulty || 'gentle',
  name: level.name || '',
  threshold: Math.max(0, Number(level.threshold || 0)),
  unit: level.unit || '次',
  bonusType: level.bonusType === BADGE_BONUS_TYPES.fixed ? BADGE_BONUS_TYPES.fixed : BADGE_BONUS_TYPES.percent,
  bonusValue: Math.max(0, Number(level.bonusValue || 0)),
  image: level.image || '',
  description: level.description || ''
});

export const normalizeBadgeSeries = (series = {}) => ({
  id: series.id || '',
  visibleGroup: series.visibleGroup || BADGE_VISIBLE_GROUPS.growth,
  internalCategory: series.internalCategory || BADGE_INTERNAL_CATEGORIES.cloudSign,
  seriesName: series.seriesName || '',
  summary: series.summary || '',
  metricType: series.metricType || '',
  metricTarget: series.metricTarget || '',
  bonusActivity: series.bonusActivity || BADGE_BONUS_ACTIVITY_MAP[series.internalCategory] || BADGE_ACTIVITY_TYPES.awareness,
  enabled: series.enabled !== false,
  levels: Array.isArray(series.levels)
    ? series.levels.map((level, index) => normalizeBadgeLevel(level, `${series.id}:${BADGE_DIFFICULTIES[index]?.key || index}`))
    : []
});

export const normalizeBadgeSettings = (value = {}) => {
  const fallback = createDefaultBadgeSettings();
  const series = Array.isArray(value.series) && value.series.length > 0
    ? value.series.map(normalizeBadgeSeries)
    : fallback.series.map(normalizeBadgeSeries);

  return {
    key: value.key || BADGE_SETTINGS_KEY,
    version: Math.max(1, Number(value.version || fallback.version || 1)),
    series,
    documentId: value.documentId || value._id || null,
    createdAt: value.created_at || value.createdAt || null,
    updatedAt: value.updated_at || value.updatedAt || null,
    missingCollection: false
  };
};

export const flattenBadgeSeries = (settings = {}) => (
  (settings.series || []).flatMap((series) => (
    (series.levels || []).map((level) => ({
      key: level.id || `${series.id}:${level.difficulty}`,
      badgeId: level.id || `${series.id}:${level.difficulty}`,
      seriesId: series.id,
      visibleGroup: series.visibleGroup,
      internalCategory: series.internalCategory,
      seriesName: series.seriesName,
      summary: series.summary,
      metricType: series.metricType,
      metricTarget: series.metricTarget,
      bonusActivity: series.bonusActivity,
      enabled: series.enabled !== false,
      ...normalizeBadgeLevel(level, `${series.id}:${level.difficulty}`)
    }))
  ))
);

export const getBadgeDifficultyMeta = (difficultyKey = '') => (
  BADGE_DIFFICULTIES.find((difficulty) => difficulty.key === difficultyKey) || BADGE_DIFFICULTIES[0]
);

export const formatBadgeBonusText = (badge = {}) => {
  const activityLabel = BADGE_ACTIVITY_LABELS[badge.bonusActivity] || '目标行为';
  const bonusValue = Math.max(0, Number(badge.bonusValue || 0));

  if (badge.bonusType === BADGE_BONUS_TYPES.fixed) {
    return `${activityLabel}奖励额外 +${bonusValue} 福豆`;
  }

  return `${activityLabel}奖励 +${bonusValue}%`;
};

export const getBadgeSeriesProgressUnit = (series = {}) => (
  series?.levels?.[0]?.unit || '次'
);
