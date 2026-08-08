const MAX_WEALTH_HISTORY_ITEMS = 50

const normalizeWealthEntry = (entry = {}) => ({
  id: entry.id || `wealth_${Date.now()}`,
  amount: Number(entry.amount || 0),
  description: entry.description || '',
  date: entry.date || new Date().toISOString(),
  type: entry.type || 'EARN',
  source: entry.source || '',
  rewardKey: entry.rewardKey || '',
  relatedUserId: entry.relatedUserId || ''
})

const normalizeWealthHistory = (value, maxItems = MAX_WEALTH_HISTORY_ITEMS) => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeWealthEntry)
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, maxItems)
}

const normalizeRewardClaims = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

const PERSONAL_WEALTH_HISTORY_SOURCES = new Set([
  '',
  'manual',
  'awareness_tag',
  'invite_bonus',
  'shop_spend',
  'shop_cash_reward',
  'shop_refund',
  'shop_reward_reversal',
  'dream_purchase'
])

const EXCLUDED_PERSONAL_WEALTH_HISTORY_SOURCES = new Set([
  'agent_daily_burn',
  'partner_order_retail_reward',
  'brand_daily_burn'
])

const filterPersonalWealthHistory = (entries = []) => (
  entries.filter((entry) => {
    const source = String(entry?.source || '').trim()
    if (EXCLUDED_PERSONAL_WEALTH_HISTORY_SOURCES.has(source)) {
      return false
    }
    return PERSONAL_WEALTH_HISTORY_SOURCES.has(source)
  })
)

module.exports = {
  MAX_WEALTH_HISTORY_ITEMS,
  normalizeWealthEntry,
  normalizeWealthHistory,
  normalizeRewardClaims,
  filterPersonalWealthHistory
}
