// ─── meditation-read：冥想只读云函数（腾讯云函数 SCF；D6 / X14，第二批第 ② 项） ──
//
// 【规范依据】docs/meditation.admin.partner.spec.md（v4.6，唯一依据）：
//   · §5 / §7（**D6**；R30 升为**第二批硬前置**）：端侧读 `med_tracks` / `med_section_audios`
//     **必须经本云函数**——据 R28-①「`med_*` 仅创建者可读写」，端侧身份直连 DB 只会得到**静默空集**。
//     `med_*` 集合对匿名**保持关闭**（不开放匿名直读、不做白名单），本函数用 SCF 内置凭证读取。
//   · §5（**D9**）：端侧「读 Track 配置 + 按 `section_type` 从候选池抽一条 + 按固定顺序拼接」，
//     抽中固化归端侧会话记录（**D7**）⇒ 本函数只返回**分组的候选池**，不抽签、不写会话记录。
//   · 「交付格式与 C 端兜底策略」（**D3**）＋ 附录 C / C6：同一 take 交付**双格式**
//     （Opus 主体 + mp3 兜底）⇒ **只有 `transcoded_formats` 同时含 opus 与 mp3 才可下发**；
//     只有 `['opus']` / 转码中 / 转码失败的音频**一律不下发**。
//   · 附录 C / **C11** ＋ 质检计划 §8.1 / **X14**：`audio_url` 是 **2 小时临时 URL**
//     （`getTempFileURL` `maxAge = 7200`）⇒ **本函数承担 `file_id` → 临时 URL 的重新签发**；
//     **不得透传已落库的（可能已过期的）`audio_url`**，端侧不缓存过期 URL（长期标识只有 `file_id`）。
//   · R10：章序 / 章内 Section 序列**只读** ⇒ 返回的 Track 一律折回六章固定模板（normalizers 副本）。
//   · D8：音频**唯一口径**是 `med_section_audios`（绝不从 `med_section_raws` 读 `file_id` / `audio_url`）。
//
// 【只读（硬）】本函数**没有任何写路径**——不 `update` / 不 `add` / 不 `remove` / 不 `set` 任何集合；
//   唯一的对外调用是 `getTempFileURL`（签发临时链接）。自测脚本会断言「零写调用」与「源码无写动词」。
//
// 【不得引仓库内共享模块】SCF 只打包函数目录（Zang 裁定 D-B2-8）⇒ `lib/*.js` 是权威源的
//   **精简等价副本**，各自文件头注明权威源与同步责任。
//
// 【凭据】优先用 SCF 角色**内置凭证**；环境变量回退链与 `scripts/audio-transcode-worker.mjs`、
//   `cloudfunctions/meditation-transcoder` 完全一致（便于本地手动 invoke）。**密钥一律不打印**，
//   只记录「是否提供了密钥」的布尔值；本文件不硬编码任何密钥。
//
// 【集合状态】**`med_tracks` 已创建**（2026-09-24 实测可写；规范附录 C / **C7 已关闭**）⇒ 集合创建
//   **不再是阻塞项**。本地无真实联调环境时（集合暂无 Track 文档），Track 类请求可能返回
//   `TRACK_NOT_FOUND`（空集，见 `ERROR_CODES.trackNotFound` 分支）。
//
// 【入参 / 出参】见同目录 README.md。非法 / 缺失参数一律返回结构化错误
//   `{ ok:false, error:'<CODE>', message }`：**不抛未捕获异常**、**不返回部分数据当成功**。
//
// 【部署】函数条目登记在仓库根 `cloudbaserc.json`；`cloudfunctions/README.md` 有部署命令。

const tcb = require('@cloudbase/node-sdk')

const {
  MEDITATION_SECTION_AUDIO_COLLECTION
} = require('./lib/meditation-formats.js')

const {
  MEDITATION_TRACK_COLLECTION,
  MEDITATION_TRACK_DEFAULT_KEY,
  normalizeMedTrack
} = require('./lib/meditation-track-normalizers.js')

const {
  ERROR_CODES,
  ACTIONS,
  MAX_CANDIDATES_PER_SECTION_TYPE,
  MAX_QUERY_PER_SECTION_TYPE,
  MAX_TRACKS_PER_REQUEST,
  TEMP_URL_MAX_AGE_SECONDS,
  getString,
  buildError,
  resolveAction,
  readOptionalIdentifier,
  resolveRequestedSectionTypes,
  resolveTrackSectionTypes,
  resolveTrackQueryPlan,
  buildSectionAudioPools,
  collectSignableFileIds,
  buildTrackEntry,
  buildChapterTemplate,
  buildUrlPolicy
} = require('./lib/read-contract.js')

