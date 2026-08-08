export const MEDITATION_AUDIO_LIBRARY_KEY = 'meditation_audio_library'
export const MEDITATION_COMPOSITION_SETTINGS_KEY = 'meditation_composition_settings'
export const MEDITATION_CALENDAR_KEY = 'meditation_calendar'
export const MEDITATION_LIBRARY_KEY = 'meditation_library'

export const MEDITATION_AUDIO_LIBRARY_TYPES = ['bowl', 'greeting', 'nature', 'breath', 'quote', 'goodbye']

export const MEDITATION_AUDIO_GROUP_TEMPLATES = Object.freeze({
  bowl: Object.freeze([
    Object.freeze({ id: 'bowl-default', key: 'default', name: '默认音频组' })
  ]),
  greeting: Object.freeze([
    Object.freeze({ id: 'greeting-self-intro', key: 'self_intro', name: '自我介绍' }),
    Object.freeze({ id: 'greeting-settling', key: 'settling', name: '居心地' }),
    Object.freeze({ id: 'greeting-posture', key: 'posture', name: '坐姿' }),
    Object.freeze({ id: 'greeting-breath-guidance', key: 'breath_guidance', name: '呼吸引导' })
  ]),
  nature: Object.freeze([
    Object.freeze({ id: 'nature-default', key: 'default', name: '默认音频组' })
  ]),
  breath: Object.freeze([
    Object.freeze({ id: 'breath-opening', key: 'opening', name: '呼吸开始' }),
    Object.freeze({ id: 'breath-main', key: 'main', name: '呼吸正文' })
  ]),
  quote: Object.freeze([
    Object.freeze({ id: 'quote-logic', key: 'logic', name: '逻辑' }),
    Object.freeze({ id: 'quote-reinforcement', key: 'reinforcement', name: '强化' })
  ]),
  goodbye: Object.freeze([
    Object.freeze({ id: 'goodbye-default', key: 'default', name: '默认音频组' })
  ])
})

export const getDefaultMeditationAudioGroups = () => MEDITATION_AUDIO_LIBRARY_TYPES.flatMap((type) => (
  (MEDITATION_AUDIO_GROUP_TEMPLATES[type] || []).map((group, index) => ({
    ...group,
    type,
    sortOrder: index
  }))
))

export const getDefaultMeditationAudioGroupId = (type = 'bowl') => {
  const groups = MEDITATION_AUDIO_GROUP_TEMPLATES[type] || []
  return groups[0]?.id || ''
}

export const DEFAULT_MEDITATION_AUDIO_LIBRARY = {
  documentId: null,
  groups: getDefaultMeditationAudioGroups(),
  items: [],
  missingCollection: false
}

export const DEFAULT_MEDITATION_COMPOSITION_SETTINGS = {
  documentId: null,
  segments: [],
  missingCollection: false
}

export const DEFAULT_MEDITATION_CALENDAR = {
  documentId: null,
  days: {},
  missingCollection: false
}

export const DEFAULT_MEDITATION_LIBRARY = {
  documentId: null,
  meditations: [],
  missingCollection: false
}