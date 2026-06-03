export const MEDITATION_TRACK_KEYS = ['background', 'voice'];
export const MEDITATION_BACKGROUND_TYPES = new Set(['bowl', 'nature']);
export const DEFAULT_MEDITATION_SESSION_SECONDS = 15 * 60;
export const SHANGHAI_TIMEZONE = 'Asia/Shanghai';

export const getShanghaiDateKey = (value = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: SHANGHAI_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date(value));

export const getMeditationSessionKey = (value = new Date()) => {
  const hourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: SHANGHAI_TIMEZONE,
    hour: '2-digit',
    hour12: false
  });
  const hour = Number(hourFormatter.format(new Date(value)));

  if (hour < 11) {
    return 'morning';
  }

  if (hour < 14) {
    return 'noon';
  }

  if (hour < 18) {
    return 'afternoon';
  }

  return 'evening';
};

export const chooseRandomItem = (items = [], randomFn = Math.random) => {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const index = Math.max(0, Math.min(items.length - 1, Math.floor(randomFn() * items.length)));
  return items[index] || null;
};

export const sortMeditationAudioGroups = (groups = []) => [...groups].sort((left, right) => {
  if (left.type !== right.type) {
    return String(left.type || '').localeCompare(String(right.type || ''));
  }

  return Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0);
});

export const getPlaylistDurationSeconds = (playlist = [], fallbackDurationSeconds = 0) => {
  const totalDuration = (Array.isArray(playlist) ? playlist : []).reduce(
    (sum, item) => sum + Math.max(0, Number(item?.duration) || 0),
    0
  );

  return totalDuration > 0 ? totalDuration : Math.max(1, Number(fallbackDurationSeconds) || 0);
};

export const buildFallbackMeditationSessionPlan = ({
  fallbackAudioLibrary = [],
  now = new Date(),
  defaultSessionSeconds = DEFAULT_MEDITATION_SESSION_SECONDS
} = {}) => ({
  segments: [
    {
      id: 'fallback-background',
      type: 'nature',
      trackKey: 'background',
      startSeconds: 0,
      durationSeconds: defaultSessionSeconds,
      endSeconds: defaultSessionSeconds,
      playbackMode: 'loop',
      playlist: fallbackAudioLibrary.map((audioUrl, index) => ({
        id: `fallback-${index}`,
        title: `默认背景音 ${index + 1}`,
        audioUrl,
        duration: 0
      }))
    }
  ],
  sessionDuration: defaultSessionSeconds,
  presetName: '默认冥想',
  sessionKey: getMeditationSessionKey(now),
  dateKey: getShanghaiDateKey(now),
  usedFallback: true
});

