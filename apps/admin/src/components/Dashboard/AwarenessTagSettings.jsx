import React, { useEffect, useMemo, useState } from 'react';
import DatabaseService, { DEFAULT_AWARENESS_MOCK_LIBRARY_SETTINGS } from '../../services/database.js';

const tagNatureLabel = {
  public: '普通觉察',
  student: '学员觉察'
};

const tagNatureMeta = {
  public: {
    label: '普通标签',
    color: '#475569',
    backgroundColor: '#f8fafc',
    borderColor: '#dbe4ee'
  },
  student: {
    label: '学员标签',
    color: '#0f766e',
    backgroundColor: 'rgba(15, 118, 110, 0.1)',
    borderColor: 'rgba(15, 118, 110, 0.2)'
  }
};

const ADMIN_AWARENESS_TAG_MAX_LENGTH = 18;

const normalizeRewardPoints = (value) => Math.max(0, Number(value) || 0);

const getAwarenessTagLength = (value = '') => (
  Array.from(String(value || '')).reduce((total, character) => (
    total + (/[\u3400-\u9FFF\uF900-\uFAFF]/u.test(character) ? 2 : 1)
  ), 0)
);

const trimAwarenessTagValue = (value = '', maxLength = ADMIN_AWARENESS_TAG_MAX_LENGTH) => {
  let currentLength = 0;
  let result = '';

  for (const character of Array.from(String(value || ''))) {
    const nextLength = currentLength + (/[\u3400-\u9FFF\uF900-\uFAFF]/u.test(character) ? 2 : 1);
    if (nextLength > maxLength) {
      break;
    }

    result += character;
    currentLength = nextLength;
  }

  return result;
};

const buildLexiconEditorValue = (lexicon = []) => lexicon.join('\n');

const parseLexiconEditorValue = (value = '') => (
  Array.from(
    new Set(
      String(value || '')
        .split(/\r?\n/g)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, 200)
);

const formatDateTime = (value) => {
  if (!value) {
    return '暂无记录';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '暂无记录';
  }

  return date.toLocaleString('zh-CN', { hour12: false });
};

const compareValues = (left, right, direction, type = 'string') => {
  const factor = direction === 'asc' ? 1 : -1;

  if (type === 'number') {
    return factor * (Number(left || 0) - Number(right || 0));
  }

  return factor * String(left || '').localeCompare(String(right || ''), 'zh-CN');
};

const SortButton = ({ label, active, direction, onClick, align = 'left' }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      padding: 0,
      fontSize: '12px',
      fontWeight: active ? 700 : 600,
      color: active ? '#111827' : '#64748b',
      display: 'inline-flex',
      justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      alignItems: 'center',
      gap: '6px',
      width: '100%'
    }}
  >
    <span>{label}</span>
    <span style={{ fontSize: '11px', color: active ? '#2563eb' : '#cbd5e1' }}>
      {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  </button>
);

