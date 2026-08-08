export const createBuildTempUrlMap = (cloudbaseApp) => async (fileIds = []) => {
  const normalizedFileIds = [...new Set((Array.isArray(fileIds) ? fileIds : []).filter(Boolean))]

  if (normalizedFileIds.length === 0) {
    return new Map()
  }

  const tempUrlResult = await cloudbaseApp.getTempFileURL({ fileList: normalizedFileIds })
  return new Map(
    (tempUrlResult?.fileList || tempUrlResult?.data?.fileList || []).map((item) => [
      item.fileID || item.fileId,
      item.tempFileURL || item.download_url || item.downloadUrl || item.tempFileUrl || ''
    ])
  )
}