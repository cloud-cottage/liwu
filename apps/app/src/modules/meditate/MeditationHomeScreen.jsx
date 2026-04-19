import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Wind, Clock } from 'lucide-react';
import { useWealth } from '../../context/WealthContext';

const MeditationHome = () => {
    const navigate = useNavigate();
    const { meditationStats } = useWealth();
    const totalCount = Math.max(0, Number(meditationStats.sessionCount || 0));
    const todayCount = Math.max(0, Number(meditationStats.todayCount || 0));
    const pastCount = Math.max(0, totalCount - todayCount);

    return (
        <div className="page-container" style={{ padding: '20px' }}>
            <header style={{ marginBottom: '40px', marginTop: '20px', textAlign: 'center' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'var(--font-serif)' }}>每日静心</h1>
                <p style={{ color: 'var(--color-text-secondary)' }}>在呼吸间寻回内在的秩序</p>
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
                    10 分钟白噪音，10 分钟正念引导，10 分钟静寂。
                </p>
                <button
                    onClick={() => navigate('/meditation')}
                    style={{
                        backgroundColor: 'var(--color-accent-ink)',
                        color: '#fff',
                        border: 'none',
                        padding: '16px 40px',
                        borderRadius: '30px',
                        fontSize: '16px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(44, 44, 44, 0.2)'
                    }}
                >
                    开启冥想
                </button>
            </section>

            <div style={{ backgroundColor: '#fff', padding: '22px', borderRadius: '18px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <Clock size={20} style={{ color: 'var(--color-accent-clay)', marginBottom: '10px' }} />
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>累计次数</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)', lineHeight: '1.8' }}>
                    往日已冥想 {pastCount} 次；<br />
                    今日冥想 {todayCount} 次；<br />
                    来日将冥想♾️次！
                </div>
            </div>
        </div>
    );
};

export default MeditationHome;
