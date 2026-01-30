import React from 'react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
    const navigate = useNavigate();
    return (
        <div className="page-container" style={{ padding: '20px' }}>
            <header style={{ marginBottom: '40px', marginTop: '20px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>理悟</h1>
                <p style={{ color: 'var(--color-text-secondary)' }}>礼敬物品，安住当下</p>
            </header>

            <section style={{
                backgroundColor: '#fff',
                padding: '24px',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-sm)',
                marginBottom: '24px'
            }}>
                <h2 style={{ fontSize: '18px', marginBottom: '12px', fontFamily: 'var(--font-serif)' }}>一路生花</h2>
                <p style={{ fontStyle: 'italic', color: 'var(--color-accent-ink)', lineHeight: '1.6' }}>
                    "最珍贵的财富，是此刻内心的宁静。"
                </p>
            </section>

            {/* Challenge Entry */}
            <section
                onClick={() => navigate('/challenges')}
                style={{
                    backgroundColor: 'var(--color-accent-clay)',
                    color: '#fff',
                    padding: '20px',
                    borderRadius: '16px',
                    marginBottom: '24px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                <div>
                    <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>热门挑战</h3>
                    <p style={{ fontSize: '14px', opacity: 0.9 }}>参加 7天静心挑战</p>
                </div>
                <div style={{ fontSize: '24px' }}>→</div>
            </section>

            {/* Meditation Entry Placeholder */}
            <section
                onClick={() => navigate('/meditation')}
                style={{
                    height: '200px',
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderRadius: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    cursor: 'pointer'
                }}>
                <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-accent-clay)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    marginBottom: '10px'
                }}>
                    ▶
                </div>
                <span style={{ fontWeight: '500' }}>开始今日冥想</span>
            </section>
        </div>
    );
};

export default Home;
