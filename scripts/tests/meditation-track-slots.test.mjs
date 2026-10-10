// ─── 槽位化（R49）＋ D6 `getTrack` 槽位出参 回归 / 单元测试 ─────────────────────────
//
// 被验对象：
//   · 共享计划层 packages/shared-utils/meditation-track-playback-plan.js（槽位化：`chapters[].slots[]`）
//   · 共享归一 packages/shared-utils/meditation-track-normalizers.js（槽位白名单 + 老 Track 空数组）
//   · D6 云函数 cloudfunctions/meditation-read/（`getTrack` 新增 `slots` / `slot_pools`）
//
// 覆盖（任务验收）：
//   ① 老 Track 无 `slots` ⇒ plan 输出与**改造前逐字段相等**（对照冻结基线 fixture，deepStrictEqual）；
//   ② 有 `slots` ⇒ 章内槽位顺序＝数组序、`slot_index` 用数据值（非数组下标）；
//   ③ `pool` 抽签可注入（`rng`）＋ `policy=no_repeat` 不重抽（含用尽 ⇒ `NO_REPEAT_EXHAUSTED`）；
//   ④ `pinned` 锁定生效；⑤ `selections` / `segments` 均带 `slot_index`；
//   ⑥ `buildSessionSolidification` 载荷带 `slot_index`（只增不减、旧载荷逐字不变）；
//   ⑦ D6 `getTrack` 桩面：出参带逐章 `slots`（白名单，无 URL/file_id）＋ `slot_pools`（5 键＝4 键
//      ＋ **可交付标记 `deliverable`**、无 URL）；
//      老 Track ⇒ 省略 `slot_pools`、章节 `slots===[]`、**旧字段形状不变**。
//
// 【证据分级】**桩面测试**（本文件）≠ 真实云函数往返（部署后 `--params` 真调另验）。
//
// 运行：node scripts/tests/meditation-track-slots.test.mjs

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import * as plan from '../../packages/shared-utils/meditation-track-playback-plan.js'
import * as planBaseline from './fixtures/meditation-track-playback-plan.baseline.mjs'
import * as template from '../../packages/shared-utils/meditation-track-template.js'
import * as sharedNorm from '../../packages/shared-utils/meditation-track-normalizers.js'

const require = createRequire(import.meta.url)
const readContract = require('../../cloudfunctions/meditation-read/lib/read-contract.js')
const cloudNorm = require('../../cloudfunctions/meditation-read/lib/meditation-track-normalizers.js')
const meditationRead = require('../../cloudfunctions/meditation-read/index.js')

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
const deepEq = (name, actual, expected) => {
  try {
    assert.deepStrictEqual(actual, expected)
    ok(name, true)
  } catch (error) {
    ok(name, false, error.message)
  }
}

const CH = template.MEDITATION_TRACK_CHAPTER_TEMPLATE
const ALL_TYPES = template.MEDITATION_SECTION_TYPE_ORDER
const DEFAULT_GAP = template.MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT

// D6 `chapter_template`（与 cloudfunctions/meditation-read/lib/read-contract.js buildChapterTemplate 同形）。
const buildChapterTemplate = () => CH.map((chapter, index) => ({
  chapter_key: chapter.chapter_key,
  order: chapter.order,
  label: chapter.label,
  enabled_by_default: true,
  max_duration_seconds: chapter.max_duration_seconds,
  gap_after_seconds_default: index === CH.length - 1 ? 0 : DEFAULT_GAP,
  section_types: [...chapter.section_types]
}))

// plan 侧池条目形状（＝ D6 出参 `section_audio_pools[type][]`）。
const planAudio = (id, sectionType, duration = 5) => ({
  _id: id,
  section_type: sectionType,
  label: id,
  duration,
  formats: [
    { format: 'opus', url: `https://cdn.example/${id}.ogg`, mime_type: 'audio/ogg; codecs="opus"', is_fallback: false },
    { format: 'mp3', url: `https://cdn.example/${id}.mp3`, mime_type: 'audio/mpeg', is_fallback: true }
  ]
})

