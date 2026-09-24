// ─── 小程序冥想页：D6 数据源 ＋ 端侧双轨播放（R44 ①~⑬） ─────────────────────────────
//
// 【规范依据】docs/meditation.admin.partner.spec.md（v4.13）R44（小程序端侧接入口径 ①~⑬）
//   与 R41 / R42（端侧通用条款；R44-⑤ 是 R42-④ 的**明文例外，且仅限小程序**）。
//   · ① 数据源**只经 D6**（`utils/meditation-read.js` 注入 `wx.cloud.callFunction`）：本页取数
//     入口**没有** `wx.cloud.database()`、不读老 5 项 `app_settings`、不算老 plan（D9）；
//   · ② 前台**双轨不降级**：两个**独立** `InnerAudioContext`（背景 `loop = true` 铺底 ＋
//     人声 `sequence` 顺序播放）——**不得**因「担心叠加播放」降为单轨；
//   · ③ 本批**只支持前台**（切后台微信会停 JS 线程；`BackgroundAudioManager` 全局单例且无
//     `loop` ⇒ 双轨后台原理不可得）⇒ 切后台停播属**平台限制、不判缺陷**，也**不引入**该 API；
//   · ④ 格式**只取 mp3**（ogg 仅 Android、iOS 不支持）⇒ 取 `resolveMeditationPlayableFormats`
//     结果后**过滤为 mp3**；**不用 `canPlayType`**（该 API 属 HTML5，小程序不存在）；
//   · ⑤ `onError` ⇒ **同参整场重调 `getTrack` 至多 1 次**（闸门级）；仍 `onError` ⇒ 跳段 ＋
//     warning ＋ 可见提示（背景轨继续、**不整场失败**、**不得无限重试**）；
//   · ⑥ 取源＝**直设 `ctx.src`**（零部署前置；不做 `wx.downloadFile` 预取、不用 `wx.cloud.downloadFile`
//     ——D6 不下发 `file_id`，端侧无句柄可取）；
//   · ⑦ 卸载时对**两个实例**`destroy()`（资源不自动释放，否则计内存泄漏）；
//   · ⑧ `wx.setInnerAudioOption`（iOS 静音模式出声；**真机效果未实测**）；
//   · ⑨ 音量**取响应值**（缺省才由共享层回退常量）＋ **计时按 Track 组装结果**
//     （Σ 人声实测 ＋ Σ 章间留白，**背景 loop 不计入**；**弃 900s 固定值**）；
//   · ⑩ 会话固化**先落本地** `liwu_meditation_session_v1`、**不写云**（C18 未裁）；
//   · ⑬ 五类错误码**各自可见文案 ＋ `requestId`**、可重试；空池 / 缺段 ⇒ 跳段 ＋ warning、
//     **不整场失败**、**不回退老音频库 / 本地兜底 plan**；**零 fixture 分支**（桩只打测试侧）。

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
  buildMeditationTrackPlaybackPlan,
  buildSessionSolidification,
  resolveMeditationPlayableFormats
} = require('../../utils/shared/meditation-track-playback-plan')

// ─── 常量（页面展示文案 ＋ 本地键名；播放口径一律取自共享层，不另抄一份） ──────────────
const MEDITATION_SESSION_STORAGE_KEY = 'liwu_meditation_session_v1'
// R44-④：**mp3 是唯一跨端公共格式**（ogg 仅 Android、iOS 不支持）⇒ 播放清单只保留 mp3。
const MINIPROGRAM_PLAYABLE_FORMAT = 'mp3'

