// ─── 冥想「完成度上报 + 福豆发放」端侧接入（R50）· 桩面测试 ──────────────────────────────
//
// 被验对象（纯模块 / 可注入桩，**零 fixture**）：
//   packages/shared-utils/meditation-session-client.js
//     · buildMeditationSessionKey / createMeditationSessionId   —— 幂等键（含 track_key ＋ date_key ＋ 本场会话标识；无 Date.now）
//     · resolveMeditationReportSelections                       —— plan.selections ⇒ 上报 selections（slot_index / audio_id / duration_seconds）
//     · buildMeditationReportCompletionParams                   —— README §1 入参白名单
//     · createMeditationListenTracker                           —— 只吃媒体元素 currentTime 增量（R50-②）
//     · resolveMeditationReportCompletion                       —— 完播判定（R50-②(b)(c)(d)）
//     · createMeditationSessionClient                           —— 以**测试侧桩**注入 callFunction 拦云函数调用
//     · resolveMeditationReportSuccessMessage / describeMeditationReportError —— 用户可见文案
//   ＋ 源码扫描断言（非冥想调用方未动 / 冥想路径已切走客户端直写余额）。
//
// 桩一律打在**测试侧**（注入 `callFunction`）——**端侧代码零 fixture 分支**。
//
// 运行：node scripts/tests/meditation-session-report.test.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  MEDITATION_SESSION_FUNCTION_NAME,
  MEDITATION_SESSION_ERROR_CODES,
  buildMeditationSessionKey,
  createMeditationSessionId,
  resolveMeditationReportSelections,
  buildMeditationReportCompletionParams,
  createMeditationListenTracker,
  resolveMeditationReportCompletion,
  createMeditationSessionClient,
  describeMeditationReportError,
  resolveMeditationReportSuccessMessage,
  MeditationSessionError
} from '../../packages/shared-utils/meditation-session-client.js'

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

// 桩：记录每次 callFunction 的 { name, data }，并按脚本依次返回预设 envelope。
const createStubCallFunction = (responses = []) => {
  const calls = []
  let index = 0

  const stub = async ({ name, data }) => {
    calls.push({ name, data })
    const responder = responses[Math.min(index, responses.length - 1)]
    index += 1
    return typeof responder === 'function' ? responder({ name, data }) : responder
  }

  return { stub, calls }
}

// ── ① 幂等键：含 track_key ＋ date_key ＋ 本场会话标识；**绝不含 Date.now()**；同参可复现 ─────────
console.log('== session_key（R50-④ 幂等键）==')
{
  const key = buildMeditationSessionKey({ trackKey: 'track-default', dateKey: '2026-10-10', sessionId: 'abc123' })
  ok('K1 含 track_key', key.includes('track-default'), key)
  ok('K2 含 date_key', key.includes('2026-10-10'), key)
  ok('K3 含本场会话标识', key.endsWith('abc123'), key)
  ok('K4 不含 Date.now() 的特征（无 13 位毫秒时间戳）', !/\b1[0-9]{12}\b/.test(key), key)
  eq('K5 同参可复现（幂等：同一场重试复用同一 key）', key, buildMeditationSessionKey({ trackKey: 'track-default', dateKey: '2026-10-10', sessionId: 'abc123' }))
  ok('K6 长度 ≤128（README §1）', key.length <= 128, String(key.length))

  let threw = false
  try {
    buildMeditationSessionKey({ trackKey: '', dateKey: '2026-10-10', sessionId: 'x' })
  } catch (error) {
    threw = error instanceof MeditationSessionError && error.code === MEDITATION_SESSION_ERROR_CODES.invalidParams
  }
  ok('K7 缺 track_key ⇒ 显式拒绝（不静默造 key）', threw)

  const idA = createMeditationSessionId()
  const idB = createMeditationSessionId()
  ok('K8 会话标识非空且互异', Boolean(idA) && Boolean(idB) && idA !== idB, `${idA} / ${idB}`)
  ok('K9 会话标识不含 13 位毫秒时间戳', !/\b1[0-9]{12}\b/.test(idA), idA)
}

