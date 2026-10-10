// ─── 「池可交付判据元数据化」＋「计划层抽签 URL 无关」单元 / 回归测试 ─────────────────────
//
// 被验对象：
//   · 共享计划层 packages/shared-utils/meditation-track-playback-plan.js
//       - 「可选中」判据改为**优先**池条目的可交付标记 `deliverable`（不看 URL）；无标记才回退旧判据。
//       - 元数据-only 池（R51-①：无 URL，仅有 `deliverable`）可被选中。
//       - 带 URL 池仍可选中（**忽略 URL**）；`deliverable:false` 项**不被选中**。
//       - 元数据-only 可交付条目按交付契约（R39-④ 双格式）派生 `formats` 清单（供端侧组装清单）。
//   · D6 读契约 cloudfunctions/meditation-read/lib/read-contract.js ＋ 云函数 index.js
//       - 池**元数据**条目（`getPools` / `getTrack.slot_pools`）新增 `deliverable` 布尔标记。
//       - 判据**复用** signAudios 同款 `resolveNewActionDeliverability`（不新造第二套判据）。
//       - 未交付项**保留**（带 `deliverable:false`，不剔除）。
//   · **向后兼容**：老 Track（无 slots、URL 池、无标记）计划输出与冻结基线**逐字段相等**。
//
// 【证据分级】**桩面测试**（本文件）≠ 真实云函数往返（部署后 `--params` 真调另验）。
//
// 运行：node scripts/tests/meditation-pool-deliverable.test.mjs

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import * as plan from '../../packages/shared-utils/meditation-track-playback-plan.js'
import * as planBaseline from './fixtures/meditation-track-playback-plan.baseline.mjs'
import * as template from '../../packages/shared-utils/meditation-track-template.js'

const require = createRequire(import.meta.url)
const readContract = require('../../cloudfunctions/meditation-read/lib/read-contract.js')
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

const buildChapterTemplate = () => CH.map((chapter, index) => ({
  chapter_key: chapter.chapter_key,
  order: chapter.order,
  label: chapter.label,
  enabled_by_default: true,
  max_duration_seconds: chapter.max_duration_seconds,
  gap_after_seconds_default: index === CH.length - 1 ? 0 : DEFAULT_GAP,
  section_types: [...chapter.section_types]
}))

// 仅启用单章的 Track（隔离断言）。
const singleChapterTrack = (chapterKey) => ({
  track_key: 'track-default',
  version: 1,
  chapters: CH.map((chapter, index) => ({
    chapter_key: chapter.chapter_key,
    order: chapter.order,
    enabled: chapter.chapter_key === chapterKey,
    gap_after_seconds: index === CH.length - 1 ? 0 : DEFAULT_GAP,
    section_types: [...chapter.section_types]
  }))
})

// 老 Track（无 slots 语义；全章启用，用于向后兼容回归）。
const oldTrack = (overrides = {}) => ({
  track_key: 'track-default',
  version: 2,
  chapters: CH.map((chapter, index) => ({
    chapter_key: chapter.chapter_key,
    order: chapter.order,
    enabled: true,
    gap_after_seconds: index === CH.length - 1 ? 0 : DEFAULT_GAP,
    section_types: [...chapter.section_types]
  })),
  ...overrides
})

// 元数据-only 池条目（R51-①：只有 id / section_type / duration / label ＋ 可交付标记，**无 URL**）。
const metaAudio = (id, sectionType, { duration = 10, deliverable = true } = {}) => ({
  _id: id,
  section_type: sectionType,
  label: id,
  duration,
  deliverable
})

// 带 URL 池条目（过渡态 / 老响应）。
const urlAudio = (id, sectionType, { duration = 10, extra = {} } = {}) => ({
  _id: id,
  section_type: sectionType,
  label: id,
  duration,
  formats: [
    { format: 'opus', url: `https://cdn.example/${id}.ogg`, mime_type: 'audio/ogg; codecs="opus"', is_fallback: false },
    { format: 'mp3', url: `https://cdn.example/${id}.mp3`, mime_type: 'audio/mpeg', is_fallback: true }
  ],
  ...extra
})

const buildPools = (factory, sectionTypes = ALL_TYPES) => {
  const pools = {}
  sectionTypes.forEach((sectionType) => { pools[sectionType] = factory(sectionType) })
  return pools
}

