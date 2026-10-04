// ─── 上传音频完整性防护（D-5 重做版）桩测：四种路径全覆盖 ─────────────────────────
//
// 被验对象（纯模块，零依赖、可直接桩测）：
//   apps/web/src/admin/utils/audioUploadIntegrity.js
//     · runAudioUploadIntegrityGuard  —— ① 上传前预检 ⇒ 上传 ⇒ ② 读回校验 的完整编排
//     · verifyUploadedObjectBytes     —— ② 读回校验（fail-soft）单独编排
//
// 覆盖的四种路径（与任务口径一一对应）：
//   路径 A  本地读全但对象短 ⇒ 重传一次仍短 ⇒ 抛可读错误（含本地 / 云端字节数）
//   路径 B  本地读全且对象一致 ⇒ 通过（不重传）
//   路径 C  取回失败（网络 / CORS / 代理不可用）⇒ **仍允许上传**、不报错给用户（fail-soft）
//   路径 D  本地读取字节数不足 ⇒ **上传前**就报错（不发起上传）
//   补充    读回成功后重传仍取回失败 ⇒ 不阻断；本地读取本身抛错 ⇒ 归为本地可读错误
//
// 运行：node scripts/tests/audio-upload-integrity.test.mjs

import {
  AUDIO_UPLOAD_LOCAL_UNREADABLE_CODE,
  AUDIO_UPLOAD_REMOTE_SIZE_MISMATCH_CODE,
  runAudioUploadIntegrityGuard,
  verifyUploadedObjectBytes
} from '../../apps/web/src/admin/utils/audioUploadIntegrity.js'

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

// 记录被 throws 捕获的错误（返回 { thrown, code, message }）。
const capture = async (fn) => {
  try {
    const value = await fn()
    return { thrown: false, value }
  } catch (error) {
    return { thrown: true, code: error?.code, message: error?.message }
  }
}

const EXPECTED = 4096

// ── 路径 A：本地读全但对象短 ⇒ 重传一次仍短 ⇒ 报错 ───────────────────────────
console.log('== 路径 A：本地读全但对象短 ⇒ 重传一次仍短 ⇒ 报错 ==')
{
  let uploadCalls = 0
  let reuploadCalls = 0
  const remoteBytes = EXPECTED - 3 // 云端始终短 3 字节

  const outcome = await capture(() => runAudioUploadIntegrityGuard({
    expectedBytes: EXPECTED,
    readLocalBytes: async () => EXPECTED, // 本地读全
    upload: async () => { uploadCalls += 1 },
    reupload: async () => { reuploadCalls += 1 },
    fetchRemoteBytes: async () => remoteBytes
  }))

  ok('A1 抛错（不通过）', outcome.thrown === true)
  eq('A2 错误码 = REMOTE_SIZE_MISMATCH', outcome.code, AUDIO_UPLOAD_REMOTE_SIZE_MISMATCH_CODE)
  ok('A3 错误文案含本地字节数', String(outcome.message).includes(String(EXPECTED)))
  ok('A4 错误文案含云端字节数', String(outcome.message).includes(String(remoteBytes)))
  eq('A5 只发起 1 次首传', uploadCalls, 1)
  eq('A6 确证不一致后重传 1 次（上限）', reuploadCalls, 1)
}

// ── 路径 B：本地读全且对象一致 ⇒ 通过（不重传）────────────────────────────
console.log('== 路径 B：本地读全且对象一致 ⇒ 通过 ==')
{
  let reuploadCalls = 0
  const notes = []
  const outcome = await capture(() => runAudioUploadIntegrityGuard({
    expectedBytes: EXPECTED,
    readLocalBytes: async () => EXPECTED,
    upload: async () => {},
    reupload: async () => { reuploadCalls += 1 },
    fetchRemoteBytes: async () => EXPECTED,
    onVerifyUnavailable: (info) => notes.push(info)
  }))

  ok('B1 不抛错（放行）', outcome.thrown === false)
  ok('B2 返回 verified:true', outcome.value?.verified === true)
  eq('B3 返回云端字节数', outcome.value?.remote_bytes, EXPECTED)
  eq('B4 一致时不重传', reuploadCalls, 0)
  eq('B5 未记任何「无法校验」提示', notes.length, 0)
}

