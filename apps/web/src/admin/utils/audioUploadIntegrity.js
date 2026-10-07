// ─── 上传音频完整性防护（ESM 纯函数编排，零依赖、可桩测）─────────────────────────
//
// 口径（D-5 重做版）：防护分两段，全部通过**注入的 IO 回调**完成——本模块自身不直接触碰
// File / Blob / fetch / CloudBase SDK，因此可用普通桩函数覆盖全部路径。
//
//   ① 上传前本地可读性预检：await 读本地字节数，必须 === 期望字节数（file.size）；
//      不等于 ⇒ **不发起上传**就抛可读错误。直接捕捉根因「本地文件未完整落地
//      （云盘 / 同步盘未同步完、刚下载完尚未写全）」。
//   ② 上传后读回校验（fail-soft）：能取回对象字节 ⇒ 与期望比对：
//        · 一致 ⇒ 放行；
//        · 不一致 ⇒ 重传一次，仍不一致 ⇒ 抛可读错误（含本地 / 云端字节数）；
//        · **取回失败（网络 / CORS / 代理不可用）⇒ 不阻断、不报错给用户**，仅回一条
//          不敏感的内部提示（onVerifyUnavailable）。**不得因为校验不了而阻断上传。**
//
// 关键纪律：只有「**已确证**字节不一致（成功取回且能读出字节数）」才拦截；无法校验一律放行。

export const AUDIO_UPLOAD_LOCAL_UNREADABLE_CODE = 'AUDIO_UPLOAD_LOCAL_UNREADABLE'
export const AUDIO_UPLOAD_REMOTE_SIZE_MISMATCH_CODE = 'AUDIO_UPLOAD_REMOTE_SIZE_MISMATCH'
export const AUDIO_UPLOAD_REMOTE_VERIFY_UNAVAILABLE_CODE = 'AUDIO_UPLOAD_REMOTE_VERIFY_UNAVAILABLE'

// 确证不一致后最多重传次数（＝1：只重传一次，仍不一致才报错）。
export const AUDIO_UPLOAD_REMOTE_REUPLOAD_LIMIT = 1

const buildCodedError = (code, message) => {
  const error = new Error(message)
  error.code = code

  return error
}

// 字节数归一：非有限 / 负数 ⇒ null（＝读不出，属「无法校验」而非「不一致」）。
const toByteCount = (value) => {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null
}

export const buildLocalUnreadableMessage = (readBytes, expectedBytes) => {
  const read = toByteCount(readBytes)
  const expected = toByteCount(expectedBytes)

  return `本地文件未完整可读（读到 ${read ?? 0} 字节 / 应有 ${expected ?? 0} 字节），请重试或先另存到本地再上传`
}

export const buildRemoteMismatchMessage = (localBytes, remoteBytes) => {
  const local = toByteCount(localBytes)
  const remote = toByteCount(remoteBytes)

  return `上传后校验失败（本地 ${local ?? 0} 字节 / 云端 ${remote ?? 0} 字节），请重试上传`
}

// ① 本地可读性判据（纯）：读到字节数必须等于期望字节数，否则抛可读错误。
export const assertLocalBytesReadable = ({ readBytes, expectedBytes }) => {
  const expected = toByteCount(expectedBytes)
  const read = toByteCount(readBytes)

  if (expected === null || read === null || read !== expected) {
    throw buildCodedError(AUDIO_UPLOAD_LOCAL_UNREADABLE_CODE, buildLocalUnreadableMessage(readBytes, expectedBytes))
  }

  return read
}

// ② 读回比对判据（纯）：match / mismatch / unavailable（无法确证）。
export const classifyRemoteBytes = ({ remoteBytes, expectedBytes }) => {
  const expected = toByteCount(expectedBytes)
  const remote = toByteCount(remoteBytes)

  if (expected === null || remote === null) {
    return { status: 'unavailable', remote_bytes: remote }
  }

  return remote === expected
    ? { status: 'match', remote_bytes: remote }
    : { status: 'mismatch', remote_bytes: remote }
}

