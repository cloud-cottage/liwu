// ─── App 播放器「取流层」桩面测试（R51 / R49-⑤⑧ v4.34 / R42-④）──────────────────────────
//
// 被验对象：
//   apps/app/src/modules/meditate/meditationAudioSource.js（纯模块；播放器与云客户端共用）
//     · buildPlaylistItems              —— 播放清单条目（R51-①：端侧组装**只带 audio_id、零 URL**）
//     · createMeditationSignAudiosClient —— 现签调用包装（**测试侧桩拦 `callFunction`**）
//     · createMeditationAudioSourceResolver —— 预取（`fetch → blob`）＋ 缓存/释放（**桩拦 `fetch`**）
//     · resolveTrackPrefetchWindow      —— 预取窗口（R49-⑤：≥ 当前段 ＋ 下一段）
//     · resolveTrackVolume              —— 音量配比分支（R49-⑤：单流不设音量）
//   ＋ 源码接线扫描（播放器 / 服务层把上述纯模块接上）。
//
// 桩一律打在**测试侧**（注入 `callFunction` / `fetch` / `createObjectURL` / `revokeObjectURL`）
// —— **端侧代码零 fixture 分支**。
//
// 运行：node scripts/tests/meditation-app-audio-source.test.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  MEDITATION_READ_FUNCTION_NAME,
  MEDITATION_SIGN_AUDIOS_ACTION,
  MeditationAudioSourceError,
  buildSignAudiosCall,
  createMeditationSignAudiosClient,
  normalizeSignedAudio,
  buildPlaylistItems,
  resolveTrackPrefetchWindow,
  resolveTrackVolume,
  createMeditationAudioSourceResolver
} from '../../apps/app/src/modules/meditate/meditationAudioSource.js'
// 计划层（共享）：App 播放器把**元数据池** `slot_pools` 传给它抽签（R51-①）。
import { buildMeditationTrackPlaybackPlan } from '../../packages/shared-utils/meditation-track-playback-plan.js'
import * as meditationTrackTemplate from '../../packages/shared-utils/meditation-track-template.js'

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

const PLAYER_PATH = 'apps/app/src/modules/meditate/MeditationPlayerScreen.jsx'
const MODULE_PATH = 'apps/app/src/modules/meditate/meditationAudioSource.js'
const SERVICE_PATH = 'apps/app/src/services/cloudbase.js'

// 去注释（只在**代码**上做「禁用形态」断言，避免注释里引用的规范措辞误判）。
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

// 桩：记录每次 `callFunction` 的 { name, data }，按脚本返回预设 envelope（模拟 `res.result` 包装）。
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

// 现签出参单条（与 D6 `signAudios` 出参同形：`_id` ＋ `formats[]`（opus / mp3 各带链接））。
const signedAudio = (audioId, { opusUrl = `https://cdn.example/${audioId}.ogg`, mp3Url = `https://cdn.example/${audioId}.mp3` } = {}) => ({
  _id: audioId,
  section_type: 'anchorGreeting',
  label: `${audioId} label`,
  duration: 12,
  transcoded_formats: ['opus', 'mp3'],
  formats: [
    { format: 'opus', url: opusUrl, mime_type: 'audio/ogg; codecs="opus"', is_fallback: false },
    { format: 'mp3', url: mp3Url, mime_type: 'audio/mpeg', is_fallback: true }
  ]
})

const signEnvelope = (audioIds = [], { urlPolicy = { max_age_seconds: 7200, issued_at: 'x', expires_at: 'y' } } = {}) => ({
  ok: true,
  data: { audios: audioIds.map((id) => signedAudio(id)), url_policy: urlPolicy },
  meta: { signed_audio_count: audioIds.length }
})

// 桩：`fetch → Response-like`（记录取流 URL；可按 URL 指定 HTTP 状态）。
const createStubFetch = ({ failUrls = {}, defaultStatus = 200 } = {}) => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    const status = failUrls[url] || defaultStatus
    return {
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer
    }
  }
  return { fetchImpl, calls }
}

