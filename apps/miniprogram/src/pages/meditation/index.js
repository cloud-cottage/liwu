// ─── 小程序冥想页：D6 数据源 ＋ 端侧播放（R45 混音单流优先，缺失回退双轨） ───────────────
//
// 【规范依据】docs/meditation.admin.partner.spec.md（v4.22）R45（端侧混合播放口径 ①~⑨）
//   与 R41 / R42 / R44（端侧通用条款；R44-⑤ 是 R42-④ 的**明文例外，且仅限小程序**）。
//   · **R45（本批新增）**：产品口径＝人声与背景**必须同时出声**；技术路径＝**服务端预混单流**
//     ⇒ 本页**有可播混音产物时**用 `BackgroundAudioManager` 播混音版（**前后台同源**：该 API 是
//     平台唯一能后台续播的形态）；**混音产物缺失 ⇒ 回退下面这套双轨**（两个 `InnerAudioContext`，
//     **仅前台**——R44-③ 的「切后台停播属平台限制」对**回退路径**仍然成立，R45-⑦ 的改判只针对单流）。
//   · ① 数据源**只经 D6**（`utils/meditation-read.js` 注入的只读云函数客户端）：本页取数
//     入口**不直连数据库**、不读老 5 项 `app_settings`、不算老 plan（D9）；
//   · ② 前台**双轨不降级**（**回退路径**）：两个**独立** `InnerAudioContext`（背景 `loop = true` 铺底 ＋
//     人声 `sequence` 顺序播放）——**不得**因「担心叠加播放」降为单轨；
//   · ③ 本批**只支持前台**（切后台微信会停 JS 线程；**回退路径**的音频单例 API 无 `loop` 属性 ⇒
//     双轨后台原理不可得）；**R45 起**：有混音产物时走 `BackgroundAudioManager`，**前后台同源**；
//   · ④ 格式**只取 mp3**（跨端唯一公共格式；其余格式 iOS 不支持）⇒ 取
//     `resolveMeditationPlayableFormats` 结果后**过滤为 mp3**；**不用浏览器侧的格式探测 API**
//     （该类 API 在小程序不存在，用了即结论无效）——**混音单流同样只取 mp3**；
//   · ⑤ `onError` ⇒ **同参整场重调 `getTrack` 至多 1 次**（闸门级、单流与双轨**共用同一额度**）；
//     仍 `onError` ⇒ 跳段 ＋ warning ＋ 可见提示（背景轨继续、**不整场失败**、**不得无限重试**）；
//     **单流仍失败 ⇒ 回退双轨**（仅前台）＋ warning ＋ 可见提示——**不得无限重试**（额度已用尽即回退，
//     单流侧不再自动换源；**不在恢复路径反复改判**：一次回退定音，此后按双轨语义走）；
//   · ⑥ 取源＝**直设 `ctx.src`**（零部署前置；**不做**本地预取——预取需下载域名白名单，
//     须单独立项；端侧也不持有长期文件句柄，D6 不下发）；
//   · ⑦ 卸载时对**两个实例**`destroy()`（资源不自动释放，否则计内存泄漏）；
//     **单流的 `BackgroundAudioManager` 是全局单例、不随页面销毁** ⇒ 卸载 / 重新取数 / 重复进页时
//     先摘回调（`offEnded` / `offError`）再 `stop()`（否则留悬挂回调或后台仍在出声）；
//   · ⑧ `wx.setInnerAudioOption`（iOS 静音模式出声；**真机效果未实测**）；
//   · ⑨ 音量**取响应值**（缺省才由共享层回退常量）＋ **计时按 Track 组装结果**
//     （Σ 人声实测 ＋ Σ 章间留白，**背景 loop 不计入**；**弃固定 15 分钟基准**）；
//     **混音单流**：配比已由服务端烘焙进产物 ⇒ 端侧不设音量，计时基准取混音产物时长；
//   · ⑩ 会话固化**先落本地** `liwu_meditation_session_v1`、**不写云**（C18 未裁）；
//   · ⑬ 五类错误码**各自可见文案 ＋ `requestId`**、可重试；空池 / 缺段 ⇒ 跳段 ＋ warning、
//     **不整场失败**、**不回退老音频库 / 本地兜底 plan**；本页**没有任何开发开关 / 测试替身分支**
//     （测试替身只存在于测试侧，不进产品包）。

const {
  MIN_VALID_MEDITATION_SECONDS,
  getMeditationPageData,
  getMeditationSlotKey,
  getShanghaiDateKey,
  recordMeditationCompletion
} = require('../../utils/meditation')
const { getPageMastheadSettings } = require('../../utils/pageMasthead')
const { meditationReadClient } = require('../../utils/meditation-read')
const {
  MEDITATION_PLAYBACK_TRACK_KEYS,
  MEDITATION_PLAYBACK_SOURCES,
  MEDITATION_PLAYBACK_WARNING_CODES,
  buildMeditationTrackPlaybackPlan,
  buildSessionSolidification,
  resolveMeditationPlayableFormats
} = require('../../utils/shared/meditation-track-playback-plan')

// ─── 常量（页面展示文案 ＋ 本地键名；播放口径一律取自共享层，不另抄一份） ──────────────
const MEDITATION_SESSION_STORAGE_KEY = 'liwu_meditation_session_v1'
// R44-④：**mp3 是唯一跨端公共格式**（其余格式 iOS 不支持）⇒ 播放清单只保留 mp3。
const MINIPROGRAM_PLAYABLE_FORMAT = 'mp3'
// 单流（`BackgroundAudioManager`）的展示标题：该 API 的 `title` 是锁屏 / 通知栏的必填展示项。
const MEDITATION_BACKGROUND_AUDIO_TITLE = '静寂冥想'

// 运行时 warning 码（`console.warn` 载荷可检索；跳段**不整场失败**）。
const MEDITATION_TRACK_WARNING_CODES = Object.freeze({
  segmentSkipped: 'SEGMENT_SKIPPED',
  noPlayableMp3: 'NO_PLAYABLE_MP3',
  reissueAttempt: 'SEGMENT_REISSUE_ATTEMPT',
  reissueFailed: 'SEGMENT_REISSUE_FAILED',
  // 混音产物**在计划里标注为可播、但本页取不到 mp3 链接**（例如只下发 ogg）⇒ 本页不可播、回退双轨。
  mixAudioUnplayable: 'MIX_AUDIO_UNPLAYABLE',
  // 单流**运行期失败**（重调额度已用尽或重调后仍不可播）⇒ 回退双轨。
  singleStreamFallback: 'SINGLE_STREAM_FALLBACK'
})

