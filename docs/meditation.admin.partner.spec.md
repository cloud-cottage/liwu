# 管理员后台冥想页面设计规范（Meditation Admin）

> 本规范描述 `/partner` 管理后台中「冥想」页面的整体设计、子页面结构、UI 布局、交互与数据模型。
> 参考：
> - `ui.spec.md`（通用 UI 规范与样式系统）
> - `profile.miniprogram.ui.spec.md`（专项 UI 示例）
> - `packages/shared-utils/meditation-*.js`（核心逻辑）

---

## Meditation Track 的数据结构

1. Track
Track 是音频数据集对外发布的最小单元，本质为组合配置方案，非实体音频。
一条 Track 由若干 Chapter 组合而成；章节搭配、时长、拼接、截断等规则，均在 composition 组件中由管理员配置。

2. Chapter（共 6 类篇章，统一规则：超长尾部截断）
所有篇章设置固定时长，内容超时则在时间节点处截断；内部由对应 Section 按顺序无缝拼接，Section 类型与顺序固定不可更改。
  Chapter0 自然库（chapter-nature）：固定 300 秒，由 sec-nature 组成
  Chapter1 颂钵库（chapter-bowl）：固定 30 秒，由 sec-bowl 组成
  Chapter2 问候库（chapter-opening）：固定 130 秒，由 sec-intro、sec-place、sec-posture、sec-bridge 依次组成
  Chapter3 呼吸库：固定 150 秒，由 sec-prelude、sec-breath 依次组成
  Chapter4 心语库：固定 270 秒，由 sec-verse、sec-chorus 依次组成
  Chapter5 告别库（chapter-closing）：固定 30 秒，由 sec-outro 组成

3. Section
Section 是按业务功能划分的音频片段单元，是数据库与文件存储的最小实体音频单元，不可拆分。由 Section-Raw 文本经朗读生成。
每类 Section 配置独立最大时长，用于管控片段长度。
  sec-nature：固定 300 秒
  sec-bowl：固定 30 秒 
  sec-intro：固定 20 秒
  sec-place：固定 30 秒
  sec-posture：固定 40 秒
  sec-bridge：固定 40 秒
  sec-prelude：固定 70 秒
  sec-breath：固定 80 秒
  sec-verse：固定 120 秒
  sec-chorus：固定 150 秒
  sec-outro：固定 30 秒

4. Section-Raw
Section-Raw 是文本单元的集合，本质是数据集。
流转流程：Section-Raw（文本，由 Paragraph 顺序拼接） → 朗读加工 → Section
它由若干 Paragraph 顺序拼接而成，在 section-raw Tab 中可以设置。
  sec-nature：不需要判断字数
  sec-bowl：不需要判断字数
  sec-intro：大约 30 字
  sec-place：大约 40 字
  sec-posture：大约 50 字
  sec-bridge：大约 50 字
  sec-prelude：大约 90 字
  sec-breath：大约 100 字
  sec-verse：大约 150 字
  sec-chorus：大约 40 字
  sec-outro：大约 40 字

5. Paragraph
Paragraph 是数据库内的文本单元，仅存储纯文字，来源为人工录入或 AI 生成。
每个 Paragraph 有一个 `paragraph_type`（全新数据属性，不借鉴老 audio 类型），用于分类和推荐匹配 Section 类型。
初始推荐类型（可扩展）：`intro`、`breath`、`verse`

**新数据结构与集合（paragraph + section-raw 专用，新结构优先，未来完全替代老结构）**

### med_paragraphs（CloudBase 集合）
**字段定义**（类型为 CloudBase 推荐）：
- _id (string, 主键)
- text (string, 必填，纯文本内容)
- tags (array<string>, 默认 [])
- category (string, 可选)
- paragraph_type (string, 必填，推荐值：intro / breath / verse)
- created_at (string, ISO 日期)
- updated_at (string, ISO 日期)
- created_by (string, 管理员 UID)
- usage_count (number, 默认 0，用于星级)
- source (string, 'manual' | 'ai')
- ai_rewritten_from (string, 可选，原 paragraph _id)

**索引建议**：
- paragraph_type + created_at（复合，列表筛选）
- usage_count（降序，星级排序）
- created_by + created_at

**权限建议**（CloudBase 数据库权限）：
- 仅 partner 管理员角色可读写
- 匿名用户无权限

### med_section_raws（CloudBase 集合）
**字段定义**：
- _id (string)
- section_type (string, 如 'sec-intro')
- paragraph_ids (array<string>, 有序)
- target_char_count (number)
- current_char_count (number)
- word_count_status (string, 'ok' | 'slightly_over' | 'over' | 'slightly_under' | 'under')
- audio_id (string, 关联 med_section_audios._id，可选)
- created_at (string)
- updated_at (string)
- created_by (string)

**索引建议**：
- section_type + created_at
- created_by

