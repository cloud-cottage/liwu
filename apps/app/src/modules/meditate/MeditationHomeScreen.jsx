import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2, Wind } from 'lucide-react';
import { useWealth } from '../../context/WealthContext';
import { useCloudAwareness } from '../../context/CloudAwarenessContext';
import ShareDialog from '../../components/Share/ShareDialog.jsx';
import PageMasthead from '../../components/Layout/PageMasthead.jsx';
import { pageMastheadSettingsService, shareService } from '../../services/cloudbase.js';

const MeditationHome = () => {
    const navigate = useNavigate();
    const { meditationStats } = useWealth();
    const { authStatus } = useCloudAwareness();
    const [sharePayload, setSharePayload] = useState(null);
    const [meditationSlogan, setMeditationSlogan] = useState('给自己 15 分钟的留白。在呼吸间寻回内在的秩序。');
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

    useEffect(() => {
        let disposed = false;

        void (async () => {
            const settings = await pageMastheadSettingsService.getSettings();
            if (!disposed) {
                setMeditationSlogan(settings.meditationSlogan || '给自己 15 分钟的留白。在呼吸间寻回内在的秩序。');
            }
        })();

        return () => {
            disposed = true;
        };
    }, []);

    return (
        <div className="page-container" style={{ padding: '20px' }}>
            <PageMasthead
                eyebrow="Meditation"
                title="静寂"
                slogan={meditationSlogan}
                rightSlot={canPlayMeditation ? (
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
                ) : null}
            />

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
                    给自己 15 分钟的留白。
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
                    {canPlayMeditation ? '冥想此刻' : '登录后开始今日冥想'}
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