// ── 路径 C：取回失败 ⇒ 仍允许上传、不报错（fail-soft）─────────────────────
console.log('== 路径 C：取回失败 ⇒ 仍允许上传、不报错 ==')
{
  let uploadCalls = 0
  const notes = []
  const outcome = await capture(() => runAudioUploadIntegrityGuard({
    expectedBytes: EXPECTED,
    readLocalBytes: async () => EXPECTED,
    upload: async () => { uploadCalls += 1 },
    reupload: async () => { throw new Error('不应发生重传') },
    fetchRemoteBytes: async () => { throw new Error('CORS / 网络不可用') },
    onVerifyUnavailable: (info) => notes.push(info)
  }))

  ok('C1 不抛错（不阻断上传）', outcome.thrown === false)
  ok('C2 上传已发生', uploadCalls === 1)
  ok('C3 返回 verified:false', outcome.value?.verified === false)
  eq('C4 fail-soft 原因 = fetch_unavailable', outcome.value?.reason, 'fetch_unavailable')
  eq('C5 内部记了一条不敏感提示', notes.map((n) => n.reason), ['fetch_unavailable'])
  ok('C6 提示不含敏感信息（仅原因与期望字节数）', !('url' in (notes[0] || {})) && notes[0]?.expected_bytes === EXPECTED)
}

// ── 路径 D：本地读取字节数不足 ⇒ 上传前就报错（不发起上传）────────────────
console.log('== 路径 D：本地读取字节数不足 ⇒ 上传前就报错 ==')
{
  let uploadCalls = 0
  const read = EXPECTED - 10

  const outcome = await capture(() => runAudioUploadIntegrityGuard({
    expectedBytes: EXPECTED,
    readLocalBytes: async () => read,
    upload: async () => { uploadCalls += 1 },
    reupload: async () => {},
    fetchRemoteBytes: async () => EXPECTED
  }))

  ok('D1 抛错', outcome.thrown === true)
  eq('D2 错误码 = LOCAL_UNREADABLE', outcome.code, AUDIO_UPLOAD_LOCAL_UNREADABLE_CODE)
  ok('D3 文案含读到字节数', String(outcome.message).includes(String(read)))
  ok('D4 文案含应有字节数', String(outcome.message).includes(String(EXPECTED)))
  eq('D5 预检未过 ⇒ 根本不发起上传', uploadCalls, 0)
}

// ── 补充 1：首传一致被确证后重传仍取回失败 ⇒ 不阻断 ─────────────────────────
console.log('== 补充 1：确证不一致后重传，但重传后取回失败 ⇒ 不阻断 ==')
{
  let fetchCalls = 0
  const outcome = await capture(() => verifyUploadedObjectBytes({
    expectedBytes: EXPECTED,
    fetchRemoteBytes: async () => {
      fetchCalls += 1
      if (fetchCalls === 1) return EXPECTED - 1 // 首查确证不一致
      throw new Error('重传后 CORS 不可用')
    },
    reupload: async () => {}
  }))

  ok('S1 不抛错（无法确证 ⇒ 放行）', outcome.thrown === false)
  ok('S2 返回 verified:false', outcome.value?.verified === false)
  eq('S3 原因 = fetch_unavailable_after_reupload', outcome.value?.reason, 'fetch_unavailable_after_reupload')
  eq('S4 取回被尝试 2 次（首查 + 重传后）', fetchCalls, 2)
}

// ── 补充 2：本地读取本身抛错 ⇒ 归为本地可读错误（同样不发起上传）──────────
console.log('== 补充 2：本地读取本身抛错 ⇒ 归为本地可读错误 ==')
{
  let uploadCalls = 0
  const outcome = await capture(() => runAudioUploadIntegrityGuard({
    expectedBytes: EXPECTED,
    readLocalBytes: async () => { throw new Error('文件已被移动') },
    upload: async () => { uploadCalls += 1 },
    reupload: async () => {},
    fetchRemoteBytes: async () => EXPECTED
  }))

  ok('S5 抛错', outcome.thrown === true)
  eq('S6 错误码 = LOCAL_UNREADABLE', outcome.code, AUDIO_UPLOAD_LOCAL_UNREADABLE_CODE)
  eq('S7 未发起上传', uploadCalls, 0)
}

console.log(`\n结果：${pass} PASS / ${fail} FAIL`)
if (fail > 0) {
  console.log(`失败项：${failures.join(' | ')}`)
  process.exit(1)
}
