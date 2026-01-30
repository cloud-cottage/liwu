import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Play, Pause, SkipForward } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWealth } from '../context/WealthContext';

const SEGMENT_COUNT = 5;
const AUDIO_LIBRARY = [
    '/audio/meditation/sea_wave1.mp3',
    '/audio/meditation/sea_wave2.mp3',
    '/audio/meditation/sea_wave_seagull.mp3'
];

const MeditationPlayer = () => {
    const navigate = useNavigate();
    const { updateMeditationStats } = useWealth();
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // Randomly select 5 segments from the library for this session
    const segments = useMemo(() => {
        const selected = [];
        for (let i = 0; i < SEGMENT_COUNT; i++) {
            const randomIndex = Math.floor(Math.random() * AUDIO_LIBRARY.length);
            selected.push({
                url: AUDIO_LIBRARY[randomIndex],
                label: `段落 ${i + 1}`,
                // Duration will be determined by the audio file itself
            });
        }
        return selected;
    }, []);

    const audioRef = useRef(new Audio());

    useEffect(() => {
        const audio = audioRef.current;

        const handleCanPlayThrough = () => {
            setIsLoaded(true);
            setTimeLeft(Math.floor(audio.duration));
        };

        const handleEnded = () => {
            handleSegmentComplete();
        };

        const handleTimeUpdate = () => {
            setTimeLeft(Math.floor(audio.duration - audio.currentTime));
        };

        audio.addEventListener('canplaythrough', handleCanPlayThrough);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('timeupdate', handleTimeUpdate);

        // Load first segment
        audio.src = segments[0].url;
        audio.load();

        return () => {
            audio.pause();
            audio.removeEventListener('canplaythrough', handleCanPlayThrough);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
        };
    }, []); // Run once on mount

    useEffect(() => {
        if (isPlaying && isLoaded) {
            audioRef.current.play().catch(err => {
                console.error("Audio playback failed:", err);
                setIsPlaying(false);
            });
        } else {
            audioRef.current.pause();
        }
    }, [isPlaying, isLoaded]);

    const handleSegmentComplete = () => {
        if (currentSegmentIndex < SEGMENT_COUNT - 1) {
            const nextIndex = currentSegmentIndex + 1;
            setCurrentSegmentIndex(nextIndex);
            setIsLoaded(false);

            const audio = audioRef.current;
            audio.src = segments[nextIndex].url;
            audio.load();
            // isPlaying remains true, so it will play once loaded via the other useEffect
        } else {
            // Finished all 5 segments
            finishSession();
        }
    };

    const finishSession = () => {
        setIsPlaying(false);
        // Calculate total time (roughly, or we could track it)
        const totalSessionTimeMinutes = 30; // Assuming a fixed total target or calculating from audio duration
        updateMeditationStats(totalSessionTimeMinutes);
        alert(`冥想完成！获得 50 荣誉点，累计时长增加 ${totalSessionTimeMinutes} 分钟`);
        navigate('/');
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

    const skipSegment = () => {
        handleSegmentComplete();
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
            {/* Cover Image */}
            <div style={{
                position: 'absolute',
                top: '20%',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 0,
            }}>
                <img
                    src="/images/meditation/cover.jpg"
                    alt="Meditation Cover"
                    style={{
                        width: '300px',
                        height: '300px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        animation: isPlaying ? 'pulse 4s infinite ease-in-out' : 'none',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
                    }}
                />
            </div>

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
                    {segments[currentSegmentIndex].label} ({currentSegmentIndex + 1}/{SEGMENT_COUNT})
                </h2>

                <div style={{
                    fontSize: '48px',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: '300',
                    color: 'var(--color-accent-ink)',
                    marginBottom: '40px'
                }}>
                    {!isLoaded ? '加载中...' : formatTime(timeLeft)}
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                    <button onClick={skipSegment} style={{
                        background: 'none', border: 'none', opacity: 0.3
                    }}>
                        <SkipForward size={24} />
                    </button>

                    <button
                        onClick={togglePlay}
                        disabled={!isLoaded}
                        style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            backgroundColor: isLoaded ? 'var(--color-accent-clay)' : '#ccc',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: isLoaded ? 'pointer' : 'default',
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
