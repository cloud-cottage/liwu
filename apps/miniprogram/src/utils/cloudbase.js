const ENV_ID = 'liwu-0gtd91eebd863ccf'

let databaseInstance = null

const initCloudbase = () => {
  if (!wx.cloud) {
    return { ready: false, error: '当前基础库版本不支持云开发' }
  }

  if (!databaseInstance) {
    wx.cloud.init({
      env: ENV_ID,
      traceUser: true
    })
    databaseInstance = wx.cloud.database()
  }

  return {
    ready: true,
    db: databaseInstance
  }
}

const getDb = () => {
  const result = initCloudbase()
  if (!result.ready) {
    throw new Error(result.error)
  }

  return result.db
}

module.exports = {
  ENV_ID,
  initCloudbase,
  getDb
}