const AwarenessTagDetailModal = ({
  tag,
  products,
  draftContent,
  draftAccessType,
  draftDescription,
  draftRewardPoints,
  draftRelatedProductId,
  saving,
  onClose,
  onContentChange,
  onAccessTypeChange,
  onDescriptionChange,
  onRewardPointsChange,
  onRelatedProductChange,
  onSave
}) => {
  if (!tag) {
    return null;
  }

  const accessMeta = tagNatureMeta[draftAccessType] || tagNatureMeta.public;
  const currentLength = getAwarenessTagLength(draftContent);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: 'rgba(15, 23, 42, 0.45)'
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '640px',
          backgroundColor: '#fff',
          borderRadius: '20px',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.22)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: '24px 28px',
            borderBottom: '1px solid #eef2f7',
            background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            觉察设置
          </div>
          <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '28px', color: '#111827' }}>{draftContent || tag.content}</h3>
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#64748b', lineHeight: 1.7 }}>
                最近标记者：{tag.lastUserName || '匿名用户'}<br />
                最近标记时间：{formatDateTime(tag.lastUsedAt)}
              </div>
            </div>
            <span
              style={{
                alignSelf: 'flex-start',
                borderRadius: '999px',
                backgroundColor: accessMeta.backgroundColor,
                color: accessMeta.color,
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              {tagNatureLabel[draftAccessType] || tagNatureLabel.public}
            </span>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={metricStyle}>
              <div style={metricLabelStyle}>累计标记次数</div>
              <div style={metricValueStyle}>{tag.totalCount}</div>
            </div>
            <div style={metricStyle}>
              <div style={metricLabelStyle}>当前奖励数量</div>
              <div style={metricValueStyle}>{tag.rewardPoints}</div>
            </div>
            <div style={metricStyle}>
              <div style={metricLabelStyle}>累计奖励数量</div>
              <div style={metricValueStyle}>{tag.totalRewardPoints}</div>
            </div>
            <div style={metricStyle}>
              <div style={metricLabelStyle}>标签性质</div>
              <div style={{ ...metricValueStyle, fontSize: '16px' }}>{tagNatureLabel[tag.accessType] || tagNatureLabel.public}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '18px' }}>
            <div>
              <label htmlFor="awareness-tag-name" style={fieldLabelStyle}>标签名称</label>
              <input
                id="awareness-tag-name"
                type="text"
                maxLength="18"
                value={draftContent}
                onChange={(event) => onContentChange(trimAwarenessTagValue(event.target.value))}
                placeholder="请输入标签名称"
                style={{
                  width: '100%',
                  borderRadius: '14px',
                  border: '1px solid #dbe4ee',
                  padding: '12px 14px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  color: '#334155'
                }}
              />
              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                <span>修改后会同步更新此觉察标签的历史记录名称。</span>
                <span>{currentLength}/{ADMIN_AWARENESS_TAG_MAX_LENGTH}</span>
              </div>
            </div>

            <div>
              <label style={fieldLabelStyle}>标签性质</label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {Object.entries(tagNatureMeta).map(([accessType, meta]) => {
                  const active = draftAccessType === accessType;
                  return (
                    <button
                      key={accessType}
                      type="button"
                      onClick={() => onAccessTypeChange(accessType)}
                      style={{
                        border: `1px solid ${active ? meta.color : meta.borderColor}`,
                        backgroundColor: meta.backgroundColor,
                        color: meta.color,
                        borderRadius: '12px',
                        padding: '10px 14px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        minWidth: '112px'
                      }}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                在普通标签和学员标签之间切换时，会同步更新该标签的历史记录性质。
              </div>
            </div>

            <div>
              <label htmlFor="awareness-tag-description" style={fieldLabelStyle}>标签简介</label>
              <textarea
                id="awareness-tag-description"
                value={draftDescription}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="无简介"
                style={{
                  width: '100%',
                  minHeight: '110px',
                  borderRadius: '14px',
                  border: '1px solid #dbe4ee',
                  padding: '12px 14px',
                  fontSize: '14px',
                  lineHeight: 1.7,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  color: '#334155'
                }}
              />
            </div>

            <div>
              <label htmlFor="awareness-tag-reward-points" style={fieldLabelStyle}>奖励数量</label>
              <input
                id="awareness-tag-reward-points"
                type="number"
                min="0"
                step="1"
                value={draftRewardPoints}
                onChange={(event) => onRewardPointsChange(event.target.value)}
                placeholder="0"
                style={{
                  width: '100%',
                  borderRadius: '14px',
                  border: '1px solid #dbe4ee',
                  padding: '12px 14px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  color: '#334155'
                }}
              />
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                保存后，从当前时刻起，用户发布此觉察标签会获得对应数量的福豆。
              </div>
            </div>

            <div>
              <label htmlFor="awareness-tag-related-product" style={fieldLabelStyle}>相关商品</label>
              <select
                id="awareness-tag-related-product"
                value={draftRelatedProductId}
                onChange={(event) => onRelatedProductChange(event.target.value)}
                style={{
                  width: '100%',
                  borderRadius: '14px',
                  border: '1px solid #dbe4ee',
                  padding: '12px 14px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  color: '#334155',
                  backgroundColor: '#fff'
                }}
              >
                <option value="">不设置相关商品</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                选择后，前台 aware_tag 模态框中会出现【相关商品】卡片。
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            padding: '20px 28px 24px',
            borderTop: '1px solid #eef2f7',
            backgroundColor: '#fbfdff'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              border: '1px solid #dbe4ee',
              borderRadius: '10px',
              backgroundColor: '#fff',
              color: '#475569',
              padding: '12px 18px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            关闭
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            style={{
              border: 'none',
              borderRadius: '10px',
              backgroundColor: '#111827',
              color: '#fff',
              padding: '12px 18px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AwarenessTagSettings = ({
  tags,
  settings,
  products,
  onSave,
  saving,
  error,
  onRefresh
}) => {
  const [activeSection, setActiveSection] = useState('settings');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'totalCount', direction: 'desc' });
  const [selectedTagKey, setSelectedTagKey] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftAccessType, setDraftAccessType] = useState('public');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftRewardPoints, setDraftRewardPoints] = useState('0');
  const [draftRelatedProductId, setDraftRelatedProductId] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [mockLibrarySettings, setMockLibrarySettings] = useState(DEFAULT_AWARENESS_MOCK_LIBRARY_SETTINGS);
  const [mockLexiconValue, setMockLexiconValue] = useState(buildLexiconEditorValue(DEFAULT_AWARENESS_MOCK_LIBRARY_SETTINGS.lexicon));
  const [mockCount, setMockCount] = useState('34');
  const [loadingMockLibrary, setLoadingMockLibrary] = useState(false);
  const [savingMockLibrary, setSavingMockLibrary] = useState(false);
  const [simulatingMockData, setSimulatingMockData] = useState(false);
  const [mockMessage, setMockMessage] = useState({ type: '', text: '' });

  const mergedTags = useMemo(() => (
    tags.map((tag) => {
      const setting = settings.tagsByKey?.[tag.key] || {};
      return {
        ...tag,
        description: setting.description ?? tag.description ?? '',
        rewardPoints: normalizeRewardPoints(setting.rewardPoints ?? tag.rewardPoints),
        relatedProductId: setting.relatedProductId || '',
        totalRewardPoints: Math.max(0, Number(tag.totalRewardPoints || 0))
      };
    })
  ), [settings.tagsByKey, tags]);

  const selectedTag = useMemo(
    () => mergedTags.find((tag) => tag.key === selectedTagKey) || null,
    [mergedTags, selectedTagKey]
  );

  const filteredTags = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const nextTags = normalizedQuery
      ? mergedTags.filter((tag) => (
          tag.content.toLowerCase().includes(normalizedQuery) ||
          String(tag.lastUserName || '').toLowerCase().includes(normalizedQuery)
        ))
      : mergedTags;

    return [...nextTags].sort((left, right) => {
      switch (sortConfig.key) {
        case 'content':
          return compareValues(left.content, right.content, sortConfig.direction);
        case 'rewardPoints':
          return compareValues(left.rewardPoints, right.rewardPoints, sortConfig.direction, 'number');
        case 'totalRewardPoints':
          return compareValues(left.totalRewardPoints, right.totalRewardPoints, sortConfig.direction, 'number');
        case 'totalCount':
        default:
          return compareValues(left.totalCount, right.totalCount, sortConfig.direction, 'number');
      }
    });
  }, [mergedTags, searchQuery, sortConfig]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadingMockLibrary(true);
      try {
        const nextSettings = await DatabaseService.getAwarenessMockLibrarySettings();
        if (cancelled) {
          return;
        }

        setMockLibrarySettings(nextSettings);
        setMockLexiconValue(buildLexiconEditorValue(nextSettings.lexicon));
      } catch (nextError) {
        if (!cancelled) {
          setMockMessage({ type: 'error', text: nextError.message || '模拟词库加载失败。' });
        }
      } finally {
        if (!cancelled) {
          setLoadingMockLibrary(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleOpenTag = (tag) => {
    setSelectedTagKey(tag.key);
    setDraftContent(tag.content || '');
    setDraftAccessType(tag.accessType || 'public');
    setDraftDescription(tag.description || '');
    setDraftRewardPoints(String(tag.rewardPoints || 0));
    setDraftRelatedProductId(tag.relatedProductId || '');
    setMessage({ type: '', text: '' });
  };

  const handleSave = async () => {
    if (!selectedTag) {
      return;
    }

    const trimmedContent = trimAwarenessTagValue(String(draftContent || '').trim());
    if (!trimmedContent) {
      setMessage({ type: 'error', text: '请输入觉察标签名称。' });
      return;
    }

    if (getAwarenessTagLength(trimmedContent) > ADMIN_AWARENESS_TAG_MAX_LENGTH) {
      setMessage({ type: 'error', text: '标签名称最多 9 个汉字（18 个字符）。' });
      return;
    }

    const nextTagKey = `${trimmedContent}::${draftAccessType}`;
    const conflictingTag = mergedTags.find((tag) => tag.key !== selectedTag.key && tag.key === nextTagKey);
    if (conflictingTag) {
      setMessage({ type: 'error', text: '已存在同名觉察标签，请更换名称。' });
      return;
    }

    const nextTagsByKey = {
      ...(settings.tagsByKey || {}),
      [nextTagKey]: {
        ...(settings.tagsByKey?.[selectedTag.key] || {}),
        description: draftDescription.trim(),
        rewardPoints: normalizeRewardPoints(draftRewardPoints),
        relatedProductId: String(draftRelatedProductId || '').trim()
      }
    };

    if (nextTagKey !== selectedTag.key) {
      delete nextTagsByKey[selectedTag.key];
    }

    await onSave({
      tagsByKey: nextTagsByKey,
      rename: nextTagKey !== selectedTag.key
        ? {
            fromKey: selectedTag.key,
            toKey: nextTagKey,
            toContent: trimmedContent,
            fromAccessType: selectedTag.accessType,
            toAccessType: draftAccessType
          }
        : null
    });

    setMessage({ type: 'success', text: `已保存「${trimmedContent}」的觉察设置。` });
    setSelectedTagKey('');
  };

  const handleSaveMockLibrary = async () => {
    const nextLexicon = parseLexiconEditorValue(mockLexiconValue);
    if (nextLexicon.length === 0) {
      setMockMessage({ type: 'error', text: '请至少保留 1 条模拟词库词条。' });
      return;
    }

    try {
      setSavingMockLibrary(true);
      const savedSettings = await DatabaseService.saveAwarenessMockLibrarySettings({ lexicon: nextLexicon });
      setMockLibrarySettings(savedSettings);
      setMockLexiconValue(buildLexiconEditorValue(savedSettings.lexicon));
      setMockMessage({ type: 'success', text: `已保存模拟词库，共 ${savedSettings.lexicon.length} 条词条。` });
    } catch (nextError) {
      setMockMessage({ type: 'error', text: nextError.message || '模拟词库保存失败。' });
    } finally {
      setSavingMockLibrary(false);
    }
  };

  const handleSimulateMockData = async () => {
    try {
      setSimulatingMockData(true);
      const result = await DatabaseService.simulateAwarenessRecords(mockCount);
      if (typeof onRefresh === 'function') {
        await onRefresh();
      }

      const missingUsersText = result.missingUids.length > 0
        ? ` 未找到的 uid：${result.missingUids.join('、')}。`
        : '';

      setMockMessage({
        type: 'success',
        text: `已生成 ${result.insertedCount} 条模拟觉察数据，执行时间 ${formatDateTime(result.executedAt)}，使用 ${result.usedUserCount} 位用户身份。${missingUsersText}`
      });
    } catch (nextError) {
      setMockMessage({ type: 'error', text: nextError.message || '模拟数据生成失败。' });
    } finally {
      setSimulatingMockData(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[
          { key: 'settings', label: '觉察设置' },
          { key: 'mock', label: '模拟数据' }
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveSection(item.key)}
            style={{
              border: 'none',
              borderRadius: '999px',
              backgroundColor: activeSection === item.key ? '#111827' : '#fff',
              color: activeSection === item.key ? '#fff' : '#334155',
              boxShadow: 'var(--shadow-sm)',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeSection === 'settings' && (
        <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#333' }}>觉察设置</h2>
          <p style={{ margin: 0, color: '#666', fontSize: '14px', lineHeight: 1.6 }}>
            搜索觉察标签，按列排序，并在模态框中维护标签简介与奖励数量。
          </p>
          <div style={{ marginTop: '8px', fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
            当前觉察标签总数：{mergedTags.length}
          </div>
        </div>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索觉察标签或最近标记者"
          style={{
            width: '320px',
            maxWidth: '100%',
            borderRadius: '12px',
            border: '1px solid #dbe4ee',
            padding: '12px 14px',
            fontSize: '14px',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {(error || message.text) && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            backgroundColor: (error || message.type === 'error') ? '#fff3f3' : '#f1f8f4',
            color: (error || message.type === 'error') ? '#c62828' : '#2e7d32',
            fontSize: '13px',
            lineHeight: 1.6
          }}
        >
          {error || message.text}
        </div>
      )}

      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)'
        }}
      >
        {filteredTags.length === 0 ? (
          <div
            style={{
              border: '1px dashed #dbe4ee',
              borderRadius: '14px',
              padding: '28px',
              textAlign: 'center',
              color: '#64748b',
              backgroundColor: '#f8fafc'
            }}
          >
            {mergedTags.length === 0 ? '暂无觉察标签数据。' : '没有匹配到对应的觉察标签。'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: '860px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(260px, 2fr) minmax(140px, 1fr) minmax(140px, 1fr) minmax(160px, 1fr)',
                  gap: '16px',
                  padding: '0 0 14px',
                  borderBottom: '1px solid #eef2f7',
                  marginBottom: '12px'
                }}
              >
                <SortButton
                  label="觉察标签名称"
                  active={sortConfig.key === 'content'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('content')}
                />
                <SortButton
                  label="累计标记次数"
                  active={sortConfig.key === 'totalCount'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('totalCount')}
                  align="right"
                />
                <SortButton
                  label="奖励数量"
                  active={sortConfig.key === 'rewardPoints'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('rewardPoints')}
                  align="right"
                />
                <SortButton
                  label="累计奖励数量"
                  active={sortConfig.key === 'totalRewardPoints'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('totalRewardPoints')}
                  align="right"
                />
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                {filteredTags.map((tag) => (
                  <button
                    key={tag.key}
                    type="button"
                    onClick={() => handleOpenTag(tag)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(260px, 2fr) minmax(140px, 1fr) minmax(140px, 1fr) minmax(160px, 1fr)',
                      gap: '16px',
                      width: '100%',
                      textAlign: 'left',
                      border: '1px solid #eef2f7',
                      borderRadius: '14px',
                      backgroundColor: '#fff',
                      padding: '16px',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>{tag.content}</span>
                        {tag.accessType === 'student' && (
                          <span
                            style={{
                              borderRadius: '999px',
                              backgroundColor: 'rgba(15, 118, 110, 0.12)',
                              color: '#0f766e',
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '4px 8px'
                            }}
                          >
                            学员觉察
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                        最近标记者：{tag.lastUserName || '匿名用户'} · 最近标记：{formatDateTime(tag.lastUsedAt)}
                      </div>
                    </div>
                    <div style={tableNumberCellStyle}>{tag.totalCount}</div>
                    <div style={tableNumberCellStyle}>{tag.rewardPoints}</div>
                    <div style={tableNumberCellStyle}>{tag.totalRewardPoints}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <AwarenessTagDetailModal
        tag={selectedTag}
        products={products}
        draftContent={draftContent}
        draftAccessType={draftAccessType}
        draftDescription={draftDescription}
        draftRewardPoints={draftRewardPoints}
        draftRelatedProductId={draftRelatedProductId}
        saving={saving}
        onClose={() => {
          setSelectedTagKey('');
          setDraftContent('');
          setDraftAccessType('public');
          setDraftDescription('');
          setDraftRewardPoints('0');
          setDraftRelatedProductId('');
        }}
        onContentChange={setDraftContent}
        onAccessTypeChange={setDraftAccessType}
        onDescriptionChange={setDraftDescription}
        onRewardPointsChange={setDraftRewardPoints}
        onRelatedProductChange={setDraftRelatedProductId}
        onSave={handleSave}
      />
        </>
      )}

      {activeSection === 'mock' && (
        <>
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)',
              display: 'grid',
              gap: '18px'
            }}
          >
            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#333' }}>模拟数据</h2>
              <p style={{ margin: 0, color: '#666', fontSize: '14px', lineHeight: 1.6 }}>
                使用 uid 33-66 的用户身份向觉察系统注入模拟数据。注入时间即你点击按钮的执行时间，标签内容会从下方词库中随机抽取。
              </p>
            </div>

            {(mockMessage.text || error) && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  backgroundColor: (error || mockMessage.type === 'error') ? '#fff3f3' : '#f1f8f4',
                  color: (error || mockMessage.type === 'error') ? '#c62828' : '#2e7d32',
                  fontSize: '13px',
                  lineHeight: 1.6
                }}
              >
                {error || mockMessage.text}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(180px, 240px) auto',
                gap: '12px',
                alignItems: 'end'
              }}
            >
              <div>
                <label htmlFor="awareness-mock-count" style={fieldLabelStyle}>模拟条数</label>
                <input
                  id="awareness-mock-count"
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  value={mockCount}
                  onChange={(event) => setMockCount(event.target.value)}
                  placeholder="34"
                  style={{
                    width: '100%',
                    borderRadius: '14px',
                    border: '1px solid #dbe4ee',
                    padding: '12px 14px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    color: '#334155'
                  }}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                  单次最多生成 1000 条。
                </div>
              </div>

              <button
                type="button"
                onClick={handleSimulateMockData}
                disabled={simulatingMockData || loadingMockLibrary}
                style={{
                  border: 'none',
                  borderRadius: '12px',
                  backgroundColor: '#111827',
                  color: '#fff',
                  padding: '12px 18px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: simulatingMockData || loadingMockLibrary ? 'default' : 'pointer',
                  opacity: simulatingMockData || loadingMockLibrary ? 0.7 : 1,
                  minWidth: '140px'
                }}
              >
                {simulatingMockData ? '生成中...' : '生成模拟数据'}
              </button>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)',
              display: 'grid',
              gap: '16px'
            }}
          >
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: '20px', color: '#111827' }}>模拟词库</h3>
              <p style={{ margin: 0, color: '#666', fontSize: '13px', lineHeight: 1.7 }}>
                一行一条词库词条，管理员可随时添加或编辑。模拟数据生成时会从这些词条中随机选取。
              </p>
            </div>

            <textarea
              value={mockLexiconValue}
              onChange={(event) => setMockLexiconValue(event.target.value)}
              placeholder="每行输入一条词库词条"
              style={{
                width: '100%',
                minHeight: '280px',
                borderRadius: '14px',
                border: '1px solid #dbe4ee',
                padding: '14px 16px',
                fontSize: '14px',
                lineHeight: 1.8,
                resize: 'vertical',
                boxSizing: 'border-box',
                color: '#334155'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                当前词条数：{parseLexiconEditorValue(mockLexiconValue).length}
                {mockLibrarySettings.missingCollection ? ' · 需先创建 app_settings 集合后才能保存词库。' : ''}
              </div>
              <button
                type="button"
                onClick={handleSaveMockLibrary}
                disabled={savingMockLibrary || loadingMockLibrary}
                style={{
                  border: 'none',
                  borderRadius: '12px',
                  backgroundColor: '#111827',
                  color: '#fff',
                  padding: '12px 18px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: savingMockLibrary || loadingMockLibrary ? 'default' : 'pointer',
                  opacity: savingMockLibrary || loadingMockLibrary ? 0.7 : 1
                }}
              >
                {savingMockLibrary ? '保存中...' : '保存词库'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const metricStyle = {
  padding: '14px 16px',
  borderRadius: '14px',
  backgroundColor: '#f8fafc'
};

const metricLabelStyle = {
  fontSize: '12px',
  color: '#64748b'
};

const metricValueStyle = {
  marginTop: '8px',
  fontSize: '22px',
  fontWeight: 700,
  color: '#111827'
};

const fieldLabelStyle = {
  display: 'block',
  marginBottom: '8px',
  fontSize: '13px',
  fontWeight: 600,
  color: '#334155'
};

const tableNumberCellStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  fontSize: '15px',
  fontWeight: 700,
  color: '#111827'
};

export default AwarenessTagSettings;
