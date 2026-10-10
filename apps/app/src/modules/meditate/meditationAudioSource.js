// ─── App 播放器「取流层」：抽中后现签 ＋ 预取（`fetch → blob`）（R51 / R49-⑤⑧ v4.34 / R42-④） ──
//
// 【规范依据】docs/meditation.admin.partner.spec.md
//   · R51-① 池元数据与 URL 现签分离（硬）：池只下发 `id` / `duration` / `标签`（**无 URL**）；
//     URL 只在「抽中后」按需现签 ⇒ 本模块**在计划阶段不取任何 URL**：播放清单条目只带 **抽中的
//     `audio_id`**（不带宽链接），URL 在「本段将要播放（＋下一段预取）」时才由 `signAudios` 现签。
//   · R51-② 单次现签 ≤ 50 fileID：由**服务端**内部分批（`meditation-read` action `signAudios`）；
//     端侧只按「当前段 ＋ 下一段」给出少量 `audio_ids`，**绝不一次把整场全签**。
//   · R49-⑤ 预取窗口（硬）＝至少「当前段 ＋ 下一段」；R49-⑧ v4.34 闭合注：**预取一律
//     `fetch → blob URL`**（**禁用 `new Audio()+load` 作预取手段**）、**不引入 Web Audio**。
//   · R42-④ `fetch → Blob → objectURL`；缓存按**签名 URL** 去重（同场复用），卸场 / 切源（重签）
//     一律 `URL.revokeObjectURL` 释放。
//
// 【纯模块】零 import、零 fixture（桩由调用方注入 `callFunction` / `fetch` / `createObjectURL`）；
//   可在浏览器直接 import，也可在 Node（测试）下以相对路径 import。
//
// 【播放清单条目形状】`buildPlaylistItems`：
//   `{ id, audioId, audioUrl, title, format, mimeType, duration }`
//     · 端侧组装（双轨）：`audioId` ＝ 抽中的 `med_section_audios._id`；**`audioUrl` 恒空串**
//       （URL 不入播放清单 ⇒ 计划阶段零 URL，R51-①）；
//     · 混音单流产物：无 `audio_id`（不是 `med_section_audios` 行）⇒ `audioUrl` ＝ D6 已现签的
//       产品 URL（`mix_audio.ogg_url` / `mix_audio.mp3_url`，**单条产品、非候选池**）。

export const MEDITATION_READ_FUNCTION_NAME = 'meditation-read'
export const MEDITATION_SIGN_AUDIOS_ACTION = 'signAudios'

// 端侧自产错误码（分支只看 `code`，不解析 message 文本；与共享读客户端同口径）。
export const MEDITATION_AUDIO_SOURCE_ERROR_CODES = Object.freeze({
  callFailed: 'CALL_FAILED',
  invalidPayload: 'INVALID_PAYLOAD',
  emptyAudioUrl: 'EMPTY_AUDIO_URL',
  audioNotDeliverable: 'AUDIO_NOT_DELIVERABLE'
})

export class MeditationAudioSourceError extends Error {
  constructor(code, message, details = null) {
    super(message || `取流失败（${code}）`)

    this.name = 'MeditationAudioSourceError'
    this.code = code || MEDITATION_AUDIO_SOURCE_ERROR_CODES.callFailed
    this.details = details && typeof details === 'object' ? details : null
  }
}

const getString = (value) => (value == null ? '' : String(value))

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const isMeditationAudioSourceError = (error) => error instanceof MeditationAudioSourceError

// 去重 + 归一为「非空字符串数组」（顺序保留；服务端 order 不敏感）。空数组 ⇒ 调用方自行短路。
export const normalizeAudioIds = (audioIds = []) => [
  ...new Set((Array.isArray(audioIds) ? audioIds : []).map((id) => getString(id).trim()).filter(Boolean))
]

// ─── 现签调用（`signAudios`）的入参 / 出参（纯函数） ───────────────────────────────────

export const buildSignAudiosCall = (audioIds = []) => ({
  name: MEDITATION_READ_FUNCTION_NAME,
  data: {
    action: MEDITATION_SIGN_AUDIOS_ACTION,
    audio_ids: normalizeAudioIds(audioIds)
  }
})

