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

const {
  MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS,
  MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE,
  MEDITATION_SECTION_AUDIO_FORMATS,
  resolveMeditationSectionAudioTranscodedFormats,
  mergeMeditationSectionAudioTranscodedFormats
} = require('./meditation-formats.js')

const AUDIO_TRANSCODE_JOBS_COLLECTION = 'audio_transcode_jobs'
const JOB_STATUS = Object.freeze({
  queued: 'queued',
  processing: 'processing',
  succeeded: 'succeeded',
  failed: 'failed'
})

const MAX_JOB_ATTEMPTS = 3
const MAX_JOBS_PER_RUN = 3
const MEDITATION_AUDIO_FINAL_PREFIX = 'meditation-audio-final'
const ERROR_MESSAGE_MAX_LENGTH = 500

// D-B2-9 队列分区（强制）：新链路（冥想段落音频）的 job 一律带此 profile。
// 字面值由排队方写入（apps/web/src/admin/components/Dashboard/MeditationPage.jsx
//   `transcode_profile: 'section_audio'`，经 database.js#createMeditationAudioTranscodeJob 落库），
// **snake_case、字面量 'section_audio'，两侧（新执行器 / 老 worker）都不得改写**。
const SECTION_AUDIO_TRANSCODE_PROFILE = 'section_audio'

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
  updated_at: nowIso
})

const normalizeErrorMessage = (error) => {
  const baseMessage = getString(error?.message || error).trim() || 'TRANSCODE_FAILED'
  const stderrTail = getString(error?.stderr)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(' | ')
  const combined = stderrTail ? `${baseMessage}（ffmpeg stderr：${stderrTail}）` : baseMessage

  return combined.slice(0, ERROR_MESSAGE_MAX_LENGTH)
}

// D-B2-3：attempts>=3 → failed（终结）；否则退回 queued 等下个 tick 重试。
// error.permanent === true 的结构性/环境性错误（如 FFMPEG_NOT_FOUND）不重试，直接终结。
const classifyFailure = ({ attempts, error }) => {
  const normalizedAttempts = Math.max(1, Math.floor(Number(attempts) || 1))
  const isTerminal = Boolean(error?.permanent) || normalizedAttempts >= MAX_JOB_ATTEMPTS
  const message = normalizeErrorMessage(error)

  return {
    attempts: normalizedAttempts,
    is_terminal: isTerminal,
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
const buildJobSuccessPatch = ({ deliveryPaths, opusFileId, opusUrl, mp3FileId, mp3Url, durationSeconds, probe, nowIso }) => ({
  status: JOB_STATUS.succeeded,
  output_file_id: opusFileId,
  output_audio_url: opusUrl,
  output_duration: Number(durationSeconds) || 0,
  output_cloud_path: deliveryPaths?.opus || '',
  output_file_id_mp3: mp3FileId,
  output_audio_url_mp3: mp3Url,
  output_cloud_path_mp3: deliveryPaths?.mp3 || '',
  output_probe_json: JSON.stringify(probe || {}),
  // 待老 worker 退役后收敛为单一口径（只留 transcode_error）
  error_message: '',
  transcode_error: '',
  updated_at: nowIso
})

// D-B2-10 字段权威口径（job 文档）：**`transcode_error` 权威**、`error_message` 为过渡期镜像
// （老 worker 仍在读 error_message）——**待老 worker 退役后收敛为单一口径（只留 transcode_error）**。
const buildJobFailurePatch = ({ failure, nowIso }) => ({
  status: failure?.job_status || JOB_STATUS.failed,
  error_message: getString(failure?.message).slice(0, ERROR_MESSAGE_MAX_LENGTH),
  transcode_error: getString(failure?.message).slice(0, ERROR_MESSAGE_MAX_LENGTH),
  updated_at: nowIso
})

const buildPermanentError = (message) => {
  const error = new Error(getString(message) || 'PERMANENT_TRANSCODE_ERROR')
  error.permanent = true

  return error
}

module.exports = {
  AUDIO_TRANSCODE_JOBS_COLLECTION,
  JOB_STATUS,
  MAX_JOB_ATTEMPTS,
  MAX_JOBS_PER_RUN,
  MEDITATION_AUDIO_FINAL_PREFIX,
  SECTION_AUDIO_TRANSCODE_PROFILE,
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
  buildDeliveryCloudBasePaths,
  resolveDurationPatch,
  buildMedSectionAudioSuccessPatch,
  buildMedSectionAudioFailurePatch,
  buildJobSuccessPatch,
  buildJobFailurePatch,
  buildPermanentError
}