// 老 Track（无 `slots`；`chapters[].section_types` 旧语义）。
const oldTrackChapters = (overridesByKey = {}) => CH.map((chapter, index) => ({
  chapter_key: chapter.chapter_key,
  order: chapter.order,
  enabled: true,
  gap_after_seconds: index === CH.length - 1 ? 0 : DEFAULT_GAP,
  section_types: [...chapter.section_types],
  ...(overridesByKey[chapter.chapter_key] || {})
}))

const oldTrack = (overrides = {}) => ({
  track_key: 'track-default',
  version: 2,
  chapters: oldTrackChapters(),
  ...overrides
})

const fullPools = () => {
  const pools = {}
  ALL_TYPES.forEach((sectionType) => {
    pools[sectionType] = [
      planAudio(`${sectionType}-a`, sectionType, 10),
      planAudio(`${sectionType}-b`, sectionType, 12)
    ]
  })
  return pools
}

const seqRng = (values) => {
  let index = 0
  return () => values[index++ % values.length]
}

// ─── ① 向后兼容回归：老 Track 无 `slots` ⇒ 与改造前逐字段相等 ───────────────────────
console.log('\n== ① 向后兼容回归：老 Track（无 slots）逐字段相等（对照冻结基线） ==')

const regressionScenarios = () => [
  { name: 'S1 全章启用 + 满池', track: oldTrack(), pools: fullPools(), makeRng: () => () => 0 },
  {
    name: 'S2 禁用背景章（chapter-nature）',
    track: oldTrack({ chapters: oldTrackChapters({ 'chapter-nature': { enabled: false } }) }),
    pools: fullPools(),
    makeRng: () => () => 0
  },
  {
    name: 'S3 空池（部分 section_type 无候选）',
    track: oldTrack(),
    pools: (() => { const p = fullPools(); delete p['sec-nature']; p.anchorGreeting = []; return p })(),
    makeRng: () => () => 0.5
  },
  {
    name: 'S4 池存在但无可用格式',
    track: oldTrack(),
    pools: (() => {
      const p = fullPools()
      p.anchorGreeting = [{ _id: 'bad-1', section_type: 'anchorGreeting', duration: 9, formats: [] }]
      return p
    })(),
    makeRng: () => () => 0
  },
  {
    name: 'S5 有可播混音产物（playback_source=mix_audio）',
    track: oldTrack({ mix_audio: { version: 4, duration: 200, ogg_file_id: 'og', mp3_file_id: 'mp' } }),
    pools: fullPools(),
    makeRng: () => () => 0.9
  },
  {
    name: 'S6 满池 + rng 序列（多次抽签可复现）',
    track: oldTrack(),
    pools: fullPools(),
    makeRng: () => seqRng([0.1, 0.9, 0.3, 0.7, 0.2])
  },
  {
    name: 'S7 D6 形状：章节带 `slots: []`（空数组＝老语义）',
    track: oldTrack({ chapters: oldTrackChapters().map((chapter) => ({ ...chapter, slots: [] })) }),
    pools: fullPools(),
    makeRng: () => () => 0.4
  }
]

regressionScenarios().forEach(({ name, track, pools, makeRng }) => {
  const before = planBaseline.buildMeditationTrackPlaybackPlan({
    track,
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: pools,
    rng: makeRng()
  })
  const after = plan.buildMeditationTrackPlaybackPlan({
    track,
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: pools,
    rng: makeRng()
  })

  deepEq(`回归 ${name} 逐字段相等`, after, before)
})

{
  const after = plan.buildMeditationTrackPlaybackPlan({
    track: oldTrack(),
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: fullPools(),
    rng: () => 0
  })
  ok('回归 老路径 segments 无 slot_index（不得用稳定下标充当）', after.segments.every((s) => !('slot_index' in s)))
  ok('回归 老路径 selections 无 slot_index', after.selections.every((s) => !('slot_index' in s)))
}

