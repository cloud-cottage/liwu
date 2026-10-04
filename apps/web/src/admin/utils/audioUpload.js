import app, { ensureAnonymousLogin, proxyCloudBaseMediaUrl } from '../services/cloudbase.js'
import { runAudioUploadIntegrityGuard } from './audioUploadIntegrity.js'

// ─── 上传音频（IO 编排层）─────────────────────────────────────────────────────
// 完整性防护的判定 / 重试编排全部在纯模块 audioUploadIntegrity.js（可桩测）；
// 本文件只负责真实 IO：读取本地字节数、上传、取回对象字节数，并把它注入防护编排。

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

export const uploadAudioFile = async ({ file, cloudPath }) => {
  await ensureAnonymousLogin()

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