const warningCodes = (result, { slotIndex = undefined } = {}) => result.warnings
  .filter((warning) => (
    slotIndex === undefined
      ? true
      : warning.slot_index === slotIndex
  ))
  .map((warning) => warning.code)

// ─── ① 计划层：元数据-only 池可选中（无 URL） ──────────────────────────────────────────
console.log('\n== ① 计划层：元数据-only 池可选中（deliverable 标记，无需 URL） ==')

{
  const pools = buildPools(
    (sectionType) => [metaAudio(`${sectionType}-a`, sectionType, { deliverable: true })],
    ['anchorGreeting', 'basePreparation', 'corpusAlignment', 'deeperAwareness']
  )
  const result = plan.buildMeditationTrackPlaybackPlan({
    track: singleChapterTrack('section-start'),
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: pools,
    rng: () => 0
  })

  eq('元数据池 段数＝该章 4 个 section_type 全部选中', result.segments.length, 4)
  ok('元数据池 无 NO_PLAYABLE_FORMAT（标记为真即可选中）', !warningCodes(result).includes('NO_PLAYABLE_FORMAT'))
  eq('元数据池 selections 取到正确 audio_id', result.selections.map((s) => s.audio_id), [
    'anchorGreeting-a', 'basePreparation-a', 'corpusAlignment-a', 'deeperAwareness-a'
  ])
  // 派生格式清单：按交付契约（R39-④ 双格式）opus 在前、mp3 兜底。
  eq('元数据池 派生 formats＝[opus, mp3]', result.segments[0].audio.formats.map((f) => f.format), ['opus', 'mp3'])
  ok('元数据池 派生 formats 无 URL（R51-① 零 URL）', result.segments[0].audio.formats.every((f) => f.url === ''))
  eq('元数据池 segment.audio.url 为空', result.segments[0].audio.url, '')
}

{
  // 直接断言判据函数。
  ok('selectable: deliverable=true 无 URL ⇒ true', plan.isMeditationAudioSelectable(metaAudio('x', 'anchorGreeting', { deliverable: true })))
  ok('selectable: deliverable=false（即便带 URL）⇒ false', plan.isMeditationAudioSelectable(urlAudio('y', 'anchorGreeting', { extra: { deliverable: false } })) === false)
  ok('selectable: 无标记 + 有 URL ⇒ true（旧判据回退）', plan.isMeditationAudioSelectable(urlAudio('z', 'anchorGreeting')))
  ok('selectable: 无标记 + 无 URL ⇒ false（旧判据回退）', plan.isMeditationAudioSelectable({ _id: 'w', section_type: 'anchorGreeting' }) === false)
  eq('resolveMeditationAudioDeliverable: 无标记 ⇒ null', plan.resolveMeditationAudioDeliverable(urlAudio('z', 'anchorGreeting')), null)
  eq('resolveMeditationAudioDeliverable: 有标记 ⇒ 原值', plan.resolveMeditationAudioDeliverable({ deliverable: false }), false)
}

// ─── ② 计划层：带 URL 池仍可选（忽略 URL） ─────────────────────────────────────────────
console.log('\n== ② 计划层：带 URL 池仍可选（忽略 URL） ==')

{
  // (a) URL 池 + deliverable:true（后端过渡态：既带 URL 又带标记）⇒ 可选中，URL 不影响判定。
  const pools = buildPools((sectionType) => [urlAudio(`${sectionType}-u`, sectionType, { extra: { deliverable: true } })])
  const result = plan.buildMeditationTrackPlaybackPlan({
    track: singleChapterTrack('section-start'),
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: pools,
    rng: () => 0
  })
  eq('URL+标记 池 4 段全选中', result.segments.length, 4)
  // 「忽略 URL」：带 URL 的条目其 formats 仍照常透传（不改既有输出），但判定本身不看 URL —— 由 ③ 反证。
  eq('URL+标记 池 输出 formats 保留原 URL（不改既有输出）', result.segments[0].audio.formats[0].url, 'https://cdn.example/anchorGreeting-u.ogg')
}

