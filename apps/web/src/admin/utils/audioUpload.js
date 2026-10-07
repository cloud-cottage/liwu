import app, { ensureAnonymousLogin, proxyCloudBaseMediaUrl } from '../services/cloudbase.js'
import {
  AUDIO_UPLOAD_DECODE_AUDIO_MAX_BYTES,
  AUDIO_UPLOAD_PARSE_MEASURE_TIMEOUT_MS,
  runAudioParseabilityGuard,
  runAudioUploadIntegrityGuard
} from './audioUploadIntegrity.js'

// ─── 上传音频（IO 编排层）─────────────────────────────────────────────────────
// 可解析性校验 / 完整性防护的判定与编排全部在纯模块 audioUploadIntegrity.js（可桩测）；
// 本文件只负责真实 IO：两种手段测量时长、读取本地字节数、上传、取回对象字节数，并注入编排。

// 读取本地文件真实可读字节数（arrayBuffer）。读到字节数 !== File.size ⇒ 本地文件未完整落地
// （云盘 / 同步盘未同步完、刚下载完尚未写全），由纯模块判定并**在上传前**抛可读错误。
const readLocalFileByteLength = async (file) => {
  const buffer = await file.arrayBuffer()

  return buffer?.byteLength ?? 0
}

// 取回已上传对象字节数：优先用上传返回的下载地址；缺失时再取临时链接。
// 取回失败（网络 / CORS / 代理不可用）会 throw —— 纯模块据此 fail-soft（不阻断上传）。
const fetchRemoteObjectByteLength = async ({ fileId, audioUrl }) => {
  let url = audioUrl

  if (!url && fileId) {
    const tempFileResult = await app.getTempFileURL({ fileList: [fileId] })
    const tempFile = tempFileResult?.fileList?.[0] || tempFileResult?.data?.fileList?.[0] || null
    url = tempFile?.tempFileURL || tempFile?.download_url || tempFile?.downloadUrl || ''
  }

  if (!url) {
    throw new Error('无可校验的对象地址')
  }

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`对象校验取回失败（${response.status}）`)
  }

  const buffer = await response.arrayBuffer()

  return buffer?.byteLength ?? 0
}

// ─── 上传前可解析性校验的两种测量实现（IO）─────────────────────────────────────
// 手段 a：HTMLMediaElement 元数据。读到 loadedmetadata 即 resolve 其 duration（0 / NaN / Infinity
// 也照原样返回，由纯模块判定为「无效时长」）；元素报错时——若当前环境**声称支持**该类型
// （canPlayType 非空）则该报错归因于文件数据不可解析 ⇒ resolve 0；否则无法归因（环境不支持该
// 容器/编码）⇒ reject 视为技术不可用（放行）。超时 / 环境不支持媒体元素 ⇒ 同样 reject（放行）。
export const measureDurationByMediaElement = (file) => new Promise((resolve, reject) => {
  if (
    typeof document === 'undefined'
    || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function'
  ) {
    reject(new Error('当前环境不支持媒体元素测量'))
    return
  }

  const objectUrl = URL.createObjectURL(file)
  const audio = document.createElement('audio')
  let settled = false
  let timer = null

  const cleanup = () => {
    clearTimeout(timer)
    audio.onloadedmetadata = null
    audio.onerror = null
    URL.revokeObjectURL(objectUrl)
  }

  const settle = (handler, value) => {
    if (settled) return
    settled = true
    cleanup()
    handler(value)
  }

  timer = setTimeout(() => {
    settle(reject, new Error('音频测量超时'))
  }, AUDIO_UPLOAD_PARSE_MEASURE_TIMEOUT_MS)

  audio.preload = 'metadata'
  audio.onloadedmetadata = () => settle(resolve, Number(audio.duration))
  audio.onerror = () => {
    let canPlay = ''

    try {
      canPlay = audio.canPlayType(file?.type || '')
    } catch {
      canPlay = ''
    }

    if (!canPlay) {
      // 环境本就不支持该类型：无法归因于文件 ⇒ 技术不可用，放行。
      settle(reject, new Error('当前环境不支持该音频类型'))
      return
    }

    // 环境声称支持却仍报错 ⇒ 该文件数据不可解析 ⇒ 给出无效时长。
    settle(resolve, 0)
  }
  audio.src = objectUrl
})

