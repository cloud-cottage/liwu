// ─── 写侧云函数 `meditation-write`：契约 / 鉴权 / 写原语 / CRUD 桩面测试 ───────────────────
//
// 被验对象（均可用桩对象驱动**真实执行路径**，**零 fixture 分支**）：
//   · cloudfunctions/meditation-write/lib/write-contract.js（纯逻辑：错误码 / action / 入参校验 /
//     R40 深比较 / 删除计数 / 槽位校验 / 各集合写入载荷）
//   · cloudfunctions/meditation-write/index.js（`__test__`：authorizeAdmin / updateDocumentAndVerify /
//     removeDocumentStrict / ACTION_HANDLERS …）
//
// 覆盖（任务验收 ⑤ ＋ 安全面）：
//   ① 契约与纯逻辑（action 必填、入参校验、键序无关＋Date 归一深比较、删除计数、槽位取值域）；
//   ② 鉴权（强绑定 framework_context / 弱绑定 claimed_auth_uid / 六类显式拒绝）；
//   ③ 写原语（R40 读回比对三态；R38-① 删除断言）；
//   ④ CRUD handler（list / get / create / update / remove / section-raw cascade）；
//   ⑤ 静态边界（不引 meditation-read、写函数不签发 URL、R40 / R38 文案在位）。
//
// 【证据分级】本文件＝**桩面 / 静态测试**（不等于真实 CloudBase 往返）；真调读数见交付报告。
//
// 运行：node scripts/tests/meditation-write.test.mjs

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const contract = require('../../cloudfunctions/meditation-write/lib/write-contract.js')
const norm = require('../../cloudfunctions/meditation-write/lib/meditation-track-normalizers.js')
const template = require('../../cloudfunctions/meditation-write/lib/meditation-track-template.js')
const meditationWrite = require('../../cloudfunctions/meditation-write/index.js')

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

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')
const readSource = (relativePath) => readFileSync(join(REPO_ROOT, relativePath), 'utf8')

// ─── 通用桩 db（内存 store；可控 update / remove 返回体） ─────────────────────────────
const matchCond = (doc, cond = {}) => Object.entries(cond).every(([key, value]) => {
  if (value && typeof value === 'object' && value.__in) {
    return value.__in.includes(doc[key])
  }
  return doc[key] === value
})

const createDb = (seed = {}, overrides = {}) => {
  const store = new Map()
  Object.entries(seed).forEach(([name, docs]) => {
    store.set(name, (docs || []).map((doc) => ({ ...doc })))
  })
  const rows = (name) => store.get(name) || []

  const db = {
    command: {
      in: (values) => ({ __in: values }),
      gt: (value) => ({ __gt: value })
    },
    collection: (name) => ({
      doc: (id) => ({
        get: async () => ({ data: rows(name).filter((doc) => doc._id === id) }),
        update: async (payload) => (
          overrides.update
            ? overrides.update(name, id, payload)
            : { updated: rows(name).some((doc) => doc._id === id) ? 1 : 0 }
        ),
        remove: async () => (
          overrides.remove
            ? overrides.remove(name, id)
            : { deleted: rows(name).some((doc) => doc._id === id) ? 1 : 0 }
        )
      }),
      where: (cond) => ({
        limit: (n) => ({ get: async () => ({ data: rows(name).filter((doc) => matchCond(doc, cond)).slice(0, n) }) }),
        get: async () => ({ data: rows(name).filter((doc) => matchCond(doc, cond)) }),
        count: async () => ({ total: rows(name).filter((doc) => matchCond(doc, cond)).length })
      }),
      limit: (n) => ({ get: async () => ({ data: rows(name).slice(0, n) }) }),
      add: async (data) => (
        overrides.add ? overrides.add(name, data) : { id: `auto_${name}_${rows(name).length + 1}` }
      )
    })
  }

  return db
}

const stubApp = ({ identity = {} } = {}) => ({
  database: () => createDb(),
  auth: () => ({ getUserInfo: () => ({ ...identity }) })
})

// 有状态桩 db（供 updateTrack 部分更新链路：create→update→get 真读回）：update/remove 真改内存 store。
const createStatefulDb = (seed = {}) => {
  const store = new Map()
  Object.entries(seed).forEach(([name, docs]) => {
    store.set(name, (docs || []).map((doc) => ({ ...doc })))
  })
  const rows = (name) => {
    if (!store.has(name)) {
      store.set(name, [])
    }
    return store.get(name)
  }
  let seq = 0

  return {
    command: { in: (values) => ({ __in: values }), gt: (value) => ({ __gt: value }) },
    collection: (name) => ({
      doc: (id) => ({
        get: async () => ({ data: rows(name).filter((doc) => doc._id === id) }),
        update: async (payload) => {
          const doc = rows(name).find((item) => item._id === id)
          if (!doc) {
            return { updated: 0 }
          }
          Object.assign(doc, payload)
          return { updated: 1 }
        },
        remove: async () => {
          const list = rows(name)
          const index = list.findIndex((item) => item._id === id)
          if (index < 0) {
            return { deleted: 0 }
          }
          list.splice(index, 1)
          return { deleted: 1 }
        }
      }),
      where: (cond) => ({
        limit: (n) => ({ get: async () => ({ data: rows(name).filter((doc) => matchCond(doc, cond)).slice(0, n) }) }),
        get: async () => ({ data: rows(name).filter((doc) => matchCond(doc, cond)) }),
        count: async () => ({ total: rows(name).filter((doc) => matchCond(doc, cond)).length })
      }),
      limit: (n) => ({ get: async () => ({ data: rows(name).slice(0, n) }) }),
      add: async (data) => {
        seq += 1
        const id = `auto_${name}_${seq}`
        rows(name).push({ ...data, _id: id })
        return { id }
      }
    })
  }
}

