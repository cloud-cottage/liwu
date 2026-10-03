import {
  getMeditationSectionAudioFormatCandidates,
  MEDITATION_SECTION_AUDIO_FORMATS,
  MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE,
  MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS
} from '@liwu/shared-utils/meditation-section-audio.js'

// ─── 网页录音（MediaRecorder） ────────────────────────────────────────────────
// 录制粒度：按 Paragraph 逐段录制，段间拼接由第二批的拼接执行器完成；
// 本模块只负责「录一段 → 产出音频文件 → 实测时长」。

export const MEDITATION_RECORDING_MIME_CANDIDATES = [
  { mime_type: 'audio/webm;codecs=opus', extension: 'webm', target_format: MEDITATION_SECTION_AUDIO_FORMATS.opus },
  { mime_type: 'audio/ogg;codecs=opus', extension: 'ogg', target_format: MEDITATION_SECTION_AUDIO_FORMATS.opus },
  { mime_type: 'audio/webm', extension: 'webm', target_format: MEDITATION_SECTION_AUDIO_FORMATS.mp3 },
  { mime_type: 'audio/mp4', extension: 'm4a', target_format: MEDITATION_SECTION_AUDIO_FORMATS.mp3 },
  { mime_type: 'audio/mpeg', extension: 'mp3', target_format: MEDITATION_SECTION_AUDIO_FORMATS.mp3 }
]

export const MEDITATION_RECORDING_UNSUPPORTED_MESSAGE = '当前浏览器不支持网页录音（MediaRecorder / 麦克风不可用），请改用「上传音频文件」。'
export const MEDITATION_RECORDING_PERMISSION_MESSAGE = '无法访问麦克风（可能未授权或被其他程序占用），请在浏览器中允许麦克风后重试。'

export const isMeditationRecordingSupported = () => (
  typeof window !== 'undefined'
  && typeof window.MediaRecorder === 'function'
  && typeof navigator !== 'undefined'
  && Boolean(navigator.mediaDevices?.getUserMedia)
)

// 优先 Opus；浏览器不支持 Opus 录制时降级到其可用的压缩格式（转码目标为 mp3）。
export const resolveMeditationRecordingMimeType = () => {
  if (!isMeditationRecordingSupported()) {
    return null
  }

  return MEDITATION_RECORDING_MIME_CANDIDATES.find((candidate) => {
    try {
      return window.MediaRecorder.isTypeSupported(candidate.mime_type)
    } catch {
      return false
    }
  }) || null
}

// 转码目标格式：Opus 优先，浏览器/文件不支持 Opus 时按 mp3 兜底链路处理。
export const resolveMeditationAudioTargetFormat = (mimeType = '') => {
  const normalizedMimeType = String(mimeType || '').toLowerCase()

  if (normalizedMimeType.includes('opus')) {
    return MEDITATION_SECTION_AUDIO_FORMATS.opus
  }

  const matchedCandidate = MEDITATION_RECORDING_MIME_CANDIDATES.find(
    (candidate) => candidate.mime_type === normalizedMimeType
  )

  return matchedCandidate?.target_format || MEDITATION_SECTION_AUDIO_FORMATS.mp3
}

export const getMeditationRecordingExtension = (mimeType = '') => {
  const normalizedMimeType = String(mimeType || '').toLowerCase()
  const matchedCandidate = MEDITATION_RECORDING_MIME_CANDIDATES.find(
    (candidate) => candidate.mime_type === normalizedMimeType
  )

  if (matchedCandidate) {
    return matchedCandidate.extension
  }

  if (normalizedMimeType.includes('webm')) return 'webm'
  if (normalizedMimeType.includes('ogg')) return 'ogg'
  if (normalizedMimeType.includes('mp4') || normalizedMimeType.includes('m4a')) return 'm4a'
  if (normalizedMimeType.includes('mpeg')) return 'mp3'
  if (normalizedMimeType.includes('wav')) return 'wav'

  return 'bin'
}

