// ─── 后台 Track 预览（R43；**新建独立组件**，不塞进 MeditationPage.jsx）────────────────────────
//
// 【口径源】docs/meditation.admin.partner.spec.md v4.12 的 **R43 ①~⑩ ＋「实现约束」**
//   · R43-① 数据源**一律经 D6 只读云函数**（`meditation-read` / `getTrack`）——**后台也不得直连 DB**
//     组装播放（冥想集合后台同样不直读，管理员身份不是豁免理由）。
//   · R43-② 预览**零写盘**：不写本地会话键、不写任何云集合、不写冥想集合；
//     抽签结果**只在本组件内存 state**，关闭预览即丢弃。
//   · R43-③ 预览基于**已保存版本**（D6 只读库）⇒ UI 明示「预览基于已保存版本 vN；未保存改动不生效」；
//     **绝不**为让草稿生效而先写库（预览即污染数据）。
//   · R43-④ 抽签：**每次开预览抽一次**、本次预览内段序与候选不再变化；「换一批」＝**显式重抽**；
//     `rng` 可注入（缺省 `Math.random`）、**无固定种子**（不写死种子伪装随机）。
//   · R43-⑤ 缺音频**分两类并可计数**（① 池空 ② 池非空但无可用格式）⇒ **跳段 ＋ warning**、段级文案**逐字**
//     「{章节名 · section 名} 暂无可播放音频，已跳过该段（继续播放）」＋ 面板汇总；**绝不整场失败**
//     （背景轨继续、人声顺序继续）。
//   · R43-⑥ 失败态**三态分开**（函数未部署 / 调用失败 ≠ `TRACK_NOT_FOUND` ≠ `TRACK_DISABLED`），
//     带 `requestId`（有则示）＋「重试」；未部署**不得**显示为「无数据」「Track 不存在」；
//     文案**一律不得**声称「无权限」。
//   · R43-⑦ 恢复策略简化＝**403 / 签名失败 ⇒ 同参整场重调 `getTrack` 至多 1 次（只做闸门级）**；
//     **不做段级覆盖表**、**不依赖 R42-⑥**；重调一次后仍失败 ⇒ 直接进 R43-⑥ 的错误态。
//   · R43-⑧ 时长**两把尺子并存**（面板估算原地不动、不改算法；此处并列「实测预览总时长」＝
//     Σ 人声段实测 ＋ Σ 章间留白（**背景 loop 不计入**），并标注与 15:00 软基准 / 910s 章上限之和
//     **不是同一把尺子**、不得互推）。
//   · R43-⑨ UI 显示**实际音量取值**并标明来源「响应值」/「回退常量」（响应为准、绝不覆盖）。
//   · R43-⑩ 零夹具纪律：本文件**无环境开关 / 无测试分支 / 无固定种子 / 无调试组件**；测试替身只打**测试侧**
//     （拦 `/api/cloudbase-proxy`，或注入 `callFunction` / `readClient` / `rng`）。
//
// 【共享层原样复用】播放计划一律由 `buildMeditationTrackPlaybackPlan`
// （packages/shared-utils/meditation-track-playback-plan.js）组装；读契约与错误码一律取自
// `meditation-read-client.js`——后台**不另写一份、也不复制**（R43 实现约束 2）。
// 【与老链路的关系】老预览器与老预览计划函数属**老四 tab**（R41-⑫ 冻结）⇒ 本组件**另起**：
// 不 import 它们、不调用老 session-plan、不读后台老五项配置（音频库 / 构图 / 日历 / 冥思库 / 奖励设置）。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildMeditationTrackPlaybackPlan,
  MEDITATION_PLAYBACK_TRACK_KEYS,
  MEDITATION_PLAYBACK_VOLUME_DEFAULTS,
  MEDITATION_PLAYBACK_WARNING_CODES
} from '@liwu/shared-utils/meditation-track-playback-plan.js';
import { MEDITATION_READ_ERROR_CODES } from '@liwu/shared-utils/meditation-read-client.js';
import {
  getMeditationSectionTypeMeta,
  MEDITATION_CHAPTER_LABELS,
  MEDITATION_SECTION_TYPE_LABELS
} from '@liwu/shared-utils/meditation-track-template.js';
import { meditationReadClient as cloudbaseMeditationReadClient } from '../../services/cloudbase.js';

// ─── 常量 / 文案 ─────────────────────────────────────────────────────────────

// R43-② 的纪律（零写盘 / 抽签只在内存）属**实现约束**，不是给管理员看的产品文案 ⇒ UI 只说
// 管理员关心的那件事；编号 / 「口径」/「零写盘」/「落盘」/「夹具」这类工程术语一律不进 UI。
const PREVIEW_INSURANCE_NOTICE = '预览仅在本面板试听，不会保存任何数据。';
const PREVIEW_VOLUME_SOURCE_LABELS = Object.freeze({ response: '响应值', fallback: '回退常量' });
const PREVIEW_RUNTIME_TAKE_FAILED_CODE = 'SEGMENT_TAKE_FAILED';
const PREVIEW_AUDIO_SIGNATURE_ERROR_PATTERN = /^AUDIO_FETCH_(401|403)$/;

// 失败态分桶（R43-⑥）：三态**各自独立文案**，不得合并；另留一桶承载「D6 返回了其它错误码」。
const PREVIEW_ERROR_BUCKETS = Object.freeze({
  callFailed: 'call_failed',
  trackNotFound: 'track_not_found',
  trackDisabled: 'track_disabled',
  readFailed: 'read_failed'
});

