export const USER_AVATAR_OPTIONS_SETTINGS_KEY = 'user_avatar_options';
export const USER_AVATAR_SLOT_COUNT = 48;
export const USER_AVATAR_DEFAULT_RANDOM_RANGE = 6;

const createAvatarSlot = (index) => ({
  id: `avatar_${String(index + 1).padStart(2, '0')}`,
  index: index + 1,
  fileId: '',
  imageUrl: ''
});

export const createDefaultUserAvatarOptions = () => (
  Array.from({ length: USER_AVATAR_SLOT_COUNT }, (_, index) => createAvatarSlot(index))
);

export const DEFAULT_USER_AVATAR_OPTIONS_SETTINGS = {
  documentId: null,
  avatars: createDefaultUserAvatarOptions(),
  missingCollection: false
};

export const normalizeUserAvatarOptionsSettings = (value = {}) => {
  const rawAvatars = Array.isArray(value.avatars || value.avatar_options || value.avatarOptions)
    ? (value.avatars || value.avatar_options || value.avatarOptions)
    : [];

  const avatarsById = new Map(
    rawAvatars
      .map((item, index) => ({
        id: item?.id || `avatar_${String(index + 1).padStart(2, '0')}`,
        index: Number(item?.index ?? index + 1),
        fileId: item?.fileId || item?.file_id || '',
        imageUrl: item?.imageUrl || item?.image_url || ''
      }))
      .map((item) => [item.id, item])
  );

  return {
    documentId: value.documentId || value._id || null,
    avatars: createDefaultUserAvatarOptions().map((slot) => ({
      ...slot,
      ...(avatarsById.get(slot.id) || {})
    })),
    missingCollection: false
  };
};

export const toUserAvatarOptionsPayload = (settings = {}) => {
  const normalized = normalizeUserAvatarOptionsSettings(settings);

  return {
    key: USER_AVATAR_OPTIONS_SETTINGS_KEY,
    avatar_options: normalized.avatars.map((avatar) => ({
      id: avatar.id,
      index: avatar.index,
      file_id: avatar.fileId || '',
      image_url: avatar.imageUrl || ''
    }))
  };
};

export const getSelectableUserAvatars = (settings = {}) => (
  normalizeUserAvatarOptionsSettings(settings).avatars.filter((avatar) => avatar.imageUrl)
);

export const getAvatarOptionByIndex = (settings = {}, avatarIndex) => (
  normalizeUserAvatarOptionsSettings(settings).avatars.find((avatar) => avatar.index === Number(avatarIndex || 0)) || null
);

export const pickRandomDefaultAvatarIndex = (settings = {}) => {
  const normalized = normalizeUserAvatarOptionsSettings(settings);
  const candidates = normalized.avatars
    .filter((avatar) => avatar.index <= USER_AVATAR_DEFAULT_RANDOM_RANGE && avatar.imageUrl);

  if (candidates.length === 0) {
    return 0;
  }

  return Number(candidates[Math.floor(Math.random() * candidates.length)].index || 0);
};

export const pickRandomDefaultAvatar = (settings = {}) => (
  getAvatarOptionByIndex(settings, pickRandomDefaultAvatarIndex(settings))?.imageUrl || ''
);
