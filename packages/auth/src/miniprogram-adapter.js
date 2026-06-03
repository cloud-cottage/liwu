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

const resolveUserByPhone = async (db, phone) => {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  const result = await db.collection('users').where({ phone: normalized }).limit(10).get()
  const docs = result.data || []
  if (docs.length === 0) return null
  if (docs.length === 1) return docs[0]
  return docs
    .filter((d) => Number(d.uid) > 0)
    .sort((a, b) => (Number(a.uid) || Infinity) - (Number(b.uid) || Infinity))[0]
    || docs[0]
}

const getNextUid = async (db) => {
  const result = await db.collection('users').limit(2000).get()
  const docs = result.data || []
  const maxUid = docs.reduce((max, doc) => Math.max(max, Number(doc.uid) || 0), 0)
  return maxUid + 1
}

const createMiniProgramAuthService = (db) => ({
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

    let userDoc = await resolveUserByPhone(db, normalized)
    if (!userDoc) {
      const uid = await getNextUid(db)
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
      const addResult = await db.collection('users').add({ data: payload })
      userDoc = { _id: addResult._id, ...payload }
    }

    const docId = userDoc._id || userDoc.id
    const now = new Date()
    await db.collection('users').doc(docId).update({
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
    await db.collection('users').doc(session.userId).update({
      data: { wechat_open_id: openId, updated_at: new Date() }
    })
    return { success: true }
  },

  async refreshProfile() {
    const session = readSession()
    if (!session || !session.userId || !normalizePhone(session.phone)) return null
    const result = await db.collection('users').doc(session.userId).get()
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
})

module.exports = {
  createMiniProgramAuthService,
  normalizePhone,
  readSession,
  SESSION_KEY,
  MOCK_OTP_CODE
}