// 「函数未部署 / 调用失败」一类：`callFunction` 抛错（本地 `CALL_FAILED`）与「响应不是合法信封」
// （`INVALID_PAYLOAD`——未部署 / 代理返回 HTML 时正是这一形态）都归此态。
const PREVIEW_DEPLOYMENT_ERROR_CODES = new Set([
  MEDITATION_READ_ERROR_CODES.callFailed,
  MEDITATION_READ_ERROR_CODES.invalidPayload
]);

// ─── 纯工具（不复制共享层算法；只做展示用的读值与拼字）─────────────────────────

const toText = (value) => (value == null ? '' : String(value));

const readResponseVolume = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const formatPreviewSeconds = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
};

// 抽签值记录 / 回放（两个共享模块的抽签值由本组件提供）
//   · 首次开预览 /「换一批」⇒ **新抽**（记录本次抽签值）；
//   · 403 后同参整场重调 ⇒ **回放同一批抽签值**（候选不因播放失败而静默变化，R43-④），
//     仅当池子变大、抽签值不够用时才继续取随机值。
const createDrawRecorder = (randomSource) => {
  const tape = [];
  const record = () => {
    const value = Number(randomSource());
    tape.push(Number.isFinite(value) ? value : 0);
    return value;
  };
  record.tape = tape;
  return record;
};

const createDrawPlayer = (tape, randomSource) => {
  let index = 0;
  return () => {
    if (index < tape.length) {
      const value = tape[index];
      index += 1;
      return value;
    }
    return randomSource();
  };
};

const buildPreviewRequestParams = ({ trackId = '', trackKey = '' } = {}) => {
  const params = {};
  const normalizedId = toText(trackId).trim();
  const normalizedKey = toText(trackKey).trim();

  if (normalizedId) {
    params.track_id = normalizedId;
  }
  if (normalizedKey) {
    params.track_key = normalizedKey;
  }

  return params;
};

// 段级文案的「{章节名 · section 名}」：章节名 / section 名按 R21 权威对照表的**常量值**拼写
// （`MEDITATION_CHAPTER_LABELS` ＋ `MEDITATION_SECTION_TYPE_LABELS`，源＝代码常量）。
const resolvePreviewSectionLabel = (sectionType, chapters = []) => {
  const normalizedType = toText(sectionType).trim();
  const meta = getMeditationSectionTypeMeta(normalizedType);
  const chapter = (Array.isArray(chapters) ? chapters : []).find((entry) => (
    (Array.isArray(entry?.section_types) ? entry.section_types : []).map(toText).includes(normalizedType)
  )) || null;
  const chapterKey = toText(meta?.chapter_key || chapter?.chapter_key).trim();
  const chapterLabel = MEDITATION_CHAPTER_LABELS[chapterKey] || toText(chapter?.label).trim() || chapterKey || '未知章节';
  const sectionLabel = MEDITATION_SECTION_TYPE_LABELS[normalizedType] || toText(meta?.label).trim() || normalizedType || '未知 Section';

  return `${chapterLabel} · ${sectionLabel}`;
};

const buildPreviewSegmentSkipMessage = (sectionType, chapters) => (
  `${resolvePreviewSectionLabel(sectionType, chapters)} 暂无可播放音频，已跳过该段（继续播放）`
);

// 缺音频两类**分开计数**＋运行期取源失败另计（R43-⑤）。
const buildPreviewMissingSummary = ({ plan = null, chapters = [], runtimeSkips = [] } = {}) => {
  const planWarnings = Array.isArray(plan?.warnings) ? plan.warnings : [];
  const emptyPoolSections = planWarnings
    .filter((warning) => warning?.code === MEDITATION_PLAYBACK_WARNING_CODES.emptyPool)
    .map((warning) => toText(warning?.section_type));
  const noFormatSections = planWarnings
    .filter((warning) => warning?.code === MEDITATION_PLAYBACK_WARNING_CODES.noPlayableFormat)
    .map((warning) => toText(warning?.section_type));
  const runtimeSections = (Array.isArray(runtimeSkips) ? runtimeSkips : [])
    .map((entry) => toText(entry?.section_type));

  return {
    emptyPoolCount: emptyPoolSections.length,
    noPlayableFormatCount: noFormatSections.length,
    runtimeTakeFailedCount: runtimeSections.length,
    skipped: [
      ...emptyPoolSections.map((sectionType) => ({ section_type: sectionType, category: '池空' })),
      ...noFormatSections.map((sectionType) => ({ section_type: sectionType, category: '无可用格式' })),
      ...runtimeSections.map((sectionType) => ({ section_type: sectionType, category: '取源失败' }))
    ].map((entry) => ({
      ...entry,
      message: buildPreviewSegmentSkipMessage(entry.section_type, chapters)
    }))
  };
};

