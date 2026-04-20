/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_CLIENT_THEME_SETTINGS, getThemePreset } from '@liwu/shared-utils/theme-system.js';
import { themeSettingsService } from '../services/cloudbase.js';

const ThemeContext = createContext({
  loading: true,
  themeName: DEFAULT_CLIENT_THEME_SETTINGS.theme,
  themePreset: getThemePreset(DEFAULT_CLIENT_THEME_SETTINGS.theme),
  refreshTheme: async () => null
});

export const useTheme = () => useContext(ThemeContext);

const applyThemeVariables = (themeName = DEFAULT_CLIENT_THEME_SETTINGS.theme) => {
  if (typeof document === 'undefined') {
    return;
  }

  const themePreset = getThemePreset(themeName);
  const root = document.documentElement;
  root.dataset.clientTheme = themePreset.name;

  Object.entries(themePreset.web || {}).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
};

export const ThemeProvider = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [themeName, setThemeName] = useState(DEFAULT_CLIENT_THEME_SETTINGS.theme);

  useEffect(() => {
    applyThemeVariables(themeName);
  }, [themeName]);

  const refreshTheme = async () => {
    setLoading(true);

    try {
      const nextSettings = await themeSettingsService.getSettings();
      setThemeName(nextSettings.theme || DEFAULT_CLIENT_THEME_SETTINGS.theme);
      return nextSettings;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshTheme();
  }, []);

  const themePreset = useMemo(() => getThemePreset(themeName), [themeName]);

  const contextValue = useMemo(() => ({
    loading,
    themeName,
    themePreset,
    refreshTheme
  }), [loading, themeName, themePreset]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
