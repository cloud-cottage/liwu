// ─── 混音产物「可见警告」上屏逻辑回归测试（超软基准照常产出但必须可见）─────────────────
//
// 被验对象：apps/web/src/admin/utils/meditationTrackMixJob.js
//   · MEDITATION_TRACK_MIX_WARNING_HEADLINE —— 警告块的统一抬头（说明「已产出、不阻断」）
//   · resolveMeditationTrackMixWarningLines(job) —— job 文档 → 上屏警告行数组（空数组＝不显示）
//     （后台 MeditationPage.jsx「冥想轨道」混音产物区据此渲染；渲染条件 ＝ lines.length > 0）
//
// 口径：轨道混音 **成功产出**（终态不变）后，job 文档若带可见警告
//   （durationOverSoftBaseline＝超 15:00 软基准 900s / durationMismatch＝时长不变量失配）
//   ⇒ 必须在该区域显示；**不阻断、不截断、不改终态**。job 失败仍走既有 mixError 分支（不属本测试）。
//   上屏文案**零规范编号**（不得出现 R4x / X2x / C2x）。
//
// 运行：node scripts/tests/meditation-track-mix-warnings.test.mjs

import {
  MEDITATION_TRACK_MIX_WARNING_CODES,
  MEDITATION_TRACK_MIX_WARNING_HEADLINE,
  resolveMeditationTrackMixWarningLines
} from '../../apps/web/src/admin/utils/meditationTrackMixJob.js'

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

// 云侧 buildTrackMixWarnings 的**同字面**文案（据 cloudfunctions/meditation-transcoder/index.js）。
const OVER_BASELINE_MESSAGE = '混音产物时长 920s 超出软基准 900s：已照常产出、未做任何截断，请核对章节时长与章间留白配置'
const MISMATCH_MESSAGE = '混音产物时长 920s 与「前导静音 ＋ 人声之和 ＋ 章间留白」918s 不一致（容差 0.5s）'

// 上屏辅助：把「抬头 ＋ 各行」拼成 UI 上那块可见文案（与 JSX 渲染逐项一致）。
const renderWarningBlockText = (lines) => `⚠️ ${MEDITATION_TRACK_MIX_WARNING_HEADLINE}\n`
  + lines.map((line) => `· ${line}`).join('\n')

console.log('== 例 1：成功 job 带两条可见警告（逐字驱动渲染条件与文案）==')
{
  const job = {
    status: 'succeeded',
    warnings: [
      { code: MEDITATION_TRACK_MIX_WARNING_CODES.durationOverSoftBaseline, message: OVER_BASELINE_MESSAGE },
      { code: MEDITATION_TRACK_MIX_WARNING_CODES.durationMismatch, message: MISMATCH_MESSAGE }
    ],
    warning_message: `${MEDITATION_TRACK_MIX_WARNING_CODES.durationOverSoftBaseline}：${OVER_BASELINE_MESSAGE}`
      + `；${MEDITATION_TRACK_MIX_WARNING_CODES.durationMismatch}：${MISMATCH_MESSAGE}`
  }
  const lines = resolveMeditationTrackMixWarningLines(job)
  eq('渲染条件：lines.length > 0 ⇒ 显示警告块', lines.length > 0, true)
  eq('两条警告各成一行', lines.length, 2)
  eq('第 1 行（超软基准）逐字', lines[0], OVER_BASELINE_MESSAGE)
  eq('第 2 行（时长不变量失配）逐字', lines[1], MISMATCH_MESSAGE)
  console.log('  · 逐字上屏文案：')
  console.log(renderWarningBlockText(lines).split('\n').map((row) => `      ${row}`).join('\n'))
  ok('上屏文案零规范编号（无 R4x / X2x / C2x）', !/(?:R4\d|X2\d|C2\d)/.test(renderWarningBlockText(lines)))
}

console.log('== 例 2：只有 warning_message（warnings[] 缺失）也能上屏 ==')
{
  const job = { status: 'succeeded', warning_message: `${MEDITATION_TRACK_MIX_WARNING_CODES.durationOverSoftBaseline}：${OVER_BASELINE_MESSAGE}` }
  const lines = resolveMeditationTrackMixWarningLines(job)
  eq('退回 warning_message 作单行', lines, [`${MEDITATION_TRACK_MIX_WARNING_CODES.durationOverSoftBaseline}：${OVER_BASELINE_MESSAGE}`])
  eq('渲染条件为真', lines.length > 0, true)
}

console.log('== 例 3：成功但无警告 / 老分区 job ⇒ 不显示（不误报）==')
{
  eq('无 warnings 与 warning_message', resolveMeditationTrackMixWarningLines({ status: 'succeeded' }), [])
  eq('warnings 为空数组', resolveMeditationTrackMixWarningLines({ status: 'succeeded', warnings: [] }), [])
  eq('warning_message 为空白', resolveMeditationTrackMixWarningLines({ status: 'succeeded', warnings: [], warning_message: '   ' }), [])
  eq('整个 job 为 null 兜底', resolveMeditationTrackMixWarningLines(null), [])
  eq('渲染条件为假 ⇒ 不上屏', resolveMeditationTrackMixWarningLines({ status: 'succeeded' }).length > 0, false)
}

console.log('== 例 4：message 缺失走码回落；未知码不上屏（英文码不外泄）==')
{
  const job = {
    status: 'succeeded',
    warnings: [
      { code: MEDITATION_TRACK_MIX_WARNING_CODES.durationOverSoftBaseline },
      { code: MEDITATION_TRACK_MIX_WARNING_CODES.durationMismatch, message: '' },
      { code: 'SOME_UNKNOWN_CODE', message: '' }
    ]
  }
  const lines = resolveMeditationTrackMixWarningLines(job)
  eq('两条已知码各回落一行、未知码丢弃', lines.length, 2)
  eq('回落文案不含英文码', lines.some((line) => line.includes('MIX_')), false)
  console.log('  · 逐字上屏文案（回落）：')
  console.log(renderWarningBlockText(lines).split('\n').map((row) => `      ${row}`).join('\n'))
  ok('回落文案零规范编号', !/(?:R4\d|X2\d|C2\d)/.test(renderWarningBlockText(lines)))
}

console.log(`\n结果：${pass} PASS / ${fail} FAIL`)
if (fail > 0) {
  console.log(`失败项：${failures.join(' | ')}`)
  process.exit(1)
}
