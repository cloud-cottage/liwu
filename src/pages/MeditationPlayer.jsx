import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, SkipForward } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWealth } from '../context/WealthContext';

const STAGES = {
    INTRO: { label: '清晨唤醒 - 白噪音', duration: 10 * 60 },
    GUIDED: { label: '引导冥想', duration: 10 * 60 },
    OUTRO: { label: '尾声 - 白噪音', duration: 10 * 60 },
};

const MeditationPlayer = () => {
    const navigate = useNavigate();
    const { updateMeditationStats } = useWealth();
    const [currentStage, setCurrentStage] = useState('INTRO');
    const [timeLeft, setTimeLeft] = useState(STAGES.INTRO.duration);
    const [isPlaying, setIsPlaying] = useState(false);

    // Audio simulation ref (replace with actual Audio object later)
    const audioRef = useRef(null);

    useEffect(() => {
        let interval = null;
        if (isPlaying && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0) {
            handleStageComplete();
        }
        return () => clearInterval(interval);
    }, [isPlaying, timeLeft]);

    const handleStageComplete = () => {
        setIsPlaying(false);
        if (currentStage === 'INTRO') {
            setCurrentStage('GUIDED');
            setTimeLeft(STAGES.GUIDED.duration);
            setIsPlaying(true); // Auto-play next stage?
        } else if (currentStage === 'GUIDED') {
            setCurrentStage('OUTRO');
            setTimeLeft(STAGES.OUTRO.duration);
            setIsPlaying(true);
        } else {
            // Finished
            const totalSessionTime = (STAGES.INTRO.duration + STAGES.GUIDED.duration + STAGES.OUTRO.duration) / 60;
            updateMeditationStats(totalSessionTime);
            alert(`冥想完成！获得 50 荣誉点，累计时长增加 ${totalSessionTime} 分钟`);
            navigate('/');
        }
    };

    const togglePlay = () => {
        setIsPlaying(!isPlaying);
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleClose = () => {
        if (window.confirm('确定要结束冥想吗？当前进度将不会保存。')) {
            navigate('/');
        }
    };

    // Skip for testing purposes (Hidden in production or dev only)
    const skipStage = () => {
        setTimeLeft(0);
    };

    return (
        <div style={{
            height: '100vh',
            backgroundColor: 'var(--color-bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Background Animation Placeholder */}
            <div style={{
                position: 'absolute',
                top: '20%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '300px',
                height: '300px',
                borderRadius: '50%',
                backgroundColor: '#E6E6FA', // Light purple tint
                opacity: 0.3,
                filter: 'blur(40px)',
                zIndex: 0,
                animation: isPlaying ? 'pulse 4s infinite ease-in-out' : 'none'
            }}></div>

            <style>{`
        @keyframes pulse {
          0% { transform: translateX(-50%) scale(1); }
          50% { transform: translateX(-50%) scale(1.1); }
          100% { transform: translateX(-50%) scale(1); }
        }
      `}</style>

            {/* Header */}
            <div style={{
                padding: '24px',
                display: 'flex',
                justifyContent: 'flex-end',
                zIndex: 10
            }}>
                <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <X size={24} color="var(--color-text-secondary)" />
                </button>
            </div>

            {/* Content */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10
            }}>
                <h2 style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: '28px',
                    marginBottom: '16px'
                }}>
                    {STAGES[currentStage].label}
                </h2>

                <div style={{
                    fontSize: '48px',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: '300',
                    color: 'var(--color-accent-ink)',
                    marginBottom: '40px'
                }}>
                    {formatTime(timeLeft)}
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                    {/* Skip Button for Demo */}
                    <button onClick={skipStage} style={{
                        background: 'none', border: 'none', opacity: 0.3
                    }}>
                        <SkipForward size={24} />
                    </button>

                    <button
                        onClick={togglePlay}
                        style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--color-accent-clay)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#fff',
                            boxShadow: 'var(--shadow-lg)'
                        }}
                    >
                        {isPlaying ? <Pause size={32} /> : <Play size={32} style={{ marginLeft: '4px' }} />}
                    </button>

                </div>
            </div>

            {/* Footer / Quote */}
            <div style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: '14px',
                zIndex: 10,
                opacity: 0.8
            }}>
                "吸气，感受当下；呼气，放下杂念。"
            </div>
        </div>
    );
};

export default MeditationPlayer;
