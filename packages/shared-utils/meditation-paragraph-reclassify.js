import {
  getMeditationParagraphTypeDisplayLabel,
  MEDITATION_PARAGRAPH_TYPE_ORDER,
  MEDITATION_PARAGRAPH_TYPE_TO_SECTION_TYPE
} from './meditation-track-template.js'

// ─── 段落改分类（含已加入音频库的锁定段落）的归类同步纯逻辑 ──────────────────────
// 口径（用户已拍板）：
//   ① 段落 paragraph_type 写入新分类；
//   ② 该段名下**全部**音频（paragraph_ids_snapshot 含该段 id）的 section_type 同步改
//      为新分类的推荐段代号；无推荐映射 ⇒ 拒绝（返回 ok:false），绝不写空；
//   ③ 若所属 Section-Raw 只含它一个段落 ⇒ 连容器 section_type 一起改；含多段则不动容器；
//   ④ 归类跟着走 ⇒ 不标 stale；
//   ⑤ 写侧白名单：段落类型超出权威 10 类一律拒绝。
// 本模块只做纯计算（计划 + 读回比对 + 文案），不触库、不触 DOM，便于用桩数据断言。

export const MEDITATION_RECLASSIFY_MISSING_PARAGRAPH_MESSAGE = '缺少段落 ID，无法修改分类。'

export const buildMeditationReclassifyInvalidTypeMessage = (paragraphType = '', allowedCount = 0) => (
  `段落类型不合法，仅允许权威 ${allowedCount} 类：${getMeditationParagraphTypeDisplayLabel(paragraphType)}`
)

export const buildMeditationReclassifyNoSectionTypeMessage = (paragraphType = '') => (
  `段落类型「${getMeditationParagraphTypeDisplayLabel(paragraphType)}」没有对应的推荐段代号，无法同步音频分类，已拒绝保存。`
)

const normalizeId = (value) => String(value ?? '').trim()

// 计划：段落更新补丁 + 待同步音频 + 待同步容器 + 逐条写入期望（供读回比对）。
export const buildMeditationParagraphReclassificationPlan = ({
  paragraphId = '',
  currentParagraphType = '',
  nextParagraphType = '',
  paragraphAudios = [],
  owningSectionRaws = [],
  allowedParagraphTypes = MEDITATION_PARAGRAPH_TYPE_ORDER,
  sectionTypeByParagraphType = MEDITATION_PARAGRAPH_TYPE_TO_SECTION_TYPE
} = {}) => {
  const normalizedParagraphId = normalizeId(paragraphId)

  if (!normalizedParagraphId) {
    return { ok: false, error: MEDITATION_RECLASSIFY_MISSING_PARAGRAPH_MESSAGE }
  }

  const normalizedNextType = normalizeId(nextParagraphType)
  const allowedTypes = Array.isArray(allowedParagraphTypes) ? allowedParagraphTypes : []

  if (!allowedTypes.includes(normalizedNextType)) {
    return { ok: false, error: buildMeditationReclassifyInvalidTypeMessage(normalizedNextType, allowedTypes.length) }
  }

  const mapping = sectionTypeByParagraphType && typeof sectionTypeByParagraphType === 'object'
    ? sectionTypeByParagraphType
    : {}
  const targetSectionType = normalizeId(mapping[normalizedNextType])

  if (!targetSectionType) {
    return { ok: false, error: buildMeditationReclassifyNoSectionTypeMessage(normalizedNextType) }
  }

  // ② 该段名下全部音频：凭 paragraph_ids_snapshot 归属判定，section_type 已等于目标则无需再写。
  const audioUpdates = []
  for (const audio of (Array.isArray(paragraphAudios) ? paragraphAudios : [])) {
    if (!audio) continue
    const snapshot = Array.isArray(audio.paragraph_ids_snapshot) ? audio.paragraph_ids_snapshot : []
    if (!snapshot.includes(normalizedParagraphId)) continue
    const audioId = normalizeId(audio._id || audio.id)
    if (!audioId) continue
    const from = normalizeId(audio.section_type)
    if (from === targetSectionType) continue
    audioUpdates.push({ id: audioId, from, to: targetSectionType })
  }

  // ③ 容器：单段落 raw 跟随；多段落 raw 不动（记录以便提示）。
  const containerUpdates = []
  const containersSkipped = []
  const containersAligned = []
  for (const raw of (Array.isArray(owningSectionRaws) ? owningSectionRaws : [])) {
    if (!raw) continue
    const rawId = normalizeId(raw._id || raw.id)
    if (!rawId) continue
    const paragraphIds = (Array.isArray(raw.paragraph_ids) ? raw.paragraph_ids : []).map(normalizeId)
    if (!paragraphIds.includes(normalizedParagraphId)) continue
    const from = normalizeId(raw.section_type)
    if (paragraphIds.length === 1) {
      if (from === targetSectionType) {
        containersAligned.push({ id: rawId })
      } else {
        containerUpdates.push({ id: rawId, from, to: targetSectionType })
      }
    } else {
      containersSkipped.push({ id: rawId, paragraphCount: paragraphIds.length })
    }
  }

  // 逐条写入期望：读回比对以此为准（不得用 updated >= 1 判成功）。
  const writes = [
    {
      kind: 'paragraph',
      id: normalizedParagraphId,
      field: 'paragraph_type',
      expected: normalizedNextType,
      previous: normalizeId(currentParagraphType),
      label: '段落'
    },
    ...audioUpdates.map((update) => ({
      kind: 'audio', id: update.id, field: 'section_type', expected: update.to, previous: update.from, label: '候选音频'
    })),
    ...containerUpdates.map((update) => ({
      kind: 'sectionRaw', id: update.id, field: 'section_type', expected: update.to, previous: update.from, label: 'Section-Raw'
    }))
  ]

  return {
    ok: true,
    paragraphId: normalizedParagraphId,
    nextParagraphType: normalizedNextType,
    targetSectionType,
    paragraphTypeChanged: normalizeId(currentParagraphType) !== normalizedNextType,
    paragraphUpdate: { paragraph_type: normalizedNextType },
    audioUpdates,
    containerUpdates,
    containersSkipped,
    containersAligned,
    writes
  }
}

