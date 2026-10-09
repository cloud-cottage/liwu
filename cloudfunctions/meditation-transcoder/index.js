// ─── meditation-transcoder：冥想音频转码执行器（腾讯云函数 SCF，定时触发） ──────
//
// 【迁移来源】scripts/audio-transcode-worker.mjs（419 行，已提交，方案 B 既有 worker）。
//   本云函数是它的**移植**：队列领取方式、CloudBase 调用（downloadFile / uploadFile /
//   getTempFileURL）、错误码风格、凭证环境变量回退链一律沿用；差别只在下面几条（Zang 裁定）：
//     ① 转码参数：**Kevin（用户）2026-09-24 裁定的 48k 立体声 CBR**（覆盖此前 R33 的 32k 单声道口径）：
//        **单次 ffmpeg 调用双路输出**（.ogg Opus 主体 + .mp3 兜底，均 48k CBR / `-ac 2`）；
//        worker 是单路 + 两遍 loudnorm 链路；
//     ② 触发形态：**定时触发器（每分钟）**，单次最多领 3 条 + **乐观锁领取**（D-B2-1）；
//     ③ 回写目标：med_section_audios 规范字段（D-B2-6），worker 回写的是老
//        `app_settings.meditation_audio_library.items[]`；
//     ④ 幂等/重试：succeeded/failed 不重做、失败 attempts(权威)+1、>=3 置 failed（D-B2-2 / D-B2-3）；
//     ⑤ 云函数**不能** require 仓库内共享模块 ⇒ lib/meditation-formats.js 精简等价副本（D-B2-8）。
//
// 【D-B2-9 队列分区（强制）】**只消费 `transcode_profile === 'section_audio'` 的 queued job**：
//   过滤条件写进查询（fetchQueuedJobs 的 where），**不是先领后筛**；
//   缺 `section_audio_id` 视为**永久性结构错误**（等同 MISSING_SOURCE_FILE，立即终结、不入重试）。
//   ⚠ 上线纪律：启用本执行器前先停掉 `npm run audio:transcode-worker:loop`，
//     同一时刻**只允许一侧消费** `audio_transcode_jobs`（详见 README「上线纪律」）。
//
// 【D-B2-10 字段权威口径】job 文档 **`attempts` / `transcode_error` 为权威字段**，
//   `attempt_count` / `error_message` 为**过渡期镜像**（老 worker 仍在读）——
//   **待老 worker 退役后收敛为单一口径**。读取权威键优先，写入两键同写同值（见 lib/transcode-state.js）。
//
// 【Track 级混音（profile = 'track_mix'，本单新增）】**第二个队列分区**，与 section_audio **并列、零交叉**：
//   · 领取：同样**过滤进查询**（fetchQueuedTrackMixJobs 的 where 带 `transcode_profile: 'track_mix'`），
//     乐观锁条件亦带该 profile；非本分区 job 只跳过、**不写任何字段**。
//   · 永久错误：缺 `track_key` / `track_version`（非正整数）/ `voice_section_audio_ids`（空数组）/
//     `voice_section_gap_after_seconds`（缺失或与人声数组不等长）/ `voice_leading_silence_seconds`
//     （缺失或非法；＝第一个（人声）段之前的前导静音＝其前所有**「有可用音频」章**的 gap 之和，
//     无可用音频的章其 gap 不计入）/ 三种背景来源全缺 /
//     `background_section_type` 不在背景白名单 ⇒ **立即终结、不入重试**。
//   · 处理：**一次 ffmpeg 调用**——人声按 job 数组序 concat（同段多次 take 全取）→ 按 job 的
//     `voice_leading_silence_seconds` 在**第一个（人声）段之前**插入前导静音、按 job 的
//     `voice_section_gap_after_seconds` 在相应人声之后插入章间留白静音（均 `anullsrc` 滤镜源生成，
//     不落临时文件）→ 背景 `-stream_loop -1` 铺满整条（含前导静音与留白期）→ `amix` 混音（voice 1.0 /
//     background 0.33）→ 双路输出（`.ogg` Opus 48k CBR ＋ `.mp3` 48k）。
//   · 产物时长（可测不变量）＝ 前导静音 ＋ Σ人声输入实测 ＋ Σ章间留白；**超出软基准 900s 照常产出**，
//     只在 job 文档 `warnings` / 执行结果 / 日志里落**可见警告**（**禁止静默截断**）。
//   · 交付：`meditation-audio-mix/{track_key}/v{track_version}.ogg|.mp3`；回写 job 状态 ＋
//     `med_tracks.mix_audio { version, duration, ogg_file_id, mp3_file_id }`。
//   · 参数与命令构造见 `lib/track-mix-command.js`；配比/段白名单的精简副本见 `lib/meditation-track-mix.js`。
//   · ⚠ file_id **不下发端侧**（下发范围由 D6 白名单管），本执行器只负责落库。
//
// 【响度归一（loudnorm）**未**在本链路实现】——老 worker 的做法、以及沿用需要什么，见 README
//   「响度归一（待 Zang 拍板）」一节；本条**不由实现者自裁**，故本链路严格照抄既定参数，不加任何 -af。
//
// 【输入容器指纹登记（本单新增）】输入探测失败（assertInputProbeable）时**只读输入文件前 32 字节**，
//   判 `input_container`（mp4 / amr / silk / wav / mp3 / ogg / unknown）与前 32 字节 `input_head_hex`
//   （**小写十六进制、无分隔符**），随失败回写进 job **新键**并打入日志（与既有 `input_bytes` 同批）；
//   成功路径不写。用途：无需人工比对即可分辨「上传丢字节（指纹仍是 mp4）」与「文件本身非 MP4
//   （amr / silk / …）」。判定与采样在 lib/input-container-fingerprint.js；回写键见
//   lib/transcode-state.js#buildInputFingerprintPatch；口径与写法登记见 README §2.3。
//
// 【自管下载＋内容级完整性验证（本单新增，根除「下载未落盘就读取」竞态）】生产实测根因：
//   云函数内 `app.downloadFile` 返回后、文件尾部内容尚未落盘，ffprobe/ffmpeg 立即读取 ⇒
//   `moov atom not found`；本地字节数已到目标值 ⇒ **体积判据检测不到**「尺寸对、尾部空」。
//   对策（取输入全部改走新路径，`section_audio` 与 `track_mix` 的每个输入一致）：
//     ① **自管下载**：`getTempFileURL` 拿临时 URL ⇒ `http/https.get` 流式写 `<目标>.part`
//        （跟随重定向、请求超时、响应不完整即 reject），等 write stream **`finish` ＋ `close`
//        （fs.close 完成）**后原子改名到目标路径——「何时算写完」由本执行器自己掌握；
//        临时 URL 不可得 ⇒ 回退 `app.downloadFile`（校验同套）。
//     ② **写完即验（内容级）**：体积 ＝ 远程对象体积（沿用既有判据）；对 `ftyp` 头的 MP4/M4A
//        扫**盒子链**（逐盒解析，支持 largesize 与到文件尾两种形态，要求链闭合且存在 moov，
//        lib/input-structure.js）；非 MP4 容器按魔数跳过扫描（只验体积）。不完整 ⇒ 重下
//        （沿用 ≤2 次、短退避）；重下后仍不完整 ⇒ 抛**瞬时类** `INPUT_DOWNLOAD_INCOMPLETE`
//        （对象是好的，重试应能恢复，不判永久）。
//     ③ 语义收口：`INPUT_MEDIA_INVALID` 只留给「远程对象本身坏」（结构闭合 / 非 MP4 容器
//        但 ffprobe 仍解析失败）；`input_bytes` / `input_container` / `input_head_hex`
//        登记口径不变。编码参数 / ffmpeg 命令、重试预算、队列分区、D6 读契约一律不动。
//
// 【时长】D-B2-4：**不得对原始上传件取时长**（实测 duration=N/A），只取转码产物 ffprobe 值，
//   且仅在 med_section_audios.duration 为空/0 时补写。
//
// 【部署】见同目录 README.md（含 ffmpeg 层 / 自建静态构建两种取法与实地校验命令）。

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const tcb = require('@cloudbase/node-sdk')

const {
  MEDITATION_SECTION_AUDIO_COLLECTION
} = require('./lib/meditation-formats.js')

const {
  resolveFfmpegPath,
  resolveFfprobePath,
  assertToolAvailable,
  buildDualOutputArgs,
  buildProbeArgs,
  parseProbeJson
} = require('./lib/transcode-command.js')

// Track 级混音（profile = 'track_mix'）的命令构造（纯函数）：与上面的双路构造并列、互不调用。
const { buildTrackMixArgs } = require('./lib/track-mix-command.js')

// 【本单新增】输入容器指纹：只读输入文件前 32 字节，判 mp4/amr/silk/wav/mp3/ogg/unknown
// （纯判定 + 只读采样，无副作用；编码参数 / ffmpeg 命令与此无关）。
const { fingerprintInputFile } = require('./lib/input-container-fingerprint.js')

// 【本单新增】写完即验（内容级）：MP4（ftyp 头）盒子链闭合扫描（闭合 ＋ 存在 moov）；
// 非 MP4 容器（wav/ogg/webm/mp3…按魔数）无通用盒子链 ⇒ 跳过扫描只验体积，不误判。
const { verifyDownloadedInputStructure } = require('./lib/input-structure.js')

// Track 双轨口径的精简副本（本执行器只取「集合名 + 背景段白名单」两项，其余口径由状态模块吃）。
const {
  MEDITATION_TRACK_COLLECTION,
  MEDITATION_SESSION_SOFT_BASELINE_SECONDS,
  isMeditationBackgroundSectionType
} = require('./lib/meditation-track-mix.js')

