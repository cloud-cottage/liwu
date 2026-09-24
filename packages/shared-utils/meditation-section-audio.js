// ─── med_section_audios（CloudBase 集合）规范化 ───────────────────────────────
// 字段严格对齐 meditation.admin.partner.spec.md「med_section_audios」定义（L361-L384）：
//   Opus 主体：file_id / audio_url / mime_type
//   mp3 兜底（D3）：fallback_file_id / fallback_audio_url / fallback_mime_type
//   交付格式：transcoded_formats（['opus','mp3'] 为双格式齐备，只有 ['opus'] 视为未完成交付）
//   纯音频段显示名：label；原始录制文件：original_file_id + original_url / original_mime_type
// 读路径兼容历史 mp3_file_id / mp3_url / mp3_mime_type（读到旧字段即映射为新字段，不报错）；
// 写路径一律只写规范字段名。

export const MEDITATION_SECTION_AUDIO_COLLECTION = 'med_section_audios'

export const MEDITATION_SECTION_AUDIO_SOURCE_KINDS = Object.freeze({
  recording: 'recording',
  upload: 'upload',
  legacyImport: 'legacy-import'
})

export const MEDITATION_SECTION_AUDIO_FORMATS = Object.freeze({
  opus: 'opus',
  mp3: 'mp3',
  raw: 'raw'
})

export const MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE = Object.freeze({
  opus: 'audio/ogg; codecs="opus"',
  mp3: 'audio/mpeg'
})

export const MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS = Object.freeze({
  idle: 'idle',
  queued: 'queued',
  processing: 'processing',
  succeeded: 'succeeded',
  failed: 'failed'
})