export const buildMeditationSessionPlan = ({
  audioLibrary,
  compositionSettings,
  meditationCalendar,
  meditationLibrary,
  preset = null,
  now = new Date(),
  randomFn = Math.random,
  fallbackAudioLibrary = [],
  defaultSessionSeconds = DEFAULT_MEDITATION_SESSION_SECONDS
} = {}) => {
  const audioGroups = sortMeditationAudioGroups(audioLibrary?.groups || []);
  const audioItems = (audioLibrary?.items || []).filter((item) => item?.audioUrl);
  const configuredSegments = Array.isArray(compositionSettings?.segments) ? compositionSettings.segments : [];

  if (audioItems.length === 0 || configuredSegments.length === 0) {
    return buildFallbackMeditationSessionPlan({
      fallbackAudioLibrary,
      now,
      defaultSessionSeconds
    });
  }

  const sessionKey = getMeditationSessionKey(now);
  const dateKey = getShanghaiDateKey(now);
  const meditationPresets = meditationLibrary?.meditations || [];
  const presetMap = new Map(meditationPresets.map((item) => [item.id, item]));
  const scheduledPresetIds = Array.isArray(meditationCalendar?.days?.[dateKey]?.[sessionKey])
    ? meditationCalendar.days[dateKey][sessionKey].filter(Boolean)
    : [];
  const scheduledPresets = scheduledPresetIds.map((presetId) => presetMap.get(presetId)).filter(Boolean);
  const selectedPreset = preset || chooseRandomItem(scheduledPresets, randomFn) || meditationPresets[0] || null;

  const itemsByGroupId = new Map(
    audioGroups.map((group) => [group.id, audioItems.filter((item) => item.groupId === group.id)])
  );
  const itemsByType = new Map(
    [...new Set(audioItems.map((item) => item.type))]
      .map((type) => [type, audioItems.filter((item) => item.type === type)])
  );

  const segments = configuredSegments
    .map((segment, index) => {
      const type = segment.type || 'nature';
      const configuredStartSeconds = Math.max(0, Number(segment.startSeconds) || 0);
      const configuredDurationSeconds = Math.max(1, Number(segment.durationSeconds) || 0);
      const trackKey = MEDITATION_BACKGROUND_TYPES.has(type) ? 'background' : 'voice';
      const groupsForType = audioGroups.filter((group) => group.type === type);
      let playlist = [];

      if (trackKey === 'voice') {
        playlist = groupsForType
          .map((group) => {
            const groupItems = itemsByGroupId.get(group.id) || [];
            const selectedIds = Array.isArray(selectedPreset?.groupSelections?.[group.id])
              ? selectedPreset.groupSelections[group.id]
              : [];
            const selectedCandidates = selectedIds
              .map((itemId) => groupItems.find((item) => item.id === itemId))
              .filter((item) => item?.audioUrl);

            return chooseRandomItem(selectedCandidates.length > 0 ? selectedCandidates : groupItems, randomFn);
          })
          .filter(Boolean);

        if (playlist.length === 0) {
          const fallbackItem = chooseRandomItem(itemsByType.get(type) || [], randomFn);
          if (fallbackItem) {
            playlist = [fallbackItem];
          }
        }
      } else {
        const firstGroup = groupsForType[0] || null;
        const fallbackTypeItems = itemsByType.get(type) || [];
        const groupItems = firstGroup ? (itemsByGroupId.get(firstGroup.id) || []) : fallbackTypeItems;
        const selectedIds = firstGroup && Array.isArray(selectedPreset?.groupSelections?.[firstGroup.id])
          ? selectedPreset.groupSelections[firstGroup.id]
          : [];
        const selectedCandidates = selectedIds
          .map((itemId) => groupItems.find((item) => item.id === itemId))
          .filter((item) => item?.audioUrl);
        const chosenItem = chooseRandomItem(
          selectedCandidates.length > 0
            ? selectedCandidates
            : (groupItems.length > 0 ? groupItems : fallbackTypeItems),
          randomFn
        );

        if (chosenItem) {
          playlist = [chosenItem];
        }
      }

      if (playlist.length === 0) {
        return null;
      }

      const actualDurationSeconds = type === 'nature'
        ? configuredDurationSeconds
        : getPlaylistDurationSeconds(playlist, configuredDurationSeconds);

      return {
        id: segment.id || `${type}-${index}`,
        type,
        trackKey,
        configuredStartSeconds,
        configuredDurationSeconds,
        actualDurationSeconds,
        playbackMode: type === 'nature' ? 'loop' : 'sequence',
        playlist: playlist.map((item) => ({
          id: item.id,
          title: item.title || '',
          audioUrl: item.audioUrl,
          duration: Number(item.duration || 0)
        }))
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.configuredStartSeconds - right.configuredStartSeconds);

  if (segments.length === 0) {
    return buildFallbackMeditationSessionPlan({
      fallbackAudioLibrary,
      now,
      defaultSessionSeconds
    });
  }

  const correctedSegments = MEDITATION_TRACK_KEYS.flatMap((trackKey) => {
    const trackSegments = segments
      .filter((segment) => segment.trackKey === trackKey)
      .sort((left, right) => left.configuredStartSeconds - right.configuredStartSeconds);

    return trackSegments.map((segment, index) => {
      const startSeconds = Math.max(0, Number(segment.configuredStartSeconds) || 0);
      const nextSegment = trackSegments[index + 1] || null;
      const nextStartSeconds = nextSegment ? Math.max(startSeconds, Number(nextSegment.configuredStartSeconds) || 0) : null;
      const realDurationSeconds = Math.max(1, Number(segment.actualDurationSeconds) || 0);
      const durationSeconds = nextStartSeconds == null
        ? realDurationSeconds
        : Math.max(1, Math.min(realDurationSeconds, nextStartSeconds - startSeconds));
      const endSeconds = startSeconds + durationSeconds;

      return {
        ...segment,
        startSeconds,
        durationSeconds,
        endSeconds
      };
    });
  }).sort((left, right) => left.startSeconds - right.startSeconds);

  return {
    segments: correctedSegments,
    sessionDuration: Math.max(...correctedSegments.map((segment) => segment.endSeconds)),
    presetName: selectedPreset?.name || '默认冥想',
    sessionKey,
    dateKey,
    usedFallback: false
  };
};