// 与 cloudbaserc.json 的 envId、scripts/audio-transcode-worker.mjs 一致；仅作兜底，优先取运行环境变量。
const DEFAULT_ENV_ID = 'liwu-d8gek6jjdab1d087c'

const SCOPE = 'cloudbase-meditation-read'

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

// 云函数内优先用 SCF 角色**内置凭证**（无需密钥）；环境变量回退链命名与既有 worker / 执行器一致。
// ⚠ 任何情况下不打印密钥，只记录「是否提供了密钥」。
const getCloudBaseApp = (envId) => {
  const secretId = readEnvValue('TENCENT_SECRET_ID', 'TENCENTCLOUD_SECRET_ID', 'VITE_TENCENT_SECRET_ID')
  const secretKey = readEnvValue('TENCENT_SECRET_KEY', 'TENCENTCLOUD_SECRET_KEY', 'VITE_TENCENT_SECRET_KEY')

  return secretId && secretKey
    ? tcb.init({ env: envId, secretId, secretKey })
    : tcb.init({ env: envId })
}

const buildRequestId = () => `mrd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

const logEvent = (requestId, stage, details = {}) => {
  console.log(JSON.stringify({ scope: SCOPE, requestId, stage, ...details }))
}

// 口径同 apps/web/src/admin/services/database.js 的 assertCloudBaseWriteResult（R7）：
// CloudBase SDK 在「集合不存在 / 权限被拒」等错误时以 **resolve** 返回 `{ code, message }` 而不是 reject，
// 只 try/catch 会把失败读成成功（空集）⇒ 只读路径同样必须显式校验返回体，
// **不得以「未报错」作为「读到了」的证据**。
const assertCloudBaseResult = (result, label) => {
  if (result && typeof result === 'object' && !Array.isArray(result) && result.code && result.message) {
    throw new Error(`${label} 读取失败：${result.message}（${result.code}）`)
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

// ─── 读取（**只读**：仅 collection().where()/doc().get()） ────────────────────

const readTrackByPlanStep = async ({ db, step }) => {
  const collection = db.collection(MEDITATION_TRACK_COLLECTION)

  if (step.kind === 'id') {
    const result = assertCloudBaseResult(await collection.doc(step.value).get(), MEDITATION_TRACK_COLLECTION)
    return getDocuments(result)[0] || null
  }

  const where = step.kind === 'default' ? { is_default: true } : { track_key: step.value }
  const result = assertCloudBaseResult(
    await collection.where(where).limit(1).get(),
    MEDITATION_TRACK_COLLECTION
  )

  return getDocuments(result)[0] || null
}

const fetchTracks = async ({ db, limit = MAX_TRACKS_PER_REQUEST }) => {
  const result = assertCloudBaseResult(
    await db.collection(MEDITATION_TRACK_COLLECTION)
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .get(),
    MEDITATION_TRACK_COLLECTION
  )

  return getDocuments(result)
}

// 候选池：按 `section_type` 单查（规范索引建议 `section_type + created_at`），
// `created_at` 降序取前 MAX_QUERY_PER_SECTION_TYPE 条，再在内存中过滤「可交付」并截断。
// 任一 section_type 查询失败 ⇒ **整单失败**（不返回部分数据当成功）。
const fetchSectionAudioCandidates = async ({ db, sectionTypes = [] }) => {
  const perTypeResults = await Promise.all(sectionTypes.map(async (sectionType) => {
    const result = assertCloudBaseResult(
      await db.collection(MEDITATION_SECTION_AUDIO_COLLECTION)
        .where({ section_type: sectionType })
        .orderBy('created_at', 'desc')
        .limit(MAX_QUERY_PER_SECTION_TYPE)
        .get(),
      MEDITATION_SECTION_AUDIO_COLLECTION
    )

    return getDocuments(result).map((doc) => ({
      ...doc,
      section_type: getString(doc?.section_type).trim() || sectionType
    }))
  }))

  return perTypeResults.flat()
}

// ─── 临时链接签发（**唯一的对外调用**；maxAge 与规范 C11 的 7200s 一致） ──────

const signFileUrls = async ({ app, fileIds = [], requestId = '' }) => {
  const normalizedFileIds = [...new Set((Array.isArray(fileIds) ? fileIds : []).map(getString).filter(Boolean))]

  if (normalizedFileIds.length === 0) {
    return new Map()
  }

  const result = await app.getTempFileURL({
    fileList: normalizedFileIds.map((fileID) => ({ fileID, maxAge: TEMP_URL_MAX_AGE_SECONDS }))
  })
  const fileList = result?.fileList || result?.data?.fileList || []

  if (!Array.isArray(fileList)) {
    throw new Error('TEMP_FILE_URL_INVALID_RESULT：getTempFileURL 未返回 fileList')
  }

  const urlMap = new Map(fileList.map((item) => [
    getString(item?.fileID || item?.fileId).trim(),
    getString(item?.tempFileURL || item?.download_url || item?.downloadUrl).trim()
  ]))

  // 「一个都没签出来」视为签发整体失败 ⇒ 整单报错（不得返回空池当成功）。
  const signedCount = normalizedFileIds.filter((fileId) => urlMap.get(fileId)).length
  if (signedCount === 0) {
    logEvent(requestId, 'temp_url_sign_failed', { requested: normalizedFileIds.length })
    throw new Error('TEMP_FILE_URL_SIGN_FAILED：全部临时链接签发失败')
  }

  logEvent(requestId, 'temp_url_signed', {
    requested: normalizedFileIds.length,
    signed: signedCount,
    maxAge: TEMP_URL_MAX_AGE_SECONDS
  })

  return urlMap
}

// ─── action 实现 ─────────────────────────────────────────────────────────────

const loadDeliverableAudioPools = async ({ db, app, sectionTypes, requestId }) => {
  const candidates = await fetchSectionAudioCandidates({ db, sectionTypes })
  const signableFileIds = collectSignableFileIds(candidates)
  const urlMap = await signFileUrls({ app, fileIds: signableFileIds, requestId })
  const { pools, stats } = buildSectionAudioPools({
    requestedSectionTypes: sectionTypes,
    candidates,
    urls: urlMap
  })

  return {
    pools,
    stats: {
      ...stats,
      requested_section_types: [...sectionTypes],
      queried_section_audio_count: candidates.length,
      signed_file_count: urlMap.size,
      max_candidates_per_section_type: MAX_CANDIDATES_PER_SECTION_TYPE,
      max_query_per_section_type: MAX_QUERY_PER_SECTION_TYPE
    }
  }
}

const resolveTrackForRead = async ({ db, event }) => {
  const trackIdResult = readOptionalIdentifier(event, 'track_id')
  if (!trackIdResult.ok) {
    return { ok: false, error: trackIdResult.error }
  }

  const trackKeyResult = readOptionalIdentifier(event, 'track_key')
  if (!trackKeyResult.ok) {
    return { ok: false, error: trackKeyResult.error }
  }

  const plan = resolveTrackQueryPlan({
    trackId: trackIdResult.value,
    trackKey: trackKeyResult.value,
    defaultKey: MEDITATION_TRACK_DEFAULT_KEY
  })

  for (const step of plan) {
    const trackDoc = await readTrackByPlanStep({ db, step })
    if (trackDoc) {
      return { ok: true, track: normalizeMedTrack(trackDoc) }
    }
  }

  return { ok: false, error: null }
}

const handleGetTrack = async ({ app, db, event, requestId }) => {
  const trackResult = await resolveTrackForRead({ db, event })

  if (!trackResult.ok) {
    if (trackResult.error) {
      return trackResult.error
    }

    return buildError(
      ERROR_CODES.trackNotFound,
      '未找到可用 Track（既无 is_default 也无 track-default）',
      { track_key: getString(event?.track_key), track_id: getString(event?.track_id) }
    )
  }

  const track = trackResult.track

  // 未启用的 Track 不下发（`enabled` 即「是否对外可用」的唯一判断依据字段，规范 §med_tracks）。
  if (track.enabled === false) {
    return buildError(ERROR_CODES.trackDisabled, `Track 未启用，不下发：${track.track_key}`, {
      track_key: track.track_key,
      track_id: track._id
    })
  }

  // 只下发该 Track **启用章**覆盖的 section_type（禁用章不取音频）。
  const sectionTypes = resolveTrackSectionTypes(track)
  const { pools, stats } = await loadDeliverableAudioPools({ db, app, sectionTypes, requestId })

  return {
    ok: true,
    data: {
      track: buildTrackEntry(track),
      chapter_template: buildChapterTemplate(),
      section_audio_pools: pools,
      url_policy: buildUrlPolicy({ issuedAtMs: Date.now() }),
      stats: {
        ...stats,
        track_version: track.version
      }
    }
  }
}

const handleGetSectionAudios = async ({ app, db, event, requestId }) => {
  const sectionTypesResult = resolveRequestedSectionTypes(event, { required: true })
  if (!sectionTypesResult.ok) {
    return sectionTypesResult.error
  }

  const sectionTypes = sectionTypesResult.value
  const { pools, stats } = await loadDeliverableAudioPools({ db, app, sectionTypes, requestId })

  return {
    ok: true,
    data: {
      chapter_template: buildChapterTemplate(),
      section_audio_pools: pools,
      url_policy: buildUrlPolicy({ issuedAtMs: Date.now() }),
      stats
    }
  }
}

const handleListTracks = async ({ db }) => {
  const trackDocs = await fetchTracks({ db })
  const tracks = trackDocs.map(normalizeMedTrack)
  const enabledTracks = tracks.filter((track) => track.enabled !== false)

  return {
    ok: true,
    data: {
      tracks: enabledTracks.map(buildTrackEntry),
      chapter_template: buildChapterTemplate(),
      stats: {
        track_count: enabledTracks.length,
        excluded_disabled_count: tracks.length - enabledTracks.length
      }
    }
  }
}

const ACTION_HANDLERS = Object.freeze({
  [ACTIONS.getTrack]: handleGetTrack,
  [ACTIONS.getSectionAudios]: handleGetSectionAudios,
  [ACTIONS.listTracks]: handleListTracks
})

exports.main = async (event = {}) => {
  const requestId = buildRequestId()
  const startedAt = Date.now()

  // ① 入参必须是对象（字符串 / 数组 / null 一律结构化报错）。
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return buildError(ERROR_CODES.invalidEvent, '入参必须是对象', {
      received_type: Array.isArray(event) ? 'array' : typeof event
    })
  }

  // ② action 校验（缺省 = getTrack；非法值 / 非字符串一律报错）。
  const actionResult = resolveAction(event)
  if (!actionResult.ok) {
    logEvent(requestId, 'invalid_action', { action: getString(event.action) })
    return actionResult.error
  }

  const action = actionResult.action
  const envId = resolveEnvId()

  try {
    const app = getCloudBaseApp(envId)
    const db = app.database()

    logEvent(requestId, 'started', {
      envId,
      action,
      withSecret: Boolean(readEnvValue('TENCENT_SECRET_ID', 'TENCENTCLOUD_SECRET_ID', 'VITE_TENCENT_SECRET_ID'))
    })

    const handler = ACTION_HANDLERS[action]
    const result = await handler({ app, db, event, requestId, envId })

    logEvent(requestId, 'completed', {
      action,
      ok: result.ok,
      durationMs: Date.now() - startedAt,
      error: result.ok ? '' : result.error
    })

    return {
      ...result,
      meta: {
        request_id: requestId,
        action,
        generated_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        url_max_age_seconds: TEMP_URL_MAX_AGE_SECONDS
      }
    }
  } catch (error) {
    // 兜底：**任何**异常都收敛成结构化错误（不抛未捕获异常、不返回部分数据）。
    // 详细信息只入日志（服务端），不下发堆栈给端侧。
    logEvent(requestId, 'failed', {
      action,
      durationMs: Date.now() - startedAt,
      message: error?.message || 'UNKNOWN_ERROR',
      stack: error?.stack || ''
    })

    return buildError(ERROR_CODES.readFailed, error?.message || '读取失败', { action })
  }
}

// 本地自测/QA 用：暴露内部函数以便用桩对象驱动**真实执行路径**（SCF 只会调用 exports.main，
// 额外导出无副作用）。自测脚本：
// /Users/kevin/.hermes/profiles/zang/cache/scratch/kong-b2-d6/selftest.mjs
exports.__test__ = {
  handleGetTrack,
  handleGetSectionAudios,
  handleListTracks,
  resolveTrackForRead,
  loadDeliverableAudioPools,
  fetchTracks,
  fetchSectionAudioCandidates,
  readTrackByPlanStep,
  signFileUrls,
  assertCloudBaseResult,
  ACTION_HANDLERS
}
