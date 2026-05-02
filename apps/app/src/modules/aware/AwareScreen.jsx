import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Share2,
  Sparkles,
  UserRound,
  X
} from 'lucide-react';
import { useCloudAwareness } from '../../context/CloudAwarenessContext';
import { awarenessService } from '../../services/cloudbase';

const AWARENESS_REPUBLISH_INTERVAL_MS = 60 * 60 * 1000;
const AWARENESS_PENDING_QUEUE_KEY_PREFIX = 'liwu_awareness_pending_queue_v1';

const ACCESS_TYPE_META = {
  public: {
    color: '#2563eb',
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderColor: 'rgba(37, 99, 235, 0.18)'
  },
  student: {
    color: '#0f766e',
    backgroundColor: 'rgba(15, 118, 110, 0.1)',
    borderColor: 'rgba(15, 118, 110, 0.18)'
  }
};

const getAccessMeta = (accessType) => ACCESS_TYPE_META[accessType] || ACCESS_TYPE_META.public;

const canPublishTag = (tag, currentUser) => tag.accessType !== 'student' || Boolean(currentUser?.isStudent);
const isAppClient = () => typeof document !== 'undefined' && document.documentElement?.dataset?.liwuClient === 'app';

const getTagCloudFontSize = (count, maxCount) => {
  if (!maxCount) {
    return 17;
  }

  const safeCount = Math.max(1, Number(count || 0));
  const ratio = Math.max(0.18, Math.min(1, safeCount / maxCount));
  return Math.round(14 + (ratio * 16));
};

const WORD_CLOUD_MIN_WIDTH = 520;
const WORD_CLOUD_MIN_HEIGHT = 640;
const WORD_CLOUD_COLLISION_GAP = 8;
const WORD_CLOUD_HORIZONTAL_PADDING = 30;
const WORD_CLOUD_VERTICAL_PADDING = 20;
const WORD_CLOUD_SCAN_STEP = 8;
const WORD_CLOUD_FONT_FAMILY = "'Noto Sans SC', 'PingFang SC', system-ui, sans-serif";

const getStableSeedFromText = (value = '') => (
  Array.from(String(value)).reduce((sum, char, index) => sum + (char.charCodeAt(0) * (index + 1)), 0)
);

const estimateWordCloudTagSize = (tag, fontSize, measureContext) => {
  if (measureContext) {
    measureContext.font = `600 ${fontSize}px ${WORD_CLOUD_FONT_FAMILY}`;
  }

  const measuredWidth = measureContext
    ? Math.ceil(measureContext.measureText(tag.content || '').width)
    : Math.ceil(String(tag.content || '').length * fontSize * 0.95);

  return {
    width: Math.max(64, measuredWidth + WORD_CLOUD_HORIZONTAL_PADDING),
    height: Math.max(38, Math.ceil(fontSize * 1.25) + WORD_CLOUD_VERTICAL_PADDING)
  };
};

const rectanglesOverlap = (left, right, gap = WORD_CLOUD_COLLISION_GAP) => !(
  left.x + left.width + gap <= right.x ||
  right.x + right.width + gap <= left.x ||
  left.y + left.height + gap <= right.y ||
  right.y + right.height + gap <= left.y
);

const isRectangleInBounds = (rect, width, height) => (
  rect.x >= 0 &&
  rect.y >= 0 &&
  rect.x + rect.width <= width &&
  rect.y + rect.height <= height
);

