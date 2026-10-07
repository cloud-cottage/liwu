// ─── 转码任务状态机 + 回写 payload 构造（纯函数，无 IO，可用桩对象直接单测） ──────
// 状态词表**沿用** scripts/audio-transcode-worker.mjs（方案 B 既有 worker）与
// apps/web/src/admin/services/database.js 的排队口径：
//   audio_transcode_jobs.status      : queued → processing → succeeded | failed
//   med_section_audios.transcode_status: idle | queued | processing | succeeded | failed
// ⚠ 不得新造状态词（例如 `done`）；既有读取方按上述字面量判断。
//
// 判定要点（Zang 裁定，标「可改」）：
//   D-B2-1 领取  : 只领 status='queued'；乐观锁条件更新（where id + status 仍为 queued）成功才能执行。
//   D-B2-2 幂等  : succeeded/failed 的 job 不重做；回写一律「合并去重 + 规范顺序」。
//   D-B2-3 重试  : 每次执行 attempt_count+1（沿用 worker：领取即计数）；>=3 → failed 并写 transcode_error；
//                  单条失败不得中断整批（调用方保证）。
//   D-B2-4 时长  : 只在 med_section_audios.duration 为空/0 时补写（产物 ffprobe 值）；已有值不动。
//   D-B2-7 路径  : meditation-audio-final/{section_type}/{take-<section_audio_id>}.ogg|.mp3
//   D-B2-9 分区  : 只消费 transcode_profile === 'section_audio' 的 job（过滤进查询，见 index.js
//                  fetchQueuedJobs）；缺 section_audio_id 属**永久性结构错误**（立即终结，不入重试）；
//                  老 worker 侧同样加守卫跳过 section_audio，详见 README「上线纪律」。
//   D-B2-10 口径 : job 文档 **attempts / transcode_error 权威**，attempt_count / error_message 为
//                  过渡期镜像（老 worker 仍读）——**待老 worker 退役后收敛为单一口径**。
//   D-3 失败文案  : 命令原文不进文案（只留「可执行文件 + 输入/输出文件名 + 关键参数」摘要）；
//                  stderr **先剔 banner 再取尾部**（原因行在末尾）；结构
//                  `<一句原因摘要>\n--- stderr 尾部 ---\n<尾部文本>`；总长上限 ERROR_MESSAGE_MAX_LENGTH
//                  （本单由 500 提高到 1200，已在 README「失败文案口径」登记）；同一文案同时写入
//                  job 的 transcode_error / error_message 与 med_section_audios.transcode_error。

const {
  MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS,
  MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE,
  MEDITATION_SECTION_AUDIO_FORMATS,
  resolveMeditationSectionAudioTranscodedFormats,
  mergeMeditationSectionAudioTranscodedFormats
} = require('./meditation-formats.js')

// Track 双轨口径的精简副本（配比 / 背景段白名单 / med_tracks 集合名）——权威源与防漂移说明见该文件头。
const {
  MEDITATION_TRACK_COLLECTION,
  MEDITATION_TRACK_VOLUMES,
  MEDITATION_TRACK_BACKGROUND_SECTION_TYPES,
  MEDITATION_SESSION_SOFT_BASELINE_SECONDS,
  isMeditationBackgroundSectionType
} = require('./meditation-track-mix.js')

const AUDIO_TRANSCODE_JOBS_COLLECTION = 'audio_transcode_jobs'
const JOB_STATUS = Object.freeze({
  queued: 'queued',
  processing: 'processing',
  succeeded: 'succeeded',
  failed: 'failed'
})

const MAX_JOB_ATTEMPTS = 3
// 【② 失败分层与重试预算（本单新增）】不改「达到上限 ⇒ 终态 failed」的总语义，只改预算与分类：
//   · permanent（输入完整性 / 结构性）：1 次即终态（对象已被截断，重下 / 重试都不会变好）；
//   · transient（下载 / 网络）：6 次，重试间隔指数递增（见 computeRetryBackoffSeconds / next_attempt_at）；
//   · encoding（转码 / 编码，默认类）：沿用现状 3 次（MAX_JOB_ATTEMPTS）。
const FAILURE_CLASS = Object.freeze({
  permanent: 'permanent',
  transient: 'transient',
  encoding: 'encoding'
})
const MAX_ATTEMPTS_BY_FAILURE_CLASS = Object.freeze({
  permanent: 1,
  transient: 6,
  encoding: MAX_JOB_ATTEMPTS
})
// 瞬时类重试退避：基数 60s × 2^(n-1)，封顶 900s（n ＝ 本轮 attempts）。
const RETRY_BACKOFF_BASE_SECONDS = 60
const RETRY_BACKOFF_MAX_SECONDS = 900
const MAX_JOBS_PER_RUN = 3
const MEDITATION_AUDIO_FINAL_PREFIX = 'meditation-audio-final'

// D-3 失败文案（可诊断性）常量（上限本单由 500 提高到 1200，已在 README「失败文案口径」登记）。
// 旧缺陷：execFile 的 error.message ＝ `Command failed: <完整命令>\n<stderr 开头>`，
//   命令原文已占满 500 字预算 ⇒ 追加在后的 stderr（含**真正的原因行**）被整体截掉；
//   且 stderr 头部是 ffmpeg 版本 banner，与定位无关。
// 新口径：命令原文不进文案（只留摘要）＋ 先剔 banner 再取 stderr **尾部** ＋ 结构可读。
const ERROR_MESSAGE_MAX_LENGTH = 1200
const ERROR_STDERR_TAIL_MAX_LENGTH = 800
const ERROR_STDERR_SECTION_HEADER = '\n--- stderr 尾部 ---\n'

// D-B2-9 队列分区（强制）：新链路（冥想段落音频）的 job 一律带此 profile。
// 字面值由排队方写入（apps/web/src/admin/components/Dashboard/MeditationPage.jsx
//   `transcode_profile: 'section_audio'`，经 database.js#createMeditationAudioTranscodeJob 落库），
// **snake_case、字面量 'section_audio'，两侧（新执行器 / 老 worker）都不得改写**。
const SECTION_AUDIO_TRANSCODE_PROFILE = 'section_audio'

