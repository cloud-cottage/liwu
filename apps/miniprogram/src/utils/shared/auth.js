const SESSION_KEY = 'liwu_auth_session'
const MOCK_OTP_CODE = '1234'

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

const readSession = () => {
  try {
    return wx.getStorageSync(SESSION_KEY) || null
  } catch {
    return null
  }
}

const writeSession = (session) => {
  try {
    wx.setStorageSync(SESSION_KEY, session)
  } catch {}
}

const clearSession = () => {
  try {
    wx.removeStorageSync(SESSION_KEY)
    wx.removeStorageSync('liwu_miniprogram_profile')
  } catch {}
}

const resolveUsersCollection = (collections = {}) => collections.users || 'users'

const resolveUserByPhone = async (db, phone, usersCollection = 'users') => {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  const result = await db.collection(usersCollection).where({ phone: normalized }).limit(10).get()
  const docs = result.data || []
  if (docs.length === 0) return null
  if (docs.length === 1) return docs[0]
  return docs
    .filter((d) => Number(d.uid) > 0)
    .sort((a, b) => (Number(a.uid) || Infinity) - (Number(b.uid) || Infinity))[0]
    || docs[0]
}

const getNextUid = async (db, usersCollection = 'users') => {
  const result = await db.collection(usersCollection).limit(2000).get()
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

const createMiniProgramAuthService = (db, collections = {}) => {
  const usersCollection = resolveUsersCollection(collections)

  return {
  getSession() {
    return readSession()
  },

  isLoggedIn() {
    const session = readSession()
    return Boolean(session && normalizePhone(session.phone) && session.userId)
  },

  async loginWithWechatPhone(phoneNumber) {
    const normalized = normalizePhone(phoneNumber)
    if (!normalized) throw new Error('无效手机号')

    let userDoc = await resolveUserByPhone(db, normalized, usersCollection)
    if (!userDoc) {
      const uid = await getNextUid(db, usersCollection)
      const authUid = buildAuthUid(normalized)
      const now = new Date()
      const payload = {
        uid,
        auth_uid: authUid,
        name: `觉醒伙伴${uid}`,
        phone: normalized,
        email: '',
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
      const addResult = await db.collection(usersCollection).add({ data: payload })
      userDoc = { _id: addResult._id, ...payload }
    }

    const docId = userDoc._id || userDoc.id
    const now = new Date()
    await db.collection(usersCollection).doc(docId).update({
      data: {
        last_active: now.toISOString(),
        updated_at: now
      }
    }).catch(() => {})

    const session = {
      phone: normalized,
      userId: docId,
      uid: Number(userDoc.uid) || 0,
      displayName: userDoc.name || `觉醒伙伴${userDoc.uid}`,
      authUid: buildAuthUid(normalized),
      loginMethod: 'wechat',
      authenticatedAt: now.toISOString()
    }

    writeSession(session)
    return { success: true, session, profile: userDoc }
  },

  async bindWechatOpenId(openId) {
    const session = readSession()
    if (!session || !session.userId) throw new Error('请先登录')
    await db.collection(usersCollection).doc(session.userId).update({
      data: { wechat_open_id: openId, updated_at: new Date() }
    })
    return { success: true }
  },

  async refreshProfile() {
    const session = readSession()
    if (!session || !session.userId || !normalizePhone(session.phone)) return null
    const result = await db.collection(usersCollection).doc(session.userId).get()
    const doc = (result.data || [])[0] || result.data || null
    if (!doc) return null

    const updatedSession = {
      ...session,
      displayName: doc.name || session.displayName,
      uid: Number(doc.uid) || session.uid
    }
    writeSession(updatedSession)
    return doc
  },

  logout() {
    clearSession()
  }
  }
}

const createMiniProgramAuthUi = ({
  getDb,
  getCurrentShopProfile,
  openMiniRoute,
  getLocalProfile,
  saveLocalProfile,
  collections = {}
}) => {
  const usersCollection = resolveUsersCollection(collections)

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
    const existingResult = await db.collection(usersCollection).where({ phone }).limit(10).get()
    const existingDocs = existingResult.data || []
    let userDoc = existingDocs.length === 1
      ? existingDocs[0]
      : existingDocs
        .filter((doc) => Number(doc.uid) > 0)
        .sort((left, right) => (Number(left.uid) || Infinity) - (Number(right.uid) || Infinity))[0] || null

    if (!userDoc) {
      const nextUid = await getNextUid(db, usersCollection)
      const now = new Date()
      const createPayload = {
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
      const addResult = await db.collection(usersCollection).add({ data: createPayload })
      userDoc = { _id: addResult._id, ...createPayload }
    } else {
      const docId = userDoc._id || userDoc.id || ''
      const now = new Date()
      await db.collection(usersCollection).doc(docId).update({
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

  return {
    bindPhoneFromWechatCode,
    requireBoundPhone,
    ensureCanParticipate
  }
}

module.exports = {
  createMiniProgramAuthService,
  createMiniProgramAuthUi,
  getReadablePhoneBindError,
  normalizePhone,
  readSession,
  SESSION_KEY,
  MOCK_OTP_CODE
}