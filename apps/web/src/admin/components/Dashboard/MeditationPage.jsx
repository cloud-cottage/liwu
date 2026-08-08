import React, { useCallback, useEffect, useState } from 'react';
import { getAudioTempUrl, uploadAudioFile } from '../../utils/audioUpload.js';
import { synthesizeSpeech, blobUrlToFile } from '../../utils/ttsService.js';
import DatabaseService, {
  MEDITATION_AUDIO_LIBRARY_TYPES,
  MEDITATION_AUDIO_TRANSCODE_STATUS,
  resolveMeditationAudioTranscodeProfile
} from '../../services/database.js';
import {
  buildMeditationSessionPlan,
  getMeditationAudioMimeType,
  MEDITATION_TRACK_VOLUMES
} from '@liwu/shared-utils/meditation-session-plan.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_LABELS = {
  bowl: '颂钵库',
  greeting: '问候库',
  nature: '自然库',
  breath: '呼吸库',
  quote: '心语库',
  goodbye: '告别库'
};

const SESSION_LABELS = {
  morning: '早课',
  noon: '午课',
  afternoon: '下午课',
  evening: '晚课'
};
const SUB_TABS = [
  { key: 'paragraph', label: '段落文本库' },
  { key: 'section-raw', label: '原始音频库' },
  { key: 'library', label: '音频库' },
  { key: 'presets', label: '冥想库' },
  { key: 'composition', label: '冥想设置' },
  { key: 'calendar', label: '冥想日历' }
];

// ─── Shared Styles ────────────────────────────────────────────────────────────

const cardStyle = {
  backgroundColor: '#fff',
  borderRadius: '16px',
  padding: '28px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  marginBottom: '24px'
};

const sectionTitleStyle = {
  fontSize: '15px',
  fontWeight: '600',
  color: '#1e293b',
  marginBottom: '16px',
  paddingBottom: '8px',
  borderBottom: '1px solid #f1f5f9'
};

const pillBtnStyle = (active) => ({
  padding: '6px 16px',
  borderRadius: '20px',
  border: 'none',
  fontSize: '13px',
  fontWeight: active ? '600' : '400',
  cursor: 'pointer',
  backgroundColor: active ? '#1e293b' : '#f1f5f9',
  color: active ? '#fff' : '#64748b',
  transition: 'all 0.15s'
});

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '13px',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  outline: 'none',
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: '500',
  color: '#64748b',
  marginBottom: '4px'
};

const primaryBtnStyle = {
  padding: '7px 16px',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: '500',
  cursor: 'pointer',
  backgroundColor: '#1e293b',
  color: '#fff'
};

const dangerBtnStyle = {
  padding: '5px 12px',
  border: '1px solid #fca5a5',
  borderRadius: '6px',
  fontSize: '12px',
  cursor: 'pointer',
  backgroundColor: '#fff5f5',
  color: '#dc2626'
};