// 失败态描述（R43-⑥）：只按 `error.code` 分支（R39-③，不解析 message 文本）。
const describePreviewLoadError = (error = null) => {
  const code = toText(error?.code).trim();
  const requestId = toText(error?.requestId || error?.details?.request_id || error?.details?.requestId).trim();

  if (code === MEDITATION_READ_ERROR_CODES.trackNotFound) {
    return {
      bucket: PREVIEW_ERROR_BUCKETS.trackNotFound,
      code,
      requestId,
      title: '库里没有该 Track（TRACK_NOT_FOUND）',
      detail: 'D6 只读云函数可用，但库里找不到该 Track——这是数据问题：请先在「冥想轨道」保存该 Track 后再预览。'
    };
  }

  if (code === MEDITATION_READ_ERROR_CODES.trackDisabled) {
    return {
      bucket: PREVIEW_ERROR_BUCKETS.trackDisabled,
      code,
      requestId,
      title: '该 Track 已停用，D6 拒绝下发（TRACK_DISABLED）',
      detail: 'Track 存在但 enabled=false（不可发布）⇒ 预览被 D6 拒绝。请在「冥想轨道」启用该 Track 并保存后再预览（未保存的启用改动不生效）。'
    };
  }

  if (!code || PREVIEW_DEPLOYMENT_ERROR_CODES.has(code)) {
    return {
      bucket: PREVIEW_ERROR_BUCKETS.callFailed,
      code: code || MEDITATION_READ_ERROR_CODES.callFailed,
      requestId,
      title: '预览数据源不可用：函数未部署 / 调用失败',
      detail: 'D6 只读云函数（meditation-read）可能尚未部署，或代理 / 网络不可达、callFunction 抛错、响应不是合法信封——这是环境 / 部署问题，不是数据问题。请确认函数已部署、代理可达后点「重试」。'
    };
  }

  return {
    bucket: PREVIEW_ERROR_BUCKETS.readFailed,
    code,
    requestId,
    title: `读取失败（${code}）`,
    detail: 'D6 返回了错误码，预览无法组装播放计划（只按 error 码分支，不解析服务端 message 文本）。请核对 Track 入参与 D6 版本后点「重试」。'
  };
};

const resolvePreviewAudioPlaylist = (audio = null) => (
  (Array.isArray(audio?.formats) ? audio.formats : [])
    .map((format) => ({
      format: toText(format?.format).trim().toLowerCase(),
      url: toText(format?.url).trim(),
      mimeType: toText(format?.mime_type)
    }))
    .filter((item) => Boolean(item.url))
);

const isPreviewSignatureError = (error) => PREVIEW_AUDIO_SIGNATURE_ERROR_PATTERN.test(toText(error?.message));

const resolvePreviewChapters = (data = null) => {
  const template = data?.chapter_template;

  if (Array.isArray(template) && template.length > 0) {
    return template;
  }

  return Array.isArray(data?.track?.chapters) ? data.track.chapters : [];
};

// ─── 组件 ────────────────────────────────────────────────────────────────────