// D-B2-9 队列分区的**第二个分区**（本单新增：Track 级混音）：这类 job 一律带此 profile。
// 与 SECTION_AUDIO_TRANSCODE_PROFILE 并列、**零交叉**（各有独立的查询/领取/回写路径），
// 见本文件末尾「Track 级混音分区」一节与 index.js 的 fetchQueuedTrackMixJobs。
const TRACK_MIX_TRANSCODE_PROFILE = 'track_mix'

// Track 级混音交付前缀（本单约定）：meditation-audio-mix/{track_key}/v<track_version>.ogg|.mp3
const MEDITATION_AUDIO_MIX_PREFIX = 'meditation-audio-mix'

const getString = (value) => (value == null ? '' : String(value))

const getDocumentId = (document = {}) => getString(document?._id || document?.id).trim()

// 排队方（database.js createMeditationAudioTranscodeJob）同时写了 snake_case 规范键与 camelCase 原键，
// 这里按「规范键优先、camelCase 兜底」读，避免依赖某一侧。
const readJobString = (job = {}, ...keys) => {
  for (const key of keys) {
    const value = job?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

const readJobIdentifier = (job = {}) => getDocumentId(job)

// D-B2-10 字段权威口径：job 文档上的 **`attempts` 权威**，`attempt_count` 为过渡期镜像
// （老 worker scripts/audio-transcode-worker.mjs 仍在读 attempt_count）——
// **待老 worker 退役后收敛为单一口径（只留 attempts）**。
// 读取：权威键优先、镜像键兜底；写入：两键同写同值（见 buildClaimPatch）。
const readJobAttemptCount = (job = {}) => {
  const rawAttempts = job?.attempts ?? job?.attempt_count ?? 0
  const parsed = Number(rawAttempts)

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

// ② 瞬时类退避：读取 job 的 `next_attempt_at`（ISO）。未到点 ⇒ 本轮只读跳过（不写任何字段）。
const readJobNextAttemptAt = (job = {}) => readJobString(job, 'next_attempt_at', 'nextAttemptAt')

const isJobDeferred = (job = {}, nowMs = Date.now()) => {
  const raw = readJobNextAttemptAt(job)

  if (!raw) {
    return false
  }

  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) && parsed > Number(nowMs)
}

// D-B2-9：是否为「新链路（section_audio）」job。profile 为 snake_case 字面值，camelCase 仅兜底读。
const isSectionAudioJob = (job = {}) => (
  readJobString(job, 'transcode_profile', 'transcodeProfile') === SECTION_AUDIO_TRANSCODE_PROFILE
)

// 沿用 scripts/audio-transcode-worker.mjs 的 buildCloudBaseFileId（不得自行改形状）。
const buildCloudBaseFileId = (envId, cloudPath) => (
  `cloud://${getString(envId)}/${getString(cloudPath).replace(/^\/+/, '')}`
)

const resolveJobSourceFileId = ({ job = {}, envId = '' }) => {
  const explicitFileId = readJobString(job, 'source_file_id', 'sourceFileId')
  if (explicitFileId) {
    return explicitFileId
  }

  const sourceCloudPath = readJobString(job, 'source_cloud_path', 'sourceCloudPath')
  return sourceCloudPath ? buildCloudBaseFileId(envId, sourceCloudPath) : ''
}

// 回写目标：排队方写 section_audio_id = med_section_audios 文档 id（首选）。
// D-B2-9：section_audio 链路的 job **一律不得**回退到 item_id——缺 section_audio_id 即
// 「永久性结构错误」，由 resolveJobPreconditionError 立即终结（等同 MISSING_SOURCE_FILE，
// 不入重试）。仅老 profile 的 job（历史调用方只给 itemId）保留兜底读法。
const resolveJobSectionAudioId = (job = {}) => (
  readJobString(job, 'section_audio_id', 'sectionAudioId')
  || (isSectionAudioJob(job) ? '' : readJobString(job, 'item_id', 'itemId'))
)

const resolveJobSectionType = (job = {}) => (
  readJobString(job, 'section_type', 'sectionType') || 'audio-only'
)

// D-B2-2 幂等：已被领走 / 已终结 / 结构不完整的 job 一律跳过，不重做。
const resolveJobSkipReason = (job = {}) => {
  if (!readJobIdentifier(job)) {
    return 'missing_job_id'
  }

  // D-B2-9 队列分区：非 section_audio 的 job 不属本执行器（由老 worker / 老 profile 消费）。
  // 只跳过、**不写任何字段**——绝不能把老链路 job 置成 processing / failed。
  if (!isSectionAudioJob(job)) {
    return 'not_section_audio_profile'
  }

  const status = getString(job?.status).trim()

  if (status === JOB_STATUS.succeeded || status === JOB_STATUS.failed) {
    return `job_already_${status}`
  }

  if (status !== JOB_STATUS.queued) {
    return `job_status_${status || 'empty'}`
  }

  return ''
}

// 结构性问题重试也不会变好 ⇒ 记为「永久失败」（一次即 failed，不空耗 3 轮）。
const resolveJobPreconditionError = ({ job = {}, envId = '' }) => {
  if (!resolveJobSectionAudioId(job)) {
    return 'MISSING_SECTION_AUDIO_ID：section_audio job 未登记 section_audio_id（老 profile 才回退 item_id），无法回写 med_section_audios'
  }

  if (!resolveJobSourceFileId({ job, envId })) {
    return 'MISSING_SOURCE_FILE：job 未登记 source_file_id 且 source_cloud_path 为空'
  }

  return ''
}

// D-B2-1：领取 = 条件更新（id + status 仍为 queued → processing）。返回 { updated }，
// updated === 0 表示被别的实例先领走或状态已变 ⇒ 本次必须放弃（防重复领取）。
// attempt_count 在领取时 +1（沿用 worker 口径：attempt_count = 已执行次数）。
const buildClaimPatch = ({ attemptCount, nowIso }) => ({
  status: JOB_STATUS.processing,
  // D-B2-10 字段权威口径：**`attempts` 权威**、`attempt_count` 为过渡期镜像（老 worker 仍读它），
  // 两键同写同值；**待老 worker 退役后收敛为单一口径（只留 attempts）**。
  attempts: Math.max(0, Math.floor(Number(attemptCount) || 0)),
  attempt_count: Math.max(0, Math.floor(Number(attemptCount) || 0)),
  // 同理：**`transcode_error` 权威**、`error_message` 为过渡期镜像；
  // 领取时两键一起清空（只清镜像会让权威字段留着上一轮的旧错误）。
  transcode_error: '',
  error_message: '',
  // ② 领取即清除上一轮的瞬时退避标记（本轮成败会重新写 / 不再写该键）。
  next_attempt_at: '',
  updated_at: nowIso
})

// ─── D-3：失败文案可诊断性（命令摘要 ＋ 剥 banner ＋ stderr 尾部）──────────────
// 目标：job 文档 `transcode_error` 与 `med_section_audios.transcode_error` 都能看到**可定位的原因**。
//   ① 命令原文**不进**文案：只出「可执行文件 + 输入/输出文件名 + 关键参数」摘要，并标注完整命令去向；
//   ② stderr 先**剔除 banner**（版本 / built with / configuration 及其折行续行 / libav* 组件版本），
//      再取**尾部**——ffmpeg 的原因行在末尾，头部永远无用；
//   ③ 结构：`<一句原因摘要>` ＋ `\n--- stderr 尾部 ---\n<尾部文本>`；**尾部优先保留**，
//      摘要按剩余预算截断，保证真正的原因行不被挤掉；
//   ④ 总长受 ERROR_MESSAGE_MAX_LENGTH 约束（本单由 500 提高，已在 README 登记）。

// ffmpeg banner 行（对定位无用，逐行剔除）。configuration 在静态构建里常折行，续行以 `--` 开头，一并剔除。
const stripFfmpegBanner = (stderrText) => {
  const kept = []
  let inConfiguration = false

  for (const rawLine of getString(stderrText).split(/\r?\n/)) {
    const trimmed = getString(rawLine).trim()

    if (inConfiguration) {
      if (/^--/.test(trimmed)) {
        continue
      }
      inConfiguration = false
    }

    if (/^ffmpeg version /i.test(trimmed)
      || /^built with /i.test(trimmed)
      || /^configuration:/i.test(trimmed)
      || /^lib(avutil|avcodec|avformat|avfilter|avdevice|swscale|swresample|postproc)\b/i.test(trimmed)) {
      inConfiguration = /^configuration:/i.test(trimmed)
      continue
    }

    kept.push(rawLine)
  }

  return kept.join('\n').trim()
}

// 剔除 banner 后取 stderr **尾部**（原因行在末尾），保留字数受 ERROR_STDERR_TAIL_MAX_LENGTH 约束。
const takeStderrTail = (stderrText) => {
  const cleaned = stripFfmpegBanner(stderrText)

  return cleaned.length > ERROR_STDERR_TAIL_MAX_LENGTH
    ? cleaned.slice(-ERROR_STDERR_TAIL_MAX_LENGTH)
    : cleaned
}

const baseNameOf = (value) => getString(value).split(/[\\/]/).pop()

// 命令摘要（规则①）：只挑「可执行文件 + 输入/输出文件名 + 关键编码/封装参数」，不复制命令原文。
const summarizeCommandLine = (commandLine) => {
  const tokens = getString(commandLine).trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return ''
  }

  const KEY_VALUE_FLAGS = new Set(['-c:a', '-b:a', '-ar', '-ac', '-vbr', '-f'])
  const inputNames = []
  const outputNames = []
  const keyParams = []

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = tokens[index + 1]

    if (token === '-i' && next) {
      inputNames.push(baseNameOf(next))
      index += 1
      continue
    }

    if (KEY_VALUE_FLAGS.has(token) && next) {
      keyParams.push(`${token} ${next}`)
      index += 1
      continue
    }

    if (token === '-map') {
      index += 1
      continue
    }

    if (!token.startsWith('-') && /\.[A-Za-z0-9]{2,5}$/.test(token)) {
      outputNames.push(baseNameOf(token))
    }
  }

  const pieces = [baseNameOf(tokens[0])]
  if (inputNames.length > 0) {
    pieces.push(`-i ${inputNames.join('+')}`)
  }
  if (keyParams.length > 0) {
    pieces.push(keyParams.join(' '))
  }
  if (outputNames.length > 0) {
    pieces.push(`→ ${outputNames.join(' / ')}`)
  }

  return pieces.join(' ').trim()
}

