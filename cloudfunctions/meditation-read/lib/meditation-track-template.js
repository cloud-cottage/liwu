// ─── 六章固定模板 / Section 类型：只读云函数用的「精简等价模块」 ────────────────
//
// 【权威源（authoritative source）】
//   ① packages/shared-utils/meditation-track-template.js
//        MEDITATION_CHAPTER_LABELS / MEDITATION_TRACK_CHAPTER_TEMPLATE /
//        MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT / MEDITATION_SECTION_TYPE_LABELS /
//        MEDITATION_SECTION_TYPE_ORDER / MEDITATION_TRACK_BACKGROUND_CONFIG / MEDITATION_TRACK_VOICE_CONFIG
//   ② packages/shared-utils/meditation-session-plan.js
//        MEDITATION_TRACK_VOLUMES（0.33 / 1）与 DEFAULT_MEDITATION_SESSION_SECONDS（15 分钟基准）
//
// 云函数（SCF）只打包函数目录，**不能** require 仓库内共享模块（Zang 裁定 D-B2-8）⇒ 本副本。
// 【同步责任】权威源里上述导出的改动（章名 / Section 名 / 章内 Section 序列 / 章时长上限 /
//   留白默认值 / 音量）**必须同步本文件**；责任方＝修改权威源的人；不一致时**以权威源为准**。
//
// 规范依据（docs/meditation.admin.partner.spec.md v4.6）：
//   - 六章顺序固定、不可重复；章内 Section 序列固定、**只读**（R10：数据不得覆盖模板顺序）。
//   - Section 名 / 章节名的**源是代码常量**，规范内对照表只是镜像（R21）。
//   - 章间留白默认 `141`（末章固定 0），**禁止在代码中硬编码**（此处即唯一常量落点，与权威源同值）。
//   - 双轨播放：背景 `sec-nature` / `sec-bowl` 走 `loop`、人声 9 类走 `sequence`（§5、D3）。

const MEDITATION_TRACK_VOLUMES = Object.freeze({
  background: 0.33,
  voice: 1
})

const DEFAULT_MEDITATION_SESSION_SECONDS = 15 * 60

const MEDITATION_CHAPTER_LABELS = Object.freeze({
  'chapter-nature': '自然库',
  'chapter-bowl': '颂钵库',
  'chapter-opening': '问候库',
  'chapter-breath': '呼吸库',
  'chapter-verse': '心语库',
  'chapter-closing': '告别库'
})

const MEDITATION_TRACK_CHAPTER_TEMPLATE = Object.freeze([
  Object.freeze({
    chapter_key: 'chapter-nature',
    order: 1,
    label: MEDITATION_CHAPTER_LABELS['chapter-nature'],
    section_types: Object.freeze(['sec-nature']),
    max_duration_seconds: 300
  }),
  Object.freeze({
    chapter_key: 'chapter-bowl',
    order: 2,
    label: MEDITATION_CHAPTER_LABELS['chapter-bowl'],
    section_types: Object.freeze(['sec-bowl']),
    max_duration_seconds: 30
  }),
  Object.freeze({
    chapter_key: 'chapter-opening',
    order: 3,
    label: MEDITATION_CHAPTER_LABELS['chapter-opening'],
    section_types: Object.freeze(['sec-intro', 'sec-place', 'sec-posture', 'sec-bridge']),
    max_duration_seconds: 130
  }),
  Object.freeze({
    chapter_key: 'chapter-breath',
    order: 4,
    label: MEDITATION_CHAPTER_LABELS['chapter-breath'],
    section_types: Object.freeze(['sec-prelude', 'sec-breath']),
    max_duration_seconds: 150
  }),
  Object.freeze({
    chapter_key: 'chapter-verse',
    order: 5,
    label: MEDITATION_CHAPTER_LABELS['chapter-verse'],
    section_types: Object.freeze(['sec-verse', 'sec-chorus']),
    max_duration_seconds: 270
  }),
  Object.freeze({
    chapter_key: 'chapter-closing',
    order: 6,
    label: MEDITATION_CHAPTER_LABELS['chapter-closing'],
    section_types: Object.freeze(['sec-outro']),
    max_duration_seconds: 30
  })
])

// 章间留白默认秒数（六章之间 5 个位置；最后一章固定 0）。
const MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT = 141

const MEDITATION_SECTION_TYPE_LABELS = Object.freeze({
  'sec-nature': '自然',
  'sec-bowl': '颂钵',
  'sec-intro': '开场问候',
  'sec-place': '安顿',
  'sec-posture': '坐姿',
  'sec-bridge': '过渡',
  'sec-prelude': '呼吸前奏',
  'sec-breath': '呼吸正文',
  'sec-verse': '心语正文',
  'sec-chorus': '心语复唱',
  'sec-outro': '告别'
})

const MEDITATION_SECTION_TYPE_ORDER = Object.freeze([
  'sec-nature',
  'sec-bowl',
  'sec-intro',
  'sec-place',
  'sec-posture',
  'sec-bridge',
  'sec-prelude',
  'sec-breath',
  'sec-verse',
  'sec-chorus',
  'sec-outro'
])

const MEDITATION_TRACK_BACKGROUND_SECTION_TYPES = Object.freeze(['sec-nature', 'sec-bowl'])
const MEDITATION_TRACK_VOICE_SECTION_TYPES = Object.freeze([
  'sec-intro',
  'sec-place',
  'sec-posture',
  'sec-bridge',
  'sec-prelude',
  'sec-breath',
  'sec-verse',
  'sec-chorus',
  'sec-outro'
])

const MEDITATION_TRACK_BACKGROUND_CONFIG = Object.freeze({
  section_types: MEDITATION_TRACK_BACKGROUND_SECTION_TYPES,
  playback_mode: 'loop',
  volume: MEDITATION_TRACK_VOLUMES.background
})

const MEDITATION_TRACK_VOICE_CONFIG = Object.freeze({
  section_types: MEDITATION_TRACK_VOICE_SECTION_TYPES,
  playback_mode: 'sequence',
  volume: MEDITATION_TRACK_VOLUMES.voice
})

const isMeditationSectionType = (sectionType = '') => MEDITATION_SECTION_TYPE_ORDER.includes(sectionType)

module.exports = {
  MEDITATION_TRACK_VOLUMES,
  DEFAULT_MEDITATION_SESSION_SECONDS,
  MEDITATION_CHAPTER_LABELS,
  MEDITATION_TRACK_CHAPTER_TEMPLATE,
  MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT,
  MEDITATION_SECTION_TYPE_LABELS,
  MEDITATION_SECTION_TYPE_ORDER,
  MEDITATION_TRACK_BACKGROUND_SECTION_TYPES,
  MEDITATION_TRACK_VOICE_SECTION_TYPES,
  MEDITATION_TRACK_BACKGROUND_CONFIG,
  MEDITATION_TRACK_VOICE_CONFIG,
  isMeditationSectionType
}