const MeditationTrackPreview = ({
  trackId = '',
  trackKey = '',
  savedVersion = 0,
  readClient = null,
  rng = null,
  onClose = null
}) => {
  // 注入点只用于**测试侧**替换调用入口（产品侧一律走 `apps/web/src/admin/services/cloudbase.js` 的 D6 客户端）：
  // `readClient` / `rng` / 入参在首次渲染时冻结成 state（一次性初始化），既保证「一次预览的入参只拼一次」
  // （403 后的整场重调必须与首次调用**逐字相同**，R42-① / R43-⑦），也不在渲染期读写 ref。
  const [client] = useState(() => readClient || cloudbaseMeditationReadClient);
  const [randomSource] = useState(() => (typeof rng === 'function' ? rng : Math.random));
  const [previewParams] = useState(() => buildPreviewRequestParams({ trackId, trackKey }));

  const [status, setStatus] = useState('loading');
  const [errorInfo, setErrorInfo] = useState(null);
  const [plan, setPlan] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [requestId, setRequestId] = useState('');
  const [trackInfo, setTrackInfo] = useState({ name: '', trackKey: '', version: 0 });
  // R43-⑨：音量的**来源**（响应给了值＝响应值；响应缺省才回退常量）由响应计算后落 state，渲染期不读 ref。
  const [volumeSources, setVolumeSources] = useState({ background: null, voice: null });
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [previewFinished, setPreviewFinished] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [runtimeSkips, setRuntimeSkips] = useState([]);
  const [drawRound, setDrawRound] = useState(1);

  const backgroundAudioRef = useRef(null);
  const voiceAudioRef = useRef(null);
  const planRef = useRef(null);
  const responseRef = useRef(null);
  const drawTapeRef = useRef([]);
  const blobUrlBySourceRef = useRef(new Map());
  const ownedBlobUrlsRef = useRef(new Set());
  const isPlayingRef = useRef(false);
  const voiceCursorRef = useRef({ segmentIndex: 0, itemIndex: 0 });
  const reissueUsedRef = useRef(false);
  const gapTimerRef = useRef(null);
  const pendingGapRef = useRef(null);
  // `scheduleNextSegment` / `armPendingGap` 声明在 `playVoiceItemAt` 之前，靠本 ref 回指（避免互相依赖
  // 造成的声明顺序问题；ref 每次渲染后同步为最新的回调）。
  const playVoiceItemRef = useRef(null);
  const tickerRef = useRef(null);
  const startMsRef = useRef(null);
  const elapsedBeforePauseRef = useRef(0);
  const disposedRef = useRef(false);

  // ─── 音轨元素与清理（onUnload / 卸载时 `pause()` ＋ 释放 objectURL）────────────

  const getAudioElement = useCallback((trackKeyName) => {
    const targetRef = trackKeyName === MEDITATION_PLAYBACK_TRACK_KEYS.background ? backgroundAudioRef : voiceAudioRef;

    if (!targetRef.current) {
      targetRef.current = new Audio();
    }

    return targetRef.current;
  }, []);

  const pausePreviewAudio = useCallback(() => {
    [MEDITATION_PLAYBACK_TRACK_KEYS.background, MEDITATION_PLAYBACK_TRACK_KEYS.voice].forEach((trackKeyName) => {
      const audio = getAudioElement(trackKeyName);
      audio.pause();
    });
  }, [getAudioElement]);

  const stopTicker = useCallback(() => {
    if (tickerRef.current != null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  const clearGapTimer = useCallback(() => {
    if (gapTimerRef.current != null) {
      window.clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
  }, []);

  // 释放本组件创建的 objectURL（**只**释放自己创建的；`revokeObjectURL` 不写盘、不发网络）。
  const revokePreviewBlobUrls = useCallback(() => {
    ownedBlobUrlsRef.current.forEach((blobUrl) => {
      URL.revokeObjectURL(blobUrl);
    });
    ownedBlobUrlsRef.current.clear();
    blobUrlBySourceRef.current.clear();
  }, []);

  const teardownPreview = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    stopTicker();
    clearGapTimer();
    pendingGapRef.current = null;
    pausePreviewAudio();
    revokePreviewBlobUrls();
  }, [clearGapTimer, pausePreviewAudio, revokePreviewBlobUrls, stopTicker]);

  const getPreviewElapsedSeconds = useCallback(() => {
    if (isPlayingRef.current && startMsRef.current != null) {
      return Math.max(0, (Date.now() - startMsRef.current) / 1000);
    }

    return Math.max(0, elapsedBeforePauseRef.current);
  }, []);

  const startTicker = useCallback(() => {
    stopTicker();
    tickerRef.current = window.setInterval(() => {
      setElapsedSeconds(getPreviewElapsedSeconds());
    }, 250);
  }, [getPreviewElapsedSeconds, stopTicker]);

  // ─── 取源：D6 已现签 URL（`formats[]` 每条各一个）⇒ `fetch → Blob → objectURL` ──
  // 与 R42-④ 同口径：链接过期（403 / 签名失败）**只表现为 fetch 失败**，与 `audio.onerror` 解耦。

  const resolvePreviewAudioSrc = useCallback(async (item = {}) => {
    const sourceUrl = toText(item?.url).trim();

    if (!sourceUrl) {
      throw new Error('AUDIO_URL_MISSING');
    }

    const cache = blobUrlBySourceRef.current;
    if (cache.has(sourceUrl)) {
      return cache.get(sourceUrl);
    }

    const response = await fetch(sourceUrl, { method: 'GET' });

    if (!response.ok && response.status !== 206) {
      // 403 / 401 ＝ 临时链接签名失效 / 过期 ⇒ 上层据此触发「同参整场重调」。
      throw new Error(`AUDIO_FETCH_${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const mimeType = toText(item?.mimeType).trim();
    const blob = new Blob([arrayBuffer], mimeType ? { type: mimeType } : {});
    const blobUrl = URL.createObjectURL(blob);

    cache.set(sourceUrl, blobUrl);
    ownedBlobUrlsRef.current.add(blobUrl);

    return blobUrl;
  }, []);

  // ─── 计划装载（响应 → 共享 plan；抽签在这里发生）────────────────────────────

  const applyPlan = useCallback((nextPlan) => {
    planRef.current = nextPlan;
    setPlan(nextPlan);
  }, []);

  const applyLoadedResponse = useCallback((response, { replayDraw = false } = {}) => {
    const data = response?.data || {};

    responseRef.current = { data, meta: response?.meta || {} };
    setRequestId(toText(response?.meta?.request_id).trim());
    setTrackInfo({
      name: toText(data?.track?.name).trim(),
      trackKey: toText(data?.track?.track_key).trim(),
      version: Number(data?.track?.version) || 0
    });
    setChapters(resolvePreviewChapters(data));
    setVolumeSources({
      background: readResponseVolume(data?.track?.background_track?.volume),
      voice: readResponseVolume(data?.track?.voice_track?.volume)
    });

    const drawSource = replayDraw
      ? createDrawPlayer(drawTapeRef.current, randomSource)
      : createDrawRecorder(randomSource);

    if (!replayDraw) {
      drawTapeRef.current = drawSource.tape;
    }

    // 播放计划**一律**由共享模块组装（后台不另写一份）。
    return applyPlan(buildMeditationTrackPlaybackPlan({
      track: data.track || null,
      chapterTemplate: data.chapter_template || null,
      sectionAudioPools: data.section_audio_pools || null,
      rng: drawSource
    }));
  }, [applyPlan, randomSource]);

  const loadPreview = useCallback(async () => {
    disposedRef.current = false;
    setStatus('loading');
    setErrorInfo(null);
    setPlan(null);
    planRef.current = null;
    responseRef.current = null;
    drawTapeRef.current = [];
    setVolumeSources({ background: null, voice: null });
    reissueUsedRef.current = false;
    voiceCursorRef.current = { segmentIndex: 0, itemIndex: 0 };
    setRuntimeSkips([]);
    setPreviewFinished(false);
    setPlaybackStarted(false);
    setElapsedSeconds(0);
    elapsedBeforePauseRef.current = 0;
    startMsRef.current = null;
    teardownPreview();

    try {
      // 唯一数据源：D6 `getTrack`（后台不直连 DB、不读后台老五项配置）。
      const response = await client.getTrack(previewParams);

      if (disposedRef.current) {
        return;
      }

      applyLoadedResponse(response);
      setStatus('ready');
    } catch (error) {
      if (disposedRef.current) {
        return;
      }

      setErrorInfo(describePreviewLoadError(error));
      setStatus('error');
    }
  }, [applyLoadedResponse, client, previewParams, teardownPreview]);

  // ─── 恢复：403 ⇒ 同参整场重调 `getTrack` 至多 1 次（只做闸门级，R43-⑦）──────────
  // **不做段级覆盖表**（R42-⑥ 的设计口径经 Neng-21 实测尚未生效，后台更不得复制）；
  // 重调成功后按**同一批抽签值**重建整场计划（候选不被静默更换）⇒ 用刷新后的链接继续；
  // 重调本身失败 ⇒ 直接进 R43-⑥ 的错误态（不靠未生效的机制兜底）。

  const reissueWholeSession = useCallback(async () => {
    try {
      const response = await client.getTrack(previewParams);

      if (disposedRef.current) {
        return false;
      }

      applyLoadedResponse(response, { replayDraw: true });
      setStatus('ready');

      return true;
    } catch (error) {
      if (disposedRef.current) {
        return false;
      }

      isPlayingRef.current = false;
      setIsPlaying(false);
      stopTicker();
      clearGapTimer();
      pendingGapRef.current = null;
      pausePreviewAudio();
      setErrorInfo(describePreviewLoadError(error));
      setStatus('error');

      return false;
    }
  }, [applyLoadedResponse, clearGapTimer, client, pausePreviewAudio, previewParams, stopTicker]);

  const recordRuntimeSkip = useCallback((sectionType, code) => {
    const normalizedType = toText(sectionType).trim();

    setRuntimeSkips((previous) => (
      previous.some((entry) => entry.section_type === normalizedType)
        ? previous
        : [...previous, { section_type: normalizedType, code }]
    ));
  }, []);

  const finishVoiceTrack = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setPreviewFinished(true);
    stopTicker();
    // 整场预览走完 ⇒ 背景 loop 收尾（预览结束不再继续响）。
    pausePreviewAudio();
    setElapsedSeconds(Number(planRef.current?.totals?.total_seconds) || 0);
  }, [pausePreviewAudio, stopTicker]);

  const resolveVoiceSegments = useCallback((sourcePlan) => (
    (Array.isArray(sourcePlan?.segments) ? sourcePlan.segments : [])
      .filter((segment) => segment?.track === MEDITATION_PLAYBACK_TRACK_KEYS.voice)
  ), []);

  const scheduleNextSegment = useCallback((segmentIndex) => {
    const segment = resolveVoiceSegments(planRef.current)[segmentIndex];

    if (!segment) {
      finishVoiceTrack();
      return;
    }

    const nextCursor = { segmentIndex: segmentIndex + 1, itemIndex: 0 };
    const gapSeconds = Math.max(0, Number(segment.gap_after_seconds) || 0);
    const gapMs = Math.round(gapSeconds * 1000);

    voiceCursorRef.current = nextCursor;
    clearGapTimer();
    pendingGapRef.current = null;

    // 章间留白：背景轨继续响（本组件只在暂停 / 收尾时 pause 背景轨），留白只挂在章内最后一段之后。
    if (gapMs <= 0) {
      playVoiceItemRef.current?.({ ...nextCursor });
      return;
    }

    pendingGapRef.current = { ...nextCursor, remainingMs: gapMs, armedAtMs: Date.now() };
    gapTimerRef.current = window.setTimeout(() => {
      gapTimerRef.current = null;
      pendingGapRef.current = null;
      playVoiceItemRef.current?.({ ...nextCursor });
    }, gapMs);
  }, [clearGapTimer, finishVoiceTrack, resolveVoiceSegments]);

  const armPendingGap = useCallback((remainingMs) => {
    const pending = pendingGapRef.current;

    if (!pending) {
      return;
    }

    clearGapTimer();

    if (remainingMs <= 0) {
      pendingGapRef.current = null;
      playVoiceItemRef.current?.({ segmentIndex: pending.segmentIndex, itemIndex: pending.itemIndex });
      return;
    }

    pendingGapRef.current = { ...pending, remainingMs, armedAtMs: Date.now() };
    gapTimerRef.current = window.setTimeout(() => {
      gapTimerRef.current = null;
      pendingGapRef.current = null;
      playVoiceItemRef.current?.({ segmentIndex: pending.segmentIndex, itemIndex: pending.itemIndex });
    }, remainingMs);
  }, [clearGapTimer]);

  const playVoiceItemAt = useCallback(async ({ segmentIndex, itemIndex }) => {
    if (disposedRef.current || !isPlayingRef.current) {
      return;
    }

    const segments = resolveVoiceSegments(planRef.current);
    const segment = segments[segmentIndex];

    if (!segment) {
      finishVoiceTrack();
      return;
    }

    const playlist = resolvePreviewAudioPlaylist(segment.audio);
    const item = playlist[itemIndex];

    voiceCursorRef.current = { segmentIndex, itemIndex };

    // 段内全部格式都不可用 ⇒ 跳段（记两类之外的第 3 类计数 ＋ 逐字文案），**背景继续、绝不整场失败**。
    if (!item) {
      recordRuntimeSkip(segment.section_type, PREVIEW_RUNTIME_TAKE_FAILED_CODE);
      scheduleNextSegment(segmentIndex);
      return;
    }

    const voiceAudio = getAudioElement(MEDITATION_PLAYBACK_TRACK_KEYS.voice);
    const handleItemEnded = () => {
      if (disposedRef.current || !isPlayingRef.current) {
        return;
      }

      scheduleNextSegment(segmentIndex);
    };
    // `onerror` 一律按**解码 / 格式**问题处理（此刻源已是本地 blob）⇒ **同段内前进到下一条格式**
    // （opus → mp3 降级）；**不据此重调** D6（R42-④ 同口径）。
    const handleItemFailed = () => {
      if (disposedRef.current || !isPlayingRef.current) {
        return;
      }

      if (itemIndex + 1 < playlist.length) {
        // 段内降级：同一个 section 的下一条格式（响应 `formats[]` 序：opus → mp3）。
        playVoiceItemRef.current?.({ segmentIndex, itemIndex: itemIndex + 1 });
        return;
      }

      recordRuntimeSkip(segment.section_type, PREVIEW_RUNTIME_TAKE_FAILED_CODE);
      scheduleNextSegment(segmentIndex);
    };

    try {
      const src = await resolvePreviewAudioSrc(item);

      if (disposedRef.current || !isPlayingRef.current) {
        return;
      }

      voiceAudio.onended = handleItemEnded;
      voiceAudio.onerror = handleItemFailed;
      voiceAudio.src = src;
      voiceAudio.volume = Number(planRef.current?.voice?.volume ?? MEDITATION_PLAYBACK_VOLUME_DEFAULTS.voice);
      await voiceAudio.play();
    } catch (error) {
      if (disposedRef.current || !isPlayingRef.current) {
        return;
      }

      // 403 / 签名失败 ⇒ 闸门级：**整场至多重调 1 次**（同参），成功后用新链接重试本段；否则判为
      // 该格式不可用，段内前进（降级），全失败则跳段（背景继续）。
      if (isPreviewSignatureError(error) && !reissueUsedRef.current) {
        reissueUsedRef.current = true;
        const reissued = await reissueWholeSession();

        const replay = playVoiceItemRef.current;

        if (reissued && isPlayingRef.current && replay) {
          await replay({ segmentIndex, itemIndex });
        }

        return;
      }

      if (itemIndex + 1 < playlist.length) {
        await playVoiceItemRef.current?.({ segmentIndex, itemIndex: itemIndex + 1 });
        return;
      }

      recordRuntimeSkip(segment.section_type, PREVIEW_RUNTIME_TAKE_FAILED_CODE);
      scheduleNextSegment(segmentIndex);
    }
  }, [finishVoiceTrack, getAudioElement, recordRuntimeSkip, reissueWholeSession, resolvePreviewAudioSrc, resolveVoiceSegments, scheduleNextSegment]);

  // 把最新的 `playVoiceItemAt` 同步进 ref（供 `scheduleNextSegment` / `armPendingGap` 回指）。
  useEffect(() => {
    playVoiceItemRef.current = playVoiceItemAt;
  }, [playVoiceItemAt]);

  const startBackgroundTrack = useCallback(async () => {
    const currentPlan = planRef.current;
    const playlist = resolvePreviewAudioPlaylist(currentPlan?.background?.audio);

    if (playlist.length === 0) {
      // 无背景音频 ⇒ 人声照播（缺音频不整场失败）。
      return;
    }

    const backgroundAudio = getAudioElement(MEDITATION_PLAYBACK_TRACK_KEYS.background);

    for (let index = 0; index < playlist.length; index += 1) {
      try {
        const src = await resolvePreviewAudioSrc(playlist[index]);

        if (disposedRef.current || !isPlayingRef.current) {
          return;
        }

        backgroundAudio.loop = true; // 双轨唯一口径：背景轨 `loop` 铺底
        backgroundAudio.src = src;
        backgroundAudio.volume = Number(currentPlan?.background?.volume ?? MEDITATION_PLAYBACK_VOLUME_DEFAULTS.background);
        await backgroundAudio.play();
        return;
      } catch {
        // 背景取源失败：换下一条格式；全部失败 ⇒ 记一段可见 warning（**不整场失败**）。
      }
    }

    recordRuntimeSkip(toText(currentPlan?.background?.audio?.section_type), PREVIEW_RUNTIME_TAKE_FAILED_CODE);
  }, [getAudioElement, recordRuntimeSkip, resolvePreviewAudioSrc]);

  const startPreviewPlayback = useCallback(async () => {
    if (!planRef.current) {
      return;
    }

    setRuntimeSkips([]);
    setPreviewFinished(false);
    setPlaybackStarted(true);
    isPlayingRef.current = true;
    setIsPlaying(true);
    elapsedBeforePauseRef.current = 0;
    startMsRef.current = Date.now();
    voiceCursorRef.current = { segmentIndex: 0, itemIndex: 0 };
    startTicker();
    await startBackgroundTrack();
    await playVoiceItemAt({ segmentIndex: 0, itemIndex: 0 });
  }, [playVoiceItemAt, startBackgroundTrack, startTicker]);

  const pausePreviewPlayback = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    elapsedBeforePauseRef.current = getPreviewElapsedSeconds();
    stopTicker();
    clearGapTimer();
    pausePreviewAudio();

    if (pendingGapRef.current) {
      const { remainingMs, armedAtMs } = pendingGapRef.current;
      pendingGapRef.current = {
        ...pendingGapRef.current,
        remainingMs: Math.max(0, remainingMs - (Date.now() - armedAtMs)),
        armedAtMs: Date.now()
      };
    }
  }, [clearGapTimer, getPreviewElapsedSeconds, pausePreviewAudio, stopTicker]);

  const resumePreviewPlayback = useCallback(() => {
    isPlayingRef.current = true;
    setIsPlaying(true);
    startMsRef.current = Date.now();
    startTicker();

    const backgroundAudio = getAudioElement(MEDITATION_PLAYBACK_TRACK_KEYS.background);
    if (backgroundAudio.src) {
      backgroundAudio.play().catch(() => {});
    }

    if (pendingGapRef.current) {
      armPendingGap(pendingGapRef.current.remainingMs);
      return;
    }

    const voiceAudio = getAudioElement(MEDITATION_PLAYBACK_TRACK_KEYS.voice);
    const cursor = voiceCursorRef.current;

    if (voiceAudio.src) {
      voiceAudio.play().catch(() => {});
      return;
    }

    playVoiceItemAt({ segmentIndex: cursor.segmentIndex, itemIndex: cursor.itemIndex });
  }, [armPendingGap, getAudioElement, playVoiceItemAt, startTicker]);

  // 留白计时到点 ⇒ 继续下一段（`scheduleNextSegment` 里的 `setTimeout` 负责；留白期间背景轨继续响）。

  const handleTogglePlayback = useCallback(() => {
    if (isPlayingRef.current) {
      pausePreviewPlayback();
      return;
    }

    if (!playbackStarted || previewFinished) {
      startPreviewPlayback();
      return;
    }

    resumePreviewPlayback();
  }, [pausePreviewPlayback, playbackStarted, previewFinished, resumePreviewPlayback, startPreviewPlayback]);

  // 「换一批」＝**显式重抽**（用户点击才重抽；不自动周期重抽、不在播放失败后静默换候选，R43-④）。
  const handleReshuffle = useCallback(() => {
    if (!responseRef.current) {
      return;
    }

    teardownPreview();
    voiceCursorRef.current = { segmentIndex: 0, itemIndex: 0 };
    reissueUsedRef.current = false;
    setRuntimeSkips([]);
    setPreviewFinished(false);
    setPlaybackStarted(false);
    setElapsedSeconds(0);
    elapsedBeforePauseRef.current = 0;
    startMsRef.current = null;
    setDrawRound((previous) => previous + 1);
    applyLoadedResponse(responseRef.current);
  }, [applyLoadedResponse, teardownPreview]);

  const handleRetry = useCallback(() => {
    reissueUsedRef.current = false;
    loadPreview();
  }, [loadPreview]);

  const handleClose = useCallback(() => {
    disposedRef.current = true;
    teardownPreview();
    onClose?.();
  }, [onClose, teardownPreview]);

  useEffect(() => {
    // 首读在**微任务**里发起：不在 effect 的同步阶段 setState（避免级联渲染）。
    let active = true;

    Promise.resolve().then(() => {
      if (active) {
        loadPreview();
      }
    });

    return () => {
      active = false;
      disposedRef.current = true;
      teardownPreview();
    };
  }, [loadPreview, teardownPreview]);

  // onUnload：卸载页面时 `pause()`（objectURL 的释放在卸载 cleanup 里一并做）。
  useEffect(() => {
    const handleUnload = () => {
      pausePreviewAudio();
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [pausePreviewAudio]);

  // ─── 展示用派生值（全部只读；无写盘、无云写）──────────────────────────────────

  const totals = plan?.totals || null;
  const backgroundVolume = Number(plan?.background?.volume ?? MEDITATION_PLAYBACK_VOLUME_DEFAULTS.background);
  const voiceVolume = Number(plan?.voice?.volume ?? MEDITATION_PLAYBACK_VOLUME_DEFAULTS.voice);
  // R43-⑨：标明音量来源——响应给了值＝「响应值」，响应缺省（或给 0 / 非法值）才回退常量。
  const backgroundVolumeSourceLabel = volumeSources.background === null
    ? PREVIEW_VOLUME_SOURCE_LABELS.fallback
    : PREVIEW_VOLUME_SOURCE_LABELS.response;
  const voiceVolumeSourceLabel = volumeSources.voice === null
    ? PREVIEW_VOLUME_SOURCE_LABELS.fallback
    : PREVIEW_VOLUME_SOURCE_LABELS.response;
  const missingSummary = buildPreviewMissingSummary({ plan, chapters, runtimeSkips });
  const segments = Array.isArray(plan?.segments) ? plan.segments : [];
  const savedVersionNotice = `预览基于已保存版本 v${Number(savedVersion) || 0}；未保存改动不生效`;

  const renderErrorState = () => {
    if (status !== 'error' || !errorInfo) {
      return null;
    }

    return (
      <div role="alert" style={panelBlockStyle('#fef2f2', '#fecaca')}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#b91c1c' }}>❌ {errorInfo.title}</div>
        <div style={{ fontSize: '12px', color: '#7f1d1d', marginTop: '4px' }}>{errorInfo.detail}</div>
        <div style={{ fontSize: '12px', color: '#7f1d1d', marginTop: '4px' }}>
          错误码：{errorInfo.code || '—'}
          {errorInfo.requestId ? ` · requestId：${errorInfo.requestId}` : ' · requestId：响应未提供'}
        </div>
        <div style={{ marginTop: '8px' }}>
          <button style={{ ...previewPrimaryBtnStyle, padding: '5px 12px' }} onClick={handleRetry}>重试</button>
        </div>
      </div>
    );
  };

  const renderMissingPanel = () => {
    if (status !== 'ready' || missingSummary.skipped.length === 0) {
      return null;
    }

    return (
      <div style={panelBlockStyle('#fffbeb', '#fde68a')}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>
          缺音频汇总：池空 {missingSummary.emptyPoolCount} 段 / 无可用格式 {missingSummary.noPlayableFormatCount} 段
          （另：运行期取源失败跳段 {missingSummary.runtimeTakeFailedCount} 段）
        </div>
        <div style={{ marginTop: '6px', fontSize: '12px', color: '#78350f' }}>
          以下段已跳过，其余段继续播放、背景轨继续（绝不整场失败）：
        </div>
        <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: '12px', color: '#78350f' }}>
          {missingSummary.skipped.map((entry) => (
            <li key={`${entry.category}-${entry.section_type}`}>
              {entry.message}
              <span style={{ color: '#a16207' }}>（{entry.category}）</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div style={previewContainerStyle} data-preview-root="meditation-track-preview">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={sectionTitleStyle}>
          Track 预览（R43）：数据源＝D6 只读云函数 getTrack
        </div>
        <button style={ghostBtnStyle} onClick={handleClose}>关闭预览</button>
      </div>

      <div style={{ fontSize: '12px', color: '#334155', marginBottom: '8px' }}>
        <strong>{savedVersionNotice}</strong>
        <div style={{ color: '#64748b', marginTop: '2px' }}>
          预览取的是库中已保存的 Track；草稿态的章开关 / 时长上限 / 留白 / 名称不生效。
          {PREVIEW_INSURANCE_NOTICE}
        </div>
      </div>

      {status === 'loading' && (
        <div style={{ fontSize: '12px', color: '#475569' }}>正在经 D6（meditation-read）读取已保存版本…</div>
      )}

      {renderErrorState()}

      {status === 'ready' && plan && (
        <div>
          <div style={{ fontSize: '12px', color: '#334155' }}>
            Track：{trackInfo.name || '（响应未给名称）'}
            {trackInfo.trackKey ? `（${trackInfo.trackKey}）` : ''} · 响应版本 v{trackInfo.version} · 第 {drawRound} 批抽签
            {requestId ? ` · requestId：${requestId}` : ''}
          </div>

          <div style={panelBlockStyle('#f0f9ff', '#bae6fd')}>
            <div style={{ fontSize: '12px', color: '#075985' }}>
              <strong>实测预览总时长 {formatPreviewSeconds(totals?.total_seconds || 0)}</strong>
              ＝ Σ 人声段实测 {formatPreviewSeconds(totals?.voice_seconds || 0)} ＋ Σ 章间留白 {formatPreviewSeconds(totals?.gap_seconds || 0)}
              （背景 loop 不计入）
            </div>
            <div style={{ fontSize: '12px', color: '#0c4a6e', marginTop: '4px' }}>
              两把尺子（不是同一把尺子、不得互推）：① 上方面板「预估 Track 总时长」（内容口径＝章 max_duration_seconds 上限之和 910s，算法不动）；
              ② 本条实测预览总时长（本次 D6 响应实测值之和）；③ 15:00（total_target_seconds=900）是软基准。
            </div>
          </div>

          <div style={panelBlockStyle('#f8fafc', '#e2e8f0')}>
            <div style={{ fontSize: '12px', color: '#334155' }}>
              音量（实际取值）：背景轨 {backgroundVolume}（{backgroundVolumeSourceLabel}）／ 人声轨 {voiceVolume}（{voiceVolumeSourceLabel}）
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              响应给了值即以响应为准、绝不覆盖；回退常量（
              {`${MEDITATION_PLAYBACK_VOLUME_DEFAULTS.background} / ${MEDITATION_PLAYBACK_VOLUME_DEFAULTS.voice}`}
              ）只在响应缺省时使用，不是规范音量。
            </div>
          </div>

          {renderMissingPanel()}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
            <button style={{ ...previewPrimaryBtnStyle, padding: '6px 14px' }} onClick={handleTogglePlayback}>
              {isPlaying ? '暂停预览' : (!playbackStarted || previewFinished ? '开始预览' : '继续预览')}
            </button>
            <button style={ghostBtnStyle} onClick={handleReshuffle}>换一批</button>
            <span style={{ fontSize: '12px', color: '#475569' }}>
              已播 {formatPreviewSeconds(elapsedSeconds)} / 共 {formatPreviewSeconds(totals?.total_seconds || 0)}
            </span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              背景轨 loop {backgroundVolume === null ? '' : ''}铺底 · 人声轨 sequence 顺序拼接 · 抽签每次开预览一次（「换一批」＝显式重抽）
            </span>
          </div>

          <div style={{ marginTop: '10px', fontSize: '12px', color: '#334155' }}>
            <div style={{ fontWeight: '600', marginBottom: '4px' }}>段序（只读模板序；禁用章不产生段，末「有可用段」章 gap=0）：</div>
            <ol style={{ margin: '0 0 0 18px', padding: 0 }}>
              {segments.map((segment, index) => (
                <li key={`${segment.section_type}-${index}`} style={{ color: segment.track === MEDITATION_PLAYBACK_TRACK_KEYS.background ? '#0369a1' : '#334155' }}>
                  {resolvePreviewSectionLabel(segment.section_type, chapters)}（{segment.section_type}）·
                  {segment.track === MEDITATION_PLAYBACK_TRACK_KEYS.background ? ' background loop' : ' voice sequence'} ·
                  实测 {formatPreviewSeconds(segment.duration_seconds)} · 章间留白 {formatPreviewSeconds(segment.gap_after_seconds)}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── 局部样式（与 MeditationPage 的既有内联风格一致；本组件自持，不改老链路样式）────

const previewContainerStyle = {
  marginTop: '16px',
  padding: '14px 16px',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  backgroundColor: '#fff'
};

const panelBlockStyle = (backgroundColor, borderColor) => ({
  marginTop: '10px',
  padding: '10px 12px',
  borderRadius: '8px',
  border: `1px solid ${borderColor}`,
  backgroundColor
});

const previewPrimaryBtnStyle = {
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: '500',
  cursor: 'pointer',
  backgroundColor: '#1e293b',
  color: '#fff'
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

const sectionTitleStyle = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#1e293b'
};

export default MeditationTrackPreview;
