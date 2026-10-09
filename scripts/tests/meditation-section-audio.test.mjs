// ─── 冥想段落音频卡片 · 试听播放进度纯函数桩测（D-8） ───────────────────────────
//
// 被验对象（纯模块，零依赖、可直接桩测）：
//   packages/shared-utils/meditation-section-audio.js
//     · formatMeditationAudioClock                        —— 秒 ⇒ mm:ss（满 1 小时 h:mm:ss）
//     · resolveMeditationSectionAudioPlaybackProgress     —— currentTime/duration ⇒ [0, 1] 封顶
//
// 边界口径：0 / 负数 / NaN / Infinity / undefined / 非数字，超一小时换算，进度封顶与无效输入归 0。
//
// 运行：node scripts/tests/meditation-section-audio.test.mjs

import {
  formatMeditationAudioClock,
  resolveMeditationSectionAudioPlaybackProgress
} from '../../packages/shared-utils/meditation-section-audio.js'

let pass = 0
let fail = 0
const failures = []

const ok = (name, cond, detail = '') => {
  if (cond) {
    pass += 1
    console.log(`  PASS ${name}`)
  } else {
    fail += 1
    failures.push(name)
    console.log(`  FAIL ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}
const eq = (name, actual, expected) => ok(
  name,
  JSON.stringify(actual) === JSON.stringify(expected),
  `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`
)

// ── formatMeditationAudioClock：mm:ss（分钟两位补零） ──────────────────────────
console.log('== formatMeditationAudioClock：mm:ss 与边界输入 ==')
{
  eq('C1 0 秒 ⇒ 00:00', formatMeditationAudioClock(0), '00:00')
  eq('C2 5.9 秒向下取整 ⇒ 00:05', formatMeditationAudioClock(5.9), '00:05')
  eq('C3 59 秒 ⇒ 00:59', formatMeditationAudioClock(59), '00:59')
  eq('C4 满 1 分钟进位 ⇒ 01:00', formatMeditationAudioClock(60), '01:00')
  eq('C5 12 分 34 秒 ⇒ 12:34', formatMeditationAudioClock(754), '12:34')
  eq('C6 3599 秒（差 1 秒满 1 小时）⇒ 59:59', formatMeditationAudioClock(3599), '59:59')
}

console.log('== formatMeditationAudioClock：超一小时 h:mm:ss ==')
{
  eq('C7 恰好 1 小时 ⇒ 1:00:00', formatMeditationAudioClock(3600), '1:00:00')
  eq('C8 1 小时 1 分 1 秒 ⇒ 1:01:01', formatMeditationAudioClock(3661), '1:01:01')
  eq('C9 2 小时 2 分 5 秒 ⇒ 2:02:05', formatMeditationAudioClock(7325), '2:02:05')
  eq('C10 10 小时（小时不补零）⇒ 10:00:00', formatMeditationAudioClock(36000), '10:00:00')
}

console.log('== formatMeditationAudioClock：非法 / 负数输入归 0 ==')
{
  eq('C11 负数 ⇒ 00:00', formatMeditationAudioClock(-3.5), '00:00')
  eq('C12 NaN ⇒ 00:00', formatMeditationAudioClock(Number.NaN), '00:00')
  eq('C13 Infinity ⇒ 00:00', formatMeditationAudioClock(Number.POSITIVE_INFINITY), '00:00')
  eq('C14 undefined ⇒ 00:00', formatMeditationAudioClock(undefined), '00:00')
  eq('C15 null ⇒ 00:00', formatMeditationAudioClock(null), '00:00')
  eq('C16 非数字字符串 ⇒ 00:00', formatMeditationAudioClock('abc'), '00:00')
}

// ── resolveMeditationSectionAudioPlaybackProgress：[0, 1] 封顶 ─────────────────
console.log('== resolveMeditationSectionAudioPlaybackProgress：正常区间与封顶 ==')
{
  eq('P1 各半 ⇒ 0.5', resolveMeditationSectionAudioPlaybackProgress(50, 100), 0.5)
  eq('P2 播完（currentTime = duration）⇒ 1', resolveMeditationSectionAudioPlaybackProgress(100, 100), 1)
  eq('P3 超出时长封顶 ⇒ 1', resolveMeditationSectionAudioPlaybackProgress(150, 100), 1)
  eq('P4 小数进度不受影响', resolveMeditationSectionAudioPlaybackProgress(0.25, 1), 0.25)
  eq('P5 极小值不封顶', resolveMeditationSectionAudioPlaybackProgress(1, 3600), 1 / 3600)
}

console.log('== resolveMeditationSectionAudioPlaybackProgress：无效输入归 0 ==')
{
  eq('P6 currentTime 0 ⇒ 0', resolveMeditationSectionAudioPlaybackProgress(0, 100), 0)
  eq('P7 currentTime 负数 ⇒ 0', resolveMeditationSectionAudioPlaybackProgress(-5, 100), 0)
  eq('P8 currentTime NaN ⇒ 0', resolveMeditationSectionAudioPlaybackProgress(Number.NaN, 100), 0)
  eq('P9 duration 0 ⇒ 0', resolveMeditationSectionAudioPlaybackProgress(30, 0), 0)
  eq('P10 duration 负数 ⇒ 0', resolveMeditationSectionAudioPlaybackProgress(30, -10), 0)
  eq('P11 duration NaN ⇒ 0', resolveMeditationSectionAudioPlaybackProgress(30, Number.NaN), 0)
  eq('P12 duration undefined ⇒ 0', resolveMeditationSectionAudioPlaybackProgress(30, undefined), 0)
  eq('P13 duration Infinity ⇒ 0', resolveMeditationSectionAudioPlaybackProgress(30, Number.POSITIVE_INFINITY), 0)
}

console.log('== 时钟与进度联动（模拟 timeupdate 快照） ==')
{
  const currentTime = 3661
  const duration = 7200
  const percent = Math.round(resolveMeditationSectionAudioPlaybackProgress(currentTime, duration) * 100)

  eq('L1 联动时钟 ⇒ 1:01:01 / 2:00:00', `${formatMeditationAudioClock(currentTime)} / ${formatMeditationAudioClock(duration)}`, '1:01:01 / 2:00:00')
  eq('L2 联动进度条宽度 ⇒ 51%', percent, 51)
}

console.log(`\n结果：${pass} PASS / ${fail} FAIL`)
if (fail > 0) {
  console.log(`失败项：${failures.join(' | ')}`)
  process.exit(1)
}
