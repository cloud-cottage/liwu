import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Play, Pause } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWealth } from '../../context/WealthContext';
import { useCloudAwareness } from '../../context/CloudAwarenessContext';
import { meditationReadService, meditationSessionService } from '../../services/cloudbase.js';
import {
  DEFAULT_MEDITATION_SESSION_SECONDS,
  getMeditationSessionKey,
  getShanghaiDateKey,
  MEDITATION_TRACK_KEYS
} from '@liwu/shared-utils/meditation-session-plan.js';
import {
  MEDITATION_PLAYBACK_SOURCES,
  buildMeditationTrackPlaybackPlan,
  buildSessionSolidification
} from '@liwu/shared-utils/meditation-track-playback-plan.js';
import { writeLocalStorageJSON } from '@liwu/shared-utils/cloudbase-browser-storage.js';
// 取流层（R51 / R49-⑤⑧ v4.34）：抽中后现签（`signAudios`）＋ 预取（`fetch → blob`）＋ 音量配比分支。
// 纯模块（零 import）⇒ 同一套代码由播放器与桩面测试共用。
import {
  buildPlaylistItems,
  createMeditationAudioSourceResolver,
  resolveTrackPrefetchWindow,
  resolveTrackVolume
} from './meditationAudioSource.js';
// R50（完成度上报与福豆发放）：幂等键 / 收听累加器 / 完播判定 / 用户可见文案。
// 端侧只组装证据、由 `meditationSessionService.reportCompletion` 走后端发放（**客户端不再直写余额**）。
import {
  buildMeditationSessionKey,
  createMeditationListenTracker,
  createMeditationSessionId,
  describeMeditationReportError,
  resolveMeditationReportCompletion,
  resolveMeditationReportSuccessMessage
} from '@liwu/shared-utils/meditation-session-client.js';

// R50-①：旧「单次冥想 > 180s 记入」门槛作废（以「完播」取代）——该阈值常量已从本文件移除。
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

// ─── 运行时恢复路径 / 格式降级（R42-④ / R41-⑥⑦） ─────────────────────────────
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

// 段内 playlist 的定位键：重入防护（同段最多重签 1 次）以「轨 + 段」为粒度。
const buildSegmentPlaylistKey = (trackKey, segment) => `${trackKey}:${String(segment?.id || '')}`;

// ─── 混音单流（R45，v4.22）：App 用**单个音频元素**播服务端预混版 ───────────────────────
// 数据源＝D6 Track 响应的 `mix_audio`（共享 plan 已解析成 `mix_audio` ＋ `playback_source`）；
// **播放形态只由它决定**：有可播混音产物 ⇒ 单元素播整场；缺失 ⇒ 现有双轨（**双轨代码保留**）。
//   · 键名与响应字段同名（`mix_audio`），**不自造别名**；它是本播放器运行时的第三个「轨键」，
//     与老双轨的 `MEDITATION_TRACK_KEYS` **并列而不并入**（那份常量属老 `meditation-session-plan.js`
//     冻结层，不得改写 ⇒ 本页各自持有单流键）；
//   · 混音是**单条**现签 URL（opus 在前、mp3 兜底），段窗口＝`[0, 混音时长]` ⇒ 整场由**这一个**
//     音频元素推进；端侧**不再**叠加配比（voice 1.0 / background 0.33 已烘焙进产物）⇒ 音量恒 1；
//   · 双轨口径、失败可见、现签重签、格式降级等既有机制**两条路径共用**（不另起一套）。
const MEDITATION_MIX_TRACK_KEY = 'mix_audio';
// 运行时轨键全集：**同步 / 暂停 / 收尾一律全覆盖**（混音单流时另两个元素本就空闲：
// `pause()` 与清 `src` 对空闲元素都无副作用）⇒ 两种来源共用同一套运行时循环，不按来源分叉。
const MEDITATION_RUNTIME_TRACK_KEYS = Object.freeze([
  ...MEDITATION_TRACK_KEYS,
  MEDITATION_MIX_TRACK_KEY
]);

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

