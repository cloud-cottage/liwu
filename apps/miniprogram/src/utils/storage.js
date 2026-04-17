const PROFILE_STORAGE_KEY = 'liwu_miniprogram_profile'
const AUTHOR_KEY_STORAGE_KEY = 'liwu_miniprogram_author_key'

const createAuthorKey = () => `mp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const getAuthorKey = () => {
  const currentKey = wx.getStorageSync(AUTHOR_KEY_STORAGE_KEY)
  if (currentKey) {
    return currentKey
  }

  const nextKey = createAuthorKey()
  wx.setStorageSync(AUTHOR_KEY_STORAGE_KEY, nextKey)
  return nextKey
}

const getLocalProfile = () => {
  const authorKey = getAuthorKey()
  const storedProfile = wx.getStorageSync(PROFILE_STORAGE_KEY) || {}

  return {
    authorKey,
    name: storedProfile.name || `小悟${authorKey.slice(-4)}`,
    phone: storedProfile.phone || '',
    bio: storedProfile.bio || '在小程序里记录你的觉察与练习。',
    updatedAt: storedProfile.updatedAt || ''
  }
}

const saveLocalProfile = (patch = {}) => {
  const currentProfile = getLocalProfile()
  const nextProfile = {
    ...currentProfile,
    ...patch,
    updatedAt: new Date().toISOString()
  }

  wx.setStorageSync(PROFILE_STORAGE_KEY, nextProfile)
  return nextProfile
}

module.exports = {
  getAuthorKey,
  getLocalProfile,
  saveLocalProfile
}