{
  // (b) 旧响应：URL 池、无 deliverable 字段 ⇒ 回退旧判据、逐字段沿用。
  const pools = buildPools((sectionType) => [urlAudio(`${sectionType}-legacy`, sectionType)])
  const result = plan.buildMeditationTrackPlaybackPlan({
    track: singleChapterTrack('section-start'),
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: pools,
    rng: () => 0
  })
  eq('URL-only（无标记）池 4 段全选中（旧判据回退）', result.segments.length, 4)
  ok('URL-only 池 无 NO_PLAYABLE_FORMAT', !warningCodes(result).includes('NO_PLAYABLE_FORMAT'))
}

{
  // (c) 忽略 URL 的**反证**：URL 指向「看似可用」的链接，但 deliverable:false ⇒ 不得被选中。
  const pools = buildPools(
    (sectionType) => [urlAudio(`${sectionType}-trap`, sectionType, { extra: { deliverable: false } })],
    ['anchorGreeting']
  )
  const result = plan.buildMeditationTrackPlaybackPlan({
    track: singleChapterTrack('section-start'),
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: pools,
    rng: () => 0
  })
  const anchorSelected = result.selections.some((s) => s.audio_id === 'anchorGreeting-trap')
  ok('忽略 URL 反证：带 URL 但标记为 false ⇒ 不被选中', anchorSelected === false)
  ok('忽略 URL 反证：记 NO_PLAYABLE_FORMAT', warningCodes(result).includes('NO_PLAYABLE_FORMAT'))
}

// ─── ③ 计划层：不可交付项不被选中 ──────────────────────────────────────────────────────
console.log('\n== ③ 计划层：不可交付项（deliverable:false）不被选中 ==')

{
  // 池仅含不可交付项（既有 URL 也不放行）⇒ 该段跳过、记 NO_PLAYABLE_FORMAT。
  const pools = buildPools(
    (sectionType) => [urlAudio(`${sectionType}-bad`, sectionType, { extra: { deliverable: false } })],
    ['anchorGreeting']
  )
  const result = plan.buildMeditationTrackPlaybackPlan({
    track: singleChapterTrack('section-start'),
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: pools,
    rng: () => 0
  })
  ok('全不可交付 ⇒ 该段无 segment（anchorGreeting 跳过）', result.selections.every((s) => s.section_type !== 'anchorGreeting'))
  ok('全不可交付 ⇒ 记 NO_PLAYABLE_FORMAT', warningCodes(result).includes('NO_PLAYABLE_FORMAT'))
}

{
  // 混合池（1 条不可交付 + 1 条可交付）⇒ 无论 rng 指向哪，恒选中可交付那条。
  const mixed = () => [
    urlAudio('anchorGreeting-bad', 'anchorGreeting', { extra: { deliverable: false } }),
    metaAudio('anchorGreeting-ok', 'anchorGreeting', { deliverable: true })
  ]
  for (const rngValue of [0, 0.5, 0.999]) {
    const result = plan.buildMeditationTrackPlaybackPlan({
      track: singleChapterTrack('section-start'),
      chapterTemplate: buildChapterTemplate(),
      sectionAudioPools: { anchorGreeting: mixed() },
      rng: () => rngValue
    })
    const anchorIds = result.selections.filter((s) => s.section_type === 'anchorGreeting').map((s) => s.audio_id)
    eq(`混合池（rng=${rngValue}）恒选中可交付项`, anchorIds, ['anchorGreeting-ok'])
  }
}

// ─── ④ 计划层：rng 可注入 + 抽签语义不变 ───────────────────────────────────────────────
console.log('\n== ④ 计划层：rng 可注入（元数据池）==')

{
  const pools = {
    anchorGreeting: [
      metaAudio('anchorGreeting-a', 'anchorGreeting', { deliverable: true }),
      metaAudio('anchorGreeting-b', 'anchorGreeting', { deliverable: true })
    ]
  }
  const low = plan.selectMeditationPlayableAudio({ sectionType: 'anchorGreeting', pool: pools.anchorGreeting, rng: () => 0 })
  const high = plan.selectMeditationPlayableAudio({ sectionType: 'anchorGreeting', pool: pools.anchorGreeting, rng: () => 0.999 })
  eq('rng=0 ⇒ 取首条', low.audio.id, 'anchorGreeting-a')
  eq('rng≈1 ⇒ 取末条', high.audio.id, 'anchorGreeting-b')

  const emptyPool = plan.selectMeditationPlayableAudio({ sectionType: 'anchorGreeting', pool: [], rng: () => 0 })
  eq('空池 ⇒ EMPTY_POOL', emptyPool.code, 'EMPTY_POOL')
}

