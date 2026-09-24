import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Play, Pause } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWealth } from '../../context/WealthContext';
import { useCloudAwareness } from '../../context/CloudAwarenessContext';
import { DEFAULT_MEDITATION_SETTINGS } from '../../services/database.js';
import { meditationReadService, rewardSettingsService } from '../../services/cloudbase.js';
import {
  DEFAULT_MEDITATION_SESSION_SECONDS,
  getMeditationAudioMimeType,
  getMeditationSessionKey,
  getShanghaiDateKey,
  MEDITATION_TRACK_KEYS
} from '@liwu/shared-utils/meditation-session-plan.js';
import {
  buildMeditationTrackPlaybackPlan,
  buildSessionSolidification
} from '@liwu/shared-utils/meditation-track-playback-plan.js';
import { writeLocalStorageJSON } from '@liwu/shared-utils/cloudbase-browser-storage.js';
import { resolveMeditationUrlPolicyStaleness } from '@liwu/shared-utils/meditation-read-client.js';

const MIN_VALID_MEDITATION_SECONDS = 180;
const SESSION_LABELS = {
  morning: '早课',
  noon: '午课',
  afternoon: '下午课',
  evening: '晚课'
};

// D6（meditation-read）失败码 → 用户可见文案。
// 只按 `error.code` 归类（R39 ③：**不解析**服务端 message 文本，也不把 message 当真假判据）。
const MEDITATION_READ_ERROR_MESSAGES = {
  TRACK_NOT_FOUND: '暂无可用冥想轨道，请联系管理员配置',
  TRACK_DISABLED: '该冥想轨道已停用，暂不可播放',
  READ_FAILED: '冥想音频读取失败，请稍后重试',
  CALL_FAILED: '冥想服务连接失败，请检查网络后重试',
  INVALID_PAYLOAD: '冥想音频数据不完整，已停止播放'
};
const MEDITATION_READ_ERROR_FALLBACK_MESSAGE = '冥想内容加载失败，请稍后重试';
// 响应合法但无可播段（音频池全空 / 全无可用格式）：同样以**可见错误态**呈现，不回退老音频库。
const MEDITATION_EMPTY_PLAN_MESSAGE = '本次冥想暂无可播放音频（音频池为空），请联系管理员';

// ─── 运行时恢复路径 / 格式降级（R39 ⑤ / R41-⑥⑦） ─────────────────────────────
// 取源失败一律**可见**——不静默、不回退老音频库（D9）；跨格式降级与跳段属**已定口径**的运行行为。
const AUDIO_FETCH_SIGNATURE_ERROR = 'AUDIO_FETCH_403';

// 运行时告警码（`console.warn` / `console.error` 载荷可检索；跳段**不整场失败**）。
const MEDITATION_TRACK_WARNING_CODES = Object.freeze({
  segmentSkipped: 'SEGMENT_SKIPPED',
  reissueFailed: 'SEGMENT_REISSUE_FAILED',
  sessionSolidificationFailed: 'SESSION_SOLIDIFICATION_FAILED'
});

// ─── 会话固化（R41-⑤ / D7）：抽签结果先落**本地** storage ────────────────────────
// ① 键名逐字固定为 `liwu_meditation_session_v1`（唯一消费方＝本播放器）；
// ② **只写本地、零云写**（云侧写入另裁＝挂账 C18，端侧**不得**自建云集合）；
// ③ 同一会话重复写入＝**覆盖同键**（`setItem` 语义，不做无限累积）；
// ④ 写失败（storage 抛错 / 载荷不合法）**不阻断播放**（C 类失败不得整场失败），
//    但必须**可见**（R41-⑦「失败可见且不静默」）⇒ 复用既有错误提示位（页脚 `footerMessage`）。
const MEDITATION_SESSION_STORAGE_KEY = 'liwu_meditation_session_v1';
const MEDITATION_SESSION_STORAGE_FAILURE_MESSAGE = '本次冥想的会话记录未能保存到本地（播放继续）';

