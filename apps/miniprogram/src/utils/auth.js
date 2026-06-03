const { getCurrentShopProfile } = require('./shop')
const { openMiniRoute } = require('./navigation')
const { getDb } = require('./cloudbase')
const { getLocalProfile, saveLocalProfile } = require('./storage')

const SESSION_KEY = 'liwu_auth_session'
const normalizePhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits
  if (digits.length === 13 && digits.startsWith('861')) return digits.slice(2)
  return digits.length === 11 ? digits : ''
}
const buildAuthUid = (phone) => {
  const normalized = normalizePhone(phone)
  return normalized ? `phone_${normalized}` : ''
}
const writeSession = (session) => {
  try {
    wx.setStorageSync(SESSION_KEY, session)
  } catch {}
}
const getNextUid = async (db) => {
  const result = await db.collection('users').limit(2000).get()
  const docs = result.data || []
  const maxUid = docs.reduce((max, doc) => Math.max(max, Number(doc.uid) || 0), 0)
  return maxUid + 1
}

const getReadablePhoneBindError = (message = '') => {
  const normalizedMessage = String(message || '')
  if (normalizedMessage.indexOf('missing_wechat_credentials') >= 0) {
    return '云函数缺少微信小程序密钥配置'
  }
  if (normalizedMessage.indexOf('get_access_token_failed') >= 0) {
    return '微信 access_token 获取失败'
  }
  if (normalizedMessage.indexOf('get_phone_failed') >= 0) {
    return '微信手机号授权码无效或已过期'
  }
  if (normalizedMessage.indexOf('empty_phone_number') >= 0) {
    return '未获取到手机号，请重试'
  }
  return normalizedMessage || '手机号绑定失败'
}

const requireBoundPhone = async ({
  redirectTo = '/pages/profile/index',
  toastTitle = '请先绑定手机号'
} = {}) => {
  const profile = await getCurrentShopProfile()
  if (profile && profile.phone) {
    return profile
  }

  wx.showToast({
    title: toastTitle,
    icon: 'none'
  })

  setTimeout(() => {
    openMiniRoute(redirectTo)
  }, 120)

  throw new Error('UNBOUND_PHONE_REQUIRED')
}

const ensureCanParticipate = ({
  hasPhone = false,
  redirectTo = '/pages/profile/info/index',
  toastTitle = '绑定手机号后才能参与'
} = {}) => {
  if (hasPhone) {
    return true
  }

  wx.showToast({
    title: toastTitle,
    icon: 'none'
  })

  setTimeout(() => {
    openMiniRoute(redirectTo)
  }, 120)

  return false
}

const bindPhoneFromWechatCode = async (code = '') => {
  const normalizedCode = String(code || '').trim()
  if (!normalizedCode) {
    throw new Error('missing_phone_code')
  }

  const result = await wx.cloud.callFunction({
    name: 'getUserPhone',
    data: {
      code: normalizedCode
    }
  })

  const payload = result && result.result ? result.result : {}
  if (!payload.ok || !payload.phoneNumber) {
    throw new Error(getReadablePhoneBindError(payload.error || 'get_user_phone_failed'))
  }

  const phone = String(payload.phoneNumber || '').trim()
  const profile = getLocalProfile()
  saveLocalProfile({
    ...profile,
    phone
  })

  const db = getDb()
  const existingResult = await db.collection('users').where({ phone }).limit(10).get()
  const existingDocs = existingResult.data || []
  let userDoc = existingDocs.length === 1
    ? existingDocs[0]
    : existingDocs
      .filter((doc) => Number(doc.uid) > 0)
      .sort((left, right) => (Number(left.uid) || Infinity) - (Number(right.uid) || Infinity))[0] || null

  if (!userDoc) {
    const nextUid = await getNextUid(db)
    const now = new Date()
    const payload = {
      uid: nextUid,
      auth_uid: buildAuthUid(phone),
      name: `觉醒伙伴${nextUid}`,
      phone,
      status: 'active',
      level: 1,
      experience: 0,
      is_student: false,
      balance: 0,
      wealth_history: [],
      reward_claims: {},
      join_date: now.toISOString().slice(0, 10),
      last_active: now.toISOString(),
      created_at: now,
      updated_at: now
    }
    const addResult = await db.collection('users').add({ data: payload })
    userDoc = { _id: addResult._id, ...payload }
  } else {
    const docId = userDoc._id || userDoc.id || ''
    const now = new Date()
    await db.collection('users').doc(docId).update({
      data: {
        phone,
        auth_uid: buildAuthUid(phone),
        name: userDoc.name || profile.name || `觉醒伙伴${userDoc.uid || ''}`,
        updated_at: now,
        last_active: now.toISOString()
      }
    }).catch(() => {})
    userDoc = {
      ...userDoc,
      phone,
      auth_uid: buildAuthUid(phone),
      name: userDoc.name || profile.name || `觉醒伙伴${userDoc.uid || ''}`
    }
  }

  const docId = userDoc._id || userDoc.id || ''
  const session = {
    phone,
    userId: docId,
    uid: Number(userDoc.uid) || 0,
    displayName: userDoc.name || `觉醒伙伴${userDoc.uid || ''}`,
    authUid: buildAuthUid(phone),
    loginMethod: 'wechat',
    authenticatedAt: new Date().toISOString()
  }
  writeSession(session)

  return {
    ok: true,
    phone,
    profile: userDoc,
    session
  }
}

module.exports = {
  requireBoundPhone,
  ensureCanParticipate,
  bindPhoneFromWechatCode
}
