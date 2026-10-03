// ─── Track 级混音排队（transcode_profile = 'track_mix'）的纯逻辑 ───────────────
// 混合播放（人声与背景必须同时出声）走**服务端预混单流**：后台只负责把「整条 Track 的混音任务」
// 写进队列集合 `audio_transcode_jobs`，由云侧执行器消费并回写 `med_tracks.mix_audio`。
//
// 本模块**只做纯计算**（不碰数据库、不碰 UI）：
//   · 定 Track 版本（track_version）；
//   · 按章序取人声段（六章模板覆盖的 10 个人声段，**每段把该段全部已转码 take 按段内 take 序全取**）；
//   · 定章间留白插入计划（每个留白挂在该章最后一个 take 之后，最后一个有人声内容的章恒 0）；
//   · 定背景来源（三选一里的一个）；
//   · 组 audio_transcode_jobs 载荷。
// 数据库读写（幂等查询 + 写库）在 `admin/services/database.js` 的入队方法里；按钮与轮询在
// `admin/components/Dashboard/MeditationPage.jsx` 的「冥想轨道」tab。
//
// 【job 输入契约（audio_transcode_jobs 文档；snake_case 为规范键，逐字照用、不得改名）】
//   必需：transcode_profile = 'track_mix' / track_key / track_version（> 0 的整数）/
//         voice_section_audio_ids（**有序数组**，元素为 med_section_audios 文档 id；
//         顺序＝章序，**章内按段内 take 序（段落序）**；执行器不重排）/
//         voice_section_gap_after_seconds（**与上一数组等长的数值数组**，逐位给出「该 take 之后
//         要插入的章间留白秒数」，0 表示不插；末位恒 0——末章不留尾部静默）/
//         voice_leading_silence_seconds（**第一个（人声）段之前**的前导静音秒数＝其前所有
//         **「有可用音频」章**的 gap 之和；本模板下＝两个背景章的 gap 之和，默认 282s；
//         某背景章无可用音频时**不计其 gap**。端侧播放器对**进光标的段**累加 gap（含背景段）
//         ⇒ 背景章留白会把人声轨整体后移，故混音必须复现这段前导静音）
//   背景来源（三选一，至少给一个；执行器优先级：background_file_id >
//         background_section_audio_id > background_section_type）
//   可选：volumes（含 voice / background；缺省由执行器取权威常量配比）/ track_document_id
//         / target_cloud_path（缺省由执行器按 track_key + track_version 拼）
//
// 【人声段取法（本单口径）】严格按六章模板的人声段顺序（10 段）；**每段把该段下所有「已转码完成」
//   的 take 全取**（不再「每段只取最新一条」——那是「人声紧挨着拼、总长只有人声之和」的旧口径），
//   段内顺序＝**take 序（段落序）**：先按该 take 覆盖段落在其 Section-Raw 里的起始下标，
//   再按 created_at 升序（录制序＝ take-N 序），最后按文档 id 字典序决胜 ⇒ 同库同输入必得同一顺序。
//   「已转码完成」＝该 med_section_audios 文档的 `file_id` 非空（Opus 主体已落地，执行器取的就是它）。
//
// 【章间留白（本单口径，与计划层严格同源）】留白＝**只计「有可用音频」的章**的 gap：
//   某章「有可用音频」＝该章 section_types 在候选池（`sectionAudios`，与入队侧取数同一批数据）中
//   至少有一条「已转码完成」（`file_id` 非空）的音频；此即计划层
//   `packages/shared-utils/meditation-track-playback-plan.js:433` 的 contentEntries
//   （＝有可用段的启用章）口径 ⇒ **无可用音频的章其 gap 不计入**（前导静音与留白数组均同此）。
//   依据：端侧播放器只遍历 `plan.segments`，无可用音频的章根本不进光标
//   （`apps/app/src/modules/meditate/MeditationPlayerScreen.jsx:264-288`），故不计才是同源；
//   且 R47-③-c 的不变量（产物时长严格等于计划层 totals.total_seconds）是**无条件**的。
//   取值来源与端侧共享计划层**同源**：Track 的 `chapters[].gap_after_seconds` 优先、
//   缺省回退模板默认值（`MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT`）、
//   **末（有可用内容的）章固定 0**（在过滤后的集合上判定）、禁用章不计。
//   · **前导静音**：第一个（人声）段之前＝其前所有「有可用音频」章的 gap 之和
//     （默认两背景章各 141 ⇒ 282s；某背景章无可用音频时不计其 141 ⇒ 141s）——
//     依据＝`MeditationPlayerScreen.jsx:264-288`：播放器遍历 plan.segments 时对**进光标的章**
//     累加 `gap_after_seconds`，故背景章的留白会把人声轨整体后移；
//     `meditation-track-playback-plan.js` 的 `totals.gap_seconds` 亦等于 Σ 所有「有可用内容的章」的 gap。
//   · 各人声章之后：按「该章最后一个 take 之后」插入（见 resolveMeditationTrackMixGapAfterInputSeconds）。
//   留白期间背景**继续出声**（执行器侧靠 `-stream_loop -1` 整条铺满实现，含前导静音与各留白段）。
//   可测不变量：产物实测时长 ＝ Σ(全部人声 take 实测时长) ＋ Σ(全部计入的章留白)
//   （每段只有 1 条 take 时严格等于计划层 `totals.total_seconds`）——**无条件成立**。

