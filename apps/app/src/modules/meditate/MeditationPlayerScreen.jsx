import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Play, Pause } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWealth } from '../../context/WealthContext';
import { useCloudAwareness } from '../../context/CloudAwarenessContext';
import DatabaseService, { DEFAULT_MEDITATION_SETTINGS } from '../../services/database.js';
import {
  DEFAULT_MEDITATION_SESSION_SECONDS,
  getMeditationAudioMimeType,
  MEDITATION_TRACK_VOLUMES,
  MEDITATION_TRACK_KEYS,
  buildFallbackMeditationSessionPlan,
  buildMeditationSessionPlan
} from '@liwu/shared-utils/meditation-session-plan.js';

const FALLBACK_BACKGROUND_AUDIO_LIBRARY = [
  '/audio/meditation/sea_wave1.mp3',
  '/audio/meditation/sea_wave2.mp3',
  '/audio/meditation/sea_wave_seagull.mp3'
];
const MIN_VALID_MEDITATION_SECONDS = 180;
const SESSION_LABELS = {
  morning: '早课',
  noon: '午课',
  afternoon: '下午课',
  evening: '晚课'
};

const formatTime = (seconds) => {
  const normalizedSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(normalizedSeconds / 60);
  const remainingSeconds = normalizedSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const toMeditationMinutes = (seconds) => Number((Math.max(0, Number(seconds) || 0) / 60).toFixed(1));

const buildFallbackSessionPlan = (now = new Date()) => buildFallbackMeditationSessionPlan({
  fallbackAudioLibrary: FALLBACK_BACKGROUND_AUDIO_LIBRARY,
  now,
  defaultSessionSeconds: DEFAULT_MEDITATION_SESSION_SECONDS
});

const buildRuntimeSessionPlan = ({
  audioLibrary,
  compositionSettings,
  meditationCalendar,
  meditationLibrary,
  now = new Date()
}) => buildMeditationSessionPlan({
  audioLibrary,
  compositionSettings,
  meditationCalendar,
  meditationLibrary,
  now,
  fallbackAudioLibrary: FALLBACK_BACKGROUND_AUDIO_LIBRARY,
  defaultSessionSeconds: DEFAULT_MEDITATION_SESSION_SECONDS
});

const MeditationPlayer = () => {
  const navigate = useNavigate();
  const { completeMeditationSession } = useWealth();
  const { authStatus, loading: authLoading } = useCloudAwareness();
  const [timeLeft, setTimeLeft] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [meditationSettings, setMeditationSettings] = useState(DEFAULT_MEDITATION_SETTINGS);
  const [sessionPlan, setSessionPlan] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const backgroundAudioRef = useRef(new Audio());
  const voiceAudioRef = useRef(new Audio());
  const timerRef = useRef(null);
  const sessionStartMsRef = useRef(null);
  const elapsedBeforePauseRef = useRef(0);
  const sessionPersistedRef = useRef(false);
  const listenedSecondsRef = useRef(0);
  const blobUrlCacheRef = useRef(new Map());
  const trackLoadTokenRef = useRef({ background: 0, voice: 0 });
  const isPlayingRef = useRef(false);
  const sessionPlanRef = useRef(null);
  const completionHandledRef = useRef(false);
  const trackRuntimeRef = useRef({
    background: { segmentId: '', itemIndex: 0, completed: false },
    voice: { segmentId: '', itemIndex: 0, completed: false }
  });
  const canPlayMeditation = !authLoading && Boolean(authStatus?.isAuthenticated);

  const getAudioRef = useCallback((trackKey) => (
    trackKey === 'background' ? backgroundAudioRef : voiceAudioRef
  ), []);

  const resolvePlayableAudioSrc = useCallback(async (audioUrl) => {
    const cache = blobUrlCacheRef.current;
    if (cache.has(audioUrl)) {
      return cache.get(audioUrl) || '';
    }

    const response = await fetch(audioUrl, { method: 'GET' });
    if (!response.ok && response.status !== 206) {
      throw new Error(`AUDIO_FETCH_${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], {
      type: getMeditationAudioMimeType(audioUrl)
    });
    const blobUrl = URL.createObjectURL(blob);
    cache.set(audioUrl, blobUrl);
    return blobUrl;
  }, []);

  const getElapsedSeconds = useCallback(() => {
    if (isPlayingRef.current && sessionStartMsRef.current != null) {
      return Math.max(0, (performance.now() - sessionStartMsRef.current) / 1000);
    }

    return Math.max(0, elapsedBeforePauseRef.current);
  }, []);

  const stopTicker = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pausePlayback = useCallback(() => {
    elapsedBeforePauseRef.current = getElapsedSeconds();
    stopTicker();
    isPlayingRef.current = false;
    backgroundAudioRef.current.pause();
    voiceAudioRef.current.pause();
    setIsPlaying(false);
    setIsBuffering(false);
  }, [getElapsedSeconds, stopTicker]);

  const clearTrackRuntime = useCallback((trackKey) => {
    const audio = getAudioRef(trackKey).current;
    trackLoadTokenRef.current[trackKey] += 1;
    trackRuntimeRef.current[trackKey] = {
      segmentId: '',
      itemIndex: 0,
      completed: false
    };
    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    audio.onerror = null;
    audio.onwaiting = null;
    audio.onplaying = null;
    audio.oncanplay = null;
    audio.src = '';
  }, [getAudioRef]);

  const completeTrackSegment = useCallback((trackKey, segmentId) => {
    const audio = getAudioRef(trackKey).current;
    trackRuntimeRef.current[trackKey] = {
      segmentId,
      itemIndex: 0,
      completed: true
    };
    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    audio.onerror = null;
    audio.onwaiting = null;
    audio.onplaying = null;
    audio.oncanplay = null;
    audio.src = '';
  }, [getAudioRef]);

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

  const playTrackPlaylistItem = useCallback((trackKey, segment, itemIndex = 0) => {
    const audio = getAudioRef(trackKey).current;
    const playlist = Array.isArray(segment?.playlist) ? segment.playlist.filter((item) => item?.audioUrl) : [];

    if (playlist.length === 0) {
      completeTrackSegment(trackKey, segment?.id || '');
      return;
    }

    const normalizedIndex = Math.max(0, itemIndex % playlist.length);
    const item = playlist[normalizedIndex];
    const loadToken = trackLoadTokenRef.current[trackKey] + 1;
    trackLoadTokenRef.current[trackKey] = loadToken;

    trackRuntimeRef.current[trackKey] = {
      segmentId: segment.id,
      itemIndex: normalizedIndex,
      completed: false
    };

    void (async () => {
      let playableSrc = '';
      try {
        playableSrc = await resolvePlayableAudioSrc(item.audioUrl);
      } catch (error) {
        console.error(`Audio source fetch failed for ${trackKey}:`, error);
        completeTrackSegment(trackKey, segment.id);
        setSessionError(error?.message || '音频资源加载失败，请稍后重试');
        pausePlayback();
        return;
      }

      if (trackLoadTokenRef.current[trackKey] !== loadToken) {
        return;
      }

      audio.pause();
      audio.currentTime = 0;
      audio.src = playableSrc;
      audio.volume = MEDITATION_TRACK_VOLUMES[trackKey] ?? 1;
      audio.onwaiting = () => setIsBuffering(true);
      audio.oncanplay = () => setIsBuffering(false);
      audio.onplaying = () => setIsBuffering(false);
      audio.onended = () => {
        if (trackRuntimeRef.current[trackKey].segmentId !== segment.id) {
          return;
        }

        const elapsedSeconds = getElapsedSeconds();
        if (elapsedSeconds >= segment.endSeconds) {
          clearTrackRuntime(trackKey);
          return;
        }

        if (segment.playbackMode === 'sequence') {
          if (normalizedIndex + 1 >= playlist.length) {
            completeTrackSegment(trackKey, segment.id);
            return;
          }

          playTrackPlaylistItem(trackKey, segment, normalizedIndex + 1);
          return;
        }

        playTrackPlaylistItem(trackKey, segment, normalizedIndex + 1);
      };
      audio.onerror = () => {
        if (segment.playbackMode === 'sequence' && normalizedIndex + 1 < playlist.length) {
          playTrackPlaylistItem(trackKey, segment, normalizedIndex + 1);
          return;
        }

        if (segment.playbackMode === 'loop' && playlist.length > 1) {
          playTrackPlaylistItem(trackKey, segment, normalizedIndex + 1);
          return;
        }

        completeTrackSegment(trackKey, segment.id);
      };
      audio.load();

      if (isPlayingRef.current) {
        setIsBuffering(true);
        audio.play().catch((error) => {
          console.error(`Audio playback failed for ${trackKey}:`, error);
          completeTrackSegment(trackKey, segment.id);
          setSessionError(error?.message || '音频播放失败，请稍后重试');
          pausePlayback();
        });
      }
    })();
  }, [clearTrackRuntime, completeTrackSegment, getAudioRef, getElapsedSeconds, pausePlayback, resolvePlayableAudioSrc]);

  const syncTrackPlayback = useCallback((elapsedSeconds) => {
    const plan = sessionPlanRef.current;

    if (!plan) {
      return;
    }

    MEDITATION_TRACK_KEYS.forEach((trackKey) => {
      const activeSegment = plan.segments.find((segment) => (
        segment.trackKey === trackKey &&
        elapsedSeconds >= segment.startSeconds &&
        elapsedSeconds < segment.endSeconds
      )) || null;
      const trackRuntime = trackRuntimeRef.current[trackKey];

      if (!activeSegment) {
        if (trackRuntime.segmentId) {
          clearTrackRuntime(trackKey);
        }
        return;
      }

      if (trackRuntime.segmentId !== activeSegment.id) {
        playTrackPlaylistItem(trackKey, activeSegment, 0);
      }
    });
  }, [clearTrackRuntime, playTrackPlaylistItem]);

  const completePlayback = useCallback(async () => {
    if (completionHandledRef.current) {
      return;
    }

    completionHandledRef.current = true;
    stopTicker();
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsBuffering(false);
    clearTrackRuntime('background');
    clearTrackRuntime('voice');
    elapsedBeforePauseRef.current = Math.max(elapsedBeforePauseRef.current, duration || 0);
    listenedSecondsRef.current = Math.max(listenedSecondsRef.current, elapsedBeforePauseRef.current);

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
  }, [clearTrackRuntime, duration, meditationSettings, navigate, persistMeditationSession, stopTicker]);

  const startTicker = useCallback(() => {
    if (timerRef.current || !sessionPlanRef.current) {
      return;
    }

    timerRef.current = window.setInterval(() => {
      const elapsedSeconds = getElapsedSeconds();
      const sessionDuration = sessionPlanRef.current?.sessionDuration || DEFAULT_SESSION_SECONDS;
      listenedSecondsRef.current = Math.max(listenedSecondsRef.current, elapsedSeconds);
      setDuration(sessionDuration);
      setTimeLeft(Math.max(0, Math.ceil(sessionDuration - elapsedSeconds)));
      syncTrackPlayback(elapsedSeconds);

      const stillHasPlayableContent = MEDITATION_TRACK_KEYS.some((trackKey) => {
        const trackSegments = (sessionPlanRef.current?.segments || []).filter((segment) => segment.trackKey === trackKey);
        const futureSegmentExists = trackSegments.some((segment) => elapsedSeconds < segment.startSeconds);
        if (futureSegmentExists) {
          return true;
        }

        const activeSegment = trackSegments.find((segment) => (
          elapsedSeconds >= segment.startSeconds &&
          elapsedSeconds < segment.endSeconds
        )) || null;

        if (!activeSegment) {
          return false;
        }

        const trackRuntime = trackRuntimeRef.current[trackKey];
        return !(trackRuntime.segmentId === activeSegment.id && trackRuntime.completed);
      });

      if (!stillHasPlayableContent) {
        void completePlayback();
        return;
      }

      if (elapsedSeconds >= sessionDuration) {
        void completePlayback();
      }
    }, 250);
  }, [completePlayback, getElapsedSeconds, syncTrackPlayback]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [
          settings,
          audioLibrary,
          compositionSettings,
          meditationCalendar,
          meditationLibrary
        ] = await Promise.all([
          DatabaseService.getMeditationSettings(),
          DatabaseService.getMeditationAudioLibrary(),
          DatabaseService.getMeditationCompositionSettings(),
          DatabaseService.getMeditationCalendar(),
          DatabaseService.getMeditationLibrary()
        ]);

        if (!active) {
          return;
        }

        const nextPlan = buildRuntimeSessionPlan({
          audioLibrary,
          compositionSettings,
          meditationCalendar,
          meditationLibrary
        });

        sessionPlanRef.current = nextPlan;
        setMeditationSettings(settings);
        setSessionPlan(nextPlan);
        setSessionError('');
        setDuration(nextPlan.sessionDuration);
        setTimeLeft(nextPlan.sessionDuration);
        setIsLoaded(true);
        setIsBuffering(false);
        completionHandledRef.current = false;
      } catch (error) {
        console.error('Failed to load meditation playback config:', error);

        if (!active) {
          return;
        }

        const fallbackPlan = buildFallbackSessionPlan();
        sessionPlanRef.current = fallbackPlan;
        setSessionPlan(fallbackPlan);
        setSessionError(error.message || '冥想配置加载失败，已切换到默认背景音。');
        setDuration(fallbackPlan.sessionDuration);
        setTimeLeft(fallbackPlan.sessionDuration);
        setIsLoaded(true);
        setIsBuffering(false);
        completionHandledRef.current = false;
      }
    })();

    return () => {
      active = false;
      stopTicker();
      clearTrackRuntime('background');
      clearTrackRuntime('voice');
      blobUrlCacheRef.current.forEach((blobUrl) => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {}
      });
      blobUrlCacheRef.current.clear();
    };
  }, [clearTrackRuntime, stopTicker]);

  const startPlayback = useCallback(async () => {
    if (!isLoaded || !canPlayMeditation || !sessionPlanRef.current) {
      return;
    }

    const resumeElapsedSeconds = elapsedBeforePauseRef.current;
    sessionStartMsRef.current = performance.now() - resumeElapsedSeconds * 1000;
    syncTrackPlayback(resumeElapsedSeconds);
    isPlayingRef.current = true;
    setIsPlaying(true);
    setIsBuffering(true);

    const playableAudios = [backgroundAudioRef.current, voiceAudioRef.current].filter((audio) => audio.src);
    const playbackResults = await Promise.allSettled(playableAudios.map((audio) => audio.play()));
    if (playbackResults.some((result) => result.status === 'rejected')) {
      const rejectedResult = playbackResults.find((result) => result.status === 'rejected');
      setSessionError(rejectedResult?.reason?.message || '播放启动失败，请检查网络或稍后重试');
      pausePlayback();
      return;
    }

    setSessionError('');
    setIsBuffering(false);
    startTicker();
  }, [canPlayMeditation, isLoaded, pausePlayback, startTicker, syncTrackPlayback]);

  const elapsedTime = duration > 0 ? Math.max(duration - timeLeft, 0) : 0;
  const segmentProgress = duration > 0 ? Math.min((elapsedTime / duration) * 100, 100) : 0;
  const tonearmRotation = 8 + segmentProgress * 0.04 + (isPlaying ? 0 : -16);
  const timeLabel = !isLoaded ? '加载中...' : formatTime(timeLeft);
  const footerLabel = isBuffering && isPlaying
    ? '缓冲中...'
    : sessionPlan
      ? `${SESSION_LABELS[sessionPlan.sessionKey] || '冥想'} · ${sessionPlan.presetName}${sessionPlan.usedFallback ? ' · 默认音频' : ''}`
      : '吸气，感受当下；呼气，放下杂念。';

  const togglePlay = async () => {
    if (!canPlayMeditation) {
      navigate('/profile');
      return;
    }

    if (!isLoaded || !sessionPlan) {
      return;
    }

    if (isPlayingRef.current) {
      pausePlayback();
      return;
    }

    await startPlayback();
  };

  const handleClose = () => {
    if (window.confirm('确定要结束冥想吗？单次冥想超过 3 分钟会自动记入一次。')) {
      stopTicker();
      clearTrackRuntime('background');
      clearTrackRuntime('voice');
      void (async () => {
        await persistMeditationSession({
          durationMinutes: toMeditationMinutes(Math.max(listenedSecondsRef.current, getElapsedSeconds())),
          rewardAmount: 0,
          rewardDescription: '中断后保存一次冥想'
        });
        navigate('/');
      })();
    }
  };

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

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(214, 140, 101, 0.16), transparent 34%), linear-gradient(180deg, #f6f1e8 0%, #efe7da 52%, #e4d8c7 100%)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden'
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
            'radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.78), transparent 24%), radial-gradient(circle at 85% 10%, rgba(214, 140, 101, 0.16), transparent 24%)'
        }}
      />

      <div
        style={{
          padding: '24px',
          display: 'flex',
          justifyContent: 'flex-end',
          position: 'relative',
          zIndex: 1
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
            boxShadow: '0 8px 20px rgba(53, 40, 27, 0.08)'
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
          zIndex: 1
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '8px'
          }}
        >
          <div
            style={{
              width: 'min(100%, 380px)',
              borderRadius: '34px',
              padding: '22px',
              background: 'linear-gradient(145deg, rgba(84, 61, 40, 0.96), rgba(44, 31, 21, 0.96))',
              boxShadow: '0 26px 60px rgba(53, 40, 27, 0.22)'
            }}
          >
            <div
              style={{
                position: 'relative',
                borderRadius: '28px',
                padding: '22px 18px 20px',
                background:
                  'linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02))',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: 'min(78vw, 312px)',
                  height: 'min(78vw, 312px)',
                  margin: '34px auto 0'
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.24))',
                    boxShadow: '0 22px 42px rgba(0, 0, 0, 0.26)'
                  }}
                />

                <div
                  style={{
                    position: 'absolute',
                    inset: '3.5%',
                    borderRadius: '50%',
                    background: 'linear-gradient(145deg, #191919, #090909)',
                    animation: isPlaying ? 'vinyl-spin 7.5s linear infinite' : 'none',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: '5%',
                      borderRadius: '50%',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      boxShadow:
                        '0 0 0 12px rgba(255, 255, 255, 0.018), 0 0 0 28px rgba(255, 255, 255, 0.018), 0 0 0 42px rgba(255, 255, 255, 0.014)'
                    }}
                  />

                  <div
                    style={{
                      position: 'absolute',
                      inset: '19%',
                      borderRadius: '50%',
                      overflow: 'hidden'
                    }}
                  >
                    <img
                      src="/images/meditation/cover.jpg"
                      alt="Meditation Cover"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                          'radial-gradient(circle at center, rgba(255, 255, 255, 0.06), rgba(0, 0, 0, 0.22))'
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
                      filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.2))'
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
                    pointerEvents: 'none'
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
                      boxShadow: '0 8px 18px rgba(0, 0, 0, 0.26)'
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
                      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)'
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
                      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.18)'
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
            marginTop: '24px'
          }}
        >
          <div
            style={{
              fontSize: '28px',
              fontFamily: 'var(--font-sans)',
              fontWeight: 300,
              color: 'var(--color-accent-ink)',
              letterSpacing: '0.04em'
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
            opacity: 0.82
          }}
        >
          {sessionError ? `${footerLabel} · ${sessionError}` : footerLabel}
        </div>
      </div>
    </div>
  );
};

export default MeditationPlayer;