**权限建议**：同 med_paragraphs，仅管理员。

### med_section_audios（CloudBase 集合）
**字段定义**：
- _id (string)
- section_raw_id (string, 必填，关联 med_section_raws._id)
- file_id (string)
- audio_url (string)
- duration (number)
- mime_type (string)
- created_at (string)
- updated_at (string)

**索引建议**：
- section_raw_id（唯一关联）
- created_at

**权限建议**：同上。

**迁移说明**：老的 meditationAudioLibrary / meditationLibrary 中的音频记录（含 tts_text）未来可直接删除，不做迁移。Section-Raw 是文本前置（对应 Track 结构中的 Section 文本来源），Section 是朗读后的实体音频单元。paragraph_type 与 section_type 推荐匹配但不强制。

## 集合与代码映射

| CloudBase 集合     | 代码中映射 / 说明 |
|--------------------|-------------------|
| med_paragraphs     | 新主数据源。Paragraph Tab 直接读写此集合。未来在 normalizers 中新增 normalizeParagraph / toParagraphPayload。 |
| med_section_raws   | Section-Raw Tab 核心。包含 paragraph_ids 数组 + word_count 字段。未来与 buildMeditationSessionPlan 逐步对接。 |
| med_section_audios | 独立音频记录。上传后关联到 med_section_raws.audio_id。最终音频路径仍遵循现有 Opus 规范。 |

**过渡规则**：
- 老代码（meditationAudioLibrary、meditationLibrary）保持只读/兼容。
- 新 Tab 完全基于 med_* 集合。
- 后续 Kong 实现时，优先实现新集合的 CRUD + UI。

## 音频格式与转码规范（从现有代码提取并固化）
当前代码对音频格式有一套清晰且一致的处理思路（合理，已确认）：

- **原始输入**：TTS 或管理员上传优先使用 MP3（路径示例：`meditation-audio-raw/{type}/{group}/{id}.mp3`）。
- **最终交付**：统一转码为 Opus（路径示例：`meditation-audio/{type}/{group}/{id}.opus`，MIME `audio/ogg; codecs="opus"`）。
- **转码参数**（固定，保证质量与体积平衡）：ffmpeg 使用 `libopus -b:a 48k -vbr on -compression_level 10 -application audio`。
- **预览逻辑**：优先检测 Opus（浏览器 supportLevel 需为 'probably'），否则阻断预览；非 Opus 按基本支持检查。
- **Mime 处理**：`getMeditationAudioMimeType` 根据扩展名区分（.opus → `audio/ogg; codecs="opus"`，.mp3 → 对应 audio/mpeg）。
- **TTS 流程**：原始输出为 MP3，后续走同一转码管道进入最终 Opus。
- **转码状态管理**：idle / queued / processing / succeeded / failed（通过 audioTranscodeJobs 集合）。
- **设计原则**：raw 与 final 分离、最终统一 Opus、预览严格兼容性检查。

此规范适用于所有 Section 音频生成与播放。

## 1. 信息架构与导航

### 1.1 入口
- 在 Partner 后台（`/partner`）中，存在「冥想」一级 Tab。
- 此 Tab 仅对管理员身份的用户可见。
- 点击后进入 `MeditationPage` 组件。
- 此 组件 仅对管理员身份的用户可访问。

### 1.2 子 Tab 结构（SUB_TABS）
页面内部使用水平子标签页，顺序固定：

| Key        | 中文标签 | 主要职责 |
|------------|----------|----------|
| `paragraph`  | 段落文本库   | 管理所有段落文本。这个页面是一张数据表，表格有筛选功能。最右侧的列有星级评分（系统自动，按使用次数累计）和仿写功能按钮（用 AI 生成一条新的数据）|
| `section-raw`  | 原始音频库   | 这个页面让管理员可以用 Paragraph 组成Section-Raw，并对字数（超出或不足）进行提示。然后可以为每条Section-Raw上传录制好的音频。|
| `library`  | 音频库   | 管理所有音频资源（颂钵、问候、自然、呼吸、心语、告别） |
| `presets`  | 冥想库   | 管理预设冥想（早课/午课/下午课/晚课等） |
| `composition` | 冥想设置 | 组合规则、音量、转场等配置 |
| `calendar` | 冥想日历 | 按日期分配冥想预设 |

---

## 2. 通用 UI 布局与样式

### 2.1 页面整体
- 采用卡片式布局（`cardStyle`）
- 卡片圆角 16px，内边距 28px，浅阴影
- 区块标题使用 `sectionTitleStyle`（15px 加粗 + 底部浅分割线）

### 2.2 通用控件样式（来自 MeditationPage）
- **Pill 按钮**：圆角 20px，用于子 Tab 和筛选
- **输入框**：`inputStyle`（13px，边框 #e2e8f0）
- **主按钮**：深色背景 `#1e293b`
- **危险按钮**：红色系（删除、移除）
- 响应式优先，移动端后台体验受限（参考通用提示）

