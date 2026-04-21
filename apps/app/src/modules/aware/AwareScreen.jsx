import React, { useEffect, useMemo, useState } from 'react';
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

const AWARENESS_REPUBLISH_INTERVAL_MS = 60 * 60 * 1000;
const AWARENESS_PENDING_QUEUE_KEY_PREFIX = 'liwu_awareness_pending_queue_v1';

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

const buildAwarenessQueueStorageKey = (userKey = 'guest') => `${AWARENESS_PENDING_QUEUE_KEY_PREFIX}:${userKey}`;

const readPendingQueue = (userKey) => {
  if (typeof window === 'undefined' || !userKey) {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(buildAwarenessQueueStorageKey(userKey));
    return storedValue ? JSON.parse(storedValue) : null;
  } catch {
    return null;
  }
};

const writePendingQueue = (userKey, value) => {
  if (typeof window === 'undefined' || !userKey) {
    return;
  }

  window.localStorage.setItem(buildAwarenessQueueStorageKey(userKey), JSON.stringify(value));
};

const removePendingQueue = (userKey) => {
  if (typeof window === 'undefined' || !userKey) {
    return;
  }

  window.localStorage.removeItem(buildAwarenessQueueStorageKey(userKey));
};

const formatRemainingMinutes = (dueAt) => {
  const remainingMs = Math.max(0, new Date(dueAt).getTime() - Date.now());
  return Math.max(1, Math.ceil(remainingMs / 60000));
};

const getPendingQueueMessage = (queueItem) => (
  `有一条觉察正在发布队列中，约 ${formatRemainingMinutes(queueItem.dueAt)} 分钟后会自动发布。`
);

const InlineToast = ({ message, onClose }) => {
  if (!message) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '18px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        width: 'calc(100% - 32px)',
        maxWidth: '440px'
      }}
    >
      <div
        style={{
          borderRadius: '16px',
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          color: '#fff',
          padding: '12px 14px',
          boxShadow: '0 18px 48px rgba(15, 23, 42, 0.22)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        }}
      >
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#e2e8f0' }}>{message}</div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: 'none',
            borderRadius: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.14)',
            color: '#fff',
            padding: '8px 10px',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          知道了
        </button>
      </div>
    </div>
  );
};

const AwareTagModal = ({
  tag,
  currentUser,
  isLoggedIn,
  pendingQueueItem,
  submitting,
  onClose,
  onSubmit
}) => {
  if (!tag) {
    return null;
  }

  const accessMeta = getAccessMeta(tag.accessType);
  const blockedReason = pendingQueueItem
    ? getPendingQueueMessage(pendingQueueItem)
    : !isLoggedIn
      ? '登录后可发布这条觉察。'
      : !canPublishTag(tag, currentUser)
        ? '这是学员觉察标签，你可以查看详情，但当前身份还不能发布。'
        : '';
  const disabled = Boolean(blockedReason) || submitting;
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
          {tag.actionHint && (
            <div style={{ fontSize: '13px', color: '#0f172a', lineHeight: 1.7, fontWeight: 600 }}>
              {tag.actionHint}
            </div>
          )}
          {blockedReason && (
            <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.7 }}>
              {blockedReason}
            </div>
          )}
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
            background: disabled ? '#cbd5e1' : 'var(--theme-button-primary-bg)',
            color: disabled ? '#fff' : 'var(--theme-button-primary-text)',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: disabled || submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1
          }}
        >
          {pendingQueueItem
            ? '队列发布中'
            : !isLoggedIn
              ? '登录后可发布'
              : !canPublishTag(tag, currentUser)
                ? '仅学员可发布'
                : submitting
                  ? '发布中...'
                  : '我也觉察它'}
        </button>
      </div>
    </div>
  );
};

