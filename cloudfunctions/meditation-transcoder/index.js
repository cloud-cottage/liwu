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
// 【响度归一（loudnorm）**未**在本链路实现】——老 worker 的做法、以及沿用需要什么，见 README
//   「响度归一（待 Zang 拍板）」一节；本条**不由实现者自裁**，故本链路严格照抄既定参数，不加任何 -af。
//
// 【时长】D-B2-4：**不得对原始上传件取时长**（实测 duration=N/A），只取转码产物 ffprobe 值，
//   且仅在 med_section_audios.duration 为空/0 时补写。
//
// 【部署】见同目录 README.md（含 ffmpeg 层 / 自建静态构建两种取法与实地校验命令）。

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
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

const {
  AUDIO_TRANSCODE_JOBS_COLLECTION,
  JOB_STATUS,
  MAX_JOBS_PER_RUN,
  SECTION_AUDIO_TRANSCODE_PROFILE,
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
  buildPermanentError
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

// 失败收口：写 job（重试或终结）+ 尽最大努力写 med_section_audios 状态（写失败不得吞掉主错误）。
const failJob = async ({ db, jobId, sectionAudioId, failure, nowIso, requestId }) => {
  await updateDocument({
    db,
    collectionName: AUDIO_TRANSCODE_JOBS_COLLECTION,
    documentId: jobId,
    patch: buildJobFailurePatch({ failure, nowIso })
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
    await app.downloadFile({ fileID: sourceFileId, tempFilePath: inputPath })

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
      duration_seconds: durationSeconds,
      transcode_ms: transcodeMs,
      opus: { cloud_path: deliveryPaths.opus, size_bytes: opusOutputSize, probe: opusProbe },
      mp3: { cloud_path: deliveryPaths.mp3, size_bytes: mp3OutputSize, probe: mp3Probe }
    }
  } catch (error) {
    // D-B2-3：单条失败只收口本条 job（attempt_count+1；>=3 置 failed），不影响整批其它 job。
    logEvent(requestId, 'job_failed', {
      jobId,
      sectionAudioId,
      attempts: attemptCount,
      message: error?.message || 'TRANSCODE_FAILED'
    })

    return failJob({
      db,
      jobId,
      sectionAudioId,
      failure: classifyFailure({ attempts: attemptCount, error }),
      nowIso: new Date().toISOString(),
      requestId
    })
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
  }
}

const runBatch = async ({ app, db, envId, limit, requestId }) => {
  const jobs = await fetchQueuedJobs({ db, limit })
  const results = []

  for (const job of jobs) {
    const jobId = readJobIdentifier(job)
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

  return { envId, claimed: jobs.length, results }
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
exports.__test__ = { processJob, runBatch, claimJob, fetchQueuedJobs, readDocument, updateDocument }
