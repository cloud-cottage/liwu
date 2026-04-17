import React, { useMemo, useState } from 'react';

const tagNatureLabel = {
  student: '学员觉察'
};

const AwarenessTagSettings = ({
  tags,
  settings,
  onSave,
  saving,
  error
}) => {
  const [draftDescriptions, setDraftDescriptions] = useState(() => (
    Object.fromEntries(
      tags.map((tag) => [tag.key, settings.tagsByKey?.[tag.key]?.description || ''])
    )
  ));
  const [successMessage, setSuccessMessage] = useState('');

  const mergedTags = useMemo(() => (
    tags.map((tag) => ({
      ...tag,
      description: draftDescriptions[tag.key] ?? settings.tagsByKey?.[tag.key]?.description ?? ''
    }))
  ), [draftDescriptions, settings.tagsByKey, tags]);

  const handleChange = (tagKey, value) => {
    setDraftDescriptions((currentDrafts) => ({
      ...currentDrafts,
      [tagKey]: value
    }));
    setSuccessMessage('');
  };

  const handleSave = async () => {
    const tagsByKey = Object.fromEntries(
      mergedTags.map((tag) => [
        tag.key,
        {
          description: (tag.description || '').trim()
        }
      ])
    );

    await onSave({ tagsByKey });
    setSuccessMessage('觉察标签简介已保存到 CloudBase。');
  };

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)'
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#333' }}>觉察标签设置</h2>
        <p style={{ margin: '0 0 24px', color: '#666', fontSize: '14px', lineHeight: 1.6 }}>
          这里维护社区觉察标签的简介。普通标签默认不展示性质，学员标签会在前台标记为“学员觉察”。
        </p>

        {(error || successMessage) && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              backgroundColor: error ? '#fff3f3' : '#f1f8f4',
              color: error ? '#c62828' : '#2e7d32',
              fontSize: '13px',
              lineHeight: 1.6,
              marginBottom: '20px'
            }}
          >
            {error || successMessage}
          </div>
        )}

        <div style={{ display: 'grid', gap: '16px' }}>
          {mergedTags.length === 0 ? (
            <div
              style={{
                border: '1px dashed #dbe4ee',
                borderRadius: '14px',
                padding: '24px',
                textAlign: 'center',
                color: '#64748b',
                backgroundColor: '#f8fafc'
              }}
            >
              暂无觉察标签数据。等社区成员发布觉察后，这里会自动出现对应标签。
            </div>
          ) : mergedTags.map((tag) => (
            <div
              key={tag.key}
              style={{
                border: '1px solid #eceff5',
                borderRadius: '14px',
                padding: '18px',
                backgroundColor: '#f8fafc'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>{tag.content}</div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                    历史标记 {tag.totalCount} 次 · 最近标记者 {tag.lastUserName || '匿名用户'}
                  </div>
                </div>
                {tag.accessType === 'student' && (
                  <span
                    style={{
                      alignSelf: 'flex-start',
                      fontSize: '12px',
                      color: '#0f766e',
                      backgroundColor: 'rgba(15, 118, 110, 0.12)',
                      borderRadius: '999px',
                      padding: '6px 10px'
                    }}
                  >
                    {tagNatureLabel.student}
                  </span>
                )}
              </div>

              <textarea
                value={tag.description}
                onChange={(event) => handleChange(tag.key, event.target.value)}
                placeholder="无简介"
                style={{
                  width: '100%',
                  minHeight: '88px',
                  borderRadius: '12px',
                  border: '1px solid #dbe4ee',
                  padding: '12px 14px',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  color: '#334155'
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              border: 'none',
              borderRadius: '10px',
              backgroundColor: '#2196F3',
              color: '#fff',
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? '保存中...' : '保存简介'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AwarenessTagSettings;
