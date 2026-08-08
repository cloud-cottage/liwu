export const isMissingCollectionResponse = (response) => response?.code === 'DATABASE_COLLECTION_NOT_EXIST'

export const isMissingCollectionIssue = (value) => {
  const message = value?.message || ''

  return (
    value?.code === 'DATABASE_COLLECTION_NOT_EXIST' ||
    message.includes('DATABASE_COLLECTION_NOT_EXIST') ||
    message.includes('Db or Table not exist')
  )
}

export const getDocumentId = (document) => document?._id || document?.id || ''

export const getResponseData = (response, collectionName) => {
  if (Array.isArray(response?.data)) {
    return response.data
  }

  if (response?.data && typeof response.data === 'object') {
    return [response.data]
  }

  if (isMissingCollectionResponse(response)) {
    return []
  }

  throw new Error(response?.message || `CloudBase query failed for collection "${collectionName}"`)
}

export const getFirstDocument = (response, collectionName) => getResponseData(response, collectionName)[0] || null

export const getDocuments = getResponseData