// 解包（`res.result` / `res` / JSON 字符串），与共享读客户端同口径（最多 4 层）。
const unwrapEnvelope = (raw, { maxDepth = 4 } = {}) => {
  let current = raw

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (typeof current === 'string') {
      const text = current.trim()
      if (!text || (text[0] !== '{' && text[0] !== '[')) {
        return { ok: false, reason: '返回体是字符串且不是合法 JSON' }
      }

      try {
        current = JSON.parse(text)
      } catch {
        return { ok: false, reason: '返回体是字符串且不是合法 JSON' }
      }

      continue
    }

    if (isPlainObject(current) && current.ok === undefined && current.result !== undefined) {
      current = current.result
      continue
    }

    break
  }

  if (!isPlainObject(current) || typeof current.ok !== 'boolean') {
    return { ok: false, reason: '返回体缺少布尔的 ok 字段' }
  }

  return { ok: true, envelope: current }
}

// 单条已签音频归一（`{ audioId, formats: [{ format, url, mimeType }] }`；无可用格式 ⇒ 空数组）。
export const normalizeSignedAudio = (entry = {}) => ({
  audioId: getString(entry?._id || entry?.id).trim(),
  formats: (Array.isArray(entry?.formats) ? entry.formats : [])
    .map((format) => ({
      format: getString(format?.format).trim().toLowerCase(),
      url: getString(format?.url).trim(),
      mimeType: getString(format?.mime_type)
    }))
    .filter((format) => Boolean(format.format) && Boolean(format.url))
})

// 解析 `signAudios` 出参：成功 ⇒ `{ audios, urlPolicy, meta }`（`audios` 已归一）；失败 / 形状非法 ⇒ 抛错。
export const parseSignAudiosResponse = (raw) => {
  const unwrapped = unwrapEnvelope(raw)

  if (!unwrapped.ok) {
    throw new MeditationAudioSourceError(
      MEDITATION_AUDIO_SOURCE_ERROR_CODES.invalidPayload,
      `signAudios 响应形状非法：${unwrapped.reason}`
    )
  }

  const envelope = unwrapped.envelope

  if (envelope.ok !== true) {
    const code = getString(envelope.error).trim()

    throw new MeditationAudioSourceError(
      code || MEDITATION_AUDIO_SOURCE_ERROR_CODES.callFailed,
      getString(envelope.message) || `现签失败（${code || 'UNKNOWN'}）`,
      isPlainObject(envelope.details) ? envelope.details : null
    )
  }

  const data = isPlainObject(envelope.data) ? envelope.data : {}

  return {
    audios: (Array.isArray(data.audios) ? data.audios : []).map(normalizeSignedAudio).filter((audio) => audio.audioId),
    urlPolicy: isPlainObject(data.url_policy) ? data.url_policy : null,
    meta: isPlainObject(envelope.meta) ? envelope.meta : {}
  }
}

// 现签客户端（`callFunction` 由调用方注入：形如 `({ name, data }) => Promise<res>`）。
export const createMeditationSignAudiosClient = ({ callFunction, thisArg = undefined } = {}) => {
  if (typeof callFunction !== 'function') {
    throw new TypeError('createMeditationSignAudiosClient 需要注入 callFunction（形如 ({ name, data }) => Promise<res>）')
  }

  return Object.freeze({
    async signAudios(audioIds = []) {
      const call = buildSignAudiosCall(audioIds)

      // 空 ids：不发起调用（端侧不应无谓现签）。
      if (call.data.audio_ids.length === 0) {
        return { audios: [], urlPolicy: null, meta: {} }
      }

      let raw
      try {
        raw = await callFunction.call(thisArg, call)
      } catch (error) {
        throw new MeditationAudioSourceError(
          MEDITATION_AUDIO_SOURCE_ERROR_CODES.callFailed,
          `调用 ${MEDITATION_READ_FUNCTION_NAME} 失败：${error?.message || 'UNKNOWN_ERROR'}`,
          { action: MEDITATION_SIGN_AUDIOS_ACTION }
        )
      }

      return parseSignAudiosResponse(raw)
    }
  })
}

// ─── 播放清单条目（R51-①：计划阶段零 URL） ──────────────────────────────────────────

export const buildPlaylistItems = ({ audio = null, durationSeconds = 0 } = {}) => {
  const formats = Array.isArray(audio?.formats) ? audio.formats : []
  const audioId = getString(audio?.id).trim()

  return formats
    .map((format, formatIndex) => ({
      id: `${audioId || 'audio'}-${formatIndex}`,
      // 端侧组装：抽中的 `audio_id`（URL 在播放前现签）；混音单流：空串（改用 audioUrl）。
      audioId,
      // 端侧组装（有 audio_id）⇒ **URL 恒空**（R51-①）；混音单流产物 ⇒ D6 已现签的单条产品 URL。
      audioUrl: audioId ? '' : getString(format?.url).trim(),
      title: getString(audio?.label),
      format: getString(format?.format).trim().toLowerCase(),
      mimeType: getString(format?.mime_type),
      duration: durationSeconds
    }))
    .filter((item) => Boolean(item.audioId || item.audioUrl))
}