const {
  AUDIO_TRANSCODE_JOBS_COLLECTION,
  JOB_STATUS,
  MAX_JOBS_PER_RUN,
  SECTION_AUDIO_TRANSCODE_PROFILE,
  TRACK_MIX_TRANSCODE_PROFILE,
  readJobIdentifier,
  readJobString,
  readJobAttemptCount,
  isSectionAudioJob,
  resolveJobSourceFileId,
  resolveJobSectionAudioId,
  resolveJobSkipReason,
  resolveJobPreconditionError,
  buildClaimPatch,
  classifyFailure,
  buildDeliveryCloudBasePaths,
  buildMedSectionAudioSuccessPatch,
  buildMedSectionAudioFailurePatch,
  buildJobSuccessPatch,
  buildJobFailurePatch,
  buildPermanentError,
  buildTransientError,
  isJobDeferred,
  buildInputMediaInvalidError,
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
  TRACK_MIX_DURATION_TOLERANCE_SECONDS,
  getDocumentId
} = require('./lib/transcode-state.js')

const execFileAsync = promisify(execFile)

const MAX_BUFFER_BYTES = 20 * 1024 * 1024
// 临时链接有效期（秒）。前端 uploadAudioFile 未显式指定（默认 2 小时），此处显式写死便于追溯；
// 长效性依赖 file_id（见 README「临时 URL 有效期」）。
const TEMP_URL_MAX_AGE_SECONDS = 7200

// 与 cloudbaserc.json 的 envId、scripts/audio-transcode-worker.mjs 一致；仅作兜底，优先取运行环境变量。
const DEFAULT_ENV_ID = 'liwu-d8gek6jjdab1d087c'

const readEnvValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

const resolveEnvId = () => (
  readEnvValue('CLOUDBASE_ENV_ID', 'TCB_ENV', 'SCF_NAMESPACE') || DEFAULT_ENV_ID
)

// 云函数内优先用 SCF 角色**内置凭证**（无需密钥）；环境变量回退链命名与
// scripts/audio-transcode-worker.mjs 完全一致，便于本地手动 invoke 验证。
// ⚠ 任何情况下不打印密钥，只记录「是否提供了密钥」。
const getCloudBaseApp = (envId) => {
  const secretId = readEnvValue('TENCENT_SECRET_ID', 'TENCENTCLOUD_SECRET_ID', 'VITE_TENCENT_SECRET_ID')
  const secretKey = readEnvValue('TENCENT_SECRET_KEY', 'TENCENTCLOUD_SECRET_KEY', 'VITE_TENCENT_SECRET_KEY')

  return secretId && secretKey
    ? tcb.init({ env: envId, secretId, secretKey })
    : tcb.init({ env: envId })
}

const buildRequestId = () => `mtr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

const logEvent = (requestId, stage, details = {}) => {
  console.log(JSON.stringify({
    scope: 'cloudbase-meditation-transcoder',
    requestId,
    stage,
    ...details
  }))
}

// 口径同 apps/web/src/admin/services/database.js 的 assertCloudBaseWriteResult：
// CloudBase SDK 在「集合不存在 / 权限被拒」等错误时以 resolve 返回 { code, message } 而不是 reject，
// 只 try/catch 会静默失败 ⇒ 执行器所有读写点统一经此校验后抛错。
const assertCloudBaseResult = (result, label) => {
  if (result && typeof result === 'object' && !Array.isArray(result) && result.code && result.message) {
    throw new Error(`${label} 操作失败：${result.message}（${result.code}）`)
  }

  return result
}

const getDocuments = (result) => {
  const data = result?.data

  if (Array.isArray(data)) {
    return data
  }

  return data && typeof data === 'object' ? [data] : []
}

const readDocument = async ({ db, collectionName, documentId }) => {
  const result = await db.collection(collectionName).doc(documentId).get()
  assertCloudBaseResult(result, collectionName)

  return getDocuments(result)[0] || null
}

// 返回是否真的写到了文档（doc().update() 不 upsert：updated === 0 表示文档不存在，
// 必须让调用方看见，不得当成成功）。
const updateDocument = async ({ db, collectionName, documentId, patch }) => {
  const result = assertCloudBaseResult(
    await db.collection(collectionName).doc(documentId).update(patch),
    collectionName
  )

  return Number(result?.updated || 0) > 0
}

// D-B2-1：乐观锁领取（where id + status 仍为 queued → processing）。
// Query.update 返回 { updated }：0 = 被别的实例先领走或状态已变 ⇒ 放弃本次执行。
// D-B2-9：条件里**必须**带 transcode_profile ⇒ 只有 section_audio 链路能被本执行器领走
// （即便有人手工 invoke 传进老 profile 的 job，也领不走）。
const claimJob = async ({ db, jobId, attemptCount, nowIso }) => {
  const result = assertCloudBaseResult(
    await db.collection(AUDIO_TRANSCODE_JOBS_COLLECTION)
      .where({
        _id: jobId,
        status: JOB_STATUS.queued,
        transcode_profile: SECTION_AUDIO_TRANSCODE_PROFILE
      })
      .update(buildClaimPatch({ attemptCount, nowIso })),
    AUDIO_TRANSCODE_JOBS_COLLECTION
  )

  return Number(result?.updated || 0) > 0
}

// D-B2-9 队列分区（强制，过滤条件**进查询**、不是先领后筛）：
//   只领 `transcode_profile === 'section_audio'` 的 queued job；老 profile（default / nature /
//   tts_simple 等）一律不碰，由老 worker scripts/audio-transcode-worker.mjs 消费。
//   上线纪律：同一时刻只允许一侧消费（启用本执行器前先停掉 audio:transcode-worker:loop），见 README。
const fetchQueuedJobs = async ({ db, limit }) => {
  const result = await db.collection(AUDIO_TRANSCODE_JOBS_COLLECTION)
    .where({
      status: JOB_STATUS.queued,
      transcode_profile: SECTION_AUDIO_TRANSCODE_PROFILE
    })
    .limit(limit)
    .get()
  assertCloudBaseResult(result, AUDIO_TRANSCODE_JOBS_COLLECTION)

  return getDocuments(result)
}

const resolveUploadFileId = ({ uploadResult, envId, cloudPath }) => (
  String(uploadResult?.fileID || uploadResult?.fileId || '').trim() || `cloud://${envId}/${cloudPath}`
)

const resolveTempFileUrls = async ({ app, fileIds }) => {
  const normalizedFileIds = [...new Set(fileIds.filter(Boolean))]
  if (normalizedFileIds.length === 0) {
    return new Map()
  }

  const result = await app.getTempFileURL({
    fileList: normalizedFileIds.map((fileID) => ({ fileID, maxAge: TEMP_URL_MAX_AGE_SECONDS }))
  })
  const fileList = result?.fileList || result?.data?.fileList || []

  return new Map(fileList.map((item) => [
    item.fileID || item.fileId,
    item.tempFileURL || item.download_url || item.downloadUrl || ''
  ]))
}

const assertOutputFile = (filePath, formatLabel) => {
  let sizeBytes = 0
  try {
    sizeBytes = fs.statSync(filePath).size
  } catch (error) {
    throw new Error(`TRANSCODE_OUTPUT_MISSING：${formatLabel} 产物缺失（${filePath}）：${error?.message || ''}`)
  }

  if (!(sizeBytes > 0)) {
    throw new Error(`TRANSCODE_OUTPUT_EMPTY：${formatLabel} 产物为空文件（${filePath}）`)
  }

  return sizeBytes
}

