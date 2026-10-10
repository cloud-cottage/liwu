import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  buildMeditationSectionRawTextSnapshot,
  buildMeditationTrackDurationEstimate,
  countMeditationSectionChars,
  getMeditationParagraphTypeDisplayLabel,
  getMeditationRecommendedSectionType,
  getMeditationSectionDisplayLabel,
  getMeditationSectionDisplayLabelWithCode,
  getMeditationSectionTargetCharCount,
  getMeditationSectionTypeMeta,
  getMeditationSectionTypeParagraphTypes,
  getMeditationWordCountStatusTone,
  isMeditationParagraphTypeMatchSectionType,
  MEDITATION_PARAGRAPH_TYPE_ORDER,
  MEDITATION_SECTION_TYPE_GROUPS,
  MEDITATION_SECTION_TYPE_LABELS,
  MEDITATION_TRACK_CHAPTER_TEMPLATE,
  MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
  MEDITATION_WORD_COUNT_STATUS_LABELS,
  MEDITATION_WORD_COUNT_STATUS_TONES,
  normalizeMeditationSectionCode,
  resolveMeditationWordCountStatus
} from '@liwu/shared-utils/meditation-track-template.js';
import {
  buildMeditationParagraphReclassificationPlan,
  buildMeditationReclassificationFailureMessage,
  buildMeditationReclassificationNotice,
  compareMeditationReclassificationReadBack
} from '@liwu/shared-utils/meditation-paragraph-reclassify.js';
import {
  buildMeditationSectionDurationMap,
  isMeditationSectionAudioDeliveryComplete,
  MEDITATION_SECTION_AUDIO_FORMATS,
  MEDITATION_SECTION_AUDIO_SOURCE_KINDS,
  MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE,
  MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS,
  MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS_LABELS,
  formatMeditationAudioClock,
  resolveMeditationSectionAudioPlaybackProgress
} from '@liwu/shared-utils/meditation-section-audio.js';
import { createDefaultMeditationTrack } from '@liwu/shared-utils/meditation-track-normalizers.js';
import {
  buildMeditationParagraphAudioPayload,
  getMeditationRecordingExtension,
  isMeditationRecordingSupported,
  isMeditationSectionAudioTranscodePending,
  isMeditationSectionAudioTranscodeRetryable,
  measureMeditationAudioDurationSeconds,
  MEDITATION_PARAGRAPH_SECTION_TYPE_MISSING_MESSAGE,
  MEDITATION_RECORDING_UNSUPPORTED_MESSAGE,
  resolveMeditationAudioTargetFormat,
  resolveMeditationRecordingMimeType,
  resolveMeditationSectionAudioPlaybackAsync,
  startMeditationRecording,
  stopMeditationRecording
} from '../../utils/meditationAudioCapture.js';
import { getLatestCloudBaseProxyTrace } from '../../services/cloudbase.js';
import {
  isMeditationTrackMixJobPending,
  MEDITATION_TRACK_MIX_JOB_STATUS,
  MEDITATION_TRACK_MIX_POLL_INTERVAL_MS,
  MEDITATION_TRACK_MIX_WARNING_HEADLINE,
  resolveMeditationTrackMixTrackVersion,
  resolveMeditationTrackMixWarningLines
} from '../../utils/meditationTrackMixJob.js';
import MeditationTrackPreview from './MeditationTrackPreview.jsx';
import MeditationTrackSlotsEditor from './MeditationTrackSlotsEditor.jsx';
import {
  buildSlotValidationMessage,
  validateMeditationTrackSlots
} from '../../utils/meditationTrackSlots.js';

// ─── Constants ───────────────────────────────────────────────────────────────

// R8：写失败必须让用户看见。统一文案 = 动作名 + err.message，并在可得时附上 CloudBase 代理 requestId
//（数据库层读回断言的消息里已含 requestId 时不重复追加）。
const buildVisibleWriteFailureMessage = (actionLabel, err) => {
  const rawMessage = err?.message || '未知错误';
  const messageHasRequestId = /requestid/i.test(rawMessage);
  const traceRequestId = messageHasRequestId
    ? ''
    : (getLatestCloudBaseProxyTrace?.()?.requestId || err?.requestId || '');
  return `${actionLabel}：${rawMessage}${traceRequestId ? `（requestId: ${traceRequestId}）` : ''}`;
};

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
// 子 Tab 条（规则 B 活跃区，正本 §1.2「子 Tab 顺序」）：key 以代码为准，顺序固定
// paragraph → section-raw → med-tracks。**老四 tab 不在本表内**（其入口自 D10 起隐藏）。
const SUB_TABS = [
  { key: 'paragraph', label: '段落文本库' },
  { key: 'section-raw', label: '原始音频库' },
  { key: 'med-tracks', label: '冥想轨道' }
];

// D10 冻结注册表（老四 tab）—— **保留而非删除**：老组件、老代码、老预览器与老数据留一个版本周期，
// 入口自 D10 起不再出现在子 Tab 条上。本表是**只读闸门**的唯一数据源，闸门共三层：
//   ① 入口层：`SUB_TABS` 不含下表 key ⇒ 子 Tab 条不渲染老四 tab（入口隐藏）；
//   ② 渲染层：`activeSubTab` 命中下表 key（内部 state / hash / devtools 强制激活）时**只渲染只读说明**，
//      老组件渲染分支被 `isFrozenMeditationTab(activeSubTab)` 挡掉（不报错、不白屏）；
//   ③ 写入口层（硬）：传给老组件的 `onUpdate` / `onQueueTranscodeJob` 一律经
//      `blockFrozenMeditationTabWrite` 换成只读桩 ⇒ 真实 writer 不再有任何可达调用点。
// 保留理由：正本 §1.2「冻结定义」＋附录 B.1 D10（冻结只读、老数据保留一个版本周期）。
// 下线时点：D10 之后的下一版本周期末——届时本表、老组件与老数据一并清理。
const FROZEN_MEDITATION_TABS = [
  { key: 'library', label: '音频库' },
  { key: 'presets', label: '冥想库' },
  { key: 'composition', label: '冥想设置' },
  { key: 'calendar', label: '冥想日历' }
];

const FROZEN_MEDITATION_TAB_KEYS = FROZEN_MEDITATION_TABS.map((tab) => tab.key);

const isFrozenMeditationTab = (key) => FROZEN_MEDITATION_TAB_KEYS.includes(key);

// 冻结 tab 的中文名（只读说明里点名，便于操作者确认自己被挡在哪一页）
const getFrozenMeditationTabLabel = (key) => FROZEN_MEDITATION_TABS.find((tab) => tab.key === key)?.label || '';

