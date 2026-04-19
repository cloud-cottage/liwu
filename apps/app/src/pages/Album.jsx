import React, { useMemo, useState } from 'react';
import { ArrowLeft, Award, BookOpen, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dawnGuardianImage from '../assets/badges/dawn-guardian.svg';
import builderPlaceholderImage from '../assets/badges/builder-placeholder.svg';
import growthPlaceholderImage from '../assets/badges/growth-placeholder.svg';
import { useBadgeState } from '../hooks/useBadgeState.js';

const TAB_META = {
  growth: {
    label: '成长徽章',
    kicker: 'growth_badges',
    description: '成长路径中的练习成果。',
    icon: Sparkles
  },
  builder: {
    label: '建设徽章',
    kicker: 'builder_badges',
    description: '你对社区的支持与共建。',
    icon: Award
  }
};

const FRAME_STYLES = {
  gentle: {
    outer: {
      background: 'linear-gradient(145deg, #fff3e3 0%, #eabf99 100%)',
      borderRadius: '38px',
      boxShadow: '0 18px 34px rgba(214, 140, 101, 0.24)'
    },
    ring: {
      inset: '10px',
      borderRadius: '30px',
      border: '2px solid rgba(255, 255, 255, 0.78)'
    },
    inner: {
      inset: '18px',
      borderRadius: '24px',
      background: 'linear-gradient(180deg, #fffefb 0%, #fff7ef 100%)'
    }
  },
  steady: {
    outer: {
      background: 'linear-gradient(145deg, #eef4ff 0%, #cad6ff 100%)',
      borderRadius: '36px',
      boxShadow: '0 18px 34px rgba(99, 102, 241, 0.18)'
    },
    ring: {
      inset: '10px',
      borderRadius: '28px',
      border: '2px dashed rgba(67, 56, 202, 0.42)'
    },
    inner: {
      inset: '18px',
      borderRadius: '22px',
      background: 'linear-gradient(180deg, #ffffff 0%, #f5f7ff 100%)'
    }
  },
  resolute: {
    outer: {
      background: 'linear-gradient(145deg, #fdf2e3 0%, #dfaa71 100%)',
      clipPath: 'polygon(18% 0, 82% 0, 100% 18%, 100% 82%, 82% 100%, 18% 100%, 0 82%, 0 18%)',
      boxShadow: '0 20px 38px rgba(180, 120, 56, 0.22)'
    },
    ring: {
      inset: '10px',
      clipPath: 'polygon(18% 0, 82% 0, 100% 18%, 100% 82%, 82% 100%, 18% 100%, 0 82%, 0 18%)',
      border: '2px solid rgba(255, 250, 240, 0.86)'
    },
    inner: {
      inset: '20px',
      clipPath: 'polygon(18% 0, 82% 0, 100% 18%, 100% 82%, 82% 100%, 18% 100%, 0 82%, 0 18%)',
      background: 'linear-gradient(180deg, #ffffff 0%, #fff8ef 100%)'
    }
  },
  radiant: {
    outer: {
      background: 'conic-gradient(from 180deg at 50% 50%, #ffe8c2 0deg, #f59e0b 90deg, #fcd5a5 180deg, #fb923c 270deg, #ffe8c2 360deg)',
      borderRadius: '40px',
      boxShadow: '0 20px 42px rgba(251, 146, 60, 0.26), 0 0 0 6px rgba(255, 255, 255, 0.4)'
    },
    ring: {
      inset: '10px',
      borderRadius: '30px',
      border: '2px solid rgba(255, 251, 235, 0.92)',
      boxShadow: '0 0 0 2px rgba(255, 236, 194, 0.52) inset'
    },
    inner: {
      inset: '18px',
      borderRadius: '24px',
      background: 'linear-gradient(180deg, #fffdf7 0%, #fff5df 100%)'
    }
  }
};

const DIFFICULTY_ORDER = ['gentle', 'steady', 'resolute', 'radiant'];
const DIFFICULTY_LABELS = {
  gentle: '微光',
  steady: '进阶',
  resolute: '砥砺',
  radiant: '稀有'
};
const DIFFICULTY_INDEX = DIFFICULTY_ORDER.reduce((accumulator, key, index) => ({
  ...accumulator,
  [key]: index
}), {});

const sortBadgesByDifficulty = (badges = []) => (
  [...badges].sort((left, right) => (
    (DIFFICULTY_INDEX[left.difficulty] ?? 0) - (DIFFICULTY_INDEX[right.difficulty] ?? 0)
  ))
);

const buildBadgeSeriesGroups = (badges = []) => (
  Object.values(
    badges.reduce((accumulator, badge) => {
      if (!accumulator[badge.seriesId]) {
        accumulator[badge.seriesId] = [];
      }

      accumulator[badge.seriesId].push(badge);
      return accumulator;
    }, {})
  ).map(sortBadgesByDifficulty)
);

const getVisibleSeriesBadges = (seriesBadges = []) => {
  const highestEarnedIndex = seriesBadges.reduce((currentHighestIndex, badge, index) => (
    badge.earned ? index : currentHighestIndex
  ), -1);
  const maxVisibleIndex = Math.min(
    seriesBadges.length - 1,
    highestEarnedIndex >= 0 ? highestEarnedIndex + 1 : 0
  );

  return seriesBadges.filter((_, index) => index <= maxVisibleIndex);
};

const getSeriesProgressSummary = (badges = []) => {
  const seriesGroups = buildBadgeSeriesGroups(badges);
  return {
    totalSeriesCount: seriesGroups.length,
    unlockedSeriesCount: seriesGroups.filter((seriesBadges) => seriesBadges.some((badge) => badge.earned)).length
  };
};

const getBadgeImage = (badge) => {
  if (badge.image) {
    return badge.image;
  }

  if (badge.seriesId?.includes('meditation_dawn') || badge.name?.includes('晨曦')) {
    return dawnGuardianImage;
  }

  return badge.visibleGroup === 'builder' ? builderPlaceholderImage : growthPlaceholderImage;
};

const getProgressText = (badge) => {
  const progressValue = Math.max(0, Number(badge.progressValue || 0));
  const unit = badge.unit || '次';

  if (badge.earned) {
    return `已达成 ${badge.threshold}${unit}`;
  }

  return `当前进度 ${progressValue}/${badge.threshold}${unit}`;
};

const BadgeArtwork = ({ badge }) => {
  const frame = FRAME_STYLES[badge.difficulty] || FRAME_STYLES.gentle;

  return (
    <div
      style={{
        position: 'relative',
        width: '132px',
        height: '132px',
        flexShrink: 0,
        filter: badge.earned ? 'none' : 'grayscale(1)',
        opacity: badge.earned ? 1 : 0.58,
        transition: 'filter 0.2s ease, opacity 0.2s ease'
      }}
    >
      <div style={{ position: 'absolute', inset: 0, ...frame.outer }} />
      <div style={{ position: 'absolute', ...frame.ring }} />
      <div
        style={{
          position: 'absolute',
          overflow: 'hidden',
          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.52)',
          ...frame.inner
        }}
      >
        <img
          src={getBadgeImage(badge)}
          alt={badge.displayName || badge.seriesName || badge.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            minWidth: '40px',
            padding: '4px 8px',
            borderRadius: '999px',
            backgroundColor: badge.earned ? 'rgba(17, 24, 39, 0.84)' : 'rgba(71, 85, 105, 0.76)',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textAlign: 'center',
            boxShadow: '0 8px 20px rgba(15, 23, 42, 0.18)'
          }}
        >
          {DIFFICULTY_LABELS[badge.difficulty] || badge.difficulty}
        </div>
      </div>
    </div>
  );
};