// ─── 新版（D9）播放计划 → 播放器运行时计划（R45：混音单流优先，缺失回退双轨） ──────────
// 数据源＝D6 `getTrack` 响应 + 共享 plan（`buildMeditationTrackPlaybackPlan`）；
// **不做任何本地兜底**：无老音频库、无本地兜底 plan、无 fixture 开关、无桩分支。
//   · **R45 混音单流**：响应 Track 带可播 `mix_audio` ⇒ 运行时计划＝**单个音频元素**的单段；
//     否则＝下面这套既有双轨（**端侧组装，R49 主路径**）；
//   · 背景轨：单条已抽中音频 `loop` 铺底，覆盖整场（含章间留白；规范「播放模型（双轨）」）；
//   · 人声轨：按响应给定顺序逐段 `sequence`，段间按段上挂的 `gap_after_seconds` 留白；
//   · 音量配比分支（R49-⑤，硬）：端侧组装按响应值（`voice_track.volume` / `background_track.volume`）；
//     混音单流**端侧不设音量**（配比已烘焙进产物）——两条路径见 `resolveTrackVolume`；
//   · **每段 playlist 按响应 `formats[]` 顺序一条格式一项**（opus 在前、mp3 兜底，R41-⑥）
//     ⇒ 「opus 失败降级 mp3」在网络层（fetch 403）与解码层（`audio.onerror`）都能成立；
//   · 清单项**只带抽中的 `audio_id`、不带任何 URL**（R51-①：池阶段零 URL）；URL 在播放前由
//     `signAudios` 现签（`resolvePlayableAudioSrc`），403 时**重签**（见 `tryResignSegmentAudio`）；
//     端侧**不得**持有 `file_id`（R39 ⑤ 响应不下发）。

// 临时 URL 策略 ＋ **端侧收到时刻**：随计划记录（供可观测 / 诊断；现签 URL 一律以 `signAudios` 现取为准）。
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

// 混音单流运行时计划（R45）：**单个音频元素、单段覆盖整场**。
// 不满足（无混音产物 / 无可播 URL / 时长非正）⇒ 返回 `null`（调用方走既有双轨）。
// 段形态与双轨段同形（`playlist` / `startSeconds` / `endSeconds` / `playbackMode`）⇒ 段推进、
// 格式降级、现签重签等既有运行时机制**不需要分叉**。
const buildRuntimeMixTrackPlan = ({
  playbackPlan,
  trackName = '',
  now = new Date(),
  urlPolicy = null,
  receivedAtMs = Date.now()
}) => {
  if (playbackPlan?.playback_source !== MEDITATION_PLAYBACK_SOURCES.mixAudio) {
    return null;
  }

  const mixAudio = playbackPlan?.mix_audio || null;
  const sessionDuration = Math.max(0, Number(mixAudio?.duration_seconds) || 0);
  const playlist = buildPlaylistItems({
    audio: mixAudio?.audio,
    durationSeconds: sessionDuration
  });

  if (playlist.length === 0 || sessionDuration <= 0) {
    return null;
  }

  return {
    playbackSource: MEDITATION_PLAYBACK_SOURCES.mixAudio,
    segments: [{
      id: 'mix-audio-session',
      // 混音产物不是 `med_section_audios` 行（无 `_id` / `section_type`）⇒ 空串；段匹配按「轨键 ＋ sectionType」进行，两侧恒等空串 ⇒ 命中同一条单流段。
      sectionType: '',
      trackKey: MEDITATION_MIX_TRACK_KEY,
      startSeconds: 0,
      durationSeconds: sessionDuration,
      endSeconds: sessionDuration,
      playbackMode: 'sequence',
      playlist
    }],
    sessionDuration,
    // 配比已烘焙进混音产物 ⇒ 端侧音量恒 1（空对象 ⇒ 播放时 `?? 1` 兜底，不写死常量覆盖响应）。
    volumes: {},
    urlPolicy: buildRuntimeUrlPolicy({ urlPolicy, receivedAtMs }),
    presetName: String(trackName || '').trim() || '冥想',
    sessionKey: getMeditationSessionKey(now)
  };
};

