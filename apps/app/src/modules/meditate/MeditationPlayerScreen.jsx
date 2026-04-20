import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Play, Pause } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWealth } from '../../context/WealthContext';
import { useCloudAwareness } from '../../context/CloudAwarenessContext';
import DatabaseService, { DEFAULT_MEDITATION_SETTINGS } from '../../services/database.js';

const SEGMENT_COUNT = 5;
const AUDIO_LIBRARY = [
  '/audio/meditation/sea_wave1.mp3',
  '/audio/meditation/sea_wave2.mp3',
  '/audio/meditation/sea_wave_seagull.mp3',
];
const MIN_VALID_MEDITATION_SECONDS = 180;

const createSessionSegments = () =>
  Array.from({ length: SEGMENT_COUNT }, () => ({
    url: AUDIO_LIBRARY[Math.floor(Math.random() * AUDIO_LIBRARY.length)],
  }));

const toMeditationMinutes = (seconds) => Number((Math.max(0, Number(seconds) || 0) / 60).toFixed(1));

const MeditationPlayer = () => {
  const navigate = useNavigate();
  const { completeMeditationSession } = useWealth();
  const { authStatus, loading: authLoading } = useCloudAwareness();
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [meditationSettings, setMeditationSettings] = useState(DEFAULT_MEDITATION_SETTINGS);
  const audioRef = useRef(new Audio());
  const handleSegmentCompleteRef = useRef(() => {});
  const sessionPersistedRef = useRef(false);
  const listenedSecondsRef = useRef(0);
  const lastAudioTimeRef = useRef(0);
  const [segments] = useState(createSessionSegments);
  const canPlayMeditation = !authLoading && Boolean(authStatus?.isAuthenticated);

  const elapsedTime = duration > 0 ? Math.max(duration - timeLeft, 0) : 0;
  const segmentProgress = duration > 0 ? Math.min((elapsedTime / duration) * 100, 100) : 0;
  const tonearmRotation = 8 + segmentProgress * 0.04 + (isPlaying ? 0 : -16);
  const timeLabel = !isLoaded ? '加载中...' : formatTime(timeLeft);
  const footerLabel = isBuffering && isPlaying ? '缓冲中...' : '吸气，感受当下；呼气，放下杂念。';

  if (!authLoading && !authStatus?.isAuthenticated) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'linear-gradient(180deg, #f6f1e8 0%, #efe7da 52%, #e4d8c7 100%)'
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '420px',
            borderRadius: '24px',
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            padding: '24px',
            boxShadow: '0 24px 60px rgba(53, 40, 27, 0.12)',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-accent-ink)' }}>游客模式不可播放冥想</div>
          <div style={{ marginTop: '10px', fontSize: '14px', lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
            你可以继续浏览冥想页面内容，登录后即可开始播放与累计记录。
          </div>
          <button
            type="button"
            onClick={() => navigate('/profile')}
            style={{
              marginTop: '18px',
              border: 'none',
              borderRadius: '14px',
              background: 'var(--theme-button-primary-bg)',
              color: 'var(--theme-button-primary-text)',
              padding: '12px 18px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            前往登录
          </button>
        </div>
      </div>
    );
  }

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

  const persistMeditationSession = useCallback(async ({
    durationMinutes,
    rewardAmount = 0,
    allowRepeatReward = true,
    rewardKey = 'default_meditation_program',
    rewardDescription = '完成一次冥想'
  }) => {
    if (sessionPersistedRef.current || listenedSecondsRef.current <= MIN_VALID_MEDITATION_SECONDS) {
      return {
        rewarded: false,
        rewardAmount: 0
      };
    }

    sessionPersistedRef.current = true;
    return completeMeditationSession({
      duration: Math.max(1, Number(durationMinutes) || 0),
      rewardAmount,
      allowRepeatReward,
      rewardKey,
      rewardDescription
    });
  }, [completeMeditationSession]);

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
        lastAudioTimeRef.current = 0;
        audio.src = segments[nextIndex].url;
        audio.load();
        return;
      }

      setIsPlaying(false);
      const sessionMinutes = toMeditationMinutes(listenedSecondsRef.current);
      const rewardResult = await persistMeditationSession({
        durationMinutes: sessionMinutes,
        rewardAmount: meditationSettings.rewardPoints,
        allowRepeatReward: meditationSettings.allowRepeatRewards,
        rewardKey: 'default_meditation_program',
        rewardDescription: '完成一次冥想'
      });

      const completionMessage = rewardResult.error
        ? '本次冥想已记入，云端福豆暂未到账。'
        : rewardResult.repeatedRewardBlocked && meditationSettings.rewardPoints > 0
          ? '本次冥想已记入，本次不重复发放福豆。'
          : '本次冥想已记入。';

      window.alert(completionMessage);
      navigate('/');
    };
  }, [currentSegmentIndex, meditationSettings, navigate, persistMeditationSession, segments]);

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

      const currentTime = audio.currentTime;
      if (currentTime < lastAudioTimeRef.current) {
        lastAudioTimeRef.current = currentTime;
      } else {
        listenedSecondsRef.current += currentTime - lastAudioTimeRef.current;
        lastAudioTimeRef.current = currentTime;
      }

      const nextDuration = Math.ceil(audio.duration);
      setDuration(nextDuration);
      setTimeLeft(Math.max(0, Math.ceil(audio.duration - currentTime)));
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
      if (!sessionPersistedRef.current && listenedSecondsRef.current > MIN_VALID_MEDITATION_SECONDS) {
        void persistMeditationSession({
          durationMinutes: toMeditationMinutes(listenedSecondsRef.current),
          rewardAmount: 0,
          rewardDescription: '中断后保存一次冥想'
        });
      }
    };
  }, [persistMeditationSession, segments]);

  useEffect(() => {
    const audio = audioRef.current;

    if (isPlaying && isLoaded && canPlayMeditation) {
      audio.play().catch((error) => {
        console.error('Audio playback failed:', error);
        setIsPlaying(false);
      });
      return;
    }

    audio.pause();
  }, [canPlayMeditation, isPlaying, isLoaded]);

  const togglePlay = () => {
    if (!canPlayMeditation) {
      navigate('/profile');
      return;
    }

    setIsPlaying((previousValue) => !previousValue);
  };

  const handleClose = () => {
    if (window.confirm('确定要结束冥想吗？单次冥想超过 3 分钟会自动记入一次。')) {
      void (async () => {
        await persistMeditationSession({
          durationMinutes: toMeditationMinutes(listenedSecondsRef.current),
          rewardAmount: 0,
          rewardDescription: '中断后保存一次冥想'
        });
        navigate('/');
      })();
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
                  disabled={!isLoaded || !canPlayMeditation}
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
                    cursor: isLoaded && canPlayMeditation ? 'pointer' : 'default',
                    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.22)',
                    zIndex: 2,
                    opacity: canPlayMeditation ? 1 : 0.65
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
