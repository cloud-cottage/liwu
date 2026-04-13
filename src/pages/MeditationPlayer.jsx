import React, { useEffect, useRef, useState } from 'react';
import { X, Play, Pause, SkipForward } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWealth } from '../context/WealthContext';

const SEGMENT_COUNT = 5;
const AUDIO_LIBRARY = [
  {
    url: '/audio/meditation/sea_wave1.mp3',
    title: '潮汐低频',
  },
  {
    url: '/audio/meditation/sea_wave2.mp3',
    title: '月湾回响',
  },
  {
    url: '/audio/meditation/sea_wave_seagull.mp3',
    title: '晨海与海鸟',
  },
];

const BREATH_NOTES = [
  '让呼吸跟着唱盘的速度慢下来。',
  '把注意力放回胸腔起伏，而不是念头本身。',
  '每一次吸气，都是重新落针的开始。',
  '杂念出现时，不必驱赶，只需轻轻放回当下。',
  '让最后一段安静，像唱片尾沟一样自然收束。',
];

const createSessionSegments = () =>
  Array.from({ length: SEGMENT_COUNT }, (_, index) => {
    const track = AUDIO_LIBRARY[Math.floor(Math.random() * AUDIO_LIBRARY.length)];

    return {
      ...track,
      label: `第 ${index + 1} 段`,
    };
  });