// 只读桩：老四 tab 的写入口一律换成它（硬闸门）。真实 writer 仅作为 `frozenSource` 保留引用
// （保留而非删除；一个版本周期后随老四 tab 一并下线），闸门本身不再调用它。
const blockFrozenMeditationTabWrite = (writer) => {
  const blockedFrozenTabWrite = async () => ({ blocked: true, reason: 'frozen-tab-readonly' });
  blockedFrozenTabWrite.frozenSource = writer;
  return blockedFrozenTabWrite;
};

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
      // 写入失败必须可见：tab 级提示由 AudioLibraryTab.handleRenameGroup 统一给出，这里再落一条组级提示；
      // 失败时保留组名输入框内容（不重置 groupName），且不向按钮 onClick（未 await）泄漏未捕获拒绝。
      setGroupError(buildVisibleWriteFailureMessage('音频库组重命名失败', error));
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
    try {
      await onSaveItem({
        ...item,
        title,
        duration: Number(editForm.duration) || 0,
        ttsText: normalizedTtsText,
        isSSML: Boolean(editForm.isSSML) || isSsmlText(normalizedTtsText)
      }, item.id);
    } catch (err) {
      // 写入失败必须可见：tab 级提示由 AudioLibraryTab.handleSaveItem 统一给出，这里再落一条组级提示；
      // 同时失败时保持编辑态，并收口按钮 onClick（未 await）造成的未捕获 Promise 拒绝。
      setGroupError(buildVisibleWriteFailureMessage('音频库片段保存失败', err));
      return;
    }
    setEditingId(null);
  };

  const handleDeleteItem = async (item) => {
    const shouldDelete = window.confirm(`确定删除音频片段「${item.title || '未命名音频'}」吗？此操作不可撤销。`);
    if (!shouldDelete) {
      return;
    }

    try {
      await onDeleteItem(item.id);
    } catch (err) {
      // 写入失败必须可见：tab 级提示由 AudioLibraryTab.handleDeleteItem 统一给出，这里再落一条组级提示；
      // 并收口按钮 onClick（未 await）造成的未捕获 Promise 拒绝。
      setGroupError(buildVisibleWriteFailureMessage('音频库片段删除失败', err));
    }
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
          {groupError && <div role="alert" style={{ color: '#dc2626', fontSize: '12px', marginBottom: '10px' }}>{groupError}</div>}
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
  const [writeError, setWriteError] = useState('');
  const handleSaveItem = useCallback(async (item, replacingId) => {
    const currentItems = library.items || [];
    let nextItems;
    if (replacingId) {
      nextItems = currentItems.map((i) => (i.id === replacingId ? item : i));
    } else {
      nextItems = [...currentItems, item];
    }
    setWriteError('');
    try {
      await onUpdate({ ...library, items: nextItems });
    } catch (err) {
      // 写入失败必须可见：tab 级提示 + 继续向上抛，保持调用方（上传/生成/编辑）原有失败分支语义，不吞错。
      setWriteError(buildVisibleWriteFailureMessage('音频库保存失败', err));
      throw err;
    }
  }, [library, onUpdate]);

  const handleDeleteItem = useCallback(async (itemId) => {
    const nextItems = (library.items || []).filter((i) => i.id !== itemId);
    setWriteError('');
    try {
      await onUpdate({ ...library, items: nextItems });
    } catch (err) {
      // 写入失败必须可见：tab 级提示 + 继续向上抛，保持调用方（音频组删除）原有失败分支语义，不吞错。
      setWriteError(buildVisibleWriteFailureMessage('音频库删除失败', err));
      throw err;
    }
  }, [library, onUpdate]);

  const handleRenameGroup = useCallback(async (groupId, nextName) => {
    const normalizedName = String(nextName || '').trim();
    if (!normalizedName) {
      return;
    }

    const nextGroups = (library.groups || []).map((group) => (
      group.id === groupId ? { ...group, name: normalizedName } : group
    ));
    setWriteError('');
    try {
      await onUpdate({ ...library, groups: nextGroups });
    } catch (err) {
      // 写入失败必须可见：tab 级提示 + 继续向上抛，保持调用方（音频组重命名）原有失败分支语义，不吞错。
      setWriteError(buildVisibleWriteFailureMessage('音频库重命名失败', err));
      throw err;
    }
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
      {writeError && (
        <div role="alert" style={{ color: '#b91c1c', fontSize: '12px', marginBottom: '12px' }}>
          {writeError}
        </div>
      )}
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
  const [writeError, setWriteError] = useState('');

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
    setWriteError('');
    try {
      await onUpdate({ ...meditationLibrary, meditations: nextMeditations });
    } catch (err) {
      // 不吞错：写入失败给 tab 级可见提示，同时避免向调用方泄漏未捕获的 Promise 拒绝。
      setWriteError(buildVisibleWriteFailureMessage('冥想库保存失败', err));
      return;
    }
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    const nextMeditations = meditations.filter((m) => m.id !== id);
    setWriteError('');
    try {
      await onUpdate({ ...meditationLibrary, meditations: nextMeditations });
    } catch (err) {
      setWriteError(buildVisibleWriteFailureMessage('冥想库删除失败', err));
      return;
    }
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
      {writeError && (
        <div role="alert" style={{ color: '#b91c1c', fontSize: '12px', marginBottom: '12px' }}>
          {writeError}
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
  const [writeError, setWriteError] = useState('');

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
    setWriteError('');
    try {
      await onUpdate({ ...settings, segments: nextSegments });
    } catch (err) {
      // 写入失败必须可见：tab 级提示；失败时保持编辑面板打开，且不向按钮 onClick（未 await）泄漏未捕获拒绝。
      setWriteError(buildVisibleWriteFailureMessage('冥想设置保存失败', err));
      return;
    }
    setSelectedId(null);
  };

  const handleDelete = async (segId) => {
    setWriteError('');
    try {
      await onUpdate({ ...settings, segments: segments.filter((s) => s.id !== segId) });
    } catch (err) {
      // 写入失败必须可见：tab 级提示；失败时保持编辑面板打开，且不向按钮 onClick（未 await）泄漏未捕获拒绝。
      setWriteError(buildVisibleWriteFailureMessage('冥想设置删除失败', err));
      return;
    }
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
    setWriteError('');
    try {
      await onUpdate({ ...settings, segments: [...segments, newSeg] });
    } catch (err) {
      // 写入失败必须可见：tab 级提示；失败时保持新增面板打开，且不向按钮 onClick（未 await）泄漏未捕获拒绝。
      setWriteError(buildVisibleWriteFailureMessage('冥想设置新增失败', err));
      return;
    }
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
      {writeError && (
        <div role="alert" style={{ color: '#b91c1c', fontSize: '12px', marginBottom: '12px' }}>
          {writeError}
        </div>
      )}
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
  const [writeError, setWriteError] = useState('');

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
    setWriteError('');
    try {
      await onUpdate({ ...calendar, days: nextDays });
    } catch (err) {
      // 写入失败必须可见：tab 级提示；失败时保持当天编辑弹层打开，且不向按钮 onClick（未 await）泄漏未捕获拒绝。
      setWriteError(buildVisibleWriteFailureMessage('冥想日历保存失败', err));
      return;
    }
    setEditingDate(null);
  };

  const handleClearDay = async () => {
    const nextDays = { ...days };
    delete nextDays[editingDate];
    setWriteError('');
    try {
      await onUpdate({ ...calendar, days: nextDays });
    } catch (err) {
      // 写入失败必须可见：tab 级提示；失败时保持当天编辑弹层打开，且不向按钮 onClick（未 await）泄漏未捕获拒绝。
      setWriteError(buildVisibleWriteFailureMessage('冥想日历清除当天失败', err));
      return;
    }
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
            {writeError && (
              <div role="alert" style={{ color: '#b91c1c', fontSize: '12px', marginBottom: '10px' }}>
                {writeError}
              </div>
            )}
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

// ─── 新链路行为共用渲染 ───────────────────────────────────────────────────────

const medBadgeStyle = (tone = 'muted') => ({
  display: 'inline-block',
  padding: '1px 8px',
  borderRadius: '10px',
  fontSize: '11px',
  border: `1px solid ${MEDITATION_WORD_COUNT_STATUS_TONES[tone].borderColor}`,
  backgroundColor: MEDITATION_WORD_COUNT_STATUS_TONES[tone].backgroundColor,
  color: MEDITATION_WORD_COUNT_STATUS_TONES[tone].color
});

// 段名上屏一律**先共享归一、再取中文名**（旧码行必须出中文名，不得退化为原始代号或空白）；
// 中英并列（「中文名｜英文名」）另走 display helper，供宽位使用；窄位仍用纯中文名。
const getSectionTypeLabel = (sectionType = '') => {
  const code = normalizeMeditationSectionCode(sectionType);
  return MEDITATION_SECTION_TYPE_LABELS[code] || code || '未设置';
};

// 上屏标签（宽位）＝「中文名｜英文名」；英文名空缺（背景两轨）时只出中文名，不自拟。
const getSectionTypeDisplayLabel = (sectionType = '') => (
  getMeditationSectionDisplayLabel(sectionType) || getSectionTypeLabel(sectionType)
);

// 分组标题用：＝「中文名｜英文名（新代号）」（代号只在此处作为分组技术标识上屏）。
const getSectionTypeDisplayLabelWithCode = (sectionType = '') => (
  getMeditationSectionDisplayLabelWithCode(sectionType) || getSectionTypeLabel(sectionType)
);

const getSectionTypeChapterLabel = (sectionType = '') => {
  // 旧段码先归一，否则按原始值比对会漏配所属章（章节名本身不变，仍为中文）。
  const code = normalizeMeditationSectionCode(sectionType);
  return (
    MEDITATION_SECTION_TYPE_GROUPS
      .find((group) => group.section_types.some((meta) => meta.section_type === code))?.chapter_label || ''
  );
};

// 纯音频段（无文本、不经 Section-Raw）：由固定模板推导，不在此处硬编码。
const PURE_AUDIO_SECTION_TYPES = MEDITATION_SECTION_TYPE_GROUPS
  .flatMap((group) => group.section_types)
  .filter((meta) => !meta.text_required)
  .map((meta) => meta.section_type);

// 新建 Section-Raw 的默认段＝模板里第一个「需文本」的段（取权威段码，不再硬编码旧码）。
const DEFAULT_NEW_SECTION_TYPE = MEDITATION_SECTION_TYPE_GROUPS
  .flatMap((group) => group.section_types)
  .find((meta) => meta.text_required)?.section_type || '';

// 段落类型默认值＝权威 10 类顺序首项（弃用旧默认 'verse'，也弃用旧 3 类分类口径）。
const DEFAULT_MEDITATION_PARAGRAPH_TYPE = MEDITATION_PARAGRAPH_TYPE_ORDER[0];

// 段落类型写侧白名单：只有权威 10 类内的代号允许落库，其余一律拒绝（不吞、不猜、不自拟）。
const isMeditationParagraphTypeAllowed = (paragraphType) => (
  MEDITATION_PARAGRAPH_TYPE_ORDER.includes(String(paragraphType ?? '').trim())
);

const formatAudioDuration = (seconds) => (
  Number(seconds) > 0 ? formatSeconds(Math.round(Number(seconds))) : '时长未知'
);

const SOURCE_KIND_LABELS = {
  [MEDITATION_SECTION_AUDIO_SOURCE_KINDS.recording]: '网页录音',
  [MEDITATION_SECTION_AUDIO_SOURCE_KINDS.upload]: '文件上传',
  [MEDITATION_SECTION_AUDIO_SOURCE_KINDS.legacyImport]: '历史导入'
};

const getSourceKindLabel = (sourceKind = '') => SOURCE_KIND_LABELS[sourceKind] || sourceKind || '未知来源';

// ─── 录音 / 上传控件（MediaRecorder；不支持时给出明确提示，不做调试开关掩盖） ──

const MeditationRecordingControl = ({ disabled, busy, onCaptured, recordLabel = '● 网页录音', uploadLabel = '上传音频文件' }) => {
  const [recording, setRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [controlError, setControlError] = useState('');
  const sessionRef = useRef(null);
  const timerRef = useRef(null);
  const recordingSupported = isMeditationRecordingSupported();
  const recordingCandidate = recordingSupported ? resolveMeditationRecordingMimeType() : null;
  const usesMp3Fallback = Boolean(recordingCandidate && recordingCandidate.target_format !== MEDITATION_SECTION_AUDIO_FORMATS.opus);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => {
    clearTimer();
    const session = sessionRef.current;
    if (session?.mediaRecorder && session.mediaRecorder.state !== 'inactive') {
      session.mediaRecorder.stop();
    }
    session?.stream?.getTracks?.().forEach((track) => track.stop());
  }, []);

  const handleStartRecording = async () => {
    setControlError('');
    const mimeCandidate = resolveMeditationRecordingMimeType();
    if (!mimeCandidate) {
      setControlError(MEDITATION_RECORDING_UNSUPPORTED_MESSAGE);
      return;
    }

    setPreparing(true);
    try {
      sessionRef.current = await startMeditationRecording({ mimeType: mimeCandidate.mime_type });
      setElapsedSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsedSeconds((previous) => previous + 1), 1000);
    } catch (err) {
      setControlError(err.message || MEDITATION_RECORDING_UNSUPPORTED_MESSAGE);
    } finally {
      setPreparing(false);
    }
  };

  const handleStopRecording = async () => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    clearTimer();
    setRecording(false);
    setPreparing(true);
    try {
      const { blob, mime_type: recordedMimeType } = await stopMeditationRecording(session);
      sessionRef.current = null;
      const extension = getMeditationRecordingExtension(recordedMimeType);
      const file = new File([blob], `take-${Date.now()}.${extension}`, { type: recordedMimeType });
      await onCaptured({ file, mimeType: recordedMimeType, sourceKind: MEDITATION_SECTION_AUDIO_SOURCE_KINDS.recording });
    } catch (err) {
      setControlError(err.message || '录音处理失败');
    } finally {
      setPreparing(false);
    }
  };

  const handleUploadSelected = async (file) => {
    if (!file) {
      return;
    }

    setControlError('');
    try {
      await onCaptured({ file, mimeType: file.type || '', sourceKind: MEDITATION_SECTION_AUDIO_SOURCE_KINDS.upload });
    } catch (err) {
      setControlError(err.message || '上传失败');
    }
  };

  const renderRecordButton = () => {
    if (recording) {
      return (
        <button
          style={{ ...dangerBtnStyle, padding: '3px 10px' }}
          onClick={handleStopRecording}
          disabled={preparing}
        >
          ■ 停止录音
        </button>
      );
    }

    return (
      <button
        style={{ ...ghostBtnStyle, padding: '3px 10px' }}
        onClick={handleStartRecording}
        disabled={disabled || busy || preparing || !recordingSupported}
      >
        {preparing ? '准备中…' : recordLabel}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      {renderRecordButton()}
      {recording && <span style={{ color: '#dc2626', fontSize: '11px' }}>录音中 {formatSeconds(elapsedSeconds)}</span>}
      {busy && <span style={{ color: '#64748b', fontSize: '11px' }}>处理中…</span>}
      <label style={{ ...ghostBtnStyle, padding: '3px 10px', display: 'inline-block', opacity: disabled || busy ? 0.6 : 1 }}>
        {uploadLabel}
        <input
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          disabled={disabled || busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) {
              handleUploadSelected(file);
            }
          }}
        />
      </label>
      {usesMp3Fallback && (
        <span style={{ fontSize: '11px', color: '#b45309' }}>当前浏览器不支持 Opus 录制，按 mp3 兜底链路处理</span>
      )}
      {!recordingSupported && (
        <span style={{ fontSize: '11px', color: '#b45309' }}>⚠ {MEDITATION_RECORDING_UNSUPPORTED_MESSAGE}</span>
      )}
      {controlError && <span style={{ fontSize: '11px', color: '#ef4444' }}>❌ {controlError}</span>}
    </div>
  );
};

// ─── 冥想轨道（med_tracks）────────────────────────────────────────────────────

const MeditationTracksTab = ({ track, sectionDurationSecondsByType, sectionAudios, saving, onSave, onRefreshTrack }) => {
  const [draft, setDraft] = useState(() => track);
  const [saveNotice, setSaveNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  // R43-③：预览**基于已保存版本**（`track` 是库中已保存的 Track，不是草稿）⇒ 预览面板单独开关。
  const [previewOpen, setPreviewOpen] = useState(false);
  const estimate = buildMeditationTrackDurationEstimate({
    chapters: draft.chapters,
    sectionDurationSecondsByType
  });

  // 槽位写侧校验（R49-② 写入侧纪律）：`slot_index` 同章唯一且有序 / `section_type` 非空且在章允许
  // 范围（无推荐映射不得写空）/ `pinned` 的 `audio_id` 必须存在于音频库 / `policy` 属允许值。
  // 空 `slots`＝老语义（R49-③，不迁移），故老 Track 天然通过、保存不写槽位。逐项错误上屏、不得静默。
  const slotValidation = validateMeditationTrackSlots({ chapters: draft.chapters, sectionAudios });

  // ── 混合音频（服务端预混产物）─────────────────────────────────────────────
  // 产物台账＝med_tracks.mix_audio（云侧转码器回写）；「产物缺失或版本落后」＝无 mix_audio
  // 或 mix_audio.version ≠ 当前 Track 版本。判据一律读**已保存版本**（`track` 传参、不读草稿）：
  // 产物对应的就是库里那一版的章节配置。
  const trackMixAudio = track.mix_audio || null;
  const currentTrackVersion = resolveMeditationTrackMixTrackVersion(track);
  const mixAudioStale = !trackMixAudio || Number(trackMixAudio.version) !== currentTrackVersion;

  const [mixJob, setMixJob] = useState(null);
  const [mixQueueing, setMixQueueing] = useState(false);
  const [mixNotice, setMixNotice] = useState('');
  const [mixError, setMixError] = useState('');
  // 混音**成功**时 job 文档带回的可见警告（超软基准 / 时长不变量失配）：**不阻断、不改终态**，
  // 只把文案上屏（空数组＝无警告、不显示）。job 失败仍走 mixError 分支。
  const [mixWarnings, setMixWarnings] = useState([]);
  const mixJobId = mixJob?._id || '';
  const mixPending = isMeditationTrackMixJobPending(mixJob || {});

  // 刷新轨道数据的回调放进 ref：父组件每次渲染都会换新函数实例，直接进 effect 依赖会让轮询被
  // 反复重建（父组件渲染比轮询间隔频繁时，定时器永远等不到触发）。
  const refreshTrackRef = useRef(onRefreshTrack);
  useEffect(() => {
    refreshTrackRef.current = onRefreshTrack;
  }, [onRefreshTrack]);

  // 轮询风格与「音频库」tab 的转码状态轮询一致（定时轮询、终态即停）：成功 ⇒ 刷新 Track 数据
  //（面板随即显示产物的 version / duration）；失败 ⇒ 显示 job 的 transcode_error 文案。
  useEffect(() => {
    if (!mixPending) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          const job = await DatabaseService.getMeditationAudioTranscodeJob(mixJobId);
          if (!job) {
            return;
          }

          if (job.status === MEDITATION_TRACK_MIX_JOB_STATUS.succeeded) {
            setMixJob(null);
            // 产物**已成功产出**（终态不变）；job 文档若带可见警告（超软基准 900s / 时长不变量失配）⇒ 一并上屏。
            setMixWarnings(resolveMeditationTrackMixWarningLines(job));
            setMixNotice('混合音频已生成');
            await refreshTrackRef.current?.();
            return;
          }

          if (job.status === MEDITATION_TRACK_MIX_JOB_STATUS.failed) {
            setMixJob(null);
            setMixError(job.transcode_error || job.error_message || '混合音频生成失败');
          }
        } catch (err) {
          setMixError(err?.message || '混合音频状态查询失败');
        }
      })();
    }, MEDITATION_TRACK_MIX_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [mixPending, mixJobId]);

  // 入队：人声段缺音频 / 无可用背景章时数据层会拒绝，错误文案原样上屏（含缺哪一段）。
  const handleGenerateMixAudio = async () => {
    setMixQueueing(true);
    setMixNotice('');
    setMixError('');
    setMixWarnings([]);
    try {
      const job = await DatabaseService.createMeditationTrackMixTranscodeJob({ track });
      setMixJob(job);
      setMixNotice(job?.reused ? '已有进行中的混音任务，沿用该任务' : '已入队，等待云侧转码器生成');
    } catch (err) {
      setMixJob(null);
      setMixError(err?.message || '混音任务入队失败');
    } finally {
      setMixQueueing(false);
    }
  };

  const updateDraft = (patch) => {
    setSaveNotice('');
    setSaveError('');
    setDraft((previous) => ({ ...previous, ...patch }));
  };

  const updateChapter = (chapterKey, patch) => {
    setSaveNotice('');
    setSaveError('');
    setDraft((previous) => ({
      ...previous,
      chapters: previous.chapters.map((chapter) => (
        chapter.chapter_key === chapterKey ? { ...chapter, ...patch } : chapter
      ))
    }));
  };

  const handleSave = async () => {
    setSaveNotice('');
    setSaveError('');
    // 写入前校验（不得把非法槽位发出去）；逐项错误上屏、不得静默、不得声称「无权限」。
    if (!slotValidation.ok) {
      setSaveError(buildSlotValidationMessage(slotValidation));
      return;
    }
    try {
      const saved = await onSave(draft);
      // 版本号回写草稿：同一会话内连续保存必须基于新版本，才能每次保存 +1（D7 可复现追溯）。
      if (saved?.version) {
        setDraft((previous) => ({ ...previous, version: saved.version }));
      }
      setSaveNotice('已保存到 med_tracks');
    } catch (err) {
      setSaveError(err.message || '保存失败');
    }
  };

  const renderChapterRow = (chapter, index) => {
    const chapterEstimate = estimate.chapters.find((item) => item.chapter_key === chapter.chapter_key);
    const isLastChapter = index === draft.chapters.length - 1;

    return (
      <div
        key={chapter.chapter_key}
        style={{
          paddingTop: index > 0 ? '8px' : 0,
          borderTop: index > 0 ? '1px solid #f8fafc' : 'none'
        }}
      >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          padding: '8px 0'
        }}
      >
        <div style={{ width: '140px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{chapter.order}. {chapter.label}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>{chapter.chapter_key}</div>
        </div>
        <div style={{ flex: '1 1 260px', fontSize: '12px', color: '#64748b' }}>
          Section 序列（固定只读）：{chapter.section_types.map(getSectionTypeDisplayLabel).join(' → ')}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#475569' }}>
          <input
            type="checkbox"
            checked={chapter.enabled}
            onChange={(event) => updateChapter(chapter.chapter_key, { enabled: event.target.checked })}
          />
          章开关
        </label>
        <label style={{ fontSize: '12px', color: '#475569' }}>
          时长上限(s)
          <input
            type="number"
            min="1"
            style={{ ...inputStyle, width: '76px', padding: '4px 8px', marginLeft: '4px' }}
            value={chapter.max_duration_seconds}
            onChange={(event) => updateChapter(chapter.chapter_key, { max_duration_seconds: Number(event.target.value) })}
          />
        </label>
        {isLastChapter ? (
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>末章无章间留白</span>
        ) : (
          <label style={{ fontSize: '12px', color: '#475569' }}>
            章间留白(s)
            <input
              type="number"
              min="0"
              style={{ ...inputStyle, width: '76px', padding: '4px 8px', marginLeft: '4px' }}
              value={chapter.gap_after_seconds}
              onChange={(event) => updateChapter(chapter.chapter_key, { gap_after_seconds: Number(event.target.value) })}
            />
          </label>
        )}
        <span style={{ fontSize: '12px', color: '#334155' }}>本章 {formatSeconds(chapterEstimate?.seconds || 0)}</span>
        {chapterEstimate?.exceeds_max_duration && (
          <span style={medBadgeStyle('danger')}>⚠ 超出时长上限</span>
        )}
      </div>
      <MeditationTrackSlotsEditor
        chapter={chapter}
        poolAudios={sectionAudios || []}
        errors={slotValidation.errors.filter((error) => error.chapter_key === chapter.chapter_key)}
        onChange={(slots) => updateChapter(chapter.chapter_key, { slots })}
      />
      </div>
    );
  };

  const renderEstimateSummary = () => (
    <div style={{ marginTop: '12px', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', fontSize: '12px', color: '#334155' }}>
      <div>
        预估 Track 总时长：<strong>{formatSeconds(estimate.total_seconds)}</strong>
        <span style={medBadgeStyle(estimate.estimated ? 'warning' : 'ok')}>{estimate.estimated ? '预估（含标称值）' : '全部实测'}</span>
      </div>
      <div style={{ marginTop: '4px', color: '#64748b' }}>
        内容 {formatSeconds(estimate.content_seconds)} + 章间留白 {formatSeconds(estimate.gap_seconds)}
      </div>
      {/* 两条口径必须分开陈述：本面板「内容」在缺实测时＝各段时长上限之和（现为 970 秒）；
          「15:00 软基准」是目标值、不做尾部截断。二者不互相推导（文案零编号）。 */}
      <div style={{ marginTop: '2px', color: '#94a3b8' }}>
        两条口径分开看：15:00 软基准（软目标，不做尾部截断）与上面「内容」不是同一把尺子——缺实测时「内容」＝各段时长上限之和，不得由任一口径推出另一个
      </div>
    </div>
  );

  return (
    <div>
      <div style={sectionTitleStyle}>冥想轨道</div>
      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
        六章顺序、章节数量、章内 Section 序列由固定模板决定，不可修改、不可重复；此处只能调整章开关、章时长上限与章间留白。
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <label style={{ fontSize: '12px', color: '#475569' }}>
          轨道名称
          <input
            style={{ ...inputStyle, width: '220px', padding: '6px 10px', marginLeft: '4px' }}
            value={draft.name}
            onChange={(event) => updateDraft({ name: event.target.value })}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#475569' }}>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => updateDraft({ enabled: event.target.checked })}
          />
          轨道启用
        </label>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          {draft.track_key} · v{draft.version} · 双轨：背景 loop {MEDITATION_TRACK_VOLUMES.background} / 人声 sequence {MEDITATION_TRACK_VOLUMES.voice}
        </span>
        <button style={{ ...primaryBtnStyle, padding: '6px 14px' }} onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存 Track'}
        </button>
        {/* R43 实现约束 3：最小插入点＝保存按钮之后。预览取**已保存版本**（`track` 传入，**不传草稿**）。 */}
        <button
          style={{ ...ghostBtnStyle, padding: '6px 14px' }}
          onClick={() => setPreviewOpen((previous) => !previous)}
          disabled={saving}
        >
          预览 Track
        </button>
        {saveNotice && <span style={{ fontSize: '12px', color: '#16a34a' }}>✅ {saveNotice}</span>}
        {saveError && <span role="alert" style={{ fontSize: '12px', color: '#ef4444', whiteSpace: 'pre-line' }}>❌ {saveError}</span>}
      </div>

      {/* 混合音频（服务端预混单流产物）：产物缺失或版本落后时才给「生成混合音频」入口；
          入队后按钮转「生成中（已入队）」并按定时轮询读 job 状态。 */}
      <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', fontSize: '12px', color: '#334155', marginBottom: '12px' }}>
        <div>
          {trackMixAudio
            ? `混合音频产物：v${trackMixAudio.version} · 时长 ${trackMixAudio.duration}s`
            : '混合音频产物：尚未生成'}
        </div>
        {mixAudioStale && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
            <button
              style={{ ...primaryBtnStyle, padding: '6px 14px' }}
              onClick={handleGenerateMixAudio}
              disabled={mixQueueing || mixPending}
            >
              {mixQueueing ? '入队中…' : mixPending ? '生成中（已入队）' : '生成混合音频'}
            </button>
            <span style={{ color: '#64748b' }}>
              人声按章序拼接、背景循环铺满；产物版本跟随当前 Track 版本（v{currentTrackVersion}）
            </span>
          </div>
        )}
        {mixNotice && <div style={{ color: '#16a34a', marginTop: '4px' }}>✅ {mixNotice}</div>}
        {mixError && <div role="alert" style={{ color: '#ef4444', marginTop: '4px' }}>❌ {mixError}</div>}
        {/* 混音**成功**但 job 报告可见警告（超出 15:00 软基准 / 时长不变量失配）：**已照常产出、
            不阻断、不改终态**，只提示人工留意（文案零规范编号）。 */}
        {mixWarnings.length > 0 && (
          <div
            role="status"
            style={{
              marginTop: '6px',
              padding: '8px 10px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '6px',
              color: '#b45309'
            }}
          >
            <div style={{ fontWeight: 600 }}>⚠️ {MEDITATION_TRACK_MIX_WARNING_HEADLINE}</div>
            {mixWarnings.map((warningLine, index) => (
              <div key={`${index}-${warningLine}`} style={{ marginTop: '2px' }}>· {warningLine}</div>
            ))}
          </div>
        )}
      </div>

      {draft.chapters.map((chapter, index) => renderChapterRow(chapter, index))}

      {renderEstimateSummary()}

      {/* R43-③：预览基于**已保存版本**（`track.version`，不传草稿）；实测预览总时长与上方面板估算
          **并列展示、不是同一把尺子**（R43-⑧）。 */}
      {previewOpen && (
        <MeditationTrackPreview
          key={`preview-${track._id || track.track_key}-v${Number(track.version) || 0}`}
          trackId={track._id || ''}
          trackKey={track.track_key || ''}
          savedVersion={Number(track.version) || 0}
          onClose={() => setPreviewOpen(false)}
        />
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
  aiSettings,
  medTracks,
  savingMeditationAudioLibrary,
  savingMeditationCompositionSettings,
  savingMeditationCalendar,
  savingMeditationLibrary,
  savingMedTracks,
  updateMeditationAudioLibrary,
  queueMeditationAudioTranscodeJob,
  updateMeditationCompositionSettings,
  updateMeditationCalendar,
  updateMeditationLibrary,
  loadMedTracks,
  saveMedTrack,
  refreshMeditationSection,
  settingsError
}) => {
  const [activeSubTab, setActiveSubTab] = useState('paragraph');
  const [activeFilter, setActiveFilter] = useState('all');

  // Minimal create form state (P0)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState(DEFAULT_MEDITATION_PARAGRAPH_TYPE);
  const [newTags, setNewTags] = useState('');

  // Section-Raw 编排与音频状态（唯一音频口径：med_section_audios）
  const [sectionRawItems, setSectionRawItems] = useState([]);
  const [sectionAudios, setSectionAudios] = useState([]);
  const [showSectionCreateForm, setShowSectionCreateForm] = useState(false);
  const [selectedParagraphIds, setSelectedParagraphIds] = useState([]);
  const [newSectionType, setNewSectionType] = useState(DEFAULT_NEW_SECTION_TYPE);
  const [sectionParagraphTypeFilter, setSectionParagraphTypeFilter] = useState('all');
  const [sectionAudioStatus, setSectionAudioStatus] = useState({}); // { [containerId]: { busy, notice, error } }
  const [pureAudioSectionType, setPureAudioSectionType] = useState('sec-nature');
  const [tracksLoaded, setTracksLoaded] = useState(false);
  const [medTracksError, setMedTracksError] = useState('');
  const [sectionRawFormError, setSectionRawFormError] = useState('');

  const playingAudioRef = useRef(null);
  // 当前播放实例的状态键（containerId）；配合 status.playingId 区分同容器多条候选中的「这一条」。
  const playingSectionAudioContainerIdRef = useRef('');

  useEffect(() => () => {
    playingAudioRef.current?.pause?.();
  }, []);

  const isDev = import.meta.env?.DEV === true;

  // minimal create handler (P0 tiny follow-up)
  const handleCreateParagraph = async () => {
    // 写侧白名单：超出权威 10 类的值一律拒绝，不落库。
    if (!isMeditationParagraphTypeAllowed(newType)) {
      alert(`段落类型不合法，仅允许权威 10 类：${getMeditationParagraphTypeDisplayLabel(newType)}`);
      return;
    }
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
        paragraph_type: originalParagraph.paragraph_type || DEFAULT_MEDITATION_PARAGRAPH_TYPE,
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
      // R8：仿写写库链路（createMedParagraph / updateMedParagraph / 刷新）失败原本只进控制台，
      // 用户只看到按钮从「改写中...」复原、无从判断是否成功。改为可见提示（与本函数内 L3098 的 alert 风格一致）。
      alert(buildVisibleWriteFailureMessage('AI 仿写失败', err));
    } finally {
      setRewritingId(null);
    }
  };

  // tiny dev seed helper for paragraph tab (hardcoded from test cases doc "0. Data Setup Notes")
  // 类型取值域＝权威 10 类（MEDITATION_PARAGRAPH_TYPE_ORDER），不再只用旧 intro / breath / verse 三类。
  const handleSeedParagraphs = async () => {
    const samples = [
      // 1. intro 开场, usage=0 (0 stars)
      {
        text: "欢迎来到理悟冥想空间。",
        paragraph_type: "intro",
        tags: ["greeting", "intro"],
        usage_count: 0,
        source: "manual",
        created_by: "test-admin-001",
      },
      // 2. posture 正身调姿, usage=2
      {
        text: "请保持舒适的姿势，闭上双眼。",
        paragraph_type: "posture",
        tags: ["posture"],
        usage_count: 2,
        source: "manual",
        created_by: "test-admin-001",
      },
      // 3. breath 三阶净息, usage=5 (mid stars)
      {
        text: "慢慢吸气... 感受腹部鼓起... 缓缓呼出... 释放所有压力。",
        paragraph_type: "breath",
        tags: ["breathing"],
        usage_count: 5,
        source: "manual",
        created_by: "test-admin-001",
      },
      // 4. prelude 调息锚定, usage=0
      {
        text: "吸气四秒，屏息四秒，呼气六秒。",
        paragraph_type: "prelude",
        tags: [],
        usage_count: 0,
        source: "ai",
        created_by: "test-admin-001",
      },
      // 5. verse 理悟立论, usage=12 (high stars)
      {
        text: "心如止水，念随息去。每一呼吸引导你回归当下。",
        paragraph_type: "verse",
        tags: ["heart", "verse"],
        usage_count: 12,
        source: "manual",
        created_by: "test-admin-001",
      },
      // 6. outro 圆满回向, usage=25 (higher)
      {
        text: "在宁静中觉察，在觉察中成长。愿你与这份平静同在。",
        paragraph_type: "outro",
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

  // ── Section-Raw 编排（新链路只写 med_* 集合；音频以 med_section_audios 为唯一口径） ──

  const getParagraphById = useCallback((paragraphId) => (
    (Array.isArray(meditationParagraphs) ? meditationParagraphs : [])
      .find((paragraph) => (paragraph._id || paragraph.id) === paragraphId) || null
  ), [meditationParagraphs]);

  const resolveParagraphTexts = useCallback((paragraphIds) => (
    (Array.isArray(paragraphIds) ? paragraphIds : [])
      .map((paragraphId) => String(getParagraphById(paragraphId)?.text || ''))
  ), [getParagraphById]);

  const loadSectionRaws = useCallback(async () => {
    const data = await DatabaseService.getMedSectionRaws();
    setSectionRawItems((Array.isArray(data) ? data : []).map((item, index) => ({
      id: item._id || item.id || `sr-${index}`,
      _id: item._id || '',
      section_type: item.section_type || '',
      paragraph_ids: Array.isArray(item.paragraph_ids) ? item.paragraph_ids : [],
      target_char_count: Number(item.target_char_count ?? 0),
      current_char_count: Number(item.current_char_count ?? 0),
      word_count_status: item.word_count_status || '',
      audio_id: item.audio_id || '',
      audio_candidates: Array.isArray(item.audio_candidates) ? item.audio_candidates : [],
      stale: Boolean(item.stale),
      stale_reason: item.stale_reason || '',
      stale_paragraph_ids: Array.isArray(item.stale_paragraph_ids) ? item.stale_paragraph_ids : [],
      stale_at: item.stale_at || '',
      text_snapshot: item.text_snapshot || '',
      record_granularity: item.record_granularity || 'paragraph',
      recorded_at: item.recorded_at || ''
    })));
  }, []);

  const loadSectionAudios = useCallback(async () => {
    const data = await DatabaseService.getMedSectionAudios();
    setSectionAudios(Array.isArray(data) ? data : []);
  }, []);

  // 段落音频（一段一录）：凭 paragraph_ids_snapshot 找到该段落自己的 take。
  const getParagraphAudios = useCallback((paragraphId = '') => (
    sectionAudios.filter((audio) => (
      Array.isArray(audio.paragraph_ids_snapshot) && audio.paragraph_ids_snapshot.includes(paragraphId)
    ))
  ), [sectionAudios]);

  // Section-Raw 候选池＝它名下各段落的 take 汇总：既收直接挂本 raw 的音频（历史），
  // 也收凭 paragraph_ids_snapshot 归属于本 raw 段落的段落录音（一段一录不挂 section_raw_id）。
  const getSectionRawAudios = useCallback((sectionRawId = '', paragraphIds = []) => (
    sectionAudios.filter((audio) => {
      if ((audio.section_raw_id || '') === sectionRawId) {
        return true;
      }
      if (!sectionRawId || paragraphIds.length === 0) {
        return false;
      }
      const snapshot = Array.isArray(audio.paragraph_ids_snapshot) ? audio.paragraph_ids_snapshot : [];
      return snapshot.some((paragraphId) => paragraphIds.includes(paragraphId));
    })
  ), [sectionAudios]);

  // 状态回显容器：优先 Section-Raw，其次该音频唯一挂载的段落，最后纯音频段容器。
  const getAudioStatusContainerId = (audio = {}) => (
    audio.section_raw_id
    || (Array.isArray(audio.paragraph_ids_snapshot) ? audio.paragraph_ids_snapshot[0] : '')
    || 'audio-only'
  );

  const setAudioStatus = (containerId, patch) => {
    setSectionAudioStatus((previous) => ({
      ...previous,
      [containerId]: { ...(previous[containerId] || {}), ...patch }
    }));
  };

  // 清掉「当前正在播放卡片」的播放态（进度条 / 时钟 / playing 一并清除）；幂等。
  const clearSectionAudioPlayingStatus = () => {
    const playingContainerId = playingSectionAudioContainerIdRef.current;
    playingSectionAudioContainerIdRef.current = '';
    if (playingContainerId) {
      setAudioStatus(playingContainerId, { playing: false, playingId: '', currentTime: 0, duration: 0 });
    }
  };

  // 停止播放：暂停当前实例并清掉其卡片播放态（单实例语义的唯一停点）。
  const stopSectionAudioPlayback = () => {
    playingAudioRef.current?.pause?.();
    playingAudioRef.current = null;
    clearSectionAudioPlayingStatus();
  };

  const isSectionRawStale = (raw) => {
    if (raw.stale) {
      return true;
    }

    if (!raw.text_snapshot) {
      return false;
    }

    return buildMeditationSectionRawTextSnapshot(resolveParagraphTexts(raw.paragraph_ids)) !== raw.text_snapshot;
  };

  const toggleSectionCreateForm = () => {
    setSectionRawFormError('');
    setShowSectionCreateForm((previous) => {
      const next = !previous;
      if (!next) {
        setSelectedParagraphIds([]);
        setSectionParagraphTypeFilter('all');
      }
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
    const sectionMeta = getMeditationSectionTypeMeta(newSectionType);
    if (!sectionMeta?.text_required) {
      setSectionRawFormError('纯音频段（自然 / 颂钵）不经 Section-Raw，直接在下方录制或上传音频。');
      return;
    }

    if (!selectedParagraphIds.length) {
      setSectionRawFormError('请先选择组成该 Section-Raw 的段落。');
      return;
    }

    setSectionRawFormError('');
    const currentCharCount = countMeditationSectionChars(resolveParagraphTexts(selectedParagraphIds));
    const targetCharCount = getMeditationSectionTargetCharCount(newSectionType) ?? 0;

    try {
      await DatabaseService.createMedSectionRaw({
        section_type: newSectionType,
        paragraph_ids: [...selectedParagraphIds],
        target_char_count: targetCharCount,
        current_char_count: currentCharCount,
        word_count_status: resolveMeditationWordCountStatus(currentCharCount, targetCharCount),
        record_granularity: 'paragraph',
        created_by: 'admin-section-raw'
      });
      setShowSectionCreateForm(false);
      setSelectedParagraphIds([]);
      setSectionParagraphTypeFilter('all');
      await loadSectionRaws();
      if (typeof refreshMeditationSection === 'function') {
        await refreshMeditationSection();
      }
    } catch (err) {
      console.error('Failed to create med section raw:', err);
      setSectionRawFormError(err.message || '保存失败');
    }
  };

  // 转码调用点（执行器第二批实现）：上传成功后排队 Opus 转码任务，并同步转码状态。
  const queueSectionAudioTranscode = async ({ sectionAudio, sectionType, cloudPath, fileId, fileName, targetFormat }) => {
    const targetExtension = targetFormat === MEDITATION_SECTION_AUDIO_FORMATS.opus ? 'opus' : 'mp3';
    try {
      await DatabaseService.createMeditationAudioTranscodeJob({
        itemId: sectionAudio.section_raw_id || sectionAudio._id,
        section_audio_id: sectionAudio._id,
        section_raw_id: sectionAudio.section_raw_id || '',
        section_type: sectionType,
        target_format: targetFormat,
        sourceFileId: fileId,
        sourceFileName: fileName || 'audio.bin',
        sourceCloudPath: cloudPath,
        targetCloudPath: `meditation-audio/${sectionType}/${sectionAudio.section_raw_id || 'audio-only'}/take-${sectionAudio._id}.${targetExtension}`,
        transcode_profile: 'section_audio'
      });
      await DatabaseService.updateMedSectionAudio(sectionAudio._id, {
        transcode_status: MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.queued
      });
      return { queued: true, error: '' };
    } catch (transcodeErr) {
      console.error('section audio transcode queue failed:', transcodeErr);
      const queueErrorMessage = transcodeErr?.message || '转码任务排队失败';
      try {
        await DatabaseService.updateMedSectionAudio(sectionAudio._id, {
          transcode_status: MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.idle,
          transcode_error: queueErrorMessage
        });
      } catch (statusErr) {
        console.error('section audio transcode status update failed:', statusErr);
        // R8：排队失败且状态回写也失败时，两层错误都必须回到调用方，否则用户只看到「（转码任务未排队）」而不知原因。
        return { queued: false, error: `${queueErrorMessage}（转码状态回写亦失败：${statusErr?.message || '未知错误'}）` };
      }
      return { queued: false, error: queueErrorMessage };
    }
  };

  // 网页录音 / 文件上传 → med_section_audios → 回写 Section-Raw 引用。
  // 快照/候选序号/回写一律查库获取（数据层驱动），不依赖 sectionRawItems 内存态。
  const handleSectionAudioCaptured = async ({ sectionRawId = '', sectionType }, capture) => {
    const containerId = sectionRawId || 'audio-only';
    setAudioStatus(containerId, { busy: true, error: '', notice: '' });

    try {
      const capturedMimeType = capture.mimeType || capture.file.type || '';
      const durationSeconds = await measureMeditationAudioDurationSeconds(capture.file);
      const existingAudios = await DatabaseService.getMedSectionAudiosByContainer({ sectionRawId, sectionType });
      const takeIndex = existingAudios.length + 1;
      const extension = getMeditationRecordingExtension(capturedMimeType);
      const cloudPath = `meditation-audio-raw/${sectionType}/${sectionRawId || 'audio-only'}/take-${takeIndex}.${extension}`;
      const { fileId, audioUrl } = await uploadAudioFile({ file: capture.file, cloudPath });
      const snapshot = await DatabaseService.getMedSectionRawSnapshotById(sectionRawId);
      const targetFormat = resolveMeditationAudioTargetFormat(capturedMimeType);
      // 纯音频段（sec-nature / sec-bowl）无 Section-Raw，label 作为候选显示名写入。
      // 前缀用章节名（自然库 / 颂钵库）与 Track 章节命名一致；take 序号逻辑不变。
      const labelPrefix = getSectionTypeChapterLabel(sectionType) || getSectionTypeLabel(sectionType);
      const label = sectionRawId ? '' : `${labelPrefix} take-${takeIndex}`;

      const created = await DatabaseService.createMedSectionAudio({
        section_raw_id: sectionRawId,
        section_type: sectionType,
        // 转码未完成：Opus 主体与 mp3 兜底 URL 均为空，transcoded_formats 初始为 []
        // （由 toMedSectionAudioPayload 按已登记的交付 URL 推导）。
        file_id: '',
        audio_url: '',
        duration: Math.round(durationSeconds * 100) / 100,
        mime_type: MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE.opus,
        original_file_id: fileId,
        original_url: audioUrl,
        original_mime_type: capturedMimeType,
        target_format: targetFormat,
        source_kind: capture.sourceKind,
        label,
        paragraph_ids_snapshot: snapshot.paragraph_ids,
        text_snapshot: snapshot.text_snapshot,
        char_count: snapshot.char_count,
        // 【本单新增】③ 输入体积登记（客户端侧）：本地 File 字节数（与云侧 job.input_bytes 配对）。
        source_size: capture.file.size,
        stale: false
      });

      if (sectionRawId && created?._id) {
        const attached = await DatabaseService.attachMedSectionAudioToRaw(sectionRawId, created._id);
        // attach 返回 null = 业务上找不到目标 Section-Raw（已被删除等）：音频已落库但候选引用没写回，
        // 必须让用户看见，不能静默通过（环境/写入异常由数据层直接抛错）。
        if (!attached) {
          throw new Error('音频已保存，但未能回写 Section-Raw 候选引用（目标不存在或已被删除），请刷新后重试');
        }
      }

      const transcodeQueue = await queueSectionAudioTranscode({
        sectionAudio: created,
        sectionType,
        cloudPath,
        fileId,
        fileName: capture.file.name,
        targetFormat
      });

      await loadSectionAudios();
      if (sectionRawId) {
        await loadSectionRaws();
      }
      setAudioStatus(containerId, transcodeQueue.queued
        ? {
            busy: false,
            notice: '已保存到 med_section_audios，转码任务已排队',
            error: ''
          }
        : {
            busy: false,
            notice: '已保存到 med_section_audios（转码任务未排队）',
            // R8：音频已落库但转码排队失败，底层错误文本必须可见（原来只进 console，现有提示里丢失了原因）。
            error: `转码任务排队失败：${transcodeQueue.error}`
          });
    } catch (err) {
      console.error('section audio capture failed:', err);
      setAudioStatus(containerId, { busy: false, error: `音频保存失败：${err.message || '未知错误'}` });
    }
  };

  // 段落文本库：一段一录入口。一次录制 / 上传生成的 med_section_audios 只挂一个段落，
  // section_type 取该段落类型的推荐段代号（无推荐映射 ⇒ 拒绝并提示，不静默写空）。
  const handleParagraphAudioCaptured = async (paragraph, capture) => {
    const paragraphId = paragraph?._id || paragraph?.id || '';

    if (!paragraphId) {
      return;
    }

    const recommendedSectionType = getMeditationRecommendedSectionType(paragraph?.paragraph_type);

    if (!recommendedSectionType) {
      setAudioStatus(paragraphId, {
        busy: false,
        notice: '',
        error: `${MEDITATION_PARAGRAPH_SECTION_TYPE_MISSING_MESSAGE}（当前段落类型：${getMeditationParagraphTypeDisplayLabel(paragraph?.paragraph_type)}）`
      });
      return;
    }

    setAudioStatus(paragraphId, { busy: true, error: '', notice: '' });

    try {
      const capturedMimeType = capture.mimeType || capture.file.type || '';
      const durationSeconds = await measureMeditationAudioDurationSeconds(capture.file);
      const takeIndex = getParagraphAudios(paragraphId).length + 1;
      const extension = getMeditationRecordingExtension(capturedMimeType);
      const cloudPath = `meditation-audio-raw/${recommendedSectionType}/paragraph-${paragraphId}/take-${takeIndex}.${extension}`;
      const { fileId, audioUrl } = await uploadAudioFile({ file: capture.file, cloudPath });
      const created = await DatabaseService.createMedSectionAudio(buildMeditationParagraphAudioPayload({
        paragraphId,
        sectionType: recommendedSectionType,
        paragraphText: paragraph?.text || '',
        capturedMimeType,
        durationSeconds,
        fileId,
        audioUrl,
        sourceKind: capture.sourceKind,
        // 【本单新增】③ 输入体积登记（客户端侧）：本地 File 字节数（与云侧 job.input_bytes 配对）。
        sourceSize: capture.file.size
      }));

      const transcodeQueue = await queueSectionAudioTranscode({
        sectionAudio: created,
        sectionType: recommendedSectionType,
        cloudPath,
        fileId,
        fileName: capture.file.name,
        targetFormat: created.target_format
      });

      await loadSectionAudios();
      setAudioStatus(paragraphId, transcodeQueue.queued
        ? { busy: false, notice: '已保存该段落音频，转码任务已排队', error: '' }
        : { busy: false, notice: '已保存该段落音频（转码任务未排队）', error: `转码任务排队失败：${transcodeQueue.error}` });
    } catch (err) {
      setAudioStatus(paragraphId, { busy: false, error: `段落音频保存失败：${err.message || '未知错误'}` });
    }
  };

  // 重试转码：仅当该条音频有原始文件且状态为 failed / idle 时提供；复用既有入队方法与状态回写。
  // 幂等：进行中（queued / processing）不重复入队。
  const handleRetrySectionAudioTranscode = async (audio) => {
    if (!audio?._id || isMeditationSectionAudioTranscodePending(audio)) {
      return;
    }

    const containerId = getAudioStatusContainerId(audio);

    if (!isMeditationSectionAudioTranscodeRetryable(audio)) {
      setAudioStatus(containerId, { busy: false, notice: '', error: '该条音频没有原始文件，无法重试转码' });
      return;
    }

    setAudioStatus(containerId, { busy: true, error: '', notice: '' });

    try {
      const result = await queueSectionAudioTranscode({
        sectionAudio: audio,
        sectionType: audio.section_type,
        cloudPath: '',
        fileId: audio.original_file_id,
        fileName: '',
        targetFormat: audio.target_format
      });

      await loadSectionAudios();
      setAudioStatus(containerId, result.queued
        ? { busy: false, notice: '已重新入队，等待云侧转码器处理', error: '' }
        : { busy: false, notice: '', error: `重试转码入队失败：${result.error}` });
    } catch (err) {
      setAudioStatus(containerId, { busy: false, error: `重试转码失败：${err.message || '未知错误'}` });
    }
  };

  // 读取时现签：优先 fileID 现签（opus=file_id / mp3=fallback_file_id / 原始件=original_file_id），
  // 落库的临时 URL 仅作回退；现签失败不阻断（best-effort 回退落库 URL），错误展示走既有分支。
  const handlePlaySectionAudio = async (audio) => {
    const containerId = getAudioStatusContainerId(audio);
    const resolved = await resolveMeditationSectionAudioPlaybackAsync(audio, { signFileId: getAudioTempUrl });

    if (resolved.error) {
      setAudioStatus(containerId, { error: resolved.error, notice: '' });
      return;
    }

    // 单实例：切走前先停旧实例并清掉旧卡片播放态（进度条 / 时钟不残留在旧卡上）。
    stopSectionAudioPlayback();

    const player = new Audio(resolved.url);
    playingAudioRef.current = player;
    playingSectionAudioContainerIdRef.current = containerId;
    setAudioStatus(containerId, {
      playing: true,
      playingId: audio._id,
      currentTime: 0,
      duration: 0,
      error: '',
      notice: resolved.notice || ''
    });

    // 播放中按卡片同步进度；旧实例被替换后其迟到事件不得覆盖新卡状态。
    const syncPlayingStatus = () => {
      if (playingAudioRef.current !== player) {
        return;
      }
      setAudioStatus(containerId, {
        playing: true,
        playingId: audio._id,
        currentTime: player.currentTime || 0,
        duration: player.duration || 0
      });
    };

    player.addEventListener('loadedmetadata', syncPlayingStatus);
    player.addEventListener('timeupdate', syncPlayingStatus);
    player.addEventListener('ended', () => {
      if (playingAudioRef.current !== player) {
        return;
      }
      stopSectionAudioPlayback();
    });

    player.play().catch((playErr) => {
      console.error('section audio playback failed:', playErr);
      if (playingAudioRef.current !== player) {
        return;
      }
      stopSectionAudioPlayback();
      setAudioStatus(containerId, { error: playErr.message || '试听失败' });
    });
  };

  // 「停止」：暂停当前实例并清掉该卡片播放态，回到非播放态。
  const handleStopSectionAudio = () => {
    stopSectionAudioPlayback();
  };

  const handleDeleteSectionAudio = async (audio) => {
    if (!audio?._id) {
      return;
    }

    if (!confirm('确定删除该条候选音频？')) {
      return;
    }

    const containerId = getAudioStatusContainerId(audio);
    setAudioStatus(containerId, { busy: true, error: '', notice: '' });
    try {
      stopSectionAudioPlayback();
      await DatabaseService.deleteMedSectionAudio(audio._id);
      // 回写 Section-Raw 候选引用（数据层查库，不依赖 sectionRawItems 内存态）
      const detached = await DatabaseService.detachMedSectionAudioFromRaw(audio.section_raw_id || '', audio._id);

      // 有 Section-Raw 却回写不到（返回 null = 目标已不存在）时给出提示，不能静默当成功。
      if (audio.section_raw_id && !detached) {
        throw new Error('音频已删除，但未能回写 Section-Raw 候选引用（目标不存在或已被删除），请刷新后重试');
      }

      await loadSectionAudios();
      if (audio.section_raw_id) {
        await loadSectionRaws();
      }
      setAudioStatus(containerId, { busy: false, notice: '已删除该候选音频' });
    } catch (err) {
      console.error('section audio delete failed:', err);
      setAudioStatus(containerId, { busy: false, error: err.message || '删除失败' });
    }
  };

  // paragraph edit state
  const [editParagraph, setEditParagraph] = useState(null);
  const [editText, setEditText] = useState('');
  const [editType, setEditType] = useState('');
  const [editTags, setEditTags] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSaveError, setEditSaveError] = useState('');
  const [editSaveNotice, setEditSaveNotice] = useState('');
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
      (async () => {
        try {
          const data = await DatabaseService.getMedSectionRaws();
          const items = (data || []).map((sr) => ({
            id: sr._id || sr.id,
            paragraph_ids: Array.isArray(sr.paragraph_ids) ? sr.paragraph_ids : [],
            section_type: sr.section_type || '',
          }));
          // 列表项没有 paragraphs 字段，首段摘要必须由段落 ids 查库取（否则下拉恒显示「无内容」）。
          const firstParagraphIds = items.map((item) => item.paragraph_ids[0]).filter(Boolean);
          const firstParagraphTexts = await DatabaseService.resolveMedParagraphTextsByIds(firstParagraphIds);
          const firstTextById = new Map(
            firstParagraphIds.map((paragraphId, index) => [paragraphId, firstParagraphTexts[index] || ''])
          );
          setSectionRawDropdownList(items.map((item) => ({
            ...item,
            first_paragraph_text: firstTextById.get(item.paragraph_ids[0]) || '',
          })));
        } catch (err) {
          console.error('Failed to load section-raws for dropdown:', err);
        }
      })();
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
      // R8：删除失败必须可见。带上 err.message —— 删除断言把「影响条数为 0（文档不存在或无权删除）」
      // 抛到这里，笼统的「删除失败」会让操作者分不清是没删掉还是网络问题（D-B2-12 / D-B2-15）。
      alert(`删除失败：${err?.message || '未知错误'}`);
    }
  };

  // Lazy load sub-tab data on demand (instead of loading all at once on mount)
  const [localAudioLibrary, setLocalAudioLibrary] = useState(meditationAudioLibrary);
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
          case 'paragraph':
            // 段落文本库按段落显示各自的音频（一段一录）⇒ 进 tab 即加载 med_section_audios；
            // 同时加载 Section-Raw：锁定段落判定（🔒 / 文本只读）与改分类时的容器同步都依赖它。
            await loadSectionAudios();
            await loadSectionRaws();
            break;
          case 'section-raw':
            await loadSectionRaws();
            await loadSectionAudios();
            break;
          case 'med-tracks':
            setMedTracksError('');
            if (typeof loadMedTracks === 'function') {
              await loadMedTracks();
              setTracksLoaded(true);
            }
            await loadSectionAudios();
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
        console.error('Lazy load failed for', activeSubTab, e);
        if (activeSubTab === 'med-tracks') {
          setMedTracksError(e?.message || '冥想轨道加载失败');
        }
      }
    };
    load();
  }, [activeSubTab]);

  const handleOpenEdit = (p) => {
    setEditParagraph(p);
    setEditText(p?.text || '');
    setEditType(p?.paragraph_type || DEFAULT_MEDITATION_PARAGRAPH_TYPE);
    setEditTags(Array.isArray(p?.tags) ? p.tags.join(', ') : '');
    setEditSaveError('');
    setEditSaveNotice('');
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

  // 归类同步执行器：段落分类改动后 ② 同步该段名下音频 section_type、③ 同步「只含该段」的容器
  // Section-Raw；⑤ 逐条读回比对（重新查库，不以 updated>=1 或写入返回值为成功判据）。
  const applyMeditationReclassification = async (plan) => {
    const writeErrors = [];

    for (const update of plan.audioUpdates) {
      try {
        await DatabaseService.updateMedSectionAudio(update.id, { section_type: update.to });
      } catch (err) {
        writeErrors.push({
          kind: 'audio', id: update.id, label: '候选音频', field: 'section_type',
          expected: update.to, previous: update.from, actual: `写入失败：${err?.message || '未知错误'}`
        });
      }
    }

    for (const update of plan.containerUpdates) {
      try {
        await DatabaseService.updateMedSectionRaw(update.id, { section_type: update.to });
      } catch (err) {
        writeErrors.push({
          kind: 'sectionRaw', id: update.id, label: 'Section-Raw', field: 'section_type',
          expected: update.to, previous: update.from, actual: `写入失败：${err?.message || '未知错误'}`
        });
      }
    }

    const [paragraphs, audios, raws] = await Promise.all([
      DatabaseService.getMedParagraphsByIds([plan.paragraphId]),
      DatabaseService.getMedSectionAudios(),
      DatabaseService.getMedSectionRaws()
    ]);

    const readBack = {
      paragraph: Object.fromEntries((paragraphs || []).map((doc) => [doc._id || doc.id, doc])),
      audio: Object.fromEntries((audios || []).map((doc) => [doc._id || doc.id, doc])),
      sectionRaw: Object.fromEntries((raws || []).map((doc) => [doc._id || doc.id, doc]))
    };

    const compared = compareMeditationReclassificationReadBack({ writes: plan.writes, readBack });
    const seen = new Set();
    const mismatches = [];
    for (const item of [...writeErrors, ...compared.mismatches]) {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mismatches.push(item);
    }

    return { ok: mismatches.length === 0, mismatches };
  };

  const handleSaveEdit = async () => {
    if (!editParagraph?._id) return;
    // 写侧白名单：超出权威 10 类的值一律拒绝，不落库（弹窗保持打开并给出可见原因）。
    if (!isMeditationParagraphTypeAllowed(editType)) {
      setEditSaveError(`段落类型不合法，仅允许权威 10 类：${getMeditationParagraphTypeDisplayLabel(editType)}`);
      return;
    }

    const isLockedParagraph = lockedParagraphIds.has(editParagraph._id);
    const paragraphTypeChanged = String(editType ?? '').trim() !== String(editParagraph.paragraph_type ?? '').trim();

    // 分类改动 ⇒ 先算归类同步计划；无推荐映射则拒绝保存（绝不写空）。
    let reclassifyPlan = null;
    if (paragraphTypeChanged) {
      reclassifyPlan = buildMeditationParagraphReclassificationPlan({
        paragraphId: editParagraph._id,
        currentParagraphType: editParagraph.paragraph_type,
        nextParagraphType: editType,
        paragraphAudios: sectionAudios,
        owningSectionRaws: sectionRawItems
      });
      if (!reclassifyPlan.ok) {
        setEditSaveError(reclassifyPlan.error);
        return;
      }
    }

    setSavingEdit(true);
    setEditSaveError('');
    try {
      const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
      // 锁定段落：只允许改写 paragraph_type（文本内容与其它字段一律不动，绝不写 text）；
      // 非锁定段落维持既有口径（text + tags + 打断 AI 溯源 + revision 递增）。
      const updateData = isLockedParagraph
        ? { paragraph_type: editType }
        : {
          text: editText,
          paragraph_type: editType,
          tags,
          // manual edit clears AI status
          source: 'manual',
          ai_rewritten_from: null,
          // revision 每次编辑 +1，供 Section-Raw 的 stale 比对
          revision: Number(editParagraph.revision ?? 1) + 1,
        };
      const savedParagraph = await DatabaseService.updateMedParagraph(editParagraph._id, updateData);
      if (!isLockedParagraph) {
        // revision 回写内存编辑对象：级联失败时弹窗刻意保持打开，同一弹窗会话内再次保存必须基于新 revision，
        // 否则会把同一版本号重复写回（失败分支保持打开的行为不变）。
        setEditParagraph((previous) => (
          previous ? { ...previous, revision: Number(savedParagraph?.revision ?? updateData.revision) } : previous
        ));
      }
      // 文本变更判据（K9）：trim 归一后按字符串比较，undefined/null 一律归一为空串；
      // 仅 tags/paragraph_type 改动而文本未变时不得触发 stale 级联，否则管理员会被要求重录实际无需重录的音频。
      const normalizeParagraphText = (value) => (typeof value === 'string' ? value.trim() : '');
      const paragraphTextChanged = normalizeParagraphText(editText) !== normalizeParagraphText(editParagraph.text);
      if (paragraphTextChanged) {
        // 段落改动级联（数据层驱动）：直接查库找出引用该段落的 Section-Raw，标记 stale* 并重算字数，
        // 同时把被引用的候选音频置 stale（规范：stale 不阻断音频可用）。不依赖 sectionRawItems 内存态。
        let cascade;
        try {
          cascade = await DatabaseService.cascadeMedSectionRawsStaleByParagraph(editParagraph._id, {
            reason: '引用的段落文本已修改，建议重录',
          });
        } catch (cascadeErr) {
          // 段落本身已保存，但 Section-Raw 的 stale 级联失败：必须在弹窗内提示（弹窗保持打开），
          // 只进控制台会让用户误以为「保存成功、音频库状态已同步」。
          console.error('Failed to update paragraph:', cascadeErr);
          setEditSaveError(`段落已保存，但音频库「需重录」标记同步失败：${cascadeErr.message || '未知错误'}，请稍后重试或重新打开本条确认状态。`);
          if (typeof refreshMeditationSection === 'function') {
            await refreshMeditationSection();
          }
          return;
        }
        if (cascade.sectionRawIds.length > 0) {
          await loadSectionRaws();
          await loadSectionAudios();
        }
      }

      // 归类跟着走（不标 stale）：同步音频与容器，并逐条读回比对；任一条未生效即点名，不静默。
      if (reclassifyPlan) {
        const reclassified = await applyMeditationReclassification(reclassifyPlan);
        if (!reclassified.ok) {
          await loadSectionAudios();
          await loadSectionRaws();
          if (typeof refreshMeditationSection === 'function') {
            await refreshMeditationSection();
          }
          setEditSaveError(buildMeditationReclassificationFailureMessage(reclassified.mismatches));
          return;
        }
        await loadSectionAudios();
        if (reclassifyPlan.containerUpdates.length > 0) {
          await loadSectionRaws();
        }
        setEditSaveNotice(buildMeditationReclassificationNotice(reclassifyPlan));
      }

      setEditParagraph(null);
      if (typeof refreshMeditationSection === 'function') {
        await refreshMeditationSection();
      }
    } catch (err) {
      console.error('Failed to update paragraph:', err);
      setEditSaveError(`保存失败：${err.message || '未知错误'}`);
    } finally {
      setSavingEdit(false);
    }
  };

  // 追加段落：字数重算、stale 标记与候选音频置位全部在数据层完成（见
  // DatabaseService.appendMedSectionRawParagraphs），前端不再依赖 sectionRawItems 内存态。
  const handleAppendParagraphs = async (sectionRawId, appendIds) => {
    if (!sectionRawId || !appendIds.length) {
      return;
    }

    setAppending(true);
    try {
      await DatabaseService.appendMedSectionRawParagraphs(sectionRawId, appendIds);
      setAppendToSr(null);
      setAppendSelected([]);
      await loadSectionRaws();
      await loadSectionAudios();
      if (typeof refreshMeditationSection === 'function') {
        await refreshMeditationSection();
      }
    } catch (err) {
      console.error('Append failed:', err);
      // R8：appendMedSectionRawParagraphs（→ updateMedSectionRaw）以及候选音频 stale 回写
      //（markMedSectionAudiosStaleByRawId → updateMedSectionAudio）失败原本静默，用户会误以为追加成功。
      // 改为可见提示；弹窗保持打开，便于用户重试（与本页其它写失败提示一致用 alert）。
      alert(buildVisibleWriteFailureMessage('追加段落失败', err));
    } finally {
      setAppending(false);
    }
  };

  const handleAddToSectionRaw = async (targetId) => {
    if (!editParagraph?._id) return;
    setAddingToSectionRaw(targetId || 'new');
    setSectionRawDropdownOpen(false);
    try {
      if (targetId && targetId !== 'new') {
        // 追加到已有 Section-Raw：数据层读库取当前段落序列，只写段落引用与字数，音频仅留引用
        await DatabaseService.appendMedSectionRawParagraphs(targetId, [editParagraph._id]);
      } else {
        // 新建 Section-Raw：section_type 按段落类型推荐取值（无推荐时用默认段＝权威段码）
        const sectionType = getMeditationRecommendedSectionType(editParagraph.paragraph_type) || DEFAULT_NEW_SECTION_TYPE;
        const targetCharCount = getMeditationSectionTargetCharCount(sectionType) ?? 0;
        const currentCharCount = countMeditationSectionChars([editText || editParagraph.text || '']);
        await DatabaseService.createMedSectionRaw({
          section_type: sectionType,
          paragraph_ids: [editParagraph._id],
          target_char_count: targetCharCount,
          current_char_count: currentCharCount,
          word_count_status: resolveMeditationWordCountStatus(currentCharCount, targetCharCount),
          record_granularity: 'paragraph',
          created_by: 'admin-edit-modal',
        });
      }
      setAddingToSectionRaw(null);
      setEditParagraph(null);
      await loadSectionRaws();
      await loadSectionAudios();
      if (typeof refreshMeditationSection === 'function') {
        await refreshMeditationSection();
      }
      setActiveSubTab('section-raw');
    } catch (err) {
      console.error('Failed to add to section-raw:', err);
      setAddingToSectionRaw(null);
    }
  };

  // 初始化默认种子 Track（六章固定模板 + 章间留白默认 141s）
  const handleCreateDefaultTrack = async () => {
    try {
      setMedTracksError('');
      await saveMedTrack(createDefaultMeditationTrack({ createdBy: 'admin-med-tracks' }));
      setTracksLoaded(true);
    } catch (err) {
      console.error('Failed to create default med track:', err);
      setMedTracksError(err?.message || '冥想轨道保存失败');
    }
  };

  const handleCancelEdit = () => {
    setEditParagraph(null);
  };

  // ── Section-Raw 渲染（音频一律来自 med_section_audios 候选池） ──────────────

  const renderSectionAudioStatus = (containerId) => {
    const status = sectionAudioStatus[containerId] || {};

    return (
      <>
        {status.notice && <span style={{ fontSize: '11px', color: '#16a34a' }}>{status.notice}</span>}
        {status.error && <span style={{ fontSize: '11px', color: '#ef4444' }}>❌ {status.error}</span>}
      </>
    );
  };

  const renderSectionAudioList = (containerId, audios, {
    showStatus = true,
    showSectionType = false,
    emptyHint = '候选池为空（同 section_type 允许 1..N 条候选，运行时抽一条）'
  } = {}) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {audios.length === 0 && (
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{emptyHint}</span>
        )}
        {audios.map((audio) => {
          // 播放态按 containerId 存（同容器多条候选共享），用 playingId 区分「这一条」。
          const audioStatus = sectionAudioStatus[getAudioStatusContainerId(audio)] || {};
          const isAudioPlaying = Boolean(audioStatus.playing) && audioStatus.playingId === audio._id;
          const playingPercent = Math.round(
            resolveMeditationSectionAudioPlaybackProgress(audioStatus.currentTime, audioStatus.duration) * 100
          );

          return (
            <div key={audio._id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '11px', color: '#475569' }}>
              <span>#{String(audio._id).slice(-6)}</span>
              {showSectionType && <span>{audio.section_type ? getMeditationSectionDisplayLabelWithCode(audio.section_type) : '未设置类型'}</span>}
              {audio.label && <span>{audio.label}</span>}
              <span>{formatAudioDuration(audio.duration)}</span>
              <span>{getSourceKindLabel(audio.source_kind)}</span>
              <span>{MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS_LABELS[audio.transcode_status] || audio.transcode_status}</span>
              {audio.transcode_error && <span style={{ color: '#ef4444' }}>失败原因：{audio.transcode_error}</span>}
              <span style={{ color: audio.file_id ? '#16a34a' : '#94a3b8' }}>Opus {audio.file_id ? '✓' : '待转码'}</span>
              <span style={{ color: audio.fallback_file_id ? '#16a34a' : '#94a3b8' }}>mp3 {audio.fallback_file_id ? '✓' : '—'}</span>
              {!isMeditationSectionAudioDeliveryComplete(audio) && <span style={medBadgeStyle('warning')}>未完成交付</span>}
              {audio.stale && <span style={medBadgeStyle('warning')}>stale</span>}
              {isAudioPlaying && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 140px', minWidth: '140px' }}>
                  <span style={{ flex: 1, height: '3px', borderRadius: '2px', backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${playingPercent}%`, backgroundColor: '#2563eb' }} />
                  </span>
                  <span style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
                    {formatMeditationAudioClock(audioStatus.currentTime)} / {formatMeditationAudioClock(audioStatus.duration)}
                  </span>
                </span>
              )}
              {isAudioPlaying ? (
                <button style={{ ...ghostBtnStyle, padding: '2px 8px' }} onClick={handleStopSectionAudio}>停止</button>
              ) : (
                <button style={{ ...ghostBtnStyle, padding: '2px 8px' }} onClick={() => handlePlaySectionAudio(audio)}>试听</button>
              )}
              {isMeditationSectionAudioTranscodeRetryable(audio) && (
                <button style={{ ...ghostBtnStyle, padding: '2px 8px' }} onClick={() => handleRetrySectionAudioTranscode(audio)}>重试转码</button>
              )}
              <button style={{ ...dangerBtnStyle, padding: '2px 8px' }} onClick={() => handleDeleteSectionAudio(audio)}>删除</button>
            </div>
          );
        })}
        {showStatus && renderSectionAudioStatus(containerId)}
      </div>
    );
  };

  // 段落文本库：每段显示自己的音频（状态词 + 失败原因 + 试听 / 重录 / 删除），并提供录制/上传入口。
  const renderParagraphAudioBlock = (paragraph) => {
    const paragraphId = paragraph?._id || paragraph?.id || '';

    if (!paragraphId) {
      return null;
    }

    const audios = getParagraphAudios(paragraphId);
    const recommendedSectionType = getMeditationRecommendedSectionType(paragraph?.paragraph_type);
    const hasAudio = audios.length > 0;

    return (
      <div style={{ margin: '4px 0 0 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {renderSectionAudioList(paragraphId, audios, { emptyHint: '该段落暂无音频' })}
        {recommendedSectionType && (
          <MeditationRecordingControl
            busy={Boolean(sectionAudioStatus[paragraphId]?.busy)}
            recordLabel={hasAudio ? '● 重录' : '● 网页录音'}
            uploadLabel={hasAudio ? '重录（上传音频文件）' : '上传音频文件'}
            onCaptured={(capture) => handleParagraphAudioCaptured(paragraph, capture)}
          />
        )}
      </div>
    );
  };

  const renderSectionRawItem = (raw, index) => {
    const audios = getSectionRawAudios(raw.id, raw.paragraph_ids);
    // 无候选音频（= 没有录音）时不显示「需重录 / 文本与录制快照不一致」：无录音可重录。
    // DB 侧 stale 语义不变，仅提示口径按有无录音收敛。
    const stale = audios.length > 0 && isSectionRawStale(raw);
    const paragraphTexts = resolveParagraphTexts(raw.paragraph_ids);
    const currentCharCount = raw.current_char_count || countMeditationSectionChars(paragraphTexts);
    const sectionMeta = getMeditationSectionTypeMeta(raw.section_type);

    return (
      <div key={raw.id} style={{ padding: '10px 8px', borderTop: index > 0 ? '1px solid #f1f5f9' : 'none', fontSize: '13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <strong style={{ color: '#1e293b' }}>{getSectionTypeDisplayLabel(raw.section_type)}</strong>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            {getSectionTypeChapterLabel(raw.section_type) || '未归属章节'}
          </span>
          <span style={medBadgeStyle(getMeditationWordCountStatusTone(raw.word_count_status))}>
            {MEDITATION_WORD_COUNT_STATUS_LABELS[raw.word_count_status] || '未计算'}
          </span>
          {stale && (
            <span style={medBadgeStyle('danger')}>
              {raw.stale ? `需重录${raw.stale_reason ? `（${raw.stale_reason}）` : ''}` : '文本与录制快照不一致'}
            </span>
          )}
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            段落 {raw.paragraph_ids.length} 个 · 字数 {currentCharCount}/{raw.target_char_count || '—'} · 时长上限 {sectionMeta?.max_duration_seconds ?? '—'}s
          </span>
        </div>
        {paragraphTexts.length > 0 && (
          <ol style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 4px 20px', padding: 0 }}>
            {paragraphTexts.map((text, textIndex) => (
              <li key={textIndex} style={{ opacity: 0.85 }}>{text}</li>
            ))}
          </ol>
        )}
        <div style={{ marginTop: '4px' }}>{renderSectionAudioList(raw.id, audios)}</div>
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button style={{ ...ghostBtnStyle, padding: '2px 8px' }} onClick={() => setAppendToSr(raw._id)}>📎 追加段落</button>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>文本类段的录音 / 上传入口已移至「段落文本库」，按单段录制</span>
        </div>
      </div>
    );
  };

  const renderPureAudioPanel = () => (
    <div style={{ marginTop: '16px', padding: '10px', background: '#fafafa', borderRadius: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>纯音频段（不建 Section-Raw）</div>
      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
        自然 / 颂钵 两段无文本，录音或上传后直接写入 med_section_audios（section_raw_id 允许为空）。
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        {PURE_AUDIO_SECTION_TYPES.map((sectionType) => (
          <button
            key={sectionType}
            style={pillBtnStyle(pureAudioSectionType === sectionType)}
            onClick={() => setPureAudioSectionType(sectionType)}
          >
            {getSectionTypeDisplayLabel(sectionType)}
          </button>
        ))}
        <MeditationRecordingControl
          busy={Boolean(sectionAudioStatus['audio-only']?.busy)}
          onCaptured={(capture) => handleSectionAudioCaptured({ sectionRawId: '', sectionType: pureAudioSectionType }, capture)}
        />
      </div>
      {PURE_AUDIO_SECTION_TYPES.map((sectionType) => (
        <div key={sectionType} style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
            {getSectionTypeChapterLabel(sectionType)} · {getSectionTypeDisplayLabelWithCode(sectionType)}
          </div>
          {renderSectionAudioList(
            'audio-only',
            getSectionRawAudios('').filter((audio) => (audio.section_type || '') === sectionType),
            { showStatus: false, showSectionType: true }
          )}
        </div>
      ))}
      <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {renderSectionAudioStatus('audio-only')}
      </div>
    </div>
  );

  const renderSectionRawCreateForm = () => {
    const currentCharCount = countMeditationSectionChars(resolveParagraphTexts(selectedParagraphIds));
    const targetCharCount = getMeditationSectionTargetCharCount(newSectionType) ?? 0;
    const wordCountStatus = resolveMeditationWordCountStatus(currentCharCount, targetCharCount);
    const recommendedParagraphTypes = getMeditationSectionTypeParagraphTypes(newSectionType);
    const filteredParagraphs = (Array.isArray(meditationParagraphs) ? meditationParagraphs : [])
      .filter((paragraph) => (
        sectionParagraphTypeFilter === 'all'
        || (paragraph?.paragraph_type || DEFAULT_MEDITATION_PARAGRAPH_TYPE) === sectionParagraphTypeFilter
      ));

    return (
      <div style={{ marginTop: '12px' }}>
        <button style={{ ...ghostBtnStyle, padding: '4px 10px' }} onClick={toggleSectionCreateForm}>
          {showSectionCreateForm ? '取消新建' : '新建 Section-Raw'}
        </button>
        {showSectionCreateForm && (
          <div style={{ marginTop: '8px', padding: '10px', background: '#fafafa', borderRadius: '8px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '12px', color: '#475569' }}>
                Section 类型
                <select
                  value={newSectionType}
                  style={{ ...inputStyle, width: '380px', padding: '4px 8px', marginLeft: '4px' }}
                  onChange={(event) => setNewSectionType(event.target.value)}
                >
                  {MEDITATION_SECTION_TYPE_GROUPS.map((group) => (
                    <optgroup key={group.chapter_key} label={`${group.order}. ${group.chapter_label}（时长上限 ${group.max_duration_seconds}s）`}>
                      {group.section_types.map((meta) => (
                        <option key={meta.section_type} value={meta.section_type} disabled={!meta.text_required}>
                          {getSectionTypeDisplayLabel(meta.section_type)}（{meta.text_required ? `目标 ${meta.target_char_count} 字` : '纯音频，不经 Section-Raw'}）
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <span style={{ color: '#64748b' }}>
                推荐段落类型：{recommendedParagraphTypes.length > 0 ? recommendedParagraphTypes.map((paragraphType) => getMeditationParagraphTypeDisplayLabel(paragraphType)).join(' / ') : '无（纯音频段）'}
              </span>
              <span style={{ color: '#64748b' }}>
                字数 {currentCharCount}/{targetCharCount || '不判字数'}
                {wordCountStatus && (
                  <span style={{ ...medBadgeStyle(getMeditationWordCountStatusTone(wordCountStatus)), marginLeft: '6px' }}>
                    {MEDITATION_WORD_COUNT_STATUS_LABELS[wordCountStatus]}
                  </span>
                )}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', margin: '8px 0 4px' }}>
              <span style={{ color: '#64748b' }}>按段落类型筛选：</span>
              {['all', ...MEDITATION_PARAGRAPH_TYPE_ORDER].map((paragraphType) => (
                <button
                  key={paragraphType}
                  style={pillBtnStyle(sectionParagraphTypeFilter === paragraphType)}
                  onClick={() => setSectionParagraphTypeFilter(paragraphType)}
                >
                  {paragraphType === 'all' ? '全部' : getMeditationParagraphTypeDisplayLabel(paragraphType)}
                </button>
              ))}
            </div>
            {filteredParagraphs.length === 0 && (
              <div style={{ color: '#94a3b8' }}>没有符合筛选条件的段落</div>
            )}
            {filteredParagraphs.map((paragraph, paragraphIndex) => {
              const paragraphId = paragraph?._id || `p-${paragraphIndex}`;
              const checked = selectedParagraphIds.includes(paragraphId);
              const recommendedSectionType = getMeditationRecommendedSectionType(paragraph?.paragraph_type);
              const matched = isMeditationParagraphTypeMatchSectionType(paragraph?.paragraph_type, newSectionType);

              return (
                <label key={paragraphId} style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '2px 0' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleParagraphSelect(paragraphId)} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(paragraph?.text || '').slice(0, 60)}
                  </span>
                  <span style={{ color: '#94a3b8' }}>{getMeditationParagraphTypeDisplayLabel(paragraph?.paragraph_type)}</span>
                  <span style={{ color: '#64748b' }}>推荐 {recommendedSectionType ? getMeditationSectionDisplayLabelWithCode(recommendedSectionType) : '—'}</span>
                  <span style={medBadgeStyle(matched ? 'ok' : 'warning')}>{matched ? '类型匹配' : '类型不匹配'}</span>
                </label>
              );
            })}
            <div style={{ marginTop: '6px', color: '#64748b' }}>
              已选 {selectedParagraphIds.length} 段 · 当前 {currentCharCount} 字 / 目标 {targetCharCount || '—'} 字（字数硬约束，仅提示不阻断）
            </div>
            {sectionRawFormError && <div style={{ color: '#ef4444', marginTop: '4px' }}>❌ {sectionRawFormError}</div>}
            <button style={{ ...primaryBtnStyle, marginTop: '8px', padding: '5px 12px' }} onClick={handleConfirmCreateSectionRaw}>
              保存 Section-Raw
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderMedTracksTab = () => {
    const track = (Array.isArray(medTracks) ? medTracks : [])[0] || null;
    // 失败必须可辨识（例：med_tracks 集合不存在，请先在 CloudBase 创建），不得静默
    const tracksErrorNotice = medTracksError ? (
      <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>❌ {medTracksError}</div>
    ) : null;

    if (track) {
      return (
        <div>
          {tracksErrorNotice}
          <MeditationTracksTab
            key={track._id || track.track_key}
            track={track}
            sectionDurationSecondsByType={buildMeditationSectionDurationMap(sectionAudios)}
            sectionAudios={sectionAudios}
            saving={savingMedTracks}
            onSave={saveMedTrack}
            onRefreshTrack={loadMedTracks}
          />
        </div>
      );
    }

    return (
      <div>
        <div style={sectionTitleStyle}>冥想轨道</div>
        {tracksErrorNotice}
        {tracksLoaded ? (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
              {/* 章上限序列与留白默认值一律**由权威常量派生**（此处不写字面量）⇒ 权威源常量再变时文案自动跟随。 */}
              尚无 med_tracks 记录；可初始化默认种子 Track（六章固定模板、各章时长上限 {MEDITATION_TRACK_CHAPTER_TEMPLATE.map((chapter) => chapter.max_duration_seconds).join('/')}、章间留白默认 {MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT}s）。
            </div>
            <button style={{ ...primaryBtnStyle, padding: '6px 14px' }} onClick={handleCreateDefaultTrack} disabled={savingMedTracks}>
              {savingMedTracks ? '创建中…' : '初始化默认 Track'}
            </button>
          </div>
        ) : (
          <div style={{ padding: '6px 8px', color: '#94a3b8', fontSize: '13px' }}>加载中…</div>
        )}
      </div>
    );
  };

  // D10 只读闸门 ②（渲染层，集中钳制）：老四 tab 即便被内部 state / hash / devtools 强制激活，
  // `renderedSubTab` 一律为 null ⇒ 只渲染下方只读说明，老组件的渲染分支全部落空（不报错、不白屏）。
  const frozenTabForced = isFrozenMeditationTab(activeSubTab);
  const renderedSubTab = frozenTabForced ? null : activeSubTab;

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
        {/* D10 只读闸门 ②（渲染层）：老四 tab 被内部 state / hash / devtools 强制激活时，
            不渲染老组件、不报错、不白屏，只给这段可见的只读说明。 */}
        {frozenTabForced && (
          <div
            data-frozen-tab-readonly={activeSubTab}
            style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#475569', marginBottom: '12px', lineHeight: '1.6' }}
          >
            🔒 「{getFrozenMeditationTabLabel(activeSubTab)}」已冻结为只读，入口已下线。这里只保留历史数据的查看能力，当前版本不再提供任何修改入口；历史数据会在下个版本周期后清理。
          </div>
        )}
        {activeSubTab === 'paragraph' && (
          <div>
            <div style={sectionTitleStyle}>段落文本库</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {['all', ...MEDITATION_PARAGRAPH_TYPE_ORDER].map((pt) => (
                <button key={pt} style={pillBtnStyle(activeFilter === pt)} onClick={() => setActiveFilter(pt)}>
                  {pt === 'all' ? '全部' : getMeditationParagraphTypeDisplayLabel(pt)}
                </button>
              ))}
            </div>
            {editSaveNotice && (
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#166534', marginBottom: '12px', lineHeight: '1.6' }}>
                ✅ {editSaveNotice}
              </div>
            )}
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
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{filtered.length} 条 {activeFilter !== 'all' ? `(${getMeditationParagraphTypeDisplayLabel(activeFilter)})` : ''}</span>
                  </div>
                  {filtered.length === 0 ? (
                    <div style={{ padding: '6px 8px', color: '#94a3b8', fontSize: '13px' }}>med_paragraphs data will appear here (seed via CloudBase)</div>
                  ) : filtered.map((p, index) => {
                      const text = String(p?.text || '').trim();
                      const ptype = p?.paragraph_type || '';
                      const stars = getStars(p.score);
                      const isLocked = lockedParagraphIds.has(p._id);
                      return (
                        <div key={p?._id || index} style={{ padding: '6px 8px', borderTop: index > 0 ? '1px solid #f8fafc' : 'none' }}>
                          <div style={{ display: 'flex', gap: '12px', fontSize: '13px', alignItems: 'center' }}>
                          <div style={{ flex: 1, cursor: 'pointer', wordBreak: 'break-word' }} title={isLocked ? '已加入音频库，点此查看或修改分类' : '点击编辑'} onClick={() => handleOpenEdit(p)}>
                            {p?.source === 'ai' && <span style={{ marginRight: '4px', fontSize: '11px', verticalAlign: 'middle' }}><img src="/icons/partner/ai.svg" style={{ width: '14px', height: '14px', verticalAlign: 'middle' }} alt="AI" /></span>}
                            {isLocked && <span style={{ marginRight: '4px', fontSize: '12px', verticalAlign: 'middle' }} title="已加入音频库">🔒</span>}
                            {text.length > 120 ? text.slice(0, 120) + '...' : text}
                          </div>
                          <div style={{ color: '#64748b', minWidth: '50px', fontSize: '12px' }}>{getMeditationParagraphTypeDisplayLabel(ptype)}</div>
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
                          {renderParagraphAudioBlock(p)}
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
                     {MEDITATION_PARAGRAPH_TYPE_ORDER.map((paragraphType) => (
                       <option key={paragraphType} value={paragraphType}>{getMeditationParagraphTypeDisplayLabel(paragraphType)}</option>
                     ))}
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
              Section-Raw 列表（音频以 med_section_audios 为唯一口径，本页只保存引用）
            </div>
            {sectionRawItems.length === 0 ? (
              <div style={{ padding: '6px 8px', color: '#94a3b8', fontSize: '13px' }}>暂无 Section-Raw</div>
            ) : sectionRawItems.map((raw, index) => renderSectionRawItem(raw, index))}
            {renderPureAudioPanel()}
            {renderSectionRawCreateForm()}
          </div>
        )}

        {activeSubTab === 'med-tracks' && (
          <React.Fragment>
            {renderMedTracksTab()}
          </React.Fragment>
        )}

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
                    <span style={{ color: '#94a3b8', fontSize: '11px', flexShrink: 0 }}>{getMeditationParagraphTypeDisplayLabel(p?.paragraph_type)}</span>
                  </label>
                );
              })}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button style={{ padding: '7px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: '#fff', color: '#475569' }}
                  onClick={() => { setAppendToSr(null); setAppendSelected([]); }}>取消</button>
                <button style={{ padding: '7px 16px', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', backgroundColor: '#1e293b', color: '#fff' }}
                  disabled={appending || appendSelected.length === 0}
                  onClick={() => handleAppendParagraphs(appendToSr, appendSelected)}
                >
                  {appending ? '追加中...' : `追加 ${appendSelected.length} 条`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* D10 只读闸门 ③（写入口层，硬）：老组件的渲染分支只认 `renderedSubTab`（被闸门 ② 钳制），
            且即便渲染，拿到的也是只读桩而非真实 writer —— 所以「强制激活老 tab」既无写入口，
            也到不了 `updateMeditation*` / `queueMeditationAudioTranscodeJob`。老组件与老预览器原样保留。 */}
        {renderedSubTab === 'library' && (
          <React.Fragment>
          <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#713f12', marginBottom: '12px' }}>
            ⏳ 此标签页为旧版数据，未来将被 med_* 集合替代。新数据请在「段落文本库」和「原始音频库」中管理。
          </div>
                <AudioLibraryTab
                library={localAudioLibrary}
                saving={savingMeditationAudioLibrary}
                onUpdate={blockFrozenMeditationTabWrite(updateMeditationAudioLibrary)}
                onQueueTranscodeJob={blockFrozenMeditationTabWrite(queueMeditationAudioTranscodeJob)}
                onRefresh={refreshMeditationSection}
                />
                </React.Fragment>
                )}

        {renderedSubTab === 'presets' && (
          <React.Fragment>
          <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#713f12', marginBottom: '12px' }}>
            ⏳ 此标签页为旧版数据，未来将被 med_* 集合替代。
          </div>
          <MeditationPresetsTab
            meditationLibrary={localLibrary}
            audioLibrary={localAudioLibrary}
            compositionSettings={localCompositionSettings}
            saving={savingMeditationLibrary}
            onUpdate={blockFrozenMeditationTabWrite(updateMeditationLibrary)}
          />
          </React.Fragment>
        )}
        {renderedSubTab === 'composition' && (
          <React.Fragment>
          <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#713f12', marginBottom: '12px' }}>
            ⏳ 此标签页为旧版数据，未来将被 med_* 集合替代。
          </div>
          <CompositionTab
            settings={localCompositionSettings}
            library={localAudioLibrary}
            saving={savingMeditationCompositionSettings}
            onUpdate={blockFrozenMeditationTabWrite(updateMeditationCompositionSettings)}
          />
          </React.Fragment>
        )}
        {renderedSubTab === 'calendar' && (
          <React.Fragment>
          <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#713f12', marginBottom: '12px' }}>
            ⏳ 此标签页为旧版数据，未来将被 med_* 集合替代。
          </div>
          <CalendarTab
            calendar={localCalendar}
            meditationLibrary={localLibrary}
            saving={savingMeditationCalendar}
            onUpdate={blockFrozenMeditationTabWrite(updateMeditationCalendar)}
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
        const isParagraphLocked = lockedParagraphIds.has(editParagraph._id);
        const isOwnedByMultiParagraphRaw = (Array.isArray(sectionRawItems) ? sectionRawItems : []).some((sr) => (
          Array.isArray(sr.paragraph_ids)
          && sr.paragraph_ids.includes(editParagraph._id)
          && sr.paragraph_ids.length > 1
        ));
        const addToLibraryLabel = isParagraphLocked
          ? '🔒 已在音频库'
          : (addingToSectionRaw === 'new' ? '新建中...' : addingToSectionRaw ? '追加中...' : '📢 加入音频库 ▾');
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
              {isParagraphLocked ? (
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
                {MEDITATION_PARAGRAPH_TYPE_ORDER.map((paragraphType) => (
                  <option key={paragraphType} value={paragraphType}>{getMeditationParagraphTypeDisplayLabel(paragraphType)}</option>
                ))}
              </select>
            </div>

            {isOwnedByMultiParagraphRaw && (
              <div style={{ padding: '8px 12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '12px', color: '#1e40af', marginBottom: '14px', lineHeight: '1.6' }}>
                该段落所属 Section-Raw 含多个段落，改分类不会同步容器的段分类，仅同步该段落名下的音频。
              </div>
            )}

            {isParagraphLocked ? (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#64748b', marginBottom: '4px' }}>标签</label>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {(editTags ? editTags.split(',').map((t) => t.trim()).filter(Boolean) : []).join('、') || '（无）'}
                </div>
              </div>
            ) : (
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
            )}

            {editParagraph.source === 'ai' && !isParagraphLocked && (
              <div style={{ padding: '8px 12px', backgroundColor: '#fef9c3', borderRadius: '8px', fontSize: '12px', color: '#713f12', marginBottom: '16px' }}>
                ⚠️ 编辑后将清除 AI 标记，AI 图标将消失。
              </div>
            )}

            {editSaveError && (
              <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '12px' }}>❌ {editSaveError}</div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
              <div style={{ position: 'relative' }}>
                <button
                  style={{ padding: '7px 16px', border: '1px solid #818cf8', borderRadius: '8px', fontSize: '13px', cursor: isParagraphLocked ? 'not-allowed' : 'pointer', backgroundColor: '#eef2ff', color: '#4338ca', whiteSpace: 'nowrap', opacity: isParagraphLocked ? 0.6 : 1 }}
                  onClick={() => setSectionRawDropdownOpen(!sectionRawDropdownOpen)}
                  disabled={addingToSectionRaw !== null || isParagraphLocked}
                >
                  {addToLibraryLabel}
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
                        <span style={{ flexShrink: 0 }}>
                          {/* 窄位：本下拉固定 minWidth 240px 且标签列不可压缩（flexShrink: 0）⇒ 只出中文名；
                              英文名并列见「纯音频段」分组标题与 Track 章节段列。 */}
                          {getSectionTypeLabel(sr.section_type)} · {sr.paragraph_ids.length}条
                        </span>
                        <span style={{ flex: 1, marginLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8', textAlign: 'right' }}>
                          {sr.first_paragraph_text ? sr.first_paragraph_text.slice(0, 40) : '无内容'}
                        </span>
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
