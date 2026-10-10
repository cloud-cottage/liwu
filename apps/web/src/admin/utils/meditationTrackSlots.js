// ─── 「冥想轨道」Track 配置：槽位（`med_tracks.chapters[].slots[]`，R49-②）纯逻辑 ────────
//
// 本模块只做三件事，**不新造第二套归一**：
//   ① 取值域派生 —— 章允许的段类型（权威＝六章模板 `MEDITATION_TRACK_CHAPTER_TEMPLATE`）；
//   ② 老 Track 只读派生 —— 缺 `slots` 时按 `chapters[].section_types` 一类型一槽（R49-③）；
//   ③ 写入前校验 —— slot_index 唯一且有序 / section_type 非空且在章允许范围 / selector 合法
//      （pinned ⇒ audio_id 必须存在于音频库；pool ⇒ 必须有抽签段类型）/ policy 属允许值。
//
// 真正落库的「归一」一律复用 `packages/shared-utils` 的 `normalizeChapterSlots`（经
// `toMedTrackPayload` ⇒ `normalizeMedTrack`）；本模块**不复制、不改写**那份白名单。
// UI（`MeditationTrackSlotsEditor` / `MeditationTracksTab`）与写侧（`database.js`）共用本模块。

import {
  MEDITATION_TRACK_CHAPTER_TEMPLATE,
  MEDITATION_TRACK_SLOT_POLICIES,
  MEDITATION_TRACK_SLOT_SELECTOR_KINDS,
  getMeditationSectionDisplayLabelWithCode,
  normalizeMeditationSectionCode
} from '@liwu/shared-utils/meditation-track-template.js';

const POLICY_VALUES = Object.freeze(Object.values(MEDITATION_TRACK_SLOT_POLICIES));
const SELECTOR_KIND_VALUES = Object.freeze(Object.values(MEDITATION_TRACK_SLOT_SELECTOR_KINDS));

const isBlank = (value) => value == null || String(value).trim() === '';

// 章允许的段类型（权威源＝六章模板；**不新增第二份**）。空 / 未知名 ⇒ 空数组。
export const getChapterAllowedSectionTypes = (chapterKey = '') => {
  const chapter = MEDITATION_TRACK_CHAPTER_TEMPLATE.find((item) => item.chapter_key === chapterKey);
  return chapter ? [...chapter.section_types] : [];
};

// 下拉选项：段类型 ＋ 上屏名（走既有权威 helper，**不硬编码第二份中文名**）。
export const getChapterSlotSectionTypeOptions = (chapterKey = '') => (
  getChapterAllowedSectionTypes(chapterKey).map((sectionType) => ({
    section_type: sectionType,
    label: getMeditationSectionDisplayLabelWithCode(sectionType) || sectionType
  }))
);

// 老 Track（无 `slots`）只读派生：按现有 `chapters[].section_types` 一类型一槽（R49-③）。
// 这是**展示用**派生，不是要写回的 `slots`（保存时老 Track 的 `slots` 恒为空 ⇒ 不迁移）。
export const deriveLegacyChapterSlots = (chapter = {}) => (
  (Array.isArray(chapter?.section_types) ? chapter.section_types : []).map((sectionType, index) => ({
    slot_index: index,
    section_type: sectionType,
    selector: null,
    policy: MEDITATION_TRACK_SLOT_POLICIES.random,
    derived: true
  }))
);

// 音频库查询：`med_section_audios` 的 id 口径与 `normalizeMedSectionAudio` 一致（`_id` / `id`）。
export const isKnownAudioId = (sectionAudios = [], audioId = '') => (
  (Array.isArray(sectionAudios) ? sectionAudios : []).some((audio) => (
    (audio?._id || audio?.id || '') === audioId
  ))
);

