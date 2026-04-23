import app, { ensureAnonymousLogin } from '../services/cloudbase.js'

export const convertImageToWebp = async (file) => {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('图片读取失败，无法转换为 webP'))
      nextImage.src = objectUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('当前浏览器不支持图片转换，请更换浏览器重试')
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const webpBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('转换 webP 失败，请重试'))
          return
        }
        resolve(blob)
      }, 'image/webp', 0.9)
    })

    const nextFileName = `${(file.name || 'image').replace(/\.[^.]+$/, '') || 'image'}.webp`
    return new File([webpBlob], nextFileName, {
      type: 'image/webp',
      lastModified: Date.now()
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const uploadImageAsWebp = async ({ file, cloudPath }) => {
  await ensureAnonymousLogin()
  const webpFile = await convertImageToWebp(file)
  const uploadResult = await app.uploadFile({
    cloudPath,
    filePath: webpFile
  })

  const fileId = uploadResult.fileID || uploadResult.fileId || ''
  let imageUrl = uploadResult.download_url || uploadResult.downloadUrl || ''

  if (fileId && !imageUrl) {
    const tempFileResult = await app.getTempFileURL({
      fileList: [fileId]
    })
    const tempFile = tempFileResult?.fileList?.[0] || tempFileResult?.data?.fileList?.[0] || null
    imageUrl = tempFile?.tempFileURL || tempFile?.download_url || tempFile?.downloadUrl || ''
  }

  return {
    fileId,
    imageUrl
  }
}