export const MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS_LABELS = Object.freeze({
  idle: '待转码',
  queued: '排队中',
  processing: '转码中',
  succeeded: '已完成',
  failed: '转码失败'
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
export const normalizeMeditationTranscodedFormats = (formats = []) => {
  const values = toTranscodedFormatValues(formats)

  return MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS.filter((format) => values.includes(format))
}

// 已完成的交付格式：
// - 有 transcoded_formats 时以其为准（转码流程回写）；
// - 历史文档没有该字段时，按已登记的交付 URL 推断（兼容 mp3_url）。
export const resolveMeditationSectionAudioTranscodedFormats = (audio = {}) => {
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
// 用法：updateMedSectionAudio(id, { audio_url, file_id, transcoded_formats:
//   mergeMeditationSectionAudioTranscodedFormats(current.transcoded_formats, 'opus') })
export const mergeMeditationSectionAudioTranscodedFormats = (currentFormats = [], format = '') => (
  normalizeMeditationTranscodedFormats([
    ...(Array.isArray(currentFormats) ? currentFormats : []),
    format
  ])
)

// 双格式交付是否齐备（规范：只有 ['opus'] 视为未完成交付）。
export const isMeditationSectionAudioDeliveryComplete = (audio = {}) => {
  const deliveredFormats = resolveMeditationSectionAudioTranscodedFormats(audio)

  return MEDITATION_SECTION_AUDIO_DELIVERED_FORMAT_KEYS.every((format) => deliveredFormats.includes(format))
}

export const normalizeMedSectionAudio = (doc = {}) => {
  const now = new Date().toISOString()
  const targetFormat = doc.target_format === MEDITATION_SECTION_AUDIO_FORMATS.mp3
    ? MEDITATION_SECTION_AUDIO_FORMATS.mp3
    : MEDITATION_SECTION_AUDIO_FORMATS.opus
  // 读路径兼容历史 mp3_* 字段
  const fallbackFileId = doc.fallback_file_id || doc.mp3_file_id || ''
  const fallbackAudioUrl = toAudioUrl(doc.fallback_audio_url || doc.mp3_url)
  const hasFallbackFile = Boolean(fallbackFileId || fallbackAudioUrl)
  const fallbackMimeType = doc.fallback_mime_type
    || doc.mp3_mime_type
    || (hasFallbackFile ? MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE.mp3 : '')

  return {
    _id: doc._id || doc.id || '',
    id: doc._id || doc.id || '',
    section_raw_id: doc.section_raw_id || '',
    section_type: doc.section_type || '',
    file_id: doc.file_id || '',
    audio_url: toAudioUrl(doc.audio_url),
    duration: Number(doc.duration ?? 0),
    mime_type: doc.mime_type || MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE.opus,
    transcoded_formats: resolveMeditationSectionAudioTranscodedFormats({
      transcoded_formats: doc.transcoded_formats,
      audio_url: doc.audio_url,
      fallback_audio_url: fallbackAudioUrl
    }),
    fallback_file_id: fallbackFileId,
    fallback_audio_url: fallbackAudioUrl,
    fallback_mime_type: fallbackMimeType,
    label: doc.label || '',
    original_file_id: doc.original_file_id || '',
    original_url: toAudioUrl(doc.original_url),
    original_mime_type: doc.original_mime_type || '',
    target_format: targetFormat,
    transcode_status: doc.transcode_status || MEDITATION_SECTION_AUDIO_TRANSCODE_STATUS.idle,
    transcode_error: doc.transcode_error || '',
    source_kind: doc.source_kind || MEDITATION_SECTION_AUDIO_SOURCE_KINDS.recording,
    paragraph_ids_snapshot: Array.isArray(doc.paragraph_ids_snapshot) ? doc.paragraph_ids_snapshot : [],
    text_snapshot: doc.text_snapshot || '',
    char_count: Number(doc.char_count ?? 0),
    stale: Boolean(doc.stale),
    recorded_by: doc.recorded_by || '',
    created_at: doc.created_at || now,
    updated_at: doc.updated_at || now
  }
}

export const toMedSectionAudioPayload = (audio = {}) => {
  const normalizedAudio = normalizeMedSectionAudio(audio)

  return {
    section_raw_id: normalizedAudio.section_raw_id,
    section_type: normalizedAudio.section_type,
    file_id: normalizedAudio.file_id,
    audio_url: normalizedAudio.audio_url,
    duration: normalizedAudio.duration,
    mime_type: normalizedAudio.mime_type,
    transcoded_formats: normalizedAudio.transcoded_formats,
    fallback_file_id: normalizedAudio.fallback_file_id,
    fallback_audio_url: normalizedAudio.fallback_audio_url,
    fallback_mime_type: normalizedAudio.fallback_mime_type,
    label: normalizedAudio.label,
    original_file_id: normalizedAudio.original_file_id,
    original_url: normalizedAudio.original_url,
    original_mime_type: normalizedAudio.original_mime_type,
    target_format: normalizedAudio.target_format,
    transcode_status: normalizedAudio.transcode_status,
    transcode_error: normalizedAudio.transcode_error,
    source_kind: normalizedAudio.source_kind,
    paragraph_ids_snapshot: normalizedAudio.paragraph_ids_snapshot,
    text_snapshot: normalizedAudio.text_snapshot,
    char_count: normalizedAudio.char_count,
    stale: normalizedAudio.stale,
    recorded_by: normalizedAudio.recorded_by
  }
}

// 播放候选顺序（规范 L486「两种格式依次尝试」）：Opus 主体 → mp3 兜底 → 原始录制文件。
// 是否可播由浏览器 canPlayType 判定（见 admin/utils/meditationAudioCapture.js）。
// 读路径兼容历史 mp3_* 字段名。
export const getMeditationSectionAudioFormatCandidates = (audio = {}) => {
  const candidates = []
  const fallbackAudioUrl = audio.fallback_audio_url || audio.mp3_url || ''
  const fallbackMimeType = audio.fallback_mime_type || audio.mp3_mime_type || MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE.mp3

  if (audio.audio_url) {
    candidates.push({
      format: MEDITATION_SECTION_AUDIO_FORMATS.opus,
      url: audio.audio_url,
      mime_type: audio.mime_type || MEDITATION_SECTION_AUDIO_TARGET_MIME_TYPE.opus,
      is_fallback: false
    })
  }

  if (fallbackAudioUrl) {
    candidates.push({
      format: MEDITATION_SECTION_AUDIO_FORMATS.mp3,
      url: fallbackAudioUrl,
      mime_type: fallbackMimeType,
      is_fallback: true
    })
  }

  if (audio.original_url) {
    const isOpusRecording = String(audio.original_mime_type || '').includes('opus')
    candidates.push({
      format: isOpusRecording ? MEDITATION_SECTION_AUDIO_FORMATS.opus : MEDITATION_SECTION_AUDIO_FORMATS.raw,
      url: audio.original_url,
      mime_type: audio.original_mime_type || '',
      is_fallback: true,
      is_raw_take: true
    })
  }

  return candidates
}

// 按 section_type 归集候选池中的实测时长（取最大值，作为 Track 预估的保守值）。
export const buildMeditationSectionDurationMap = (sectionAudios = []) => (
  (Array.isArray(sectionAudios) ? sectionAudios : []).reduce((accumulator, audio) => {
    const sectionType = audio?.section_type || ''
    const duration = Number(audio?.duration ?? 0)

    if (!sectionType || !Number.isFinite(duration) || duration <= 0) {
      return accumulator
    }

    return {
      ...accumulator,
      [sectionType]: Math.max(accumulator[sectionType] || 0, duration)
    }
  }, {})
)