const BadgeDetailModal = ({
  badge,
  saving,
  onClose,
  onEquip
}) => {
  if (!badge) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backgroundColor: 'rgba(15, 23, 42, 0.45)'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          borderRadius: '28px',
          backgroundColor: '#fff',
          padding: '24px',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.24)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
              badge_detail
            </div>
            <h2 style={{ margin: '6px 0 0', fontSize: '24px', color: '#111827' }}>{badge.displayName || badge.seriesName || badge.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'none', color: '#64748b', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px' }}>
          <BadgeArtwork badge={{ ...badge, earned: true }} />
        </div>

        <div
          style={{
            borderRadius: '18px',
            backgroundColor: '#f8fafc',
            padding: '16px',
            marginBottom: '14px'
          }}
        >
          <div style={{ fontSize: '14px', color: '#0f172a', lineHeight: 1.75 }}>
            {badge.description || badge.summary || '这是一枚记录你阶段性成长与投入的徽章。'}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '10px', marginBottom: '18px' }}>
          <div style={modalMetricStyle}>
            <span>当前等级</span>
            <strong>{DIFFICULTY_LABELS[badge.difficulty] || badge.difficulty}</strong>
          </div>
          <div style={modalMetricStyle}>
            <span>解锁条件</span>
            <strong>{badge.threshold}{badge.unit || '次'}</strong>
          </div>
          <div style={modalMetricStyle}>
            <span>当前进度</span>
            <strong>{getProgressText(badge)}</strong>
          </div>
          <div style={modalMetricStyle}>
            <span>佩戴效果</span>
            <strong>{badge.bonusSummary}</strong>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onEquip(badge)}
          disabled={saving || !badge.earned}
          style={{
            width: '100%',
            border: 'none',
            borderRadius: '16px',
            backgroundColor: badge.earned ? '#111827' : '#cbd5e1',
            color: '#fff',
            padding: '14px 16px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: saving || !badge.earned ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1
          }}
        >
          {!badge.earned
            ? '尚未获得，暂不可佩戴'
            : saving
              ? '保存中...'
              : badge.equipped
                ? '取消佩戴'
                : '佩戴这枚徽章'}
        </button>
      </div>
    </div>
  );
};