// ── ② selections：plan.selections ⇒ README 白名单形状（slot_index / audio_id / duration_seconds） ──
console.log('== selections（分段证据映射）==')
{
  const planSelections = [
    { section_type: 'sec-nature', audio_id: 'aud-nature', duration_seconds: 25.49 },
    { section_type: 'anchorGreeting', audio_id: 'aud-greet', duration_seconds: 12 },
    { section_type: 'innerIntegration', audio_id: '', duration_seconds: 60 } // 缺 id ⇒ 丢弃
  ]
  const mapped = resolveMeditationReportSelections(planSelections)
  eq('S1 形状＝{slot_index,audio_id,duration_seconds}', Object.keys(mapped[0]).sort(), ['audio_id', 'duration_seconds', 'slot_index'])
  eq('S2 缺 audio_id 的条目被丢弃', mapped.length, 2)
  eq('S3 slot_index 稳定重编号（0,1）', mapped.map((item) => item.slot_index), [0, 1])
  eq('S4 audio_id 透传', mapped.map((item) => item.audio_id), ['aud-nature', 'aud-greet'])
  eq('S5 duration_seconds 取计划实测值', mapped.map((item) => item.duration_seconds), [25.49, 12])
  eq('S6 空 / 非数组 ⇒ []', resolveMeditationReportSelections(undefined), [])
}

// ── ③ 入参白名单（README §1；不得自创字段） ─────────────────────────────────────────────
console.log('== 入参白名单（buildMeditationReportCompletionParams）==')
{
  const params = buildMeditationReportCompletionParams({
    trackKey: 'track-default',
    trackVersion: 3,
    sessionKey: 'med:track-default:2026-10-10:abc123',
    dateKey: '2026-10-10',
    selections: [{ section_type: 'sec-nature', audio_id: 'aud-1', duration_seconds: 25.49 }],
    listenedSeconds: 25.49,
    completed: true,
    endedReason: 'completed',
    mode: 'app',
    userId: 'user_001',
    // 多余键（应被丢弃、不入 data）
    extraField: 'should-be-dropped'
  })
  eq('P1 键集＝README 白名单（逐字）', Object.keys(params).sort(), [
    'completed', 'date_key', 'ended_reason', 'listened_seconds', 'mode', 'selections', 'session_key', 'track_key', 'track_version', 'user_id'
  ])
  eq('P2 track_key', params.track_key, 'track-default')
  eq('P3 track_version 为数字', params.track_version, 3)
  eq('P4 mode＝app', params.mode, 'app')
  eq('P5 completed 严格布尔', params.completed, true)
  eq('P6 多余键未进入载荷', params.extraField, undefined)
  eq('P7 selections 已映射', params.selections, [{ slot_index: 0, audio_id: 'aud-1', duration_seconds: 25.49 }])
  eq('P8 listened_seconds 非负', params.listened_seconds, 25.49)
}

