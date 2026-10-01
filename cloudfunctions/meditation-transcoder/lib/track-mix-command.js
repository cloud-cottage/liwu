// ─── Track 级混音 ffmpeg 命令构造（纯函数，无 IO） ─────────────────────────────
//
// 【本单（Track 级混音，profile = 'track_mix'）】一次 ffmpeg 调用完成四件事：
//   ① 人声 **N 段按 job 给定顺序拼接**（concat，顺序＝voice_section_audio_ids 的数组序）；
//   ② 背景 **单段 `-stream_loop -1`** 无限循环，靠 `amix=duration=first` 自然裁到人声全长
//      ⇒ 背景「铺满至人声全长」，音频总长 ＝ 人声拼接总长（不由背景长度决定）；
//   ③ **amix 混音**：voice = 1.0 / background = 0.33（配比权威源见 lib/meditation-track-mix.js）；
//   ④ **同一 filtergraph 分两路输出**（asplit）：`.ogg`（Opus 主体）＋ `.mp3`（兜底）。
//
// 【编码参数与 R34 **逐字一致**】（与 lib/transcode-command.js#buildDualOutputArgs 同口径）：
//   .ogg : `-c:a libopus   -b:a 48k -vbr off -ac 2 -ar 48000`（硬 CBR）
//   .mp3 : `-c:a libmp3lame -b:a 48k           -ac 2 -ar 44100`
//   ⚠ 本文件参数**不得自行调整**；改参数一律走规范修订，并**同步** lib/transcode-command.js。
//   ⚠ 不做任何声道下混（`-ac 2` 是定稿口径，不得出现单声道假设）。
//
// 【前置归一（aformat）】每一路输入（人声各路 + 背景）先进
//   `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo`：
//   concat 要求各路采样率/声道布局一致，而各段音频的历史文档可能缺声道信息或为旧单声道
//   ⇒ 在滤镜入口统一到 48k 立体声，避免「某一段是单声道就整条 job 失败」。
//
// 【amix 的 normalize 必须为 0（版本前提）】amix 默认 `normalize=1` 会**按权重和归一**
//   （2 个输入 ⇒ 各 ÷2）：配比虽保持，整体电平掉 6dB，与「人声 1.0」不符
//   ⇒ 显式 `normalize=0`（该选项需 **ffmpeg ≥ 4.4**；本机实证 8.1.1）。
//   云函数侧 ffmpeg 层低于 4.4 时**不得静默降级**：部署后先 `ffmpeg -h filter=amix` 核对
//   normalize 选项，不支持则升级层（或在规范修订里换滤镜形态）。
//
// 【与 section_audio 的关系】本文件**只**服务 track_mix 分区；`buildDualOutputArgs`（单输入双路）
//   仍在 lib/transcode-command.js 中保持原样，两者互不调用、互不影响。

const { MEDITATION_TRACK_VOLUMES } = require('./meditation-track-mix.js')

const getString = (value) => (value == null ? '' : String(value))

// 输入归一：所有参与混音的输入统一样本格式/采样率/声道布局（concat 与 amix 都要求一致）。
const TRACK_MIX_INPUT_NORMALIZE_FILTER = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo'

// asplit 后的两个标签：同一个混音结果供两路编码器各取一次（`-map` 各一次）。
const TRACK_MIX_OUTPUT_LABELS = Object.freeze({
  opus: 'trackmix_ogg',
  mp3: 'trackmix_mp3'
})

// 逐字照抄 R34（Kevin 2026-09-24 裁定：48k 立体声硬 CBR）；导出以便自测逐项断言。
const TRACK_MIX_OPUS_ENCODER_ARGS = Object.freeze([
  '-c:a', 'libopus',
  '-b:a', '48k',
  '-vbr', 'off',
  '-ac', '2',
  '-ar', '48000'
])

const TRACK_MIX_MP3_ENCODER_ARGS = Object.freeze([
  '-c:a', 'libmp3lame',
  '-b:a', '48k',
  '-ac', '2',
  '-ar', '44100'
])

