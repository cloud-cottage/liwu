export const STUDENT_MEMBERSHIP_SETTINGS_KEY = 'student_membership_settings';

export const STUDENT_MEMBERSHIP_PLAN_PRESETS = [
  {
    key: 'month',
    label: '月付',
    priceCash: 35,
    durationMonths: 1,
    isLifetime: false,
    sortOrder: 1
  },
  {
    key: 'quarter',
    label: '季度付',
    priceCash: 99,
    durationMonths: 3,
    isLifetime: false,
    sortOrder: 2
  },
  {
    key: 'year',
    label: '年付',
    priceCash: 365,
    durationMonths: 12,
    isLifetime: false,
    sortOrder: 3
  },
  {
    key: 'lifetime',
    label: '终身',
    priceCash: 3333,
    durationMonths: 0,
    isLifetime: true,
    sortOrder: 4
  }
];

const normalizePriceCash = (value, fallbackValue = 0) => {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return Math.max(0, Number(fallbackValue || 0));
  }

  return Math.max(0, Math.round(nextValue * 100) / 100);
};

const normalizeDurationMonths = (value, fallbackValue = 0) => {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return Math.max(0, Number(fallbackValue || 0));
  }

  return Math.max(0, Math.round(nextValue));
};

const normalizeStudentMembershipPlan = (plan = {}, fallbackPlan = {}) => ({
  key: plan.key || fallbackPlan.key || '',
  label: plan.label || fallbackPlan.label || '',
  priceCash: normalizePriceCash(plan.price_cash ?? plan.priceCash, fallbackPlan.priceCash ?? 0),
  durationMonths: normalizeDurationMonths(plan.duration_months ?? plan.durationMonths, fallbackPlan.durationMonths ?? 0),
  isLifetime: Boolean(plan.is_lifetime ?? plan.isLifetime ?? fallbackPlan.isLifetime),
  sortOrder: normalizeDurationMonths(plan.sort_order ?? plan.sortOrder, fallbackPlan.sortOrder ?? 0)
});

export const DEFAULT_STUDENT_MEMBERSHIP_SETTINGS = {
  key: STUDENT_MEMBERSHIP_SETTINGS_KEY,
  documentId: null,
  missingCollection: false,
  plans: STUDENT_MEMBERSHIP_PLAN_PRESETS.map((plan) => ({ ...plan }))
};

export const normalizeStudentMembershipSettings = (settings = {}) => {
  const savedPlans = Array.isArray(settings.plans) ? settings.plans : [];
  const plansByKey = new Map(savedPlans.map((plan) => [plan.key, plan]));

  return {
    key: settings.key || STUDENT_MEMBERSHIP_SETTINGS_KEY,
    documentId: settings._id || settings.id || settings.documentId || null,
    missingCollection: false,
    plans: STUDENT_MEMBERSHIP_PLAN_PRESETS
      .map((defaultPlan) => normalizeStudentMembershipPlan(plansByKey.get(defaultPlan.key) || {}, defaultPlan))
      .sort((left, right) => left.sortOrder - right.sortOrder)
  };
};

export const toStudentMembershipSettingsPayload = (settings = {}) => {
  const normalizedSettings = normalizeStudentMembershipSettings(settings);

  return {
    key: STUDENT_MEMBERSHIP_SETTINGS_KEY,
    plans: normalizedSettings.plans.map((plan) => ({
      key: plan.key,
      label: plan.label,
      price_cash: plan.priceCash,
      duration_months: plan.durationMonths,
      is_lifetime: plan.isLifetime,
      sort_order: plan.sortOrder
    }))
  };
};

export const getStudentMembershipPlan = (settings = {}, planKey = '') => (
  normalizeStudentMembershipSettings(settings).plans.find((plan) => plan.key === planKey) || null
);