const buildWordCloudLayout = (tags, width, height, maxCount) => {
  const layoutWidth = Math.max(WORD_CLOUD_MIN_WIDTH, Math.floor(width || 0));
  const layoutHeight = Math.max(WORD_CLOUD_MIN_HEIGHT, Math.floor(height || 0));
  const centerX = layoutWidth / 2;
  const centerY = layoutHeight / 2;
  const placedRects = [];
  const measureContext = typeof document !== 'undefined'
    ? document.createElement('canvas').getContext('2d')
    : null;

  const layout = tags.map((tag, index) => {
    const fontSize = getTagCloudFontSize(tag.totalCount || 0, maxCount);
    const size = estimateWordCloudTagSize(tag, fontSize, measureContext);
    const seed = getStableSeedFromText(tag.key || tag.content || `${index}`);
    let chosenRect = null;

    for (let attempt = 0; attempt < 900; attempt += 1) {
      const angle = (seed % 360) * (Math.PI / 180) + (attempt * 0.58);
      const radius = 4 + Math.pow(attempt, 0.88) * 4.6;
      const candidateCenterX = centerX + Math.cos(angle) * radius;
      const candidateCenterY = centerY + Math.sin(angle) * radius * 0.78;
      const candidateRect = {
        x: Math.round(candidateCenterX - (size.width / 2)),
        y: Math.round(candidateCenterY - (size.height / 2)),
        width: size.width,
        height: size.height
      };

      if (!isRectangleInBounds(candidateRect, layoutWidth, layoutHeight)) {
        continue;
      }

      if (placedRects.every((rect) => !rectanglesOverlap(candidateRect, rect))) {
        chosenRect = candidateRect;
        break;
      }
    }

    if (!chosenRect) {
      outerLoop:
      for (let y = WORD_CLOUD_SCAN_STEP; y <= layoutHeight - size.height - WORD_CLOUD_SCAN_STEP; y += WORD_CLOUD_SCAN_STEP) {
        for (let x = WORD_CLOUD_SCAN_STEP; x <= layoutWidth - size.width - WORD_CLOUD_SCAN_STEP; x += WORD_CLOUD_SCAN_STEP) {
          const candidateRect = {
            x,
            y,
            width: size.width,
            height: size.height
          };

          if (placedRects.every((rect) => !rectanglesOverlap(candidateRect, rect, 4))) {
            chosenRect = candidateRect;
            break outerLoop;
          }
        }
      }
    }

    if (!chosenRect) {
      chosenRect = {
        x: Math.max(0, Math.round(centerX - (size.width / 2))),
        y: Math.min(
          layoutHeight - size.height,
          Math.max(0, Math.round((index * (size.height + 6)) % Math.max(size.height + 6, layoutHeight - size.height)))
        ),
        width: size.width,
        height: size.height
      };
    }

    placedRects.push(chosenRect);

    return {
      key: tag.key,
      fontSize,
      rect: chosenRect
    };
  });

  const clusterBounds = layout.reduce((bounds, item) => ({
    minX: Math.min(bounds.minX, item.rect.x),
    minY: Math.min(bounds.minY, item.rect.y),
    maxX: Math.max(bounds.maxX, item.rect.x + item.rect.width),
    maxY: Math.max(bounds.maxY, item.rect.y + item.rect.height)
  }), {
    minX: layoutWidth,
    minY: layoutHeight,
    maxX: 0,
    maxY: 0
  });

  const clusterCenterX = (clusterBounds.minX + clusterBounds.maxX) / 2;
  const clusterCenterY = (clusterBounds.minY + clusterBounds.maxY) / 2;
  const offsetX = Math.round(centerX - clusterCenterX);
  const offsetY = Math.round(centerY - clusterCenterY);

  return layout.map((item) => ({
    ...item,
    rect: {
      ...item.rect,
      x: Math.min(Math.max(0, item.rect.x + offsetX), layoutWidth - item.rect.width),
      y: Math.min(Math.max(0, item.rect.y + offsetY), layoutHeight - item.rect.height)
    }
  }));
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

const IlluminateCloudIcon = ({ size = 18, style = {}, ...rest }) => (
  <svg viewBox="0 0 1024 1024" width={size} height={size} fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={style} {...rest}>
    <path d="M896 96a96 96 0 0 1 96 96v320a96 96 0 0 1-96 96h-32v64a96 96 0 0 1-96 96H372.64l-212.448 170.752V768H128a96 96 0 0 1-96-96V352a96 96 0 0 1 96-96h32V192a96 96 0 0 1 90.368-95.84L256 96z m-128 224H128a32 32 0 0 0-32 32v320a32 32 0 0 0 32 32h96.192v101.216L350.08 704H768a32 32 0 0 0 32-32V352a32 32 0 0 0-32-32z m128-160H256a32 32 0 0 0-32 32v64h544a96 96 0 0 1 96 96v192h32a32 32 0 0 0 31.776-28.256L928 512V192a32 32 0 0 0-32-32z" />
    <path d="M272 480a48 48 0 1 1 0 96 48 48 0 0 1 0-96z m192 0a48 48 0 1 1 0 96 48 48 0 0 1 0-96z m192 0a48 48 0 1 1 0 96 48 48 0 0 1 0-96z" />
  </svg>
);

const TinyUserChip = ({ user, fallbackLabel = '暂无' }) => {
  if (!user?.name) {
    return (
      <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
        {fallbackLabel}
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        minWidth: 0
      }}
    >
      <span
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          overflow: 'hidden',
          backgroundColor: '#f1f5f9',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block'
            }}
          />
        ) : (
          <UserRound size={15} color="#64748b" />
        )}
      </span>
      <span
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#111827',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {user.name}
      </span>
    </span>
  );
};