// Track 级混音 amix 的**输入个数**（人声合轨 1 + 背景 1）——固定 2，不由人声段数决定
// （人声多段先 concat 成 1 路再参与 amix）。
const TRACK_MIX_AMIX_INPUTS = 2

// 构造类错误一律记为永久错误：参数形状不对属于程序性缺陷，重试不会变好（不得空耗 3 轮）。
const buildTrackMixCommandError = (code, message) => {
  const error = new Error(`${code}：${getString(message)}`)
  error.code = code
  error.permanent = true

  return error
}

// 音量字面量格式化：0.33 → "0.33"、1 → "1"（避免 0.33000000000000007 这类浮点噪声进命令行）。
const formatTrackMixVolume = (value) => String(Math.round(Number(value) * 10000) / 10000)

// undefined / null / 空串 ⇒ 用权威常量兜底；显式给了非法值（负数 / NaN / Infinity）⇒ 直接报错。
const resolveTrackMixVolume = ({ value, fallback, label }) => {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw buildTrackMixCommandError(
      'INVALID_TRACK_MIX_VOLUME',
      `${label} 音量非法（${getString(value)}）：必须为 >= 0 的有限数值`
    )
  }

  return parsed
}

const resolveTrackMixVolumes = ({ voiceVolume, backgroundVolume } = {}) => ({
  voice: resolveTrackMixVolume({
    value: voiceVolume,
    fallback: MEDITATION_TRACK_VOLUMES.voice,
    label: 'voice'
  }),
  background: resolveTrackMixVolume({
    value: backgroundVolume,
    fallback: MEDITATION_TRACK_VOLUMES.background,
    label: 'background'
  })
})

const normalizeTrackMixPathList = (voiceInputPaths) => (
  (Array.isArray(voiceInputPaths) ? voiceInputPaths : [])
    .map((item) => getString(item).trim())
    .filter(Boolean)
)

// 输入区：人声各段（顺序＝数组序，**不重排**）＋ 背景（唯一带 `-stream_loop -1` 的输入）。
// `-stream_loop` 是**输入侧**选项，必须紧贴它所修饰的那一路 `-i`。
const buildTrackMixInputArgs = ({ voiceInputPaths = [], backgroundInputPath = '' }) => {
  const voicePaths = normalizeTrackMixPathList(voiceInputPaths)
  const backgroundPath = getString(backgroundInputPath).trim()

  if (voicePaths.length === 0) {
    throw buildTrackMixCommandError('MISSING_TRACK_MIX_VOICE_INPUT', '人声输入为空：至少需要 1 段人声')
  }

  if (!backgroundPath) {
    throw buildTrackMixCommandError('MISSING_TRACK_MIX_BACKGROUND_INPUT', '背景输入为空：混音必须且只能有 1 路背景')
  }

  return [
    ...voicePaths.reduce((args, voicePath) => args.concat(['-i', voicePath]), []),
    '-stream_loop', '-1',
    '-i', backgroundPath
  ]
}