// 【② 输入完整性防护（本单新增）】转码前对**下载后的输入件**做一次 ffprobe 探测
// （复用既有 buildProbeArgs；不新增/不改编码命令）。探测失败（截断 m4a 的
// `moov atom not found` / `Invalid data found when processing input` 等）⇒ 输入容器无法解析
// ＝存储侧对象不完整，重试不会变好 ⇒ 抛**永久错误**（classifyFailure 立即终结，不空耗 3 轮）；
// 文案人话 + 可定位（含 ffprobe 首行原因），并走既有失败回写链路。无头 webm（duration=N/A）
// 探测成功 ⇒ 放行（不得把「无时长头」误判为不完整）。
const assertInputProbeable = async ({ ffprobePath, inputPath, jobId, inputSizeBytes, requestId }) => {
  try {
    const probeOutput = (await execFileAsync(ffprobePath, buildProbeArgs(inputPath), {
      maxBuffer: MAX_BUFFER_BYTES
    })).stdout
    parseProbeJson(probeOutput)
  } catch (error) {
    const reason = String(error?.stderr || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || ''

    // 【本单新增】容器指纹登记：只读输入文件前 32 字节，判容器并登记「前 32 字节十六进制」。
    //   挂到 error 上供失败回写（job 新键 input_container / input_head_hex）与文案末尾的格式线索使用。
    //   分不清「上传丢字节」（仍 mp4）与「文件本身非 MP4」（amr/silk/…）的痛点由此消除（无需人工比对）。
    const fingerprint = fingerprintInputFile(inputPath)
    if (fingerprint) {
      error.input_container = fingerprint.input_container
      error.input_head_hex = fingerprint.input_head_hex
    }

    logEvent(requestId, 'input_media_unreadable', {
      jobId,
      input_bytes: inputSizeBytes,
      input_container: fingerprint?.input_container || '',
      input_head_hex: fingerprint?.input_head_hex || '',
      reason,
      message: error?.message || ''
    })

    // 注意：buildInputMediaInvalidError 会**新造**一个永久错误（不是复用入参 error），
    //   故指纹要挂到**新错误**上，失败回写（resolveFailureInputFingerprint）才取得到。
    const mediaError = buildInputMediaInvalidError(error)
    if (fingerprint) {
      mediaError.input_container = fingerprint.input_container
      mediaError.input_head_hex = fingerprint.input_head_hex
    }

    throw mediaError
  }
}

// ─── ① 下载后完整性校验 ＋ 自管下载（本单改造）────────────────────────────────
// 生产实测根因（本次事故）：云函数内「下载 → 使用」之间存在**写入未完成竞态**——
//   `app.downloadFile` 返回时本地字节数已到目标值，但尾部内容尚未落盘，ffprobe/ffmpeg
//   立即读取 ⇒ 报 `moov atom not found`；同一对象原样取回本机 ffprobe 正常 ⇒ 对象完好、
//   上传完好。体积判据检测不到这种「尺寸对、尾部空」。
// 对策：
//   ① **自管下载**（downloadObjectViaTempUrl）：临时 URL ⇒ `http/https.get` 流式写
//      `<目标>.part`，响应体确认完整（实收 ＝ Content-Length、连接未被中断）才收尾，
//      等 write stream **`finish` ＋ `close`（fs.close 完成）**，再原子改名到目标路径；
//      临时 URL 不可得 ⇒ 回退 `app.downloadFile`（完整性与自管路径同套校验）。
//   ② **写完即验（内容级）**：体积比对（沿用既有判据）→ MP4 盒子链闭合扫描（只读盒子头；
//      非 MP4 容器按魔数跳过）→ ffprobe 可解析（assertInputProbeable，最终闸门，一字未动）。
//   不一致 / 不完整 ⇒ **重下（上限 2 次、短退避）**；仍不行按类别抛错：
//   盒子链仍不闭合 ⇒ **瞬时** `INPUT_DOWNLOAD_INCOMPLETE`（对象是好的，重试应能恢复）；
//   结构完好但 ffprobe 仍失败 ⇒ 永久 `INPUT_MEDIA_INVALID`（对象本身无法解析，维持原语义）；
//   体积仍不匹配 ⇒ 永久 `INPUT_SIZE_MISMATCH`（维持原语义）；
//   下载调用本身失败 ⇒ 「瞬时」类 `INPUT_DOWNLOAD_FAILED`。
const DOWNLOAD_MAX_REDOWNLOADS = 2
const DOWNLOAD_RETRY_BACKOFF_MS = 250
// 自管下载参数：socket 空闲超时（数据持续流动不触发，非总时长上限）与重定向上限
// （COS 临时 URL 可能 302 跳转）。
const DOWNLOAD_HTTP_TIMEOUT_MS = 30000
const DOWNLOAD_MAX_REDIRECTS = 5

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)))

