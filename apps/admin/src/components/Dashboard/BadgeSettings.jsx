import React, { useMemo, useState } from 'react';
import {
  BADGE_ACTIVITY_LABELS,
  BADGE_BONUS_TYPES,
  BADGE_INTERNAL_CATEGORY_LABELS,
  BADGE_VISIBLE_GROUP_LABELS
} from '@liwu/shared-utils/badge-system.js';

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const BadgeSettings = ({
  settings,
  error,
  saving,
  onSave
}) => {
  const [query, setQuery] = useState('');
  const [activeSeries, setActiveSeries] = useState(null);
  const [draftSeries, setDraftSeries] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const filteredSeries = useMemo(() => (
    (settings.series || []).filter((series) => {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) {
        return true;
      }

      return [
        series.seriesName,
        series.summary,
        BADGE_VISIBLE_GROUP_LABELS[series.visibleGroup] || '',
        BADGE_INTERNAL_CATEGORY_LABELS[series.internalCategory] || ''
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    })
  ), [query, settings.series]);

  const openSeriesEditor = (series) => {
    setActiveSeries(series);
    setDraftSeries(deepClone(series));
    setFeedbackMessage('');
  };

  const closeSeriesEditor = () => {
    setActiveSeries(null);
    setDraftSeries(null);
  };

  const updateLevel = (index, key, value) => {
    setDraftSeries((currentSeries) => {
      if (!currentSeries) {
        return currentSeries;
      }

      const nextLevels = currentSeries.levels.map((level, levelIndex) => (
        levelIndex === index
          ? {
              ...level,
              [key]: key === 'threshold' || key === 'bonusValue' ? Math.max(0, Number(value) || 0) : value
            }
          : level
      ));

      return {
        ...currentSeries,
        levels: nextLevels
      };
    });
  };

  const handleSave = async () => {
    if (!draftSeries) {
      return;
    }

    const nextSettings = {
      ...settings,
      series: (settings.series || []).map((series) => (
        series.id === draftSeries.id
          ? draftSeries
          : series
      ))
    };

    await onSave(nextSettings);
    setFeedbackMessage('徽章设置已保存到 CloudBase。');
    closeSeriesEditor();
  };

  return (
    <section
      style={{
        backgroundColor: '#fff',
        borderRadius: '20px',
        boxShadow: 'var(--shadow-sm)',
        padding: '24px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#333' }}>徽章设置</h2>
          <div style={{ fontSize: '14px', color: '#666', lineHeight: 1.7 }}>
            编辑徽章名称、系列说明、四档门槛与佩戴加成属性。
          </div>
        </div>
        <input
          type="search"
          placeholder="搜索徽章系列"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={searchInputStyle}
        />
      </div>

      {error && (
        <div style={errorBannerStyle}>{error}</div>
      )}

      {feedbackMessage && (
        <div style={successBannerStyle}>{feedbackMessage}</div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['徽章系列', '前台归属', '逻辑分类', '加成目标', '档位数'].map((label) => (
                <th key={label} style={tableHeadStyle}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredSeries.map((series) => (
              <tr
                key={series.id}
                onClick={() => openSeriesEditor(series)}
                style={{ cursor: 'pointer', borderTop: '1px solid #f1f5f9' }}
              >
                <td style={tableCellStyle}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{series.seriesName}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{series.summary}</div>
                </td>
                <td style={tableCellStyle}>{BADGE_VISIBLE_GROUP_LABELS[series.visibleGroup] || series.visibleGroup}</td>
                <td style={tableCellStyle}>{BADGE_INTERNAL_CATEGORY_LABELS[series.internalCategory] || series.internalCategory}</td>
                <td style={tableCellStyle}>{BADGE_ACTIVITY_LABELS[series.bonusActivity] || series.bonusActivity}</td>
                <td style={tableCellStyle}>{series.levels?.length || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeSeries && draftSeries && (
        <div style={modalBackdropStyle}>
          <div style={modalCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  badge_editor
                </div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827', marginTop: '6px' }}>{activeSeries.seriesName}</div>
              </div>
              <button type="button" onClick={closeSeriesEditor} style={closeButtonStyle}>关闭</button>
            </div>

            <div style={{ display: 'grid', gap: '12px', marginBottom: '18px' }}>
              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>系列名称</span>
                <input
                  type="text"
                  value={draftSeries.seriesName}
                  onChange={(event) => setDraftSeries({ ...draftSeries, seriesName: event.target.value })}
                  style={fieldInputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>系列说明</span>
                <textarea
                  value={draftSeries.summary}
                  onChange={(event) => setDraftSeries({ ...draftSeries, summary: event.target.value })}
                  rows={3}
                  style={{ ...fieldInputStyle, resize: 'vertical', minHeight: '84px' }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gap: '14px' }}>
              {(draftSeries.levels || []).map((level, index) => (
                <div key={level.id} style={levelCardStyle}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
                    第 {index + 1} 档
                  </div>
                  <div style={levelGridStyle}>
                    <label style={fieldStyle}>
                      <span style={fieldLabelStyle}>徽章名称</span>
                      <input
                        type="text"
                        value={level.name}
                        onChange={(event) => updateLevel(index, 'name', event.target.value)}
                        style={fieldInputStyle}
                      />
                    </label>

                    <label style={fieldStyle}>
                      <span style={fieldLabelStyle}>解锁门槛</span>
                      <input
                        type="number"
                        min="0"
                        value={level.threshold}
                        onChange={(event) => updateLevel(index, 'threshold', event.target.value)}
                        style={fieldInputStyle}
                      />
                    </label>

                    <label style={fieldStyle}>
                      <span style={fieldLabelStyle}>加成方式</span>
                      <select
                        value={level.bonusType}
                        onChange={(event) => updateLevel(index, 'bonusType', event.target.value)}
                        style={fieldInputStyle}
                      >
                        <option value={BADGE_BONUS_TYPES.percent}>百分比</option>
                        <option value={BADGE_BONUS_TYPES.fixed}>固定值</option>
                      </select>
                    </label>

                    <label style={fieldStyle}>
                      <span style={fieldLabelStyle}>加成数值</span>
                      <input
                        type="number"
                        min="0"
                        value={level.bonusValue}
                        onChange={(event) => updateLevel(index, 'bonusValue', event.target.value)}
                        style={fieldInputStyle}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button type="button" onClick={closeSeriesEditor} style={secondaryButtonStyle}>取消</button>
              <button type="button" onClick={handleSave} disabled={saving} style={primaryButtonStyle}>
                {saving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const searchInputStyle = {
  width: '240px',
  maxWidth: '100%',
  padding: '10px 12px',
  borderRadius: '12px',
  border: '1px solid #cbd5e1',
  fontSize: '14px'
};

const tableHeadStyle = {
  textAlign: 'left',
  padding: '12px 14px',
  fontSize: '12px',
  fontWeight: 700,
  color: '#64748b',
  backgroundColor: '#f8fafc'
};

const tableCellStyle = {
  padding: '14px',
  fontSize: '13px',
  color: '#334155',
  verticalAlign: 'top'
};

const modalBackdropStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  backgroundColor: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px'
};

const modalCardStyle = {
  width: '100%',
  maxWidth: '860px',
  maxHeight: '90vh',
  overflowY: 'auto',
  borderRadius: '24px',
  backgroundColor: '#fff',
  padding: '24px',
  boxShadow: '0 24px 80px rgba(15, 23, 42, 0.22)'
};

const closeButtonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: '12px',
  backgroundColor: '#fff',
  color: '#334155',
  padding: '8px 12px',
  cursor: 'pointer'
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
  fontSize: '14px',
  boxSizing: 'border-box'
};

const levelCardStyle = {
  borderRadius: '18px',
  border: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
  padding: '14px'
};

const levelGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '12px'
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

const secondaryButtonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: '12px',
  backgroundColor: '#fff',
  color: '#334155',
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

const successBannerStyle = {
  marginBottom: '16px',
  padding: '12px 14px',
  borderRadius: '12px',
  backgroundColor: '#f0fdf4',
  color: '#15803d',
  fontSize: '13px',
  lineHeight: 1.6
};

export default BadgeSettings;