// ── ① 播放清单条目（R51-①：端侧组装**只带 audio_id、零 URL**）────────────────────────────
console.log('== ① 播放清单：端侧组装零 URL（R51-①）==')
{
  const dualAudio = {
    id: 'aud-greet',
    label: '开场',
    formats: [
      { format: 'opus', url: 'https://cdn.example/aud-greet.ogg', mime_type: 'audio/ogg' },
      { format: 'mp3', url: 'https://cdn.example/aud-greet.mp3', mime_type: 'audio/mpeg' }
    ]
  }
  const items = buildPlaylistItems({ audio: dualAudio, durationSeconds: 12 })

  ok('P1 端侧组装清单非空（opus / mp3 两条）', items.length === 2)
  ok('P2 每条携带抽中的 audio_id', items.every((item) => item.audioId === 'aud-greet'))
  ok('P3 **无任何 URL 进清单**（audioUrl 全空）', items.every((item) => item.audioUrl === ''))
  ok('P4 清单序列化后不含 http(s) 链接', !JSON.stringify(items).includes('http'))
  eq('P5 格式顺序＝响应顺序（opus 在前、mp3 兜底）', items.map((item) => item.format), ['opus', 'mp3'])
  ok('P6 mimeType 透传', items[0].mimeType === 'audio/ogg')

  // 混音单流产物：无 audio_id（不是 med_section_audios 行）⇒ 沿用 D6 已现签的产品 URL。
  const mixAudio = {
    id: '',
    formats: [{ format: 'opus', url: 'https://cdn.example/mix.ogg', mime_type: 'audio/ogg' }]
  }
  const mixItems = buildPlaylistItems({ audio: mixAudio, durationSeconds: 300 })
  ok('P7 混音单流（无 audio_id）用例外的产品 URL', mixItems.length === 1 && mixItems[0].audioId === '' && mixItems[0].audioUrl === 'https://cdn.example/mix.ogg')

  // 两条都缺 ⇒ 丢弃（不进清单）。
  eq('P8 既无 audio_id 也无 URL ⇒ 丢弃', buildPlaylistItems({ audio: { id: '', formats: [{ format: 'opus', url: '' }] } }).length, 0)
}

// ── ② signAudios 客户端（**桩拦 callFunction**）─────────────────────────────────────────
console.log('== ② 现签调用（桩拦 callFunction）==')
{
  const { stub, calls } = createStubCallFunction([{ result: signEnvelope(['a', 'b']) }])
  const client = createMeditationSignAudiosClient({ callFunction: stub })

  const result = await client.signAudios(['a', 'b', 'a', ''])

  eq('C1 只发起 1 次 callFunction', calls.length, 1)
  eq('C2 函数名＝meditation-read', calls[0].name, MEDITATION_READ_FUNCTION_NAME)
  eq('C3 action＝signAudios', calls[0].data.action, MEDITATION_SIGN_AUDIOS_ACTION)
  eq('C4 audio_ids 去重去空', calls[0].data.audio_ids, ['a', 'b'])
  eq('C5 出参 audios 归一（audioId ＋ formats）', result.audios.map((audio) => audio.audioId), ['a', 'b'])
  eq('C6 出参 url_policy 透传', result.urlPolicy.max_age_seconds, 7200)

  // 空 ids ⇒ 不发起调用（端侧不应无谓现签）。
  const emptyCalls = createStubCallFunction([{ result: signEnvelope([]) }])
  const emptyClient = createMeditationSignAudiosClient({ callFunction: emptyCalls.stub })
  const emptyResult = await emptyClient.signAudios([])
  eq('C7 空 audio_ids ⇒ 零调用', emptyCalls.calls.length, 0)
  eq('C8 空 audio_ids ⇒ 空出参', emptyResult.audios.length, 0)

  // 失败 envelope ⇒ 抛 `code` 错误（不吞、不返回部分数据）。
  const failureCalls = createStubCallFunction([{ result: { ok: false, error: 'INVALID_PARAMS', message: 'x' } }])
  const failureClient = createMeditationSignAudiosClient({ callFunction: failureCalls.stub })
  let failureCode = ''
  try {
    await failureClient.signAudios(['a'])
  } catch (error) {
    failureCode = error instanceof MeditationAudioSourceError ? error.code : `NOT_OURS:${error?.code}`
  }
  eq('C9 失败 envelope ⇒ 原样透传 error 码', failureCode, 'INVALID_PARAMS')

  // 入参 / 出参纯函数直测。
  eq('C10 buildSignAudiosCall 形状', buildSignAudiosCall(['x', 'x']), { name: 'meditation-read', data: { action: 'signAudios', audio_ids: ['x'] } })
  eq('C11 normalizeSignedAudio（无可用格式 ⇒ 空 formats）', normalizeSignedAudio({ _id: 'z', formats: [] }).formats.length, 0)
}

