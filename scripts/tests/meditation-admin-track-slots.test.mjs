// ─── 后台「冥想轨道」槽位编辑：保存载荷 / 写入前校验 / 老 Track 只读派生（R49-②③）静态测试 ──
//
// 被验对象（后台 web 侧，均为纯逻辑、无需浏览器）：
//   · apps/web/src/admin/utils/meditationTrackSlots.js
//       —— 取值域派生 / 老 Track 只读派生 / 写入前校验（UI 与写侧 database.js 共用同一份）
//   · packages/shared-utils/meditation-track-normalizers.js（保存载荷归一，**复用既有、不新造**）
//   · packages/shared-utils/meditation-track-template.js（权威取值域 / 上屏 helper）
//
// 覆盖（任务验收 ②）：
//   ① 保存载荷含 `slots` 且形状正确（白名单 4 键、selector pinned/pool 形状、无 URL/file_id 泄漏、
//      tags 归一去空）；
//   ② 四类非法输入被拒（slot_index 同章重复/无序；section_type 空/越界；pinned 目标不存在；policy 非法）
//      ＋ 附加（selector 非法 / pool 缺段类型），**逐项给文案、不得静默**；
//   ③ 老 Track（无 `slots`）保存不改 `slots`（归一为空数组、**不按 section_types 凭空写入**）
//      ＋ 只读派生展示按 `chapters[].section_types` 一类型一槽；
//   ④ 辅助口径：默认种子 Track 通过校验、帮助函数走上屏 helper（不硬编码第二份）。
//
// 【证据分级】**桩面 / 静态测试**（本文件）≠ 真实 CloudBase 往返；写侧 `updateMedTrack` 的 R40
// 读回比对见 `apps/web/src/admin/services/database.js` 的 `assertCloudBaseUpdateTookEffect`。
//
// 运行：node scripts/tests/meditation-admin-track-slots.test.mjs

import * as template from '../../packages/shared-utils/meditation-track-template.js'
import * as norm from '../../packages/shared-utils/meditation-track-normalizers.js'
import * as slots from '../../apps/web/src/admin/utils/meditationTrackSlots.js'

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

const CH = template.MEDITATION_TRACK_CHAPTER_TEMPLATE

// 六章（可给某章挂 `slots`；其余章无 `slots` ⇒ 老语义）。
const chapters = (slotsByKey = {}) => CH.map((chapter) => ({
  chapter_key: chapter.chapter_key,
  order: chapter.order,
  enabled: true,
  max_duration_seconds: chapter.max_duration_seconds,
  gap_after_seconds: chapter.chapter_key === 'section-end' ? 0 : template.MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
  section_types: [...chapter.section_types],
  ...(slotsByKey[chapter.chapter_key] ? { slots: slotsByKey[chapter.chapter_key] } : {})
}))

const audio = (id, sectionType) => ({ _id: id, id, section_type: sectionType, label: id, duration: 10 })

// ─── ① 保存载荷含 slots 且形状正确 ──────────────────────────────────────────────
console.log('\n== ① 保存载荷含 slots 且形状正确（复用 toMedTrackPayload 归一） ==')

{
  const draft = {
    _id: 't-new',
    track_key: 'track-default',
    version: 3,
    chapters: chapters({
      'section-start': [
        {
          slot_index: 0,
          section_type: 'anchorGreeting',
          selector: { kind: 'pinned', audio_id: 'ag-1', file_id: 'DROP_FILEID' },
          policy: 'random',
          url: 'DROP_URL'
        },
        {
          slot_index: 1,
          section_type: 'basePreparation',
          selector: { kind: 'pool', section_type: 'basePreparation', tags: [' calm ', '', 'morning'] },
          policy: 'no_repeat'
        }
      ]
    })
  }

  const payload = norm.toMedTrackPayload(draft)
  const startChapter = payload.chapters.find((chapter) => chapter.chapter_key === 'section-start')

  eq('载荷 章内槽位数 = 2', startChapter.slots.length, 2)
  eq('载荷 槽形状＝白名单 4 键', Object.keys(startChapter.slots[0]).sort(), ['policy', 'section_type', 'selector', 'slot_index'])
  eq('载荷 pinned 选择器形状＝kind/audio_id', Object.keys(startChapter.slots[0].selector).sort(), ['audio_id', 'kind'])
  eq('载荷 pinned audio_id 保留', startChapter.slots[0].selector.audio_id, 'ag-1')
  eq('载荷 pinned policy 保留', startChapter.slots[0].policy, 'random')
  eq('载荷 pool 选择器形状＝kind/section_type/tags', Object.keys(startChapter.slots[1].selector).sort(), ['kind', 'section_type', 'tags'])
  eq('载荷 pool tags 归一去空/trim', startChapter.slots[1].selector.tags, ['calm', 'morning'])
  eq('载荷 pool policy 保留 no_repeat', startChapter.slots[1].policy, 'no_repeat')
  ok('载荷 无 URL/file_id 泄漏（DROP 零命中）', JSON.stringify(payload).indexOf('DROP') === -1)

  // 同一份草稿 → 写入侧校验应通过。
  const result = slots.validateMeditationTrackSlots({ chapters: draft.chapters, sectionAudios: [audio('ag-1', 'anchorGreeting')] })
  ok('载荷 同一草稿通过写入前校验', result.ok === true, JSON.stringify(result.errors))
}

