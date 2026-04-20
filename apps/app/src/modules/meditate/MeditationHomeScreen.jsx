import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Wind, Clock } from 'lucide-react';
import { useWealth } from '../../context/WealthContext';
import { useCloudAwareness } from '../../context/CloudAwarenessContext';

const MeditationHome = () => {
    const navigate = useNavigate();
    const { meditationStats } = useWealth();
    const { authStatus } = useCloudAwareness();
    const totalCount = Math.max(0, Number(meditationStats.sessionCount || 0));
    const todayCount = Math.max(0, Number(meditationStats.todayCount || 0));
    const pastCount = Math.max(0, totalCount - todayCount);
    const canPlayMeditation = Boolean(authStatus?.isAuthenticated);

    return (
        <div className="page-container" style={{ padding: '20px' }}>
            <header style={{ marginBottom: '16px' }}>
                <h1
                    style={{
                        fontSize: '28px',
                        fontFamily: 'var(--font-serif)',
                        color: 'var(--color-text-primary)',
                        margin: 0
                    }}
                >
                    静寂
                </h1>
            </header>

            <section style={{
                backgroundColor: '#fff',
                padding: '30px',
                borderRadius: '24px',
                boxShadow: 'var(--shadow-sm)',
                textAlign: 'center',
                marginBottom: '30px',
                border: '1px solid var(--color-bg-secondary)'
            }}>
                <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 20px',
                    color: 'var(--color-accent-clay)'
                }}>
                    <Wind size={40} />
                </div>
                <h2 style={{ fontSize: '20px', marginBottom: '10px' }}>当下即是献礼</h2>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
                    给自己 30 分钟的留白。<br />
                    在呼吸间寻回内在的秩序
                </p>
                <button
                    onClick={() => navigate(canPlayMeditation ? '/meditation' : '/profile')}
                    style={{
                        background: canPlayMeditation ? 'var(--theme-button-primary-bg)' : '#94a3b8',
                        color: canPlayMeditation ? 'var(--theme-button-primary-text)' : '#fff',
                        border: 'none',
                        padding: '16px 40px',
                        borderRadius: '30px',
                        fontSize: '16px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        boxShadow: 'var(--shadow-md)'
                    }}
                >
                    {canPlayMeditation ? '开启冥想' : '登录后播放'}
                </button>
                {!canPlayMeditation && (
                    <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        游客模式可浏览冥想页内容，但不能开始播放。
                    </div>
                )}
            </section>

            <div
                style={{
                    backgroundColor: '#fff',
                    padding: '14px 16px',
                    borderRadius: '16px',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}
            >
                <Clock size={18} style={{ color: 'var(--color-accent-clay)', flexShrink: 0 }} />
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)', lineHeight: '1.65' }}>
                    往日已冥想 {pastCount} 次；今日冥想 {todayCount} 次；来日将冥想♾️次！
                </div>
            </div>
        </div>
    );
};

export default MeditationHome;
