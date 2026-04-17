import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CheckCircle2,
  Copy,
  Lock,
  RefreshCw,
  Share2,
  Sparkles,
  TrendingUp,
  X
} from 'lucide-react';
import { useCloudAwareness } from '../../context/CloudAwarenessContext';
import { awarenessService } from '../../services/cloudbase';

const ACCESS_TYPE_META = {
  public: {
    label: '普通觉察',
    hint: '所有人可发布',
    color: '#2563eb',
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderColor: 'rgba(37, 99, 235, 0.18)'
  },
  student: {
    label: '学员觉察',
    hint: '仅学员可发布',
    color: '#0f766e',
    backgroundColor: 'rgba(15, 118, 110, 0.1)',
    borderColor: 'rgba(15, 118, 110, 0.18)'
  }
};

const getAccessMeta = (accessType) => ACCESS_TYPE_META[accessType] || ACCESS_TYPE_META.public;

const canPublishTag = (tag, currentUser) => tag.accessType !== 'student' || Boolean(currentUser?.isStudent);

const getTagCloudFontSize = (count, maxCount) => {
  if (!maxCount || count >= maxCount) {
    return 24;
  }

  if (count >= Math.max(2, Math.ceil(maxCount * 0.66))) {
    return 20;
  }

  if (count >= Math.max(2, Math.ceil(maxCount * 0.4))) {
    return 17;
  }

  return 15;
};

const AwareTagModal = ({
  tag,
  currentUser,
  submitting,
  onClose,
  onSubmit
}) => {
  if (!tag) {
    return null;
  }

  const accessMeta = getAccessMeta(tag.accessType);
  const disabled = !canPublishTag(tag, currentUser);
  const historicalCount = tag.totalCount || tag.count || 0;
  const lastUserName = tag.lastUserName || '匿名用户';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 30
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#fff',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.2)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              aware_tag
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginTop: '6px' }}>{tag.content}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            borderRadius: '16px',
            padding: '16px',
            backgroundColor: accessMeta.backgroundColor,
            border: `1px solid ${accessMeta.borderColor}`,
            marginBottom: '16px'
          }}
        >
          <div style={{ fontSize: '14px', color: '#334155', lineHeight: 1.8 }}>
            {tag.description?.trim() ? tag.description.trim() : '无简介'}
          </div>
        </div>

        {tag.accessType === 'student' && (
          <div style={{ marginBottom: '12px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: '999px',
                backgroundColor: 'rgba(15, 118, 110, 0.12)',
                color: '#0f766e',
                fontSize: '12px',
                fontWeight: 600,
                padding: '6px 10px'
              }}
            >
              学员觉察
            </span>
          </div>
        )}

        <div style={{ display: 'grid', gap: '10px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: '#475569' }}>历史标记总数：{historicalCount}</div>
          <div style={{ fontSize: '13px', color: '#475569' }}>最近标记者：{lastUserName}</div>
        </div>

        <button
          type="button"
          onClick={() => onSubmit(tag)}
          disabled={disabled || submitting}
          style={{
            width: '100%',
            border: 'none',
            backgroundColor: disabled ? '#cbd5e1' : '#111827',
            color: '#fff',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: disabled || submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1
          }}
        >
          {disabled ? '仅学员可觉察' : submitting ? '发布中...' : '我也觉察它'}
        </button>
      </div>
    </div>
  );
};

