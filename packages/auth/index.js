import { normalizePhone, isValidPhone, buildAuthUid, buildDefaultUserName } from './src/normalize.js';
import { readSession, writeSession, clearSession, buildSession } from './src/session.js';
import { resolveUserByPhone, resolveUserById, createUser, normalizeUserProfile } from './src/user-resolver.js';
import { requestOtp, verifyOtp } from './src/phone-otp.js';
import { bindWechatToUser, resolveUserByWechatOpenId } from './src/wechat-binding.js';
import { ensureAnonymousLogin } from './src/anonymous-login.js';
import { migrateLegacySession } from './src/migration.js';
import { SESSION_KEY, MOCK_OTP_CODE } from './src/constants.js';

export {
  normalizePhone,
  isValidPhone,
  buildAuthUid,
  buildDefaultUserName,
  readSession,
  writeSession,
  clearSession,
  normalizeUserProfile,
  SESSION_KEY,
  MOCK_OTP_CODE
};

export const createAuthService = ({ db, auth, collections }) => {
  const usersCollection = collections?.users || 'users';
  let sessionChangeListeners = [];

  const notifyListeners = (session) => {
    for (const cb of sessionChangeListeners) {
      try { cb(session); } catch {}
    }
  };

  const getNextUid = async () => {
    const result = await db.collection(usersCollection).limit(2000).get();
    const docs = result.data || [];
    const maxUid = docs.reduce((max, doc) => Math.max(max, Number(doc.uid) || 0), 0);
    return maxUid + 1;
  };

  const service = {
    getSession() {
      return readSession();
    },

    async getAuthStatus() {
      const session = readSession();
      if (session?.phone && session?.userId) {
        return {
          isAuthenticated: true,
          isAnonymous: false,
          hasSession: true,
          phone: session.phone,
          displayName: session.displayName || '',
          uid: session.uid || 0,
          userId: session.userId,
          authUid: session.authUid || buildAuthUid(session.phone),
          loginMethod: session.loginMethod || 'phone',
          phoneNumber: session.phone
        };
      }

      return {
        isAuthenticated: false,
        isAnonymous: true,
        hasSession: false,
        phone: '',
        displayName: '',
        uid: 0,
        userId: '',
        authUid: '',
        loginMethod: 'anonymous',
        phoneNumber: ''
      };
    },

    async requestOtp(phone) {
      return requestOtp(phone);
    },

    async verifyOtp(phone, code) {
      verifyOtp(phone, code);
      const normalized = normalizePhone(phone);

      await ensureAnonymousLogin(auth);

      let userDoc = await resolveUserByPhone(db, usersCollection, normalized);
      if (!userDoc) {
        userDoc = await createUser(db, usersCollection, { phone: normalized, getNextUid });
      }

      const authUid = buildAuthUid(normalized);
      const now = new Date();
      const updatePayload = {
        auth_uid: authUid,
        last_active: now.toISOString(),
        updated_at: now
      };
      if (userDoc.phone !== normalized) {
        updatePayload.phone = normalized;
      }
      const docId = userDoc._id || userDoc.id;
      await db.collection(usersCollection).doc(docId).update(updatePayload).catch(() => {});

      const profile = normalizeUserProfile({ ...userDoc, ...updatePayload, _id: docId });
      const session = buildSession({
        phone: normalized,
        userId: profile.id,
        uid: profile.uid,
        displayName: profile.name,
        authUid,
        loginMethod: 'phone'
      });

      migrateLegacySession();
      writeSession(session);
      notifyListeners(session);

      return { success: true, session, profile };
    },

    async refreshProfile() {
      const session = readSession();
      if (!session?.userId) return null;

      await ensureAnonymousLogin(auth);
      const userDoc = await resolveUserById(db, usersCollection, session.userId);
      if (!userDoc) return null;

      const profile = normalizeUserProfile(userDoc);
      const updatedSession = buildSession({
        phone: profile.phone || session.phone,
        userId: profile.id,
        uid: profile.uid,
        displayName: profile.name,
        authUid: profile.authUid || session.authUid,
        loginMethod: session.loginMethod
      });
      writeSession(updatedSession);
      return profile;
    },

    async getCurrentProfile() {
      const session = readSession();
      if (!session?.userId) return null;

      await ensureAnonymousLogin(auth);
      const userDoc = await resolveUserById(db, usersCollection, session.userId);
      if (!userDoc) return null;

      const profile = normalizeUserProfile(userDoc);
      const updatedSession = buildSession({
        phone: profile.phone || session.phone,
        userId: profile.id,
        uid: profile.uid,
        displayName: profile.name,
        authUid: profile.authUid || session.authUid,
        loginMethod: session.loginMethod
      });
      writeSession(updatedSession);
      return profile;
    },

    async bindWechat({ openId, unionId }) {
      const session = readSession();
      if (!session?.userId) throw new Error('请先登录');
      await bindWechatToUser(db, usersCollection, { userId: session.userId, openId, unionId });
      return { success: true };
    },

    logout() {
      clearSession();
      notifyListeners(null);
    },

    onSessionChange(cb) {
      sessionChangeListeners.push(cb);
      return () => {
        sessionChangeListeners = sessionChangeListeners.filter((fn) => fn !== cb);
      };
    }
  };

  return service;
};