{
  // 槽位路径 + no_repeat：元数据池亦可去重（rng 可注入）。
  const slots = [
    { slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'no_repeat' },
    { slot_index: 1, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'no_repeat' }
  ]
  const trackWithSlots = {
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
  }
  const pools = {
    anchorGreeting: [
      metaAudio('anchorGreeting-a', 'anchorGreeting', { deliverable: true }),
      metaAudio('anchorGreeting-b', 'anchorGreeting', { deliverable: true })
    ]
  }
  const result = plan.buildMeditationTrackPlaybackPlan({
    track: trackWithSlots,
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: pools,
    rng: () => 0
  })
  const ids = result.selections.map((s) => s.audio_id)
  eq('槽位 no_repeat 元数据池：两条均产出', result.selections.length, 2)
  ok('槽位 no_repeat 元数据池：不重抽（rng 恒定仍取不同 id）', ids[0] !== ids[1], `ids=${JSON.stringify(ids)}`)
}

// ─── ⑤ 向后兼容回归：老 Track（无 slots、URL 池）逐字段相等 ─────────────────────────────
console.log('\n== ⑤ 向后兼容回归：老 Track 逐字段相等（对照冻结基线） ==')

const fullUrlPools = () => buildPools((sectionType) => [
  urlAudio(`${sectionType}-a`, sectionType, { duration: 10 }),
  urlAudio(`${sectionType}-b`, sectionType, { duration: 12 })
])

const regressions = [
  { name: 'R1 全章启用 + 满 URL 池', track: oldTrack(), pools: fullUrlPools(), makeRng: () => () => 0 },
  {
    name: 'R2 禁用背景章（chapter-nature）',
    track: oldTrack({ chapters: oldTrack().chapters.map((c) => (c.chapter_key === 'chapter-nature' ? { ...c, enabled: false } : c)) }),
    pools: fullUrlPools(),
    makeRng: () => () => 0
  },
  {
    name: 'R3 空池（部分 section_type 无候选）',
    track: oldTrack(),
    pools: (() => { const p = fullUrlPools(); delete p['sec-nature']; p.anchorGreeting = []; return p })(),
    makeRng: () => () => 0.5
  },
  {
    name: 'R4 池存在但无可用格式（旧响应无标记）',
    track: oldTrack(),
    pools: (() => {
      const p = fullUrlPools()
      p.anchorGreeting = [{ _id: 'bad-1', section_type: 'anchorGreeting', duration: 9, formats: [] }]
      return p
    })(),
    makeRng: () => () => 0
  },
  {
    name: 'R5 满池 + rng 序列',
    track: oldTrack(),
    pools: fullUrlPools(),
    makeRng: () => { const v = [0.1, 0.9, 0.3, 0.7, 0.2]; let i = 0; return () => v[i++ % v.length] }
  },
  {
    name: 'R6 D6 形状：章节带 slots:[]（老语义）',
    track: oldTrack({ chapters: oldTrack().chapters.map((c) => ({ ...c, slots: [] })) }),
    pools: fullUrlPools(),
    makeRng: () => () => 0.4
  }
]

regressions.forEach(({ name, track, pools, makeRng }) => {
  const before = planBaseline.buildMeditationTrackPlaybackPlan({ track, chapterTemplate: buildChapterTemplate(), sectionAudioPools: pools, rng: makeRng() })
  const after = plan.buildMeditationTrackPlaybackPlan({ track, chapterTemplate: buildChapterTemplate(), sectionAudioPools: pools, rng: makeRng() })
  deepEq(`回归 ${name} 逐字段相等`, after, before)
})

// ─── ⑥ D6 读契约：池元数据带可交付标记（纯函数） ────────────────────────────────────────
console.log('\n== ⑥ D6 池元数据条目：deliverable 标记（复用 signAudios 判据） ==')

