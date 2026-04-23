import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Share2, X } from 'lucide-react';

const platformButtonStyle = {
  border: '1px solid #cbd5e1',
  backgroundColor: '#fff',
  color: '#334155',
  borderRadius: '999px',
  padding: '9px 14px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer'
};

const ShareDialog = ({
  payload,
  onClose,
  title = '分享此页',
  description = '一键分享，好友通过你的链接注册会自动与你绑定邀请关系。'
}) => {
  const [shareStatus, setShareStatus] = useState('');

  useEffect(() => {
    setShareStatus('');
  }, [payload?.url]);

  if (!payload) {
    return null;
  }

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share(payload.links.native);
        setShareStatus('已调用系统分享面板');
        return;
      } catch (shareError) {
        if (shareError?.name !== 'AbortError') {
          setShareStatus('系统分享失败，已为你保留其它分享方式');
        }
      }
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload.url);
      setShareStatus('分享链接已复制，可直接发到微信、朋友圈或群聊');
      return;
    }

    setShareStatus('当前浏览器不支持系统分享，请使用下方平台按钮');
  };

  const handleCopyLink = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload.url);
      setShareStatus('链接已复制');
      return;
    }

    setShareStatus(`请手动复制：${payload.url}`);
  };

  const handleCopyForPlatform = (platformName) => async () => {
    const shareContent = `${payload.text}\n${payload.url}`;

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareContent);
      setShareStatus(`已复制分享内容，可直接粘贴到${platformName}`);
      return;
    }

    setShareStatus(`请手动复制到${platformName}：${payload.url}`);
  };

  const openPlatformShare = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

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
        zIndex: 50
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
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.7, marginBottom: '16px' }}>
          {description}
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
          <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 600, marginBottom: '8px' }}>{payload.text}</div>
          <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6, wordBreak: 'break-all' }}>{payload.url}</div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <button
            type="button"
            onClick={handleNativeShare}
            style={{
              flex: 1,
              border: 'none',
              background: 'var(--theme-button-primary-bg)',
              color: 'var(--theme-button-primary-text)',
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
          <button type="button" onClick={handleCopyForPlatform('微信好友')} style={platformButtonStyle}>微信好友</button>
          <button type="button" onClick={handleCopyForPlatform('微信朋友圈')} style={platformButtonStyle}>微信朋友圈</button>
          <button type="button" onClick={() => openPlatformShare(payload.links.weibo)} style={platformButtonStyle}>微博</button>
          <button type="button" onClick={handleCopyForPlatform('小红书')} style={platformButtonStyle}>小红书</button>
          <button type="button" onClick={handleCopyForPlatform('抖音')} style={platformButtonStyle}>抖音</button>
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
      </div>
    </div>
  );
};

export default ShareDialog;