// 组装固化载荷（共享层 `buildSessionSolidification`，只组装不落盘）＋ **只写本地 storage**。
// 入参 `selections` 一律取**本次实际播放的那一份抽签结果**（同一批、**不二次抽签**）。
// 任何失败都不上抛：只记一条可检索 warning ＋ 把可见提示交给调用方（`onFailure`）。
const solidifyMeditationSession = ({
  trackId,
  trackVersion,
  dateKey,
  sessionKey,
  selections,
  onFailure
}) => {
  try {
    const solidification = buildSessionSolidification({
      trackId,
      trackVersion,
      dateKey,
      sessionKey,
      selections
    });

    writeLocalStorageJSON(MEDITATION_SESSION_STORAGE_KEY, solidification);
    return solidification;
  } catch (error) {
    console.error(`[meditation] ${MEDITATION_TRACK_WARNING_CODES.sessionSolidificationFailed}`, {
      key: MEDITATION_SESSION_STORAGE_KEY,
      track_id: String(trackId || ''),
      reason: String(error?.message || 'UNKNOWN_ERROR')
    });

    if (typeof onFailure === 'function') {
      onFailure(MEDITATION_SESSION_STORAGE_FAILURE_MESSAGE);
    }

    return null;
  }
};

// 段内全部格式都取不到时给用户看的可见提示（沿用既有可见提示位，但**不暂停整场**：
// 单段坏掉不得整场失败 —— R41-⑦；另一条轨（含背景轨）继续播）。
const MEDITATION_SEGMENT_SKIPPED_MESSAGE = '部分音频暂不可播放，已跳过该段并继续本次冥想';

// 段内 playlist 的定位键：重签覆盖 / 重入防护都以「轨 + 段」为粒度（同一段最多重调 1 次）。
const buildSegmentPlaylistKey = (trackKey, segment) => `${trackKey}:${String(segment?.id || '')}`;