### 2.3 状态与反馈
- 保存中：按钮禁用 + loading 文案
- 成功提示：短暂成功消息
- 错误：红色提示 + console 错误
- 预览阻断：浏览器不支持 Opus 等时的友好提示

---

## 3. 子页面详细设计

### 3.1 音频库（Library Tab）
**核心功能**
- 分组管理（groups）
- 音频条目列表（items）
- 上传音频文件
- 触发转码任务（Opus）
- 预览试听（带浏览器支持检测）

**UI 元素**
- 分组卡片列表
- 每个分组下可添加/删除条目
- 条目包含：名称、类型、时长、文件 ID / URL
- 操作：新增、编辑、删除、试听、排队转码

**数据模型（关键字段）**
- `library.groups[]`
- `library.items[]`（含 type、name、duration、fileId、audioUrl）

**特殊规则**
- Opus 格式需要浏览器支持检测
- 预览时会临时 fetch blob 并 revoke
- 转码状态通过 `MEDITATION_AUDIO_TRANSCODE_STATUS` 管理

### 3.2 冥想库（Presets Tab）
**核心功能**
- 管理冥想预设（meditations）
- 关联音频库 + 组合设置
- 预览生成的完整冥想计划

**UI 元素**
- 预设列表（名称、时长、所属时段）
- 编辑表单（选择音频片段、顺序）
- 预览播放器（基于 `buildMeditationSessionPlan`）
- 关联到日历的能力

**数据模型**
- `meditationLibrary.meditations[]`
- 每个 preset 包含 segments、时段标签（早/午/下午/晚）

**特殊规则**
- 预览会实时根据当前 audioLibrary + compositionSettings 生成 plan
- 不支持的音频格式会阻断预览

### 3.3 冥想设置（Composition Tab）
**核心功能**
- 定义音频组合规则
- 音量控制（MEDITATION_TRACK_VOLUMES）
- 转场、叠加、顺序逻辑

**UI 元素**
- 类型分类选择器
- 音量滑块 / 输入
- 预览影响范围说明

**数据模型**
- `compositionSettings`
- 与 `buildMeditationSessionPlan` 紧密耦合

### 3.4 冥想日历（Calendar Tab）
**核心功能**
- 按日期分配具体冥想预设
- 查看/编辑每日计划

**UI 元素**
- 日历视图（或列表 + 日期选择）
- 预设下拉选择
- 每日详情展示

**数据模型**
- `calendar.days`（key 为日期，value 为 preset id 或配置）

---

## 4. 数据流与持久化

- 所有数据通过 `useDatabase` hook 管理（`admin/hooks/useDatabase.js`）
- 关键 state：
  - `meditationSettings`
  - `meditationAudioLibrary`
  - `meditationCompositionSettings`
  - `meditationCalendar`
  - `meditationLibrary`
- 保存统一走 `onUpdate` + CloudBase 写
- 音频上传走 `uploadAudioFile` + 临时 URL
- 转码任务单独 queue（`queueMeditationAudioTranscodeJob`）

**新结构过渡说明**：med_paragraphs / med_section_raws / med_section_audios 为新主数据源，逐步替换老 audioLibrary / meditationLibrary 中的 tts_text 相关逻辑。

---

## 5. 与其他模块的关系

- **手机端 / 小程序冥想**：使用相同的 `meditation-session-plan.js` 核心，但 UI 和数据展示不同。
- **奖励系统**：冥想完成奖励在 `MeditationSettings.jsx` 中配置（rewardPoints、allowRepeatRewards、inviterRewardRate）。
- **通用 UI 规范**：完全遵循 `ui.spec.md` 的卡片、颜色、字体、交互反馈规则。
- **共享工具**：大量逻辑下沉到 `@liwu/shared-utils/meditation-*`。

---

## 6. 设计约束与注意事项

- 后台优先桌面体验，但需考虑响应式。
- 音频预览必须处理浏览器兼容（尤其是 Opus）。
- 所有敏感操作（删除、保存）需明确 loading / success / error 状态。
- 预设与日历的联动必须实时反映在预览中。
- 避免在代理商/用户端暴露平台技术服务费相关概念（与冥想无关但为全局约束）。

---

## 7. 后续演进方向（待补充）

- 更细粒度的权限控制（不同 partner 可视范围）
- 批量导入/导出音频与预设
- 可视化冥想日历编辑器
- 实时统计（完成次数、时长）

---

**维护责任**：
- 实现 & 更新：Kong（操作员）
- 前端细节验证（5175 访问）：Neng（质检员）
- 合规审查：Jing（规范员）
- 最终审批：Zang（管理员）

更新日期：2026-07-02
参考代码：`apps/web/src/admin/components/Dashboard/MeditationPage.jsx`、`MeditationSettings.jsx`、`useDatabase.js`