// ─── 预取窗口（R49-⑤：≥ 当前段 ＋ 下一段）────────────────────────────────────────────

// 同一轨内「当前段 ＋ 其后 (windowSize-1) 段」（默认窗口 2＝当前 ＋ 下一段）。
// 找不到当前段 ⇒ 退化为「只当前段」（不猜、不越界）。
export const resolveTrackPrefetchWindow = ({ segments = [], trackKey = '', segmentId = '', windowSize = 2 } = {}) => {
  const trackSegments = (Array.isArray(segments) ? segments : []).filter((segment) => segment?.trackKey === trackKey)
  const size = Math.max(1, Math.floor(Number(windowSize) || 2))
  const currentIndex = trackSegments.findIndex((segment) => segment?.id === segmentId)

  if (currentIndex < 0) {
    return trackSegments.filter((segment) => segment?.id === segmentId)
  }

  return trackSegments.slice(currentIndex, currentIndex + size)
}

// ─── 音量配比分支（R49-⑤，硬）──────────────────────────────────────────────────────
// 端侧组装（双轨）⇒ 按响应设音量（`voice_track.volume` / `background_track.volume`）；
// 单流（`mix_audio` 混音产物）⇒ **端侧不设音量**（配比已烘焙进产物 ⇒ 恒 1，不得再叠加配比）。
// 两条路径**必须分明、不得一刀切**。
export const resolveTrackVolume = ({ isSingleStream = false, volumes = null, trackKey = '' } = {}) => {
  if (isSingleStream) {
    return 1
  }

  const value = Number(isPlainObject(volumes) ? volumes[trackKey] : undefined)
  return Number.isFinite(value) && value > 0 ? value : 1
}

// ─── 取流解析器（现签 ＋ `fetch → blob` 预取 ＋ 缓存/释放）────────────────────────────