export const startMeditationRecording = async ({ mimeType } = {}) => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mediaRecorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks = []

  const recorded = new Promise((resolve, reject) => {
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data)
      }
    }
    mediaRecorder.onerror = () => {
      reject(new Error(MEDITATION_RECORDING_PERMISSION_MESSAGE))
    }
    mediaRecorder.onstop = () => {
      const resolvedMimeType = mediaRecorder.mimeType || mimeType || 'audio/webm'
      resolve({
        blob: new Blob(chunks, { type: resolvedMimeType }),
        mime_type: resolvedMimeType
      })
    }
  })

  mediaRecorder.start()

  return { mediaRecorder, stream, recorded }
}

export const stopMeditationRecording = async ({ mediaRecorder, stream, recorded }) => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }

  try {
    return await recorded
  } finally {
    stream?.getTracks?.().forEach((track) => track.stop())
  }
}

export const MEDITATION_AUDIO_MEASURE_TIMEOUT_MS = 10000
export const MEDITATION_AUDIO_MEASURE_TIMEOUT_CODE = 'MEDITATION_AUDIO_MEASURE_TIMEOUT'
export const MEDITATION_AUDIO_MEASURE_DECODE_FAILED_CODE = 'MEDITATION_AUDIO_MEASURE_DECODE_FAILED'

const buildMeditationAudioMeasureError = (code, message) => {
  const error = new Error(message)
  error.code = code

  return error
}

// 实测时长（秒）。有界：解码失败与超时都 reject（带可辨识 error code），
// 由调用方退出 busy 并渲染错误；正常文件在读到元数据后 resolve。
// 不允许 Promise 永久不 settle —— 否则控件会永久停在「处理中…」，既不落库也无文案。
export const measureMeditationAudioDurationSeconds = (file) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file)
  const audio = document.createElement('audio')
  let settled = false
  let timer = null

  const cleanup = () => {
    clearTimeout(timer)
    audio.onloadedmetadata = null
    audio.onerror = null
    URL.revokeObjectURL(objectUrl)
  }

  const finalize = (duration) => {
    if (settled) return
    settled = true
    cleanup()
    resolve(Number.isFinite(duration) && duration > 0 ? duration : 0)
  }

  const fail = (code, message) => {
    if (settled) return
    settled = true
    cleanup()
    reject(buildMeditationAudioMeasureError(code, message))
  }

  timer = setTimeout(() => {
    fail(
      MEDITATION_AUDIO_MEASURE_TIMEOUT_CODE,
      `音频时长测量超时（超过 ${Math.round(MEDITATION_AUDIO_MEASURE_TIMEOUT_MS / 1000)} 秒），文件可能不可解码，请确认格式后重试`
    )
  }, MEDITATION_AUDIO_MEASURE_TIMEOUT_MS)

  audio.preload = 'metadata'
  audio.onloadedmetadata = () => finalize(Number(audio.duration))
  audio.onerror = () => fail(MEDITATION_AUDIO_MEASURE_DECODE_FAILED_CODE, '无法解码该音频文件（时长读取失败），请确认文件格式后重试')
  audio.src = objectUrl
})

// ─── 双格式播放选择（口径 3：Opus 优先，否则 mp3，两缺才报真异常） ─────────────

export const MEDITATION_AUDIO_MP3_FALLBACK_NOTICE = '已降级为 mp3 试听'
export const MEDITATION_AUDIO_RAW_TAKE_NOTICE = '转码未完成，暂以原始录音试听'
export const MEDITATION_AUDIO_UNAVAILABLE_MESSAGE = '试听失败：该条目没有任何音频文件'
export const MEDITATION_AUDIO_UNSUPPORTED_MESSAGE = '试听失败：浏览器不支持 Opus，且没有可用的兜底格式'

export const canPlayMeditationAudioMimeType = (mimeType = '') => {
  if (!mimeType) {
    return false
  }

  const probe = document.createElement('audio')

  try {
    return Boolean(probe.canPlayType(mimeType))
  } catch {
    return false
  }
}

const canPlayMeditationAudioCandidate = (candidate = {}) => (
  !candidate.mime_type || canPlayMeditationAudioMimeType(candidate.mime_type)
)