const readLocalFileSizeBytes = (filePath) => {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

// HEAD 取 content-length（Node 18 全局 fetch；不可用 / 非 http(s) / 失败 ⇒ null，绝不抛给调用方）。
const fetchContentLengthBytes = async (url) => {
  if (!url || typeof globalThis.fetch !== 'function' || !/^https?:/i.test(url)) {
    return null
  }

  try {
    const response = await globalThis.fetch(url, { method: 'HEAD' })
    const raw = response?.headers?.get ? response.headers.get('content-length') : ''
    const parsed = Number(raw)

    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

// 取对象元数据（一次 getTempFileURL 同时拿临时 URL 与体积）：体积①元数据 size → ②HEAD content-length
// → ③null（退化用内容级校验兜底）。临时 URL 取不到（SDK 异常 / 空返回）⇒ tempFileUrl 为空串，
// 调用方回退 app.downloadFile。
const resolveRemoteObjectMeta = async ({ app, fileId }) => {
  const result = await app.getTempFileURL({
    fileList: [{ fileID: fileId, maxAge: TEMP_URL_MAX_AGE_SECONDS }]
  })
  const entry = (result?.fileList || result?.data?.fileList || [])[0] || null
  const metadataSize = Number(entry?.size)
  const tempFileUrl = entry?.tempFileURL || entry?.download_url || entry?.downloadUrl || ''

  if (Number.isFinite(metadataSize) && metadataSize > 0) {
    return { tempFileUrl, remoteSizeBytes: metadataSize }
  }

  return { tempFileUrl, remoteSizeBytes: await fetchContentLengthBytes(tempFileUrl) }
}

// 兼容保留（原体积判据入口；现基于 resolveRemoteObjectMeta，供自测直接驱动）。
const resolveRemoteObjectSizeBytes = async ({ app, fileId }) => {
  const meta = await resolveRemoteObjectMeta({ app, fileId })

  return meta.remoteSizeBytes
}

// ─── 自管下载（本单新增）：临时 URL → 流式写 <目标>.part → finish ＋ fs.close → 原子改名 ──
// 「何时算写完」由本执行器自己掌握：响应体确认完整（实收 ＝ Content-Length、连接未被中断）
// 才收尾写流 ⇒ `finish` 只可能在完整数据后触发；`finish` 之后再等 `close`（fs.close 完成、
// 句柄关闭）；最后原子改名到目标路径——改名成功前目标路径永远不会出现「半份」文件。
// 任一步失败：清理 .part、reject（调用方按瞬时类处理）。
const downloadObjectViaTempUrl = async ({ tempFileUrl, targetPath }) => {
  const partPath = `${targetPath}.part`
  const writeStream = fs.createWriteStream(partPath, { flags: 'w' })

  try {
    await new Promise((resolveDownload, rejectDownload) => {
      let settled = false
      const settleOnce = (settle, value) => {
        if (settled) {
          return
        }
        settled = true
        settle(value)
      }
      const rejectOnce = (error) => {
        writeStream.destroy()
        settleOnce(rejectDownload, error instanceof Error ? error : new Error(String(error || '下载失败')))
      }

      writeStream.on('error', (error) => rejectOnce(new Error(`写入临时文件失败：${error?.message || ''}`)))
      writeStream.on('finish', () => settleOnce(resolveDownload))

      const requestFrom = (url, redirectCount) => {
        let requestModule = null
        try {
          const parsedUrl = new URL(url)
          requestModule = parsedUrl.protocol === 'https:'
            ? https
            : parsedUrl.protocol === 'http:' ? http : null
          if (!requestModule) {
            throw new Error(`不支持的下载协议：${parsedUrl.protocol}`)
          }
        } catch (error) {
          rejectOnce(error)
          return
        }

        const request = requestModule.get(url, { timeout: DOWNLOAD_HTTP_TIMEOUT_MS }, (response) => {
          const statusCode = Number(response?.statusCode || 0)
          const location = typeof response?.headers?.location === 'string' ? response.headers.location : ''

          if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
            response.on('error', () => {})
            response.resume()
            request.destroy()
            if (redirectCount >= DOWNLOAD_MAX_REDIRECTS) {
              rejectOnce(new Error(`重定向次数超过上限（${DOWNLOAD_MAX_REDIRECTS} 次）`))
              return
            }
            let nextUrl = ''
            try {
              nextUrl = new URL(location, url).toString()
            } catch (error) {
              rejectOnce(new Error(`重定向地址无效：${error?.message || ''}`))
              return
            }
            requestFrom(nextUrl, redirectCount + 1)
            return
          }

          if (!(statusCode >= 200 && statusCode < 300)) {
            response.on('error', () => {})
            response.resume()
            rejectOnce(new Error(`HTTP 状态码 ${statusCode}`))
            return
          }

          response.on('error', (error) => rejectOnce(new Error(`下载响应失败：${error?.message || ''}`)))

          const declaredLength = Number(response?.headers?.['content-length'] || 0)
          let receivedBytes = 0
          let responseEnded = false

          response.on('data', (chunk) => {
            receivedBytes += chunk.length
          })
          response.on('end', () => {
            responseEnded = true
            if (declaredLength > 0 && receivedBytes !== declaredLength) {
              rejectOnce(new Error(`响应体不完整：实收 ${receivedBytes} 字节，声明 ${declaredLength} 字节`))
              return
            }
            writeStream.end()
          })
          response.on('close', () => {
            if (!responseEnded) {
              rejectOnce(new Error('下载连接在响应完成前中断'))
            }
          })

          response.pipe(writeStream, { end: false })
        })

        request.on('timeout', () => request.destroy(new Error(`下载请求超时（${DOWNLOAD_HTTP_TIMEOUT_MS}ms）`)))
        request.on('error', (error) => rejectOnce(error))
      }

      requestFrom(tempFileUrl, 0)
    })

    // finish（数据全部交给 OS）之后还须 fs.close 完成（句柄关闭）才允许继续；
    // 已自动关闭（autoClose）则立即通过。
    await new Promise((resolveClose) => {
      if (writeStream.closed || writeStream.destroyed) {
        resolveClose()
        return
      }
      writeStream.once('close', resolveClose)
      writeStream.close(() => {})
    })

    await fs.promises.rename(partPath, targetPath)
  } catch (error) {
    writeStream.destroy()
    await fs.promises.rm(partPath, { force: true }).catch(() => {})
    throw error
  }
}

const downloadFileWithIntegrity = async ({ app, fileId, targetPath, ffprobePath, jobId, requestId, label = 'input' }) => {
  // 一次性取对象元数据（临时 URL ＋ 体积）：URL 用于自管下载；体积沿用既有判据。
  // 元数据不可得（SDK 异常 / 空返回）⇒ 回退 SDK 下载路径，内容级校验照做（不因取不到元数据跳过）。
  let remoteSizeBytes = null
  let tempFileUrl = ''

  try {
    const meta = await resolveRemoteObjectMeta({ app, fileId })
    tempFileUrl = meta.tempFileUrl
    remoteSizeBytes = meta.remoteSizeBytes
  } catch (error) {
    logEvent(requestId, 'input_remote_size_unavailable', { jobId, label, message: error?.message || '' })
  }

  if (!tempFileUrl) {
    logEvent(requestId, 'input_download_fallback_sdk', { jobId, label })
  }

  // 记录**最后一轮**的失败形态（size_mismatch / structure / probe），重下预算耗尽后据此分派错误类别。
  let lastFailure = null
  let lastLocalSizeBytes = 0

  for (let round = 0; round <= DOWNLOAD_MAX_REDOWNLOADS; round += 1) {
    try {
      if (tempFileUrl) {
        // 自管下载：流式写盘，等 finish ＋ fs.close（＋原子改名）后才返回——
        // 「下载返回 ⇒ 文件完整落盘」由此成为本执行器自己保证的不变量。
        await downloadObjectViaTempUrl({ tempFileUrl, targetPath })
      } else {
        // 回退：临时 URL 不可得时沿用 SDK 下载（完整性与自管路径同套校验）。
        await app.downloadFile({ fileID: fileId, tempFilePath: targetPath })
      }
    } catch (error) {
      // 下载 / 网络类（瞬时）：交给上层按瞬时预算重试（上限 6 次、指数退避）。
      throw buildTransientError(`INPUT_DOWNLOAD_FAILED：下载输入对象失败（${label}）：${error?.message || ''}`)
    }

    const localSizeBytes = readLocalFileSizeBytes(targetPath)
    lastLocalSizeBytes = localSizeBytes

    if (remoteSizeBytes !== null && localSizeBytes !== remoteSizeBytes) {
      lastFailure = { kind: 'size_mismatch', localSizeBytes, remoteSizeBytes }
      logEvent(requestId, 'input_size_mismatch', { jobId, label, round, localSizeBytes, remoteSizeBytes })
    } else {
      // 写完即验（内容级）①：结构完整性。MP4/M4A（ftyp 头）扫顶层盒子链（闭合 ＋ 存在 moov）；
      // 非 MP4 容器（wav/ogg/webm/mp3…按魔数）无通用盒子链 ⇒ 跳过扫描只验体积，不误判。
      const structure = verifyDownloadedInputStructure(targetPath)
      if (!structure.ok) {
        lastFailure = { kind: 'structure', structure }
        logEvent(requestId, 'input_structure_incomplete', {
          jobId,
          label,
          round,
          localSizeBytes,
          input_container: structure.container || '',
          reason: structure.reason || '',
          box_types: (structure.box_types || []).join('→')
        })
      } else {
        // 写完即验（内容级）②：ffprobe 可解析（既有最终闸门；编码参数一字未动）。
        try {
          await assertInputProbeable({
            ffprobePath,
            inputPath: targetPath,
            jobId,
            inputSizeBytes: localSizeBytes,
            requestId
          })
          return { sizeBytes: localSizeBytes, remoteSizeBytes, redownloads: round }
        } catch (probeError) {
          lastFailure = { kind: 'probe', probeError }
          logEvent(requestId, 'input_probe_retry', { jobId, label, round, localSizeBytes })
        }
      }
    }

    if (round < DOWNLOAD_MAX_REDOWNLOADS) {
      await sleep(DOWNLOAD_RETRY_BACKOFF_MS * (round + 1))
    }
  }

  if (lastFailure?.kind === 'structure') {
    // 盒子链重下预算耗尽仍不闭合。体积与对象一致（传输字节完整）仍缺结构 ⇒ 正是「写入未完成
    // 竞态」残余 ⇒ 判**瞬时**类（对象是好的，重试自管下载应能恢复），绝不判永久。
    const structure = lastFailure.structure || {}
    const incompleteError = buildTransientError(
      `INPUT_DOWNLOAD_INCOMPLETE：下载的输入文件不完整（${label}，${lastLocalSizeBytes} 字节）：${structure.reason || '容器结构未闭合'}；已自动重下 ${DOWNLOAD_MAX_REDOWNLOADS} 次仍未恢复，请稍后重试`
    )
    if (lastLocalSizeBytes > 0) {
      incompleteError.input_bytes = lastLocalSizeBytes
    }
    // 容器指纹照常登记（与既有失败回写同套），让「本地下载不完整」在 job 文档上可一眼定位。
    const fingerprint = fingerprintInputFile(targetPath)
    if (fingerprint) {
      incompleteError.input_container = fingerprint.input_container
      incompleteError.input_head_hex = fingerprint.input_head_hex
    }
    throw incompleteError
  }

  if (lastFailure?.kind === 'probe') {
    // 结构完好（盒子链闭合 / 非 MP4 容器）但 ffprobe 仍解析失败 ⇒ 已排除「本地下载不完整」，
    // 对象本身无法解析 ⇒ 永久「输入完整性」类（INPUT_MEDIA_INVALID），语义维持不变。
    const probeError = lastFailure.probeError
    if (lastLocalSizeBytes > 0) {
      probeError.input_bytes = lastLocalSizeBytes
    }
    throw probeError
  }

  // 体积不匹配（重下后本地仍与对象不一致）＝永久「输入完整性」类，语义维持不变。
  const sizeMismatchError = buildPermanentError(
    `INPUT_SIZE_MISMATCH：重下 ${DOWNLOAD_MAX_REDOWNLOADS} 次后本地体积仍与对象不一致（${label}：本地 ${lastFailure?.localSizeBytes ?? lastLocalSizeBytes} / 对象 ${lastFailure?.remoteSizeBytes ?? remoteSizeBytes ?? 0} 字节）`
  )
  if (lastLocalSizeBytes > 0) {
    sizeMismatchError.input_bytes = lastLocalSizeBytes
  }
  throw sizeMismatchError
}

// ③ 失败收口时取输入字节数：优先调用方已登记的；否则取错误上挂载的「最后一次下载到的字节数」。
const resolveFailureInputBytes = (currentInputBytes, error) => {
  if (currentInputBytes !== null && currentInputBytes !== undefined) {
    return currentInputBytes
  }

  const fromError = Number(error?.input_bytes)
  return Number.isFinite(fromError) && fromError > 0 ? fromError : currentInputBytes
}

// 【本单新增】失败收口时取容器指纹：输入探测失败时由 assertInputProbeable 挂在错误上
//   （input_container / input_head_hex）。取不到 ⇒ 两键为空 ⇒ 失败回写不写这两个键（文档形状不变）。
const resolveFailureInputFingerprint = (error) => ({
  inputContainer: typeof error?.input_container === 'string' ? error.input_container : '',
  inputHeadHex: typeof error?.input_head_hex === 'string' ? error.input_head_hex : ''
})

// 失败收口：写 job（重试或终结）+ 尽最大努力写 med_section_audios 状态（写失败不得吞掉主错误）。
const failJob = async ({
  db,
  jobId,
  sectionAudioId,
  failure,
  nowIso,
  requestId,
  inputSizeBytes = null,
  inputContainer = '',
  inputHeadHex = ''
}) => {
  await updateDocument({
    db,
    collectionName: AUDIO_TRANSCODE_JOBS_COLLECTION,
    documentId: jobId,
    patch: buildJobFailurePatch({ failure, nowIso, inputSizeBytes, inputContainer, inputHeadHex })
  }).catch((error) => {
    logEvent(requestId, 'job_failure_patch_failed', { jobId, message: error?.message || '' })
  })

  if (sectionAudioId) {
    await updateDocument({
      db,
      collectionName: MEDITATION_SECTION_AUDIO_COLLECTION,
      documentId: sectionAudioId,
      patch: { ...buildMedSectionAudioFailurePatch({ failure }), updated_at: nowIso }
    }).catch((error) => {
      logEvent(requestId, 'section_audio_failure_patch_failed', { sectionAudioId, message: error?.message || '' })
    })
  }

  return {
    jobId,
    section_audio_id: sectionAudioId,
    status: failure.job_status,
    attempts: failure.attempts,
    is_terminal: failure.is_terminal,
    error: failure.message
  }
}

const processJob = async ({ app, db, envId, job, requestId }) => {
  const jobId = readJobIdentifier(job)
  const sectionAudioId = resolveJobSectionAudioId(job)
  const nowIso = new Date().toISOString()
  const attemptCount = readJobAttemptCount(job) + 1

  // D-B2-9 纵深防御：正常路径已在 fetchQueuedJobs 的**查询条件**里按 profile 过滤；
  // 此处兜底「直接调用 processJob / 手工 invoke」的情形——只跳过，**不写任何字段**，
  // 绝不把老链路 job 置成 processing / failed。
  if (!isSectionAudioJob(job)) {
    logEvent(requestId, 'job_profile_not_section_audio', {
      jobId,
      transcodeProfile: readJobString(job, 'transcode_profile', 'transcodeProfile')
    })
    return { jobId, status: 'skipped', skip_reason: 'not_section_audio_profile' }
  }

  const claimed = await claimJob({ db, jobId, attemptCount, nowIso })
  if (!claimed) {
    // D-B2-2 幂等 / D-B2-1 乐观锁：已被其它实例或上一轮领走 ⇒ 不重做，直接跳过。
    logEvent(requestId, 'job_claim_conflict', { jobId })
    return { jobId, status: 'skipped', skip_reason: 'claim_conflict' }
  }

  const preconditionError = resolveJobPreconditionError({ job, envId })
  if (preconditionError) {
    // D-B2-9：缺 section_audio_id 属**永久性结构错误** ⇒ buildPermanentError 标记 permanent，
    // classifyFailure 立即终结（status=failed，不退回 queued、不空耗重试轮次），
    // 与 MISSING_SOURCE_FILE 同类处理。
    return failJob({
      db,
      jobId,
      sectionAudioId,
      failure: classifyFailure({ attempts: attemptCount, error: buildPermanentError(preconditionError) }),
      nowIso,
      requestId
    })
  }

  const deliveryPaths = buildDeliveryCloudBasePaths(job)
  const inputExtension = path.extname(readJobString(job, 'source_file_name', 'sourceFileName') || '') || '.bin'
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'liwu-meditation-transcoder-'))
  const inputPath = path.join(tmpRoot, `input${inputExtension}`)
  const opusOutputPath = path.join(tmpRoot, 'output.ogg')
  const mp3OutputPath = path.join(tmpRoot, 'output.mp3')

  // 【③ 输入体积登记（本单新增）】下载后的输入字节数：成功/失败回写与日志都带上（新键
  // `input_bytes`），使「输入对象是否被截断」一眼可判。下载前即失败时为 null ⇒ 回写不带该键。
  let inputSizeBytes = null

  try {
    // D-B2-5：二进制缺失报明确错误（永久失败，不空耗重试轮次），不得静默。
    const ffmpegPath = assertToolAvailable(resolveFfmpegPath(), 'ffmpeg')
    const ffprobePath = assertToolAvailable(resolveFfprobePath(), 'ffprobe')

    // 先读现状：① 合并去重要拿现有 transcoded_formats（D-B2-2）；② duration 已有值不动（D-B2-4）；
    // ③ 目标文档缺失时**在上传前**就失败，避免 COS 里留孤儿产物（D-B2-7 不得部分成功）。
    const currentAudio = await readDocument({
      db,
      collectionName: MEDITATION_SECTION_AUDIO_COLLECTION,
      documentId: sectionAudioId
    })
    if (!currentAudio) {
      throw buildPermanentError(`SECTION_AUDIO_NOT_FOUND：med_section_audios 文档不存在（${sectionAudioId}）`)
    }

    const sourceFileId = resolveJobSourceFileId({ job, envId })
    // ① 自管下载（临时 URL 流式写盘，等 finish ＋ fs.close；临时 URL 不可得回退 SDK）＋
    //    写完即验（体积比对 ＋ MP4 盒子链闭合 ＋ ffprobe 可解析）：不完整自动重下（上限 2 次、
    //    短退避），仍不行按类别抛错（结构仍不完整＝瞬时 INPUT_DOWNLOAD_INCOMPLETE /
    //    对象本身无法解析＝永久 INPUT_MEDIA_INVALID / 体积不匹配＝永久 INPUT_SIZE_MISMATCH）。
    const downloaded = await downloadFileWithIntegrity({
      app,
      fileId: sourceFileId,
      targetPath: inputPath,
      ffprobePath,
      jobId,
      requestId,
      label: 'source'
    })
    // ③ 输入体积登记（下载后的输入字节数）：与客户端来源字节数（med_section_audios.source_size）配对，
    //    使「对象/下载链路」还是「源文件本身」一眼可判。
    inputSizeBytes = downloaded.sizeBytes

    // R33-③：单次调用双路输出。参数在 lib/transcode-command.js，禁止在此处改写。
    const transcodeStartedAt = Date.now()
    await execFileAsync(ffmpegPath, buildDualOutputArgs({ inputPath, opusOutputPath, mp3OutputPath }), {
      maxBuffer: MAX_BUFFER_BYTES
    })
    const transcodeMs = Date.now() - transcodeStartedAt

    const opusOutputSize = assertOutputFile(opusOutputPath, 'opus(.ogg)')
    const mp3OutputSize = assertOutputFile(mp3OutputPath, 'mp3')

    // D-B2-4：时长只取**转码产物**（原件 duration=N/A，不得取原件）。
    const opusProbe = parseProbeJson((await execFileAsync(ffprobePath, buildProbeArgs(opusOutputPath), {
      maxBuffer: MAX_BUFFER_BYTES
    })).stdout)
    const mp3Probe = parseProbeJson((await execFileAsync(ffprobePath, buildProbeArgs(mp3OutputPath), {
      maxBuffer: MAX_BUFFER_BYTES
    })).stdout)
    const durationSeconds = opusProbe.duration_seconds > 0 ? opusProbe.duration_seconds : mp3Probe.duration_seconds

    // 两份产物都传成功后才回写（D-B2-7）；任一步失败则整条 job 失败，不留「半个成功」。
    const [opusFileContent, mp3FileContent] = await Promise.all([
      fs.promises.readFile(opusOutputPath),
      fs.promises.readFile(mp3OutputPath)
    ])
    const opusFileId = resolveUploadFileId({
      uploadResult: await app.uploadFile({ cloudPath: deliveryPaths.opus, fileContent: opusFileContent }),
      envId,
      cloudPath: deliveryPaths.opus
    })
    const mp3FileId = resolveUploadFileId({
      uploadResult: await app.uploadFile({ cloudPath: deliveryPaths.mp3, fileContent: mp3FileContent }),
      envId,
      cloudPath: deliveryPaths.mp3
    })
    const tempUrlMap = await resolveTempFileUrls({ app, fileIds: [opusFileId, mp3FileId] })
    const opusUrl = tempUrlMap.get(opusFileId) || ''
    const mp3Url = tempUrlMap.get(mp3FileId) || ''

    // D-B2-6：字段逐字对齐 normalizer，只写规范名。
    const wroteSectionAudio = await updateDocument({
      db,
      collectionName: MEDITATION_SECTION_AUDIO_COLLECTION,
      documentId: sectionAudioId,
      patch: {
        ...buildMedSectionAudioSuccessPatch({
          currentAudio,
          opusFileId,
          opusUrl,
          mp3FileId,
          mp3Url,
          durationSeconds
        }),
        updated_at: new Date().toISOString()
      }
    })
    if (!wroteSectionAudio) {
      throw new Error(`SECTION_AUDIO_WRITEBACK_NOT_APPLIED：回写未落到文档（${sectionAudioId}）`)
    }

    const wroteJob = await updateDocument({
      db,
      collectionName: AUDIO_TRANSCODE_JOBS_COLLECTION,
      documentId: jobId,
      patch: buildJobSuccessPatch({
        deliveryPaths,
        opusFileId,
        opusUrl,
        mp3FileId,
        mp3Url,
        durationSeconds,
        probe: opusProbe,
        inputSizeBytes,
        nowIso: new Date().toISOString()
      })
    })
    if (!wroteJob) {
      logEvent(requestId, 'job_success_patch_not_applied', { jobId })
    }

    return {
      jobId,
      section_audio_id: sectionAudioId,
      status: JOB_STATUS.succeeded,
      attempts: attemptCount,
      input_bytes: inputSizeBytes,
      duration_seconds: durationSeconds,
      transcode_ms: transcodeMs,
      opus: { cloud_path: deliveryPaths.opus, size_bytes: opusOutputSize, probe: opusProbe },
      mp3: { cloud_path: deliveryPaths.mp3, size_bytes: mp3OutputSize, probe: mp3Probe }
    }
  } catch (error) {
    // D-B2-3：单条失败只收口本条 job（attempt_count+1；>=3 置 failed），不影响整批其它 job。
    // ③ 失败也要登记输入字节数：下载已发生时由下载层挂在错误上（对象被截断的场景必须能一眼可判）。
    inputSizeBytes = resolveFailureInputBytes(inputSizeBytes, error)
    // 【本单新增】输入探测失败时一并登记容器指纹（input_container / input_head_hex）：
    //   与 input_bytes 同批入 job 文档 + 日志，无需人工比对即可分辨「上传丢字节」与「文件本身非 MP4」。
    const { inputContainer, inputHeadHex } = resolveFailureInputFingerprint(error)
    logEvent(requestId, 'job_failed', {
      jobId,
      sectionAudioId,
      attempts: attemptCount,
      input_bytes: inputSizeBytes,
      input_container: inputContainer,
      input_head_hex: inputHeadHex,
      message: error?.message || 'TRANSCODE_FAILED'
    })

    return failJob({
      db,
      jobId,
      sectionAudioId,
      failure: classifyFailure({ attempts: attemptCount, error }),
      nowIso: new Date().toISOString(),
      requestId,
      inputSizeBytes,
      inputContainer,
      inputHeadHex
    })
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
}

// ─── Track 级混音（profile = 'track_mix'）──────────────────────────────────────
// 与上面的 section_audio 链路**并列**（独立查询 / 独立领取 / 独立回写），互不调用、互不影响：
//   ① 输入：`voice_section_audio_ids`（有序 ⇒ 人声拼接顺序）＋ 背景来源（三选一）；
//   ② 处理：一次 ffmpeg 调用（人声 concat → 背景 `-stream_loop -1` 铺满 → amix 混音 → 双路输出）；
//   ③ 交付：`meditation-audio-mix/{track_key}/v{track_version}.ogg|.mp3`；
//   ④ 回写：job 状态（沿用既有 patch 形状）＋ `med_tracks.mix_audio`。

// 按 section_type 找背景时最多取几条候选（口径同 meditation-read：created_at 倒序后取“已转码的那条”）。
const TRACK_MIX_BACKGROUND_CANDIDATE_LIMIT = 5

// 失败收口：**只**写 job（track_mix 不写 med_section_audios：一条 job 对应整条 Track，
// 不是某一段音频；结构性问题也不该把 Track 文档标脏）。
const failTrackMixJob = async ({
  db,
  jobId,
  failure,
  nowIso,
  requestId,
  inputSizeBytes = null,
  inputContainer = '',
  inputHeadHex = ''
}) => {
  await updateDocument({
    db,
    collectionName: AUDIO_TRANSCODE_JOBS_COLLECTION,
    documentId: jobId,
    patch: buildJobFailurePatch({ failure, nowIso, inputSizeBytes, inputContainer, inputHeadHex })
  }).catch((error) => {
    logEvent(requestId, 'track_mix_job_failure_patch_failed', { jobId, message: error?.message || '' })
  })

  return {
    jobId,
    status: failure.job_status,
    attempts: failure.attempts,
    is_terminal: failure.is_terminal,
    error: failure.message
  }
}

// Track 文档定位：优先用 job 显式给的 `track_document_id`；否则按 `track_key` 查一条。
const readMedTrackDocument = async ({ db, job }) => {
  const explicitDocumentId = resolveTrackMixTrackDocumentId(job)
  if (explicitDocumentId) {
    return readDocument({
      db,
      collectionName: MEDITATION_TRACK_COLLECTION,
      documentId: explicitDocumentId
    })
  }

  const result = await db.collection(MEDITATION_TRACK_COLLECTION)
    .where({ track_key: resolveTrackMixTrackKey(job) })
    .limit(1)
    .get()
  assertCloudBaseResult(result, MEDITATION_TRACK_COLLECTION)

  return getDocuments(result)[0] || null
}

// 人声输入解析：**严格按 job 数组顺序**逐条取 med_section_audios.file_id（Opus 主体），不排序、不去重。
// 下列情形都是**永久错误**（重试不会变好，立即终结）：
//   · 文档不存在            → VOICE_SECTION_AUDIO_NOT_FOUND
//   · 该文档其实是背景段    → VOICE_SECTION_TYPE_INVALID（防止把背景混进人声轨）
//   · 尚未转码完成(file_id 空) → VOICE_SOURCE_NOT_READY（应先把该段跑完 section_audio 链路）
const resolveTrackMixVoiceInputs = async ({ db, job }) => {
  const sectionAudioIds = resolveTrackMixVoiceSectionAudioIds(job)
  const voiceInputs = []

  for (const sectionAudioId of sectionAudioIds) {
    const sectionAudio = await readDocument({
      db,
      collectionName: MEDITATION_SECTION_AUDIO_COLLECTION,
      documentId: sectionAudioId
    })
    if (!sectionAudio) {
      throw buildPermanentError(`VOICE_SECTION_AUDIO_NOT_FOUND：人声段文档不存在（${sectionAudioId}）`)
    }

    const sectionType = readJobString(sectionAudio, 'section_type', 'sectionType')
    if (isMeditationBackgroundSectionType(sectionType)) {
      throw buildPermanentError(`VOICE_SECTION_TYPE_INVALID：人声段列表里出现了背景段（${sectionAudioId} → ${sectionType}）`)
    }

    const fileId = readJobString(sectionAudio, 'file_id', 'fileId')
    if (!fileId) {
      throw buildPermanentError(`VOICE_SOURCE_NOT_READY：人声段尚未转码完成（${sectionAudioId} 的 file_id 为空），请先跑 section_audio 链路`)
    }

    voiceInputs.push({ section_audio_id: sectionAudioId, section_type: sectionType, file_id: fileId })
  }

  return voiceInputs
}

// 背景输入解析：三选一（优先级 file_id > section_audio_id > section_type）；
// 解析不出可下载的 file_id 一律**永久错误**（缺段/未转码属于结构性问题，重试不会变好）。
const resolveTrackMixBackgroundInput = async ({ db, job }) => {
  const backgroundFileId = resolveTrackMixBackgroundFileId(job)
  if (backgroundFileId) {
    return { source: 'background_file_id', file_id: backgroundFileId, section_audio_id: '', section_type: '' }
  }

  const backgroundSectionAudioId = resolveTrackMixBackgroundSectionAudioId(job)
  if (backgroundSectionAudioId) {
    const sectionAudio = await readDocument({
      db,
      collectionName: MEDITATION_SECTION_AUDIO_COLLECTION,
      documentId: backgroundSectionAudioId
    })
    if (!sectionAudio) {
      throw buildPermanentError(`BACKGROUND_SECTION_AUDIO_NOT_FOUND：背景段文档不存在（${backgroundSectionAudioId}）`)
    }

    const fileId = readJobString(sectionAudio, 'file_id', 'fileId')
    if (!fileId) {
      throw buildPermanentError(`BACKGROUND_SOURCE_NOT_READY：背景段尚未转码完成（${backgroundSectionAudioId} 的 file_id 为空）`)
    }

    return {
      source: 'background_section_audio_id',
      file_id: fileId,
      section_audio_id: backgroundSectionAudioId,
      section_type: readJobString(sectionAudio, 'section_type', 'sectionType')
    }
  }

  const backgroundSectionType = resolveTrackMixBackgroundSectionType(job)
  const result = assertCloudBaseResult(
    await db.collection(MEDITATION_SECTION_AUDIO_COLLECTION)
      .where({ section_type: backgroundSectionType })
      .orderBy('created_at', 'desc')
      .limit(TRACK_MIX_BACKGROUND_CANDIDATE_LIMIT)
      .get(),
    MEDITATION_SECTION_AUDIO_COLLECTION
  )
  const candidate = getDocuments(result).find((document) => readJobString(document, 'file_id', 'fileId'))

  if (!candidate) {
    throw buildPermanentError(`BACKGROUND_SOURCE_NOT_READY：背景段类型 ${backgroundSectionType} 下没有已转码（file_id 非空）的音频`)
  }

  return {
    source: 'background_section_type',
    file_id: readJobString(candidate, 'file_id', 'fileId'),
    section_audio_id: getDocumentId(candidate),
    section_type: backgroundSectionType
  }
}

// 临时输入文件扩展名：从 file_id 取（cloud:// 路径末段），取不到时用 .bin（ffmpeg 按内容探测格式）。
const resolveTrackMixInputExtension = (fileId) => path.extname(String(fileId).split('?')[0]) || '.bin'

// 秒数展示格式化（只在日志 / 警告文案里用）。
const formatTrackMixDuration = (value) => String(Math.round((Number(value) || 0) * 100) / 100)

// 可测不变量（本单口径）：**产物时长 ＝ 前导静音 ＋ Σ人声输入实测时长 ＋ Σ章间留白**
// （背景 `-stream_loop -1` 不计入）。右侧用与产物同一套实测手段（ffprobe 每个已下载的人声输入）
// 算出，供左侧产物实测值比对。前导静音＝其前所有**「有可用音频」章**的 gap 之和（job 的
// voice_leading_silence_seconds；某章无可用音频 ⇒ 不计其 gap）。
// 逐项取不到时长（历史件无头等）⇒ 返回 null ＝本次跳过该断言（**只记录、不阻断产出**）。
const resolveTrackMixExpectedDurationSeconds = async ({
  ffprobePath,
  voiceInputPaths,
  gapAfterInputSeconds,
  leadingSilenceSeconds = 0
}) => {
  try {
    const voiceSeconds = []
    for (const voicePath of voiceInputPaths) {
      const probe = parseProbeJson((await execFileAsync(ffprobePath, buildProbeArgs(voicePath), {
        maxBuffer: MAX_BUFFER_BYTES
      })).stdout)
      if (!(probe.duration_seconds > 0)) {
        return null
      }
      voiceSeconds.push(probe.duration_seconds)
    }

    const gapSeconds = (Array.isArray(gapAfterInputSeconds) ? gapAfterInputSeconds : [])
      .reduce((sum, value) => sum + (Number(value) || 0), 0)
    const leadingSeconds = Number(leadingSilenceSeconds) > 0 ? Number(leadingSilenceSeconds) : 0

    return voiceSeconds.reduce((sum, seconds) => sum + seconds, 0) + gapSeconds + leadingSeconds
  } catch {
    // 探针失败（缺头 / 二进制不可用等）⇒ 本次不做该断言：不阻断产出，由调用方记录一条跳过日志。
    return null
  }
}

// 产物**可见警告**（只在 job 文档与执行结果里标记；**不改终态**——照常产出、不截断）：
//   ① 超出软基准（900s / 15:00）⇒ 记码照常产出；
//   ② 实测时长与「前导静音 ＋ Σ人声 ＋ Σ留白」超出容差 ⇒ 记码（不变量失配，供人工核查）。
//      `expectedSeconds` 为 null（探针跳过）⇒ **不做该断言**（不得把 null 当 0 误报失配）。
const buildTrackMixWarnings = ({ durationSeconds, expectedSeconds }) => {
  const warnings = []
  const productSeconds = Number(durationSeconds) || 0
  const hasExpected = expectedSeconds !== null && expectedSeconds !== undefined
  const plannedSeconds = hasExpected ? Number(expectedSeconds) : Number.NaN

  if (productSeconds > MEDITATION_SESSION_SOFT_BASELINE_SECONDS) {
    warnings.push({
      code: TRACK_MIX_WARNING_CODES.durationOverSoftBaseline,
      message: `混音产物时长 ${formatTrackMixDuration(productSeconds)}s 超出软基准 ${MEDITATION_SESSION_SOFT_BASELINE_SECONDS}s：已照常产出、未做任何截断，请核对章节时长与章间留白配置`
    })
  }

  if (Number.isFinite(plannedSeconds)
    && Math.abs(productSeconds - plannedSeconds) > TRACK_MIX_DURATION_TOLERANCE_SECONDS) {
    warnings.push({
      code: TRACK_MIX_WARNING_CODES.durationMismatch,
      message: `混音产物时长 ${formatTrackMixDuration(productSeconds)}s 与「前导静音 ＋ 人声之和 ＋ 章间留白」${formatTrackMixDuration(plannedSeconds)}s 不一致（容差 ${TRACK_MIX_DURATION_TOLERANCE_SECONDS}s）`
    })
  }

  return warnings
}

const processTrackMixJob = async ({ app, db, envId, job, requestId }) => {
  const jobId = readJobIdentifier(job)
  const trackKey = resolveTrackMixTrackKey(job)
  const trackVersion = resolveTrackMixTrackVersion(job)
  const nowIso = new Date().toISOString()
  const attemptCount = readJobAttemptCount(job) + 1

  // 纵深防御（与 processJob 同构）：正常路径已在 fetchQueuedTrackMixJobs 的**查询条件**里按 profile 过滤；
  // 手工 invoke / 直接调用时兜底——只跳过、**不写任何字段**。
  if (!isTrackMixJob(job)) {
    logEvent(requestId, 'job_profile_not_track_mix', {
      jobId,
      transcodeProfile: readJobString(job, 'transcode_profile', 'transcodeProfile')
    })
    return { jobId, status: 'skipped', skip_reason: 'not_track_mix_profile' }
  }

  const claimed = await claimTrackMixJob({ db, jobId, attemptCount, nowIso })
  if (!claimed) {
    logEvent(requestId, 'track_mix_job_claim_conflict', { jobId })
    return { jobId, status: 'skipped', skip_reason: 'claim_conflict' }
  }

  const preconditionError = resolveTrackMixJobPreconditionError(job)
  if (preconditionError) {
    // 缺必需字段＝永久性结构错误 ⇒ buildPermanentError 标记 permanent，classifyFailure 立即终结
    // （status='failed'，不退回 queued、不空耗 3 轮重试），与 section_audio 的 MISSING_* 同类处理。
    return failTrackMixJob({
      db,
      jobId,
      failure: classifyFailure({ attempts: attemptCount, error: buildPermanentError(preconditionError) }),
      nowIso,
      requestId
    })
  }

  const deliveryPaths = buildTrackMixDeliveryCloudBasePaths(job)
  const tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'liwu-track-mix-'))
  const opusOutputPath = path.join(tmpRoot, 'output.ogg')
  const mp3OutputPath = path.join(tmpRoot, 'output.mp3')

  // ③ 输入体积登记（下载输入字节数累计；人声各段 ＋ 背景）：失败时若尚未下载任何输入则为 null ⇒ 不回写该键。
  let inputSizeBytes = null

  try {
    // D-B2-5：二进制缺失报明确错误（永久失败，不空耗重试轮次），不得静默。
    const ffmpegPath = assertToolAvailable(resolveFfmpegPath(), 'ffmpeg')
    const ffprobePath = assertToolAvailable(resolveFfprobePath(), 'ffprobe')

    // 目标 Track 文档必须存在（上传前就失败 ⇒ COS 里不留孤儿产物，与 section_audio 同口径）。
    const trackDocument = await readMedTrackDocument({ db, job })
    if (!trackDocument) {
      throw buildPermanentError(`TRACK_NOT_FOUND：med_tracks 中不存在 track_key=${trackKey} 的文档（且 job 未给可用的 track_document_id）`)
    }

    const voiceInputs = await resolveTrackMixVoiceInputs({ db, job })
    const backgroundInput = await resolveTrackMixBackgroundInput({ db, job })
    const volumes = resolveTrackMixVolumes(job)
    // 章间留白计划（job 契约要求必给，precondition 已校验存在且与人声数组等长）。
    const gapAfterInputSeconds = resolveTrackMixVoiceSectionGapAfterSeconds(job) || []
    // 前导静音（本单口径）：第一个（人声）段之前、其前所有**「有可用音频」章**的 gap 之和
    // （某章无可用音频 ⇒ 不计其 gap；precondition 已校验合法）。
    const leadingSilenceSeconds = resolveTrackMixVoiceLeadingSilenceSeconds(job) || 0

    // ① 每个输入（人声各段 ＋ 背景）同样走自管下载＋写完即验：体积比对 ＋ MP4 盒子链闭合 ＋
    //    ffprobe 可解析；不完整自动重下（上限 2 次、短退避），仍不行按类别抛错
    //    （结构仍不完整＝瞬时 / 对象本身无法解析或体积不匹配＝永久）。
    const voiceInputPaths = []
    for (const [index, voiceInput] of voiceInputs.entries()) {
      const voicePath = path.join(tmpRoot, `voice-${index}${resolveTrackMixInputExtension(voiceInput.file_id)}`)
      const downloadedVoice = await downloadFileWithIntegrity({
        app,
        fileId: voiceInput.file_id,
        targetPath: voicePath,
        ffprobePath,
        jobId,
        requestId,
        label: `voice-${index}`
      })
      inputSizeBytes = (inputSizeBytes || 0) + downloadedVoice.sizeBytes
      voiceInputPaths.push(voicePath)
    }

    const backgroundInputPath = path.join(tmpRoot, `background${resolveTrackMixInputExtension(backgroundInput.file_id)}`)
    const downloadedBackground = await downloadFileWithIntegrity({
      app,
      fileId: backgroundInput.file_id,
      targetPath: backgroundInputPath,
      ffprobePath,
      jobId,
      requestId,
      label: 'background'
    })
    inputSizeBytes = (inputSizeBytes || 0) + downloadedBackground.sizeBytes

    // 单次调用：人声按序拼接（含同段多次 take）＋ 前导静音 ＋ 章间留白静音 ＋ 背景循环铺满 ＋ amix 混音 ＋ 双路输出。
    // 参数在 lib/track-mix-command.js，禁止在此改写。
    const mixStartedAt = Date.now()
    await execFileAsync(ffmpegPath, buildTrackMixArgs({
      voiceInputPaths,
      backgroundInputPath,
      voiceVolume: volumes.voice,
      backgroundVolume: volumes.background,
      gapAfterInputSeconds,
      leadingSilenceSeconds,
      opusOutputPath,
      mp3OutputPath
    }), { maxBuffer: MAX_BUFFER_BYTES })
    const mixMs = Date.now() - mixStartedAt

    const opusOutputSize = assertOutputFile(opusOutputPath, 'opus(.ogg)')
    const mp3OutputSize = assertOutputFile(mp3OutputPath, 'mp3')

    // 时长只取**产物**实测值（D-B2-4 口径）。本单口径：总长 ＝ Σ人声（含各段全部 take）＋ Σ章间留白，
    // 背景 `-stream_loop -1` 铺满整条（含留白期）但**不计入**总长；超出软基准也**照常产出、不截断**。
    const opusProbe = parseProbeJson((await execFileAsync(ffprobePath, buildProbeArgs(opusOutputPath), {
      maxBuffer: MAX_BUFFER_BYTES
    })).stdout)
    const mp3Probe = parseProbeJson((await execFileAsync(ffprobePath, buildProbeArgs(mp3OutputPath), {
      maxBuffer: MAX_BUFFER_BYTES
    })).stdout)
    const durationSeconds = opusProbe.duration_seconds > 0 ? opusProbe.duration_seconds : mp3Probe.duration_seconds

    // 可测不变量（产物时长 ＝ 前导静音 ＋ Σ人声 ＋ Σ留白）＋ 软基准超限：都只落**可见警告**，不改 job 终态。
    const expectedDurationSeconds = await resolveTrackMixExpectedDurationSeconds({
      ffprobePath,
      voiceInputPaths,
      gapAfterInputSeconds,
      leadingSilenceSeconds
    })
    if (expectedDurationSeconds === null) {
      logEvent(requestId, 'track_mix_duration_invariant_skipped', {
        jobId,
        voice_section_count: voiceInputs.length
      })
    }
    const warnings = buildTrackMixWarnings({ durationSeconds, expectedSeconds: expectedDurationSeconds })
    if (warnings.length > 0) {
      logEvent(requestId, 'track_mix_product_warnings', { jobId, warnings })
    }

    // 两份产物都传成功后才回写（不留「半个成功」）。
    const [opusFileContent, mp3FileContent] = await Promise.all([
      fs.promises.readFile(opusOutputPath),
      fs.promises.readFile(mp3OutputPath)
    ])
    const opusFileId = resolveUploadFileId({
      uploadResult: await app.uploadFile({ cloudPath: deliveryPaths.opus, fileContent: opusFileContent }),
      envId,
      cloudPath: deliveryPaths.opus
    })
    const mp3FileId = resolveUploadFileId({
      uploadResult: await app.uploadFile({ cloudPath: deliveryPaths.mp3, fileContent: mp3FileContent }),
      envId,
      cloudPath: deliveryPaths.mp3
    })
    const tempUrlMap = await resolveTempFileUrls({ app, fileIds: [opusFileId, mp3FileId] })
    const opusUrl = tempUrlMap.get(opusFileId) || ''
    const mp3Url = tempUrlMap.get(mp3FileId) || ''

    // med_tracks.mix_audio：整体覆盖 4 个约定字段（幂等）；file_id 不下发端侧（D6 白名单管）。
    const wroteTrack = await updateDocument({
      db,
      collectionName: MEDITATION_TRACK_COLLECTION,
      documentId: getDocumentId(trackDocument) || resolveTrackMixTrackDocumentId(job),
      patch: {
        ...buildMedTrackMixAudioPatch({
          trackVersion,
          durationSeconds,
          opusFileId,
          mp3FileId
        }),
        updated_at: new Date().toISOString()
      }
    })
    if (!wroteTrack) {
      throw new Error(`TRACK_MIX_WRITEBACK_NOT_APPLIED：mix_audio 未落到 med_tracks 文档（track_key=${trackKey}）`)
    }

    const wroteJob = await updateDocument({
      db,
      collectionName: AUDIO_TRANSCODE_JOBS_COLLECTION,
      documentId: jobId,
      patch: buildJobSuccessPatch({
        deliveryPaths,
        opusFileId,
        opusUrl,
        mp3FileId,
        mp3Url,
        durationSeconds,
        probe: opusProbe,
        warnings,
        warningMessage: warnings.map((warning) => `${warning.code}：${warning.message}`).join('；'),
        inputSizeBytes,
        nowIso: new Date().toISOString()
      })
    })
    if (!wroteJob) {
      logEvent(requestId, 'track_mix_job_success_patch_not_applied', { jobId })
    }

    return {
      jobId,
      track_key: trackKey,
      track_version: trackVersion,
      status: JOB_STATUS.succeeded,
      attempts: attemptCount,
      voice_section_count: voiceInputs.length,
      gap_after_input_seconds: gapAfterInputSeconds,
      leading_silence_seconds: leadingSilenceSeconds,
      expected_duration_seconds: expectedDurationSeconds,
      soft_baseline_seconds: MEDITATION_SESSION_SOFT_BASELINE_SECONDS,
      input_bytes: inputSizeBytes,
      warnings,
      background_source: backgroundInput.source,
      volumes,
      duration_seconds: durationSeconds,
      mix_ms: mixMs,
      opus: { cloud_path: deliveryPaths.opus, size_bytes: opusOutputSize, probe: opusProbe },
      mp3: { cloud_path: deliveryPaths.mp3, size_bytes: mp3OutputSize, probe: mp3Probe }
    }
  } catch (error) {
    // 单条失败只收口本条 job（attempt_count+1；>=3 置 failed），不影响整批其它 job（D-B2-3）。
    // ③ 失败也要登记输入字节数（已下载部分之和 / 下载层挂在错误上的最后一次字节数）。
    inputSizeBytes = resolveFailureInputBytes(inputSizeBytes, error)
    // 【本单新增】输入探测失败时一并登记容器指纹（与 section_audio 同一套逻辑；无指纹则不写该键）。
    const { inputContainer, inputHeadHex } = resolveFailureInputFingerprint(error)
    logEvent(requestId, 'track_mix_job_failed', {
      jobId,
      trackKey,
      attempts: attemptCount,
      input_bytes: inputSizeBytes,
      input_container: inputContainer,
      input_head_hex: inputHeadHex,
      message: error?.message || 'TRACK_MIX_FAILED'
    })

    return failTrackMixJob({
      db,
      jobId,
      failure: classifyFailure({ attempts: attemptCount, error }),
      nowIso: new Date().toISOString(),
      requestId,
      inputSizeBytes,
      inputContainer,
      inputHeadHex
    })
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
}

