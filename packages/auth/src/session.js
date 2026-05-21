import { SESSION_KEY } from './constants.js';

export const readSession = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const writeSession = (session) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
};

export const clearSession = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {}
};

export const buildSession = ({ phone, userId, uid, displayName, authUid, loginMethod }) => ({
  phone: phone || '',
  userId: userId || '',
  uid: Number(uid) || 0,
  displayName: displayName || '',
  authUid: authUid || '',
  loginMethod: loginMethod || 'phone',
  authenticatedAt: new Date().toISOString()
});
