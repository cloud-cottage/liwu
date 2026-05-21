export const PLATFORM_SERVICE_FEE_SETTINGS_KEY = 'platform_service_fee_settings';

const normalizeRate = (value, fallback) => {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue < 0) {
    return fallback;
  }

  return Number(nextValue.toFixed(4));
};

export const DEFAULT_PLATFORM_SERVICE_FEE_SETTINGS = {
  documentId: null,
  consumerRate: 0.09,
  partnerAgentRate: 0.033,
  missingCollection: false
};

export const normalizePlatformServiceFeeSettings = (document = {}) => ({
  documentId: document._id || document.id || null,
  consumerRate: normalizeRate(
    document.consumer_rate ?? document.consumerRate,
    DEFAULT_PLATFORM_SERVICE_FEE_SETTINGS.consumerRate
  ),
  partnerAgentRate: normalizeRate(
    document.partner_agent_rate ?? document.partnerAgentRate,
    DEFAULT_PLATFORM_SERVICE_FEE_SETTINGS.partnerAgentRate
  ),
  missingCollection: false
});

export const toPlatformServiceFeeSettingsPayload = (settings = {}) => ({
  key: PLATFORM_SERVICE_FEE_SETTINGS_KEY,
  consumer_rate: normalizeRate(settings.consumerRate, DEFAULT_PLATFORM_SERVICE_FEE_SETTINGS.consumerRate),
  partner_agent_rate: normalizeRate(settings.partnerAgentRate, DEFAULT_PLATFORM_SERVICE_FEE_SETTINGS.partnerAgentRate)
});