// D-B2-9 同型分区（filter 进查询，不是先领后筛）：
//   只领 `transcode_profile === 'track_mix'` 的 queued job；section_audio / 老 profile 一律不碰。
const fetchQueuedTrackMixJobs = async ({ db, limit }) => {
  const result = await db.collection(AUDIO_TRANSCODE_JOBS_COLLECTION)
    .where({
      status: JOB_STATUS.queued,
      transcode_profile: TRACK_MIX_TRANSCODE_PROFILE
    })
    .limit(limit)
    .get()
  assertCloudBaseResult(result, AUDIO_TRANSCODE_JOBS_COLLECTION)

  return getDocuments(result)
}

// 乐观锁领取（where 条件**必须**带 transcode_profile ⇒ 只有 track_mix 的 job 领得走）。
const claimTrackMixJob = async ({ db, jobId, attemptCount, nowIso }) => {
  const result = assertCloudBaseResult(
    await db.collection(AUDIO_TRANSCODE_JOBS_COLLECTION)
      .where({
        _id: jobId,
        status: JOB_STATUS.queued,
        transcode_profile: TRACK_MIX_TRANSCODE_PROFILE
      })
      .update(buildClaimPatch({ attemptCount, nowIso })),
    AUDIO_TRANSCODE_JOBS_COLLECTION
  )

  return Number(result?.updated || 0) > 0
}

