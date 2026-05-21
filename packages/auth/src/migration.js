import { LEGACY_KEYS } from './constants.js';

export const migrateLegacySession = () => {
  if (typeof window === 'undefined') return;

  for (const key of LEGACY_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {}
    try {
      window.sessionStorage.removeItem(key);
    } catch {}
  }
};