const describeExitCode = (code) => (
  (typeof code === 'number' || (typeof code === 'string' && code)) ? `退出码 ${code}` : '异常退出'
)

// 命令类失败的摘要行：可执行文件名 + 退出码 + 完整命令去向 + 命令摘要。
// 「完整命令见执行日志」属实：失败时调用方在 `job_failed` / `track_mix_job_failed` 事件里
// logEvent 了 `error.message`（＝ `Command failed: <完整命令>\n<stderr>`）。
const buildCommandFailureSummary = (error, commandLine) => {
  const exeLabel = baseNameOf(getString(commandLine).trim().split(/\s+/)[0] || '') || '子进程'
  const commandSummary = summarizeCommandLine(commandLine)

  return `${exeLabel} 失败（${describeExitCode(error?.code)}）；完整命令见执行日志；命令摘要：${commandSummary || '（命令已省略）'}`
}

const normalizeErrorMessage = (error) => {
  const rawMessage = getString(error?.message || error).trim() || 'TRANSCODE_FAILED'
  const stderrTail = takeStderrTail(error?.stderr)
  // execFile/exec 失败：message 形如 `Command failed: <cmd>\n<stderr>`，或带 error.cmd；
  // 其余（永久性错误 / 下载 / 回写等自造错误）其 message 本就是一句最简原因，原样用。
  const isCommandFailure = /^Command failed:/.test(rawMessage) || typeof error?.cmd === 'string'
  const commandLine = getString(error?.cmd).trim() || rawMessage.replace(/^Command failed:\s*/, '')

  const baseSummary = isCommandFailure
    ? buildCommandFailureSummary(error, commandLine)
    : rawMessage

  if (!stderrTail) {
    return baseSummary.slice(0, ERROR_MESSAGE_MAX_LENGTH)
  }

  // 尾部优先：摘要按剩余预算截断，保证 stderr 尾部（真正的原因行）完整保留。
  const summaryBudget = Math.max(
    0,
    ERROR_MESSAGE_MAX_LENGTH - ERROR_STDERR_SECTION_HEADER.length - stderrTail.length
  )

  return `${baseSummary.slice(0, summaryBudget)}${ERROR_STDERR_SECTION_HEADER}${stderrTail}`
    .slice(0, ERROR_MESSAGE_MAX_LENGTH)
}

