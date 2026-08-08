export const createAuthResolvers = (auth) => {
  const resolveCurrentUser = async () => auth.currentUser || auth.getCurrentUser()

  const resolveCurrentSession = async () => {
    if (typeof auth.getSession !== 'function') {
      return null
    }

    try {
      const sessionResult = await auth.getSession()
      return sessionResult?.data?.session || null
    } catch {
      return null
    }
  }

  return {
    resolveCurrentUser,
    resolveCurrentSession
  }
}

export const createEnsureAnonymousLogin = ({ auth, resolveCurrentUser }) => {
  let loginPromise = null

  return async () => {
    const existingUser = await resolveCurrentUser()
    if (existingUser) {
      return existingUser
    }

    const existingLoginState = auth.hasLoginState() || await auth.getLoginState()
    if (existingLoginState) {
      return resolveCurrentUser()
    }

    if (!loginPromise) {
      loginPromise = auth.signInAnonymously()
        .then(() => resolveCurrentUser())
        .finally(() => {
          loginPromise = null
        })
    }

    return loginPromise
  }
}