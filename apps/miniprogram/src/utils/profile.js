const { getLocalProfile, saveLocalProfile } = require('./storage')
const { listUserTags } = require('./aware')

const getProfilePageData = async () => {
  const profile = getLocalProfile()
  const tags = await listUserTags(10)
  const awareCount = tags.reduce((sum, tag) => sum + tag.totalCount, 0)

  return {
    profile,
    tags,
    awareCount
  }
}

module.exports = {
  getProfilePageData,
  saveLocalProfile
}