// ② 失败分层：错误对象可显式带 `failure_class`；否则 `permanent === true` ⇒ permanent，
//   其余（ffmpeg 命令失败 / 产物缺失 / 回写失败等）一律 encoding（默认类）。
const resolveFailureClass = (error) => {
  const explicit = getString(error?.failure_class).trim()
  if (explicit === FAILURE_CLASS.permanent
    || explicit === FAILURE_CLASS.transient
    || explicit === FAILURE_CLASS.encoding) {
    return explicit
  }

  return error?.permanent ? FAILURE_CLASS.permanent : FAILURE_CLASS.encoding
}

const resolveFailureMaxAttempts = (failureClass) => (
  MAX_ATTEMPTS_BY_FAILURE_CLASS[failureClass] || MAX_JOB_ATTEMPTS
)

// 瞬时类重试退避（秒）：60 × 2^(n-1)，封顶 900s。
const computeRetryBackoffSeconds = (attempts) => {
  const normalizedAttempts = Math.max(1, Math.floor(Number(attempts) || 1))

  return Math.min(RETRY_BACKOFF_MAX_SECONDS, RETRY_BACKOFF_BASE_SECONDS * (2 ** (normalizedAttempts - 1)))
}

// D-B2-3：达到「本类别」的重试预算上限 → failed（终结）；否则退回 queued 等下个 tick 重试。
// 预算按类别取（permanent 1 / transient 6 / encoding 3）——总语义仍是「达到上限即终态」。
// 瞬时类**非终态**时给出下一次可领取时间 `next_attempt_at`（指数退避，由 runBatch 跳过未到点的 job）；
// 终态 / 其它类不写该键（沿用「下一 tick 即重试」）。
const classifyFailure = ({ attempts, error, nowMs }) => {
  const normalizedAttempts = Math.max(1, Math.floor(Number(attempts) || 1))
  const failureClass = resolveFailureClass(error)
  const maxAttempts = resolveFailureMaxAttempts(failureClass)
  const isTerminal = normalizedAttempts >= maxAttempts
  const message = normalizeErrorMessage(error)
  const baseNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now()
  const nextAttemptAt = (!isTerminal && failureClass === FAILURE_CLASS.transient)
    ? new Date(baseNowMs + computeRetryBackoffSeconds(normalizedAttempts) * 1000).toISOString()
    : ''

  return {
    attempts: normalizedAttempts,
    is_terminal: isTerminal,
    failure_class: failureClass,
    max_attempts: maxAttempts,
    next_attempt_at: nextAttemptAt,
    message,
    job_status: isTerminal ? JOB_STATUS.failed : JOB_STATUS.queued,
    section_audio_status: isTerminal
      ? MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.failed
      : MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.queued
  }
}

const stripFileExtension = (value) => getString(value).replace(/\.[^./\\]+$/, '')

const sanitizePathSegment = (value) => (
  getString(value).replace(/^\/+/, '').replace(/[^A-Za-z0-9._-]+/g, '-') || 'unknown'
)

// D-B2-7（Zang 裁定，可改）：云存储输出路径
//   meditation-audio-final/{section_type}/{take-<section_audio_id 或 audio_id>}.ogg|.mp3
// 若 job.target_cloud_path 已落在 meditation-audio-final/ 下（调用方显式指定），以其为基准换扩展名，
// 避免「排队方写一套路径、执行器又写一套」。既有排队方给的是 meditation-audio/... （非 -final），
// 因此本执行器统一落到 -final 前缀下。
const buildDeliveryCloudBasePaths = (job = {}) => {
  const explicitTargetBase = stripFileExtension(readJobString(job, 'target_cloud_path', 'targetCloudPath'))
  const audioKey = sanitizePathSegment(
    readJobString(job, 'section_audio_id', 'sectionAudioId') || readJobString(job, 'item_id', 'itemId')
  )
  const basePath = explicitTargetBase.includes(`${MEDITATION_AUDIO_FINAL_PREFIX}/`)
    ? explicitTargetBase
    : `${MEDITATION_AUDIO_FINAL_PREFIX}/${sanitizePathSegment(resolveJobSectionType(job))}/take-${audioKey}`

  return {
    base_path: basePath,
    opus: `${basePath}.ogg`,
    mp3: `${basePath}.mp3`
  }
}

// D-B2-4：已有 duration（客户端实测）不动；为空/0 且产物时长可用时才补写。
const resolveDurationPatch = ({ currentAudio = {}, durationSeconds = 0 }) => {
  const currentDuration = Number(currentAudio?.duration ?? 0)
  if (Number.isFinite(currentDuration) && currentDuration > 0) {
    return {}
  }

  const measured = Number(durationSeconds)
  if (!Number.isFinite(measured) || measured <= 0) {
    return {}
  }

  return { duration: Math.round(measured * 100) / 100 }
}

// 回写 med_section_audios（D-B2-6：字段与 shared-utils normalizer 逐字对齐，不新增/不改名）。
// 幂等：transcoded_formats 先 resolve 现值再合并去重，重复执行不产生重复条目（D-B2-2）。
const buildMedSectionAudioSuccessPatch = ({
  currentAudio = {},
  opusFileId = '',
  opusUrl = '',
  mp3FileId = '',
  mp3Url = '',
  durationSeconds = 0
}) => {
  const mergedFormats = mergeMeditationSectionAudioTranscodedFormats(
    mergeMeditationSectionAudioTranscodedFormats(
      resolveMeditationSectionAudioTranscodedFormats(currentAudio),
      MEDITATION_SECTION_AUDIO_FORMATS.opus
    ),
    MEDITATION_SECTION_AUDIO_FORMATS.mp3
  )

  return {
    file_id: opusFileId,
    audio_url: opusUrl,
    transcoded_formats: mergedFormats,
    fallback_file_id: mp3FileId,
    fallback_audio_url: mp3Url,
    fallback_mime_type: MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE.mp3,
    transcode_status: MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.succeeded,
    transcode_error: '',
    ...resolveDurationPatch({ currentAudio, durationSeconds })
  }
}

// 失败回写：非终结失败只报错、状态退回 queued（下个 tick 重试）；终结失败置 failed。
const buildMedSectionAudioFailurePatch = ({ failure }) => ({
  transcode_status: failure?.section_audio_status || MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.failed,
  transcode_error: getString(failure?.message).slice(0, ERROR_MESSAGE_MAX_LENGTH)
})

