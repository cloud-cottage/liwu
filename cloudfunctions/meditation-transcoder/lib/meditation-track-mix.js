// ─── Track 双轨混音口径：转码执行器用的「精简等价模块」 ────────────────────────
//
// 【权威源（authoritative source）】本文件的四个常量**各有其权威源**，逐条如下：
//   · MEDITATION_TRACK_COLLECTION（值 'med_tracks'）
//       → packages/shared-utils/meditation-track-normalizers.js
//         （该文件内 `export const MEDITATION_TRACK_COLLECTION = 'med_tracks'`；
//          meditation-track-template.js 的导出里**没有**这个常量）。
//   · MEDITATION_TRACK_VOLUMES —— 二级转引，分两级：
//       → 直接来源：packages/shared-utils/meditation-track-template.js
//         （该文件 `import { MEDITATION_TRACK_VOLUMES } from './meditation-session-plan.js'` 后转引给
//          MEDITATION_TRACK_BACKGROUND_CONFIG.volume / MEDITATION_TRACK_VOICE_CONFIG.volume；
//          template 自身**不**再导出该常量，故比对基准取下面的定义源头）
//       → 定义源头：packages/shared-utils/meditation-session-plan.js
//         （`export const MEDITATION_TRACK_VOLUMES = Object.freeze({ background: 0.33, voice: 1 })`）
//   · MEDITATION_TRACK_BACKGROUND_SECTION_TYPES
//       → packages/shared-utils/meditation-track-template.js
//   · MEDITATION_TRACK_VOICE_SECTION_TYPES
//       → packages/shared-utils/meditation-track-template.js
//   云函数（SCF）只打包函数目录，**不能** require 仓库内的共享模块（Zang 裁定 D-B2-8），
//   所以这里必须放一份副本。本文件只搬运「Track 级混音（profile = 'track_mix'）用得到」的那部分口径：
//     MEDITATION_TRACK_VOLUMES                    配比：voice = 1 / background = 0.33
//     MEDITATION_TRACK_BACKGROUND_SECTION_TYPES   背景段类型白名单（纯音频段）
//     MEDITATION_TRACK_VOICE_SECTION_TYPES        人声段类型白名单（章序由章模板决定）
//     MEDITATION_TRACK_COLLECTION                 Track 文档集合名（med_tracks）
//
// 【防漂移（必读）】上述权威源里这四个常量的任一改动——**配比数值**、段类型白名单、集合名——
//   **必须同步本文件**；责任方＝修改权威源的人；两侧不一致时**一律以权威源为准**。
//   本文件**不得**自行新增配比或段类型（例如为了让背景「听起来更明显」把 0.33 调成 0.5）：
//   任何数值调整一律**先走规范修订、再同步权威源与本副本**。
//
// 【为什么不复用 lib/meditation-formats.js】那一份副本承载的是 med_section_audios 的**字段口径**
//   （权威源 = packages/shared-utils/meditation-section-audio.js）；本文件承载的是 **Track 双轨口径**
//   （权威源 = packages/shared-utils/meditation-track-template.js；集合名另源自
//     packages/shared-utils/meditation-track-normalizers.js）。两者的权威源不同，
//   混成一个文件会让「改了哪个权威源该同步哪份副本」失去一一对应关系，故分开。

const getString = (value) => (value == null ? '' : String(value))

const MEDITATION_TRACK_COLLECTION = 'med_tracks'

// 逐字对齐权威源（packages/shared-utils/meditation-session-plan.js）：
//   export const MEDITATION_TRACK_VOLUMES = Object.freeze({ background: 0.33, voice: 1 });
// ⚠ 混音时人声恒为 1.0（不衰减），背景恒为 0.33；两者都由 amix 的**显式 volume 滤镜**给定，
//   不依赖 amix 的默认归一（默认 normalize=1 会把 2 个输入各减半 ⇒ 配比虽在但整体掉 6dB）。
const MEDITATION_TRACK_VOLUMES = Object.freeze({
  background: 0.33,
  voice: 1
})

// 背景天然是「循环铺满」的纯音频轨（权威源：MEDITATION_TRACK_BACKGROUND_SECTION_TYPES）。
const MEDITATION_TRACK_BACKGROUND_SECTION_TYPES = Object.freeze(['sec-nature', 'sec-bowl'])

// 人声轨＝10 个段（权威源：MEDITATION_TRACK_VOICE_SECTION_TYPES，顺序即章模板顺序）。
// 混音时**不据此重排**：输入顺序由 job 的 voice_section_audio_ids 给定（排队方按章序落库）；
// 本白名单只用于契约说明与诊断（例如判别某 id 其实是背景段）。
const MEDITATION_TRACK_VOICE_SECTION_TYPES = Object.freeze([
  'anchorGreeting',
  'basePreparation',
  'corpusAlignment',
  'deeperAwareness',
  'essentialBreath',
  'flowingRespiration',
  'gnosisElaboration',
  'heartAffirmation',
  'innerIntegration',
  'joyfulClosing'
])

// 段码是否属于背景轨（归一后精确匹配；空值/未知码一律 false，不猜）。
const isMeditationBackgroundSectionType = (sectionType = '') => (
  MEDITATION_TRACK_BACKGROUND_SECTION_TYPES.includes(getString(sectionType).trim())
)

module.exports = {
  MEDITATION_TRACK_COLLECTION,
  MEDITATION_TRACK_VOLUMES,
  MEDITATION_TRACK_BACKGROUND_SECTION_TYPES,
  MEDITATION_TRACK_VOICE_SECTION_TYPES,
  isMeditationBackgroundSectionType
}
