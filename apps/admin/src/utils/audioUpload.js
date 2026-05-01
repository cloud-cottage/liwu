import app, { ensureAnonymousLogin } from '../services/cloudbase.js'

export const uploadAudioFile = async ({ file, cloudPath }) => {
  await ensureAnonymousLogin()

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

export const getAudioTempUrl = async (fileId) => {
  if (!fileId) {
    return ''
  }

  await ensureAnonymousLogin()

  const tempFileResult = await app.getTempFileURL({ fileList: [fileId] })
  const tempFile = tempFileResult?.fileList?.[0] || tempFileResult?.data?.fileList?.[0] || null
  return tempFile?.tempFileURL || tempFile?.download_url || tempFile?.downloadUrl || ''
}