// job 成功回写：沿用 worker 的 output_* 字段名，双路产物各记一份（_mp3 后缀），
// 并把产物 ffprobe 结果替换 worker 的 pass1_metrics_json（本链路无 loudnorm 遍，见 README「响度归一」）。
// D-B2-10：错误字段两键同写（`transcode_error` 权威 / `error_message` 镜像）。
// 【本单新增（可选）】`warnings` / `warning_message`：**只在调用方真的传了非空 warnings 时写入**
//   （section_audio 分区不传 ⇒ 键完全不存在，老分区文档形状与判据不受影响）。
//   用途：混音产物「超出软基准 900s」这类**照常产出但必须可见**的警告（禁止静默截断）。
const buildJobSuccessPatch = ({
  deliveryPaths,
  opusFileId,
  opusUrl,
  mp3FileId,
  mp3Url,
  durationSeconds,
  probe,
  warnings = [],
  warningMessage = '',
  inputSizeBytes = null,
  nowIso
}) => ({
  status: JOB_STATUS.succeeded,
  output_file_id: opusFileId,
  output_audio_url: opusUrl,
  output_duration: Number(durationSeconds) || 0,
  output_cloud_path: deliveryPaths?.opus || '',
  output_file_id_mp3: mp3FileId,
  output_audio_url_mp3: mp3Url,
  output_cloud_path_mp3: deliveryPaths?.mp3 || '',
  output_probe_json: JSON.stringify(probe || {}),
  ...(Array.isArray(warnings) && warnings.length > 0
    ? { warnings, warning_message: getString(warningMessage) }
    : {}),
  ...buildInputSizePatch(inputSizeBytes),
  // 待老 worker 退役后收敛为单一口径（只留 transcode_error）
  error_message: '',
  transcode_error: '',
  updated_at: nowIso
})

// D-B2-10 字段权威口径（job 文档）：**`transcode_error` 权威**、`error_message` 为过渡期镜像
// （老 worker 仍在读 error_message）——**待老 worker 退役后收敛为单一口径（只留 transcode_error）**。
// 【本单新增（可选）】`input_container` / `input_head_hex`：**只在调用方真的传了容器指纹时写入**
//   （输入探测失败路径带；成功路径 / 无指纹失败不传 ⇒ 键完全不存在，既有文档形状与判据不受影响）。
//   与 `input_bytes` 同批落库（若已有 input_bytes 则一并带上）——见 buildInputFingerprintPatch。
const buildJobFailurePatch = ({
  failure,
  nowIso,
  inputSizeBytes = null,
  inputContainer = '',
  inputHeadHex = ''
}) => ({
  status: failure?.job_status || JOB_STATUS.failed,
  error_message: getString(failure?.message).slice(0, ERROR_MESSAGE_MAX_LENGTH),
  transcode_error: getString(failure?.message).slice(0, ERROR_MESSAGE_MAX_LENGTH),
  // ② 瞬时类非终态失败：落下一次可领取时间（指数退避）；终态 / 其它类不写该键。
  ...(failure?.next_attempt_at ? { next_attempt_at: failure.next_attempt_at } : {}),
  ...buildInputSizePatch(inputSizeBytes),
  ...buildInputFingerprintPatch({ inputContainer, inputHeadHex }),
  updated_at: nowIso
})

const buildPermanentError = (message) => {
  const error = new Error(getString(message) || 'PERMANENT_TRANSCODE_ERROR')
  error.permanent = true

  return error
}

// ② 瞬时类错误（下载 / 网络）：允许更多次重试（上限 6 次、间隔指数递增）。
const buildTransientError = (message) => {
  const error = new Error(getString(message) || 'TRANSIENT_TRANSCODE_ERROR')
  error.failure_class = FAILURE_CLASS.transient

  return error
}

// ─── 【本单新增】输入完整性防护 + 输入体积登记（section_audio 链路）─────────────

// ③ 输入体积登记：把「下载后的输入字节数」记入 job 文档的新键 `input_bytes`
//   （与既有 job 字段不冲突）。只在调用方确实拿到字节数时写入；
//   未下载成功（如提前失败）不传 ⇒ 键完全不存在，既有文档形状与判据不受影响。
//   与客户端 `med_section_audios.source_size`（本地 File 字节数）配对，使「对象/下载链路」
//   还是「源文件本身」一眼可判。
const buildInputSizePatch = (inputSizeBytes) => {
  if (inputSizeBytes === null || inputSizeBytes === undefined || inputSizeBytes === '') {
    return {}
  }

  const parsed = Number(inputSizeBytes)
  return Number.isFinite(parsed) && parsed >= 0 ? { input_bytes: Math.round(parsed) } : {}
}

// 【本单新增】输入容器指纹登记：把「输入容器判定」与「前 32 字节十六进制」记入 job 文档的
//   **新键 `input_container` / `input_head_hex`**（与既有 job 字段不冲突）。
//   只在容器判定非空（含 `unknown`）时写入，两键**同进同出**；读不到输入文件 ⇒ 不传 ⇒ 键完全不存在。
//   与 `input_bytes` 同批落库（buildJobFailurePatch 里两个 patch 一并展开）：
//   失败时「对象被截断（仍为 mp4）」与「源文件本身非 MP4（amr/silk/…）」即可一眼可判。
//   `input_head_hex`：**小写十六进制、无分隔符（连写）**，固定此一种写法（见 README §2.3）。
const buildInputFingerprintPatch = ({ inputContainer = '', inputHeadHex = '' } = {}) => {
  const container = getString(inputContainer).trim().toLowerCase()
  if (!container) {
    return {}
  }

  return {
    input_container: container,
    input_head_hex: getString(inputHeadHex).trim().toLowerCase()
  }
}

// ② 输入完整性防护：ffprobe 探测输入失败 ⇒ 输入容器无法解析（对象被截断），重试不会变好
//   ⇒ 包成**永久错误**（classifyFailure 立即终结，不空耗 3 轮）。文案人话 + 可定位：
//   原因取样自 ffprobe 输出的**首个非空原因行**（如 `[mov,mp4,m4a,...] moov atom not found`、
//   `<file>: Invalid data found when processing input`）。
const takeFirstReasonLine = (text) => {
  for (const rawLine of getString(text).split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (trimmed) {
      return trimmed
    }
  }

  return ''
}