// decodeAudioData 的 Promise 包装：兼容回调式（旧实现返回 undefined）与 Promise 式。
const decodeAudioBufferWithContext = (context, arrayBuffer) => new Promise((resolve, reject) => {
  let result

  try {
    result = context.decodeAudioData(arrayBuffer, resolve, reject)
  } catch (error) {
    reject(error)
    return
  }

  if (result && typeof result.then === 'function') {
    result.then(resolve, reject)
  }
})

// 手段 b：AudioContext.decodeAudioData 整块解码。成功即 resolve 其 duration。
// 环境不支持 / 解码器抛异常 / 文件超过字节上限 ⇒ reject 视为技术不可用（放行），不得据此拦截。
export const measureDurationByDecodeAudioData = async (file) => {
  const AudioContextCtor = typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext)
    : null

  if (typeof AudioContextCtor !== 'function') {
    throw new Error('当前环境不支持整块解码测量')
  }

  const size = Number(file?.size) || 0

  if (size > AUDIO_UPLOAD_DECODE_AUDIO_MAX_BYTES) {
    throw new Error('音频文件过大，跳过整块解码测量')
  }

  const context = new AudioContextCtor()

  try {
    const arrayBuffer = await file.arrayBuffer()
    const decoded = await decodeAudioBufferWithContext(context, arrayBuffer)

    return Number(decoded?.duration)
  } finally {
    try {
      context.close?.()
    } catch {
      // 关闭上下文失败不影响测量结果
    }
  }
}

export const uploadAudioFile = async ({ file, cloudPath }) => {
  await ensureAnonymousLogin()

  // 【上传前】可解析性校验：两种手段都测不出有效时长（且确已跑过）⇒ 不发起上传、抛可读错误；
  // 技术不可用（校验不了）⇒ 放行。必须在上传之前，保证被拒时一个字节都不上传、不入队。
  await runAudioParseabilityGuard({
    measureByMediaElement: () => measureDurationByMediaElement(file),
    measureByDecodeAudioData: () => measureDurationByDecodeAudioData(file)
  })

  const uploadOnce = async () => {
    const uploadResult = await app.uploadFile({
      cloudPath,
      filePath: file
    })

    const fileId = uploadResult.fileID || uploadResult.fileId || ''
    let audioUrl = uploadResult.download_url || uploadResult.downloadUrl || ''

    if (fileId && !audioUrl) {
      const tempFileResult = await app.getTempFileURL({
        fileList: [fileId]
      })
      const tempFile = tempFileResult?.fileList?.[0] || tempFileResult?.data?.fileList?.[0] || null
      audioUrl = tempFile?.tempFileURL || tempFile?.download_url || tempFile?.downloadUrl || ''
    }

    return { fileId, audioUrl }
  }

  let uploaded = { fileId: '', audioUrl: '' }

  await runAudioUploadIntegrityGuard({
    expectedBytes: Number(file?.size),
    readLocalBytes: () => readLocalFileByteLength(file),
    upload: async () => { uploaded = await uploadOnce() },
    reupload: async () => { uploaded = await uploadOnce() },
    fetchRemoteBytes: () => fetchRemoteObjectByteLength({ fileId: uploaded.fileId, audioUrl: uploaded.audioUrl })
  })

  return { fileId: uploaded.fileId, audioUrl: proxyCloudBaseMediaUrl(uploaded.audioUrl) }
}

export const getAudioTempUrl = async (fileId) => {
  if (!fileId) {
    return ''
  }

  await ensureAnonymousLogin()

  const tempFileResult = await app.getTempFileURL({ fileList: [fileId] })
  const tempFile = tempFileResult?.fileList?.[0] || tempFileResult?.data?.fileList?.[0] || null
  return proxyCloudBaseMediaUrl(tempFile?.tempFileURL || tempFile?.download_url || tempFile?.downloadUrl || '')
}
