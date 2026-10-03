// ─── 混音章间留白口径（R47-③ / D-1 修正）回归测试 ─────────────────────────────
//
// 被验对象：
//   · 入队侧纯逻辑 apps/web/src/admin/utils/meditationTrackMixJob.js
//   · 端侧共享计划层 packages/shared-utils/meditation-track-playback-plan.js（对照组，同源口径）
//
// D-1 口径（Zang 裁定）：留白**只计「有可用音频」的章**的 gap：
//   某章「有可用音频」＝该章 section_types 在候选池中至少有一条「已转码完成」的音频；
//   与计划层 contentEntries（＝有可用段的启用章）**同口径**；禁用章不计（现有口径不变）。
//   ⇒ 某背景章启用但无音频时，产物时长不再多出 141s；不变量
//   「每段 1 条 take 时 产物期望时长 === 计划层 totals.total_seconds」**无条件**成立。
//
// 运行：node scripts/tests/meditation-track-mix-gaps.test.mjs
//
// fixture 按**真实 D6 响应形状**构造（plan 侧池条目＝{ _id, section_type, duration, formats[] }；
// 入队侧候选＝{ _id, section_type, file_id, created_at, duration }），两侧同源。

import * as template from '../../packages/shared-utils/meditation-track-template.js'
import * as plan from '../../packages/shared-utils/meditation-track-playback-plan.js'
import * as job from '../../apps/web/src/admin/utils/meditationTrackMixJob.js'

const VOICE_TYPES = template.MEDITATION_TRACK_VOICE_SECTION_TYPES
const BACKGROUND_TYPES = template.MEDITATION_TRACK_BACKGROUND_SECTION_TYPES
const CH = template.MEDITATION_TRACK_CHAPTER_TEMPLATE
const DEFAULT_GAP = template.MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT
const ALL_TYPES = [...BACKGROUND_TYPES, ...VOICE_TYPES]
const TAKE_SECONDS = 5

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
const round = (value) => Math.round((Number(value) || 0) * 1000) / 1000

// D6 chapter_template（与 cloudfunctions/meditation-read/lib/read-contract.js buildChapterTemplate 同形）。
const buildChapterTemplate = () => CH.map((chapter, index) => ({
  chapter_key: chapter.chapter_key,
  order: chapter.order,
  label: chapter.label,
  enabled_by_default: true,
  max_duration_seconds: chapter.max_duration_seconds,
  gap_after_seconds_default: index === CH.length - 1 ? 0 : DEFAULT_GAP,
  section_types: [...chapter.section_types],
  section_labels: {}
}))

// 归一后的 Track（D6 track 形状；末章 gap 恒 0）。
const buildTrack = ({ gapByKey = {}, enabledByKey = {}, version = 3 } = {}) => ({
  _id: 'track-k',
  track_key: 'k',
  version,
  chapters: CH.map((chapter, index) => ({
    chapter_key: chapter.chapter_key,
    order: chapter.order,
    label: chapter.label,
    enabled: enabledByKey[chapter.chapter_key] ?? true,
    max_duration_seconds: chapter.max_duration_seconds,
    section_types: [...chapter.section_types],
    gap_after_seconds: index === CH.length - 1 ? 0 : (gapByKey[chapter.chapter_key] ?? DEFAULT_GAP)
  })),
  background_track: { section_types: [...BACKGROUND_TYPES], volume: 0.33 },
  voice_track: { section_types: [...VOICE_TYPES], volume: 1 }
})

// 每个 section_type 一条候选（每段 1 条 take ⇒ 不变量等式成立）；omit 里的段不进候选池。
const buildInputs = ({ omit = [] } = {}) => {
  const types = ALL_TYPES.filter((sectionType) => !omit.includes(sectionType))
  const sectionAudios = types.map((sectionType) => ({
    _id: `snd-${sectionType}`,
    section_type: sectionType,
    file_id: `cloud://env/meditation-audio-final/${sectionType}/take-1.ogg`,
    created_at: '2026-10-01T00:00:00.000Z',
    duration: TAKE_SECONDS
  }))
  const sectionAudioPools = Object.fromEntries(types.map((sectionType) => [sectionType, [{
    _id: `snd-${sectionType}`,
    section_type: sectionType,
    duration: TAKE_SECONDS,
    formats: [
      { format: 'opus', url: `https://x/${sectionType}.ogg`, is_fallback: false },
      { format: 'mp3', url: `https://x/${sectionType}.mp3`, is_fallback: true }
    ]
  }]]))

  return { sectionAudios, sectionAudioPools }
}