// ── ③ 取流解析器：预取（fetch → blob）＋ 缓存/释放（**桩拦 callFunction ＋ fetch**）──────────
console.log('== ③ 取流：预取 fetch→blob / 缓存 / 重签释放 ==')
{
  const { stub, calls: signCalls } = createStubCallFunction([
    // 第 1 次（预取 1＋2）：a1 / a2 现签
    { result: signEnvelope(['a1', 'a2']) },
    // 第 2 次（重签 a1）：换成新 URL（旧 URL 已失效）
    { result: signEnvelope(['a1'], { urlPolicy: {} }) }
  ])
  const client = createMeditationSignAudiosClient({ callFunction: stub })
  const { fetchImpl, calls: fetchCalls } = createStubFetch()
  const revoked = []
  const created = []
  const resolver = createMeditationAudioSourceResolver({
    signAudios: client.signAudios,
    fetchImpl,
    createObjectURL: (blob) => {
      const url = `blob:mock/${created.length}`
      created.push({ url, size: blob?.size })
      return url
    },
    revokeObjectURL: (url) => { revoked.push(url) }
  })

  // 预取「当前段 a1 ＋ 下一段 a2」：**一次**现签（批量），逐条 `fetch → blob`。
  await resolver.prefetchAudioIds(['a1', 'a2'])

  eq('F1 预取只发起 1 次现签（批量）', signCalls.length, 1)
  eq('F2 现签的 ids ＝ 当前段 ＋ 下一段', signCalls[0].data.audio_ids, ['a1', 'a2'])
  ok('F3 预取走 `fetch`（a1 / a2 各 2 种格式 ⇒ 4 次取流）', fetchCalls.length === 4)
  ok('F4 预取**未**用 `new Audio()+load`（取流 URL 全为签名 URL、非 blob 预热）', fetchCalls.every((url) => url.startsWith('https://')))
  eq('F5 已建 blob 数＝4', created.length, 4)

  // 播放取源：命中预取缓存 ⇒ **零新增现签、零新增 fetch**。
  const src = await resolver.resolvePlayableSrc({ audioId: 'a1', format: 'opus' })
  ok('F6 取源返回 blob URL', String(src).startsWith('blob:mock/'))
  eq('F7 复用缓存 ⇒ 无新增现签', signCalls.length, 1)
  eq('F8 复用缓存 ⇒ 无新增 fetch', fetchCalls.length, 4)

  // 403：签名失效 ⇒ 抛出，交给上层重签（R42-④）。
  const failFetch = createStubFetch({ failUrls: { 'https://cdn.example/a9.ogg': 403, 'https://cdn.example/a9.mp3': 403 } })
  const resolver403 = createMeditationAudioSourceResolver({
    signAudios: async (ids) => ({ audios: ids.map((id) => normalizeSignedAudio(signedAudio(id, { opusUrl: `https://cdn.example/${id}.ogg`, mp3Url: `https://cdn.example/${id}.mp3` }))), urlPolicy: null }),
    fetchImpl: failFetch.fetchImpl,
    createObjectURL: () => 'blob:fail',
    revokeObjectURL: () => {}
  })
  let http403Code = ''
  try {
    await resolver403.resolvePlayableSrc({ audioId: 'a9', format: 'opus' })
  } catch (error) {
    http403Code = error?.message
  }
  eq('F9 403 ⇒ 抛 `AUDIO_FETCH_403`（上层据此重签）', http403Code, 'AUDIO_FETCH_403')

  // 重签（切源）：释放旧 blob（`revokeObjectURL`）＋ 重新现签（新 URL）。
  const resigned = await resolver.resignAudio('a1')
  ok('F10 重签成功', resigned === true)
  ok('F11 切源释放旧 blob（revokeObjectURL 被调）', revoked.length >= 1)
  eq('F12 重签发起第 2 次现签', signCalls.length, 2)
  ok('F13 重签后 a1 仍在已签集合', resolver.signedAudioIds().includes('a1'))

  // 卸场：释放剩余全部 blob。
  const beforeRevoke = revoked.length
  resolver.releaseAll()
  ok('F14 卸场释放全部剩余 blob（revokeObjectURL）', revoked.length > beforeRevoke)
  eq('F15 卸场后已签集合清空', resolver.signedAudioIds().length, 0)
  eq('F16 卸场后无残留 blob 条目', resolver.hasBlobForUrl('https://cdn.example/a2.ogg'), false)
}