// ② 读回校验编排（fail-soft）：
//   取回失败 ⇒ 放行（verified:false）；一致 ⇒ 放行（verified:true）；
//   确证不一致 ⇒ 重传上限内重试，仍不一致 ⇒ 抛可读错误。
export const verifyUploadedObjectBytes = async ({
  expectedBytes,
  fetchRemoteBytes,
  reupload,
  onVerifyUnavailable
}) => {
  const expected = toByteCount(expectedBytes)

  const noteUnavailable = (reason) => {
    if (typeof onVerifyUnavailable === 'function') {
      onVerifyUnavailable({ reason, expected_bytes: expected })
    }
  }

  const resolveRemote = async () => {
    try {
      return { ok: true, bytes: await fetchRemoteBytes() }
    } catch (error) {
      return { ok: false, error }
    }
  }

  const first = await resolveRemote()

  if (!first.ok) {
    // 取回失败（网络 / CORS / 代理不可用）：不阻断、不报错给用户，仅内部记一条不敏感提示。
    noteUnavailable('fetch_unavailable')

    return { verified: false, reason: 'fetch_unavailable' }
  }

  const firstVerdict = classifyRemoteBytes({ remoteBytes: first.bytes, expectedBytes: expected })

  if (firstVerdict.status === 'match') {
    return { verified: true, remote_bytes: firstVerdict.remote_bytes }
  }

  if (firstVerdict.status === 'unavailable') {
    // 取回了响应但读不出字节数 ⇒ 无法确证 ⇒ 同样不阻断。
    noteUnavailable('remote_bytes_unreadable')

    return { verified: false, reason: 'remote_bytes_unreadable' }
  }

  // 已确证不一致 ⇒ 重传（上限 AUDIO_UPLOAD_REMOTE_REUPLOAD_LIMIT 次）。
  let lastRemoteBytes = firstVerdict.remote_bytes

  for (let attempt = 0; attempt < AUDIO_UPLOAD_REMOTE_REUPLOAD_LIMIT; attempt += 1) {
    await reupload()

    const retry = await resolveRemote()

    if (!retry.ok) {
      noteUnavailable('fetch_unavailable_after_reupload')

      return { verified: false, reason: 'fetch_unavailable_after_reupload' }
    }

    const verdict = classifyRemoteBytes({ remoteBytes: retry.bytes, expectedBytes: expected })
    lastRemoteBytes = verdict.remote_bytes

    if (verdict.status === 'match') {
      return { verified: true, remote_bytes: verdict.remote_bytes }
    }

    if (verdict.status === 'unavailable') {
      noteUnavailable('remote_bytes_unreadable_after_reupload')

      return { verified: false, reason: 'remote_bytes_unreadable_after_reupload' }
    }
  }

  // 重传上限用尽仍未通过 ⇒ 确证不一致，抛可读错误（含本地 / 云端字节数）。
  throw buildCodedError(
    AUDIO_UPLOAD_REMOTE_SIZE_MISMATCH_CODE,
    buildRemoteMismatchMessage(expected, lastRemoteBytes)
  )
}

// 完整防护编排（上传前预检 ⇒ 上传 ⇒ 读回校验）：
//   precheck 未通过时 **不会调用 upload**（由此保证「不发起上传」）。
export const runAudioUploadIntegrityGuard = async ({
  expectedBytes,
  readLocalBytes,
  upload,
  fetchRemoteBytes,
  reupload,
  onVerifyUnavailable
}) => {
  let readBytes

  try {
    readBytes = await readLocalBytes()
  } catch {
    throw buildCodedError(AUDIO_UPLOAD_LOCAL_UNREADABLE_CODE, buildLocalUnreadableMessage(null, expectedBytes))
  }

  const expected = assertLocalBytesReadable({ readBytes, expectedBytes })

  await upload()

  const verdict = await verifyUploadedObjectBytes({
    expectedBytes: expected,
    fetchRemoteBytes,
    reupload,
    onVerifyUnavailable
  })

  return { expected_bytes: expected, ...verdict }
}

