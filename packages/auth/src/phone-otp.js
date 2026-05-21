import { normalizePhone } from './normalize.js';
import { MOCK_OTP_CODE } from './constants.js';

let pendingOtp = null;

export const requestOtp = (phone) => {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('请输入手机号');

  pendingOtp = {
    phone: normalized,
    code: MOCK_OTP_CODE,
    requestedAt: Date.now()
  };

  return { success: true, mockCode: MOCK_OTP_CODE };
};

export const verifyOtp = (phone, code) => {
  const normalized = normalizePhone(phone);
  const normalizedCode = String(code || '').trim();

  if (!normalized) throw new Error('请输入手机号');
  if (!normalizedCode) throw new Error('请输入验证码');

  if (!pendingOtp || pendingOtp.phone !== normalized) {
    throw new Error('请先获取验证码');
  }

  if (normalizedCode !== MOCK_OTP_CODE) {
    throw new Error('验证码错误，请输入 1234');
  }

  pendingOtp = null;
};
