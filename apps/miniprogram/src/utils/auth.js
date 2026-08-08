const { createMiniProgramAuthUi } = require('./shared/auth')
const { COLLECTIONS } = require('./shared/database-config')
const { getCurrentShopProfile } = require('./shop')
const { openMiniRoute } = require('./navigation')
const { getDb } = require('./cloudbase')
const { getLocalProfile, saveLocalProfile } = require('./storage')

module.exports = createMiniProgramAuthUi({
  getDb,
  getCurrentShopProfile,
  openMiniRoute,
  getLocalProfile,
  saveLocalProfile,
  collections: COLLECTIONS
})