const { getDb } = require('./cloudbase')
const { getCurrentShopProfile } = require('./shop')

const APP_SETTINGS = 'app_settings'
const POINT_LEDGER = 'point_ledger'
const MEDITATION_SETTINGS_KEY = 'meditation_rewards'
const SESSION_SECONDS = 15 * 60
const MIN_VALID_MEDITATION_SECONDS = 180

const getShanghaiDateKey = (value = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  return formatter.format(new Date(value))
}

const getMeditationSlotKey = (value = new Date()) => {
  const hourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hour12: false
  })
  const hour = Number(hourFormatter.format(new Date(value)))

  if (hour < 11) {
    return 'dawn'
  }

  if (hour < 14) {
    return 'noon'
  }

  if (hour < 18) {
    return 'afternoon'
  }

  return 'evening'
}

const listMeditationEntries = async (userId = '') => {
  const db = getDb()
  const result = await db.collection(POINT_LEDGER).where({ user_id: userId, biz_type: 'meditation' }).limit(2000).get()
  return result.data || []
}

const getMeditationSettings = async () => {
  try {
    const db = getDb()
    const result = await db.collection(APP_SETTINGS).where({ key: MEDITATION_SETTINGS_KEY }).limit(1).get()
    const document = (result.data || [])[0] || {}

    return {
      rewardPoints: Math.max(0, Number(document.reward_points ?? document.rewardPoints ?? 0)),
      allowRepeatRewards: document.allow_repeat_rewards ?? document.allowRepeatRewards ?? true
    }
  } catch {
    return {
      rewardPoints: 0,
      allowRepeatRewards: true
    }
  }
}

const getMeditationPageData = async () => {
  const currentProfile = await getCurrentShopProfile()
  const entries = currentProfile.id ? await listMeditationEntries(currentProfile.id) : []
  const todayKey = getShanghaiDateKey()
  const sessionCount = entries.length
  const todayCount = entries.filter((entry) => (entry.activity_date_key || '') === todayKey).length

  return {
    profile: currentProfile,
    settings: await getMeditationSettings(),
    stats: {
      sessionCount,
      todayCount,
      pastCount: Math.max(0, sessionCount - todayCount),
      sessionSeconds: SESSION_SECONDS
    }
  }
}

const recordMeditationCompletion = async ({ durationSeconds = 0 } = {}) => {
  const currentProfile = await getCurrentShopProfile()
  if (!currentProfile.id) {
    throw new Error('请先完善当前用户信息')
  }

  const normalizedDurationSeconds = Math.max(0, Number(durationSeconds) || 0)
  if (normalizedDurationSeconds < MIN_VALID_MEDITATION_SECONDS) {
    return {
      recorded: false,
      reason: 'too_short'
    }
  }

  const db = getDb()
  const now = new Date().toISOString()
  await db.collection(POINT_LEDGER).add({
    data: {
      user_id: currentProfile.id,
      delta: 0,
      balance_after: Number(currentProfile.balance || 0),
      biz_type: 'meditation',
      biz_id: `mp_meditation_${Date.now()}`,
      description: '完成一次冥想',
      activity_date_key: getShanghaiDateKey(now),
      activity_slot: getMeditationSlotKey(now),
      meta: {
        duration: normalizedDurationSeconds / 60
      },
      operator_id: '',
      created_at: now
    }
  })

  return {
    recorded: true
  }
}

module.exports = {
  SESSION_SECONDS,
  MIN_VALID_MEDITATION_SECONDS,
  getMeditationPageData,
  recordMeditationCompletion
}