// ─── ② 槽位路径：章内顺序＝数组序、slot_index 用数据值 ───────────────────────────────
console.log('\n== ② 有 slots：章内顺序＝数组序、slot_index 用数据值 ==')

// 仅启用 `section-start` 章（其余禁用，隔离断言）。
const trackWithSlots = (slots) => ({
  track_key: 'track-default',
  version: 3,
  chapters: CH.map((chapter, index) => ({
    chapter_key: chapter.chapter_key,
    order: chapter.order,
    enabled: chapter.chapter_key === 'section-start',
    gap_after_seconds: index === CH.length - 1 ? 0 : DEFAULT_GAP,
    section_types: [...chapter.section_types],
    ...(chapter.chapter_key === 'section-start' ? { slots } : {})
  }))
})

{
  const slots = [
    { slot_index: 7, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'random' },
    { slot_index: 3, section_type: 'basePreparation', selector: { kind: 'pool', section_type: 'basePreparation', tags: [] }, policy: 'random' }
  ]
  const result = plan.buildMeditationTrackPlaybackPlan({
    track: trackWithSlots(slots),
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: fullPools(),
    rng: () => 0
  })

  eq('槽位 段顺序＝数组序 [anchorGreeting, basePreparation]', result.segments.map((s) => s.section_type), ['anchorGreeting', 'basePreparation'])
  eq('槽位 segments 带 slot_index＝数据值 [7,3]（非数组下标）', result.segments.map((s) => s.slot_index), [7, 3])
  eq('槽位 selections 带 slot_index＝数据值 [7,3]', result.selections.map((s) => s.slot_index), [7, 3])
  eq('槽位 selections 顺序与段一致', result.selections.map((s) => s.section_type), ['anchorGreeting', 'basePreparation'])
  ok('槽位 每段均带 slot_index 字段', result.segments.every((s) => 'slot_index' in s))
  ok('槽位 每条选择均带 slot_index 字段', result.selections.every((s) => 'slot_index' in s))
  // slots 为准 ⇒ 仅 2 槽（模板该章有 4 个 section_type，未被 slots 覆盖的两个不进计划）。
  eq('槽位 以 slots 为准（未覆盖的 section_type 不产出）', result.segments.length, 2)
}

// ─── ③ pool 抽签可注入 + no_repeat 不重抽 ──────────────────────────────────────────
console.log('\n== ③ pool 抽签可注入 + policy=no_repeat 不重抽 ==')

// 段级/槽级 warning（带 `slot_index`）——滤掉计划级 `MIX_AUDIO_UNAVAILABLE`（本测试轨道无 mix_audio）。
const slotWarningCodes = (result) => result.warnings
  .filter((warning) => warning.slot_index !== undefined)
  .map((warning) => warning.code)

{
  const twoNoRepeat = [
    { slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'no_repeat' },
    { slot_index: 1, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'no_repeat' }
  ]
  // 池 2 条；rng 恒为 0（总会抽「第一条」）——`no_repeat` 必须剔除已用项 ⇒ 两条不同。
  const result = plan.buildMeditationTrackPlaybackPlan({
    track: trackWithSlots(twoNoRepeat),
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: fullPools(),
    rng: () => 0
  })

  const ids = result.selections.map((s) => s.audio_id)
  eq('no_repeat 两条选择均产出', result.selections.length, 2)
  ok('no_repeat 不重抽（rng 恒定仍取到不同 audio_id）', ids[0] !== ids[1], `ids=${JSON.stringify(ids)}`)
}

{
  // 池仅 1 条、两个 no_repeat 槽 ⇒ 第二条用尽 ⇒ 跳过并记 NO_REPEAT_EXHAUSTED。
  const slots = [
    { slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'no_repeat' },
    { slot_index: 1, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'no_repeat' }
  ]
  const pools = { ...fullPools(), anchorGreeting: [planAudio('only-1', 'anchorGreeting', 10)] }
  const result = plan.buildMeditationTrackPlaybackPlan({
    track: trackWithSlots(slots),
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: pools,
    rng: () => 0
  })

  eq('no_repeat 用尽 ⇒ 仅 1 段', result.segments.length, 1)
  eq('no_repeat 用尽 ⇒ 记 NO_REPEAT_EXHAUSTED', slotWarningCodes(result), ['NO_REPEAT_EXHAUSTED'])
  eq('no_repeat 用尽 warning 带 slot_index', result.warnings.find((w) => w.code === 'NO_REPEAT_EXHAUSTED').slot_index, 1)
}