const buildInputMediaInvalidError = (error) => {
  const reason = takeFirstReasonLine(error?.stderr) || '无法解析音频容器'
  // 【本单新增，允许项】末尾补一句不敏感的格式线索：已有的人话文案**逐字保留**，只在其后追加
  //   `；输入容器：<container>`（非 mp4 已知容器补「（非 MP4）」）。容器判定来自 error 上挂载的
  //   指纹（index.js#assertInputProbeable 在抛错前登记）；无指纹 ⇒ 不追加（文案与从前完全一致）。
  //   job 文档另有 input_container / input_head_hex 新键（不依赖本句是否被截断）。
  const container = getString(error?.input_container).trim().toLowerCase()
  const containerHint = !container
    ? ''
    : (container === 'mp4' || container === 'unknown'
      ? `；输入容器：${container}`
      : `；输入容器：${container}（非 MP4）`)
  const message = `INPUT_MEDIA_INVALID：输入音频不完整（无法解析容器），请重传；ffprobe 原因：${reason}${containerHint}`
  return buildPermanentError(message)
}

// ─── Track 级混音分区（profile = 'track_mix'，本单新增） ───────────────────────
//
// 与上面的 section_audio 分区**并列**、**零交叉**：本段所有读取/判定/回写自成一套，
// 上面 section_audio 的任一函数都**不得**因本段而改变行为（分区纪律：过滤进查询、
// 缺必需字段即永久错误立即终结、不先领后筛）。
//
// 【job 输入契约（audio_transcode_jobs 文档；snake_case 为规范键，camelCase 仅兜底读）】
//   必需：
//     transcode_profile           = 'track_mix'（分区键，排队方写入）
//     track_key                   Track 键（＝ med_tracks.track_key，同时作交付二级目录）
//     track_version               Track 版本号（> 0 的整数；文件名形如 v<version>）
//     voice_section_audio_ids     人声段 med_section_audios **文档 id** 的**有序数组**
//                                 （长度 >= 1，**顺序即章序**，执行器不重排）
//   背景来源（三选一，至少给一个；优先级：file_id > section_audio_id > section_type）：
//     background_file_id          背景音频的 CloudBase file_id（cloud://…）
//     background_section_audio_id 背景段 med_section_audios 文档 id（取其 file_id）
//     background_section_type     'sec-nature' | 'sec-bowl'（取该段类型下已转码的最新一条）
//   可选：
//     volumes                     { voice, background }；缺省取权威常量 MEDITATION_TRACK_VOLUMES（1 / 0.33）
//     track_document_id           直接给 med_tracks 文档 id（缺省按 track_key 查询）
//     target_cloud_path           已落在 meditation-audio-mix/ 下时沿用其基准名换扩展名
//
//   〜〜 本单新增（章间留白与前导静音、可见警告）〜〜
//     voice_section_gap_after_seconds  **与人声数组等长**的数值数组：逐位给出「该 take 之后要插入的
//                                      章间留白秒数」（0 ＝ 不插；末位恒 0 —— 末章不留尾部静默）
//     voice_leading_silence_seconds    **第一个（人声）段之前**的前导静音秒数＝其前所有
//                                      **「有可用音频」章**的 gap 之和（本模板下两背景章均有
//                                      音频时＝其 gap 之和，默认 282s；某背景章无可用音频 ⇒
//                                      不计其 gap；>= 0 的有限数）
//
// 【永久错误判定（resolveTrackMixJobPreconditionError）】下列任一命中即**立即终结**
//   （status='failed'、不退回 queued、不空耗 3 轮重试）：track_key 缺失 / track_version 缺失或非正整数 /
//   voice_section_audio_ids 缺失或空数组 / voice_section_gap_after_seconds 缺失或与人声数组不等长 /
//   voice_leading_silence_seconds 缺失或非法 /
//   三种背景来源全缺 / background_section_type 不在背景白名单。

// 混音产物的**可见警告**码（落在 job 文档 `warnings` 上；不改变 job 终态——照常产出、不截断）。
const TRACK_MIX_WARNING_CODES = Object.freeze({
  // 产物时长超出「一次冥想的软基准」（900s / 15:00）：**照常产出**，只标记（禁止静默截断）。
  durationOverSoftBaseline: 'MIX_DURATION_OVER_SOFT_BASELINE',
  // 产物实测时长与「Σ人声输入实测 ＋ Σ章间留白」超出容差：可测不变量失配（只是标记，不改判失败）。
  durationMismatch: 'MIX_DURATION_MISMATCH'
})

// 「产物时长 ＝ Σ人声 ＋ Σ留白」这条不变量在实测侧的容差（秒）：编码器 priming / 容器取整带来的
// 毫秒级偏差不算失配（Opus 预跳样本实测 ≈6.5ms，取 0.5s 留足余量，避免噪声式误报）。
const TRACK_MIX_DURATION_TOLERANCE_SECONDS = 0.5

// D-B2-9 同型分区谓词：是否为「Track 级混音」job（snake_case 字面值，camelCase 仅兜底读）。
const isTrackMixJob = (job = {}) => (
  readJobString(job, 'transcode_profile', 'transcodeProfile') === TRACK_MIX_TRANSCODE_PROFILE
)

// 只读「非空字符串数组」（规范键优先、camelCase 兜底），逐项 trim 并去掉空项。
const readJobStringArray = (job = {}, ...keys) => {
  for (const key of keys) {
    const value = job?.[key]
    if (Array.isArray(value)) {
      const normalized = value.map((item) => getString(item).trim()).filter(Boolean)
      if (normalized.length > 0) {
        return normalized
      }
    }
  }

  return []
}

// 只读正整数字段：非有限数 / <= 0 / 非整数一律视为「未登记」（track_version 语义＝版本号）。
const readJobPositiveInteger = (job = {}, ...keys) => {
  for (const key of keys) {
    const parsed = Number(job?.[key])
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed)
    }
  }

  return 0
}

const resolveTrackMixTrackKey = (job = {}) => readJobString(job, 'track_key', 'trackKey')

const resolveTrackMixTrackVersion = (job = {}) => readJobPositiveInteger(job, 'track_version', 'trackVersion')

const resolveTrackMixTrackDocumentId = (job = {}) => readJobString(job, 'track_document_id', 'trackDocumentId')

// 人声**顺序＝数组顺序**，不得排序/去重（章序由排队方落库时决定，执行器只是消费者）。
const resolveTrackMixVoiceSectionAudioIds = (job = {}) => (
  readJobStringArray(job, 'voice_section_audio_ids', 'voiceSectionAudioIds')
)