const ghostBtnStyle = {
  padding: '5px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  fontSize: '12px',
  cursor: 'pointer',
  backgroundColor: '#fff',
  color: '#475569'
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const formatSeconds = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const isSsmlText = (value = '') => /^<speak[\s>]/i.test(String(value || '').trim());

const normalizeSsmlBreakDurations = (value = '') => String(value || '').replace(
  /(<break\b[^>]*\btime\s*=\s*)(["'])(\d+(?:\.\d+)?)s\2/gi,
  (fullMatch, prefix, quote, secondsValue) => {
    const millisecondsValue = Math.round(Number(secondsValue) * 1000);
    if (!Number.isFinite(millisecondsValue) || millisecondsValue <= 0) {
      return fullMatch;
    }

    return `${prefix}${quote}${millisecondsValue}ms${quote}`;
  }
);

const normalizeStoredTtsText = (value = '', isSSML = false) => {
  const trimmedValue = String(value || '').trim();
  if (!trimmedValue) {
    return '';
  }

  return isSSML || isSsmlText(trimmedValue)
    ? normalizeSsmlBreakDurations(trimmedValue)
    : trimmedValue;
};

const sortAudioGroups = (groups = []) => [...groups].sort((left, right) => {
  if (left.type !== right.type) {
    return MEDITATION_AUDIO_LIBRARY_TYPES.indexOf(left.type) - MEDITATION_AUDIO_LIBRARY_TYPES.indexOf(right.type);
  }

  return Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0);
});

const getTypeGroups = (groups = [], type) => sortAudioGroups(groups).filter((group) => group.type === type);

const getDefaultGroupIdForType = (groups = [], type) => getTypeGroups(groups, type)[0]?.id || '';

const createEmptyGroupSelections = (groups = []) => Object.fromEntries(
  sortAudioGroups(groups).map((group) => [group.id, []])
);

const normalizeGroupSelections = (groups = [], selections = {}) => {
  const nextSelections = createEmptyGroupSelections(groups);
  Object.keys(nextSelections).forEach((groupId) => {
    if (Array.isArray(selections[groupId])) {
      nextSelections[groupId] = [...selections[groupId]];
    }
  });
  return nextSelections;
};

const aggregateSectionsFromSelections = (groups = [], selections = {}) => Object.fromEntries(
  MEDITATION_AUDIO_LIBRARY_TYPES.map((type) => [
    type,
    getTypeGroups(groups, type).flatMap((group) => Array.isArray(selections[group.id]) ? selections[group.id] : [])
  ])
);

const PREVIEW_TRACK_KEYS = ['background', 'voice'];

const buildMeditationPresetPreviewPlan = async ({ preset, audioLibrary, compositionSettings }) => {
  if (!preset) {
    return null;
  }

  const getAudioPlaybackSupport = (audioUrl) => {
    try {
      const probe = document.createElement('audio');
      const mimeType = getMeditationAudioMimeType(audioUrl);
      const supportLevel = probe.canPlayType(mimeType);
      const isOpus = mimeType.includes('codecs="opus"');

      if (isOpus) {
        return {
          supported: supportLevel === 'probably',
          supportLevel
        };
      }

      return {
        supported: supportLevel !== '',
        supportLevel
      };
    } catch {
      return {
        supported: true,
        supportLevel: 'probably'
      };
    }
  };

  const resolvedItems = await Promise.all((audioLibrary?.items || []).map(async (item) => ({
    ...item,
    audioUrl: item.fileId
      ? await getAudioTempUrl(item.fileId) || item.audioUrl || ''
      : item.audioUrl || ''
  })));

  const opusItems = resolvedItems.filter((item) => item.audioUrl && getMeditationAudioMimeType(item.audioUrl).includes('codecs="opus"'));
  if (opusItems.length > 0) {
    const unsupportedOpusItem = opusItems.find((item) => !getAudioPlaybackSupport(item.audioUrl).supported) || null;
    if (unsupportedOpusItem) {
      return {
        previewBlockedReason: '当前浏览器未达到 Opus 的稳定支持级别（需要 probably），后台原生试听已阻止。'
      };
    }
  }

  const toPreviewPlayableItem = async (item) => {
    if (!item.audioUrl) {
      return null;
    }

    const response = await fetch(item.audioUrl, { method: 'GET' });
    if (!response.ok && response.status !== 206) {
      throw new Error(`AUDIO_FETCH_${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], {
      type: getMeditationAudioMimeType(item.audioUrl)
    });
    const blobUrl = URL.createObjectURL(blob);

    const duration = await new Promise((resolve) => {
      const probe = document.createElement('audio');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        resolve(Number.isFinite(probe.duration) ? probe.duration : Number(item.duration || 0));
      };
      probe.onerror = () => {
        resolve(Number(item.duration || 0));
      };
      probe.src = blobUrl;
    });

    return {
      ...item,
      audioUrl: blobUrl,
      duration: Math.max(0, Number(duration) || 0),
      revokeAfterPreview: true
    };
  };

  const playableItems = (await Promise.all(
    resolvedItems
      .filter((item) => item.audioUrl && getAudioPlaybackSupport(item.audioUrl).supported)
      .map(toPreviewPlayableItem)
  )).filter(Boolean);

  const plan = buildMeditationSessionPlan({
    audioLibrary: {
      ...audioLibrary,
      items: playableItems
    },
    compositionSettings,
    meditationCalendar: { days: {} },
    meditationLibrary: {
      meditations: [preset]
    },
    preset
  });

  if (!plan?.segments?.length) {
    return null;
  }

  return {
    presetName: plan.presetName || preset.name || '未命名冥想',
    segments: plan.segments,
    sessionDuration: plan.sessionDuration
  };
};

const MeditationPreviewDialog = ({ plan, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [previewMessage, setPreviewMessage] = useState('');
  const backgroundAudioRef = React.useRef(new Audio());
  const voiceAudioRef = React.useRef(new Audio());
  const timerRef = React.useRef(null);
  const startMsRef = React.useRef(null);
  const elapsedBeforePauseRef = React.useRef(0);
  const runtimeRef = React.useRef({
    background: { segmentId: '', itemIndex: 0, completed: false },
    voice: { segmentId: '', itemIndex: 0, completed: false }
  });
  const resumeAfterScrubRef = React.useRef(false);
  const isPlayingRef = React.useRef(false);

  const describeMediaError = useCallback((audio) => {
    const mediaError = audio?.error;
    if (!mediaError) {
      return '';
    }

    const codeLabelMap = {
      1: 'MEDIA_ERR_ABORTED',
      2: 'MEDIA_ERR_NETWORK',
      3: 'MEDIA_ERR_DECODE',
      4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
    };

    return codeLabelMap[mediaError.code] || `MEDIA_ERR_${mediaError.code || 'UNKNOWN'}`;
  }, []);

  const getAudioRef = useCallback((trackKey) => (
    trackKey === 'background' ? backgroundAudioRef : voiceAudioRef
  ), []);

  const playAudioWithAbortRetry = useCallback(async (audio) => {
    try {
      await audio.play();
      return { status: 'fulfilled' };
    } catch (error) {
      if (
        error?.name === 'AbortError' &&
        isPlayingRef.current &&
        audio.src
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        try {
          await audio.play();
          return { status: 'fulfilled' };
        } catch (retryError) {
          return { status: 'rejected', reason: retryError };
        }
      }

      return { status: 'rejected', reason: error };
    }
  }, []);

  const resolveSegmentPlaybackPosition = useCallback((segment, elapsedWithinSegment = 0) => {
    const playlist = Array.isArray(segment?.playlist) ? segment.playlist.filter((item) => item?.audioUrl) : [];
    if (playlist.length === 0) {
      return { itemIndex: 0, seekSeconds: 0 };
    }

    const normalizedElapsed = Math.max(0, Number(elapsedWithinSegment) || 0);
    const itemDurations = playlist.map((item) => Math.max(0, Number(item.duration) || 0));

    if (segment?.playbackMode === 'sequence') {
      if (itemDurations.some((duration) => duration <= 0)) {
        return { itemIndex: 0, seekSeconds: 0 };
      }

      let remainingElapsed = normalizedElapsed;
      for (let index = 0; index < itemDurations.length; index += 1) {
        const currentDuration = itemDurations[index];
        if (remainingElapsed < currentDuration) {
          return { itemIndex: index, seekSeconds: remainingElapsed };
        }
        remainingElapsed -= currentDuration;
      }

      const lastDuration = itemDurations[itemDurations.length - 1];
      return {
        itemIndex: itemDurations.length - 1,
        seekSeconds: Math.max(0, lastDuration - 0.05)
      };
    }

    const playlistDuration = itemDurations.reduce((sum, duration) => sum + duration, 0);
    if (playlistDuration <= 0) {
      return { itemIndex: 0, seekSeconds: 0 };
    }

    let remainingElapsed = normalizedElapsed % playlistDuration;
    for (let index = 0; index < itemDurations.length; index += 1) {
      const currentDuration = itemDurations[index];
      if (remainingElapsed < currentDuration) {
        return { itemIndex: index, seekSeconds: remainingElapsed };
      }
      remainingElapsed -= currentDuration;
    }

    return { itemIndex: 0, seekSeconds: 0 };
  }, []);

  const stopTicker = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const getElapsedSeconds = useCallback(() => {
    if (isPlayingRef.current && startMsRef.current != null) {
      return Math.max(0, (performance.now() - startMsRef.current) / 1000);
    }

    return Math.max(0, elapsedBeforePauseRef.current);
  }, []);

  const pausePreviewPlayback = useCallback(() => {
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
    runtimeRef.current[trackKey] = { segmentId: '', itemIndex: 0, completed: false };
    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    audio.onerror = null;
    audio.onwaiting = null;
    audio.onplaying = null;
    audio.oncanplay = null;
    audio.onloadedmetadata = null;
    audio.src = '';
  }, [getAudioRef]);

  const completeTrackSegment = useCallback((trackKey, segmentId) => {
    const audio = getAudioRef(trackKey).current;
    runtimeRef.current[trackKey] = {
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
    audio.onloadedmetadata = null;
    audio.src = '';
  }, [getAudioRef]);

  const completePreviewPlayback = useCallback(() => {
    stopTicker();
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsBuffering(false);
    elapsedBeforePauseRef.current = plan.sessionDuration;
    setElapsedSeconds(plan.sessionDuration);
    clearTrackRuntime('background');
    clearTrackRuntime('voice');
  }, [clearTrackRuntime, plan.sessionDuration, stopTicker]);

  const playTrackPlaylistItem = useCallback((trackKey, segment, itemIndex = 0, seekSeconds = 0, autoPlay = isPlayingRef.current) => {
    const audio = getAudioRef(trackKey).current;
    const playlist = Array.isArray(segment?.playlist) ? segment.playlist.filter((item) => item?.audioUrl) : [];

    if (playlist.length === 0) {
      clearTrackRuntime(trackKey);
      return;
    }

    const normalizedIndex = Math.max(0, itemIndex % playlist.length);
    const item = playlist[normalizedIndex];

    runtimeRef.current[trackKey] = {
      segmentId: segment.id,
      itemIndex: normalizedIndex,
      itemTitle: item.title || '未命名素材',
      completed: false
    };

    audio.pause();
    audio.currentTime = 0;
    audio.src = item.audioUrl;
    audio.volume = MEDITATION_TRACK_VOLUMES[trackKey] ?? 1;
    audio.onwaiting = () => setIsBuffering(true);
    audio.oncanplay = () => setIsBuffering(false);
    audio.onloadedmetadata = () => {
      if (seekSeconds > 0 && Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = Math.min(seekSeconds, Math.max(audio.duration - 0.05, 0));
      }
      setPreviewMessage(`已加载 ${TYPE_LABELS[segment.type]} · ${item.title || '音频片段'}`);
    };
    audio.onplaying = () => setIsBuffering(false);
    audio.onended = () => {
      if (runtimeRef.current[trackKey].segmentId !== segment.id) {
        return;
      }

      const elapsed = getElapsedSeconds();
      if (elapsed >= segment.endSeconds) {
        completeTrackSegment(trackKey, segment.id);
        return;
      }

      if (segment.playbackMode === 'sequence') {
        if (normalizedIndex + 1 >= playlist.length) {
          completeTrackSegment(trackKey, segment.id);
          return;
        }

        playTrackPlaylistItem(trackKey, segment, normalizedIndex + 1, 0);
        return;
      }

      playTrackPlaylistItem(trackKey, segment, normalizedIndex + 1, 0);
    };
    audio.onerror = () => {
      const mediaErrorLabel = describeMediaError(audio);
      setPreviewMessage(
        `${TYPE_LABELS[segment.type]}「${item.title || '未命名素材'}」读取失败${mediaErrorLabel ? `：${mediaErrorLabel}` : ''}`
      );
      if (segment.playbackMode === 'sequence' && normalizedIndex + 1 < playlist.length) {
        playTrackPlaylistItem(trackKey, segment, normalizedIndex + 1, 0);
        return;
      }

      if (segment.playbackMode === 'loop' && playlist.length > 1) {
        playTrackPlaylistItem(trackKey, segment, normalizedIndex + 1, 0);
        return;
      }

      completeTrackSegment(trackKey, segment.id);
    };
    audio.load();

    if (autoPlay) {
      setIsBuffering(true);
      void playAudioWithAbortRetry(audio).then((result) => {
        if (result.status !== 'rejected') {
          return;
        }
        const error = result.reason;
        clearTrackRuntime(trackKey);
        const mediaErrorLabel = describeMediaError(audio);
        const reason = [
          error?.name || '',
          error?.message || '',
          mediaErrorLabel
        ].filter(Boolean).join(' / ');
        setPreviewMessage(
          `${TYPE_LABELS[segment.type]}「${item.title || '未命名素材'}」无法开始播放${reason ? `：${reason}` : ''}`
        );
        pausePreviewPlayback();
      });
    }
  }, [clearTrackRuntime, completeTrackSegment, describeMediaError, getAudioRef, getElapsedSeconds, pausePreviewPlayback, playAudioWithAbortRetry]);

  const syncTrackPlayback = useCallback((elapsed, options = {}) => {
    const autoPlay = options.autoPlay ?? isPlayingRef.current;
    PREVIEW_TRACK_KEYS.forEach((trackKey) => {
      const activeSegment = plan.segments.find((segment) => (
        segment.trackKey === trackKey &&
        elapsed >= segment.startSeconds &&
        elapsed < segment.endSeconds
      )) || null;
      const currentRuntime = runtimeRef.current[trackKey];

      if (!activeSegment) {
        if (currentRuntime.segmentId) {
          clearTrackRuntime(trackKey);
        }
        return;
      }

      const playbackPosition = resolveSegmentPlaybackPosition(
        activeSegment,
        Math.max(0, elapsed - activeSegment.startSeconds)
      );

      if (currentRuntime.segmentId === activeSegment.id && currentRuntime.completed) {
        return;
      }

      if (
        currentRuntime.segmentId !== activeSegment.id ||
        currentRuntime.itemIndex !== playbackPosition.itemIndex
      ) {
        playTrackPlaylistItem(trackKey, activeSegment, playbackPosition.itemIndex, playbackPosition.seekSeconds, autoPlay);
      }
    });
  }, [clearTrackRuntime, plan.segments, playTrackPlaylistItem, resolveSegmentPlaybackPosition]);

  const playPreparedAudiosSequentially = useCallback(async () => {
    const playableAudios = [backgroundAudioRef.current, voiceAudioRef.current].filter((audio) => audio.src);
    if (playableAudios.length === 0) {
      return [{ status: 'rejected', reason: new Error('NO_PREPARED_AUDIO') }];
    }

    const playbackResults = [];
    for (const audio of playableAudios) {
      playbackResults.push(await playAudioWithAbortRetry(audio));
    }
    return playbackResults;
  }, [playAudioWithAbortRetry]);

  const hasPendingTrackPlayback = useCallback((trackKey, elapsed) => {
    const trackSegments = plan.segments.filter((segment) => segment.trackKey === trackKey);
    const futureSegmentExists = trackSegments.some((segment) => elapsed < segment.startSeconds);
    if (futureSegmentExists) {
      return true;
    }

    const activeSegment = trackSegments.find((segment) => (
      elapsed >= segment.startSeconds &&
      elapsed < segment.endSeconds
    )) || null;

    if (!activeSegment) {
      return false;
    }

    const trackRuntime = runtimeRef.current[trackKey];
    return !(trackRuntime.segmentId === activeSegment.id && trackRuntime.completed);
  }, [plan.segments]);

  const startTicker = useCallback(() => {
    if (timerRef.current) {
      return;
    }

    timerRef.current = window.setInterval(() => {
      const elapsed = getElapsedSeconds();
      setElapsedSeconds(Math.min(elapsed, plan.sessionDuration));
      syncTrackPlayback(elapsed);

      const stillHasPlayableContent = PREVIEW_TRACK_KEYS.some((trackKey) => hasPendingTrackPlayback(trackKey, elapsed));
      if (!stillHasPlayableContent) {
        completePreviewPlayback();
        return;
      }

      if (elapsed >= plan.sessionDuration) {
        completePreviewPlayback();
      }
    }, 250);
  }, [completePreviewPlayback, getElapsedSeconds, hasPendingTrackPlayback, plan.sessionDuration, syncTrackPlayback]);

  const startPreviewPlayback = useCallback(async () => {
    const resumeElapsedSeconds = elapsedBeforePauseRef.current;
    startMsRef.current = performance.now() - resumeElapsedSeconds * 1000;
    syncTrackPlayback(resumeElapsedSeconds, { autoPlay: false });

    const playableAudios = [backgroundAudioRef.current, voiceAudioRef.current].filter((audio) => audio.src);
    if (playableAudios.length === 0) {
      setPreviewMessage('当前预览计划没有可播放的音频素材');
      pausePreviewPlayback();
      return;
    }

    isPlayingRef.current = true;
    setIsPlaying(true);
    setIsBuffering(true);
    const playbackResults = await playPreparedAudiosSequentially();
    if (playbackResults.some((result) => result.status === 'rejected')) {
      const firstRejected = playbackResults.find((result) => result.status === 'rejected');
      const rejectionReason = [
        firstRejected?.reason?.name || '',
        firstRejected?.reason?.message || ''
      ].filter(Boolean).join(' / ');
      setPreviewMessage(`播放启动失败，音频资源未能成功进入可播状态${rejectionReason ? `：${rejectionReason}` : ''}`);
      pausePreviewPlayback();
      return;
    }

    setPreviewMessage('试听已开始');
    setIsBuffering(false);
    startTicker();
  }, [pausePreviewPlayback, playPreparedAudiosSequentially, startTicker, syncTrackPlayback]);

  const handleTogglePreviewPlayback = async () => {
    if (isPlayingRef.current) {
      pausePreviewPlayback();
      return;
    }

    await startPreviewPlayback();
  };

  const handleSeek = async (nextValue) => {
    const wasPlaying = isPlayingRef.current;
    const nextElapsedSeconds = Math.max(0, Math.min(plan.sessionDuration, Number(nextValue) || 0));
    stopTicker();
    isPlayingRef.current = false;
    backgroundAudioRef.current.pause();
    voiceAudioRef.current.pause();
    elapsedBeforePauseRef.current = nextElapsedSeconds;
    startMsRef.current = null;
    setElapsedSeconds(nextElapsedSeconds);
    clearTrackRuntime('background');
    clearTrackRuntime('voice');
    syncTrackPlayback(nextElapsedSeconds, { autoPlay: false });
    setPreviewMessage(`已定位到 ${formatSeconds(Math.ceil(nextElapsedSeconds))}`);

    if (wasPlaying) {
      startMsRef.current = performance.now() - nextElapsedSeconds * 1000;
      isPlayingRef.current = true;
      setIsPlaying(true);
      setIsBuffering(true);
      const playbackResults = await playPreparedAudiosSequentially();
      if (playbackResults.some((result) => result.status === 'rejected')) {
        const firstRejected = playbackResults.find((result) => result.status === 'rejected');
        const rejectionReason = [
          firstRejected?.reason?.name || '',
          firstRejected?.reason?.message || ''
        ].filter(Boolean).join(' / ');
        setPreviewMessage(`定位后恢复播放失败${rejectionReason ? `：${rejectionReason}` : ''}`);
        pausePreviewPlayback();
        return;
      }
      startTicker();
      setPreviewMessage(`已跳转到 ${formatSeconds(Math.ceil(nextElapsedSeconds))} 并继续播放`);
    }
  };

  const handleScrubStart = () => {
    resumeAfterScrubRef.current = isPlayingRef.current;
    setIsScrubbing(true);
    if (isPlayingRef.current) {
      pausePreviewPlayback();
    }
  };

  const handleScrubEnd = async (nextValue) => {
    setIsScrubbing(false);
    const shouldResume = resumeAfterScrubRef.current;
    resumeAfterScrubRef.current = false;
    await handleSeek(nextValue);
    if (shouldResume) {
      await startPreviewPlayback();
    }
  };

  useEffect(() => () => {
    stopTicker();
    clearTrackRuntime('background');
    clearTrackRuntime('voice');
    plan.segments.forEach((segment) => {
      (segment.playlist || []).forEach((item) => {
        if (item.revokeAfterPreview && item.audioUrl?.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(item.audioUrl);
          } catch {}
        }
      });
    });
  }, [clearTrackRuntime, stopTicker]);

  const remainingSeconds = Math.max(0, Math.ceil(plan.sessionDuration - elapsedSeconds));

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ width: '520px', maxWidth: '94vw', backgroundColor: '#fff', borderRadius: '18px', padding: '24px', boxShadow: '0 24px 60px rgba(15,23,42,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '18px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>试听冥想音频</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>{plan.presetName}</div>
          </div>
          <button style={ghostBtnStyle} onClick={onClose}>关闭</button>
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', backgroundColor: '#f8fafc', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{formatSeconds(Math.ceil(elapsedSeconds))}</div>
            <div style={{ fontSize: '28px', fontWeight: '300', color: '#0f172a' }}>{formatSeconds(remainingSeconds)}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              {formatSeconds(plan.sessionDuration)}
            </div>
          </div>
          <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', marginBottom: '12px' }}>
            <div
              style={{
                width: `${plan.sessionDuration > 0 ? Math.min((elapsedSeconds / plan.sessionDuration) * 100, 100) : 0}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #22c55e, #06b6d4)'
              }}
            />
          </div>
          <input
            type="range"
            min="0"
            max={Math.max(1, Math.ceil(plan.sessionDuration))}
            step="1"
            value={Math.max(0, Math.min(Math.ceil(elapsedSeconds), Math.ceil(plan.sessionDuration)))}
            onMouseDown={handleScrubStart}
            onTouchStart={handleScrubStart}
            onChange={(event) => { void handleSeek(event.target.value); }}
            onMouseUp={(event) => { void handleScrubEnd(event.currentTarget.value); }}
            onTouchEnd={(event) => { void handleScrubEnd(event.currentTarget.value); }}
            style={{ width: '100%', marginBottom: '12px' }}
          />
          <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
            {isBuffering && isPlaying
              ? '缓冲中...'
              : isScrubbing
                ? '拖动中，松手后将从新位置继续播放。'
                : previewMessage || '按当前冥想库、音频库和时间轴配置生成 Final Track 预览。'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button style={primaryBtnStyle} onClick={() => { void handleTogglePreviewPlayback(); }}>
            {isPlaying ? '暂停试听' : '开始试听'}
          </button>
          <button
            style={ghostBtnStyle}
            onClick={() => {
              completePreviewPlayback();
              elapsedBeforePauseRef.current = 0;
              setElapsedSeconds(0);
            }}
          >
            重置
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
          {plan.segments.map((segment) => (
            <div key={segment.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', backgroundColor: '#fff' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                {TYPE_LABELS[segment.type]}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                {formatSeconds(segment.startSeconds)} - {formatSeconds(segment.endSeconds)} · {segment.playbackMode === 'loop' ? '循环铺满' : '顺序拼接'}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                本段素材数：{Array.isArray(segment.playlist) ? segment.playlist.length : 0}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── AudioLibrarySection ─────────────────────────────────────────────────────

const AudioGroupSection = ({ group, items, onSaveItem, onDeleteItem, onRenameGroup, onQueueTranscodeJob }) => {
  const [expanded, setExpanded] = useState(false);
  const [addMode, setAddMode] = useState(null); // 'file' | 'tts'
  const [editingId, setEditingId] = useState(null);
  const [groupName, setGroupName] = useState(group.name || '');
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');

  // File upload form state
  const [fileForm, setFileForm] = useState({ title: '', file: null, duration: '' });
  const [fileUploading, setFileUploading] = useState(false);
  const [fileError, setFileError] = useState('');

  // TTS form state
  const [ttsForm, setTtsForm] = useState({ ttsText: '', isSSML: false });
  const [ttsSubmitting, setTtsSubmitting] = useState(false);
  const [ttsError, setTtsError] = useState('');

  // Edit form state
  const [editForm, setEditForm] = useState({});

  // Audio playback state
  const audioRef = React.useRef(null);
  const manualAudioInputRef = React.useRef(null);
  const pendingManualUploadItemRef = React.useRef(null);
  const [playingId, setPlayingId] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const [uploadingAudioId, setUploadingAudioId] = useState(null);
  const [itemFeedbackMap, setItemFeedbackMap] = useState({});

  const groupItems = items.filter((item) => item.groupId === group.id);

  useEffect(() => {
    setGroupName(group.name || '');
  }, [group.id, group.name]);

  const handleRenameGroup = async () => {
    const nextName = groupName.trim();
    if (!nextName) {
      setGroupError('请填写音频组名称');
      return;
    }

    if (nextName === group.name) {
      setGroupError('');
      return;
    }

    setRenamingGroup(true);
    setGroupError('');
    try {
      await onRenameGroup(group.id, nextName);
    } catch (error) {
      setGroupError(error.message || '音频组名称保存失败');
    } finally {
      setRenamingGroup(false);
    }
  };

  const handleFileUpload = async () => {
    setFileError('');
    if (!fileForm.title.trim()) { setFileError('请填写标题'); return; }
    if (!fileForm.file) { setFileError('请选择音频文件'); return; }
    setFileUploading(true);
    try {
      const itemId = generateId();
      const cloudPath = `meditation-audio-raw/${group.type}/${group.id}/${itemId}-${fileForm.file.name}`;
      const { fileId, audioUrl } = await uploadAudioFile({ file: fileForm.file, cloudPath });
      const transcodeProfile = resolveMeditationAudioTranscodeProfile({ type: group.type, isTts: false });
      const targetCloudPath = `meditation-audio/${group.type}/${group.id}/${itemId}.opus`;
      const queuedItem = {
        id: itemId,
        type: group.type,
        groupId: group.id,
        title: fileForm.title.trim(),
        fileId: '',
        audioUrl: '',
        sourceFileId: fileId,
        sourceAudioUrl: audioUrl,
        sourceCloudPath: cloudPath,
        sourceFileName: fileForm.file.name,
        duration: 0,
        ttsText: '',
        transcodeStatus: MEDITATION_AUDIO_TRANSCODE_STATUS.queued,
        transcodeJobId: '',
        transcodeError: '',
        loudnessProfile: transcodeProfile,
        transcodeUpdatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      const job = await onQueueTranscodeJob({
        itemId,
        libraryType: group.type,
        groupId: group.id,
        sourceFileId: fileId,
        sourceAudioUrl: audioUrl,
        sourceCloudPath: cloudPath,
        sourceFileName: fileForm.file.name,
        targetCloudPath,
        transcodeProfile
      });
      const newItem = {
        ...queuedItem,
        transcodeJobId: job.id || ''
      };
      await onSaveItem(newItem, null);
      setFileForm({ title: '', file: null, duration: '' });
      setAddMode(null);
    } catch (err) {
      setFileError(err.message || '上传失败');
    } finally {
      setFileUploading(false);
    }
  };

  const handleTtsSubmit = async () => {
    setTtsError('');
    if (!ttsForm.ttsText.trim()) { setTtsError('请填写朗读文本'); return; }
    setTtsSubmitting(true);
    try {
      const text = normalizeStoredTtsText(ttsForm.ttsText, ttsForm.isSSML);
      const newItem = {
        id: generateId(),
        type: group.type,
        groupId: group.id,
        title: text.replace(/<[^>]+>/g, '').slice(0, 20),
        fileId: '',
        audioUrl: '',
        duration: 0,
        ttsText: text,
        isSSML: Boolean(ttsForm.isSSML),
        createdAt: new Date().toISOString()
      };
      await onSaveItem(newItem, null);
      setTtsForm({ ttsText: '', isSSML: false });
      setAddMode(null);
    } catch (err) {
      setTtsError(err.message || '提交失败');
    } finally {
      setTtsSubmitting(false);
    }
  };

  const handleGenerateAudio = async (item) => {
    setGeneratingId(item.id);
    setItemFeedbackMap((currentMap) => ({
      ...currentMap,
      [item.id]: null
    }));
    try {
      const blobUrl = await synthesizeSpeech(item.ttsText, { isSSML: Boolean(item.isSSML) });
      const file = await blobUrlToFile(blobUrl, `${item.id}.mp3`);
      const cloudPath = `meditation-audio-raw/${item.type}/${item.groupId || group.id}/${item.id}.mp3`;
      const { fileId, audioUrl } = await uploadAudioFile({ file, cloudPath });
      const transcodeProfile = resolveMeditationAudioTranscodeProfile({ type: item.type, isTts: true });
      const targetCloudPath = `meditation-audio/${item.type}/${item.groupId || group.id}/${item.id}.opus`;
      const job = await onQueueTranscodeJob({
        itemId: item.id,
        libraryType: item.type,
        groupId: item.groupId || group.id,
        sourceFileId: fileId,
        sourceAudioUrl: audioUrl,
        sourceCloudPath: cloudPath,
        sourceFileName: file.name,
        targetCloudPath,
        transcodeProfile,
        ttsText: item.ttsText || ''
      });
      await onSaveItem({
        ...item,
        fileId: item.fileId || '',
        audioUrl: item.audioUrl || '',
        sourceFileId: fileId,
        sourceAudioUrl: audioUrl,
        sourceCloudPath: cloudPath,
        sourceFileName: file.name,
        transcodeStatus: MEDITATION_AUDIO_TRANSCODE_STATUS.queued,
        transcodeJobId: job.id || '',
        transcodeError: '',
        loudnessProfile: transcodeProfile,
        transcodeUpdatedAt: new Date().toISOString()
      }, item.id);
      URL.revokeObjectURL(blobUrl);
      setItemFeedbackMap((currentMap) => ({
        ...currentMap,
        [item.id]: {
          type: 'success',
          text: '音频已生成并进入转码队列。'
        }
      }));
    } catch (err) {
      setItemFeedbackMap((currentMap) => ({
        ...currentMap,
        [item.id]: {
          type: 'error',
          text: err.userMessage || err.message || '音频生成失败。'
        }
      }));
    } finally {
      setGeneratingId(null);
    }
  };

  const handleOpenManualUpload = (item) => {
    pendingManualUploadItemRef.current = item;
    manualAudioInputRef.current?.click();
  };

  const handleManualAudioSelected = async (event) => {
    const file = event.target.files?.[0] || null;
    const targetItem = pendingManualUploadItemRef.current;
    event.target.value = '';

    if (!file || !targetItem) {
      pendingManualUploadItemRef.current = null;
      return;
    }

    setUploadingAudioId(targetItem.id);
    setItemFeedbackMap((currentMap) => ({
      ...currentMap,
      [targetItem.id]: null
    }));

    try {
      const cloudPath = `meditation-audio-raw/${targetItem.type}/${targetItem.groupId || group.id}/${targetItem.id}-${file.name}`;
      const { fileId, audioUrl } = await uploadAudioFile({ file, cloudPath });
      const transcodeProfile = resolveMeditationAudioTranscodeProfile({
        type: targetItem.type,
        isTts: Boolean(targetItem.ttsText)
      });
      const targetCloudPath = `meditation-audio/${targetItem.type}/${targetItem.groupId || group.id}/${targetItem.id}.opus`;
      const job = await onQueueTranscodeJob({
        itemId: targetItem.id,
        libraryType: targetItem.type,
        groupId: targetItem.groupId || group.id,
        sourceFileId: fileId,
        sourceAudioUrl: audioUrl,
        sourceCloudPath: cloudPath,
        sourceFileName: file.name,
        targetCloudPath,
        transcodeProfile,
        ttsText: targetItem.ttsText || ''
      });
      await onSaveItem({
        ...targetItem,
        sourceFileId: fileId,
        sourceAudioUrl: audioUrl,
        sourceCloudPath: cloudPath,
        sourceFileName: file.name,
        transcodeStatus: MEDITATION_AUDIO_TRANSCODE_STATUS.queued,
        transcodeJobId: job.id || '',
        transcodeError: '',
        loudnessProfile: transcodeProfile,
        transcodeUpdatedAt: new Date().toISOString()
      }, targetItem.id);
      setItemFeedbackMap((currentMap) => ({
        ...currentMap,
        [targetItem.id]: {
          type: 'success',
          text: '音频已上传并进入转码队列。'
        }
      }));
    } catch (err) {
      setItemFeedbackMap((currentMap) => ({
        ...currentMap,
        [targetItem.id]: {
          type: 'error',
          text: err.message || '音频上传失败。'
        }
      }));
    } finally {
      pendingManualUploadItemRef.current = null;
      setUploadingAudioId(null);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({ title: item.title, duration: String(item.duration || ''), ttsText: item.ttsText || '', isSSML: Boolean(item.isSSML) });
  };

  const handleSaveEdit = async (item) => {
    const isTts = !!item.ttsText;
    const normalizedTtsText = normalizeStoredTtsText(editForm.ttsText, editForm.isSSML);
    const title = isTts ? normalizedTtsText.replace(/<[^>]+>/g, '').slice(0, 20) : editForm.title.trim();
    await onSaveItem({
      ...item,
      title,
      duration: Number(editForm.duration) || 0,
      ttsText: normalizedTtsText,
      isSSML: Boolean(editForm.isSSML) || isSsmlText(normalizedTtsText)
    }, item.id);
    setEditingId(null);
  };

  const handleDeleteItem = async (item) => {
    const shouldDelete = window.confirm(`确定删除音频片段「${item.title || '未命名音频'}」吗？此操作不可撤销。`);
    if (!shouldDelete) {
      return;
    }

    await onDeleteItem(item.id);
  };

  const handlePlayToggle = async (item) => {
    if (playingId === item.id) {
      audioRef.current && audioRef.current.pause();
      setPlayingId(null);
    } else {
      try {
        const nextAudioUrl = item.fileId
          ? await getAudioTempUrl(item.fileId) || item.audioUrl || ''
          : item.audioUrl || '';

        if (!nextAudioUrl) {
          throw new Error('缺少可播放的音频地址');
        }

        if (audioRef.current) {
          audioRef.current.pause();
        }
        audioRef.current = new Audio(nextAudioUrl);
        audioRef.current.onended = () => setPlayingId(null);
        await audioRef.current.play();
        setPlayingId(item.id);
        setItemFeedbackMap((currentMap) => ({
          ...currentMap,
          [item.id]: null
        }));
      } catch (err) {
        setPlayingId(null);
        setItemFeedbackMap((currentMap) => ({
          ...currentMap,
          [item.id]: {
            type: 'error',
            text: err.message || '音频播放失败。'
          }
        }));
      }
    }
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px' }}>
      {/* Header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', backgroundColor: '#f8fafc', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{group.name}</span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>{TYPE_LABELS[group.type]}</span>
          <span style={{ fontSize: '12px', color: '#94a3b8', backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: '10px' }}>{groupItems.length} 条</span>
        </div>
        <span style={{ color: '#94a3b8', fontSize: '12px' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}>
              <label style={labelStyle}>音频组名称</label>
              <input
                style={inputStyle}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="输入音频组名称"
              />
            </div>
            <button style={ghostBtnStyle} onClick={handleRenameGroup} disabled={renamingGroup}>
              {renamingGroup ? '保存中...' : '保存组名'}
            </button>
          </div>
          {groupError && <div style={{ color: '#dc2626', fontSize: '12px', marginBottom: '10px' }}>{groupError}</div>}
          <input
            ref={manualAudioInputRef}
            type="file"
            accept="audio/*"
            onChange={handleManualAudioSelected}
            style={{ display: 'none' }}
          />
          {/* Item list */}
          {groupItems.length === 0 && (
            <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '12px' }}>暂无音频，请添加</div>
          )}
          {groupItems.map((item) => (
            <div key={item.id} style={{ border: '1px solid #f1f5f9', borderRadius: '8px', padding: '12px', marginBottom: '8px', backgroundColor: '#fafafa' }}>
              {editingId === item.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {!item.ttsText && (
                    <div>
                      <label style={labelStyle}>标题</label>
                      <input style={inputStyle} value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} />
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>时长（秒）</label>
                    <input style={inputStyle} type="number" value={editForm.duration} onChange={(e) => setEditForm((f) => ({ ...f, duration: e.target.value }))} />
                  </div>
                  {!!item.ttsText && (
                    <div>
                      <label style={labelStyle}>朗读文本（标题自动取前20字）</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#475569', cursor: 'pointer', marginBottom: '6px' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(editForm.isSSML)}
                          onChange={(e) => setEditForm((f) => ({ ...f, isSSML: e.target.checked }))}
                        />
                        SSML 格式
                      </label>
                      <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={editForm.ttsText} onChange={(e) => setEditForm((f) => ({ ...f, ttsText: e.target.value }))} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={primaryBtnStyle} onClick={() => handleSaveEdit(item)}>保存</button>
                    <button style={ghostBtnStyle} onClick={() => setEditingId(null)}>取消</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{item.title}</div>
                      {item.duration > 0 && (
                        <span style={{ fontSize: '11px', color: '#fff', backgroundColor: '#6366f1', borderRadius: '10px', padding: '1px 7px', fontWeight: '600', flexShrink: 0 }}>
                          {formatSeconds(item.duration)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                      {item.ttsText ? 'TTS文本' : '音频文件'}
                    </div>
                    {item.transcodeStatus && item.transcodeStatus !== MEDITATION_AUDIO_TRANSCODE_STATUS.idle && (
                      <div style={{ fontSize: '11px', color: item.transcodeStatus === MEDITATION_AUDIO_TRANSCODE_STATUS.failed ? '#b91c1c' : '#6366f1', marginTop: '4px' }}>
                        {item.transcodeStatus === MEDITATION_AUDIO_TRANSCODE_STATUS.queued && '转码排队中'}
                        {item.transcodeStatus === MEDITATION_AUDIO_TRANSCODE_STATUS.processing && '转码处理中'}
                        {item.transcodeStatus === MEDITATION_AUDIO_TRANSCODE_STATUS.succeeded && '转码完成'}
                        {item.transcodeStatus === MEDITATION_AUDIO_TRANSCODE_STATUS.failed && `转码失败${item.transcodeError ? `：${item.transcodeError}` : ''}`}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {item.ttsText && !item.audioUrl && (
                      <>
                        <button
                          style={{ padding: '4px 10px', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '12px', cursor: generatingId === item.id ? 'wait' : 'pointer', backgroundColor: '#f0fdf4', color: '#15803d' }}
                          onClick={() => handleGenerateAudio(item)}
                          disabled={!!generatingId || !!uploadingAudioId}
                          title="调用腾讯TTS生成音频并上传"
                        >
                          {generatingId === item.id ? '生成中...' : '⚡ 生成音频'}
                        </button>
                        <button
                          style={ghostBtnStyle}
                          onClick={() => handleOpenManualUpload(item)}
                          disabled={!!generatingId || !!uploadingAudioId}
                          title="手动上传已有音频文件"
                        >
                          {uploadingAudioId === item.id ? '上传中...' : '补传音频'}
                        </button>
                      </>
                    )}
                    {item.audioUrl && (
                      <button
                        style={{ padding: '4px 10px', border: '1px solid #c7d2fe', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', backgroundColor: playingId === item.id ? '#e0e7ff' : '#fff', color: '#4f46e5' }}
                        onClick={() => handlePlayToggle(item)}
                        title={playingId === item.id ? '暂停' : '试听'}
                      >
                        {playingId === item.id ? '⏸' : '▶'}
                      </button>
                    )}
                    <button style={ghostBtnStyle} onClick={() => startEdit(item)}>编辑</button>
                    <button style={dangerBtnStyle} onClick={() => handleDeleteItem(item)}>删除</button>
                  </div>
                </div>
              )}
              {itemFeedbackMap[item.id]?.text && (
                <div
                  style={{
                    marginTop: '10px',
                    fontSize: '12px',
                    lineHeight: 1.6,
                    color: itemFeedbackMap[item.id].type === 'error' ? '#b91c1c' : '#166534'
                  }}
                >
                  {itemFeedbackMap[item.id].text}
                </div>
              )}
            </div>
          ))}

          {/* Add buttons */}
          {addMode === null && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button style={ghostBtnStyle} onClick={() => setAddMode('file')}>+ 上传音频文件</button>
              <button style={ghostBtnStyle} onClick={() => setAddMode('tts')}>+ AI TTS 文本</button>
            </div>
          )}

          {/* File upload form */}
          {addMode === 'file' && (
            <div style={{ border: '1px dashed #c7d2fe', borderRadius: '8px', padding: '14px', marginTop: '10px', backgroundColor: '#f5f3ff' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>标题 *</label>
                  <input style={inputStyle} value={fileForm.title} onChange={(e) => setFileForm((f) => ({ ...f, title: e.target.value }))} placeholder="输入音频标题" />
                </div>
                <div>
                  <label style={labelStyle}>音频文件 *</label>
                  <input
                    type="file"
                    accept="audio/*"
                    style={{ fontSize: '13px', color: '#475569' }}
                    onChange={(e) => setFileForm((f) => ({ ...f, file: e.target.files[0] || null }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>时长（秒，可选）</label>
                  <input style={inputStyle} type="number" value={fileForm.duration} onChange={(e) => setFileForm((f) => ({ ...f, duration: e.target.value }))} placeholder="0" />
                </div>
                {fileError && <div style={{ color: '#dc2626', fontSize: '12px' }}>{fileError}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={primaryBtnStyle} onClick={handleFileUpload} disabled={fileUploading}>
                    {fileUploading ? '上传中...' : '上传'}
                  </button>
                  <button style={ghostBtnStyle} onClick={() => { setAddMode(null); setFileError(''); }}>取消</button>
                </div>
              </div>
            </div>
          )}

          {/* TTS form */}
          {addMode === 'tts' && (
            <div style={{ border: '1px dashed #a7f3d0', borderRadius: '8px', padding: '14px', marginTop: '10px', backgroundColor: '#f0fdf4' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={labelStyle}>朗读文本 *（标题自动取前20字）</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={ttsForm.isSSML}
                      onChange={(e) => setTtsForm((f) => ({ ...f, isSSML: e.target.checked, ttsText: e.target.checked ? '<speak>\n  \n</speak>' : '' }))}
                    />
                    SSML 格式
                  </label>
                </div>
                <textarea
                  style={{ ...inputStyle, minHeight: ttsForm.isSSML ? '120px' : '80px', resize: 'vertical', fontFamily: ttsForm.isSSML ? 'monospace' : 'inherit' }}
                  value={ttsForm.ttsText}
                  onChange={(e) => setTtsForm((f) => ({ ...f, ttsText: e.target.value }))}
                  placeholder={ttsForm.isSSML
                    ? '<speak>\n  你好，欢迎开始今天的冥想练习。\n  <break time="1s"/>\n  请闭上眼睛。\n</speak>'
                    : '输入需要 AI TTS 转换的文字内容'}
                />
                {ttsError && <div style={{ color: '#dc2626', fontSize: '12px' }}>{ttsError}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={primaryBtnStyle} onClick={handleTtsSubmit} disabled={ttsSubmitting}>
                    {ttsSubmitting ? '提交中...' : '保存'}
                  </button>
                  <button style={ghostBtnStyle} onClick={() => { setAddMode(null); setTtsError(''); }}>取消</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AudioLibrarySection = ({ type, groups, items, onSaveItem, onDeleteItem, onRenameGroup, onQueueTranscodeJob }) => {
  const [expanded, setExpanded] = useState(false);
  const typeGroups = getTypeGroups(groups, type);
  const typeItems = items.filter((item) => item.type === type);

  return (
    <div style={{ border: '1px solid #cbd5e1', borderRadius: '14px', overflow: 'hidden', marginBottom: '14px' }}>
      <div
        onClick={() => setExpanded((value) => !value)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', backgroundColor: '#f8fafc', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{TYPE_LABELS[type]}</span>
          <span style={{ fontSize: '12px', color: '#94a3b8', backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: '10px' }}>
            {typeGroups.length} 组 / {typeItems.length} 条音频
          </span>
        </div>
        <span style={{ color: '#94a3b8', fontSize: '12px' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
            该音频库下的音频按音频组组织。音频组顺序固定，名称可调整。
          </div>
          {typeGroups.map((group) => (
            <AudioGroupSection
              key={group.id}
              group={group}
              items={items}
              onSaveItem={onSaveItem}
              onDeleteItem={onDeleteItem}
              onRenameGroup={onRenameGroup}
              onQueueTranscodeJob={onQueueTranscodeJob}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── AudioLibraryTab ──────────────────────────────────────────────────────────

const AudioLibraryTab = ({ library, saving, onUpdate, onQueueTranscodeJob, onRefresh }) => {
  const [refreshingStatuses, setRefreshingStatuses] = useState(false);
  const handleSaveItem = useCallback(async (item, replacingId) => {
    const currentItems = library.items || [];
    let nextItems;
    if (replacingId) {
      nextItems = currentItems.map((i) => (i.id === replacingId ? item : i));
    } else {
      nextItems = [...currentItems, item];
    }
    await onUpdate({ ...library, items: nextItems });
  }, [library, onUpdate]);

  const handleDeleteItem = useCallback(async (itemId) => {
    const nextItems = (library.items || []).filter((i) => i.id !== itemId);
    await onUpdate({ ...library, items: nextItems });
  }, [library, onUpdate]);

  const handleRenameGroup = useCallback(async (groupId, nextName) => {
    const normalizedName = String(nextName || '').trim();
    if (!normalizedName) {
      return;
    }

    const nextGroups = (library.groups || []).map((group) => (
      group.id === groupId ? { ...group, name: normalizedName } : group
    ));
    await onUpdate({ ...library, groups: nextGroups });
  }, [library, onUpdate]);

  const transcodeCounts = (library.items || []).reduce((summary, item) => {
    const status = item.transcodeStatus || MEDITATION_AUDIO_TRANSCODE_STATUS.idle;
    if (summary[status] !== undefined) {
      summary[status] += 1;
    }
    return summary;
  }, {
    queued: 0,
    processing: 0,
    succeeded: 0,
    failed: 0
  });

  const hasPendingTranscodes = transcodeCounts.queued > 0 || transcodeCounts.processing > 0;

  const handleRefreshStatuses = useCallback(async () => {
    if (!onRefresh) {
      return;
    }

    setRefreshingStatuses(true);
    try {
      await onRefresh();
    } finally {
      setRefreshingStatuses(false);
    }
  }, [onRefresh]);

  useEffect(() => {
    if (!hasPendingTranscodes || !onRefresh) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void onRefresh();
    }, 8000);

    return () => window.clearInterval(intervalId);
  }, [hasPendingTranscodes, onRefresh]);

  return (
    <div>
      <div style={sectionTitleStyle}>六大音频库管理</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '14px',
          padding: '12px 14px',
          borderRadius: '12px',
          backgroundColor: hasPendingTranscodes ? '#eff6ff' : '#f8fafc',
          border: hasPendingTranscodes ? '1px solid #bfdbfe' : '1px solid #e2e8f0'
        }}
      >
        <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.7 }}>
          转码状态：排队中 {transcodeCounts.queued} · 处理中 {transcodeCounts.processing} · 已完成 {transcodeCounts.succeeded} · 失败 {transcodeCounts.failed}
        </div>
        {onRefresh && (
          <button style={ghostBtnStyle} onClick={() => { void handleRefreshStatuses(); }} disabled={refreshingStatuses}>
            {refreshingStatuses ? '刷新中...' : '刷新状态'}
          </button>
        )}
      </div>
      {saving && <div style={{ color: '#6366f1', fontSize: '12px', marginBottom: '12px' }}>保存中...</div>}
      {MEDITATION_AUDIO_LIBRARY_TYPES.map((type) => (
        <AudioLibrarySection
          key={type}
          type={type}
          groups={library.groups || []}
          items={library.items || []}
          onSaveItem={handleSaveItem}
          onDeleteItem={handleDeleteItem}
          onRenameGroup={handleRenameGroup}
          onQueueTranscodeJob={onQueueTranscodeJob}
        />
      ))}
    </div>
  );
};

// ─── MeditationPresetsTab ─────────────────────────────────────────────────────

const SECTION_LABELS = {
  bowl: '颂钵',
  greeting: '问候',
  nature: '自然',
  breath: '呼吸',
  quote: '心语',
  goodbye: '告别'
};

const PresetGroupPicker = ({ group, selectedIds, audioItems, onChange }) => {
  const groupItems = audioItems.filter((item) => item.groupId === group.id);
  const [showPicker, setShowPicker] = useState(false);

  const toggleItem = (itemId) => {
    const next = selectedIds.includes(itemId)
      ? selectedIds.filter((id) => id !== itemId)
      : [...selectedIds, itemId];
    onChange(next);
  };

  const selectedItems = selectedIds.map((id) => groupItems.find((item) => item.id === id)).filter(Boolean);

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>{group.name}</span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{TYPE_LABELS[group.type]}</span>
        </div>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          {selectedIds.length === 0 ? '未选择' : selectedIds.length === 1 ? '固定' : `${selectedIds.length}条随机`}
        </span>
      </div>

      {/* Selected items display */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
        {selectedItems.map((item) => (
          <span
            key={item.id}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '3px 10px', borderRadius: '14px', fontSize: '12px',
              backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe'
            }}
          >
            {item.title}
            <span
              onClick={() => onChange(selectedIds.filter((id) => id !== item.id))}
              style={{ cursor: 'pointer', color: '#93c5fd', fontWeight: '600' }}
            >×</span>
          </span>
        ))}
      </div>

      <button style={ghostBtnStyle} onClick={() => setShowPicker((v) => !v)}>
        {showPicker ? '收起' : '+ 选择音频'}
      </button>

      {showPicker && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginTop: '6px', maxHeight: '200px', overflowY: 'auto', backgroundColor: '#fafafa' }}>
          {groupItems.length === 0 && (
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>该音频组暂无音频，请先在音频库添加</div>
          )}
          {groupItems.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <label
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  cursor: 'pointer', borderRadius: '6px',
                  backgroundColor: checked ? '#eff6ff' : 'transparent'
                }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleItem(item.id)} />
                <span style={{ fontSize: '13px', color: '#1e293b' }}>{item.title}</span>
                {item.duration > 0 && (
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{formatSeconds(item.duration)}</span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

const MeditationPresetsTab = ({ meditationLibrary, audioLibrary, compositionSettings, saving, onUpdate }) => {
  const meditations = meditationLibrary.meditations || [];
  const audioGroups = sortAudioGroups(audioLibrary.groups || []);
  const audioItems = audioLibrary.items || [];
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', groupSelections: {} });
  const [previewPlan, setPreviewPlan] = useState(null);
  const [previewingId, setPreviewingId] = useState(null);
  const [previewError, setPreviewError] = useState('');

  const startCreate = () => {
    setEditingId('__new__');
    setEditForm({
      name: '',
      groupSelections: createEmptyGroupSelections(audioGroups)
    });
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      groupSelections: normalizeGroupSelections(audioGroups, item.groupSelections || {})
    });
  };

  const handleSave = async () => {
    if (!editForm.name.trim()) return;
    const nextGroupSelections = normalizeGroupSelections(audioGroups, editForm.groupSelections);
    const nextSections = aggregateSectionsFromSelections(audioGroups, nextGroupSelections);
    let nextMeditations;
    if (editingId === '__new__') {
      nextMeditations = [
        ...meditations,
        {
          id: generateId(),
          name: editForm.name.trim(),
          groupSelections: nextGroupSelections,
          sections: nextSections
        }
      ];
    } else {
      nextMeditations = meditations.map((m) =>
        m.id === editingId
          ? { ...m, name: editForm.name.trim(), groupSelections: nextGroupSelections, sections: nextSections }
          : m
      );
    }
    await onUpdate({ ...meditationLibrary, meditations: nextMeditations });
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    const nextMeditations = meditations.filter((m) => m.id !== id);
    await onUpdate({ ...meditationLibrary, meditations: nextMeditations });
    setEditingId(null);
  };

  const updateGroupSelection = (groupId, ids) => {
    setEditForm((form) => ({
      ...form,
      groupSelections: {
        ...form.groupSelections,
        [groupId]: ids
      }
    }));
  };

  const handlePreview = async (item) => {
    setPreviewingId(item.id);
    setPreviewError('');
    try {
      const plan = await buildMeditationPresetPreviewPlan({
        preset: item,
        audioLibrary,
        compositionSettings
      });

      if (plan?.previewBlockedReason) {
        throw new Error(plan.previewBlockedReason);
      }

      if (!plan) {
        throw new Error('当前冥想缺少可试听的时间轴或音频配置');
      }

      setPreviewPlan(plan);
    } catch (error) {
      setPreviewError(error.message || '冥想试听生成失败');
    } finally {
      setPreviewingId(null);
    }
  };

  const getSummary = (item) => {
    return audioGroups
      .filter((group) => (item.groupSelections?.[group.id] || []).length > 0)
      .map((group) => {
        const count = item.groupSelections[group.id].length;
        return `${SECTION_LABELS[group.type]}/${group.name}${count > 1 ? `×${count}` : ''}`;
      })
      .join(' · ');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={sectionTitleStyle}>冥想库管理</div>
        {saving && <span style={{ fontSize: '12px', color: '#6366f1' }}>保存中...</span>}
      </div>
      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '18px' }}>
        每条冥想由六类音频组合而成。选择多条音频时，运行时随机选取一条。
      </div>
      {previewError && (
        <div style={{ color: '#b91c1c', fontSize: '12px', marginBottom: '12px' }}>
          {previewError}
        </div>
      )}

      {/* Preset list */}
      {meditations.length === 0 && !editingId && (
        <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>暂无冥想，请添加</div>
      )}
      {meditations.map((item) => (
        <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', marginBottom: '10px', backgroundColor: editingId === item.id ? '#f8fafc' : '#fff' }}>
          {editingId === item.id ? (
            <div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>冥想名称</label>
                <input
                  style={inputStyle}
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="输入冥想名称"
                />
              </div>
              {MEDITATION_AUDIO_LIBRARY_TYPES.map((type) => (
                <div key={type} style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
                    {TYPE_LABELS[type]}
                  </div>
                  {getTypeGroups(audioGroups, type).map((group) => (
                    <PresetGroupPicker
                      key={group.id}
                      group={group}
                      selectedIds={editForm.groupSelections[group.id] || []}
                      audioItems={audioItems}
                      onChange={(ids) => updateGroupSelection(group.id, ids)}
                    />
                  ))}
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button style={primaryBtnStyle} onClick={handleSave}>保存</button>
                <button style={dangerBtnStyle} onClick={() => handleDelete(item.id)}>删除</button>
                <button style={ghostBtnStyle} onClick={() => setEditingId(null)}>取消</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b', marginBottom: '3px' }}>{item.name}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{getSummary(item) || '未配置音频'}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  style={ghostBtnStyle}
                  onClick={() => handlePreview(item)}
                  disabled={previewingId === item.id}
                >
                  {previewingId === item.id ? '生成中...' : '试听'}
                </button>
                <button style={ghostBtnStyle} onClick={() => startEdit(item)}>编辑</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* New preset form */}
      {editingId === '__new__' && (
        <div style={{ border: '1px dashed #c7d2fe', borderRadius: '10px', padding: '16px', backgroundColor: '#f5f3ff', marginBottom: '10px' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>冥想名称</label>
            <input
              style={inputStyle}
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="输入冥想名称"
            />
          </div>
          {MEDITATION_AUDIO_LIBRARY_TYPES.map((type) => (
            <div key={type} style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
                {TYPE_LABELS[type]}
              </div>
              {getTypeGroups(audioGroups, type).map((group) => (
                <PresetGroupPicker
                  key={group.id}
                  group={group}
                  selectedIds={editForm.groupSelections[group.id] || []}
                  audioItems={audioItems}
                  onChange={(ids) => updateGroupSelection(group.id, ids)}
                />
              ))}
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button style={primaryBtnStyle} onClick={handleSave}>添加</button>
            <button style={ghostBtnStyle} onClick={() => setEditingId(null)}>取消</button>
          </div>
        </div>
      )}

      {!editingId && (
        <button style={{ ...ghostBtnStyle, marginTop: '8px' }} onClick={startCreate}>+ 新增冥想</button>
      )}

      {previewPlan && (
        <MeditationPreviewDialog
          plan={previewPlan}
          onClose={() => setPreviewPlan(null)}
        />
      )}
    </div>
  );
};

// ─── CompositionTab ───────────────────────────────────────────────────────────

const TOTAL_SECONDS = 900; // 15 minutes
const TRACK_HEIGHT = 110;
const TRACK_GAP = 6;
const LABEL_WIDTH = 68;
const RULER_HEIGHT = 24;
const TRACK_INSET = 8;
const SLOT_GAP = 4;

const TRACKS = [
  {
    key: 'background',
    label: '背景音轨',
    color: '#0f766e',
    bg: '#ecfeff',
    border: '#99f6e4',
    types: ['bowl', 'nature']
  },
  {
    key: 'voice',
    label: '人声音轨',
    color: '#9a3412',
    bg: '#fff7ed',
    border: '#fdba74',
    types: ['greeting', 'breath', 'quote', 'goodbye']
  }
];

const getTrackForType = (type) => TRACKS.find((track) => track.types.includes(type)) || TRACKS[0];

const getTrackTypes = (trackKey) => TRACKS.find((track) => track.key === trackKey)?.types || [];

const getTrackKeyForType = (type) => getTrackForType(type).key;

const getTrackSlotMetrics = (track) => {
  const slotCount = Math.max(track.types.length, 1);
  const availableHeight = TRACK_HEIGHT - TRACK_INSET * 2;
  const slotHeight = (availableHeight - SLOT_GAP * (slotCount - 1)) / slotCount;

  return {
    slotCount,
    slotHeight
  };
};

const assignTracksToSegments = (segments) => {
  const sorted = [...segments].sort((a, b) => a.startSeconds - b.startSeconds);
  return sorted.map((seg) => {
    const track = getTrackForType(seg.type);
    const trackIdx = TRACKS.findIndex((item) => item.key === track.key);
    const slotIdx = track.types.indexOf(seg.type);

    return { seg, trackIdx, slotIdx };
  });
};

// Ruler tick marks: every minute label, minor ticks every 30s
const RULER_TICKS = Array.from({ length: 16 }, (_, i) => i * 60); // 0,60,120,...,900

const CompositionTab = ({ settings, library, saving, onUpdate }) => {
  const segments = settings.segments || [];
  const [selectedId, setSelectedId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [addMode, setAddMode] = useState(false);
  const [addForm, setAddForm] = useState({
    trackKey: 'background',
    type: 'bowl',
    startSeconds: '0',
    durationSeconds: '30'
  });

  const itemsByType = useCallback((type) => (library.items || []).filter((i) => i.type === type), [library]);

  const assigned = assignTracksToSegments(segments);
  const selectedSeg = segments.find((s) => s.id === selectedId) || null;

  const openEdit = (seg) => {
    setSelectedId(seg.id);
    setAddMode(false);
    setEditForm({
      type: seg.type,
      startSeconds: String(seg.startSeconds),
      durationSeconds: String(seg.durationSeconds)
    });
  };

  const closePanel = () => { setSelectedId(null); setAddMode(false); };

  const handleSaveEdit = async () => {
    const nextSegments = segments.map((s) =>
      s.id === selectedId
        ? {
          ...s,
          type: editForm.type,
          groupId: '',
          audioItemId: '',
          startSeconds: Number(editForm.startSeconds) || 0,
          durationSeconds: Number(editForm.durationSeconds) || 0
        }
        : s
    );
    await onUpdate({ ...settings, segments: nextSegments });
    setSelectedId(null);
  };

  const handleDelete = async (segId) => {
    await onUpdate({ ...settings, segments: segments.filter((s) => s.id !== segId) });
    setSelectedId(null);
  };

  const handleAdd = async () => {
    const newSeg = {
      id: generateId(),
      type: addForm.type,
      groupId: '',
      audioItemId: '',
      startSeconds: Number(addForm.startSeconds) || 0,
      durationSeconds: Number(addForm.durationSeconds) || 30
    };
    await onUpdate({ ...settings, segments: [...segments, newSeg] });
    setAddMode(false);
    setAddForm({
      trackKey: 'background',
      type: 'bowl',
      startSeconds: '0',
      durationSeconds: '30'
    });
  };

  // px per second in the timeline area
  // We render relative via percentages so this is just for reference
  const pct = (secs) => `${(secs / TOTAL_SECONDS) * 100}%`;

  const totalHeight = TRACKS.length * (TRACK_HEIGHT + TRACK_GAP);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={sectionTitleStyle}>冥想时间轴设置</div>
        {saving && <span style={{ fontSize: '12px', color: '#6366f1' }}>保存中...</span>}
      </div>
      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '18px' }}>
        此处只配置音频库级时间轴。音频组会在库内按顺序自动拼接，无需在这里单独设置。自然库只需设置目标总时长；其余音频库会在运行时按真实音频时长自动推导并校正时间轴。
      </div>

      {/* ── Timeline ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', userSelect: 'none' }}>
        {/* Track labels column */}
        <div style={{ width: LABEL_WIDTH, flexShrink: 0, paddingTop: RULER_HEIGHT }}>
          {TRACKS.map((track, idx) => (
            <div
              key={track.key}
              style={{
                height: TRACK_HEIGHT,
                marginBottom: TRACK_GAP,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: '8px'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: track.color, fontWeight: '600', whiteSpace: 'nowrap' }}>
                  {track.label}
                </span>
                <span style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                  {track.types.map((type) => SECTION_LABELS[type]).join(' / ')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Timeline area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Ruler */}
          <div style={{ position: 'relative', height: RULER_HEIGHT, borderBottom: '1px solid #e2e8f0', marginBottom: 0 }}>
            {RULER_TICKS.map((secs) => (
              <div
                key={secs}
                style={{
                  position: 'absolute',
                  left: pct(secs),
                  top: 0,
                  transform: secs === 0 ? 'none' : secs === TOTAL_SECONDS ? 'translateX(-100%)' : 'translateX(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  pointerEvents: 'none'
                }}
              >
                <span style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '14px' }}>
                  {secs === 0 ? '0s' : `${secs / 60}min`}
                </span>
                <div style={{ width: '1px', height: '6px', backgroundColor: '#cbd5e1' }} />
              </div>
            ))}
            {/* Minor ticks every 30s */}
            {Array.from({ length: 30 }, (_, i) => (i + 1) * 30).filter((s) => s % 60 !== 0 && s < TOTAL_SECONDS).map((secs) => (
              <div
                key={`m${secs}`}
                style={{
                  position: 'absolute',
                  left: pct(secs),
                  bottom: 0,
                  transform: 'translateX(-50%)',
                  width: '1px',
                  height: '4px',
                  backgroundColor: '#e2e8f0',
                  pointerEvents: 'none'
                }}
              />
            ))}
          </div>

          {/* Track rows */}
          <div style={{ position: 'relative', height: totalHeight }}>
            {/* Grid lines */}
            {RULER_TICKS.map((secs) => (
              <div
                key={`grid-${secs}`}
                style={{
                  position: 'absolute',
                  left: pct(secs),
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  backgroundColor: secs === 0 || secs === TOTAL_SECONDS ? '#cbd5e1' : '#f1f5f9',
                  pointerEvents: 'none'
                }}
              />
            ))}

            {/* Track backgrounds — clickable to add */}
            {TRACKS.map((track, idx) => (
              <div
                key={`track-bg-${track.key}`}
                onClick={() => {
                  setSelectedId(null);
                  setAddMode(true);
                  setAddForm({
                    trackKey: track.key,
                    type: track.types[0],
                    startSeconds: '0',
                    durationSeconds: '30'
                  });
                }}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: idx * (TRACK_HEIGHT + TRACK_GAP),
                  height: TRACK_HEIGHT,
                  backgroundColor: track.bg,
                  borderRadius: '8px',
                  cursor: 'copy',
                  border: `1px solid ${track.border}`
                }}
              >
                <div style={{ display: 'flex', gap: '6px', padding: '8px', flexWrap: 'wrap' }}>
                  {track.types.map((type) => (
                    <span
                      key={type}
                      style={{
                        fontSize: '10px',
                        color: track.color,
                        border: `1px solid ${track.border}`,
                        backgroundColor: '#ffffffcc',
                        borderRadius: '999px',
                        padding: '2px 8px'
                      }}
                    >
                      {TYPE_LABELS[type]}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            {/* Segment blocks */}
            {assigned.map(({ seg, trackIdx, slotIdx }) => {
              const track = TRACKS[trackIdx];
              const isSelected = seg.id === selectedId;
              const topPx = trackIdx * (TRACK_HEIGHT + TRACK_GAP);
              const { slotHeight } = getTrackSlotMetrics(track);
              const segmentTop = topPx + TRACK_INSET + Math.max(slotIdx, 0) * (slotHeight + SLOT_GAP);
              const leftPct = pct(seg.startSeconds);
              const widthPct = `${(seg.durationSeconds / TOTAL_SECONDS) * 100}%`;
              const typeItemCount = itemsByType(seg.type).length;
              const segmentLabel = seg.type === 'nature'
                ? `${TYPE_LABELS[seg.type]} · 自动循环`
                : TYPE_LABELS[seg.type];
              return (
                <div
                  key={seg.id}
                  onClick={(e) => { e.stopPropagation(); openEdit(seg); }}
                  title={`${track.label} / ${TYPE_LABELS[seg.type]}  ${formatSeconds(seg.startSeconds)} → ${formatSeconds(seg.startSeconds + seg.durationSeconds)}`}
                  style={{
                    position: 'absolute',
                    left: leftPct,
                    width: widthPct,
                    top: segmentTop,
                    height: slotHeight,
                    backgroundColor: '#ffffff',
                    border: `2px solid ${isSelected ? track.color : track.color + '88'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    boxSizing: 'border-box',
                    boxShadow: isSelected ? `0 0 0 2px ${track.color}44` : 'none',
                    zIndex: isSelected ? 2 : 1
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '10px', fontWeight: '600', color: track.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {segmentLabel}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {seg.type === 'nature'
                        ? `目标 ${formatSeconds(seg.durationSeconds)} · ${typeItemCount} 条素材循环`
                        : `${formatSeconds(seg.durationSeconds)} · 库内 ${typeItemCount} 条音频`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Edit / Add Panel ──────────────────────────────────────── */}
      {(selectedSeg || addMode) && (
        <div style={{ marginTop: '20px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px', backgroundColor: '#f8fafc' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '14px' }}>
            {addMode ? '新增片段' : `编辑片段 — ${TYPE_LABELS[(selectedSeg || {}).type]}`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', marginBottom: '12px' }}>
            {addMode && (
              <div>
                <label style={labelStyle}>音轨</label>
                <select
                  style={inputStyle}
                  value={addForm.trackKey}
                  onChange={(e) => {
                    const nextTrackKey = e.target.value;
                    const nextTypes = getTrackTypes(nextTrackKey);
                    setAddForm((form) => ({
                      ...form,
                      trackKey: nextTrackKey,
                      type: nextTypes[0] || 'bowl'
                    }));
                  }}
                >
                  {TRACKS.map((track) => (
                    <option key={track.key} value={track.key}>{track.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>音频类型</label>
              <select
                style={inputStyle}
                value={addMode ? addForm.type : editForm.type}
                onChange={(e) => addMode
                  ? setAddForm((form) => ({
                    ...form,
                    type: e.target.value
                  }))
                  : setEditForm((form) => ({
                    ...form,
                    type: e.target.value
                  }))
                }
              >
                {(addMode ? getTrackTypes(addForm.trackKey) : getTrackTypes(getTrackKeyForType(editForm.type))).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{(addMode ? addForm.type : editForm.type) === 'nature' ? '目标总时长（秒）' : '素材库状态'}</label>
              <div style={{ padding: '8px 12px', fontSize: '13px', color: '#475569', backgroundColor: '#f1f5f9', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                {(addMode ? addForm.type : editForm.type) === 'nature'
                  ? '按自然库素材自动循环铺满'
                  : `当前库内 ${itemsByType(addMode ? addForm.type : editForm.type).length} 条音频`}
              </div>
            </div>
            <div>
              <label style={labelStyle}>开始（秒）</label>
              <input
                style={inputStyle}
                type="number"
                min="0"
                max={TOTAL_SECONDS}
                value={addMode ? addForm.startSeconds : editForm.startSeconds}
                onChange={(e) => addMode
                  ? setAddForm((f) => ({ ...f, startSeconds: e.target.value }))
                  : setEditForm((f) => ({ ...f, startSeconds: e.target.value }))
                }
              />
            </div>
            <div>
              <label style={labelStyle}>{(addMode ? addForm.type : editForm.type) === 'nature' ? '目标总时长（秒）' : '兜底时长（秒）'}</label>
              <input
                style={inputStyle}
                type="number"
                min="1"
                value={addMode ? addForm.durationSeconds : editForm.durationSeconds}
                onChange={(e) => addMode
                  ? setAddForm((f) => ({ ...f, durationSeconds: e.target.value }))
                  : setEditForm((f) => ({ ...f, durationSeconds: e.target.value }))
                }
              />
            </div>
            <div>
              <label style={labelStyle}>结束时间</label>
              <div style={{ padding: '8px 12px', fontSize: '13px', color: '#475569', backgroundColor: '#f1f5f9', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                {formatSeconds(
                  (Number(addMode ? addForm.startSeconds : editForm.startSeconds) || 0) +
                  (Number(addMode ? addForm.durationSeconds : editForm.durationSeconds) || 0)
                )}
              </div>
            </div>
          </div>
          {(addMode ? addForm.type : editForm.type) === 'nature' && (
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
              自然库不会手工拆成多段。系统会按自然库现有音频时长自动循环，直到铺满这里设置的目标总时长。
            </div>
          )}
          {(addMode ? addForm.type : editForm.type) !== 'nature' && (
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
              当前配置的是音频库级片段。运行时会按该音频库的自动拼接规则执行，并优先按真实音频时长自动校正；只有音频未填写时长时，才会回退到这里的兜底时长。
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            {addMode ? (
              <>
                <button style={primaryBtnStyle} onClick={handleAdd}>添加</button>
                <button style={ghostBtnStyle} onClick={closePanel}>取消</button>
              </>
            ) : (
              <>
                <button style={primaryBtnStyle} onClick={handleSaveEdit}>保存</button>
                <button style={dangerBtnStyle} onClick={() => handleDelete(selectedId)}>删除</button>
                <button style={ghostBtnStyle} onClick={closePanel}>取消</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add button when no panel open */}
      {!selectedSeg && !addMode && (
        <button
          style={{ ...ghostBtnStyle, marginTop: '16px' }}
          onClick={() => {
            setAddMode(true);
            setAddForm({
              trackKey: 'background',
              type: 'bowl',
              startSeconds: '0',
              durationSeconds: '30'
            });
          }}
        >
          + 新增片段
        </button>
      )}
    </div>
  );
};

// ─── CalendarTab ──────────────────────────────────────────────────────────────

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const CalendarTab = ({ calendar, meditationLibrary, saving, onUpdate }) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [editingDate, setEditingDate] = useState(null);
  const [editForm, setEditForm] = useState({ morning: [], noon: [], afternoon: [], evening: [] });

  const days = calendar.days || {};
  const presets = meditationLibrary.meditations || [];

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfWeek = (year, month) => new Date(year, month, 1).getDay();

  const openDay = (dateKey) => {
    const day = days[dateKey] || {};
    setEditForm({
      morning: day.morning || [],
      noon: day.noon || [],
      afternoon: day.afternoon || [],
      evening: day.evening || []
    });
    setEditingDate(dateKey);
  };

  const handleSaveDay = async () => {
    const nextDays = { ...days };
    const isEmpty = editForm.morning.length === 0 && editForm.noon.length === 0
      && editForm.afternoon.length === 0 && editForm.evening.length === 0;
    if (isEmpty) {
      delete nextDays[editingDate];
    } else {
      nextDays[editingDate] = { ...editForm };
    }
    await onUpdate({ ...calendar, days: nextDays });
    setEditingDate(null);
  };

  const handleClearDay = async () => {
    const nextDays = { ...days };
    delete nextDays[editingDate];
    await onUpdate({ ...calendar, days: nextDays });
    setEditingDate(null);
  };

  const togglePreset = (sessionKey, presetId) => {
    setEditForm((f) => {
      const arr = f[sessionKey] || [];
      const has = arr.includes(presetId);
      return { ...f, [sessionKey]: has ? arr.filter((id) => id !== presetId) : [...arr, presetId] };
    });
  };

  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const firstDayOfWeek = getFirstDayOfWeek(selectedYear, selectedMonth);

  const calendarCells = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(d);
  }

  const formatDateKey = (day) => {
    const mm = String(selectedMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${selectedYear}-${mm}-${dd}`;
  };

  const sessionCount = (dateKey) => {
    const day = days[dateKey];
    if (!day) return 0;
    return [day.morning, day.noon, day.afternoon, day.evening].filter((arr) => arr && arr.length > 0).length;
  };

  return (
    <div>
      <div style={sectionTitleStyle}>冥想日历管理</div>
      {saving && <div style={{ color: '#6366f1', fontSize: '12px', marginBottom: '12px' }}>保存中...</div>}

      {/* Year/Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button style={ghostBtnStyle} onClick={() => setSelectedYear((y) => y - 1)}>‹ 上一年</button>
          <span style={{ fontWeight: '600', fontSize: '15px', color: '#1e293b', minWidth: '60px', textAlign: 'center' }}>{selectedYear}</span>
          <button style={ghostBtnStyle} onClick={() => setSelectedYear((y) => y + 1)}>下一年 ›</button>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {MONTHS.map((m, idx) => (
            <button key={idx} style={pillBtnStyle(selectedMonth === idx)} onClick={() => setSelectedMonth(idx)}>{m}</button>
          ))}
        </div>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {WEEKDAYS.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', fontWeight: '500', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {calendarCells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const dateKey = formatDateKey(day);
          const count = sessionCount(dateKey);
          const hasData = count > 0;
          return (
            <div
              key={dateKey}
              onClick={() => openDay(dateKey)}
              style={{
                padding: '8px 4px',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: hasData ? '#eff6ff' : '#f8fafc',
                border: hasData ? '1px solid #bfdbfe' : '1px solid #f1f5f9',
                textAlign: 'center',
                minHeight: '48px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px'
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: hasData ? '600' : '400', color: hasData ? '#1d4ed8' : '#475569' }}>{day}</div>
              {hasData && <div style={{ fontSize: '10px', color: '#6366f1' }}>{count} 节</div>}
            </div>
          );
        })}
      </div>

      {/* Day edit modal */}
      {editingDate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '460px', maxWidth: '94vw', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
              {editingDate} — 课程设置
            </div>
            {Object.entries(SESSION_LABELS).map(([sessionKey, sessionLabel]) => {
              const selected = editForm[sessionKey] || [];
              return (
                <div key={sessionKey} style={{ marginBottom: '18px' }}>
                  <label style={labelStyle}>
                    {sessionLabel}
                    {selected.length > 0 && (
                      <span style={{ fontWeight: '400', color: '#6366f1', marginLeft: '8px', fontSize: '11px' }}>
                        {selected.length === 1 ? '固定' : `${selected.length}条随机`}
                      </span>
                    )}
                  </label>
                  {presets.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>暂无冥想预设，请先在「冥想库」中创建</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {presets.map((preset) => {
                        const checked = selected.includes(preset.id);
                        return (
                          <label
                            key={preset.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              backgroundColor: checked ? '#eff6ff' : '#f8fafc',
                              border: checked ? '1px solid #93c5fd' : '1px solid #e2e8f0'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePreset(sessionKey, preset.id)}
                              style={{ accentColor: '#6366f1' }}
                            />
                            <span style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{preset.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {saving && <div style={{ color: '#6366f1', fontSize: '12px', marginBottom: '10px' }}>保存中...</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button style={dangerBtnStyle} onClick={handleClearDay}>清除当天</button>
              <button style={ghostBtnStyle} onClick={() => setEditingDate(null)}>取消</button>
              <button style={primaryBtnStyle} onClick={handleSaveDay}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── MeditationPage ───────────────────────────────────────────────────────────

const MeditationPage = ({
  meditationAudioLibrary,
  meditationCompositionSettings,
  meditationCalendar,
  meditationLibrary,
  meditationParagraphs,
  meditationSectionRaws,
  aiSettings,
  savingMeditationAudioLibrary,
  savingMeditationCompositionSettings,
  savingMeditationCalendar,
  savingMeditationLibrary,
  updateMeditationAudioLibrary,
  queueMeditationAudioTranscodeJob,
  updateMeditationCompositionSettings,
  updateMeditationCalendar,
  updateMeditationLibrary,
  refreshMeditationSection,
  settingsError
}) => {
  const [activeSubTab, setActiveSubTab] = useState('paragraph');
  const [activeFilter, setActiveFilter] = useState('all');

  // Minimal create form state (P0)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState('verse');
  const [newTags, setNewTags] = useState('');

  // P0 stub state for section-raw (fallback; real from prop if available)
  const [sectionRawItems, setSectionRawItems] = useState([
    // (populated from prop via useEffect)
  ]);
  const [showSectionCreateForm, setShowSectionCreateForm] = useState(false);
  const [selectedParagraphIds, setSelectedParagraphIds] = useState([]);
  const [sectionRawAudioStatus, setSectionRawAudioStatus] = useState({}); // { [id]: { uploading, fileId, audioUrl, error } }

  // load real from prop (prefer over stubs) on mount/after refresh; supports prop or hook data
  useEffect(() => {
    if (Array.isArray(meditationSectionRaws)) {
      setSectionRawItems(meditationSectionRaws);
    }
  }, [meditationSectionRaws]);

  const selectedTotalChars = selectedParagraphIds.reduce((sum, pid) => {
    const data = Array.isArray(meditationParagraphs) ? meditationParagraphs : [];
    const p = data.find((pp) => (pp._id || pp.id) === pid);
    return sum + String(p?.text || '').length;
  }, 0);

  const isDev = import.meta.env?.DEV === true;

  // minimal create handler (P0 tiny follow-up)
  const handleCreateParagraph = async () => {
    try {
      const tags = newTags.split(',').map((t) => t.trim()).filter(Boolean);
      await DatabaseService.createMedParagraph({
        text: newText,
        paragraph_type: newType,
        tags,
        usage_count: 0,
      });
      setNewText('');
      setNewTags('');
      setShowCreateForm(false);
      if (typeof refreshMeditationSection === 'function') {
        await refreshMeditationSection();
      }
    } catch (err) {
      console.error('Failed to create med paragraph:', err);
    }
  };

  // P1: AI rewrite (仿写) - creates a rewritten copy with ai_rewritten_from tracking
  const [rewritingId, setRewritingId] = useState(null);
  const handleAiRewrite = async (originalParagraph) => {
    if (!originalParagraph?._id || !originalParagraph?.text) return;
    setRewritingId(originalParagraph._id);
    try {
      // Fetch latest AI settings directly from DB (avoid stale props)
      const dbAiSettings = await DatabaseService.getAiSettings();
      let rewrittenText = '';
      const apiSettings = dbAiSettings || {};
      if (apiSettings.apiKey && apiSettings.enabled !== false) {
        try {
          // Use Vite proxy for DeepSeek to avoid CORS; directly use configured endpoint as fallback
          const endpoint = apiSettings.apiEndpoint || 'https://api.deepseek.com';
          const isDefaultDeepSeek = endpoint.includes('api.deepseek.com');
          const url = isDefaultDeepSeek
            ? `/api/ai/proxy/v1/chat/completions`
            : `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiSettings.apiKey}`
            },
            body: JSON.stringify({
              model: apiSettings.model || 'deepseek-chat',
              messages: [
                { role: 'system', content: '你是一名中文文案改写助手。请用不同的词汇和句式改写下面的文本，要求至少替换20%的用词，变换表达方式但保持原意。改写前后的字数偏差必须在±5字以内。只返回改写后的结果。' },
                { role: 'user', content: `原文：${originalParagraph.text}` }
              ],
              temperature: 0.9,
              max_tokens: 500
            })
          });
          if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            console.error('AI API HTTP error:', response.status, errBody.slice(0, 300));
            throw new Error(`API ${response.status}: ${errBody.slice(0, 200)}`);
          }
          const data = await response.json();
          rewrittenText = data?.choices?.[0]?.message?.content?.trim() || '';
        } catch (apiErr) {
          console.error('AI API call failed:', apiErr.message);
          setRewritingId(null);
          return; // cancel the whole operation, don't create duplicate
        }
      }
      if (!rewrittenText || rewrittenText.replace(/\s+/g, '') === originalParagraph.text.replace(/\s+/g, '')) {
        console.error('AI rewrite failed: returned empty or unchanged text');
        alert('DeepSeek 返回空或与原文相同。请检查 Console 中 "AI API full response" 日志。');
        setRewritingId(null);
        return; // cancel, don't create duplicate
      }
      const newParagraph = {
        text: rewrittenText,
        paragraph_type: originalParagraph.paragraph_type || 'verse',
        tags: Array.isArray(originalParagraph.tags) ? [...originalParagraph.tags, 'ai-rewrite'] : ['ai-rewrite'],
        usage_count: 0,
        source: 'ai',
        ai_rewritten_from: originalParagraph._id,
        created_by: 'admin-ai-rewrite',
      };
      await DatabaseService.createMedParagraph(newParagraph);
      // Increment original paragraph's score
      await DatabaseService.updateMedParagraph(originalParagraph._id, {
        usage_count: (originalParagraph.usage_count || 0) + 1,
      });
      if (typeof refreshMeditationSection === 'function') {
        await refreshMeditationSection();
      }
    } catch (err) {
      console.error('AI rewrite failed:', err);
    } finally {
      setRewritingId(null);
    }
  };

  // tiny dev seed helper for paragraph tab (hardcoded from test cases doc "0. Data Setup Notes")
  const handleSeedParagraphs = async () => {
    const samples = [
      // 1. intro, usage=0 (0 stars)
      {
        text: "欢迎来到理悟冥想空间。",
        paragraph_type: "intro",
        tags: ["greeting", "intro"],
        usage_count: 0,
        source: "manual",
        created_by: "test-admin-001",
      },
      // 2. intro, usage=2
      {
        text: "请保持舒适的姿势，闭上双眼。",
        paragraph_type: "intro",
        tags: ["posture"],
        usage_count: 2,
        source: "manual",
        created_by: "test-admin-001",
      },
      // 3. breath, usage=5 (mid stars)
      {
        text: "慢慢吸气... 感受腹部鼓起... 缓缓呼出... 释放所有压力。",
        paragraph_type: "breath",
        tags: ["breathing"],
        usage_count: 5,
        source: "manual",
        created_by: "test-admin-001",
      },
      // 4. breath, usage=0
      {
        text: "吸气四秒，屏息四秒，呼气六秒。",
        paragraph_type: "breath",
        tags: [],
        usage_count: 0,
        source: "ai",
        created_by: "test-admin-001",
      },
      // 5. verse, usage=12 (high stars)
      {
        text: "心如止水，念随息去。每一呼吸引导你回归当下。",
        paragraph_type: "verse",
        tags: ["heart", "verse"],
        usage_count: 12,
        source: "manual",
        created_by: "test-admin-001",
      },
      // 6. verse, usage=25 (higher)
      {
        text: "在宁静中觉察，在觉察中成长。愿你与这份平静同在。",
        paragraph_type: "verse",
        tags: ["wisdom"],
        usage_count: 25,
        source: "ai",
        created_by: "test-admin-001",
      },
    ];
    try {
      for (const sample of samples) {
        await DatabaseService.createMedParagraph(sample);
      }
      console.log('samples seeded, list updates');
      if (typeof refreshMeditationSection === 'function') {
        await refreshMeditationSection();
      }
    } catch (err) {
      console.error('Failed to seed med paragraphs:', err);
    }
  };

  // P0 minimal section-raw handlers (local stub only, no DB, no audio)
  const toggleSectionCreateForm = () => {
    setShowSectionCreateForm((s) => {
      const next = !s;
      if (!next) setSelectedParagraphIds([]);
      return next;
    });
  };

  const toggleParagraphSelect = (pid) => {
    if (!pid) return;
    setSelectedParagraphIds((prev) => {
      if (prev.includes(pid)) {
        return prev.filter((id) => id !== pid);
      }
      return [...prev, pid];
    });
  };

  const handleConfirmCreateSectionRaw = async () => {
    if (!selectedParagraphIds.length) return;
    const data = Array.isArray(meditationParagraphs) ? meditationParagraphs : [];
    const selectedParagraphs = selectedParagraphIds
      .map((pid) => {
        const p = data.find((pp) => (pp._id || pp.id) === pid);
        if (!p) return null;
        const t = String(p.text || '').trim();
        return t.length > 60 ? t.slice(0, 60) + '...' : t;
      })
      .filter(Boolean);
    const totalChars = selectedParagraphIds.reduce((sum, pid) => {
      const p = data.find((pp) => (pp._id || pp.id) === pid);
      return sum + String(p?.text || '').length;
    }, 0);
    const newItem = {
      id: generateId(),
      paragraph_ids: [...selectedParagraphIds],
      word_count_status: totalChars > 0 ? totalChars : '待计算',
      paragraphs: selectedParagraphs,
    };
    try {
      await DatabaseService.createMedSectionRaw({ paragraph_ids: newItem.paragraph_ids, word_count_status: newItem.word_count_status, created_at: new Date().toISOString() });
      if (typeof refreshMeditationSection === 'function') {
        await refreshMeditationSection();
      }
    } catch {
      console.log('DB createMedSectionRaw attempt (fallback local)');
      setSectionRawItems((prev) => [newItem, ...prev]);
    }
    setShowSectionCreateForm(false);
    setSelectedParagraphIds([]);
  };

  // minimal audio upload for section-raw items (reuses existing uploadAudioFile)
  const handleSectionRawUpload = async (itemId, file) => {
    if (!itemId || !file) return;
    setSectionRawAudioStatus((prev) => ({ ...prev, [itemId]: { uploading: true } }));
    try {
      const cloudPath = `meditation-audio-raw/section-raw/${itemId}/${Date.now()}-${file.name}`;
      const { fileId, audioUrl } = await uploadAudioFile({ file, cloudPath });
      setSectionRawItems((prev) => prev.map((item) =>
        item.id === itemId ? { ...item, file_id: fileId, audio_url: audioUrl } : item
      ));
      // persist audio_id to DB if the item has a real _id
      const currentItem = Array.isArray(localSectionRaws) ? localSectionRaws.find((r) => (r._id || r.id) === itemId) : null;
      if (currentItem?._id) {
        try {
          await DatabaseService.updateMedSectionRaw(currentItem._id, { file_id: fileId, audio_url: audioUrl });
          // queue Opus transcode job for this item
          try {
            const targetCloudPath = `meditation-audio/section-raw/${itemId}/${Date.now()}.opus`;
            await DatabaseService.createMeditationAudioTranscodeJob({
              itemId: currentItem._id,
              sourceFileId: fileId,
              sourceFileName: file.name,
              sourceCloudPath: cloudPath,
              targetCloudPath,
              transcode_profile: 'default',
            });
            console.log('transcode job queued for section-raw:', currentItem._id);
          } catch (transcodeErr) {
            console.log('transcode queue skipped (non-critical):', transcodeErr.message);
          }
        } catch (dbErr) {
          console.log('DB update for audio_id skipped (item may be local stub):', dbErr.message);
        }
      }
      setSectionRawAudioStatus((prev) => ({ ...prev, [itemId]: { uploading: false, fileId, audioUrl, success: true } }));
    } catch (err) {
      console.error('section-raw upload failed:', err);
      setSectionRawAudioStatus((prev) => ({ ...prev, [itemId]: { uploading: false, error: err.message || '上传失败' } }));
    }
  };

  // paragraph edit state
  const [editParagraph, setEditParagraph] = useState(null);
  const [editText, setEditText] = useState('');
  const [editType, setEditType] = useState('');
  const [editTags, setEditTags] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [editTagInput, setEditTagInput] = useState('');
  const [addingToSectionRaw, setAddingToSectionRaw] = useState(null);
  const [sectionRawDropdownOpen, setSectionRawDropdownOpen] = useState(false);
  const [sectionRawDropdownList, setSectionRawDropdownList] = useState([]);
  const [appendToSr, setAppendToSr] = useState(null); // section-raw id to append to
  const [appendSelected, setAppendSelected] = useState([]);
  const [appending, setAppending] = useState(false);

  // Locked paragraph IDs (those present in any section-raw)
  const lockedParagraphIds = React.useMemo(() => new Set(
    (Array.isArray(sectionRawItems) ? sectionRawItems : []).flatMap((sr) =>
      Array.isArray(sr.paragraph_ids) ? sr.paragraph_ids : []
    )
  ), [sectionRawItems]);

  // Load existing section-raws for the dropdown when edit modal opens
  useEffect(() => {
    if (editParagraph) {
      DatabaseService.getMedSectionRaws().then((data) => {
        setSectionRawDropdownList(
          (data || []).map((sr) => ({
            id: sr._id || sr.id,
            paragraphs: Array.isArray(sr.paragraph_texts) ? sr.paragraph_texts : [],
          }))
        );
      }).catch(() => {});
    }
  }, [editParagraph]);
  const [paragraphTagFilter, setParagraphTagFilter] = useState(null);
  const [paragraphSortKey, setParagraphSortKey] = useState('score');

  const handleDeleteParagraph = async (p) => {
    if (!p?._id) return;
    if (!confirm(`确定删除此段落？\n\n${(p.text || '').slice(0, 80)}`)) return;
    try {
      await DatabaseService.deleteMedParagraph(p._id);
      if (typeof refreshMeditationSection === 'function') {
        await refreshMeditationSection();
      }
    } catch (err) {
      console.error('Delete failed:', err);
      alert('删除失败');
    }
  };

  // Lazy load sub-tab data on demand (instead of loading all at once on mount)
  const [localAudioLibrary, setLocalAudioLibrary] = useState(meditationAudioLibrary);
  const [localSectionRaws, setLocalSectionRaws] = useState(meditationSectionRaws);
  const [localCompositionSettings, setLocalCompositionSettings] = useState(meditationCompositionSettings);
  const [localCalendar, setLocalCalendar] = useState(meditationCalendar);
  const [localLibrary, setLocalLibrary] = useState(meditationLibrary);
  useEffect(() => {
    const load = async () => {
      try {
        switch (activeSubTab) {
          case 'library':
            if (!localAudioLibrary?.documentId) {
              const data = await DatabaseService.getMeditationAudioLibrary();
              setLocalAudioLibrary(data);
            }
            break;
          case 'section-raw':
            try {
              const data = await DatabaseService.getMedSectionRaws();
              setLocalSectionRaws(data || []);
              // Also update sectionRawItems (the actual render state) with normalized data
              setSectionRawItems(
                (data || []).map((item, idx) => ({
                  id: item._id || item.id || `sr-${idx}`,
                  paragraph_ids: Array.isArray(item.paragraph_ids) ? item.paragraph_ids : [],
                  paragraphs: Array.isArray(item.paragraph_texts) ? item.paragraph_texts : [],
                  word_count_status: item.word_count_status || '',
                  audio_url: item.audio_url || '',
                  file_id: item.file_id || '',
                  transcodeStatus: item.transcode_status || null,
                  transcodeError: item.transcode_error || null,
                }))
              );
              console.log('Section-raw loaded:', data?.length, 'items');
            } catch (e) {
              console.error('Failed to load section-raw:', e.message);
            }
            break;
          case 'composition':
            if (!localCompositionSettings?.documentId) {
              const data = await DatabaseService.getMeditationCompositionSettings();
              setLocalCompositionSettings(data);
            }
            break;
          case 'calendar':
            if (!localCalendar?.documentId) {
              const data = await DatabaseService.getMeditationCalendar();
              setLocalCalendar(data);
            }
            break;
          case 'presets':
            if (!localLibrary?.documentId) {
              const data = await DatabaseService.getMeditationLibrary();
              setLocalLibrary(data);
            }
            break;
        }
      } catch (e) {
        console.log('Lazy load skipped for', activeSubTab, e.message);
      }
    };
    load();
  }, [activeSubTab]);

  const handleOpenEdit = (p) => {
    setEditParagraph(p);
    setEditText(p?.text || '');
    setEditType(p?.paragraph_type || 'verse');
    setEditTags(Array.isArray(p?.tags) ? p.tags.join(', ') : '');
  };

  const handleAiPolish = async () => {
    if (!editText) return;
    setPolishing(true);
    try {
      const dbAiSettings = await DatabaseService.getAiSettings() || {};
      if (!dbAiSettings.apiKey) { alert('请先在 设置→AI 中配置 API Key'); return; }
      const endpoint = dbAiSettings.apiEndpoint || 'https://api.deepseek.com';
      const isDefaultDeepSeek = endpoint.includes('api.deepseek.com');
      const url = isDefaultDeepSeek ? '/api/ai/proxy/v1/chat/completions' : `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${dbAiSettings.apiKey}` },
        body: JSON.stringify({
          model: dbAiSettings.model || 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是一名中文文案润色助手。请对以下文本进行轻微的润色，保持原意、长度和整体结构，只优化用词和表达流畅度，不做大幅修改。只返回润色后的结果。' },
            { role: 'user', content: `原文：${editText}` }
          ],
          temperature: 0.5,
          max_tokens: 500
        })
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      const polished = data?.choices?.[0]?.message?.content?.trim();
      if (polished) setEditText(polished);
    } catch (err) {
      console.error('AI polish failed:', err);
      alert('AI 润色失败：' + err.message);
    } finally {
      setPolishing(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editParagraph?._id) return;
    setSavingEdit(true);
    try {
      const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
      const updateData = {
        text: editText,
        paragraph_type: editType,
        tags,
        // manual edit clears AI status
        source: 'manual',
        ai_rewritten_from: null,
      };
      await DatabaseService.updateMedParagraph(editParagraph._id, updateData);
      setEditParagraph(null);
      if (typeof refreshMeditationSection === 'function') {
        await refreshMeditationSection();
      }
    } catch (err) {
      console.error('Failed to update paragraph:', err);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddToSectionRaw = async (targetId) => {
    if (!editParagraph?._id) return;
    setAddingToSectionRaw(targetId || 'new');
    setSectionRawDropdownOpen(false);
    try {
      const text = editText || editParagraph.text || '';
      if (targetId && targetId !== 'new') {
        // Append to existing section-raw
        const existing = sectionRawDropdownList.find((sr) => sr.id === targetId);
        const existingParagraphs = existing?.paragraphs || [];
        await DatabaseService.updateMedSectionRaw(targetId, {
          paragraph_texts: [...existingParagraphs, text],
        });
      } else {
        // Create new section-raw
        const payload = {
          paragraph_ids: [editParagraph._id],
          paragraph_texts: [text],
          word_count_status: String(text.length),
          created_by: 'admin-edit-modal',
        };
        await DatabaseService.createMedSectionRaw(payload);
      }
      setAddingToSectionRaw(null);
      setEditParagraph(null);
      if (typeof refreshMeditationSection === 'function') {
        await refreshMeditationSection();
      }
      setActiveSubTab('section-raw');
    } catch (err) {
      console.error('Failed to add to section-raw:', err);
      setAddingToSectionRaw(null);
    }
  };

  const handleCancelEdit = () => {
    setEditParagraph(null);
  };

  return (
    <div>
      {/* Sub-tab pill nav */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {SUB_TABS.map((tab) => (
          <button key={tab.key} style={pillBtnStyle(activeSubTab === tab.key)} onClick={() => setActiveSubTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {settingsError && (
        <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#713f12', marginBottom: '16px' }}>
          {settingsError}
        </div>
      )}

      <div style={cardStyle}>
        {activeSubTab === 'paragraph' && (
          <div>
            <div style={sectionTitleStyle}>段落文本库</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {['all', 'intro', 'breath', 'verse'].map((pt) => (
                <button key={pt} style={pillBtnStyle(activeFilter === pt)} onClick={() => setActiveFilter(pt)}>{pt}</button>
              ))}
            </div>
            {(() => {
              const data = Array.isArray(meditationParagraphs) ? meditationParagraphs : [];
              // Build score map: each paragraph gets a score based on usage_count + ai rewrite count
              const scored = data.map((p) => ({
                ...p,
                score: Number(p.usage_count || 0) + Number(p.ai_rewrite_count || 0),
              }));
              // Sort by score descending (default)
              const sortKey = paragraphSortKey || 'score';
              const sorted = [...scored].sort((a, b) => {
                if (sortKey === 'score') return (b.score || 0) - (a.score || 0);
                if (sortKey === 'text') return (a.text || '').localeCompare(b.text || '');
                return (b.score || 0) - (a.score || 0);
              });
              // Filter by type + tag
              const filtered = sorted.filter((p) => {
                if (activeFilter !== 'all' && p.paragraph_type !== activeFilter) return false;
                if (paragraphTagFilter && paragraphTagFilter !== 'all') {
                  const tags = Array.isArray(p.tags) ? p.tags : [];
                  if (!tags.includes(paragraphTagFilter)) return false;
                }
                return true;
              });
              // Compute percentile-based stars
              const allScores = filtered.map((p) => p.score || 0).sort((a, b) => b - a);
              const getStars = (score) => {
                if (!score || allScores.length === 0) return '';
                const rank = allScores.findIndex((s) => s <= (score || 0));
                const pct = rank / Math.max(allScores.length, 1);
                if (pct < 0.2) return '★★★★★';
                if (pct < 0.4) return '★★★★';
                if (pct < 0.6) return '★★★';
                if (pct < 0.8) return '★★';
                return '★';
              };
              // Build unique tag list for filter
              const allTags = [...new Set(data.flatMap((p) => Array.isArray(p.tags) ? p.tags : []))].sort();
              return (
                <>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }}>
                    <select
                      value={paragraphTagFilter || 'all'}
                      onChange={(e) => setParagraphTagFilter(e.target.value === 'all' ? null : e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', outline: 'none' }}
                    >
                      <option value="all">全部标签</option>
                      {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select
                      value={paragraphSortKey || 'score'}
                      onChange={(e) => setParagraphSortKey(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', outline: 'none' }}
                    >
                      <option value="score">按星级排序</option>
                      <option value="text">按文本排序</option>
                    </select>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{filtered.length} 条 {activeFilter !== 'all' ? `(${activeFilter})` : ''}</span>
                  </div>
                  {filtered.length === 0 ? (
                    <div style={{ padding: '6px 8px', color: '#94a3b8', fontSize: '13px' }}>med_paragraphs data will appear here (seed via CloudBase)</div>
                  ) : filtered.map((p, index) => {
                      const text = String(p?.text || '').trim();
                      const ptype = p?.paragraph_type || '';
                      const stars = getStars(p.score);
                      const isLocked = lockedParagraphIds.has(p._id);
                      return (
                        <div key={p?._id || index} style={{ display: 'flex', gap: '12px', padding: '6px 8px', borderTop: index > 0 ? '1px solid #f8fafc' : 'none', fontSize: '13px', alignItems: 'center' }}>
                          <div style={{ flex: 1, cursor: isLocked ? 'default' : 'pointer', wordBreak: 'break-word' }} title={isLocked ? '已加入音频库，不可编辑' : '点击编辑'} onClick={() => !isLocked && handleOpenEdit(p)}>
                            {p?.source === 'ai' && <span style={{ marginRight: '4px', fontSize: '11px', verticalAlign: 'middle' }}><img src="/icons/partner/ai.svg" style={{ width: '14px', height: '14px', verticalAlign: 'middle' }} alt="AI" /></span>}
                            {isLocked && <span style={{ marginRight: '4px', fontSize: '12px', verticalAlign: 'middle' }} title="已加入音频库">🔒</span>}
                            {text.length > 120 ? text.slice(0, 120) + '...' : text}
                          </div>
                          <div style={{ color: '#64748b', minWidth: '50px', fontSize: '12px' }}>{ptype}</div>
                          <div style={{ color: '#f59e0b', minWidth: '60px', fontSize: '12px', whiteSpace: 'nowrap', textAlign: 'center' }}>{stars}</div>
                          <button
                            style={{
                              padding: '2px 8px', fontSize: '11px', borderRadius: '4px',
                              border: isLocked ? '1px solid #e2e8f0' : '1px solid #818cf8',
                              background: isLocked ? '#f1f5f9' : '#eef2ff',
                              color: isLocked ? '#94a3b8' : '#4338ca',
                              cursor: isLocked ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap'
                            }}
                            disabled={rewritingId === p?._id || isLocked}
                            onClick={() => !isLocked && handleAiRewrite(p)}
                          >
                            {rewritingId === p?._id ? '改写中...' : isLocked ? '已锁定 🔒' : 'AI仿写'}
                          </button>
                          <button
                            style={{
                              padding: '2px 8px', fontSize: '11px', borderRadius: '4px',
                              border: isLocked ? '1px solid #e2e8f0' : '1px solid #fca5a5',
                              background: isLocked ? '#f1f5f9' : '#fef2f2',
                              color: isLocked ? '#94a3b8' : '#dc2626',
                              cursor: isLocked ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', lineHeight: '1'
                            }}
                            onClick={() => !isLocked && handleDeleteParagraph(p)}
                          >
                            🗑️
                          </button>
                        </div>
                      );
                    })}
                </>
              );
            })()}
                {/* minimal create for paragraph tab (tiny follow-up) */}
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                 style={{
                   padding: '4px 10px',
                   fontSize: '12px',
                   borderRadius: '6px',
                   border: '1px solid #e2e8f0',
                   background: '#f8fafc',
                   color: '#334155',
                   cursor: 'pointer'
                 }}
                 onClick={() => setShowCreateForm((s) => !s)}
                >
                 {showCreateForm ? '取消新增' : '新增段落'}
                </button>
                {isDev && (
                  <button
                    style={{
                      padding: '4px 10px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      border: '1px dashed #64748b',
                      background: '#f1f5f9',
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                    onClick={handleSeedParagraphs}
                    title="Dev only: seed 6 sample med_paragraphs from test cases"
                  >
                    Seed sample data (dev)
                  </button>
                )}
                </div>
                {showCreateForm && (
                 <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', background: '#fafafa', padding: '8px', borderRadius: '8px' }}>
                   <textarea
                     value={newText}
                     onChange={(e) => setNewText(e.target.value)}
                     placeholder="段落文本内容"
                     style={{ ...inputStyle, minHeight: '48px', fontSize: '12px' }}
                   />
                   <select
                     value={newType}
                     onChange={(e) => setNewType(e.target.value)}
                     style={{ ...inputStyle, fontSize: '12px' }}
                   >
                     <option value="intro">intro</option>
                     <option value="breath">breath</option>
                     <option value="verse">verse</option>
                   </select>
                   <input
                     value={newTags}
                     onChange={(e) => setNewTags(e.target.value)}
                     placeholder="tags，逗号分隔 (e.g. calm,focus)"
                     style={{ ...inputStyle, fontSize: '12px' }}
                   />
                   <button
                     style={{ ...primaryBtnStyle, fontSize: '12px', padding: '4px 10px', alignSelf: 'flex-start' }}
                     onClick={handleCreateParagraph}
                   >
                     提交新增
                   </button>
                 </div>
                )}
                </div>
          </div>
        )}

        {activeSubTab === 'section-raw' && (
          <div>
            <div style={sectionTitleStyle}>原始音频库</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
              Section-raw 列表
            </div>
            {sectionRawItems.length === 0 ? (
              <div style={{ padding: '6px 8px', color: '#94a3b8', fontSize: '13px' }}>暂无 section-raw</div>
            ) : sectionRawItems.map((item, idx) => (
              <div key={item.id || idx} style={{ padding: '6px 8px', borderTop: idx > 0 ? '1px solid #f8fafc' : 'none', fontSize: '13px' }}>
                <div>IDs: {item.paragraph_ids.join(', ')}</div>
                 {Array.isArray(item.paragraphs) && item.paragraphs.length > 0 && (
                   <ol style={{ fontSize: '11px', color: '#64748b', margin: '2px 0 4px 20px', padding: 0 }}>
                     {item.paragraphs.map((txt, ti) => (
                       <li key={ti} style={{ opacity: 0.85 }}>{txt}</li>
                     ))}
                   </ol>
                 )}
                 <div style={{ color: '#64748b' }}>字数状态: {item.word_count_status}</div>
                 <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', flexWrap: 'wrap' }}>
                   <button
                     style={{ padding: '2px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid #a7f3d0', background: '#ecfdf5', color: '#059669', cursor: 'pointer' }}
                     onClick={() => setAppendToSr(item.id)}
                   >
                     📎 追加段落
                   </button>
                   {!item.audio_url && (
                     <button
                       style={{ padding: '2px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#7c3aed', cursor: 'pointer' }}
                       onClick={async () => {
                         try {
                           const text = Array.isArray(item.paragraphs) ? item.paragraphs.join('\n') : '';
                           if (!text) return;
                           const blobUrl = await synthesizeSpeech(text, { voice: 'zh-CN' });
                           const audio = new Audio(blobUrl);
                           audio.play();
                         } catch (e) {
                           console.error('AI listen failed:', e);
                         }
                       }}
                     >
                       🎧 AI试听
                     </button>
                   )}
                   {item.audio_url ? (
                     <span style={{ color: '#22c55e' }}>✅ 已上传音频</span>
                   ) : (
                     <label style={{ padding: '2px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: 'pointer', display: 'inline-block' }}>
                       {sectionRawAudioStatus[item.id]?.uploading ? '上传中...' : '上传音频'}
                       <input type="file" accept="audio/*" style={{ display: 'none' }} disabled={sectionRawAudioStatus[item.id]?.uploading}
                         onChange={(e) => {
                           const f = e.target.files?.[0];
                           if (f) handleSectionRawUpload(item.id, f);
                           e.target.value = '';
                         }}
                       />
                     </label>
                   )}
                   {sectionRawAudioStatus[item.id]?.error && (
                     <span style={{ color: '#ef4444' }}>❌ {sectionRawAudioStatus[item.id]?.error}</span>
                   )}
                   {item.file_id && !item.audio_url && (
                     <span style={{ color: '#f59e0b' }}>⏳ 转码中</span>
                   )}
                 </div>
              </div>
              ))}
            <div style={{ marginTop: '12px' }}>
              <button
                style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#334155', cursor: 'pointer' }}
                onClick={toggleSectionCreateForm}
              >
                {showSectionCreateForm ? '取消新建' : '新建 section-raw'}
              </button>
            </div>
            {showSectionCreateForm && (
              <div style={{ marginTop: '8px', padding: '8px', background: '#fafafa', borderRadius: '8px', fontSize: '12px' }}>
                <div>选择段落（stub）:</div>
                { (meditationParagraphs || []).slice(0,5).map((p, i) => {
                  const id = p?._id || `p-${i}`;
                  const checked = selectedParagraphIds.includes(id);
                  return (
                    <label key={id} style={{ display: 'block', margin: '2px 0' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleParagraphSelect(id)} /> {String(p?.text || '').slice(0,30)}...
                    </label>
                  );
                })}

                <div style={{ margin: '4px 0', color: '#64748b' }}>预计字数: {selectedTotalChars}</div>
                <button style={{ marginTop: '6px', padding: '3px 8px', fontSize: '11px' }} onClick={handleConfirmCreateSectionRaw}>保存</button>
              </div>
            )}
          </div>
        )}

        {/* Append paragraphs modal */}
        {appendToSr && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '460px', maxWidth: '94vw', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>选择要追加的段落</div>
              {(meditationParagraphs || []).map((p) => {
                const pid = p._id || p.id;
                const isSelected = appendSelected.includes(pid);
                return (
                  <label key={pid} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 4px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', fontSize: '13px' }}>
                    <input type="checkbox" checked={isSelected} onChange={() => {
                      setAppendSelected((prev) => isSelected ? prev.filter((id) => id !== pid) : [...prev, pid]);
                    }} style={{ accentColor: '#6366f1' }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p?.source === 'ai' && '🤖 '}{p?.text?.slice(0, 80) || ''}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '11px', flexShrink: 0 }}>{p?.paragraph_type}</span>
                  </label>
                );
              })}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button style={{ padding: '7px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: '#fff', color: '#475569' }}
                  onClick={() => { setAppendToSr(null); setAppendSelected([]); }}>取消</button>
                <button style={{ padding: '7px 16px', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', backgroundColor: '#1e293b', color: '#fff' }}
                  disabled={appending || appendSelected.length === 0}
                  onClick={async () => {
                    setAppending(true);
                    try {
                      const sr = sectionRawItems.find((s) => s.id === appendToSr);
                      const existingTexts = sr?.paragraphs || [];
                      const newTexts = appendSelected.map((pid) => {
                        const p = (meditationParagraphs || []).find((pp) => (pp._id || pp.id) === pid);
                        return p?.text || '';
                      }).filter(Boolean);
                      await DatabaseService.updateMedSectionRaw(appendToSr, {
                        paragraph_texts: [...existingTexts, ...newTexts],
                      });
                      setAppendToSr(null);
                      setAppendSelected([]);
                      if (typeof refreshMeditationSection === 'function') await refreshMeditationSection();
                    } catch (err) {
                      console.error('Append failed:', err);
                    } finally {
                      setAppending(false);
                    }
                  }}
                >
                  {appending ? '追加中...' : `追加 ${appendSelected.length} 条`}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'library' && (
          <React.Fragment>
          <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#713f12', marginBottom: '12px' }}>
            ⏳ 此标签页为旧版数据，未来将被 med_* 集合替代。新数据请在「段落文本库」和「原始音频库」中管理。
          </div>
                <AudioLibraryTab
                library={localAudioLibrary}
                saving={savingMeditationAudioLibrary}
                onUpdate={updateMeditationAudioLibrary}
                onQueueTranscodeJob={queueMeditationAudioTranscodeJob}
                onRefresh={refreshMeditationSection}
                />
                </React.Fragment>
                )}

        {activeSubTab === 'presets' && (
          <React.Fragment>
          <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#713f12', marginBottom: '12px' }}>
            ⏳ 此标签页为旧版数据，未来将被 med_* 集合替代。
          </div>
          <MeditationPresetsTab
            meditationLibrary={localLibrary}
            audioLibrary={localAudioLibrary}
            compositionSettings={localCompositionSettings}
            saving={savingMeditationLibrary}
            onUpdate={updateMeditationLibrary}
          />
          </React.Fragment>
        )}
        {activeSubTab === 'composition' && (
          <React.Fragment>
          <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#713f12', marginBottom: '12px' }}>
            ⏳ 此标签页为旧版数据，未来将被 med_* 集合替代。
          </div>
          <CompositionTab
            settings={localCompositionSettings}
            library={localAudioLibrary}
            saving={savingMeditationCompositionSettings}
            onUpdate={updateMeditationCompositionSettings}
          />
          </React.Fragment>
        )}
        {activeSubTab === 'calendar' && (
          <React.Fragment>
          <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#713f12', marginBottom: '12px' }}>
            ⏳ 此标签页为旧版数据，未来将被 med_* 集合替代。
          </div>
          <CalendarTab
            calendar={localCalendar}
            meditationLibrary={localLibrary}
            saving={savingMeditationCalendar}
            onUpdate={updateMeditationCalendar}
          />
          </React.Fragment>
        )}
      </div>

      {/* Paragraph edit modal */}
      {editParagraph && (() => {
        const allAvailableTags = [...new Set(
          (Array.isArray(meditationParagraphs) ? meditationParagraphs : [])
            .flatMap((p) => Array.isArray(p.tags) ? p.tags : [])
        )].sort();
        return (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '16px', padding: '28px',
            width: '520px', maxWidth: '94vw', maxHeight: '80vh', overflowY: 'auto'
          }}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
              编辑段落
              {editParagraph.source === 'ai' && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#6366f1', fontWeight: '400' }}>（AI 生成）</span>}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#64748b', marginBottom: '4px' }}>文本内容</label>
              {lockedParagraphIds.has(editParagraph._id) ? (
                <div style={{ padding: '10px 12px', backgroundColor: '#fef9c3', borderRadius: '8px', fontSize: '13px', color: '#713f12', lineHeight: '1.6' }}>
                  🔒 此段落已加入音频库，不可编辑。如要修改请先从音频库中移除。
                </div>
              ) : (
              <div style={{ position: 'relative' }}>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                style={{ width: '100%', minHeight: '120px', padding: '10px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', lineHeight: '1.6', resize: 'vertical' }}
                placeholder="段落文本内容"
              />
              <button
                style={{ position: 'absolute', bottom: '8px', right: '8px', padding: '3px 8px', border: '1px solid #818cf8', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', backgroundColor: '#eef2ff', color: '#4338ca', whiteSpace: 'nowrap' }}
                onClick={handleAiPolish}
                disabled={polishing || !editText}
              >
                {polishing ? '润色中...' : 'AI润色'}
              </button>
              </div>
            )}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#64748b', marginBottom: '4px' }}>类型</label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', outline: 'none', boxSizing: 'border-box' }}
              >
                <option value="intro">intro</option>
                <option value="breath">breath</option>
                <option value="verse">verse</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#64748b', marginBottom: '4px' }}>标签</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '8px', minHeight: '32px', alignItems: 'center', marginBottom: '6px' }}>
                {(editTags ? editTags.split(',').map((t) => t.trim()).filter(Boolean) : []).map((tag, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', backgroundColor: '#eef2ff', color: '#4338ca', borderRadius: '12px', fontSize: '12px', fontWeight: '500' }}>
                    {tag}
                    <span style={{ cursor: 'pointer', fontSize: '14px', lineHeight: '1', color: '#6366f1' }} onClick={() => {
                      const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
                      tags.splice(i, 1);
                      setEditTags(tags.join(', '));
                    }}>×</span>
                  </span>
                ))}
                <input
                  value={editTagInput}
                  onChange={(e) => setEditTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      const val = editTagInput.replace(/,/g, '').trim();
                      if (val) {
                        const existing = editTags ? editTags.split(',').map((t) => t.trim()).filter(Boolean) : [];
                        setEditTags([...existing, val].join(', '));
                        setEditTagInput('');
                      }
                    }
                  }}
                  style={{ border: 'none', outline: 'none', fontSize: '12px', flex: '1', minWidth: '80px', padding: '2px 4px' }}
                  placeholder="输入后回车添加"
                />
              </div>
              {/* Available tags to click */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {allAvailableTags.map((tag) => {
                  const currentTags = editTags ? editTags.split(',').map((t) => t.trim()).filter(Boolean) : [];
                  const isSelected = currentTags.includes(tag);
                  return (
                    <span
                      key={tag}
                      onClick={() => {
                        if (isSelected) {
                          const idx = currentTags.indexOf(tag);
                          currentTags.splice(idx, 1);
                        } else {
                          currentTags.push(tag);
                        }
                        setEditTags(currentTags.join(', '));
                      }}
                      style={{
                        padding: '2px 10px', borderRadius: '12px', fontSize: '11px', cursor: 'pointer',
                        backgroundColor: isSelected ? '#eef2ff' : '#f1f5f9',
                        color: isSelected ? '#4338ca' : '#64748b',
                        border: isSelected ? '1px solid #818cf8' : '1px solid #e2e8f0',
                      }}
                    >
                      {tag} {isSelected ? '✓' : '+'}
                    </span>
                  );
                })}
              </div>
            </div>

            {editParagraph.source === 'ai' && (
              <div style={{ padding: '8px 12px', backgroundColor: '#fef9c3', borderRadius: '8px', fontSize: '12px', color: '#713f12', marginBottom: '16px' }}>
                ⚠️ 编辑后将清除 AI 标记，AI 图标将消失。
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
              <div style={{ position: 'relative' }}>
                <button
                  style={{ padding: '7px 16px', border: '1px solid #818cf8', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: '#eef2ff', color: '#4338ca', whiteSpace: 'nowrap' }}
                  onClick={() => setSectionRawDropdownOpen(!sectionRawDropdownOpen)}
                  disabled={addingToSectionRaw !== null}
                >
                  {addingToSectionRaw === 'new' ? '新建中...' : addingToSectionRaw ? '追加中...' : '📢 加入音频库 ▾'}
                </button>
                {sectionRawDropdownOpen && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: '4px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', minWidth: '240px', zIndex: 10, maxHeight: '300px', overflowY: 'auto' }}>
                    <div style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: '#1e293b', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => handleAddToSectionRaw('new')}>
                      ✨ 新建 Section-Raw
                    </div>
                    {sectionRawDropdownList.map((sr) => (
                      <div key={sr.id} style={{ padding: '8px 12px', fontSize: '12px', color: '#475569', cursor: 'pointer', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between' }}
                        onClick={() => handleAddToSectionRaw(sr.id)}
                      >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sr.paragraphs?.[0]?.slice(0, 40) || '无内容'}...
                        </span>
                        <span style={{ color: '#94a3b8', marginLeft: '8px', flexShrink: 0 }}>{sr.paragraphs?.length || 0}条</span>
                      </div>
                    ))}
                    {sectionRawDropdownList.length === 0 && (
                      <div style={{ padding: '8px 12px', fontSize: '12px', color: '#94a3b8' }}>暂无已有 Section-Raw</div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
              <button
                style={{ padding: '7px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: '#fff', color: '#475569' }}
                onClick={handleCancelEdit}
              >
                取消
              </button>
              <button
                style={{ padding: '7px 16px', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', backgroundColor: '#1e293b', color: '#fff' }}
                onClick={handleSaveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? '保存中...' : '保存编辑'}
              </button>
            </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

export default MeditationPage;