// ─── 写入前校验 ──────────────────────────────────────────────────────────────
// 入参：`chapters`（draft 章数组，可含 `slots`）、`chapterTemplate`（缺省＝六章模板）、
// `sectionAudios`（可选：给了才校验 pinned 目标存在性；结构校验恒做）。
// 返回：`{ ok, errors, errorCount }`；`errors` 逐项 `{ chapter_key, chapter_label, slot_index,
// index, code, message }` —— **拒绝必须显式给文案、不得静默**（R47 / R48 的写侧纪律）。
// 空 `slots` ⇒ 老语义（R49-③）：不校验、也不报错（老 Track 不被强迫迁移）。
export const validateMeditationTrackSlots = ({
  chapters = [],
  chapterTemplate = MEDITATION_TRACK_CHAPTER_TEMPLATE,
  sectionAudios = null
} = {}) => {
  const errors = [];
  const chapterList = Array.isArray(chapters) ? chapters : [];
  const template = Array.isArray(chapterTemplate) && chapterTemplate.length
    ? chapterTemplate
    : MEDITATION_TRACK_CHAPTER_TEMPLATE;
  const checkPinnedExistence = Array.isArray(sectionAudios);

  chapterList.forEach((chapter) => {
    const slots = Array.isArray(chapter?.slots) ? chapter.slots : [];

    if (slots.length === 0) {
      return;
    }

    const chapterKey = chapter?.chapter_key || '';
    const templateChapter = template.find((item) => item.chapter_key === chapterKey);
    const chapterLabel = templateChapter?.label || chapter?.label || chapterKey;
    const allowedSectionTypes = templateChapter ? [...templateChapter.section_types] : [];
    const seenSlotIndexes = new Set();
    let previousSlotIndex = -Infinity;

    slots.forEach((slot, index) => {
      const push = (code, message) => errors.push({
        chapter_key: chapterKey,
        chapter_label: chapterLabel,
        slot_index: slot?.slot_index,
        index,
        code,
        message
      });
      const position = `第 ${index + 1} 槽`;

      // ① slot_index：同章唯一且有序。
      const rawSlotIndex = Number(slot?.slot_index);

      if (!Number.isInteger(rawSlotIndex) || rawSlotIndex < 0) {
        push('SLOT_INDEX_INVALID', `${position}的 slot_index 非法（须为非负整数）`);
      } else {
        if (seenSlotIndexes.has(rawSlotIndex)) {
          push('SLOT_INDEX_DUPLICATE', `${position}的 slot_index ${rawSlotIndex} 在同章内重复（须唯一）`);
        }
        seenSlotIndexes.add(rawSlotIndex);

        if (rawSlotIndex <= previousSlotIndex) {
          push('SLOT_INDEX_UNORDERED', `${position}的 slot_index ${rawSlotIndex} 未按序递增（须有序）`);
        }
        previousSlotIndex = rawSlotIndex;
      }

      // ② section_type：非空且属本章允许范围（无推荐映射 ⇒ 拒绝、不得写空）。
      const declaredSectionType = isBlank(slot?.section_type) ? '' : String(slot.section_type).trim();
      const normalizedSectionType = normalizeMeditationSectionCode(declaredSectionType);

      if (!declaredSectionType) {
        push('SECTION_TYPE_EMPTY', `${position}未设置段类型（无推荐映射，不得写空）`);
      } else if (!allowedSectionTypes.includes(normalizedSectionType)) {
        push(
          'SECTION_TYPE_OUT_OF_RANGE',
          `${position}的段类型「${declaredSectionType}」不属于本章允许范围（${allowedSectionTypes.join(' / ') || '无'}）`
        );
      }

      // ③ selector：pinned(audio_id) / pool(section_type, tags[])。
      const selector = slot?.selector;

      if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
        push('SELECTOR_INVALID', `${position}未选择选择器类型（须 pinned 或 pool）`);
      } else {
        const kind = isBlank(selector.kind) ? '' : String(selector.kind).trim();

        if (!SELECTOR_KIND_VALUES.includes(kind)) {
          push('SELECTOR_INVALID', `${position}的选择器类型「${selector.kind ?? ''}」非法（须 pinned 或 pool）`);
        } else if (kind === MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pinned) {
          const audioId = isBlank(selector.audio_id) ? '' : String(selector.audio_id).trim();

          if (!audioId) {
            push('PINNED_AUDIO_EMPTY', `${position}为 pinned 但未选择具体音频`);
          } else if (checkPinnedExistence && !isKnownAudioId(sectionAudios, audioId)) {
            push('PINNED_AUDIO_MISSING', `${position}锁定的音频 ${audioId} 不存在于音频库（med_section_audios）`);
          }
        } else if (isBlank(selector.section_type)) {
          push('POOL_SECTION_TYPE_EMPTY', `${position}为 pool 但未设置抽签段类型`);
        }
      }

      // ④ policy：属允许值（random / no_repeat）。
      const policy = isBlank(slot?.policy) ? '' : String(slot.policy).trim();

      if (!POLICY_VALUES.includes(policy)) {
        push('POLICY_INVALID', `${position}的策略「${slot?.policy ?? ''}」非法（须 ${POLICY_VALUES.join(' 或 ')}）`);
      }
    });
  });

  return { ok: errors.length === 0, errors, errorCount: errors.length };
};

// 校验结果 ⇒ 可见文案（逐项列出、含章名与槽位序号；拒绝绝不静默）。
export const buildSlotValidationMessage = (result = {}) => {
  const errors = Array.isArray(result?.errors) ? result.errors : [];

  if (errors.length === 0) {
    return '';
  }

  const lines = errors.map((error) => (
    `· ${error.chapter_label ? `【${error.chapter_label}】` : ''}${error.message}`
  ));

  return `槽位配置有 ${errors.length} 处错误，已阻止保存：\n${lines.join('\n')}`;
};