// ── ④ 收听累加器：只吃媒体 currentTime 增量；前跳 / 拖动不计入并置位（R50-②(a)(c)） ──────────────
console.log('== createMeditationListenTracker（只吃 currentTime 增量）==')
{
  const tracker = createMeditationListenTracker()
  tracker.sample('mix_audio', 0)
  tracker.sample('mix_audio', 0.25)
  tracker.sample('mix_audio', 0.5)
  eq('T1 正增量累计', tracker.getSeconds(), 0.5)
  ok('T2 未前跳', tracker.hasForwardSkip() === false)

  // 前跳 / 拖动快进：Δ 远超容差 ⇒ 不计入且置位（＝「拖到末尾不算完播」）
  tracker.sample('mix_audio', 30)
  eq('T3 前跳不计入', tracker.getSeconds(), 0.5)
  ok('T4 前跳置位 forwardSkipDetected', tracker.hasForwardSkip() === true)

  // 段切换 / 回退（Δ<0）：只更新基准、不计入、也不置前跳
  const tracker2 = createMeditationListenTracker()
  tracker2.sample('voice', 10)
  tracker2.sample('voice', 0) // 段切换重置
  eq('T5 回退 / 段切换不计入', tracker2.getSeconds(), 0)
  ok('T6 回退不误置前跳', tracker2.hasForwardSkip() === false)

  // 多元素同播取最大（不重复计数）
  const tracker3 = createMeditationListenTracker()
  tracker3.sample('background', 0)
  tracker3.sample('voice', 0)
  tracker3.sample('background', 1)
  tracker3.sample('voice', 1)
  tracker3.sample('background', 2)
  tracker3.sample('voice', 2)
  eq('T7 多元素取最大（background/voice 同步 ⇒ 2，不翻倍）', tracker3.getSeconds(), 2)

  // 暂停 / 缓冲（不采样 ⇒ currentTime 不动）不推进：采样间隔内 Δ=0 也不计入
  const tracker4 = createMeditationListenTracker()
  tracker4.sample('mix_audio', 5)
  tracker4.sample('mix_audio', 5)
  eq('T8 停顿时 Δ=0 不计入', tracker4.getSeconds(), 0)

  tracker.reset()
  eq('T9 reset 归零', tracker.getSeconds(), 0)
  ok('T10 reset 复位前跳标志', tracker.hasForwardSkip() === false)
}

// ── ⑤ 完播判定（R50-②(b)(c)(d)） ───────────────────────────────────────────────────────
console.log('== resolveMeditationReportCompletion（完播判定）==')
{
  ok('C1 到末尾 ＋ 无前跳 ＋ 听满 ⇒ completed', resolveMeditationReportCompletion({ reachedNaturalEnd: true, forwardSkipDetected: false, listenedSeconds: 100, planTotalSeconds: 100 }) === true)
  ok('C2 未到末尾（用户主动结束）⇒ 非完播', resolveMeditationReportCompletion({ reachedNaturalEnd: false, forwardSkipDetected: false, listenedSeconds: 100, planTotalSeconds: 100 }) === false)
  ok('C3 前跳 / 拖动到末尾 ⇒ 非完播', resolveMeditationReportCompletion({ reachedNaturalEnd: true, forwardSkipDetected: true, listenedSeconds: 100, planTotalSeconds: 100 }) === false)
  ok('C4 听秒明显不足（取巧）⇒ 非完播', resolveMeditationReportCompletion({ reachedNaturalEnd: true, forwardSkipDetected: false, listenedSeconds: 10, planTotalSeconds: 100 }) === false)
  // 网络失败跳段不产生 currentTime 增量、也非前跳：只按「少量跳段」抽掉 ≤5% ⇒ 仍判完播（R50-②(d)）
  ok('C5 少量网络失败跳段（≤5%）不判非完播', resolveMeditationReportCompletion({ reachedNaturalEnd: true, forwardSkipDetected: false, listenedSeconds: 97, planTotalSeconds: 100 }) === true)
}

// ── ⑥ 桩拦 callFunction：正常上报入参正确 ────────────────────────────────────────────────
console.log('== createMeditationSessionClient（正常上报入参）==')
{
  const { stub, calls } = createStubCallFunction([
    { ok: true, data: { repeated: false, awarded: true, reward_points: 18, balance_after: 118, session_id: 's1', point_ledger_id: 'p1' }, meta: { request_id: 'msn_x' } }
  ])
  const client = createMeditationSessionClient({ callFunction: stub })

  const params = buildMeditationReportCompletionParams({
    trackKey: 'track-default',
    trackVersion: 1,
    sessionKey: 'med:track-default:2026-10-10:sess1',
    dateKey: '2026-10-10',
    selections: [{ section_type: 'sec-nature', audio_id: 'aud-1', duration_seconds: 25.49 }],
    listenedSeconds: 25.49,
    completed: true,
    endedReason: 'completed',
    mode: 'app',
    userId: 'user_001'
  })

  const result = await client.reportCompletion(params)

  eq('N1 函数名＝meditation-session', calls[0].name, MEDITATION_SESSION_FUNCTION_NAME)
  eq('N2 action＝reportCompletion', calls[0].data.action, 'reportCompletion')
  eq('N3 入参白名单键集（＋action）', Object.keys(calls[0].data).sort(), [
    'action', 'completed', 'date_key', 'ended_reason', 'listened_seconds', 'mode', 'selections', 'session_key', 'track_key', 'track_version', 'user_id'
  ])
  eq('N4 user_id 透传（来自现有发奖路径的 users._id）', calls[0].data.user_id, 'user_001')
  eq('N5 selections 形状＝{slot_index,audio_id,duration_seconds}', calls[0].data.selections, [{ slot_index: 0, audio_id: 'aud-1', duration_seconds: 25.49 }])
  eq('N6 mode＝app', calls[0].data.mode, 'app')
  ok('N7 成功返回 ok:true 且 data 透传', result.ok === true && result.data.awarded === true && result.data.reward_points === 18)
  eq('N8 成功文案（发放）', resolveMeditationReportSuccessMessage(result.data), '本次冥想已记入，获得 18 颗福豆。')
}