const RelatedProductCard = ({ product, onOpen }) => {
  if (!product?.id) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(product.id)}
      style={{
        width: '100%',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        backgroundColor: '#fff',
        padding: '12px',
        display: 'grid',
        gridTemplateColumns: '72px 1fr',
        gap: '12px',
        alignItems: 'center',
        cursor: 'pointer',
        textAlign: 'left'
      }}
    >
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '14px',
          overflow: 'hidden',
          backgroundColor: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontSize: '12px'
        }}
      >
        {product.coverImage ? (
          <img
            src={product.coverImage}
            alt={product.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block'
            }}
          />
        ) : (
          '商品'
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          相关商品
        </div>
        <div
          style={{
            marginTop: '6px',
            fontSize: '15px',
            fontWeight: 700,
            color: '#111827',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {product.name}
        </div>
        <div
          style={{
            marginTop: '4px',
            fontSize: '13px',
            color: '#64748b',
            lineHeight: 1.6,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {product.subtitle || '去工坊看看这件与你此刻觉察相关的物品。'}
        </div>
      </div>
    </button>
  );
};

const AwareTagModal = ({
  tag,
  currentUser,
  isLoggedIn,
  pendingQueueItem,
  submitting,
  onOpenRelatedProduct,
  onClose,
  onSubmit
}) => {
  if (!tag) {
    return null;
  }

  const accessMeta = getAccessMeta(tag.accessType);
  const hasDescription = Boolean(tag.description?.trim());
  const blockedReason = pendingQueueItem
    ? getPendingQueueMessage(pendingQueueItem)
    : !isLoggedIn
      ? '登录后可发布这条觉察。'
      : !canPublishTag(tag, currentUser)
        ? '当前身份还不能发布这条觉察，你可以先看看它的含义。'
        : '';
  const disabled = Boolean(blockedReason) || submitting;
  const historicalCount = Math.max(0, Number(tag.totalCount || tag.count || 0));
  const weeklyCount = Math.max(0, Number(tag.weeklyCount || 0));

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827' }}>{tag.content}</div>
              {tag.accessType === 'student' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(15, 118, 110, 0.12)',
                    color: '#0f766e',
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '5px 10px'
                  }}
                >
                  学员觉察
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            <X size={18} />
          </button>
        </div>

        {hasDescription && (
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
              {tag.description.trim()}
            </div>
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
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              color: '#475569',
              lineHeight: 1.8
            }}
          >
            <span>本周觉察 {weeklyCount} 次</span>
            <span>-</span>
            <span>本周最多</span>
            <TinyUserChip user={tag.weeklyChampion} />
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              color: '#475569',
              lineHeight: 1.8
            }}
          >
            <span>社区总觉察 {historicalCount} 次</span>
            <span>-</span>
            <span>最新觉察</span>
            <TinyUserChip user={tag.latestUser} />
          </div>
        </div>

        {tag.relatedProduct && (
          <div style={{ marginBottom: '18px' }}>
            <RelatedProductCard product={tag.relatedProduct} onOpen={onOpenRelatedProduct} />
          </div>
        )}

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
                ? '当前不可发布'
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
  const navigate = useNavigate();
  const appClient = isAppClient();
  const {
    authStatus,
    currentUser,
    userTags,
    popularTags,
    loading,
    error: cloudError,
    addAwarenessRecord
  } = useCloudAwareness();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialSharedTag = searchParams.get('tag')?.trim().slice(0, 6) || '';
  const initialShortTagCode = searchParams.get('t')?.trim() || '';
  const [inputValue, setInputValue] = useState(initialSharedTag);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeAwareTag, setActiveAwareTag] = useState(null);
  const [creationPromptOpen, setCreationPromptOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState(null);
  const [shareStatus, setShareStatus] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [pendingQueueItem, setPendingQueueItem] = useState(null);
  const [queueTick, setQueueTick] = useState(0);
  const [wordCloudBounds, setWordCloudBounds] = useState({ width: WORD_CLOUD_MIN_WIDTH, height: WORD_CLOUD_MIN_HEIGHT });
  const wordCloudRef = useRef(null);
  const maxPopularTagCount = useMemo(() => (
    popularTags.reduce((currentMax, tag) => Math.max(currentMax, tag.totalCount || 0), 0)
  ), [popularTags]);
  const wordCloudMinHeight = useMemo(
    () => Math.max(WORD_CLOUD_MIN_HEIGHT, 280 + (popularTags.length * 12)),
    [popularTags.length]
  );
  const canPublishAwareness = Boolean(authStatus?.isAuthenticated);
  const queueUserKey = currentUser?.id || authStatus?.authUid || '';
  const wordCloudLayout = useMemo(
    () => buildWordCloudLayout(popularTags, wordCloudBounds.width, wordCloudBounds.height || wordCloudMinHeight, maxPopularTagCount),
    [popularTags, wordCloudBounds.height, wordCloudBounds.width, wordCloudMinHeight, maxPopularTagCount]
  );

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
    if (!wordCloudRef.current || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const updateBounds = () => {
      const node = wordCloudRef.current;
      if (!node) {
        return;
      }

      setWordCloudBounds({
        width: Math.max(WORD_CLOUD_MIN_WIDTH, Math.floor(node.clientWidth || 0)),
        height: Math.max(wordCloudMinHeight, Math.floor(node.clientHeight || 0))
      });
    };

    updateBounds();

    const observer = new ResizeObserver(() => {
      updateBounds();
    });

    observer.observe(wordCloudRef.current);

    return () => observer.disconnect();
  }, [wordCloudMinHeight]);

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
        const summaryResult = await awarenessService.getTagModalSummary(existingTagResult.data.key);
        const metadata = summaryResult.success ? summaryResult.data : null;
        setActiveAwareTag({
          ...existingTagResult.data,
          description: metadata?.description || existingTagResult.data.description || '',
          relatedProduct: metadata?.relatedProduct || null,
          totalCount: metadata?.totalCount || existingTagResult.data.totalCount || 0,
          weeklyCount: metadata?.weeklyCount || 0,
          weeklyChampion: metadata?.weeklyChampion || null,
          latestUser: metadata?.latestUser || null,
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
      accessType: 'public',
      recordSource: 'manual'
    });
  };

  const handleTagClick = async (tag) => {
    setError('');
    try {
      const summaryResult = await awarenessService.getTagModalSummary(tag.key);
      const metadata = summaryResult.success ? summaryResult.data : null;
      setActiveAwareTag({
        ...tag,
        description: metadata?.description || tag.description || '',
        relatedProduct: metadata?.relatedProduct || null,
        totalCount: metadata?.totalCount || tag.totalCount || tag.count || 0,
        weeklyCount: metadata?.weeklyCount || 0,
        weeklyChampion: metadata?.weeklyChampion || null,
        latestUser: metadata?.latestUser || null,
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

  return (
    <div
      style={{
        padding: '18px',
        paddingBottom: '100px',
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-primary)'
      }}
    >
      <InlineToast message={toastMessage} onClose={() => setToastMessage('')} />

      <header
        style={{
          marginTop: '8px',
          marginBottom: '18px',
          padding: '18px',
          borderRadius: '24px',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,245,239,0.94))',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid rgba(143, 165, 138, 0.12)'
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span
            style={{
              padding: '6px 10px',
              borderRadius: '999px',
              background: 'rgba(143, 165, 138, 0.12)',
              color: 'var(--color-accent-clay)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase'
            }}
          >
            Awareness
          </span>
        </div>

        <h1
          style={{
            fontSize: '32px',
            fontFamily: 'var(--font-serif)',
            color: 'var(--color-text-primary)',
            margin: 0
          }}
        >
          觉察
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: '10px', lineHeight: 1.7 }}>
          把此刻命名清楚，再安静地把它交还给自己。
        </p>

        {appClient && !pendingQueueItem && (
          <div
            id="awareness-composer-card"
            style={{
              marginTop: '18px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(143, 165, 138, 0.12)'
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
                  placeholder="属于你的此刻觉察"
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
          </div>
        )}

        {!appClient && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginTop: '16px'
              }}
            >
              <div
                style={{
                  padding: '14px',
                  borderRadius: '18px',
                  background: 'rgba(248, 245, 239, 0.92)',
                  border: '1px solid rgba(143, 165, 138, 0.12)'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#4d5a4b' }}>当前身份</div>
                <div style={{ marginTop: '8px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>
                  {authStatus.isAuthenticated ? (currentUser?.isStudent ? '学员' : '普通用户') : '游客'}
                </div>
              </div>

              <div
                style={{
                  padding: '14px',
                  borderRadius: '18px',
                  background: 'rgba(248, 245, 239, 0.92)',
                  border: '1px solid rgba(143, 165, 138, 0.12)'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#4d5a4b' }}>我的常用</div>
                <div style={{ marginTop: '8px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>
                  {userTags.length} 条
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const targetSection = document.getElementById('awareness-composer-card');
                targetSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              style={{
                marginTop: '14px',
                border: 'none',
                borderRadius: '999px',
                padding: '10px 14px',
                background: 'var(--theme-button-primary-bg)',
                color: 'var(--theme-button-primary-text)',
                fontSize: '12px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <span>开始觉察</span>
              <ArrowRight size={14} />
            </button>
          </>
        )}
      </header>

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

      {!appClient && !pendingQueueItem && (
        <div
          id="awareness-composer-card"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,245,239,0.94))',
            padding: '24px',
            borderRadius: '20px',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '24px'
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#8fa58a', textTransform: 'uppercase', marginBottom: '12px' }}>
            觉察此刻
          </div>
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
                placeholder="属于你的此刻觉察"
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
                    border: tag.accessType === 'student' ? '1px dashed #0f766e' : `1px solid ${meta.borderColor}`,
                    borderRadius: '20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
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
            <IlluminateCloudIcon size={18} style={{ color: 'var(--color-accent-clay)' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
              同心照亮
            </h2>
          </div>
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '18px',
              minHeight: `${wordCloudMinHeight}px`,
              padding: '32px 24px',
              boxShadow: 'var(--shadow-sm)',
              background: 'radial-gradient(circle at center, rgba(214, 140, 101, 0.08) 0%, rgba(255, 255, 255, 1) 62%)',
              overflow: 'hidden'
            }}
          >
            <div
              ref={wordCloudRef}
              style={{
                position: 'relative',
                width: '100%',
                minHeight: `${wordCloudMinHeight}px`
              }}
            >
            {popularTags.map((tag, index) => {
              const meta = getAccessMeta(tag.accessType);
              const isStudentTag = tag.accessType === 'student';
              const layoutItem = wordCloudLayout.find((item) => item.key === tag.key);
              const fontSize = layoutItem?.fontSize || getTagCloudFontSize(tag.totalCount || 0, maxPopularTagCount);
              const rect = layoutItem?.rect || {
                x: 0,
                y: 0,
                width: 80,
                height: 44
              };

              return (
                <button
                  key={tag.key}
                  onClick={() => handleTagClick(tag)}
                  style={{
                    position: 'absolute',
                    left: `${rect.x}px`,
                    top: `${rect.y}px`,
                    width: `${rect.width}px`,
                    minHeight: `${rect.height}px`,
                    padding: '0 14px',
                    boxSizing: 'border-box',
                    backgroundColor: '#fff',
                    border: isStudentTag ? '1px dashed #0f766e' : `1px solid ${meta.borderColor}`,
                    borderRadius: '999px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    color: 'var(--color-text-primary)',
                    fontSize,
                    fontWeight: tag.totalCount === maxPopularTagCount ? 700 : 600,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <span>{tag.content}</span>
                </button>
              );
            })}
            </div>
          </div>
        </div>
      )}

      <AwareTagModal
        tag={activeAwareTag}
        currentUser={currentUser}
        isLoggedIn={canPublishAwareness}
        pendingQueueItem={pendingQueueItem}
        submitting={submitting}
        onOpenRelatedProduct={(productId) => {
          setActiveAwareTag(null);
          navigate(`/s?p=${encodeURIComponent(productId)}`);
        }}
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
              创建新的觉察标签需要相应的身份权限。先去社区已经存在的觉察标签里看一看，也许此刻就有适合你的那一个。
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
