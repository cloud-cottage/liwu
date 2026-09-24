// ─── med_section_audios 读侧口径：只读云函数用的「精简等价模块」 ────────────────
//
// 【权威源（authoritative source）】packages/shared-utils/meditation-section-audio.js
//   云函数（SCF）只打包函数目录，**不能** require 仓库内的共享模块（Zang 裁定 D-B2-8），
//   所以这里必须放一份副本。本文件只搬运「**只读下发**」用得到的那部分口径：
//     MEDITATION_SECTION_AUDIO_COLLECTION        （D8：音频唯一口径集合）
//     MEDITATION_SECTION_AUDIO_FORMATS
//     MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE
//     MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS
//     normalizeMeditationTranscodedFormats
//     resolveMeditationSectionAudioTranscodedFormats
//     isMeditationSectionAudioDeliveryComplete
//
// 【本文件是权威源的子集，不是分叉】写入侧（merge / 回写 payload）不在只读云函数范围内，
//   故未搬运；需要写入口径的副本见 cloudfunctions/meditation-transcoder/lib/meditation-formats.js。
//   **三处共用同一口径**：权威源改了什么（字段名、规范顺序、历史 mp3_* 别名、状态字面量），
//   两份副本都要同步；责任方＝修改权威源的人；不一致时**一律以权威源为准**。

// 规范字段名（D8：med_section_audios 为音频唯一口径，不得在 med_section_raws 上读 file_id / audio_url）。
const MEDITATION_SECTION_AUDIO_COLLECTION = 'med_section_audios'

const MEDITATION_SECTION_AUDIO_FORMATS = Object.freeze({
  opus: 'opus',
  mp3: 'mp3',
  raw: 'raw'
})

const MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE = Object.freeze({
  opus: 'audio/ogg; codecs="opus"',
  mp3: 'audio/mpeg'
})

const MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS = Object.freeze({
  idle: 'idle',
  queued: 'queued',
  processing: 'processing',
  succeeded: 'succeeded',
  failed: 'failed'
})

// 交付格式（transcoded_formats）取值与规范顺序：['opus','mp3']（D3 双格式交付）。
const MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS = [
  MEDITATION_SECTION_AUDIO_FORMATS.opus,
  MEDITATION_SECTION_AUDIO_FORMATS.mp3
]

const toTranscodedFormatValues = (formats = []) => (
  (Array.isArray(formats) ? formats : []).map((format) => String(format || '').toLowerCase())
)

// 只保留规范取值，并按规范顺序去重排序。
const normalizeMeditationTranscodedFormats = (formats = []) => {
  const values = toTranscodedFormatValues(formats)

  return MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS.filter((format) => values.includes(format))
}

// 已完成的交付格式：
// - 有 transcoded_formats 时以其为准（转码流程回写）；
// - 历史文档没有该字段时，按已登记的交付 URL 推断（兼容 mp3_url）。
// ⚠ 只读云函数**不信任**这些 URL 的时效性：URL 一律按 file_id 重新签发（C11 / X14），
//   这里仅用「URL 字段是否存在」推断「该格式是否曾交付成功」。
const resolveMeditationSectionAudioTranscodedFormats = (audio = {}) => {
  if (Array.isArray(audio.transcoded_formats)) {
    return normalizeMeditationTranscodedFormats(audio.transcoded_formats)
  }

  const deliveredFormats = []

  if (audio.audio_url) {
    deliveredFormats.push(MEDITATION_SECTION_AUDIO_FORMATS.opus)
  }

  if (audio.fallback_audio_url || audio.mp3_url) {
    deliveredFormats.push(MEDITATION_SECTION_AUDIO_FORMATS.mp3)
  }

  return deliveredFormats
}

// 双格式交付是否齐备（规范：只有 ['opus'] 视为**未完成交付**）。
const isMeditationSectionAudioDeliveryComplete = (audio = {}) => {
  const deliveredFormats = resolveMeditationSectionAudioTranscodedFormats(audio)

  return MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS.every((format) => deliveredFormats.includes(format))
}

module.exports = {
  MEDITATION_SECTION_AUDIO_COLLECTION,
  MEDITATION_SECTION_AUDIO_FORMATS,
  MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE,
  MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS,
  MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS,
  normalizeMeditationTranscodedFormats,
  resolveMeditationSectionAudioTranscodedFormats,
  isMeditationSectionAudioDeliveryComplete
}