// ── ⑦ 重复结束：只调一次且同一 session_key（幂等） ─────────────────────────────────────────
console.log('== 重复结束只调一次 ＋ 同一 session_key ==')
{
  const { stub, calls } = createStubCallFunction([
    { ok: true, data: { repeated: false, awarded: true, reward_points: 18 } },
    { ok: true, data: { repeated: true, awarded: true, reward_points: 18 } }
  ])
  const client = createMeditationSessionClient({ callFunction: stub })

  // 同一场：装载计划时**一次性**确定 session_key（模拟播放器 reportSessionKeyRef）。
  const sessionKey = buildMeditationSessionKey({ trackKey: 'track-default', dateKey: '2026-10-10', sessionId: createMeditationSessionId() })
  const params = buildMeditationReportCompletionParams({
    trackKey: 'track-default', trackVersion: 1, sessionKey, dateKey: '2026-10-10',
    selections: [{ audio_id: 'aud-1', duration_seconds: 25.49 }], listenedSeconds: 25.49, completed: true, endedReason: 'completed', mode: 'app', userId: 'user_001'
  })

  // 模拟播放器的一次性护栏（`sessionPersistedRef`）：第二次结束（user_ended）直接短路、不再调云函数。
  let fired = false
  const reportOnce = async () => {
    if (fired) {
      return { reported: false }
    }
    fired = true
    return client.reportCompletion(params)
  }

  const first = await reportOnce()
  const second = await reportOnce()

  eq('R1 重复结束只调一次 callFunction', calls.length, 1)
  ok('R2 首次上报成功', first.ok === true)
  ok('R3 二次结束被护栏拦截（未再调云函数）', second.reported === false)
  ok('R4 两次使用同一 session_key', calls.every((call) => call.data.session_key === sessionKey), sessionKey)
  ok('R5 session_key 不含 Date.now() 特征', !/\b1[0-9]{12}\b/.test(sessionKey), sessionKey)

  // 服务端语义佐证：同 session_key 再发 ⇒ repeated:true（幂等键在云函数侧仍成立）
  const repeat = await client.reportCompletion(params)
  ok('R6 云端同键重发 ⇒ repeated:true（不重复发放）', repeat.ok === true && repeat.data.repeated === true)
}