// ── ④ 预取窗口（R49-⑤：≥ 当前段 ＋ 下一段）──────────────────────────────────────────────
console.log('== ④ 预取窗口（当前段 ＋ 下一段）==')
{
  const segments = [
    { id: 'voice-0', trackKey: 'voice' },
    { id: 'voice-1', trackKey: 'voice' },
    { id: 'voice-2', trackKey: 'voice' },
    { id: 'voice-3', trackKey: 'voice' },
    { id: 'bg-0', trackKey: 'background' }
  ]

  eq('W1 第 0 段 ⇒ [当前, 下一]', resolveTrackPrefetchWindow({ segments, trackKey: 'voice', segmentId: 'voice-0' }).map((s) => s.id), ['voice-0', 'voice-1'])
  eq('W2 第 1 段 ⇒ [当前, 下一]', resolveTrackPrefetchWindow({ segments, trackKey: 'voice', segmentId: 'voice-1' }).map((s) => s.id), ['voice-1', 'voice-2'])
  eq('W3 末段 ⇒ 只当前段（不越界）', resolveTrackPrefetchWindow({ segments, trackKey: 'voice', segmentId: 'voice-3' }).map((s) => s.id), ['voice-3'])
  eq('W4 背景轨单段 ⇒ 只当前段', resolveTrackPrefetchWindow({ segments, trackKey: 'background', segmentId: 'bg-0' }).map((s) => s.id), ['bg-0'])
  eq('W5 找不到当前段 ⇒ 空（不猜）', resolveTrackPrefetchWindow({ segments, trackKey: 'voice', segmentId: 'nope' }).length, 0)
}

// ── ⑤ 音量配比分支（R49-⑤，硬）：端侧组装按响应值；单流不设音量 ─────────────────────────
console.log('== ⑤ 音量配比分支 ==')
{
  const volumes = { background: 0.33, voice: 1 }

  eq('V1 端侧组装 · 人声 ⇒ 响应值 1', resolveTrackVolume({ isSingleStream: false, volumes, trackKey: 'voice' }), 1)
  eq('V2 端侧组装 · 背景 ⇒ 响应值 0.33', resolveTrackVolume({ isSingleStream: false, volumes, trackKey: 'background' }), 0.33)
  eq('V3 单流 · 不设音量（恒 1，配比已烘焙）', resolveTrackVolume({ isSingleStream: true, volumes, trackKey: 'background' }), 1)
  eq('V4 端侧组装 · 响应缺值 ⇒ 回退 1', resolveTrackVolume({ isSingleStream: false, volumes: {}, trackKey: 'background' }), 1)
  eq('V5 端侧组装 · 非正响应值 ⇒ 回退 1', resolveTrackVolume({ isSingleStream: false, volumes: { voice: 0 }, trackKey: 'voice' }), 1)
  ok('V6 两条路径**分明**（同一 volumes 下、单流与组装取值不同）', resolveTrackVolume({ isSingleStream: true, volumes, trackKey: 'background' }) !== resolveTrackVolume({ isSingleStream: false, volumes, trackKey: 'background' }))
}

