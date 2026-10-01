// ─── Track 级混音排队（transcode_profile = 'track_mix'）的纯逻辑 ───────────────
// 混合播放（人声与背景必须同时出声）走**服务端预混单流**：后台只负责把「整条 Track 的混音任务」
// 写进队列集合 `audio_transcode_jobs`，由云侧执行器消费并回写 `med_tracks.mix_audio`。
//
// 本模块**只做纯计算**（不碰数据库、不碰 UI）：
//   · 定 Track 版本（track_version）；
//   · 按章序取人声段（六章模板覆盖的 10 个人声段，各取一条 med_section_audios 文档 id）；
//   · 定背景来源（三选一里的一个）；
//   · 组 audio_transcode_jobs 载荷。
// 数据库读写（幂等查询 + 写库）在 `admin/services/database.js` 的入队方法里；按钮与轮询在
// `admin/components/Dashboard/MeditationPage.jsx` 的「冥想轨道」tab。
//
// 【job 输入契约（audio_transcode_jobs 文档；snake_case 为规范键，逐字照用、不得改名）】
//   必需：transcode_profile = 'track_mix' / track_key / track_version（> 0 的整数）/
//         voice_section_audio_ids（**有序数组**，元素为 med_section_audios 文档 id；
//         顺序即章序，执行器不重排）
//   背景来源（三选一，至少给一个；执行器优先级：background_file_id >
//         background_section_audio_id > background_section_type）
//   可选：volumes（含 voice / background；缺省由执行器取权威常量配比）/ track_document_id
//         / target_cloud_path（缺省由执行器按 track_key + track_version 拼）
//
// 【人声段取法】严格按六章模板的人声段顺序（10 段），每段在本类型候选里取「已转码完成」且
//   created_at 最新的一条（并列按 _id 字典序决胜 ⇒ 同库同输入必得同一条，产物可复现）。
//   「已转码完成」＝该 med_section_audios 文档的 `file_id` 非空（Opus 主体已落地，执行器取的就是它）。

import {
  MEDITATION_SECTION_TYPE_LABELS,
  MEDITATION_TRACK_BACKGROUND_SECTION_TYPES,
  MEDITATION_TRACK_VOICE_SECTION_TYPES,
  normalizeMeditationSectionCode
} from '@liwu/shared-utils/meditation-track-template.js'

// 队列分区键（与云侧执行器的 TRACK_MIX_TRANSCODE_PROFILE 同字面值）。
export const MEDITATION_TRACK_MIX_TRANSCODE_PROFILE = 'track_mix'

// 轮询间隔：与「音频库」tab 的转码状态轮询同风格（8s 一次）。
export const MEDITATION_TRACK_MIX_POLL_INTERVAL_MS = 8000

// job 状态词表（与 `audio_transcode_jobs.status` 同字面值）。
export const MEDITATION_TRACK_MIX_JOB_STATUS = Object.freeze({
  queued: 'queued',
  processing: 'processing',
  succeeded: 'succeeded',
  failed: 'failed'
})

// 「进行中」＝还占着幂等名额的状态（queued / processing）。终态（succeeded / failed）不占：
// 失败后允许重新排队；成功但 Track 版本已推进的也允许再排一版。
export const isMeditationTrackMixJobPending = (job = {}) => (
  job?.status === MEDITATION_TRACK_MIX_JOB_STATUS.queued
  || job?.status === MEDITATION_TRACK_MIX_JOB_STATUS.processing
)