export const resolveMeditationSectionAudioPlayback = (audio = {}) => {
  const candidates = getMeditationSectionAudioFormatCandidates(audio)

  if (candidates.length === 0) {
    return { error: MEDITATION_AUDIO_UNAVAILABLE_MESSAGE }
  }

  const [primary, ...fallbacks] = candidates
  // 原始录制文件（转码未完成）：即使 canPlayType 通过也必须提示「暂以原始录音试听」，
  // 否则该提示在「只有 original_url」时永远不可达。
  const primaryRawTakeNotice = primary.is_raw_take ? MEDITATION_AUDIO_RAW_TAKE_NOTICE : ''

  if (canPlayMeditationAudioCandidate(primary)) {
    return {
      url: primary.url,
      format: primary.format,
      notice: primaryRawTakeNotice,
      is_fallback: Boolean(primary.is_fallback)
    }
  }

  const fallback = fallbacks.find(canPlayMeditationAudioCandidate)

  if (!fallback) {
    return { error: MEDITATION_AUDIO_UNSUPPORTED_MESSAGE }
  }

  return {
    url: fallback.url,
    format: fallback.format,
    notice: fallback.format === MEDITATION_SECTION_AUDIO_FORMATS.mp3
      ? MEDITATION_AUDIO_MP3_FALLBACK_NOTICE
      : MEDITATION_AUDIO_RAW_TAKE_NOTICE,
    is_fallback: true
  }
}

// ─── 一段一录：单段落落库载荷（段落文本库的录制 / 上传入口） ──────────────────
// 权威判据：paragraph_ids_snapshot 只含该段落 id（长度恒为 1 ⇒ 一段一录）；
// section_type 必须取自该段落类型的推荐段代号（无推荐映射 ⇒ 抛错拒绝，不静默写空）。
// section_raw_id 允许为空（段落录音不依赖已有 Section-Raw）。
export const MEDITATION_PARAGRAPH_SECTION_TYPE_MISSING_MESSAGE = '该段落类型没有对应的推荐段代号，无法录制或上传，请先确认段落类型';

export const buildMeditationParagraphAudioPayload = ({
  paragraphId = '',
  sectionType = '',
  paragraphText = '',
  capturedMimeType = '',
  durationSeconds = 0,
  fileId = '',
  audioUrl = '',
  sourceKind = ''
} = {}) => {
  const normalizedParagraphId = String(paragraphId ?? '').trim();
  const normalizedSectionType = String(sectionType ?? '').trim();

  if (!normalizedParagraphId) {
    throw new Error('缺少段落 ID，无法保存该段落的音频');
  }

  if (!normalizedSectionType) {
    throw new Error(MEDITATION_PARAGRAPH_SECTION_TYPE_MISSING_MESSAGE);
  }

  const normalizedText = String(paragraphText || '');

  return {
    section_raw_id: '',
    section_type: normalizedSectionType,
    file_id: '',
    audio_url: '',
    duration: Math.round(Number(durationSeconds || 0) * 100) / 100,
    mime_type: MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE.opus,
    original_file_id: fileId,
    original_url: audioUrl,
    original_mime_type: capturedMimeType,
    target_format: resolveMeditationAudioTargetFormat(capturedMimeType),
    source_kind: sourceKind,
    label: '',
    paragraph_ids_snapshot: [normalizedParagraphId],
    text_snapshot: normalizedText,
    char_count: normalizedText.length,
    stale: false
  };
};

// 重试转码资格：该条音频有原始文件（原始 file id 或原始 url）且当前状态为 failed / idle。
export const isMeditationSectionAudioTranscodeRetryable = (audio = {}) => (
  Boolean(audio.original_file_id || audio.original_url)
  && (
    audio.transcode_status === MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.failed
    || audio.transcode_status === MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.idle
  )
);

// 幂等判据：该条音频已有进行中的转码任务（queued / processing）时不得重复入队。
export const isMeditationSectionAudioTranscodePending = (audio = {}) => (
  audio.transcode_status === MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.queued
  || audio.transcode_status === MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.processing
);
