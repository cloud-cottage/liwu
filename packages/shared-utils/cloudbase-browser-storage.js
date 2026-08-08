export const PENDING_INVITE_STORAGE_KEY = 'liwu_pending_invite_code'
export const PENDING_AUTH_PHONE_STORAGE_KEY = 'liwu_pending_auth_phone'
export const AWARENESS_AUTHOR_KEY_STORAGE_KEY = 'liwu_awareness_author_key'

export const readLocalStorageValue = (key) => {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.localStorage.getItem(key) || ''
}

export const writeLocalStorageValue = (key, value) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(key, value)
}

export const readSessionStorageJSON = (key) => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.sessionStorage.getItem(key)
    return rawValue ? JSON.parse(rawValue) : null
  } catch {
    return null
  }
}

export const writeSessionStorageJSON = (key, value) => {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(key, JSON.stringify(value))
}

export const readLocalStorageJSON = (key) => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(key)
    return rawValue ? JSON.parse(rawValue) : null
  } catch {
    return null
  }
}

export const writeLocalStorageJSON = (key, value) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(key, JSON.stringify(value))
}

export const removeLocalStorageByPrefix = (prefix = '') => {
  if (typeof window === 'undefined' || !prefix) {
    return
  }

  const keysToRemove = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach((key) => {
    window.localStorage.removeItem(key)
  })
}

export const createPendingInviteHelpers = ({
  storageKey = PENDING_INVITE_STORAGE_KEY,
  queryKeys = ['invite']
} = {}) => {
  const rememberPendingInviteCode = () => {
    if (typeof window === 'undefined') {
      return ''
    }

    const searchParams = new URL(window.location.href).searchParams
    const inviteCode = queryKeys
      .map((key) => searchParams.get(key)?.trim())
      .find(Boolean)

    if (inviteCode) {
      window.localStorage.setItem(storageKey, inviteCode)
      return inviteCode
    }

    return window.localStorage.getItem(storageKey) || ''
  }

  const clearPendingInviteCode = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey)
    }
  }

  return {
    rememberPendingInviteCode,
    clearPendingInviteCode
  }
}

export const createPendingAuthPhoneHelpers = ({
  storageKey = PENDING_AUTH_PHONE_STORAGE_KEY
} = {}) => {
  const rememberPendingAuthPhone = (phone = '') => {
    if (typeof window === 'undefined') {
      return ''
    }

    const normalizedPhone = String(phone || '').trim()
    if (normalizedPhone) {
      window.sessionStorage.setItem(storageKey, normalizedPhone)
      return normalizedPhone
    }

    return window.sessionStorage.getItem(storageKey) || ''
  }

  const clearPendingAuthPhone = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(storageKey)
    }
  }

  return {
    rememberPendingAuthPhone,
    clearPendingAuthPhone
  }
}

export const getOrCreateAwarenessAuthorKey = ({
  storageKey = AWARENESS_AUTHOR_KEY_STORAGE_KEY
} = {}) => {
  const existingKey = readLocalStorageValue(storageKey)
  if (existingKey) {
    return existingKey
  }

  const nextKey = `aware_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  writeLocalStorageValue(storageKey, nextKey)
  return nextKey
}