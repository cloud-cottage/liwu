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
        alert(`冥想完成！获得 50 福豆，累计时长增加 ${totalSessionTimeMinutes} 分钟`);
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
            {/* Main Meditation Visual Container */}
            <div style={{
                position: 'absolute',
                top: '20%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '300px',
                height: '300px',
                zIndex: 0
            }}>
                {/* Cover Image */}
                <img
                    src="/images/meditation/cover.jpg"
                    alt="Meditation Cover"
                    style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        animation: isPlaying ? 'pulse 4s infinite ease-in-out' : 'none',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
                    }}
                />

                {/* Centered Play Button */}
                <button
                    onClick={togglePlay}
                    disabled={!isLoaded}
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: 'none',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: isLoaded ? 'pointer' : 'default',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 20 // Ensure button is above cover
                    }}
                >
                    {/* Rotating Background */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundImage: 'url(/logo.svg)',
                        backgroundSize: 'contain',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                        borderRadius: '50%',
                        animation: isPlaying ? 'spin 10s linear infinite' : 'none',
                        opacity: 0.9,
                        zIndex: 0
                    }} />

                    {/* Static Icon */}
                    <div style={{
                        position: 'relative',
                        zIndex: 1,
                        color: '#fff',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                    }}>
                        {isPlaying ? <Pause size={32} /> : <Play size={32} style={{ marginLeft: '4px' }} />}
                    </div>
                </button>
            </div>

            <style>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
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


            {/* Time Display - Moved to bottom area */}
            <div style={{
                position: 'absolute',
                bottom: '100px',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '24px',
                fontFamily: 'var(--font-sans)',
                fontWeight: '300',
                color: 'var(--color-accent-ink)',
                zIndex: 10
            }}>
                {!isLoaded ? '加载中...' : formatTime(timeLeft)}
            </div>

            {/* Footer / Quote */}
            <div style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: '14px',
                zIndex: 10,
                opacity: 0.8,
                position: 'absolute',
                bottom: '40px',
                width: '100%'
            }}>
                "吸气，感受当下；呼气，放下杂念。"
            </div>
        </div >
    );
};

export default MeditationPlayer;