const Record = () => {
  const location = useLocation();
  const {
    authStatus,
    currentUser,
    userTags,
    popularTags,
    loading,
    refreshing,
    error: cloudError,
    addAwarenessRecord,
    refreshData
  } = useCloudAwareness();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialSharedTag = searchParams.get('tag')?.trim().slice(0, 6) || '';
  const initialShortTagCode = searchParams.get('t')?.trim() || '';
  const [inputValue, setInputValue] = useState(initialSharedTag);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedAccessType, setSelectedAccessType] = useState('public');
  const [activeAwareTag, setActiveAwareTag] = useState(null);
  const [creationPromptOpen, setCreationPromptOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState(null);
  const [shareStatus, setShareStatus] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [pendingQueueItem, setPendingQueueItem] = useState(null);
  const [queueTick, setQueueTick] = useState(0);
  const maxPopularTagCount = useMemo(() => (
    popularTags.reduce((currentMax, tag) => Math.max(currentMax, tag.totalCount || 0), 0)
  ), [popularTags]);
  const canPublishAwareness = Boolean(authStatus?.isAuthenticated);
  const queueUserKey = currentUser?.id || authStatus?.authUid || '';

  const showToast = (message) => {
    setToastMessage(message);
  };

  useEffect(() => {
    if (!initialShortTagCode) {
      setInputValue(initialSharedTag);
      return;
    }

    let disposed = false;

    void (async () => {
      const result = await awarenessService.resolveTagContentByShortCode(initialShortTagCode);
      if (disposed) {
        return;
      }

      if (result.success && result.data?.content) {
        setInputValue(String(result.data.content).slice(0, 6));
        return;
      }

      setInputValue(initialSharedTag);
    })();

    return () => {
      disposed = true;
    };
  }, [initialSharedTag, initialShortTagCode]);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setToastMessage('');
    }, 3200);

    return () => window.clearTimeout(timerId);
  }, [toastMessage]);

  useEffect(() => {
    if (!queueUserKey) {
      setPendingQueueItem(null);
      return;
    }

    setPendingQueueItem(readPendingQueue(queueUserKey));
  }, [queueUserKey]);

  useEffect(() => {
    if (!pendingQueueItem) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setQueueTick((currentValue) => currentValue + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [pendingQueueItem]);

  useEffect(() => {
    if (!pendingQueueItem || !canPublishAwareness || submitting) {
      return;
    }

    if (Date.now() < new Date(pendingQueueItem.dueAt).getTime()) {
      return;
    }

    void (async () => {
      setSubmitting(true);
      const result = await addAwarenessRecord(pendingQueueItem.content, {
        accessType: pendingQueueItem.accessType,
        recordSource: pendingQueueItem.recordSource || 'manual'
      });
      setSubmitting(false);

      if (!result.success) {
        setError(result.error?.message || '自动发布失败，请稍后重试');
        return;
      }

      removePendingQueue(queueUserKey);
      setPendingQueueItem(null);
      setError('');
      setInputValue('');
      setSelectedAccessType('public');
      setSharePayload(result.sharePayload);
      setShareStatus('');
      showToast(`队列中的觉察「${pendingQueueItem.content}」已自动发布。`);
    })();
  }, [addAwarenessRecord, canPublishAwareness, pendingQueueItem, queueTick, queueUserKey, submitting]);

  const submitAwareness = async ({ content, accessType, recordSource = 'manual' }) => {
    setSubmitting(true);
    const result = await addAwarenessRecord(content, { accessType, recordSource });
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

  const queueAwarenessPublish = ({ content, accessType, recordSource, dueAt }) => {
    if (!queueUserKey) {
      return;
    }

    const nextQueueItem = {
      content,
      accessType,
      recordSource,
      dueAt,
      createdAt: new Date().toISOString()
    };

    writePendingQueue(queueUserKey, nextQueueItem);
    setPendingQueueItem(nextQueueItem);
    setActiveAwareTag(null);
    setCreationPromptOpen(false);
    showToast(`发布间隔需大于 1 小时，已为你加入发布队列，约 ${formatRemainingMinutes(dueAt)} 分钟后自动发布。`);
  };

  const attemptPublishAwareness = async ({ content, accessType, recordSource = 'manual' }) => {
    if (pendingQueueItem) {
      showToast(getPendingQueueMessage(pendingQueueItem));
      return;
    }

    const latestRecordResult = await awarenessService.getCurrentUserLatestRecordByContent(content);
    if (!latestRecordResult.success) {
      setError(latestRecordResult.error?.message || '发布检查失败，请重试');
      return;
    }

    const latestRecord = latestRecordResult.data;
    if (latestRecord?.timestamp) {
      const latestTimestamp = new Date(latestRecord.timestamp).getTime();
      const nowTimestamp = Date.now();
      if (nowTimestamp - latestTimestamp < AWARENESS_REPUBLISH_INTERVAL_MS) {
        queueAwarenessPublish({
          content,
          accessType,
          recordSource,
          dueAt: new Date(latestTimestamp + AWARENESS_REPUBLISH_INTERVAL_MS).toISOString()
        });
        return;
      }
    }

    await submitAwareness({ content, accessType, recordSource });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedValue = inputValue.trim();

    if (!canPublishAwareness) {
      setError('请先登录后再发布觉察标签');
      return;
    }

    if (!trimmedValue) {
      setError('请输入标签内容');
      return;
    }

    if (pendingQueueItem) {
      showToast(getPendingQueueMessage(pendingQueueItem));
      return;
    }

    if (trimmedValue.length > 6) {
      setError('标签长度不能超过 6 个字符');
      return;
    }

    const existingTagResult = await awarenessService.findExistingTagByContent(trimmedValue);
    if (!existingTagResult.success) {
      setError(existingTagResult.error?.message || '标签查询失败，请重试');
      return;
    }

    if (existingTagResult.data) {
      try {
        const metadata = await awarenessService.getTagMetadata(existingTagResult.data.key);
        setActiveAwareTag({
          ...existingTagResult.data,
          description: metadata.description || existingTagResult.data.description || '',
          actionHint: '社区已经有人发布过这个觉察，我也觉察它。'
        });
      } catch {
        setActiveAwareTag({
          ...existingTagResult.data,
          actionHint: '社区已经有人发布过这个觉察，我也觉察它。'
        });
      }
      return;
    }

    if (!currentUser?.isStudent) {
      setCreationPromptOpen(true);
      return;
    }

    await attemptPublishAwareness({
      content: trimmedValue,
      accessType: currentUser?.isStudent ? selectedAccessType : 'public',
      recordSource: 'manual'
    });
  };

  const handleTagClick = async (tag) => {
    setError('');
    try {
      const metadata = await awarenessService.getTagMetadata(tag.key);
      setActiveAwareTag({
        ...tag,
        description: metadata.description || tag.description || '',
        actionHint: !canPublishTag(tag, currentUser)
          ? '社区已经有人发布过这个觉察，你可以先看看它的含义。'
          : ''
      });
    } catch {
      setActiveAwareTag({
        ...tag,
        actionHint: !canPublishTag(tag, currentUser)
          ? '社区已经有人发布过这个觉察，你可以先看看它的含义。'
          : ''
      });
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

  const handleCopyForPlatform = async (platformName) => {
    if (!sharePayload) {
      return;
    }

    const shareContent = `${sharePayload.text}\n${sharePayload.url}`;

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareContent);
      setShareStatus(`已复制分享内容，可直接粘贴到${platformName}`);
      return;
    }

    setShareStatus(`请手动复制到${platformName}：${sharePayload.url}`);
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
      <InlineToast message={toastMessage} onClose={() => setToastMessage('')} />

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

      {!pendingQueueItem && (
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
                disabled={!canPublishAwareness}
                onChange={(event) => {
                  setInputValue(event.target.value);
                  setError('');
                }}
                placeholder={canPublishAwareness ? '输入你的状态（6个汉字以内）' : '登录后可发布觉察标签'}
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
                  transition: 'border-color 0.2s',
                  backgroundColor: canPublishAwareness ? '#fff' : '#f8fafc',
                  cursor: canPublishAwareness ? 'text' : 'not-allowed'
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
              disabled={submitting || loading || !canPublishAwareness}
              style={{
                width: '100%',
                padding: '14px',
              backgroundColor: submitting || !canPublishAwareness ? '#ccc' : 'var(--color-accent-ink)',
              background: submitting || !canPublishAwareness ? '#ccc' : 'var(--theme-button-primary-bg)',
              color: submitting || !canPublishAwareness ? '#fff' : 'var(--theme-button-primary-text)',
              border: 'none',
              borderRadius: '12px',
              fontWeight: '500',
                fontSize: '16px',
                cursor: submitting || !canPublishAwareness ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'opacity 0.2s',
                opacity: submitting ? 0.7 : 1
              }}
            >
              <Sparkles size={18} />
              {submitting ? '提交中...' : canPublishAwareness ? '觉察此刻' : '登录后可发布'}
            </button>
          </form>
          {!canPublishAwareness && (
            <div style={{ marginTop: '12px', fontSize: '12px', color: '#64748b', lineHeight: 1.7 }}>
              游客模式可浏览社区觉察内容，但不能发布觉察标签。
            </div>
          )}
        </div>
      )}

      {pendingQueueItem && (
        <div
          style={{
            marginBottom: '24px',
            backgroundColor: '#fff',
            padding: '18px',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid rgba(214, 140, 101, 0.18)'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            publish_queue
          </div>
          <div style={{ marginTop: '8px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>
            {pendingQueueItem.content}
          </div>
          <div style={{ marginTop: '8px', fontSize: '13px', color: '#475569', lineHeight: 1.7 }}>
            这条觉察正在发布队列中，约 {formatRemainingMinutes(pendingQueueItem.dueAt)} 分钟后会自动发布。你也可以在此之前取消它。
          </div>
          <button
            type="button"
            onClick={() => {
              removePendingQueue(queueUserKey);
              setPendingQueueItem(null);
              showToast('已取消这条待发布的觉察。');
            }}
            style={{
              marginTop: '14px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              color: '#334155',
              borderRadius: '12px',
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            取消发布
          </button>
        </div>
      )}

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
              const isStudentRestricted = tag.accessType === 'student' && !canPublishTag(tag, currentUser);
              const fontSize = getTagCloudFontSize(tag.totalCount || 0, maxPopularTagCount);

              return (
                <button
                  key={tag.key}
                  onClick={() => handleTagClick(tag)}
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#fff',
                    border: isStudentRestricted ? '1px dashed #0f766e' : `1px solid ${meta.borderColor}`,
                    borderRadius: '20px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: meta.color,
                    fontSize,
                    fontWeight: tag.totalCount === maxPopularTagCount ? 700 : 600,
                    lineHeight: 1.2,
                    boxShadow: isStudentRestricted ? '0 0 0 1px rgba(15, 118, 110, 0.08), var(--shadow-sm)' : 'var(--shadow-sm)'
                  }}
                >
                  {tag.accessType === 'student' && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#0f766e',
                        backgroundColor: 'rgba(15, 118, 110, 0.1)',
                        borderRadius: '999px',
                        padding: '4px 8px'
                      }}
                    >
                      学员
                    </span>
                  )}
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
        isLoggedIn={canPublishAwareness}
        pendingQueueItem={pendingQueueItem}
        submitting={submitting}
        onClose={() => setActiveAwareTag(null)}
        onSubmit={(tag) => attemptPublishAwareness({ content: tag.content, accessType: tag.accessType, recordSource: 'follow' })}
      />

      {creationPromptOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 32
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827' }}>暂不可创建新标签</div>
              <button
                type="button"
                onClick={() => setCreationPromptOpen(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.8 }}>
              创建新的觉察标签需要学员用户身份。先去社区已经存在的觉察标签里看一看，也许此刻就有适合你的那一个。
            </div>

            <button
              type="button"
              onClick={() => setCreationPromptOpen(false)}
              style={{
                width: '100%',
                marginTop: '18px',
                border: 'none',
                borderRadius: '12px',
                background: 'var(--theme-button-primary-bg)',
                color: 'var(--theme-button-primary-text)',
                padding: '12px 14px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              我知道了
            </button>
          </div>
        </div>
      )}

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
              一键分享，好友通过你的链接注册会自动与你绑定邀请关系。
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
              <button type="button" onClick={() => openPlatformShare(sharePayload.links.weibo)} style={platformButtonStyle}>微博</button>
              <button type="button" onClick={() => handleCopyForPlatform('小红书')} style={platformButtonStyle}>小红书</button>
              <button type="button" onClick={() => handleCopyForPlatform('抖音')} style={platformButtonStyle}>抖音</button>
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
