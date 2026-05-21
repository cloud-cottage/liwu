export const normalizePhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  if (digits.length === 13 && digits.startsWith('861')) return digits.slice(2);
  return digits.length === 11 ? digits : '';
};

export const isValidPhone = (phone) => {
  const normalized = normalizePhone(phone);
  return normalized.length === 11 && normalized.startsWith('1');
};

export const buildAuthUid = (phone) => {
  const normalized = normalizePhone(phone);
  return normalized ? `phone_${normalized}` : '';
};

export const buildDefaultUserName = (uid) => `觉醒伙伴${uid || 1}`;
