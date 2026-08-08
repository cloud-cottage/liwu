const { getDb } = require('./cloudbase')
const { COLLECTIONS } = require('./shared/database-config')

const STORAGE_KEY = 'liwu_app_settings_cache'
const CACHE_TTL_MS = 5 * 60 * 1000

let memoryCache = null
let memoryCacheTime = 0

/* Prevent concurrent cache-miss calls from triggering multiple DB queries */
let inflightPromise = null

const readStorageCache = () => {
  try {
    const stored = wx.getStorageSync(STORAGE_KEY)
    if (stored && stored.data && Date.now() - stored.timestamp < CACHE_TTL_MS) {
      memoryCache = stored.data
      memoryCacheTime = stored.timestamp
      return stored.data
    }
  } catch { /* storage unavailable, proceed without cache */ }
  return null
}

const writeStorageCache = (data) => {
  memoryCache = data
  memoryCacheTime = Date.now()
  try {
    wx.setStorageSync(STORAGE_KEY, { data, timestamp: Date.now() })
  } catch { /* storage full, skip cache write */ }
}

/**
 * Batch-fetch multiple app_settings keys in one DB query, with in-memory + storage cache.
 * Concurrent calls (e.g. app.onLaunch + home.onLoad) coalesce into a single DB query.
 *
 * @param {string[]} keys - Setting keys to fetch (e.g. ['client_theme_settings', 'brand_carousel_settings'])
 * @returns {Promise<Object<string, object|null>>} Map of key -> document (or null if not found)
 */
const getAppSettings = async (keys) => {
  // 1) Try cache first
  const cached = readStorageCache()
  if (cached) {
    const result = {}
    let allCached = true
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(cached, key)) {
        result[key] = cached[key]
      } else {
        allCached = false
        break
      }
    }
    if (allCached) return result
  }

  // 2) Coalesce concurrent cache-miss calls
  if (inflightPromise) {
    await inflightPromise
    // Retry from cache after inflight completes
    const refetched = readStorageCache()
    if (refetched) {
      const result = {}
      let allCached = true
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(refetched, key)) {
          result[key] = refetched[key]
        } else {
          allCached = false
          break
        }
      }
      if (allCached) return result
    }
  }

  // 3) Batch query from DB
  inflightPromise = (async () => {
    const db = getDb()
    const queryCondition = keys.length === 1
      ? { key: keys[0] }
      : { key: db.command.in(keys) }

    let data = []
    try {
      const response = await db.collection(COLLECTIONS.appSettings)
        .where(queryCondition)
        .limit(30)
        .get()
      data = Array.isArray(response.data) ? response.data : []
    } catch {
      // DB error — keep existing cache as fallback
      return
    }

    const settingsMap = { ...readStorageCache() }
    data.forEach((doc) => {
      if (doc && doc.key) settingsMap[doc.key] = doc
    })
    writeStorageCache(settingsMap)
  })()

  try {
    await inflightPromise
  } finally {
    inflightPromise = null
  }

  // 4) Return requested keys
  const updatedCache = readStorageCache() || {}
  const result = {}
  keys.forEach((key) => {
    result[key] = updatedCache[key] || null
  })
  return result
}

const clearAppSettingsCache = () => {
  memoryCache = null
  memoryCacheTime = 0
  inflightPromise = null
  try { wx.removeStorageSync(STORAGE_KEY) } catch { /* ignore */ }
}

module.exports = {
  getAppSettings,
  clearAppSettingsCache
}
