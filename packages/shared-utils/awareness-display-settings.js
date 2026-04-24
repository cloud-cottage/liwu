export const AWARENESS_DISPLAY_SETTINGS_KEY = 'awareness_display_settings';
export const DEFAULT_AWARENESS_POPULAR_TAG_COUNT = 33;

export const DEFAULT_AWARENESS_DISPLAY_SETTINGS = {
  documentId: null,
  popularTagCount: DEFAULT_AWARENESS_POPULAR_TAG_COUNT,
  missingCollection: false
};

export const normalizeAwarenessDisplaySettings = (value = {}) => ({
  documentId: value.documentId || value._id || null,
  popularTagCount: Math.max(
    1,
    Math.min(
      200,
      Number(
        value.popularTagCount ??
        value.popular_tag_count ??
        DEFAULT_AWARENESS_POPULAR_TAG_COUNT
      ) || DEFAULT_AWARENESS_POPULAR_TAG_COUNT
    )
  ),
  missingCollection: false
});

export const toAwarenessDisplaySettingsPayload = (settings = {}) => {
  const normalized = normalizeAwarenessDisplaySettings(settings);

  return {
    key: AWARENESS_DISPLAY_SETTINGS_KEY,
    popular_tag_count: normalized.popularTagCount
  };
};
