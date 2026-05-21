export const SYSTEM_FORTUNE_SETTINGS_KEY = 'system_fortune_settings';

export const DEFAULT_SYSTEM_FORTUNE_SETTINGS = {
  documentId: null,
  systemBeansBalance: 0,
  missingCollection: false
};

export const normalizeSystemFortuneSettings = (document = {}) => ({
  documentId: document._id || document.id || null,
  systemBeansBalance: Math.max(0, Number(document.system_beans_balance ?? document.systemBeansBalance ?? 0)),
  missingCollection: false
});

export const toSystemFortuneSettingsPayload = (settings = {}) => ({
  key: SYSTEM_FORTUNE_SETTINGS_KEY,
  system_beans_balance: Math.max(0, Number(settings.systemBeansBalance ?? 0))
});