const runBatch = async ({ app, db, envId, limit, requestId }) => {
  const jobs = await fetchQueuedJobs({ db, limit })
  const results = []

  for (const job of jobs) {
    const jobId = readJobIdentifier(job)

    // ② 瞬时类退避：未到 `next_attempt_at` 的 job 本轮只读跳过（不领取、不写任何字段）。
    if (isJobDeferred(job, Date.now())) {
      results.push({ jobId, status: 'skipped', skip_reason: 'deferred_backoff' })
      continue
    }

    const skipReason = resolveJobSkipReason(job)

    if (skipReason) {
      results.push({ jobId, status: 'skipped', skip_reason: skipReason })
      continue
    }

    try {
      results.push(await processJob({ app, db, envId, job, requestId }))
    } catch (error) {
      // 领取/前置校验阶段之外的意外错误也必须收口到本条，不得中断整批（D-B2-3）。
      logEvent(requestId, 'job_unhandled_error', { jobId, message: error?.message || '' })
      results.push({ jobId, status: JOB_STATUS.failed, error: error?.message || 'UNHANDLED_TRANSCODE_ERROR' })
    }
  }

  // 【本单新增】Track 级混音分区（profile = 'track_mix'）：**独立查询**、独立串行消费，
  // 与上面的 section_audio 循环零交叉（各自 limit 计数，互不占用对方的名额）。
  // 分区纪律：过滤进查询 ⇒ 本循环只可能拿到 track_mix 的 job；缺必需字段即永久失败（一次即终结）。
  const trackMixJobs = await fetchQueuedTrackMixJobs({ db, limit })

  for (const job of trackMixJobs) {
    const jobId = readJobIdentifier(job)

    // ② 瞬时类退避：未到 `next_attempt_at` 的 job 本轮只读跳过（不领取、不写任何字段）。
    if (isJobDeferred(job, Date.now())) {
      results.push({ jobId, status: 'skipped', skip_reason: 'deferred_backoff' })
      continue
    }

    const skipReason = resolveTrackMixJobSkipReason(job)

    if (skipReason) {
      results.push({ jobId, status: 'skipped', skip_reason: skipReason })
      continue
    }

    try {
      results.push(await processTrackMixJob({ app, db, envId, job, requestId }))
    } catch (error) {
      logEvent(requestId, 'track_mix_job_unhandled_error', { jobId, message: error?.message || '' })
      results.push({ jobId, status: JOB_STATUS.failed, error: error?.message || 'UNHANDLED_TRACK_MIX_ERROR' })
    }
  }

  // `claimed` 语义**不变**（仍＝ section_audio 分区本轮领取条数）；track_mix 分区另计一个字段。
  return { envId, claimed: jobs.length, track_mix_claimed: trackMixJobs.length, results }
}