// 默认 admin 种子（u-admin 带【管理员】标签；u-plain 无标签）。
const ADMIN_SEED = {
  users: [
    { _id: 'u-admin', uid: 102, auth_uid: 'phone_13900000001', _openid: 'openid-abc', phone: '13900000001' },
    { _id: 'u-plain', uid: 200, auth_uid: 'phone_13900000002', _openid: 'openid-plain' }
  ],
  user_tags: [{ _id: 'ut1', user_id: 'u-admin', tag_id: 't-admin' }],
  tags: [{ _id: 't-admin', name: '管理员' }]
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n== ① 契约与纯逻辑 ==')

{
  const r1 = contract.resolveAction({})
  ok('A-R1 缺省 action ⇒ INVALID_ACTION（写函数无安全缺省）', r1.ok === false && r1.error.error === 'INVALID_ACTION')
  const r2 = contract.resolveAction({ action: 123 })
  ok('A-R2 非字符串 action ⇒ INVALID_ACTION', r2.ok === false && r2.error.error === 'INVALID_ACTION')
  const r3 = contract.resolveAction({ action: 'listParagraphs' })
  ok('A-R3 合法 action 通过', r3.ok === true && r3.action === 'listParagraphs')

  const id1 = contract.readRequiredId({})
  ok('A-R4 缺 id ⇒ INVALID_PARAMS', id1.ok === false && id1.error.error === 'INVALID_PARAMS')
  const d1 = contract.readRequiredData({ data: [] })
  ok('A-R5 data 非对象 ⇒ INVALID_PARAMS', d1.ok === false && d1.error.error === 'INVALID_PARAMS')
  eq('A-R6 limit 封顶', contract.readOptionalLimit({ limit: 99999 }), contract.MAX_LIST_PER_REQUEST)

  ok('A-R7 深比较：键序无关', contract.deepEqualLoose({ a: 1, b: { x: 1, y: 2 } }, { b: { y: 2, x: 1 }, a: 1 }) === true)
  ok(
    'A-R8 深比较：Date 归一为 ISO',
    contract.deepEqualLoose({ t: new Date('2020-01-01T00:00:00.000Z') }, { t: '2020-01-01T00:00:00.000Z' }) === true
  )
  ok('A-R9 深比较：数组顺序相关', contract.deepEqualLoose([1, 2, 3], [3, 2, 1]) === false)
  ok('A-R10 深比较：键集不同 ⇒ false', contract.deepEqualLoose({ a: 1 }, { a: 1, b: 2 }) === false)

  eq('A-R11 删除计数：{deleted:0}', contract.resolveDeletedCount({ deleted: 0 }), 0)
  eq('A-R12 删除计数：{data:{deleted:2}}', contract.resolveDeletedCount({ data: { deleted: 2 } }), 2)
  eq('A-R13 删除计数：缺字段 ⇒ 0', contract.resolveDeletedCount({}), 0)

  // 槽位取值域（v4.39 ＋ R49-②）：合法通过；四类非法逐项拒绝。
  const CH = template.MEDITATION_TRACK_CHAPTER_TEMPLATE
  const chaptersWithSlots = (slots) => CH.map((chapter) => ({
    chapter_key: chapter.chapter_key,
    order: chapter.order,
    enabled: true,
    max_duration_seconds: chapter.max_duration_seconds,
    gap_after_seconds: chapter.chapter_key === 'section-end' ? 0 : template.MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
    section_types: [...chapter.section_types],
    ...(chapter.chapter_key === 'section-start' ? { slots } : {})
  }))

  const goodSlots = [{ slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'random' }]
  ok('A-R14 合法槽位通过', contract.validateMeditationTrackSlots({ chapters: chaptersWithSlots(goodSlots) }).ok === true)
  ok(
    'A-R15 slot_index 重复 ⇒ 拒绝',
    contract.validateMeditationTrackSlots({ chapters: chaptersWithSlots([goodSlots[0], { ...goodSlots[0], slot_index: 0 }]) }).errors.some((e) => e.code === 'SLOT_INDEX_DUPLICATE')
  )
  ok(
    'A-R16 section_type 越界 ⇒ 拒绝（v4.39 取值域）',
    contract.validateMeditationTrackSlots({ chapters: chaptersWithSlots([{ ...goodSlots[0], section_type: 'sec-nature' }]) }).errors.some((e) => e.code === 'SECTION_TYPE_OUT_OF_RANGE')
  )
  ok(
    'A-R17 selector 非法 ⇒ 拒绝',
    contract.validateMeditationTrackSlots({ chapters: chaptersWithSlots([{ ...goodSlots[0], selector: { kind: 'nope' } }]) }).errors.some((e) => e.code === 'SELECTOR_INVALID')
  )
  ok(
    'A-R18 policy 非法 ⇒ 拒绝',
    contract.validateMeditationTrackSlots({ chapters: chaptersWithSlots([{ ...goodSlots[0], policy: 'bogus' }]) }).errors.some((e) => e.code === 'POLICY_INVALID')
  )
  ok(
    'A-R19 空 slots ＝ 老语义（不校验、不报错）',
    contract.validateMeditationTrackSlots({ chapters: chaptersWithSlots([]) }).ok === true
  )

  // 写入载荷组装。
  const paraPayload = contract.buildParagraphCreatePayload({ text: '你好' }, '2026-01-01T00:00:00.000Z')
  eq('A-R20 paragraph 默认 paragraph_type＝权威首项', paraPayload.paragraph_type, template.MEDITATION_PARAGRAPH_TYPE_ORDER[0])
  ok('A-R21 paragraph created_at 落位', paraPayload.created_at === '2026-01-01T00:00:00.000Z')

  const audioPayload = contract.buildSectionAudioCreatePayload({ label: 'x', secret_server_field: 'sneak', transcoded_formats: ['mp3', 'opus', 'bogus'], source_size: 1234.6 }, '2026-01-01T00:00:00.000Z')
  ok('A-R22 section-audio 未知键被剔除（白名单）', !('secret_server_field' in audioPayload))
  eq('A-R23 section-audio transcoded_formats 归一为规范顺序', audioPayload.transcoded_formats, ['opus', 'mp3'])
  eq('A-R24 section-audio source_size 取整', audioPayload.source_size, 1235)
  const audioUpdateNoSize = contract.buildSectionAudioUpdatePayload({ label: 'y' }, '2026-01-01T00:00:00.000Z')
  ok('A-R25 section-audio update 无 source_size 时不含该键', !('source_size' in audioUpdateNoSize))

  const trackCreate = contract.buildTrackCreatePayload({ track_key: 'track-x', name: 'T', chapters: chaptersWithSlots(goodSlots) }, '2026-01-01T00:00:00.000Z')
  eq('A-R26 track create version=1', trackCreate.version, 1)
  eq('A-R27 track create 槽位白名单 4 键', Object.keys(trackCreate.chapters.find((c) => c.chapter_key === 'section-start').slots[0]).sort(), ['policy', 'section_type', 'selector', 'slot_index'])
  ok('A-R28 track payload 无 URL / file_id 泄漏', !JSON.stringify(trackCreate).includes('http') && !JSON.stringify(trackCreate).includes('file_id'))
  const trackUpdate = contract.buildTrackUpdatePayload({ version: 4, name: 'T' }, '2026-01-01T00:00:00.000Z')
  eq('A-R29 track update version+1', trackUpdate.version, 5)
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n== ② 鉴权（authorizeAdmin）==')

{
  const db = createDb(ADMIN_SEED)
  const appEmpty = stubApp()
  const appCtx = stubApp({ identity: { uid: 'openid-abc' } })
  const appCtxBad = stubApp({ identity: { uid: 'openid-xyz' } })

  const noUser = await meditationWrite.__test__.authorizeAdmin({ app: appEmpty, db, callerUserId: '' })
  ok('B1 无 user_id ⇒ AUTH_REQUIRED', noUser.ok === false && noUser.error.error === 'AUTH_REQUIRED')

  const notFound = await meditationWrite.__test__.authorizeAdmin({ app: appEmpty, db, callerUserId: 'nope' })
  ok('B2 user_id 不可解析 ⇒ AUTH_USER_NOT_FOUND', notFound.ok === false && notFound.error.error === 'AUTH_USER_NOT_FOUND')

  const strong = await meditationWrite.__test__.authorizeAdmin({ app: appCtx, db, callerUserId: 'u-admin' })
  ok('B3 框架身份命中 _openid ＋ 管理员标签 ⇒ 通过（强绑定）', strong.ok === true && strong.binding === 'framework_context')

  const strongBad = await meditationWrite.__test__.authorizeAdmin({ app: appCtxBad, db, callerUserId: 'u-admin' })
  ok('B4 框架身份不匹配 ⇒ AUTH_IDENTITY_MISMATCH', strongBad.ok === false && strongBad.error.error === 'AUTH_IDENTITY_MISMATCH')

  const weak = await meditationWrite.__test__.authorizeAdmin({ app: appEmpty, db, callerUserId: 'u-admin', callerAuthUid: 'phone_13900000001' })
  ok('B5 无框架身份 ＋ auth_uid 一致 ⇒ 通过（弱绑定，登记在 README §3）', weak.ok === true && weak.binding === 'claimed_auth_uid')

  const weakMissing = await meditationWrite.__test__.authorizeAdmin({ app: appEmpty, db, callerUserId: 'u-admin' })
  ok('B6 无框架身份且缺 auth_uid ⇒ AUTH_IDENTITY_UNVERIFIED', weakMissing.ok === false && weakMissing.error.error === 'AUTH_IDENTITY_UNVERIFIED')

  const weakBad = await meditationWrite.__test__.authorizeAdmin({ app: appEmpty, db, callerUserId: 'u-admin', callerAuthUid: 'phone_wrong' })
  ok('B7 auth_uid 不匹配 ⇒ AUTH_IDENTITY_MISMATCH', weakBad.ok === false && weakBad.error.error === 'AUTH_IDENTITY_MISMATCH')

  const notAdmin = await meditationWrite.__test__.authorizeAdmin({ app: appEmpty, db, callerUserId: 'u-plain', callerAuthUid: 'phone_13900000002' })
  ok('B8 无管理员标签 ⇒ AUTH_NOT_ADMIN（服务端读库判定，非自报）', notAdmin.ok === false && notAdmin.error.error === 'AUTH_NOT_ADMIN')

  const byAuthUid = await meditationWrite.__test__.authorizeAdmin({ app: appEmpty, db, callerUserId: 'phone_13900000001', callerAuthUid: 'phone_13900000001' })
  ok('B9 user_id 走 auth_uid 解析 ⇒ 通过', byAuthUid.ok === true && byAuthUid.user_id === 'u-admin')

  const byUid = await meditationWrite.__test__.authorizeAdmin({ app: appEmpty, db, callerUserId: '102', callerAuthUid: 'phone_13900000001' })
  ok('B10 user_id 走数字 uid 解析 ⇒ 通过', byUid.ok === true && byUid.user_id === 'u-admin')
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n== ③ 写原语（R40 读回比对 / R38-① 删除断言）==')

{
  const payload = { name: 'x', updated_at: '2026-01-01T00:00:00.000Z' }
  const T = meditationWrite.__test__

  const db1 = createDb({ med_tracks: [{ _id: 't1' }] }, { update: () => ({ updated: 1 }) })
  const u1 = await T.updateDocumentAndVerify({ db: db1, collection: 'med_tracks', id: 't1', payload, entityLabel: '冥想轨道' })
  ok('C1 updated>=1 ⇒ 直接过、不读回', u1.updated === 1 && u1.readBack === false)

  // updated:0 ＋ 读回一致（键序不同）⇒ 幂等 no-op 成功
  const db2 = createDb(
    { med_tracks: [{ _id: 't1', updated_at: '2026-01-01T00:00:00.000Z', name: 'x' }] },
    { update: () => ({ updated: 0 }) }
  )
  const u2 = await T.updateDocumentAndVerify({ db: db2, collection: 'med_tracks', id: 't1', payload, entityLabel: '冥想轨道' })
  ok('C2 updated:0 且读回一致 ⇒ 幂等 no-op 成功（readBack=true）', u2.readBack === true)

  // updated:0 ＋ 读回不一致 ⇒ 抛（文案不含「无权限」）
  const db3 = createDb(
    { med_tracks: [{ _id: 't1', updated_at: '2000-01-01T00:00:00.000Z', name: 'old' }] },
    { update: () => ({ updated: 0 }) }
  )
  let threw3 = ''
  try {
    await T.updateDocumentAndVerify({ db: db3, collection: 'med_tracks', id: 't1', payload, entityLabel: '冥想轨道' })
  } catch (error) { threw3 = error.message }
  ok('C3 updated:0 且读回不一致 ⇒ 抛「未能确认写入生效（未检测到任何变化）」', threw3.includes('未能确认写入生效（未检测到任何变化）'))
  ok('C4 该文案不得声称「无权限」', !threw3.includes('无权限'))

  // updated:0 ＋ 读回缺失 ⇒ 独立文案
  const db4 = createDb({ med_tracks: [] }, { update: () => ({ updated: 0 }) })
  let threw4 = ''
  try {
    await T.updateDocumentAndVerify({ db: db4, collection: 'med_tracks', id: 'ghost', payload, entityLabel: '冥想轨道' })
  } catch (error) { threw4 = error.message }
  ok('C5 updated:0 且读回缺失 ⇒ 抛「读回未找到该文档」', threw4.includes('读回未找到该文档'))

  // code/message ⇒ 抛（CloudBase 静默失败形态）
  const db5 = createDb({ med_tracks: [{ _id: 't1' }] }, { update: () => ({ code: 'DATABASE_PERMISSION_DENIED', message: 'nope' }) })
  let threw5 = false
  try {
    await T.updateDocumentAndVerify({ db: db5, collection: 'med_tracks', id: 't1', payload, entityLabel: '冥想轨道' })
  } catch { threw5 = true }
  ok('C6 update 返回 {code,message} ⇒ 抛出（不把没报错当写到了）', threw5 === true)

  const db6 = createDb({ med_tracks: [{ _id: 't1' }] }, { remove: () => ({ deleted: 1 }) })
  const d1 = await T.removeDocumentStrict({ db: db6, collection: 'med_tracks', id: 't1', entityLabel: '冥想轨道' })
  ok('C7 deleted:1 ⇒ 成功', d1.deleted === 1)

  const db7 = createDb({ med_tracks: [] }, { remove: () => ({ deleted: 0 }) })
  let threw7 = ''
  try {
    await T.removeDocumentStrict({ db: db7, collection: 'med_tracks', id: 'ghost', entityLabel: '冥想轨道' })
  } catch (error) { threw7 = error.message }
  ok('C8 deleted:0 ⇒ 抛「影响条数为 0（文档不存在或无权删除）」', threw7.includes('影响条数为 0（文档不存在或无权删除）'))

  const db8 = createDb({ med_tracks: [{ _id: 't1' }] }, { remove: () => ({ code: 'X', message: 'y' }) })
  let threw8 = false
  try {
    await T.removeDocumentStrict({ db: db8, collection: 'med_tracks', id: 't1', entityLabel: '冥想轨道' })
  } catch { threw8 = true }
  ok('C9 remove 返回 {code,message} ⇒ 抛出', threw8 === true)
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n== ④ CRUD handler ==')

{
  const H = meditationWrite.__test__.ACTION_HANDLERS
  const dummyAuth = { ok: true, user_id: 'u-admin', binding: 'claimed_auth_uid' }

  // list / get
  const dbList = createDb({ med_paragraphs: [{ _id: 'p1', text: 'a' }, { _id: 'p2', text: 'b' }] })
  const listRes = await H.listParagraphs({ db: dbList, event: {}, requestId: 'r', auth: dummyAuth })
  ok('D1 listParagraphs 返回全部 ＋ count', listRes.ok === true && listRes.data.count === 2)

  const getMissing = await H.getParagraph({ db: dbList, event: { id: 'nope' }, requestId: 'r', auth: dummyAuth })
  ok('D2 getParagraph 缺失 ⇒ DOC_NOT_FOUND', getMissing.ok === false && getMissing.error === 'DOC_NOT_FOUND')

  const getFound = await H.getParagraph({ db: dbList, event: { id: 'p1' }, requestId: 'r', auth: dummyAuth })
  ok('D3 getParagraph 命中 ⇒ 返回文档', getFound.ok === true && getFound.data.document.text === 'a')

  // create paragraph
  const dbCreate = createDb({ med_paragraphs: [] }, { add: () => ({ id: 'new-p' }) })
  const createRes = await H.createParagraph({ db: dbCreate, event: { data: { text: 'hello' } }, requestId: 'r', auth: dummyAuth })
  ok('D4 createParagraph ⇒ 返回 id ＋ 默认 paragraph_type', createRes.ok === true && createRes.data.id === 'new-p'
    && createRes.data.document.paragraph_type === template.MEDITATION_PARAGRAPH_TYPE_ORDER[0])

  // remove paragraph deleted:0 ⇒ handler 抛
  const dbRemove = createDb({ med_paragraphs: [] }, { remove: () => ({ deleted: 0 }) })
  let threwR = false
  try {
    await H.removeParagraph({ db: dbRemove, event: { id: 'ghost' }, requestId: 'r', auth: dummyAuth })
  } catch { threwR = true }
  ok('D5 removeParagraph deleted:0 ⇒ handler 抛（不静默假成功）', threwR === true)

  // createTrack：非法槽位 ⇒ 抛并给文案
  const CH = template.MEDITATION_TRACK_CHAPTER_TEMPLATE
  const chapters = (slotsByKey = {}) => CH.map((chapter) => ({
    chapter_key: chapter.chapter_key,
    order: chapter.order,
    enabled: true,
    max_duration_seconds: chapter.max_duration_seconds,
    gap_after_seconds: chapter.chapter_key === 'section-end' ? 0 : template.MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
    section_types: [...chapter.section_types],
    ...(slotsByKey[chapter.chapter_key] ? { slots: slotsByKey[chapter.chapter_key] } : {})
  }))

  const dbTrackBad = createDb({ med_tracks: [] }, { add: () => ({ id: 't-bad' }) })
  let threwSlots = ''
  try {
    await H.createTrack({
      db: dbTrackBad,
      event: { data: { chapters: chapters({ 'section-start': [{ slot_index: 0, section_type: 'sec-nature', selector: { kind: 'pool', section_type: 'sec-nature' }, policy: 'random' }] }) } },
      requestId: 'r',
      auth: dummyAuth
    })
  } catch (error) { threwSlots = error.message }
  ok('D6 createTrack 非法槽位（越界段类型）⇒ 抛并给槽位文案', threwSlots.includes('槽位配置有') && threwSlots.includes('不属于本章允许范围'))

  const dbTrackOk = createDb({ med_tracks: [] }, { add: () => ({ id: 't-ok' }) })
  const createTrackRes = await H.createTrack({
    db: dbTrackOk,
    event: { data: { track_key: 'track-x', chapters: chapters({ 'section-start': [{ slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'random' }] }) } },
    requestId: 'r',
    auth: dummyAuth
  })
  ok('D7 createTrack 合法槽位 ⇒ 通过且 version=1', createTrackRes.ok === true && createTrackRes.data.document.version === 1)
  eq('D8 createTrack 槽位归一 4 键', Object.keys(createTrackRes.data.document.chapters.find((c) => c.chapter_key === 'section-start').slots[0]).sort(), ['policy', 'section_type', 'selector', 'slot_index'])

  // updateTrack：version+1（updated:1 直通）
  const dbTrackUpd = createDb({ med_tracks: [{ _id: 't1' }] }, { update: () => ({ updated: 1 }) })
  const updRes = await H.updateTrack({ db: dbTrackUpd, event: { id: 't1', data: { version: 4, name: 'T' } }, requestId: 'r', auth: dummyAuth })
  ok('D9 updateTrack version+1', updRes.ok === true && updRes.data.updated === 1)

  // handleRemoveSectionRaw：非 cascade 且挂候选音频 ⇒ 拒绝；cascade ⇒ 连带删除
  const dbRawGuard = createDb({ med_section_audios: [{ _id: 'a1', section_raw_id: 'r1' }], med_section_raws: [{ _id: 'r1' }] })
  const rawGuard = await meditationWrite.__test__.handleRemoveSectionRaw({ db: dbRawGuard, event: { id: 'r1' }, requestId: 'r', auth: dummyAuth })
  ok('D10 removeSectionRaw 非 cascade 挂音频 ⇒ INVALID_PARAMS（cascade_required）', rawGuard.ok === false && rawGuard.error === 'INVALID_PARAMS' && rawGuard.details.cascade_required === true)

  const dbRawCascade = createDb(
    { med_section_audios: [{ _id: 'a1', section_raw_id: 'r1' }], med_section_raws: [{ _id: 'r1' }] },
    { remove: (name) => ({ deleted: 1 }) }
  )
  const rawCascade = await meditationWrite.__test__.handleRemoveSectionRaw({ db: dbRawCascade, event: { id: 'r1', cascade: true }, requestId: 'r', auth: dummyAuth })
  ok('D11 removeSectionRaw cascade ⇒ 连带删除候选音频 ＋ raw', rawCascade.ok === true && rawCascade.data.removed_candidate_audio_count === 1 && rawCascade.data.deleted === 1)

  // whoami（无鉴权信息 ⇒ authorized=false，不抛）
  const who = await meditationWrite.__test__.handleWhoami({ app: stubApp(), db: createDb(ADMIN_SEED), event: {}, requestId: 'r' })
  ok('D12 whoami 未授权 ⇒ authorized=false（不抛）', who.ok === true && who.data.authorized === false && who.data.error_code === 'AUTH_REQUIRED')
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n== ⑤ 静态边界与文案 ==')

{
  const indexSrc = readSource('cloudfunctions/meditation-write/index.js')
  const contractSrc = readSource('cloudfunctions/meditation-write/lib/write-contract.js')

  ok('E1 R40 读回文案在位', indexSrc.includes('未能确认写入生效（未检测到任何变化）'))
  ok('E2 R38-① 删除断言文案在位', indexSrc.includes('影响条数为 0（文档不存在或无权删除）'))
  ok('E3 框架身份来自 app.auth().getUserInfo（非客户端自报）', indexSrc.includes('getUserInfo'))
  ok('E4 复用既有角色口径 ADMIN_ROLE_TAG_NAMES（未新造第二套）', contractSrc.includes('ADMIN_ROLE_TAG_NAMES') && contractSrc.includes('超级管理员') && contractSrc.includes('管理员'))
  ok('E5 写函数不签发临时链接（无 getTempFileURL）', !indexSrc.includes('getTempFileURL'))
  ok('E6 不 require meditation-read（函数目录自足；边界清晰）', !/require\([^)]*meditation-read/.test(indexSrc))

  // 只读云函数行为回归：其 index.js 仍无 DB 写动词（不得因本单被改动）。
  // 注：`.set(` 不计入——只读函数用 Map#set 组装内存映射（byId.set / urlMap.set），非 DB 写。
  const readSrc = readSource('cloudfunctions/meditation-read/index.js')
  ok('E7 meditation-read 仍为零写路径（无 .add( / .update( / .remove(）',
    !/\.(add|update|remove)\s*\(/.test(readSrc))

  // action 清单逐条：五件套 × 4 集合 ＋ whoami ＋ section-raw 删除特例。
  const expectedActions = [
    'whoami',
    'listParagraphs', 'getParagraph', 'createParagraph', 'updateParagraph', 'removeParagraph',
    'listSectionRaws', 'getSectionRaw', 'createSectionRaw', 'updateSectionRaw', 'removeSectionRaw',
    'listSectionAudios', 'getSectionAudio', 'createSectionAudio', 'updateSectionAudio', 'removeSectionAudio',
    'listTracks', 'getTrack', 'createTrack', 'updateTrack', 'removeTrack'
  ]
  eq('E8 action 清单逐条一致（21 条）', contract.ACTIONS && Object.values(contract.ACTIONS).sort(), [...expectedActions].sort())
  ok('E9 ACTION_HANDLERS 覆盖全部 action', expectedActions.every((a) => typeof meditationWrite.__test__.ACTION_HANDLERS[a] === 'function'))
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n== ⑥ updateTrack 真部分更新（回归断言：仅改 name 不得重建 / 丢失 chapters）==')

{
  const H = meditationWrite.__test__.ACTION_HANDLERS
  const dummyAuth = { ok: true, user_id: 'u-admin', binding: 'claimed_auth_uid' }
  const CH = template.MEDITATION_TRACK_CHAPTER_TEMPLATE
  const clone = (value) => JSON.parse(JSON.stringify(value))
  const slot = (index, sectionType) => ({
    slot_index: index,
    section_type: sectionType,
    selector: { kind: 'pool', section_type: sectionType, tags: [] },
    policy: 'random'
  })

  // create 载荷：section-start 带 1 个槽 + gap 5；section-end enabled=false；其余默认。
  const buildChapters = () => CH.map((chapter) => {
    const base = {
      chapter_key: chapter.chapter_key,
      order: chapter.order,
      enabled: true,
      max_duration_seconds: chapter.max_duration_seconds,
      gap_after_seconds: chapter.chapter_key === 'section-end'
        ? 0
        : template.MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
      section_types: [...chapter.section_types]
    }
    if (chapter.chapter_key === 'section-start') {
      return { ...base, gap_after_seconds: 5, slots: [slot(0, 'anchorGreeting')] }
    }
    if (chapter.chapter_key === 'section-end') {
      return { ...base, enabled: false }
    }
    return base
  })

  const db = createStatefulDb({ med_tracks: [] })

  const created = await H.createTrack({
    db,
    event: { data: { track_key: 'track-partial', name: '一版', chapters: buildChapters() } },
    requestId: 'r',
    auth: dummyAuth
  })
  ok('F1 createTrack（带 slots/gap/enabled=false）成功、version=1', created.ok === true && created.data.document.version === 1)
  const trackId = created.data.id

  // 快照（深拷贝，避免与库内对象别名导致「比较恒真」）——create 后的章节基线。
  const beforeDoc = clone((await H.getTrack({ db, event: { id: trackId }, requestId: 'r', auth: dummyAuth })).data.document)
  const beforeChapters = beforeDoc.chapters
  const startBefore = beforeChapters.find((c) => c.chapter_key === 'section-start')
  const endBefore = beforeChapters.find((c) => c.chapter_key === 'section-end')
  ok('F2 create 后 section-start 有 1 个槽', Array.isArray(startBefore.slots) && startBefore.slots.length === 1)
  eq('F3 create 后 section-start gap=5', startBefore.gap_after_seconds, 5)
  eq('F4 create 后 section-end enabled=false', endBefore.enabled, false)

  // ① update 仅 name ⇒ chapters 逐字段不变（slots 数量与内容、gap、enabled 全保真）。
  const upd1 = await H.updateTrack({ db, event: { id: trackId, data: { name: '一版 v2' } }, requestId: 'r', auth: dummyAuth })
  ok('F5 updateTrack 仅 name ⇒ 成功', upd1.ok === true)
  const after1 = clone((await H.getTrack({ db, event: { id: trackId }, requestId: 'r', auth: dummyAuth })).data.document)
  eq('F6 update 仅 name ⇒ name 已改', after1.name, '一版 v2')
  eq('F7 update 仅 name ⇒ chapters 逐字段与 create 后完全相同', after1.chapters, beforeChapters)
  const startAfter1 = after1.chapters.find((c) => c.chapter_key === 'section-start')
  eq('F8 update 仅 name ⇒ slots 未丢（仍 1 个、内容一致）', startAfter1.slots, startBefore.slots)
  eq('F9 update 仅 name ⇒ section-start gap 未变（5，非模板默认 141）', startAfter1.gap_after_seconds, 5)
  eq('F10 update 仅 name ⇒ section-end enabled 未变（false，非 true）', after1.chapters.find((c) => c.chapter_key === 'section-end').enabled, false)
  eq('F11 update 后 version=2（库内基线 +1）', after1.version, 2)

  // ② update 传部分 chapters ⇒ 未提及的章不变；提及的章只改传入子字段。
  const upd2 = await H.updateTrack({
    db,
    event: { id: trackId, data: { chapters: [{ chapter_key: 'section-truth', gap_after_seconds: 30 }] } },
    requestId: 'r',
    auth: dummyAuth
  })
  ok('F12 updateTrack 传部分 chapters ⇒ 成功', upd2.ok === true)
  const after2 = clone((await H.getTrack({ db, event: { id: trackId }, requestId: 'r', auth: dummyAuth })).data.document)
  eq('F13 未提及的章（section-start）逐字段不变', after2.chapters.find((c) => c.chapter_key === 'section-start'), startBefore)
  eq('F14 提及的章 section-truth gap 更新为 30', after2.chapters.find((c) => c.chapter_key === 'section-truth').gap_after_seconds, 30)
  eq('F15 未提及的章 section-end enabled 仍 false', after2.chapters.find((c) => c.chapter_key === 'section-end').enabled, false)
  eq('F16 未提及的章 chapter-nature 与 create 后一致', after2.chapters.find((c) => c.chapter_key === 'chapter-nature'), beforeChapters.find((c) => c.chapter_key === 'chapter-nature'))

  // ③ update 传某章 slots ⇒ 只替换该章（其它章槽位 / 整章不动）。
  const endBefore3 = clone(after2.chapters.find((c) => c.chapter_key === 'section-end'))
  const upd3 = await H.updateTrack({
    db,
    event: { id: trackId, data: { chapters: [{ chapter_key: 'section-breath', slots: [slot(0, 'essentialBreath'), slot(1, 'flowingRespiration')] }] } },
    requestId: 'r',
    auth: dummyAuth
  })
  ok('F17 updateTrack 传某章 slots ⇒ 成功', upd3.ok === true)
  const after3 = clone((await H.getTrack({ db, event: { id: trackId }, requestId: 'r', auth: dummyAuth })).data.document)
  const breathAfter = after3.chapters.find((c) => c.chapter_key === 'section-breath')
  eq('F18 section-breath 槽位整体替换为该章传入值（2 槽）', breathAfter.slots, [slot(0, 'essentialBreath'), slot(1, 'flowingRespiration')])
  eq('F19 其它章（section-start）槽位不变', after3.chapters.find((c) => c.chapter_key === 'section-start').slots, startBefore.slots)
  eq('F20 其它章（section-end）整章不变', after3.chapters.find((c) => c.chapter_key === 'section-end'), endBefore3)

  // ④ update 传非法槽位 ⇒ 仍走槽位校验、显式拒绝。
  let threwBad = ''
  try {
    await H.updateTrack({
      db,
      event: { id: trackId, data: { chapters: [{ chapter_key: 'section-start', slots: [slot(0, 'sec-nature')] }] } },
      requestId: 'r',
      auth: dummyAuth
    })
  } catch (error) { threwBad = error.message }
  ok('F21 updateTrack 非法槽位（越界段类型）⇒ 抛并给槽位文案', threwBad.includes('槽位配置有') && threwBad.includes('不属于本章允许范围'))

  // ⑤ 未传 chapters ⇒ 写入载荷不含 chapters 键（绝不重建）；只含传入字段 + version + updated_at。
  let capturedPayload = null
  const dbCapture = createDb(
    { med_tracks: [{ _id: 't1', name: 'orig', version: 3, chapters: buildChapters() }] },
    { update: (name, id, payload) => { capturedPayload = payload; return { updated: 1 } } }
  )
  await H.updateTrack({ db: dbCapture, event: { id: 't1', data: { name: 'renamed' } }, requestId: 'r', auth: dummyAuth })
  ok('F22 未传 chapters ⇒ 写入载荷不含 chapters 键（绝不重建）', capturedPayload !== null && !('chapters' in capturedPayload))
  eq('F23 未传 chapters ⇒ 载荷 version＝库内基线+1（3→4）', capturedPayload.version, 4)
  eq('F24 未传 chapters ⇒ 载荷只含传入字段 + version + updated_at', Object.keys(capturedPayload).sort(), ['name', 'updated_at', 'version'])

  // ⑥ 纯函数契约：mergeMedTrackChapters 只合并传入子字段、未出现的章原样保留。
  const mergeNorm = norm.mergeMedTrackChapters({
    incoming: [{ chapter_key: 'section-start', gap_after_seconds: 9 }],
    existing: buildChapters()
  })
  eq('F25 mergeMedTrackChapters 未提及的章原样（section-end enabled=false 保真）', mergeNorm.find((c) => c.chapter_key === 'section-end').enabled, false)
  eq('F26 mergeMedTrackChapters 提及章只改传入子字段（gap=9、slots 保留）', [mergeNorm.find((c) => c.chapter_key === 'section-start').gap_after_seconds, mergeNorm.find((c) => c.chapter_key === 'section-start').slots.length], [9, 1])
}

console.log(`\n== 汇总：${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) {
  console.log('FAILED:', failures.join(', '))
  process.exit(1)
}
