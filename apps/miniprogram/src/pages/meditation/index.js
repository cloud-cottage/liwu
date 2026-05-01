const {
  SESSION_SECONDS,
  MIN_VALID_MEDITATION_SECONDS,
  getMeditationPageData,
  recordMeditationCompletion
} = require('../../utils/meditation')

const formatTime = (totalSeconds = 0) => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

Page({
  data: {
    loading: true,
    saving: false,
    stats: {
      sessionCount: 0,
      todayCount: 0,
      pastCount: 0,
      sessionSeconds: SESSION_SECONDS
    },
    timeLabel: formatTime(SESSION_SECONDS),
    remainingSeconds: SESSION_SECONDS,
    running: false,
    completed: false
  },

  onLoad() {
    void this.loadPageData()
  },

  onUnload() {
    this.clearTimer()
  },

  async onPullDownRefresh() {
    await this.loadPageData()
    wx.stopPullDownRefresh()
  },

  async loadPageData() {
    this.setData({ loading: true })

    try {
      const pageData = await getMeditationPageData()
      this.setData({
        loading: false,
        stats: pageData.stats,
        remainingSeconds: pageData.stats.sessionSeconds || SESSION_SECONDS,
        timeLabel: formatTime(pageData.stats.sessionSeconds || SESSION_SECONDS),
        running: false,
        completed: false
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '冥想数据加载失败',
        icon: 'none'
      })
    }
  },

  clearTimer() {
    if (this.timerId) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  },

  startTimer() {
    if (this.timerId) {
      return
    }

    this.timerId = setInterval(() => {
      const nextValue = Math.max(0, Number(this.data.remainingSeconds || 0) - 1)
      this.setData({
        remainingSeconds: nextValue,
        timeLabel: formatTime(nextValue)
      })

      if (nextValue <= 0) {
        this.clearTimer()
        this.setData({
          running: false,
          completed: true
        })
        void this.handleCompleteMeditation()
      }
    }, 1000)
  },

  handleToggleMeditation() {
    if (this.data.running) {
      this.clearTimer()
      this.setData({ running: false })
      return
    }

    this.setData({ running: true, completed: false })
    this.startTimer()
  },

  handleResetMeditation() {
    this.clearTimer()
    this.setData({
      running: false,
      completed: false,
      remainingSeconds: this.data.stats.sessionSeconds || SESSION_SECONDS,
      timeLabel: formatTime(this.data.stats.sessionSeconds || SESSION_SECONDS)
    })
  },

  async handleCompleteMeditation() {
    const completedSeconds = Math.max(0, (this.data.stats.sessionSeconds || SESSION_SECONDS) - Number(this.data.remainingSeconds || 0))

    this.setData({ saving: true })

    try {
      const result = await recordMeditationCompletion({ durationSeconds: completedSeconds })
      this.setData({ saving: false })
      await this.loadPageData()
      wx.showToast({
        title: result.recorded ? '冥想已记入' : `少于 ${Math.floor(MIN_VALID_MEDITATION_SECONDS / 60)} 分钟，未记入`,
        icon: 'none'
      })
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({
        title: error.message || '冥想记录失败',
        icon: 'none'
      })
    }
  },

  onShareAppMessage() {
    return {
      title: '来理悟小程序，一起静寂 15 分钟',
      path: '/pages/meditation/index'
    }
  }
})