const resolveBatchLimit = (rawLimit) => {
  const parsed = Number(rawLimit)

  if (!Number.isFinite(parsed) || parsed < 1) {
    return MAX_JOBS_PER_RUN
  }

  return Math.min(Math.floor(parsed), MAX_JOBS_PER_RUN)
}

exports.main = async (event = {}) => {
  const requestId = buildRequestId()
  const startedAt = Date.now()
  const envId = resolveEnvId()
  const limit = resolveBatchLimit(event?.limit)

  try {
    const app = getCloudBaseApp(envId)
    const db = app.database()

    // 路径/环境信息可入日志；密钥**一律不打印**。
    logEvent(requestId, 'started', {
      envId,
      limit,
      ffmpegPath: resolveFfmpegPath(),
      withSecret: Boolean(readEnvValue('TENCENT_SECRET_ID', 'TENCENTCLOUD_SECRET_ID', 'VITE_TENCENT_SECRET_ID'))
    })

    const result = await runBatch({ app, db, envId, limit, requestId })

    logEvent(requestId, 'completed', {
      durationMs: Date.now() - startedAt,
      claimed: result.claimed,
      trackMixClaimed: result.track_mix_claimed,
      results: result.results
    })

    return { requestId, durationMs: Date.now() - startedAt, ...result }
  } catch (error) {
    logEvent(requestId, 'failed', {
      durationMs: Date.now() - startedAt,
      message: error?.message || 'Unknown error',
      stack: error?.stack || ''
    })
    throw error
  }
}