// ─── ④ pinned 锁定生效 ────────────────────────────────────────────────────────────
console.log('\n== ④ pinned 锁定生效 ==')

{
  const slots = [
    { slot_index: 0, section_type: 'basePreparation', selector: { kind: 'pinned', audio_id: 'basePreparation-a' }, policy: 'random' }
  ]
  // rng 指向池尾（若无锁定会取到 `-b`）⇒ 断言仍取到 `-a`。
  const result = plan.buildMeditationTrackPlaybackPlan({
    track: trackWithSlots(slots),
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: fullPools(),
    rng: () => 0.99
  })

  eq('pinned 锁定到指定 audio_id（忽略 rng）', result.segments.map((s) => s.audio.id), ['basePreparation-a'])
  eq('pinned 段带 slot_index', result.segments.map((s) => s.slot_index), [0])
}

{
  const slots = [
    { slot_index: 0, section_type: 'basePreparation', selector: { kind: 'pinned', audio_id: 'does-not-exist' }, policy: 'random' }
  ]
  const result = plan.buildMeditationTrackPlaybackPlan({
    track: trackWithSlots(slots),
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: fullPools(),
    rng: () => 0
  })
  eq('pinned 目标缺失 ⇒ 跳过并记 PINNED_AUDIO_UNAVAILABLE', slotWarningCodes(result), ['PINNED_AUDIO_UNAVAILABLE'])
  eq('pinned 目标缺失 ⇒ 无段', result.segments.length, 0)
}

{
  const slots = [
    { slot_index: 4, section_type: 'anchorGreeting', selector: { kind: 'unknown' }, policy: 'random' }
  ]
  const result = plan.buildMeditationTrackPlaybackPlan({
    track: trackWithSlots(slots),
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: fullPools(),
    rng: () => 0
  })
  eq('selector 非法 ⇒ 记 SLOT_SELECTOR_INVALID', slotWarningCodes(result), ['SLOT_SELECTOR_INVALID'])
  eq('selector 非法 warning 带 slot_index', result.warnings.find((w) => w.code === 'SLOT_SELECTOR_INVALID').slot_index, 4)
}

// ─── ⑤ 固化载荷带 slot_index（只增不减、旧载荷逐字不变） ─────────────────────────────
console.log('\n== ⑤ buildSessionSolidification：带 slot_index（只增不减） ==')

{
  const legacySelections = [
    { section_type: 'anchorGreeting', audio_id: 'a1', duration_seconds: 10 },
    { section_type: 'anchorGreeting', audio_id: 'a2', duration_seconds: 11 }
  ]
  const before = planBaseline.buildSessionSolidification({
    trackId: 't', trackVersion: 2, dateKey: '2026-10-10', sessionKey: 's', selections: legacySelections
  })
  const after = plan.buildSessionSolidification({
    trackId: 't', trackVersion: 2, dateKey: '2026-10-10', sessionKey: 's', selections: legacySelections
  })
  deepEq('固化 回归：无 slot_index ⇒ 逐字段相等（沿用 section_type 去重）', after, before)
  ok('固化 回归：旧载荷选择项不含 slot_index', after.selections.every((s) => !('slot_index' in s)))
}