// ── ⑥ 源码接线扫描（播放器 / 服务层接上纯模块；禁用 `new Audio()+load` 预热）────────────────
console.log('== ⑥ 源码接线扫描 ==')
{
  const playerSource = readSource(PLAYER_PATH)
  const moduleSource = readSource(MODULE_PATH)
  const serviceSource = readSource(SERVICE_PATH)
  // 代码视图（去注释）：供「禁用形态 / 计数」断言使用。
  const playerCode = stripComments(playerSource)
  const moduleCode = stripComments(moduleSource)

  ok('S1 播放器 import 取流纯模块', playerSource.includes("from './meditationAudioSource.js'"))
  ok('S2 播放器接线 `meditationReadService.signAudios`（现签通道）', playerSource.includes('meditationReadService.signAudios(audioIds)'))
  ok('S3 播放器用 `createMeditationAudioSourceResolver` 建解析器', playerSource.includes('createMeditationAudioSourceResolver('))
  ok('S4 播放器用 `buildPlaylistItems` 组装清单（旧本地构造器已下线）', playerSource.includes('buildPlaylistItems({') && !playerSource.includes('buildRuntimePlaylistItems'))
  ok('S5 播放器用 `resolveTrackPrefetchWindow`（窗口 ≥ 当前 ＋ 下一）', playerSource.includes('resolveTrackPrefetchWindow('))
  ok('S6 播放器用 `resolveTrackVolume`（音量分支）', playerSource.includes('resolveTrackVolume('))
  ok('S7 播放器在开播前调 `prefetchTrackSegments`（预取）', playerSource.includes('prefetchTrackSegments(trackKey, segment)'))
  ok('S8 播放器 403 恢复走 `tryResignSegmentAudio`（重签，不再重取整场 Track）', playerSource.includes('tryResignSegmentAudio(') && !playerSource.includes('reissueSegmentPlaylist'))
  ok('S9 播放器卸场释放 blob（`releaseAll`）', playerSource.includes('releaseAll()'))

  // 取流层（预取所在）**绝不用 `new Audio()+load` 预热**；也不引入 Web Audio。
  ok('S10 取流模块无 `new Audio`', !moduleCode.includes('new Audio'))
  ok('S11 取流模块无 `.load(`（禁 `new Audio()+load` 预热）', !moduleCode.includes('.load('))
  ok('S12 取流模块无 Web Audio（不引入无缝调度）', !/AudioContext|AudioWorklet/.test(moduleCode))
  ok('S13 取流模块只用 `fetch` ＋ `Blob` ＋ `URL.createObjectURL`', moduleCode.includes('fetchImpl(url') && moduleCode.includes('new Blob(') && moduleCode.includes('createObjectURL('))

  // 播放器的 `new Audio()` 只用于三条轨的媒体元素（双轨两条 ＋ 混音单流一条）⇒ 不得新增预热元素。
  const audioElementCount = (playerCode.match(/new Audio\(\)/g) || []).length
  eq('S14 播放器 `new Audio()` 仅 3 处（背景 / 人声 / 混音 三元素，无预热元素）', audioElementCount, 3)

  ok('S15 服务层导出 `signAudios` 现签通道', serviceSource.includes('signAudios: (audioIds = []) => meditationSignAudiosClient.signAudios(audioIds)'))
  ok('S16 服务层用 `createMeditationSignAudiosClient`（同一套代码）', serviceSource.includes('createMeditationSignAudiosClient('))
}