const runCase = ({ omit = [], track = buildTrack(), expectLeading, expectSumGaps }) => {
  const { sectionAudios, sectionAudioPools } = buildInputs({ omit })

  const payload = job.buildMeditationTrackMixJobPayload({
    track,
    sectionAudios,
    sectionRaws: [],
    now: '2026-10-03T00:00:00.000Z'
  })
  const leading = payload.voice_leading_silence_seconds
  const gapArray = payload.voice_section_gap_after_seconds
  const sumGaps = round(leading + gapArray.reduce((sum, gap) => sum + gap, 0))
  const voiceTakeSeconds = payload.voice_section_audio_ids.length * TAKE_SECONDS
  const productSeconds = round(voiceTakeSeconds + sumGaps)

  const built = plan.buildMeditationTrackPlaybackPlan({
    track,
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools,
    rng: () => 0
  })

  eq('前导静音', leading, expectLeading)
  eq('Σ留白（前导静音 ＋ 各人声章留白）', sumGaps, expectSumGaps)
  eq('两数组等长（id ↔ gap）', gapArray.length, payload.voice_section_audio_ids.length)
  eq('末位恒 0（末（有可用内容）章不留尾部静默）', gapArray[gapArray.length - 1], 0)
  eq('Σ留白 ＝ 计划层 totals.gap_seconds', sumGaps, built.totals.gap_seconds)
  eq('每段 1 条 take ⇒ 产物期望时长 严格等于 计划层 totals.total_seconds',
    productSeconds, built.totals.total_seconds)
  console.log(`  · 产物期望时长 = ${productSeconds}s（Σ人声 ${voiceTakeSeconds}s ＋ Σ留白 ${sumGaps}s）`
    + `；计划层 total = ${built.totals.total_seconds}s（voice ${built.totals.voice_seconds} / gap ${built.totals.gap_seconds}）`)

  return { payload, built }
}

console.log('== 例 1：omit=[]（两背景章均有音频）==')
runCase({ omit: [], expectLeading: 282, expectSumGaps: 705 })

console.log('== 例 2：omit=["sec-nature"]（自然章无音频）==')
runCase({ omit: ['sec-nature'], expectLeading: 141, expectSumGaps: 564 })

console.log('== 例 3：omit=["sec-bowl"]（颂钵章无音频）==')
runCase({ omit: ['sec-bowl'], expectLeading: 141, expectSumGaps: 564 })

console.log('== 例 4：末章 gap 人为设非 0（被归零）==')
{
  const track = buildTrack()
  track.chapters[track.chapters.length - 1].gap_after_seconds = 999
  const { payload } = runCase({ omit: [], track, expectLeading: 282, expectSumGaps: 705 })
  eq('末章 track gap 非 0（前置 fixture 生效）', track.chapters[track.chapters.length - 1].gap_after_seconds, 999)
  eq('章留白取值视图把末章归零', job.resolveMeditationTrackMixChapterGaps({ track })['section-end'], 0)
  eq('留白数组末位仍为 0', payload.voice_section_gap_after_seconds[payload.voice_section_gap_after_seconds.length - 1], 0)
}

console.log('== 负对照：D-1 前的口径（不传 sectionAudios ＝ 旧「全部章全额计入」）会多出 141s ==')
{
  const { sectionAudios } = buildInputs({ omit: ['sec-nature'] })
  const { voiceSections } = job.resolveMeditationTrackMixVoiceSections({ sectionAudios, sectionRaws: [] })
  const track = buildTrack()
  const oldWay = job.resolveMeditationTrackMixLeadingSilenceSeconds({ voiceSections, track })
  const newWay = job.resolveMeditationTrackMixLeadingSilenceSeconds({ voiceSections, track, sectionAudios })
  eq('旧口径（未按候选池过滤）＝ 282', oldWay, 282)
  eq('新口径（按候选池过滤）＝ 141', newWay, 141)
  eq('差额 ＝ 141（即 D-1 的 Δ141）', round(oldWay - newWay), 141)
}

console.log('== 补充：禁用章不计（现有口径未回退）==')
{
  const track = buildTrack({ enabledByKey: { 'chapter-nature': false } })
  const { sectionAudios } = buildInputs({ omit: [] })
  const { voiceSections } = job.resolveMeditationTrackMixVoiceSections({ sectionAudios, sectionRaws: [] })
  eq('禁用 chapter-nature ⇒ 前导静音只剩颂钵章 141',
    job.resolveMeditationTrackMixLeadingSilenceSeconds({ voiceSections, track, sectionAudios }), 141)
}

console.log(`\n结果：${pass} PASS / ${fail} FAIL`)
if (fail > 0) {
  console.log(`失败项：${failures.join(' | ')}`)
  process.exit(1)
}
