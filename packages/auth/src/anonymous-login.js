let loginPromise = null;

export const ensureAnonymousLogin = async (auth) => {
  if (!auth) return null;

  const existingUser = auth.currentUser || (typeof auth.getCurrentUser === 'function' ? auth.getCurrentUser() : null);
  if (existingUser) return existingUser;

  const existingLoginState = (typeof auth.hasLoginState === 'function' && auth.hasLoginState())
    || (typeof auth.getLoginState === 'function' && await auth.getLoginState());
  if (existingLoginState) {
    return auth.currentUser || (typeof auth.getCurrentUser === 'function' ? auth.getCurrentUser() : null);
  }

  if (!loginPromise) {
    loginPromise = auth.signInAnonymously()
      .then(() => auth.currentUser || (typeof auth.getCurrentUser === 'function' ? auth.getCurrentUser() : null))
      .finally(() => { loginPromise = null; });
  }

  return loginPromise;
};
