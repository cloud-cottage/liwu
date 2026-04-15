import React, { useEffect, useRef, useState } from 'react';
import { X, Play, Pause } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWealth } from '../context/WealthContext';
import DatabaseService, { DEFAULT_MEDITATION_SETTINGS } from '../services/database.js';

const SEGMENT_COUNT = 5;
const AUDIO_LIBRARY = [
  '/audio/meditation/sea_wave1.mp3',
  '/audio/meditation/sea_wave2.mp3',
  '/audio/meditation/sea_wave_seagull.mp3',
];

const createSessionSegments = () =>
  Array.from({ length: SEGMENT_COUNT }, () => ({
    url: AUDIO_LIBRARY[Math.floor(Math.random() * AUDIO_LIBRARY.length)],
  }));

const MeditationPlayer = () => {
  const navigate = useNavigate();
  const { completeMeditationSession } = useWealth();
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [meditationSettings, setMeditationSettings] = useState(DEFAULT_MEDITATION_SETTINGS);
  const audioRef = useRef(new Audio());
  const handleSegmentCompleteRef = useRef(() => {});
  const [segments] = useState(createSessionSegments);

  const elapsedTime = duration > 0 ? Math.max(duration - timeLeft, 0) : 0;
  const segmentProgress = duration > 0 ? Math.min((elapsedTime / duration) * 100, 100) : 0;
  const tonearmRotation = 8 + segmentProgress * 0.04 + (isPlaying ? 0 : -16);
  const timeLabel = !isLoaded ? '加载中...' : formatTime(timeLeft);
  const footerLabel = isBuffering && isPlaying ? '缓冲中...' : '吸气，感受当下；呼气，放下杂念。';

  useEffect(() => {
    let active = true;

    DatabaseService.getMeditationSettings()
      .then((settings) => {
        if (active) {
          setMeditationSettings(settings);
        }
      })
      .catch((error) => {
        console.error('Failed to load meditation settings:', error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    handleSegmentCompleteRef.current = async () => {
      if (currentSegmentIndex < SEGMENT_COUNT - 1) {
        const nextIndex = currentSegmentIndex + 1;
        const audio = audioRef.current;

        setCurrentSegmentIndex(nextIndex);
        setIsLoaded(false);
        setIsBuffering(true);
        setDuration(0);
        setTimeLeft(0);
        audio.src = segments[nextIndex].url;
        audio.load();
        return;
      }

      setIsPlaying(false);
      const rewardResult = await completeMeditationSession({
        duration: 30,
        rewardAmount: meditationSettings.rewardPoints,
        allowRepeatReward: meditationSettings.allowRepeatRewards,
        rewardKey: 'default_meditation_program',
        rewardDescription: '完成一次冥想'
      });

      const rewardMessage = rewardResult.rewarded
        ? `获得 ${rewardResult.rewardAmount} 福豆，累计时长增加 30 分钟`
        : rewardResult.error
          ? '云端福豆暂未到账，累计时长增加 30 分钟'
        : rewardResult.repeatedRewardBlocked && meditationSettings.rewardPoints > 0
          ? '本次不重复发放福豆，累计时长增加 30 分钟'
          : '累计时长增加 30 分钟';

      window.alert(`冥想完成！${rewardMessage}`);
      navigate('/');
    };
  }, [completeMeditationSession, currentSegmentIndex, meditationSettings, navigate, segments]);

  useEffect(() => {
    const audio = audioRef.current;

    const handleLoadedMetadata = () => {
      const nextDuration = Number.isFinite(audio.duration) ? Math.ceil(audio.duration) : 0;
      setDuration(nextDuration);
      setTimeLeft(nextDuration);
      setIsLoaded(true);
      setIsBuffering(false);
    };

    const handleCanPlay = () => {
      setIsLoaded(true);
      setIsBuffering(false);
    };

    const handleEnded = () => {
      handleSegmentCompleteRef.current();
    };

    const handleTimeUpdate = () => {
      if (!Number.isFinite(audio.duration)) {
        return;
      }

      const nextDuration = Math.ceil(audio.duration);
      setDuration(nextDuration);
      setTimeLeft(Math.max(0, Math.ceil(audio.duration - audio.currentTime)));
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handlePlaying = () => {
      setIsLoaded(true);
      setIsBuffering(false);
    };

    const handleError = () => {
      setIsLoaded(false);
      setIsBuffering(false);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('error', handleError);
    audio.src = segments[0].url;
    audio.load();

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('error', handleError);
    };
  }, [segments]);

  useEffect(() => {
    const audio = audioRef.current;

    if (isPlaying && isLoaded) {
      audio.play().catch((error) => {
        console.error('Audio playback failed:', error);
        setIsPlaying(false);
      });
      return;
    }

    audio.pause();
  }, [isPlaying, isLoaded]);

  const togglePlay = () => {
    setIsPlaying((previousValue) => !previousValue);
  };

  const handleClose = () => {
    if (window.confirm('确定要结束冥想吗？当前进度将不会保存。')) {
      navigate('/');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(214, 140, 101, 0.16), transparent 34%), linear-gradient(180deg, #f6f1e8 0%, #efe7da 52%, #e4d8c7 100%)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes vinyl-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

      `}</style>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.78), transparent 24%), radial-gradient(circle at 85% 10%, rgba(214, 140, 101, 0.16), transparent 24%)',
        }}
      />

      <div
        style={{
          padding: '24px',
          display: 'flex',
          justifyContent: 'flex-end',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <button
          aria-label="关闭冥想"
          onClick={handleClose}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            border: '1px solid rgba(44, 44, 44, 0.08)',
            background: 'rgba(255, 255, 255, 0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(53, 40, 27, 0.08)',
          }}
        >
          <X size={20} color="var(--color-accent-ink)" />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '0 24px 32px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '8px',
          }}
        >
          <div
            style={{
              width: 'min(100%, 380px)',
              borderRadius: '34px',
              padding: '22px',
              background: 'linear-gradient(145deg, rgba(84, 61, 40, 0.96), rgba(44, 31, 21, 0.96))',
              boxShadow: '0 26px 60px rgba(53, 40, 27, 0.22)',
            }}
          >
            <div
              style={{
                position: 'relative',
                borderRadius: '28px',
                padding: '22px 18px 20px',
                background:
                  'linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02))',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: 'min(78vw, 312px)',
                  height: 'min(78vw, 312px)',
                  margin: '34px auto 0',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.24))',
                    boxShadow: '0 22px 42px rgba(0, 0, 0, 0.26)',
                  }}
                />

                <div
                  style={{
                    position: 'absolute',
                    inset: '3.5%',
                    borderRadius: '50%',
                    background: 'linear-gradient(145deg, #191919, #090909)',
                    animation: isPlaying ? 'vinyl-spin 7.5s linear infinite' : 'none',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: '5%',
                      borderRadius: '50%',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      boxShadow:
                        '0 0 0 12px rgba(255, 255, 255, 0.018), 0 0 0 28px rgba(255, 255, 255, 0.018), 0 0 0 42px rgba(255, 255, 255, 0.014)',
                    }}
                  />

                  <div
                    style={{
                      position: 'absolute',
                      inset: '19%',
                      borderRadius: '50%',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src="/images/meditation/cover.jpg"
                      alt="Meditation Cover"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                          'radial-gradient(circle at center, rgba(255, 255, 255, 0.06), rgba(0, 0, 0, 0.22))',
                      }}
                    />
                  </div>
                </div>

                <button
                  aria-label={isPlaying ? '暂停冥想' : '继续冥想'}
                  onClick={togglePlay}
                  disabled={!isLoaded}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '92px',
                    height: '92px',
                    borderRadius: '50%',
                    background: 'rgba(247, 236, 223, 0.96)',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: isLoaded ? 'pointer' : 'default',
                    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.22)',
                    zIndex: 2,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: '16px',
                      backgroundImage: 'url(/logo.svg)',
                      backgroundSize: 'contain',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                      opacity: 0.9,
                      animation: isPlaying ? 'vinyl-spin 3.2s linear infinite' : 'none'
                    }}
                  />
                  <div
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      color: 'var(--color-accent-ink)',
                      filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.2))',
                    }}
                  >
                    {isPlaying ? <Pause size={26} strokeWidth={2.4} /> : <Play size={26} strokeWidth={2.4} style={{ marginLeft: '3px' }} />}
                  </div>
                </button>

                <div
                  style={{
                    position: 'absolute',
                    top: '34px',
                    right: '18px',
                    width: '42%',
                    height: '42%',
                    transformOrigin: 'calc(100% - 14px) 14px',
                    transform: `rotate(${tonearmRotation}deg)`,
                    transition: 'transform 420ms ease-out',
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background:
                        'radial-gradient(circle at 30% 30%, #e8dfd1 0%, #96836f 46%, #5a4a3d 100%)',
                      boxShadow: '0 8px 18px rgba(0, 0, 0, 0.26)',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '9px',
                      right: '12px',
                      width: '120px',
                      height: '8px',
                      borderRadius: '999px',
                      background:
                        'linear-gradient(90deg, rgba(223, 214, 202, 0.96), rgba(133, 118, 101, 0.98))',
                      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '118px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '8px',
                      background:
                        'linear-gradient(180deg, rgba(239, 226, 210, 0.96), rgba(132, 112, 90, 0.98))',
                      transform: 'rotate(18deg)',
                      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.18)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            marginTop: '24px',
          }}
        >
          <div
            style={{
              fontSize: '28px',
              fontFamily: 'var(--font-sans)',
              fontWeight: 300,
              color: 'var(--color-accent-ink)',
              letterSpacing: '0.04em',
            }}
          >
            {timeLabel}
          </div>
        </div>

        <div
          style={{
            paddingBottom: '8px',
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            fontSize: '14px',
            opacity: 0.82,
          }}
        >
          {footerLabel}
        </div>
      </div>
    </div>
  );
};

const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export default MeditationPlayer;