// ── ⑦ App 抽签源＝元数据池 `slot_pools`（无 URL）＋ `deliverable` 真正被消费（R51-①）────────────
// 覆盖本单验收：① 元数据池（无 URL）能选中（deliverable:true）；② `deliverable:false` 恒不被选中；
//   ③ 计划阶段零 `signAudios`；④ 段开播前只对「当前段 ＋ 预取段」现签；⑤ 预取走 `fetch → blob`。
console.log('\n== ⑦ 抽签源＝元数据池 slot_pools（无 URL）＋ deliverable 消费 ==')
{
  const CH = meditationTrackTemplate.MEDITATION_TRACK_CHAPTER_TEMPLATE
  const DEFAULT_GAP = 141
  const buildChapterTemplate = () => CH.map((chapter, index) => ({
    chapter_key: chapter.chapter_key,
    order: chapter.order,
    label: chapter.label,
    enabled_by_default: true,
    max_duration_seconds: chapter.max_duration_seconds,
    gap_after_seconds_default: index === CH.length - 1 ? 0 : DEFAULT_GAP,
    section_types: [...chapter.section_types]
  }))

  // 池条目形状＝ D6 `slot_pools[type][]`（元数据 only：`id`/`section_type`/`duration`/`label`/`deliverable`，**零 URL**）。
  const metaEntry = (id, sectionType, deliverable, duration = 10) => ({
    id, section_type: sectionType, duration, label: id, deliverable
  })

  const track = {
    track_key: 'track-default',
    version: 3,
    background_track: { volume: 0.33, section_types: ['sec-nature', 'sec-bowl'] },
    voice_track: { volume: 1, section_types: ['anchorGreeting', 'basePreparation'] },
    chapters: [
      { chapter_key: 'chapter-nature', enabled: true, gap_after_seconds: DEFAULT_GAP, section_types: ['sec-nature'] },
      {
        chapter_key: 'section-start',
        enabled: true,
        gap_after_seconds: DEFAULT_GAP,
        section_types: ['anchorGreeting', 'basePreparation'],
        slots: [
          { slot_index: 0, section_type: 'anchorGreeting', selector: { kind: 'pool', section_type: 'anchorGreeting', tags: [] }, policy: 'random' },
          { slot_index: 1, section_type: 'basePreparation', selector: { kind: 'pool', section_type: 'basePreparation', tags: [] }, policy: 'random' }
        ]
      }
    ]
  }

  // 元数据池：**无任何 URL**；每类的**第一条 `deliverable:false`**（rng=0 会先命中它——它必不被选中）。
  const slotPools = {
    'sec-nature': [metaEntry('nat-1', 'sec-nature', true, 30)],
    anchorGreeting: [metaEntry('ag-bad', 'anchorGreeting', false, 9), metaEntry('ag-ok', 'anchorGreeting', true, 12)],
    basePreparation: [metaEntry('bp-bad', 'basePreparation', false, 7), metaEntry('bp-ok', 'basePreparation', true, 14)]
  }

  // 抽签与现签共用一套桩：计划阶段**零 callFunction**。
  const { stub, calls: signCalls } = createStubCallFunction([
    { result: signEnvelope(['ag-ok', 'bp-ok']) }
  ])
  const client = createMeditationSignAudiosClient({ callFunction: stub })
  const { fetchImpl, calls: fetchCalls } = createStubFetch()
  const resolver = createMeditationAudioSourceResolver({
    signAudios: client.signAudios,
    fetchImpl,
    createObjectURL: () => `blob:pool/${Date.now()}`,
    revokeObjectURL: () => {}
  })

  // 计划阶段：**元数据池（无 URL）**抽签；`rng:()=>0` 会先命中每类的 `deliverable:false` 条目。
  const plan = buildMeditationTrackPlaybackPlan({
    track,
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: slotPools,
    rng: () => 0
  })

  eq('Q1 计划阶段 ⇒ 零 `signAudios`（抽签不取 URL）', signCalls.length, 0)
  eq('Q2 抽中可交付条目（deliverable:true，**无 URL**）', plan.selections.map((s) => s.audio_id), ['nat-1', 'ag-ok', 'bp-ok'])
  ok('Q3 `deliverable:false` 候选恒不被选中', plan.selections.every((s) => ['nat-1', 'ag-ok', 'bp-ok'].includes(s.audio_id)))
  ok('Q4 计划各段格式为响应派生（opus/mp3，url 全空）', plan.segments.every((s) => s.audio.formats.length === 2 && s.audio.formats.every((f) => f.url === '')))
  ok('Q5 计划整体零 URL', JSON.stringify(plan.segments).indexOf('http') === -1)

  // 播放清单：**只带抽中的 `audio_id`、零 URL**（由元数据池条目构造，等价播放器 `buildRuntimeTrackPlan` 取 `segment.audio`）。
  const voiceSegments = plan.segments
    .filter((segment) => segment.track === 'voice')
    .map((segment, index) => ({
      id: `${segment.section_type}-${index}`,
      trackKey: 'voice',
      playlist: buildPlaylistItems({ audio: segment.audio, durationSeconds: segment.duration_seconds })
    }))
  ok('Q6 清单条目只带 audioId、audioUrl 全空', voiceSegments.every((s) => s.playlist.length > 0 && s.playlist.every((item) => item.audioId && item.audioUrl === '')))
  ok('Q7 清单序列化后不含 http 链接', voiceSegments.every((s) => !JSON.stringify(s.playlist).includes('http')))

  // 段开播前：**只对「当前段 ＋ 下一段」**现签（一次批量），且走 `fetch → blob` 预取。
  const currentVoice = voiceSegments[0]
  const window = resolveTrackPrefetchWindow({ segments: voiceSegments, trackKey: 'voice', segmentId: currentVoice.id })
  const windowIds = [...new Set(window.flatMap((segment) => segment.playlist.map((item) => item.audioId)))]
  eq('Q8 预取窗口＝当前段 ＋ 下一段（id 集）', windowIds, ['ag-ok', 'bp-ok'])

  await resolver.prefetchAudioIds(windowIds)
  eq('Q9 开播前**只**发起 1 次 `signAudios`（当前段 ＋ 下一段）', signCalls.length, 1)
  eq('Q10 现签 ids ＝ 当前段 ＋ 下一段（无其它段）', signCalls[0].data.audio_ids, ['ag-ok', 'bp-ok'])
  ok('Q11 预取走 `fetch → blob`（每 id 两种格式 ⇒ 4 次取流）', fetchCalls.length === 4 && fetchCalls.every((url) => url.startsWith('https://')))

  // 播放取源：命中缓存 ⇒ 零新增现签 / 零新增 fetch。
  const src = await resolver.resolvePlayableSrc({ audioId: 'ag-ok', format: 'opus' })
  ok('Q12 取源返回现签后 blob（非池内 URL）', String(src).startsWith('blob:'))
  eq('Q13 复用缓存 ⇒ 无新增现签', signCalls.length, 1)
  eq('Q14 复用缓存 ⇒ 无新增 fetch', fetchCalls.length, 4)

  // 全部 `deliverable:false` ⇒ 该槽记 `NO_PLAYABLE_FORMAT`、不产生段（**不整场失败**）。
  const allBadPlan = buildMeditationTrackPlaybackPlan({
    track,
    chapterTemplate: buildChapterTemplate(),
    sectionAudioPools: {
      'sec-nature': [metaEntry('nat-1', 'sec-nature', true, 30)],
      anchorGreeting: [metaEntry('ag-bad', 'anchorGreeting', false, 9)],
      basePreparation: [metaEntry('bp-bad', 'basePreparation', false, 7)]
    },
    rng: () => 0
  })
  eq('Q15 全不可交付 ⇒ 该槽无 selection', allBadPlan.selections.map((s) => s.section_type), ['sec-nature'])
  ok('Q16 全不可交付 ⇒ 记 `NO_PLAYABLE_FORMAT`（不整场失败）', allBadPlan.warnings.some((w) => w.code === 'NO_PLAYABLE_FORMAT' && w.section_type === 'anchorGreeting'))

  // 源码接线：播放器**只**把 `slot_pools` 传给计划层；**不再**传带 URL 的 `section_audio_pools`。
  const playerCode2 = stripComments(readSource(PLAYER_PATH))
  ok('S17 播放器抽签源＝`slot_pools`（元数据池）', playerCode2.includes('sectionAudioPools: data?.slot_pools'))
  ok('S18 播放器**不再**把带 URL 的 `section_audio_pools` 传给计划层', !playerCode2.includes('section_audio_pools'))
  ok('S19 播放器仍由 `signAudios` 现签（URL 抽中后现取）', playerCode2.includes('meditationReadService.signAudios(audioIds)'))
}

console.log(`\n结果：${pass} PASS / ${fail} FAIL`)
if (fail > 0) {
  console.log(`失败项：${failures.join('；')}`)
  process.exit(1)
}
