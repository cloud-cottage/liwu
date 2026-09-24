// ─── med_section_audios 字段口径：转码执行器用的「精简等价模块」 ────────────────
//
// 【权威源（authoritative source）】packages/shared-utils/meditation-section-audio.js
//   云函数（SCF）只打包函数目录，**不能** require 仓库内的共享模块（Zang 裁定 D-B2-8），
//   所以这里必须放一份副本。本文件只搬运「转码执行器回写用得到」的那部分口径：
//     MEDITATION_SECTION_AUDIO_COLLECTION
//     MEDITATION_SECTION_AUDIO_FORMATS
//     MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE
//     MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS
//     normalizeMeditationTranscodedFormats
//     resolveMeditationSectionAudioTranscodedFormats
//     mergeMeditationSectionAudioTranscodedFormats
//
// 【同步责任（必读）】权威源里上述导出的任一改动——字段名、规范顺序、历史字段别名
//   （mp3_file_id / mp3_url / mp3_mime_type）、状态字面量——**必须同步本文件**。
//   责任方＝修改权威源的人；两侧不一致时**一律以权威源为准**。
//   自测脚本 `/Users/kevin/.hermes/profiles/zang/cache/scratch/kong-b2-transcoder/selftest.mjs`
//   会把两份实现喂同一组样本逐项比对（含历史 mp3_* 别名），防止口径漂移。

// 规范字段名：写入路径只写这些名字，不得新增/改名（D-B2-6）。
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

// 交付格式（transcoded_formats）取值与规范顺序：['opus','mp3']
const MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS = [
  MEDITATION_SECTION_AUDIO_FORMATS.opus,
  MEDITATION_SECTION_AUDIO_FORMATS.mp3
]

const toAudioUrl = (value) => String(value || '')

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

// 转码执行器回写点（第二批）：某一格式转码完成后并入 transcoded_formats（去重 + 规范顺序）。
// 幂等要求（Zang 裁定 D-B2-2）：重复执行不得产生重复条目 ⇒ 合并前一律先 resolve 现值。
const mergeMeditationSectionAudioTranscodedFormats = (currentFormats = [], format = '') => (
  normalizeMeditationTranscodedFormats([
    ...(Array.isArray(currentFormats) ? currentFormats : []),
    format
  ])
)

module.exports = {
  MEDITATION_SECTION_AUDIO_COLLECTION,
  MEDITATION_SECTION_AUDIO_FORMATS,
  MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE,
  MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS,
  MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS,
  toAudioUrl,
  normalizeMeditationTranscodedFormats,
  resolveMeditationSectionAudioTranscodedFormats,
  mergeMeditationSectionAudioTranscodedFormats
}