// ─── 上传前可解析性校验（纯函数编排，零依赖、可桩测）───────────────────────────
//
// 背景：手机录音 `.m4a` 若**尾部索引（moov）缺失**（多为未导出完整 / 传输截断），云侧转码必然
// 失败（`moov atom not found`），但客户端仍会照常上传、入队、等一轮永久失败——白费一次传输与
// 一次排队，用户还看不懂原因。故在**上传前**用两种手段（HTMLMediaElement 元数据 / decodeAudioData）
// 尝试测量时长，只要一种测出有效时长就放行，两种都测不出（且确已跑过、报出无效时长）才拒绝。
//
// 口径（与既有本地可读性预检同一纪律：**无法校验一律放行，只有已确证不可解析才拦截**）：
//   · 任一手段测出**有限且 > 0** 的时长 ⇒ 放行；
//   · 无有效时长，但**至少一种手段跑完并报出时长**（0 / NaN / Infinity）⇒ 判不可解析 ⇒ 抛可读错误；
//   · 两种手段都**技术不可用**（实现缺失 / 抛异常 / 超时 / 环境不支持）⇒ 放行（不得因校验不了而阻断）。
export const AUDIO_UPLOAD_UNPARSEABLE_CODE = 'AUDIO_UPLOAD_UNPARSEABLE'

// 单次测量的上限等待（毫秒）：超时视为技术不可用（放行），不得让控件永久停在「处理中」。
export const AUDIO_UPLOAD_PARSE_MEASURE_TIMEOUT_MS = 10000

// decodeAudioData 的字节上限：超过则不整块解码（避免把几十 MB 音频读进内存），
// 该手段直接视为技术不可用（放行），由另一种手段或云侧兜底。
export const AUDIO_UPLOAD_DECODE_AUDIO_MAX_BYTES = 25 * 1024 * 1024

export const buildAudioUnparseableMessage = () => '这个音频文件无法解析（可能未导出完整），请重新导出或重新录制后再上传'

// 有限且 > 0 才算「有效时长」；0 / 负数 / NaN / Infinity 一律无效。
export const isUsableAudioDuration = (value) => {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0
}

// 归一单次测量结果：
//   { ok:false } ⇒ unavailable（技术不可用：抛异常 / 不支持 ⇒ 不参与拦截）
//   { ok:true, duration } ⇒ usable（有效时长）/ invalid（跑完但无有效时长）
export const classifyAudioMeasureOutcome = (outcome) => {
  if (!outcome || outcome.ok !== true) {
    return { status: 'unavailable' }
  }

  return isUsableAudioDuration(outcome.duration)
    ? { status: 'usable', duration: Number(outcome.duration) }
    : { status: 'invalid' }
}

// 判定（纯）：任一 usable ⇒ 放行；无 usable 但存在 invalid ⇒ 判不可解析；全 unavailable ⇒ 放行。
export const decideAudioParseability = (outcomes = []) => {
  const verdicts = outcomes.map(classifyAudioMeasureOutcome)
  const usable = verdicts.find((verdict) => verdict.status === 'usable')

  if (usable) {
    return { allowed: true, reason: 'measured', duration_seconds: usable.duration }
  }

  if (verdicts.some((verdict) => verdict.status === 'invalid')) {
    return { allowed: false, reason: 'unparseable' }
  }

  return { allowed: true, reason: 'unverifiable' }
}

// 编排（纯，注入两种测量实现，可桩测）：
//   任一测量抛异常 / 实现缺失 ⇒ 记为技术不可用（放行）；判不可解析 ⇒ 抛可读错误（人话、无编号）。
export const runAudioParseabilityGuard = async ({
  measureByMediaElement,
  measureByDecodeAudioData
} = {}) => {
  const runMeasure = async (measure) => {
    if (typeof measure !== 'function') {
      return { ok: false }
    }

    try {
      return { ok: true, duration: await measure() }
    } catch {
      return { ok: false }
    }
  }

  const outcomes = await Promise.all([
    runMeasure(measureByMediaElement),
    runMeasure(measureByDecodeAudioData)
  ])

  const decision = decideAudioParseability(outcomes)

  if (!decision.allowed) {
    throw buildCodedError(AUDIO_UPLOAD_UNPARSEABLE_CODE, buildAudioUnparseableMessage())
  }

  return decision
}
