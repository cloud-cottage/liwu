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