// `signAudios`：形如 `(audioIds) => Promise<{ audios: [{audioId, formats:[{format,url,mimeType}]}] }>`。
// `fetchImpl` / `createObjectURL` / `revokeObjectURL` 缺省取全局（浏览器）；测试注入桩。
export const createMeditationAudioSourceResolver = ({
  signAudios,
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  createObjectURL = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL.bind(URL) : null,
  revokeObjectURL = typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function' ? URL.revokeObjectURL.bind(URL) : null
} = {}) => {
  if (typeof signAudios !== 'function') {
    throw new TypeError('createMeditationAudioSourceResolver 需要注入 signAudios')
  }

  // 现签缓存：audioId → [{ format, url, mimeType }]（同场去重：同一 audio_id 只现签一次）。
  const formatsByAudioId = new Map()
  // blob 缓存：**签名 URL** → objectURL（同一签名 URL 只 fetch 一次；重签产生新 URL ⇒ 新条目）。
  const blobUrlBySignedUrl = new Map()
  const stats = { signCalls: 0, signedAudioIds: 0, fetchCount: 0, revokeCount: 0 }

  const revokeSignedUrl = (signedUrl) => {
    if (!blobUrlBySignedUrl.has(signedUrl)) {
      return
    }

    const blobUrl = blobUrlBySignedUrl.get(signedUrl)
    blobUrlBySignedUrl.delete(signedUrl)

    try {
      if (typeof revokeObjectURL === 'function' && blobUrl) {
        revokeObjectURL(blobUrl)
        stats.revokeCount += 1
      }
    } catch {
      // 释放失败无需处理：缓存条目已清，不回退、不提示。
    }
  }

  // `fetch → Blob → objectURL`（R42-④）；按签名 URL 缓存（同场复用）。
  const fetchBlobUrl = async (signedUrl, mimeType = '') => {
    const url = getString(signedUrl).trim()

    if (!url) {
      throw new MeditationAudioSourceError(MEDITATION_AUDIO_SOURCE_ERROR_CODES.emptyAudioUrl, '缺少可取流的 URL')
    }

    if (blobUrlBySignedUrl.has(url)) {
      return blobUrlBySignedUrl.get(url)
    }

    if (typeof fetchImpl !== 'function') {
      throw new MeditationAudioSourceError(MEDITATION_AUDIO_SOURCE_ERROR_CODES.callFailed, '环境缺少 fetch')
    }

    const response = await fetchImpl(url, { method: 'GET' })

    // 403（＝签名失效 / 过期）⇒ 抛出（`code` 与 `message` 同为 `AUDIO_FETCH_<status>`，
    // 供上层按 `AUDIO_FETCH_403` 辨识并**重签**，R42-④）；206（Range）视为成功。
    if (!response || (!response.ok && response.status !== 206)) {
      const failureCode = `AUDIO_FETCH_${response?.status || 0}`
      throw new MeditationAudioSourceError(failureCode, failureCode)
    }

    if (typeof createObjectURL !== 'function') {
      throw new MeditationAudioSourceError(MEDITATION_AUDIO_SOURCE_ERROR_CODES.callFailed, '环境缺少 URL.createObjectURL')
    }

    const arrayBuffer = await response.arrayBuffer()
    const blob = new Blob([arrayBuffer], mimeType ? { type: mimeType } : undefined)
    const blobUrl = createObjectURL(blob)
    blobUrlBySignedUrl.set(url, blobUrl)
    stats.fetchCount += 1

    return blobUrl
  }

  // 确保给定 audio_ids 已现签（只对缓存里没有的发起调用 ⇒ 同场去重、绝不重复现签）。
  const ensureSigned = async (audioIds = []) => {
    const missing = normalizeAudioIds(audioIds).filter((id) => !formatsByAudioId.has(id))

    if (missing.length === 0) {
      return
    }

    stats.signCalls += 1
    stats.signedAudioIds += missing.length

    const { audios } = await signAudios(missing)

    audios.forEach((audio) => {
      if (audio.audioId && audio.formats.length > 0) {
        formatsByAudioId.set(audio.audioId, audio.formats)
      }
    })
  }

  // 预取：先现签（一次批量），再对每条已签音频的每种格式 `fetch → blob`（**禁用 `new Audio()+load`**）。
  const prefetchAudioIds = async (audioIds = []) => {
    await ensureSigned(audioIds)

    for (const audioId of normalizeAudioIds(audioIds)) {
      const formats = formatsByAudioId.get(audioId) || []

      for (const format of formats) {
        await fetchBlobUrl(format.url, format.mimeType)
      }
    }
  }

  // 取可播源：有 `audioId` ⇒ 现签后按条目格式（缺则回退首格式）取 blob；无 `audioId` ⇒ 直取条目 URL。
  const resolvePlayableSrc = async (playlistItem = {}) => {
    const audioId = getString(playlistItem.audioId).trim()

    if (audioId) {
      await ensureSigned([audioId])

      const formats = formatsByAudioId.get(audioId) || []
      const wantedFormat = getString(playlistItem.format).trim().toLowerCase()
      const picked = formats.find((format) => format.format === wantedFormat) || formats[0] || null

      if (!picked) {
        throw new MeditationAudioSourceError(
          MEDITATION_AUDIO_SOURCE_ERROR_CODES.audioNotDeliverable,
          `该段音频不可交付（${audioId}）`,
          { audio_id: audioId }
        )
      }

      return fetchBlobUrl(picked.url, playlistItem.mimeType || picked.mimeType)
    }

    return fetchBlobUrl(getString(playlistItem.audioUrl).trim(), playlistItem.mimeType)
  }

  // 切源（重签）：先释放该 audio_id 的旧 blob（`revokeObjectURL`），再清缓存条目 ⇒ 下次现签取新 URL。
  const releaseAudio = (audioId) => {
    const id = getString(audioId).trim()

    if (!id) {
      return
    }

    ;(formatsByAudioId.get(id) || []).forEach((format) => revokeSignedUrl(format.url))
    formatsByAudioId.delete(id)
  }

  // 重签：释放旧 URL / blob 后重新现签；返回是否可用。
  const resignAudio = async (audioId) => {
    const id = getString(audioId).trim()

    if (!id) {
      return false
    }

    releaseAudio(id)

    try {
      await ensureSigned([id])
    } catch {
      return false
    }

    return formatsByAudioId.has(id)
  }

  // 卸场：释放全部 blob（`revokeObjectURL`），清空两张缓存。
  const releaseAll = () => {
    ;[...blobUrlBySignedUrl.keys()].forEach(revokeSignedUrl)
    formatsByAudioId.clear()
  }

  return Object.freeze({
    prefetchAudioIds,
    resolvePlayableSrc,
    resignAudio,
    releaseAudio,
    releaseAll,
    getStats: () => ({ ...stats }),
    signedAudioIds: () => [...formatsByAudioId.keys()],
    hasBlobForUrl: (url) => blobUrlBySignedUrl.has(getString(url).trim())
  })
}
