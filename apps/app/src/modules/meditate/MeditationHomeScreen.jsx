import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2, Wind } from 'lucide-react';
import { useWealth } from '../../context/WealthContext';
import { useCloudAwareness } from '../../context/CloudAwarenessContext';
import ShareDialog from '../../components/Share/ShareDialog.jsx';
import { shareService } from '../../services/cloudbase.js';

const MeditationHome = () => {
    const navigate = useNavigate();
    const { meditationStats } = useWealth();
    const { authStatus } = useCloudAwareness();
    const [sharePayload, setSharePayload] = useState(null);
    const totalCount = Math.max(0, Number(meditationStats.sessionCount || 0));
    const todayCount = Math.max(0, Number(meditationStats.todayCount || 0));
    const pastCount = Math.max(0, totalCount - todayCount);
    const canPlayMeditation = Boolean(authStatus?.isAuthenticated);

    const handleOpenShare = async () => {
        try {
            setSharePayload(await shareService.buildMeditationSharePayload());
        } catch (error) {
            console.error('冥想页分享信息生成失败:', error);
        }
    };

    return (
        <div className="page-container" style={{ padding: '20px' }}>
            <header style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
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
                {canPlayMeditation && (
                    <button
                        type="button"
                        onClick={handleOpenShare}
                        aria-label="分享静寂"
                        title="分享静寂"
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '999px',
                            border: '1px solid rgba(15, 23, 42, 0.08)',
                            backgroundColor: '#fff',
                            color: 'var(--color-text-secondary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)',
                            flexShrink: 0
                        }}
                    >
                        <Share2 size={16} />
                    </button>
                )}
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
                    {canPlayMeditation ? '开启冥想' : '登录后开始今日冥想'}
                </button>
            </section>

            <div
                style={{
                    padding: '4px 2px',
                    display: 'flex',
                    opacity: 0.72
                }}
            >
                <div style={{ fontSize: '12px', fontWeight: 400, color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                    往日 {pastCount} → 今日 {todayCount} → 来日 ∞
                </div>
            </div>

            <ShareDialog
                payload={sharePayload}
                onClose={() => setSharePayload(null)}
                title="分享静寂"
            />
        </div>
    );
};

export default MeditationHome;