// 章间留白计划（本单新增；**与人声数组等长**、逐位对应「该 take 之后要插入的静音秒数」）。
// 读取只做「取原值」（snake_case 规范键优先、camelCase 兜底），合法性校验统一在
// resolveTrackMixJobPreconditionError（缺 / 非数组 / 长度不符 ⇒ 永久错误）与命令构造器
// （数值非法 ⇒ 永久错误）两处收口，避免三处分叉。
const resolveTrackMixVoiceSectionGapAfterSeconds = (job = {}) => {
  const value = job?.voice_section_gap_after_seconds ?? job?.voiceSectionGapAfterSeconds
  return Array.isArray(value) ? value : null
}

// 前导静音（本单新增；**第一个（人声）段之前**的静音秒数＝其前所有**「有可用音频」章**的 gap
// 之和——某章无可用音频 ⇒ 不计其 gap；本模板下两背景章均有音频时＝其 gap 之和，默认 282s）。
// 端侧播放器对**进光标的段**（含背景段）累加 gap ⇒ 背景章留白会把人声轨整体后移；
// 缺该字段＝旧「无前导静音」口径载荷 ⇒ 与计划层 `totals` 不符（且是静默的），
// 故按永久性结构错误在 precondition 一次终结。
// 读取只做「取原值 + 形状归一」：缺省 / 非数值 / 负数 / NaN ⇒ 返回 null（由 precondition 判永久错误）。
const resolveTrackMixVoiceLeadingSilenceSeconds = (job = {}) => {
  const raw = job?.voice_leading_silence_seconds ?? job?.voiceLeadingSilenceSeconds

  if (raw === undefined || raw === null || raw === '') {
    return null
  }

  const parsed = Number(raw)

  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 1000) / 1000 : null
}

const resolveTrackMixBackgroundFileId = (job = {}) => readJobString(job, 'background_file_id', 'backgroundFileId')

const resolveTrackMixBackgroundSectionAudioId = (job = {}) => (
  readJobString(job, 'background_section_audio_id', 'backgroundSectionAudioId')
)

const resolveTrackMixBackgroundSectionType = (job = {}) => (
  readJobString(job, 'background_section_type', 'backgroundSectionType')
)

// 配比：job.volumes（或 job 级 voice_volume / background_volume）可覆盖；缺省＝权威常量（1 / 0.33）。
// 这里**不抛错**：非法数值（负数 / NaN）交给命令构造器统一报永久错误（单一收口点，免得两处判定分叉）。
const resolveTrackMixVolumes = (job = {}) => {
  const rawVolumes = job?.volumes && typeof job.volumes === 'object' ? job.volumes : {}
  const voiceValue = rawVolumes.voice ?? job?.voice_volume ?? job?.voiceVolume
  const backgroundValue = rawVolumes.background ?? job?.background_volume ?? job?.backgroundVolume
  const isAbsent = (value) => value === undefined || value === null || value === ''

  return {
    voice: isAbsent(voiceValue) ? MEDITATION_TRACK_VOLUMES.voice : Number(voiceValue),
    background: isAbsent(backgroundValue) ? MEDITATION_TRACK_VOLUMES.background : Number(backgroundValue)
  }
}

// 与 resolveJobSkipReason 同构（同状态词表、同为「跳过而非失败」），但只认 track_mix 分区：
// 非本分区的 job 只跳过、**不写任何字段**（绝不能把 section_audio / 老链路 job 置成 processing / failed）。
const resolveTrackMixJobSkipReason = (job = {}) => {
  if (!readJobIdentifier(job)) {
    return 'missing_job_id'
  }

  if (!isTrackMixJob(job)) {
    return 'not_track_mix_profile'
  }

  const status = getString(job?.status).trim()

  if (status === JOB_STATUS.succeeded || status === JOB_STATUS.failed) {
    return `job_already_${status}`
  }

  if (status !== JOB_STATUS.queued) {
    return `job_status_${status || 'empty'}`
  }

  return ''
}

// 缺必需字段属**永久性结构错误**（重试不会变好）⇒ 与 MISSING_SECTION_AUDIO_ID / MISSING_SOURCE_FILE 同类，
// 由调用方包成 buildPermanentError 后走 classifyFailure，一次即 failed。
const resolveTrackMixJobPreconditionError = (job = {}) => {
  if (!resolveTrackMixTrackKey(job)) {
    return 'MISSING_TRACK_KEY：track_mix job 未登记 track_key，无法定位 med_tracks 文档与交付二级目录'
  }

  if (!resolveTrackMixTrackVersion(job)) {
    return 'MISSING_TRACK_VERSION：track_mix job 的 track_version 缺失或非正整数（文件名形如 v<version>）'
  }

  if (resolveTrackMixVoiceSectionAudioIds(job).length === 0) {
    return 'MISSING_VOICE_SECTION_AUDIO_IDS：track_mix job 未登记 voice_section_audio_ids（按章序的有序数组，长度 >= 1）'
  }

  // 章间留白计划：必须显式给出且与人声数组**逐位等长**——缺该字段的载荷是「人声紧挨着拼」的旧口径，
  // 直接产出会与端侧共享计划层的 totals 口径不符（且是静默的），故按永久性结构错误一次终结。
  const voiceSectionAudioIds = resolveTrackMixVoiceSectionAudioIds(job)
  const gapAfterInputSeconds = resolveTrackMixVoiceSectionGapAfterSeconds(job)

  if (!gapAfterInputSeconds) {
    return 'MISSING_VOICE_SECTION_GAP_PLAN：track_mix job 未登记 voice_section_gap_after_seconds（与人声数组等长的留白秒数数组；缺该字段＝旧「无留白」口径载荷）'
  }

  if (gapAfterInputSeconds.length !== voiceSectionAudioIds.length) {
    return `INVALID_VOICE_SECTION_GAP_PLAN：voice_section_gap_after_seconds 长度（${gapAfterInputSeconds.length}）必须与 voice_section_audio_ids 长度（${voiceSectionAudioIds.length}）一致`
  }

  // 前导静音计划：必须显式给出且为 >= 0 的有限数——缺该字段的载荷是「人声从 0 起」的旧口径，
  // 会漏掉其前**「有可用音频」章**的 gap（默认两背景章均有音频时各 141、合计 282s），
  // 产物时间轴与端侧双轨播放器整体错位（静默），故按永久性结构错误一次终结。
  if (resolveTrackMixVoiceLeadingSilenceSeconds(job) === null) {
    return 'MISSING_VOICE_LEADING_SILENCE：track_mix job 未登记合法的 voice_leading_silence_seconds（第一个（人声）段之前的前导静音秒数＝其前所有「有可用音频」章 gap 之和，无可用音频的章不计其 gap，须为 >= 0 的有限数；缺该字段＝旧「无前导静音」口径载荷）'
  }

  const backgroundSectionType = resolveTrackMixBackgroundSectionType(job)

  if (!resolveTrackMixBackgroundFileId(job)
    && !resolveTrackMixBackgroundSectionAudioId(job)
    && !backgroundSectionType) {
    return 'MISSING_BACKGROUND_SOURCE：track_mix job 未登记背景来源（background_file_id / background_section_audio_id / background_section_type 至少一个）'
  }

  if (backgroundSectionType && !isMeditationBackgroundSectionType(backgroundSectionType)) {
    return `INVALID_BACKGROUND_SECTION_TYPE：background_section_type=${backgroundSectionType} 不在背景段白名单（${MEDITATION_TRACK_BACKGROUND_SECTION_TYPES.join(' / ')}）`
  }

  return ''
}

