import React, { useMemo, useState } from 'react';
import { ArrowLeft, Award, BookOpen, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWealth } from '../context/WealthContext';
import builderPlaceholderImage from '../assets/badges/builder-placeholder.svg';
import dawnGuardianImage from '../assets/badges/dawn-guardian.svg';
import growthPlaceholderImage from '../assets/badges/growth-placeholder.svg';

const TAB_META = {
  growth: {
    label: '成长徽章',
    kicker: 'growth_badges',
    description: '收纳冥想、练习与日常精进留下的光亮。',
    icon: Sparkles
  },
  builder: {
    label: '建设徽章',
    kicker: 'builder_badges',
    description: '记录你对社区连接、护持与共建的认定。',
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

const hasCompletedChallenge = (challenges, keyword, id) => (
  challenges.some((challenge) => (
    challenge.completed &&
    (challenge.id === id || challenge.title?.includes(keyword))
  ))
);

const buildGrowthBadges = (challenges, meditationStats) => {
  const totalDuration = Number(meditationStats?.totalDuration || 0);
  const sessionCount = Number(meditationStats?.sessionCount || 0);
  const medals = Number(meditationStats?.medals || 0);

  return [
    {
      id: 'dawn-guardian',
      name: '晨曦守望者',
      description: '连续 3 天在早晨 8 点前开启冥想。',
      earned: hasCompletedChallenge(challenges, '晨曦守望者', 3),
      difficulty: 'radiant',
      image: dawnGuardianImage
    },
    {
      id: 'silent-start',
      name: '静心启程',
      description: '完成第一次安住练习，开启你的内在旅程。',
      earned: sessionCount >= 1 || totalDuration >= 10,
      difficulty: 'gentle',
      image: growthPlaceholderImage
    },
    {
      id: 'breath-archive',
      name: '呼吸成章',
      description: '累计冥想 120 分钟，让日常安静成形。',
      earned: totalDuration >= 120 || medals >= 2,
      difficulty: 'steady',
      image: growthPlaceholderImage
    },
    {
      id: 'seven-day-calm',
      name: '七日静心',
      description: '连续 7 天完成每日冥想，稳稳地把练习留住。',
      earned: hasCompletedChallenge(challenges, '七日静心', 1),
      difficulty: 'resolute',
      image: growthPlaceholderImage
    },
    {
      id: 'declutter-master',
      name: '断舍离达人',
      description: '本周完成 5 次断舍离觉察，给生活留出空处。',
      earned: hasCompletedChallenge(challenges, '断舍离达人', 2),
      difficulty: 'steady',
      image: growthPlaceholderImage
    },
    {
      id: 'steady-light',
      name: '安住流光',
      description: '累计冥想 300 分钟，让稳定成为一种气质。',
      earned: totalDuration >= 300 || medals >= 5,
      difficulty: 'radiant',
      image: growthPlaceholderImage
    }
  ];
};

const buildBuilderBadges = () => [
  {
    id: 'invite-builder',
    name: '同行点灯人',
    description: '邀请 3 位伙伴加入，让光继续传递。',
    earned: false,
    difficulty: 'gentle',
    image: builderPlaceholderImage
  },
  {
    id: 'workshop-builder',
    name: '工坊筑梦人',
    description: '在工坊累计消费满 10000 元，持续支持社区建设。',
    earned: false,
    difficulty: 'resolute',
    image: builderPlaceholderImage
  },
  {
    id: 'circle-keeper',
    name: '社群共修者',
    description: '长期投入社区互动与陪伴，守住共同练习的场域。',
    earned: false,
    difficulty: 'steady',
    image: builderPlaceholderImage
  },
  {
    id: 'blossom-patron',
    name: '花开护持者',
    description: '完成一次重要支持行动，为社区留下一束真光。',
    earned: false,
    difficulty: 'radiant',
    image: builderPlaceholderImage
  }
];

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
          src={badge.image}
          alt={badge.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
        />
      </div>
    </div>
  );
};

const Album = () => {
  const navigate = useNavigate();
  const { challenges, meditationStats } = useWealth();
  const [activeTab, setActiveTab] = useState('growth');

  const growthBadges = useMemo(() => buildGrowthBadges(challenges, meditationStats), [challenges, meditationStats]);
  const builderBadges = useMemo(() => buildBuilderBadges(), []);

  const badges = activeTab === 'growth' ? growthBadges : builderBadges;
  const unlockedCount = badges.filter((badge) => badge.earned).length;

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

      <section
        style={{
          backgroundColor: '#fff',
          borderRadius: '28px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '20px',
          background:
            'radial-gradient(circle at top right, rgba(214, 140, 101, 0.18), transparent 34%), linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-accent-clay)' }}>
          <BookOpen size={18} />
          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            blossom_album
          </span>
        </div>

        <h1 style={{ fontSize: '30px', margin: '12px 0 0' }}>花开纪念册</h1>
        <p style={{ margin: '10px 0 0', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          把成长与共建，收成一册可见的光。
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '20px' }}>
          {Object.entries(TAB_META).map(([key, meta]) => {
            const Icon = meta.icon;
            const totalCount = key === 'growth' ? growthBadges.length : builderBadges.length;
            const currentUnlockedCount = (key === 'growth' ? growthBadges : builderBadges).filter((badge) => badge.earned).length;
            const isActive = key === activeTab;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                style={{
                  border: isActive ? '1px solid rgba(214, 140, 101, 0.28)' : '1px solid rgba(226, 232, 240, 0.92)',
                  background: isActive ? 'rgba(255, 249, 244, 0.98)' : 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '22px',
                  padding: '16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 16px 32px rgba(214, 140, 101, 0.12)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '14px',
                      backgroundColor: isActive ? 'rgba(214, 140, 101, 0.12)' : '#f8fafc',
                      color: isActive ? 'var(--color-accent-clay)' : '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <div
                    style={{
                      padding: '5px 10px',
                      borderRadius: '999px',
                      backgroundColor: isActive ? 'rgba(214, 140, 101, 0.12)' : '#f1f5f9',
                      color: isActive ? '#9a3412' : '#64748b',
                      fontSize: '12px',
                      fontWeight: 700
                    }}
                  >
                    {currentUnlockedCount}/{totalCount}
                  </div>
                </div>
                <div style={{ marginTop: '14px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>{meta.label}</div>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '18px' }}>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>已点亮</div>
            <div style={summaryValueStyle}>{unlockedCount}</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>待点亮</div>
            <div style={summaryValueStyle}>{Math.max(badges.length - unlockedCount, 0)}</div>
          </div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
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
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
              {TAB_META[activeTab].kicker}
            </div>
            <h2 style={{ margin: '4px 0 0', fontSize: '20px' }}>{TAB_META[activeTab].label}</h2>
          </div>
        </div>

        <p style={{ margin: '0 0 18px', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          {TAB_META[activeTab].description}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(156px, 1fr))',
            gap: '16px'
          }}
        >
          {badges.map((badge) => (
            <article
              key={badge.id}
              style={{
                background: badge.earned
                  ? 'linear-gradient(180deg, #ffffff 0%, #fff9f3 100%)'
                  : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                border: badge.earned ? '1px solid rgba(214, 140, 101, 0.18)' : '1px solid rgba(226, 232, 240, 0.88)',
                borderRadius: '24px',
                padding: '18px 16px',
                boxShadow: badge.earned
                  ? '0 18px 34px rgba(214, 140, 101, 0.08)'
                  : '0 14px 28px rgba(148, 163, 184, 0.08)',
                display: 'grid',
                justifyItems: 'center',
                gap: '14px'
              }}
            >
              <BadgeArtwork badge={badge} />

              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                  <span
                    style={{
                      padding: '6px 10px',
                      borderRadius: '999px',
                      backgroundColor: badge.earned ? 'rgba(16, 185, 129, 0.12)' : '#f1f5f9',
                      color: badge.earned ? '#047857' : '#64748b',
                      fontSize: '12px',
                      fontWeight: 700
                    }}
                  >
                    {badge.earned ? '已获得' : '未获得'}
                  </span>
                </div>

                <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827', textAlign: 'center' }}>{badge.name}</div>
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '13px',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.7,
                    textAlign: 'center'
                  }}
                >
                  {badge.description}
                </div>
              </div>
            </article>
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
      </section>
    </div>
  );
};

const summaryCardStyle = {
  borderRadius: '20px',
  backgroundColor: 'rgba(255, 255, 255, 0.82)',
  padding: '16px',
  boxShadow: '0 14px 32px rgba(214, 140, 101, 0.08)'
};

const summaryValueStyle = {
  marginTop: '8px',
  fontSize: '28px',
  fontWeight: 700,
  color: 'var(--color-text-primary)'
};

const summaryLabelStyle = {
  fontSize: '13px',
  color: 'var(--color-text-secondary)'
};

export default Album;