// filtergraph 构造（导出以便自测逐字断言）：
//   [0:a]aformat=…[voice0]; … [N:a]aformat=…[bg0];
//   人声 count>1：[voice0]…[voiceN]concat=n=<count>:v=0:a=1[voiceCat]    （count==1：直接用 [voice0]）
//   [voiceCat]volume=<voice>[voiceMix];
//   [bg0]volume=<background>[bgMix];
//   [voiceMix][bgMix]amix=inputs=2:duration=first:normalize=0,asplit=2[labels…]
const buildTrackMixFilterGraph = ({ voiceInputCount, voiceVolume, backgroundVolume }) => {
  const voiceCount = Math.floor(Number(voiceInputCount) || 0)
  if (voiceCount < 1) {
    throw buildTrackMixCommandError('INVALID_TRACK_MIX_VOICE_COUNT', `人声段数非法（${getString(voiceInputCount)}）`)
  }

  const volumes = resolveTrackMixVolumes({ voiceVolume, backgroundVolume })
  const backgroundInputIndex = voiceCount
  const chains = []

  for (let index = 0; index < voiceCount; index += 1) {
    chains.push(`[${index}:a]${TRACK_MIX_INPUT_NORMALIZE_FILTER}[voice${index}]`)
  }
  chains.push(`[${backgroundInputIndex}:a]${TRACK_MIX_INPUT_NORMALIZE_FILTER}[bg0]`)

  // concat 至少需要 2 路输入；只有 1 段人声时该段直接进合轨音量节点（不得写 concat=n=1）。
  if (voiceCount > 1) {
    const voiceLabels = Array.from({ length: voiceCount }, (unused, index) => `[voice${index}]`).join('')
    chains.push(`${voiceLabels}concat=n=${voiceCount}:v=0:a=1[voiceCat]`)
  }
  const voiceCatLabel = voiceCount > 1 ? '[voiceCat]' : '[voice0]'

  chains.push(`${voiceCatLabel}volume=${formatTrackMixVolume(volumes.voice)}[voiceMix]`)
  chains.push(`[bg0]volume=${formatTrackMixVolume(volumes.background)}[bgMix]`)
  chains.push([
    `[voiceMix][bgMix]amix=inputs=${TRACK_MIX_AMIX_INPUTS}:duration=first:normalize=0`,
    `asplit=2[${TRACK_MIX_OUTPUT_LABELS.opus}][${TRACK_MIX_OUTPUT_LABELS.mp3}]`
  ].join(','))

  return chains.join(';')
}

// 完整 argv（喂给 execFile 的参数数组，不含 ffmpeg 二进制本身）：
// 先把混音结果作为 filtergraph 的输出（asplit 两路），再 `-map` 给两个编码器各一次。
const buildTrackMixArgs = ({
  voiceInputPaths = [],
  backgroundInputPath = '',
  voiceVolume,
  backgroundVolume,
  opusOutputPath = '',
  mp3OutputPath = ''
}) => {
  const voicePaths = normalizeTrackMixPathList(voiceInputPaths)
  if (!voicePaths.length) {
    throw buildTrackMixCommandError('MISSING_TRACK_MIX_VOICE_INPUT', '人声输入为空：至少需要 1 段人声')
  }

  const oggPath = getString(opusOutputPath).trim()
  const mp3Path = getString(mp3OutputPath).trim()
  if (!oggPath || !mp3Path) {
    throw buildTrackMixCommandError('MISSING_TRACK_MIX_OUTPUT', '双路输出路径必须都给（.ogg + .mp3）')
  }

  return [
    '-y',
    ...buildTrackMixInputArgs({ voiceInputPaths: voicePaths, backgroundInputPath }),
    '-filter_complex', buildTrackMixFilterGraph({
      voiceInputCount: voicePaths.length,
      voiceVolume,
      backgroundVolume
    }),
    '-map', `[${TRACK_MIX_OUTPUT_LABELS.opus}]`,
    ...TRACK_MIX_OPUS_ENCODER_ARGS,
    '-f', 'ogg', oggPath,
    '-map', `[${TRACK_MIX_OUTPUT_LABELS.mp3}]`,
    ...TRACK_MIX_MP3_ENCODER_ARGS,
    '-f', 'mp3', mp3Path
  ]
}

module.exports = {
  TRACK_MIX_INPUT_NORMALIZE_FILTER,
  TRACK_MIX_OUTPUT_LABELS,
  TRACK_MIX_OPUS_ENCODER_ARGS,
  TRACK_MIX_MP3_ENCODER_ARGS,
  TRACK_MIX_AMIX_INPUTS,
  buildTrackMixCommandError,
  formatTrackMixVolume,
  resolveTrackMixVolumes,
  buildTrackMixInputArgs,
  buildTrackMixFilterGraph,
  buildTrackMixArgs
}
