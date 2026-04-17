import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useWealth } from '../context/WealthContext';

const Challenges = () => {
    const navigate = useNavigate();
    const { challenges } = useWealth();

    return (
        <div className="page-container" style={{ padding: '20px' }}>
            <header style={{ marginBottom: '30px', marginTop: '10px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>挑战活动</h1>
                <p style={{ color: 'var(--color-text-secondary)' }}>在坚持中遇见更好的自己</p>
            </header>

            <div style={{ display: 'grid', gap: '20px' }}>
                {challenges.map((challenge) => (
                    <div
                        key={challenge.id}
                        onClick={() => navigate(`/challenges/${challenge.id}`)}
                        style={{
                            backgroundColor: '#fff',
                            padding: '24px',
                            borderRadius: '16px',
                            boxShadow: 'var(--shadow-sm)',
                            cursor: 'pointer',
                            border: '1px solid transparent',
                            transition: 'all 0.3s ease'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--color-accent-clay)'}
                        onMouseOut={(e) => e.currentTarget.style.borderColor = 'transparent'}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{
                                fontSize: '12px',
                                backgroundColor: 'var(--color-bg-secondary)',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                color: 'var(--color-accent-ink)'
                            }}>
                                {challenge.type}
                            </span>
                            <span style={{ fontSize: '14px', color: 'var(--color-accent-clay)', fontWeight: '500' }}>
                                {challenge.reward}
                            </span>
                        </div>
                        <h3 style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--color-text-primary)' }}>{challenge.title}</h3>
                        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>{challenge.description}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Challenges;