// ── ⑧ 上报失败：抛错（不静默当成功）＋ 用户可见文案 ─────────────────────────────────────────
console.log('== 上报失败可见且不静默 ==')
{
  const { stub } = createStubCallFunction([
    { ok: false, error: 'REPORT_FAILED', message: '上报失败', details: { action: 'reportCompletion' } }
  ])
  const client = createMeditationSessionClient({ callFunction: stub })

  let thrown = null
  try {
    await client.reportCompletion(buildMeditationReportCompletionParams({ userId: 'u1' }))
  } catch (error) {
    thrown = error
  }

  ok('F1 失败 ⇒ 抛 MeditationSessionError（不静默当成功）', thrown instanceof MeditationSessionError)
  eq('F2 错误码按 error 透传（不解析 message）', thrown?.code, 'REPORT_FAILED')

  const visible = describeMeditationReportError(thrown)
  ok('F3 有用户可见失败文案（非空）', typeof visible === 'string' && visible.length > 0, visible)
  ok('F4 失败文案含错误码（可排查）', visible.includes('REPORT_FAILED'), visible)

  // callFunction 本身抛错 ⇒ CALL_FAILED（本地自产码），同样可给出可见文案
  const { stub: throwingStub } = createStubCallFunction([async () => { throw new Error('network down') }])
  const client2 = createMeditationSessionClient({ callFunction: throwingStub })
  let thrown2 = null
  try {
    await client2.reportCompletion(buildMeditationReportCompletionParams({ userId: 'u1' }))
  } catch (error) {
    thrown2 = error
  }
  eq('F5 callFunction 抛错 ⇒ CALL_FAILED', thrown2?.code, 'CALL_FAILED')
  ok('F6 失败一律给出可见文案', describeMeditationReportError(thrown2).length > 0)

  // 响应形状非法（缺 ok）⇒ INVALID_PAYLOAD（不静默）
  const { stub: badStub } = createStubCallFunction([{ something: 'else' }])
  const client3 = createMeditationSessionClient({ callFunction: badStub })
  let thrown3 = null
  try {
    await client3.reportCompletion(buildMeditationReportCompletionParams({ userId: 'u1' }))
  } catch (error) {
    thrown3 = error
  }
  eq('F7 形状非法 ⇒ INVALID_PAYLOAD', thrown3?.code, 'INVALID_PAYLOAD')
}

// ── ⑨ 源码扫描：非冥想调用方未动 ＋ 冥想路径已切走客户端直写余额 ────────────────────────────
console.log('== 源码扫描（非冥想调用方未动 / 冥想路径已切换）==')
{
  const cloudbaseSource = readSource('apps/app/src/services/cloudbase.js')
  const wealthSource = readSource('apps/app/src/context/WealthContext.jsx')
  const playerSource = readSource('apps/app/src/modules/meditate/MeditationPlayerScreen.jsx')

  // 非冥想调用方（觉察奖励）＋ 通用发奖 API 一律保留、未被改动
  ok('M1 `wealthService.awardCurrentUser` 定义仍在（未被删）', cloudbaseSource.includes('async awardCurrentUser('))
  ok('M2 觉察奖励调用方仍在（非冥想，未动）', cloudbaseSource.includes("description: `觉察奖励：${trimmedContent}`"))
  ok('M3 `WealthContext` 仍经 `awardCurrentUser` 发奖（通用路径未动）', wealthSource.includes('wealthService.awardCurrentUser('))

  // 冥想路径：改走云函数上报、不再客户端直写余额
  ok('M4 播放器调用 `meditationSessionService.reportCompletion`', playerSource.includes('meditationSessionService.reportCompletion('))
  ok('M5 播放器不再直连 `awardCurrentUser`', !playerSource.includes('awardCurrentUser'))
  ok('M6 播放器本地副作用 `rewardAmount: 0`（不发福豆、不写余额）', playerSource.includes('rewardAmount: 0'))
  ok('M7 播放器仅在完播 / 主动结束两处上报（ended_reason）', playerSource.includes("endedReason: 'completed'") && playerSource.includes("endedReason: 'user_ended'"))
  ok('M8 播放器一次护栏存在（sessionPersistedRef 短路）', playerSource.includes('if (sessionPersistedRef.current)'))
  ok('M9 收听秒数来自 currentTime 累加器（无墙钟赋值）', playerSource.includes('mediaListenTrackerRef.current.sample(') && !playerSource.includes('listenedSecondsRef.current = Math.max(listenedSecondsRef.current, elapsedSeconds)'))
  ok('M10 旧 180s 门槛已移除', !playerSource.includes('MIN_VALID_MEDITATION_SECONDS'))
}

console.log(`\n== 汇总：${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) {
  console.log('失败项：', failures.join(' | '))
  process.exitCode = 1
}
