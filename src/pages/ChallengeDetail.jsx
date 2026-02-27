import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const challengesData = {
    1: { title: '七日静心', description: '连续7天完成每日冥想。在这个快节奏的世界里，给自己留出一点留白。冥想不仅是休息，更是对灵魂的洗礼。', reward: '50 福豆', type: 'Meditation', rules: ['每天至少完成一次10分钟以上的冥想', '不可中断，需连续7天'] },
    2: { title: '断舍离达人', description: '本周觉察5件断舍离物品。每一个留下的物品都应该是因为喜爱，而非习惯。通过整理空间，整理内心。', reward: '100 福豆', type: 'Declutter', rules: ['在"觉察"页面上传5件不再需要的物品', '物品估值不限'] },
    3: { title: '晨曦守望者', description: '连续3天在早晨8点前开启冥想。早起的阳光和清新的空气，是给早起者最好的礼物。', reward: '30 福豆', type: 'Meditation', rules: ['开启时间为本地时间 05:00 - 08:00', '连续3天'] },
};

const ChallengeDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const challenge = challengesData[id];

    if (!challenge) return <div>挑战不存在</div>;

    return (
        <div className="page-container" style={{ padding: '20px' }}>
            <button
                onClick={() => navigate(-1)}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                    marginBottom: '20px',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center'
                }}
            >
                ← 返回列表
            </button>

            <section style={{
                backgroundColor: '#fff',
                padding: '30px',
                borderRadius: '24px',
                boxShadow: 'var(--shadow-sm)',
                marginBottom: '40px'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <span style={{
                        fontSize: '12px',
                        backgroundColor: 'var(--color-bg-secondary)',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        color: 'var(--color-accent-ink)',
                        marginBottom: '16px',
                        display: 'inline-block'
                    }}>
                        {challenge.type}
                    </span>
                    <h1 style={{ fontSize: '28px', color: 'var(--color-text-primary)', marginBottom: '10px' }}>{challenge.title}</h1>
                    <p style={{ color: 'var(--color-accent-clay)', fontWeight: 'bold' }}>奖励：{challenge.reward}</p>
                </div>

                <div style={{ marginBottom: '30px' }}>
                    <h4 style={{ marginBottom: '12px', color: 'var(--color-text-primary)' }}>挑战描述</h4>
                    <p style={{ color: 'var(--color-text-secondary)', lineHeight: '1.8' }}>{challenge.description}</p>
                </div>

                <div style={{ marginBottom: '40px' }}>
                    <h4 style={{ marginBottom: '12px', color: 'var(--color-text-primary)' }}>活动规则</h4>
                    <ul style={{ color: 'var(--color-text-secondary)', lineHeight: '2', paddingLeft: '20px' }}>
                        {challenge.rules.map((rule, idx) => (
                            <li key={idx}>{rule}</li>
                        ))}
                    </ul>
                </div>

                <button style={{
                    width: '100%',
                    backgroundColor: 'var(--color-accent-ink)',
                    color: '#fff',
                    border: 'none',
                    padding: '16px',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                }}>
                    立即参与
                </button>
            </section>
        </div>
    );
};

export default ChallengeDetail;
