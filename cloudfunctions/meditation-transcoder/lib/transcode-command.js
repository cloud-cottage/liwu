// ─── ffmpeg / ffprobe 命令构造（纯函数，无 IO） ───────────────────────────────
// 参数来源：**Kevin（用户）2026-09-24 直接裁定，48k 立体声 CBR**（覆盖 R33 的 32k 单声道口径）——
//   Opus 主体  : .ogg   + `-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000`（**硬 CBR**）
//   mp3 兜底   : .mp3   + `-c:a libmp3lame -b:a 48k -ac 2 -ar 44100`
//   执行形态   : **单次 ffmpeg 调用双路输出**（`-map 0:a` 写两次）
// 输入实况（实测）：webm/opus 128kbps **双声道** 48kHz、**无 Duration 头**。
//   `-vbr off` **必须保留**：48k VBR 实测漂到 ≈73kbps（60s 样本 552.9KB），预算不可控。
//   声道**不下混**：`-ac 2`（立体声）是定稿口径，代码/注释/文档里一律不得出现单声道假设。
//   ⚠ 本文件里的参数**不得自行调整**；改参数一律走规范修订。
// 责任：与 scripts/audio-transcode-worker.mjs 第 28 行 `DEFAULT_FFMPEG_AUDIO_ARGS` 同口径，
//   两处任一方改动都要同步另一方（worker 只出单路 Opus，本执行器出双路）。

const fs = require('node:fs')
const path = require('node:path')

// D-B2-5（Zang 裁定，可改）：ffmpeg 二进制**不进仓库**（`.gitignore` 已排除）。
// 腾讯云函数内取层/静态构建挂载点，默认 `/opt/ffmpeg`；本地验证用 FFMPEG_PATH 覆盖。
const DEFAULT_FFMPEG_PATH = '/opt/ffmpeg'
const DEFAULT_FFPROBE_PATH = '/opt/ffprobe'

const getString = (value) => (value == null ? '' : String(value))

const resolveFfmpegPath = () => getString(process.env.FFMPEG_PATH).trim() || DEFAULT_FFMPEG_PATH

// ffprobe 默认取 ffmpeg 同目录（层里通常 /opt/ffmpeg + /opt/ffprobe）；
// 找不到同目录同名文件时退回 /opt/ffprobe，仍可用 FFPROBE_PATH 显式指定。
const resolveFfprobePath = () => {
  const explicitPath = getString(process.env.FFPROBE_PATH).trim()
  if (explicitPath) {
    return explicitPath
  }

  const siblingPath = path.join(path.dirname(resolveFfmpegPath()), 'ffprobe')
  return fs.existsSync(siblingPath) ? siblingPath : DEFAULT_FFPROBE_PATH
}

const buildToolMissingError = (toolName, toolPath) => {
  const error = new Error([
    `${getString(toolName).toUpperCase()}_NOT_FOUND：找不到可执行文件 ${toolPath}`,
    '转码执行器不内置二进制（D-B2-5）：请在云函数上挂载 ffmpeg 层（或用自建静态构建）并设置',
    'FFMPEG_PATH / FFPROBE_PATH；部署后用 `ffmpeg -encoders | grep -E \'libopus|libmp3lame\'` 实地校验。'
  ].join(''))
  error.code = `${getString(toolName).toUpperCase()}_NOT_FOUND`
  error.permanent = true

  return error
}

// 二进制缺失必须**报明确错误**（不得静默跳过或假成功）。
const assertToolAvailable = (toolPath, toolName) => {
  if (!getString(toolPath).trim() || !fs.existsSync(toolPath)) {
    throw buildToolMissingError(toolName, toolPath)
  }

  return toolPath
}

// 单次调用双路输出：`-map 0:a` 写两次，第 1 路 .ogg（Opus 主体，48k CBR 立体声）、
// 第 2 路 .mp3（兜底，48k 立体声）。**不做任何声道下混**（不得出现单声道假设）。
const buildDualOutputArgs = ({ inputPath, opusOutputPath, mp3OutputPath }) => [
  '-y',
  '-i', inputPath,
  '-map', '0:a',
  '-c:a', 'libopus',
  '-b:a', '48k',
  '-vbr', 'off',
  '-ac', '2',
  '-ar', '48000',
  '-f', 'ogg', opusOutputPath,
  '-map', '0:a',
  '-c:a', 'libmp3lame',
  '-b:a', '48k',
  '-ac', '2',
  '-ar', '44100',
  '-f', 'mp3', mp3OutputPath
]

// ⚠ 只用于**转码产物**。D-B2-4 / R33-⑦：原始上传件实测 `duration=N/A`，
// 对原件取时长会得到 0（不得据此回写），入库时长只能取客户端实测值或本执行器的产物时长。
const buildProbeArgs = (filePath) => [
  '-v', 'error',
  '-show_entries', 'format=duration,size,format_name,bit_rate',
  '-show_entries', 'stream=codec_type,codec_name,channels,sample_rate,bit_rate',
  '-of', 'json',
  filePath
]

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// ffprobe JSON → 自测/日志/回写用到的精简形状。
// 说明：Opus（ogg）与 webm 的 stream.bit_rate 常为 N/A ⇒ 同时给按 (size*8/duration) 计算的实测码率。
const parseProbeJson = (stdoutText = '') => {
  let parsed = null
  try {
    parsed = JSON.parse(getString(stdoutText).trim() || '{}')
  } catch (error) {
    const parseError = new Error(`FFPROBE_JSON_INVALID：${getString(error?.message) || '无法解析 ffprobe 输出'}`)
    parseError.code = 'FFPROBE_JSON_INVALID'
    throw parseError
  }

  const streams = Array.isArray(parsed.streams) ? parsed.streams : []
  const audioStream = streams.find((stream) => stream?.codec_type === 'audio') || streams[0] || {}
  const durationSeconds = Math.max(0, toNumber(parsed?.format?.duration))
  const sizeBytes = Math.max(0, toNumber(parsed?.format?.size))
  const streamBitRateBps = Math.max(0, toNumber(audioStream.bit_rate))
  const effectiveBitRateBps = durationSeconds > 0 && sizeBytes > 0
    ? Math.round((sizeBytes * 8) / durationSeconds)
    : 0

  return {
    format_name: getString(parsed?.format?.format_name),
    duration_seconds: durationSeconds,
    size_bytes: sizeBytes,
    codec_name: getString(audioStream.codec_name),
    channels: Math.max(0, toNumber(audioStream.channels)),
    sample_rate: Math.max(0, toNumber(audioStream.sample_rate)),
    stream_bit_rate_bps: streamBitRateBps,
    effective_bit_rate_bps: effectiveBitRateBps
  }
}

module.exports = {
  DEFAULT_FFMPEG_PATH,
  DEFAULT_FFPROBE_PATH,
  resolveFfmpegPath,
  resolveFfprobePath,
  assertToolAvailable,
  buildToolMissingError,
  buildDualOutputArgs,
  buildProbeArgs,
  parseProbeJson
}