// Track 版本号取值：取**当前 Track 文档的 `version`**（med_tracks 的版本号，每次保存 +1）。
// 该字段缺失 / 非正数时的兜底＝**常量默认值 1**——依据：新建 Track 的版本就从 1 起
//（见 database.js `createMedTrack` 与读侧归一 `normalizeMedTrack` 的 toPositiveNumber(doc.version, 1)），
// 故「无版本号」与「第 1 版」同义。job 契约要求 > 0 的整数 ⇒ 向下取整、下限 1。
export const resolveMeditationTrackMixTrackVersion = (track = {}) => {
  const parsed = Math.floor(Number(track?.version))

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

// 「已转码完成」判据：Opus 主体已落地（file_id 非空）。仅登记了原始录制文件（original_*）不算。
const isTranscodedSectionAudio = (audio = {}) => Boolean(String(audio?.file_id || '').trim())

const resolveSectionAudioDocumentId = (audio = {}) => String(audio?._id || audio?.id || '')

// 同一段类型下的候选排序：created_at 倒序（缺值排最后），并列按文档 id 字典序 ⇒ 结果确定。
const compareSectionAudioRecency = (left, right) => {
  const createdAtOrder = String(right?.created_at || '').localeCompare(String(left?.created_at || ''))
  if (createdAtOrder !== 0) {
    return createdAtOrder
  }

  return resolveSectionAudioDocumentId(left).localeCompare(resolveSectionAudioDocumentId(right))
}

// 段码读侧归一后比较：库里若还是旧 `sec-*` 别名，也要能挂到模板的新代号段上（写侧只写新值）。
const matchesSectionType = (audio = {}, sectionType = '') => (
  normalizeMeditationSectionCode(audio?.section_type) === sectionType
)

// 人声段解析（**严格按六章模板的人声段顺序**，10 段）：每段取已转码且最新的一条文档 id。
//
// 缺段处置＝**拒绝入队，不静默跳过**：某段下一条「已转码完成」的 Audio 都没有时，把该段记进
// `missingSectionTypes` 交给调用方抛错。理由：混音产物是「10 段按章序拼成一条整轨」——少一段
// 就是成品缺章，静默跳过会产出「听起来正常、实际缺章」的交付物，且拼接顺序错位后无人可查；
// 执行器对缺段只会报永久错误（VOICE_SOURCE_NOT_READY 之类），排队方先拦下能给出更早、更具体
// 的定位（缺的是哪一段）。宁可让管理员看到「某某段缺音频」去补录，也不产出一条残轨。
export const resolveMeditationTrackMixVoiceSections = ({ sectionAudios = [] } = {}) => {
  const audios = Array.isArray(sectionAudios) ? sectionAudios : []
  const voiceSectionAudioIds = []
  const missingSectionTypes = []

  MEDITATION_TRACK_VOICE_SECTION_TYPES.forEach((sectionType) => {
    const latestTranscoded = audios
      .filter((audio) => matchesSectionType(audio, sectionType))
      .filter(isTranscodedSectionAudio)
      .sort(compareSectionAudioRecency)[0]

    const documentId = resolveSectionAudioDocumentId(latestTranscoded)

    if (!documentId) {
      missingSectionTypes.push(sectionType)
      return
    }

    voiceSectionAudioIds.push(documentId)
  })

  return { voiceSectionAudioIds, missingSectionTypes }
}

// 背景来源解析：按**章序里第一个启用的背景章**定段类型（六章模板固定：自然库 → 颂钵库）。
//   · 该类型下已有「已转码完成」的候选 ⇒ 冻结其文档 id（background_section_audio_id，
//     排队时点即定死、产物可复现）；
//   · 一条都没有 ⇒ 只给 background_section_type，让执行器按「该类型下已转码的最新一条」自取
//     （真的取不到时执行器报永久错误，不会空耗重试）。
// 两个背景章都未启用 ⇒ 返回 null，由调用方拒绝入队（没有背景轨就谈不上混音）。
export const resolveMeditationTrackMixBackground = ({ track = null, sectionAudios = [] } = {}) => {
  const enabledChapters = (Array.isArray(track?.chapters) ? track.chapters : [])
    .filter((chapter) => chapter?.enabled !== false)
  const backgroundSectionType = enabledChapters
    .flatMap((chapter) => (Array.isArray(chapter?.section_types) ? chapter.section_types : []))
    .map((sectionType) => normalizeMeditationSectionCode(sectionType))
    .find((sectionType) => MEDITATION_TRACK_BACKGROUND_SECTION_TYPES.includes(sectionType))

  if (!backgroundSectionType) {
    return null
  }

  const latestTranscoded = (Array.isArray(sectionAudios) ? sectionAudios : [])
    .filter((audio) => matchesSectionType(audio, backgroundSectionType))
    .filter(isTranscodedSectionAudio)
    .sort(compareSectionAudioRecency)[0]

  return {
    section_type: backgroundSectionType,
    section_audio_id: resolveSectionAudioDocumentId(latestTranscoded)
  }
}

const buildMissingVoiceSectionsMessage = (missingSectionTypes = []) => {
  const described = missingSectionTypes
    .map((sectionType) => `${sectionType}（${MEDITATION_SECTION_TYPE_LABELS[sectionType] || sectionType}）`)
    .join(' / ')

  return `混音入队被拒绝：以下人声段还没有「已转码完成」的音频 → ${described}。`
    + '请先在「原始音频库」补齐这些段的音频并等转码完成，再生成混合音频。'
}

// 组 audio_transcode_jobs 载荷（纯函数；snake_case 规范键）。任一前置不满足即**抛错拒绝入队**：
// 无 track_key / 有人声段缺音频 / 无可用背景章。volumes 不在本单覆盖范围 ⇒ 不写，
// 由执行器取权威常量配比（人声 1 / 背景 0.33）。
export const buildMeditationTrackMixJobPayload = ({ track = null, sectionAudios = [], now = '' } = {}) => {
  const trackKey = String(track?.track_key || '').trim()

  if (!trackKey) {
    throw new Error('混音入队被拒绝：当前 Track 缺少 track_key，无法定位 Track 文档与交付目录。')
  }

  const { voiceSectionAudioIds, missingSectionTypes } = resolveMeditationTrackMixVoiceSections({ sectionAudios })

  if (missingSectionTypes.length > 0) {
    throw new Error(buildMissingVoiceSectionsMessage(missingSectionTypes))
  }

  const background = resolveMeditationTrackMixBackground({ track, sectionAudios })

  if (!background) {
    throw new Error('混音入队被拒绝：当前 Track 未启用任何背景章（自然库 / 颂钵库），无法确定背景轨来源。')
  }

  const trackDocumentId = String(track?._id || track?.id || '')

  return {
    status: MEDITATION_TRACK_MIX_JOB_STATUS.queued,
    transcode_profile: MEDITATION_TRACK_MIX_TRANSCODE_PROFILE,
    track_key: trackKey,
    track_version: resolveMeditationTrackMixTrackVersion(track),
    track_document_id: trackDocumentId,
    voice_section_audio_ids: voiceSectionAudioIds,
    background_section_audio_id: background.section_audio_id,
    background_section_type: background.section_audio_id ? '' : background.section_type,
    attempt_count: 0,
    error_message: '',
    created_at: now,
    updated_at: now
  }
}