// 运行时 warning 码（`console.warn` 载荷可检索；跳段**不整场失败**）。
const MEDITATION_TRACK_WARNING_CODES = Object.freeze({
  segmentSkipped: 'SEGMENT_SKIPPED',
  noPlayableMp3: 'NO_PLAYABLE_MP3',
  reissueAttempt: 'SEGMENT_REISSUE_ATTEMPT',
  reissueFailed: 'SEGMENT_REISSUE_FAILED'
})

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
//（保持响应给的格式顺序，不按扩展名猜；不播 ogg、**不用 `canPlayType`**）。
const resolveMiniProgramPlaylist = (audio) => resolveMeditationPlayableFormats(audio)
  .filter((format) => format.format === MINIPROGRAM_PLAYABLE_FORMAT)
  .map((format) => ({ format: format.format, url: format.url, mime_type: format.mime_type }))

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
    // 计时节流＝Track 组装结果（Σ 人声实测 ＋ Σ 章间留白；背景 loop 不计入）——**不用 900s 固定值**。
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
    this.segmentWarnings = []
    this.segmentWarningSeen = new Set()
    this.solidificationPayload = null

    applyMiniProgramInnerAudioOptions()

    void this.loadTrack()
    void this.loadPageData()
  },

  onUnload() {
    this.clearTimer()
    this.clearGapTimer()
    // 资源释放（R44-⑦，硬）：两个实例都要 `destroy()`。
    this.destroyAudioContexts()
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
    this.clearTimer()
    this.clearGapTimer()
    this.destroyAudioContexts()

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

  // 计划 → 双轨播放运行时：背景轨一条 `loop` 音频铺底，人声轨按计划顺序排段（只取 mp3）。
  applySessionPlan(plan) {
    const voiceSegments = []
    const planWarnings = []

    // 计划级 warning（**空池** / **池非空但无可用格式**）：共享层已判定「跳过该段」（R44-⑬）。
    ;(Array.isArray(plan.warnings) ? plan.warnings : []).forEach((warning) => {
      planWarnings.push({ section_type: warning?.section_type, code: warning?.code })
    })

    ;(Array.isArray(plan.segments) ? plan.segments : []).forEach((segment) => {
      if (segment.track !== MEDITATION_PLAYBACK_TRACK_KEYS.voice) {
        return
      }

      const playlist = resolveMiniProgramPlaylist(segment.audio)

      // 该段抽中了音频但**没有 mp3**（R44-④）⇒ 同样跳段 ＋ warning，不整场失败。
      if (playlist.length === 0) {
        planWarnings.push({
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
    const hasPlayableAudio = voiceSegments.length > 0 || backgroundPlaylist.length > 0
    const totalSeconds = Math.max(0, Number(plan.totals?.total_seconds) || 0)

    this.sessionPlan = plan
    this.voiceSegments = voiceSegments
    this.voiceSegmentIndex = 0
    this.backgroundPlaylist = backgroundPlaylist
    this.backgroundSectionType = readTrimmedString(plan.background?.audio?.section_type)
    // 音量**取响应值**（共享层仅在响应缺省时回退常量）——页面绝不用常量覆盖响应值（R41-② / R44-⑨）。
    this.backgroundVolume = plan.background?.volume
    this.voiceVolume = plan.voice?.volume
    this.pendingVoiceIndex = null
    this.sessionStarted = false
    this.trackReissueAttempted = false
    this.segmentWarnings = []
    this.segmentWarningSeen = new Set()

    this.setData({
      loading: false,
      audioReady: hasPlayableAudio,
      emptyPlanNotice: hasPlayableAudio ? '' : MEDITATION_EMPTY_PLAN_MESSAGE,
      trackTotalSeconds: totalSeconds,
      remainingSeconds: totalSeconds,
      timeLabel: formatTime(totalSeconds),
      running: false,
      completed: false
    })

    this.setupAudioContexts()
    this.pushSegmentWarnings(planWarnings)
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
    this.setData({ running: true, completed: false })
    // 会话固化**先落本地、不写云**（R44-⑩；云侧写入＝C18 未裁）。
    this.persistSessionSolidification()
    this.startTimer()

    if (this.backgroundContext && this.backgroundPlaylist.length > 0) {
      this.backgroundContext.volume = this.backgroundVolume
      this.backgroundContext.play()
    }

    if (this.voiceContext) {
      this.voiceContext.volume = this.voiceVolume
      this.playVoiceFrom(this.voiceSegmentIndex || 0)
    }
  },

  pauseSession() {
    this.clearTimer()
    this.clearGapTimer()
    this.setData({ running: false })

    if (this.backgroundContext) {
      this.backgroundContext.pause()
    }

    if (this.voiceContext) {
      this.voiceContext.pause()
    }
  },

  resumeSession() {
    this.setData({ running: true, completed: false })

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
    this.voiceSegmentIndex = 0
    this.pendingVoiceIndex = null
    // 重调闸门按「整场」计，重新开始 ⇒ 重新计一次（R44-⑤ 的「整场」＝一次运行）。
    this.trackReissueAttempted = false

    if (this.backgroundContext) {
      this.backgroundContext.stop()
    }

    if (this.voiceContext) {
      this.voiceContext.stop()

      if (this.voiceSegments.length > 0) {
        this.voiceContext.src = this.voiceSegments[0].playlist[0].url
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

  // ─── 计时（按 Track 组装结果，弃 900s 固定值） ───────────────────────────────────
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
    if (this.backgroundContext) {
      this.backgroundContext.stop()
    }

    if (this.voiceContext) {
      this.voiceContext.stop()
    }
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
