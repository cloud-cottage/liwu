export const MEDITATION_SETTINGS_KEY = 'meditation_rewards'

export const DEFAULT_MEDITATION_SETTINGS = {
  rewardPoints: 50,
  allowRepeatRewards: true,
  inviterRewardRate: 0,
  documentId: null,
  missingCollection: false
}

export const normalizeMeditationSettings = (settings = {}) => ({
  rewardPoints: Number(settings.reward_points ?? settings.rewardPoints ?? DEFAULT_MEDITATION_SETTINGS.rewardPoints),
  allowRepeatRewards:
    settings.allow_repeat_rewards ?? settings.allowRepeatRewards ?? DEFAULT_MEDITATION_SETTINGS.allowRepeatRewards,
  inviterRewardRate: Math.min(
    20,
    Math.max(0, Number(settings.inviter_reward_rate ?? settings.inviterRewardRate ?? DEFAULT_MEDITATION_SETTINGS.inviterRewardRate))
  ),
  documentId: settings._id || settings.id || settings.documentId || null,
  missingCollection: false
})

export const toMeditationSettingsPayload = (settingsData = {}) => ({
  key: MEDITATION_SETTINGS_KEY,
  reward_points: Math.max(0, Number(settingsData.rewardPoints ?? DEFAULT_MEDITATION_SETTINGS.rewardPoints)),
  allow_repeat_rewards: Boolean(settingsData.allowRepeatRewards ?? DEFAULT_MEDITATION_SETTINGS.allowRepeatRewards),
  inviter_reward_rate: Math.min(
    20,
    Math.max(0, Number(settingsData.inviterRewardRate ?? DEFAULT_MEDITATION_SETTINGS.inviterRewardRate))
  )
})