// 读回比对：readBack = { paragraph: {id: doc}, audio: {id: doc}, sectionRaw: {id: doc} }
// 任一条缺失或字段值不符 ⇒ 归入 mismatches（带 label/id/期望值/实际值，便于点名）。
export const compareMeditationReclassificationReadBack = ({ writes = [], readBack = {} } = {}) => {
  const mismatches = []

  for (const write of (Array.isArray(writes) ? writes : [])) {
    const bucket = readBack?.[write.kind] && typeof readBack[write.kind] === 'object' ? readBack[write.kind] : {}
    const doc = bucket[write.id]

    if (!doc) {
      mismatches.push({ ...write, actual: '(读回时未找到该对象)' })
      continue
    }

    if (String(doc[write.field] ?? '') !== String(write.expected ?? '')) {
      mismatches.push({ ...write, actual: doc[write.field] ?? '' })
    }
  }

  return { ok: mismatches.length === 0, mismatches }
}

export const buildMeditationReclassificationFailureMessage = (mismatches = []) => {
  const list = Array.isArray(mismatches) ? mismatches : []

  if (list.length === 0) {
    return ''
  }

  const details = list
    .map((item) => `${item.label}(${item.id}) 的 ${item.field}：期望「${item.expected}」，读回「${item.actual}」`)
    .join('；')

  return `以下写入读回比对未通过（未生效），请核对：${details}`
}

export const buildMeditationReclassificationNotice = ({
  audioUpdates = [],
  containerUpdates = [],
  containersSkipped = [],
  containersAligned = [],
  targetSectionType = ''
} = {}) => {
  const audios = Array.isArray(audioUpdates) ? audioUpdates : []
  const followed = Array.isArray(containerUpdates) ? containerUpdates : []
  const skipped = Array.isArray(containersSkipped) ? containersSkipped : []
  const aligned = Array.isArray(containersAligned) ? containersAligned : []

  const audioPart = `已同步 ${audios.length} 条音频的段分类为「${targetSectionType}」`

  let containerPart = '该段落未归属任何 Section-Raw 容器'
  if (followed.length > 0) {
    containerPart = `容器已跟随更新：${followed.map((item) => item.id).join('、')}`
  } else if (skipped.length > 0) {
    containerPart = `容器含多段，未改动（${skipped.map((item) => `${item.id} 共 ${item.paragraphCount} 段`).join('、')}）`
  } else if (aligned.length > 0) {
    containerPart = '容器分类已与新分类一致，无需改动'
  }

  return `${audioPart}；${containerPart}。`
}
