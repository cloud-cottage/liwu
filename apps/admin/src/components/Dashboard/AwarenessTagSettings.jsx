import React, { useMemo, useState } from 'react';

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
  draftContent,
  draftAccessType,
  draftDescription,
  draftRewardPoints,
  saving,
  onClose,
  onContentChange,
  onAccessTypeChange,
  onDescriptionChange,
  onRewardPointsChange,
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
  onSave,
  saving,
  error
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'totalCount', direction: 'desc' });
  const [selectedTagKey, setSelectedTagKey] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftAccessType, setDraftAccessType] = useState('public');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftRewardPoints, setDraftRewardPoints] = useState('0');
  const [message, setMessage] = useState({ type: '', text: '' });

  const mergedTags = useMemo(() => (
    tags.map((tag) => {
      const setting = settings.tagsByKey?.[tag.key] || {};
      return {
        ...tag,
        description: setting.description ?? tag.description ?? '',
        rewardPoints: normalizeRewardPoints(setting.rewardPoints ?? tag.rewardPoints),
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
        rewardPoints: normalizeRewardPoints(draftRewardPoints)
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

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#333' }}>觉察设置</h2>
          <p style={{ margin: 0, color: '#666', fontSize: '14px', lineHeight: 1.6 }}>
            搜索觉察标签，按列排序，并在模态框中维护标签简介与奖励数量。
          </p>
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
        draftContent={draftContent}
        draftAccessType={draftAccessType}
        draftDescription={draftDescription}
        draftRewardPoints={draftRewardPoints}
        saving={saving}
        onClose={() => {
          setSelectedTagKey('');
          setDraftContent('');
          setDraftAccessType('public');
          setDraftDescription('');
          setDraftRewardPoints('0');
        }}
        onContentChange={setDraftContent}
        onAccessTypeChange={setDraftAccessType}
        onDescriptionChange={setDraftDescription}
        onRewardPointsChange={setDraftRewardPoints}
        onSave={handleSave}
      />
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