// 回退可见提示（**计划级 / 单流级，无 `section_type` ⇒ 不是段级跳过**、不并入跳段计数）：
// 只用用户语言表述，**零规范编号、零内部代号**。
const MEDITATION_MIX_UNAVAILABLE_MESSAGE = '本次冥想暂未生成混合音轨，已切换为人声与背景分开播放'
const MEDITATION_MIX_UNPLAYABLE_MESSAGE = '混合音轨在本机暂不可播放，已切换为人声与背景分开播放'
const MEDITATION_SINGLE_STREAM_FALLBACK_MESSAGE = '混合音轨播放中断，已切换为人声与背景分开播放'
// 码 → 可见文案。`MIX_AUDIO_UNAVAILABLE` 取自**共享层常量**（不另抄字面量：它是计划级标注的权威来源）。
const MEDITATION_PLAYBACK_NOTICE_MESSAGES = {
  [MEDITATION_PLAYBACK_WARNING_CODES.mixAudioUnavailable]: MEDITATION_MIX_UNAVAILABLE_MESSAGE,
  [MEDITATION_TRACK_WARNING_CODES.mixAudioUnplayable]: MEDITATION_MIX_UNPLAYABLE_MESSAGE,
  [MEDITATION_TRACK_WARNING_CODES.singleStreamFallback]: MEDITATION_SINGLE_STREAM_FALLBACK_MESSAGE
}

// D6（meditation-read）失败码 → 用户可见文案（R44-⑬）。
// **只按 `error.code` 归类**：不解析服务端 message 文本、也不把 message 当真假判据（R39-③）。
const MEDITATION_READ_ERROR_MESSAGES = {
  TRACK_NOT_FOUND: '暂无可用冥想轨道，请联系管理员配置',
  TRACK_DISABLED: '该冥想轨道已停用，暂不可播放',
  READ_FAILED: '冥想音频读取失败，请稍后重试',
  CALL_FAILED: '冥想服务连接失败，请检查网络后重试',
  INVALID_PAYLOAD: '冥想音频数据不完整，已停止播放'
}
const MEDITATION_READ_ERROR_FALLBACK_MESSAGE = '冥想内容加载失败，请稍后重试'
// 段级缺音频（空池 / 无可用格式 / 无 mp3）⇒ 跳段并继续（**绝不整场失败**）。
const MEDITATION_EMPTY_PLAN_MESSAGE = '本次冥想暂无可播放音频（音频池为空），请联系管理员'
// 段级文案**逐字**（R43-⑤）：`{章节名 · section 名} 暂无可播放音频，已跳过该段（继续播放）`。
const SEGMENT_SKIPPED_TEXT_SUFFIX = '暂无可播放音频，已跳过该段（继续播放）'
const MEDITATION_DEFAULT_SLOGAN = '给自己 15 分钟的留白。在呼吸间寻回内在的秩序。'

const formatTime = (totalSeconds = 0) => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const readTrimmedString = (value) => (value == null ? '' : String(value).trim())

// 失败文案：附 `requestId`（服务端带了才附）。取值优先错误对象上已归一化的 `requestId`
// （共享客户端从失败 envelope 的 `meta` 里取），再回退 `details`。
const describeMeditationReadError = (error) => {
  const code = readTrimmedString(error?.code)
  const requestId = readTrimmedString(
    error?.requestId || error?.details?.request_id || error?.details?.requestId
  )
  const baseMessage = MEDITATION_READ_ERROR_MESSAGES[code] || MEDITATION_READ_ERROR_FALLBACK_MESSAGE
  const suffix = code ? `（${code}${requestId ? ` · ${requestId}` : ''}）` : ''

  return {
    errorMessage: `${baseMessage}${suffix}`,
    errorCode: code,
    errorRequestId: requestId
  }
}

// 章节名 / Section 名的源是**代码常量**（R21）——运行期由 D6 响应的 `chapter_template`
// （`label` ＋ `section_labels`）下发 ⇒ 页面**不另抄一份常量表**。
const buildSectionLabelIndex = (chapterTemplate = []) => {
  const chapterLabelBySectionType = new Map()
  const sectionLabelBySectionType = new Map()

  ;(Array.isArray(chapterTemplate) ? chapterTemplate : []).forEach((chapter) => {
    const chapterLabel = readTrimmedString(chapter?.label)
    const sectionLabels = chapter?.section_labels && typeof chapter.section_labels === 'object'
      ? chapter.section_labels
      : {}

    ;(Array.isArray(chapter?.section_types) ? chapter.section_types : []).forEach((sectionType) => {
      const normalizedType = readTrimmedString(sectionType)

      if (!normalizedType) {
        return
      }

      if (chapterLabel) {
        chapterLabelBySectionType.set(normalizedType, chapterLabel)
      }

      const sectionLabel = readTrimmedString(sectionLabels[normalizedType])

      if (sectionLabel) {
        sectionLabelBySectionType.set(normalizedType, sectionLabel)
      }
    })
  })

  return { chapterLabelBySectionType, sectionLabelBySectionType }
}

// 只取 mp3（R44-④）：取共享层 `resolveMeditationPlayableFormats` 的结果后**过滤为 mp3**
//（保持响应给的格式顺序，不按扩展名猜；只播 mp3、**不用浏览器侧的格式探测 API**）。
const resolveMiniProgramPlaylist = (audio) => resolveMeditationPlayableFormats(audio)
  .filter((format) => format.format === MINIPROGRAM_PLAYABLE_FORMAT)
  .map((format) => ({ format: format.format, url: format.url, mime_type: format.mime_type }))

// ─── 单流（R45-⑥）：混音产物的可播判定 ＋ 播放源解析 ────────────────────────────────
//
// 【为何用 `BackgroundAudioManager`】**该 API 是平台唯一能「切后台 / 锁屏仍续播」的音频形态**
//   （依据硬＝iOS 切后台后 JS 被挂起 ⇒ 端侧无法在那一刻换源；两个 `InnerAudioContext` 的前台双轨
//   在后台原理不可得）⇒ 单流**前后台同源**：只设一次源，前后台是同一路声音，**不需要** onHide /
//   onShow 换源或 seek 对齐。
// 【为何单流只取 mp3】该 API 与 `InnerAudioContext` 同属平台音频接口，**跨端公共格式只有 mp3**
//   （其余格式 iOS 不支持）⇒ 与页内既有双轨口径一致：共享层给的格式序列**过滤为 mp3**，
//   不按扩展名猜、也不用浏览器侧的格式探测 API。
// 【可播判据】计划来源标注为混音单流 **且** 混音产物里有 **mp3 链接** 且有 **正的产物时长**
//   （时长即计时基准）；其余（产物缺失 / 只有 ogg / 链接为空 / 时长非正）⇒ 返回 `null`
//   ＝本页不可播 ⇒ 回退双轨。
// 【音量】混音产物的配比（voice 1.0 / background 取常量）已由服务端烘焙进单流 ⇒ 端侧**不设音量**，
//   也不读 `plan.*.volume`（那两项只服务双轨回退路径）。
const resolveSingleStreamPlayback = (plan) => {
  if (plan?.playback_source !== MEDITATION_PLAYBACK_SOURCES.mixAudio) {
    return null
  }

  const mixAudio = plan?.mix_audio
  const playlist = resolveMiniProgramPlaylist(mixAudio?.audio)

  if (playlist.length === 0) {
    return null
  }

  // 计时基准＝**混音产物时长**（单流是整场成品，不是 Σ 人声 ＋ Σ 章间留白）。
  const durationSeconds = Math.max(0, Number(mixAudio?.duration_seconds) || 0)

  if (durationSeconds <= 0) {
    return null
  }

  return {
    version: Number(mixAudio?.version) || 0,
    durationSeconds,
    url: playlist[0].url
  }
}