const deliverableDoc = (id, sectionType) => ({
  _id: id, section_type: sectionType, duration: 10, label: id,
  transcoded_formats: ['opus', 'mp3'],
  file_id: `cloud://env/${id}.ogg`, fallback_file_id: `cloud://env/${id}.mp3`
})
const incompleteDoc = (id, sectionType) => ({
  _id: id, section_type: sectionType, duration: 10, label: id,
  transcoded_formats: ['opus'], // 双格式不齐 ⇒ 不可交付
  file_id: `cloud://env/${id}.ogg`, fallback_file_id: `cloud://env/${id}.mp3`
})
const failedDoc = (id, sectionType) => ({
  _id: id, section_type: sectionType, duration: 10, label: id,
  transcode_status: 'failed', transcoded_formats: ['opus', 'mp3'],
  file_id: `cloud://env/${id}.ogg`, fallback_file_id: `cloud://env/${id}.mp3`
})
const rawPrefixDoc = (id, sectionType) => ({
  _id: id, section_type: sectionType, duration: 10, label: id,
  transcoded_formats: ['opus', 'mp3'],
  file_id: `cloud://env/meditation-audio-raw/${id}.ogg`,
  fallback_file_id: `cloud://env/meditation-audio-raw/${id}.mp3`
})

{
  const candidates = [
    deliverableDoc('ag-ok', 'anchorGreeting'),
    incompleteDoc('ag-ic', 'anchorGreeting'),
    failedDoc('ag-fail', 'anchorGreeting'),
    rawPrefixDoc('ag-raw', 'anchorGreeting')
  ]
  const { pools } = readContract.buildSectionAudioPoolsMetadata({ requestedSectionTypes: ['anchorGreeting'], candidates, limit: 20 })
  const byId = Object.fromEntries(pools.anchorGreeting.map((entry) => [entry.id, entry]))

  eq('池元数据 可交付条目 deliverable=true', byId['ag-ok'].deliverable, true)
  eq('池元数据 双格式不齐 ⇒ deliverable=false', byId['ag-ic'].deliverable, false)
  eq('池元数据 转码失败 ⇒ deliverable=false', byId['ag-fail'].deliverable, false)
  eq('池元数据 raw 前缀 ⇒ deliverable=false（R51-④）', byId['ag-raw'].deliverable, false)
  ok('池元数据 未交付项**保留**（不剔除）', pools.anchorGreeting.length === 4)
  eq('池元数据 条目键＝5（含 deliverable）', Object.keys(byId['ag-ok']).sort(), ['deliverable', 'duration', 'id', 'label', 'section_type'])
  ok('池元数据 无 URL / file_id 泄漏', JSON.stringify(pools).indexOf('cloud://') === -1 && JSON.stringify(pools).indexOf('http') === -1)

  // 判据复用（不新造第二套）：与 signAudios 的判定逐条一致。
  eq('复用判据：可交付 true', readContract.resolveNewActionDeliverability(deliverableDoc('x', 'anchorGreeting')).deliverable, true)
  eq('复用判据：raw 前缀 false + reason', readContract.resolveNewActionDeliverability(rawPrefixDoc('x', 'anchorGreeting')).reason, 'raw_prefix_not_signable')

  const single = readContract.buildPoolMetadataEntry({ audio: deliverableDoc('s', 'anchorGreeting'), sectionType: 'anchorGreeting' })
  eq('buildPoolMetadataEntry 直接调用带 deliverable', single.deliverable, true)
}

// ─── ⑦ D6 云函数桩面：getPools 条目带标记、getTrack slot_pools 带标记 + 仍带 URL（回归） ──
console.log('\n== ⑦ D6 getPools / getTrack 桩面（deliverable 标记 + 回归） ==')

