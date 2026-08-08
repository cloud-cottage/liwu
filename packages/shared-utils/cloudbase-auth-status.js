import {
  buildDefaultUserName,
  buildPhoneAuthUid,
  getAuthProviderLabel,
  isAnonymousDisplayName,
  normalizePhone
} from './cloudbase-user-identity.js'

export const normalizeAuthStatus = ({ session, currentUser } = {}) => {
  const sessionUser = session?.user || null
  const provider =
    sessionUser?.app_metadata?.provider ||
    sessionUser?.app_metadata?.providers?.[0] ||
    currentUser?.loginType ||
    ''
  const loginMethod = getAuthProviderLabel(provider)
  const authUid = sessionUser?.id || sessionUser?.sub || currentUser?.uid || ''
  const phoneNumber = normalizePhone(sessionUser?.phone || sessionUser?.phone_number || currentUser?.phoneNumber || '')
  const email = sessionUser?.email || currentUser?.email || ''
  const displayName =
    sessionUser?.user_metadata?.name ||
    sessionUser?.user_metadata?.nickName ||
    sessionUser?.user_metadata?.username ||
    currentUser?.name ||
    currentUser?.username ||
    buildDefaultUserName(authUid)
  const isAnonymous = Boolean(
    sessionUser?.is_anonymous ||
    loginMethod === 'anonymous' ||
    currentUser?.loginType === 'ANONYMOUS'
  )

  return {
    hasSession: Boolean(sessionUser),
    authUid,
    phoneNumber,
    email,
    displayName: isAnonymousDisplayName(displayName) && isAnonymous ? buildDefaultUserName(authUid) : displayName,
    provider,
    loginMethod,
    isAnonymous,
    isAuthenticated: Boolean(sessionUser) && !isAnonymous,
    isMockSession: false
  }
}

export const createResolveAuthStatus = ({
  readSession,
  resolveCurrentUser,
  resolveCurrentSession,
  ensureAnonymousLogin
}) => async ({ allowAnonymous = false } = {}) => {
  const liwuSession = readSession()
  if (liwuSession?.phone) {
    return {
      hasSession: true,
      authUid: liwuSession.authUid || buildPhoneAuthUid(liwuSession.phone),
      phoneNumber: liwuSession.phone,
      displayName: liwuSession.displayName || '',
      provider: 'phone',
      loginMethod: 'phone',
      isAnonymous: false,
      isAuthenticated: true,
      isMockSession: false
    }
  }

  let currentUser = await resolveCurrentUser().catch(() => null)
  let session = await resolveCurrentSession()

  if (!currentUser && !session && allowAnonymous) {
    await ensureAnonymousLogin()
    currentUser = await resolveCurrentUser().catch(() => null)
    session = await resolveCurrentSession()
  }

  return normalizeAuthStatus({ session, currentUser })
}