export const SHOP_REWARD_SETTINGS_KEY = 'shop_reward_settings';

const normalizeRate = (value, fallback) => {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue < 0) {
    return fallback;
  }

  return Number(nextValue.toFixed(4));
};

export const DEFAULT_SHOP_REWARD_SETTINGS = {
  documentId: null,
  rewardBeansPerYuan: 1,
  missingCollection: false
};

export const normalizeShopRewardSettings = (document = {}) => ({
  documentId: document._id || document.id || null,
  rewardBeansPerYuan: normalizeRate(
    document.reward_beans_per_yuan ?? document.rewardBeansPerYuan,
    DEFAULT_SHOP_REWARD_SETTINGS.rewardBeansPerYuan
  ),
  missingCollection: false
});

export const toShopRewardSettingsPayload = (settings = {}) => ({
  key: SHOP_REWARD_SETTINGS_KEY,
  reward_beans_per_yuan: normalizeRate(
    settings.rewardBeansPerYuan,
    DEFAULT_SHOP_REWARD_SETTINGS.rewardBeansPerYuan
  )
});
