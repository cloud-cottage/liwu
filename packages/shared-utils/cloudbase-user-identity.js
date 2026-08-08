export const DEFAULT_USER_NAME_PREFIX = '觉醒伙伴'

export const parseNaturalNumber = (value = '') => {
  const normalizedValue = String(value || '').trim()
  if (!/^\d+$/.test(normalizedValue)) {
    return 0
  }

  const parsedValue = Number(normalizedValue)
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    return 0
  }

  return parsedValue
}

export const formatNaturalNumber = (value) => String(Math.max(1, Number(value) || 1))

export const buildDefaultUserName = (uid = '') => `${DEFAULT_USER_NAME_PREFIX}${formatNaturalNumber(uid)}`

export const getUserUid = (document = {}) => parseNaturalNumber(document.uid)

export const getUserInviteCode = (document = {}) => {
  const existingUid = getUserUid(document)
  return existingUid ? formatNaturalNumber(existingUid) : ''
}

export const createGetNextUserUid = ({ db, collections, getResponseData }) => async () => {
  const usersResult = await db.collection(collections.users).limit(2000).get()
  const maxUserUid = getResponseData(usersResult, collections.users).reduce((currentMax, document) => (
    Math.max(currentMax, getUserUid(document))
  ), 0)

  return Number(formatNaturalNumber(maxUserUid + 1))
}

export const normalizePhone = (value = '') => {
  const digitsOnlyValue = String(value || '').replace(/[^\d]/g, '')

  if (/^00861\d{10}$/.test(digitsOnlyValue)) {
    return digitsOnlyValue.slice(4)
  }

  if (/^861\d{10}$/.test(digitsOnlyValue)) {
    return digitsOnlyValue.slice(2)
  }

  return digitsOnlyValue
}

export const buildPhoneAuthUid = (phoneNumber = '') => {
  const normalizedPhoneNumber = normalizePhone(phoneNumber)
  return normalizedPhoneNumber ? `mock_phone_${normalizedPhoneNumber}` : ''
}

export const getAuthProviderLabel = (provider = '') => {
  const normalizedProvider = String(provider || '').toLowerCase()

  if (!normalizedProvider || normalizedProvider === 'anonymous') {
    return 'anonymous'
  }

  if (normalizedProvider.includes('wx') || normalizedProvider.includes('wechat')) {
    return 'wechat'
  }

  if (normalizedProvider.includes('phone')) {
    return 'phone'
  }

  return normalizedProvider
}

export const isAnonymousDisplayName = (value = '') => {
  const normalizedValue = String(value || '').trim().toLowerCase()
  return !normalizedValue || normalizedValue === 'anonymous' || normalizedValue === 'anon'
}

export const clampInviterRewardRate = (value) => {
  const nextValue = Number(value)
  if (!Number.isFinite(nextValue)) {
    return 0
  }

  return Math.min(20, Math.max(0, Math.round(nextValue)))
}