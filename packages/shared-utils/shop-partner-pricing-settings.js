export const SHOP_PARTNER_PRICING_SETTINGS_KEY = 'shop_partner_pricing_settings';

export const DEFAULT_SHOP_PARTNER_PRICING_SETTINGS = {
  documentId: null,
  tiers: [
    { threshold: 0, discountRate: 0.95 },
    { threshold: 5000, discountRate: 0.82 },
    { threshold: 10000, discountRate: 0.79 },
    { threshold: 20000, discountRate: 0.77 },
    { threshold: 50000, discountRate: 0.75 }
  ],
  missingCollection: false
};

const normalizeThreshold = (value) => {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue < 0) {
    return 0;
  }

  return Math.round(nextValue);
};

const normalizeDiscountRate = (value) => {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue <= 0) {
    return 1;
  }

  return Math.min(1, Math.max(0.01, Number(nextValue.toFixed(2))));
};

export const normalizeShopPartnerPricingSettings = (document = {}) => {
  const rawTiers = Array.isArray(document.tiers) ? document.tiers : DEFAULT_SHOP_PARTNER_PRICING_SETTINGS.tiers;
  const tiers = rawTiers
    .map((tier) => ({
      threshold: normalizeThreshold(tier.threshold),
      discountRate: normalizeDiscountRate(tier.discountRate)
    }))
    .sort((left, right) => left.threshold - right.threshold);

  return {
    documentId: document._id || document.id || null,
    tiers: tiers.length ? tiers : DEFAULT_SHOP_PARTNER_PRICING_SETTINGS.tiers,
    missingCollection: false
  };
};

export const toShopPartnerPricingSettingsPayload = (settings = {}) => ({
  key: SHOP_PARTNER_PRICING_SETTINGS_KEY,
  tiers: normalizeShopPartnerPricingSettings(settings).tiers
});

export const getPartnerDiscountRateForAmount = (amount = 0, settings = DEFAULT_SHOP_PARTNER_PRICING_SETTINGS) => {
  const normalizedAmount = Math.max(0, Number(amount) || 0);
  const tiers = normalizeShopPartnerPricingSettings(settings).tiers;

  return tiers.reduce((currentRate, tier) => (
    normalizedAmount >= tier.threshold ? tier.discountRate : currentRate
  ), tiers[0]?.discountRate || 1);
};

export const resolvePartnerDiscountPricing = (
  listAmount = 0,
  settings = DEFAULT_SHOP_PARTNER_PRICING_SETTINGS
) => {
  const normalizedListAmount = Math.max(0, Number(listAmount) || 0);
  const normalizedSettings = normalizeShopPartnerPricingSettings(settings);
  const tiers = normalizedSettings.tiers;

  if (!tiers.length) {
    return {
      listAmount: normalizedListAmount,
      payableAmount: normalizedListAmount,
      discountRate: 1,
      matchedThreshold: 0
    };
  }

  const firstTier = tiers[0];
  let resolvedTier = firstTier;

  tiers.forEach((tier, index) => {
    if (index === 0) {
      return;
    }

    const payableAmount = normalizedListAmount * tier.discountRate;
    const useListAmountAsThreshold = tier.threshold <= 5000;
    const compareBase = useListAmountAsThreshold ? normalizedListAmount : payableAmount;

    if (compareBase >= tier.threshold) {
      resolvedTier = tier;
    }
  });

  return {
    listAmount: normalizedListAmount,
    payableAmount: Number((normalizedListAmount * resolvedTier.discountRate).toFixed(2)),
    discountRate: resolvedTier.discountRate,
    matchedThreshold: resolvedTier.threshold
  };
};