const makeAudioDoc = (id, sectionType, duration = 10, overrides = {}) => ({
  _id: id, section_type: sectionType, duration, label: id,
  transcoded_formats: ['opus', 'mp3'],
  file_id: `cloud://env/${id}.ogg`, fallback_file_id: `cloud://env/${id}.mp3`,
  ...overrides
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

{
  // getPools：仅给 section_types（不读 Track）⇒ 池元数据条目带 deliverable（true / false 两态）。
  const db = buildStubDb({
    trackDoc: null,
    audiosByType: {
      anchorGreeting: [deliverableDoc('ag-ok', 'anchorGreeting'), incompleteDoc('ag-ic', 'anchorGreeting')]
    }
  })
  const result = await meditationRead.__test__.handleGetPools({
    app: buildStubApp(db), db, event: { action: 'getPools', section_types: ['anchorGreeting'] }, requestId: 'unit-getpools'
  })

  ok('getPools 桩：ok=true', result.ok === true)
  const entries = result.data.pools.anchorGreeting
  const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry]))
  eq('getPools 桩：可交付条目 deliverable=true', byId['ag-ok'].deliverable, true)
  eq('getPools 桩：未交付条目 deliverable=false', byId['ag-ic'].deliverable, false)
  eq('getPools 桩：条目键＝5（含 deliverable）', Object.keys(byId['ag-ok']).sort(), ['deliverable', 'duration', 'id', 'label', 'section_type'])
  ok('getPools 桩：无 URL / file_id', JSON.stringify(result.data).indexOf('cloud://') === -1 && JSON.stringify(result.data).indexOf('https://') === -1)
  eq('getPools 桩：meta 仍带计数', typeof result.meta.total_pool_entry_count, 'number')
}

{
  // getTrack：带槽位 ⇒ slot_pools 条目带 deliverable；section_audio_pools **仍带 URL**（回归）。
  const trackDoc = {
    _id: 't-slots',
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
        slots: [{ slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'random' }]
      }
    ]
  }
  const audiosByType = {
    'sec-nature': [makeAudioDoc('nat-1', 'sec-nature', 30)],
    anchorGreeting: [makeAudioDoc('ag-1', 'anchorGreeting', 10), makeAudioDoc('ag-2', 'anchorGreeting', 11, { transcoded_formats: ['opus'] })]
  }
  const db = buildStubDb({ trackDoc, audiosByType })
  const result = await meditationRead.__test__.handleGetTrack({
    app: buildStubApp(db), db, event: {}, requestId: 'unit-gettrack'
  })

  ok('getTrack 桩：ok=true', result.ok === true)

  const slotEntries = Object.values(result.data.slot_pools || {}).flat()
  const slotById = Object.fromEntries(slotEntries.map((entry) => [entry.id, entry]))
  eq('getTrack 桩：slot_pools 可交付条目 deliverable=true', slotById['ag-1'].deliverable, true)
  eq('getTrack 桩：slot_pools 未交付条目 deliverable=false', slotById['ag-2'].deliverable, false)
  eq('getTrack 桩：slot_pools 条目键＝5', Object.keys(slotById['ag-1']).sort(), ['deliverable', 'duration', 'id', 'label', 'section_type'])
  ok('getTrack 桩：slot_pools 无 URL / file_id', JSON.stringify(result.data.slot_pools).indexOf('cloud://') === -1)

  // 回归：section_audio_pools **仍带现签 URL**（URL 暂留过渡态），且旧字段形状不变。
  const sectionPoolEntries = Object.values(result.data.section_audio_pools || {}).flat()
  ok('getTrack 桩（回归）：section_audio_pools 仍带 formats[].url', sectionPoolEntries.some((entry) => (
    Array.isArray(entry.formats) && entry.formats.some((format) => typeof format.url === 'string' && format.url.startsWith('https://'))
  )))
  ok('getTrack 桩（回归）：section_audio_pools 未出现 deliverable（不改既有池形状）', sectionPoolEntries.every((entry) => !('deliverable' in entry)))
  eq('getTrack 桩（回归）：data 顶层键不变',
    Object.keys(result.data).sort(),
    ['chapter_template', 'section_audio_pools', 'slot_pools', 'stats', 'track', 'url_policy'])
  eq('getTrack 桩（回归）：track 键不变',
    Object.keys(result.data.track).sort(),
    ['_id', 'background_track', 'chapters', 'description', 'enabled', 'is_default', 'name', 'total_target_seconds', 'track_key', 'version', 'voice_track'])
}

// ─── 汇总 ─────────────────────────────────────────────────────────────────────────
console.log(`\n== 汇总：${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) {
  console.log('失败项：')
  failures.forEach((name) => console.log(`  - ${name}`))
  process.exitCode = 1
}