// ─── ② 四类非法输入被拒（逐项文案、不得静默） ────────────────────────────────────
console.log('\n== ② 四类非法输入被拒 ==')

const codesOf = (result) => result.errors.map((error) => error.code)
const validateOne = (startSlots, sectionAudios = null) => slots.validateMeditationTrackSlots({
  chapters: chapters({ 'section-start': startSlots }),
  sectionAudios
})

{
  // ②-1 slot_index 同章重复 + 无序。
  const duplicated = validateOne([
    { slot_index: 2, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'random' },
    { slot_index: 2, section_type: 'basePreparation', selector: { kind: 'pool', section_type: 'basePreparation', tags: [] }, policy: 'random' }
  ])
  ok('②-1 slot_index 重复被拒', codesOf(duplicated).includes('SLOT_INDEX_DUPLICATE'))
  ok('②-1 slot_index 无序被拒', codesOf(duplicated).includes('SLOT_INDEX_UNORDERED'))

  const unordered = validateOne([
    { slot_index: 3, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'random' },
    { slot_index: 1, section_type: 'basePreparation', selector: { kind: 'pool', section_type: 'basePreparation', tags: [] }, policy: 'random' }
  ])
  ok('②-1 slot_index 非递增被拒', codesOf(unordered).includes('SLOT_INDEX_UNORDERED'))
  ok('②-1 slot_index 非递增判非法（不静默）', unordered.ok === false)
}
{
  // ②-2 section_type 空（无推荐映射不得写空）+ 越界（不属本章允许范围）。
  const empty = validateOne([
    { slot_index: 0, section_type: '', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'random' }
  ])
  ok('②-2 section_type 空被拒', codesOf(empty).includes('SECTION_TYPE_EMPTY'))

  const outOfRange = validateOne([
    { slot_index: 0, section_type: 'sec-bowl', selector: { kind: 'pool', section_type: 'sec-bowl', tags: [] }, policy: 'random' }
  ])
  ok('②-2 section_type 越界被拒（sec-bowl 不属问候库）', codesOf(outOfRange).includes('SECTION_TYPE_OUT_OF_RANGE'))
}
{
  // ②-3 pinned audio_id 必须存在于库。
  const missing = validateOne([
    { slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pinned', audio_id: 'does-not-exist' }, policy: 'random' }
  ], [audio('ag-1', 'anchorGreeting')])
  ok('②-3 pinned 目标不存在被拒', codesOf(missing).includes('PINNED_AUDIO_MISSING'))

  const emptyPinned = validateOne([
    { slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pinned', audio_id: '' }, policy: 'random' }
  ], [audio('ag-1', 'anchorGreeting')])
  ok('②-3 pinned 未选音频被拒', codesOf(emptyPinned).includes('PINNED_AUDIO_EMPTY'))

  const present = validateOne([
    { slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pinned', audio_id: 'ag-1' }, policy: 'random' }
  ], [audio('ag-1', 'anchorGreeting')])
  ok('②-3 pinned 目标存在 ⇒ 通过', present.ok === true, JSON.stringify(present.errors))
}
{
  // ②-4 policy 属允许值。
  const badPolicy = validateOne([
    { slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'weird' }
  ])
  ok('②-4 policy 非法被拒', codesOf(badPolicy).includes('POLICY_INVALID'))

  const emptyPolicy = validateOne([
    { slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: '' }
  ])
  ok('②-4 policy 空被拒', codesOf(emptyPolicy).includes('POLICY_INVALID'))
}
{
  // 附加：selector 非法 / pool 缺段类型。
  const badSelector = validateOne([
    { slot_index: 0, section_type: 'anchorGreeting', selector: null, policy: 'random' }
  ])
  ok('附加 selector 非法被拒', codesOf(badSelector).includes('SELECTOR_INVALID'))

  const poolNoType = validateOne([
    { slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: '' }, policy: 'random' }
  ])
  ok('附加 pool 缺抽签段类型被拒', codesOf(poolNoType).includes('POOL_SECTION_TYPE_EMPTY'))
}

// 逐项文案：正确 / 拒绝都不得声称「无权限」。
{
  const result = validateOne([
    { slot_index: 1, section_type: 'sec-bowl', selector: { kind: 'pool', section_type: 'sec-bowl' }, policy: 'weird' },
    { slot_index: 1, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting' }, policy: 'random' }
  ])
  const message = slots.buildSlotValidationMessage(result)
  ok('文案 汇总含「已阻止保存」', message.includes('已阻止保存'))
  ok('文案 逐项含章名与槽位序号', message.includes('问候库') && message.includes('第 1 槽'))
  ok('文案 不声称「无权限」', !message.includes('无权限'))
}

// ─── ③ 老 Track：只读派生 + 保存不改 slots ──────────────────────────────────────
console.log('\n== ③ 老 Track（无 slots）：只读派生 + 保存不改 slots ==')

{
  const legacyTrack = { _id: 't-old', track_key: 'track-default', version: 1, chapters: chapters() }
  const normalized = norm.normalizeMedTrack(legacyTrack)

  ok('老 Track 归一后每章 slots === []（老语义）', normalized.chapters.every((chapter) => Array.isArray(chapter.slots) && chapter.slots.length === 0))

  const validation = slots.validateMeditationTrackSlots({ chapters: normalized.chapters })
  ok('老 Track 通过校验（空 slots 不校验、不迁移）', validation.ok === true, JSON.stringify(validation.errors))

  // 保存载荷：老 Track 保存不得按 section_types 凭空写入 slots。
  const payload = norm.toMedTrackPayload(legacyTrack)
  ok(
    '老 Track 保存载荷 chapters[].slots 仍为 []（不凭空写入）',
    payload.chapters.every((chapter) => Array.isArray(chapter.slots) && chapter.slots.length === 0)
  )

  // 老 Track 章节的只读派生展示：按 section_types 一类型一槽。
  const startChapter = normalized.chapters.find((chapter) => chapter.chapter_key === 'section-start')
  const derived = slots.deriveLegacyChapterSlots(startChapter)
  eq('老 Track 只读派生槽位数＝该章 section_types 数', derived.length, startChapter.section_types.length)
  eq('老 Track 只读派生顺序＝section_types 顺序', derived.map((slot) => slot.section_type), startChapter.section_types)
  ok('老 Track 只读派生标记 derived=true', derived.every((slot) => slot.derived === true))

  // 老 Track 只读派生的值本身不满足「可保存槽位」（selector 为空）⇒ 证明它是展示用、不能直接落库。
  const derivedValidation = slots.validateMeditationTrackSlots({
    chapters: chapters({ 'section-start': derived })
  })
  ok('老 Track 只读派生值直接落库会被拒（selector 为空）', derivedValidation.ok === false && codesOf(derivedValidation).includes('SELECTOR_INVALID'))
}

// ─── ④ 辅助口径 ────────────────────────────────────────────────────────────────
console.log('\n== ④ 辅助口径（默认种子 / 取值域 / 上屏 helper） ==')

{
  const seed = norm.createDefaultMeditationTrack()
  ok('默认种子 Track 通过校验（slots 为空）', slots.validateMeditationTrackSlots({ chapters: seed.chapters }).ok === true)
}

{
  const options = slots.getChapterSlotSectionTypeOptions('section-start')
  eq('取值域＝模板该章 section_types（不新造）', options.map((option) => option.section_type), [...CH.find((c) => c.chapter_key === 'section-start').section_types])
  ok('取值域标签走上屏 helper（含新代号括号）', options.every((option) => option.label.includes('（') && option.label.includes('）')))
  eq('未知章 ⇒ 取值域为空', slots.getChapterSlotSectionTypeOptions('chapter-unknown'), [])
}

console.log(`\n== 汇总：${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) {
  console.log('失败项：')
  failures.forEach((name) => console.log(`  - ${name}`))
  process.exitCode = 1
}
