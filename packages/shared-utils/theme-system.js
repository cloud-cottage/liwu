export const CLIENT_THEME_SETTINGS_KEY = 'client_theme_settings';

export const THEME_PRESETS = {
  OrangeGold: {
    name: 'OrangeGold',
    label: 'OrangeGold',
    description: '当前默认主题，偏暖的米白、陶土与墨色组合。',
    web: {
      '--color-bg-primary': '#F5F5F0',
      '--color-bg-secondary': '#E0E0D8',
      '--color-accent-clay': '#D68C65',
      '--color-accent-ink': '#2C2C2C',
      '--color-text-primary': '#2C2C2C',
      '--color-text-secondary': '#6B6B6B',
      '--color-border': '#D1D1C7',
      '--color-success': '#6B8E23',
      '--font-serif': "'Playfair Display', serif",
      '--font-sans': "'Inter', sans-serif",
      '--radius-sm': '4px',
      '--radius-md': '8px',
      '--radius-lg': '16px',
      '--radius-xl': '24px',
      '--radius-full': '9999px',
      '--shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
      '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      '--shadow-xl': '0 24px 60px rgba(44, 44, 44, 0.16)',
      '--theme-shell-max-width': '600px',
      '--theme-body-bg': '#F5F5F0',
      '--theme-surface-gradient': 'linear-gradient(180deg, rgba(255, 255, 255, 0.36), rgba(214, 140, 101, 0.04))',
      '--theme-ribbon-pattern': 'repeating-linear-gradient(135deg, transparent 0 40px, rgba(214, 140, 101, 0.045) 40px 80px)',
      '--theme-ribbon-opacity': '0.75',
      '--theme-ribbon-duration': '68s',
      '--theme-star-glow': 'rgba(214, 140, 101, 0.18)',
      '--theme-star-glow-secondary': 'rgba(224, 224, 216, 0.18)',
      '--theme-button-primary-bg': 'linear-gradient(135deg, #D68C65, #E6A57E)',
      '--theme-button-primary-text': '#FFFFFF',
      '--theme-button-secondary-bg': 'rgba(255, 255, 255, 0.82)',
      '--theme-button-secondary-text': '#2C2C2C'
    },
    miniprogram: {
      pageBackground: '#f7f4ef',
      sectionCardBackground: '#ffffff',
      primaryButtonBackground: '#111827',
      primaryButtonText: '#ffffff',
      ghostButtonBackground: '#eef2ff',
      ghostButtonText: '#312e81',
      textPrimary: '#1f2937',
      textSecondary: '#64748b',
      accent: '#d68c65'
    }
  },
  Starbuck2026: {
    name: 'Starbuck2026',
    label: 'Starbuck2026',
    description: '柔和青绿背景、活力黄星与流动丝带的轻快插画风主题。',
    web: {
      '--color-bg-primary': '#E0F0ED',
      '--color-bg-secondary': '#F8FAF7',
      '--color-accent-clay': '#FFB800',
      '--color-accent-ink': '#26334A',
      '--color-text-primary': '#26334A',
      '--color-text-secondary': '#6B7A8F',
      '--color-border': 'rgba(78, 205, 196, 0.28)',
      '--color-success': '#4ECDC4',
      '--font-serif': "'Noto Serif SC', 'Source Han Serif SC', serif",
      '--font-sans': "'Noto Sans SC', 'PingFang SC', system-ui, sans-serif",
      '--radius-sm': '16px',
      '--radius-md': '20px',
      '--radius-lg': '24px',
      '--radius-xl': '28px',
      '--radius-full': '9999px',
      '--shadow-sm': '0 8px 25px -8px rgba(78, 205, 196, 0.18)',
      '--shadow-md': '0 14px 32px -10px rgba(78, 205, 196, 0.22)',
      '--shadow-lg': '0 20px 40px -15px rgba(78, 205, 196, 0.26)',
      '--shadow-xl': '0 24px 56px -18px rgba(38, 51, 74, 0.26)',
      '--theme-shell-max-width': '620px',
      '--theme-body-bg': 'linear-gradient(180deg, #E0F0ED 0%, #F4FAF7 100%)',
      '--theme-surface-gradient': 'linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(255, 204, 51, 0.08))',
      '--theme-ribbon-pattern': 'repeating-linear-gradient(135deg, transparent 0 40px, rgba(110, 231, 176, 0.08) 40px 80px)',
      '--theme-ribbon-opacity': '1',
      '--theme-ribbon-duration': '60s',
      '--theme-star-glow': 'rgba(255, 184, 0, 0.4)',
      '--theme-star-glow-secondary': 'rgba(78, 205, 196, 0.18)',
      '--theme-button-primary-bg': 'linear-gradient(135deg, #FFB800, #FF9F6C)',
      '--theme-button-primary-text': '#26334A',
      '--theme-button-secondary-bg': 'rgba(255, 255, 255, 0.92)',
      '--theme-button-secondary-text': '#45B8AC'
    },
    miniprogram: {
      pageBackground: '#E0F0ED',
      sectionCardBackground: '#F8FAF7',
      primaryButtonBackground: 'linear-gradient(135deg, #FFB800, #FF9F6C)',
      primaryButtonText: '#26334A',
      ghostButtonBackground: '#FFFFFF',
      ghostButtonText: '#45B8AC',
      textPrimary: '#26334A',
      textSecondary: '#6B7A8F',
      accent: '#FFB800'
    }
  },
  IvoryAndSage: {
    name: 'IvoryAndSage',
    label: 'IvoryAndSage',
    description: '以灰白、米色为底，配合鼠尾草绿高光的静谧舒适主题。',
    web: {
      '--color-bg-primary': '#F3F0EA',
      '--color-bg-secondary': '#FCFBF8',
      '--color-accent-clay': '#8FA58A',
      '--color-accent-ink': '#353A36',
      '--color-text-primary': '#353A36',
      '--color-text-secondary': '#7A817A',
      '--color-border': 'rgba(143, 165, 138, 0.22)',
      '--color-success': '#8FA58A',
      '--font-serif': "'Noto Serif SC', 'Source Han Serif SC', serif",
      '--font-sans': "'Noto Sans SC', 'PingFang SC', system-ui, sans-serif",
      '--radius-sm': '10px',
      '--radius-md': '14px',
      '--radius-lg': '18px',
      '--radius-xl': '24px',
      '--radius-full': '9999px',
      '--shadow-sm': '0 6px 18px -12px rgba(53, 58, 54, 0.18)',
      '--shadow-md': '0 12px 28px -14px rgba(53, 58, 54, 0.2)',
      '--shadow-lg': '0 20px 42px -20px rgba(53, 58, 54, 0.22)',
      '--shadow-xl': '0 24px 54px -24px rgba(53, 58, 54, 0.24)',
      '--theme-shell-max-width': '610px',
      '--theme-body-bg': 'linear-gradient(180deg, #F3F0EA 0%, #F8F5EF 100%)',
      '--theme-surface-gradient': 'linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(143, 165, 138, 0.06))',
      '--theme-ribbon-pattern': 'repeating-linear-gradient(135deg, transparent 0 44px, rgba(143, 165, 138, 0.05) 44px 88px)',
      '--theme-ribbon-opacity': '0.82',
      '--theme-ribbon-duration': '72s',
      '--theme-star-glow': 'rgba(143, 165, 138, 0.14)',
      '--theme-star-glow-secondary': 'rgba(214, 206, 190, 0.2)',
      '--theme-button-primary-bg': 'linear-gradient(135deg, #8FA58A, #A7B69A)',
      '--theme-button-primary-text': '#FFFFFF',
      '--theme-button-secondary-bg': 'rgba(255, 255, 255, 0.88)',
      '--theme-button-secondary-text': '#4D5A4B'
    },
    miniprogram: {
      pageBackground: '#F3F0EA',
      sectionCardBackground: '#FCFBF8',
      primaryButtonBackground: 'linear-gradient(135deg, #8FA58A, #A7B69A)',
      primaryButtonText: '#FFFFFF',
      ghostButtonBackground: '#FFFFFF',
      ghostButtonText: '#4D5A4B',
      textPrimary: '#353A36',
      textSecondary: '#7A817A',
      accent: '#8FA58A'
    }
  }
};

export const DEFAULT_CLIENT_THEME_SETTINGS = {
  documentId: null,
  theme: 'IvoryAndSage',
  showDebugCard: true,
  missingCollection: false
};

export const getThemePreset = (themeName = 'OrangeGold') => (
  THEME_PRESETS[themeName] || THEME_PRESETS.OrangeGold
);

export const normalizeClientThemeSettings = (value = {}) => ({
  documentId: value.documentId || value._id || null,
  theme: getThemePreset(
    value.theme ||
    value.app ||
    value.theme_app ||
    value.web ||
    value.theme_web ||
    value.miniprogram ||
    value.theme_miniprogram ||
    DEFAULT_CLIENT_THEME_SETTINGS.theme
  ).name,
  showDebugCard: value.showDebugCard ?? value.show_debug_card ?? DEFAULT_CLIENT_THEME_SETTINGS.showDebugCard,
  missingCollection: false
});

export const toClientThemeSettingsPayload = (settings = {}) => {
  const normalized = normalizeClientThemeSettings(settings);

  return {
    key: CLIENT_THEME_SETTINGS_KEY,
    theme: normalized.theme,
    show_debug_card: Boolean(normalized.showDebugCard)
  };
};
