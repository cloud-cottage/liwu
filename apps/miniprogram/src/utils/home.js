const { listPopularTags } = require('./aware')
const { getLocalProfile } = require('./storage')

const getHomePageData = async () => {
  const profile = getLocalProfile()
  const tags = await listPopularTags(6)

  return {
    profile,
    tags
  }
}

module.exports = {
  getHomePageData
}