const Record = () => {
  const location = useLocation();
  const {
    currentUser,
    userTags,
    popularTags,
    loading,
    refreshing,
    error: cloudError,
    addAwarenessRecord,
    refreshData
  } = useCloudAwareness();

  const initialSharedTag = new URLSearchParams(location.search).get('tag')?.trim().slice(0, 6) || '';
  const [inputValue, setInputValue] = useState(initialSharedTag);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedAccessType, setSelectedAccessType] = useState('public');
  const [activeAwareTag, setActiveAwareTag] = useState(null);
  const [sharePayload, setSharePayload] = useState(null);
  const [shareStatus, setShareStatus] = useState('');
  const maxPopularTagCount = useMemo(() => (
    popularTags.reduce((currentMax, tag) => Math.max(currentMax, tag.totalCount || 0), 0)
  ), [popularTags]);

  const submitAwareness = async ({ content, accessType }) => {
    setSubmitting(true);
    const result = await addAwarenessRecord(content, { accessType });
    setSubmitting(false);

    if (!result.success) {
      setError(result.error?.message || '提交失败，请重试');
      return;
    }

    setError('');
    setActiveAwareTag(null);
    setInputValue('');
    setSelectedAccessType('public');
    setSharePayload(result.sharePayload);
    setShareStatus('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedValue = inputValue.trim();

    if (!trimmedValue) {
      setError('请输入标签内容');
      return;
    }

    if (trimmedValue.length > 6) {
      setError('标签长度不能超过 6 个字符');
      return;
    }

    await submitAwareness({
      content: trimmedValue,
      accessType: currentUser?.isStudent ? selectedAccessType : 'public'
    });
  };

  const handleTagClick = async (tag) => {
    if (!canPublishTag(tag, currentUser)) {
      setError('学员觉察标签仅学员可发布');
      return;
    }

    setError('');
    try {
      const metadata = await awarenessService.getTagMetadata(tag.key);
      setActiveAwareTag({
        ...tag,
        description: metadata.description || tag.description || ''
      });
    } catch {
      setActiveAwareTag(tag);
    }
  };

  const handleRefresh = async () => {
    await refreshData({ force: true });
  };

  const handleNativeShare = async () => {
    if (!sharePayload) {
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share(sharePayload.links.native);
        setShareStatus('已调用系统分享面板');
        return;
      } catch (shareError) {
        if (shareError?.name !== 'AbortError') {
          setShareStatus('系统分享失败，已为你保留其它分享方式');
        }
      }
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(sharePayload.url);
      setShareStatus('分享链接已复制，可直接发到微信、朋友圈或群聊');
      return;
    }

    setShareStatus('当前浏览器不支持系统分享，请使用下方平台按钮');
  };

  const handleCopyLink = async () => {
    if (!sharePayload?.url) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(sharePayload.url);
      setShareStatus('链接已复制');
      return;
    }

    setShareStatus(`请手动复制：${sharePayload.url}`);
  };

  const openPlatformShare = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const accessMeta = getAccessMeta(selectedAccessType);

  return (
    <div
      style={{
        padding: '20px',
        paddingBottom: '100px',
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-primary)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <h1
            style={{
              fontSize: '28px',
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-text-primary)',
              margin: 0
            }}
          >
            觉察
          </h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading || refreshing}
          style={{
            background: 'none',
            border: 'none',
            cursor: loading || refreshing ? 'not-allowed' : 'pointer',
            padding: '8px',
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            opacity: loading || refreshing ? 0.5 : 1
          }}
        >
          <RefreshCw size={16} style={{ animation: loading || refreshing ? 'spin 1s linear infinite' : 'none' }} />
          刷新
        </button>
      </div>

      {(error || cloudError) && (
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 14px',
            borderRadius: '12px',
            backgroundColor: '#fff1f2',
            border: '1px solid #fecdd3',
            color: '#be123c',
            fontSize: '13px',
            lineHeight: 1.6
          }}
        >
          {error || cloudError}
        </div>
      )}

      <div
        style={{
          backgroundColor: '#fff',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '24px'
        }}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <input
              id="awareness-status"
              name="awareness-status"
              type="text"
              value={inputValue}
              onChange={(event) => {
                setInputValue(event.target.value);
                setError('');
              }}
              placeholder="输入你的状态（6个汉字以内）"
              maxLength={6}
              style={{
                width: '100%',
                padding: '14px',
                border: error ? '2px solid #f56565' : '1px solid var(--color-border)',
                borderRadius: '12px',
                fontSize: '16px',
                boxSizing: 'border-box',
                fontFamily: 'var(--font-sans)',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
            <div
              style={{
                fontSize: '12px',
                color: 'var(--color-text-secondary)',
                marginTop: '8px',
                textAlign: 'right'
              }}
            >
              {inputValue.length}/6
            </div>
          </div>

          {currentUser?.isStudent && (
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
                发布类型
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {Object.entries(ACCESS_TYPE_META).map(([type, meta]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedAccessType(type)}
                    style={{
                      border: selectedAccessType === type ? `1px solid ${meta.color}` : `1px solid ${meta.borderColor}`,
                      backgroundColor: meta.backgroundColor,
                      color: meta.color,
                      borderRadius: '12px',
                      padding: '10px 14px',
                      cursor: 'pointer',
                      minWidth: '136px',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{meta.label}</div>
                    <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>{meta.hint}</div>
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: accessMeta.color, marginTop: '10px' }}>
                {selectedAccessType === 'student' ? '所有人都能看到此标签，但只有学员可以继续发布。' : '任何用户都可以继续发布此标签。'}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || loading}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: submitting ? '#ccc' : 'var(--color-accent-ink)',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              fontWeight: '500',
              fontSize: '16px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'opacity 0.2s',
              opacity: submitting ? 0.7 : 1
            }}
          >
            <Sparkles size={18} />
            {submitting ? '提交中...' : '觉察此刻'}
          </button>
        </form>
      </div>

      {userTags.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            我的常用觉察
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {userTags.map((tag) => {
              const meta = getAccessMeta(tag.accessType);
              return (
                <button
                  key={tag.key}
                  onClick={() => handleTagClick(tag)}
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#fff',
                    border: `1px solid ${meta.borderColor}`,
                    borderRadius: '20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  {tag.accessType === 'student' && <Lock size={14} color={meta.color} />}
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{tag.content}</span>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{tag.count}次</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {popularTags.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <TrendingUp size={18} color="var(--color-accent-clay)" />
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
              同心同照亮
            </h2>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px 16px',
              alignItems: 'center',
              backgroundColor: '#fff',
              borderRadius: '18px',
              padding: '20px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            {popularTags.map((tag) => {
              const meta = getAccessMeta(tag.accessType);
              const disabled = !canPublishTag(tag, currentUser);
              const fontSize = getTagCloudFontSize(tag.totalCount || 0, maxPopularTagCount);

              return (
                <button
                  key={tag.key}
                  onClick={() => handleTagClick(tag)}
                  disabled={disabled}
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#fff',
                    border: `1px solid ${meta.borderColor}`,
                    borderRadius: '20px',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    opacity: disabled ? 0.45 : 1,
                    color: meta.color,
                    fontSize,
                    fontWeight: tag.totalCount === maxPopularTagCount ? 700 : 600,
                    lineHeight: 1.2,
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <span>{tag.content}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <AwareTagModal
        tag={activeAwareTag}
        currentUser={currentUser}
        submitting={submitting}
        onClose={() => setActiveAwareTag(null)}
        onSubmit={(tag) => submitAwareness({ content: tag.content, accessType: tag.accessType })}
      />

      {sharePayload && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 40
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              backgroundColor: '#fff',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 24px 80px rgba(15, 23, 42, 0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={20} color="#16a34a" />
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>发布成功</div>
              </div>
              <button
                type="button"
                onClick={() => setSharePayload(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.7, marginBottom: '16px' }}>
              你的觉察已同步到 CloudBase。现在可以一键分享，好友通过该链接进入并注册后，会自动与你建立邀请关系。
            </div>

            <div
              style={{
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
                padding: '14px',
                marginBottom: '16px'
              }}
            >
              <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 600, marginBottom: '8px' }}>{sharePayload.text}</div>
              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6, wordBreak: 'break-all' }}>{sharePayload.url}</div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <button
                type="button"
                onClick={handleNativeShare}
                style={{
                  flex: 1,
                  border: 'none',
                  backgroundColor: '#111827',
                  color: '#fff',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Share2 size={16} />
                一键分享
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                style={{
                  flex: 1,
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#fff',
                  color: '#334155',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Copy size={16} />
                复制链接
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              <button type="button" onClick={() => openPlatformShare(sharePayload.links.weibo)} style={platformButtonStyle}>微博</button>
              <button type="button" onClick={() => openPlatformShare(sharePayload.links.x)} style={platformButtonStyle}>X</button>
              <button type="button" onClick={() => openPlatformShare(sharePayload.links.facebook)} style={platformButtonStyle}>Facebook</button>
              <button type="button" onClick={() => openPlatformShare(sharePayload.links.whatsapp)} style={platformButtonStyle}>WhatsApp</button>
              <button type="button" onClick={() => openPlatformShare(sharePayload.links.telegram)} style={platformButtonStyle}>Telegram</button>
              <button type="button" onClick={() => openPlatformShare(sharePayload.links.linkedIn)} style={platformButtonStyle}>LinkedIn</button>
            </div>

            {shareStatus && (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: '#eff6ff',
                  color: '#1d4ed8',
                  fontSize: '12px',
                  lineHeight: 1.6
                }}
              >
                {shareStatus}
              </div>
            )}

            <button
              type="button"
              onClick={() => setSharePayload(null)}
              style={{
                width: '100%',
                border: '1px solid #cbd5e1',
                backgroundColor: '#fff',
                color: '#334155',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              继续觉察
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const platformButtonStyle = {
  border: '1px solid #cbd5e1',
  backgroundColor: '#fff',
  color: '#334155',
  borderRadius: '999px',
  padding: '8px 12px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer'
};

export default Record;