// 本地自测/QA 用：暴露内部函数以便用桩对象驱动**真实执行路径**（SCF 只会调用 exports.main，
// 额外导出无副作用）。自测脚本：
// /Users/kevin/.hermes/profiles/zang/cache/scratch/kong-b2-transcoder/selftest.mjs
// Track 级混音（profile = 'track_mix'）自测脚本：
// /Users/kevin/.hermes/profiles/zang/cache/scratch/kong-track-mix/selftest.cjs（桩 db / 桩 app 驱动真实 runBatch）
exports.__test__ = {
  processJob,
  runBatch,
  claimJob,
  fetchQueuedJobs,
  readDocument,
  updateDocument,
  // 【本单新增】输入完整性防护：ffprobe 探测 ＋ 下载后完整性校验（供样本自测直接驱动真实分支）
  assertInputProbeable,
  downloadFileWithIntegrity,
  // 【本单改造】自管下载 ＋ 对象元数据（临时 URL ＋ 体积），供自测驱动真实下载/回退分支
  downloadObjectViaTempUrl,
  resolveRemoteObjectMeta,
  resolveRemoteObjectSizeBytes,
  // 【本单新增】输入容器指纹：失败收口时把错误上挂载的 input_container / input_head_hex 取出
  resolveFailureInputFingerprint,
  // Track 级混音分区（本单新增）——与上面 section_audio 的导出并列，互不调用
  processTrackMixJob,
  fetchQueuedTrackMixJobs,
  claimTrackMixJob,
  readMedTrackDocument,
  resolveTrackMixVoiceInputs,
  resolveTrackMixBackgroundInput,
  resolveTrackMixExpectedDurationSeconds,
  buildTrackMixWarnings,
  failTrackMixJob
}
