import React, { useMemo, useState } from 'react';
import { THEME_PRESETS, getThemePreset } from '@liwu/shared-utils/theme-system.js';

const ThemeSettings = ({
  settings,
  error,
  saving,
  onSave
}) => {
  const [draftTheme, setDraftTheme] = useState(settings.theme);
  const themeOptions = useMemo(() => Object.values(THEME_PRESETS), []);
  const activeTheme = getThemePreset(draftTheme);

  return (
    <section
      style={{
        backgroundColor: '#fff',
        borderRadius: '20px',
        boxShadow: 'var(--shadow-sm)',
        padding: '24px'
      }}
    >
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#333' }}>设置</h2>
        <div style={{ fontSize: '14px', color: '#666', lineHeight: 1.7 }}>
          统一控制 app、web 和小程序三端同步使用的主题样式。
        </div>
      </div>

      {error && (
        <div style={errorBannerStyle}>{error}</div>
      )}

      <div style={{ display: 'grid', gap: '16px' }}>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>当前主题</span>
          <select
            value={draftTheme}
            onChange={(event) => setDraftTheme(event.target.value)}
            style={fieldInputStyle}
          >
            {themeOptions.map((theme) => (
              <option key={theme.name} value={theme.name}>{theme.label}</option>
            ))}
          </select>
        </label>

        <div style={previewCardStyle}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            theme_preview
          </div>
          <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
            {activeTheme.label}
          </div>
          <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569', lineHeight: 1.7 }}>
            {activeTheme.description}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
            <div
              style={{
                ...previewSwatchStyle,
                background: activeTheme.web['--theme-button-primary-bg'],
                color: activeTheme.web['--theme-button-primary-text']
              }}
            >
              主按钮
            </div>
            <div
              style={{
                ...previewSwatchStyle,
                background: activeTheme.web['--color-bg-secondary'],
                color: activeTheme.web['--color-text-primary'],
                border: `1px solid ${activeTheme.web['--color-border']}`
              }}
            >
              卡片背景
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            {[
              activeTheme.web['--color-bg-primary'],
              activeTheme.web['--color-accent-clay'],
              activeTheme.web['--color-success'],
              activeTheme.web['--color-accent-ink']
            ].map((colorValue) => (
              <span
                key={colorValue}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: colorValue,
                  boxShadow: '0 8px 18px rgba(15, 23, 42, 0.12)'
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
        <button
          type="button"
          onClick={() => onSave({ ...settings, theme: draftTheme })}
          disabled={saving}
          style={primaryButtonStyle}
        >
          {saving ? '保存中...' : '保存主题设置'}
        </button>
      </div>
    </section>
  );
};

const fieldStyle = {
  display: 'grid',
  gap: '6px'
};

const fieldLabelStyle = {
  fontSize: '12px',
  fontWeight: 700,
  color: '#475569'
};

const fieldInputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '12px',
  border: '1px solid #cbd5e1',
  fontSize: '14px'
};

const previewCardStyle = {
  borderRadius: '18px',
  border: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
  padding: '18px'
};

const previewSwatchStyle = {
  borderRadius: '999px',
  padding: '10px 14px',
  fontSize: '13px',
  fontWeight: 700
};

const primaryButtonStyle = {
  border: 'none',
  borderRadius: '12px',
  backgroundColor: '#111827',
  color: '#fff',
  padding: '10px 16px',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer'
};

const errorBannerStyle = {
  marginBottom: '16px',
  padding: '12px 14px',
  borderRadius: '12px',
  backgroundColor: '#fef2f2',
  color: '#b91c1c',
  fontSize: '13px',
  lineHeight: 1.6
};

export default ThemeSettings;