const resolveTrackId = (track) => readTrimmedString(track?._id || track?.id)

const resolveTrackVersion = (track) => {
  const version = Number(track?.version)
  return Number.isFinite(version) && version > 0 ? version : null
}

// iOS 静音模式出声（R44-⑧）：`obeyMuteSwitch` 自基础库 2.3.0 起**不再由属性控制**，必须经
// `wx.setInnerAudioOption` 设置。**真机效果未实测**（列真机项；FAIL ⇒ 记挂账、另立项，
// 不得据此判 X21 整体 FAIL）。`typeof` 判断是**基础库能力守卫**（低版本无该 API 时报错会打断
// 页面初始化），**不是** DEV 开关 / 测试分支（R44-⑬）。
const applyMiniProgramInnerAudioOptions = () => {
  if (typeof wx.setInnerAudioOption !== 'function') {
    return false
  }

  wx.setInnerAudioOption({
    obeyMuteSwitch: false,
    fail: (error) => {
      console.warn('[meditation] SET_INNER_AUDIO_OPTION_FAILED', {
        reason: readTrimmedString(error?.errMsg || error?.message)
      })
    }
  })

  return true
}

Page({
  data: {
    loading: true,
    saving: false,
    // 数据源就绪且**有可播段**才允许开始（空池 / 无可播格式 ⇒ 见 `emptyPlanNotice`）。
    audioReady: false,
    emptyPlanNotice: '',
    // 回退可见提示（混音不可播 / 单流失败 ⇒ 双轨）：**计划级**，与段级跳段计数分开呈现。
    playbackNotice: '',
    errorMessage: '',
    errorCode: '',
    errorRequestId: '',
    segmentWarnings: [],
    segmentWarningCount: 0,
    segmentWarningSummary: '',
    skippedSectionTypes: [],
    stats: {
      sessionCount: 0,
      todayCount: 0,
      pastCount: 0
    },
    meditationSlogan: MEDITATION_DEFAULT_SLOGAN,
    // 计时节流＝Track 组装结果（Σ 人声实测 ＋ Σ 章间留白；背景 loop 不计入）——**不用固定 15 分钟基准**。
    trackTotalSeconds: 0,
    timeLabel: formatTime(0),
    remainingSeconds: 0,
    running: false,
    completed: false
  },

  onLoad() {
    // 首读与后续「同参整场重调」**必须完全同参**（R44-⑤ / R42-①）：定位参数**只在这里建一份**，
    // 重调时原样复用，绝不另拼一份。
    this.trackRequestParams = {}
    this.sessionPlan = null
    this.trackData = null
    this.sectionLabelIndex = { chapterLabelBySectionType: new Map(), sectionLabelBySectionType: new Map() }
    this.voiceSegments = []
    this.voiceSegmentIndex = 0
    this.backgroundPlaylist = []
    this.backgroundSectionType = ''
    this.backgroundVolume = undefined
    this.voiceVolume = undefined
    this.backgroundContext = null
    this.voiceContext = null
    this.timerId = null
    this.gapTimerId = null
    this.pendingVoiceIndex = null
    this.sessionStarted = false
    // 重调闸门（**闸门级**：整场至多 1 次，R44-⑤）。
    this.trackReissueAttempted = false
    // 运行时 warning 状态
    this.segmentWarnings = []
    this.segmentWarningSeen = new Set()
    this.solidificationPayload = null
    // 播放来源（`mix_audio` ＝ 单流混音版；`dual_track` ＝ 回退双轨）与单流运行时状态。
    this.playbackSource = ''
    this.mixAudioPlayback = null
    this.backgroundAudioManager = null
    this.singleStreamHandlers = null
    this.singleStreamActive = false
    this.sessionCompleted = false

    applyMiniProgramInnerAudioOptions()

    void this.loadTrack()
    void this.loadPageData()
  },

  onUnload() {
    // 单流（全局单例）与双轨（两个实例）**都要收干净**：停播 ＋ 摘回调 ＋ `destroy()`。
    this.teardownPlayback()
  },

  async onPullDownRefresh() {
    await Promise.all([this.loadTrack(), this.loadPageData()])
    wx.stopPullDownRefresh()
  },

  // ─── 历史统计（与播放数据源解耦：统计失败不影响播放，也不回退老音频库） ──────────────
  async loadPageData() {
    try {
      const [pageData, mastheadSettings] = await Promise.all([
        getMeditationPageData(),
        getPageMastheadSettings()
      ])
      this.setData({
        stats: pageData.stats,
        meditationSlogan: mastheadSettings.meditationSlogan || MEDITATION_DEFAULT_SLOGAN
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '冥想数据加载失败',
        icon: 'none'
      })
    }
  },

  // ─── D6 取数（唯一数据源：`meditation-read` / action `getTrack`）＋ 共享层计划组装 ──────
  async loadTrack() {
    this.setData({ loading: true, errorMessage: '', errorCode: '', errorRequestId: '' })
    // 重新取数＝重复进页的同一情形：旧的单流 / 双轨播放资源先收干净，避免残留回调与残留出声。
    this.teardownPlayback()

    try {
      const { data } = await meditationReadClient.getTrack(this.trackRequestParams)
      const plan = buildMeditationTrackPlaybackPlan({
        track: data?.track || null,
        chapterTemplate: data?.chapter_template || null,
        sectionAudioPools: data?.section_audio_pools || null
      })

      this.trackData = data
      this.sectionLabelIndex = buildSectionLabelIndex(data?.chapter_template)
      this.applySessionPlan(plan)
    } catch (error) {
      // 五类错误码 ⇒ **各自可见文案 ＋ requestId**（有则示）＋「重试」；**不回退老音频库**。
      this.setData({
        loading: false,
        audioReady: false,
        emptyPlanNotice: '',
        ...describeMeditationReadError(error)
      })
    }
  },

  // 计划 → 播放运行时：**有可播混音产物 ⇒ 单流**（`BackgroundAudioManager` 播混音版、前后台同源）；
  // 否则 ⇒ 双轨（背景轨一条 `loop` 铺底 ＋ 人声轨按计划顺序排段，**仅前台**，只取 mp3）。
  // **双轨数据两种来源都照旧装配**：单流运行期失败时可直接回退，不必重建整场时间轴。
  applySessionPlan(plan) {
    const voiceSegments = []
    const segmentWarningEntries = []
    const playbackNoticeEntries = []

    // 计划级 warning 分流：**带 `section_type` ⇒ 段级跳过**；
    // **不带 `section_type` ⇒ 计划级提示**（混音缺失那条即属此类：按提示呈现，**不得当跳段处理**、
    // 不并入跳段计数、也不占用 `section_type` 去重集合）。
    ;(Array.isArray(plan.warnings) ? plan.warnings : []).forEach((warning) => {
      const entry = { section_type: warning?.section_type, code: warning?.code }

      if (readTrimmedString(entry.section_type)) {
        segmentWarningEntries.push(entry)
        return
      }

      playbackNoticeEntries.push({ code: entry.code })
    })

    ;(Array.isArray(plan.segments) ? plan.segments : []).forEach((segment) => {
      if (segment.track !== MEDITATION_PLAYBACK_TRACK_KEYS.voice) {
        return
      }

      const playlist = resolveMiniProgramPlaylist(segment.audio)

      // 该段抽中了音频但**没有 mp3**（R44-④）⇒ 同样跳段 ＋ warning，不整场失败。
      if (playlist.length === 0) {
        segmentWarningEntries.push({
          section_type: segment.section_type,
          code: MEDITATION_TRACK_WARNING_CODES.noPlayableMp3
        })
        return
      }

      voiceSegments.push({
        track: segment.track,
        section_type: segment.section_type,
        playlist,
        duration_seconds: Number(segment.duration_seconds) || 0,
        gap_after_seconds: Number(segment.gap_after_seconds) || 0
      })
    })

    const backgroundPlaylist = resolveMiniProgramPlaylist(plan.background?.audio)
    const mixPlayback = resolveSingleStreamPlayback(plan)

    // 计划里标注为单流、但**本页取不到 mp3**（例如只下发 ogg）⇒ 本页不可播：同样回退双轨 ＋ 提示。
    if (!mixPlayback && plan.playback_source === MEDITATION_PLAYBACK_SOURCES.mixAudio) {
      playbackNoticeEntries.push({ code: MEDITATION_TRACK_WARNING_CODES.mixAudioUnplayable })
    }

    const hasDualTrackAudio = voiceSegments.length > 0 || backgroundPlaylist.length > 0
    const hasPlayableAudio = Boolean(mixPlayback) || hasDualTrackAudio
    // 计时基准：单流＝**混音产物时长**（整场成品）；双轨＝Σ 人声实测 ＋ Σ 章间留白（背景 loop 不计入）。
    const totalSeconds = mixPlayback
      ? mixPlayback.durationSeconds
      : Math.max(0, Number(plan.totals?.total_seconds) || 0)

    this.sessionPlan = plan
    this.playbackSource = mixPlayback
      ? MEDITATION_PLAYBACK_SOURCES.mixAudio
      : MEDITATION_PLAYBACK_SOURCES.dualTrack
    this.mixAudioPlayback = mixPlayback
    this.voiceSegments = voiceSegments
    this.voiceSegmentIndex = 0
    this.backgroundPlaylist = backgroundPlaylist
    this.backgroundSectionType = readTrimmedString(plan.background?.audio?.section_type)
    // 音量**取响应值**（共享层仅在响应缺省时回退常量）——页面绝不用常量覆盖响应值（R41-② / R44-⑨）；
    // 单流路径不设音量（配比已烘焙进产物），这两项只服务双轨回退路径。
    this.backgroundVolume = plan.background?.volume
    this.voiceVolume = plan.voice?.volume
    this.pendingVoiceIndex = null
    this.sessionStarted = false
    this.trackReissueAttempted = false
    this.sessionCompleted = false
    this.segmentWarnings = []
    this.segmentWarningSeen = new Set()

    this.setData({
      loading: false,
      audioReady: hasPlayableAudio,
      emptyPlanNotice: hasPlayableAudio ? '' : MEDITATION_EMPTY_PLAN_MESSAGE,
      // 先清上一次的提示：本函数末尾按本轮计划重记（无可播音频时走更强的空态提示）。
      playbackNotice: '',
      trackTotalSeconds: totalSeconds,
      remainingSeconds: totalSeconds,
      timeLabel: formatTime(totalSeconds),
      running: false,
      completed: false
    })

    if (this.playbackSource === MEDITATION_PLAYBACK_SOURCES.mixAudio) {
      this.setupSingleStreamPlayback()
    } else {
      this.setupAudioContexts()
    }

    this.pushSegmentWarnings(segmentWarningEntries)
    this.pushPlaybackNotices(hasPlayableAudio ? playbackNoticeEntries : [])
  },

  // ─── 双轨实例（R44-② / ⑥） ────────────────────────────────────────────────────
  // **两个独立**的 `InnerAudioContext`：背景轨 `loop = true` ＋ 人声轨顺序播放（不循环）。
  setupAudioContexts() {
    this.destroyAudioContexts()

    const backgroundContext = wx.createInnerAudioContext()
    backgroundContext.loop = true
    backgroundContext.volume = this.backgroundVolume
    backgroundContext.onError((error) => this.handleBackgroundError(error))

    const voiceContext = wx.createInnerAudioContext()
    voiceContext.loop = false
    voiceContext.volume = this.voiceVolume
    voiceContext.onEnded(() => this.handleVoiceSegmentEnded())
    voiceContext.onError((error) => this.handleVoiceError(error))

    this.backgroundContext = backgroundContext
    this.voiceContext = voiceContext

    // 取源＝**直设 `ctx.src`**（R44-⑥）：D6 现签 URL 直接赋给播放实例。
    if (this.backgroundPlaylist.length > 0) {
      backgroundContext.src = this.backgroundPlaylist[0].url
    }

    if (this.voiceSegments.length > 0) {
      voiceContext.src = this.voiceSegments[0].playlist[0].url
    }
  },

  // ─── 单流实例（R45-⑥：`BackgroundAudioManager`） ────────────────────────────────
  // **为何用该 API**：它是平台唯一能「切后台 / 锁屏仍续播」的音频形态（iOS 切后台后 JS 被挂起
  // ⇒ 端侧无法在那一刻换源）⇒ 单流**前后台同源**，不需要 onHide / onShow 换源与 seek 对齐。
  // **它是全局单例**（不随页面销毁）⇒ 回调与播放都必须在页内显式收口（见 releaseSingleStreamPlayback）。
  // 与页面实例的对应关系：本页 setup 前先 release 本页已挂的一份；页面销毁（`onUnload`）/ 重新取数
  // 时 release ⇒ 「重复进页」不会在单例上留旧页回调（旧页回调也会因 `singleStreamActive=false` 空转）。
  setupSingleStreamPlayback() {
    // 重复进页 / 重新取数：先把上一份单流收干净，再挂新的。
    this.releaseSingleStreamPlayback()

    const manager = wx.getBackgroundAudioManager()
    const handlers = {
      // 只挂两个回调（结束 / 失败）：结束＝整场结束，失败＝回退双轨；其余事件本页不需要。
      ended: () => this.handleSingleStreamEnded(),
      error: (error) => this.handleSingleStreamError(error)
    }

    // `title` 是该 API 的展示必填项（锁屏 / 通知栏标题），须在 `src` 之前就位。
    manager.title = MEDITATION_BACKGROUND_AUDIO_TITLE
    manager.onEnded(handlers.ended)
    manager.onError(handlers.error)

    this.backgroundAudioManager = manager
    this.singleStreamHandlers = handlers
    // 尚未起播（起播由 `startSession` 触发）⇒ 先置 false，避免上一份状态影响本轮。
    this.singleStreamActive = false
  },

  // 单流收口（页内唯一「停单流」入口）：**先摘回调、再 `stop()`**，最后清引用。
  // `offEnded` / `offError` 自基础库 2.9.0 起提供 ⇒ `typeof` 是**基础库能力守卫**（低版本无该 API），
  // **不是**开发开关 / 测试分支；即便守卫不成立，回调体内的 `singleStreamActive` 闸门也会让旧回调空转。
  releaseSingleStreamPlayback() {
    const manager = this.backgroundAudioManager
    const handlers = this.singleStreamHandlers

    this.singleStreamActive = false

    if (!manager) {
      this.singleStreamHandlers = null
      return
    }

    if (handlers && typeof manager.offEnded === 'function') {
      manager.offEnded(handlers.ended)
    }

    if (handlers && typeof manager.offError === 'function') {
      manager.offError(handlers.error)
    }

    manager.stop()
    this.backgroundAudioManager = null
    this.singleStreamHandlers = null
  },

  // 当前生效的单流播放器（`null` ＝ 此刻走双轨）：暂停 / 恢复 / 结束 / 重置都按它分流。
  resolveActiveSingleStreamManager() {
    return this.playbackSource === MEDITATION_PLAYBACK_SOURCES.mixAudio
      ? this.backgroundAudioManager
      : null
  },

  // 单流起播：**设置 `src` 即自动播放**（官方行为）⇒ 无需先 `play()`；「重新开始 / 重复进页」时
  // `src` 取值未变（同一份现签链接）⇒ 补一次 `play()` 兜底，保证从头出声。
  // **不设音量**：混音产物的配比已由服务端烘焙进单流。
  startSingleStreamPlayback() {
    const manager = this.backgroundAudioManager

    if (!manager || !this.mixAudioPlayback?.url) {
      return
    }

    this.singleStreamActive = true
    manager.title = MEDITATION_BACKGROUND_AUDIO_TITLE
    manager.src = this.mixAudioPlayback.url
    manager.play()
  },

  // 单流播完＝**整场结束**（单流即整场）⇒ 与计时归零走同一条收尾路径。
  // 与计时归零可能几乎同时到达 ⇒ `data.completed` 与 `sessionCompleted` 双重去重，**整场只结算一次**。
  handleSingleStreamEnded() {
    if (!this.singleStreamActive || this.data.completed) {
      return
    }

    this.clearTimer()
    this.clearGapTimer()
    this.setData({
      running: false,
      completed: true,
      remainingSeconds: 0,
      timeLabel: formatTime(0)
    })
    void this.handleCompleteMeditation()
  },

  // 单流 `onError`：**整场至多 1 次**同参重调（与双轨**共用同一闸门**、同一「单段重签上限」语义，
  // **不得无限重试**）；重调不可用 / 额度已用尽 ⇒ **回退双轨**（仅前台）＋ warning ＋ 可见提示。
  handleSingleStreamError(error) {
    if (!this.singleStreamActive) {
      return
    }

    if (this.trackReissueAttempted) {
      this.fallbackToDualTrack({ error, code: MEDITATION_TRACK_WARNING_CODES.singleStreamFallback })
      return
    }

    void this.reissueSingleStream({ error })
  },

  async reissueSingleStream({ error = null } = {}) {
    // 闸门：**先置位再 await** ⇒ 并发 / 连续失败都只重调 1 次（与双轨路径同一闸门、同一语义）。
    this.trackReissueAttempted = true

    console.warn(`[meditation] ${MEDITATION_TRACK_WARNING_CODES.reissueAttempt}`, {
      playback_source: MEDITATION_PLAYBACK_SOURCES.mixAudio,
      track_key: MEDITATION_PLAYBACK_TRACK_KEYS.voice,
      reason: readTrimmedString(error?.errMsg || error?.message)
    })

    let refreshedPlan = null

    try {
      // **同参整场重调**：`this.trackRequestParams` 就是首读那一份，入参**逐字相同**（R42-① / R44-⑤）。
      const { data } = await meditationReadClient.getTrack(this.trackRequestParams)
      refreshedPlan = buildMeditationTrackPlaybackPlan({
        track: data?.track || null,
        chapterTemplate: data?.chapter_template || null,
        sectionAudioPools: data?.section_audio_pools || null
      })
    } catch (reissueError) {
      console.warn(`[meditation] ${MEDITATION_TRACK_WARNING_CODES.reissueFailed}`, {
        playback_source: MEDITATION_PLAYBACK_SOURCES.mixAudio,
        reason: readTrimmedString(reissueError?.message)
      })
      refreshedPlan = null
    }

    const refreshedMix = refreshedPlan ? resolveSingleStreamPlayback(refreshedPlan) : null

    if (!refreshedMix) {
      // 重调失败 / 重调后仍不可播 ⇒ 回退双轨（**整场时间轴不重建**：双轨数据用首读那一次）。
      this.fallbackToDualTrack({
        error,
        code: refreshedPlan
          ? MEDITATION_TRACK_WARNING_CODES.singleStreamFallback
          : MEDITATION_TRACK_WARNING_CODES.reissueFailed
      })
      return
    }

    // 重调成功 ⇒ **只换单流播放源**（计时基准与整场时间轴不重建）；暂停态下不擅自起播：
    // 恢复时若旧链接已失效，`onError` 会按上面这条回退路径处理（额度已用尽 ⇒ 回退、不重试）。
    this.mixAudioPlayback = refreshedMix

    if (this.data.running) {
      this.startSingleStreamPlayback()
    }
  },

  // 单流不可用（可播产物缺失 / 播放失败且重调额度用尽）⇒ **回退现有双轨**（仅前台）：
  // 双轨代码与数据**保留**（R45-⑨ 明文封堵：不得据「端侧仍存在双轨代码」判负）；
  // 按既有 warning 机制给**可见提示**（计划级，不并入跳段计数）；**不无限重试**（单流侧不再换源，
  // 双轨此后沿用同一个整场闸门）。
  fallbackToDualTrack({ error = null, code = MEDITATION_TRACK_WARNING_CODES.singleStreamFallback } = {}) {
    this.releaseSingleStreamPlayback()
    this.playbackSource = MEDITATION_PLAYBACK_SOURCES.dualTrack
    this.mixAudioPlayback = null
    this.setupAudioContexts()

    const hasPlayableAudio = this.voiceSegments.length > 0 || this.backgroundPlaylist.length > 0

    // 双轨也没有可播音频 ⇒ 走更强的空态提示（不再提示「已切换播放」）。
    if (!hasPlayableAudio) {
      this.setData({
        running: false,
        audioReady: false,
        emptyPlanNotice: MEDITATION_EMPTY_PLAN_MESSAGE
      })
      return
    }

    this.pushPlaybackNotices([
      { code, reason: readTrimmedString(error?.errMsg || error?.message) }
    ])

    if (this.data.running) {
      // 从「已播时长」对应的那一段续播（背景轨铺底从头开始；音量仍取响应值）。
      this.startDualTrackPlayback({
        fromIndex: this.resolveVoiceSegmentIndexForElapsed(this.resolveElapsedSeconds())
      })
    }
  },

  // 已播时长＝整场计时基准 − 剩余（单流失败后双轨的续播位置基准）。
  resolveElapsedSeconds() {
    const totalSeconds = Number(this.data.trackTotalSeconds) || 0
    const remainingSeconds = Number(this.data.remainingSeconds) || 0

    return Math.max(0, totalSeconds - remainingSeconds)
  },

  // 已播时长 → 人声段下标（段时长按计划给出）；超出末段（含章间留白）⇒ 播最后一段。
  resolveVoiceSegmentIndexForElapsed(elapsedSeconds) {
    let cursor = 0

    for (let index = 0; index < this.voiceSegments.length; index += 1) {
      const durationSeconds = Number(this.voiceSegments[index]?.duration_seconds) || 0

      if (elapsedSeconds < cursor + durationSeconds) {
        return index
      }

      cursor += durationSeconds
    }

    return Math.max(0, this.voiceSegments.length - 1)
  },

  // ─── 会话控制 ─────────────────────────────────────────────────────────────────
  handleToggleMeditation() {
    if (this.data.running) {
      this.pauseSession()
      return
    }

    if (!this.data.audioReady) {
      wx.showToast({ title: MEDITATION_EMPTY_PLAN_MESSAGE, icon: 'none' })
      return
    }

    if (this.sessionStarted) {
      this.resumeSession()
      return
    }

    this.startSession()
  },

  startSession() {
    this.sessionStarted = true
    this.sessionCompleted = false
    this.setData({ running: true, completed: false })
    // 会话固化**先落本地、不写云**（R44-⑩；云侧写入＝C18 未裁）。
    this.persistSessionSolidification()
    this.startTimer()

    // 来源分流：单流（`BackgroundAudioManager`、前后台同源）／双轨（两个 `InnerAudioContext`、仅前台）。
    if (this.resolveActiveSingleStreamManager()) {
      this.startSingleStreamPlayback()
      return
    }

    this.startDualTrackPlayback({ fromIndex: this.voiceSegmentIndex || 0 })
  },

  // 双轨起播：背景轨 `loop` 铺底 ＋ 人声轨从 `fromIndex` 顺序播（音量取响应值）。
  startDualTrackPlayback({ fromIndex = 0 } = {}) {
    if (this.backgroundContext && this.backgroundPlaylist.length > 0) {
      this.backgroundContext.volume = this.backgroundVolume
      this.backgroundContext.play()
    }

    if (this.voiceContext) {
      this.voiceContext.volume = this.voiceVolume
      this.playVoiceFrom(fromIndex)
    }
  },

  pauseSession() {
    this.clearTimer()
    this.clearGapTimer()
    this.setData({ running: false })

    const manager = this.resolveActiveSingleStreamManager()

    if (manager) {
      manager.pause()
      return
    }

    if (this.backgroundContext) {
      this.backgroundContext.pause()
    }

    if (this.voiceContext) {
      this.voiceContext.pause()
    }
  },

  resumeSession() {
    this.setData({ running: true, completed: false })

    const manager = this.resolveActiveSingleStreamManager()

    if (manager) {
      // 单流：暂停即 `pause()`，恢复即 `play()`（同一路声音、前后台同源；不需要重新设源）。
      manager.play()
      this.startTimer()
      return
    }

    if (this.backgroundContext && this.backgroundPlaylist.length > 0) {
      this.backgroundContext.play()
    }

    if (this.pendingVoiceIndex !== null && this.pendingVoiceIndex !== undefined) {
      // 暂停发生在章间留白中 ⇒ 恢复时把这段留白重排一次（不留残留定时器）。
      const currentSegment = this.voiceSegments[this.voiceSegmentIndex]
      this.pendingVoiceIndex = null
      this.scheduleNextVoiceSegment(currentSegment)
    } else if (this.voiceContext) {
      this.voiceContext.play()
    }

    this.startTimer()
  },

  handleResetMeditation() {
    this.clearTimer()
    this.clearGapTimer()
    this.setData({ running: false, completed: false })
    this.sessionStarted = false
    this.sessionCompleted = false
    this.voiceSegmentIndex = 0
    this.pendingVoiceIndex = null
    // 重调闸门按「整场」计，重新开始 ⇒ 重新计一次（R44-⑤ 的「整场」＝一次运行）。
    // 单流与双轨**共用**这一个闸门（额度不因来源切换而增加）。
    this.trackReissueAttempted = false

    const manager = this.resolveActiveSingleStreamManager()

    if (manager) {
      // 单流：停播即可（实例与回调保留，重新开始时重设 `src` 从头播）。
      manager.stop()
    } else {
      if (this.backgroundContext) {
        this.backgroundContext.stop()
      }

      if (this.voiceContext) {
        this.voiceContext.stop()

        if (this.voiceSegments.length > 0) {
          this.voiceContext.src = this.voiceSegments[0].playlist[0].url
        }
      }
    }

    const totalSeconds = Number(this.data.trackTotalSeconds) || 0
    this.setData({
      remainingSeconds: totalSeconds,
      timeLabel: formatTime(totalSeconds)
    })
  },

  // ─── 人声轨：`sequence` 顺序播放（段序＝计划顺序，只读） ──────────────────────────
  playVoiceFrom(index) {
    this.voiceSegmentIndex = index
    const segment = this.voiceSegments[index]

    if (!segment || !this.voiceContext) {
      // 人声轨播完：背景轨继续铺底，不整场失败。
      return
    }

    this.voiceContext.volume = this.voiceVolume
    this.voiceContext.src = segment.playlist[0].url
    this.voiceContext.play()
  },

  handleVoiceSegmentEnded() {
    const segment = this.voiceSegments[this.voiceSegmentIndex]

    if (!segment) {
      return
    }

    this.scheduleNextVoiceSegment(segment)
  },

  // 章间留白（R41-③）：`gap_after_seconds` 只挂在「该章最后一个可用段」上 ⇒ 段末等待即章间留白；
  // 末「有可用段的」章恒 0（共享层已保证）。
  scheduleNextVoiceSegment(segment, { withGap = true } = {}) {
    const nextIndex = Number(this.voiceSegmentIndex || 0) + 1

    if (nextIndex >= this.voiceSegments.length) {
      return
    }

    const gapMs = withGap ? Math.max(0, Number(segment?.gap_after_seconds) || 0) * 1000 : 0

    if (gapMs <= 0) {
      this.playVoiceFrom(nextIndex)
      return
    }

    this.pendingVoiceIndex = nextIndex
    this.gapTimerId = setTimeout(() => {
      this.gapTimerId = null
      const target = this.pendingVoiceIndex
      this.pendingVoiceIndex = null

      if (target === null || target === undefined) {
        return
      }

      this.playVoiceFrom(target)
    }, gapMs)
  },

  // ─── 失败可见：跳段 ＋ warning（**不整场失败**、**不回退老音频库**） ────────────────
  // 段级文案**逐字**：`{章节名 · section 名} 暂无可播放音频，已跳过该段（继续播放）`（R43-⑤）。
  resolveSegmentWarningText(sectionType) {
    const chapterLabel = this.sectionLabelIndex?.chapterLabelBySectionType?.get(sectionType) || ''
    const sectionLabel = this.sectionLabelIndex?.sectionLabelBySectionType?.get(sectionType) || ''
    const labels = [chapterLabel, sectionLabel].filter(Boolean)
    const prefix = labels.length > 0 ? `${labels.join(' · ')} ` : ''

    return `${prefix}${SEGMENT_SKIPPED_TEXT_SUFFIX}`
  },

  pushSegmentWarnings(entries = []) {
    const added = []

    ;(Array.isArray(entries) ? entries : []).forEach((entry) => {
      const sectionType = readTrimmedString(entry?.section_type)

      // 按 `section_type` 去重计数（R44-⑬）；缺 section_type 的项不产生可见文案。
      if (!sectionType || this.segmentWarningSeen.has(sectionType)) {
        return
      }

      this.segmentWarningSeen.add(sectionType)
      const warning = {
        section_type: sectionType,
        code: readTrimmedString(entry?.code),
        text: this.resolveSegmentWarningText(sectionType)
      }

      this.segmentWarnings.push(warning)
      added.push(warning)
    })

    if (added.length === 0) {
      return
    }

    console.warn(`[meditation] ${MEDITATION_TRACK_WARNING_CODES.segmentSkipped}`, {
      count: added.length,
      warnings: added.map((warning) => ({ section_type: warning.section_type, code: warning.code }))
    })

    this.setData({
      segmentWarnings: this.segmentWarnings.map((warning) => warning.text),
      segmentWarningCount: this.segmentWarnings.length,
      segmentWarningSummary: `本次冥想有 ${this.segmentWarnings.length} 段暂无可播放音频，已跳过（继续播放）`,
      skippedSectionTypes: this.segmentWarnings.map((warning) => warning.section_type)
    })
  },

  // 计划级 / 单流级提示（**无 `section_type`**）：`console.warn` ＋ 可见提示。
  // **不得当跳段处理**：`segmentWarnings` / `segmentWarningCount` / `skippedSectionTypes` 一律不动
  //（它不是段级跳过，也不占用 `section_type` 去重；同一码只保留最后一条文案）。
  pushPlaybackNotices(entries = []) {
    let latestNotice = ''

    ;(Array.isArray(entries) ? entries : []).forEach((entry) => {
      const code = readTrimmedString(entry?.code)
      const message = MEDITATION_PLAYBACK_NOTICE_MESSAGES[code]

      if (!message) {
        return
      }

      console.warn(`[meditation] ${code}`, {
        playback_source: this.playbackSource,
        reason: readTrimmedString(entry?.reason)
      })
      latestNotice = message
    })

    if (!latestNotice) {
      return
    }

    this.setData({ playbackNotice: latestNotice })
  },

  // 段内取不到可用音频 ⇒ **跳段后直接进下一段**（不补走该段留白：留白属正常播放的章间静默，
  // 失败路径优先保证「其余段照常」，且不引入额外定时器）；背景轨继续、整场不失败。
  skipVoiceSegment({ segment, code = MEDITATION_TRACK_WARNING_CODES.segmentSkipped }) {
    this.pushSegmentWarnings([{ section_type: segment?.section_type, code }])
    this.pendingVoiceIndex = null
    this.playVoiceFrom(Number(this.voiceSegmentIndex || 0) + 1)
  },

  dropBackgroundTrack({ segment, code = MEDITATION_TRACK_WARNING_CODES.segmentSkipped }) {
    this.pushSegmentWarnings([{ section_type: segment?.section_type, code }])
    this.backgroundPlaylist = []

    if (this.backgroundContext) {
      this.backgroundContext.stop()
    }
  },

  // ─── `onError` 恢复：同参整场重调至多 1 次（R44-⑤；R42-④ 的**明文例外，仅限小程序**） ──
  // 小程序没有 `fetch` → `Blob` 阶段 ⇒「链接过期」与「解码 / 格式失败」**都表现为 `onError`**
  // （该 API 上两种成因形态不可分）⇒ 允许重调一次；**重调后仍 `onError` ⇒ 跳段 ＋ warning ＋
  // 可见提示**；**不得无限重试**（无段级额度、无自动重抽）。
  handleVoiceError(error) {
    const segment = this.voiceSegments[this.voiceSegmentIndex] || null

    if (!segment) {
      return
    }

    if (!this.trackReissueAttempted) {
      void this.reissueTrackAndResume({ trackKey: MEDITATION_PLAYBACK_TRACK_KEYS.voice, segment, error })
      return
    }

    this.skipVoiceSegment({ segment, error, code: MEDITATION_TRACK_WARNING_CODES.segmentSkipped })
  },

  handleBackgroundError(error) {
    const segment = { track: MEDITATION_PLAYBACK_TRACK_KEYS.background, section_type: this.backgroundSectionType }

    if (!this.trackReissueAttempted) {
      void this.reissueTrackAndResume({ trackKey: MEDITATION_PLAYBACK_TRACK_KEYS.background, segment, error })
      return
    }

    this.dropBackgroundTrack({ segment })
  },

  findRefreshedSegment(plan, segment) {
    const sectionType = readTrimmedString(segment?.section_type)
    const trackKey = segment?.track

    return (Array.isArray(plan?.segments) ? plan.segments : []).find((candidate) => (
      candidate.track === trackKey && readTrimmedString(candidate.section_type) === sectionType
    )) || null
  },

  async reissueTrackAndResume({ trackKey, segment, error = null }) {
    // 闸门：**先置位再 await** ⇒ 并发 / 连续失败都只会重调 1 次（不因并发放宽）。
    this.trackReissueAttempted = true

    console.warn(`[meditation] ${MEDITATION_TRACK_WARNING_CODES.reissueAttempt}`, {
      track_key: trackKey,
      section_type: readTrimmedString(segment?.section_type),
      reason: readTrimmedString(error?.errMsg || error?.message)
    })

    let refreshedPlan = null

    try {
      // **同参整场重调**：`this.trackRequestParams` 就是首读那一份，入参**逐字相同**（R42-① / R44-⑤）。
      const { data } = await meditationReadClient.getTrack(this.trackRequestParams)
      refreshedPlan = buildMeditationTrackPlaybackPlan({
        track: data?.track || null,
        chapterTemplate: data?.chapter_template || null,
        sectionAudioPools: data?.section_audio_pools || null
      })
    } catch (reissueError) {
      console.warn(`[meditation] ${MEDITATION_TRACK_WARNING_CODES.reissueFailed}`, {
        track_key: trackKey,
        section_type: readTrimmedString(segment?.section_type),
        reason: readTrimmedString(reissueError?.message)
      })
      refreshedPlan = null
    }

    if (!refreshedPlan) {
      if (trackKey === MEDITATION_PLAYBACK_TRACK_KEYS.background) {
        this.dropBackgroundTrack({ segment, code: MEDITATION_TRACK_WARNING_CODES.reissueFailed })
      } else {
        this.skipVoiceSegment({ segment, error, code: MEDITATION_TRACK_WARNING_CODES.reissueFailed })
      }
      return
    }

    // 重调成功 ⇒ **只刷新当前段的播放源**：整场时间轴（段序 / 段时长 / 留白 / 计时基准）**不重建**
    //（R42-⑥ 设计口径）——重调会**重新抽签**，整场替换会导致进度跳变或重复播放。
    const refreshedSegment = this.findRefreshedSegment(refreshedPlan, segment)
    const refreshedPlaylist = resolveMiniProgramPlaylist(refreshedSegment?.audio)

    if (refreshedPlaylist.length === 0) {
      // 重调后仍无可交付的 mp3 ⇒ 跳段（**不无限重试**）。
      if (trackKey === MEDITATION_PLAYBACK_TRACK_KEYS.background) {
        this.dropBackgroundTrack({ segment, code: MEDITATION_TRACK_WARNING_CODES.noPlayableMp3 })
      } else {
        this.skipVoiceSegment({ segment, error, code: MEDITATION_TRACK_WARNING_CODES.noPlayableMp3 })
      }
      return
    }

    if (trackKey === MEDITATION_PLAYBACK_TRACK_KEYS.background) {
      this.backgroundPlaylist = refreshedPlaylist

      if (this.backgroundContext) {
        this.backgroundContext.volume = this.backgroundVolume
        this.backgroundContext.src = refreshedPlaylist[0].url

        if (this.data.running) {
          this.backgroundContext.play()
        }
      }
      return
    }

    segment.playlist = refreshedPlaylist
    this.voiceSegments[this.voiceSegmentIndex] = segment
    this.playVoiceFrom(this.voiceSegmentIndex)
  },

  // ─── 计时（按 Track 组装结果，弃固定 15 分钟基准） ────────────────────────────────
  clearTimer() {
    if (this.timerId) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  },

  clearGapTimer() {
    if (this.gapTimerId) {
      clearTimeout(this.gapTimerId)
      this.gapTimerId = null
    }
  },

  startTimer() {
    if (this.timerId) {
      return
    }

    this.timerId = setInterval(() => {
      const nextValue = Math.max(0, Number(this.data.remainingSeconds || 0) - 1)
      this.setData({
        remainingSeconds: nextValue,
        timeLabel: formatTime(nextValue)
      })

      if (nextValue <= 0) {
        this.clearTimer()
        this.clearGapTimer()
        this.stopAudioPlayback()
        this.setData({
          running: false,
          completed: true
        })
        void this.handleCompleteMeditation()
      }
    }, 1000)
  },

  stopAudioPlayback() {
    // 整场已结束（计时归零）⇒ 单流状态一并作废：此后到达的 `onEnded` / `onError` 只空转，不再换源 / 回退。
    this.singleStreamActive = false

    // 单流：`stop()`（单例，停掉才是真的停；回调由 `releaseSingleStreamPlayback` 负责摘）。
    if (this.backgroundAudioManager) {
      this.backgroundAudioManager.stop()
    }

    if (this.backgroundContext) {
      this.backgroundContext.stop()
    }

    if (this.voiceContext) {
      this.voiceContext.stop()
    }
  },

  // 播放资源统一收口（页面卸载 / 重新取数 / 重复进页都走这里）：
  //  · 单流＝`BackgroundAudioManager`（**全局单例、不随页面销毁**）⇒ 摘回调 ＋ `stop()`
  //    （否则留悬挂回调，或退出页面后后台仍在出声）；
  //  · 双轨＝两个 `InnerAudioContext`（资源不自动释放）⇒ `destroy()`（R44-⑦）。
  teardownPlayback() {
    this.clearTimer()
    this.clearGapTimer()
    this.releaseSingleStreamPlayback()
    this.destroyAudioContexts()
  },

  // 资源释放（R44-⑦）：`InnerAudioContext` 资源**不自动释放** ⇒ 卸载 / 重载计划前销毁两个实例。
  destroyAudioContexts() {
    if (this.backgroundContext) {
      this.backgroundContext.destroy()
      this.backgroundContext = null
    }

    if (this.voiceContext) {
      this.voiceContext.destroy()
      this.voiceContext = null
    }
  },

  // 会话固化**先落本地、不写云**（R41-⑤ / R44-⑩）：键 `liwu_meditation_session_v1`；
  // 云侧写入＝C18 未裁 ⇒ **不得**在此写云、也**不得**自建云集合。
  persistSessionSolidification() {
    try {
      const payload = buildSessionSolidification({
        trackId: resolveTrackId(this.trackData?.track),
        trackVersion: resolveTrackVersion(this.trackData?.track),
        dateKey: getShanghaiDateKey(),
        sessionKey: getMeditationSlotKey(),
        selections: Array.isArray(this.sessionPlan?.selections) ? this.sessionPlan.selections : []
      })

      wx.setStorageSync(MEDITATION_SESSION_STORAGE_KEY, payload)
      this.solidificationPayload = payload
    } catch (error) {
      // 固化失败**不影响播放**（也不回退老音频库）：只记 warning，交由后续会话重试。
      console.warn('[meditation] SESSION_SOLIDIFICATION_FAILED', {
        reason: readTrimmedString(error?.message)
      })
    }
  },

  // 结算：门禁 `MIN_VALID_MEDITATION_SECONDS = 180`（两端不变，R44-⑨）；完成时长按 Track 组装结果。
  async handleCompleteMeditation() {
    // 去重：计时归零与单流 `onEnded` 可能几乎同时到达 ⇒ 整场**只结算一次**（不重复记入）。
    if (this.sessionCompleted) {
      return
    }

    this.sessionCompleted = true

    const totalSeconds = Number(this.data.trackTotalSeconds) || 0
    const completedSeconds = Math.max(0, totalSeconds - Number(this.data.remainingSeconds || 0))

    this.setData({ saving: true })
    this.persistSessionSolidification()

    try {
      const result = await recordMeditationCompletion({ durationSeconds: completedSeconds })
      this.setData({ saving: false })
      await this.loadPageData()
      wx.showToast({
        title: result.recorded ? '冥想已记入' : `少于 ${Math.floor(MIN_VALID_MEDITATION_SECONDS / 60)} 分钟，未记入`,
        icon: 'none'
      })
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({
        title: error.message || '冥想记录失败',
        icon: 'none'
      })
    }
  },

  handleRetryLoad() {
    void this.loadTrack()
  },

  onShareAppMessage() {
    return {
      title: '来理悟小程序，一起静寂 15 分钟',
      path: '/pages/meditation/index'
    }
  }
})