const MeditationPlayer = () => {
  const navigate = useNavigate();
  const { updateMeditationStats } = useWealth();
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const audioRef = useRef(new Audio());
  const handleSegmentCompleteRef = useRef(() => {});
  const [segments] = useState(createSessionSegments);

  const currentSegment = segments[currentSegmentIndex];
  const elapsedTime = duration > 0 ? Math.max(duration - timeLeft, 0) : 0;
  const segmentProgress = duration > 0 ? Math.min((elapsedTime / duration) * 100, 100) : 0;
  const sessionProgress = Math.min(
    ((currentSegmentIndex + segmentProgress / 100) / SEGMENT_COUNT) * 100,
    100
  );
  const tonearmRotation = 16 + segmentProgress * 0.18 + (isPlaying ? 0 : -4);
  const statusLabel = !isLoaded
    ? '唱片装载中'
    : isBuffering && isPlaying
      ? '纹路缓冲中'
      : isPlaying
        ? '唱针已落下'
        : '唱针已抬起';
  const statusDescription = !isLoaded
    ? '正在读取音轨，请稍候片刻。'
    : isBuffering && isPlaying
      ? '音频正在缓冲，唱盘会在缓冲后继续推进。'
    : isPlaying
      ? '播放状态会驱动转盘与唱针同步移动。'
      : '轻触中央按钮，继续这一段呼吸旅程。';

  useEffect(() => {
    handleSegmentCompleteRef.current = () => {
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
      updateMeditationStats(30);
      window.alert('冥想完成！获得 50 福豆，累计时长增加 30 分钟');
      navigate('/');
    };
  }, [currentSegmentIndex, navigate, segments, updateMeditationStats]);

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

  const skipSegment = () => {
    handleSegmentCompleteRef.current();
  };

  const handleClose = () => {
    if (window.confirm('确定要结束冥想吗？当前进度将不会保存。')) {
      navigate('/');
    }
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(214, 140, 101, 0.18), transparent 36%), linear-gradient(180deg, #f7f1e5 0%, #ece5d7 52%, #d9cfbf 100%)',
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

        @keyframes deck-glow {
          0% { box-shadow: 0 22px 40px rgba(53, 40, 27, 0.18); }
          50% { box-shadow: 0 28px 58px rgba(53, 40, 27, 0.24); }
          100% { box-shadow: 0 22px 40px rgba(53, 40, 27, 0.18); }
        }

        @keyframes status-blink {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
      `}</style>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 20% 18%, rgba(255, 255, 255, 0.75), transparent 24%), radial-gradient(circle at 78% 12%, rgba(214, 140, 101, 0.16), transparent 22%), radial-gradient(circle at 50% 80%, rgba(44, 44, 44, 0.08), transparent 30%)',
        }}
      />

      <div
        style={{
          padding: '24px 24px 8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div>
          <div
            style={{
              fontSize: '12px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'rgba(44, 44, 44, 0.56)',
            }}
          >
            Meditation Deck
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: '28px' }}>静心唱片机</h1>
        </div>

        <button
          aria-label="关闭冥想"
          onClick={handleClose}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            border: '1px solid rgba(44, 44, 44, 0.08)',
            background: 'rgba(255, 255, 255, 0.72)',
            backdropFilter: 'blur(10px)',
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
          gap: '24px',
          padding: '8px 24px 32px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            padding: '8px 4px 0',
            color: 'var(--color-text-secondary)',
            fontSize: '14px',
            lineHeight: 1.7,
            maxWidth: '420px',
          }}
        >
          让播放状态直接映射成一台缓慢运转的唱片机。唱盘转动时，不需要看进度条也能感受到呼吸正在推进。
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 'min(100%, 420px)',
              borderRadius: '36px',
              padding: '22px',
              background:
                'linear-gradient(145deg, rgba(84, 61, 40, 0.96), rgba(44, 31, 21, 0.96))',
              boxShadow: '0 26px 60px rgba(53, 40, 27, 0.28)',
              animation: isPlaying ? 'deck-glow 4.8s ease-in-out infinite' : 'none',
            }}
          >
            <div
              style={{
                position: 'relative',
                borderRadius: '28px',
                padding: '26px 20px 24px',
                background:
                  'linear-gradient(180deg, rgba(232, 216, 197, 0.1), rgba(255, 255, 255, 0.02))',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '18px',
                  left: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '999px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: 'rgba(255, 248, 238, 0.86)',
                  fontSize: '12px',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isLoaded ? 'var(--color-accent-clay)' : 'rgba(255, 255, 255, 0.5)',
                    animation: isPlaying ? 'status-blink 1.3s ease-in-out infinite' : 'none',
                  }}
                />
                {statusLabel}
              </div>

              <div
                style={{
                  position: 'relative',
                  width: 'min(78vw, 320px)',
                  height: 'min(78vw, 320px)',
                  margin: '38px auto 0',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    padding: '10px',
                    background: `conic-gradient(var(--color-accent-clay) ${segmentProgress * 3.6}deg, rgba(255, 255, 255, 0.12) 0deg)`,
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.28)',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background:
                        'radial-gradient(circle at center, #5a5650 0 6%, #131313 6% 15%, #181818 15% 24%, #111 24% 100%)',
                      position: 'relative',
                      overflow: 'hidden',
                      animation: isPlaying ? 'vinyl-spin 4.2s linear infinite' : 'none',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: '12%',
                        borderRadius: '50%',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow:
                          '0 0 0 14px rgba(255, 255, 255, 0.02), 0 0 0 30px rgba(255, 255, 255, 0.02), 0 0 0 46px rgba(255, 255, 255, 0.015)',
                      }}
                    />

                    <button
                      aria-label={isPlaying ? '暂停冥想' : '继续冥想'}
                      onClick={togglePlay}
                      disabled={!isLoaded}
                      style={{
                        position: 'absolute',
                        inset: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '108px',
                        height: '108px',
                        borderRadius: '50%',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        background:
                          'radial-gradient(circle at 30% 30%, #f7e5d1 0%, #d9a27f 42%, #b4724f 100%)',
                        color: 'var(--color-accent-ink)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: isLoaded ? 'pointer' : 'default',
                        boxShadow: '0 12px 28px rgba(0, 0, 0, 0.24)',
                      }}
                    >
                      {isPlaying ? (
                        <Pause size={26} strokeWidth={2.2} />
                      ) : (
                        <Play size={26} strokeWidth={2.2} style={{ marginLeft: '3px' }} />
                      )}
                      <span style={{ fontSize: '11px', letterSpacing: '0.08em' }}>
                        {isPlaying ? '暂停' : '播放'}
                      </span>
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '6px',
                    width: '42%',
                    height: '42%',
                    transformOrigin: '14px 14px',
                    transform: `rotate(${tonearmRotation}deg)`,
                    transition: 'transform 420ms ease-out',
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
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
                      left: '12px',
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
                      left: '118px',
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

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '22px',
                  color: 'rgba(255, 248, 238, 0.74)',
                  fontSize: '12px',
                  letterSpacing: '0.06em',
                }}
              >
                <span>{currentSegment.label}</span>
                <span>{currentSegment.title}</span>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'rgba(255, 252, 247, 0.78)',
            border: '1px solid rgba(44, 44, 44, 0.08)',
            boxShadow: '0 14px 34px rgba(53, 40, 27, 0.08)',
            backdropFilter: 'blur(14px)',
            borderRadius: '28px',
            padding: '22px 20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '16px',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                {currentSegment.label} / 共 {SEGMENT_COUNT} 段
              </div>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 600,
                  color: 'var(--color-accent-ink)',
                  lineHeight: 1.1,
                  marginTop: '6px',
                }}
              >
                {!isLoaded ? '装载中...' : formatTime(timeLeft)}
              </div>
            </div>

            <div
              style={{
                padding: '10px 12px',
                borderRadius: '18px',
                background: 'rgba(214, 140, 101, 0.12)',
                color: 'var(--color-accent-ink)',
                fontSize: '12px',
                lineHeight: 1.5,
              }}
            >
              {statusDescription}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                  marginBottom: '6px',
                }}
              >
                <span>当前段落进度</span>
                <span>{Math.round(segmentProgress)}%</span>
              </div>
              <div
                style={{
                  height: '8px',
                  borderRadius: '999px',
                  background: 'rgba(44, 44, 44, 0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${segmentProgress}%`,
                    height: '100%',
                    borderRadius: '999px',
                    background:
                      'linear-gradient(90deg, var(--color-accent-clay), rgba(214, 140, 101, 0.42))',
                    transition: 'width 180ms linear',
                  }}
                />
              </div>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                  marginBottom: '6px',
                }}
              >
                <span>整场静心进度</span>
                <span>{Math.round(sessionProgress)}%</span>
              </div>
              <div
                style={{
                  height: '8px',
                  borderRadius: '999px',
                  background: 'rgba(44, 44, 44, 0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${sessionProgress}%`,
                    height: '100%',
                    borderRadius: '999px',
                    background: 'linear-gradient(90deg, #2c2c2c, rgba(44, 44, 44, 0.4))',
                    transition: 'width 180ms linear',
                  }}
                />
              </div>
            </div>
          </div>

          <p
            style={{
              margin: 0,
              color: 'var(--color-text-secondary)',
              fontSize: '14px',
              lineHeight: 1.7,
            }}
          >
            {BREATH_NOTES[currentSegmentIndex]}
          </p>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={togglePlay}
              disabled={!isLoaded}
              style={{
                flex: 1,
                border: 'none',
                borderRadius: '18px',
                padding: '15px 18px',
                background: 'var(--color-accent-ink)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: isLoaded ? 'pointer' : 'default',
                opacity: isLoaded ? 1 : 0.55,
              }}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
              {isPlaying ? '暂停唱盘' : '继续播放'}
            </button>

            <button
              onClick={skipSegment}
              style={{
                border: '1px solid rgba(44, 44, 44, 0.12)',
                borderRadius: '18px',
                padding: '15px 18px',
                background: 'rgba(255, 255, 255, 0.68)',
                color: 'var(--color-accent-ink)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <SkipForward size={18} />
              下一段
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeditationPlayer;