const buildRuntimeTrackPlan = ({
  playbackPlan,
  trackName = '',
  now = new Date(),
  urlPolicy = null,
  receivedAtMs = Date.now()
}) => {
  // R45：混音单流优先——有可播混音产物 ⇒ **单个音频元素**播整场（时长＝混音产物时长）；
  // 返回 null ⇒ 落到下面的既有双轨组装（回退路径，**代码与语义一字未改**）。
  const mixPlan = buildRuntimeMixTrackPlan({ playbackPlan, trackName, now, urlPolicy, receivedAtMs });

  if (mixPlan) {
    return mixPlan;
  }

  const sessionDuration = Math.max(0, Number(playbackPlan?.totals?.total_seconds) || 0);
  const backgroundAudio = playbackPlan?.background?.audio || null;
  const backgroundVolume = Number(playbackPlan?.background?.volume);
  const voiceVolume = Number(playbackPlan?.voice?.volume);
  const backgroundPlaylist = buildPlaylistItems({
    audio: backgroundAudio,
    durationSeconds: Number(backgroundAudio?.duration_seconds) || 0
  });
  const voiceSegments = [];
  let cursorSeconds = 0;

  (Array.isArray(playbackPlan?.segments) ? playbackPlan.segments : []).forEach((segment, index) => {
    const durationSeconds = Math.max(0, Number(segment.duration_seconds) || 0);
    const playlist = buildPlaylistItems({ audio: segment.audio, durationSeconds });

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
    // R45：双轨（回退）路径的显式来源标注——与单流分支同形，供运行时分流与质检断言。
    playbackSource: MEDITATION_PLAYBACK_SOURCES.dualTrack,
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
  const [sessionPlan, setSessionPlan] = useState(null);
  const [sessionError, setSessionError] = useState('');
  // 会话固化（R41-⑤）落本地 storage **写失败**的可见提示位：与播放错误位分开，
  // 因为播放成功会清空 `sessionError`（不得把固化失败一并抹掉——R41-⑦ 失败可见且不静默）。
  const [sessionStorageError, setSessionStorageError] = useState('');
  const backgroundAudioRef = useRef(new Audio());
  const voiceAudioRef = useRef(new Audio());
  // R45：混音单流的**那一个**音频元素（双轨路径下恒空闲）。
  const mixAudioRef = useRef(new Audio());
  const timerRef = useRef(null);
  const sessionStartMsRef = useRef(null);
  const elapsedBeforePauseRef = useRef(0);
  const sessionPersistedRef = useRef(false);
  const listenedSecondsRef = useRef(0);
  // ─── R50（完成度上报 + 福豆发放）状态 ─────────────────────────────────────────
  // ① 幂等键（R50-④）/ 上报上下文：**每场会话装载计划时一次性生成**（同一场内重入 / 重试复用同一
  //    `session_key`；不含 `Date.now()`）。
  const reportSessionKeyRef = useRef('');
  const reportContextRef = useRef(null);
  // ② 收听秒数累加器（R50-②）：**只吃媒体元素 `currentTime` 增量**，不用墙钟 / 定时器 tick。
  const mediaListenTrackerRef = useRef(createMeditationListenTracker());
  // ③ 是否「到达计划末尾自然结束」——完播判定（R50-②(b)）的必要条件之一。
  const naturalEndReachedRef = useRef(false);
  // ④ 是否真正开始过播放：用户主动结束时的上报名义门（从未播放 ⇒ 不上报，避免空场记录）。
  const playbackStartedRef = useRef(false);
  // ─── 取流层（R51 / R49-⑤⑧ v4.34）：抽中后现签 ＋ 预取（`fetch → blob`）＋ 释放 ─────────────
  // 解析器实例（内含「现签缓存 ＋ blob 缓存」）挂在 ref 上：**挂载时创建**（见下方 effect）、
  // **卸场 / 切源时释放**（`revokeObjectURL`，R42-④）。同场按签名 URL 去重、复用。
  const audioSourceResolverRef = useRef(null);
  const trackLoadTokenRef = useRef({ background: 0, voice: 0, [MEDITATION_MIX_TRACK_KEY]: 0 });
  const isPlayingRef = useRef(false);
  const sessionPlanRef = useRef(null);
  const completionHandledRef = useRef(false);
  const trackRuntimeRef = useRef({
    background: { segmentId: '', itemIndex: 0, completed: false },
    voice: { segmentId: '', itemIndex: 0, completed: false },
    [MEDITATION_MIX_TRACK_KEY]: { segmentId: '', itemIndex: 0, completed: false }
  });
  // ─── 失败恢复（R41-⑥⑦ / R42-④）：只在「链接签名失效」时**重签一次**（重入防护）──────────
  // 首读的定位参数（同参重签 = 现签同一 `audio_id`，不再重取整场 Track）。
  const trackRequestParamsRef = useRef({});
  // 重入防护（**同段最多重签 1 次**）：`${trackKey}:${segmentId}` 先入集合再 await ⇒ 并发与连续失败都只会重签一次。
  const reissuedSegmentKeysRef = useRef(new Set());
  const canPlayMeditation = !authLoading && Boolean(authStatus?.isAuthenticated);

  const getAudioRef = useCallback((trackKey) => {
    // R45：混音单流用它自己的那一个元素；双轨仍是既有两个元素。
    if (trackKey === MEDITATION_MIX_TRACK_KEY) {
      return mixAudioRef;
    }

    return trackKey === 'background' ? backgroundAudioRef : voiceAudioRef;
  }, []);

  // 段内 playlist：清单条目**只带 `audio_id`（端侧组装）或产品 URL（混音单流）**，二者皆无则丢弃。
  const resolveSegmentPlaylist = useCallback((trackKey, segment) => (
    Array.isArray(segment?.playlist)
      ? segment.playlist.filter((item) => Boolean(item?.audioId || item?.audioUrl))
      : []
  ), []);

  // 失败恢复的**唯一入口**（R42-④）：只在「链接签名失效（403）」时**重签一次**——
  // 同 `audio_id` 经 `signAudios` 现取新 URL（并释放旧 blob）；解码类错误（`audio.onerror`，
  // 源是本地 blob）与链接无关，走格式降级、不浪费重签。
  // 返回是否已重签（调用方据此重试当前格式或降级）。
  const tryResignSegmentAudio = useCallback(async ({ trackKey, segment, item = null, error = null }) => {
    if (String(error?.message || '') !== AUDIO_FETCH_SIGNATURE_ERROR) {
      return false;
    }

    const audioId = String(item?.audioId || '').trim();

    // 混音单流产物的 URL 由 D6 现签、无 `audio_id` ⇒ 此处不重签（走降级 / 跳段）。
    if (!audioId) {
      return false;
    }

    const segmentKey = buildSegmentPlaylistKey(trackKey, segment);

    // 重入防护：**先入集合再 await** ⇒ 同一段并发 / 连续失败最多重签 1 次，不可能无限循环。
    if (reissuedSegmentKeysRef.current.has(segmentKey)) {
      return false;
    }

    reissuedSegmentKeysRef.current.add(segmentKey);

    try {
      return await audioSourceResolverRef.current.resignAudio(audioId);
    } catch (reissueError) {
      // 重签本身失败：只记日志，交给降级 / 跳段收尾（不静默、也不把整场判死）。
      console.warn(`[meditation] ${MEDITATION_TRACK_WARNING_CODES.reissueFailed}`, {
        track_key: trackKey,
        section_type: String(segment?.sectionType || ''),
        segment_id: String(segment?.id || ''),
        audio_id: audioId,
        reason: String(reissueError?.message || 'UNKNOWN_ERROR')
      });
      return false;
    }
  }, []);

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

  // 取可播源（R51-① / R42-④）：清单条目带 `audio_id` ⇒ 现签后按格式取 URL；带产品 URL（混音单流）
  // ⇒ 直取。一律 `fetch → Blob → objectURL`（**禁用 `new Audio()+load` 作预取**，R49-⑧ v4.34）。
  const resolvePlayableAudioSrc = useCallback((playlistItem = {}) => {
    const resolver = audioSourceResolverRef.current;

    if (!resolver) {
      return Promise.reject(new Error('AUDIO_SOURCE_NOT_READY'));
    }

    return resolver.resolvePlayableSrc(playlistItem);
  }, []);

  // 预取（R49-⑤，硬）：窗口 ≥ **当前段 ＋ 下一段**（同一轨）——现签（一次批量）＋ `fetch → blob`。
  // 只对窗口内**已抽中**的 `audio_id` 现签（**绝不一次把整场全签**，R51-②）；失败不阻断播放。
  const prefetchTrackSegments = useCallback((trackKey, segment) => {
    const plan = sessionPlanRef.current;
    const resolver = audioSourceResolverRef.current;

    if (!plan || !resolver) {
      return;
    }

    const window = resolveTrackPrefetchWindow({
      segments: plan.segments,
      trackKey,
      segmentId: String(segment?.id || '')
    });
    const audioIds = [];

    window.forEach((windowSegment) => {
      resolveSegmentPlaylist(trackKey, windowSegment).forEach((item) => {
        if (item?.audioId) {
          audioIds.push(item.audioId);
        }
      });
    });

    if (audioIds.length === 0) {
      return;
    }

    void resolver.prefetchAudioIds(audioIds).catch((error) => {
      // 预取失败**只记日志**（不阻断）：真正播放时 `resolvePlayableAudioSrc` 会再取一次并如实报错。
      console.warn(`[meditation] PREFETCH_FAILED`, {
        track_key: trackKey,
        segment_id: String(segment?.id || ''),
        reason: String(error?.message || 'UNKNOWN_ERROR')
      });
    });
  }, [resolveSegmentPlaylist]);

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
    // R45：全覆盖（混音单流时另两个元素本就空闲；`pause()` 对空闲元素无副作用）。
    MEDITATION_RUNTIME_TRACK_KEYS.forEach((trackKey) => {
      getAudioRef(trackKey).current.pause();
    });
    setIsPlaying(false);
    setIsBuffering(false);
  }, [getAudioRef, getElapsedSeconds, stopTicker]);

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

  // R50-②：把各媒体元素实时的 `currentTime` 采样进累加器，并把 `listenedSecondsRef` 抬到当前累计值。
  //   · 只取「有 src 的元素」（空闲元素恒 0，无需采样）；
  //   · **不用墙钟**：暂停 / 缓冲期间 `currentTime` 不动 ⇒ 自然不计入（R50-②）。
  const sampleMediaListened = useCallback(() => {
    MEDITATION_RUNTIME_TRACK_KEYS.forEach((trackKey) => {
      const audio = getAudioRef(trackKey)?.current;

      if (audio && audio.src) {
        mediaListenTrackerRef.current.sample(trackKey, audio.currentTime);
      }
    });

    listenedSecondsRef.current = Math.max(listenedSecondsRef.current, mediaListenTrackerRef.current.getSeconds());
  }, [getAudioRef]);

  // 结算（R50-③ / R49-④ v4.33 修订注）：**只在「完播」或「用户主动结束」时调用一次**（`sessionPersistedRef` 兜底）。
  //   · 本地统计 / 徽章进度沿用既有路径，但 **`rewardAmount: 0`** ⇒ **不发福豆、不写余额**（R50-①③）；
  //   · 福豆改由 `meditationSessionService.reportCompletion` **云端上报 + 发放**（客户端不再直写 `users`/`user_wallets`）；
  //   · 上报失败**可见**（返回 `message` 供调用方 alert）且**不静默当成功**（R41-⑦ / R50-④）；
  //     幂等键＝同一 `reportSessionKeyRef` —— 重试只会复用同一 `session_key`，**绝不重发第二次金额**。
  const persistMeditationSession = useCallback(async ({
    durationMinutes,
    endedReason = 'completed',
    rewardDescription = '完成一次冥想'
  }) => {
    if (sessionPersistedRef.current) {
      return { reported: false, completed: false, message: '' };
    }

    sessionPersistedRef.current = true;
    sampleMediaListened();

    // 本地统计 + 徽章进度（`rewardAmount: 0` ⇒ 无福豆、无余额写入；R50-①③）。
    try {
      await completeMeditationSession({
        duration: Math.max(1, Number(durationMinutes) || 0),
        rewardAmount: 0,
        rewardDescription
      });
    } catch (statsError) {
      console.error('记录冥想统计 / 徽章进度失败:', statsError);
    }

    const context = reportContextRef.current;

    if (!context) {
      return { reported: false, completed: false, message: '' };
    }

    const listenedSeconds = mediaListenTrackerRef.current.getSeconds();
    const completed = resolveMeditationReportCompletion({
      reachedNaturalEnd: endedReason === 'completed' && naturalEndReachedRef.current,
      forwardSkipDetected: mediaListenTrackerRef.current.hasForwardSkip(),
      listenedSeconds,
      planTotalSeconds: context.planTotalSeconds
    });

    try {
      const result = await meditationSessionService.reportCompletion({
        trackKey: context.trackKey,
        trackVersion: context.trackVersion,
        sessionKey: reportSessionKeyRef.current,
        dateKey: context.dateKey,
        selections: context.selections,
        listenedSeconds,
        completed,
        endedReason,
        mode: 'app'
      });

      return { reported: true, completed, message: resolveMeditationReportSuccessMessage(result.data) };
    } catch (error) {
      console.error('[meditation] 完成度上报失败:', error);
      return { reported: true, completed, error, message: describeMeditationReportError(error) };
    }
  }, [completeMeditationSession, sampleMediaListened]);

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

    // 取流（R51 / R49-⑤⑧ v4.34）：**先预取「当前段 ＋ 下一段」**（现签 ＋ `fetch → blob`）；
    // 再按 formats[] 顺序（opus 在前、mp3 兜底）逐条尝试——403 ⇒ **重签一次**并重试当前格式；
    // 解码失败（`onerror`，见下）⇒ 下一条格式；末条也失败 ⇒ 跳段 ＋ warning ＋ 可见提示（不整场失败）。
    prefetchTrackSegments(trackKey, segment);

    void (async () => {
      const candidatePlaylist = playlist;
      let index = normalizedIndex;
      let playableSrc = '';
      let failure = null;

      for (;;) {
        const candidateItem = candidatePlaylist[index];
        failure = null;

        try {
          playableSrc = await resolvePlayableAudioSrc(candidateItem);
          break;
        } catch (error) {
          failure = error;
        }

        // 403 / 签名失效 ⇒ 重签当前 audio（同段最多 1 次，防重入），用新 URL 重试**当前**格式。
        const resigned = await tryResignSegmentAudio({ trackKey, segment, item: candidateItem, error: failure });

        if (resigned) {
          continue;
        }

        // 不能重签（已用过 / 与链接无关）⇒ 同段降级到下一条格式；末条 ⇒ 跳出走跳段。
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
      // 音量配比分支（R49-⑤，硬）：端侧组装按响应值；混音单流**端侧不设音量**（配比已烘焙进产物）。
      audio.volume = resolveTrackVolume({
        isSingleStream: sessionPlanRef.current?.playbackSource === MEDITATION_PLAYBACK_SOURCES.mixAudio,
        volumes: sessionPlanRef.current?.volumes,
        trackKey
      });
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
  }, [clearTrackRuntime, completeTrackSegment, getAudioRef, getElapsedSeconds, pausePlayback, prefetchTrackSegments, resolvePlayableAudioSrc, resolveSegmentPlaylist, tryResignSegmentAudio, warnSegmentSkipped]);

  const syncTrackPlayback = useCallback((elapsedSeconds) => {
    const plan = sessionPlanRef.current;

    if (!plan) {
      return;
    }

    MEDITATION_RUNTIME_TRACK_KEYS.forEach((trackKey) => {
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
    // 到达计划末尾（自然结束）⇒ 完播判定的必要条件之一（R50-②(b)）。
    naturalEndReachedRef.current = true;
    stopTicker();
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsBuffering(false);
    // 清空音源**前**最后一次采样（R50-②：收听秒数取媒体 currentTime 增量）。
    sampleMediaListened();
    MEDITATION_RUNTIME_TRACK_KEYS.forEach((trackKey) => clearTrackRuntime(trackKey));
    elapsedBeforePauseRef.current = Math.max(elapsedBeforePauseRef.current, duration || 0);

    // 结算：**完播上报**（R49-④ v4.33：只在完播 / 主动结束时上报一次）。福豆由云端发放。
    const reportResult = await persistMeditationSession({
      durationMinutes: toMeditationMinutes(listenedSecondsRef.current),
      endedReason: 'completed',
      rewardDescription: '完成一次冥想'
    });

    window.alert(reportResult.message || '本次冥想已记入。');
    navigate('/');
  }, [clearTrackRuntime, duration, navigate, persistMeditationSession, sampleMediaListened, stopTicker]);

  const startTicker = useCallback(() => {
    if (timerRef.current || !sessionPlanRef.current) {
      return;
    }

    timerRef.current = window.setInterval(() => {
      const elapsedSeconds = getElapsedSeconds();
      const sessionDuration = sessionPlanRef.current?.sessionDuration || DEFAULT_MEDITATION_SESSION_SECONDS;
      // R50-②：收听秒数**只吃媒体元素 `currentTime` 增量**（不再用墙钟 `elapsedSeconds`）。
      // 墙钟 `elapsedSeconds` 仍仅用于**时间轴推进 / 段窗口匹配**（R42：不改时间轴）。
      sampleMediaListened();
      setDuration(sessionDuration);
      setTimeLeft(Math.max(0, Math.ceil(sessionDuration - elapsedSeconds)));
      syncTrackPlayback(elapsedSeconds);

      const stillHasPlayableContent = MEDITATION_RUNTIME_TRACK_KEYS.some((trackKey) => {
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
  }, [completePlayback, getElapsedSeconds, sampleMediaListened, syncTrackPlayback]);

  // 取流解析器（R51 / R49-⑤⑧）：挂载时创建一次（现签缓存 ＋ blob 缓存），卸场 `releaseAll()` 释放。
  useEffect(() => {
    audioSourceResolverRef.current = createMeditationAudioSourceResolver({
      signAudios: (audioIds) => meditationReadService.signAudios(audioIds)
    });

    return () => {
      audioSourceResolverRef.current?.releaseAll();
      audioSourceResolverRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      // 失败恢复的重入集合在每次取计划前清空（同段最多重签 1 次）。
      reissuedSegmentKeysRef.current.clear();
      setSessionStorageError('');
      // R50：本场上报状态复位（幂等键 / 上下文 / 收听累加器 / 完播与播放标志）。
      reportSessionKeyRef.current = '';
      reportContextRef.current = null;
      mediaListenTrackerRef.current.reset();
      listenedSecondsRef.current = 0;
      naturalEndReachedRef.current = false;
      playbackStartedRef.current = false;

      try {
        // 唯一数据源：D6 只读云函数（`meditation-read` / action `getTrack`）→ 共享 plan（D9）。
        // 抽签结果（`audio_id`）只在本份计划里确定一次；URL 一律在播放前由 `signAudios` 现签（R51-①）。
        const { data } = await meditationReadService.getTrack(trackRequestParamsRef.current);

        if (!active) {
          return;
        }

        // 固化载荷的 `date_key` / `session_key` 与本次组装取**同一个时刻**（不给两处各取一次 `new Date()`）。
        const now = new Date();
        // 抽签源＝**池元数据** `slot_pools`（R51-①：条目只有 `id` / `section_type` / `duration` /
        //   `label` ＋ **可交付标记 `deliverable`**，**零 URL**）。
        //   · `deliverable` 在此**真正被消费** —— 只有 `deliverable:true` 的候选可被抽中（`false` 恒不可选）；
        //   · 带现签 URL 的旧形状池 `section_audio_pools` **不再作为抽签源**（URL 一律由 `signAudios`
        //     在「本段将要播放（＋下一段预取）」时才现签；**不得回退到池里的 URL**）；
        //   · 过渡兼容：池条目**缺 `deliverable`**（老 / 过渡响应）时，计划层沿用既有回退判据
        //     （见 `isMeditationAudioSelectable`）——**该回退不重新把 URL 变成抽签依赖**。
        const playbackPlan = buildMeditationTrackPlaybackPlan({
          track: data?.track || null,
          chapterTemplate: data?.chapter_template || null,
          sectionAudioPools: data?.slot_pools || null
        });
        const nextPlan = buildRuntimeTrackPlan({
          playbackPlan,
          trackName: data?.track?.name || '',
          now,
          // `url_policy`（响应现签策略）随计划记录、供可观测；现签 URL 一律现取（见 signAudios）。
          urlPolicy: data?.url_policy || null
        });

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

        // ── R50（完成度上报）／R49-④：本场**上报上下文 + 幂等键**在此一次性确定 ────────────────
        // `session_key` 含 `track_key ＋ date_key ＋ 本场会话标识`、**绝不含 `Date.now()`**（R50-④）；
        // 同一场内「完播 / 主动结束 / 重试」都复用这同一份 ⇒ 幂等成立、绝不重发第二次金额。
        // `selections` 取**本份计划**的抽签结果（与下方固化同源、**不二次抽签**）。
        const reportDateKey = getShanghaiDateKey(now);

        try {
          reportSessionKeyRef.current = buildMeditationSessionKey({
            trackKey: data?.track?.track_key,
            dateKey: reportDateKey,
            sessionId: createMeditationSessionId()
          });
          reportContextRef.current = {
            trackKey: String(data?.track?.track_key || '').trim(),
            trackVersion: data?.track?.version,
            dateKey: reportDateKey,
            selections: playbackPlan?.selections || [],
            planTotalSeconds: (playbackPlan?.selections || []).reduce(
              (sum, selection) => sum + Math.max(0, Number(selection?.duration_seconds) || 0),
              0
            )
          };
        } catch (sessionKeyError) {
          // 幂等键构造失败 ⇒ 本场**不可上报**（**可见提示**、不假造 key、不静默）。
          reportSessionKeyRef.current = '';
          reportContextRef.current = null;
          console.error('[meditation] 构造上报 session_key 失败:', sessionKeyError);
          setSessionStorageError('本次冥想的完成度上报未能初始化，福豆可能无法发放。');
        }

        // ── R41-⑤ / D7：计划组装完成（抽签已确定）⇒ **开始播放前**固化本次会话 ──────────────
        // `selections` 取**本份计划**的抽签结果（同一批、**不二次抽签**——`playbackPlan` 只在这里组装一次，
        // 播放期只现签 URL，**绝不重新抽签**）。
        // 落点＝**本地 storage 键 `liwu_meditation_session_v1`**（零云写：C18 未裁）；写失败可见但不阻断播放。
        solidifyMeditationSession({
          trackId: data?.track?.id || data?.track?._id || '',
          trackVersion: data?.track?.version,
          dateKey: reportDateKey,
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
      MEDITATION_RUNTIME_TRACK_KEYS.forEach((trackKey) => clearTrackRuntime(trackKey));
      // 卸场释放全部 blob（`revokeObjectURL`）：解析器的 `releaseAll()`（R42-④）。
      audioSourceResolverRef.current?.releaseAll();
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
    // R50：一旦真正开始播放 ⇒ 用户主动结束时应上报本场（`ended_reason: 'user_ended'`）。
    playbackStartedRef.current = true;
    setIsPlaying(true);
    setIsBuffering(true);

    const playableAudios = MEDITATION_RUNTIME_TRACK_KEYS
      .map((trackKey) => getAudioRef(trackKey).current)
      .filter((audio) => audio.src);
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
  }, [canPlayMeditation, getAudioRef, isLoaded, pausePlayback, startTicker, syncTrackPlayback]);

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
  // 页脚＝**复用既有可见提示位**：播放错误优先，其次会话固化（本地 storage 写失败）——两者都可见、都不静默。
  const footerMessage = sessionError || sessionStorageError;

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
    if (window.confirm('确定要结束本次冥想吗？')) {
      stopTicker();
      // 清空音源**前**最后一次采样（R50-②：收听秒数取媒体 currentTime 增量）。
      sampleMediaListened();
      MEDITATION_RUNTIME_TRACK_KEYS.forEach((trackKey) => clearTrackRuntime(trackKey));
      void (async () => {
        // R49-④ v4.33 修订注：**用户主动结束**也上报一次（复用同一 `session_key`）。
        // 从未开始播放（纯浏览）⇒ 不产生上报（避免空场记录）。
        if (playbackStartedRef.current && !sessionPersistedRef.current) {
          const reportResult = await persistMeditationSession({
            durationMinutes: toMeditationMinutes(listenedSecondsRef.current),
            endedReason: 'user_ended',
            rewardDescription: '主动结束一次冥想'
          });

          // 上报结果**可见**（成功 / 失败都给用户话；失败不静默当成功）。
          if (reportResult.message) {
            window.alert(reportResult.message);
          }
        }

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
          {footerMessage ? `${footerLabel} · ${footerMessage}` : footerLabel}
        </div>
      </div>
    </div>
  );
};

export default MeditationPlayer;