import {
  MEDITATION_SECTION_TYPE_LABELS,
  MEDITATION_SECTION_TYPE_META,
  MEDITATION_TRACK_BACKGROUND_SECTION_TYPES,
  MEDITATION_TRACK_CHAPTER_TEMPLATE,
  MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
  MEDITATION_TRACK_VOICE_SECTION_TYPES,
  normalizeMeditationChapterCode,
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

// ── 混音产物「可见警告」（本单：超软基准照常产出但必须可见；不阻断、不改终态）────────────
// 云侧 buildTrackMixWarnings 在**照常产出**的前提下把两类码落到 job 文档的可选字段
// `warnings[]`（逐项 `{ code, message }`）/ `warning_message`（已拼好的整串）——老分区无此二键。
//   · durationOverSoftBaseline：产物时长超出软基准 900s（15:00）——**照常产出、未做任何截断**；
//   · durationMismatch：产物实测时长与「前导静音 ＋ 人声之和 ＋ 章间留白」不一致（不变量失配）。
// 二者都**不阻断、不改 job 终态**；本模块只把 job 文档里的警告转成后台可读文案（上屏**零规范编号**）。
export const MEDITATION_TRACK_MIX_WARNING_CODES = Object.freeze({
  durationOverSoftBaseline: 'MIX_DURATION_OVER_SOFT_BASELINE',
  durationMismatch: 'MIX_DURATION_MISMATCH'
})

// 警告上屏的**统一抬头**（说明「已产出、不阻断、不截断」；不含任何规范编号）。
export const MEDITATION_TRACK_MIX_WARNING_HEADLINE = '混合音频已生成，但存在需留意的警告（已照常产出、未做任何截断，不影响产物可用）：'

// 码 → 固定文案的兜底（云侧 message 缺失时才用；**英文码不上屏**）。
const MEDITATION_TRACK_MIX_WARNING_FALLBACK_TEXT = Object.freeze({
  [MEDITATION_TRACK_MIX_WARNING_CODES.durationOverSoftBaseline]: '产物时长超出 15:00 软基准，请核对章节时长与章间留白配置',
  [MEDITATION_TRACK_MIX_WARNING_CODES.durationMismatch]: '产物时长与「前导静音 ＋ 人声之和 ＋ 章间留白」不一致，请人工核查'
})

// job 文档 → 警告行数组（纯函数，可被测试直接驱动；空数组＝不显示警告）：
//   · 优先取 `warnings[]`：逐条取 `message`（trim 后非空者）；`message` 缺失 ⇒ 按 `code` 回落固定文案；
//     两者都不识别 ⇒ 丢弃（**英文码不上屏**）；
//   · `warnings[]` 缺失 / 全空 ⇒ 再取 `warning_message`（非空即用）；
//   · 两处都没有 ⇒ 返回 []（成功但无警告、以及老分区 job 文档均不受影响）。
export const resolveMeditationTrackMixWarningLines = (job = {}) => {
  const warnings = Array.isArray(job?.warnings) ? job.warnings : []
  const lines = warnings
    .map((warning) => {
      const message = String(warning?.message || '').trim()
      if (message) {
        return message
      }

      return MEDITATION_TRACK_MIX_WARNING_FALLBACK_TEXT[warning?.code] || ''
    })
    .filter(Boolean)

  if (lines.length > 0) {
    return lines
  }

  const fallback = String(job?.warning_message || '').trim()

  return fallback ? [fallback] : []
}

// Track 版本号取值：取**当前 Track 文档的 `version`**（med_tracks 的版本号，每次保存 +1）。
// 该字段缺失 / 非正数时的兜底＝**常量默认值 1**——依据：新建 Track 的版本就从 1 起
//（见 database.js `createMedTrack` 与读侧归一 `normalizeMedTrack` 的 toPositiveNumber(doc.version, 1)），
// 故「无版本号」与「第 1 版」同义。job 契约要求 > 0 的整数 ⇒ 向下取整、下限 1。
export const resolveMeditationTrackMixTrackVersion = (track = {}) => {
  const parsed = Math.floor(Number(track?.version))

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const roundSeconds = (value) => Math.round((Number(value) || 0) * 1000) / 1000

// 「已转码完成」判据：Opus 主体已落地（file_id 非空）。仅登记了原始录制文件（original_*）不算。
const isTranscodedSectionAudio = (audio = {}) => Boolean(String(audio?.file_id || '').trim())

const resolveSectionAudioDocumentId = (audio = {}) => String(audio?._id || audio?.id || '')

// 段码读侧归一后比较：库里若还是旧 `sec-*` 别名，也要能挂到模板的新代号段上（写侧只写新值）。
const matchesSectionType = (audio = {}, sectionType = '') => (
  normalizeMeditationSectionCode(audio?.section_type) === sectionType
)

// Section-Raw 的段落次序表：raw 文档 id → 其 `paragraph_ids`（顺序即段落序）。
const buildSectionRawParagraphMap = (sectionRaws = []) => (
  (Array.isArray(sectionRaws) ? sectionRaws : []).reduce((accumulator, raw) => {
    const rawId = String(raw?._id || raw?.id || '').trim()
    if (!rawId) {
      return accumulator
    }

    return { ...accumulator, [rawId]: (Array.isArray(raw?.paragraph_ids) ? raw.paragraph_ids : []) }
  }, {})
)

// 该 take 覆盖段落在其 Section-Raw 的段落序里的起始下标（查不到 ⇒ +∞，退化为按录制序排）。
const resolveSectionAudioParagraphStartIndex = ({ audio = {}, sectionRawParagraphMap = {} }) => {
  const paragraphIds = Array.isArray(audio?.paragraph_ids_snapshot) ? audio.paragraph_ids_snapshot : []
  const firstParagraphId = String(paragraphIds[0] || '').trim()
  const rawParagraphIds = sectionRawParagraphMap[String(audio?.section_raw_id || '').trim()] || []
  const index = firstParagraphId ? rawParagraphIds.indexOf(firstParagraphId) : -1

  return index >= 0 ? index : Number.MAX_SAFE_INTEGER
}

// 段内 take 序（＝段落序）：段落起始下标 → created_at 升序（录制序）→ 文档 id 升序。
const compareSectionAudioTakeOrder = (left, right) => (
  left.paragraphStartIndex - right.paragraphStartIndex
  || left.createdAt.localeCompare(right.createdAt)
  || left.documentId.localeCompare(right.documentId)
)

// 人声段解析（**严格按六章模板的人声段顺序**，10 段；**段内 take 全取**）。
//
// 缺段处置＝**拒绝入队，不静默跳过**：某段下一条「已转码完成」的 Audio 都没有时，把该段记进
// `missingSectionTypes` 交给调用方抛错。理由：混音产物是「按章序把每个人声段的 take 拼成一条整轨」——
// 少一段就是成品缺章，静默跳过会产出「听起来正常、实际缺章」的交付物，且拼接顺序错位后无人可查；
// 执行器对缺段只会报永久错误（VOICE_SOURCE_NOT_READY 之类），排队方先拦下能给出更早、更具体
// 的定位（缺的是哪一段）。宁可让管理员看到「某某段缺音频」去补录，也不产出一条残轨。
export const resolveMeditationTrackMixVoiceSections = ({ sectionAudios = [], sectionRaws = [] } = {}) => {
  const audios = Array.isArray(sectionAudios) ? sectionAudios : []
  const sectionRawParagraphMap = buildSectionRawParagraphMap(sectionRaws)
  const voiceSections = []
  const missingSectionTypes = []

  MEDITATION_TRACK_VOICE_SECTION_TYPES.forEach((sectionType) => {
    const takes = audios
      .filter((audio) => matchesSectionType(audio, sectionType))
      .filter(isTranscodedSectionAudio)
      .map((audio) => ({
        documentId: resolveSectionAudioDocumentId(audio),
        paragraphStartIndex: resolveSectionAudioParagraphStartIndex({ audio, sectionRawParagraphMap }),
        createdAt: String(audio?.created_at || '')
      }))
      .filter((take) => Boolean(take.documentId))
      .sort(compareSectionAudioTakeOrder)

    if (takes.length === 0) {
      missingSectionTypes.push(sectionType)
      return
    }

    takes.forEach((take) => {
      voiceSections.push({ section_type: sectionType, section_audio_id: take.documentId })
    })
  })

  return {
    voiceSections,
    voiceSectionAudioIds: voiceSections.map((entry) => entry.section_audio_id),
    missingSectionTypes
  }
}

// 章间留白取值（与端侧共享计划层**同源**；权威源＝packages/shared-utils/meditation-track-template.js）：
//   · Track 的 `chapters[].gap_after_seconds` 优先；
//   · 缺省回退模板默认值 `MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT`；
//   · 末章（模板最后一章）固定 0；
//   · 禁用章不计（记 0）。
const resolveChapterGapSeconds = ({ trackChapter = null, isLastChapter = false } = {}) => {
  if (isLastChapter) {
    return 0
  }

  if (isPlainObject(trackChapter) && trackChapter.enabled === false) {
    return 0
  }

  const rawGap = trackChapter?.gap_after_seconds
  const parsedGap = Number(rawGap)

  if (rawGap !== undefined && rawGap !== null && rawGap !== '' && Number.isFinite(parsedGap) && parsedGap >= 0) {
    return roundSeconds(parsedGap)
  }

  return MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT
}

// 章「有可用音频」集合（D-1 本单口径，与计划层 contentEntries 同口径）：
// 某章「有可用音频」＝该章 section_types 在候选池中至少有一条「已转码完成」（`file_id` 非空）的音频。
//   · 判据与入队侧已有取数**同一批数据**（`sectionAudios`：resolveMeditationTrackMixVoiceSections
//     与 resolveMeditationTrackMixBackground 用的就是它）。
//   · 传入数组（含空数组）时按池过滤；**未传**（null / undefined）时无从判定 ⇒ 回落为「全部模板章均计」
//     的既有口径（入队载荷恒传 sectionAudios，正常路径不吃该兜底）。
// 计划层把「无可用段的章」从 contentEntries 里滤掉、其 gap 不计入 totals
// （meditation-track-playback-plan.js:433）⇒ 本集合即混音侧必须对齐的章集合。
const resolveChapterKeysWithAudio = (sectionAudios = null) => {
  if (!Array.isArray(sectionAudios)) {
    return new Set(MEDITATION_TRACK_CHAPTER_TEMPLATE.map((chapter) => chapter.chapter_key))
  }

  return new Set(
    MEDITATION_TRACK_CHAPTER_TEMPLATE
      .filter((chapter) => (Array.isArray(chapter?.section_types) ? chapter.section_types : [])
        .some((sectionType) => sectionAudios.some((audio) => (
          matchesSectionType(audio, sectionType) && isTranscodedSectionAudio(audio)
        ))))
      .map((chapter) => chapter.chapter_key)
  )
}

export const resolveMeditationTrackMixChapterGaps = ({ track = null } = {}) => {
  const trackChapterMap = (Array.isArray(track?.chapters) ? track.chapters : []).reduce((accumulator, chapter) => {
    const chapterKey = normalizeMeditationChapterCode(chapter?.chapter_key)

    if (!chapterKey || accumulator[chapterKey]) {
      return accumulator
    }

    return { ...accumulator, [chapterKey]: chapter }
  }, {})

  return MEDITATION_TRACK_CHAPTER_TEMPLATE.reduce((accumulator, templateChapter, index) => ({
    ...accumulator,
    [templateChapter.chapter_key]: resolveChapterGapSeconds({
      trackChapter: trackChapterMap[templateChapter.chapter_key] || null,
      isLastChapter: index === MEDITATION_TRACK_CHAPTER_TEMPLATE.length - 1
    })
  }), {})
}

// 留白插入计划：把每个章间留白挂在该章**最后一个 take** 之后的数组下标上，
// 并保证**最后一个「有可用音频」的有人声章恒 0**（不留尾部静默，口径同计划层 :437-447）。
// 「有可用音频」集合由 sectionAudios 判定（同计划层 contentEntries）；某章无可用音频 ⇒ 其 gap 记 0。
// 注意：**两个背景章**的留白不落在此数组里（这里只按人声 take 逐位给出），
// 而是由 resolveMeditationTrackMixLeadingSilenceSeconds 折算成**前导静音**。
export const resolveMeditationTrackMixGapAfterInputSeconds = ({ voiceSections = [], track = null, sectionAudios = null } = {}) => {
  const sections = Array.isArray(voiceSections) ? voiceSections : []
  const chapterGaps = resolveMeditationTrackMixChapterGaps({ track })
  const chapterKeysWithAudio = resolveChapterKeysWithAudio(sectionAudios)
  const lastTakeIndexByChapter = new Map()

  sections.forEach((entry, index) => {
    const chapterKey = MEDITATION_SECTION_TYPE_META[entry?.section_type]?.chapter_key

    if (chapterKey) {
      lastTakeIndexByChapter.set(chapterKey, index)
    }
  })

  // 过滤后的内容集＝「有可用音频」且「有人声 take」的章（与计划层 contentEntries 同口径），
  // 末（有可用内容的）章即在此集合上判定。
  const chapterKeysWithContent = MEDITATION_TRACK_CHAPTER_TEMPLATE
    .map((chapter) => chapter.chapter_key)
    .filter((chapterKey) => chapterKeysWithAudio.has(chapterKey) && lastTakeIndexByChapter.has(chapterKey))
  const lastChapterWithContent = chapterKeysWithContent[chapterKeysWithContent.length - 1]

  return sections.map((entry, index) => {
    const chapterKey = MEDITATION_SECTION_TYPE_META[entry?.section_type]?.chapter_key

    if (!chapterKey || chapterKey === lastChapterWithContent || !chapterKeysWithAudio.has(chapterKey)) {
      return 0
    }

    return lastTakeIndexByChapter.get(chapterKey) === index ? (chapterGaps[chapterKey] || 0) : 0
  })
}

// 前导静音（本单口径）：**第一个（人声）段之前**、其前所有**「有可用音频」章**的 gap 之和。
// 端侧播放器遍历 plan.segments 时对**进光标的段**累加 `gap_after_seconds`
// （`MeditationPlayerScreen.jsx:264-288`）⇒ 背景章的留白会把人声轨整体后移；混音产物必须复现
// 同一段前导静音，产物时间轴才与端侧严格同源、`totals.total_seconds` 才等价。
// 固定六章模板下＝ chapter-nature ＋ chapter-bowl 两章 gap 之和（默认 141 × 2 ＝ 282s）；
// **某背景章无可用音频 ⇒ 不计其 gap**（与计划层 contentEntries 同口径，D-1 修正）。
// 禁用章已在 resolveMeditationTrackMixChapterGaps 里记 0；第一个（人声）段之前没有章 ⇒ 0。
export const resolveMeditationTrackMixLeadingSilenceSeconds = ({ voiceSections = [], track = null, sectionAudios = null } = {}) => {
  const sections = Array.isArray(voiceSections) ? voiceSections : []
  const firstChapterKey = MEDITATION_SECTION_TYPE_META[sections[0]?.section_type]?.chapter_key
  const firstChapterIndex = MEDITATION_TRACK_CHAPTER_TEMPLATE
    .findIndex((chapter) => chapter.chapter_key === firstChapterKey)

  // 找不到（理论上不会：人声段类型恒属六章模板）或首个人声段就在第一章 ⇒ 无前导静音。
  if (firstChapterIndex <= 0) {
    return 0
  }

  const chapterGaps = resolveMeditationTrackMixChapterGaps({ track })
  const chapterKeysWithAudio = resolveChapterKeysWithAudio(sectionAudios)

  return roundSeconds(
    MEDITATION_TRACK_CHAPTER_TEMPLATE
      .slice(0, firstChapterIndex)
      .filter((chapter) => chapterKeysWithAudio.has(chapter.chapter_key))
      .reduce((sum, chapter) => sum + (chapterGaps[chapter.chapter_key] || 0), 0)
  )
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
    .sort((left, right) => (
      String(right?.created_at || '').localeCompare(String(left?.created_at || ''))
      || resolveSectionAudioDocumentId(left).localeCompare(resolveSectionAudioDocumentId(right))
    ))[0]

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
export const buildMeditationTrackMixJobPayload = ({
  track = null,
  sectionAudios = [],
  sectionRaws = [],
  now = ''
} = {}) => {
  const trackKey = String(track?.track_key || '').trim()

  if (!trackKey) {
    throw new Error('混音入队被拒绝：当前 Track 缺少 track_key，无法定位 Track 文档与交付目录。')
  }

  const { voiceSections, voiceSectionAudioIds, missingSectionTypes } = resolveMeditationTrackMixVoiceSections({
    sectionAudios,
    sectionRaws
  })

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
    voice_section_gap_after_seconds: resolveMeditationTrackMixGapAfterInputSeconds({ voiceSections, track, sectionAudios }),
    voice_leading_silence_seconds: resolveMeditationTrackMixLeadingSilenceSeconds({ voiceSections, track, sectionAudios }),
    background_section_audio_id: background.section_audio_id,
    background_section_type: background.section_audio_id ? '' : background.section_type,
    attempt_count: 0,
    error_message: '',
    created_at: now,
    updated_at: now
  }
}