{
  const slotSelections = [
    { slot_index: 7, section_type: 'anchorGreeting', audio_id: 'a1', duration_seconds: 10 },
    { slot_index: 3, section_type: 'anchorGreeting', audio_id: 'a2', duration_seconds: 11 }
  ]
  const result = plan.buildSessionSolidification({
    trackId: 't', trackVersion: 2, dateKey: '2026-10-10', sessionKey: 's', selections: slotSelections
  })
  eq('固化 同 section_type 多槽各自保留（按 slot 去重）', result.selections.length, 2)
  ok('固化 载荷带 slot_index', result.selections.every((s) => Number.isInteger(s.slot_index)))
  ok('固化 现有键不丢（section_type/audio_id/duration_seconds）', result.selections.every((s) => (
    'section_type' in s && 'audio_id' in s && 'duration_seconds' in s
  )))
}

// ─── ⑥ 共享归一：槽位白名单 + 老 Track 空数组 ───────────────────────────────────────
console.log('\n== ⑥ 共享归一：槽位白名单（无 URL/file_id）＋ 老 Track 空数组 ==')

{
  const raw = [{
    slot_index: 2,
    section_type: 'anchorGreeting',
    selector: { kind: 'pool', section_type: 'anchorGreeting', tags: ['x'], file_id: 'DROP_FILEID' },
    policy: 'no_repeat',
    extra: 'DROP_EXTRA',
    audio_url: 'DROP_URL'
  }]
  const normalized = sharedNorm.normalizeChapterSlots(raw)

  eq('归一 槽位只有白名单键', Object.keys(normalized[0]).sort(), ['policy', 'section_type', 'selector', 'slot_index'])
  ok('归一 槽位无 URL/file_id 泄漏', JSON.stringify(normalized).indexOf('DROP') === -1)
  eq('归一 policy 原样', normalized[0].policy, 'no_repeat')
  eq('归一 selector.tags 保留', normalized[0].selector.tags, ['x'])

  const pinned = sharedNorm.normalizeChapterSlots([{ slot_index: 0, selector: { kind: 'pinned', audio_id: 'aud-x', file_id: 'DROP' }, policy: 'random' }])
  eq('归一 pinned selector 只含 kind/audio_id', Object.keys(pinned[0].selector).sort(), ['audio_id', 'kind'])
  ok('归一 pinned 无 file_id', JSON.stringify(pinned).indexOf('DROP') === -1)

  const noPolicy = sharedNorm.normalizeChapterSlots([{ slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting' } }])
  eq('归一 policy 缺省 random', noPolicy[0].policy, 'random')

  const badSelector = sharedNorm.normalizeChapterSlots([{ slot_index: 5, section_type: 'anchorGreeting', selector: { kind: 'nope' } }])
  eq('归一 非法 selector ⇒ null 且保留槽（slot_index 用数据值 5）', [badSelector.length, badSelector[0].selector, badSelector[0].slot_index], [1, null, 5])

  deepEq('两副本 normalizeChapterSlots 同值（权威源 ↔ 云函数精简副本）', cloudNorm.normalizeChapterSlots(raw), normalized)
}

{
  const legacyTrack = sharedNorm.normalizeMedTrack({
    _id: 't-old', track_key: 'track-default',
    chapters: [{ chapter_key: 'section-start', enabled: true, gap_after_seconds: 141, max_duration_seconds: 130, section_types: ['anchorGreeting'] }]
  })
  ok('归一 老 Track ⇒ chapters[].slots === []（空数组，R49-③）', legacyTrack.chapters.every((chapter) => Array.isArray(chapter.slots) && chapter.slots.length === 0))

  const slotTrack = sharedNorm.normalizeMedTrack({
    _id: 't-new', track_key: 'track-default',
    chapters: [{
      chapter_key: 'section-start',
      slots: [{ slot_index: 1, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'random', url: 'DROP_URL', file_id: 'DROP_FILEID' }]
    }]
  })
  const startChapter = slotTrack.chapters.find((chapter) => chapter.chapter_key === 'section-start')
  eq('归一 带槽位 Track ⇒ 保留 1 槽', startChapter.slots.length, 1)
  ok('归一 带槽位 Track ⇒ 槽位无 URL/file_id', JSON.stringify(startChapter.slots).indexOf('DROP') === -1)
}

// ─── ⑦ D6 读契约纯函数 + `getTrack` 桩面 ─────────────────────────────────────────────
console.log('\n== ⑦ D6 read-contract 纯函数 + getTrack 桩面 ==')

{
  const rcTrack = {
    chapters: [
      { chapter_key: 'section-start', slots: [
        { slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'basePreparation', tags: [] } },
        { slot_index: 1, section_type: 'anchorGreeting', selector: { kind: 'pinned', audio_id: 'a' } }
      ] }
    ]
  }
  eq('resolveTrackSlotsSectionTypes 引用并集（模板序）', readContract.resolveTrackSlotsSectionTypes(rcTrack), ['anchorGreeting', 'basePreparation'])
  eq('trackHasSlots=true', readContract.trackHasSlots(rcTrack), true)
  eq('trackHasSlots=false（无槽位）', readContract.trackHasSlots({ chapters: [{ chapter_key: 'chapter-nature' }] }), false)
}

const makeAudioDoc = (id, sectionType, duration = 10) => ({
  _id: id,
  section_type: sectionType,
  duration,
  label: id,
  transcoded_formats: ['opus', 'mp3'],
  file_id: `cloud://env/${id}.ogg`,
  fallback_file_id: `cloud://env/${id}.mp3`
})

const buildStubDb = ({ trackDoc, audiosByType }) => ({
  collection: (name) => {
    if (name === 'med_tracks') {
      return {
        doc: (id) => ({ get: async () => ({ data: trackDoc && (trackDoc._id === id || trackDoc.id === id) ? [trackDoc] : [] }) }),
        where: () => ({ limit: () => ({ get: async () => ({ data: trackDoc ? [trackDoc] : [] }) }) }),
        orderBy: () => ({ limit: () => ({ get: async () => ({ data: trackDoc ? [trackDoc] : [] }) }) })
      }
    }
    if (name === 'med_section_audios') {
      return {
        where: (cond) => ({
          orderBy: () => ({ limit: () => ({ get: async () => ({ data: audiosByType[cond.section_type] || [] }) }) })
        })
      }
    }
    throw new Error(`unexpected collection: ${name}`)
  }
})

const buildStubApp = (db) => ({
  database: () => db,
  getTempFileURL: async ({ fileList }) => ({
    fileList: fileList.map((item) => ({ fileID: item.fileID, tempFileURL: `https://signed.example/${encodeURIComponent(item.fileID)}` }))
  })
})

const FORBIDDEN_KEYS = ['file_id', 'fallback_file_id', 'mp3_file_id', 'audio_url', 'fallback_audio_url', 'url', 'ogg_url', 'mp3_url', 'ogg_file_id']
const scanForbidden = (root, forbiddenKeys) => {
  let hit = null
  const walk = (value, path) => {
    if (hit || value == null || typeof value !== 'object') {
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`))
      return
    }
    Object.keys(value).forEach((key) => {
      if (hit) {
        return
      }
      if (forbiddenKeys.includes(key)) {
        hit = `${path}.${key}`
        return
      }
      walk(value[key], `${path}.${key}`)
    })
  }
  walk(root, 'root')
  return hit
}

const runGetTrack = async (trackDoc, audiosByType) => {
  const db = buildStubDb({ trackDoc, audiosByType })
  return meditationRead.__test__.handleGetTrack({ app: buildStubApp(db), db, event: {}, requestId: 'unit-gettrack' })
}

{
  const trackDocWithSlots = {
    _id: 't-with-slots',
    track_key: 'track-default',
    name: '带槽位轨道',
    version: 3,
    enabled: true,
    is_default: true,
    chapters: [
      { chapter_key: 'chapter-nature', enabled: true, gap_after_seconds: DEFAULT_GAP, section_types: ['sec-nature'] },
      {
        chapter_key: 'section-start',
        enabled: true,
        gap_after_seconds: DEFAULT_GAP,
        section_types: ['anchorGreeting'],
        slots: [
          { slot_index: 5, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'no_repeat', file_id: 'DROP_FILEID' }
        ]
      }
    ]
  }
  const audiosByType = {
    'sec-nature': [makeAudioDoc('nat-1', 'sec-nature', 30)],
    anchorGreeting: [makeAudioDoc('ag-1', 'anchorGreeting', 10)]
  }
  const result = await runGetTrack(trackDocWithSlots, audiosByType)

  ok('getTrack 桩：ok=true', result.ok === true)
  eq('getTrack 桩：track.chapters 恒 6 项', result.data.track.chapters.length, 6)
  eq('getTrack 桩：handler 不返回 meta（meta 结构不变）', 'meta' in result, false)

  const startChapter = result.data.track.chapters.find((chapter) => chapter.chapter_key === 'section-start')
  eq('getTrack 桩：逐章下发 slots（1 槽）', startChapter.slots.length, 1)
  eq('getTrack 桩：slot_index 用数据值 5', startChapter.slots[0].slot_index, 5)
  eq('getTrack 桩：slots 只有白名单键', Object.keys(startChapter.slots[0]).sort(), ['policy', 'section_type', 'selector', 'slot_index'])
  ok('getTrack 桩：track.chapters[].slots 无 URL/file_id', scanForbidden(result.data.track.chapters.map((chapter) => chapter.slots), FORBIDDEN_KEYS) === null,
    String(scanForbidden(result.data.track.chapters.map((chapter) => chapter.slots), FORBIDDEN_KEYS)))

  ok('getTrack 桩：含 slot_pools（带槽位）', Boolean(result.data.slot_pools) && typeof result.data.slot_pools === 'object')
  const slotPoolEntries = Object.values(result.data.slot_pools || {}).flat()
  ok('getTrack 桩：slot_pools 条目键只有白名单 5 键（含 deliverable）', slotPoolEntries.every((entry) => (
    JSON.stringify(Object.keys(entry).sort()) === JSON.stringify(['deliverable', 'duration', 'id', 'label', 'section_type'])
  )), JSON.stringify(slotPoolEntries[0] || {}))
  ok('getTrack 桩：slot_pools 无 URL/file_id', scanForbidden(result.data.slot_pools, FORBIDDEN_KEYS) === null,
    String(scanForbidden(result.data.slot_pools, FORBIDDEN_KEYS)))
  ok('getTrack 桩：slot_pools 覆盖槽位引用的 section_type', Object.prototype.hasOwnProperty.call(result.data.slot_pools, 'anchorGreeting'))
}

{
  const legacyTrackDoc = {
    _id: 't-legacy',
    track_key: 'track-default',
    name: '老轨道',
    version: 1,
    enabled: true,
    is_default: true,
    chapters: [{ chapter_key: 'chapter-nature', enabled: true, gap_after_seconds: DEFAULT_GAP, section_types: ['sec-nature'] }]
  }
  const result = await runGetTrack(legacyTrackDoc, { 'sec-nature': [makeAudioDoc('nat-1', 'sec-nature', 30)] })

  eq('getTrack 桩：老 Track ⇒ 省略 slot_pools', 'slot_pools' in result.data, false)
  ok('getTrack 桩：老 Track ⇒ 章节 slots===[]', result.data.track.chapters.every((chapter) => Array.isArray(chapter.slots) && chapter.slots.length === 0))
  eq('getTrack 桩：老 Track data 顶层键回归不变',
    Object.keys(result.data).sort(),
    ['chapter_template', 'section_audio_pools', 'stats', 'track', 'url_policy'])
  eq('getTrack 桩：track 键回归不变',
    Object.keys(result.data.track).sort(),
    ['_id', 'background_track', 'chapters', 'description', 'enabled', 'is_default', 'name', 'total_target_seconds', 'track_key', 'version', 'voice_track'])
  eq('getTrack 桩：stats 保留 track_version', result.data.stats.track_version, 1)
}

// ─── 汇总 ─────────────────────────────────────────────────────────────────────────
console.log(`\n== 汇总：${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) {
  console.log('失败项：')
  failures.forEach((name) => console.log(`  - ${name}`))
  process.exitCode = 1
}