// 交付路径（本单约定）：meditation-audio-mix/{track_key}/v{track_version}.ogg|.mp3
// 与 section_audio 的 meditation-audio-final/… 前缀**并列而不复用**（两条链路互不覆盖；
// 背景与人声的中间产物也不落这个前缀）。
const buildTrackMixDeliveryCloudBasePaths = (job = {}) => {
  const explicitTargetBase = stripFileExtension(readJobString(job, 'target_cloud_path', 'targetCloudPath'))
  const basePath = explicitTargetBase.includes(`${MEDITATION_AUDIO_MIX_PREFIX}/`)
    ? explicitTargetBase
    : `${MEDITATION_AUDIO_MIX_PREFIX}/${sanitizePathSegment(resolveTrackMixTrackKey(job))}/v${resolveTrackMixTrackVersion(job)}`

  return {
    base_path: basePath,
    opus: `${basePath}.ogg`,
    mp3: `${basePath}.mp3`
  }
}

// med_tracks 回写：`mix_audio` **整体覆盖**（幂等：重复执行写同一形状，不产生重复条目），
// 只含约定 4 个字段；**不动** track.version（版本提升由排队方/管理员决定，执行器只是消费者）。
// ⚠ file_id 不下发端侧：下发范围由 D6 白名单管，不在本单范围（此处只负责落库）。
const buildMedTrackMixAudioPatch = ({ trackVersion, durationSeconds, opusFileId, mp3FileId }) => ({
  mix_audio: {
    version: Math.max(1, Math.floor(Number(trackVersion) || 1)),
    duration: Math.round(Math.max(0, Number(durationSeconds) || 0) * 100) / 100,
    ogg_file_id: getString(opusFileId),
    mp3_file_id: getString(mp3FileId)
  }
})

module.exports = {
  AUDIO_TRANSCODE_JOBS_COLLECTION,
  JOB_STATUS,
  MAX_JOB_ATTEMPTS,
  MAX_JOBS_PER_RUN,
  // 【本单新增】② 失败分层与重试预算
  FAILURE_CLASS,
  MAX_ATTEMPTS_BY_FAILURE_CLASS,
  RETRY_BACKOFF_BASE_SECONDS,
  RETRY_BACKOFF_MAX_SECONDS,
  MEDITATION_AUDIO_FINAL_PREFIX,
  // D-3 失败文案上限（供自测/规范核对；已在 README 登记）
  ERROR_MESSAGE_MAX_LENGTH,
  ERROR_STDERR_TAIL_MAX_LENGTH,
  SECTION_AUDIO_TRANSCODE_PROFILE,
  TRACK_MIX_TRANSCODE_PROFILE,
  MEDITATION_AUDIO_MIX_PREFIX,
  MEDITATION_TRACK_COLLECTION,
  getDocumentId,
  readJobString,
  readJobIdentifier,
  readJobAttemptCount,
  isSectionAudioJob,
  buildCloudBaseFileId,
  resolveJobSourceFileId,
  resolveJobSectionAudioId,
  resolveJobSectionType,
  resolveJobSkipReason,
  resolveJobPreconditionError,
  buildClaimPatch,
  normalizeErrorMessage,
  classifyFailure,
  // 【本单新增】② 失败分层：类别解析 / 预算 / 退避 / 瞬时错误构造 / 退避跳过判定
  resolveFailureClass,
  resolveFailureMaxAttempts,
  computeRetryBackoffSeconds,
  readJobNextAttemptAt,
  isJobDeferred,
  buildTransientError,
  buildDeliveryCloudBasePaths,
  resolveDurationPatch,
  buildMedSectionAudioSuccessPatch,
  buildMedSectionAudioFailurePatch,
  buildJobSuccessPatch,
  buildJobFailurePatch,
  buildPermanentError,
  // 【本单新增】输入完整性防护 + 输入体积登记（section_audio 链路）
  buildInputSizePatch,
  // 【本单新增】输入容器指纹登记（input_container / input_head_hex，失败路径落库）
  buildInputFingerprintPatch,
  buildInputMediaInvalidError,
  // Track 级混音分区（profile = 'track_mix'）——与上面 section_audio 的导出一一对应、互不调用
  isTrackMixJob,
  resolveTrackMixTrackKey,
  resolveTrackMixTrackVersion,
  resolveTrackMixTrackDocumentId,
  resolveTrackMixVoiceSectionAudioIds,
  resolveTrackMixVoiceSectionGapAfterSeconds,
  resolveTrackMixVoiceLeadingSilenceSeconds,
  resolveTrackMixBackgroundFileId,
  resolveTrackMixBackgroundSectionAudioId,
  resolveTrackMixBackgroundSectionType,
  resolveTrackMixVolumes,
  resolveTrackMixJobSkipReason,
  resolveTrackMixJobPreconditionError,
  buildTrackMixDeliveryCloudBasePaths,
  buildMedTrackMixAudioPatch,
  TRACK_MIX_WARNING_CODES,
  TRACK_MIX_DURATION_TOLERANCE_SECONDS
}