const formatTime = (seconds) => {
  const normalizedSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(normalizedSeconds / 60);
  const remainingSeconds = normalizedSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const toMeditationMinutes = (seconds) => Number((Math.max(0, Number(seconds) || 0) / 60).toFixed(1));

// 失败文案：附 requestId（服务端带了才附）。取值优先错误对象上已归一化的 `requestId`
// （共享客户端从失败 envelope 的 `meta` 里取，见 meditation-read-client.js），再回退 `details`。
const describeMeditationReadError = (error) => {
  const code = String(error?.code || '').trim();
  const requestId = String(
    error?.requestId || error?.details?.request_id || error?.details?.requestId || ''
  ).trim();
  const baseMessage = MEDITATION_READ_ERROR_MESSAGES[code] || MEDITATION_READ_ERROR_FALLBACK_MESSAGE;
  const suffix = code ? `（${code}${requestId ? ` · ${requestId}` : ''}）` : '';

  return `${baseMessage}${suffix}`;
};

// ─── 新版（D9）播放计划 → 播放器运行时双轨计划 ────────────────────────────────
// 数据源＝D6 `getTrack` 响应 + 共享 plan（`buildMeditationTrackPlaybackPlan`）；
// **不做任何本地兜底**：无老音频库、无本地兜底 plan、无 fixture 开关、无桩分支。
//   · 背景轨：单条已抽中音频 `loop` 铺底，覆盖整场（含章间留白；规范「播放模型（双轨）」）；
//   · 人声轨：按响应给定顺序逐段 `sequence`，段间按段上挂的 `gap_after_seconds` 留白；
//   · 音量取响应值（缺省才由共享 plan 回退常量）；
//   · **每段 playlist 按响应 `formats[]` 顺序一条格式一项**（opus 在前、mp3 兜底，R41-⑥）
//     ⇒ 「opus 失败降级 mp3」在网络层（fetch 403）与解码层（`audio.onerror`）都能成立；
//   · playlist 项**不含 `fileId`**：响应刻意不下发长期标识（R39 ⑤），链接失效只能**同参重调 getTrack**
//     重签（见 `reissueSegmentPlaylist`），端侧**不得**持有 file_id、也不再有 fileId 重签分支。
const buildRuntimePlaylistItems = ({ audio = null, durationSeconds = 0 }) => {
  const formats = Array.isArray(audio?.formats) ? audio.formats : [];
  const audioId = String(audio?.id || '').trim();

  return formats
    .map((format, formatIndex) => ({
      id: `${audioId || 'audio'}-${formatIndex}`,
      title: String(audio?.label || ''),
      audioUrl: String(format?.url || '').trim(),
      format: String(format?.format || '').trim().toLowerCase(),
      mimeType: String(format?.mime_type || ''),
      duration: durationSeconds
    }))
    .filter((item) => Boolean(item.audioUrl));
};

// 临时 URL 策略 ＋ **端侧收到时刻**：陈旧判定（半有效期）与「同参重调」的唯一基准。
// 收到时刻由端侧自己记（**不**拿本地时钟与响应里的 `issued_at` 对齐——时钟偏移会造成重签风暴）。
const buildRuntimeUrlPolicy = ({ urlPolicy = null, receivedAtMs = Date.now() } = {}) => {
  const receivedAtValue = Number(receivedAtMs);

  return {
    max_age_seconds: Number(urlPolicy?.max_age_seconds) || 0,
    issued_at: String(urlPolicy?.issued_at || ''),
    expires_at: String(urlPolicy?.expires_at || ''),
    received_at_ms: Number.isFinite(receivedAtValue) ? receivedAtValue : Date.now()
  };
};

const buildRuntimeTrackPlan = ({
  playbackPlan,
  trackName = '',
  now = new Date(),
  urlPolicy = null,
  receivedAtMs = Date.now()
}) => {
  const sessionDuration = Math.max(0, Number(playbackPlan?.totals?.total_seconds) || 0);
  const backgroundAudio = playbackPlan?.background?.audio || null;
  const backgroundVolume = Number(playbackPlan?.background?.volume);
  const voiceVolume = Number(playbackPlan?.voice?.volume);
  const backgroundPlaylist = buildRuntimePlaylistItems({
    audio: backgroundAudio,
    durationSeconds: Number(backgroundAudio?.duration_seconds) || 0
  });
  const voiceSegments = [];
  let cursorSeconds = 0;

  (Array.isArray(playbackPlan?.segments) ? playbackPlan.segments : []).forEach((segment, index) => {
    const durationSeconds = Math.max(0, Number(segment.duration_seconds) || 0);
    const playlist = buildRuntimePlaylistItems({ audio: segment.audio, durationSeconds });

    if (segment.track === 'voice') {
      if (playlist.length > 0) {
        voiceSegments.push({
          id: `${segment.section_type || 'voice'}-${index}`,
          // 重签后要按 `section_type` 找回「同一段」⇒ 显式带上（`id` 里的序号会随池内抽签变化）。
          sectionType: String(segment.section_type || ''),
          trackKey: 'voice',
          startSeconds: cursorSeconds,
          durationSeconds,
          endSeconds: cursorSeconds + durationSeconds,
          playbackMode: 'sequence',
          playlist
        });
      }

      cursorSeconds += durationSeconds;
    }

    // 章间留白只挂在「该章最后一个可用段」上（共享 plan 口径）⇒ 逐段累加即得人声轨时间轴。
    cursorSeconds += Math.max(0, Number(segment.gap_after_seconds) || 0);
  });

  const backgroundSegment = backgroundPlaylist.length > 0 && sessionDuration > 0
    ? {
        id: 'background-session-loop',
        sectionType: String(backgroundAudio.section_type || ''),
        trackKey: 'background',
        startSeconds: 0,
        durationSeconds: sessionDuration,
        endSeconds: sessionDuration,
        playbackMode: 'loop',
        playlist: backgroundPlaylist
      }
    : null;

  return {
    segments: [backgroundSegment, ...voiceSegments].filter(Boolean),
    sessionDuration,
    volumes: {
      background: Number.isFinite(backgroundVolume) ? backgroundVolume : undefined,
      voice: Number.isFinite(voiceVolume) ? voiceVolume : undefined
    },
    urlPolicy: buildRuntimeUrlPolicy({ urlPolicy, receivedAtMs }),
    presetName: String(trackName || '').trim() || '冥想',
    sessionKey: getMeditationSessionKey(now)
  };
};

const MeditationPlayer = () => {
  const navigate = useNavigate();
  const { completeMeditationSession } = useWealth();
  const { authStatus, loading: authLoading } = useCloudAwareness();
  const [timeLeft, setTimeLeft] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  // 冥想奖励配置（`app_settings.meditation_rewards`）与播放数据源（D6）解耦：后者失败即报错、不走兜底，
  // 这里只决定完成一次冥想的福豆参数，读失败时该服务自带默认值（不影响播放）。
  const [rewardSettings, setRewardSettings] = useState(DEFAULT_MEDITATION_SETTINGS);
  const [sessionPlan, setSessionPlan] = useState(null);
  const [sessionError, setSessionError] = useState('');
  // 会话固化（R41-⑤）落本地 storage **写失败**的可见提示位：与播放错误位分开，
  // 因为播放成功会清空 `sessionError`（不得把固化失败一并抹掉——R41-⑦ 失败可见且不静默）。
  const [sessionStorageError, setSessionStorageError] = useState('');
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
  // ─── 恢复路径（R39 ⑤ / R41-⑥⑦）的四个防护 ref ────────────────────────────────
  // ① 首读与重签**必须完全同参**：端侧不持有 file_id ⇒ 重签＝用这份参数再调一次 `getTrack`。
  //    任何将来的定位参数（track_id / track_key）都必须走这里，不许两处各拼一份。
  const trackRequestParamsRef = useRef({});
  // ② 重入防护（**同段最多重调 1 次**）：`${trackKey}:${segmentId}` 先入集合再 await ⇒ 并发与连续失败都只会重调一次。
  const reissuedSegmentKeysRef = useRef(new Set());
  // ③ 陈旧判定基准：当前生效的 `url_policy` ＋ 端侧收到时刻（重签成功后整体刷新）。
  const trackUrlPolicyRef = useRef(null);
  // ④ 预置重签闸门：整场至多一次「未过期前主动重签」——防「每段都无脑重调」；**不因重签成功而重置**（宁可少签一次）。
  const preemptiveReissueRef = useRef({ attempted: false });
  // ⑤ 重签后的段内 playlist 覆盖（**不就地改写计划对象**：时间轴仍是首次组装的结果）。
  const segmentPlaylistOverrideRef = useRef(new Map());
  const canPlayMeditation = !authLoading && Boolean(authStatus?.isAuthenticated);

  const getAudioRef = useCallback((trackKey) => (
    trackKey === 'background' ? backgroundAudioRef : voiceAudioRef
  ), []);

  // 段内 playlist：优先用重签后的覆盖（同 `sectionType` 的新链接），否则用计划里的原 playlist。
  const resolveSegmentPlaylist = useCallback((trackKey, segment) => {
    const override = segmentPlaylistOverrideRef.current.get(buildSegmentPlaylistKey(trackKey, segment));

    if (Array.isArray(override) && override.length > 0) {
      return override;
    }

    return Array.isArray(segment?.playlist) ? segment.playlist.filter((item) => item?.audioUrl) : [];
  }, []);

  // 陈旧判定（要求②）：实现在共享层 `resolveMeditationUrlPolicyStaleness`（半有效期 / 缺策略不重签），
  // 这里只提供基准（当前 url_policy ＋ 端侧收到时刻）。
  const isTrackUrlStale = useCallback(() => resolveMeditationUrlPolicyStaleness({
    urlPolicy: trackUrlPolicyRef.current,
    receivedAtMs: trackUrlPolicyRef.current?.received_at_ms,
    nowMs: Date.now()
  }).stale, []);

  // 同参重调 D6 重新签发（R39 ⑤：端侧不持有 file_id，重签＝同参重调本函数）。
  // 只取「与当前段同 section_type」的新 playlist；**不替换整场时间轴**（进度 / 段窗口不动）。
  const reissueSegmentPlaylist = useCallback(async (segment) => {
    const { data } = await meditationReadService.getTrack(trackRequestParamsRef.current);
    const refreshedPlan = buildRuntimeTrackPlan({
      playbackPlan: buildMeditationTrackPlaybackPlan({
        track: data?.track || null,
        chapterTemplate: data?.chapter_template || null,
        sectionAudioPools: data?.section_audio_pools || null
      }),
      trackName: data?.track?.name || '',
      urlPolicy: data?.url_policy || null
    });

    // 重签成功 ⇒ 陈旧基准刷新（本地收到时刻重置为「现在」⇒ 后续段判为 fresh，不会重复重调）。
    trackUrlPolicyRef.current = refreshedPlan.urlPolicy;

    const refreshedSegment = refreshedPlan.segments.find((candidate) => (
      candidate.trackKey === segment.trackKey &&
      String(candidate.sectionType || '') === String(segment.sectionType || '')
    )) || null;
    const refreshedPlaylist = Array.isArray(refreshedSegment?.playlist) ? refreshedSegment.playlist : [];
    // 键与 `resolveSegmentPlaylist` 的读取同源同构：同一份 `buildSegmentPlaylistKey(轨, 段)`（段的 `trackKey`
    // 由 plan 显式挂上，调用点传入的 `trackKey` 与它恒等）。
    const segmentPlaylistKey = buildSegmentPlaylistKey(segment?.trackKey, segment);

    // D1：重签结果**必须写回段内 playlist 覆盖表**——**只写当前段**，不改写计划对象 / 不替换整场时间轴（R42-⑥）。
    // 段内再入（提前 `onended` 的段内前进 / 新格式 `onerror` 的格式降级）会重新 `resolveSegmentPlaylist`，
    // 不写回就回落计划里的**旧签** URL ⇒ 403 ⇒ 同段重调被 `reissuedSegmentKeysRef` 挡住 ⇒ 误报 `SEGMENT_SKIPPED`
    // 并清空该段 audio（也不放宽「同段至多重调 1 次」）。
    // 重签后该 section_type 已无可交付音频 ⇒ **删键**（与读取侧「缺覆盖即回落计划 playlist」自洽，
    // 不留「覆盖表有键但空」的中间态）。
    if (refreshedPlaylist.length > 0) {
      segmentPlaylistOverrideRef.current.set(segmentPlaylistKey, refreshedPlaylist);
    } else {
      segmentPlaylistOverrideRef.current.delete(segmentPlaylistKey);
    }

    return refreshedPlaylist.length > 0 ? refreshedPlaylist : null;
  }, []);

  // 失败恢复的**唯一入口**（要求①）：只对「疑似链接问题」同参重调一次——403 / 签名失败，
  // 或按 `url_policy` 判定已陈旧；解码类错误（`audio.onerror`，源是本地 blob）走格式降级，不浪费重调。
  // 返回刷新后的 playlist（成功）或 null（不可用 / 已用过 / 重调失败 ⇒ 调用方走降级或跳段）。
  const tryReissueSegmentPlaylist = useCallback(async ({ trackKey, segment, error = null }) => {
    const segmentKey = buildSegmentPlaylistKey(trackKey, segment);

    // 重入防护：**先入集合再 await** ⇒ 同一段并发 / 连续失败最多重调 1 次，不可能无限循环。
    if (reissuedSegmentKeysRef.current.has(segmentKey)) {
      return null;
    }

    if (String(error?.message || '') !== AUDIO_FETCH_SIGNATURE_ERROR && !isTrackUrlStale()) {
      return null;
    }

    reissuedSegmentKeysRef.current.add(segmentKey);

    try {
      return await reissueSegmentPlaylist(segment);
    } catch (reissueError) {
      // 重签本身失败：只记日志，交给降级 / 跳段收尾（不静默、也不把整场判死）。
      console.warn(`[meditation] ${MEDITATION_TRACK_WARNING_CODES.reissueFailed}`, {
        track_key: trackKey,
        section_type: String(segment?.sectionType || ''),
        segment_id: String(segment?.id || ''),
        reason: String(reissueError?.message || 'UNKNOWN_ERROR')
      });
      return null;
    }
  }, [isTrackUrlStale, reissueSegmentPlaylist]);

  // 段内全部格式都失败 ⇒ 跳段（可见提示 ＋ 可检索 warning，**不整场失败**、不回退老音频库）。
  const warnSegmentSkipped = useCallback(({ trackKey, segment, playlist, index, error = null, stage = 'load' }) => {
    const lastItem = Array.isArray(playlist) ? playlist[index] : null;

    console.warn(`[meditation] ${MEDITATION_TRACK_WARNING_CODES.segmentSkipped}`, {
      track_key: trackKey,
      section_type: String(segment?.sectionType || ''),
      segment_id: String(segment?.id || ''),
      stage,
      attempts: Array.isArray(playlist) ? playlist.length : 0,
      last_format: String(lastItem?.format || ''),
      reason: String(error?.message || '')
    });
    setSessionError(MEDITATION_SEGMENT_SKIPPED_MESSAGE);
  }, []);

  // 取可播源：D6 已**现签** URL（`formats[]` 每条各一个）⇒ 直接 `fetch → Blob → objectURL`。
  // **无 fileId 重签分支**（R39 ⑤：响应不下发 file_id；重签＝同参重调 getTrack，见上）。
  const resolvePlayableAudioSrc = useCallback(async (playlistItem = {}) => {
    const audioUrl = String(playlistItem.audioUrl || '').trim();
    const cache = blobUrlCacheRef.current;

    if (audioUrl && cache.has(audioUrl)) {
      return cache.get(audioUrl) || '';
    }

    const response = await fetch(audioUrl, { method: 'GET' });
    if (!response.ok && response.status !== 206) {
      // 403 ＝ 临时链接签名失效 / 过期 ⇒ 上层据此触发「同参重调」。
      throw new Error(`AUDIO_FETCH_${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], {
      type: String(playlistItem.mimeType || '').trim() || getMeditationAudioMimeType(audioUrl)
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

  // 自递归（段内下一段）：用具名函数表达式，避免 react-hooks/immutability 的
  // 「Cannot access variable before it is declared」——递归只调自身表达式名，行为与原闭包一致。
  const playTrackPlaylistItem = useCallback(function playTrackPlaylistItemStep(trackKey, segment, itemIndex = 0) {
    const audio = getAudioRef(trackKey).current;
    const playlist = resolveSegmentPlaylist(trackKey, segment);

    if (playlist.length === 0) {
      completeTrackSegment(trackKey, segment?.id || '');
      return;
    }

    const normalizedIndex = Math.max(0, itemIndex % playlist.length);
    const loadToken = trackLoadTokenRef.current[trackKey] + 1;
    trackLoadTokenRef.current[trackKey] = loadToken;

    trackRuntimeRef.current[trackKey] = {
      segmentId: segment.id,
      itemIndex: normalizedIndex,
      completed: false
    };

    void (async () => {
      // ─── 取源：同参重调（要求①）＋ 陈旧预置重签（要求②）＋ 格式降级（要求③）────────
      // 每段按 formats[] 顺序（opus 在前、mp3 兜底）逐条尝试；每条失败后先问一次「要不要同参重调」，
      // 不能重调（已用过 / 与链接无关）就前进到下一条；末条也失败 ⇒ 跳段 ＋ warning（不整场失败）。
      let candidatePlaylist = playlist;
      let index = normalizedIndex;
      let playableSrc = '';
      let failure = null;

      // ② 陈旧判定：需要播放时若链接已过期 / 距过期不足半有效期 ⇒ **先**同参重调一次（整场至多一次）。
      if (!preemptiveReissueRef.current.attempted && isTrackUrlStale()) {
        preemptiveReissueRef.current.attempted = true;
        const preemptivePlaylist = await tryReissueSegmentPlaylist({ trackKey, segment, error: null });

        if (Array.isArray(preemptivePlaylist) && preemptivePlaylist.length > 0) {
          candidatePlaylist = preemptivePlaylist;
          index = Math.min(normalizedIndex, candidatePlaylist.length - 1);
        }
      }

      for (;;) {
        const candidateItem = candidatePlaylist[index];
        failure = null;

        try {
          playableSrc = await resolvePlayableAudioSrc(candidateItem);
          break;
        } catch (error) {
          failure = error;
        }

        // ① 403 / 签名过期 ⇒ 同参重调一次并用新 URL 重试**当前**格式（同段最多 1 次，防重入）。
        const refreshedPlaylist = await tryReissueSegmentPlaylist({ trackKey, segment, error: failure });

        if (Array.isArray(refreshedPlaylist) && refreshedPlaylist.length > 0) {
          candidatePlaylist = refreshedPlaylist;
          index = Math.min(index, candidatePlaylist.length - 1);
          continue;
        }

        // ③ 不能重调 ⇒ 同段降级到下一条格式；末条 ⇒ 跳出走跳段。
        if (index + 1 < candidatePlaylist.length) {
          index += 1;
          continue;
        }

        break;
      }

      if (failure) {
        // 整段（所有格式）都取不到：**跳段 ＋ warning ＋ 可见提示**，不暂停整场（另一条轨继续）。
        warnSegmentSkipped({ trackKey, segment, playlist: candidatePlaylist, index, error: failure });
        completeTrackSegment(trackKey, segment?.id || '');
        return;
      }

      if (trackLoadTokenRef.current[trackKey] !== loadToken) {
        return;
      }

      trackRuntimeRef.current[trackKey] = {
        segmentId: segment.id,
        itemIndex: index,
        completed: false
      };

      audio.pause();
      audio.currentTime = 0;
      audio.src = playableSrc;
      // 音量取本轮计划的响应值（D6 Track 的 `background_track.volume` / `voice_track.volume`）。
      audio.volume = sessionPlanRef.current?.volumes?.[trackKey] ?? 1;
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
          if (index + 1 >= candidatePlaylist.length) {
            completeTrackSegment(trackKey, segment.id);
            return;
          }

          playTrackPlaylistItemStep(trackKey, segment, index + 1);
          return;
        }

        // loop（整场铺底）：重放**同一条**——多条格式时不得回退到已失败的首选格式。
        playTrackPlaylistItemStep(trackKey, segment, index);
      };
      audio.onerror = () => {
        if (trackRuntimeRef.current[trackKey].segmentId !== segment.id) {
          return;
        }

        // 此刻源是本地 blob ⇒ `onerror` 与「链接是否过期」无关，是**解码 / 格式**问题：
        // 同段前进到下一条格式（opus 失败 ⇒ mp3 兜底）；没有下一条 ⇒ 跳段 ＋ warning。
        if (index + 1 < candidatePlaylist.length) {
          playTrackPlaylistItemStep(trackKey, segment, index + 1);
          return;
        }

        warnSegmentSkipped({ trackKey, segment, playlist: candidatePlaylist, index, stage: 'audio_onerror' });
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
  }, [clearTrackRuntime, completeTrackSegment, getAudioRef, getElapsedSeconds, isTrackUrlStale, pausePlayback, resolvePlayableAudioSrc, resolveSegmentPlaylist, tryReissueSegmentPlaylist, warnSegmentSkipped]);

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
      rewardAmount: rewardSettings.rewardPoints,
      allowRepeatReward: rewardSettings.allowRepeatRewards,
      rewardKey: 'default_meditation_program',
      rewardDescription: '完成一次冥想'
    });

    const completionMessage = rewardResult.error
      ? '本次冥想已记入，云端福豆暂未到账。'
      : rewardResult.repeatedRewardBlocked && rewardSettings.rewardPoints > 0
        ? '本次冥想已记入，本次不重复发放福豆。'
        : '本次冥想已记入。';

    window.alert(completionMessage);
    navigate('/');
  }, [clearTrackRuntime, duration, navigate, persistMeditationSession, rewardSettings, stopTicker]);

  const startTicker = useCallback(() => {
    if (timerRef.current || !sessionPlanRef.current) {
      return;
    }

    timerRef.current = window.setInterval(() => {
      const elapsedSeconds = getElapsedSeconds();
      const sessionDuration = sessionPlanRef.current?.sessionDuration || DEFAULT_MEDITATION_SESSION_SECONDS;
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

  // 冥想奖励配置（福豆参数）：与播放数据源解耦，单独读、失败只留日志（沿用默认值），不参与播放计划。
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const settings = await rewardSettingsService.getSettings();

        if (active) {
          setRewardSettings(settings);
        }
      } catch (error) {
        console.error('加载冥想奖励配置失败，本次沿用默认奖励参数:', error);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    // 缓存 Map 的实例在组件生命周期内恒定（useRef(new Map())，从不整体替换）⇒ 在 effect 内捕获引用
    // 供 cleanup 使用，避免 react-hooks/exhaustive-deps 对 `ref.current` 在 cleanup 中取值的告警。
    const blobUrlCache = blobUrlCacheRef.current;

    void (async () => {
      // 恢复路径的防护状态在每次取计划前清空（重入集合 / 段内 playlist 覆盖 / 预置重签闸门 / 陈旧基准）。
      reissuedSegmentKeysRef.current.clear();
      segmentPlaylistOverrideRef.current.clear();
      preemptiveReissueRef.current = { attempted: false };
      trackUrlPolicyRef.current = null;
      setSessionStorageError('');

      try {
        // 唯一数据源：D6 只读云函数（`meditation-read` / action `getTrack`）→ 共享 plan（D9）。
        // 入参**只从这里取**：同参重调（重签）复用同一份，保证首读与重签完全同参（R39 ⑤）。
        const { data } = await meditationReadService.getTrack(trackRequestParamsRef.current);

        if (!active) {
          return;
        }

        // 固化载荷的 `date_key` / `session_key` 与本次组装取**同一个时刻**（不给两处各取一次 `new Date()`）。
        const now = new Date();
        const playbackPlan = buildMeditationTrackPlaybackPlan({
          track: data?.track || null,
          chapterTemplate: data?.chapter_template || null,
          sectionAudioPools: data?.section_audio_pools || null
        });
        const nextPlan = buildRuntimeTrackPlan({
          playbackPlan,
          trackName: data?.track?.name || '',
          now,
          // `url_policy`（响应现签策略）⇒ 陈旧判定基准；`received_at_ms` 由 buildRuntimeTrackPlan 记本地收到时刻。
          urlPolicy: data?.url_policy || null
        });

        // 陈旧判定基准就位（后续每段是否需要重签都看它）。
        trackUrlPolicyRef.current = nextPlan.urlPolicy;

        // 响应合法但没有任何可播段（音频池全空 / 全无可用格式）：显式错误态，**不回退老音频库**。
        if (nextPlan.segments.length === 0 || nextPlan.sessionDuration <= 0) {
          sessionPlanRef.current = null;
          setSessionPlan(null);
          setSessionError(MEDITATION_EMPTY_PLAN_MESSAGE);
          setIsLoaded(false);
          setIsBuffering(false);
          completionHandledRef.current = false;
          return;
        }

        sessionPlanRef.current = nextPlan;
        setSessionPlan(nextPlan);
        setSessionError('');
        setDuration(nextPlan.sessionDuration);
        setTimeLeft(nextPlan.sessionDuration);
        setIsLoaded(true);
        setIsBuffering(false);
        completionHandledRef.current = false;

        // ── R41-⑤ / D7：计划组装完成（抽签已确定）⇒ **开始播放前**固化本次会话 ──────────────
        // `selections` 取**本份计划**的抽签结果（同一批、**不二次抽签**——`playbackPlan` 只在这里组装一次，
        // 重签路径的重新组装只用于取新 playlist，不改写本份固化结果）。
        // 落点＝**本地 storage 键 `liwu_meditation_session_v1`**（零云写：C18 未裁）；写失败可见但不阻断播放。
        solidifyMeditationSession({
          trackId: data?.track?.id || data?.track?._id || '',
          trackVersion: data?.track?.version,
          dateKey: getShanghaiDateKey(now),
          sessionKey: nextPlan.sessionKey,
          selections: playbackPlan?.selections,
          onFailure: setSessionStorageError
        });
      } catch (error) {
        console.error('Failed to load meditation track playback plan:', error);

        if (!active) {
          return;
        }

        // 失败**可见**且**不静默回退**（D9 / R39 ③）：不读老音频库、不造本地兜底 plan、不自动降级。
        sessionPlanRef.current = null;
        setSessionPlan(null);
        setSessionError(describeMeditationReadError(error));
        setIsLoaded(false);
        setIsBuffering(false);
        completionHandledRef.current = false;
      }
    })();

    return () => {
      active = false;
      stopTicker();
      clearTrackRuntime('background');
      clearTrackRuntime('voice');
      blobUrlCache.forEach((blobUrl) => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {
          // revokeObjectURL 失败无需处理：缓存随之 clear，不做任何回退或提示。
        }
      });
      blobUrlCache.clear();
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
  const timeLabel = !isLoaded
    ? (sessionError ? '--:--' : '加载中...')
    : formatTime(timeLeft);
  const footerLabel = isBuffering && isPlaying
    ? '缓冲中...'
    : sessionPlan
      ? `${SESSION_LABELS[sessionPlan.sessionKey] || '冥想'} · ${sessionPlan.presetName}`
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
