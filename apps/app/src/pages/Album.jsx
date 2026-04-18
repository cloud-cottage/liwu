import React from 'react';
import { ArrowLeft, Award, BookOpen, Clock3, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWealth } from '../context/WealthContext';

const Album = () => {
  const navigate = useNavigate();
  const { challenges, meditationStats } = useWealth();
  const completedChallenges = challenges.filter((item) => item.completed);

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
          borderRadius: '20px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '24px',
          background:
            'radial-gradient(circle at top right, rgba(214, 140, 101, 0.16), transparent 30%), linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-accent-clay)' }}>
          <BookOpen size={18} />
          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            blossom_album
          </span>
        </div>
        <h1 style={{ fontSize: '28px', margin: '12px 0 0' }}>花开纪念册</h1>
        <p style={{ margin: '10px 0 0', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          这里收纳你一路积累的勋章与练习成果，像翻阅一本只属于自己的纪念册。
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '20px' }}>
          <div style={summaryCardStyle}>
            <Award size={18} color="var(--color-accent-clay)" />
            <div style={summaryValueStyle}>{meditationStats.medals}</div>
            <div style={summaryLabelStyle}>冥想勋章</div>
          </div>
          <div style={summaryCardStyle}>
            <Sparkles size={18} color="var(--color-accent-clay)" />
            <div style={summaryValueStyle}>{completedChallenges.length}</div>
            <div style={summaryLabelStyle}>达成徽章</div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Clock3 size={16} color="var(--color-accent-ink)" />
          <h2 style={{ margin: 0, fontSize: '17px' }}>冥想勋章</h2>
        </div>

        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '18px',
            padding: '20px',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>静心旅程</div>
          <div style={{ marginTop: '8px', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            累计冥想时长 {meditationStats.totalDuration} 分钟，完成 {meditationStats.sessionCount} 次练习。
          </div>
          <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {Array.from({ length: Math.max(meditationStats.medals, 1) }).map((_, index) => (
              <div
                key={`medal_${index + 1}`}
                style={{
                  padding: '10px 14px',
                  borderRadius: '999px',
                  backgroundColor: index < meditationStats.medals ? 'rgba(214, 140, 101, 0.16)' : '#f5f5f0',
                  color: index < meditationStats.medals ? '#9a3412' : '#9ca3af',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                {index < meditationStats.medals ? `冥想勋章 ${index + 1}` : '等待点亮'}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Award size={16} color="var(--color-accent-ink)" />
          <h2 style={{ margin: 0, fontSize: '17px' }}>挑战徽章</h2>
        </div>

        <div style={{ display: 'grid', gap: '14px' }}>
          {challenges.map((challenge) => (
            <div
              key={challenge.id}
              style={{
                backgroundColor: '#fff',
                borderRadius: '18px',
                padding: '18px',
                boxShadow: 'var(--shadow-sm)',
                border: challenge.completed ? '1px solid rgba(214, 140, 101, 0.26)' : '1px solid transparent'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{challenge.title}</div>
                  <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                    {challenge.description}
                  </div>
                </div>
                <span
                  style={{
                    padding: '7px 10px',
                    borderRadius: '999px',
                    backgroundColor: challenge.completed ? 'rgba(107, 142, 35, 0.14)' : '#f3f4f6',
                    color: challenge.completed ? 'var(--color-success)' : '#6b7280',
                    fontSize: '12px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap'
                  }}
                >
                  {challenge.completed ? '已点亮' : '待完成'}
                </span>
              </div>

              <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--color-accent-clay)', fontWeight: 600 }}>
                奖励：{challenge.reward}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const summaryCardStyle = {
  borderRadius: '18px',
  backgroundColor: 'rgba(255, 255, 255, 0.82)',
  padding: '18px',
  boxShadow: '0 14px 32px rgba(214, 140, 101, 0.1)'
};

const summaryValueStyle = {
  marginTop: '10px',
  fontSize: '28px',
  fontWeight: 700,
  color: 'var(--color-text-primary)'
};

const summaryLabelStyle = {
  marginTop: '6px',
  fontSize: '13px',
  color: 'var(--color-text-secondary)'
};

export default Album;