const Album = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('growth');
  const [activeBadge, setActiveBadge] = useState(null);
  const {
    loading,
    saving,
    error,
    groupedBadges,
    equipBadge
  } = useBadgeState();

  const badges = groupedBadges[activeTab] || [];
  const visibleBadges = useMemo(() => (
    buildBadgeSeriesGroups(badges).flatMap(getVisibleSeriesBadges)
  ), [badges]);
  const activeTabSeriesProgress = useMemo(() => getSeriesProgressSummary(badges), [badges]);

  const handleEquipBadge = async (badge) => {
    await equipBadge(badge.badgeId);
    setActiveBadge((currentBadge) => (
      currentBadge && currentBadge.badgeId === badge.badgeId
        ? {
            ...currentBadge,
            equipped: !currentBadge.equipped
          }
        : currentBadge
    ));
  };

  return (
    <div className="page-container" style={{ padding: '20px', paddingBottom: '96px' }}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{
          border: 'none',
          background: 'none',
          color: 'var(--color-text-secondary)',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        <ArrowLeft size={18} />
        返回
      </button>

      {(error && !activeBadge) && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 14px',
            borderRadius: '14px',
            backgroundColor: '#fff1f2',
            border: '1px solid #fecdd3',
            color: '#be123c',
            fontSize: '13px',
            lineHeight: 1.6
          }}
        >
          {error}
        </div>
      )}

      <section
        style={{
          backgroundColor: '#fff',
          borderRadius: '28px',
          padding: '20px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '16px',
          background:
            'radial-gradient(circle at top right, rgba(214, 140, 101, 0.18), transparent 34%), linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-accent-clay)' }}>
          <BookOpen size={18} />
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            blossom_album
          </span>
        </div>

        <h1 style={{ fontSize: '28px', margin: '8px 0 0' }}>花开纪念册</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          把成长与共建，收成一册可见的光。
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
          {Object.entries(TAB_META).map(([key, meta]) => {
            const Icon = meta.icon;
            const tabBadges = groupedBadges[key] || [];
            const { unlockedSeriesCount, totalSeriesCount } = getSeriesProgressSummary(tabBadges);
            const isActive = key === activeTab;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                style={{
                  border: isActive ? '1px solid rgba(214, 140, 101, 0.28)' : '1px solid rgba(226, 232, 240, 0.92)',
                  background: isActive ? 'rgba(255, 249, 244, 0.98)' : 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '18px',
                  padding: '12px 14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 12px 24px rgba(214, 140, 101, 0.1)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '12px',
                      backgroundColor: isActive ? 'rgba(214, 140, 101, 0.12)' : '#f8fafc',
                      color: isActive ? 'var(--color-accent-clay)' : '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Icon size={16} />
                  </div>
                  <div
                    style={{
                      padding: '4px 8px',
                      borderRadius: '999px',
                      backgroundColor: isActive ? 'rgba(214, 140, 101, 0.12)' : '#f1f5f9',
                      color: isActive ? '#9a3412' : '#64748b',
                      fontSize: '11px',
                      fontWeight: 700
                    }}
                  >
                    {unlockedSeriesCount}/{totalSeriesCount}
                  </div>
                </div>
                <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 700, color: '#111827' }}>{meta.label}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section
        style={{
          backgroundColor: '#fff',
          borderRadius: '28px',
          padding: '22px',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '14px',
              backgroundColor: 'rgba(214, 140, 101, 0.12)',
              color: 'var(--color-accent-clay)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {activeTab === 'growth' ? <Sparkles size={18} /> : <Award size={18} />}
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
              {TAB_META[activeTab].kicker}
            </div>
            <h2 style={{ margin: '4px 0 0', fontSize: '18px' }}>{TAB_META[activeTab].label}</h2>
          </div>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
          {loading ? '正在同步你的徽章状态...' : TAB_META[activeTab].description}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(156px, 1fr))',
            gap: '16px'
          }}
        >
          {visibleBadges.map((badge) => (
            <button
              key={badge.badgeId}
              type="button"
              onClick={() => setActiveBadge(badge)}
              style={{
                border: badge.equipped ? '1px solid rgba(214, 140, 101, 0.28)' : '1px solid rgba(226, 232, 240, 0.88)',
                background: badge.earned
                  ? 'linear-gradient(180deg, #ffffff 0%, #fff9f3 100%)'
                  : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                borderRadius: '24px',
                padding: '18px 16px',
                boxShadow: badge.earned
                  ? '0 18px 34px rgba(214, 140, 101, 0.08)'
                  : '0 14px 28px rgba(148, 163, 184, 0.08)',
                display: 'grid',
                justifyItems: 'center',
                gap: '14px',
                cursor: 'pointer'
              }}
            >
              <BadgeArtwork badge={badge} />

              <div style={{ width: '100%' }}>
                {badge.equipped && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                    <span
                      style={{
                        padding: '5px 10px',
                        borderRadius: '999px',
                        backgroundColor: 'rgba(214, 140, 101, 0.14)',
                        color: '#9a3412',
                        fontSize: '11px',
                        fontWeight: 700
                      }}
                    >
                      佩戴中
                    </span>
                  </div>
                )}

                <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827', textAlign: 'center' }}>
                  {badge.displayName || badge.seriesName || badge.name}
                </div>
                <div
                  style={{
                    marginTop: '6px',
                    fontSize: '12px',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.6,
                    textAlign: 'center'
                  }}
                >
                  {badge.summary}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div
          style={{
            marginTop: '18px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            justifyContent: 'center'
          }}
        >
          {DIFFICULTY_ORDER.map((key) => {
            const frame = FRAME_STYLES[key];
            const labelMap = {
              gentle: '微光',
              steady: '进阶',
              resolute: '砥砺',
              radiant: '稀有'
            };

            return (
              <div
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '999px',
                  backgroundColor: '#f8fafc',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 700
                }}
              >
                <span
                  style={{
                    position: 'relative',
                    width: '20px',
                    height: '20px',
                    flexShrink: 0
                  }}
                >
                  <span style={{ position: 'absolute', inset: 0, ...frame.outer }} />
                </span>
                {labelMap[key]}
              </div>
            );
          })}
        </div>

        {!loading && visibleBadges.length > 0 && (
          <div style={{ marginTop: '14px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
            已点亮 {activeTabSeriesProgress.unlockedSeriesCount}/{activeTabSeriesProgress.totalSeriesCount} 类徽章，可点击查看详情并佩戴。
          </div>
        )}
      </section>

      <BadgeDetailModal
        badge={activeBadge}
        saving={saving}
        onClose={() => setActiveBadge(null)}
        onEquip={handleEquipBadge}
      />
    </div>
  );
};

const modalMetricStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'center',
  fontSize: '13px',
  color: '#475569'
};

export default Album;
