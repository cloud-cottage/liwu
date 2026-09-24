# 管理员后台冥想页面设计规范（Meditation Admin）

> 本规范描述 `/partner` 管理后台中「冥想」页面的整体设计、子页面结构、UI 布局、交互与数据模型。
> **本规范正本**：`docs/meditation.admin.partner.spec.md`（即本文档）。历史引用中出现的 `meditation.admin.spec.md` **在仓库内不存在**，一切以本文件为准。
> 参考：
> - **通用 UI 规范**（卡片、颜色、字体、交互反馈规则）——⚠ **当前仓库内无对应文件**（原引用的 `ui.spec.md` 不存在，此处仅作泛指；若后续新增通用 UI 规范文件，应回填实际文件名）
> - `docs/profile.miniprogram.ui.spec.md`（专项 UI 示例）
> - `packages/shared-utils/meditation-*.js`（核心逻辑）
> - `docs/meditation.admin.partner.verification-plan.md`（质检计划）
> - `docs/partner.meditation.spec.md`（本文档的别名/入口）

---

## 0. 权威口径声明（规则 B 为唯一模型）

> **本节为 2026-09-23 新增。** 长期并存的「老规则 A」与「新规则 B」已由用户（liwu 技术负责人 Kevin）拍定收敛，本节固化该裁决。

### 0.1 生效裁决

1. **唯一数据模型**：新规则 B（`Paragraph → Section-Raw → Section → Chapter → Track`）是冥想音频的**唯一数据模型**，替换老规则 A（`audioLibrary` 双轨时间轴 + 预设 presets + 日历 calendar）。
2. **冻结范围**：老四 tab（音频库 `library` / 冥想库 `presets` / 冥想设置 `composition` / 冥想日历 `calendar`）**先冻结只读**；新链路（段落文本库 `paragraph` / 原始音频库 `section-raw` / Track 配置）跑通后再下线。冻结意味着：不再新增老模型字段与交互，仅保证可读、可预览、不被新代码破坏。
3. **冲突裁决**：代码（`MeditationPage.jsx` / `meditation-*.js` / `database.js`）、老 UI 文案、其他文档与本文档冲突时，**以本文档为准**。
4. **追溯原则**：老规则 A 的过时条款一律以「已废弃 / 已被 X 取代」显式标注，不做静默删除。

### 0.2 规则 A / 规则 B 对照表

| 维度 | 老规则 A（已冻结，待下线） | 新规则 B（唯一模型） |
|------|--------------------------|---------------------|
| 数据实体 | `audioLibrary` items（六类型音频条目）+ `compositionSettings.segments` + `meditationLibrary.meditations` + `meditationCalendar.days` | `med_paragraphs` / `med_section_raws` / `med_section_audios` / `med_tracks` |
| 组织结构 | 音频组（group）→ 条目（item），按 type 六类 | Paragraph → Section-Raw → Section → Chapter → Track |
| 时长口径 | 每段 `startSeconds` + `durationSeconds`，超长尾部截断 | Chapter/Section 时长仅为**上限**；实际时长按录制结果推导，超上限**告警（不阻断）** |
| 文本来源 | `tts_text` + TTS 合成 + `is_ssml` / `<break>` 归一化 | AI 生成文字 → 真人朗读录制，**全程无 TTS** |
| 随机性 | 预设 `groupSelections` 在 group 层抽选 | 下沉到 **Section 层**：同 `section_type` 候选池抽一条；Track 本身固定可复现 |
| 时段键 | web/app `morning`；小程序 `dawn`（不统一） | 统一为 `morning`（小程序侧待 Kong 实现时修正，D4 已裁定） |
| 后台入口 | 音频库 / 冥想库 / 冥想设置 / 冥想日历 | 段落文本库 / 原始音频库 / Track 配置 |
| 存储集合 | `app_settings` 文档（key: `meditation_*`） | 独立 CloudBase 集合 `med_*` |

### 0.3 修订记录

| 日期 | 版本 | 变更摘要 | 责任 |
|------|------|----------|------|
| 2026-07-02 | v1 | 初版：描述两套规则并存的现状（Track/Chapter/Section/Section-Raw/Paragraph + 三个 `med_*` 集合） | Zang / Kong |
| 2026-09-23 | v2 | 固化规则 B 为唯一模型；规则 A 标注冻结；时长由「固定」降级为「上限」并取消尾部截断；新增无 TTS 裁决、录制链路、章间留白层级、六章固定模板、`med_tracks` 集合定义、stale 级联、时段键统一、附录 A/B | Jing |
| 2026-09-23 | v3 | 回填 Zang 裁定 D1~D10、G1~G5：录制粒度（逐 Paragraph + 拼接）、章间留白默认值（141s×5 ≈ 15.0 分钟）、双格式兜底（Opus 主体 + mp3 兜底）、Track 配置 UI 落点（新建「冥想轨道」子 Tab）、时段键统一、端侧读取通道（只读云函数）、抽中候选固化、音频记录口径收敛、端侧计划计算、老模型下线；清除全部「待确认 / TBD」标注；新增附录 B 裁定清单与余留 TBD | Jing |
| 2026-09-24 | v4 | **依据：冥想新模型第一批验收裁定（R1~R15）**。回填：纯音频段 label 前缀＝章节名（R1）、纯音频段区块按 `section_type` 分组（R2）、raw 重录类徽标全口径（R3）、`stale_paragraph_ids` 双语义（R4）、`revision` / `version` 递增口径（R5）、「加入音频库」下拉行格式（R6）、写入结果校验硬口径（R7）、保存失败可见性补充条约（R8）、Track 预览归第二批（R9）、章序/章内序列只读 + `normalizeMedTrack` 折回模板（R10）、章间留白单一常量与末章/禁用章口径（R11）、`med_tracks` 需人工创建（R12）、`med_*` 权限现状与第二批目标 + `app_settings` 须管理员会话（R13）、验收方法论（R14，写入质检计划）、挂账清单（R15）；新增附录 A.2（R 系列废弃/降级索引）、附录 C（第一批挂账清单） | Jing |
| 2026-09-24 | v4.1 | **依据：Zang 对附录 B.6 六条待裁口径的裁定（R16~R20）**。回填：`med_*` 权限（规范口径不变 + 第一批期间接受匿名可写 + 生产实际规则待人工确认，R16）、R7 覆盖范围 vs R8 可见性挂账的边界（老四 tab 不豁免 R7，四个 writer 的写入结果校验已实现（Kong）、待质检确认，R17）、`stale_paragraph_ids` 空集合中间态第一批接受 + 纯音频段分组标题定稿（R18）、stale 判定只看文本快照/文本比对且级联仅在文本实际变化时触发（R19）、下拉行顺序以规范为准（K8）+ D10 前置收紧（R20-②）；同步：§B.6 六条逐条标「已裁定」并指向正文落点、B.5 增补 R16~R20 索引、附录 A.2 增 A26/A27、附录 C 增改 C2/C3/C5/C7/C8 | Jing |
| 2026-09-24 | v4.2 | **依据：Zang 对上一轮 4 条尾巴的裁定（R21~R24）**。回填：**Section 名 / 章节名权威对照表**（源＝代码常量 `MEDITATION_SECTION_TYPE_LABELS` 11 项 / `MEDITATION_CHAPTER_LABELS` 6 项，R21）、**状态词统一**为「已实现（Kong）、待质检确认」（K8 / K9 ＋ 四个老口径 writer，含 R17 原「已在第一批实现完成」写法，R22）、质检计划 §8.1 增「**阶段**」列且**不拆表**（R23）、修正**失效工作目录与失效路径 / 文件名**（R24）；同步：B.5 索引扩为 R1~R24、附录 C / C2、C8 状态词对齐、音频格式节路径状态改为「已定稿」 | Jing |
| 2026-09-24 | v4.3 | **依据：Zang 对上一轮 3 条残留的裁定（R25~R27）**。回填：字数阈值常量命名**以代码为准**（`MEDITATION_WORD_COUNT_DEVIATION_THRESHOLDS = { slight: 0.1, severe: 0.25 }`，旧名 `MED_WORD_COUNT_THRESHOLDS` 登记废弃，附录 A.2 / A28）、`word_count_status` 取值与代码对齐（纯音频段不写入，非 `ok`）、**「集合与代码映射」表逐行按当前代码校正**（`med_section_audios` / `med_tracks` 均**已有实现代码**；`med_tracks` 集合未创建＝落库验收阻塞〔**已由 R37-② 关闭（2026-09-24 已建）**〕）、`SUB_TABS` key 校正为 `med-tracks`；同步：B.5 索引扩为 R1~R27、附录 C 说明、质检计划 §0 基线改写与 §3.3.1 阈值对齐 | Jing |
| 2026-09-24 | v4.4 | **依据：权限环境调查结论与 Zang 的后续裁定（R28~R32）**。回填：**新增「环境与权限（实测结论）」节**（R28：`med_*` 仅创建者可读写、非创建者读写**静默**、`app_settings` 可读但非创建者写被显式拒、`dev_login` 换 profile 即换身份）、**R16 收紧升级为「成套动作 + 前置依赖」**（R29：不得只改权限，须先解决后台身份模型；三方案登记为附录 B.7 待人工拍板项，方案 1 推荐）、**D6 升为第二批硬前置 + 第二批顺序修正**（R30：转码执行器 → D6 只读云函数 → 端侧双轨播放（先 App、后小程序）→ D10）、**作废旧假设**（「每轮开工 0/0/0＝外部清库 / 并发写者」→ 权限隔离解释，附录 A.2 / A29）、**三条质检纪律**（R31，落入质检计划 §0.1）、**别名入口文件子模块清单更新**（R32）；新登记挂账 **C9**（`med_section_raws` 无删除路径）；附录 B 新增 B.7（待人工拍板项）与 B.8（上一轮报告 4 条残留处置） | Jing |
| 2026-09-24 | v4.5 | **依据：Kong 用本机 ffmpeg 8.1.1 ＋ 真跑 MediaRecorder 采集的 webm 样本所做的转码实测（R33，Zang 已裁定）**。回填：**转码参数定稿**——Opus 主体 `.ogg` ＋ `libopus -b:a 32k -vbr off -ac 1 -ar 48000`（**硬 CBR**）、mp3 兜底 `libmp3lame -b:a 48k -ac 1 -ar 44100`（**删除 46k 档位，附录 A.2 / A32**）、**单次 ffmpeg 调用双路输出**、**remux 零损失备选路径**（记录、不用于交付）、**SCF 选型依据**（3.29–3.5 ms/音频秒 ⇒ 256MB / 单次超时 60s）、**实现硬约束**（原 webm `duration=N/A` ⇒ 时长只取客户端实测或转码产物；**源为双声道，不得假设单声道**）、**静态 ffmpeg 不入仓**（入 `.gitignore`）；**32k CBR 对真人语音的可听化程度列为「待确认」（附录 B.3 / T4，未经听测不得写成已定）**；同步：B.3 / T3 关闭、附录 C / C6 更新、B.5 索引扩为 R1~R33（**⚠ 本版的 32k 单声道口径已由 v4.6 / R34 覆盖**，见附录 A.2 / A33） | Jing |
| 2026-09-24 | v4.6 | **依据：Kevin（用户）直接裁定的转码参数改定 ＋ 本批代码查实的执行器 / 质检入口现状（R34~R36）**。回填：**R34＝转码参数改定为 48k 立体声硬 CBR**（Opus `.ogg` ＋ `-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000`；mp3 兜底 `-c:a libmp3lame -b:a 48k -ac 2 -ar 44100`；**`-ac 1`（下混单声道）作废，登记附录 A.2 / A33**；新增**实测数据表**（60s / 300s 的体积·码率·声道·采样率与耗时，**实测值必须照抄**）与**与旧 32k 单声道的代价对照**；**X15 改口径**＝改判「**48k 立体声的听感验收，用户所有、未听测前不得写成已验证**」）；**R35＝转码执行器实现与队列分区**（**队列分区硬口径（D-B2-9，已由 Kong 本轮落地并自测 15/15 PASS）**：新执行器只领 `transcode_profile === 'section_audio'`（常量 `SECTION_AUDIO_TRANSCODE_PROFILE`；**过滤进查询 ＋ 乐观锁带 profile ＋ 非 section job 跳过且不写字段**）、老 worker 跳过 `section_audio`、**上线前先停 `npm run audio:transcode-worker:loop` 并以 `pgrep -fl audio-transcode-worker` 确认为空**、同一时刻只允许一侧消费、回滚顺序相反；**section_audio 链路取消 `item_id` 回退**（缺 `section_audio_id` ⇒ `MISSING_SECTION_AUDIO_ID` 永久终结、不写 `med_section_audios`）；**字段权威**：job 文档 `attempts` / `transcode_error` 权威，`attempt_count` / `error_message` 为过渡期镜像；**实现现状**：`scripts/audio-transcode-worker.mjs:28` 已更新为 48k 立体声硬 CBR，L295 `output.opus` 与排队方 `.opus` 扩展名本批未改；新增挂账 **C10~C13**）；**R36＝后台质检入口现状**（**代码内无 `?dev_login=1` 类 dev 登录入口（全仓检索零命中，旧表述作废）**；后台门禁＝`liwu_auth_session` 会话 ＋【管理员/超级管理员】标签；`requestPhoneOtp` / `verifyPhoneOtp` 存在但**全仓无 UI 调用**（后台当前无登录入口）；OTP 为 mock 固定 `'1234'`；系统超管手机号常量 `16601061656`；**可复现配方待 R37 回填，未定前 UI 类验收一律标「环境不可达」**〔**v4.7 补注：R37-③ 已实测证明该路径可走通（完整配方仍待回填）；未按已验证路径执行的 UI 用例仍标「环境不可达」**〕〔**v4.7 复核补注（2026-09-24，Jing）：配方已实测复现并回填正文＝R36-⑥ / ⑦；「未定前一律标环境不可达」的口径已放宽为「未按配方执行所得 ⇒ 标环境伪失败（采样过早）并重跑」**〕）；同步：§「录制与转码链路」、§「环境与权限」（新增 R36 小节）、附录 A.2 / A33、附录 B.3 / T3·T4、B.5 / R34~R36、附录 C / C6 ＋ C10~C13、文末更新日期；质检计划 §0.1 / §3.4 / §6.1 / §8.1 | Jing |
| 2026-09-24 | v4.7 | **依据：v4.6 后的准确性回填（R37~R38）**——不改任何已裁参数，只修口径与登记事实。**R37-①＝样本实际时长口径更正**（两个实测样本为**真实 `MediaRecorder` 采集**，**实际 ≈61.2s（不是名义 60s）**，`ffprobe` 实测 **61.2035s / 61.200s**；300s 样本为**精确 300.0s**；**复核体积 / 码率前必须先测输入实际时长**，用名义 60s 反推得 **≈49.6kbps 的假偏差、不得据此判失败**，附录 A.2 / **A35**）；**R37-②＝`med_tracks` 口径矛盾清除**（**已建**：`res.code` 无 `code` / `message` ＋ `med_section_raws` 正对照同形 ＋ `add` 成功排除假否定 ＋ **两轮端到端写入 / 读回 / 删除成功**，R7 g/h 数据层与 UI 层均通过，测试文档已删 ⇒ **附录 C / C7 标「已关闭」**，全文「未创建 ⇒ 落库类验收一律标阻塞」旧口径**作废**（附录 A.2 / **A34**），**当前无阻塞项**）；**R37-③＝第一批 UI 点击路径验收结果 ＋ 术语澄清**（Track 配置：空态「初始化默认 Track」→ 编辑态六章模板 **300 / 30 / 130 / 150 / 270 / 30**、留白 **141×5**、末章无留白输入、章序不可操作、估算自洽 → 按钮实测「**保存 Track**」→ 保存后 `version` **1→2**、`chapters = 6`、**刷新保持**、**二次保存同 `_id` 且 `version` 2→3**；`total_target_seconds = 900` 是**软基准**，UI「**内容 15:10**」＝**章时长上限之和 910s**——**两者不是同一把尺子**）；**R38-①＝新缺陷：删除路径静默假成功**（`doc(id).remove()` 返回 **`{"deleted":0}`（非 `{code,message}`）**时旧 `assertCloudBaseWriteResult` 放过 ⇒ `deleteMedTrack` 报成功而**实际未删**，非 owner 身份实测：删除后文档仍在；处置＝**删除影响条数断言（`deleted = 0` 必须报错）** ＋ **全库扫全部 `.remove()` 调用点（实测 `database.js` 共 15 处）**，状态＝**已实现（Kong）、待质检确认**；**反向纪律**＝**update 路径不得用 `updated >= 1` 作成功条件**，附录 A.2 / **A36**）；**R38-②＝dev 环境真实事实**（`apps/web/vite.config.js` 的 `/api/cloudbase-proxy` → `scripts/dev-cloudbase-proxy.mjs`（:3020）→ **真实 CloudBase `liwu-d8gek6jjdab1d087c`**；**`CLOUDBASE_ADMIN_API_KEY` 实测未配置** ⇒ 写入以**调用者匿名 `_openid`** 落真实云端；**换浏览器 profile 就既看不见也删不掉前几轮 dev 数据**；待办＝只读盘点（服务端凭据）＋ **删除须人工确认清单后执行**）；**R38-③＝新增挂账 C14 / C15**（默认种子 Track UI 预估 **26:55** vs 基准 **15:00**（＋79%）待拍板；dev 身份 / 环境治理三选一待拍板；队列首轮权威键缺省仍在 **C13** 保持）；同步：§「音频格式与转码规范」R34-③、`med_tracks` 环境前置与权限建议、集合与代码映射、§1.2、§3.7、§4、§7、§「环境与权限（实测结论）」新增 **R37 / R38** 小节、附录 A.2 / **A34~A36**、附录 B.5 / **R37~R38**、附录 C / **C7 关闭 ＋ C14~C15**、文末更新日期；质检计划 §0 / §0.1 / §1.1 / §3.4 / §8.1 与文首 Status | Jing |
| 2026-09-24 | v4.7 复核补注 | **依据：本批以最新代码 / 实测复核 v4.7 的四处口径（不改任何已裁参数、不新增功能口径）**。**① R38-① 改为行号级口径**：`assertCloudBaseDeleteResult` **`database.js:425`**、`removeDocBestEffort` **`:452`**、反向纪律注释 **`:387-392`**；**15 处 `.remove()` 调用点逐条落行**（11 处直接严格断言 ＋ 4 处 `removeDocBestEffort`；级联 5 处带 `allowZero`；主目标 6 处不得 `allowZero`）；复核证据＝桩测 **27 PASS / 0 FAIL**（含 `updateMedTrack` / `updateMedParagraph` 在 `{updated:0}` 下**不抛**的反向反证）＋ `npm run lint` **127 problems（117 errors / 10 warnings）、未上升**。**② 新增裁定 D-B2-16（R38-④）**＝**后台自动修复（reconcile）路径的删除保持「不抛出」**（L1820 / L1839 / L4390 / L4474）：断言照接（不再静默放过 `deleted: 0`）、失败降级为显式 `console.error`（旧 `.catch(() => {})` 作废）；**用户点击触发的删除一律严格断言**；未达「自动修复也硬失败」的需求时**须另立裁定**。**③ R36 扩为 ①~⑦**：**⑥＝配方状态「已实测复现」（Neng 在 3 个全新 profile 复现）、⑦＝入台配方全文 6 步**（反节流三参 headless Chrome → navigate `/partner` **不加参数** → **轮询 `/uid=102/` 为真（≈t+15s）** → 「切换身份」→「管理员」卡 → nav「冥想」→「冥想轨道」）；**「环境不可达」纪律放宽**＝未按配方所得一律标「**环境伪失败（采样过早）**」并重跑、不得标 PASS/FAIL。**④ 修正两处**：`deleteMedTrack`＝**保留的服务 API、当前无 UI 入口**（质检 / 清理脚本调用，**不得当死代码删除**）；删除失败 UI 落点**唯一为 `apps/web/src/admin/components/Dashboard/MeditationPage.jsx:3545`**（旧写 `admin/pages/…` 为笔误）。同步：§「环境与权限（实测结论）」R36 ⑥⑦ / R37 关系段 / R38-① / **新增 R38-④**、§4、§3.7、集合与代码映射（`med_tracks` 行）、附录 A.2 / **A37**、附录 B.5 / R36·R38 两行、附录 C 说明、文末更新日期；质检计划 §0.1（第 12 条） / §1 / §8.1 与文首 Status | Jing |
| 2026-09-24 | v4.8 | **依据：D6 只读云函数已实现（Kong）＋ 本批质检结论（Neng-16）＋ 两条现状登记**——**不改动任何已裁参数**，只做「口径升格 ＋ 结论登记 ＋ 挂账」。**① 新增 R39（D6 读契约）**＝把实现方 **12 条假设升格为口径**（函数 `cloudfunctions/meditation-read/`，`cloudbaserc.json` 已登记 **30s / 128MB / Nodejs18.15 / 无触发器**；action 集 3 个＝`getTrack`（**缺省**，定位顺序 `track_id`→`track_key`→`is_default`→`track-default`）/ `getSectionAudios`（必填 `section_types` 或 `section_type`）/ `listTracks`（只列 `enabled !== false`，**不签发链接、不读音频集合**）；未知 / 非字符串 action ⇒ `INVALID_ACTION`；成功 `{ok:true,data,meta}`、失败 `{ok:false,error,message,details?}`（至少含 `READ_FAILED` / `INVALID_ACTION` / `TRACK_NOT_FOUND` / `TRACK_DISABLED`）；**CloudBase resolve 返回 `{code,message}`（含权限静默空集）一律当错抛、收敛 `READ_FAILED`**，不把「没报错」当「读到了」、不返回部分数据当成功；**可交付＝`transcoded_formats` 同时含 opus 与 mp3 且 file_id 齐备**、`queued`/`processing`/`failed` 一律不下发、**`idle`/空状态但齐备的历史文档仍下发**、不可下发项按 `stats.excluded` 五类**逐条计数不静默丢弃**；唯一对外调用 `getTempFileURL`、去重后**一次批量签发** `maxAge = 7200`（对齐 C11）、**绝不透传落库 `audio_url`**、`url_policy = {max_age_seconds, issued_at, expires_at, reissue:'call_again'}`、**长期标识只有 `file_id` 但响应不下发 `file_id`**、部分签发失败该条剔除并计数（半条音频不得下发）、**全部失败整单 `READ_FAILED`**；**15 项字段不得下发**（`file_id` / `fallback_file_id` / `mp3_file_id` / `audio_url` / `fallback_audio_url` / `mp3_url` / `recorded_by` / `text_snapshot` / `paragraph_ids_snapshot` / `original_file_id` / `transcode_error` / `created_by` / `updated_by` / `char_count` / `stale`）；Track 折回**六章固定模板**（`chapters` 恒 6、末章 gap 恒 0，对齐 R10），`getTrack` **只下发启用章覆盖的 `section_type`**、`getSectionAudios` **不查 Track 启用态**（定向取 / 重签接口）；**不抽签、不写会话**（抽签在端侧、固化写端侧会话记录，对齐 D7 / D9）、唯一口径源 `med_section_audios`（不读 `med_section_raws` 的 `file_id`/`audio_url`，对齐 D8）；**上限**＝单 `section_type` 查询 50 / 下发 10、`listTracks` 20（截断在 `stats.truncated_section_types` 如实回报）；**不做端侧身份校验＝现为口径、非疏漏**（收紧到「仅登录用户」须另裁，**并入 C15 / X9**）；**端侧缓存 ≤ 半有效期（≈1 小时）或按 `expires_at` 判陈旧**、过期 / `onerror` **同参重调**；部署前提＝SCF 内置凭证（不硬编码密钥）＋ `lib/*.js` 为权威源**精简等价副本**（对齐 D-B2-8）、本地无 Track 文档时 `TRACK_NOT_FOUND` **属预期**（`med_tracks` 已建、C7 已关闭，**不得再写「未创建 / 标阻塞」**）；**状态词（R22）＝「已实现（Kong）、待质检确认」**——Zang 独立复核＝自测 **124/124 PASS**、零写路径静态 grep **零命中**、`npx eslint cloudfunctions/meditation-read` **0 problem**、共 **1219 行**、只依赖 `@cloudbase/node-sdk` ＋ `./lib/*`。**② R38-① 质检结论＝PASS（Neng-16，2026-09-24）**：真实 CloudBase 往返（带 requestId）三条——删不存在 id ⇒ `{deleted:0, requestId:71e425366701d8}` → **抛出**「冥想轨道删除失败：影响条数为 0（文档不存在或无权删除）」；自建文档 ⇒ `{deleted:1, requestId:a884e06fd4c59}` 成功返回 id、复读 `data:[]` 确已删、再删同一 id 复抛同文案（**计数语义真实**）；反向反证＝`updateMedTrack` 在 `{updated:0, upsertedId:null, requestId:81420156b9f2b8}` 下**不抛**（符合「update 不断计数」）；静态 **15/15 处置分类全对**（11 直接严格断言 ＋ 4 处 `removeDocBestEffort`；级联 5 处 `allowZero`；主目标 6 处不得 `allowZero`）；清理完毕（`med_tracks` 回到 **0** 条）⇒ 状态词由「已实现（Kong）、待质检确认」改为「**已实现（Kong）、质检 PASS（Neng-16，2026-09-24）**」。**③ 四个老口径 writer 现状登记（不改口径）**＝**静态 8/8 断言存在且行号已核**（L5183/L5190、L5249/L5256、L5315/L5322、L5381/L5388；集合缺失另抛 L5172/L5238/L5304/L5370）、**动态只完成 1 条（冥想库）且受阻于权限模型**（非属主身份保存得 `{updated:0, upsertedId:null, requestId:3b734af94bab9}`、断言不抛、页面零提示、4 个文档 body sha256 与 `updated_at` 一字未变）⇒ 状态词＝「**静态 PASS、动态复验待按 R40 执行（判据已定）**」；**不得**写成通过、也**不得**写成实现缺陷（**归因未定**）。**④ 新增挂账 C16**＝`cloudfunctions/getHomePageData` **有目录但未登记进 `cloudbaserc.json`**（既有差异，本批未处理，待裁定）。同步：§「环境与权限（实测结论）」**新增 R39 小节**、§4 写入结果校验硬口径（R17 / R38-① 状态词）、§5 / §7 与「`med_tracks` 权限建议」的 D6 引用、附录 A.2 / **A38**、附录 B.1 / D6、附录 B.5 / **R39**、附录 C / **C2 补注 ＋ C16**、文末更新日期与参考代码；质检计划 §0.1（**第 13~14 条**） / §8.1（**X2 / W1 / W2 状态词，X14 判据，新增 X16 / X17**）与文首 Status | Jing |
| 2026-09-24 | v4.9 | **依据：Neng-17 仲裁（真实 CloudBase 往返，带 `requestId`）＋ Zang 裁定**——**新增 R40（`updated` 语义与写入成功判据，含 D-B2-14 改写）**：① `updated` 计「**内容真正发生变化的文档数**」（真改值 → `1`；纯同值写回 → `0`；`where` 命中 2 条同值 → `0`、真改 → `2`）；② `updated:0` **三义同形**（**值本来相同** ／ **无权写（静默拒绝）** ／ **文档不存在**；普通对象、无 `code` / `message`）⇒ **既不是成功证据、也不是失败证据**；③ 含**对象数组**字段的载荷上 `updated` **非确定**（同一 payload 连写三次实测 `0,0,1` 与 `1,0,0`；反向 no-op 亦报 `1`；对象数组子文档读回键序被改写为**字典序**）；④ **反向纪律保留、依据改写**（**D-B2-14 结论对、依据错**）——`update` 不得用 `updated >= 1` 判成功，理由改为「三义同形 ＋ 对象数组非确定」，**原 R28 依据系误读**；⑤ **新增有条件例外（仅载荷必然含易变字段的 8 处**：四个老口径 writer ＋ `updateMedParagraph` / `updateMedSectionRaw` / `updateMedSectionAudio` / `updateMedTrack`）——`updated < 1` 且无 `code` ⇒ **一次性读回比对**（`Date` 归一 ISO、对象 / 数组键序无关深比较）：一致＝**幂等 no-op 成功**、不一致＝抛「**未能确认写入生效（未检测到任何变化）**」、**文案不得声称「无权限」**、**读回失败抛独立文案、绝不得当成功**（断言建议名 `assertCloudBaseUpdateTookEffect`，状态＝**已实现（Kong）、待质检确认**）；⑥ 强信号依据＝上述路径 **8/8 样本恒为 `1`**；**纠正 §F 两条（旧表述作废）**：非属主 update `app_settings` 既有文档＝**静默 `{updated:0}`**（全程无 `code`，文档体 sha256 与 `updated_at` 前后一致）——**不是** `DATABASE_PERMISSION_DENIED`；非属主 `add` 到 `app_settings` **成功**（即时删除复核 `deleted:1`、总数 15→16→15）——**不是**「连新建都拒」；**新增 A39**（「同值 `updated:0`」作普适命题作废）、**A36 依据同步改写**；同步：§「环境与权限（实测结论）」**R40** 小节（R40-①~⑧）、**R28-②**（表与结语重写）、`med_tracks` 权限建议（`app_settings` 行 / R16-⑤ / 权限类用例判据）、§4 写入结果校验硬口径（**R17 补注状态 ＋ 反向纪律 ＋ 有条件例外**）、R38-① 反向纪律段、附录 A.2 / **A39**（＋ **A36**）、附录 B.5 / **R40**（＋ R28·R29·R31·R38 行补注）、附录 C / **C2 · C7** 状态注记、文末更新日期；质检计划 §0.1（**第 6 条改写 ＋ 新增第 15 条**） / §8.1（**X17 改「已裁：按 R40 执行动态复验」** / X2 / W2 / Exit Criteria **R40 专条**）与文首 Status | Jing |
| 2026-09-24 | v4.10 | **依据：Kong 对 App 与小程序现状的侦察 ＋ Zang 对端侧双轨播放接入 12 条的裁定（R41）**。回填：**新增 R41（端侧双轨播放接入口径，12 条已定裁决）**——① 数据源＝端侧**不再读老的 5 项 `app_settings` 配置**、**不再算老 plan**（D9），一律经 **D6（R39 契约）** 取 Track ＋ 候选池，**端侧永不直连 DB 读 `med_*`**；② 播放模型＝背景 `loop` / 人声 `sequence`，音量**取响应里的 `background_track.volume` / `voice_track.volume`**（现 0.33 / 1），**缺省才回退常量、且常量非权威源、绝不覆盖响应值**，章序段序只读；③ 留白只在**章间**、**末『有可用段的』章恒 0**、禁用章不计入（R11）；④ 段时长取**响应实测值**（非标称），总计＝Σ 人声段 ＋ Σ 留白（**背景 loop 不计入**），**端侧计时按 Track 组装结果、不沿用固定 15 分钟**，`MIN_VALID_MEDITATION_SECONDS = 180` 两端不变；⑤ 抽签在**端侧**（抽签器可注入）＋ 固化载荷`{track_id, track_version, date_key, session_key, selections[{section_type, audio_id, duration_seconds}]}`，**先落本地 storage（键 `liwu_meditation_session_v1`）**、**云侧写入另裁（挂账 C18）**；⑥ App 按 `formats[]` 顺序 **opus → mp3** ＋ **保留 `onerror` 降级**，**小程序直取 mp3、不用 `canPlayType`**（D3）；⑦ **失败可见且不静默回退（D9 硬）**＝`TRACK_NOT_FOUND` / `TRACK_DISABLED` / `READ_FAILED` / `CALL_FAILED` / `INVALID_PAYLOAD` ⇒ **明确错误态（附 `requestId`）**，**绝不**回退老音频库 / 本地兜底 plan，空池 / 缺段 ⇒ **跳段 ＋ warning**、**不得整场失败**；⑧ **端侧零 fixture 分支**、桩一律在**测试侧**拦截、**桩结论不得当 X12 / X18 验收 PASS**；⑨ 小程序**本批只支持前台播放**（后台微信暂停所有音频、`BackgroundAudioManager` 单例且无 `loop` ⇒ 双轨后台原理不可得）；⑩ **不做渐变**（只做预加载 ＋ 顺序播放）；⑪ **iOS App 音量未验**（WKWebView `HTMLMediaElement.volume` 实测空操作）⇒ 0.33 是否真生效**须真机实测**；FAIL ⇒ **记挂账、另立项**，**不得据此判 X12 整体 FAIL**；⑫ **冻结边界**＝老四 tab 与 `packages/shared-utils/meditation-session-plan.js` **本批不得删改**（D10 前）；时段键 `dawn` → `morning` 统一（D4），并说明 `point_ledger.activity_slot` 的**历史取值口径**（历史值含 `dawn`、读侧须兼容、**不做批量改写**）；**新增挂账 C17 / C18**（C17＝`database.js` 另有 **38 处**含易变字段的 update 路径**未接** R40-⑤ 读回断言〔本批只覆盖冥想链路 8 处〕；C18＝端侧会话记录**云侧写入未定**，新建云集合会与「`med_*` 仅管理员可写」目标〔B.7 方案 1〕冲突）；新增 **A40**；同步：§「环境与权限（实测结论）」**R41** 小节、§5（端侧计划计算 / 端侧读取通道 / 播放模型）、§7 第二批 ③、附录 A.2 / **A40**、附录 B.5 / **R41**（索引扩为 **R1~R41**）、附录 C / **C4 补注 ＋ C17 · C18**、文末更新日期；质检计划 §0.1（**新增第 16 条**） / §8.1（**X12 按 R41 改判据 ＋ 新增 X18**、阶段列、Exit Criteria）与文首 Status | Jing |
| 2026-09-24 | v4.11 | **依据：Neng-20 真实验（X17 结案 PASS）＋ 本批两条 low 缺陷修复与范围边界 ＋ Neng-21 对端侧恢复路径的复验（R42）＋ 三条挂账 C19~C21**——**不改动任何已裁参数**。回填：**① R40-⑤ 有条件例外的状态词升为「已实现（Kong）、质检 PASS（Neng-20，2026-09-24）」**，并把「**例外条件经实测成立**（属主不误报、非属主可见失败）」写成正式结论：非属主保存 ⇒ 页面**可见提示**「**冥想文库保存失败：未能确认写入生效（未检测到任何变化）（requestId: 2c26a5bfd807a8）**」（顶部横幅、`[role=dialog]=0`、**文案不含「无权限」**、调用栈 `assertCloudBaseUpdateTookEffect` → `saveMeditationLibrary` → `useDatabase` → UI）；**4 个 `app_settings` 文档 `_id` / body sha256 / `updated_at` 前后逐项未变**（未污染）；属主路径**不误报**（静态 **8/8** 调用点载荷必含易变字段；动态两例 `updated:1` ⇒ **读回比对之前即返回**、窗口内仅 1 条 POST、**零读回 GET**；刷新确认 `version` 4→5）；自建文档 `deleted:1`、`med_tracks` 回 **0** 条。**② 两条 low 缺陷修复 ＋ 范围边界**：`apps/web/src/admin/hooks/useDatabase.js` 的 `getSetupErrorMessage` 新增 **`/requestid/i` 守卫**（L30-34），失败提示**不再重复追加 requestId**（已给红对照）；`MeditationPage.jsx` 的 `MeditationPresetsTab` 由**裸 `await onUpdate`** 改为 **tab 级 `try/catch` ＋ `writeError` state ＋ `[role=alert]` 内联提示**，消除**未捕获 Promise 拒绝**（jsdom 真实渲染 ＋ 进程级 `unhandledRejection` 计数验证；红对照＝修复前 `unhandled=1` 且无提示）；**范围边界（硬）＝同文件另有 8 处裸 `await onUpdate`（音频库 / 冥想设置 / 冥想日历），本批未动**。**③ 新增 R42（端侧恢复路径与格式降级口径，①~⑥）**＝同参重调 D6（**不依赖 `file_id`**）、**三层重入防护**（段级 Set / 闸门级 / 基准级）、**陈旧判定**（收到响应的本地时刻起算 ＋ 阈值 `max_age_seconds / 2`，**刻意不用绝对时钟与 `issued_at` / `expires_at` 直接比较**）、**`onerror` 与链接过期解耦**（fetch→Blob→objectURL ⇒ **只降级、不重调**）、**降级与跳段**（`formats[]` 顺序、段内全失败 ⇒ 跳段 ＋ warning ＋ 可见提示、**背景轨继续、不整场失败**）、**重签只刷新当前段 playlist、不替换整场时间轴（设计口径）**——**⑥ 的实测状态（Neng-21）：`segmentPlaylistOverrideRef` 覆盖表从未被写入（全文件仅 3 处：L228 声明 / L237 读取 / L721 clear、**无 `.set(...)`**）⇒ 该口径尚未真正生效 ＝ 中型缺陷，修复单已派**。**④ 端侧状态词按 R22 分面（不得聚合）**：两个共享模块＝**已实现（Kong）、质检 PASS（Neng-19，桩面：独立 50/50 ＋ 反向反证 10/10）**；**App 接入 B1（数据源切换、老代码下线、错误可见不回退）＝已实现（Kong）、质检 PASS（Neng-19，桩面与静态）**；**B2a（恢复路径与格式降级）＝已实现（Kong），复验发现 1 条中型缺陷（Neng-21：重签后段内回落旧签 URL 误跳段）＋ 1 条低（dist 产物落后），修复单已派、待复验**；**真实 D6 往返（云函数未部署）与真机项（iOS WKWebView 音量、小程序 iOS 直取 mp3）一律「未实测」**；**`resolveMeditationUrlPolicyStaleness` 为共享层定义、当前唯一消费方是 App 播放器**（小程序未消费）⇒ 不得据此认为已双端生效。**⑤ 新增挂账 C19 / C20 / C21**（背景轨是否按章切换〔待用户拍板〕/ 非 403 取源失败是否补「原样重试一次」〔待排期〕/ `getSetupErrorMessage` 集合缺失分支不拼接 `rawMessage`〔一行可修、已列入下一单〕）。同步：§「环境与权限（实测结论）」**R42** 小节、**R40-⑤ 实测结论**、**R41 承载模块与状态（分面）**、§4（两条 low 修复 ＋ 范围边界 ＋ C21 边界）、§5 播放模型、§7 第二批 ③、附录 B / **B.5 索引扩为 R1~R42**（R40 · R41 行状态同步）、附录 C / **C2 补注 ＋ C19~C21**、文末更新日期；质检计划 §0.1（**新增第 17 条**） / §8.1（**X17 改「已裁并已 PASS（Neng-20）」** / **X2 · W2 复验状态同步** / **X12 · X18 补恢复路径判据** / **新增 X19＝R42 逐条验收，复验未全过** / 阶段列 / Exit Criteria）与文首 Status | Jing |

| 2026-09-24 | v4.12 | **依据：Zang 对「后台 Track 预览」口径的 10 条裁定（R43 ①~⑩）＋ Kong 的后台「冥想轨道」tab 侦察结论 ＋ 正本 R9 / R41 / R42 / C4**——**不改动任何已裁参数（R33 / R34 / R40 / R41 / R42 原样）、不预写实现状态、不改代码、不新增 D-B2 编号**。回填：**① 新增 R43（后台 Track 预览口径，①~⑩；状态＝「已定口径、待实现」）**——数据源**一律经 D6**（**后台也不得直连 DB 组装播放**，延伸 R41-①）、**预览不落盘**（不写 `liwu_meditation_session_v1`、不写云，因 **C18 未裁**）、**预览基于已保存版本**且 UI 必须明示「**预览基于已保存版本 vN；未保存改动不生效**」、**抽签每次开预览抽一次 ＋ 「换一批」显式重抽**（`rng` 可注入、**无固定种子**）、**缺音频分两类并可计数**（**池空** / **池非空但无可用格式**）＋ 段级文案「**{章节名 · section 名} 暂无可播放音频，已跳过该段（继续播放）**」＋ 面板汇总、**绝不整场失败**、**失败态三态分开**（**函数未部署 / 调用失败** ≠ **`TRACK_NOT_FOUND`** ≠ **`TRACK_DISABLED`**，带 `requestId` ＋「重试」；**未部署不得显示为「无数据」或「Track 不存在」**、文案**不得**声称「无权限」）、**后台恢复策略简化**（403 ⇒ **同参整场重调 `getTrack` 至多 1 次（闸门级）**、**不做段级覆盖表**，并明写**不得依赖 R42-⑥**）、**时长两把尺子并存**（现有面板估算 ＋ 并列「**实测预览总时长＝Σ 人声段实测 ＋ Σ 章间留白（背景不计入）**」，并按 R37-③ 标注 15:00 软基准与 910s 章上限之和不是同一把尺子）、**UI 显示实际音量取值并标明「响应值 / 回退常量」**、**R41-⑧ 的零 fixture 纪律同样适用于后台预览**（桩只打测试侧、**产品代码不得留 DEV 开关 / 桩分支**、**桩读数不得当 X20 验收 PASS**）；**② 后台实现约束**（数据源＝`apps/web/src/admin/services/cloudbase.js` **新增 2 行**〔候选 A〕；两个共享模块**原样复用、后台不另写一份**；**新建独立组件、不塞进 4598 行单文件**；**不得改造老预览器**〔R41-⑫ 冻结〕；最小插入点＝`:2990` 保存按钮之后；**未部署时＝明确错误态**）；**③ 状态词＝「已定口径、待实现」**（**不得预写「已实现」**）；**④ `resolveMeditationUrlPolicyStaleness` 消费方注记更新**（当前消费方＝App 播放器；**后台预览（R43）实现后为其第二消费方**，**不得**写成已双端生效）；**⑤ R9 口径缺口已补**（B.5 / **R9** 行与 §3.7 **两处标「功能口径见 R43（v4.12）」**）；**⑥ 附录 C / C4 补注**「预览口径已定＝R43（v4.12）；实现待 R9 S1」；同步：§1.2 / §3.7 批次注记、附录 B.5（**索引扩为 R1~R43**）、文末更新日期；质检计划 §0.1（**新增第 18 条**） / §8.1（**新增 X20＝后台 Track 预览验收**、阶段列、**Exit Criteria 改 X1~X20**）与文首 Status | Jing |
| 2026-09-24 | v4.13 | **依据：Kong 的小程序端侧侦察（含微信官方文档逐条核实）＋ 正本 R41 / R42 / R43 ＋ Zang 的裁定**——**不改动任何已裁参数（R33 / R34 / R40 / R41 / R42 / R43 原样）、不改历史版本行、不预写实现状态、不改代码**。回填：**① 新增 R44（小程序端侧接入口径，①~⑬；状态＝「已定口径、待实现」）**——**数据源只经 D6**（注入 `({ name, data }) => wx.cloud.callFunction({ name, data })`；端侧**不直连 DB 读 `med_*`**、不读老 5 项 `app_settings`、不算老 plan）、**前台双轨不降级**（两个独立 `InnerAudioContext`：背景 `loop = true` ＋ 人声 `sequence`；**官方文档无「同时只允许一个」条款**、**官方问答对「无法叠加播放」给的解法即创建多对象**、小游戏文档仅「**Android 最多同时 10 个**」**远高于 2** ⇒ **不得**因「担心叠加」把双轨降为单轨）、**本批只前台**（切后台官方行为＝**5 秒后停 JS 线程**、需后台能力才持续；`BackgroundAudioManager` 为**全局单例**、属性表**无 `loop`** ⇒ 双轨后台原理不可得——切后台停播属**平台限制、不得判缺陷**，也**不得**把 `BackgroundAudioManager` 引入本批）、**格式只取 mp3**（**ogg 仅 Android、iOS 不支持** ⇒ **mp3 是唯一跨端公共格式**；小程序**无 `canPlayType`**〔属 HTML5〕⇒ **不得**用它作判据；取 `resolveMeditationPlayableFormats` 后过滤）、**恢复策略的小程序例外（Zang 裁定）**＝小程序无 `fetch` / `Blob` 阶段，链接过期与解码失败**都落 `onError`** ⇒ 允许**同参整场重调 `getTrack` 至多 1 次**（**闸门级**，与 R43-⑦ 同形）；重调后仍 `onError` ⇒ **跳段 ＋ warning ＋ 可见提示**；**不得无限重试**；**本条是 R42-④（`onerror` 只降级、不重调）的明文例外**（理由已写清）、**取源方式＝直设 `ctx.src`**（与仓库既有图片链一致、**零部署前置**；**不做** `wx.downloadFile` 预取〔需下载域名白名单，将来需要须单独立项并登记部署前置〕；**不得**用 `wx.cloud.downloadFile`——D6 **不下发 `file_id`**，R39-⑤）、**资源释放**（页面 / 组件卸载时 **`destroy()` 两个实例**——官方「注意事项」：`InnerAudioContext` **资源不自动释放**；否则计内存泄漏）、**iOS 静音模式出声**（需 **`wx.setInnerAudioOption`**；`obeyMuteSwitch` **自 2.3.0 起不再由属性控制**；**未实测 ⇒ 列真机项**）、**音量取响应**（同 R41-②）＋ **计时节流**＝按 Track 组装结果（**Σ 人声实测 ＋ Σ 章间留白**，**弃 900s 固定值**；`MIN_VALID_MEDITATION_SECONDS = 180` 两端不变）、**会话固化先落本地**（`wx.setStorageSync('liwu_meditation_session_v1', …)`；**不写云**——C18 未裁；**不得**自建云集合；并注明该条与 R41-⑤ 同属「**App 侧尚未落地**」的待补项）、**共享层单一源**（两个共享模块**只能经同步脚本**进入小程序＝`npm run miniprogram:sync`，**禁手抄 CJS 副本**；`packages/shared-utils/*` 是唯一权威源，漂移由 sync ＋ build 门禁兜住）、**时段键 `morning`**（小程序写入侧、App 读侧归一、App 写入侧已统一；**不动 `BADGE_SLOT_KEYS`**）、**失败可见**（五类错误码各自可见文案 ＋ `requestId`〔有则示〕；空池 / 缺段 ⇒ 跳段 ＋ warning、**不整场失败**；**不得**回退老音频库；**零 fixture 分支**、**桩读数不得当 X21 PASS**）；**② 登记 Step 1（共享层接入）＝已实现（Kong）、待质检确认**（同步脚本白名单 **8→10**、转换器补 **`export class`**、build 门禁 **15→17**；两产物 `^export ` **零命中**、`node --check` 通过、**运行时效验 12/12**（类可 `new`）、**单一源核对 10/10 逐字节相等**；小程序写入侧 `dawn`→`morning`；App **读侧** dawn / morning 归一〔探针 **19/19** ＋ **负对照 4 FAIL** 证明探针能咬住缺陷〕；`BADGE_SLOT_KEYS` **sha256 前后一致**）；**③ 另登记一个既有脚本缺陷**＝`scripts/sync-miniprogram-packages.mjs` 原先 `rm -rf` 整个 `apps/miniprogram/src/utils/shared/`（该目录住着 **6 个手工维护**的包内工具）⇒ 每次同步**自毁 6 文件**、`build:miniprogram` 直接退 1；**已修为「只删本脚本自己生成的产物」**（`managedOutputs`），状态＝**已实现（Kong）、待质检确认**；**④ 时段键收尾**（App 写入侧新值改 `morning` ＋ 小程序边界对齐 App：**0:00–4:59 不再算 `morning`**）＝**已派、待交**；同步：§「环境与权限（实测结论）」**R44** 小节（①~⑬ ＋ 本批同批登记 ＋ 口径收口）、§5（端侧读取通道 / 时段键 / 播放模型）、§7 第二批 ③、附录 B.5（**索引扩为 R1~R44**）、附录 C / **C4 补注**、文末更新日期与参考代码；质检计划 §0.1（**新增第 19 条**） / §8.1（**新增 X21＝小程序端侧接入验收**、阶段列、**Exit Criteria 改 X1~X21**）与文首 Status | Jing |

> **v4 依据（2026-09-24）**：本版全部新增 / 修订条目均来自**冥想新模型第一批验收**产生的裁定与观察（编号 R1~R15，索引见附录 B.5）。**第二批次实现以本版为唯一依据**；第一批未验证或受阻的项（`med_tracks` 集合缺失〔**已由 R37-② 关闭：集合已于 2026-09-24 创建**〕、Track 预览、权限收紧等）见附录 C 挂账清单，不得当作已通过。
>
> **v4.1 依据（2026-09-24）**：本版回填 **Zang 对附录 B.6「第一批验收产生的待裁口径」六条的裁定**（编号 **R16~R20**，索引见附录 B.5）。**B.6 六条至此全部裁定并收敛到正文**（原条目保留、仅加标「已裁定」与正文落点，便于追溯）；附录 C 同步更新（C8 转为「已实现（Kong）、待质检确认」，C2 / C3 / C5 / C7 补裁定口径）。另登记两项**已实现（Kong）、待质检确认**的收敛项：**K8**＝「加入音频库」下拉行顺序、**K9**＝「仅文本变化才触发级联」——两者状态为「**已实现（Kong）、待质检确认**」，**不得写成「已验证」**。
>
> **v4.2 依据（2026-09-24）**：本版收口 **Zang 对上一轮 4 条尾巴的裁定（R21~R24，索引见附录 B.5）**。
> - **R21（唯一权威）**：Section 名与章节名的**源是代码常量**（`packages/shared-utils/meditation-track-template.js`）；本规范内的对照表**只是镜像，不是源**——新增 / 改名 Section 或章节必须**先改代码常量，再同步本表**。据此确认 R18-② 的「颂钵库 · 颂钵（sec-bowl）」拼法**正确、不回改**。
> - **R22（状态词统一）**：K8 / K9 与四个老口径 writer（`saveMeditationCalendar` / `saveMeditationCompositionSettings` / `saveMeditationAudioLibrary` / `saveMeditationLibrary`）的写入校验，状态词**一律写「已实现（Kong）、待质检确认」**（含 R17 原「已在第一批实现完成」的写法），**全文不得出现第二种状态词**；**待质检通过后再统一改「已通过」**。
> - **R23（不拆表）**、**R24（失效路径修正）**：落点在质检计划 `docs/meditation.admin.partner.verification-plan.md`（§0、§8.1）与本文件的「参考」清单、音频格式节。
>
> **v4.3 依据（2026-09-24）**：本版收口 **Zang 对上一轮 3 条残留的裁定（R25~R27，索引见附录 B.5）**。
> - **R25（命名以代码为准）**：`word_count_status` 阈值常量的**源是代码**（`packages/shared-utils/meditation-track-template.js` 的 `MEDITATION_WORD_COUNT_DEVIATION_THRESHOLDS = { slight: 0.1, severe: 0.25 }`）；`MED_WORD_COUNT_THRESHOLDS` / 键名 `ok`·`hard` 为**从未落地的旧命名**（追溯见附录 A.2 / A28）。`word_count_status` 取值集合＝代码 `MEDITATION_WORD_COUNT_STATUS`：`ok` / `slightly_over` / `over` / `slightly_under` / `under`；纯音频段不写入该字段。
> - **R26（表按代码校正）**：正本「集合与代码映射」表的「代码状态」列**以当前代码为准**逐行校对；`med_section_audios` 与 `med_tracks` **均已有实现代码**，但 **`med_tracks` 集合尚未在 CloudBase 创建（R12 / R20），落库验收阻塞**〔**该口径已由 R37-② 关闭：集合已于 2026-09-24 创建，落库类验收无阻塞项（附录 A.2 / A34）**〕。
> - **R27（质检基线过期）**：质检计划 §0 基线步骤改写为「**历史基线（已过期）** ＋ **当前事实**」两段，避免按过期判据判差异。
>
> **v4.4 依据（2026-09-24）**：本版收口 **权限环境调查结论与 Zang 的后续裁定（R28~R32，索引见附录 B.5）**。
> - **R28（权限模型实测结论）**：`med_*` ＝**仅创建者可读写**（非创建者读返回**静默空集**、写返回**静默 `{updated:0}`**）；`app_settings` ＝**所有身份可读 + 非创建者写被显式拒**；`dev_login` 会话＝**纯匿名身份**且 uid 绑定浏览器 profile 的 `device_id`（**换 profile 即换身份**）。详见新增的「**环境与权限（实测结论）**」节。〔**v4.9 更正**：本段中 `app_settings` 写侧「非创建者写被显式拒」**已作废**——实测为**非属主 update 既有文档＝静默 `{updated:0}`、非属主 `add`＝成功**，见 **R28-② / R40-⑧**〕
> - **R29（权限收紧＝成套动作）**：**不得只改权限**——匿名会话下把 `med_*` 改为「仅管理员可写」会**静默失效**（越权写只返回 `updated:0`、无错误；`app_settings` 即先例）；**必须先解决后台身份模型（非匿名登录 + 管理员角色），再收紧权限**。三方案（1 / 2 / 3，含推荐）登记为**待人工拍板项**（附录 B.7）。
> - **R30（D6 升为硬前置）**：据 R28，端侧在「仅创建者可读」下**根本读不到** `med_tracks` / `med_section_audios` ⇒ **D6 只读云函数不是优化项、而是第二批的硬前置**；第二批顺序修正为 **转码执行器 → D6 只读云函数 → 端侧双轨播放（先 App、后小程序）→ D10**（D10 自身仍按 R20-② 的前置）。落点：§7、§5。
> - **R31（三条质检纪律）**：跨会话持久化在 dev 匿名会话下**不可验**；`updated:0` **不得单独作为「无权限」证据**（**只有 `DATABASE_PERMISSION_DENIED` 是显式拒绝**）；每轮开工计数**只能作为本会话基线**。落点＝**质检计划 §0.1**（不写入本规范正文）。
> - **R32（别名入口更新 + 挂账 C9）**：`docs/partner.meditation.spec.md` 子模块清单改为**实际 7 项**、更新日期 2026-09-24（其「正本别名 / 入口」定位不变）；新登记挂账 **C9**（`med_section_raws` **无删除路径**，低危、非阻塞）。
>
> **v4.5 依据（2026-09-24）**：本版收口 **R33（转码参数定稿与实现约束，Zang 已裁定）**——依据＝**Kong 用本机 ffmpeg 8.1.1 ＋ 真跑 `MediaRecorder` 采集的 `audio/webm;codecs=opus` 样本（128kbps 双声道 48kHz、无 Duration 头）所做的实测**，**本轮不重新推导**。九条落点：
> - **R33-①（Opus 主体定稿）**：`.ogg`（Ogg Opus / RFC 7845）＋ `-c:a libopus -b:a 32k -vbr off -ac 1 -ar 48000`；**必须 `-vbr off`**（默认 VBR 下 `-b:a 32k` 实测漂到 **54.9kbps / 1.71x**，CBR 实测 **32.6kbps / 1.02x**）、**必须 `-ac 1`**（源为双声道；固定码率下双声道只是每声道质量砍半、体积不变）。
> - **R33-②（mp3 兜底定稿）**：`.mp3` ＋ `-c:a libmp3lame -b:a 48k -ac 1 -ar 44100`（实测 **48.05kbps**）；**`46k` 建议值作废**（非 MPEG-1 Layer III 合法档位，libmp3lame 吸附为 48k、两者 md5 完全相同），登记附录 A.2 / **A32**。
> - **R33-③（执行形态）**：**单次 ffmpeg 调用双路输出**（`-map 0:a` 写两次）；实测与只跑 mp3 等价（60s：**0.218s vs 0.185s**）。
> - **R33-④（零损失备选）**：`-c:a copy -f ogg`（webm→ogg 换容器）实测**逐样本零差异**（777600 vs 777600 samples、differing=0、Ogg CRC 全合法）、不调编码器（**0.029s/60s**），代价是**不降体积（0.998x）**；**定稿：交付走重编 CBR，remux 只用于「需要最高保真 / 比对」场合**（源 128k 双声道 remux 后 60s 仍 961KB，是 mp3 兜底的 2.7 倍）。
> - **R33-⑤（待确认）**：**32k 单声道 CBR 对真人冥想语音的可听化程度未经听测**——本轮只验体积 / 可解码性 / 码率合法性；**列为待人工听测项（落附录 B.3 / T4）**，若听测发现可闻劣化则升 `48k -vbr off -ac 1`；**未听测前不得写成已定**。
> - **R33-⑥（SCF 选型依据）**：定稿双路 **3.29–3.5 ms/音频秒**；单条 5min 段 ≈ **1.07s**、最坏 10 段×5min ≈ **10.7s**；ffmpeg 峰值内存 **≤15MB** ⇒ **SCF 建议 256MB / 单次超时 60s**；真正瓶颈是 **COS 上下行与冷启动**、不是转码。
> - **R33-⑦（实现硬约束）**：上传原件 **`duration=N/A`**（ffprobe 对上传原件报 `duration=N/A`，换容器 / 转码后才出现正确时长）⇒ **不得对原文件取时长**；入库时长以**客户端实测为准**（第一批已如此），云函数如需时长**只能取转码产物**；**不得假设单声道**（源为双声道）。
> - **R33-⑧（静态 ffmpeg）**：云函数需自带 **linux x64 静态构建**，选型时**必须实地校验** `ffmpeg -encoders | grep -E 'libopus|libmp3lame'` 与必要 muxers（remux 路径不需编码器）；**二进制不得提交进仓库**（入 `.gitignore`，规范内写清获取与校验步骤）。
> - **R33-⑨（容器选型取舍）**：定稿 **`.ogg`**（明确音频扩展名，避免 `.webm` 被当视频 / CDN / MIME 嗅探）；**`.webm` 换容器同样无损（1.000x）**，仅作**一行备选**登记，若播放侧偏好可改。
>
> 落点：§「音频格式与转码规范」（转码参数行 ＋ 新增「**转码参数定稿与实现约束（R33）**」小节）、§7 第二批、附录 A.2 / A32、附录 B.3 / T3·T4、附录 B.5 / R33、附录 C / C6；质检计划 §0.1 / §3.4 / §6.1 / §8.1（X13、X15）。
> **⚠ 本版（v4.5）的 32k 单声道口径已由 v4.6 / R34 覆盖**（`-ac 1` 作废，追溯见附录 A.2 / **A33**）——本段作为**历史记录**保留，**不得再作为实现或验收依据**。
>
> **v4.6 依据（2026-09-24）**：本版收口 **R34~R36**。**R34 依据＝Kevin（用户）直接裁定 ＋ Kong 的真样本实测（样本＝`MediaRecorder` 产出的 `audio/webm;codecs=opus`；**本轮不重新推导**）**；**R35 / R36 依据＝本批代码与全仓检索查实**。三条要点：
> - **R34-①（Opus 主体改定，覆盖 R33-①）**：`.ogg`（Ogg Opus / RFC 7845）＋ `-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000`（**硬 CBR ＋ 立体声**）；**`-vbr off` 仍然必须**（48k VBR 实测漂到 **≈73kbps**，60s 样本 **552.9KB**）；**`-ac 1` 作废**——**不再下混单声道**（追溯见附录 A.2 / **A33**）。
> - **R34-②（mp3 兜底改定）**：`.mp3` ＋ `-c:a libmp3lame -b:a 48k -ac 2 -ar 44100`（实测 **48.06kbps / 2 声道 / 44100Hz**）；`46k` 档位**维持作废**（R33-② 不变）。
> - **R34-③（实测数据，**必写、必照抄**）**：实样本 `MediaRecorder` webm 输入 —— **60s** → `.ogg` **372181B ≈ 363.5KB / 实测 48.65kbps / 2 声道 / 48000Hz**、`.mp3` **367639B ≈ 359.0KB / 48.06kbps / 2 声道 / 44100Hz**；**300s** → `.ogg` **1823385B ≈ 1780.6KB / 48.62kbps**、`.mp3` **1800507B ≈ 1758.3KB / 48.01kbps**；**单次双路调用耗时 325ms（60s）/ 1627ms（300s）**。码率为**实测**（`ffprobe` `format.bit_rate` ＋ `size*8/duration` ＋ ffmpeg stderr **三处一致**）；**`ffprobe` 对 `.ogg` 的 `stream.bit_rate` 为 `N/A`，必须以 `format.bit_rate` 为准**。
> - **R34-④（代价对照，必须写清）**：旧口径 32k CBR **单声道** ogg **243.9KB / 60s**（≈32kbps 全给单声道）；新口径 48k CBR **立体声** ≈ **24kbps / 声道**；mp3 48k 的**单声道与立体声体积相同**（CBR 恒码率）。
> - **R34-⑤（X15 改口径）**：**改为「48k 立体声的听感验收」**——**参数选择已由用户裁定**（不再是待裁项），但**可听化程度仍未经听测**；**未听测前不得写成「已验证 / 音质达标」**（落附录 B.3 / **T4**、质检计划 §8.1 / **X15**）。
> - **R35（转码执行器实现与队列分区，硬口径；**实现已由 Kong 本轮落地并自测 15/15 PASS**）**：**队列分区（D-B2-9，硬）**＝新执行器（云函数 `cloudfunctions/meditation-transcoder`）**只领 `transcode_profile === 'section_audio'`** 的 queued job——**三层**：① `fetchQueuedJobs` **过滤进查询**（不是先领后筛）、② `claimJob` 乐观锁 `.where()` **带 `transcode_profile`**（老 profile job `updated = 0` 领不走）、③ `resolveJobSkipReason` / `processJob` 对非 section job 返回 **`skipped` / `not_section_audio_profile`**、**不写任何字段**（**跳过而非失败**，绝不把老链路 job 置 `processing` / `failed`），伴随 `job_profile_not_section_audio` 日志；**分区常量**＝`SECTION_AUDIO_TRANSCODE_PROFILE = 'section_audio'`（定义在 `lib/transcode-state.js`，字面值权威来源＝排队方 `MeditationPage.jsx:3334`）；老 worker（`scripts/audio-transcode-worker.mjs`）**跳过 `section_audio`**（本 worker 侧唯一改动，2 行 `.filter`）；**实测同一数据集两侧互不吃对方的 job**。**上线纪律（强制）＝启用新执行器前先停 `npm run audio:transcode-worker:loop` 并用 `pgrep -fl audio-transcode-worker` 确认为空**，**同一时刻只允许一侧消费**，**回滚顺序相反**（纪律须同时写入 `scripts/README.md`，该文件存在）。**口径收紧**＝section_audio 链路**取消 `item_id` 回退**：缺 `section_audio_id` ⇒ **`MISSING_SECTION_AUDIO_ID`（永久错误、立即终结、不入重试、不写 `med_section_audios`）**；老 profile 仍保留 `item_id` 兜底。**字段权威（D-B2-10）**＝job 文档 `attempts` / `transcode_error` **权威**，`attempt_count` / `error_message` 为**过渡期镜像**（领取时**两键同写**并**同时清空两个错误键**；读取侧 `attempts ?? attempt_count`；**排队方 `database.js:5915` 只写镜像键 `attempt_count: 0`**、未写权威键——**已登记为挂账**，待老 worker 退役时一并切换，挂账 **C13**）。**lint 门（实测）**＝仓库级 `npm run lint` **142 → 127 problems（132 → 117 errors）**、`cloudfunctions` **16 → 1**（仅剩既有 `getHomePageData/index.js:11`）、**新执行器目录 0 problem**（4 处 `eslint-disable no-undef` 已移除）。**实现现状**＝worker 第 **28** 行 `DEFAULT_FFMPEG_AUDIO_ARGS` **已随本轮更新为 48k 立体声硬 CBR**（**不再是旧 48k VBR**）；该 worker **L295 临时文件名 `output.opus`** 与排队方 `.opus` 扩展名**本批未改**（挂账 **C12**）。新增挂账 **C10~C13**（loudnorm 待拍板 / `audio_url` 2 小时临时 URL / 路径与扩展名不一致 / job 字段冗余与镜像收敛）。
> - **R36（后台质检入口现状）**：① 代码内**没有** `?dev_login=1` 这类 dev 登录入口（**全仓检索零命中，旧表述作废**）；② 后台门禁＝`Partner.jsx`（`adminAuthorized`）要求 `liwu_auth_session` 会话 ＋ 用户带【超级管理员 / 管理员】标签；③ `requestPhoneOtp` / `verifyPhoneOtp` 存在但**全仓无 UI 调用**（⇒ 后台当前**无登录入口**）；④ OTP 为 **mock 固定 `'1234'`**；⑤ 系统超管手机号常量 `16601061656`；⑥ **可复现配方正在实测（R37 待回填）**——**未定前所有 UI 类验收一律标「环境不可达」**，**不得**标「通过」或「失败」〔**v4.7 复核补注（2026-09-24，Jing）：该项已定稿——配方已实测复现并回填正文（R36-⑥ / ⑦）；本纪律已放宽为「未按配方执行所得 ⇒ 标环境伪失败（采样过早）并重跑，不得标 PASS/FAIL」**〕。
>
> 落点：§「音频格式与转码规范」（转码参数行 ＋ 「**转码参数定稿与实现约束（R33 初定 → R34 改定）**」小节 ＋ 新增「**转码执行器实现与队列分区（R35）**」小节）、§「录制与转码链路」、§「环境与权限（实测结论）」（新增 **R36** 小节）、附录 A.2 / **A33**、附录 B.3 / T3·T4、附录 B.5 / R34~R36、附录 C / C6 ＋ C10~C13、文末更新日期；质检计划 §0.1 / §3.4 / §6.1 / §8.1（X13 挂队列分区与字段口径验收项、**X15 改口径**）。
>
> **v4.7 依据（2026-09-24）**：本版是 **v4.6 之后的准确性回填（R37~R38）**——**不改动任何已裁参数、不新增功能口径**，只做「口径更正 ＋ 事实登记 ＋ 挂账」。
> - **R37-①（样本实际时长口径更正）**：R34-③ 的两个实测样本为**真实 `MediaRecorder` 采集**，**实际时长 ≈61.2s（不是名义 60s）**（`ffprobe` 实测 **61.2035s / 61.200s**）；**300s 样本为精确 300.0s**。**复核体积 / 码率前必须先测输入实际时长**——用名义 60s 反推会得到 **≈49.6kbps 的假偏差**（正确口径 48.65kbps ＝ 372181B ÷ 61.2035s），**不得据此判失败**（落 R34-③ ＋ 附录 A.2 / **A35**）。
> - **R37-②（`med_tracks` 口径矛盾清除，挂账 C7 关闭）**：`med_tracks` **已建**（2026-09-24；证据＝`res.code` **无 `code` / `message`** ＋ `med_section_raws` **正对照同形** ＋ `add` 成功**排除假否定** ＋ **两轮端到端写入 / 读回 / 删除成功**，R7 g/h 的**数据层与 UI 层均通过**，测试文档已删）⇒ **附录 C / C7 标「已关闭」**；全文「未创建 ⇒ 落库类验收一律标阻塞」的旧口径**作废**（附录 A.2 / **A34**），**当前无阻塞项**。
> - **R37-③（第一批验收结果记录）**：**Track 配置的 UI 点击路径已实测通过**——空态只有「初始化默认 Track」→ 点击后进编辑态 → **六章模板 300 / 30 / 130 / 150 / 270 / 30**、**留白 141×5**、**末章无留白输入**、**章序不可操作**、**估算自洽** → 按钮文案实测为「**保存 Track**」→ 保存后 `version` **1 → 2**、`chapters = 6`、**刷新保持**、**二次保存同 `_id` 且 `version` 2 → 3**（测试文档已删）。**术语澄清（必须分清）**：`total_target_seconds = 900` 是**软基准**；UI 的「**内容 15:10**」是**章时长上限之和（910s）**——**两者不是同一把尺子**（见 §3.7）。
> - **R38-①（新缺陷：删除路径静默假成功；已实现（Kong）、待质检确认）**：底层 `doc(id).remove()` 返回 **`{"deleted":0}`（非 `{code,message}`）**时旧 `assertCloudBaseWriteResult` **放过** ⇒ `deleteMedTrack` 报成功而**实际未删**（**已在非 owner 身份实测：删除后文档仍在**）。处置＝**新增删除影响条数断言（`deleted = 0` 必须报错）**，并**全库覆盖全部 `.remove()` 调用点**（实测 `apps/web/src/admin/services/database.js` 共 **15** 处＝**11 处直接严格断言 ＋ 4 处 `removeDocBestEffort`**；断言函数 **`:425`**、反向纪律注释 **`:387-392`**；主目标 6 处＝`deleteUser` **L4223/L4224**、`deleteCategory` **L4632/L4633**、`deleteTag` **L4697/L4698**、`deleteMedParagraph` **L5468/L5469**、`deleteMedSectionAudio` **L5911/L5912**、`deleteMedTrack` **L5993/L5994**；级联带 `allowZero` 5 处＝**L2376/L2377**·**L4217/L4218**·**L4691/L4692**·**L4763/L4764**·**L4778/L4779**；自动修复 4 处＝**L1820/L1839/L4390/L4474**，见 **R38-④ / D-B2-16**）；状态＝**已实现（Kong）、待质检确认**（复核证据：桩测 **27 PASS / 0 FAIL**、lint **127 未上升**）。**同时写入反向纪律**：**update 路径不得用 `updated >= 1` 作成功条件**（R28 已证**同值 update 也返回 `updated:0`**，**不是无权限证据**）。
> - **R38-②（dev 环境真实事实，影响所有后续质检与清理）**：① 本地 dev 后台经 `apps/web/vite.config.js` 的 `/api/cloudbase-proxy` → `scripts/dev-cloudbase-proxy.mjs`（**:3020**）→ **真实 CloudBase 环境 `liwu-d8gek6jjdab1d087c`**；② **`CLOUDBASE_ADMIN_API_KEY` 实测未配置** ⇒ 写入**以调用者匿名 `_openid` 落到真实云端**（不是本地 mock、不是沙箱库）；③ 后果＝**换浏览器 profile 就既看不见也删不掉前几轮的 dev 数据**（实测：新 profile 读 `med_tracks` = 0、`deleteMedTrack` 表面成功但 `deleted: 0`、owner profile 复读**文档仍在**）；④ 待办＝**只读盘点（服务端凭据）已在做，删除须人工确认清单后执行**。
> - **R38-③（新增挂账）**：① **预估口径待用户拍板**（默认种子 Track 的 UI 预估 **26:55** vs 基准 **15:00**，**+79%**——因为预估用**章时长上限之和 910s**，而非**按字数预算的实际朗读时长**）；② **dev 身份 / 环境治理待用户拍板**（固定 dev 身份 / 本地可清空库 / 读路径也注 admin 凭据——**三选一**）；③ **队列首轮领取前权威键缺省**（排队方只写镜像键）——**已在 C13，保持**。
> - **R38-④（新增裁定：D-B2-16，Zang 裁定 2026-09-24）**：**4 处「后台自动修复（reconcile）」路径的删除（`removeDocBestEffort`，L1820 / L1839 / L4390 / L4474）保持「不抛出」**——它们由**读到脏数据自动触发**，抛出会**中断同一轮后续修复步骤**、把自动修复变成**显式失败**。**但不是静默放过**：**断言照接**（**不再放过 `deleted: 0`**）、**失败降级为显式 `console.error`**（旧 `.catch(() => {})` 作废）；**用户点击触发的删除一律严格断言**。**未达到「自动修复也硬失败」的需求时必须另立裁定**（附录 A.2 / **A37**）。
> - **v4.7 复核补注（2026-09-24，Jing）**：本批**只统一口径与登记事实，不改任何已裁参数**——① **R38-① 改以行号级口径陈述**（见上：断言函数与 15 处调用点逐条行号 ＋ 桩测 **27 PASS / 0 FAIL** ＋ lint **127 未上升**）；② **新增 R38-④ / D-B2-16**；③ **R36-⑥ / ⑦ 回填实测入台配方**并**放宽「环境不可达」纪律**（未按配方所得 ⇒ 标「**环境伪失败（采样过早）**」并重跑，**不得标 PASS/FAIL**；**§4 与质检计划的对应口径同步改**）。**旧读造成的「删除断言未落地 ⇒ 应退回待实现」的结论作废**（该修复实际已落地，行号见上）。
> 落点：§「音频格式与转码规范」R34-③、`med_tracks` 环境前置 ＋ 权限建议、集合与代码映射（`med_tracks` 行）、§1.2、§3.7（含 `deleteMedTrack` 调用方口径）、§4（写入结果校验）、§7、§「环境与权限（实测结论）」**R36 / R37 / R38** 小节（含 **R38-④**）、附录 A.2 / **A34~A37**、附录 B.5 / **R37~R38**、附录 C / **C7 关闭** ＋ **C14 / C15**、文末更新日期；质检计划 §0 / §0.1（第 8~12 条） / §1.1 / §3.4 / §8.1 与文首 Status。

> **v4.8 依据（2026-09-24）**：本版收口 **R39（D6 读契约）＋ 本批质检结论（Neng-16）＋ 两条现状登记**——**不改动任何已裁参数**，只做「口径升格 ＋ 结论登记 ＋ 挂账」。
> - **R39（D6 只读云函数读契约，12 条口径，取代「契约未定义」）**：D6 的**入参 / 出参契约**此前**未定义**（只写「照 `getUserPhone` / `getHomePageData` 模式新增只读云函数」），实现方自定并列出 12 条假设；**函数已实现**（`cloudfunctions/meditation-read/`）⇒ 把这 12 条**升格为口径**：函数名与位置（`cloudbaserc.json` 已登记 **30s / 128MB / Nodejs18.15 / 无触发器**）、**action 集 3 个**（`getTrack` 缺省 / `getSectionAudios` / `listTracks`）、出参形状与错误码（**CloudBase resolve 返回 `{code,message}` 一律当错抛、收敛 `READ_FAILED`**）、**可下发判据**（opus ＋ mp3 齐备；`queued`/`processing`/`failed` 不下发；历史 `idle` 文档仍下发；`stats.excluded` 五类逐条计数）、**临时 URL 现签**（唯一对外调用 `getTempFileURL`、去重后一次批量、`maxAge = 7200`、不透传 `audio_url`、不下发 `file_id`、部分失败剔除计数 / 全部失败整单报错）、**15 项字段不得下发**、**六章模板折回 ＋ 启用态口径**、**不抽签 / 不写会话 / 唯一源 `med_section_audios`**、**候选上限（查询 50 / 下发 10）**、**不做端侧身份校验＝口径非疏漏**（收紧须另裁，并入 C15 / X9）、**端侧缓存 ≤ 半有效期**、**部署前提与同步责任（SCF 内置凭证 ＋ `lib/*` 精简等价副本，D-B2-8）**；旧「契约未定义」状态**作废**（附录 A.2 / **A38**），状态词（R22）＝「**已实现（Kong）、待质检确认**」。
> - **R38-① 质检结论＝PASS（Neng-16，2026-09-24）**：真实 CloudBase 往返（带 requestId）——`{deleted:0}` ⇒ **抛出**（删不存在 id：`requestId 71e425366701d8`）、`{deleted:1}` ⇒ 成功且复读 `data:[]`、再删复抛同文案（`requestId a884e06fd4c59`）；反向反证＝**update 在 `{updated:0}` 下不抛**（`requestId 81420156b9f2b8`）；静态 **15/15 处置分类全对**；`med_tracks` 清理回 **0** 条 ⇒ 状态词改为「**已实现（Kong）、质检 PASS（Neng-16，2026-09-24）**」。
> - **四个老口径 writer 的复验现状（不改口径）**：**静态 8/8 断言存在且行号已核**（L5183/L5190、L5249/L5256、L5315/L5322、L5381/L5388；集合缺失另抛 L5172/L5238/L5304/L5370）；**动态只完成 1 条（冥想库）且受阻于 R28 权限模型**（非属主身份 `{updated:0, upsertedId:null, requestId:3b734af94bab9}`、断言不抛、页面零提示、4 个文档 body sha256 与 `updated_at` 一字未变）⇒ 状态词＝「**静态 PASS、动态受阻于 R28 权限模型（待 Zang 就 `updated` 语义另裁）**」〔**v4.9 补注：该待裁点已由 R40 裁定**——`updated` 语义已定（R40-①~⑧）⇒ 复验状态改为「**静态 PASS、动态复验待按 R40 执行（判据已定）**」；**仍不得写成通过，也不得判为实现缺陷**〕——**不得**写成通过、也**不得**写成实现缺陷（**归因未定**）。
> - **新增挂账 C16**：`cloudfunctions/getHomePageData` **有目录但未登记进 `cloudbaserc.json`**（既有差异，本批未处理，**待裁定**）。
> 落点：§「环境与权限（实测结论）」**R39** 小节（①~⑫ ＋ 旧状态作废段）、§4 写入结果校验硬口径（R17 / R38-① 状态词）、§1.2 / §7 与「`med_tracks` 权限建议」的 D6 引用、附录 A.2 / **A38**、附录 B.1 / D6、附录 B.5 / **R39**、附录 C / **C2 补注 ＋ C16**、文末更新日期与参考代码；质检计划 §0.1（第 13~14 条） / §8.1（X2 / W1 / W2 / X14 / **新增 X16 / X17**）与文首 Status。

> **v4.9 依据（2026-09-24）**：本版把 **Neng-17 的仲裁结果（真实 CloudBase 往返，带 `requestId`）** 落为**规范口径**，并**纠正两处与实测相反的描述**；**不改任何已裁参数、不新增挂账 / D-B2 编号**（**D-B2-14 沿用改写，不新增编号**）。
> - **R40（`updated` 语义与写入成功判据；含 D-B2-14 改写）**：**① `updated` 计「内容真正发生变化的文档数」，不是命中行数**（真改值 → `1`；纯值同值写回 → `0`；`where` 命中 2 条同值 → `0`、真改 → `2`）。**② `updated:0` 三义同形**（普通对象、无 `code` / `message`）＝**值本来相同** ／ **无权写（静默拒绝）** ／ **文档不存在** ⇒ **既不是成功证据、也不是失败证据**。**③ 含对象数组字段的载荷上 `updated` 非确定**：同一 payload 连写三次实测 **`0,0,1`**（`id 2d28a687fe20b8` / `8357ac503ca828` / `fbb197ce64c288`）与 **`1,0,0`**（`c108e828eed148` / `a0e6253167f67` / `543c320bdc64b`）；**反向 no-op 也实测报 `1`**（`cf2`：`61c6ded59bb9a8` / `bfed7d9285dd3` / `eba78cff5e08d8`）；且**对象数组子文档读回键序被改写为字典序**（写序 `chapter_key, order, max_duration_seconds, gap_after_seconds, enabled, section_types` → 读序 `chapter_key, enabled, gap_after_seconds, max_duration_seconds, order, section_types`）。**④ 反向纪律保留、依据改写**：`update` 路径**仍不得**用 `updated >= 1` 判成功——理由**改为**「**三义同形 ＋ 对象数组非确定**」；**原依据（R28「非创建者写返回静默 `{updated:0}`」被读成「同值也返回 0」）系误读、作废**（附录 A.2 / **A39**）——即 **D-B2-14 结论对、依据错**（R40-⑦）。**⑤ 有条件例外（硬，限 8 处）**：**仅当载荷必然含易变字段**（`updated_at: new Date()` / `version + 1`）时，`updated < 1` 且**无 `code`** 可作「本次写入未生效」的**强信号**处理，**但必须一次性读回比对**（`Date` 归一 ISO、对象 / 数组键序无关深比较）：一致 ⇒ 视为**幂等 no-op 成功**；不一致 ⇒ 抛「**{entityLabel}保存失败：未能确认写入生效（未检测到任何变化）（requestId: xxx）**」（**文案不得声称「无权限」**）；**读回失败 ⇒ 抛独立文案、绝不得当成功**。**接入范围＝四个老口径 writer**（`saveMeditationAudioLibrary` / `saveMeditationCompositionSettings` / `saveMeditationCalendar` / `saveMeditationLibrary`）**＋ 四个 `med_*` updater**（`updateMedParagraph` / `updateMedSectionRaw` / `updateMedSectionAudio` / `updateMedTrack`）——**范围外路径一律沿用 ④ 的反向纪律**。**⑥ 强信号依据**：上述路径实测 **8/8 样本恒为 `1`**（同值 `name` ＋ 新 `Date` `9a1115384c09b`；老 writer 形状仿真连写 3 次 `f742051297af7` / `b0ad9f33b05d3` / `c1e275d99a7158`）。**⑦ 实现状态**：`database.js:387-392` 的 D-B2-14 注释重写 ＋ 新增有界断言（建议名 **`assertCloudBaseUpdateTookEffect`**）＝**已实现（Kong）、待质检确认**（R22 状态词）。
> - **§F 两条纠正（与实测相反，旧表述一律作废）**：**① 非属主 update `app_settings` 既有文档 ＝ 静默 `{updated:0}`**（**全程无 `code`**；文档体 sha256 与 `updated_at` 前后一致；`requestId 19a4f236da0e08` / `048fa11b06d8d`）——**不是** `DATABASE_PERMISSION_DENIED`；**② 非属主 `add` 到 `app_settings` 成功**（`requestId 82410668e37ab`；**即时删除复核 `deleted:1`、总数 15→16→15**）——**不是**「连新建都拒」。
> - **落点**：§「环境与权限（实测结论）」**R40** 小节（R40-①~⑧）、**R28-②**（表与结语重写）、「`med_tracks`（CloudBase 集合，新增）」 权限建议的 `app_settings` 行 / R16-⑤ 先例句 / **权限类用例判据行**、§4 写入结果校验硬口径（**R17 补注状态 ＋ 反向纪律 ＋ 有条件例外**）、R38-① 反向纪律段、附录 A.2 / **A39**（＋ **A36** 依据同步）、附录 B.5 / **R40** 行（＋ **R28** 行更正）、附录 C / **C2 · C7** 状态注记、文末更新日期；质检计划 §0.1（**第 6 条改写 ＋ 新增第 15 条**） / §8.1（**X17 改「已裁：按 R40 执行动态复验」** / X2 / W2 / Exit Criteria **R40 专条**）与文首 Status。

> **v4.10 依据（2026-09-24）**：本版收口 **R41（端侧双轨播放接入口径）＋ 两条新增挂账（C17 / C18）**——依据＝**Kong 对 App 与小程序现状的侦察**（双轨骨架已存在，但数据源仍挂在**老规则 A**；**小程序侧完全无音频**）＋ **Zang 对下列 12 条的裁定，并已派实现**；**不改动任何已裁参数**。
> - **R41（端侧双轨播放接入口径，12 条已定裁决）**：① **数据源**＝端侧**不再读老的 5 项 `app_settings` 配置**、**不再算老 plan**（D9）；一律经 **D6（R39 契约）** 取 Track ＋ 候选池；**端侧永不直连 DB 读 `med_*`**。② **播放模型**＝背景轨 `loop`、人声轨 `sequence`；音量**取响应里的 `background_track.volume` / `voice_track.volume`**（现 **0.33 / 1**）——**缺省才回退常量，且回退常量非权威源、绝不覆盖响应值**；章序与段序**只读**（R10）。③ **留白**＝`gap_after_seconds` **只在章间**生效，**末『有可用段的』章恒 0**（末章无内容时不留尾部静默）；**禁用章的留白不计入**（R11）。④ **时长**＝段 `duration_seconds` 取**响应实测值**（**不用标称**）；总计 ＝ **Σ 人声段 ＋ Σ 留白**（**背景 loop 不计入**）；**端侧计时按 Track 组装结果、不沿用固定 15 分钟**；`MIN_VALID_MEDITATION_SECONDS = 180` **两端不变**。⑤ **抽签与固化（D7）**＝抽签在**端侧**（抽签器**可注入**）；固化载荷 ＝ `{track_id, track_version, date_key, session_key, selections[{section_type, audio_id, duration_seconds}]}`；**落点＝先本地 storage（键 `liwu_meditation_session_v1`）**、**云侧写入另裁（登记挂账 C18）**。⑥ **格式与降级（D3）**＝App 按响应 `formats[]` 顺序 **opus → mp3**、**保留 `onerror` 运行时降级**；**小程序直取 mp3、不用 `canPlayType`**。⑦ **失败可见且不静默回退（D9 硬）**＝`TRACK_NOT_FOUND` / `TRACK_DISABLED` / `READ_FAILED` / `CALL_FAILED` / `INVALID_PAYLOAD` ⇒ **明确错误态（附 `requestId`）**；**绝不**回退老音频库或本地兜底 plan；空池 / 缺段的 `section_type` ⇒ **跳段 ＋ warning**、**不得整场失败**。⑧ **测试纪律**＝端侧代码**零 fixture 分支**（**不得**加 DEV 开关 / 桩分支）；桩一律在**测试侧拦截**（代理 / CDP 注入）；**桩跑出的结论不得当 X12 / X18 验收 PASS**。⑨ **小程序前台限制**＝本批**只支持前台播放**（切后台微信会暂停所有音频；`BackgroundAudioManager` **为单例且无 `loop`** ⇒ 双轨在后台**原理不可得**）。⑩ **不做渐变**＝只做「**预加载下一段 ＋ 顺序播放**」，不做淡入淡出。⑪ **iOS App 音量未验**＝WKWebView 的 `HTMLMediaElement.volume` 实测为**空操作** ⇒ 0.33 是否真生效**必须真机实测**；若 **FAIL** ⇒ **记挂账**（引入 Web Audio `GainNode` 或原生插件**另立项**），**不得据此判 X12 整体 FAIL**。⑫ **冻结边界**＝老四 tab 与 `packages/shared-utils/meditation-session-plan.js` **本批不得删改**（D10 前）；时段键 `dawn` → `morning` **统一**（D4），并说明 `point_ledger.activity_slot` 的**历史取值口径**（历史值可能仍存 `dawn`、读侧须兼容、**不做批量改写**）。
> - **状态（R22 状态词）**：`packages/shared-utils/meditation-read-client.js` 与 `packages/shared-utils/meditation-track-playback-plan.js` ＝ **已实现（Kong）、待质检确认**（Zang 复核：**458 ＋ 459 行**〔`wc -l` 实测 458 / 459〕、桩测 **113 PASS / 0 FAIL**、`npx eslint` **0 problem**、仓库级 lint **126**）；**App 侧接入（`apps/app/src/services/cloudbase.js` ＋ `apps/app/src/modules/meditate/MeditationPlayerScreen.jsx`）＝实现中（Kong）**。
> - **新增挂账**：**C17**＝`apps/web/src/admin/services/database.js` 中**另有 38 处**含易变字段的 update 路径**未接** R40-⑤ 的读回断言（如 `saveAiSettings` / `saveThemeSettings` / `saveMeditationSettings` / `savePartnerBrand` / `saveShopProduct` / `updateUser` 等；**另有 9 处未检出易变字段的 update 不得接**）——**本批只覆盖冥想链路 8 处**；**不修理由**＝爆炸半径大、每条须先逐路径确认「载荷必然变化」；**归属**＝待排期。**C18**＝端侧冥想会话记录的**云侧写入**未定（现只落本地 storage，见 R41-⑤）——新建云集合会与「`med_*` 仅管理员可写」目标（**B.7 方案 1**）冲突；**不修理由**＝需与权限方案同拍；**归属**＝待用户（Kevin）拍板。
> 落点：§「环境与权限（实测结论）」**R41** 小节（①~⑫ ＋ 承载模块与状态）、§5（端侧计划计算 / 端侧读取通道 / 播放模型）、§7 第二批执行顺序 ③、**附录 A.2 / A40**、附录 B.5 / **R41**（索引扩为 **R1~R41**）、附录 C / **C4 补注 ＋ C17 · C18**、文末更新日期；质检计划 §0.1（**新增第 16 条**） / §8.1（**X12 按 R41 改判据 ＋ 新增 X18**、阶段列、Exit Criteria）与文首 Status。

> **v4.11 依据（2026-09-24）**：本版收口 **X17 结案（Neng-20 真实验）＋ 两条 low 缺陷修复与范围边界 ＋ R42（端侧恢复路径与格式降级口径）＋ 三条挂账（C19~C21）**——**不改动任何已裁参数、不新增 D-B2 编号**。
> - **X17 结案 ＝ PASS（Neng-20，2026-09-24，真实 CloudBase 往返、带 `requestId`）**：**R40-⑤ 有条件例外的状态词升为「已实现（Kong）、质检 PASS（Neng-20，2026-09-24）」**，并把「**例外条件经实测成立**（属主不误报、非属主可见失败）」写成**正式结论**——① **非属主路径 ⇒ 失败可见、静默丢失已闭合**；② **属主路径 ⇒ 不被误报**；③ **数据未污染**；④ **清理干净**。逐条证据见「环境与权限（实测结论）」**R40-⑤ 实测结论**与 §4。
> - **两条 low 缺陷修复 ＋ 范围边界（本批登记）**：① `apps/web/src/admin/hooks/useDatabase.js` 的 `getSetupErrorMessage`（L26-45）新增 **`/requestid/i` 守卫**（L30-34），失败提示**不再重复追加 requestId**（**已给红对照**：修复前版本可复现线上那条重复文案）；**残留边界＝挂账 C21**（集合缺失分支）。② `MeditationPage.jsx` 的 `MeditationPresetsTab` 的 `handleSave` / `handleDelete` 由**裸 `await onUpdate`**改为 **tab 级 `try/catch` ＋ `writeError` state ＋ `[role=alert]` 内联提示**，消除**未捕获 Promise 拒绝**（jsdom 真实渲染 ＋ 进程级 `unhandledRejection` 计数验证；**红对照＝修复前 `unhandled=1` 且无提示**）；**范围边界（硬）＝同文件另有 8 处裸 `await onUpdate`（音频库 / 冥想设置 / 冥想日历），本批未动**（见 §4，**不得当遗漏缺陷重报**）。
> - **R42（端侧恢复路径与格式降级口径，①~⑥）**：① 链接失效恢复＝**同参重调 D6**（`getTrack` 载荷**逐字相同**）、**不依赖 `file_id`**；② **三层重入防护**（段级 Set / 闸门级 / 基准级）；③ **陈旧判定刻意不用绝对时钟与 `issued_at` / `expires_at` 直接比较**（以**收到响应的本地时刻**起算、阈值 `max_age_seconds / 2`）；④ **`onerror` 与链接过期解耦**（`fetch` → `Blob` → `objectURL` ⇒ **只降级、不重调**）；⑤ **降级与跳段**（`formats[]` 顺序、段内全失败 ⇒ 跳段 ＋ warning ＋ 可见提示、**背景轨继续、不整场失败**）；⑥ **重签只刷新当前段 playlist、不替换整场时间轴**——**该条为设计口径；实测状态（Neng-21）：`segmentPlaylistOverrideRef` 覆盖表从未被写入 ⇒ 尚未真正生效 ＝ 中型缺陷，修复单已派**（**不得**把未生效的口径写成既成事实）。
> - **端侧状态词（R22，务必分面、不得聚合）**：两个共享模块（`meditation-read-client.js` / `meditation-track-playback-plan.js`）＝**已实现（Kong）、质检 PASS（Neng-19，桩面：独立 50/50 ＋ 反向反证 10/10）**；**App 接入 B1（数据源切换、老代码下线、错误可见不回退）＝已实现（Kong）、质检 PASS（Neng-19，桩面与静态）**；**B2a（恢复路径与格式降级）＝已实现（Kong），复验发现 1 条中型缺陷（Neng-21：重签后段内回落旧签 URL 误跳段）＋ 1 条低（dist 产物落后），修复单已派、待复验**；**真实 D6 往返（云函数未部署）与真机项（iOS WKWebView 音量、小程序 iOS 直取 mp3）一律标「未实测」**；**不得**把桩面 PASS 写成 **X12 / X18 整体 PASS**。另：`resolveMeditationUrlPolicyStaleness` 是**共享层定义、当前唯一消费方是 App 播放器**（小程序未消费）⇒ 写「供两端共用」时**必须注明当前仅 App 在用**。
> - **新增挂账 C19~C21**（背景轨是否按章切换〔待用户拍板〕 / 非 403 取源失败是否补「原样重试一次」〔待排期〕 / `getSetupErrorMessage` 集合缺失分支不拼接 `rawMessage`〔一行可修、已列入下一单〕）。
> - **落点**：§「环境与权限（实测结论）」**R42** 小节（①~⑥ ＋ 状态词）、**R40-⑤ 实测结论**、**R41 承载模块与状态（分面）**、§4（**两条 low 修复 ＋ 范围边界 ＋ C21**）、§5 播放模型、§7 第二批 ③、附录 B / **B.5 索引扩为 R1~R42**（R40 · R41 行状态同步）、附录 C / **C2 补注 ＋ C19~C21**、文末更新日期；质检计划 §0.1（**新增第 17 条**） / §8.1（**X17＝已裁并已 PASS（Neng-20）** / **X2 · W2 复验状态同步** / **X12 · X18 补恢复路径判据** / **新增 X19＝R42 逐条验收，复验未全过** / 阶段列 / Exit Criteria）与文首 Status。

> **v4.12 依据（2026-09-24）**：本版收口 **Zang 对「后台 Track 预览」口径的 10 条裁定（R43 ①~⑩）**——依据＝**正本 R9（预览＝批次归属裁定）** ＋ **R41 ①~⑫ / R42 ①~⑥（预览的功能口径来源）** ＋ **附录 C / C4（挂账）** ＋ **Kong 对后台「冥想轨道」tab 的侦察结论（2026-09-24）**；**不改任何已裁参数、不预写实现状态、不改代码、不新增挂账 / D-B2 编号**。
> - **R43（后台 Track 预览口径，①~⑩；状态＝「已定口径、待实现」）**：① 数据源**一律经 D6**（`getTrack` ＋ `getSectionAudios`），**后台也不得直读 `med_tracks` / `med_section_audios` 组装播放**（延伸 R41-①；直连还会绕过 R39 的可交付判据与现签 URL 口径）；② 预览**不落盘**（不写 `liwu_meditation_session_v1`、不写云、不写 `med_*`——**C18 未裁**，且写本地 storage 会与 App 真实会话互相覆盖）；③ 预览基于**已保存版本**（D6 只读库），UI **必须**明示「**预览基于已保存版本 vN；未保存改动不生效**」；④ 抽签＝**每次开预览抽一次 ＋ 「换一批」显式重抽**（`rng` 可注入、默认真随机、**无固定种子**；不得自动周期重抽、不得失败后静默换候选）；⑤ 缺音频**分两类并可计数**（**池空** / **池非空但无可用格式**〔`transcoded_formats` 未齐备 / 缺 `file_id` / 签发失败〕），段级文案「**{章节名 · section 名} 暂无可播放音频，已跳过该段（继续播放）**」＋ 面板汇总计数，**绝不整场失败**；⑥ 失败态**三态必须分开**（**函数未部署 / 调用失败** ≠ **`TRACK_NOT_FOUND`（库里无 Track）** ≠ **`TRACK_DISABLED`**），各带独立文案 ＋ **`requestId`**（有则示）＋「**重试**」，**未部署不得显示为「无数据」或「Track 不存在」**，文案**不得**声称「无权限」；⑦ 后台恢复策略**简化**＝**403 ⇒ 同参整场重调 `getTrack` 至多 1 次（闸门级）**、**不做段级覆盖表**，并明写「**不得依赖 R42-⑥**」（该条经 Neng-21 实测尚未真正生效）；⑧ **时长两把尺子并存**＝现有面板估算（`buildMeditationTrackDurationEstimate`，`MeditationPage.jsx:2952-2962`）＋ 并列「**实测预览总时长（Σ 人声段实测 ＋ Σ 章间留白，背景不计入）**」，并按 **R37-③** 标注「**15:00 软基准**」与「**910s＝章上限之和**」**不是同一把尺子**；⑨ UI 显示**实际音量取值**并标明其为「**响应值**」还是「**回退常量**」（R41-②：响应为准、绝不覆盖响应值）；⑩ **R41-⑧ 的零 fixture 纪律适用于后台预览**——桩只打**测试侧**（拦 `/api/cloudbase-proxy` 或注入 `callFunction`），**后台产品代码不得留 DEV 开关 / 桩分支**，**桩读数不得当 X20 验收 PASS**。
> - **实现约束（R43 末尾，硬）**：数据源 2 行接入（候选 A）＝`apps/web/src/admin/services/cloudbase.js` 新增 `import createMeditationReadClient` ＋ `export const meditationReadClient = createMeditationReadClient({ callFunction: app.callFunction.bind(app) })`（照 `apps/app/src/services/cloudbase.js:155-157` 同款；**apps/web 后台当前零 `callFunction` 使用**）；两个共享模块（`meditation-read-client.js` / `meditation-track-playback-plan.js`）**原样复用、后台不另写一份**；**新建独立组件，不塞进 4598 行单文件**；**不得改造老预览器**（`MeditationPreviewDialog` `:356+` 与 `buildMeditationPresetPreviewPlan` `:242-354` 属老四 tab，**R41-⑫ 冻结**）；最小插入点＝「冥想轨道」tab（`MeditationTracksTab` `:2848-3002`）保存按钮（**`:2990`**）之后；后台子 tab 懒加载已同时 `loadSectionAudios()`（**`:3613-3620`**）。**未部署时**＝**明确错误态**（**不得**显示为「无数据」/「Track 不存在」）。
> - **口径缺口登记（R9）**：R9 原仅裁定**批次归属**、无功能条文 ⇒ **功能口径见 R43（v4.12）**；落点＝B.5 / **R9** 行与 §3.7（**两处均补注**）。**消费方注记（`resolveMeditationUrlPolicyStaleness`）**：**当前消费方＝App 播放器**；**后台预览（R43）实现后为其第二消费方**——**不得**写成已双端生效（落点＝R41 承载模块注记、R42 共用性注记、B.5 / R41 行）。
> - **落点**：§「环境与权限（实测结论）」**R43** 小节（①~⑩ ＋ 实现约束 ＋ 未部署表现）、§3.7（R9 口径缺口补注）、附录 B.5（**索引扩为 R1~R43**）、附录 C / **C4 补注**、文末更新日期；质检计划 §0.1（**新增第 18 条**） / §8.1（**新增 X20**、阶段列、**Exit Criteria 改 X1~X20**）与文首 Status。

> **v4.13 依据（2026-09-24）**：本版收口 **Zang 对「小程序端侧接入」的 13 条口径（R44 ①~⑬）＋ Step 1（共享层接入）的完成登记 ＋ 一个既有同步脚本缺陷的处置**——依据＝**Kong 的小程序端侧侦察（含微信官方文档逐条核实）＋ 正本 R41 / R42 / R43 ＋ Zang 的裁定**；**不改任何已裁参数（R33 / R34 / R40 / R41 / R42 / R43 原样）、不预写实现状态、不改代码、不新增挂账 / D-B2 编号**。
> - **R44（小程序端侧接入口径，①~⑬；状态＝「已定口径、待实现」）**：① 数据源**只经 D6**（注入 `({ name, data }) => wx.cloud.callFunction({ name, data })`）；② **前台双轨不降级**（两个独立 `InnerAudioContext`——官方文档**无单例 / 同时只允许一个**的条款、**官方问答对「无法叠加播放」给的解法即创建多对象**、小游戏文档仅「**Android 最多同时 10 个**」，**远高于 2**）⇒ **不得**因「担心叠加」把双轨降为单轨；③ **本批只前台**（切后台官方行为＝**5 秒后停 JS 线程**、需后台能力才持续；`BackgroundAudioManager` 为**全局单例**、属性表**无 `loop`** ⇒ 双轨后台原理不可得）——切后台停播属**平台限制、不得判缺陷**，也**不得**把 `BackgroundAudioManager` 引入本批；④ **格式只取 mp3**（**ogg 仅 Android、iOS 不支持** ⇒ **mp3 是唯一跨端公共格式**；小程序**无 `canPlayType`**〔属 HTML5〕⇒ **不得**用它作判据）；⑤ **恢复策略的小程序例外（Zang 裁定）**＝小程序**无 `fetch` / `Blob` 阶段**，链接过期与解码失败**都落 `onError`** ⇒ 允许**同参整场重调 `getTrack` 至多 1 次（闸门级）**、重调后仍 `onError` ⇒ **跳段 ＋ warning ＋ 可见提示**、**不得无限重试**——**本条是 R42-④ 的明文例外**（理由已写清，下轮不得当违规）；⑥ **取源＝直设 `ctx.src`**（与既有图片链一致、**零部署前置**）；**不做** `wx.downloadFile` 预取（需下载域名白名单，将来需要须单独立项并登记部署前置）、**不得**用 `wx.cloud.downloadFile`（D6 不下发 `file_id`，R39-⑤）；⑦ **资源释放**＝页面 / 组件卸载时 `destroy()` 两实例（官方「注意事项」：资源**不自动释放**）；⑧ **iOS 静音模式出声**需 `wx.setInnerAudioOption`（`obeyMuteSwitch` **自 2.3.0 起不再由属性控制**），**未实测 ⇒ 列真机项**；⑨ **音量取响应**（同 R41-②）＋ **计时节流**＝按 Track 组装结果（Σ 人声实测 ＋ Σ 章间留白），**弃 900s 固定值**，`MIN_VALID_MEDITATION_SECONDS = 180` 两端不变；⑩ **固化先落本地** `wx.setStorageSync('liwu_meditation_session_v1', …)`、**不写云**（C18 未裁）、**不得**自建云集合，并注明与 R41-⑤ 同属「**App 侧尚未落地**」的待补项；⑪ **共享层单一源**＝两个共享模块**只能经 `npm run miniprogram:sync` 进入小程序**，**禁手抄 CJS 副本**，`packages/shared-utils/*` 为唯一权威源，漂移由 sync ＋ build 门禁兜住；⑫ **时段键 `morning`** 已统一（小程序写入侧 / App 读侧归一 / App 写入侧），**不动 `BADGE_SLOT_KEYS`**；⑬ **失败可见**＝五类错误码各自可见文案 ＋ `requestId`，空池 / 缺段 ⇒ 跳段 ＋ warning、**不整场失败**、**不得**回退老音频库，**零 fixture 分支**（桩只打测试侧、**桩读数不得当 X21 PASS**）。
> - **Step 1 登记（共享层接入；状态＝已实现（Kong）、待质检确认）**：同步脚本白名单 **8→10**、转换器补 `export class`、build 门禁 **15→17**；产物 `^export ` **零命中**、`node --check` 通过、**运行时效验 12/12**（类可 `new`）、**单一源核对 10/10 逐字节相等**；小程序写入侧 `dawn` → `morning`；App **读侧**归一（探针 **19/19** ＋ **负对照 4 FAIL** 证明探针能咬住缺陷）；`BADGE_SLOT_KEYS` **sha256 前后一致**（**未改常量**）。
> - **既有脚本缺陷（已修、待质检确认）**：`scripts/sync-miniprogram-packages.mjs` 原先 `rm -rf` 整个 `apps/miniprogram/src/utils/shared/`，而该目录里住着 **6 个手工维护**的包内工具 ⇒ 每次同步**自毁 6 文件**、`build:miniprogram` 直接退 1；**已修为「只删本脚本自己生成的产物」**（`managedOutputs`）。**这属缺陷修复、不入附录 C 挂账。**
> - **时段键收尾（另一单）＝已派、待交**：App 写入侧新值改 `morning` ＋ 小程序边界对齐 App（**0:00–4:59 不再算 `morning`**）；**本规范不预写其实现状态**。
> - **落点**：§「环境与权限（实测结论）」**R44** 小节（①~⑬ ＋ 本批同批登记 ＋ 口径收口）、§5（端侧读取通道 / 时段键 / 播放模型）、§7 第二批 ③、附录 B.5（**索引扩为 R1~R44**）、附录 C / **C4 补注**、文末更新日期与参考代码；质检计划 §0.1（**新增第 19 条**） / §8.1（**新增 X21**、阶段列、**Exit Criteria 改 X1~X21**）与文首 Status。

---

## 环境与权限（实测结论：R28 权限模型 ＋ R36 质检入口 ＋ R37~R44，2026-09-24）

> **本节是权限环境与质检入口的唯一事实记录**，来源＝**质检双会话交叉验证（含正 / 负对照）** ＋ **本批全仓检索 / 门禁代码定位**。
> 此前散落的权限判断（含「匿名可写」「每轮开工计数归零」等）**一律以本节为准**；本节结论直接决定 R29（收紧方式）与 R30（第二批顺序），并给出 **R36（后台质检入口现状）**、**R37~R38（第一批验收结果 / 删除路径缺陷与 dev 环境事实）**、**R39（D6 只读云函数读契约）** 与 **R42（端侧恢复路径与格式降级口径）**——其中 **R36 直接影响后续所有 UI 类验收的结论口径**，**R39 是 D6 入参 / 出参的唯一口径源**，**R40 是 `updated` 语义与写入成功判据（含 D-B2-14 改写）的唯一口径源**，**R42 是端侧临时链接失效恢复 / 重入防护 / 陈旧判定 / 格式降级与跳段口径的唯一口径源**。**（v4.13）**本节**一并承载 R43（后台 Track 预览口径）与 R44（小程序端侧接入口径）**——**R43 是后台预览的唯一口径源**、**R44 是小程序端侧接入的唯一口径源**；**App / 小程序端侧的通用条款仍以 R41 / R42 为准**（R44-⑤ 是 R42-④ 的**明文例外**、且**例外仅限小程序**）。

### R28-① `med_*` 集合 ＝「仅创建者可读写」

| 操作（**非创建者** / 其他身份） | 实测返回 | 含义 |
|----------------------------------|----------|------|
| 按 `_id` 读 | **静默空集 `{data: []}`**（**无 `code` / `message`**） | 读不到 ≠ 不存在；**空集不代表数据缺失** |
| update | **静默 `{updated: 0}`** | 越权写**不报错**，只影响 0 行 |
| delete（**他人**创建的文档） | **静默 `{deleted: 0}`** | 同上 |
| delete（**自己**创建的文档） | **`{deleted: 1}`** | **创建者＝本人时正常生效** |

- **创建者口径**：创建者对自己创建的文档**可读写**；对他人文档**读写均静默失败**。
- **静默语义（关键）**：`med_*` 的越权**不产生 `DATABASE_PERMISSION_DENIED`**，只返回「0 行受影响 / 空集」——**不得**用「没报错＝成功」「空集＝数据不存在」作判据（与 R31-② 同）。

### R28-② `app_settings` ＝「所有身份可读 + 非属主写**不报错**」（**R40-⑧ 更正，v4.9，2026-09-24**）

> **⚠ 本小节已按 R40-⑧ 更正**：v4.4 原文的「**非创建者写被显式拒（同值更新与新建均 `DATABASE_PERMISSION_DENIED`）**」**与实测相反，一律作废**——本批（Neng-17）**未再复现** `DATABASE_PERMISSION_DENIED` 形态。下表为**实测口径**，旧值保留在「旧表述（作废）」列供追溯。

| 操作（**非属主**身份） | **实测返回（v4.9 口径）** | 旧表述（**作废**） | 含义 |
|------|----------|----------|------|
| 读 | **可读**（所有身份） | 同（不变） | 读权限放开 |
| update（**既有文档**，含**写入与原值相同的值**） | **静默 `{updated: 0}`**（**普通对象、全程无 `code` / `message`**）；**文档体 sha256 与 `updated_at` 前后一致 ⇒ 未生效**（实测 `requestId 19a4f236da0e08` / `048fa11b06d8d`） | ~~`DATABASE_PERMISSION_DENIED`（「与值是否变化无关」）~~ | 写**不生效且不报错**——`updated:0` 三义同形中的「**无权写（静默拒绝）**」（R40-②） |
| `add`（**新建文档**） | **成功**（实测 `requestId 82410668e37ab`；**即时删除复核 `deleted: 1`、总数 15→16→15**） | ~~`DATABASE_PERMISSION_DENIED`（「连新建也被拒」）~~ | **非属主可新建**——「连新建都拒」的旧表述**作废** |

- **先例意义（R29 的直接依据，按本批实测重写）**：`app_settings` 仍是「**读得到、越权写不报错**」的既有先例——非属主 update 既有文档**静默不生效**（`{updated:0}`、无错误码），管理员**会以为保存成功而实际没写**。⇒ **验收前置仍保留**：凡依赖其写入的验收**必须在管理员会话下进行**（见 `med_tracks` 权限小节的验收前置）——**但依据由「会被显式拒绝」改为「越权写会静默失效」**；**不得**再用「没报错」判通过。
- **与 R40 的关系**：本小节的更正与 **R40-⑧** 同批落盘；`updated:0` 的**三义同形**与**含对象数组载荷下的非确定**见 **R40-②③**；**update 是否算成功的判据**见 **R40-④（反向纪律）** / **R40-⑤（有条件例外）**。

### R28-③ 匿名会话 ＝「纯匿名身份，换 profile 即换身份」（旧称 `dev_login`，**R36-① 更正**）

> **术语更正（R36-①）**：旧文档把该会话称作 `dev_login` 会话；**代码内并不存在 `?dev_login=1` 这类登录入口**（全仓检索零命中）⇒ **`dev_login` 只是该匿名会话的旧称谓，不是入口名**。本节记录的**行为**（纯匿名、换 profile 即换身份）有效，**「通过 `?dev_login=1` 进后台」的表述作废**。

- 身份形态：`groups: [{ id: 'anonymous' }]`，**无 `phone`、无角色**。
- uid **绑定浏览器 profile 的 `device_id`** ⇒ **换 profile ＝ 换 uid ＝ 换身份**。
- **推论（影响验收与结论可比性）**：**每轮开工的新 profile 都是新匿名 uid**，因此
  1. 看不到上一轮写入的数据——**静默空集**（R28-①），不是数据消失；
  2. **跨会话持久化在 dev 匿名会话下不可验**；
  3. 每轮开工计数（如 `0/0/0`）**只是本会话基线**，**不得**与上一轮跨会话对比、更**不得**据此判定数据丢失或被清库。

### R28-④ 由此作废的旧假设

> ❌ **旧假设（已作废）**：「每轮开工 `0/0/0` ＝ 外部清库 / 并发写者介入」。
> ✅ **替代解释（R28-①③）**：`med_*` **仅创建者可读写**（非创建者读得**静默空集**）＋ **匿名会话**（旧称 `dev_login`，R36-① 更正）**每 profile 换匿名 uid** —— 两因叠加即可完整解释「换一轮就看不到数据」。
> **该假设不得再作为结论引用**（登记见附录 A.2 / A29）。

### R28 → R29 / R30 的传导关系（必读）

1. **收紧权限不能单独做**（R29）：在匿名会话下把 `med_*` 改成「仅管理员可写」，越权写只会**静默返回 `updated:0`**（无错误），管理员会**以为保存成功而实际没写**——必须先解决后台身份模型。三方案见**附录 B.7 待人工拍板项**。
2. **D6 只读云函数是硬前置**（R30）：端侧在「仅创建者可读」下**读不到** `med_tracks` / `med_section_audios`（静默空集），因此 D6 是第二批**执行顺序的第二个环节**、不是可选优化，见 §7。

### R36 后台质检入口现状（**实测查实 2026-09-24；直接影响后续所有 UI 类验收**）

> **本节是「怎么进后台做质检」的唯一事实记录**。查实手段＝**全仓代码检索 ＋ 门禁代码定位 ＋ 实测复现**；**可复现配方已实测复现并回填（**R36-⑥** / **R36-⑦**）**——⇒ 本节**既证明「代码里有什么」，也证明「环境里能不能进」（已实测可进，见 ⑥ / ⑦）**。原句「**可复现配方正在实测（R37 待回填）⇒ 本节只证明代码里有什么**」**作废**。

| # | 已查实的事实 | 依据（文件 / 检索） |
|---|--------------|---------------------|
| ① | **代码内没有 `?dev_login=1` 这类 dev 登录入口** | **全仓检索 `dev_login` 在代码（`*.js` / `*.jsx` / `*.mjs`）中零命中**（仅历史文档出现过该称谓）⇒ **「用 `?dev_login=1` 进后台」的旧表述一律作废**，**不得再作为质检步骤或判据引用** |
| ② | **后台门禁＝会话 ＋ 角色标签（两条都要）** | `apps/web/src/pages/Partner.jsx` 的 `adminAuthorized`：要求 `liwu_auth_session` 会话（key 常量＝`packages/auth/src/constants.js` 的 `SESSION_KEY = 'liwu_auth_session'`；会话模块＝`packages/auth/src/session.js`）**且**用户带【**超级管理员**】或【**管理员**】标签 |
| ③ | **`requestPhoneOtp` / `verifyPhoneOtp` 存在但全仓无 UI 调用** | `apps/web/src/admin/services/cloudbase.js` 定义了两个 OTP 方法，**没有任何页面 / 组件调用** ⇒ **后台当前无登录入口**——注意措辞：不是「入口被隐藏」，而是**未接线** |
| ④ | **OTP 为 mock 固定码** | `packages/auth/src/phone-otp.js`（用 `MOCK_OTP_CODE`，定义于 `packages/auth/src/constants.js`）＝ **`'1234'`**，**非真实短信** ⇒ **不得当成可用的登录路径**，也不得据此认为「后台能自助登录」 |
| ⑤ | **系统超管手机号常量** | `apps/web/src/admin/services/database.js`：`SUPER_ADMIN_PHONE = '16601061656'`——仅作为**常量事实**登记，**不构成可登录凭据**（登录入口见 ③） |
| ⑥ | **可复现配方：状态＝「已实测复现」（取代原「待回填」）** | **Neng 于 2026-09-24 在 3 个全新浏览器 profile 上实测复现**（无需登录、无需种子 localStorage）；配方全文＝下 **R36-⑦**。查实手段因此由「代码检索」升级为「**代码检索 ＋ 实测复现**」⇒ **旧句「可复现配方正在实测（R37 待回填）」作废** |
| ⑦ | **入台配方（唯一入台路径，6 步；实测 ≈t+15s 生效）** | 见下方「**R36-⑦ 质检入台配方**」块。**判据**：`/uid=102/` 为真 ⇒ 环境可达；**t ≤ 10s 采样**必得门户页文本（＝**采样过早**，不是权限拦截） |

- **验收纪律（硬，本批起生效；已按 R36-⑦ 放宽）**：UI 类用例**必须按 R36-⑦ 配方执行、并在轮询到 `/uid=102/` 为真之后才能判定**。**未按配方执行**而得到「未登录」或菜单缺失时，**一律标「环境伪失败（采样过早）」并重跑**——**不得**标「通过」、也**不得**标「失败」（原「一律标环境不可达、不得判 PASS/FAIL」的绝对口径**已被本句取代**）。**只有按配方执行且 `/uid=102/` 为真之后**，UI 类用例才**按实际结果判 PASS / FAIL**（此时若仍失败，才是**真实缺陷**）。
- **判据落法**：凡结论依赖「打开 `/partner` → 进入冥想 tab → 操作界面」的用例，**先按 R36-⑦ 执行并留下环境可达性证据**（`/uid=102/` 命中的采样时间 ＋ 「切换身份」后 nav 是否出现「冥想」），**再**判业务结论；**未取到 `/uid=102/` 证据时，业务判据留空并标「环境伪失败（采样过早）」**。
- **R36-⑦ 质检入台配方（**已实测复现 2026-09-24（Neng，3 个全新 profile）；本批回填正文**）**——**这是唯一入台步骤**，按此执行方可判 UI 类用例：
  1. **headless Chrome 必须带反节流三参**：`--disable-background-timer-throttling` / `--disable-backgrounding-occluded-windows` / `--disable-renderer-backgrounding`（缺任一参会把应用自身的 10s 超时推迟到 38s，制造环境伪失败）；
  2. navigate **`http://localhost:5175/partner`**——**不加任何参数**（`?dev_login=1` 在代码内**零命中、完全无效**，见 ①；实测加参**零命中**）；
  3. **必须轮询页面文本 `/uid=102/` 为真再往下走**（实测 ≈ **t+15s**）；**t ≤ 10s 时页面仍是门户页**、文本为「当前尚未登录…需分配【管理员】标签」——**该文本与「权限不足」一模一样**，此时采样**必得伪失败**；
  4. 点 `button[aria-label="切换身份"]` → 在 **188px 容器**里点「**管理员**」卡；
  5. 点 nav「**冥想**」；
  6. 点「**冥想轨道**」（**懒加载，等 10s**）。
  **无需登录、无需种子 localStorage**（`liwu_auth_session` 保持 `null` 也可）。**入台后拿到的是稳定 dev 身份 `uid=102`**（带 超级管理员 / 管理员 / 代理商 标签）。
- **与 R28-③ 的关系（不矛盾，且本批澄清）**：R28-③ 实测的是**未切换身份时**的匿名会话语义（uid 绑定浏览器 profile 的 `device_id`、换 profile 即换身份）；R36-⑦ 的配方**经页面内「切换身份」入口（免登录）落到稳定 dev 身份 `uid=102`**，**3 个全新 profile 均如此**。⇒ 两条并列成立；**范围界定**：**经 R36-⑦ 配方以 `uid=102` 创建的数据可被后续轮次（同配方）自行删除**（删除自己创建的文档返回 `{deleted:1}`）；而**历轮匿名会话创建的数据仍不可删** ⇒ 清理仍按 **R38-②③**（服务端凭据 ＋ 人工确认清单）。
- **历史记录处理**：版本变更表与各版「依据」段中出现的 `dev_login` 称谓**保留原样**（历史记录不改写）；**正文、判据与操作步骤中一律按本节口径表述**（需要提旧名时就写「旧称 `dev_login`，R36-① 更正」）。

### R37 第一批验收结果与口径更正（**2026-09-24 实测**）

> **本节记录 R37 的三条新事实**：R34-③ 的样本时长口径更正、`med_tracks` 口径矛盾清除（C7 关闭）、第一批 UI 点击路径验收通过。

| # | 事实 | 证据 / 影响 |
|---|------|-------------|
| ① | **实测样本的实际时长 ≈61.2s（不是名义 60s）** | `ffprobe` 实测 **61.2035s / 61.200s**（两个真实 `MediaRecorder` 样本）；**300s 样本为精确 300.0s**。⇒ **复核体积 / 码率前必须先测输入实际时长**：用名义 60s 反推得 **≈49.6kbps** 的**假偏差**（正确 48.65kbps），**不得据此判失败**（R34-③ ＋ 附录 A.2 / **A35**） |
| ② | **`med_tracks` 已建**（2026-09-24）⇒ **落库类验收无阻塞项** | 证据链＝`res.code` **无 `code` / `message`** ＋ `med_section_raws` **正对照同形** ＋ `add` 成功（排除假否定）＋ **两轮端到端写入 / 读回 / 删除成功**（R7 g/h 数据层与 UI 层均通过）＋ 测试文档已删 ⇒ **附录 C / C7 关闭**；旧「未创建 ⇒ 标阻塞」口径作废（附录 A.2 / **A34**） |
| ③ | **Track 配置 UI 点击路径已实测通过** | 空态「初始化默认 Track」→ 编辑态（六章模板 300/30/130/150/270/30、留白 141×5、末章无留白输入、章序不可操作、估算自洽）→「保存 Track」→ `version` 1→2、`chapters=6`、刷新保持、二次保存同 `_id` 且 `version` 2→3；测试文档已删。详见 §3.7 |

> **与 R36 的关系（必读；本批已改口径）**：R36 原「**UI 类验收一律标「环境不可达」**」纪律针对的是**「可复现配方尚未回填」**的状态，**该前提已解除**——**配方已实测复现并回填＝R36-⑦**（状态见 R36-⑥）。⇒ **自本批起，该纪律放宽为**：UI 类用例**先按 R36-⑦ 执行、并轮询 `/uid=102/` 为真，再判业务结论**；**未按配方执行**而得到「未登录」或菜单缺失 ⇒ **一律标「环境伪失败（采样过早）」并重跑，不得标 PASS / FAIL**。R37-③ 的第一批 UI 点击路径验收**正是按该同路径**取得的 ⇒ 记「**通过（R37-③ 同路径）**」；**不得**据 R37-③ 把**未执行过**的 UI 用例改标「通过」。

### R38 dev 环境真实事实与新增缺陷（**2026-09-24 实测查实**）

#### R38-① 删除路径**静默假成功**（新缺陷；**已实现（Kong）、质检 PASS（Neng-16，2026-09-24）**）

- **缺陷（实测）**：底层 `doc(id).remove()` 在**无影响行**时返回 **`{"deleted": 0}`** ——**是普通对象、不带 `code` / `message`**；旧 `assertCloudBaseWriteResult` 只判 `code` / `message` 有无错误 ⇒ **放过**，于是 `deleteMedTrack`（及同形删除路径）**向 UI 报成功而文档实际仍在**。**已在非 owner 身份实测复现**（删除后复查文档仍在）。
- **处置＝删除影响条数断言 ＋ 全库覆盖全部 `.remove()` 调用点（**状态＝已实现（Kong）、质检 PASS（Neng-16，2026-09-24）**；需求编号 **D-B2-12**）**：实测 `apps/web/src/admin/services/database.js` 共 **15** 处调用点＝**11 处直接严格断言 ＋ 4 处 `removeDocBestEffort`**，逐条落点如下（**行号级，本批逐项复核**）：
  - **断言实现与注释**：`assertCloudBaseDeleteResult` 定义在 **`database.js:425`**；**反向纪律注释**在同文件 **`database.js:387-392`**（口径原文：「**delete 断计数，update 不断计数**」，对应 **D-B2-14**；**D-B2-12** 为删除断言本身的编号）。
  - **① 主目标文档 —— 6 处直接严格断言（`deleted: 0` 必抛，不得 `allowZero`）**：
    | 调用方 | `.remove()` 调用行 | 断言行 | 目标集合 | 中文对象名 |
    |--------|-------------------|--------|----------|------------|
    | `deleteUser` | **L4224** | **L4223** | `users.doc(id)` | 用户 |
    | `deleteCategory` | **L4633** | **L4632** | `tagCategories.doc(id)` | 分类 |
    | `deleteTag` | **L4698** | **L4697** | `tags.doc(id)` | 标签 |
    | `deleteMedParagraph` | **L5469** | **L5468** | `med_paragraphs.doc(id)` | （冥想段落） |
    | `deleteMedSectionAudio` | **L5912** | **L5911** | `med_section_audios.doc(id)` | （段音频） |
    | `deleteMedTrack` | **L5994** | **L5993** | `med_tracks.doc(id)` | 冥想轨道 |
  - **② 级联 `where(...).remove()` —— 5 处带 `allowZero`**（**L2376 / L2377** 商品 SKU 全量重建、**L4217 / L4218** 用户标签关联、**L4691 / L4692** 标签分配关联、**L4763 / L4764** 幂等终态、**L4778 / L4779** 全量重设标签）：匹配 **0 行＝关联本不存在、已是期望终态**，**不是失败**（故允许 0）。
  - **③ 后台自动修复路径 —— 4 处 `removeDocBestEffort`**（实现 **`database.js:452`**；**L1820** 冗余品牌成员关联、**L1839** 冗余品牌、**L4390** 历史遗留商品分类、**L4474** 历史品牌成员标签关联）：**保持「不抛出」，但不再是静默放过**——**见 R38-④ / D-B2-16**。
  - **`allowZero` 与「读不出条数」的口径（硬）**：`allowZero` **仅**限「删主对象时顺带删关联行」的**级联清理**（匹配 0 行＝合法业务态）；**主目标文档的删除一律不得用 `allowZero`**。**而「影响条数读不出（`deleted` 非有限数）」在任何情形都硬失败**（读不出条数就无法断言是否生效）。
  - **断言文案（逐字）**：`…删除失败：影响条数为 0（文档不存在或无权删除）`；级联与自动修复路径带 `entityLabel`（如「商品 SKU」「用户标签关联」「冥想轨道」）。
  - **复核证据（v4.7 桩测 ＋ v4.8 质检，两轮）**：**质检（Neng-16，真实 CloudBase 往返、带 requestId）＝三条实测全过**——① 删不存在 id ⇒ `{deleted:0, requestId:71e425366701d8}` **抛出**「冥想轨道删除失败：影响条数为 0（文档不存在或无权删除）」；② 自建文档 ⇒ `{deleted:1, requestId:a884e06fd4c59}` 成功返回 id、复读 `data:[]` **确已删**、再删同一 id **复抛同文案**（**计数语义真实**）；③ **反向反证**＝`updateMedTrack` 在 `{updated:0, upsertedId:null, requestId:81420156b9f2b8}` 下**不抛**（**未**被误加影响条数断言）；静态 **15/15 处置分类全对**（11 直接严格断言 ＋ 4 处 `removeDocBestEffort`；级联 5 处 `allowZero`；主目标 6 处不得 `allowZero`）；清理完毕（`med_tracks` 回到 **0** 条）。**桩测（v4.7 复核）**：桩测 **27 PASS / 0 FAIL**——含**反向反证**：`updateMedTrack` / `updateMedParagraph` 在 **`{updated: 0}`** 下**不抛**（证明 update 侧**未被**误加影响条数断言）；`npm run lint` **127 problems（117 errors / 10 warnings）**，**未上升**（与 R35-⑥ 的 127 同值）。
- **反向纪律（硬，同 §4 写入结果校验硬口径；**D-B2-14**）**：**update 路径不得用 `updated >= 1` 作成功条件**——**依据已由 R40-④ 改写**：`updated:0` **三义同形**（值本来相同 ／ **无权写静默** ／ 文档不存在）**＋** 含对象数组字段的载荷上 `updated` **非确定**（同一 payload 连写三次实测 `0,0,1` / `1,0,0`）⇒ **它既不是成功证据、也不是失败证据**。**旧依据（「R28 已证同值 update 也返回 `updated:0`」）系对 R28 权限观察的误读、作废**（附录 A.2 / **A39**）。**有条件例外（R40-⑤）**：**仅**载荷必然含易变字段的 **8 处**路径，`updated < 1` 且无 `code` 可作「本次写入未生效」**强信号**处理（**须附带读回比对**；文案不得声称「无权限」）。

#### R38-② dev 后台是**直写真实 CloudBase 环境**（影响所有后续质检与清理）

| # | 事实 | 依据 |
|---|------|------|
| ① | 本地 dev 后台的 `/api/cloudbase-proxy` 经 `apps/web/vite.config.js` → `scripts/dev-cloudbase-proxy.mjs`（**:3020**）→ **真实 CloudBase 环境 `liwu-d8gek6jjdab1d087c`** | 代理脚本与 vite 配置查实 |
| ② | **`CLOUDBASE_ADMIN_API_KEY` 实测未配置** ⇒ 写入**以调用者匿名 `_openid` 落到真实云端**（**不是**本地 mock、不是沙箱库） | 同上；与 R28-①「仅创建者可读写」叠加 |
| ③ | **后果：换浏览器 profile 就既看不见也删不掉前几轮的 dev 数据** | 实测：新 profile 读 `med_tracks` = **0**、`deleteMedTrack` **表面成功**但 `deleted: 0`、owner profile 复读**文档仍在** |
| ④ | **待办**：**只读盘点（服务端凭据）已在做**；**删除须人工确认清单后执行**（不得由 dev 会话自行清库） | R38-③②；与 R31-①「跨会话不可验」一致 |

> **推论（纪律）**：① 任何在 dev 后台做的写入**都会真实落库** ⇒ 质检建数须**最小化**、并**优先走可自行删除的身份**；② **不得**把「新 profile 看不到数据」判成「数据已清 / 不存在」（R31-①）；③ 清理 dev 数据**不得**在匿名 dev 会话里尝试（必然 `deleted: 0`），须走**服务端凭据 ＋ 人工确认清单**（**删除未获人工确认前不得执行**，R38-③②）。

#### R38-③ 新增挂账（三条，正文落附录 C）

1. **预估口径待用户拍板**（**C14**）：默认种子 Track 的 UI 预估 **26:55** vs 基准 **15:00**（**+79%**）——根因是预估用**章时长上限之和 910s**，而非**按字数预算的实际朗读时长**。
2. **dev 身份 / 环境治理待用户拍板**（**C15**）：三选一——**固定 dev 身份** / **本地可清空库** / **读路径也注 admin 凭据**。
3. **队列首轮领取前权威键缺省**（排队方只写镜像键 `attempt_count`）——**已在 C13 登记，保持**。

#### R38-④ 后台自动修复（reconcile）路径的删除：**保持「不抛出」**（**D-B2-16，Zang 裁定 2026-09-24**）

- **裁定对象＝4 处 `removeDocBestEffort` 调用点**（`apps/web/src/admin/services/database.js` **L1820 / L1839 / L4390 / L4474**；helper 实现在同文件 **L452**）——四者都是**「读到脏数据后由读路径自动触发」的修复步骤**（冗余品牌成员关联 / 冗余品牌 / 历史遗留商品分类 / 历史品牌成员标签关联），**不是用户点击触发的删除**。
- **裁定（硬）**：**这 4 处的删除保持「不抛出」**——理由：它们由**读到脏数据自动触发**，**抛出会中断同一轮后续修复步骤**，把「自动修复」变成**显式失败**。
- **但绝不是「静默放过」——与 R38-① 的分界线（逐条）**：
  - **断言照接**：仍经 `assertCloudBaseDeleteResult`，**不再静默放过 `deleted: 0`**（**旧写法 `.catch(() => {})` 连日志都没有，已作废**）；
  - **失败降级为显式 `console.error`**（文案含「后台清理未生效（自动修复路径，不阻断后续步骤）」）；
  - **用户点击触发的删除一律严格断言**——抛到调用方、**UI 可见**（见 R38-① 与 §4；UI 落点＝`apps/web/src/admin/components/Dashboard/MeditationPage.jsx:3545`）。
- **改动边界（硬）**：**未达到「自动修复也硬失败」的需求时必须另立裁定**——**不得**由实现方自行把 `removeDocBestEffort` 改成抛出（那会**静默**改变自动修复的中断语义）。代码内已就此写下反向纪律注释（`database.js:448-451`：断言照接 / 不中断后续修复 / **用户触发的删除不得走这里**）。

### R39 D6 只读云函数读契约（**已实现（Kong）、待质检确认**）

> **本节把实现方（Kong）的 12 条假设升格为口径**。v4.3 及以前，规范对 D6 只写到「照 `getUserPhone` / `getHomePageData` 模式新增只读云函数」，**未定义入参 / 出参契约**，实现方只好自定并在报告中列为 12 条假设；**函数现已实现**（`cloudfunctions/meditation-read/`）⇒ **本节取代原「D6 契约未定义」状态**（旧状态登记作废，见附录 A.2 / **A38**）。
> **状态词（R22）＝「已实现（Kong）、待质检确认」**；下列 ①~⑫ 逐条**均为口径**，质检按其判定（不得再按「契约未定义、由实现方自定」判差异）。**Zang 独立复核证据**：自测 **124/124 PASS**、零写路径静态 grep **零命中**、`npx eslint cloudfunctions/meditation-read` **0 problem**、共 **1219 行**（`index.js` 442 ＋ `lib/*` 777）、只依赖 `@cloudbase/node-sdk` ＋ `./lib/*`。

- **① 函数名与位置（取代原「只写『照既有模式新增』、未定函数名与规格」）**：`cloudfunctions/meditation-read/`（入口 `index.js` ＋ `lib/read-contract.js` / `lib/meditation-formats.js` / `lib/meditation-track-template.js` / `lib/meditation-track-normalizers.js`）。**已在仓库根 `cloudbaserc.json` 登记**：`timeout 30` / `memorySize 128` / `runtime Nodejs18.15`、**无定时触发器**（对照：`meditation-transcoder` 为 60 / 256 / 带小时级 timer）。部署命令见 `cloudfunctions/README.md`。
- **② action 集（3 个）——取代原「未定义 action 集」**：
  - **`getTrack`（缺省 action）**：`event.action` 为 `undefined` / `null` / `''` 一律视为缺省；Track **定位顺序＝显式 `track_id` → 显式 `track_key` → `is_default` → 业务键 `track-default`**（逐级回退、命中即止）。
  - **`getSectionAudios`**：**必填** `section_types`（数组）**或** `section_type`（单个）；按六章模板顺序归一，数量上限＝模板 Section 总数。
  - **`listTracks`**：**只列 `enabled !== false` 的 Track**（被排除数如实回报 `stats.excluded_disabled_count`）；**不签发任何链接、不读音频集合**（只给 Track 列表 ＋ 章模板）。
  - **未知 action，或 action 非字符串 ⇒ `INVALID_ACTION`**（**不做隐式转换**；`details.allowed_actions` 给出合法集）。
- **③ 出参形状——取代原「未定义出参形状」**：成功 `{ ok: true, data: {...}, meta: {...} }`；失败 `{ ok: false, error: '<CODE>', message: '...', details?: {...} }`。**错误码至少含** `READ_FAILED` / `INVALID_ACTION` / `TRACK_NOT_FOUND` / `TRACK_DISABLED`（另有 `INVALID_EVENT` / `INVALID_PARAMS`；调用方**按 `error` 分支，不解析 `message`**，堆栈只入日志不下发）。
  - **CloudBase 以 resolve 返回 `{code, message}`（含权限静默空集）一律当错抛、由最外层收敛为 `READ_FAILED`**：读路径**同样**必须显式校验返回体（与 **R7** 同一纪律）——**不把「没报错」当「读到了」**；**也不返回部分数据当成功**（任一 `section_type` 查询失败 / 批次签发整体失败 / 任一未捕获异常 ⇒ **整单报错**）。
- **④ 可下发（可交付）判据——取代原「未定下发判据」**：
  - `transcoded_formats` **同时含 `opus` 与 `mp3`** 且**二者 `file_id` 齐备**才可下发（mp3 侧读 `fallback_file_id`，兼容历史 `mp3_file_id`）；对齐 **D3**（只 `['opus']` ＝ **未完成交付**）。
  - **`transcode_status ∈ {queued, processing, failed}` 一律不下发**。
  - **`idle` / 空状态但格式与 `file_id` 齐备的历史文档仍下发**——否则第一批历史音频在端侧**不可播**。
  - 不可下发项按 `stats.excluded` **逐条分类计数**：`incomplete_transcode` / `transcode_failed` / `transcode_in_progress` / `missing_file_id` / `signing_failed`——**不静默丢弃**。`stale` **不阻断**（规范：stale 仅提示、不阻断），也不下发（数据最小化）。
- **⑤ 临时 URL 现签——取代原「未定临时 URL 口径」**：
  - 唯一对外调用＝`getTempFileURL`，**去重后一次批量签发**，`maxAge = 7200`（对齐 **C11**）；只为**判定可交付**的音频签发。
  - **绝不透传落库的 `audio_url`**（上一轮签发的可能早已过期）；`url_policy = { max_age_seconds, issued_at, expires_at, reissue: 'call_again' }`。
  - **长期（服务端层面）可用的存储标识只有 `file_id`**，**但响应不下发 `file_id`**（端侧**不需持有** `file_id`，重签一律**再调本函数**）；端侧做候选固化（**D7**）用的标识是音频记录 `_id`。
  - **部分签发失败 ⇒ 该条剔除并计数**（`signing_failed`；**半条音频不得下发**）；**全部失败 ⇒ 整单 `READ_FAILED`**。
- **⑥ 字段白名单（数据最小化）——取代原「未定下发字段」**：下发**以白名单为准**，白名单之外一律不下发。**明列不得下发的 15 项**：`file_id` / `fallback_file_id` / `mp3_file_id` / `audio_url` / `fallback_audio_url` / `mp3_url` / `recorded_by` / `text_snapshot` / `paragraph_ids_snapshot` / `original_file_id` / `transcode_error` / `created_by` / `updated_by` / `char_count` / `stale`。
  - **Track 下发**：`_id` / `track_key` / `name` / `description` / `enabled` / `is_default` / `version` / `total_target_seconds` / `chapters[]` / `background_track` / `voice_track`。
  - **音频条目下发**：`_id` / `section_type` / `section_raw_id` / `label` / `duration` / `transcoded_formats` / `formats[]`（`format` / `url` / `mime_type` / `is_fallback`）。
- **⑦ 章序与启用态——取代原「未定章序口径」**：返回的 Track 一律**折回六章固定模板**（`chapters` **恒 6 项**、末章 `gap_after_seconds` **恒 0**；章名 / Section 名取自**代码常量副本**）——对齐 **R10**（章序只读、脏文档折回模板）。`getTrack` **默认只下发「启用章」覆盖的 `section_type`**（**禁用章不查、不下发**）；`getSectionAudios` **不查 Track 启用态**（定位为**定向取 / 重签接口**，不承担「是否对外可用」判断；不外泄「Track 是否存在」）。三个 action 均额外返回 `chapter_template`（六章模板原文，供端侧拼接参考）。
- **⑧ 不抽签、不写会话——取代原「未定函数职责边界」**：只返回**按 `section_type` 分组的候选池**——**抽签在端侧**、抽中固化**写入端侧会话记录**（对齐 **D7 / D9**）；本函数**不抽签、不写任何集合**（**零写路径**）。唯一口径源是 **`med_section_audios`**，**不读 `med_section_raws` 的 `file_id` / `audio_url`**（对齐 **D8**）。
- **⑨ 候选上限（自定常量，现为口径）——取代原「未定上限」**：单 `section_type` **查询 50 条**（`MAX_QUERY_PER_SECTION_TYPE`）、**下发最多 10 条**（`MAX_CANDIDATES_PER_SECTION_TYPE`；端侧只抽一条）；`listTracks` 最多 **20** 条（`MAX_TRACKS_PER_REQUEST`）；截断情况在 `stats.truncated_section_types` **如实回报**（不假装全量）。
- **⑩ 本函数不做端侧身份校验（现为口径，非疏漏）——取代原「未定鉴权口径」**：本函数**只读**，且只下发「**启用 Track ＋ 交付齐备**」的播放数据，因此本轮**不要求端侧身份**（`med_*` 对匿名**保持关闭**，本函数用 **SCF 内置凭证**读取）。若要收紧到「**仅登录用户**」**需另裁定**——**并入 C15 / X9**（身份模型与权限收紧同批），**实现方不得自裁加鉴权**。
- **⑪ 端侧缓存建议（规范未给值，现为口径）——取代原「未给缓存口径」**：端侧缓存 **≤ `max_age_seconds` 的一半（≈1 小时）**，或直接按 `url_policy.expires_at` 判陈旧；**过期 / `onerror` 时同参重调本函数**（端侧**不需持有 `file_id`**）；播放按 `formats[]` 顺序尝试（`opus` → `mp3`，保留 `onerror` 运行时降级，对齐 **D3**；小程序无 `canPlayType`，直接取 mp3）。端侧**永不直连 DB 读 `med_*`**（§5 / R30）。
- **⑫ 部署前提与同步责任——取代原「未定部署前提」**：**SCF 内置凭证**（**不硬编码任何密钥**；环境变量回退链与既有 worker / 执行器一致，仅记录「是否提供密钥」的布尔值，**不打印密钥**）；`lib/*.js` 为**权威源**（`packages/shared-utils/meditation-*.js`）的**精简等价副本**，各自头部注明权威源与同步责任（对齐 **D-B2-8**）；**只读硬约束**＝全函数**零写路径**（不 `update` / `add` / `remove` / `set`），**唯一对外调用＝`getTempFileURL`**。本地无真实联调环境（集合暂无 Track 文档）时 Track 类请求可能返回 **`TRACK_NOT_FOUND`（空集，属预期）**——**`med_tracks` 已创建、C7 已关闭，不得再写「未创建 / 标阻塞」**；音频池仍可单独用 `getSectionAudios` 验证。

> **旧状态作废**：附录 A.2 / **A38** 登记「D6 契约未定义」作废。**自 v4.8 起，凡涉及 D6 入参 / 出参 / 可交付判据 / 临时 URL / 字段白名单 / 候选上限 / 职责边界 / 鉴权 / 端侧缓存的判定，一律以本节 R39 ①~⑫ 为准**；§5、§7 与「`med_tracks` 权限建议」中的 D6 引用同步指向本节。

### R40 `updated` 语义与写入成功判据（**2026-09-24 实测裁定；含 D-B2-14 改写**）

> **依据**＝**Neng-17 真实验（真实 CloudBase 往返、带 `requestId`）＋ Zang 裁定**。**本节是 `updated` 语义与「写入是否生效」判据的唯一口径源**，**取代**此前关于 `updated` 的一切推论式表述（散见于 R28-① / R28-②、R38-① 反向纪律与 §4 写入结果校验硬口径）。**本节不改动任何已裁参数、不新增挂账 / D-B2 编号**（**D-B2-14 依据改写、编号不变**；有条件例外所用断言的**建议名**＝`assertCloudBaseUpdateTookEffect`）。

- **R40-①（`updated` 的真实语义）**：`updated` 计的是「**内容真正发生变化的文档数**」，**不是命中行数**。实测：**真改值 → `1`**；**纯值同值写回 → `0`**；**`where` 命中 2 条同值 → `0`、真改 → `2`**。
- **R40-②（`updated:0` 三义同形）**：`updated: 0` 是**普通对象、不带 `code` / `message`**，下列三种情形**同形、返回体不可区分**：① **值本来相同**（幂等 no-op）；② **无权写（静默拒绝）**（R28-①）；③ **文档不存在**。⇒ **`updated:0` 既不是成功证据、也不是失败证据**；**不得**单独用作「无权限」证据（**R31-② 不变**）。
- **R40-③（含对象数组字段的载荷上 `updated` 非确定 —— 已知实测事实）**：载荷含**对象数组**字段时 `updated` **不确定**：同一 payload **连写三次**实测 **`0, 0, 1`**（`id 2d28a687fe20b8` / `8357ac503ca828` / `fbb197ce64c288`）与 **`1, 0, 0`**（`c108e828eed148` / `a0e6253167f67` / `543c320bdc64b`）；**反向 no-op 亦实测报 `1`**（`cf2`：`61c6ded59bb9a8` / `bfed7d9285dd3` / `eba78cff5e08d8`）。且**对象数组子文档读回时键序被改写为字典序**——写序 `chapter_key, order, max_duration_seconds, gap_after_seconds, enabled, section_types` ⇒ 读序 `chapter_key, enabled, gap_after_seconds, max_duration_seconds, order, section_types`。⇒ **读回比对必须与键序无关**（见 R40-⑤）。
- **R40-④（反向纪律 —— 保留，依据改写；D-B2-14）**：**update 路径不得用 `updated >= 1` 作成功条件**（**结论保留、不变**）。**依据（改写后）＝ R40-②（三义同形）＋ R40-③（含对象数组载荷非确定）**——**不是**原 R28「非创建者写返回静默 `{updated:0}`」的**权限观察**（**该旧依据系误读：把「非创建者写静默」读成「同值也返回 0」**，见 R40-⑦ / 附录 A.2 / **A39**）。update 的成功判据仍**只看** `code` / `message` 有无错误与**读回的文档内容**；**对称关系**＝**delete 断计数，update 不断计数**（`database.js:387-392`；该注释按 R40 同步重写）。
- **R40-⑤（有条件例外 —— 仅限「载荷必然含易变字段」的路径，硬）**：**仅当载荷必然含易变字段**（`updated_at: new Date()` / `version + 1`）时，`updated < 1` **且无 `code`** 可当作「**本次写入未生效**」的**强信号**处理（实测依据见 R40-⑥）。**处理规则（逐条，不得简化）**：
  1. `updated >= 1` ⇒ **过**（不算异常）；
  2. `updated < 1` **且无 `code`** ⇒ **一次性读回比对**（`Date` 归一为 ISO、**对象 / 数组键序无关**的深比较）：**一致 ⇒ 视为幂等 no-op 成功**；**不一致 ⇒ 抛错**「**{entityLabel}保存失败：未能确认写入生效（未检测到任何变化）（requestId: xxx）**」——**文案不得声称「无权限」**；
  3. **读回失败 ⇒ 抛独立文案、绝不得当成功**。
  - **接入范围（硬）＝仅 8 处**：四个老口径 writer（`saveMeditationAudioLibrary` / `saveMeditationCompositionSettings` / `saveMeditationCalendar` / `saveMeditationLibrary`）＋ 四个 `med_*` updater（`updateMedParagraph` / `updateMedSectionRaw` / `updateMedSectionAudio` / `updateMedTrack`）。**范围外路径一律沿用 R40-④ 的反向纪律**——**不得**把本条扩展为普适判据（**含对象数组载荷的非确定路径不得据此判失败**）。
  - **实现状态**：有界断言（**`assertCloudBaseUpdateTookEffect`**，实现于 **`database.js:516`**、抛错文案 **`:569`**、**8 个调用点**）＋ `database.js:387-392` 的 D-B2-14 注释重写＝**已实现（Kong）、质检 PASS（Neng-20，2026-09-24）**（状态词按 R22：质检通过后改口径）。
  - **实测结论（例外条件经实测成立；Neng-20，2026-09-24，真实 CloudBase 往返、带 `requestId`）**——**这一条是正式结论，两侧都不误判**：
    - **非属主路径 ⇒ 失败可见、静默丢失已闭合**：老四 tab「冥想库」的**静默丢失已闭合**——保存后页面出现**可见提示**（**顶部横幅**、`[role=dialog]=0` 即**无弹窗遮挡**），**逐字**＝「**冥想文库保存失败：未能确认写入生效（未检测到任何变化）（requestId: 2c26a5bfd807a8）**」；**文案不含「无权限」**；**调用栈完整**＝`assertCloudBaseUpdateTookEffect` → `saveMeditationLibrary` → `useDatabase` → UI。**未写入且未污染**：**4 个 `app_settings` 文档的 `_id` / body sha256 / `updated_at` 前后逐项未变**。
    - **属主路径 ⇒ 不被误报**：**静态 8/8 调用点的载荷必然含易变字段**；**动态两例**（真改值 / 同值 ＋ 新 `updated_at`）**均 `updated: 1`** ⇒ **在读回比对之前即返回**（响应窗口内**仅 1 条 POST、零读回 GET**）；**刷新读回确认 `version` 4 → 5**。
    - **清理**：自建文档 `deleted: 1`，`med_tracks` 回 **0** 条。
- **R40-⑥（强信号的实测依据）**：上述路径实测 **8/8 样本恒为 `1`**——同值 `name` ＋ 新 `Date`（`9a1115384c09b`）；**老 writer 形状仿真连写 3 次**（`f742051297af7` / `b0ad9f33b05d3` / `c1e275d99a7158`）。⇒ 「`updated < 1` 且无 `code`」在这类路径上是**强信号**（**须**配合 R40-⑤ 的读回比对使用）。
- **R40-⑦（D-B2-14 结论对、依据错 —— 追溯）**：原依据引的是 **R28「非创建者写返回静默 `{updated:0}`」（权限隔离）**，被误读成「**同值也返回 0**」。**结论（不得用 `updated >= 1` 判成功）不变；依据已按 R40-④ 改写**。⇒ 「同值 `updated:0`」作为**普适命题作废**，改写为**条件性现象（仅无对象数组的普通载荷）＋ 非确定事实（含对象数组载荷）**（附录 A.2 / **A39**）。
- **R40-⑧（`app_settings` 两条更正 —— 与旧表述相反，旧表述一律作废）**：本批实测（Neng-17）**未再复现** `DATABASE_PERMISSION_DENIED`：
  1. **非属主 update `app_settings` 既有文档 ＝ 静默 `{updated:0}`**——**普通对象、全程无 `code` / `message`**；**文档体 sha256 与 `updated_at` 前后一致 ⇒ 未生效**（实测 `requestId 19a4f236da0e08` / `048fa11b06d8d`）——**不是** `DATABASE_PERMISSION_DENIED`；
  2. **非属主 `add` 到 `app_settings` ＝ 成功**（实测 `requestId 82410668e37ab`；**即时删除复核 `deleted:1`、总数 15→16→15**）——**不是**「连新建都拒」。
  ⇒ **旧表述「非创建者写被显式拒（同值更新与新建均 `DATABASE_PERMISSION_DENIED`）」作废**（落点：**R28-②**、B.5 / **R28** 行、`med_tracks` 权限建议表与判据行、§4）。**验收前置仍保留**：依赖其写入的验收**必须在管理员会话下进行**——**依据由「会被显式拒绝」改为「越权写会静默失效」**；**不得**用「没报错」判通过。

> **口径收口**：**自 v4.9 起**，凡涉及「`updated` 计数含义 / update 是否算成功 / 非属主写的可写性 / `app_settings` 写行为」的判定，**一律以本节 R40-①~⑧ 为准**；与本节冲突的旧表述（含 R28-② 原文、A36 原文依据、§4 旧反向纪律依据）**一律作废**，追溯见附录 A.2 / **A39**。

### R41 端侧双轨播放接入口径（**状态词按 R22 分面：共享模块＝已实现（Kong）、质检 PASS（Neng-19，桩面）；App 接入 B1＝已实现（Kong）、质检 PASS（Neng-19，桩面与静态）；B2a＝已实现（Kong）、质检 PASS（Neng-22，2026-09-24，桩面）**）

> **依据**＝**Kong 对 App 与小程序现状的侦察**（双轨骨架已存在，但数据源仍挂在**老规则 A**；**小程序侧完全无音频**）＋ **Zang 已就下列 12 条裁定并派实现**。**本节是端侧（`apps/app` 先、`apps/miniprogram` 后）双轨播放接入的唯一口径源**；旧表述（§5「端侧计划计算」老写法、§3.7 / §6 的「双轨音量 0.33 / 1」硬编码写法、质检计划**旧 X12 判据**）**一律以本节为准**。
> **承载模块与状态（状态词按 R22）**：
> - `packages/shared-utils/meditation-read-client.js`（D6 调用 ＋ 响应校验）＝**已实现（Kong）、质检 PASS（Neng-19，2026-09-24，桩面：独立 50/50 ＋ 反向反证 10/10）**（Zang 复核：**458 行**〔`wc -l` 实测 458〕、桩测 **113 PASS / 0 FAIL**、`npx eslint` **0 problem**、仓库级 lint **126**）。**注（v4.11；v4.12 更新消费方）**：本模块内的 `resolveMeditationUrlPolicyStaleness`（陈旧判定纯函数）是**共享层定义、当前消费方＝App 播放器**（**小程序尚未消费**）；**后台 Track 预览（R43）实现后为其第二消费方** ⇒ 表述「供两端共用」时**必须注明当前仅 App 在用**，**不得**暗示已双端生效，**更不得**写成后台已生效（**R43 状态＝已定口径、待实现**）。
> - `packages/shared-utils/meditation-track-playback-plan.js`（双轨播放计划组装 ＋ 固化载荷）＝**已实现（Kong）、质检 PASS（Neng-19，2026-09-24，桩面：独立 50/50 ＋ 反向反证 10/10）**（Zang 复核：**459 行**〔`wc -l` 实测 459〕、桩测 **113 PASS / 0 FAIL**、`npx eslint` **0 problem**、仓库级 lint **126**）。
> - **App 侧接入（分两面登记，不得聚合成一个状态词）**——`apps/app/src/services/cloudbase.js` ＋ `apps/app/src/modules/meditate/MeditationPlayerScreen.jsx`：
>   - **B1（数据源切换、老代码下线、错误可见不回退）＝已实现（Kong）、质检 PASS（Neng-19，2026-09-24，桩面与静态）**。
>   - **B2a（恢复路径与格式降级）＝已实现（Kong）、质检 PASS（Neng-22，2026-09-24，桩面）**——① **中型（Neng-21 发现 ⇒ 已修复）**：**重签成功后段内回落「计划里的旧签 URL」⇒ 403 ⇒ 段内重调被重入集合挡住 ⇒ 误报「部分音频暂不可播放，已跳过该段并继续本次冥想」并清空该段音频**，而**新签 URL 其实可用**（现实可达：重调会以 `buildMeditationTrackPlaybackPlan` **重新抽签**，新 take 可能短于计划段时长 ⇒ **提前 `onended`** 即触发；根因＝**⑥ 的覆盖表从未被写入**，见 **R42-⑥**）＝**已修复（Kong：先复现红 7/14 → 后验绿 15/15，回归 B2a 26/26 ＋ 上单 51/51，lint 稳 110，`dist` 已重建〔冥想相关 `fileId` 7 处全清、`getAudioTempUrl` 零命中〕）**；② **低＝dist 产物落后（已修复）**：**`dist` 产物逐字节复核**＝以当前源码重建得**同名同字节** `index-Dq9F4L05.js`（sha256 `534467762f41bde129bd09043715f8076056cbf639bf7128d212d2570a4d6360`）⇒ **产物确由含修复的源码构建**，冥想相关 `fileId` **零命中**。**复验（Neng-22，2026-09-24，桩面）＝PASS**（详见 **R42-⑥** 实测状态）。
> - **小程序侧接入＝本批待做**（现状：**完全无音频**）。**未实测项（硬）**：**真实 D6 往返**（`cloudfunctions/meditation-read/` **尚未部署**）与**真机项**（**iOS WKWebView 音量**、**小程序 iOS 直取 mp3**）**一律标「未实测」**——**不得**把桩面 PASS 写成 **X12 / X18 整体 PASS**。
> **测试与桩纪律**：端侧代码**零 fixture 分支**（R41-⑧）——桩一律打在**测试侧**（本地桩代理拦截 `/api/cloudbase-proxy`，或 CDP 注入桩响应），**端侧代码不得留 DEV 开关 / 桩分支 / 调试组件**；**桩跑出的结论不得当 X12 / X18 验收 PASS**（报告须区分「**桩读数**」与「**真实函数读数**」）。

- **R41-① 数据源（取代端侧老配置读取；D9）**：端侧**不再读老的 5 项 `app_settings` 配置**、**不再计算老 plan**（`meditation-session-plan.js` / `buildMeditationSessionPlan` 保持**冻结兼容层**、不在新链路调用、不新增能力）；Track 与候选池**一律经 D6（R39 契约）**取得——`getTrack`（Track 配置 ＋ 章模板）＋ `getSectionAudios`（按 `section_type` 的候选池）；**端侧永不直连 DB 读 `med_*`**（R28-①：直连只会得到**静默空集**；R30：D6 是**硬前置**）。
- **R41-② 播放模型与音量**：背景轨（`sec-nature` / `sec-bowl`）＝**`loop`** 铺底、人声轨（其余 9 个 `section_type`）＝**`sequence`** 顺序拼接；音量**取响应里的 `background_track.volume` / `voice_track.volume`**（现为 **0.33 / 1**）——**仅当响应缺省时才回退常量**，且**回退常量不是权威源、绝不覆盖响应值**（响应给了值就以响应为准，哪怕与 0.33 / 1 不同）。播放模式是**双轨唯一口径的常量**（`loop` / `sequence`），**不读响应的 `playback_mode`**。章序与段序**只读**（R10）。
- **R41-③ 留白口径**：`gap_after_seconds` **只在章间生效**；**末『有可用段的』章恒 0**（末章无内容时**不留尾部静默**）；**禁用章的留白不计入**（R11）；实现层**禁止写死 `141`**（读 Track 的 `chapters[].gap_after_seconds`，缺省才回退模板默认值）。
- **R41-④ 时长与计时**：段 `duration_seconds` 取**响应实测值**（`duration > 0` 才用、否则记 `0`），**不用标称值**；总计 ＝ **Σ 人声段实测时长 ＋ Σ 留白**（**背景 loop 不计入**）；**端侧计时按 Track 组装结果，不沿用固定 15 分钟**（`DEFAULT_MEDITATION_SESSION_SECONDS` / `900s` / UI 的 910s 均**只作软基准**，不作端侧计时依据）；`MIN_VALID_MEDITATION_SECONDS = 180` **两端保持不变**（App `MeditationPlayerScreen.jsx` 与小程序 `utils/meditation.js`）。
- **R41-⑤ 抽签与固化（D7）**：**抽签在端侧**（抽签器**可注入**——`rng` 参数、默认 `Math.random`；一次运行内 `rng` 调用次数 ＝ 池非空的 `section_type` 数）；**固化载荷**＝`{track_id, track_version, date_key, session_key, selections[{section_type, audio_id, duration_seconds}]}`；**落点＝先本地 storage（键 `liwu_meditation_session_v1`）**；**云侧写入另裁、登记挂账 C18**（本批不落云）。**⚠ 规范↔实现缺口（已认，2026-09-24，Kong 小程序侦察 ＋ Zang 确认）**：**该本地固化在 App 侧尚未实现**——实测 `liwu_meditation_session_v1` 键**全仓源码零命中**、`buildSessionSolidification`（`packages/shared-utils/meditation-track-playback-plan.js:397`，只组装载荷、不落盘）**无任何消费方** ⇒ **R41-⑤ 的「本地 storage 固化」＝待补**（**App 侧本地 storage；云侧仍按 C18 未裁**）；**本批不得把该固化写成已实现**（验收点挂 §8.1 / **X12 · X18** 的待补注）。
- **R41-⑥ 格式与降级（D3）**：App 按响应 `formats[]` 顺序 **opus → mp3** 尝试，并**保留 `onerror` 运行时降级**（`formats` / 现签 URL 由 D6 下发，R39-⑤；**半条音频不得下发**）；**小程序直取 mp3、不使用 `canPlayType`**（小程序 `InnerAudioContext` 无该 API，且 iOS 走原生播放器，Web 结论**不得外推**）。
- **R41-⑦ 失败可见且不静默回退（D9 硬）**：`TRACK_NOT_FOUND` / `TRACK_DISABLED` / `READ_FAILED` / `CALL_FAILED` / `INVALID_PAYLOAD` ⇒ **明确错误态**（**附 `requestId`**，可重试）；**绝不**回退老音频库、**绝不**回退本地兜底 plan；空池 / 缺段的 `section_type` ⇒ **跳段 ＋ warning**（按 `section_type` 逐条计数），**不得**整场失败。
- **R41-⑧ 测试纪律**：端侧代码**零 fixture 分支**（**不得**加 DEV 开关 / 桩分支 / 调试 UI）；桩一律打在**测试侧**（本地桩代理拦 `/api/cloudbase-proxy`、或 CDP 注入桩响应）；**桩跑出的结论不得当 X12 / X18 验收 PASS**；报告必须区分「**桩读数**」与「**真实函数读数**」。
- **R41-⑨ 小程序前台限制**：本批小程序**只支持前台播放**——切后台微信会**暂停所有音频**，且 `BackgroundAudioManager` **为单例且无 `loop`** ⇒ **双轨在后台原理不可得**；**不得**把「切后台停播」判为缺陷（属平台限制，已裁定）。
- **R41-⑩ 不做渐变**：本批只做「**预加载下一段 ＋ 顺序播放**」，**不做淡入淡出**（crossfade / fade in / fade out 一律不在本批范围）。
- **R41-⑪ iOS App 音量未验（真机项）**：WKWebView 的 `HTMLMediaElement.volume` 实测为**空操作** ⇒ **0.33 是否真生效必须真机实测**；若 **FAIL** ⇒ **记挂账**（引入 Web Audio `GainNode` 或原生插件**另立项**），**不得据此判 X12 整体 FAIL**（本项不阻塞其余验收项）。
- **R41-⑫ 冻结边界与时段键**：老四 tab 与 `packages/shared-utils/meditation-session-plan.js` **本批不得删改**（D10 之前）；时段键 `dawn` → `morning` **统一**（D4，小程序侧由 Kong 实现时修正）；**`point_ledger.activity_slot` 的历史取值口径一并说明**——**历史记录中该字段可能仍存 `dawn`**（小程序历史写入侧口径），**统一只针对新写入、历史值不做批量改写**；**读侧统计 / 过滤必须同时接受 `dawn` 与 `morning`（或先做归一）**，**不得**只按 `morning` 单值过滤而漏掉历史记录。

> **口径收口**：**自 v4.10 起**，凡涉及端侧（App / 小程序）双轨播放的**数据源 / 播放模型与音量来源 / 留白 / 时长与计时 / 抽签与固化 / 格式降级 / 失败处理与回退 / 测试桩 / 前台限制 / 渐变 / iOS 音量 / 冻结边界与时段键**的判定，**一律以本节 R41-①~⑫ 为准**；与本节冲突的旧表述（§5 端侧计划计算老写法、§3.7 / §6 的音量硬编码写法、质检计划旧 X12 判据）**一律作废**。**（v4.11：端侧「链接失效 → 恢复」与「格式降级 → 跳段」的专项口径另见下节 R42 ①~⑥）**

### R42 端侧恢复路径与格式降级口径（**口径已实现（Kong）、桩面 PASS（Neng-22，2026-09-24）——Neng-21 的 1 条中型缺陷已修复（Kong，红 7/14 → 绿 15/15）并经 Neng-22 复验 PASS（桩面：36/36 ＋ 三个变异体红对照）；真链路待部署**）

> **依据**＝**Kong 的端侧实现（`apps/app/src/modules/meditate/MeditationPlayerScreen.jsx` ＋ 共享模块）＋ Zang 对下列六条的裁定 ＋ Neng-21 的独立复验（自建反证 harness）**。**本节是端侧（App 先、小程序后）「临时链接失效 → 恢复」与「格式降级 → 跳段」的唯一口径源**；与本节冲突的旧写法（「过期就整场重来」「`onerror` 即重新签发」「重签整场时间轴」等）**一律以本节为准**。质检判据见 `docs/meditation.admin.partner.verification-plan.md` §8.1 / **X12 · X18 · X19**。
> **状态词（R22，务必分面，不得聚合成一个状态词）**：**本口径（R42 ①~⑥）＝已实现（Kong）**；`MeditationPlayerScreen.jsx` 的 **B2a（恢复路径与格式降级）＝已实现（Kong）、质检 PASS（Neng-22，2026-09-24，桩面：36/36 ＋ 三个变异体红对照；Neng-21 的中型缺陷〔见 ⑥ 实测状态〕与低缺陷〔dist 产物落后〕均已修复）**——**桩面 PASS 不等于整体 PASS：真链路（D6 未部署）与真机项未实测前，不得写成「整体已通过」**。**未实测项（硬）**：**真实 D6 往返**（`cloudfunctions/meditation-read/` **尚未部署**）与**真机项**（**iOS WKWebView 音量**、**小程序 iOS 直取 mp3**）**一律标「未实测」**。
> **共用性注记（必读）**：本节的陈旧判定纯函数 `resolveMeditationUrlPolicyStaleness` 是**共享层定义（`packages/shared-utils/meditation-read-client.js`）、当前消费方＝App 播放器**（**小程序尚未消费**；**后台 Track 预览（R43）实现后为其第二消费方**——**R43 状态＝已定口径、待实现**）⇒ 本节所有「供两端共用」的表述**均指共享层可复用、当前仅 App 在用**，**不得**据此认为已双端生效。

- **R42-① 链接失效恢复 ＝ 同参重调 D6（不依赖 `file_id`）**：临时链接失效（**403 / 签名失败**）或按 `url_policy` 判**陈旧**时，恢复动作**只有一个**——**以逐字相同的入参重新调用 `getTrack`**（action 与参数与首次调用**完全相同**）。**不得依赖 `file_id` 或任何落库 URL 自行重签**：**R39 ⑤ 已明确响应不下发 `file_id`**（长期标识只在服务端层面存在）⇒ 端侧**无须也无法**持有它。另：**不走 `getSectionAudios` 作为恢复路径**（`getTrack` 一次即带齐当前段 playlist）。
- **R42-② 三层重入防护（硬）**：重调必须是**有界的**，三层各自独立生效：① **段级**＝按段维护「已重调过」集合（`Set`），**同一段在其整个生命周期内最多重调 1 次**；② **闸门级**＝**「未过期前的预置重签」整场至多 1 次**（用于开场即发现链接已陈旧的场景，避免每段播放前都重签）；③ **基准级**＝**重签成功后立即刷新基准**（新的 `url_policy` / 收到时刻成为后续段的比较基准）⇒ **后续段不重复重签**。⇒ **「每段播放前都重调一次」属实现缺陷**（正是 R42-③ 要避免的「重签风暴」）。
- **R42-③ 陈旧判定（刻意不用绝对时钟）**：已用时长**以端侧收到该响应的本地时刻起算**（`receivedAtMs`，或策略对象上的 `received_at_ms`），阈值＝ **`max_age_seconds / 2`**（缺省 **7200 / 2 ＝ 3600s**）——「距过期不足半有效期」即判陈旧。**刻意不用**本地绝对时钟去减服务端 `issued_at` / 与 `expires_at` **直接比较**：两端时钟不同步时**刚拿到手的链接会被判成已过期**，于是每段播放前都重签一次（＝**重签风暴**，正是要禁止的形态）。**退化路径**：`max_age_seconds` 缺失 / 非正数 ⇒ 退用 **`issued_at → expires_at` 的跨度**当有效期（**同一基准**，仍不与绝对时钟直接比较）；**两者都不可用**（无策略 / 时间戳不可解析 / 缺收到时刻）⇒ **不判陈旧**（回 `stale: false` ＋ `reason` 供记录）、**不据此重调**，交给 **403 兜底**；**判定失败不得抛错、不得阻断播放**。
- **R42-④ `onerror` 与链接过期解耦（硬）**：取源路径是 **`fetch` → `Blob` → `URL.createObjectURL`** ⇒ **链接过期（403）发生在 fetch 阶段**，**不会**以 `audio.onerror` 的形态出现；故 **`audio.onerror` 一律按「解码 / 格式」问题处理**（此刻源已是本地 blob） ⇒ **`onerror` 只降级、不重调**（重调只由「403 / 签名失败 / 判陈旧」触发）。⇒ **把 `onerror` 当作「链接过期」从而重调 ⇒ 判为实现缺陷**（会白白消耗重调额度、并把真实格式问题误判成链接问题）。
- **R42-⑤ 降级与跳段**：**每段 playlist 按该段响应 `formats[]` 的顺序生成多条**（**opus → mp3**，R41-⑥），`onerror` 时**同段内前进到下一条**（降级）；**段内全部格式都失败 ⇒ 跳段**——记 **warning**（按 `section_type` / 段号计数）＋ **用户可见提示**，**背景轨继续播、绝不整场失败**（R41-⑦）。**备选（一句话可改）**：「**跳段即停播**」——若产品改为「任何段不可播即整场停止」，只需改跳段分支的处置（**现取「不停播」**）。
- **R42-⑥ 重签只刷新当前段 playlist，不替换整场时间轴**（**设计口径 ＋ 实测状态，两段式，不得混写**）：
  - **设计口径**：恢复动作的结果**只用于替换当前段**的播放列表（覆盖表 `segmentPlaylistOverrideRef`，键 **`` `${trackKey}:${segmentId}` ``**），**整场时间轴（段序、段时长、留白、计时基准）不重建、不替换**——避免重签导致抽签结果变化、进而**进度跳变或重复播放**（R41-④ 的「端侧计时按 Track 组装结果」不因重签而改变）。
  - **实测状态（Neng-21 发现 ⇒ Kong 修复 ⇒ Neng-22 复验 PASS（桩面），2026-09-24 结案）**：**① Neng-21 实测（独立复验／自建反证 harness）＝该口径尚未真正生效（中型缺陷）**——**覆盖表 `segmentPlaylistOverrideRef` 从未被写入**：全文件只有 **3 处**（**L228 声明 / L237 唯一读取 / L721 clear**），**没有任何 `.set(...)`**；**后果**＝重签成功后，同段内若发生「**提前 `onended`**」或「**新格式 `onerror`**」，段内再入会**回落到「计划里的旧签 URL」** ⇒ **403** ⇒ **段内重调被重入集合挡住** ⇒ **误报「部分音频暂不可播放，已跳过该段并继续本次冥想」并清空该段音频**，而**新签 URL 其实可用**（**现实可达性**＝重调会以 `buildMeditationTrackPlaybackPlan` **重新抽签**，新 take 可能**短于计划段时长** ⇒ **提前 ended** 即触发）。**② ⇒ 已修复（Kong：先复现红 7/14 → 后验绿 15/15，回归 B2a 26/26 ＋ 上单 51/51，lint 稳 110，`dist` 已重建）**。**③ ⇒ 经 Neng-22 复验 PASS（2026-09-24，桩面）**：**(a) 质检读数＝桩面 36/36 ＋ 三个变异体红对照**——`no_writeback`（**回退修复前形态**）**6 条 FAIL 且逐字复现 D1 后果**、`wrong_key` **6 条 FAIL**、`empty_set`（**delete 改写空数组**）**仅卫生性断言失败、行为断言全过** ⇒ 据此登记：「**delete 与写空数组行为等价，delete 属消中间态的卫生改进、非承重逻辑**（**不需为它返工**）」；**(b) 其它读数**＝段内再入末条取源＝**新签 `mp3?sig=v2`**、**无 `SEGMENT_SKIPPED`**、同段仍只重调 **1** 次（载荷逐字相同）、覆盖表**恰 1 条 `voice:sec-alpha-1`**、**下一段仍用旧签**（**只覆盖当前段**）；反向「重签后无可交付音频」**不留「有键但空」**、且**只有真不可交付才跳段**；**(c) 静态**＝写入点 `set` / `delete` **各恰 1 处**、键构造函数**全仓唯一**、`reissuedSegmentKeysRef` 的 has/add/clear **各恰 1 处且 add 在 await 前（未放宽）**、**只覆盖当前段、未动时间轴**；**(d) `dist` 逐字节复核**＝以当前源码重建得**同名同字节** `index-Dq9F4L05.js`（sha256 `534467762f41bde129bd09043715f8076056cbf639bf7128d212d2570a4d6360`）⇒ **产物确由含修复的源码构建**；冥想相关 `fileId` **零命中**。**（结案声明：修复前「不得写成已生效」的限制已随 Neng-22 复验 PASS 解除；但真链路未部署 ⇒ 只判桩面——也不得把该后果判成「链接过期」或「格式问题」。）**

> **口径收口**：**自 v4.11 起**，凡涉及端侧「**链接失效恢复方式 / 重调次数上界 / 陈旧判定依据 / `onerror` 语义 / 格式降级与跳段 / 重签的替换范围**」的判定，**一律以本节 R42-①~⑥ 为准**（**⑥ 须同时按其「实测状态」段判定——设计口径与实测状态是两件事**）；与本节冲突的旧表述**一律作废**。质检判据见 `docs/meditation.admin.partner.verification-plan.md` §8.1 / **X12 · X18 · X19**（**X19 ＝ R42 逐条验收：桩面 PASS（Neng-22，2026-09-24）、真链路待部署**）。

### R43 后台 Track 预览口径（**状态＝已定口径、待实现**；Zang 裁定 2026-09-24，①~⑩）

> **依据**＝**正本 R9**（Track 预览＝**批次归属**裁定，**无功能条文**）＋ **R41 ①~⑫ / R42 ①~⑥**（**预览的功能口径来源**）＋ **附录 C / C4**（挂账）＋ **Kong 对后台「冥想轨道」tab 的侦察结论（2026-09-24）**。
> **本节是后台（`/partner` 冥想页「冥想轨道」）Track 预览的唯一口径源**；**App / 小程序端侧口径仍以 R41 / R42 为准**，本节**不放宽、不替代**其任何一条。
> **R9 与 R43 的关系（必读）**：**R9 只裁定批次归属**（「Track 预览归第二批」），**从未定义预览的功能口径** ⇒ 自 v4.12 起，**预览的功能口径一律从 R41 / R42 取并在本节专项化**；B.5 / **R9** 行与 §3.7 两处**均已标「功能口径见 R43（v4.12）」**。
> **状态词（R22 分面）＝「已定口径、待实现」**——**不得预写「已实现」**、**不得**写成「已通过」；实现完成后按 R22 的规则另行升格（**本版只定口径、不改代码**）。

**侦察结论（Kong，2026-09-24；本节实现约束的依据，逐条可核）**

| # | 侦察事实 | 落点 / 依据 |
|---|----------|-------------|
| ① | 后台「冥想轨道」tab ＝ `apps/web/src/admin/components/Dashboard/MeditationPage.jsx`（**4598 行单文件**）内的 `MeditationTracksTab`（**`:2848-3002`**）；**当前无任何预览按钮 / 播放器**；**最小插入点＝保存按钮（`:2990`）之后** | `MeditationPage.jsx` |
| ② | **apps/web 后台零 `callFunction` 使用** ⇒ `apps/web/src/admin/services/cloudbase.js` 需**新增 2 行**（见「实现约束」第 1 条） | 全仓检索 `apps/web/src` |
| ③ | 两个共享模块（`meditation-read-client.js` / `meditation-track-playback-plan.js`）**原样复用、后台不另写一份**——`meditation-read-client.js` 文件头本就写明「**`callFunction` 由调用方注入**——App 传 `app.callFunction`，后台传同一 js-sdk 方法」 | `packages/shared-utils/` |
| ④ | 老预览器 `MeditationPreviewDialog`（**`:356+`**）与 `buildMeditationPresetPreviewPlan`（**`:242-354`**）属**老四 tab**（音频库 / 冥想库 / 冥想设置 / 冥想日历），**R41-⑫ 冻结、不得就地改造** | 同上 |
| ⑤ | 后台子 tab 懒加载已同时 `loadSectionAudios()`（**`:3613-3620`**，`med-tracks` 分支）⇒ 预览可直接复用已有音频状态，**不需新增取数入口** | 同上 |

- **R43-① 数据源：一律经 D6（后台同样不得直连 DB）**（依据：**R41-①** 延伸 ＋ **R39** 契约 ＋ **R28-① / R30**）
  - 预览的 Track 配置与候选池**一律经 D6 只读云函数**（`getTrack` ＋ `getSectionAudios`，**R39 ①~⑫**）取得。
  - **后台也不得直读 `med_tracks` / `med_section_audios` 自行组装播放**——「**后台是管理员身份所以可以直连**」**不是豁免理由**：直连会绕过 R39 的可交付判据与现签 URL 口径（`queued` / `processing` / `failed` 一律不下发、响应**不下发 `file_id`**、**绝不透传落库 `audio_url`**）。
  - 复用方式＝**共享模块 ＋ 注入的 `callFunction`**（侦察结论 ③），**后台不另写读客户端 / 播放计划模块**。
- **R43-② 预览不落盘**（依据：**R41-⑤**（固化落点＝本地 storage；**云侧写入＝C18 未裁**）＋ R43-③）
  - 预览**不写** `liwu_meditation_session_v1`（R41-⑤ 的固化键）、**不写任何云集合**、**不写 `med_*`**。
  - 理由：**云侧会话写入尚未裁定（C18）**；预览是「**看效果**」不是「**真实会话**」，写本地 storage 会与 App 的真实会话记录**互相覆盖**。
  - 抽签结果**只存在于预览组件的内存状态**，关闭预览即丢弃。
- **R43-③ 预览基于已保存版本（UI 必须明示）**（依据：R39（D6 **只读库**）＋ **R41-④**）
  - D6 读的是**库中已保存的 Track** ⇒ 预览反映**已保存版本**，**草稿态的未保存改动**（章开关 / 时长上限 / 留白 / 名称）**不生效**。
  - **UI 必须明示**：**「预览基于已保存版本 vN；未保存改动不生效」**（`N` 取 Track 的 `version`，**R5**）；**禁止**用预览结果暗示草稿已生效。
  - **不得**为让草稿生效而先写库再预览（与 R43-② 冲突，且会造成「预览即污染数据」）。
- **R43-④ 抽签：每次开预览抽一次 ＋ 「换一批」显式重抽**（依据：**R41-⑤**（抽签在端侧、`rng` 可注入）＋ **R41-④**）
  - **每次打开预览抽一次**——进入预览即抽定，**本次预览内段序与抽中候选不再变化**（避免每次播放都换内容）。
  - **「换一批」＝显式重抽**：用户点击才重新抽签并刷新预览计划；**不得**自动周期性重抽、**不得**在播放失败后静默换候选。
  - **`rng` 可注入**（默认 `Math.random`，对齐 R41-⑤）、**无固定种子**（**不得**写死种子伪装随机）——可注入是为了桩测与复现**不污染产品代码**（见 **R43-⑩**）。
- **R43-⑤ 缺音频：分两类并可计数，绝不整场失败**（依据：**R41-⑦**（空池 / 缺段 ⇒ **跳段 ＋ warning**、**不得整场失败**）＋ **R42-⑤** ＋ **R39-④**）
  - **两类分开计数、不得合并成一个「缺音频」数**：① **池空**（该 `section_type` 候选池为空）；② **池非空但无可用格式**（候选存在但**不可下发**——R39-④：`transcoded_formats` 未同时含 `opus` 与 `mp3`、或缺 `file_id`、或签发失败 ⇒ 该条被 `stats.excluded` 剔除）。
  - **段级处理＝跳段**（继续播其余段），段级文案**逐字**：**「{章节名 · section 名} 暂无可播放音频，已跳过该段（继续播放）」**（章节名 / section 名按 **R21** 权威对照表的常量值拼写）。
  - **面板汇总**＝给出**两类各自的计数**（如「池空 N 段 / 无可用格式 M 段」）＋ 已跳过段清单；**背景轨继续、人声顺序继续**。
  - **绝不整场失败**：**任何**缺音频情形**都不得**把整场预览判为失败或阻断（**整场失败 ＝ 实现缺陷**）。
- **R43-⑥ 失败态：三态分开、带 `requestId` 与「重试」，文案不得声称「无权限」**（依据：**R41-⑦**（明确错误态 ＋ 附 `requestId`）＋ **R39-③**（错误码 / 出参形状））
  - **三种情形必须给三套独立文案，不得合并**：① **函数未部署 / 调用失败**（`CALL_FAILED` 一类：函数不存在、网络 / 代理失败、`callFunction` 抛错）；② **`TRACK_NOT_FOUND`**（D6 可用，但**库里没有 Track**）；③ **`TRACK_DISABLED`**（Track 存在但被禁用 / 不可发布）。
  - **硬约束**：**未部署不得显示为「无数据」、也不得显示为「Track 不存在」**——「没部署」是**环境 / 部署问题**、「库里没有」是**数据问题**；混淆会让排查方向完全走错。
  - **文案一律不得声称「无权限」**（与 **R40-⑤** 的读回失败文案同一纪律；后台为管理员身份，越权**不是**本路径的已知失败形态）。
  - 失败态**带 `requestId`**（D6 / 代理响应里有则展示）＋ **「重试」**按钮（**重试＝重新开一次预览**，仍受 R43-④ 抽签口径约束）。
- **R43-⑦ 后台恢复策略简化：403 ⇒ 同参整场重调至多 1 次（闸门级）；不做段级覆盖表；不得依赖 R42-⑥**（依据：**R42-①**（同参重调 D6）＋ **R42-②**（三层重入防护）＋ **R42-⑥ 的实测状态**）
  - 后台预览**只实现闸门级**：链接失效（**403 / 签名失败**）时**以逐字相同的入参整场重调 `getTrack` 一次**，**整场至多 1 次**；**不实现段级 Set、不实现基准级刷新**（预览是**短时、可重开**的动作，无需三层）。
  - **不做段级覆盖表**：后台**不得**引入 `segmentPlaylistOverrideRef` 那类覆盖结构——**R42-⑥ 的设计口径经 Neng-21 实测未生效、已修复并经 Neng-22 复验 PASS（桩面；真链路待部署）**——**后台仍不得依赖它**（R43-⑦ 的后台恢复仍是「403 ⇒ 同参整场重调至多 1 次」），**更不得复制该设计**。
  - **硬口径：不得依赖 R42-⑥**——后台预览的恢复**不得**假设「重签只刷当前段 playlist」已生效；宁可「重调一次后若仍失败 ⇒ 直接进 R43-⑥ 的错误态」，**不得**靠一个未生效的机制兜底。
  - 若要更细的段级恢复，**须另立裁定**，**不得**由实现者自裁（对齐 R42 / R29 的一贯纪律）。
- **R43-⑧ 时长：两把尺子并存（并列展示，不得互推）**（依据：**R41-④**（段时长取响应实测值、总计＝Σ 人声段 ＋ Σ 留白、**背景不计入**）＋ **R37-③** 术语澄清 ＋ **C14**）
  - **保留现有面板估算**＝`buildMeditationTrackDurationEstimate`（`MeditationPage.jsx:2952-2962` 的 `renderEstimateSummary`：「预估 Track 总时长 … 内容 X ＋ 章间留白 Y；基准 15:00」）——**就地保留、不改算法**（预估口径＝**C14 待用户拍板**）。
  - **并列新增「实测预览总时长」**＝**Σ 人声段实测时长 ＋ Σ 章间留白**（**背景 loop 不计入**），来源＝**本次预览的 D6 响应实测值**（R41-④）。
  - **必须标注两者不是同一把尺子**（**R37-③**）：`total_target_seconds = 900`（15:00）是**软基准**；面板估算的「内容」＝**章 `max_duration_seconds` 上限之和（910s）**；**实测预览总时长**＝**真实音频实测值之和**——**三者不得互推**，尤其**不得**用 910s 反推朗读时长。
  - **不得**因两把尺子数字不同而判任一方为缺陷（**C14 属产品口径待拍板**）。
- **R43-⑨ UI 显示实际音量取值，并标明来源（响应值 / 回退常量）**（依据：**R41-②**）
  - UI **必须显示本次预览实际使用的音量取值**（背景轨 / 人声轨两个值），并**标明来源**＝「**响应值**」（来自 `background_track.volume` / `voice_track.volume`）或「**回退常量**」（响应缺省时才回退，值为 `MEDITATION_TRACK_VOLUMES` 的 0.33 / 1）。
  - **响应给了值就以响应为准、绝不覆盖**；**回退常量不是权威源**（**不得**写成「规范音量」）。
  - **不得**在 UI 上把回退常量伪装成响应值——两者必须可区分；本条的用途正是让「0.33 是否真生效」在后台**可见**（真机项仍按 **R41-⑪** 单列，不在本项收口）。
- **R43-⑩ 零 fixture 纪律同样适用于后台预览**（依据：**R41-⑧**；**本单补充裁定**）
  - **桩只打测试侧**：拦 `/api/cloudbase-proxy`，或**注入 `callFunction`**（R43-④ 的 `rng` 注入同理）。
  - **后台产品代码不得留 DEV 开关 / 桩分支 / 调试组件 / 固定种子**（`apps/web` 侧一并适用 R41-⑧ 的「零 fixture 分支」）。
  - **桩读数不得当 X20 验收 PASS**：报告必须区分「**桩读数**」与「**真实 D6 读数**」（对齐 R41-⑧ 的同一要求）。

**实现约束（硬，随 R43 一并生效；本版只定口径、不落代码）**

1. **数据源接入＝2 行（候选 A）**：`apps/web/src/admin/services/cloudbase.js` 新增 **① import**（`createMeditationReadClient`）＋ **② export**（`export const meditationReadClient = createMeditationReadClient({ callFunction: app.callFunction.bind(app) })`）——**照 `apps/app/src/services/cloudbase.js:155-157` 同款**。依据：**apps/web 后台当前零 `callFunction` 使用**（侦察结论 ②）；`app` 已在该文件由 `createCloudBaseSdk(...)` 解构得到，`callFunction` 的 `this` **必须绑定到 `app`**。
2. **共享层原样复用**：`meditation-read-client.js` ＋ `meditation-track-playback-plan.js` **直接用、不复制、不改写**（文件头已写明「`callFunction` 由调用方注入」）——**后台不另写一份**读客户端 / 播放计划模块。
3. **新建独立组件**：预览 UI **新建独立组件文件**，**不得**塞进 `MeditationPage.jsx`（**4598 行单文件**）就地扩写；挂载点＝`MeditationTracksTab`（`:2848-3002`）**保存按钮（`:2990`）之后**。
4. **不得改造老预览器**：`MeditationPreviewDialog`（`:356+`）与 `buildMeditationPresetPreviewPlan`（`:242-354`）属**老四 tab**，**R41-⑫ 冻结、不得就地改造**（老链路随 D10 下线；新预览**另起组件**）。
5. **未部署时的表现（硬）**：D6（`cloudfunctions/meditation-read/`）**尚未部署**时，预览**必须进入 R43-⑥ 的「函数未部署 / 调用失败」错误态**——**明确文案 ＋ `requestId`（有则示）＋「重试」**；**不得**显示为「无数据」「Track 不存在」，**不得**静默空白 / 静默禁用按钮，**不得**回退老预览器或本地兜底 plan（**R41-⑦**）。
6. **不写盘 / 不落库**：预览路径**零写**（不写 `liwu_meditation_session_v1`、不写云、不写 `med_*`）——见 R43-②。
7. **状态词**＝「**已定口径、待实现**」（**不得预写「已实现」**）。**验收点＝质检计划 §8.1 / X20**（**D6 未部署 ⇒ 真链路不可达；桩面 PASS 不得当 X20 PASS**）。

> **口径收口**：**自 v4.12 起**，凡涉及**后台（`/partner` 冥想页「冥想轨道」）Track 预览**的**数据源 / 是否落盘 / 预览版本基准 / 抽签与重抽 / 缺音频分类与跳段 / 失败态三分 / 恢复策略 / 时长展示 / 音量展示 / 测试桩**的判定，**一律以本节 R43-①~⑩ ＋ 实现约束为准**；与本节冲突的旧表述（把后台预览当端侧 X12 的附属、后台直读 `med_tracks` 组装播放、预览写本地 storage、把未部署显示成「无数据」等）**一律作废**。

### R44 小程序端侧接入口径（**状态＝「已定口径、待实现」**；Zang 裁定 2026-09-24，①~⑬）

> **依据**＝**Kong 的小程序端侧侦察（现状 ＋ 微信官方文档逐条核实）** ＋ **正本 R41 ①~⑫ / R42 ①~⑥ / R43 ①~⑩（既有端侧 / 后台口径）** ＋ **Zang 的裁定（含 ⑤ 的明文例外）**。
> **本节是「小程序（`apps/miniprogram`）端侧双轨播放接入」的唯一口径源**；**App 侧口径仍以 R41 / R42 为准**，本节**不放宽、不替代**其任何一条——**唯一例外＝ ⑤（对 R42-④ 的明文例外，且仅限小程序）**。判据见 `docs/meditation.admin.partner.verification-plan.md` §8.1 / **X21**。
> **现状（Kong 侦察，2026-09-24；逐条可核）**：① 小程序冥想页 `apps/miniprogram/src/pages/meditation/index.js`（**150 行**）**零音频**——纯 `setInterval` 倒计时 ＋ 记录，页面**无 `<audio>`、无播放控件**；② `MIN_VALID_MEDITATION_SECONDS = 180` 位于 `apps/miniprogram/src/utils/meditation.js:6`（门禁 **`:101`**），结算路径＝`recordMeditationCompletion`（**`:94-130`**）；③ 小程序侧**尚无** D6 客户端（`meditationReadClient` 目前只在 App：`apps/app/src/services/cloudbase.js:155-157`）。
> **状态词（R22 分面）＝「已定口径、待实现」**——**不得预写「已实现」**、**不得**写成「已通过」；实现完成后按 R22 另行升格（**本版只定口径、不改代码**）。**真机项（硬，一律「未实测」）**：**两个实例同播的混音与音量叠加**、**iOS 静音开关出声**、**iOS 直取 mp3**。**D6 未部署 ⇒ 真链路不可达**——**桩面 PASS 不得当 X21 PASS**。

- **R44-① 数据源只经 D6**（依据：**R41-①** / **R39** / **R30**）：`meditationReadClient` 由小程序注入 **`({ name, data }) => wx.cloud.callFunction({ name, data })`**（注入契约＝共享模块 `packages/shared-utils/meditation-read-client.js:398-402`，`callFunction` 形如 `({ name, data }) => Promise<res>`，`thisArg` 可选）；**端侧不得直连 DB 读 `med_*`**（R28-① 下直连只得**静默空集**）、**不读老 5 项 `app_settings`**、**不算老 plan**（D9）。⇒ 新页面的取数入口**不得**是 `wx.cloud.database()`。
- **R44-② 前台双轨不降级（硬）**：背景轨（`sec-nature` / `sec-bowl`）＋ 人声轨（其余 9 个 `section_type`）**各用一个独立的 `InnerAudioContext`**——**背景 `loop = true` 铺底**、**人声 `sequence` 顺序播放**（R41-②）。**官方依据（逐条可核）**：① 官方文档**没有**「同时只允许一个 `InnerAudioContext`」的条款；② **微信开放社区官方问答**对「无法叠加播放」给出的解法**就是创建多个对象**；③ 小游戏侧文档的「**Android 最多同时 10 个**」上限**远高于 2**。⇒ **不得**因「担心叠加播放」而把双轨**降级为单轨**（**降级 ＝ 实现缺陷**）。
- **R44-③ 本批只支持前台（平台限制，不得判缺陷）**：官方行为＝**切后台 5 秒后停止 JS 线程**、需申请后台能力才能持续；而 `BackgroundAudioManager` 是**全局单例**（官方原文）、属性表**无 `loop`** ⇒ **双轨在后台原理不可得**。⇒ 与 **R41-⑨** 一致：**切后台停播判 PASS**；**不得**把「切后台停播」记为缺陷，也**不得**在本批引入 `BackgroundAudioManager`。
- **R44-④ 格式只取 mp3（硬）**：小程序侧 playlist **只保留 mp3**——取 `resolveMeditationPlayableFormats`（`packages/shared-utils/meditation-track-playback-plan.js:212`）结果后**过滤为 mp3**。依据：格式表 **ogg 仅 Android、iOS 不支持**（`BackgroundAudioManager.src` 亦只支持 m4a / aac / mp3 / wav，**无 ogg**）⇒ **mp3 是唯一跨端公共格式**。**不得**试图播 ogg；**不得**用 `canPlayType` 作判据——**该 API 属 HTML5、小程序不存在**（按静态 grep 判：「出现即 FAIL」）。
- **R44-⑤ 恢复策略的小程序例外（Zang 裁定；硬）**：小程序**没有 App 的 `fetch` → `Blob` → `objectURL` 阶段** ⇒ 临时链接过期与解码 / 格式失败**都表现为 `onError`**（两种成因在该 API 上**可观测形态不可分**）⇒ **允许「同参整场重调 `getTrack` 至多 1 次」**（**闸门级**，与 **R43-⑦** 同形；入参逐字相同，R42-①）；**重调后仍 `onError`** ⇒ **跳段 ＋ warning ＋ 用户可见提示**（R41-⑦ / R42-⑤；背景轨继续、**不整场失败**）；**不得无限重试**（无段级额度、无自动重抽）。**本条是 R42-④「`onerror` 只降级、不重调」的明文例外**——**理由**＝小程序无 fetch 阶段、链接过期与格式问题在 `onError` 上同形，若照搬 R42-④ 会把「链接过期」误判成「格式问题」而直接跳段（**下轮复审不得把本条当违规**）。**适用范围仅限小程序**：**App 侧 R42-④ 仍然有效、不得据此放宽**。
- **R44-⑥ 取源方式＝直设 `ctx.src`**（依据：与仓库既有图片链一致 ＋ **零部署前置**）：把 D6 现签 URL 直接赋给 `ctx.src`。**不做 `wx.downloadFile` 预取**——该方式需**下载域名白名单**；**若将来需要，须单独立项并登记部署前置**（**不得**由实现者自裁）。**不得**试图用 `wx.cloud.downloadFile`：**D6 不下发 `file_id`**（**R39-⑤**）⇒ 端侧**无句柄可取**。
- **R44-⑦ 资源释放（硬）**：页面 / 组件卸载时对**两个实例**调用 `destroy()`（官方「注意事项」原文：`InnerAudioContext` **资源不自动释放**）。**未 `destroy()` ⇒ 计内存泄漏**（验收可静态核对：卸载钩子存在且对两个实例均调用）。
- **R44-⑧ iOS 静音模式出声（真机项）**：需 **`wx.setInnerAudioOption`**（**`obeyMuteSwitch` 自基础库 2.3.0 起不再由属性控制**，必须经该 API 设置）。**未经真机实测 ⇒ 列真机项「未实测」**（与 R41-⑪ 的 iOS App 音量同性质）；FAIL ⇒ **记挂账、另立项**，**不得据此判 X21 整体 FAIL**。
- **R44-⑨ 音量取响应 ＋ 计时（同 R41-② / ④）**：音量**取响应里的 `background_track.volume` / `voice_track.volume`**，缺省才回退常量、**绝不覆盖响应值**；**计时节流＝按 Track 组装结果**（**Σ 人声段实测时长 ＋ Σ 章间留白**，**背景 loop 不计入**），**弃 900s（15 分钟）固定值**；`MIN_VALID_MEDITATION_SECONDS = 180` **两端不变**（小程序常量 `apps/miniprogram/src/utils/meditation.js:6`）。
- **R44-⑩ 会话固化先落本地（不写云）**（依据：**R41-⑤** ＋ **C18 未裁**）：固化载荷按 R41-⑤ 组装，**先落本地**＝`wx.setStorageSync('liwu_meditation_session_v1', …)`；**不写云**（**C18 未裁**）、**不得自建云集合**（新建集合会与「`med_*` 仅管理员可写」目标〔附录 B.7 方案 1〕冲突）。**并注明**：本条与 **R41-⑤** 同属「**App 侧尚未落地**」的**待补项**（已登记缺口：`liwu_meditation_session_v1` 全仓源码零命中、`buildSessionSolidification` 无消费方）——**小程序实现时一并补齐，不得写成「已实现」**。
- **R44-⑪ 共享层单一源（硬）**：两个共享模块（`meditation-read-client.js` / `meditation-track-playback-plan.js`）**只能经同步脚本进入小程序**＝`npm run miniprogram:sync`（＝`assets:sync` ＋ `packages:sync`，见根 `package.json:17-19`）；**禁手抄 CJS 副本**（不得在小程序目录就地改写一份）。`packages/shared-utils/*` 是**唯一权威源**，**漂移由 sync ＋ build 门禁兜住**（`scripts/build-miniprogram.mjs` 的 `requiredSyncedUtils` 门禁 ＋ `build:miniprogram` 先跑 sync）。
- **R44-⑫ 时段键 `morning`**（依据：**D4** ＋ **R41-⑫**）：时段键**已统一为 `morning`**（**小程序写入侧** ＋ **App 读侧归一** ＋ **App 写入侧**）；**`BADGE_SLOT_KEYS` 不动**——它同时是徽章 id 与历史解锁记录的名字来源 ⇒ 归一**只做读侧别名**，**不得**改共享常量。
- **R44-⑬ 失败可见、不整场失败、不得回退（硬）**（依据：**R41-⑦** ＋ **R39-③**）：五类错误码（`TRACK_NOT_FOUND` / `TRACK_DISABLED` / `READ_FAILED` / `CALL_FAILED` / `INVALID_PAYLOAD`）**各自可见文案 ＋ `requestId`（有则示）**，可重试；**空池 / 缺段** ⇒ **跳段 ＋ warning**（按 `section_type` 计数），**不得整场失败**；**不得**回退老音频库 / 本地兜底 plan（R41-⑦；**C22** 的三个老兜底音频**未经用户拍板不得删、也不得回退使用**）；**零 fixture 分支**——桩只打**测试侧**（注入 `wx.cloud.callFunction` 桩），**小程序产品代码不得留 DEV 开关 / 桩分支**，**桩读数不得当 X21 验收 PASS**。

**本批同批登记（硬，与 R44 一并生效；本版只登记，不改代码）**

1. **Step 1（共享层接入）＝已实现（Kong）、待质检确认**（**Neng 独立复验待派**）：① 同步脚本白名单 **8 → 10**（`scripts/sync-miniprogram-packages.mjs` 的 `esmSources` 现含 `meditation-read-client.js` / `meditation-track-playback-plan.js`）；② 转换器补 **`export class`** 处理（原只处理 `export const` / `export function`，类声明会被漏掉 ⇒ 产物缺导出）；③ build 门禁 **15 → 17**（`scripts/build-miniprogram.mjs:12-30` 的 `requiredSyncedUtils`）；④ **产物体检**＝两产物 `^export ` **零命中**、`node --check` **通过**、**运行时效验 12/12**（类可 `new`）；⑤ **单一源核对 10/10 逐字节相等**（`packages/shared-utils/*` → `apps/miniprogram/src/utils/shared/*`）；⑥ 小程序写入侧 `dawn` → `morning`；⑦ App **读侧** dawn / morning 归一（探针 **19/19** ＋ **负对照 4 FAIL** 证明探针能咬住缺陷）；⑧ `BADGE_SLOT_KEYS` **sha256 前后一致**（**未改常量**）。**状态词按 R22**：**不得**写成「已通过」。
2. **既有脚本缺陷（已修、待质检确认）**：`scripts/sync-miniprogram-packages.mjs` 原先 **`rm -rf` 整个 `apps/miniprogram/src/utils/shared/`**，而该目录里住着 **6 个手工维护**的包内工具（`cloudbase-document-helpers` / `cloudbase-user-identity` / `cloudbase-wealth-snapshot` / `users-split-fields` / `cloudbase-user-profile` / `user-bundle`；后两个含转换器**不覆盖**的 `import → require` 手工改写），且被 `scripts/build-miniprogram.mjs` 的 `requiredSyncedUtils` 门禁要求存在 ⇒ **每次同步都会自毁这 6 个文件、`build:miniprogram` 直接退 1**（已实测复现）。**已修为「只删本脚本自己生成的产物」**（`managedOutputs` 白名单＝`auth.js` ＋ 10 个 `esmSources` 产物）。**这属缺陷修复、不入附录 C 挂账**；修复前形态**不得**作为实现依据。
3. **时段键收尾（另一单）＝已派、待交**：App 写入侧新值改 `morning` ＋ **小程序边界对齐 App**（**0:00–4:59 不再算 `morning`**）。**本规范不预写其实现状态**；交付前**不得**据此判 X21 通过。

> **口径收口**：**自 v4.13 起**，凡涉及**小程序（`apps/miniprogram`）端侧双轨播放接入**的**数据源 / 双轨实例数 / 前台限制 / 格式选择 / `onError` 恢复策略 / 取源方式 / 资源释放 / iOS 静音出声 / 音量与计时 / 会话固化落点 / 共享层单一源 / 时段键 / 失败处理与测试桩**的判定，**一律以本节 R44-①~⑬ ＋ 本批同批登记为准**；与本节冲突的旧表述（把小程序当 App 的 `fetch + Blob` 路径、把 R42-④ 照搬到小程序、试图播 ogg / 用 `canPlayType`、为叠加而降为单轨、卸载不 `destroy()`、手抄共享模块等）**一律作废**。**App 侧口径仍以 R41 / R42 为准**（本节只对 ⑤ 作出**明文例外**，且**例外仅限小程序**）。

---

## Meditation Track 的数据结构

> **本节于 2026-09-23 修订。** 核心变化：所有「固定时长」措辞改为「**上限 / 参考值**」；「超长尾部截断」措辞**已废弃**，改为「超过上限时**告警（不阻断）**」。字数目标（`target_char_count`）为**硬约束**，时长为**软约束**。

1. Track
Track 是音频数据集对外发布的最小单元，本质为组合配置方案，非实体音频。
一条 Track 由若干 Chapter 组合而成；章节搭配、时长、拼接、截断等规则，均在 composition 组件中由管理员配置。
> **2026-09-23 修订**：
> - 「截断」措辞已废弃，改为「时长上限管控」。
> - Track 配置**落点为独立集合 `med_tracks`**（见下文「med_tracks（CloudBase 集合）」）。现有 `compositionSettings.segments` 属于**即将下线的老模型（规则 A），不复用**。
> - Track 本身**固定可复现**：章节开关、各章时长上限、章间留白、关联 `section_type`、元信息（名称/启用状态）全部存在 Track 内；运行时随机性只发生在 Section 层。

2. Chapter（共 6 类篇章，统一规则：~~超长尾部截断~~ → **超过时长上限时告警（不阻断）**）
~~所有篇章设置固定时长，内容超时则在时间节点处截断；内部由对应 Section 按顺序无缝拼接，Section 类型与顺序固定不可更改。~~
**修订后口径**：所有篇章设置**时长上限（参考值）**，内容超上限时**告警（不阻断）**（不再静默截断）；内部由对应 Section **按固定顺序**拼接，Section 类型与顺序固定不可更改。
**六章顺序固定不可改**：管理员只能调**时长上限**与**章开关**，不能改顺序、不能重复章节（见「六章固定模板」）。

  ~~Chapter0 自然库（chapter-nature）：固定 300 秒，由 sec-nature 组成~~
  Chapter0 自然库（chapter-nature）：**时长上限** 300 秒，由 sec-nature 组成
  ~~Chapter1 颂钵库（chapter-bowl）：固定 30 秒，由 sec-bowl 组成~~
  Chapter1 颂钵库（chapter-bowl）：**时长上限** 30 秒，由 sec-bowl 组成
  ~~Chapter2 问候库（chapter-opening）：固定 130 秒，由 sec-intro、sec-place、sec-posture、sec-bridge 依次组成~~
  Chapter2 问候库（chapter-opening）：**时长上限** 130 秒，由 sec-intro、sec-place、sec-posture、sec-bridge 依次组成
  ~~Chapter3 呼吸库：固定 150 秒，由 sec-prelude、sec-breath 依次组成~~
  Chapter3 呼吸库（chapter-breath）：**时长上限** 150 秒，由 sec-prelude、sec-breath 依次组成
  ~~Chapter4 心语库：固定 270 秒，由 sec-verse、sec-chorus 依次组成~~
  Chapter4 心语库（chapter-verse）：**时长上限** 270 秒，由 sec-verse、sec-chorus 依次组成
  ~~Chapter5 告别库（chapter-closing）：固定 30 秒，由 sec-outro 组成~~
  Chapter5 告别库（chapter-closing）：**时长上限** 30 秒，由 sec-outro 组成

3. Section
Section 是按业务功能划分的音频片段单元，是数据库与文件存储的最小实体音频单元，不可拆分。由 Section-Raw 文本经**真人朗读录制**生成。
~~由 Section-Raw 文本经朗读生成。~~
每类 Section 配置独立**最大时长（上限）**，用于管控片段长度（~~固定时长~~）。
  ~~sec-nature：固定 300 秒~~
  sec-nature：**时长上限** 300 秒
  ~~sec-bowl：固定 30 秒~~
  sec-bowl：**时长上限** 30 秒
  ~~sec-intro：固定 20 秒~~
  sec-intro：**时长上限** 20 秒
  ~~sec-place：固定 30 秒~~
  sec-place：**时长上限** 30 秒
  ~~sec-posture：固定 40 秒~~
  sec-posture：**时长上限** 40 秒
  ~~sec-bridge：固定 40 秒~~
  sec-bridge：**时长上限** 40 秒
  ~~sec-prelude：固定 70 秒~~
  sec-prelude：**时长上限** 70 秒
  ~~sec-breath：固定 80 秒~~
  sec-breath：**时长上限** 80 秒
  ~~sec-verse：固定 120 秒~~
  sec-verse：**时长上限** 120 秒
  ~~sec-chorus：固定 150 秒~~
  sec-chorus：**时长上限** 150 秒
  ~~sec-outro：固定 30 秒~~
  sec-outro：**时长上限** 30 秒
> **基数关系（新增）**：1 条 Section-Raw 可产出 **1..N 条 Section 音频**，构成该 `section_type` 的**候选池**；运行时从候选池抽一条（详见「随机性下沉到 Section 层」）。老 preset 的 `groupSelections` 语义**平移至此**。

4. Section-Raw
Section-Raw 是文本单元的集合，本质是数据集。
流转流程：Section-Raw（文本，由 Paragraph 顺序拼接） → 真人朗读录制 → 转码 raw → Opus → Section
~~流转流程：Section-Raw（文本，由 Paragraph 顺序拼接） → 朗读加工 → Section~~
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
> **字数口径（新增，硬约束）**：以上「大约 N 字」即 `target_char_count`，**为硬约束**（不是建议值）；现有 9 个文本类段的字数预算**合计 590 字**。`word_count_status` 仅作黄/红提示，**不阻断**生成与录制（见「字数硬、时长软」）。

5. Paragraph
Paragraph 是数据库内的文本单元，仅存储纯文字，来源为人工录入或 AI 生成。
每个 Paragraph 有一个 `paragraph_type`（全新数据属性，不借鉴老 audio 类型），用于分类和推荐匹配 Section 类型。
~~初始推荐类型（可扩展）：`intro`、`breath`、`verse`~~
**修订后口径（2026-09-23，扩充）**：`paragraph_type` 从 3 类扩充到与 section 语义对齐，推荐值：
`intro`、`place`、`posture`、`bridge`、`prelude`、`breath`、`verse`、`chorus`、`outro`。
（`intro` / `breath` / `verse` 保留兼容；`sec-nature` / `sec-bowl` 为纯音频，无对应 `paragraph_type`。）

### 六章固定模板（唯一口径）

顺序固定、不可改、不可重复；章内 Section 类型与顺序**固定不可改**。

| # | chapter_key | 章名 | Section 序列（固定） | 时长上限（原「固定时长」，已降级） | 字数预算 |
|---|-------------|------|---------------------|-----------------------------------|----------|
| 1 | `chapter-nature`  | 自然库 | `sec-nature` | 300s | 不判字数 |
| 2 | `chapter-bowl`    | 颂钵库 | `sec-bowl` | 30s | 不判字数 |
| 3 | `chapter-opening` | 问候库 | `sec-intro → sec-place → sec-posture → sec-bridge` | 130s | 30 + 40 + 50 + 50 = 170 字 |
| 4 | `chapter-breath`  | 呼吸库 | `sec-prelude → sec-breath` | 150s | 90 + 100 = 190 字 |
| 5 | `chapter-verse`   | 心语库 | `sec-verse → sec-chorus` | 270s | 150 + 40 = 190 字 |
| 6 | `chapter-closing` | 告别库 | `sec-outro` | 30s | 40 字 |

**章名与 Section 名以「Section 名 / 章节名权威对照表」（R21）为准**——本表、对照表与代码常量三者必须一致，不一致时以代码常量为源。

**管理员权限边界**：只能调整**各章时长上限**与**本章开关**；不能改章节顺序、不能重复章节、不能改章内 Section 类型与顺序。**（R10：UI 不得提供拖拽 / 增删 / 重复章控件；数据层 `normalizeMedTrack` 必须把脏文档折回本模板，见 §3.7）**

### Section 名 / 章节名权威对照表（R21，Zang 裁定 2026-09-24）

> **唯一权威＝代码常量；本表是镜像，不是源。**
> **新增 / 改名 Section 或章节，必须先改代码常量，再同步本表**；本表与代码常量不一致时，**一律以代码常量为准**并立即回改本表。
> 源文件：`packages/shared-utils/meditation-track-template.js`
> - Section 名源：`MEDITATION_SECTION_TYPE_LABELS`（**11 项**）
> - 章节名源：`MEDITATION_CHAPTER_LABELS`（**6 项**）

**章节名对照（6 项）**

| chapter_key | 章节名（常量值） |
|-------------|------------------|
| `chapter-nature` | 自然库 |
| `chapter-bowl` | 颂钵库 |
| `chapter-opening` | 问候库 |
| `chapter-breath` | 呼吸库 |
| `chapter-verse` | 心语库 |
| `chapter-closing` | 告别库 |

**Section 名对照（11 项）**

| section_type | Section 名（常量值） | 所属 chapter_key |
|--------------|---------------------|------------------|
| `sec-nature` | 自然 | `chapter-nature` |
| `sec-bowl` | 颂钵 | `chapter-bowl` |
| `sec-intro` | 开场问候 | `chapter-opening` |
| `sec-place` | 安顿 | `chapter-opening` |
| `sec-posture` | 坐姿 | `chapter-opening` |
| `sec-bridge` | 过渡 | `chapter-opening` |
| `sec-prelude` | 呼吸前奏 | `chapter-breath` |
| `sec-breath` | 呼吸正文 | `chapter-breath` |
| `sec-verse` | 心语正文 | `chapter-verse` |
| `sec-chorus` | 心语复唱 | `chapter-verse` |
| `sec-outro` | 告别 | `chapter-closing` |

**拼法校验（R18-② 组合格式）**：纯音频段分组标题 ＝ `{章节名} · {Section 名}（{section_type}）`，例「**自然库 · 自然（sec-nature）**」「**颂钵库 · 颂钵（sec-bowl）**」——按本表常量值拼写**正确，不回改**（R21 确认 R18-② 的拼法成立）。

### Section 时长上限与字数预算对照

| section_type | 所属 Chapter | 时长上限（原「固定」，已降级） | `target_char_count`（硬） |
|--------------|-------------|-------------------------------|---------------------------|
| `sec-nature`  | chapter-nature  | 300s | 不判字数（纯音频） |
| `sec-bowl`    | chapter-bowl    | 30s  | 不判字数（纯音频） |
| `sec-intro`   | chapter-opening | 20s  | ≈30 |
| `sec-place`   | chapter-opening | 30s  | ≈40 |
| `sec-posture` | chapter-opening | 40s  | ≈50 |
| `sec-bridge`  | chapter-opening | 40s  | ≈50 |
| `sec-prelude` | chapter-breath  | 70s  | ≈90 |
| `sec-breath`  | chapter-breath  | 80s  | ≈100 |
| `sec-verse`   | chapter-verse   | 120s | ≈150 |
| `sec-chorus`  | chapter-verse   | 150s | ≈40 |
| `sec-outro`   | chapter-closing | 30s  | ≈40 |

### 播放模型（双轨，唯一口径）

**保持双轨**（**不是**六章顺序单轨）：

| 轨 | 成员 `section_type` | 播放模式 | 音量（对齐 `MEDITATION_TRACK_VOLUMES`） |
|----|--------------------|----------|----------------------------------------|
| **背景轨 `background`** | `nature`、`bowl`（即 `sec-nature`、`sec-bowl`） | `loop` 铺底 | `0.33` |
| **人声轨 `voice`** | `opening`、`breath`、`verse`、`closing`（即 `sec-intro`/`sec-place`/`sec-posture`/`sec-bridge`/`sec-prelude`/`sec-breath`/`sec-verse`/`sec-chorus`/`sec-outro`） | `sequence` 顺序拼接 | `1` |

- 人声段顺序**由 Track 定义**（六章模板顺序），不依赖老 `compositionSettings.segments` 的时间轴。
- 背景轨在人声段之间**持续播放**（含留白期间）。
- 端侧仍为**两个 `Audio` 元素**实现（`apps/app/src/modules/meditate/MeditationPlayerScreen.jsx` 的 `backgroundAudioRef` / `voiceAudioRef`）。

### 15 分钟基准与留白填充

- 一次冥想仍以 **15 分钟（900 秒）为基准**（`DEFAULT_MEDITATION_SESSION_SECONDS = 15 * 60`）。
- 因**字数硬、时长软**：现有 9 段字数预算合计 **590 字**，慢读约 **3.3 分钟**，**远不足 15 分钟**。
- 因此**人声段之间用留白 / 颂钵 / 自然过渡填充**；**留白期间背景轨继续响**。
- **章时长公式**：`章实际时长 = 该章各 Section 实测时长之和 + 留白`（Section `duration` 一律以**录制实测**为准，不使用标称值）。
- 15 分钟为**基准/软目标**，不是硬截断点；超出由留白量调节，不做尾部截断。

### 留白配置层级（章间级）与两级留白叠加关系

- 留白参数**配置在章间级**：**只在六个 Chapter 之间**配置留白秒数，**不是** `section_type` 级。
- 需要**新增对应字段**：`med_tracks.chapters[].gap_after_seconds`（见 `med_tracks` 字段定义）。
- 留白层级为**章间**；Section 内部的段间静默属**录制拼接**产物（见「录制粒度」），两者层级不同、可同时存在。

#### 两级留白关系（G2，Zang 已裁定 2026-09-23）：独立叠加、互不抵消

- 公式：**`总留白 = Σ（录制拼接产生的段间静默） + Σ（各章 gap_after_seconds）`**
- **段间静默**：D1 逐 Paragraph 录制拼接的产物，作用层级＝**Section 内部**。
- **`gap_after_seconds`**：作用层级＝**Chapter 之间**。
- 两者**作用位置不同，不互相扣减、不互相替代**，均全额计入 Track 总时长；调整任一方都不改变另一方，做时长预算时**两者都要计入**。

#### 章间留白默认值（D2，Zang 已裁定 2026-09-23）

- **默认种子值**：六章之间共 **5 个位置**，每处 `gap_after_seconds = 141` 秒，留白合计 **705 秒**。最后一章（`chapter-closing`）之后固定 `0`。
- **Track 总长核算**：人声实测基准 **590 字 ≈ 197 秒**（慢读约 3 字/秒）+ 705 秒留白 = **902 秒 ≈ 15.0 分钟**，与 `total_target_seconds = 900`（15 分钟基准）吻合。
- **这是默认取值，可配、不是硬编码**：`gap_after_seconds` 逐章可配，Kevin 一句话即可改；**实现层禁止把 141 写死在代码里**，必须读 `med_tracks.chapters[].gap_after_seconds`。
- **常量与边界口径（R11，第一批验收裁定 2026-09-24）**：
  - **单一常量**：默认值唯一来源是 `MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT`（值 `141`，定义于 `packages/shared-utils/meditation-track-template.js`）；实现层不得另立第二处常量或裸字面量。
  - **末章无章间留白**：`chapter-closing` 之后固定 `0`，不套用默认值。
  - **禁用章的 gap 不计入总时长预估**：总时长 / 预估只累计 `chapters[].enabled === true` 的章（含其 `gap_after_seconds`）；被禁用章的留白**既不展示也不计入**。
  - ⚠ 与上文「902s ≈ 15.0 分钟」核算的关系：该核算前提是**六章全开**；有章被禁用时总长按本口径下降，`total_target_seconds = 900` 仍为**软目标**（不阻断、不补录）。

| 每处章间留白 | 留白总量（5 处） | 人声 + 留白 总长 | 相对 15 分钟基准 |
|--------------|-----------------|-----------------|------------------|
| **141s（默认）** | 705s | 197 + 705 = **902s** | ≈ **15.0 分钟** |
| 90s | 450s | 197 + 450 = **647s** | ≈ **10.8 分钟** |
| 60s | 300s | 197 + 300 = **497s** | ≈ **8.3 分钟** |

> 人声实测基准说明：9 个文本类 Section 字数预算合计 590 字，按慢读 3 字/秒 ≈ 197 秒（≈3.3 分钟），与上表对照口径一致。
> `total_target_seconds` 为**软目标**：留白取小值时不阻断、不补录，仅总长低于基准。

### 录制与转码链路（全程无 TTS）

1. **文字先行**：文字由 **AI 生成**，写入 `med_paragraphs`。
2. **文本编排**：管理员在「原始音频库」用 Paragraph 组成 Section-Raw（`paragraph_ids` 有序）。
3. **真人朗读**：由**真人朗读**后上传，**不存在 TTS**。
4. **录制链路**：**后台网页录音（浏览器 `MediaRecorder`）→ 服务端/云函数转码 raw → 双格式交付（Opus 主体 + mp3 兜底，D3）→ 关联 Section-Raw**。
   - **转码参数与执行形态（R34 定稿，2026-09-24；**覆盖 R33 的 32k 单声道**）**：Opus 主体 `-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000` → `.ogg`；mp3 兜底 `-c:a libmp3lame -b:a 48k -ac 2 -ar 44100`；**单次 ffmpeg 调用双路输出**；**`-ac 1`（下混单声道）已作废**（附录 A.2 / **A33**）。详见「转码参数定稿与实现约束（R33 初定 → R34 改定）」，实测数据见该节 **R34-③**。
   - **注意（R33-⑦ 维持、R34 更正声道）**：录音原件（webm）**无 Duration 头**（原件 `duration=N/A`），时长**以客户端实测为准**；**原件是双声道，输出同样保留立体声（`-ac 2`）**——任何「输入即单声道」或「输出必为单声道」的推断都是错的。
   - **执行与队列（R35）**：执行器现状、队列分区与字段权威见新增的「**转码执行器实现与队列分区（R35）**」小节。
5. **录制粒度（D1，Zang 已裁定 2026-09-23）**：定为 **逐 Paragraph 录制 + 按顺序拼接成 Section 音频**。
   - 拼接产生的**段间静默即留白的实现点**（与章间 `gap_after_seconds` 独立叠加，见「两级留白关系」G2）。
   - 同一 Paragraph 被多个 Section-Raw 引用时**不必重录**（录制产物以 Paragraph 为单位复用）。
   - **整段 Raw 一次录完不采纳**；`med_section_raws.record_granularity` 默认 `'paragraph'`。
   - 一句话可改（Kevin）。
6. **废弃清单（老规则 A，全部作废）**：
   - `tts-proxy`（`apps/web/src/admin/utils/ttsService.js` 调 `/api/tts-proxy`）
   - `is_ssml`（`meditation-database-normalizers.js`、`database.js` 的 `isSSML`）
   - `<break time="1s"/>` 毫秒归一化（`MeditationPage.jsx` 的 break 正则）
   - 音频库 tab 的「TTS 文本」与「AI 试听」入口
   - 老 `tts_text` 数据**不迁移、直接废弃**。

### 随机性下沉到 Section 层

- 同一 `section_type` 下**允许存在多条候选 Section 音频**（来自不同 Section-Raw），运行时**抽一条**。
- **Track 本身固定可复现**：章开关、时长上限、章间留白、Section 顺序均确定，唯一随机点在 Section 候选抽选。
- 语义来源：老 preset 的 `groupSelections`（group 层抽选）**平移为 Section 候选池抽选**。
- **抽中候选固化（D7，Zang 已裁定 2026-09-23）**：运行期抽中的 Section 候选**固化写入冥想会话记录**，用于复现与统计。会话记录须保存 `section_type` → 抽中 `med_section_audios._id` 的映射，并记录 Track 版本号（`med_tracks.version`）以便可复现。一句话可改（Kevin）。

### 段落改动级联（stale）

- Paragraph 被修改后，**引用它的 Section-Raw 标记 `stale` + 提示重录**。
- **判定依据（R19，Zang 裁定 2026-09-24）**：stale 判定**只看文本快照 / 文本比对**——即把当前 Paragraph 文本与录制快照（`med_section_raws.text_snapshot` / `med_section_audios.paragraph_ids_snapshot` ＋ `text_snapshot`）比较；**`revision` 不参与判定**（`revision` 仅作审计追溯，见 `med_paragraphs.revision` 字段定义）。
- **级联触发条件（R19，同条裁定）**：**级联只在段落文本实际变化时触发**——仅改 `tags` / `paragraph_type`（**文本未变**）**不得**把 Section-Raw 及其候选音频标成 stale；**禁止用 `revision` 比对判 stale**（R5 规定 `revision` 无条件 `+1`，按它比对会把「只改标签」误判为文本变更）。
- **落地状态（K9）**：保存路径已按「trim 归一后的文本比较」决定是否触发级联（`revision` 仍无条件 `+1`，符合 R5）——**已实现（Kong）、待质检确认**（复验项见质检计划 §8.1）。
- **不自动作废、不阻断音频可用**：已录制的 Section 音频仍可用，仅提示文本已变更。
- 实现字段：`med_section_raws.stale` / `stale_reason` / `stale_paragraph_ids` / `stale_at`，配合录制时快照 `text_snapshot`。**（R4：`stale_paragraph_ids` 语义分两段——第一批只写本次新增差集、第二批写累积不一致集合；见 `med_section_raws` 字段定义与附录 C / C3）**

### 字数硬、时长软

| 约束 | 字段 | 强度 | 行为 |
|------|------|------|------|
| 字数目标 | `target_char_count` | **硬** | 作为编排/录制依据 |
| 字数状态 | `word_count_status`（ok / slightly_over / over / slightly_under / under） | **仅提示** | 黄/红标记，**不阻断**生成（阈值见 G1） |
| Chapter / Section 时长 | `max_duration_seconds` / 时长上限 | **软（上限/参考值）** | 超过上限时**仅告警、不阻断**（G4）；不截断 |
| 实际时长 | `med_section_audios.duration` | 实测 | 一律以录制结果推导 |

#### 字数状态阈值（word_count_status）（G1，Zang 已裁定 2026-09-23）

- **偏差定义**：`偏差 = (current_char_count - target_char_count) / target_char_count`（仅当 `target_char_count > 0`）。
- **阈值表**（数值**集中定义于此一处**，便于调参；实现层不得在其他文件重复定义同一组数值）：

| `word_count_status` | 偏差区间 | 色标 | 阻断 |
|---------------------|----------|------|------|
| `ok` | `\|偏差\| ≤ 10%` | 绿 | 否 |
| `slightly_over` | `10% < 偏差 ≤ 25%` | 黄 | 否 |
| `slightly_under` | `-25% ≤ 偏差 < -10%` | 黄 | 否 |
| `over` | `偏差 > 25%` | 红 | 否 |
| `under` | `偏差 < -25%` | 红 | 否 |

- **边界口径**：**恰好 10% 视为 `ok`**；**恰好 25% 归入 `slightly_*`**（只有 `> 25%` 才是 `over` / `under`）。
- **常量（命名以代码为准，R25）**：唯一常量落点＝`packages/shared-utils/meditation-track-template.js` 的 `MEDITATION_WORD_COUNT_DEVIATION_THRESHOLDS = { slight: 0.1, severe: 0.25 }`（键名 `slight` ＝ 10% 档、`severe` ＝ 25% 档）；后台提示、统计与端侧复用同一常量，实现层不得另立第二处数值。原文所载 `MED_WORD_COUNT_THRESHOLDS = { ok: 0.10, hard: 0.25 }` 为**从未落地的旧命名，已废弃**（R25，追溯见附录 A.2 / A28）；原建议的新模块 `meditation-word-count.js` **从未创建、已废止**，勿再按该文件名查找。
- **例外**：纯音频段（`sec-nature` / `sec-bowl`）无文本、`target_char_count` 为 0，**不写入 `word_count_status`**（即「不适用」，**不得写成 `ok`**）——代码口径（R25）：`resolveMeditationWordCountStatus` 对 `target ≤ 0` 返回**空串**，UI 显示「未计算」；不进入本表计算（见 G3）。
- 一句话可改（Kevin）。

#### 字数目标 vs 时长上限：不存在真冲突（G4，Zang 已裁定 2026-09-23）

- **不同轴，无真冲突**：字数目标（`target_char_count`，硬）约束**文本编排与录制内容**；时长上限（`max_duration_seconds` 与各章时长上限，软）约束**片段长度**。字数达标不推出时长超限，反之亦然，**规范中不存在「字数硬要求 vs 时长上限」的真冲突**。
- **时长上限只告警、不阻断**：超过上限时给告警提示（红字/徽标），**不阻断**保存、录制、发布与播放；且因**实测语音时长远小于上限**（9 段合计 590 字 ≈ 197s，单段实测普遍远低于 20s~300s 的上限），该告警**几乎不会触发**。
- **字数目标只提示、不阻断**：`target_char_count` 是编排/录制依据；`word_count_status` 仅黄/红提示，**不阻断**生成与录制（阈值见 G1）。
- 一句话可改（Kevin）。

### 时段键统一（D4，Zang 已裁定 2026-09-23）

- `web` / `app` 使用 `morning`（`packages/shared-utils/meditation-session-plan.js` 的 `getMeditationSessionKey`）。
- 小程序（`apps/miniprogram/src/utils/meditation.js` 的 `getMeditationSlotKey`）使用 `dawn`。
- **裁定：统一为 `morning`**。小程序 `dawn` 由 **Kong 在实现时修正**（实现项，不是规范项）；**本文档仅登记、不改代码**。一句话可改（Kevin）。

---

**新数据结构与集合（paragraph + section-raw 专用，新结构优先，未来完全替代老结构）**

### med_paragraphs（CloudBase 集合）
**字段定义**（类型为 CloudBase 推荐）：
- _id (string, 主键)
- text (string, 必填，纯文本内容)
- tags (array<string>, 默认 [])
- category (string, 可选)
- ~~paragraph_type (string, 必填，推荐值：intro / breath / verse)~~
  paragraph_type (string, 必填，推荐值：**intro / place / posture / bridge / prelude / breath / verse / chorus / outro**；老值 intro / breath / verse 兼容)
- created_at (string, ISO 日期)
- updated_at (string, ISO 日期)
- created_by (string, 管理员 UID)
- usage_count (number, 默认 0，用于星级)
- source (string, 'manual' | 'ai')
- ai_rewritten_from (string, 可选，原 paragraph _id)
- **char_count (number, 新增，可选，text.length 冗余，便于 Section-Raw 字数汇总)**
- **revision (number, 新增，默认 1，每次编辑 +1)** — **递增口径（R5，第一批验收裁定 2026-09-24）**：**每次成功保存 +1**，**含同一弹窗会话内的连续保存**（必须基于最新已保存值自增，不得回退到打开弹窗时的旧值）。
  - **用途边界（R19，Zang 裁定 2026-09-24）**：`revision` **仅作审计追溯**，**不参与 Section-Raw 的 stale 判定**——**禁止用 `revision` 比对判 stale**；stale 只看文本快照 / 文本比对（见「段落改动级联（stale）」）。本字段原释义「用于 Section-Raw 的 stale 比对」**已废弃**（追溯见附录 A.2 / A26）。

**索引建议**：
- paragraph_type + created_at（复合，列表筛选）
- usage_count（降序，星级排序）
- created_by + created_at

**权限建议**（CloudBase 数据库权限）：
- 仅 partner 管理员角色可读写
- 匿名用户无权限

**paragraph_type → section_type 推荐对应表（新增）**

| paragraph_type | 推荐 section_type | 所属 Chapter |
|----------------|-------------------|-------------|
| `intro`   | `sec-intro`   | chapter-opening |
| `place`   | `sec-place`   | chapter-opening |
| `posture` | `sec-posture` | chapter-opening |
| `bridge`  | `sec-bridge`  | chapter-opening |
| `prelude` | `sec-prelude` | chapter-breath |
| `breath`  | `sec-breath`  | chapter-breath |
| `verse`   | `sec-verse`   | chapter-verse |
| `chorus`  | `sec-chorus`  | chapter-verse |
| `outro`   | `sec-outro`   | chapter-closing |
| （无）    | `sec-nature` / `sec-bowl` | chapter-nature / chapter-bowl（纯音频，不经 Paragraph 文本链路） |

> 推荐匹配**不强制**（沿用原口径）。

### med_section_raws（CloudBase 集合）
**字段定义**：
- _id (string)
- section_type (string, 如 'sec-intro')
- paragraph_ids (array<string>, 有序)
- target_char_count (number) — **硬约束**
- current_char_count (number)
- word_count_status (string, 'ok' | 'slightly_over' | 'over' | 'slightly_under' | 'under') — **仅提示，不阻断**；阈值集中定义见「字数状态阈值（word_count_status）」（G1）
- ~~audio_id (string, 关联 med_section_audios._id，可选)~~
  audio_id (string, **已废弃（D8，Zang 已裁定 2026-09-23）**：历史字段，**只读兼容、不再写入**；语义＝最近一次关联的音频，权威口径见 `audio_candidates`)
- **audio_candidates (array<string>, 新增，关联 med_section_audios._id 列表，1..N 候选池，运行时抽一条)**
- **stale (boolean, 新增，默认 false，引用 Paragraph 被改后置 true)**
- **stale_reason (string, 新增，可选)**
- **stale_paragraph_ids (array<string>, 新增，触发 stale 的 Paragraph)** — **语义分两段（R4，第一批验收裁定 2026-09-24）**：
  - **第一批实现口径**：只写**本次实际新增**，即本次触发 stale 的段落与该 raw 现有 `paragraph_ids` **去重后的差集**。
  - **第二批目标口径**：写**当前与录制快照（`med_section_raws.text_snapshot` / `med_section_audios.paragraph_ids_snapshot`）不一致的段落集合（累积）**，且**不因本次无新增而清空**。理由：**下游要用它展示「哪几段要重录」**，只有累积集合才准。
  - **已知差异＝第二批待办（已裁定，不自行调和）**：以上两种语义**不一致**；第一批期间该字段**不可作为完整重录清单依赖**（可能出现 `stale = true` 而 `stale_paragraph_ids = []` 的中间态，此时**以 `stale` ＋ 快照比对为准**），收敛归第二批，见附录 C / C3。
  - **中间态裁定（R18-①，Zang 裁定 2026-09-24）**：`stale = true` 且 `stale_paragraph_ids = []` 的中间态**第一批期间接受**（**不视为缺陷、不要求第一批回修**）；第一批期间该字段**不得当作完整重录清单**使用，一律以 **`stale` ＋ 快照比对**为准；沉淀为累积语义仍归**第二批**（R4 / 附录 C / C3）。
- **stale_at (string, 新增，ISO 日期)**
- **text_snapshot (string, 新增，录制时的拼接文本快照，用于与当前 Paragraph 比对)**
- **record_granularity (string, 新增，'paragraph' | 'section')** — **默认 `'paragraph'`（D1，Zang 已裁定 2026-09-23）**；`'section'` 为历史取值，不再使用（仅登记兼容）。
- **recorded_at (string, 新增，最近一次录制完成时间)**
- created_at (string)
- updated_at (string)
- created_by (string)

> **纯音频段例外（G3，Zang 已裁定 2026-09-23）**：`sec-nature` / `sec-bowl` **不创建 Section-Raw 记录**（无文本、不判字数），其录制/上传直接产出 `med_section_audios`（`section_raw_id` 为空 / 不适用）。因此本集合**只承载 9 个文本类 `section_type`**，`target_char_count` / `current_char_count` / `word_count_status` / `stale*` 字段对纯音频段一律不适用。

**索引建议**：
- section_type + created_at
- created_by
- **stale + section_type（新增，重录提示列表）**

**权限建议**：同 med_paragraphs，仅管理员。

### med_section_audios（CloudBase 集合）
**字段定义**：
- _id (string)
- section_raw_id (string, **条件必填**) — 文本类 `section_type` 必填，关联 `med_section_raws._id`；**纯音频段（`sec-nature` / `sec-bowl`）允许为空 / 不适用（G3，Zang 已裁定 2026-09-23）**
- **section_type (string, 必填（D3 后提升为必填），冗余，便于按 section_type 抽选候选池)**
- file_id (string) — 转码后 **Opus 主体**的 fileId
- audio_url (string) — Opus 主体 URL
- duration (number) — **实测时长（秒）**，取自 Opus 主体
- mime_type (string) — 目标 `audio/ogg; codecs="opus"`
- **transcoded_formats (array<string>, 新增（D3），本条音频已完成的交付格式，取值 `'opus'` / `'mp3'`；双格式齐备时为 `['opus','mp3']`，只有 `['opus']` 视为未完成交付)**
- **fallback_file_id (string, 新增（D3），mp3 兜底 fileId，可选)**
- **fallback_audio_url (string, 新增（D3），mp3 兜底 URL，可选)**
- **fallback_mime_type (string, 新增（D3），固定 `'audio/mpeg'`，可选)**
- **label (string, 新增（G3），纯音频段（`sec-nature` / `sec-bowl`）的显示名，可选；文本类段不使用)** — **命名口径（R1，第一批验收裁定 2026-09-24）**：
  - **前缀用章节名**（不是 `section_type` 名、不是 raw 文本）：`sec-nature` → 「**自然库 take-N**」、`sec-bowl` → 「**颂钵库 take-N**」（与 Track 章节命名一致）。
  - **take 序号**：`N` ＝ **该 `section_type` 容器内已有候选数 + 1**（即同 `section_type` 下的第 N 条候选音频，按候选总数递增，不从 0 起）。
  - **文本类 Section-Raw 的候选音频不使用 label**：保持**空串 `''`**（不写占位值、不写段落文本）。
- **original_file_id (string, 新增，raw 原始录制/上传文件 fileId)**
- **source_kind (string, 新增，'recording' | 'upload' | 'legacy-import')**
- **paragraph_ids_snapshot (array<string>, 新增，该条音频对应的 Paragraph 顺序快照)**
- **text_snapshot (string, 新增，该条音频对应的文本快照)**
- **char_count (number, 新增，该条音频的实际字数)**
- **stale (boolean, 新增，默认 false，随所属 Section-Raw 一起标记)**
- **recorded_by (string, 新增，录制/上传管理员 UID)**
- created_at (string)
- updated_at (string)

**索引建议**：
- ~~section_raw_id（唯一关联）~~ → **section_raw_id（非唯一，1 条 Raw 对应 1..N 条候选音频）**
- **section_type + created_at（新增，候选池抽选）**
- **section_type + section_raw_id（新增（G3），纯音频段 `section_raw_id` 为空，按 `section_type` 单独取池）**
- created_at

**权限建议**：同上。

### med_tracks（CloudBase 集合，新增）

**定位**：承接 Track 配置（章节开关、各章时长上限、章间留白秒数、关联 `section_type`、Track 元信息/名称/启用状态）。**现有 `compositionSettings.segments` 属于即将下线的老模型，不复用。**

**字段定义**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 是 | 主键 |
| `track_key` | string | 是 | 业务键（如 `track-default`），用于幂等与单例约束 |
| `name` | string | 是 | Track 名称（后台展示 / 端侧展示） |
| `description` | string | 否 | 备注 |
| `enabled` | boolean | 是 | Track 启用状态，默认 `true` |
| `is_default` | boolean | 是 | 是否为当前发布/默认 Track，默认 `true` |
| `version` | number | 是 | Track 版本，用于**可复现**追溯；**递增口径（R5）**：**新建从 `1` 起、每次成功保存 +1**（不得回退、不得只写死 `1`） |
| `total_target_seconds` | number | 是 | 基准总时长，默认 `900`（= 15 分钟基准，**软目标**） |
| `chapters` | array&lt;object&gt; | 是 | 六个 Chapter 配置，**长度必须为 6**，数组顺序即六章固定模板顺序 |
| `chapters[].chapter_key` | string | 是 | 枚举：`chapter-nature` / `chapter-bowl` / `chapter-opening` / `chapter-breath` / `chapter-verse` / `chapter-closing` |
| `chapters[].order` | number | 是 | 1..6，**固定不可修改** |
| `chapters[].label` | string | 否 | 章中文名（自然库 / 颂钵库 / 问候库 / 呼吸库 / 心语库 / 告别库） |
| `chapters[].enabled` | boolean | 是 | **章开关**（管理员可调），默认 `true` |
| `chapters[].max_duration_seconds` | number | 是 | **章时长上限**（管理员可调，非固定时长）：300 / 30 / 130 / 150 / 270 / 30 |
| `chapters[].gap_after_seconds` | number | 是 | **章间留白秒数**（留白配置层级＝章间级）；**默认种子值 `141`（5 个位置合计 705s，Zang 已裁定 2026-09-23 / D2）**；最后一章（`chapter-closing`）固定 `0`；**可配，禁止在代码中硬编码 141** |
| `chapters[].section_types` | array&lt;string&gt; | 是 | 该章 fixed Section 序列，**只读**，由模板决定 |
| `background_track` | object | 是 | 背景轨配置：`section_types: ['sec-nature','sec-bowl']`、`playback_mode: 'loop'`、`volume: 0.33` |
| `voice_track` | object | 是 | 人声轨配置：`section_types: ['sec-intro','sec-place','sec-posture','sec-bridge','sec-prelude','sec-breath','sec-verse','sec-chorus','sec-outro']`、`playback_mode: 'sequence'`、`volume: 1` |
| `created_at` | string | 是 | ISO 日期 |
| `updated_at` | string | 是 | ISO 日期 |
| `created_by` | string | 是 | 管理员 UID |
| `updated_by` | string | 否 | 最近修改管理员 UID |

**索引建议**：
- `track_key`（**唯一**）
- `enabled` + `is_default`（列表 / 发布查询）
- `updated_at`（降序）

**权限建议**（与现有三个 `med_*` 集合同口径）：
- 仅 partner 管理员角色可读写
- 匿名用户无权限
- ⚠ 端侧（app / 小程序）播放需读取 Track 与 Section 音频：**读取通道定为新增只读云函数**（照 `getUserPhone` / `getHomePageData` 的既有模式；D6，Zang 已裁定 2026-09-23），端侧一律经云函数读取，**`med_*` 集合对匿名用户保持关闭**（不开放匿名读、不做白名单直读）。**（v4.8：D6 的**入参 / 出参契约已定稿并实现**，见「环境与权限（实测结论）」**R39 ①~⑫**，函数＝`cloudfunctions/meditation-read/`）。**（R30，Zang 裁定 2026-09-24：D6 已由「已裁定的读取通道」升为第二批**硬前置**——据 R28-①「仅创建者可读」，端侧直连 DB 读 `med_tracks` / `med_section_audios` 只会得到**静默空集**；D6 在第二批执行顺序中的位置见 §7）**

**环境前置（R12 → ✅ 已关闭：R37-②，2026-09-24）**

- **R12 原始口径（历史）**：`med_tracks` **是需人工创建的集合**（环境 `liwu-d8gek6jjdab1d087c`；须在 CloudBase 控制台手工建集合，无代码路径可自动创建）。
- ✅ **现状（R37-②，2026-09-24 实测确认）：集合已创建、落库类验收无阻塞项。** 证据链＝① 读取 `res.code` **无 `code` / `message`**（不是 `DATABASE_COLLECTION_NOT_EXIST`）；② **正对照同形**（`med_section_raws` 用同一读法得到同样形态，排除「读法本身失灵」）；③ **`add` 成功**（排除「集合不存在却假成功」的假否定）；④ **两轮端到端写入 / 读回 / 删除均成功**（R7 g/h 的**数据层与 UI 层**均通过，见 §3.7「第一批 UI 点击路径验收结果」）；⑤ **测试文档已删除**。
- **由此作废**：「集合缺失 ⇒ 一切 Track 落库类验收（R7 写入校验、`version` 递增等）一律标「阻塞」」的旧口径（附录 A.2 / **A34**；附录 C / **C7 已关闭**）。**自本版起，Track 落库类验收不得再标「阻塞」，也不得缺省通过**——须按实际结果判 PASS / FAIL。

**权限现状与第二批目标（R13，第一批验收裁定 2026-09-24；适用于全部 `med_*` 集合）**

| 维度 | 现状（第一批验收实测） | 第二批目标 |
|------|------------------------|-----------|
| `med_*` 集合写权限 | **匿名会话可写「其本会话自己创建的」文档**（质检全程以匿名会话登录写入成功）；**对非本人创建的文档：读返回静默空集 `{data:[]}`、写返回静默 `{updated:0}`**（R28-① 实测，无错误码） | **收紧为「仅 partner 管理员可写」**；端侧一律走 D6 只读云函数，不开放匿名读写。**R29：收紧是「成套动作」且有前置依赖——必须先解决后台身份模型，方案待人工拍板（附录 B.7）** |
| `app_settings`（冥想相关 key） | **所有身份可读**；写侧**已按 R40-⑧ 更正**：**非属主 update 既有文档 ＝ 静默 `{updated:0}`**（**不报错、文档体 sha256 与 `updated_at` 前后一致 ⇒ 未生效**；`requestId 19a4f236da0e08` / `048fa11b06d8d`）、**非属主 `add` 新建 ＝ 成功**（`requestId 82410668e37ab`；删除复核 `deleted:1`、15→16→15）——**旧表述「非创建者写被显式拒（含同值更新与新建均 `DATABASE_PERMISSION_DENIED`）」作废**（R28-② / **R40-⑧**） | 维持管理员可写；老四 tab 冻结待下线（D10） |

- **规范口径不变**：`med_*` 权限的规范口径仍是「**仅 partner 管理员可读写、匿名无权限**」（D6 未变）；匿名可写属**实现现状偏差 / 已知安全缺口**，收敛动作归**第二批**（附录 C / C5）。**R16（Zang 裁定 2026-09-24）就此条给出完整口径，见下条。**
- **R16 裁定（Zang，2026-09-24）：口径不变 + 第一批接受 + 第二批收紧 + 生产待人工确认**
  - ① **规范口径不变**：仅 partner 管理员可读写、匿名无权限（D6 不变，**不为迁就现状改规范**）。
  - ② **匿名可写＝实现现状偏差 / 已知安全缺口**：**第一批期间接受**（依据：dev 环境、非生产），**不要求第一批回修**，也不得据此把规范口径改为「匿名可写」。**R28-① 精确化（2026-09-24，结论不变）**：实测的「匿名可写」**只适用于匿名会话对「本会话自己创建的」文档**；对**非本人创建**的文档，读返回**静默空集**、写返回**静默 `{updated:0}`**——判据**不得**再用「匿名能写成功」概括全部 `med_*` 写入（正本「环境与权限」节）。
  - ③ **第二批必须收紧**：收紧为「仅 partner 管理员可写」，端侧一律走 D6 只读云函数（并入附录 C / C5）。**⚠ 不得单独执行——见下条 ⑤。**
  - ④ **待人工确认项（新增）**：需**人工在生产环境确认 CloudBase 实际权限规则**（控制台安全规则是否与规范口径一致）；确认结论回填本表与附录 C / C5。
  - ⑤ **收紧＝成套动作，且有前置依赖（R29，Zang 裁定 2026-09-24）**：**禁止只改权限**。在**匿名会话**下（旧称 `dev_login`，R36-① 更正）把 `med_*` 改为「仅管理员可写」会导致**静默失效**——越权写**只返回 `updated:0`、不报错**（`app_settings` 就是「**读得到、越权写不报错却静默不生效**」的既有先例：非属主 update 既有文档返回**静默 `{updated:0}`**、非属主 `add` **可成功**——**旧表述「写不了、连新建都被拒」已按 R40-⑧ 作废**，见「环境与权限」R28-②）；管理员会**以为保存成功而实际没写**。因此**执行顺序固定为：先解决后台身份模型（非匿名登录 ＋ 管理员角色）→ 再收紧 `med_*` 权限**。三个候选方案（含推荐）见**附录 B.7 待人工拍板项**；**未拍板前不得动任何权限规则**。
  - ⑥ **与 D6 的关系（R30）**：无论最终选哪个方案，端侧读取都必须先具备 **D6 只读云函数**（**硬前置**，见 §7）；三方案的差异在**后台写侧身份模型**与**端侧读通道**（方案 1 / 3 走云函数、方案 2 直连 DB）。
- **验收前置（硬）**：凡**依赖 `app_settings` 写入**的验收（`saveMeditationCalendar` / `saveMeditationCompositionSettings` / `saveMeditationAudioLibrary` / `saveMeditationLibrary`）**必须在管理员会话下进行**；**匿名会话下得到的写入结论无效**——写被拒是环境预期，既不能判为缺陷，也不能判为通过。
- **`med_*` 权限类用例的判据（R28-①，硬）**：非创建者读 `med_*` **返回静默空集 `{data:[]}`（无 `code` / `message`）**、写**返回静默 `{updated:0}` / `{deleted:0}`**——**不是** `DATABASE_PERMISSION_DENIED`；**`app_settings` 的越权写同样不报错**（非属主 update 既有文档＝**静默 `{updated:0}`**、非属主 `add`＝**成功**，见 R28-② / **R40-⑧**）——**「只有 `app_settings` 的写被拒才是显式 `DATABASE_PERMISSION_DENIED`」的旧表述作废，全文不得再写**。判「有无权限」必须同时给出**身份（是否创建者）**与**返回值**两项（质检纪律见质检计划 §0.1 / R31-②）。

**迁移说明**：老的 meditationAudioLibrary / meditationLibrary 中的音频记录（含 tts_text）未来可直接删除，不做迁移。Section-Raw 是文本前置（对应 Track 结构中的 Section 文本来源），Section 是**真人朗读录制**后的实体音频单元。paragraph_type 与 section_type 推荐匹配但不强制。

## 集合与代码映射

> **状态口径（R26，Zang 裁定 2026-09-24）**：本表「代码状态」列**以当前代码为准**（`apps/web/src/admin/services/database.js` / `apps/web/src/admin/components/Dashboard/MeditationPage.jsx` / `packages/shared-utils/meditation-*.js`），已**逐行校对**。**原「当前为零代码」「新增（零代码）」等措辞已废弃**——`med_section_audios` 与 `med_tracks` **均已有实现代码**。

| CloudBase 集合     | 代码中映射 / 说明（代码状态，R26 逐行校对） |
|--------------------|-------------------|
| med_paragraphs     | 新主数据源，**已有实现代码**。Paragraph Tab 直接读写此集合（`DatabaseService.getMedParagraphs` / `createMedParagraph` / `updateMedParagraph` / `deleteMedParagraph`；另有 `getMedParagraphsByIds` / `resolveMedParagraphTextsByIds` 供 Section-Raw 编排与快照比对复用）。**未落地项**：`getMedParagraphs` 目前**原样返回文档、未经 normalizer**，`normalizeParagraph` / `toParagraphPayload` **当前不存在**（仍属「未来新增」，勿按该函数名查找）。 |
| med_section_raws   | Section-Raw Tab 核心，**已有实现代码**：`getMedSectionRaws` / `createMedSectionRaw` / `updateMedSectionRaw`、`getMedSectionRawsByParagraphId` / `getMedSectionRawById` / `getMedSectionRawSnapshotById`、`cascadeMedSectionRawsStaleByParagraph` / `markMedSectionAudiosStaleByRawId`、`appendMedSectionRawParagraphs`、`attachMedSectionAudioToRaw` / `detachMedSectionAudioFromRaw`；写入经 `assertCloudBaseWriteResult` / `assertCloudBaseCreateResult`。段落编排、字数与状态、stale 级联、录制快照均落地。**未落地项**：**无 Section-Raw 删除路径**（第一批只实现段落删除与候选音频删除）——**已登记挂账 C9（低危、非阻塞；第二批若做需连带处理候选音频与引用，R32 同轮）**。 |
| med_section_audios | **已有实现代码**（原「当前为零代码」措辞**已废弃**，R26）。音频唯一口径，1 条 Raw ↔ 1..N 条候选音频。`database.js`：`getMedSectionAudios` / `getMedSectionAudiosByContainer` / `createMedSectionAudio` / `updateMedSectionAudio` / `deleteMedSectionAudio`（`packages/shared-utils/meditation-section-audio.js` 提供 `normalizeMedSectionAudio` / `toMedSectionAudioPayload` / `MEDITATION_SECTION_AUDIO_COLLECTION`）。`MeditationPage.jsx`：**原始音频库**子 Tab 的网页录音（`MediaRecorder`）/ 文件上传 / 双格式预览 / 删除，以及**「纯音频段」区块**（`sec-nature` / `sec-bowl` 无 raw、直建音频）。上传/转码后回写 `med_section_raws.audio_candidates`；最终音频路径＝Opus 主体 + mp3 兜底（D3）。状态：**已实现（Kong）、待质检确认**。 |
| **med_tracks**     | **已有实现代码**（原「新增（零代码）」措辞**已废弃**，R26）。Track 配置唯一落点，取代 `compositionSettings.segments`。`MeditationPage.jsx` 的「**冥想轨道**」子 Tab（`SUB_TABS` key `med-tracks`，`renderMedTracksTab` → `MeditationTracksTab`）＋ `database.js` 读写（`getMedTracks` / `createMedTrack` / `updateMedTrack` / `deleteMedTrack`——**`deleteMedTrack`＝保留的服务 API、当前无 UI 入口**（由质检 / 清理脚本调用），**不得当死代码删除**（R38-① 复验入口，见 §3.7）；`packages/shared-utils/meditation-track-normalizers.js` 的 `normalizeMedTrack` / `toMedTrackPayload` 把脏文档折回六章模板，R10）。**✅ 集合已创建（R37-② 关闭，2026-09-24）：落库类验收无阻塞项**——证据＝`res.code` 无 `code` / `message` ＋ `med_section_raws` **正对照同形** ＋ **`add` 成功**（排除假否定）＋ **两轮端到端写入 / 读回 / 删除成功**（R7 g/h 数据层与 UI 层均通过），测试文档已删。**Track 落库类验收（含 R7 写入校验、`version` 递增）自本版起须按实际结果判 PASS / FAIL**；原「未创建 ⇒ 标阻塞」口径作废（附录 A.2 / **A34**；附录 C / C7 已关闭）。 |

**过渡规则**：
- 老代码（meditationAudioLibrary、meditationLibrary、compositionSettings、meditationCalendar）**冻结只读/兼容**，不再新增能力。
- 新 Tab 完全基于 `med_*` 集合（`med_paragraphs` / `med_section_raws` / `med_section_audios` / `med_tracks` 均**已有实现代码**，状态＝**已实现（Kong）、待质检确认**）。
- **老四 tab 现状（R26 校对）**：入口仍可见，代码仍保留可写链路（`onUpdate` 传入 + 「旧版数据」提示条）；**「冻结只读」是规范口径、尚未在代码中加只读闸门**——入口隐藏与只读收敛随 **D10** 执行，前置按 **R20-②** 收紧（须同时满足 `med_tracks` 就绪与 R7 端到端通关）。

## 音频格式与转码规范（从现有代码提取并固化）
当前代码对音频格式有一套清晰且一致的处理思路（合理，已确认）：

- **原始输入**：~~TTS 或~~管理员上传优先使用 MP3（路径示例：`meditation-audio-raw/{type}/{group}/{id}.mp3`）。
  **修订（2026-09-23）**：原始输入来源改为**浏览器 `MediaRecorder` 网页录音** + 管理员上传。浏览器录音原始编码为 `audio/webm; codecs="opus"`（Chromium）或 `audio/mp4`（Safari），均先落 raw 再统一转码。路径（**已定稿，第一批实现落地**，追溯见附录 A.2 / A25、B.4）：`meditation-audio-raw/{section_type}/{section_raw_id 或 'audio-only'}/take-{n}.{ext}`。
  ~~TTS 输出为 MP3~~ 已废弃。
- **最终交付（D3 修订，2026-09-23）**：**双格式——Opus 主体 + mp3 兜底**（依据与行为见下文「交付格式与 C 端兜底策略」）。同一 take 产出两个文件：
  - Opus 主体：路径示例 `meditation-audio/{section_type}/{section_raw_id}/take-{n}.ogg`，MIME `audio/ogg; codecs="opus"`（**R33-⑨ 收敛**：容器定稿 `.ogg`，与代码 `meditationAudioCapture.js` 的 `{ mime_type: 'audio/ogg;codecs=opus', extension: 'ogg' }` 一致；原示例 `.opus` 为历史写法，同一 Ogg Opus 容器、同一 MIME，**路径结构不变、只统一扩展名写法**；**不得出现 `.webm` 扩展名**）。
  - mp3 兜底：路径示例 `meditation-audio/{section_type}/{section_raw_id}/take-{n}.mp3`，MIME `audio/mpeg`。
  - （**路径已定稿**：`{section_raw_id}` 对纯音频段 / 无 raw 时用容器目录 `audio-only` 占位，见 A25 / B.4、G3；**不存在 `{section_type}/pure/` 目录**，勿沿用）
- **转码参数（R34 定稿，2026-09-24；**覆盖 R33 的 32k 单声道口径**）**：
  - **Opus 主体（定稿）**：`-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000`（**硬 CBR ＋ 立体声**；依据与实测见「转码参数定稿与实现约束（R33 初定 → R34 改定）」）。
  - **mp3 兜底（定稿）**：`-c:a libmp3lame -b:a 48k -ac 2 -ar 44100`（实测 **48.06kbps / 2 声道 / 44100Hz**）；**候选 `46k` 档位维持作废、全文一律不得再出现**（非 MPEG-1 Layer III 合法档位、会被 libmp3lame 吸附为 48k），追溯见附录 A.2 / A32。
  - **执行形态（定稿）**：**单次 ffmpeg 调用双路输出**（`-map 0:a` 写两次），一次产出两种格式（D3 双格式要求）。
  - ~~原写法 `libopus -b:a 48k -vbr on -compression_level 10 -application audio`~~ **已废弃**（VBR 默认下 `-b:a` 不可控；32k VBR 实测漂到 1.71x、**48k VBR 实测漂到 ≈73kbps**；附录 A.2 / A32）。
  - ~~R33 的 `-b:a 32k -vbr off -ac 1`（32k 单声道硬 CBR）~~ **已作废**（Kevin 2026-09-24 直接裁定改 48k 立体声；附录 A.2 / **A33**）——**正文一律不得再出现「32k / 单声道 / `-ac 1`」的转码表述**（R33-⑤ 的「32k 单声道可听化程度」随之失效）。
  - **实现侧现状（R35-③，2026-09-24 查实）**：`scripts/audio-transcode-worker.mjs` 第 **28** 行 `DEFAULT_FFMPEG_AUDIO_ARGS` **已随本轮更新为 48k 立体声硬 CBR**（`['-c:a','libopus','-b:a','48k','-vbr','off','-ac','2','-ar','48000']`，**不再是旧 48k VBR**）；新执行器同口径文件＝`cloudfunctions/meditation-transcoder/lib/transcode-command.js`（**两处必须同步**）。**未改项**：该 worker 第 **295** 行临时文件名 `output.opus` 与排队方 `.opus` 扩展名（挂账 **C12**）。
- ~~**预览逻辑**：优先检测 Opus（浏览器 supportLevel 需为 'probably'），否则阻断预览；非 Opus 按基本支持检查。~~
  **预览逻辑（D3 修订，2026-09-23）**：`canPlayType` 结论**由「硬阻断」改为「选择」**——支持 Opus 则用 Opus 主体，否则取 mp3 兜底；并**必须**额外监听 `audio.onerror` 做**运行时降级为 mp3**（`canPlayType` 不可信）。仅当 **两种格式都缺**时才阻断并报真异常。详见「交付格式与 C 端兜底策略」。
- **Mime 处理**：`getMeditationAudioMimeType` 根据扩展名区分（**.ogg → `audio/ogg; codecs="opus"`**（历史 `.opus` 同此 MIME，R33-⑨），.mp3 → 对应 audio/mpeg）。
- ~~**TTS 流程**：原始输出为 MP3，后续走同一转码管道进入最终 Opus。~~
  **TTS 流程已废弃（2026-09-23）**：新模型**全程不存在 TTS**。`tts-proxy` / `is_ssml` / `<break>` 毫秒归一化 / 音频库 tab 的「TTS 文本」「AI 试听」全部作废；老 `tts_text` 数据不迁移、直接废弃。
- **转码状态管理**：idle / queued / processing / succeeded / failed（通过 audioTranscodeJobs 集合）。
- **设计原则（D3 修订）**：raw 与 final 分离、最终交付**双格式（Opus 主体 + mp3 兜底）**、按平台**能力选择 + 运行时降级**（不再「最终统一 Opus + 硬性阻断」）。

### 交付格式与 C 端兜底策略（D3，Zang 已裁定 2026-09-23）

**裁定：双格式——Opus 主体 + mp3 兜底。** 「全量 mp3」与「维持阻断」两种方案**均不采纳**。

**依据（已验证）**：

| # | 事实 | 推论 |
|---|------|------|
| 1 | 微信官方小程序 `InnerAudioContext` 支持格式表：**ogg 为 iOS ✗ / Android ✓**；**mp4 亦为 iOS ✗**；**全表无 opus**。小程序 iOS 走**原生播放器**，与系统版本无关 | 小程序端 **ogg-opus 与 opus-in-mp4 均不可用** → 必须 mp3 |
| 2 | iOS Safari / WKWebView **18.4 及以后**才支持 **Ogg Opus**（WebKit 官方博客、Apple Safari 18.4 Release Notes）；**iOS ≤ 18.3 及更早机型不支持** | Web 端按能力选择 + 必须有兜底 |
| 3 | `opus-in-mp4` **仅 Chromium 支持**（本机 WebKit 实测 `canPlayType` 返回**空串**）；`webm` 存在「`canPlayType` 报 `probably` 但真机**解码失败**」的先例 | **第三条路（opus-in-mp4 / webm）不成立**，且 `canPlayType` 结果不可完全信任 |

**行为定义（端侧与后台实现口径）**：

| 终端 | 格式选择策略 | 运行时兜底 |
|------|--------------|-----------|
| **Web（桌面 + iOS Safari / WKWebView）** | `canPlayType` 由**硬阻断改为“选择”**：命中 Opus 取 `file_id` / `audio_url`，否则取 `fallback_file_id` / `fallback_audio_url` | **必须**额外监听 `audio.onerror`，**运行时降级为 mp3** |
| **微信小程序** | **不使用 `canPlayType`**（小程序 API 无此语义），**按平台直接选 mp3** | 小程序端统一播放 mp3 兜底文件 |
| **App 原生插件（AVPlayer）** | 走原生插件时**一律 mp3** | — |
| **后台管理端预览** | 两种格式依次尝试 | **仅当 opus 与 mp3 都缺**时才阻断并报**真异常**（不再因单一格式缺失阻断） |

**配套要求**：
- `med_section_audios` 必须同时登记 Opus 主体与 mp3 兜底字段（`file_id` / `audio_url` / `mime_type` 与 `fallback_file_id` / `fallback_audio_url` / `fallback_mime_type`，以及 `transcoded_formats`，见集合定义）。
- 转码任务**一次产出两种格式**；只产出 Opus（`transcoded_formats = ['opus']`）视为**未完成交付**。
- 格式选择与运行时降级逻辑**建议下沉到共享工具新模块**（不改造老模块，见 §5「共享工具」）。
- 一句话可改（Kevin）。

此规范适用于所有 Section 音频生成与播放。

### 转码参数定稿与实现约束（R33 初定 → **R34 改定**，2026-09-24）

> **本节是转码参数与转码实现的唯一定稿口径**，与上文「音频格式与转码规范」「交付格式与 C 端兜底策略」并列生效；上文参数行以本节为准。
> **依据（实测，本轮不重新推导）**：Kong 用**本机 ffmpeg 8.1.1** ＋ **真跑 `MediaRecorder` 采集的 webm 样本**得出。**输入真身**：`audio/webm; codecs="opus"`、**128kbps 双声道 48kHz**、且**无 Duration 头**（ffprobe 对上传原件报 `duration=N/A`）。
> **实测数字一律照抄，不得四舍五入改写**；本轮只定稿参数与实现约束，**不改代码**。
> **⚠ R33 → R34 改定（2026-09-24，Kevin 直接裁定）**：**`-ac 1`（32k 单声道硬 CBR）口径作废**，Opus 主体改 **48k 立体声硬 CBR**、mp3 兜底同步改 **48k 立体声**；**`-vbr off` 不变**。**本节 ① ② ⑤ 与 ⑦ 第 3 条为 R34 改定版**（编号写 **R34-\***），**③ ④ ⑥ ⑧ ⑨ 为 R33 原文维持**。废弃追溯＝附录 A.2 / **A33**。

#### R34-① Opus 主体（**定稿：48k 立体声硬 CBR**；覆盖 R33-①）

`-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000` → 输出 `.ogg`（**Ogg Opus / RFC 7845**），MIME `audio/ogg; codecs="opus"`。

| 约束 | 值 | 为什么 |
|------|----|--------|
| **必须 `-vbr off`**（硬 CBR） | 实测 **48.65kbps（60s）/ 48.62kbps（300s）** | 默认 VBR 下 `-b:a` **不可控**：32k VBR 实测漂到 **54.9kbps（1.71x）**、**48k VBR 实测漂到 ≈73kbps**（60s 样本 **552.9KB**）⇒ **预算不可预测**；CBR 才有可预测体积 |
| **`-ac 2`（立体声，**不再下混**）** | 源本就是**双声道** 48kHz | **`-ac 1` 单声道口径已作废**（R33 的「源双声道务必下混」论证一并作废，追溯见附录 A.2 / **A33**）：用户裁定按立体声交付 |
| **`-ar 48000`** | 与源同采样率 | 不做无意义重采样 |

> ⚠ **本节一律不得再出现「32k / 单声道 / `-ac 1`」的转码表述**（含代码注释与本规范其它小节），除**明确标注为「已作废」的历史追溯**外。

#### R34-② mp3 兜底（**定稿：48k 立体声**；修订 R33-②）

`-c:a libmp3lame -b:a 48k -ac 2 -ar 44100` → **实测 48.06kbps（60s）/ 48.01kbps（300s）**，**2 声道 / 44100Hz**，输出 `.mp3`，MIME `audio/mpeg`。

- **说明（R34 改定）**：**`-ac 1` 不再使用**（与 Opus 主体同步改立体声）；**注意 CBR 下 mp3 的单声道与立体声体积相同**——区别只在**每声道质量**，不在体积（对照见 R34-④）。

- **`46k` 档位一律不用（作废）**：`46k` **不是 MPEG-1 Layer III 合法档位**，libmp3lame 会**吸附为 48k**，两者产物 **md5 完全相同** ⇒ 写 `46k` 只会制造无意义的实现分歧。**说明**：该值属**候选建议值**，**从未落入本规范正文**（本轮全文检索确认正文原值即为 `48k`）；按 R33 指令仍**登记为废弃索引**（附录 A.2 / **A32**），且**全文不得再出现**。
- mp3 兜底与 Opus 主体**在同一转码任务内产出**（D3 双格式口径，不变）。

#### R34-③ 实测数据（**逐样本照抄，不得四舍五入改写**）

> **样本**：真跑 `MediaRecorder` 产出的 `audio/webm; codecs="opus"`（128kbps 双声道 48kHz、无 Duration 头）。**码率为实测**：`ffprobe` 的 `format.bit_rate` ＋ `size*8/duration` 计算值 ＋ ffmpeg stderr 报出值 **三处一致**。
> **⚠ 读法**：`ffprobe` 对 `.ogg`（Ogg Opus）的 **`stream.bit_rate` 恒为 `N/A`** ⇒ **必须以 `format.bit_rate` 为准**（用 `stream.bit_rate` 会得到空值并误判为「无码率」）。

| 输入时长 | 产物 | 体积（字节） | 体积（KB） | 实测码率 | 声道 | 采样率 |
|----------|------|--------------|-----------|----------|------|--------|
| **60s** | `.ogg`（Opus 主体） | **372181 B** | ≈ **363.5 KB** | **48.65 kbps** | **2** | **48000 Hz** |
| **60s** | `.mp3`（兜底） | **367639 B** | ≈ **359.0 KB** | **48.06 kbps** | **2** | **44100 Hz** |
| **300s** | `.ogg`（Opus 主体） | **1823385 B** | ≈ **1780.6 KB** | **48.62 kbps** | **2** | **48000 Hz** |
| **300s** | `.mp3`（兜底） | **1800507 B** | ≈ **1758.3 KB** | **48.01 kbps** | **2** | **44100 Hz** |

- **单次调用耗时（单次双路）**：**325 ms**（60s 输入）、**1627 ms**（300s 输入）——与 R33-⑥ 的吞吐口径同量级。
> **⚠ 样本实际时长（R37-① 必读，逐字口径）**：上表两个样本是**真实 `MediaRecorder` 采集**，**样本实际时长≈61.2s（不是 60s）**（`ffprobe` 实测 **61.2035s / 61.200s**）；**300s 样本为精确 300.0s**。**复核体积 / 码率时必须先测输入实际时长，用名义 60s 反推会得到 ≈49.6kbps 的假偏差、不得据此判失败**（正确口径：372181B ÷ 61.2035s ≈ **48.65kbps**，与上表一致）。

- **验收用法**：质检复核产物时，**体积 / 码率 / 声道 / 采样率四项**按上表核对（**码率看 `format.bit_rate`**）；**一律以上表实测值为准**——若现场实测与上表不符，**记录样本体积、样本实际时长与 `format.bit_rate` 原样上报**（**不得**用按名义时长推算的值替代实测值，也**不得**先判失败）。

#### R34-④ 与旧 32k 单声道口径的对照（**代价必须写清**）

| 维度 | 旧口径（R33，**已作废**） | 新口径（R34，定稿） | 代价 / 收益 |
|------|---------------------------|---------------------|-------------|
| Opus 参数 | `-b:a 32k -vbr off -ac 1` | `-b:a 48k -vbr off -ac 2` | 总体码率 +50%，**但摊到两个声道后每声道 ≈24kbps**（32k 单声道是「32kbps 全给单声道」） |
| Opus 体积（60s） | **243.9 KB** | **363.5 KB**（≈1.49×） | **体积 +49%**：这是本次改定**唯一实质代价**（存储与下行） |
| mp3 参数 | `-b:a 48k -ac 1` | `-b:a 48k -ac 2` | **体积相同**（CBR 恒码率；只是每声道质量变化） |
| 语音可听化程度 | **未听测**（且随 `-ac 1` 作废而失效） | **仍未听测**（**X15**） | 改定的**收益假设是立体声更自然**，**该假设同样待听测**，不得写成已验证 |

> **结论（写清但不越权）**：改定**只付出体积**（Opus 60s +49%、mp3 不变）；**收益（听感）尚待人工听测确认**（R34-⑤ / **X15**），**实现与验收一律按 R34-① ② 执行，不因听测未做而阻塞**。

#### R33-③ 执行形态（定稿）：单次 ffmpeg 调用双路输出

**一次调用同时产出 `.ogg` 与 `.mp3`**（同一输入用 `-map 0:a` 写两次输出），**不拆成两次调用**。

- 实测依据：双路 **0.218s / 60s** vs 只跑 mp3 **0.185s / 60s**（几乎等价）⇒ 拆两次调用只会多付一次解码 + 一次冷启动/进程开销。
- 与 D3「同一转码任务产出两种格式」一致；`transcoded_formats` 齐备判据不变（只有 `['opus']` 仍视为**未完成交付**）。

命令形态（示例，参数以 ① ② 为准）：

```bash
ffmpeg -i take-{n}.webm \
  -map 0:a -c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000 take-{n}.ogg \
  -map 0:a -c:a libmp3lame -b:a 48k -ac 2 -ar 44100 take-{n}.mp3
```

> **R34 补记（2026-09-24）**：本批以 48k 立体声参数复测双路耗时 **325ms / 60s**、**1627ms / 300s**（见 R34-③），与 R33 的 0.218s vs 0.185s 同量级 ⇒ **「单次调用双路输出」的执行形态结论不变**。

#### R33-④ 零损失备选路径（记录，**不用于交付**）

`-c:a copy -f ogg`（**webm → ogg 换容器，不重编码**）实测**逐样本零差异**：777600 vs 777600 samples、**differing = 0**、Ogg CRC 全合法；不调用编码器，**0.029s / 60s**。

- **代价：不降体积（0.998x）**——源是 128k 双声道，remux 后 60s 仍 **961KB**，是 mp3 兜底的 **2.7 倍**。
- **定稿决策**：**交付走重编 CBR（① ②）**；**remux 只用于「需要最高保真 / 比对」的场合**（如听测基准、编解码器行为比对、产物校验）。
- 该路径**不需要编码器**（静态 ffmpeg 选型时的校验要求随之不同，见 ⑧）。

#### R34-⑤ ⚠ 听感验收（**属用户所有；未经听测不得写成「已验证」**）

- **本项性质（R34 改定）**：**参数选择已由用户（Kevin）直接裁定，不再是待裁项**；**仍然待确认的是「48k 立体声 CBR 对真人冥想语音的可听化程度」**——本批只验了**体积 / 可解码性 / 码率 / 声道 / 采样率**，**没有做听测**。
- **归属**：**听感验收属用户（Kevin）所有**（可由内容负责人代听）；登记为**待人工听测项**（附录 B.3 / **T4**；质检计划 §8.1 / **X15**）。
- **口径纪律（硬）**：**未听测前，任何文档 / 报告不得把「48k 立体声 CBR」写成「已听测 / 已验证 / 音质达标」**——只能写「**待听测**」；**UI 类与产物类验收也不得以「能播放」代替听感结论**。
- **若听测发现可闻劣化** ⇒ 处置方式是**另行升码率**（如 `-b:a 64k -vbr off -ac 2`）或变更声道口径等，**一律由用户裁定、走规范修订**（新增附录 A.2 条目）；**实现者不得自裁**。
- **不再保留的旧结论**：R33-⑤ 的「**32k 单声道**可听化程度」**随 `-ac 1` 作废而失效**（附录 A.2 / **A33**），**不得再引用**。

#### R33-⑥ 云函数选型依据（SCF）

| 项 | 实测 / 结论 |
|----|-------------|
| 双路转码吞吐 | **3.29–3.5 ms / 音频秒** |
| 单条 5min 段 | ≈ **1.07s** |
| 最坏情形（10 段 × 5min） | ≈ **10.7s** |
| ffmpeg 峰值内存 | **≤ 15MB** |
| **SCF 建议** | **内存 256MB / 单次超时 60s** |
| 真正瓶颈 | **COS 上下行与冷启动**，**不是转码**（不要为转码加内存/加超时预算） |

#### R33-⑦ 实现硬约束（重要，**会坑死实现**）

1. **上传原件 `duration=N/A`**：`MediaRecorder` 产出的 webm **无 Duration 头**，ffprobe 对**上传原件**报 `duration=N/A`（**换容器 / 转码后才出现正确时长**）⇒ **禁止对原文件取时长**。
2. **入库时长以客户端实测为准**（第一批已如此）；**云函数如需时长，只能取「转码产物」的时长**。
3. **不得假设单声道（R34 更正）**：**源是双声道**（128kbps 双声道 48kHz），**输出同样保留双声道（`-ac 2`）**——**R33 的「单声道是转码输出属性」表述已随 `-ac 1` 作废**（附录 A.2 / **A33**）；实现中任何「输入即单声道」**或**「输出必为单声道」的推断都是错的。

#### R33-⑧ 静态 ffmpeg（云函数自带，**不得提交进仓库**）

- 云函数需自带 **linux x64 静态构建**（SCF 运行环境无 ffmpeg）。
- **选型时必须实地校验**（不许只看文档）：
  - `ffmpeg -encoders | grep -E 'libopus|libmp3lame'`（**两条都必须命中**；**remux 路径 ④ 不需编码器**，故仅走 remux 时可放宽此项）；
  - 必要 **muxers** 齐备（Ogg / mp3 输出容器）。
- **二进制不得提交进仓库**：**入 `.gitignore`**（**实测：本仓库 `.gitignore` 当前无任何 `ffmpeg` 条目** ⇒ 实施时须**新增**忽略规则，如 `scripts/ffmpeg`、`**/ffmpeg`，并在 `git status` / `git check-ignore` 中确认二进制未被跟踪）；规范内写清**获取方式与校验步骤**（下载来源 / 版本号 / 校验命令与期望输出），由实现者在环境中就位。
- 依据：仓库体积与许可证可追溯性；云函数打包走外部构建产物，不走 git 跟踪。

#### R33-⑨ 容器选型取舍（定稿 ＋ 备选一行）

- **定稿 `.ogg`**：明确音频扩展名，**避免 `.webm` 被误当视频**，也避开 **CDN / MIME 嗅探**带来的 Content-Type 漂移（已定稿路径示例见上文 `.ogg`；`audio/mp4`（Safari 录音）源同此口径）。
- **备选（仅一行）**：`.webm` 换容器**同样无损（1.000x）**；若**播放侧偏好** `.webm`，可改，但**须先在同轮登记本行并同步路径与 MIME**，不得两处并存。

---

### 转码执行器实现与队列分区（R35，本批查实 2026-09-24）

> **本节是「转码执行器（C6 / X13）」的实现口径与现状登记**，与上文参数节并列生效。**依据＝本批代码查实（仓库根 `/Users/kevin/bistro/liwu`）＋ Kong 的实现自测（队列分区相关自测 15/15 PASS）**，**不做推演**；凡标「待落」者**不得**写成已实现。
> **相关需求编号**：**D-B2-9＝队列分区**（三层实现，见 R35-①）、**D-B2-10＝字段权威口径**（`attempts` / `transcode_error` 权威，见 R35-②）——正文与代码注释一律用这两个编号互相指认。

#### R35-① 队列分区（**硬，已落地**：两执行器共用 `audio_transcode_jobs` 队列）

| 侧 | 领取范围（硬） | 回写目标 |
|----|----------------|----------|
| **新执行器**（云函数 `cloudfunctions/meditation-transcoder`） | **只领 `transcode_profile === 'section_audio'`** 且 `status = 'queued'` 的 job | `med_section_audios`（规范字段） |
| **老 worker**（`scripts/audio-transcode-worker.mjs`） | **必须跳过 `transcode_profile === 'section_audio'`**（其余 job 照常处理） | 老四 tab 的 `app_settings.meditation_audio_library.items[]` |

- **分区常量（权威，不得改名）**：**`SECTION_AUDIO_TRANSCODE_PROFILE = 'section_audio'`**（**snake_case 字面值**）——定义在新执行器 `cloudfunctions/meditation-transcoder/lib/transcode-state.js`；**取值的权威来源是排队方** `apps/web/src/admin/components/Dashboard/MeditationPage.jsx:3334`（`transcode_profile: 'section_audio'`）。**排队方 / 新执行器 / 老 worker 三方共用这一个字面值**，改名须**同轮同步三处**。
- **新执行器侧 ＝ 三层（缺任一层即不合格，D-B2-9）**：
  1. **过滤进查询**（不是「先领后筛」）：`fetchQueuedJobs` 把 `transcode_profile: 'section_audio'` 写进 `.where()` ⇒ 老 profile job **根本不会被取出**；
  2. **乐观锁带 profile**：`claimJob` 的 `.where()` **同时带** `_id` ＋ `status: 'queued'` ＋ `transcode_profile: 'section_audio'`（三者同时满足才 `updated = 1`）⇒ **即便有人手工 invoke 传入老 profile 的 job，也领不走**（`updated = 0`）；
  3. **纵深防御（跳过语义）**：`resolveJobSkipReason` / `processJob` 对非 section_audio job 返回 **`{status:'skipped', skip_reason:'not_section_audio_profile'}`** 且**不写任何字段**，并记录 **`job_profile_not_section_audio`** 日志 ⇒ **语义是「跳过」而不是「失败」**：**绝不把老链路 job 置成 `processing` / `failed`**（否则会污染老四 tab 链路）。
- **老 worker 侧**：`scripts/audio-transcode-worker.mjs` 领取后 **`.filter((job) => job.transcode_profile !== 'section_audio')`**（**本 worker 侧唯一改动，2 行**；其余字段口径与处理逻辑**一律不动**）。**实测：同一数据集下两侧互不吃对方的 job**。
- **上线纪律（强制，写进正文与 X13 判据）**：**启用新执行器前先停 `npm run audio:transcode-worker:loop`**，并用 **`pgrep -fl audio-transcode-worker` 确认为空**（有输出即不得启动）；**同一时刻只允许一侧消费**；**回滚时顺序相反**（先停新执行器、再恢复 `audio:transcode-worker:loop`）。
  理由：两侧都能消费 queued job——同时运行会让彼此的 job 被按**对方的**口径处理（回写目标与产物路径都不对）。分区落地后**风险降低但纪律不放宽**。
- **纪律的落点（并列，两处都写）**：① 本规范正文（本节）；② **`scripts/README.md`**（该文件**确实存在**，内已列 `audio-transcode-worker.mjs` 与 `npm run audio:transcode-worker` / `:loop`）——上线纪律需同步写入该 README，**责任在实现侧**（见附录 C / C6）。
- **验收**：挂 **X13**（质检计划 §8.1），判据＝三层实现齐备、老 worker 不复用 section 任务、跳过语义不写字段、上线时 loop 已停（`pgrep` 为空）。

#### R35-② 字段权威口径（job 文档，D-B2-10）

- **权威字段**：`attempts`（已执行次数）与 `transcode_error`（失败原因）——新执行器**读取与判定一律以这两个为准**（`attempts >= 3` ⇒ 终结为 `failed`）。
- **过渡期镜像**：`attempt_count` / `error_message` —— **仅为兼容既有读取方（老 worker）而双写**，**待老 worker 退役后收敛为单写权威字段**（挂账 **C13**）。
- **实现细节（D-B2-10 补充，已落地）**：
  1. **领取时两键同写**：`attempts`（权威）与 `attempt_count`（镜像）**同值同写**；并**同时清空两个错误键**（`transcode_error` 权威 ＋ `error_message` 镜像）——修掉了「**重试时权威错误字段残留上一轮错误**」的不对称；
  2. **读取侧**：一律走 **`attempts ?? attempt_count`**（新执行器内部判定只读权威键；`readJobNumber` 的镜像回退**仅为兼容历史 / 排队方文档**）；
  3. **排队方现状（挂账，不得据此判失败）**：`apps/web/src/admin/services/database.js:5915` 目前**只写镜像键 `attempt_count: 0`**（**未写权威键 `attempts`**，因本批硬约束**禁改该文件**）⇒ 首轮领取前 job 文档的**权威键可能缺省**，**读取侧必须保留 `?? attempt_count` 回退**；**待老 worker 退役时一并切换为写权威键**（挂账 **C13**）。
- **纪律（硬）**：① **不得**把两个字段写成平级权威；② **不得**因镜像字段与权威字段不一致而判数据异常；③ 新增读取方一律读权威字段（老 worker 退役前**保留镜像回退**）；④ **不得**把「排队方未写权威键」当缺陷——它是**已登记的过渡态**（C13）。

#### R35-③ 实现现状登记（2026-09-24 查实，逐条对代码）

| 项 | 现状 | 处置 |
|----|------|------|
| worker 转码参数（`scripts/audio-transcode-worker.mjs:28`） | **已随本轮更新为 48k 立体声硬 CBR**（`-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000`）——**不再是旧 48k VBR** | **A32 / C6 中「仍为旧参数」的表述已同步改为「已随本轮更新（L28）」** |
| 新执行器参数（`cloudfunctions/meditation-transcoder/lib/transcode-command.js`） | 与 worker **同口径**（48k 立体声硬 CBR）＋ **单次双路输出**（`.ogg` ＋ `.mp3`）；**无任何 `-af`** | 两处**必须同步**（该文件头已写明同步责任） |
| worker 临时文件名（`scripts/audio-transcode-worker.mjs:295` `output.opus`） | **本批未改** | 挂账 **C12**（与排队方 `.opus` 扩展名同批清理） |
| **队列分区（R35-①，D-B2-9）** | **已落地（本轮，Kong 实现并自测 15/15 PASS）**——新执行器**三层**（查询过滤 ＋ 乐观锁带 profile ＋ 跳过语义不写字段，含 `job_profile_not_section_audio` 日志）＋ 老 worker `.filter(… !== 'section_audio')`（2 行）；**实测同一数据集两侧互不吃对方的 job** | 随 **C6 / X13** 收口（判据见质检计划 §8.1 / X13 ⑪~⑯；上线纪律见 R35-①） |
| **口径收紧（R35-⑤）** | **已落地**：section_audio job 缺 `section_audio_id` ⇒ `MISSING_SECTION_AUDIO_ID`（**永久错误、立即终结、不入重试、不写 `med_section_audios`**）；老 profile **仍回退 `item_id`** | 口径已定稿（R35-⑤），随 C6 / X13 收口 |
| **lint 门（R35-⑥）** | **已实测**：仓库级 `npm run lint` **142 → 127 problems（132 → 117 errors）**；`cloudfunctions` **16 → 1**（仅剩既有 `getHomePageData/index.js:11`）；**新执行器目录 0 problem**（4 处 `eslint-disable no-undef` 已全部移除） | 新执行器目录**须保持 0 problem**（X13 验收引用） |
| 回写目标 | 新执行器回写 `med_section_audios`（规范字段）；老 worker 回写 `app_settings.meditation_audio_library.items[]` | 口径不变（R35-①） |
| 产物路径 | 执行器输出 `meditation-audio-final/{section_type}/take-{section_audio_id}.ogg\|.mp3`；排队方 `target_cloud_path` 仍是 `meditation-audio/…take-{id}.opus` | **不一致**，挂账 **C12**（待前端后续单同步） |

#### R35-④ 并列挂账（详见附录 C）

- **loudnorm 是否沿用 ⇒ 待用户拍板**：老 worker 为**两遍 loudnorm**（`I=-18:TP=-1.5:LRA=15:linear=true`，`profile=nature` 追加 `volume=0.2`，`tts_simple` 跳过），**新链路当前无 `-af`**；启用会与「单次双路」形态冲突（需 **2 次 ffmpeg 调用**、耗时 **≈×2**），**实现侧建议本批先不启用**，启用点只有 **`lib/transcode-command.js` 一处** ⇒ **C10**。
- **`audio_url` 为 2 小时临时 URL**（`app.getTempFileURL` `maxAge = 7200`）⇒ **长期播放依赖 `file_id`**，**D6 只读云函数需承担重新签发**（写进 D6 / X14 需求）⇒ **C11**。
- **排队方 `target_cloud_path` 与执行器输出路径不一致**（目录前缀 ＋ 扩展名两处）⇒ **C12**。
- **job 文档字段冗余**（`createMeditationAudioTranscodeJob` 末尾 `...(jobData || {})` 展开 ⇒ camelCase 原键与 snake_case 规范键并存；`transcode_profile` 默认值 `'default'` 与实传 `'section_audio'` 双写）⇒ **C13**。

#### R35-⑤ section_audio 链路口径收紧：**取消 `item_id` 回退**（已落地）

- **新口径**：`section_audio` 链路的 job **只认 `section_audio_id`**——**不再回退 `item_id`**。**缺 `section_audio_id` ＝ 永久性结构错误**：报 **`MISSING_SECTION_AUDIO_ID`**、**立即终结**（`permanent = true`，**不入重试**）、**且不写 `med_section_audios`**（无目标文档可写，静默兜底只会掩盖缺陷）。
- **老 profile 不变**：老 profile job **仍保留 `item_id` 兜底、行为未变**——**不得**按新口径去改老链路（会破坏老四 tab 的回写）。
- **为什么**：「缺 id 也能写」会让**结构错误伪装成成功**（回写落到错误文档或静默跳过），并与 D-B2-6「回写目标＝`med_section_audios` 规范字段」的口径冲突。

#### R35-⑥ lint 门（实测数字，验收可引用）

| 范围 | 本批前 | 本批后 |
|------|--------|--------|
| 仓库级 `npm run lint` | **142 problems（132 errors）** | **127 problems（117 errors）** |
| `cloudfunctions` 范围 | **16 problems** | **1 problem**（仅剩**既有** `getHomePageData/index.js:11` 的 `no-unused-vars`，**非本批引入**） |
| `cloudfunctions/meditation-transcoder`（新执行器目录） | — | **0 problem**（**4 处 `eslint-disable no-undef` 已全部移除** ⇒ 证明未用豁免掩盖真错误） |

- **口径**：`cloudfunctions/**` 已纳入 **node globals**（不再需要 `no-undef` 豁免）；**新执行器目录必须保持 0 problem**（X13 验收引用）；`cloudfunctions` 范围**不得新增** problem（既有 1 条为豁免登记）。

---

## 1. 信息架构与导航

### 1.1 入口
- 在 Partner 后台（`/partner`）中，存在「冥想」一级 Tab。
- 此 Tab 仅对管理员身份的用户可见。
- 点击后进入 `MeditationPage` 组件。
- 此 组件 仅对管理员身份的用户可访问。

### 1.2 子 Tab 结构（SUB_TABS）
页面内部使用水平子标签页，顺序固定：

| Key        | 中文标签 | 状态 | 主要职责 |
|------------|----------|------|----------|
| `paragraph`  | 段落文本库   | **活跃（规则 B）** | 管理所有段落文本。这个页面是一张数据表，表格有筛选功能。最右侧的列有星级评分（系统自动，按使用次数累计）和仿写功能按钮（用 AI 生成一条新的数据）|
| `section-raw`  | 原始音频库   | **活跃（规则 B）** | 这个页面让管理员可以用 Paragraph 组成Section-Raw，并对字数（超出或不足）进行提示。然后可以为每条Section-Raw上传录制好的音频（**新链路：网页录音 → 转码双格式（Opus 主体 + mp3 兜底）→ 关联**）。同页设**「纯音频段」区块**（`sec-nature` / `sec-bowl`：无文本、不判字数、不建 Section-Raw，直接录音/上传，见 G3）。|
| `med-tracks`  | 冥想轨道   | **活跃（规则 B）** | **D5 已裁定的规则 B 活跃区**：维护 `med_tracks`（六章开关、各章时长上限、章间留白秒数、Track 元信息与启用状态）。**⚠ Track 预览（双轨：背景 loop + 人声 sequence）归第二批（R9）**，第一批不实装（依赖端侧播放能力）。|
| `library`  | 音频库   | **冻结只读（规则 A）** | 管理所有音频资源（颂钵、问候、自然、呼吸、心语、告别）。**其「TTS 文本」「AI 试听」入口已废弃**。 |
| `presets`  | 冥想库   | **冻结只读（规则 A）** | 管理预设冥想（早课/午课/下午课/晚课等）。 |
| `composition` | 冥想设置 | **冻结只读（规则 A）** | ~~组合规则、音量、转场等配置~~ 老时间轴配置；**已被 `med_tracks` 取代**。**D5 已裁定：本 tab 保持冻结只读、不复活、不改造**；Track 配置落点为上表新增的「冥想轨道」子 Tab。 |
| `calendar` | 冥想日历 | **冻结只读（规则 A）** | 按日期分配冥想预设。 |

> **冻结定义**：保留可读与预览能力，不再新增字段与交互，不参与新链路。
>
> **口径（R27 报告残留 ① / ④ 的处置，2026-09-24）**：**「冻结只读」是目标态，口径不变**；**只读闸门与入口隐藏一并归 D10**（前置按 R20-②）。表内「冻结只读（规则 A）」与**代码仍保留可写链路**并存属**已接受的过渡态**，**不视为口径冲突**、**不改本表措辞**（§4 过渡规则同此口径）。
>
> **子 Tab 顺序（2026-09-23 更新）**：`paragraph` → `section-raw` → `med-tracks`（规则 B 活跃区；**key 以代码为准，R26**，原文档「建议 `tracks`」未落地）→ 冻结四 tab（`library` / `presets` / `composition` / `calendar`）。冻结四 tab 在第一批验收通过后隐藏入口（见 D10）。
>
> **⚠ D10 前置收紧（R20-②，Zang 裁定 2026-09-24）**：隐藏老四 tab 入口**必须同时满足两个条件**——① **`med_tracks` 集合已就绪**（已人工创建，R12 / 附录 C / C7）→ ✅ **已满足（R37-②：集合已于 2026-09-24 创建）**；② **R7 端到端验收通过**（写入结果校验链路端到端可用）→ 🟡 **部分满足（R37-③：Track 路径的数据层与 UI 点击路径均已通过；四个老口径 writer 的写入校验仍为「已实现（Kong）、待质检确认」，**复验状态（v4.9）＝静态 PASS、动态复验待按 R40 执行（判据已定）**，见质检计划 §8.1 / X2、W2、**X17**）**。**②未完全通过前仍不得隐藏**：否则新「冥想轨道」tab 无法存盘、老 tab 入口又被隐藏，管理员将**失去唯一可用的管理路径**（死锁）。

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
- 预览阻断（**D3 修订**）：**仅当 Opus 与 mp3 两种交付格式都缺失时**才阻断并报**真异常**；只要 mp3 兜底存在即正常预览/播放，不再对单一格式缺失阻断。
- **新增（2026-09-23）**：
  - **字数状态**：`word_count_status` 以黄（slightly_*）/ 红（over/under）标记，**仅提示，不阻断**保存与生成；阈值集中定义见「字数状态阈值（word_count_status）」（G1）。
  - **stale 提示（口径收窄，R3，第一批验收裁定 2026-09-24）**：raw 卡片的重录类徽标（「需重录」/「文本与录制快照不一致」）**仅当该 raw 已有候选音频（`audios.length > 0`）且 `isSectionRawStale(raw)` 为 `true` 时显示**；**无候选音频（从未录制）不得显示任何重录警示**（无录音可重录）。**不阻断**音频可用。
  - **超上限告警**：Section/Chapter 时长超过上限时**仅告警、不阻断**（不再静默截断；见 G4）。
  - **录音状态**：录音中 / 转码中（queued/processing）/ 已完成 / 失败，四态可见。
  - **保存失败必须可见（补充条约，R8，第一批验收裁定 2026-09-24）**：失败提示**不得被仍未关闭的弹窗遮挡**——弹窗内保存失败时，错误必须在**弹窗内的可见区域或弹窗之上**呈现，不能只落在弹窗背后的页面横幅上。
    - **挂账**：老四 tab（`library` / `presets` / `composition` / `calendar`）的失败横幅被弹窗遮挡问题**记为挂账**（D10 后随其下线处置）；**第二批若保留该 tab 则必须修**（见附录 C / C2）。
    - **挂账范围边界（R17，Zang 裁定 2026-09-24）**：R8 的挂账**仅指「失败提示被仍未关闭的弹窗遮挡」这一 UI 可见性问题**；**老四 tab 不豁免 R7**——R7 的写入结果校验覆盖老四 tab 的四个 writer，且四个 writer 的写入结果校验**已实现（Kong）、待质检确认**（**复验状态（v4.11）＝静态 PASS ＋ 动态复验：冥想库路径 PASS（Neng-20，2026-09-24）**——**其余三个 writer 的动态用例尚未实测**；状态词口径统一见 §4；复验项见质检计划 §8.1 / W2、X2、**X17＝已裁并已 PASS**）。**不得**把本挂账读成「老四 tab 豁免写入结果校验」。

---

## 3. 子页面详细设计

### 3.1 音频库（Library Tab）—— **已冻结只读（规则 A）**

> 本节整体标注为**已冻结**；「TTS 文本」「AI 试听」为**已废弃**能力，不要在新链路中复用。

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
- ~~`tts_text` / `is_ssml`~~ —— **已废弃，不迁移**

**特殊规则**
- Opus 格式需要浏览器支持检测
- 预览时会临时 fetch blob 并 revoke
- 转码状态通过 `MEDITATION_AUDIO_TRANSCODE_STATUS` 管理

### 3.2 冥想库（Presets Tab）—— **已冻结只读（规则 A）**
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
- **`groupSelections` 语义已平移**至「Section 候选池抽选」（见「随机性下沉到 Section 层」）

**特殊规则**
- 预览会实时根据当前 audioLibrary + compositionSettings 生成 plan
- 不支持的音频格式会阻断预览

### 3.3 冥想设置（Composition Tab）—— **已冻结只读（规则 A）**
**核心功能**
- ~~定义音频组合规则~~ → **已被 `med_tracks` 取代**
- 音量控制（MEDITATION_TRACK_VOLUMES）
- 转场、叠加、顺序逻辑

**UI 元素**
- 类型分类选择器
- 音量滑块 / 输入
- 预览影响范围说明

**数据模型**
- `compositionSettings`
- ~~与 `buildMeditationSessionPlan` 紧密耦合~~ → 老播放计划仅服务规则 A，新链路以 `med_tracks` 为准

### 3.4 冥想日历（Calendar Tab）—— **已冻结只读（规则 A）**
**核心功能**
- 按日期分配具体冥想预设
- 查看/编辑每日计划

**UI 元素**
- 日历视图（或列表 + 日期选择）
- 预设下拉选择
- 每日详情展示

**数据模型**
- `calendar.days`（key 为日期，value 为 preset id 或配置）

### 3.5 段落文本库（Paragraph Tab）—— 活跃（规则 B）
**核心功能**
- 数据表管理 `med_paragraphs`（筛选、新建、编辑、删除）
- `paragraph_type` 分类（9 类，见映射表）
- 星级评分（系统自动，按 `usage_count` 累计）
- AI 仿写：生成新 Paragraph，写 `ai_rewritten_from` + `source='ai'`

**字段口径**：严格按上文 `med_paragraphs` 字段定义。

**特殊规则**
- 修改 Paragraph 后，引用它的 Section-Raw 一律 `stale`（级联，见「段落改动级联」）。
- AI 仿写只负责**生成文字**，不触发任何语音合成。
- **「加入音频库 → 已有 Section-Raw」下拉行格式（R6，第一批验收裁定 2026-09-24）**：`{section_type 名} · {段落数}条 · {首段摘要(前 40 字)}`。
  - **「条」＝ `paragraph_ids.length`（段落数），不是候选音频数**——该下拉的语义是「把这个段落追加到哪条 raw」，与候选音频数量无关。
  - 首段摘要 ＝ 该 raw `paragraph_ids[0]` 对应段落文本的**前 40 字**；段落文本取不到时显示「无内容」。
  - **行顺序裁定（R20-①，Zang 裁定 2026-09-24）**：下拉行顺序**以本节（规范）为准**＝`{section_type 名} · {段落数}条 · {首段摘要(前 40 字)}`；实现侧按规范收敛，**规范顺序不回改**。
  - **落地状态（K8）**：已按上述顺序实现（「加入音频库 → 已有 Section-Raw」下拉行先渲染 `{section_type 名} · {N}条`，再渲染首段摘要——取该 raw `paragraph_ids[0]` 段落文本前 40 字、取不到时显示「无内容」）——**已实现（Kong）、待质检确认**（复验项见质检计划 §8.1）；附录 C / C8 同步标为「**已实现（Kong）、待质检确认**」。

### 3.6 原始音频库（Section-Raw Tab）—— 活跃（规则 B）
**核心功能**
- 用 Paragraph 编排 Section-Raw（`paragraph_ids` 有序）
- 字数与状态的实时提示（`current_char_count` vs `target_char_count`，`word_count_status` 黄/红）
- **网页录音（`MediaRecorder`）→ 转码为双格式（Opus 主体 + mp3 兜底，D3）→ 关联 Section-Raw**
- 候选音频池管理（1 条 Raw → 1..N 条 Section 音频）
- stale 提示与重录入口

**UI 元素**
- Raw 列表：`section_type`、段落数、当前/目标字数、状态徽标、音频状态（已关联/未关联/转码中）、stale 标记
- 编排器：段落搜索筛选 → 有序选择 → 实时字数
- 录音/上传/预览/替换/删除
- ~~「AI 试听」按钮~~ —— **已废弃**（该按钮当前调用 `synthesizeSpeech` 走 TTS，须移除）

**纯音频段入口（G3，Zang 已裁定 2026-09-23）**

`sec-nature` / `sec-bowl` **无文本、不判字数、不建 Section-Raw**，其唯一录制/上传入口是本子 Tab 的**「纯音频段」区块**（与文本类 Raw 列表并列，按 `section_type` 分组）。

- **展示口径（R2，第一批验收裁定 2026-09-24，强制）**：「纯音频段」区块**必须按 `section_type` 分组展示**，**每组带分组标题**（`sec-nature` 一组、`sec-bowl` 一组），组内列出该 `section_type` 的候选音频。
  - 禁止把两组候选混排成单一列表；
  - 禁止省略分组标题（质检定位器依赖业务标识文本，见质检计划 R14-④）；
  - **分组标题文案定稿（R18-②，Zang 裁定 2026-09-24）**：＝`{章节名} · {section 名}（{section_type}）`，即 `sec-nature` 组标题「**自然库 · 自然（sec-nature）**」、`sec-bowl` 组标题「**颂钵库 · 颂钵（sec-bowl）**」。分组标题文案与 label 前缀分属两个概念：**分组按 `section_type` 切分，label 前缀用章节名**（R1）；本口径与 R1 **不矛盾**——「章节名（R1 前缀口径）＋ section 名 ＋ `section_type` 括号标识」三者并列，分组的技术标识仍是 `section_type`，满足 R14-④「定位器收敛条件用业务标识文本」的要求。**原「分组标题文案未裁定」的待裁标注已由此条关闭**（追溯见附录 B.6 / B6-4）。

- **不建 Section-Raw**：不创建 `med_section_raws` 记录，录音/上传**直接创建 `med_section_audios`**；`section_raw_id` **留空 / 不适用**，`section_type` 必填（`sec-nature` | `sec-bowl`）。
- **字段口径**：`paragraph_ids_snapshot = []`、`text_snapshot = ''`、`char_count = 0`、`duration` 取实测、`label`（显示名，便于多候选区分）、`original_file_id` / `source_kind`（`'recording'` | `'upload'`）/ `recorded_by` 按 `med_section_audios` 定义填写；`stale` 恒为 `false`（无 Paragraph 引用，不参与 stale 级联）。
- **候选池相同**：同一 `section_type` 允许多条候选（1..N），运行时仍抽一条；时长上限（`sec-nature` 300s / `sec-bowl` 30s）仍适用，**仅告警、不阻断**。
- **字数相关字段不适用**：不写 `target_char_count` / `current_char_count` / `word_count_status`。
- **交付格式同口径**：同样产出 Opus 主体 + mp3 兜底双格式（D3）。

**特殊规则**
- 新链路**只写 `med_*` 集合**。
- **重录类徽标显示条件（R3，全口径）**：仅当该 raw 的 `audios.length > 0` **且** `isSectionRawStale(raw)` 为 `true` 时，显示「需重录」/「文本与录制快照不一致」；**无候选音频（从未录制）不得显示重录警示**（与 §2.3 同一口径）。
- **纯音频段按 `section_type` 分组（R2，全口径）**：见本节上文「展示口径」。
- **音频记录口径（D8，Zang 已裁定 2026-09-23）**：`med_section_audios` 为**唯一口径**；Section-Raw **只存 `audio_candidates`** 引用列表。写在 `med_section_raws` 上的老 `audio_url` / `file_id` 与老 `audio_id` 一律**废弃**（只读兼容、不再写入，不做双写）。
- ⚠ **实现现状偏差**：当前代码把 `audio_url` / `file_id` 直接写在 `med_section_raws` 上（UI 读 `item.audio_url` / `item.file_id`），与本节口径不一致，**以本节为准**（D8 已裁定；收敛由 Kong 在第一批实现时一并完成）。

### 3.7 Track 配置（规则 B）
**核心功能**
- 维护 `med_tracks`：六章开关、各章时长上限、**章间留白秒数**、Track 元信息与启用状态
- ~~Track 预览（双轨：背景 loop + 人声 sequence）~~ → **批次归属：第二批（R9，第一批验收裁定 2026-09-24）**。第一批**不含**该功能（依赖端侧播放能力）；本行标注批次，避免下轮文实不一致。 **（口径缺口已补，v4.12）**：本行原只裁定**批次归属**、无功能条文 ⇒ **后台 Track 预览的功能口径见 R43（v4.12）**——数据源**一律经 D6**（后台不得直连 DB 组装）、**预览不落盘**、**基于已保存版本**（UI 明示「预览基于已保存版本 vN；未保存改动不生效」）、抽签**每次开预览抽一次 ＋「换一批」显式重抽**、缺音频**分两类可计数 ＋ 段级跳段（绝不整场失败）**、失败态**三态分开**（未部署 / `TRACK_NOT_FOUND` / `TRACK_DISABLED`）、后台恢复**简化**（403 ⇒ 同参整场重调至多 1 次、不做段级覆盖表、不得依赖 R42-⑥）、**时长两把尺子并列**、**音量显示响应值 / 回退常量**、**零 fixture 纪律同样适用**；**状态＝已定口径、待实现**。

**权限边界**：只能调时长上限与章开关；**不能改顺序、不能重复章节、不能改章内 Section 类型与顺序**。

**只读边界与数据层兜底（R10，第一批验收裁定 2026-09-24）**

- **章序与章内 Section 序列为只读**：UI **不得提供拖拽 / 增删 / 重复章的控件**（禁用某章只能通过章开关，不得通过删除章实现）。
- **数据层必须折回模板**：`normalizeMedTrack`（`packages/shared-utils/meditation-track-normalizers.js`）**必须把脏文档折回六章固定模板**——**即使库中文档被外部篡改**（顺序错乱、缺章、重复章、章内 Section 序列被改、`chapters` 长度 ≠ 6），读出的 Track 也一律为模板口径（顺序、序列、末章 gap 固定值齐备）。不折回即视为缺陷。

**第一批 UI 点击路径验收结果（R37-③，2026-09-24 实测通过）**

- **实测通过的路径**：空态**只有**「初始化默认 Track」→ 点击后进**编辑态** → 呈现**六章固定模板**：`max_duration_seconds` ＝ **300 / 30 / 130 / 150 / 270 / 30**、章间留白 **141 × 5**（末章 `chapter-closing` **无留白输入**）、**章序不可操作**（无拖拽 / 增删 / 重复章控件，R10）、**估算自洽** → 按钮文案实测为「**保存 Track**」→ 保存后 `version` **1 → 2**、`chapters = 6`、**刷新后保持**；**二次保存命中同一 `_id`、`version` 2 → 3**（R5 递增口径成立）。**测试文档已删除**（`med_tracks` 中不留质检残留）。
- **术语澄清（两者不是同一把尺子，必读）**：
  - `total_target_seconds = 900`（15 分钟）是 **Track 的软基准**（字段级默认值，**不是**校验阈值）；
  - UI 显示的「**内容 15:10**」＝**六章 `max_duration_seconds` 上限之和 910s**（300+30+130+150+270+30）；
  - ⇒ **不得**把二者当同一口径互推，也**不得**用 910s 反推「实际朗读时长」；**上限之和与按字数预算的实际朗读时长之间的差额**＝本次登记的**挂账 C14**（预估口径待用户拍板：默认种子 Track 的 UI 预估 **26:55** vs 基准 **15:00**，**+79%**）。
- **尚待复验**：`deleteMedTrack` 的**删除影响条数断言**（**R38-①**，状态＝**已实现（Kong）、质检 PASS（Neng-16，2026-09-24）**；实现落点＝`apps/web/src/admin/services/database.js` **L5993 / L5994**，断言函数 `:425`）；复验项见质检计划 §8.1 / **X2** 与 §4「写入结果校验硬口径」（W1 / W2）。
- **`deleteMedTrack` 的调用方口径（本批修正登记）**：`deleteMedTrack`（`apps/web/src/admin/services/database.js:5989`）在 `apps/web` **没有任何 UI 调用方**——它是**保留的服务 API**，当前由**质检 / 清理脚本**调用。⇒ **写成「保留的服务 API，当前无 UI 入口」**，**不得当死代码删除**（删掉它等于取消删除轨道的能力，且 R38-① 的删除断言复验将失去入口）。

**落点（D5，Zang 已裁定 2026-09-23）**：**新建「冥想轨道」子 Tab**（`SUB_TABS` key＝`med-tracks`，**以代码为准**，顺序见 §1.2），作为**规则 B 的活跃区**；`composition` tab **保持冻结只读、不复活、不改造**。一句话可改（Kevin）。

---

## 4. 数据流与持久化

- 所有数据通过 `useDatabase` hook 管理（`apps/web/src/admin/hooks/useDatabase.js`）
- 关键 state：
  - `meditationSettings`
  - ~~`meditationAudioLibrary`~~（冻结，规则 A）
  - ~~`meditationCompositionSettings`~~（冻结，规则 A；**已被 `med_tracks` 取代**）
  - ~~`meditationCalendar`~~（冻结，规则 A）
  - ~~`meditationLibrary`~~（冻结，规则 A）
  - **`meditationParagraphs`**（活跃，`med_paragraphs`）
  - **`sectionRawItems`**（活跃，`med_section_raws`）
  - **`medTracks`**（新增，`med_tracks`）
- 保存统一走 `onUpdate` + CloudBase 写
- 音频上传走 `uploadAudioFile` + 临时 URL
- 转码任务单独 queue（`queueMeditationAudioTranscodeJob`）
- **新增（2026-09-23）**：网页录音走 `MediaRecorder` → `uploadAudioFile` 落 raw → 转码任务 → 写 `med_section_audios` → 回写 `med_section_raws.audio_candidates`。

#### 写入结果校验硬口径（R7，第一批验收裁定 2026-09-24）

- **强制范围**：**所有** `med_*` 集合写入（`med_paragraphs` / `med_section_raws` / `med_section_audios` / `med_tracks`）**以及冥想相关的 `app_settings` 写入**（含 `saveMeditationCalendar` / `saveMeditationCompositionSettings` / `saveMeditationAudioLibrary` / `saveMeditationLibrary`）**一律必须经 `assertCloudBaseWriteResult` / `assertCloudBaseCreateResult` 校验**（`apps/web/src/admin/services/database.js`）。
- **写被拒不得静默当成功**：如 `DATABASE_PERMISSION_DENIED`、`DATABASE_COLLECTION_NOT_EXIST` 等被拒 / 失败结果，**必须抛错并让失败在 UI 可见**；禁止 `console.error` 后当作成功继续，禁止空 `catch {}` 吞错，禁止「失败即 return null」了事。
- **覆盖范围边界与实现状态（R17，Zang 裁定 2026-09-24）**：上列四个 writer（`saveMeditationCalendar` / `saveMeditationCompositionSettings` / `saveMeditationAudioLibrary` / `saveMeditationLibrary`）的**写入结果校验已实现（Kong）、待质检确认**（**复验状态（v4.9）＝「静态 PASS、动态复验待按 R40 执行（判据已定）」**——见本条末补注）；**老四 tab 不豁免 R7**——其写入路径同样受本条约束。R8 判为「挂账」的对象**只是「失败提示被仍未关闭的弹窗遮挡」这一 UI 可见性问题**（§2.3、附录 C / C2），**与写入结果校验是两件事**；两条口径**分别登记**，不得被读成「老四 tab 豁免 R7」。〔**v4.8 补注（2026-09-24，本批复核**）：该四项的写入校验**静态 8/8 断言存在且行号已核**（**L5183/L5190**、**L5249/L5256**、**L5315/L5322**、**L5381/L5388**；**集合缺失另抛** **L5172 / L5238 / L5304 / L5370**）；**动态只完成 1 条（冥想库）且受阻于 R28 权限模型**（**非属主身份**保存得 `{updated:0, upsertedId:null, requestId:3b734af94bab9}`、**断言不抛**、**页面零提示**、4 个文档 body sha256 与 `updated_at` **一字未变**）⇒ 复验状态＝「**静态 PASS、动态复验待按 R40 执行（判据已定）**」——**统一状态词仍是「已实现（Kong）、待质检确认」（R22）**，本注记是**复验进度**、不是第二种状态词；**不得**写成通过，也**不得**判为实现缺陷。**`updated` 语义已由 R40 裁定**（v4.9）：非属主身份下 `{updated:0}` 且文档体一字未变 ＝ **R40-② 的「无权写（静默拒绝）」一类**（**不是**权限被显式拒绝、也**不是**实现缺陷）；**动态复验须按 R40 执行**（正本 R40-①~⑤）——质检计划 §8.1 / **X17** 已由「待裁」改为「**已裁：按 R40 执行动态复验**」，**结论仍不得写成通过**。**（v4.11 更新）**：**X17 已执行完毕并 PASS（Neng-20，2026-09-24，真实 CloudBase 往返、带 `requestId`）**——**非属主路径 ⇒ 可见失败**（老四 tab「冥想库」逐字文案「冥想文库保存失败：未能确认写入生效（未检测到任何变化）（requestId: 2c26a5bfd807a8）」、`[role=dialog]=0`、不含「无权限」、调用栈完整）、**属主路径 ⇒ 不误报**（静态 8/8 载荷必含易变字段；动态两例 `updated:1` ⇒ 读回比对之前即返回、窗口内仅 1 条 POST、零读回 GET；刷新读回 `version` 4→5）、4 个 `app_settings` 文档 `_id` / body sha256 / `updated_at` 前后逐项未变（未污染）、自建文档 `deleted:1`、`med_tracks` 回 0 条 ⇒ **R40-⑤ 有条件例外的状态词随之升为「已实现（Kong）、质检 PASS（Neng-20，2026-09-24）」**，**例外条件经实测成立**（属主不误报、非属主可见失败）。**覆盖边界（不得外推）**：本轮实测覆盖＝**冥想库 writer（`saveMeditationLibrary`）＋ 属主路径不误报**；**其余三个老口径 writer 的动态用例沿用同一套 R40 判据、尚未实测** ⇒ **本注记「静态 PASS ＋ 冥想库动态 PASS」不因 X17 结案而升为四个 writer 全 PASS**〕。
- **存在性 / 成功判定硬要求**：判定资源是否存在、写入是否成功，**必须读 `res.code` / `res.message`**；**不得以「未报错」作为存在或成功的证据**——CloudBase 对部分错误是 **resolve 返回错误对象**（Promise 正常 resolve，错误藏在返回值里），只看「没抛异常」会把失败读成成功。
- **删除路径硬要求（R38-①，2026-09-24 新增；**需求编号 D-B2-12**）**：删除类写入（`remove()`）**必须断言删除影响条数**——CloudBase 的 `remove()` 在**无影响行**时返回 **`{"deleted": 0}`**（**普通对象、不带 `code` / `message`**），而旧 `assertCloudBaseWriteResult` 只判 `code` / `message` ⇒ **会把它放过**，于是 `deleteMedTrack` 等**向 UI 报成功、实际未删**（**已在非 owner 身份实测复现：删除后文档仍在**）。⇒ **`deleted === 0` 必须抛错**（用户可见），**不得**以「没报错」当删除成功。**实现落点（行号级，本批复核）**＝`assertCloudBaseDeleteResult`（`apps/web/src/admin/services/database.js:425`）。**扫点范围**＝**全部 `.remove()` 调用点**（实测同文件共 **15** 处＝**11 处直接严格断言 ＋ 4 处 `removeDocBestEffort`**，逐条行号见「环境与权限（实测结论）」**R38-①**；覆盖 `users` / `tagCategories` / `tags` / `med_paragraphs` / `med_section_audios` / `med_tracks` ＋ 级联 `where().remove()`（`shopProductSkus` / `userTags`）＋ 自动修复路径（`partnerBrandMembers` / `partnerBrands` / `shopCategories` / `userTags`）；**原先 4 处 `.catch(() => {})` 吞错的调用已改为 `removeDocBestEffort`——同样纳入覆盖，不再是「吞错不报」**）。实现状态＝**已实现（Kong）、质检 PASS（Neng-16，2026-09-24）**——**质检证据（真实 CloudBase 往返，带 requestId）**：删不存在 id ⇒ `{deleted:0, requestId:71e425366701d8}` → **抛出**「冥想轨道删除失败：影响条数为 0（文档不存在或无权删除）」；自建文档 ⇒ `{deleted:1, requestId:a884e06fd4c59}` 成功返回 id、复读 `data:[]` 确已删、再删同一 id **复抛同文案**；**反向反证**＝`updateMedTrack` 在 `{updated:0, upsertedId:null, requestId:81420156b9f2b8}` 下**不抛**（符合「update 不断计数」）；静态 **15/15 处置分类全对**；`med_tracks` 清理回 **0** 条（复核：桩测 **27 PASS / 0 FAIL**、lint **127 未上升**）。
- **`allowZero` 与「读不出条数」（R38-①，硬，同 R38-① 节）**：`allowZero` **仅**限「删主对象时顺带删关联行」的**级联清理**——匹配 **0 行＝关联本不存在、已是期望终态**（不是失败）；**主目标文档的删除一律不得用 `allowZero`**；**「影响条数读不出」在任何情形都硬失败**。
- **自动修复路径的例外（R38-④ / **D-B2-16**，Zang 裁定 2026-09-24，硬）**：**4 处 `removeDocBestEffort`**（`database.js` **L1820 / L1839 / L4390 / L4474**）**保持「不抛出」**——它们由**读到脏数据自动触发**，抛出会**中断同一轮后续修复步骤**。**但不是静默放过**：**断言照接**（不再放过 `deleted: 0`）、**失败降级为显式 `console.error`**（旧 `.catch(() => {})` 作废）；**用户点击触发的删除一律严格断言**。**未达到「自动修复也硬失败」的需求时必须另立裁定**，不得由实现自行改为抛出。
- **删除失败的 UI 可见落点（修正登记，2026-09-24）**：删除失败经 `alert` 呈现给操作者，**活文件唯一落点＝`apps/web/src/admin/components/Dashboard/MeditationPage.jsx:3545`**（`alert(\`删除失败：${err?.message}\`)`，注释同处引用 **D-B2-12 / D-B2-15**）。⚠ **旧表述中的 `apps/web/src/admin/pages/…` 为笔误**——冥想后台组件**只有 `components/Dashboard/` 一处**，不存在 `admin/pages/` 下的同名文件，**全文不得再引用该路径**。
- **删除影响条数的判据口径（R38-①，硬，**D-B2-12**）**：判据必须**同时**给出**身份（是否创建者）**与**返回值**——`{deleted: 1}` ＝ 生效；`{deleted: 0}` ＝ **未生效**（创建者可**合法**出现：文档本就不存在；非创建者则是**权限静默**）；**两种都不得当成「删除成功」**。
- **反向纪律（R38-① / **R40-④**，硬，**D-B2-14**）**：**update 路径不得用 `updated >= 1` 作成功条件**——**依据（按 R40-④ 改写）＝ `updated:0` 三义同形**（**值本来相同** ／ **无权写（静默拒绝）** ／ **文档不存在**；普通对象、无 `code` / `message`）**＋ 含对象数组字段的载荷上 `updated` 非确定**（同一 payload 连写三次实测 `0,0,1` 与 `1,0,0`；反向 no-op 亦报 `1`；对象数组子文档读回键序被改写为**字典序**）。**原依据（「R28 已证创建者对自己文档做同值 update 同样返回 `updated: 0`」）系对 R28 权限观察的误读，一律作废**（附录 A.2 / **A39**）——**结论保留、依据改写**（R40-⑦：**结论对、依据错**）。用「影响行数 ≥ 1」判保存成功会把**合法保存判成失败**；update 的成功判据**只看** `code` / `message` 有无错误与**读回的文档内容**。（**对称关系**：**delete 断计数，update 不断计数**——代码注释原文见 `database.js:387-392`，该注释按 R40 同步重写、状态＝**已实现（Kong）、待质检确认**。）
- **写入生效的「有条件例外」（R40-⑤，硬，**仅 8 处**）**：**仅当载荷必然含易变字段**（`updated_at: new Date()` / `version + 1`）时，`updated < 1` **且无 `code`** 可当作「**本次写入未生效**」的**强信号**处理（实测依据＝这些路径 **8/8 样本恒为 `1`**，R40-⑥），**且必须附一次性读回比对**（`Date` 归一为 ISO、**对象 / 数组键序无关**的深比较）：`updated >= 1` ⇒ 过；`updated < 1` 且无 `code` ⇒ **读回一致＝幂等 no-op 成功**、**读回不一致＝抛错**「**{entityLabel}保存失败：未能确认写入生效（未检测到任何变化）（requestId: xxx）**」（**文案不得声称「无权限」**）；**读回失败 ⇒ 抛独立文案、绝不得当成功**。**接入范围＝仅**四个老口径 writer（`saveMeditationAudioLibrary` / `saveMeditationCompositionSettings` / `saveMeditationCalendar` / `saveMeditationLibrary`）＋ 四个 `med_*` updater（`updateMedParagraph` / `updateMedSectionRaw` / `updateMedSectionAudio` / `updateMedTrack`）——**范围外路径一律沿用反向纪律**（**不得**扩展为普适判据；含对象数组载荷的非确定路径**不得**据此判失败）。实现（**`assertCloudBaseUpdateTookEffect`**，实现于 **`database.js:516`**、文案 **`:569`**、**8 个调用点**）＝**已实现（Kong）、质检 PASS（Neng-20，2026-09-24）**（R22 状态词）——**例外条件的实测结论**（**属主不误报、非属主可见失败**）见「环境与权限（实测结论）」**R40-⑤ 实测结论**。
- **失败文案的 requestId 唯一性（v4.11 登记；低危缺陷，已修复）**：`apps/web/src/admin/hooks/useDatabase.js` 的 `getSetupErrorMessage`（**L26-45**）旧版**无守卫**——当 `rawMessage` 已含 requestId（读回断言文案自带）时**再追加一次代理 trace 后缀** ⇒ 失败提示里 **requestId 出现两次**。**已修**：新增 **`/requestid/i` 守卫**（**L30-34**，与 `MeditationPage.jsx` 的 `buildVisibleWriteFailureMessage` 同口径），**并已给出红对照**（修复前版本可复现线上那条重复文案）。**残留边界（挂账 C21）**：`DATABASE_COLLECTION_NOT_EXIST` 分支（**L36-42**）**不拼接 `rawMessage`**，故「消息含 requestId ＋ 命中该分支」时会把 trace 的 requestId **一并省掉**——**实测该组合现实几乎不可能**；修法＝**守卫收窄为「仅通用分支生效」**，**一行可修、已列入下一单**。
- **老四 tab 写入失败的可见性 ＋ 未捕获 Promise 拒绝（v4.11 登记；低危缺陷，已修复）**：`apps/web/src/admin/components/Dashboard/MeditationPage.jsx` 的 `MeditationPresetsTab`（老四 tab 的「冥想库」）原 `handleSave`（原 **L1783**）与 `handleDelete`（原 **L1789**）**裸 `await onUpdate`** ⇒ 写入失败时产生**未捕获的 Promise 拒绝**、页面**无任何提示**。**已修**：tab 级 `try/catch` ＋ 新增 `writeError` state 与现成风格的 `[role=alert]` 内联提示（新行号＝**L1744**（state）/ **L1762-1791**（`handleSave`）/ **L1795-1803**（`handleDelete`）/ **L1867-1871**（提示渲染））。**验证**＝jsdom 真实渲染 ＋ **进程级 `unhandledRejection` 计数**（**红对照：修复前 `unhandled=1` 且无提示**）。**范围边界（硬，不得当遗漏缺陷重报）**：同文件**另有 8 处**裸 `await onUpdate`，分属**音频库 / 冥想设置 / 冥想日历**等其它组件，**本批未动**——**行号（本批按当前代码复核）＝** `AudioLibraryTab` **L1543 / L1548 / L1560**、`CompositionTab` **L2084 / L2089 / L2102**、`CalendarTab` **L2497 / L2504**（共 **8 处**；本批只修 `MeditationPresetsTab` 的 **L1786 / L1799** 两处，即上一条的写入提示路径）。

**新结构过渡说明**：med_paragraphs / med_section_raws / med_section_audios / **med_tracks** 为新主数据源；老 `audioLibrary` / `meditationLibrary` / `compositionSettings` / `meditationCalendar` 冻结只读，待新链路跑通后下线。

---

## 5. 与其他模块的关系

- **手机端 / 小程序冥想**：
  - 老口径：使用相同的 `meditation-session-plan.js` 核心，但 UI 和数据展示不同。
  - **修订（2026-09-23）**：规则 A 的 `meditation-session-plan.js` / `buildMeditationSessionPlan` 仅为**冻结期兼容**。
  - **端侧计划计算（D9，Zang 已裁定 2026-09-23）**：端侧**不再计算老 plan**，改为**读 `med_tracks` + 抽候选轻量组装**（拉 Track 配置 → 按 `section_type` 从候选池抽一条 → 按固定顺序拼接，抽中结果固化写入会话记录，见 D7）；老 `session-plan` 模块**冻结为兼容层**，不在新链路调用、不新增能力。**（v4.10：端侧接入口径见「环境与权限（实测结论）」R41 ①~⑫——数据源一律经 D6、端侧永不直连 DB、不读老 5 项 `app_settings`、不算老 plan）**
  - **端侧读取通道（D6；R30 收紧为硬前置，Zang 裁定 2026-09-24）**：端侧读 `med_tracks` / `med_section_audios` **必须经 D6 只读云函数**——据 R28-①「`med_*` 仅创建者可读写」，端侧身份直连 DB **只会得到静默空集**。D6 因此在第二批执行顺序中排在**转码执行器之后、端侧双轨播放之前**（见 §7）。**（v4.8：D6 的入参 / 出参契约见「环境与权限（实测结论）」R39 ①~⑫——函数已实现于 `cloudfunctions/meditation-read/`，状态＝已实现（Kong）、待质检确认）**
  - **时段键（D4，Zang 已裁定 2026-09-23）**：web/app 用 `morning`，小程序用 `dawn`，**统一为 `morning`**；小程序侧由 **Kong 在实现时修正**，本规范仅登记、不改代码。**（v4.13：落地口径＝R44-⑫——小程序写入侧为 `morning`、App 读侧做 `dawn` / `morning` 别名归一、**`BADGE_SLOT_KEYS` 不动**；时段边界 **0:00–4:59 不再算 `morning`**）**
  - **播放模型**：端侧保持**双轨**（背景 `loop` + 人声 `sequence`），实现参考 `MeditationPlayerScreen.jsx` 的两个 `Audio` 元素。**（v4.10：唯一口径源＝R41-②——音量取响应里的 `background_track.volume` / `voice_track.volume`（现 0.33 / 1），**缺省才回退常量、常量非权威源、绝不覆盖响应值**；小程序本批只支持前台播放，见 R41-⑨）**（v4.11：链接失效恢复 / 重入防护 / 陈旧判定 / `onerror` 语义 / 降级与跳段 / 重签的替换范围见 **R42 ①~⑥**；其中 **R42-⑥ 的设计口径经 Neng-21 实测未生效 ⇒ 已修复（Kong）⇒ 经 Neng-22 复验 PASS（桩面；真链路待部署）**，见该条「实测状态」段）**（v4.13：**小程序**端侧的专项口径见 **R44 ①~⑬**——**前台双轨不降级**（两个独立 `InnerAudioContext`）、**本批只前台**（切后台停播＝平台限制、**不判缺陷**）、**格式只取 mp3**、**`onError` 恢复的小程序明文例外**（同参整场重调至多 1 次）、**直设 `ctx.src`**、**卸载 `destroy()` 两实例**、**iOS 静音出声用 `wx.setInnerAudioOption`**、**固化先落本地**、**共享层只能经 `npm run miniprogram:sync`**；**状态＝「已定口径、待实现」**）**
- **奖励系统**：冥想完成奖励在 `MeditationSettings.jsx` 中配置（rewardPoints、allowRepeatRewards、inviterRewardRate）。
- **通用 UI 规范**：完全遵循**通用 UI 规范**的卡片、颜色、字体、交互反馈规则。⚠ 原引用的 `ui.spec.md` **当前仓库内不存在**（此处为泛指）；若后续新增通用 UI 规范文件，应回填实际文件名。
- **共享工具**：大量逻辑下沉到 `@liwu/shared-utils/meditation-*`（新链路新增 normalizer / Track 计划模块时，**建议新建模块，不改造老模块**）。

---

## 6. 设计约束与注意事项

- 后台优先桌面体验，但需考虑响应式。
- 音频预览必须处理浏览器兼容（尤其是 Opus）；**C 端兜底已裁定＝双格式（Opus 主体 + mp3 兜底）+ 运行时 `onerror` 降级为 mp3**（D3，见「交付格式与 C 端兜底策略」）；**仅两格式都缺时才阻断**。
- 所有敏感操作（删除、保存）需明确 loading / success / error 状态。
- ~~预设与日历的联动必须实时反映在预览中。~~（规则 A 冻结，仅需保持现状可用）
- **字数硬、时长软**：`target_char_count` 为硬约束（作编排/录制依据）；Chapter/Section 时长仅为**上限/参考值**，实际时长按录制实测推导。**两者不在同一轴上，不存在真冲突**（G4）。
- **不得截断**：禁止「超长尾部截断」实现；超上限时**仅告警、不阻断**（G4）。
- **不得引入 TTS**：任何新代码不得调用 `tts-proxy`、不得写 `is_ssml`、不得做 `<break>` 归一化、不得提供「AI 试听」。
- **15 分钟基准靠留白填充**：留白/颂钵/自然过渡补足缺口，留白期间背景轨继续播。
- **留白配置层级固定为章间级**，不做 `section_type` 级留白。
- **章结构不可变**：顺序固定、不可重复、章内 Section 序列固定。
- **随机性只在 Section 层**；Track 固定可复现。
- **stale 不阻断**：Paragraph 变更只标记与提示，不作废音频。
- 避免在代理商/用户端暴露平台技术服务费相关概念（与冥想无关但为全局约束）。

---

## 7. 后续演进方向

- ~~更细粒度的权限控制（不同 partner 可视范围）~~ → **仍待补充（余留 TBD，见附录 B / B.3-T2）**；端侧读取 `med_tracks` / Section 音频的通道**已裁定**为新增只读云函数（D6）
- 批量导入/导出音频与预设 → **改为**：批量导入 Paragraph、批量导出 Section 候选池
- 可视化冥想日历编辑器 → **规则 A 冻结期不推进**
- 实时统计（完成次数、时长）→ **新增**：录制时长实测统计、候选池命中率统计
- **新增**：老四 tab 下线计划（**D10 已裁定**）：**第一批验收通过后**老四 tab **隐藏入口并只读**；老数据（`app_settings.meditation_*`、`audio_transcode_jobs`、`tts_text`）**保留一个版本周期**后再清。**⚠ 前置收紧（R20-②，Zang 裁定 2026-09-24）**：隐藏入口**必须同时满足**「`med_tracks` 集合已就绪」与「R7 端到端验收通过」——否则新「冥想轨道」tab 无法存盘而老 tab 入口已隐藏，管理员**失去唯一可用的管理路径**（详见 §1.2 与附录 C / C7）。**状态（R37）**：① `med_tracks` ✅ **已就绪**；② R7 **Track 路径已通过**、四个老口径 writer **待质检确认**（未完全满足）。
- **新增**：`med_tracks` 的版本化与灰度发布能力
- ~~**新增**：Opus 兜底格式调研结论落地后回填本节与「音频格式与转码规范」~~ → **已回填（D3 已裁定 2026-09-23）**，见「交付格式与 C 端兜底策略」
- **新增（R15 / R20 / R30，裁定 2026-09-24）：第二批范围与执行顺序**
  - **执行顺序（R30 修正，硬）**：① **转码执行器**（raw → Opus 主体 + mp3 兜底，**参数与执行形态按 R33 定稿**，见「转码参数定稿与实现约束（R33）」）→ ② **D6 只读云函数** → ③ **端侧双轨播放**（背景 `loop` + 人声 `sequence`；**先 App、后小程序**）——含 Track 预览（R9）**（v4.10：端侧接入口径见 R41 ①~⑫；**v4.11 状态词按面**：共享模块＝**已实现（Kong）、质检 PASS（Neng-19，桩面）**、**B1＝已实现（Kong）、质检 PASS（Neng-19，桩面与静态）**、**B2a＝已实现（Kong）、质检 PASS（Neng-22，2026-09-24，桩面：36/36 ＋ 三个变异体红对照；Neng-21 的 1 条中型 ＋ 1 条低均已修复〔Kong 红 7/14 → 绿 15/15，`dist` 逐字节复核〕）**；小程序本批只支持前台播放；**恢复路径与格式降级见 R42 ①~⑥**；**（v4.13）小程序端侧接入的专项口径见 R44 ①~⑬（状态＝「已定口径、待实现」）；共享层接入（Step 1）＝已实现（Kong）、待质检确认**——同步脚本白名单 **8→10**、转换器补 `export class`、build 门禁 **15→17**、单一源核对 **10/10 逐字节相等**；**小程序侧现状＝冥想页零音频**〔`apps/miniprogram/src/pages/meditation/index.js` 150 行〕）**→ ④ **D10 执行**（老四 tab 隐藏入口并只读）。**D10 自身前置仍按 R20-②**（`med_tracks` 集合已就绪 ＋ R7 端到端验收通过，见 §1.2 / 附录 C / C7）——**状态（R37）**：① `med_tracks` ✅ **已就绪**；② R7 的 **Track 路径已通过**、四个老口径 writer **待质检确认**（**复验状态（v4.11）＝静态 PASS ＋ 动态复验：冥想库路径 PASS（Neng-20，2026-09-24）**，见质检计划 §8.1 / **X17＝已裁并已 PASS**）⇒ **②未完全通过前不得隐藏**，**不因排在末位而放宽**。
  - **D6 为何是硬前置（R30）**：据 R28-①「`med_*` 仅创建者可读写」，端侧身份读 `med_tracks` / `med_section_audios` 得到**静默空集**——**不先做 D6，端侧播放链路在权限口径下根本取不到数据**；故 D6 **不是优化项**。
  - **不在上述顺序内单独执行**：`med_*` 权限收紧（R13 / R16-③）——**必须先按附录 B.7 拍板方案并完成身份模型改造（非匿名登录 ＋ 管理员角色）**（R29），**未拍板前不得动权限规则**；`stale_paragraph_ids` 累积语义（R4 / R18-①）仍归第二批。
  - **状态与其它归属**：K8 / K9 **已实现（Kong）、待质检确认**（下拉行顺序 R6 / R20-①、级联仅在文本实际变化时触发 R19），复验项见质检计划 §8.1；**阻塞项** ＝ ~~`med_tracks` 集合人工创建（R12 / C7）~~ → **已解除（R37-②，2026-09-24：集合已建），当前无阻塞项**；**待人工确认项** ＝ 生产环境 CloudBase 实际权限规则（R16-④）；**待人工拍板项** ＝ 附录 B.7 三方案（R29）＋ **C14 / C15**（默认种子 Track 预估口径 **26:55 vs 15:00**；dev 身份与环境治理三选一——均见附录 C，R38-③）＋ **C19**（背景轨是否按章切换，待用户拍板，R42 同批）＋ **C22**（`apps/app/public/audio/meditation/` 下三个老兜底音频 `sea_wave1.mp3` / `sea_wave2.mp3` / `sea_wave_seagull.mp3` 是否删除——**git 跟踪、合计 ≈1.42 MB、源码零引用**、属老规则 A 兜底音、**已被 D6 取代**；Zang 已建议删除、**待用户一句话**）；**待排期项** ＝ **C17**（38 处 update 路径未接读回断言）＋ **C20**（非 403 取源失败是否补「原样重试一次」，R42 同批）；**下一单** ＝ **C21**（`getSetupErrorMessage` 集合缺失分支不拼接 `rawMessage`，一行可修）。逐条理由与「不修原因」见附录 C。

---

## 附录 A：已废弃条款索引（老规则 A）

> 便于追溯：本表列出本次被作废/降级的老条款，正文中均以删除线或「已废弃」标注。

| # | 老条款（位置） | 处置 | 取代者 |
|---|---------------|------|--------|
| A1 | 「超长尾部截断」（数据结构第 2 条） | **废弃** | 「超过时长上限时告警（不阻断）」 |
| A2 | Chapter/Section「固定时长」（数据结构 2/3 条） | **降级** | 「时长上限 / 参考值」（`max_duration_seconds`） |
| A3 | 「TTS 或管理员上传优先使用 MP3」（音频格式节） | **部分废弃** | 浏览器 `MediaRecorder` 网页录音 + 上传 |
| A4 | 「TTS 流程」（音频格式节） | **废弃** | 无 TTS，真人朗读 |
| A5 | `tts-proxy`（`apps/web/src/admin/utils/ttsService.js`） | **废弃** | 无 |
| A6 | `is_ssml` / `isSSML`（normalizers、database.js） | **废弃** | 无 |
| A7 | `<break time="1s"/>` 毫秒归一化（MeditationPage） | **废弃** | 无 |
| A8 | 音频库 tab「TTS 文本」「AI 试听」 | **废弃** | 无 |
| A9 | 老 `tts_text` 数据 | **不迁移，直接废弃** | `med_paragraphs.text` |
| A10 | 音频库/冥想库/冥想设置/冥想日历 四 tab | **冻结只读** | 段落文本库 / 原始音频库 / Track 配置 |
| A11 | `compositionSettings.segments` 时间轴 | **不复用，待下线** | `med_tracks` |
| A12 | preset `groupSelections`（group 层抽选） | **语义平移** | Section 候选池抽选 |
| A13 | 「预设与日历联动实时反映在预览中」（约束节） | **不再推进** | `med_tracks` 预览 |
| A14 | `med_section_audios.section_raw_id` 唯一关联 | **废弃** | 非唯一候选池（1..N） |
| A15 | 「AI 试听」按钮（原始音频库 P0 实现，调 `synthesizeSpeech`） | **废弃** | 无 |
| A16 | 小程序时段键 `dawn` | **待修正（D4 已裁定，Kong 实现时改）** | 统一 `morning` |
| A17 | 「Opus 检测不通过即阻断预览」（音频格式节，2026-09-23 前口径） | **废弃（D3 已裁定）** | 双格式选择 + `onerror` 运行时降级 mp3；仅两格式都缺才阻断 |
| A18 | `med_section_raws.audio_url` / `file_id` 直写（实现现状偏差） | **废弃（D8 已裁定）** | `med_section_audios` 唯一口径 + `audio_candidates` 引用 |

### 附录 A.2：第一批验收新增的废弃 / 降级 / 延后索引（R 系列）

> 依据：冥想第一批验收裁定（2026-09-24）。与 A1~A18（老规则 A）分列，避免混淆责任批次。

| # | 被取代的条款 / 实现习惯（位置） | 处置 | 取代者 |
|---|--------------------------------|------|--------|
| A19 | 纯音频段 label 用 `section_type` 名作前缀（第一批实现前口径） | **降级（R1）** | 前缀用**章节名**：「自然库 take-N」/「颂钵库 take-N」 |
| A20 | 「引用 Paragraph 被改的 Section-Raw 即显示『需重录』」且不限是否已录音（§2.3 旧措辞） | **收窄（R3）** | 仅当**已有候选音频**且 stale 为 true 才显示；从未录制不显示 |
| A21 | `stale_paragraph_ids` 单义「触发 stale 的段落」 | **拆为两段语义（R4）** | 第一批＝本次新增差集；第二批＝累积不一致集合 |
| A22 | 「未报错即视为资源存在 / 写入成功」（CloudBase resolve 返回错误对象的常见误判） | **废弃（R7）** | 必须读 `res.code` / `res.message`；写被拒不得静默当成功 |
| A23 | Track 预览（双轨）作为 Track 配置 Tab 的第一批功能（§1.2 / §3.7 旧措辞） | **延后（R9）** | 归**第二批**；正文两处已标批次 |
| A24 | 「章序 / 章内 Section 序列可由管理员调整」（若被实现） | **废弃（R10）** | 只读；`normalizeMedTrack` 折回六章固定模板 |
| A25 | 附录 B / B.3-T1「raw / final 路径为建议值、待与 `audioUpload` 对齐」 | **关闭（第一批实现已定稿）** | `meditation-audio-raw/{section_type}/{section_raw_id 或 'audio-only'}/take-{n}.{ext}`（追溯见 B.4） |
| A26 | `med_paragraphs.revision`「**用于 Section-Raw 的 stale 比对**」（字段释义，v4 前口径） | **废弃 / 收窄（R19，Zang 裁定 2026-09-24）** | `revision` **仅作审计追溯，不参与 stale 判定**；stale 只看文本快照 / 文本比对；级联仅在段落文本实际变化时触发 |
| A27 | D10 前置条件＝「**第一批验收通过后**」即可隐藏老四 tab（B.1 / §1.2 / §7 旧措辞） | **收紧（R20-②，Zang 裁定 2026-09-24）** | 必须**同时**满足「`med_tracks` 集合已就绪」与「R7 端到端验收通过」，否则不得隐藏（避免管理员失去唯一管理路径） |
| A28 | `MED_WORD_COUNT_THRESHOLDS = { ok: 0.10, hard: 0.25 }`（G1 常量建议，v4.2 及以前） | **废弃（R25，Zang 裁定 2026-09-24）** | 代码实际常量 `MEDITATION_WORD_COUNT_DEVIATION_THRESHOLDS = { slight: 0.1, severe: 0.25 }`（`packages/shared-utils/meditation-track-template.js`）——`MED_WORD_COUNT_THRESHOLDS` / 键名 `ok`·`hard` 为**从未落地的旧命名**，已由代码常量命名取代（R25）；另：曾建议的新模块 `meditation-word-count.js` 从未创建 |
| A29 | 「每轮开工计数 `0/0/0` ＝ 外部清库 / 并发写者介入」这一**判断假设** | **作废（R28，Zang 裁定 2026-09-24）** | 由**权限隔离解释**取代：`med_*` **仅创建者可读写**（非创建者按 `_id` 读返回**静默空集 `{data:[]}`**）＋ **匿名会话**（旧称 `dev_login`，R36-① 更正）**每 profile 换匿名 uid** ⇒ 「换一轮就看不到数据」由此完整解释。**该假设不得再作为结论引用**（见「环境与权限（实测结论）」R28-④） |
| A30 | 「收紧 `med_*` 权限可单独执行」的口径（R16-③ 原写法） | **收紧（R29，Zang 裁定 2026-09-24）** | 权限收紧＝**成套动作**：**必须先解决后台身份模型（非匿名登录 ＋ 管理员角色），再收紧权限**——匿名会话下单独收紧会**静默失效**（越权写只返回 `updated:0`、无错误；`app_settings` 为既有先例，R28-②）。三方案见**附录 B.7**（待人工拍板） |
| A31 | 「D6 只读云函数属可延后的优化项 / 排在端侧播放之后」的隐含顺序（§7 第二批旧序列） | **升为硬前置（R30，Zang 裁定 2026-09-24）** | 第二批顺序固定为 **转码执行器 → D6 只读云函数 → 端侧双轨播放（先 App、后小程序）→ D10**（D10 自身前置仍按 R20-②）；依据：端侧在「仅创建者可读」下读 `med_tracks` / `med_section_audios` **只会得到静默空集** |
| A32 | **Opus 主体 `libopus -b:a 48k -vbr on -compression_level 10 -application audio`**（音频格式节原「固定」转码参数）＋ **mp3 兜底的 `46k` 建议值 / `libmp3lame -b:a 48k -ar 44100`（未带 `-ac 1`）** | **废弃（R33，Zang 裁定 2026-09-24）** | ① Opus 主体改用 **`-c:a libopus -b:a 32k -vbr off -ac 1 -ar 48000`**（`.ogg`）——依据：**默认 VBR 下 `-b:a` 不可控**（实测 `32k` 漂到 **54.9kbps / 1.71x**；CBR 实测 **32.6kbps / 1.02x**），且源为双声道**必须 `-ac 1`**（固定码率下双声道只砍每声道质量、不省体积）；② mp3 兜底定稿 **`-c:a libmp3lame -b:a 48k -ac 1 -ar 44100`**（实测 **48.05kbps**）；**`46k` 档位作废**——`46k` **不是 MPEG-1 Layer III 合法档位**，libmp3lame **吸附为 48k**，与 `48k` 产物 **md5 完全相同**，写它只会制造无意义的实现分歧（**说明**：`46k` 属**候选建议值、从未落入本规范正文**——正文原值即为 `48k`；按 R33 指令仍登记为本废弃索引，且**全文不得再出现**）；③ 执行形态定稿 **单次 ffmpeg 调用双路输出**。正文落点＝§「音频格式与转码规范」转码参数行 ＋ 新增「**转码参数定稿与实现约束（R33）**」。**另注**：实现侧 `scripts/audio-transcode-worker.mjs` 第 28 行 `DEFAULT_FFMPEG_AUDIO_ARGS` 目前**仍为旧参数**，属**待随 C6 / X13 更新的实现现状**，非规范口径（**⚠ 该「仍为旧参数」表述已由 R34 / R35-③ 更正：worker 第 28 行已随本轮更新为 48k 立体声硬 CBR**） |
| A33 | **Opus 主体 `-c:a libopus -b:a 32k -vbr off -ac 1 -ar 48000`（32k 硬 CBR **单声道**）**＋ 其配套论证（「**必须 `-ac 1`**」「固定码率下双声道只是把每声道质量砍半、体积不变」）＋「**单声道是转码输出（`-ac 1`）的属性**」的表述 | **废弃（R34，Kevin 直接裁定 2026-09-24）** | 改为 **`-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000`（48k 硬 CBR **立体声**）**，mp3 兜底同步 **`-c:a libmp3lame -b:a 48k -ac 2 -ar 44100`**；**`-vbr off` 仍然必须**（48k VBR 实测漂到 ≈73kbps、60s 样本 552.9KB）。**实测（照抄）**：60s → ogg **372181B ≈363.5KB / 48.65kbps / 2 声道 / 48000Hz**、mp3 **367639B ≈359.0KB / 48.06kbps / 2 声道 / 44100Hz**；300s → ogg **1823385B ≈1780.6KB / 48.62kbps**、mp3 **1800507B ≈1758.3KB / 48.01kbps**。**代价**：旧 32k 单声道 ogg 60s **243.9KB**（≈32kbps 全给单声道）→ 新 48k 立体声 ≈ **24kbps/声道**（**体积 +49%**）；mp3 48k **单声道与立体声体积相同**（CBR）。正文落点＝§「音频格式与转码规范」转码参数行、§「录制与转码链路」第 4 条、§「转码参数定稿与实现约束（R33 初定 → **R34 改定**）」R34-① ② ④ ⑤ 与 R33-⑦ 第 3 条。**全文不得再出现「32k / 单声道 / `-ac 1`」的转码表述**（历史追溯除外）；R33-⑤ 的「32k 单声道可听化程度」随本条**失效**，听感验收改判 **48k 立体声（X15）** |
| A34 | 「`med_tracks` 集合**未创建** ⇒ 一切 Track 落库类验收（含 R7 写入校验、`version` 递增）**一律标「阻塞」**」（R12 / R20 / R26 旧口径） | **关闭（R37-②，2026-09-24 实测确认）** | **集合已建**（证据＝`res.code` 无 `code` / `message` ＋ `med_section_raws` 正对照同形 ＋ `add` 成功 ＋ **两轮端到端写入 / 读回 / 删除成功**；R7 g/h 数据层与 UI 层均通过）⇒ **落库类验收自 v4.7 起按实际结果判 PASS / FAIL**（**不得**再标「阻塞」、也**不得**缺省通过）；挂账 **C7 已关闭**。正文落点＝`med_tracks` 环境前置、集合与代码映射、§1.2、§7、附录 C / C7 |
| A35 | 「用**名义 60s**（或任何名义时长）**反推**转码产物码率 / 体积」的复核口径 | **作废（R37-①，2026-09-24 实测）** | 实测样本**实际时长 ≈61.2s**（`ffprobe` 61.2035s / 61.200s；300s 样本精确 300.0s）⇒ **必须先测输入实际时长**再算体积 / 码率：**用名义 60s 反推得 ≈49.6kbps 的假偏差**（正确 48.65kbps），**不得据此判失败**。正文落点＝R34-③、§3.7 |
| A36 | 「`updated >= 1`（影响行数 ≥1）＝ update 成功」的判据 | **作废（R38-①，2026-09-24；依据按 **R40-④** 改写）** | **`updated` 条数既非权限证据、也非成败证据**——**改写后的依据**＝**三义同形**（值本来相同 ／ **无权写静默** ／ 文档不存在，R40-②）**＋ 含对象数组字段的载荷上 `updated` 非确定**（同一 payload 连写三次实测 `0,0,1` / `1,0,0`，R40-③）；**原依据「R28 已证同值 update 也返回 `updated:0`」系对 R28 权限观察的误读、作废**（**A39**）。update 只以 `code` / `message` 有无错误 ＋ **读回文档内容**为判据；**有条件例外**（**仅**载荷必然含易变字段的 8 处，R40-⑤）＝`updated < 1` 且无 `code` 时**须读回比对**、文案**不得声称无权限**。**对称口径**：删除以 **`deleted` 条数**为准（**`deleted = 0` 必须报错**，R38-①）。正文落点＝§4 写入结果校验硬口径 ＋ **R40** |
| A37 | 「后台自动修复（reconcile）路径的删除失败**可静默放过**」的旧写法（`.catch(() => {})`，连日志都没有） | **作废（D-B2-16 / R38-④，Zang 裁定 2026-09-24）** | 4 处 `removeDocBestEffort`（`database.js` L1820 / L1839 / L4390 / L4474）**断言照接**（`assertCloudBaseDeleteResult`，**不再放过 `deleted: 0`**）、**失败降级为显式 `console.error`**；但**该路径本身保持「不抛出」**（由读到脏数据自动触发，抛出会**中断同一轮后续修复步骤**）。**用户点击触发的删除一律严格断言**（不得走该路径）。**未达到「自动修复也硬失败」的需求时必须另立裁定**。正文落点＝R38-④、§4 写入结果校验硬口径；代码注释＝`database.js:448-451` |
| A38 | 「D6 只读云函数的**入参 / 出参契约未定义**」——只写「照 `getUserPhone` / `getHomePageData` 模式新增只读云函数」，**action 集 / 出参形状 / 可交付判据 / 临时 URL 口径 / 字段白名单 / 候选上限 / 是否做身份校验一律留待实现方自定**（D6 / 附录 B.1 / §5 / §7 旧状态） | **作废（R39，2026-09-24：实现方 12 条假设升格为口径）** | 一律以 **R39 ①~⑫** 为准：函数 `cloudfunctions/meditation-read/`（`cloudbaserc.json` 已登记 **30s / 128MB / Nodejs18.15 / 无触发器**）；**3 个 action**＝`getTrack`（**缺省**）/ `getSectionAudios`（必填 `section_types` 或 `section_type`）/ `listTracks`（只列 `enabled !== false`、不签发链接、不读音频集合）；成功 `{ok:true,data,meta}`、失败 `{ok:false,error,message,details?}`（`READ_FAILED` / `INVALID_ACTION` / `TRACK_NOT_FOUND` / `TRACK_DISABLED` 等）；**可交付＝opus ＋ mp3 齐备**、`queued`/`processing`/`failed` 一律不下发、历史 `idle` 文档仍下发、不可下发项按 `stats.excluded` 五类逐条计数；**现签** `getTempFileURL`（去重后一次批量，`maxAge = 7200`）、**不透传 `audio_url`**、**不下发 `file_id`**、部分失败剔除计数、全部失败整单 `READ_FAILED`；**15 项字段不得下发**；**折回六章模板**（末章 gap 恒 0，R10）；**不抽签、不写会话**（D7 / D9）、唯一源 `med_section_audios`（D8）；**查询 50 / 下发 10 / listTracks 20**；**不做端侧身份校验＝口径、非疏漏**（收紧须另裁，并入 C15 / X9）；端侧缓存 ≤ 半有效期；SCF 内置凭证 ＋ `lib/*` 为权威源精简副本（D-B2-8）。正文落点＝「环境与权限（实测结论）」**R39** 小节、§5 / §7 与 `med_tracks` 权限建议的 D6 引用、附录 B.1 / D6、附录 B.5 / R39；质检计划 §0.1（第 13 条） / §8.1（X14 / **X16**） |
| A39 | 「**同值 update 也返回 `updated: 0`**」作为**普适命题**（原 R38-① / A36 的作废依据；原文误标为「R28 已证」） | **作废 / 改判为「条件性现象 ＋ 非确定事实」（R40，2026-09-24 实测裁定）** | **改写**：① **无对象数组的普通载荷**上 `updated` 计「**内容真正发生变化**的文档数」（真改值 → `1`；纯同值写回 → `0`；`where` 命中 2 条同值 → `0`、真改 → `2`），但 `updated:0` **三义同形**（**值本来相同** ／ **无权写（静默拒绝）** ／ **文档不存在**）—— **不是**权限证据、**也不是**成败证据；② **含对象数组字段的载荷**上 `updated` **非确定**：同一 payload 连写三次实测 **`0,0,1`**（`2d28a687fe20b8` / `8357ac503ca828` / `fbb197ce64c288`）与 **`1,0,0`**（`c108e828eed148` / `a0e6253167f67` / `543c320bdc64b`）；**反向 no-op 亦实测报 `1`**（`61c6ded59bb9a8` / `bfed7d9285dd3` / `eba78cff5e08d8`）；对象数组子文档读回键序被改写为**字典序**。⇒ **该单点观察不得再作普适依据**；**D-B2-14 的结论保留、依据按 R40-④ 改写**（R40-⑦：**结论对、依据错**）。正文落点＝「环境与权限（实测结论）」**R40**（R40-①~⑦）、§4 写入结果校验硬口径（反向纪律 ＋ 有条件例外）、**A36**（依据同步改写） |
| A40 | 端侧读**老的 5 项 `app_settings` 冥想配置** ＋ 在端侧新链路调用**老 plan**（`meditation-session-plan.js` / `buildMeditationSessionPlan`） | **废弃（R41-①，Zang 裁定 2026-09-24）** | 端侧 Track 与候选池**一律经 D6 只读云函数（R39 契约）**取得——`getTrack` ＋ `getSectionAudios`；**端侧永不直连 DB 读 `med_*`**（R28-① 下只得**静默空集**，R30：D6 为硬前置）；老 `session-plan` 模块**冻结为兼容层**、不在新链路调用、不新增能力（D9）。正文落点＝「环境与权限（实测结论）」**R41-①**、§5（端侧计划计算 / 端侧读取通道）；质检计划 §8.1 / **X12**、**X18** |

---

## 附录 B：裁定清单与余留 TBD（Zang 已裁定 2026-09-23）

> **本节状态（2026-09-23 更新）**：原先「待 Kevin 确认项」D1~D10 已由 **Zang（管理员）按推荐默认值裁定**，并已**就地回填正文对应章节**；规范空白项 G1~G5 同批给出确定口径。
> **每一条裁定都是「一句话可改」**——Kevin 一句话即可覆盖该条结论，无需重审规范结构（各条可改点见表内「可改点」列）。
> 正文中指向本附录的「待确认 / TBD / 未定」标注**已全部清除**；本附录保留裁定全文，作为追溯与实现依据。
> **2026-09-24 更新（v4）**：新增 **B.4 第一批验收已关闭项**（自 B.3 移出）、**B.5 第一批验收裁定索引（R1~R15）**、**B.6 第一批验收产生的待裁口径（交 Zang）**。
> **2026-09-24 更新（v4.1）**：**B.6 六条已全部由 Zang 裁定（R16~R20）并收敛至正文**，B.6 转为「已裁定记录」；B.5 索引扩为 **R1~R20**。
> **2026-09-24 更新（v4.4）**：新增 **B.7 待人工拍板项（R29，`med_*` 权限收紧三方案）** 与 **B.8 上一轮报告 4 条残留的处置**；B.5 索引扩为 **R1~R32**。
> **2026-09-24 更新（v4.5）**：**B.3 关闭 T3**（mp3 参数已定稿）并**新增 T4**（32k CBR 人工听测，待确认）；**B.5 索引扩为 R1~R33**（新增 R33 转码参数定稿与实现约束）——**⚠ 该版 32k 单声道口径已由 v4.6 / R34 覆盖**。
> **2026-09-24 更新（v4.6）**：**B.3 的 T3 参数随 R34 改为 48k 立体声**、**T4 改口径为「48k 立体声人工听测（用户所有）」**；**B.5 索引扩为 R1~R36**（新增 R34 转码参数改定、R35 执行器实现与队列分区、R36 后台质检入口现状）。
> **2026-09-24 更新（v4.7）**：**B.5 索引扩为 R1~R38**（新增 R37 口径更正 / 第一批验收结果、R38 删除路径缺陷与 dev 环境事实 ＋ **R38-④ / D-B2-16 新裁定**）；**B.3 无变化**（T4 仍为「48k 立体声人工听测，用户所有」）。
> **v4.7 复核补注（2026-09-24，Jing）**：本批为 **v4.7 后的小修正**——**不新增版本号、不改任何已裁参数**：① **R38-① 改以行号级口径**陈述（断言函数 `database.js:425`、反向纪律注释 `:387-392`、15 处调用点逐条行号、桩测 **27 PASS / 0 FAIL**、lint **127 未上升**）；② **新增 R38-④ / D-B2-16**（后台自动修复路径的删除**保持不抛出**，但断言照接、失败降级为显式 `console.error`）；③ **R36 扩为 ①~⑦**（**入台配方已实测复现并回填**，**「环境不可达」纪律放宽为「环境伪失败（采样过早）」**）；④ 新增 **A37**，并修正 **`deleteMedTrack` 调用方口径**（保留的服务 API、当前无 UI 入口）与 **删除失败 UI 落点**（`components/Dashboard/MeditationPage.jsx:3545`）。
> **2026-09-24 更新（v4.8）**：**B.5 索引扩为 R1~R39**（新增 **R39＝D6 只读云函数读契约**，12 条口径；**R38-① 质检结论登记为 PASS（Neng-16，2026-09-24）**）；**B.1 / D6 行补 R39 落点**（D6 的入参 / 出参契约已定稿并实现）；**B.3 无变化**（T4 仍为「48k 立体声人工听测，用户所有」）。
> **2026-09-24 更新（v4.9）**：**B.5 索引扩为 R1~R40**（新增 **R40＝`updated` 语义与写入成功判据（含 D-B2-14 改写；`app_settings` 写侧两条更正）**）；**B.1 / D6 行无变化**；**B.3 无变化**（T4 仍为「48k 立体声人工听测，用户所有」）；**B.7 无变化**（权限收紧三方案仍待人工拍板）。
> **2026-09-24 更新（v4.10）**：**B.5 索引扩为 R1~R41**（新增 **R41＝端侧双轨播放接入口径**，12 条已定裁决）；**B.1 / D6 行无变化**；**B.3 无变化**（T4 仍为「48k 立体声人工听测，用户所有」）；**B.7 无变化**（权限收紧三方案仍待人工拍板）；**附录 A.2 新增 A40**（端侧读老 5 项 `app_settings` 与端侧老 plan 计算废弃）；**附录 C 新增 C17 / C18**。
> **2026-09-24 更新（v4.11）**：**B.5 索引扩为 R1~R42**（新增 **R42＝端侧恢复路径与格式降级口径**，依据＝**Kong 实现 ＋ Zang 裁定 ＋ Neng-21 独立复验**——**⑥ 的设计口径尚未真正生效＝中型缺陷、修复单已派**）；**B.1 / D6 行无变化**；**B.3 无变化**（T4 仍为「48k 立体声人工听测，用户所有」）；**B.7 无变化**（权限收紧三方案仍待人工拍板）；**本批未新增附录 A.2 条目**（两条 low 缺陷为**已修复项**、R42 为**新增口径**，均不构成「旧条款作废」⇒ **不占 A 编号**）；**附录 C 新增 C19~C21**（＋ C2 补注）。

### B.1 裁定明细（D1~D10）

| ID | 事项 | 裁定结论（Zang 已裁定 2026-09-23） | 正文落点 | 可改点（一句话可改） |
|----|------|------------------------------------|----------|---------------------|
| **D1** | 录制粒度 | **逐 Paragraph 录制 + 按顺序拼接成 Section 音频**；段间静默＝留白实现点；同一 Paragraph 被多处引用**不必重录**；整段 Raw 一次录完**不采纳** | 「录制与转码链路」第 5 条；`record_granularity` | 改为整段 Raw 一次录完 |
| **D2** | 章间留白默认值 | **默认种子 `141s × 5 处`＝705s；590 字 ≈ 197s + 705s ＝ 902s ≈ 15.0 分钟**。**可配、不是硬编码**；对照：90s×5 → 10.8 分钟、60s×5 → 8.3 分钟 | 「章间留白默认值」；`gap_after_seconds` | 改 141 或逐章改 gap |
| **D3** | Opus 兜底 | **双格式：Opus 主体 + mp3 兜底**（全量 mp3、维持阻断均不采纳）。依据：小程序 `InnerAudioContext` 格式表 ogg/mp4 均 iOS ✗ 且全表无 opus（iOS 走原生播放器，与系统版本无关）；iOS Safari/WKWebView 18.4 起才支持 Ogg Opus；opus-in-mp4 仅 Chromium（WebKit 实测 `canPlayType` 空串）、webm 有解码失败先例 → 第三条路不成立。行为：Web `canPlayType` 由硬阻断改「选择」+ 必须 `onerror` 运行时降级 mp3；小程序不用 `canPlayType`、按平台直接 mp3；App 原生插件一律 mp3；后台预览仅两格式都缺才阻断并报真异常 | 「交付格式与 C 端兜底策略」；`med_section_audios` 兜底字段 | 改为全量 mp3 / 只交付 mp3 |
| **D4** | 时段键统一 | 统一为 **`morning`**；小程序 `dawn` 由 **Kong 在实现时修正**；**本规范仅登记、不改代码** | 「时段键统一」；§5 | 维持 `dawn`（不建议） |
| **D5** | Track 配置 UI 落点 | **新建「冥想轨道」子 Tab**（`SUB_TABS` key＝`med-tracks`，**以代码为准，R26**；原写「`tracks`」未落地）作为规则 B 活跃区；**`composition` tab 保持冻结只读、不复活** | §1.2 子 Tab 表；§3.7 | 复用/改造 composition tab |
| **D6** | 端侧读取通道 | **新增只读云函数**（照 `getUserPhone` / `getHomePageData` 模式）；**`med_*` 对匿名保持关闭**。**（v4.8：具体入参 / 出参契约已定稿 = R39 ①~⑫；函数已实现于 `cloudfunctions/meditation-read/`）** | `med_tracks` 权限建议；§7；**「环境与权限（实测结论）」R39**；附录 B.5 / R39；附录 A.2 / **A38** | 改用只读视图/白名单直读 |
| **D7** | 抽中候选固化 | **固化写入冥想会话记录**（`section_type` → 抽中 `med_section_audios._id`，并记 Track `version`），用于复现与统计 | 「随机性下沉到 Section 层」；§5-D9 | 不固化（只存统计计数） |
| **D8** | 音频记录口径偏差 | **收敛到 `med_section_audios` 为唯一口径；Section-Raw 只存 `audio_candidates`**；老 `audio_url` / `file_id` / `audio_id` **废弃**（只读兼容、不再写入、不做双写） | §3.6 特殊规则；`med_section_raws` 字段 | 保留老字段双写（不建议） |
| **D9** | 端侧计划计算 | 端侧**不再算老 plan**，改为**读 `med_tracks` + 抽候选轻量组装**；老 `session-plan` **冻结为兼容层** | §5 | 继续用老 plan（不建议） |
| **D10** | 老模型下线期限 | **第一批验收通过后**：老四 tab **隐藏入口并只读**；老数据（`app_settings.meditation_*`、`audio_transcode_jobs`、`tts_text`）**保留一个版本周期**再清。**（前置收紧，R20-②，2026-09-24）**：必须**同时**满足「`med_tracks` 集合已就绪」与「R7 端到端验收通过」，否则**不得隐藏**（否则管理员失去唯一可用管理路径） | §1.2；§6 / §7 | 调整保留周期时长 |

### B.2 规范空白裁定（G1~G5）

| ID | 空白项 | 裁定结论（含理由） | 正文落点 |
|----|--------|--------------------|----------|
| **G1** | `word_count_status` 阈值 | **偏差 ≤10% = `ok`；>10%（且 ≤25%）= `slightly_over` / `slightly_under`；>25% = `over` / `under`**（恰好 10% 归 `ok`，恰好 25% 归 `slightly_*`）。理由：原规范只列枚举、无数值，实现各写一套必生分歧；**数值集中定义一处**（代码落点 `MEDITATION_WORD_COUNT_DEVIATION_THRESHOLDS = { slight: 0.1, severe: 0.25 }`；原建议名 `MED_WORD_COUNT_THRESHOLDS` / 键名 `ok`·`hard` **已废弃**，见 R25 / 附录 A.2 / A28）便于调参且可复用 | 「字数状态阈值（word_count_status）」 |
| **G2** | 两级留白关系 | **独立叠加、互不抵消**：`总留白 = Σ 录制拼接的段间静默 + Σ 章间 gap_after_seconds`。理由：两者作用层级不同（Section 内部 vs Chapter 之间），若相互抵消会让总时长不可预测、也让 D1/D2 两个裁定互相牵制 | 「留白配置层级与两级留白叠加关系」 |
| **G3** | nature / bowl 纯音频段 | **无文本、不判字数、不建 Section-Raw，直接建 `med_section_audios`**（`section_raw_id` 允许为空/不适用）；入口＝原始音频库内**「纯音频段」区块**（录音/上传 → 转码 → 建音频记录）；字段口径见正文；候选池与双格式规则同样适用，不参与 stale 级联。理由：这两段本就无 Paragraph，若强行建 Raw 会产生无意义文本空壳与无效字数校验 | §3.6「纯音频段入口」；两集合字段定义 |
| **G4** | 字数硬 vs 时长上限冲突 | **不存在真冲突**——两者不在同一轴上。**时长上限只告警不阻断**（且实测语音远小于上限，几乎不会触发）；**字数目标是编排/录制依据，`word_count_status` 仅黄/红提示、不阻断**。理由：若把两者当同一约束会导致「字数达标却因上限被阻断」的荒谬路径；现状实测（590 字 ≈ 197s）证明上限长期宽裕 | 「字数目标 vs 时长上限：不存在真冲突」 |
| **G5** | 引用文件名失效 | 指向 `ui.spec.md` 的引用改为**泛指「通用 UI 规范」并写明当前仓库内无对应文件**；本文档正本＝`docs/meditation.admin.partner.spec.md`（历史引用 `meditation.admin.spec.md` **不存在**）。理由：指向不存在文件的引用会让实现者找不到依据 | 文首「参考」；§5「通用 UI 规范」 |

### B.3 余留 TBD（真未决项，不影响首批实现）

| ID | 事项 | 说明 | 归属 | 影响面 |
|----|------|------|------|--------|
| **T2** | 更细粒度的权限控制（不同 partner 可视范围） | 老文档遗留的演进方向，**仍未补充**；当前口径＝仅 partner 管理员可读写、匿名关闭（D6 已定端侧只走只读云函数） | 产品 / Zang 排期（**第二批**，已并入附录 C / C5） | 不影响第一批实现；随 `med_*` 权限收紧一并处理 |
| **T3** | mp3 兜底转码参数 | ~~Opus 主体参数已固定；mp3 兜底参数（建议 `libmp3lame -b:a 48k -ar 44100`）**待 Kong 在实现中转正并登记**~~ → **已关闭（R33-②，Zang 裁定 2026-09-24；R34 改定参数）**：mp3 兜底定稿 **`-c:a libmp3lame -b:a 48k -ac 2 -ar 44100`**（**R34：由单声道改立体声**；实测 **48.06kbps / 2 声道 / 44100Hz**）；`46k` 建议值**作废**（附录 A.2 / A32）；**`-ac 1` 亦作废**（附录 A.2 / **A33**） | ~~Kong（实现层，第二批：转码执行器）~~ → **已定稿，移出未决**（余下动作＝随 C6 / X13 落地） | 不影响口径，影响交付质量参数 |
| **T4** | **48k 立体声 CBR 对真人冥想语音的可听化程度（待人工听测；R34-⑤ 改口径）** | **R34-⑤（Kevin 直接裁定参数 2026-09-24）**：**参数选择已裁定、不再是待裁项**；**仍待确认的是听感**——本轮只验**体积 / 可解码性 / 码率 / 声道 / 采样率**，**未做听测**。**结论前只能写「待人工听测」，不得写成「已定 / 已验证 / 音质达标」**；**若发现可闻劣化** ⇒ 处置＝**另行升码率**（如 `-b:a 64k -vbr off -ac 2`）**或其它变更，由用户裁定、走规范修订**（实现者不得自裁）。**旧 R33-⑤（32k 单声道）结论随 `-ac 1` 作废而失效**（附录 A.2 / **A33**），不得再引用 | **用户（Kevin）所有**（可由内容负责人代听）；判据与动作落 §「转码参数定稿与实现约束（R33 初定 → R34 改定）」**R34-⑤**；质检计划 §8.1 / **X15** | 影响交付音质参数选择，**不影响格式与接口口径**；**不阻塞 X13 落地** |

> **B.3 现状（2026-09-24，v4.6 更新）**：T1 已随第一批验收**关闭并移出**（追溯见 B.4）；**T3 已由 R33-② 关闭**（mp3 参数定稿，**参数已由 R34 改为 48k 立体声**，移出未决）；余 **T2（权限粒度，第二批）** 与 **T4（**48k 立体声** CBR 人工听测，待确认）**。除本表外，本规范**无其他未决项**；D1~D10、G1~G5 共 15 条裁定已全部回填正文。
> **v4.5 补注（2026-09-24）**：转码参数与实现约束按 **R33** 定稿（§「转码参数定稿与实现约束（R33 初定 → R34 改定）」）——**⚠ 该版的 32k 单声道口径已由 v4.6 / R34 覆盖**。
> **v4.6 补注（2026-09-24）**：转码参数已**改定为 48k 立体声硬 CBR**（R34；`-ac 1` 作废，附录 A.2 / **A33**）；**唯一保留的「待确认」仍是 T4（人工听测），但对象已改判为「48k 立体声」**——**在听测完成前，任何文档不得把 48k 立体声 CBR 的语音质量写成「已定 / 已验证 / 达标」**。另：`audio_transcode_jobs` 的字段权威与队列分区口径见 §「转码执行器实现与队列分区（R35）」，**新增挂账 C10~C13**（附录 C）。
> **v4.1 补注（2026-09-24）**：B.6 六条待裁口径**已全部裁定（R16~R20）并回填正文**，本规范**再无待裁口径**；R1~R20 全部裁定均就地落正文，索引见 B.5。R16-④（生产环境 CloudBase 实际权限规则）属**待人工确认项**（非待裁口径），登记于附录 C / C5。

### B.4 第一批验收已关闭 / 移出的待确认项（2026-09-24）

| ID（原） | 事项 | 关闭依据（第一批验收） | 现口径 |
|----------|------|------------------------|--------|
| **T1** | raw / final 存储路径与既有 `audioUpload` 约定对齐 | 第一批实现**已落地路径约定**：raw 落盘 `meditation-audio-raw/{section_type}/{section_raw_id 或 'audio-only'}/take-{n}.{ext}`（纯音频段 / 无 raw 时容器目录用 `audio-only` 占位），`take-{n}` 序号由容器内候选数推导 | 以上述实现路径为准（正文与附录 A.2 / A25 已同步，**不再列为未决**） |

### B.5 第一批验收裁定索引（R1~R44，2026-09-24）

> 本索引即 **v4 / v4.1 的依据**。每条的具体口径已就地回填正文对应章节。**R1~R15＝v4（第一批验收裁定）**；**R16~R20＝v4.1（Zang 对附录 B.6 六条待裁口径的裁定，2026-09-24）**；**R21~R24＝v4.2（Zang 对上一轮 4 条尾巴的裁定：权威对照表、状态词统一、质检计划不拆表、失效路径修正）**；**R25~R27＝v4.3（Zang 对上一轮 3 条残留的裁定：字数阈值常量命名以代码为准、集合与代码映射表按当前代码校正、质检计划 §0 基线改写）**；**R28~R32＝v4.4（权限环境调查结论与 Zang 的后续裁定：权限模型实测结论与错误假设作废、R16 收紧升级为「成套动作」＋三方案待拍板、D6 升为硬前置＋第二批顺序修正、三条质检纪律、别名入口文件更新与挂账 C9）**；**R33＝v4.5（转码参数定稿与实现约束：Opus 32k 硬 CBR 单声道 `.ogg`、mp3 48k 单声道、单次双路、remux 零损失备选、SCF 选型、`duration=N/A` 与双声道约束、静态 ffmpeg 不入仓、容器 `.ogg` 定稿）**——⚠ **其中 32k 单声道口径已由 v4.6 / R34 覆盖**；**R34~R36＝v4.6（Kevin 直接裁定转码参数改定为 48k 立体声硬 CBR ＋ 实测数据 ＋ `-ac 1` 作废；转码执行器实现与队列分区（只领 `section_audio` / 老 worker 跳过 / 上线先停 loop / 字段权威与镜像）；后台质检入口现状（代码内无 `?dev_login=1`、免密门禁＝会话＋管理员标签、OTP 未接线且为 mock、超管手机号常量、UI 验收「环境不可达」纪律））**；**R37~R38＝v4.7（v4.6 后的准确性回填：样本实际时长 ≈61.2s 口径更正 ＋ `med_tracks` 已建 / C7 关闭 ＋ 第一批 UI 点击路径验收结果与「900 软基准 vs 910 上限之和」术语澄清；删除路径静默假成功缺陷与全库 `.remove()` 15 处扫点 ＋ 反向纪律（update 不得用 `updated>=1`）；dev 直写真实 CloudBase 环境事实；新增挂账 C14 / C15）**。**v4.7 复核补注（2026-09-24，Jing）**：**R38 扩为 ①~④**（**新增 R38-④ / D-B2-16**＝后台自动修复路径的删除保持「不抛出」）；**R38-① 改以行号级口径**（断言函数、15 处调用点、27 PASS / 0 FAIL、lint 127 未上升）；**R36 扩为 ①~⑦**（**新增 ⑥ 配方状态 / ⑦ 入台配方全文**，并**放宽「环境不可达」纪律**）；新增 **A37**。
> **2026-09-24 更新（v4.8）**：**B.5 索引扩为 R1~R39**（新增 **R39＝D6 只读云函数读契约**——实现方 12 条假设**升格为口径**；**R38-① 的质检结论登记为 PASS（Neng-16）**，见 R38 行的 v4.8 补注）；**附录 A.2 新增 A38**（旧「D6 契约未定义」作废）；**附录 C 新增 C16**。
> **2026-09-24 更新（v4.9）**：**B.5 索引扩为 R1~R40**（新增 **R40＝`updated` 语义与写入成功判据（含 D-B2-14 改写）**，依据＝**Neng-17 真实验 ＋ Zang 裁定**）；**R28 行按 R40-⑧ 更正** `app_settings` 写侧描述、**R29 / R31 / R38 行补依据改写注记**；**附录 A.2 新增 A39**（「同值 `updated:0` 作为普适命题」作废）并**同步改写 A36 的依据**；质检计划 §8.1 / **X17 改「已裁：按 R40 执行动态复验」**。
> **2026-09-24 更新（v4.10）**：**B.5 索引扩为 R1~R41**（新增 **R41＝端侧双轨播放接入口径**，依据＝**Kong 侦察 ＋ Zang 裁定**，并派实现）；**附录 A.2 新增 A40**（端侧读老 5 项 `app_settings` ＋ 端侧老 plan 计算废弃）；**附录 C 新增 C17 / C18**；质检计划 §8.1 / **X12 按 R41 全量改判据 ＋ 新增 X18**。
> **2026-09-24 更新（v4.11）**：**B.5 索引扩为 R1~R42**（新增 **R42＝端侧恢复路径与格式降级口径**，依据＝**Kong 实现 ＋ Zang 裁定 ＋ Neng-21 独立复验**——**⑥ 的设计口径尚未真正生效＝中型缺陷、修复单已派**）；**R40 行状态升为「已实现（Kong）、质检 PASS（Neng-20，2026-09-24）」**（有条件例外**经实测成立**：属主不误报、非属主可见失败）、**R41 行状态按面拆写**（共享模块 / App 接入 B1 / B2a）；**附录 C 新增 C19~C21**（＋ C2 补注）；**本批未新增附录 A.2 条目**（两条 low 缺陷为**已修复项**、R42 为**新增口径**，均不构成「旧条款作废」，故**不占 A 编号**）。
> **2026-09-24 更新（v4.12）**：**B.5 索引扩为 R1~R43**（新增 **R43＝后台 Track 预览口径**，依据＝**Zang 的 10 条裁定（①~⑩）＋ Kong 的后台「冥想轨道」tab 侦察结论**——**R9 的口径缺口由此封闭**：R9 只裁定批次归属、**功能条文自此一律指向 R43**；**状态词＝「已定口径、待实现」，不得预写「已实现」**）；**R9 行补「功能口径见 R43（v4.12）」**、**R41 行更新 `resolveMeditationUrlPolicyStaleness` 消费方注记**（当前＝App 播放器；**后台预览（R43）实现后为其第二消费方**）；**本批未新增附录 A.2 条目**（R43 为**新增口径**、非「旧条款作废」，故**不占 A 编号**）；**未新增挂账项**（**R43 是第二批实现项、不是挂账**；C4 仅补「预览口径已定＝R43（v4.12）」）。
> **2026-09-24 更新（v4.13）**：**B.5 索引扩为 R1~R44**（新增 **R44＝小程序端侧接入口径（①~⑬）**，依据＝**Kong 的小程序端侧侦察（含微信官方文档逐条核实）＋ Zang 裁决**——要点：**数据源只经 D6**、**前台双轨不降级**（官方文档**无单例 / 同时只允许一个**条款、**官方问答对「无法叠加播放」给的解法即创建多对象**、小游戏文档仅「**Android 最多同时 10 个**」）、**本批只前台**（`BackgroundAudioManager` **全局单例、无 `loop`**）、**格式只取 mp3**（**ogg 仅 Android**；**无 `canPlayType`**）、**`onError` 恢复的小程序明文例外**（无 `fetch` / `Blob` ⇒ **同参整场重调至多 1 次**；**R42-④ 的例外**）、**直设 `ctx.src`**、**卸载 `destroy()` 两实例**、**`wx.setInnerAudioOption`**、**固化先落本地**、**共享层单一源**、**时段键 `morning`**、**失败可见且零 fixture**；**状态词＝「已定口径、待实现」，不得预写「已实现」**）；**同批登记**＝**Step 1（共享层接入）＝已实现（Kong）、待质检确认**（白名单 8→10 / 转换器补 `export class` / 门禁 15→17 / 单一源 10/10 逐字节相等）＋ **既有同步脚本 `rm -rf` 缺陷（已修、待质检确认；不入附录 C 挂账）** ＋ **时段键收尾＝已派、待交**；**本批未新增附录 A.2 条目**（R44 为**新增口径**、Step 1 与脚本缺陷为**已修 / 待交项**，均不构成「旧条款作废」，故**不占 A 编号**）；**未新增挂账项**（R44 是第二批实现项、Step 1 与脚本修复是已修项）。

| ID | 事项 | 裁定结论（摘要） | 正文落点 |
|----|------|------------------|----------|
| **R1** | 纯音频段 label 前缀 | 用**章节名**：「自然库 take-N」/「颂钵库 take-N」；take 序号＝该 `section_type` 容器内已有候选数 +1；文本类 Raw 候选**不使用 label**（空串） | `med_section_audios.label` 字段定义；§3.6 |
| **R2** | 纯音频段区块展示 | **必须按 `section_type` 分组展示**（带分组标题），禁止混排 / 省略标题 | §3.6「纯音频段入口」 |
| **R3** | raw 重录类徽标 | **仅当 `audios.length > 0` 且 `isSectionRawStale(raw)` 为 true 时显示**；从未录制不得显示重录警示 | §2.3；§3.6 特殊规则 |
| **R4** | `stale_paragraph_ids` 语义 | 两段写：第一批＝**本次实际新增（去重差集）**；第二批目标＝**与录制快照不一致的累积集合**（不因无新增而清空）；差异为已知第二批待办 | 「段落改动级联」；`med_section_raws` 字段定义；附录 C / C3 |
| **R5** | 版本推进 | `med_paragraphs.revision` **每次成功保存 +1**（含同一弹窗会话内连存）；`med_tracks.version` **每次保存 +1、新建从 1 起** | 两集合字段定义 |
| **R6** | 「加入音频库」下拉行格式 | `{section_type 名} · {段落数}条 · {首段摘要(前 40 字)}`；「条」＝ `paragraph_ids.length`（**不是候选音频数**） | §3.5；实现顺序差异记附录 C / C8 |
| **R7** | 写入结果校验 | **所有** `med_*` 写入 + 冥想相关 `app_settings` 写入（`saveMeditationCalendar` / `saveMeditationCompositionSettings` / `saveMeditationAudioLibrary` / `saveMeditationLibrary`）**必须经 `assertCloudBaseWriteResult` / `assertCloudBaseCreateResult`**；写被拒不得静默当成功；**必须读 `res.code` / `res.message`**，**不得以「未报错」当作存在或成功的证据** | §4「写入结果校验硬口径」 |
| **R8** | 保存失败可见性 | 失败提示**不得被仍未关闭的弹窗遮挡**；老四 tab 同类问题属**挂账**（D10 后随其下线处置），第二批若保留该 tab 必须修 | §2.3；附录 C / C2 |
| **R9** | Track 预览批次 | **归第二批**（依赖端侧播放能力）；§1.2 与 §3.7 **两处均标注批次**。**口径缺口已补（v4.12）：R9 只是批次归属裁定、无功能条文 ⇒ 功能口径见 R43（v4.12）** | §1.2；§3.7；**R43（v4.12）** |
| **R10** | 章序 / 章内序列 | **只读**：UI 不得提供拖拽 / 增删 / 重复章控件；数据层 `normalizeMedTrack` **必须把脏文档折回六章固定模板**（即使库中被篡改） | §3.7；「六章固定模板」 |
| **R11** | 章间留白 | 默认 `141` 为**单一常量** `MEDITATION_TRACK_GAP_AFTER_SECONDS_DEFAULT`；**末章无章间留白**；**禁用章的 gap 不计入总时长预估** | 「章间留白默认值」；`chapters[].gap_after_seconds` |
| **R12** | `med_tracks` 集合 | **需人工创建**（环境 `liwu-d8gek6jjdab1d087c`）；创建前 R7 落库验收**一律标「阻塞」**；权限口径同其余 `med_*` | §med_tracks 权限建议（环境前置）；附录 C / C7 |
| **R13** | 权限现状与目标 | 实测 **`med_*` 匿名可写**（质检全程匿名登录写入成功）→ 第二批收紧为「仅 partner 管理员可写，端侧走 D6 只读云函数」；`app_settings` 在 **dev 匿名会话写被拒**（环境事实）→ 依赖其写入的验收**必须在管理员会话下进行** | §med_tracks 权限建议（权限现状与目标） |
| **R14** | 验收方法论 | ① 质检 Chrome 带**反节流三参**；② 覆盖产品方法用**带 `?t=` 的真实模块 URL**；③ 试听 / 播放断言用**真实用户手势**（CDP `Input.dispatchMouseEvent`）；④ 定位器收敛条件用**业务标识文本** | **质检计划**（`docs/meditation.admin.partner.verification-plan.md` §0.1）——**不写入本规范正文** |
| **R15** | 挂账清单 | 第一批「已知不修 / 待办」逐条登记理由与批次归属 | **附录 C** |
| **R16** | `med_*` 权限（原 B6-1） | **规范口径不变**（D6：仅 partner 管理员可读写、匿名无权限）；匿名可写＝**实现现状偏差 / 已知安全缺口**，**第一批期间接受**（dev 环境、非生产，不要求第一批回修）；**第二批必须收紧**；**新增待人工确认项**＝人工在生产环境确认 CloudBase 实际权限规则 | §med_tracks「R13 权限现状与第二批目标」＋ R16 条；附录 C / C5 |
| **R17** | R7 覆盖范围 vs R8 挂账（原 B6-2） | **老四 tab 不豁免 R7**：四个 writer（`saveMeditationCalendar` / `saveMeditationCompositionSettings` / `saveMeditationAudioLibrary` / `saveMeditationLibrary`）的写入结果校验**已实现（Kong）、待质检确认**；R8 的挂账**仅指「失败提示被仍未关闭的弹窗遮挡」这一 UI 可见性问题**。R7 与 R8 的边界须写清，避免被当成「老四 tab 豁免校验」。**〔v4.8 补注：该四项复验进度＝静态 8/8 断言存在且行号已核（L5183/L5190、L5249/L5256、L5315/L5322、L5381/L5388；集合缺失另抛 L5172/L5238/L5304/L5370）；动态只完成 1 条（冥想库）且受阻于 R28 权限模型（非属主身份 `{updated:0, upsertedId:null, requestId:3b734af94bab9}`、断言不抛、页面零提示、4 个文档 body sha256 与 `updated_at` 一字未变）⇒ 复验状态＝「静态 PASS、动态复验待按 R40 执行（判据已定）」，**统一状态词仍是「已实现（Kong）、待质检确认」（R22）**〕** | §4「写入结果校验硬口径」R17 条；§2.3；附录 C / C2 |
| **R18** | 中间态 + 分组标题（原 B6-3 / B6-4） | ① `stale = true` 且 `stale_paragraph_ids = []` 的**中间态第一批接受**（第一批期间该字段**不得当完整重录清单**，以 `stale` ＋ 快照比对为准）；② 纯音频段分组标题口径**定稿**＝**「章节名 · section 名（sec-x）」**（例「自然库 · 自然（sec-nature）」），与 R1 的 label 章节名前缀**不矛盾**，照此收敛 | `med_section_raws.stale_paragraph_ids` 字段定义；§3.6「纯音频段入口」；附录 C / C3 |
| **R19** | stale 判定依据（原 B6-6） | **只看文本快照 / 文本比对，`revision` 不参与**（`revision` 仅作审计追溯）；**级联只在段落文本实际变化时触发**——仅改 `tags` / `paragraph_type`（文本未变）**不得**把 Section-Raw 及其候选音频标成 stale；**禁止用 `revision` 比对判 stale**（K9 已实现（Kong）、待质检确认） | 「段落改动级联（stale）」；`med_paragraphs.revision` 字段定义；附录 A.2 / A26 |
| **R20** | 下拉行顺序 + D10 前置（原 B6-5 + D10 前置） | ① 下拉行顺序**以规范为准**＝`{section_type 名} · {段落数}条 · {首段摘要(前 40 字)}`（K8 已实现（Kong）、待质检确认）；② **D10 前置收紧**：隐藏老四 tab 入口必须**同时**满足「`med_tracks` 集合已就绪」与「R7 端到端验收通过」，否则新轨道 tab 无法存盘而老 tab 又被隐藏，管理员将**失去唯一可用的管理路径** | §3.5；§1.2；§7；附录 A.2 / A27；附录 C / C7、C8 |
| **R21** | Section 名 / 章节名权威来源 | **唯一权威＝代码常量**（`MEDITATION_SECTION_TYPE_LABELS` 11 项 / `MEDITATION_CHAPTER_LABELS` 6 项，位于 `packages/shared-utils/meditation-track-template.js`）；**新增 / 改名 Section 或章节必须先改代码常量，再同步规范内对照表**；规范内对照表**只是镜像、不是源**。据此确认 R18-② 的「颂钵库 · 颂钵（sec-bowl）」拼法**正确、不回改** | 「Section 名 / 章节名权威对照表」；「六章固定模板」；§3.6 |
| **R22** | 状态词统一 | K8 / K9 与四个老口径 writer（`saveMeditationCalendar` / `saveMeditationCompositionSettings` / `saveMeditationAudioLibrary` / `saveMeditationLibrary`）的写入校验，状态词**一律**写「**已实现（Kong）、待质检确认**」（含 R17 原「已在第一批实现完成」的写法）；**全文不得出现第二种状态词**；**待质检通过后再统一改「已通过」** | §4「写入结果校验硬口径」R17 条；§2.3；「段落改动级联（stale）」；§3.5；B.5 / R17、R19、R20；附录 C / C2、C8 |
| **R23** | 质检计划不拆表 | 质检计划保留**一张** §8.1 表，**新增「阶段」列**区分「第一批收尾确认」与「第二批实现」；**不得拆成两张表**（避免文档膨胀与编号漂移） | 质检计划 `docs/meditation.admin.partner.verification-plan.md` §8.1 |
| **R24** | 失效路径 / 文件名修正 | 修正两个权威文档内的失效工作目录与失效路径 / 文件名（例：`/Users/kevin/code/liwu` → `/Users/kevin/bistro/liwu`；dead module `meditation-word-count.js`；`{section_type}/pure/` 与「建议值待对齐」的过期路径口径）；**只改两个权威文档，历史报告等其它文件不动** | 质检计划 §0、§8.1；本规范文首「参考」、音频格式节、§4、附录 A.2 |
| **R25** | 字数阈值常量命名 | **以代码为准**（延续 R21「代码是源、规范是镜像」）：正本 G1 的常量改用代码实际名称与键名 `MEDITATION_WORD_COUNT_DEVIATION_THRESHOLDS = { slight: 0.1, severe: 0.25 }`（`packages/shared-utils/meditation-track-template.js`，已打开校对）；旧名 `MED_WORD_COUNT_THRESHOLDS` / 键名 `ok`·`hard`＝**从未落地的旧命名**，登记废弃；`word_count_status` 取值与代码一致（`ok` / `slightly_over` / `over` / `slightly_under` / `under`；纯音频段**不写入**，不是 `ok`） | 「字数状态阈值（word_count_status）」G1；附录 A.2 / A28；附录 B.2 / G1 |
| **R26** | 「集合与代码映射」表过期 | 该表**逐行按当前代码校正**：`med_section_audios` 与 `med_tracks` **均已有实现代码**（`database.js` 读写 + `MeditationPage.jsx` 的原始音频库 / 「纯音频段」区块 / 冥想轨道子 Tab）；`med_tracks` 额外标注「**集合尚未在 CloudBase 创建（R12 / R20），落库验收阻塞**」；`SUB_TABS` key 校正为 `med-tracks` | 「集合与代码映射」；§1.2；§3.7 |
| **R27** | 质检计划基线过期 | 质检计划 §0 第 7 条改写为「**第一批前基线（已过期）**：SUB_TABS 6 项、无新子 Tab」＋「**当前事实**：SUB_TABS 7 项，新增段落文本库 / 原始音频库 / 冥想轨道」 | 质检计划 `docs/meditation.admin.partner.verification-plan.md` §0（原 §0.7） |
| **R28** | 权限模型**实测结论** | `med_*` ＝**仅创建者可读写**：非创建者按 `_id` 读返回**静默空集 `{data:[]}`**（**无 `code` / `message`**）、写返回**静默 `{updated:0}`** / `{deleted:0}`；**创建者删自己的返回 `{deleted:1}`**（正对照）。`app_settings` ＝**所有身份可读**；写侧**已按 R40-⑧ 更正**——**非属主 update 既有文档 ＝ 静默 `{updated:0}`**（**无 `code`、文档体 sha256 与 `updated_at` 前后一致**；`requestId 19a4f236da0e08` / `048fa11b06d8d`）、**非属主 `add` ＝ 成功**（`requestId 82410668e37ab`）；**旧表述「非创建者写被显式拒（同值 update 与新建均 `DATABASE_PERMISSION_DENIED`）」作废**。**匿名会话**（旧称 `dev_login`，R36-① 更正）＝**纯匿名身份**（`groups:[{id:'anonymous'}]`、**无 phone / 角色**），uid **绑定浏览器 profile 的 `device_id`** ⇒ **换 profile 即换身份**。**同时作废**「每轮开工 0/0/0 ＝ 外部清库 / 并发写者」的旧假设（附录 A.2 / A29，**不得再作为结论引用**） | **新增「环境与权限（实测结论）」节**；`med_tracks` 权限小节（表 + R16-② 精确化 + 权限判据）；质检计划 §0 / §0.1 |
| **R29** | R16 权限收紧＝**成套动作 + 前置依赖** | **禁止只改权限**：匿名会话下把 `med_*` 改为「仅管理员可写」会**静默失效**（越权写**只返回 `updated:0`、无错误**；`app_settings` 即「**读得到、越权写不报错却静默不生效**」的先例——**旧表述「写不了、连新建都被拒」已按 R40-⑧ 作废**）⇒ **必须先解决后台身份模型（非匿名登录 ＋ 管理员角色），再收紧权限**。三方案登记为**待人工拍板项**：**方案 1（推荐）** 后台换非匿名身份（手机号 / 自定义登录 + 管理员角色）、`med_*` 改「仅管理员可写 + 所有用户可读」、端侧读走 **D6 云函数**；**方案 2** 保留匿名可写、仅把 `med_*` 读权限放开为「所有用户可读」、端侧**直连 DB**（代价：**草稿 / 未发布录音对外可读**）；**方案 3** 读写**全走云函数凭证**、`med_*` 对客户端关闭（最安全、工作量最大） | `med_tracks` 权限小节 R16-③⑤⑥；**附录 B.7**（待拍板）；§7；附录 C / C5；附录 A.2 / A30 |
| **R30** | **D6 升为硬前置** + 第二批顺序修正 | 据 R28-①，端侧在「仅创建者可读」下**根本读不到** `med_tracks` / `med_section_audios`（静默空集）⇒ **D6 只读云函数不是优化项，而是第二批的硬前置**。第二批顺序修正为：**转码执行器 → D6 只读云函数 → 端侧双轨播放（先 App、后小程序）→ D10**；**D10 自身仍按 R20-② 的前置**（`med_tracks` 就绪 ＋ R7 端到端通过），**不因排末位而放宽** | §7「第二批范围与执行顺序」；§5「端侧读取通道」；`med_tracks` 权限建议（D6 行）；附录 A.2 / A31；质检计划 §8.1（顺序硬约束 + X14） |
| **R31** | **三条质检纪律** | ① **跨会话持久化在 dev 匿名会话下不可验**（每轮新 profile ＝ 新匿名 uid，看不到上一轮数据；**不得据此判定数据丢失或存在**）；② **`updated:0` 不得单独作为「无权限」证据**（**依据由 R40-② 改写**：`updated:0` **三义同形**——值本来相同 ／ **无权写静默** ／ 文档不存在；**含对象数组载荷上 `updated` 非确定**，R40-③），**只有 `DATABASE_PERMISSION_DENIED` 是显式拒绝**；③ **每轮开工计数只能作为本会话基线**，**不得**与上一轮跨会话对比 | **质检计划 §0.1**（方法论节，与 R14 四条同等强制）——本规范**正文不重复三条纪律条文**，仅由「环境与权限（实测结论）」节承载其**事实依据**（R28-③） |
| **R32** | 别名入口文件更新 + **挂账 C9** | ① `docs/partner.meditation.spec.md` 子模块清单改为**实际 7 项**（段落文本库 / 原始音频库 / 冥想轨道 / 音频库 / 冥想库 / 冥想设置 / 冥想日历；**前 3 项为新、后 4 项冻结待 D10**），更新日期 **2026-09-24**，**保留其「正本别名 / 入口」定位**；② 新登记挂账 **C9** ＝ `med_section_raws` **无删除路径**（**低危、非阻塞**；第二批若做需**连带处理候选音频与引用**） | 别名文件 `docs/partner.meditation.spec.md`（仅子模块清单与更新日期）；「集合与代码映射」表 `med_section_raws` 行；**附录 C / C9**；附录 B.8（残留处置） |
| **R33** | **转码参数定稿与实现约束**（依据 Kong 实测：本机 ffmpeg 8.1.1 ＋ 真跑 `MediaRecorder` 采集的 `audio/webm;codecs=opus`，**128kbps 双声道 48kHz、无 Duration 头**；**本轮不重新推导**） | **① Opus 主体定稿**＝`.ogg`（Ogg Opus / RFC 7845）＋ `-c:a libopus -b:a 32k -vbr off -ac 1 -ar 48000`——**必须 `-vbr off`**（默认 VBR 下 `32k` 实测漂到 **54.9kbps / 1.71x**；CBR **32.6kbps / 1.02x**）、**必须 `-ac 1`**（源双声道，固定码率下双声道只砍每声道质量、体积不变）。**② mp3 兜底定稿**＝`-c:a libmp3lame -b:a 48k -ac 1 -ar 44100`（实测 **48.05kbps**）；**`46k` 建议值删除**（非法档位、libmp3lame 吸附为 48k、产物 md5 相同 ⇒ 附录 A.2 / A32）。**③ 执行形态**＝**单次 ffmpeg 调用双路输出**（`-map 0:a` 写两次；实测 0.218s vs 0.185s/60s，等价）。**④ 零损失备选**＝`-c:a copy -f ogg` 逐样本零差异（777600/777600、differing=0、CRC 全合法、0.029s/60s），但**不降体积（0.998x）**⇒ **交付走重编 CBR，remux 只用于最高保真 / 比对**。**⑤ 待确认**＝**32k 单声道 CBR 对真人冥想语音的可听化程度未经听测**（若劣化 ⇒ 升 `48k -vbr off -ac 1`；登记 B.3 / T4，**未听测不得写成已定**）。**⑥ SCF 选型**＝双路 **3.29–3.5 ms/音频秒**、单条 5min ≈ **1.07s**、最坏 10×5min ≈ **10.7s**、峰值内存 **≤15MB** ⇒ **256MB / 单次超时 60s**，瓶颈是 **COS 上下行与冷启动**。**⑦ 实现硬约束**＝原件 `duration=N/A`（**不得对原文件取时长**；入库时长以**客户端实测**为准，云函数只能取**转码产物**时长）、**不得假设单声道**。**⑧ 静态 ffmpeg**＝linux x64 静态构建，实地校验 `ffmpeg -encoders \| grep -E 'libopus\|libmp3lame'` 与必要 muxers（remux 不需编码器）；**二进制不入仓（`.gitignore`）**。**⑨ 容器**＝定稿 **`.ogg`**（避免 `.webm` 被当视频 / CDN / MIME 嗅探）；`.webm` 换容器**同样无损（1.000x）**，仅作一行备选 | §「音频格式与转码规范」（转码参数行、路径与 Mime 行）＋**新增「转码参数定稿与实现约束（R33）」小节**；「录制与转码链路」第 4 条；§7 第二批顺序（C6 / X13）；**附录 A.2 / A32**；附录 B.3 / T3（关闭）·**T4（待听测）**；附录 C / C6；质检计划 §0.1、§3.4、§6.1、§8.1（X13、**X15**）**（**⚠ 本行的 32k 单声道口径已由 R34 覆盖**）** |
| **R34** | **转码参数改定：48k 立体声硬 CBR**（依据＝**Kevin（用户）直接裁定** ＋ Kong 真样本实测；**覆盖 R33 的 32k 单声道**；**本轮不重新推导**） | **① Opus 主体**＝`.ogg` ＋ `-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000`（**硬 CBR ＋ 立体声**；**`-vbr off` 仍必须**——48k VBR 实测漂到 **≈73kbps**、60s 样本 **552.9KB**）。**② mp3 兜底**＝`-c:a libmp3lame -b:a 48k -ac 2 -ar 44100`（实测 **48.06kbps / 2 声道 / 44100Hz**）。**③ 实测数据（照抄）**＝**60s** → ogg **372181B ≈363.5KB / 48.65kbps / 2 声道 / 48000Hz**、mp3 **367639B ≈359.0KB / 48.06kbps**；**300s** → ogg **1823385B ≈1780.6KB / 48.62kbps**、mp3 **1800507B ≈1758.3KB / 48.01kbps**；**单次双路耗时 325ms（60s）/ 1627ms（300s）**；码率**三处实测一致**（`format.bit_rate` ＋ `size*8/duration` ＋ ffmpeg stderr）——**`ffprobe` 对 `.ogg` 的 `stream.bit_rate` 为 `N/A`，必须以 `format.bit_rate` 为准**。**④ 代价对照（写清）**＝旧 32k 单声道 ogg 60s **243.9KB**（≈32kbps 全给单声道）→ 新 48k 立体声 ≈ **24kbps/声道**（**体积 +49%**）；**mp3 48k 单声道与立体声体积相同**（CBR）。**⑤ `-ac 1` 作废**（不再下混单声道；附录 A.2 / **A33**）。**⑥ 听感验收改判**＝**48k 立体声的听感验收，属用户所有；未听测前不得写成「已验证」**（B.3 / T4、X15） | §「音频格式与转码规范」转码参数行；§「录制与转码链路」第 4 条；§「转码参数定稿与实现约束（R33 初定 → R34 改定）」**R34-① ~ ⑤**（含 **R34-③ 实测数据表**、**R34-④ 对照表**）；附录 A.2 / **A33**；附录 B.3 / T3·T4；附录 C / C6；质检计划 §0.1、§3.4、§6.1、§8.1（X13、**X15 改口径**） |
| **R35** | **转码执行器实现与队列分区**（依据＝本批代码查实 ＋ **Kong 实现自测（队列分区相关 15/15 PASS）**；正文＝新增「转码执行器实现与队列分区（R35）」小节） | **① 队列分区（硬，D-B2-9，已落地）**＝新执行器（云函数 `cloudfunctions/meditation-transcoder`）**只领 `transcode_profile === 'section_audio'`** 的 queued job——**三层**：过滤进查询 ＋ 乐观锁带 `transcode_profile`（老 job `updated = 0` 领不走）＋ 非 section job 返回 `skipped` / `not_section_audio_profile` **且不写任何字段**（**跳过而非失败**，含 `job_profile_not_section_audio` 日志）；**分区常量**＝`SECTION_AUDIO_TRANSCODE_PROFILE = 'section_audio'`（`lib/transcode-state.js`；字面值权威来源＝排队方 `MeditationPage.jsx:3334`）；老 worker（`scripts/audio-transcode-worker.mjs`）**跳过 `section_audio`**（2 行 `.filter`）；**实测同一数据集两侧互不吃对方的 job**；**上线纪律＝启用新执行器前先停 `npm run audio:transcode-worker:loop` 并 `pgrep -fl audio-transcode-worker` 确认为空**、**同一时刻只允许一侧消费**、**回滚顺序相反**（挂验收项 **X13**；纪律同时写入 `scripts/README.md`）。**⑤ 口径收紧**＝section_audio 链路**取消 `item_id` 回退**：缺 `section_audio_id` ⇒ **`MISSING_SECTION_AUDIO_ID`（永久、立即终结、不入重试、不写 `med_section_audios`）**；老 profile 保留 `item_id` 兜底。**⑥ lint 门**＝仓库级 `142 → 127 problems`、`cloudfunctions` `16 → 1`、**新执行器目录 0 problem**（`eslint-disable no-undef` 已移除）。**② 字段权威**＝job 文档 `attempts` / `transcode_error` **权威**，`attempt_count` / `error_message` 为**过渡期镜像**（待老 worker 退役后收敛；挂账 **C13**）。**③ 实现现状**＝worker 第 **28** 行 `DEFAULT_FFMPEG_AUDIO_ARGS` **已随本轮更新为 48k 立体声硬 CBR**（**不再是旧 48k VBR**）⇒ **A32 / C6 的「仍为旧参数」表述更正为「已随本轮更新（L28）」**；该 worker **L295 临时名 `output.opus`** 与排队方 `.opus` 扩展名**本批未改**（挂账 **C12**）。**④ 新增挂账 C10~C13**＝loudnorm 待用户拍板 / `audio_url` 2 小时临时 URL（D6 需重新签发）/ 排队方路径与执行器输出路径不一致 / job 文档字段冗余与镜像收敛 | §「转码执行器实现与队列分区（R35）」R35-① ~ ④；§「录制与转码链路」第 4 条；§「音频格式与转码规范」实现侧现状行；附录 C / C6 ＋ **C10~C13**；质检计划 §8.1（**X13** 挂队列分区与字段口径验收项） |
| **R36** | **后台质检入口现状**（实测查实 2026-09-24） | **① 代码内没有 `?dev_login=1` 这类 dev 登录入口**（**全仓检索零命中**）⇒ **旧表述一律作废**、不得再作为质检步骤或判据引用。**② 后台门禁**＝`liwu_auth_session` 会话（`packages/auth/src/constants.js` `SESSION_KEY`；模块 `packages/auth/src/session.js`）**＋** 用户带【超级管理员 / 管理员】标签（`apps/web/src/pages/Partner.jsx` `adminAuthorized`）。**③ `requestPhoneOtp` / `verifyPhoneOtp` 存在但全仓无 UI 调用** ⇒ 后台**当前无登录入口**（未接线，非「被隐藏」）。**④ OTP 为 mock 固定 `'1234'`**（`packages/auth/src/phone-otp.js`）。**⑤ 系统超管手机号常量 `16601061656`**（`apps/web/src/admin/services/database.js`；**不构成可用凭据**）。**⑥ 可复现配方：已实测复现（取代原「待回填」）**——**Neng 于 2026-09-24 在 3 个全新 profile 上复现**（无需登录、无需种子 localStorage）；**⑦ 入台配方全文＝6 步**（反节流三参 headless Chrome → navigate `http://localhost:5175/partner`（**不加任何参数**；`?dev_login=1` 零命中、完全无效）→ **必须轮询页面文本 `/uid=102/` 为真（实测 ≈t+15s；t≤10s 仍是「当前尚未登录…需分配【管理员】标签」的门户页，该文本与「权限不足」同形）** → 点 `button[aria-label="切换身份"]` → 在 **188px 容器**里点「管理员」卡 → nav「冥想」→「冥想轨道」（懒加载，等 10s））。**入台后得到稳定 dev 身份 `uid=102`**（带 超级管理员 / 管理员 / 代理商 标签）。⇒ **纪律放宽（取代原口径）**：UI 类用例**须按配方执行且轮询 `/uid=102/` 为真后才能判定**；**未按配方执行**所得的「未登录」或菜单缺失 ⇒ 一律标「**环境伪失败（采样过早）**」并**重跑**，**不得标 PASS / FAIL**；按配方执行且命中 `/uid=102/` 后**按实际结果判 PASS / FAIL**（原「一律标环境不可达、不得判 PASS/FAIL」的绝对口径**作废**） | §「环境与权限（实测结论）」**R36** 小节（①~⑦ ＋ 纪律与判据落法）；R37「与 R36 的关系」段；§「环境与权限」R28-③ 术语更正（`dev_login` 为旧称）；质检计划 §0.1（**入台配方 ＋ 环境伪失败纪律**）、§1（环境前提）、§8.1（表头纪律 / X2 / Exit Criteria 专条） |
| **R37** | **v4.6 后准确性回填（一）：口径更正 ＋ 第一批验收结果** | **① 样本实际时长 ≈61.2s（不是名义 60s）**：两个实测样本＝真实 `MediaRecorder` 采集，`ffprobe` **61.2035s / 61.200s**；**300s 样本为精确 300.0s**；⇒ **复核体积 / 码率必须先测输入实际时长**，用名义 60s 反推得 **≈49.6kbps 的假偏差、不得据此判失败**（附录 A.2 / **A35**）。**② `med_tracks` 已建、C7 关闭**：证据＝`res.code` 无 `code` / `message` ＋ `med_section_raws` 正对照同形 ＋ `add` 成功 ＋ **两轮端到端写入 / 读回 / 删除成功**（R7 g/h 数据层与 UI 层均通过，测试文档已删）⇒ 旧「未创建 ⇒ 标阻塞」口径作废（附录 A.2 / **A34**）、**当前无阻塞项**。**③ 第一批 UI 点击路径验收通过**：Track 配置（六章模板 300/30/130/150/270/30、留白 141×5、末章无留白输入、章序不可操作、估算自洽、按钮「保存 Track」、`version` 1→2、`chapters=6`、刷新保持、二次保存同 `_id` 且 `version` 2→3）＋ **术语澄清**（`total_target_seconds=900` 软基准；UI「内容 15:10」＝**章时长上限之和 910s**——**两者不是同一把尺子**） | §「环境与权限（实测结论）」新增 **R37** 小节；§3.7（UI 验收结果 ＋ 术语澄清）；R34-③；`med_tracks` 环境前置；集合与代码映射；§1.2；§7；附录 A.2 / **A34~A35**；附录 B.5；附录 C / **C7 关闭**；质检计划 §0.1 / §1.1 / §3.4 / §8.1（X1 / X2 / X3） |
| **R38** | **v4.6 后准确性回填（二）：新缺陷 ＋ 新裁定 ＋ dev 环境真实事实 ＋ 新增挂账** | **① 新缺陷＝删除路径静默假成功（已实现（Kong）、待质检确认）**：`doc(id).remove()` 返回 **`{"deleted":0}`（非 `{code,message}`）**时旧 `assertCloudBaseWriteResult` 放过 ⇒ `deleteMedTrack` 报成功而**实际未删**（非 owner 身份实测：删除后文档仍在）；处置＝**删除影响条数断言（`deleted = 0` 必须报错；编号 **D-B2-12**）** ＋ **全库覆盖全部 `.remove()` 调用点（实测 `database.js` 共 15 处＝11 处直接严格断言 ＋ 4 处 `removeDocBestEffort`；行号级清单见「环境与权限」R38-①）**，状态＝**已实现（Kong）、待质检确认**（复核：桩测 **27 PASS / 0 FAIL**、lint **127 未上升**）；**反向纪律**＝**update 不得用 `updated >= 1` 作成功条件**（**依据已由 R40-④ 改写**：`updated:0` 三义同形 ＋ 含对象数组载荷非确定——**原「同值 update 也返回 `updated:0`」的依据系误读、作废**；编号 **D-B2-14** 不变；附录 A.2 / **A36 · A39**）。**② dev 环境真实事实**：`/api/cloudbase-proxy` → `scripts/dev-cloudbase-proxy.mjs`（:3020）→ **真实 CloudBase `liwu-d8gek6jjdab1d087c`**；**`CLOUDBASE_ADMIN_API_KEY` 实测未配置** ⇒ 写入**以调用者匿名 `_openid` 落真实云端**；**换 profile 既看不见也删不掉前几轮 dev 数据**（实测 `deleted: 0`、owner profile 复读仍在）；待办＝只读盘点（服务端凭据）＋ **删除须人工确认清单后执行**。**③ 新增挂账 C14 / C15**（预估口径待拍板；dev 身份 / 环境治理三选一待拍板）；队列首轮权威键缺省**仍在 C13 保持**。**④ 新增裁定（**D-B2-16**）＝后台自动修复（reconcile）路径的删除保持「不抛出」**（4 处 `removeDocBestEffort`：L1820 / L1839 / L4390 / L4474；**断言照接、失败降级为显式 `console.error`**，**用户点击触发的删除一律严格断言**；**未达「自动修复也硬失败」需求时须另立裁定**；附录 A.2 / **A37**） | §「环境与权限（实测结论）」**R38** 小节（R38-① / ② / ③ / **④**）；§4 写入结果校验硬口径（含 **D-B2-12 / 14 / 16** 与 UI 落点 **`components/Dashboard/MeditationPage.jsx:3545`**）；§3.7（含 `deleteMedTrack` 调用方口径）；附录 A.2 / **A36~A37**；附录 C / **C14~C15**；质检计划 §0.1（第 8~12 条） / §8.1（X2 / Exit Criteria R38 专条）与 Status |
| **R39** | **D6 只读云函数读契约（实现方 12 条假设升格为口径）**（依据＝**Kong 已实现**＋ **Zang 独立复核**＋本批质检结论；正文＝「环境与权限（实测结论）」**R39** 小节） | **① 函数名与位置**＝`cloudfunctions/meditation-read/`（`cloudbaserc.json` 已登记 **timeout 30 / memorySize 128 / Nodejs18.15**、**无定时触发器**；`index.js` 442 行 ＋ `lib/{read-contract,meditation-formats,meditation-track-template,meditation-track-normalizers}.js`，共 **1219** 行）。**② action 集（3 个）**＝`getTrack`（**缺省**；定位顺序 **显式 `track_id` → `track_key` → `is_default` → `track-default`**）/ `getSectionAudios`（**必填** `section_types` 或 `section_type`）/ `listTracks`（只列 `enabled !== false`，**不签发链接、不读音频集合**）；**未知 / 非字符串 action ⇒ `INVALID_ACTION`**（不隐式转换）。**③ 出参形状**＝成功 `{ok:true,data,meta}`、失败 `{ok:false,error,message,details?}`；错误码**至少**含 `READ_FAILED` / `INVALID_ACTION` / `TRACK_NOT_FOUND` / `TRACK_DISABLED`（另 `INVALID_EVENT` / `INVALID_PARAMS`）；**CloudBase 以 resolve 返回 `{code,message}`（含权限静默空集）一律当错抛、收敛为 `READ_FAILED`**——**不把「没报错」当「读到了」**，**不返回部分数据当成功**。**④ 可下发判据**＝`transcoded_formats` **同时含 opus 与 mp3** 且二者 `file_id` 齐备（对齐 D3）；`transcode_status ∈ {queued, processing, failed}` **一律不下发**；**`idle` / 空状态但齐备的历史文档仍下发**；不可下发项按 `stats.excluded` 五类（`incomplete_transcode` / `transcode_failed` / `transcode_in_progress` / `missing_file_id` / `signing_failed`）**逐条计数、不静默丢弃**。**⑤ 临时 URL 现签**＝唯一对外调用 `getTempFileURL`、去重后**一次批量签发** `maxAge = 7200`（对齐 C11）、**绝不透传落库 `audio_url`**、`url_policy = {max_age_seconds, issued_at, expires_at, reissue:'call_again'}`、**长期标识只有 `file_id` 但响应不下发 `file_id`**（端侧重签一律再调本函数）、**部分下发失败该条剔除并计数**（半条音频不得下发）、**全部失败 ⇒ 整单 `READ_FAILED`**。**⑥ 字段白名单（15 项不得下发）**＝`file_id` / `fallback_file_id` / `mp3_file_id` / `audio_url` / `fallback_audio_url` / `mp3_url` / `recorded_by` / `text_snapshot` / `paragraph_ids_snapshot` / `original_file_id` / `transcode_error` / `created_by` / `updated_by` / `char_count` / `stale`。**⑦ 章序与启用态**＝Track 一律**折回六章固定模板**（`chapters` 恒 6、末章 gap 恒 0，对齐 R10）；`getTrack` **只下发启用章覆盖的 `section_type`**（禁用章不查不下发）、`getSectionAudios` **不查 Track 启用态**（定向取 / 重签接口）。**⑧ 不抽签、不写会话**＝只返回按 `section_type` 分组的候选池（抽签在端侧、固化写端侧会话记录，D7 / D9）；唯一口径源 `med_section_audios`，**不读 `med_section_raws` 的 `file_id`/`audio_url`**（D8）。**⑨ 候选上限（自定常量，现为口径）**＝单 `section_type` **查询 50 / 下发 10**（端侧只抽一条）、`listTracks` 20；截断在 `stats.truncated_section_types` **如实回报**。**⑩ 不做端侧身份校验＝现为口径、非疏漏**（只读、只下发「启用 Track ＋ 交付齐备」的播放数据；收紧到「仅登录用户」**须另裁**，**并入 C15 / X9**）。**⑪ 端侧缓存建议（规范未给值，现为口径）**＝缓存 ≤ `max_age_seconds` 的一半（≈1 小时）或按 `url_policy.expires_at` 判陈旧；过期 / `onerror` **同参重调本函数**（端侧不需持有 `file_id`）。**⑫ 部署前提与同步责任**＝SCF 内置凭证（**不硬编码密钥**）、`lib/*.js` 为权威源**精简等价副本**（D-B2-8）、本地无 Track 文档时 `TRACK_NOT_FOUND` **属预期**（`med_tracks` 已建、**C7 已关闭**，**不得再写「未创建 / 标阻塞」**）；**零写路径**（唯一对外调用 `getTempFileURL`）。**状态词（R22）＝「已实现（Kong）、待质检确认」**；**Zang 独立复核**＝自测 **124/124 PASS**、零写路径静态 grep **零命中**、`npx eslint cloudfunctions/meditation-read` **0 problem**、共 **1219 行**、只依赖 `@cloudbase/node-sdk` ＋ `./lib/*` | 「环境与权限（实测结论）」**R39** 小节（①~⑫ ＋ 旧状态作废段）；§5「端侧读取通道（D6）」；§7 第二批（D6 / X14）；`med_tracks` 权限建议（D6 行）；附录 A.2 / **A38**；附录 B.1 / D6；附录 C / **C16**（同批登记）；质检计划 §0.1（第 13 条） / §8.1（X2 / X14 / **X16**） |
| **R40** | **`updated` 语义与写入成功判据（含 D-B2-14 改写）**（依据＝**Neng-17 真实验（真实 CloudBase 往返、带 `requestId`）＋ Zang 裁定**；正文＝「环境与权限（实测结论）」**R40** 小节） | **① `updated` 计「内容真正发生变化的文档数」**（真改值 → `1`；纯同值写回 → `0`；`where` 命中 2 条同值 → `0`、真改 → `2`），**不是命中行数**。**② `updated:0` 三义同形**（普通对象、无 `code` / `message`）＝**值本来相同** ／ **无权写（静默拒绝）** ／ **文档不存在** ⇒ **既不是成功证据、也不是失败证据**（**R31-② 不变**）。**③ 含对象数组字段的载荷上 `updated` 非确定**（连写三次 `0,0,1` / `1,0,0`；反向 no-op 亦报 `1`；对象数组子文档读回键序被改写为字典序）⇒ **读回比对须与键序无关**。**④ 反向纪律保留、依据改写（D-B2-14）**＝**update 不得用 `updated >= 1` 判成功**，理由＝三义同形 ＋ 对象数组非确定；**原依据（R28「非创建者写静默」被读成「同值也返回 0」）系误读、作废**（A39）。**⑤ 有条件例外（硬，仅 8 处）**＝**仅当载荷必然含易变字段**（`updated_at: new Date()` / `version + 1`）时，`updated < 1` 且无 `code` 可作「本次写入未生效」**强信号**，**须一次性读回比对**（`Date` 归一 ISO、键序无关深比较）：一致 ⇒ 幂等 no-op 成功；不一致 ⇒ 抛「**{entityLabel}保存失败：未能确认写入生效（未检测到任何变化）（requestId: xxx）**」（**不得声称「无权限」**）；**读回失败 ⇒ 抛独立文案、绝不得当成功**。**接入范围＝四个老口径 writer ＋ 四个 `med_*` updater**（`updateMedParagraph` / `updateMedSectionRaw` / `updateMedSectionAudio` / `updateMedTrack`）；**范围外一律沿用 ④**。**⑥ 强信号依据**＝上述路径 **8/8 样本恒为 `1`**（`9a1115384c09b`；老 writer 形状仿真 `f742051297af7` / `b0ad9f33b05d3` / `c1e275d99a7158`）。**⑦ D-B2-14 结论对、依据错**（追溯）。**⑧ `app_settings` 两条更正（旧表述作废）**＝**非属主 update 既有文档 ＝ 静默 `{updated:0}`**（无 `code`、文档 sha256 与 `updated_at` 未变；`requestId 19a4f236da0e08` / `048fa11b06d8d`）——**不是** `DATABASE_PERMISSION_DENIED`；**非属主 `add` ＝ 成功**（`requestId 82410668e37ab`；删除复核 `deleted:1`、15→16→15）——**不是**「连新建都拒」。**状态**＝断言（**`assertCloudBaseUpdateTookEffect`**，`database.js:516`、**8 个调用点**）＋ `database.js:387-392` 注释重写＝**已实现（Kong）、质检 PASS（Neng-20，2026-09-24）**（**例外条件经实测成立**：属主路径不误报、非属主路径可见失败；证据见「环境与权限」**R40-⑤ 实测结论**） | 「环境与权限（实测结论）」**R40** 小节（R40-①~⑧）；**R28-②**（更正）；§「`med_tracks`（CloudBase 集合，新增）」权限建议表 / R16-⑤ / 权限类用例判据；§4 写入结果校验硬口径（**R17 补注状态 ＋ 反向纪律 ＋ 有条件例外**）；R38-① 反向纪律段；附录 A.2 / **A39**（＋ **A36**）、附录 B.5 / R28·R31·R38 行补注；附录 C / **C2 · C7**；质检计划 §0.1（第 6 条改写 / 新增第 15 条） / §8.1（**X17 已裁** / X2 / W2 / Exit Criteria **R40 专条**） |
| **R41** | **端侧双轨播放接入口径（12 条已定裁决）**（依据＝**Kong 侦察（App ＋ 小程序现状）＋ Zang 裁定**；正文＝「环境与权限（实测结论）」**R41** 小节） | **① 数据源**＝端侧**不读老 5 项 `app_settings`**、**不算老 plan**（D9），一律经 **D6（R39）** 取 Track ＋ 候选池；**端侧永不直连 DB 读 `med_*`**。**② 播放模型**＝背景 `loop` / 人声 `sequence`；音量**取响应 `background_track.volume` / `voice_track.volume`**（现 **0.33 / 1**），**缺省才回退常量、常量非权威源、绝不覆盖响应值**；章序段序只读（R10）。**③ 留白**＝只在**章间**、**末『有可用段的』章恒 0**、禁用章不计入（R11）。**④ 时长**＝段取**响应实测值**（非标称）；总计＝Σ 人声段 ＋ Σ 留白（**背景 loop 不计入**）；**端侧计时按 Track 组装结果、不沿用固定 15 分钟**；`MIN_VALID_MEDITATION_SECONDS = 180` **两端不变**。**⑤ 抽签与固化（D7）**＝抽签在**端侧**（`rng` **可注入**）；载荷＝`{track_id, track_version, date_key, session_key, selections[{section_type, audio_id, duration_seconds}]}`；**先落本地 storage（键 `liwu_meditation_session_v1`）**，**云侧写入另裁＝挂账 C18**。**（⚠ 2026-09-24 缺口登记：该本地固化在 App 侧尚未落地 ⇒ 属待补，见 C18 补注 / 质检计划 X12 · X18 待补注）**。**⑥ 格式与降级（D3）**＝App 按 `formats[]` 顺序 **opus → mp3** ＋ **保留 `onerror` 降级**；**小程序直取 mp3、不用 `canPlayType`**。**⑦ 失败可见且不静默回退（D9 硬）**＝`TRACK_NOT_FOUND` / `TRACK_DISABLED` / `READ_FAILED` / `CALL_FAILED` / `INVALID_PAYLOAD` ⇒ **明确错误态（附 `requestId`）**；**绝不**回退老音频库 / 本地兜底 plan；空池 / 缺段 ⇒ **跳段 ＋ warning**、**不得整场失败**。**⑧ 测试纪律**＝端侧**零 fixture 分支**、桩一律在**测试侧**拦截，**桩结论不得当 X12 / X18 验收 PASS**。**⑨ 小程序前台限制**＝本批**只支持前台播放**（后台微信暂停所有音频；`BackgroundAudioManager` 单例且无 `loop` ⇒ 双轨后台原理不可得）。**⑩ 不做渐变**＝只做「预加载下一段 ＋ 顺序播放」。**⑪ iOS App 音量未验**＝WKWebView `HTMLMediaElement.volume` 实测**空操作** ⇒ 0.33 是否真生效**须真机实测**；FAIL ⇒ **记挂账（`GainNode` / 原生插件另立项）**，**不得据此判 X12 整体 FAIL**。**⑫ 冻结边界**＝老四 tab 与 `meditation-session-plan.js` **本批不得删改**（D10 前）；时段键 `dawn` → `morning` 统一（D4），并说明 `point_ledger.activity_slot` 的**历史取值口径**（历史值含 `dawn`、读侧须兼容、不做批量改写）。**状态（R22，按面登记，不得聚合）**：`meditation-read-client.js` / `meditation-track-playback-plan.js` ＝**已实现（Kong）、质检 PASS（Neng-19，2026-09-24，桩面：独立 50/50 ＋ 反向反证 10/10）**（Zang 复核 458 ＋ 459 行、桩测 **113 PASS / 0 FAIL**、eslint 0、lint 126；**其中 `resolveMeditationUrlPolicyStaleness` 当前消费方＝App 播放器；后台预览（R43）实现后为其第二消费方**（**R43 状态＝已定口径、待实现**））；**App 接入 B1（数据源切换、老代码下线、错误可见不回退）＝已实现（Kong）、质检 PASS（Neng-19，2026-09-24，桩面与静态）**；**B2a（恢复路径与格式降级）＝已实现（Kong）、质检 PASS（Neng-22，2026-09-24，桩面：36/36 ＋ 三个变异体红对照；Neng-21 的 1 条中型 ＋ 1 条低均已修复）**；小程序侧＝待做（**真实 D6 往返与真机项＝未实测**） | 「环境与权限（实测结论）」**R41** 小节；§5（端侧计划计算 / 端侧读取通道 / 播放模型）；§7 第二批 ③；附录 A.2 / **A40**；附录 C / **C4 补注 ＋ C18**；质检计划 §0.1（**第 16 条**） / §8.1（**X12 改判据 ＋ 新增 X18**） |
| **R42** | **端侧恢复路径与格式降级口径（①~⑥）**（依据＝**Kong 的端侧实现 ＋ Zang 裁定 ＋ Neng-21 独立复验**；正文＝「环境与权限（实测结论）」**R42** 小节） | **① 链接失效恢复＝同参重调 D6**（`getTrack` 入参**逐字相同**）——**不依赖 `file_id`**（**R39 ⑤ 响应本就不下发**）、**不走 `getSectionAudios`**。**② 三层重入防护**＝**段级 Set**（同一段全生命周期最多重调 **1** 次）＋ **闸门级**（未过期前的预置重签**整场至多 1 次**）＋ **基准级**（**重签成功即刷新基准**、后续段不重复）。**③ 陈旧判定**＝以**收到响应的本地时刻**起算已用时长、阈值 **`max_age_seconds / 2`**（缺省 3600s）；**刻意不用绝对时钟与 `issued_at` / `expires_at` 直接比较**（时钟偏移 ⇒ **重签风暴**）；`max_age` 缺失 ⇒ 退用 `issued_at → expires_at` **跨度**；两者都不可用 ⇒ **不判陈旧**（交 **403** 兜底），**判定失败不抛错、不阻断播放**。**④ `onerror` 与链接过期解耦**＝取源 **`fetch` → `Blob` → `objectURL`**（⇒ 过期只表现为 **403**），落到 **`audio.onerror` 一律按解码 / 格式**处理 ⇒ **只降级、不重调**。**⑤ 降级与跳段**＝每段 playlist 按响应 **`formats[]` 顺序多条**（**opus → mp3**）、`onerror` **同段前进**；**段内全失败 ⇒ 跳段 ＋ warning ＋ 可见提示**，**背景轨继续、不整场失败**（R41-⑦）；「**跳段即停播**」为**一句话可改**的备选（现取「不停播」）。**⑥ 重签只刷新当前段 playlist、不替换整场时间轴（设计口径）**——**实测状态（Neng-22 结案，2026-09-24）**：Neng-21 实测＝**覆盖表 `segmentPlaylistOverrideRef` 从未被写入**（全文件仅 **3 处**：**L228 声明 / L237 唯一读取 / L721 clear**，**无任何 `.set(...)`**）⇒ **该口径尚未真正生效 ＝ 中型缺陷**（后果＝段内回落**计划里的旧签 URL** ⇒ 403 ⇒ 段内重调被重入集合挡住 ⇒ **误报跳段并清空该段音频**，而新签 URL 其实可用；现实可达＝重调**重新抽签**、新 take 短于计划段时长 ⇒ **提前 `onended`** 即触发）⇒ **已修复（Kong：红 7/14 → 绿 15/15）⇒ 经 Neng-22 复验 PASS（2026-09-24，桩面：36/36 ＋ 三个变异体红对照）**；**真链路待部署**。**状态（R22，按面）**：共享模块＝**已实现（Kong）、质检 PASS（Neng-19，桩面）**；**B1＝已实现（Kong）、质检 PASS（Neng-19，桩面与静态）**；**B2a＝已实现（Kong）、质检 PASS（Neng-22，2026-09-24，桩面）**；**真实 D6 往返与真机项＝未实测** | 「环境与权限（实测结论）」**R42** 小节（①~⑥ ＋ 状态词）；§4（两条 low 缺陷修复与范围边界）；§5 播放模型；§7 第二批 ③；质检计划 §0.1（**第 17 条**） / §8.1（**X12 · X18 补恢复路径判据 ＋ 新增 X19**） |
| **R43** | **后台 Track 预览口径（①~⑩；状态＝已定口径、待实现）**（依据＝**Zang 的 10 条裁定 ＋ Kong 的后台「冥想轨道」tab 侦察结论**；正文＝「环境与权限（实测结论）」**R43** 小节） | **① 数据源**＝预览**一律经 D6**（`getTrack` ＋ `getSectionAudios`），**后台也不得直读 `med_tracks` 组装播放**（延伸 **R41-①**）。**② 不落盘**＝不写 `liwu_meditation_session_v1`、不写云、不写 `med_*`（**C18 未裁**，R41-⑤）。**③ 基于已保存版本**＝D6 只读库 ⇒ UI **必须**明示「**预览基于已保存版本 vN；未保存改动不生效**」。**④ 抽签**＝**每次开预览抽一次 ＋ 「换一批」显式重抽**（`rng` 可注入、**无固定种子**，R41-⑤）。**⑤ 缺音频分两类可计数**＝**池空** / **池非空但无可用格式**（R39-④）；段级文案「**{章节名 · section 名} 暂无可播放音频，已跳过该段（继续播放）**」＋ 面板汇总计数，**绝不整场失败**（R41-⑦）。**⑥ 失败态三态分开**＝**函数未部署 / 调用失败** ≠ **`TRACK_NOT_FOUND`** ≠ **`TRACK_DISABLED`**，各带独立文案 ＋ `requestId`（有则示）＋「重试」；**未部署不得显示为「无数据」或「Track 不存在」**，文案**不得**声称「无权限」（R41-⑦ / R39-③）。**⑦ 恢复策略简化**＝**403 ⇒ 同参整场重调 `getTrack` 至多 1 次（闸门级）**、**不做段级覆盖表**、**不得依赖 R42-⑥**（该条经 **Neng-21 实测未生效 ⇒ 已修复并经 Neng-22 复验 PASS（桩面，2026-09-24；真链路待部署）**）。**⑧ 时长两把尺子并存**＝现有面板估算（`buildMeditationTrackDurationEstimate`，`MeditationPage.jsx:2952-2962`）＋ 并列「**实测预览总时长＝Σ 人声段实测 ＋ Σ 章间留白（背景不计入）**」，并按 **R37-③** 标注 15:00 软基准与 910s 章上限之和**不是同一把尺子**。**⑨ UI 显示实际音量取值**并标明「**响应值**」/「**回退常量**」（**R41-②**：响应为准、绝不覆盖）。**⑩ 零 fixture 纪律适用于后台预览**＝桩只打**测试侧**，**后台产品代码不得留 DEV 开关 / 桩分支**，**桩读数不得当 X20 验收 PASS**（R41-⑧）。**实现约束**＝数据源 **2 行**（`apps/web/src/admin/services/cloudbase.js`，照 `apps/app/src/services/cloudbase.js:155-157`）、共享层**原样复用不另写一份**、**新建独立组件不塞进 4598 行单文件**、**不得改造老预览器**（`MeditationPreviewDialog` `:356+` / `buildMeditationPresetPreviewPlan` `:242-354`，R41-⑫ 冻结）、最小插入点＝`:2990` 保存按钮之后、**未部署时＝明确错误态（不得「无数据」）**。**状态＝「已定口径、待实现」**（**不得预写「已实现」**） | 「环境与权限（实测结论）」**R43** 小节（①~⑩ ＋ 实现约束 ＋ 未部署表现）；§1.2 / §3.7（R9 口径缺口补注）；附录 B.5 / **R9** 行；附录 C / **C4 补注**；质检计划 §0.1（**第 18 条**） / §8.1（**新增 X20**、阶段列、**Exit Criteria 改 X1~X20**） |
| **R44** | **小程序端侧接入口径（①~⑬；状态＝「已定口径、待实现」）**（依据＝**Kong 的小程序端侧侦察（含微信官方文档逐条核实）＋ Zang 裁定**；正文＝「环境与权限（实测结论）」**R44** 小节） | **① 数据源只经 D6**＝`meditationReadClient` 注入 `({ name, data }) => wx.cloud.callFunction({ name, data })`；**端侧不直连 DB 读 `med_*`**、**不读老 5 项 `app_settings`**、**不算老 plan**（D9，延伸 R41-①）。**② 前台双轨不降级**＝两个独立 `InnerAudioContext`（背景 `loop = true` ＋ 人声 `sequence`）；依据＝**官方文档无「同时只允许一个」条款**、**官方问答对「无法叠加播放」给的解法即创建多对象**、小游戏文档仅「**Android 最多同时 10 个**」（**远高于 2**）⇒ **不得**因「担心叠加」降为单轨。**③ 本批只前台**＝切后台**5 秒后停 JS 线程**、需后台能力才持续；`BackgroundAudioManager` **全局单例**、属性表**无 `loop`** ⇒ **切后台停播属平台限制、不得判缺陷**，也**不得**在本批引入 `BackgroundAudioManager`。**④ 格式只取 mp3**＝**ogg 仅 Android、iOS 不支持** ⇒ **mp3 是唯一跨端公共格式**；**小程序无 `canPlayType`**（属 HTML5）⇒ **不得**用它作判据。**⑤ 恢复策略的小程序例外（Zang 裁定）**＝无 `fetch` / `Blob` 阶段、链接过期与解码失败**都落 `onError`** ⇒ 允许**同参整场重调 `getTrack` 至多 1 次（闸门级）**、仍 `onError` ⇒ **跳段 ＋ warning ＋ 可见提示**、**不得无限重试**——**R42-④ 的明文例外**（理由已写清）。**⑥ 取源＝直设 `ctx.src`**（零部署前置）；**不做** `wx.downloadFile`（需下载域名白名单，将来须单独立项）、**不得**用 `wx.cloud.downloadFile`（D6 不下发 `file_id`，R39-⑤）。**⑦ 资源释放**＝卸载时 `destroy()` 两实例（资源**不自动释放**，否则计内存泄漏）。**⑧ iOS 静音出声**需 `wx.setInnerAudioOption`（`obeyMuteSwitch` **2.3.0 起属性失效**）⇒ **真机项未实测**。**⑨ 音量取响应**（R41-②）＋ **计时节流按 Track 组装结果**（Σ 人声实测 ＋ Σ 章间留白、弃 900s；`MIN_VALID_MEDITATION_SECONDS = 180` 两端不变）。**⑩ 固化先落本地**＝`wx.setStorageSync('liwu_meditation_session_v1', …)`、**不写云**（C18 未裁）、**不得**自建云集合，且与 R41-⑤ 同属「**App 侧尚未落地**」的待补项。**⑪ 共享层单一源**＝只能经 `npm run miniprogram:sync`（**禁手抄 CJS 副本**；`packages/shared-utils/*` 为唯一权威源）。**⑫ 时段键 `morning`** 已统一（**不动 `BADGE_SLOT_KEYS`**）。**⑬ 失败可见**＝五类错误码各带文案 ＋ `requestId`；空池 / 缺段 ⇒ 跳段 ＋ warning、**不整场失败**；**不得**回退老音频库；**零 fixture 分支**、**桩读数不得当 X21 PASS**。**本批同批登记**＝**Step 1（共享层接入）＝已实现（Kong）、待质检确认**（白名单 **8→10**、转换器补 `export class`、门禁 **15→17**、`^export ` 零命中、`node --check` 通过、运行时 **12/12**、单一源 **10/10 逐字节相等**、小程序写入侧 `dawn`→`morning`、App 读侧归一〔探针 19/19 ＋ 负对照 4 FAIL〕、`BADGE_SLOT_KEYS` sha256 前后一致）＋ **既有脚本缺陷（已修、待质检确认）**（`scripts/sync-miniprogram-packages.mjs` 原 `rm -rf` 整目录 ⇒ 自毁 **6 个手工维护**工具、`build:miniprogram` 退 1；已修为只删自产物）＋ **时段键收尾＝已派、待交** | 「环境与权限（实测结论）」**R44** 小节（①~⑬ ＋ 本批同批登记 ＋ 口径收口）；§5（端侧读取通道 / 时段键 / 播放模型）；§7 第二批 ③；质检计划 §0.1（**第 19 条**） / §8.1（**新增 X21**、阶段列、**Exit Criteria 改 X1~X21**） |

### B.6 第一批验收产生的待裁口径（**已全部裁定：R16~R20**；原始条目保留供追溯）

> 以下为回填过程中发现的**相互冲突 / 不可自洽**口径。本版**按原裁定书写、未做调和**，全部挂在此处待 Zang 裁决（裁决后回填正文并移出本节）。
>
> **✅ 裁决状态（2026-09-24，v4.1）：本节六条已全部由 Zang 裁定（R16~R20），并已就地回填正文。** 下表**保留原条目全文**（原 A / B 侧口径与「为什么不能自行调和」均未删改），**仅追加「裁定结果（R 编号）与正文落点」一列**，以保追溯；**本节待裁状态全部关闭**，正文中不再存在指向本节的「待裁」标注。裁定全文见 B.5 / R16~R20。

| # | 冲突点 | A 侧口径 | B 侧口径 | 为什么不能自行调和 | 裁定结果（R 编号）与正文落点 |
|---|--------|----------|----------|--------------------|------------------------------|
| **B6-1** | `med_*` 写权限 | 规范口径（D6）：**匿名无权限、仅 partner 管理员可读写** | 环境实测（R13）：**匿名可写**（第一批质检全程匿名写入成功） | 二者必有一个要改：要么改规范口径（承认现状），要么把收紧排进第二批（现行做法）。**第一批期间是否接受匿名可写风险，需 Zang 明示** | **已裁定（R16）**：**规范口径不变**（D6：仅 partner 管理员可读写、匿名无权限）；**匿名可写＝实现现状偏差 / 已知安全缺口**，**第一批期间接受**（dev 环境、非生产，不要求第一批回修）；**第二批必须收紧**；**新增待人工确认项**＝在生产环境人工确认 CloudBase 实际规则。落点：§med_tracks「R13 权限现状与第二批目标」＋ R16 条；附录 C / C5 |
| **B6-2** | 老四 tab 写入校验是否修 | R7：**所有** `app_settings` 冥想写入（含 `saveMeditationCalendar` / …）**必须**经 `assertCloudBase*` | R8 + D10：老四 tab 自第一批验收通过后**隐藏并只读**，其失败提示遮挡问题**挂账不修** | R7 的强制范围覆盖了 R8 判为「不修」的对象；两条口径在**老四 tab 的写入路径**上直接重叠，需裁「冻结 tab 是否豁免 R7」 | **已裁定（R17）**：**老四 tab 不豁免 R7**；四个 writer（`saveMeditationCalendar` / `saveMeditationCompositionSettings` / `saveMeditationAudioLibrary` / `saveMeditationLibrary`）的**写入结果校验已实现（Kong）、待质检确认**；R8 挂账**仅指「失败提示被仍未关闭的弹窗遮挡」这一 UI 可见性问题**。落点：§4「写入结果校验硬口径」R17 条；§2.3；附录 C / C2 |
| **B6-3** | `stale_paragraph_ids` 第一批语义 | R4 第一批：只写**本次新增差集** | 字段释义与下游用途：**「哪几段要重录」的完整集合** | 第一批语义会产生 `stale = true` 而 `stale_paragraph_ids = []` 的中间态，**下游展示不可依赖该字段**；已在 R4 标注为第二批待办，但**第一批是否允许该字段处在不自洽状态**需 Zang 确认 | **已裁定（R18-①）**：该**中间态第一批期间接受**（不视为缺陷、不要求回修）；第一批期间该字段**不得当作完整重录清单**，一律以 **`stale` ＋ 快照比对**为准；累积语义仍归第二批。落点：`med_section_raws.stale_paragraph_ids` 字段定义；附录 C / C3 |
| **B6-4** | 分组标题文案 | R2：纯音频段区块**按 `section_type` 分组**（分组即 `sec-nature` / `sec-bowl`） | R1：label 前缀用**章节名**（自然库 / 颂钵库） | 同一区块内**分组粒度（section_type）与显示名粒度（章节名）不一致**；分组标题到底显示 `sec-nature` 还是「自然库」**未裁定**，属第二批 UI 落地前必须定的口径 | **已裁定（R18-②）**：分组标题口径**定稿**＝`{章节名} · {section 名}（sec-x）`，例「**自然库 · 自然（sec-nature）**」；与 R1 的 label 章节名前缀**不矛盾**，**照此收敛、不再留作待裁**。落点：§3.6「纯音频段入口」展示口径 |
| **B6-5** | 「加入音频库」下拉行顺序 | R6（v4）：`{section_type 名} · {段落数}条 · {首段摘要}` | 第一批实现：`{首段摘要} ＋ {section_type 名} · {N}条` | 文实顺序不一致；R6 未说明是「改实现」还是「回改规范顺序」，**需 Zang 指定以哪一侧为准**（已记为附录 C / C8） | **已裁定（R20-①）**：**以下拉行顺序以规范为准**＝`{section_type 名} · {段落数}条 · {首段摘要(前 40 字)}`，规范顺序**不回改**；实现侧按规范收敛（**K8 已实现（Kong）、待质检确认**）。落点：§3.5；附录 C / C8 |
| **B6-6** | `revision` 递增 vs stale 触发条件 | R5：`revision` **每次成功保存 +1**（不论改了什么） | 「段落改动级联」：**Paragraph 被修改后**才标记引用它的 Section-Raw 为 stale | 若仅改 `tags` / `paragraph_type`（文本未变）也 +1，则按 `revision` 比对会**误判 stale**；两条口径需裁「stale 判定是以 revision 比对为准，还是以 `text_snapshot` / 文本比对为准」 | **已裁定（R19）**：stale 判定**只看文本快照 / 文本比对，`revision` 不参与**（`revision` 仅作审计追溯）；**级联只在段落文本实际变化时触发**——仅改 `tags` / `paragraph_type`（文本未变）**不得**标记 stale；**禁止用 `revision` 比对判 stale**（**K9 已实现（Kong）、待质检确认**）。落点：「段落改动级联（stale）」；`med_paragraphs.revision` 字段定义；附录 A.2 / A26 |

---

### B.7 待人工拍板项：`med_*` 权限收紧方案（R29，Zang 裁定 2026-09-24）

> **状态：待人工拍板**（Kevin / 生产权限负责人）。**未拍板前不得修改任何权限规则**（R29）。
> **三方案共有的硬前置**：必须先解决**后台身份模型**——**匿名会话**下（旧称 `dev_login`，R36-① 更正）单独改权限会**静默失效**（越权写只返回 `updated:0`、无错误；`app_settings` 为既有先例，见「环境与权限」R28-②）。
> **另一项共有前置（R30）**：端侧读取都必须先具备 **D6 只读云函数**（硬前置，见 §7）。

| 方案 | 内容 | 代价 / 影响 | 端侧读取 | 结论 |
|------|------|-------------|----------|------|
| **方案 1（推荐）** | **后台换非匿名身份**（手机号 / 自定义登录 ＋ 管理员角色）；`med_*` 改为「**仅管理员可写 + 所有用户可读**」；端侧读取走 **D6 只读云函数** | 需实现非匿名登录与角色校验（既有 `user_tags` 体系可复用）；改动面中等 | 云函数（D6） | ✅ **推荐**：唯一同时消除「匿名可写」缺口与「静默失效」风险的方案；且与已裁定的 D6 一致 |
| **方案 2** | **保留匿名可写**；仅把 `med_*` **读**权限放开为「**所有用户可读**」；端侧**直连 DB**（不走 D6） | 代价明确：**草稿 / 未发布录音对外可读**；写侧仍留匿名可写缺口 | 直连 DB | ⚠ 可最快上线，但安全面收窄有限，且与已裁定 D6（端侧只走云函数）冲突 |
| **方案 3** | **读写全走云函数凭证**；`med_*` 对客户端**完全关闭** | **最安全**；**工作量最大**（需为全部读写路径建云函数 + 权限校验） | 云函数（读写） | ⚠ 安全最优、排期成本最高 |

- **三方案差异点**：**后台写侧身份模型** 与 **端侧读通道**（方案 1 / 3 走云函数，方案 2 直连 DB）；**共同点**＝端侧读取都离不开 R30 的 D6 前置。
- **拍板后动作**：结论回填本表、`med_tracks` 权限小节（R16 条）与附录 C / C5；随后才可执行**质检计划 §8.1 / X9**（X9 不得在拍板前执行）。

### B.8 上一轮报告 4 条残留的处置（2026-09-24，与 R32 同轮）

> 来源＝Jing 提交的 R27 报告所列 4 条残留。**无新 R 编号**（不属新增裁定，仅就地收口）；记录在此以保证追溯。

| # | 残留 | 处置（Zang 裁定 2026-09-24） | 落点 |
|---|------|------------------------------|------|
| 1 | 老四 tab「冻结只读」与代码仍可写并存 | **口径不变**（**「冻结只读」＝目标态**）；**只读闸门 ＋ 入口隐藏一并归 D10**（前置按 R20-②）。**过渡规则措辞正确、不改** | §1.2「冻结定义」补注；§4 过渡规则；附录 A.2 / A27 |
| 2 | `med_section_raws` **无删除路径** | 登记为**挂账 C9**（**低危、非阻塞**）；**第二批若做**需**连带处理候选音频（`med_section_audios`）与引用（`audio_candidates`）** | 附录 C / C9；「集合与代码映射」表 `med_section_raws` 行 |
| 3 | `docs/partner.meditation.spec.md` 过期 | 由 **R32** 处置（本单允许修改该别名文件的**子模块清单与更新日期**） | B.5 / R32；别名文件 |
| 4 | §1.2 表内「冻结只读（规则 A）」与代码可写并存 | **保留**（同第 1 条，不改措辞） | §1.2 |

---

## 附录 C：第一批挂账清单（已知不修 / 待办，R15）

> **本清单是「明确不修」的登记**，每条写明**不修的理由**与**归属批次**，避免第二批重复发现、误判为遗漏或缺省通过。
> 登记时间：2026-09-24（依据：冥想第一批验收裁定）。**挂账 ≠ 缺陷遗漏**：每条均有明确重启条件。
> **2026-09-24（v4.1）更新**：依 Zang 裁定 R16~R20 同步——**C8 不再是挂账项**，转为「**已实现（Kong）、待质检确认**」；**C2 / C3 / C5 / C7** 补入裁定口径与前置条件（R17 / R18-① / R16 / R20-②）。
> **2026-09-24（v4.2）更新**：依 Zang 裁定 **R22** 统一状态词——本清单内 **C2**（四个老口径 writer 的写入结果校验）与 **C8**（K8）一律写「**已实现（Kong）、待质检确认**」；**不得出现第二种状态词**；**待质检通过后再统一改「已通过」**。
> **2026-09-24（v4.3）更新**：依 Zang 裁定 **R25~R27**，本清单**未新增挂账项**——C7（`med_tracks` 集合缺失）口径不变，仍是 **D10 的硬前置**；C2 / C8 状态词维持「已实现（Kong）、待质检确认」（R22）。
> **2026-09-24（v4.4）更新**：依 Zang 裁定 **R28~R32**——**新增 C9**（`med_section_raws` 无删除路径）；**C5** 补「**成套动作 + 前置依赖 + 待人工拍板项（附录 B.7）**」（R29）；**C6**（转码执行器）标为**第二批第一项**、**C4**（Track 预览 / 端侧双轨播放）明确「**依赖 D6 只读云函数（R30 硬前置）**，**先 App、后小程序**」；**C7** 前置口径不变（R20-②），仅补「D10 排末位但前置不放宽」。
> **2026-09-24（v4.5）更新**：依 Zang 裁定 **R33**——**C6（转码执行器）**补「参数与执行形态已定稿（R33-① ~ ⑨），第一批只落录音与待转码状态；实现侧 `scripts/audio-transcode-worker.mjs` 仍为旧参数、随本项更新」；本清单**未新增挂账项**（32k CBR 的听测归附录 B.3 / **T4「待人工听测」**，非挂账）。
> **2026-09-24（v4.6）更新**：依 **R34~R36**——**新增 C10~C13**（loudnorm 待用户拍板 / `audio_url` 2 小时临时 URL / 排队方路径与执行器输出路径不一致 / job 文档字段冗余与镜像收敛）；**C6**（转码执行器）参数改 48k 立体声、并更正「worker 仍为旧参数」为**已随本轮更新（L28）**；**T4（48k 立体声人工听测）**属附录 B.3 的待确认项、**不列为挂账**；**UI 类验收的「环境不可达」纪律**落质检计划 §0.1，**不在本清单**。
> **2026-09-24（v4.7）更新**：依 **R37~R38**——**C7（`med_tracks` 集合缺失）标「已关闭」**（集合已建，2026-09-24；证据＝`res.code` 无 `code` / `message` ＋ 正对照同形 ＋ `add` 成功 ＋ **两轮端到端写入 / 读回 / 删除成功**，旧「标阻塞」口径作废，附录 A.2 / **A34**）；**新增挂账 C14 / C15**（默认种子 Track 预估口径待用户拍板；dev 身份 / 环境治理三选一待用户拍板）；**C6（转码执行器）**补「样本实际时长 ≈61.2s」的复核前置（R37-①）；**删除路径静默假成功**与 **dev 直写真实 CloudBase** 属**缺陷 / 环境事实**（登记于正本「环境与权限」R38 小节与 §4），**不列为挂账**；队列首轮权威键缺省**仍在 C13 保持**。
> **v4.7 复核补注（2026-09-24，Jing）**：本清单**未新增挂账项**——**D-B2-16（后台自动修复路径的删除保持不抛出）是裁定、不是挂账**（登记于正本 R38-④ / 附录 A.2 / **A37**）；**R38-① 的删除断言**属**缺陷修复 + 待质检确认**，同样不入本清单；C14 / C15 仍**待用户拍板**，C13 **保持**。
> **2026-09-24（v4.8）更新**：依 **R39** 与本批质检结论——**新增 C16**（`cloudfunctions/getHomePageData` 有目录但未登记进 `cloudbaserc.json`，既有差异、待裁定）；**C2 补「静态 PASS、动态受阻于 R28 权限模型」的复验进度注记**（四个老口径 writer，**归因未定、待 Zang 就 `updated` 语义另裁**〔**v4.9 补注：已由 R40 裁定 ⇒ 该现象归入 R40-② 的「无权写（静默拒绝）」一类**〕）；**R38-① 的删除断言已质检 PASS（Neng-16）**，属**缺陷修复的结论登记**、**不入本清单**；**R39 的「不做端侧身份校验」是口径**（收紧须另裁，**并入 C15 / X9**），同样**不入本清单**。
> **2026-09-24（v4.9）更新**：依 **R40**——**C2** 的复验进度注记状态更新为「**静态 PASS、动态复验待按 R40 执行（判据已定）**」（**`updated` 语义已由 R40 裁定**：非属主身份下 `{updated:0}` 且文档体未变＝ **R40-② 的「无权写（静默拒绝）」一类**；**仍不得写成通过，也不得判为实现缺陷**）；**C7** 的 D10 复核注记同此口径；**A39**（「同值 `updated:0`」作普适命题作废）与 **A36 依据改写**登记于附录 A.2；`app_settings` 写侧两条更正（非属主 update 既有文档＝静默 `{updated:0}`、非属主 `add`＝成功）登记于 **R28-② / R40-⑧**——**本清单未新增挂账项**。
> **2026-09-24（v4.10）更新**：依 **R41**——**新增 C17 / C18**（C17＝`database.js` 另有 **38 处**含易变字段的 update 路径**未接** R40-⑤ 读回断言〔本批只覆盖冥想链路 8 处〕；C18＝端侧冥想会话记录的**云侧写入未定**〔现只落本地 storage，R41-⑤〕）；**C4**（Track 预览 / 端侧双轨播放）补「**接入口径已定＝R41 ①~⑫**」；R41 的两个共享模块状态（**已实现（Kong）、待质检确认**）与 **App 侧接入（实现中（Kong））** 属**实现进度**、**不入本清单**；**本清单不新增其他挂账项**。
> **2026-09-24（v4.11）更新**：依 **R42 ＋ X17 结案（Neng-20）＋ Neng-21 复验**——**新增 C19（背景轨是否按章切换，待用户拍板）/ C20（非 403 取源失败是否补「原样重试一次」，待排期）/ C21（`getSetupErrorMessage` 集合缺失分支不拼接 `rawMessage`，一行可修、已列入下一单）**；**C4** 补「**恢复路径与格式降级口径已定＝R42 ①~⑥；其中 ⑥ 的设计口径经 Neng-21 实测尚未真正生效（中型缺陷、修复单已派）**」；**R42 / B2a 的复验结论（1 条中型缺陷 ＋ 1 条低「dist 产物落后」）属缺陷与复验进度、不入本清单**（修复单已派、待复验）；**两条 low 缺陷（requestId 重复追加 / 未捕获 Promise 拒绝）为已修复项、不入本清单**（登记于 §4）；**X17 结案（Neng-20）＝结论登记、不入本清单**；**本清单不新增其他挂账项**。
> **2026-09-24（v4.11 补注，Jing）更新**：**新增 C22**——`apps/app/public/audio/meditation/` 下 `sea_wave1.mp3` / `sea_wave2.mp3` / `sea_wave_seagull.mp3` 三个老兜底音频**是否删除**（**git 跟踪、合计 ≈1.42 MB、源码零引用**、属老规则 A 兜底音、**已被 D6 / R41-⑦ 取代**；Zang 已建议删除、**待用户一句话**）；同步 §7「状态与其它归属」的**待人工拍板项**。**本补注不改动任何已裁参数、不改写任何历史版本注记**。
> **2026-09-24（v4.12）更新**：依 **R43（后台 Track 预览口径，①~⑩）**——**本清单未新增挂账项**（**R43 是第二批实现项、不是挂账**）；**C4** 补「**后台 Track 预览口径已定＝R43（v4.12）；实现待 R9 S1**」。**R43 的状态词＝「已定口径、待实现」**，**不得**据此认为 C4 已关闭。
> **2026-09-24（D1 结案 ＋ 行数口径更正 ＋ C23 ＋ R41-⑤ 缺口登记，Jing）更新**：依 **Neng-22 复验（桩面 PASS）＋ 实测 `wc -l` 行数**——**① D1（R42-⑥ 覆盖表写回）结案**：Neng-21 的中型缺陷已修复（Kong）并经 **Neng-22 复验 PASS（桩面：桩面 36/36 ＋ 三个变异体红对照）** ⇒ **B2a 状态词升为「已实现（Kong）、质检 PASS（Neng-22，2026-09-24，桩面）」、X19 状态＝「桩面 PASS、真链路待部署」**（**真链路＝D6 未部署，整体 PASS 仍不可判**）；**② 两个共享模块行数口径更正为实测 `wc -l` 值**（`meditation-read-client.js` **458** 行 / `meditation-track-playback-plan.js` **459** 行）；**③ 新增挂账 C23**（同一 plan 内同一 `section_type` 多实例时 `find` 取首条 ⇒ 第 2 个实例拿到第 1 个实例的抽签结果；**六章模板下 `section_type` 唯一 ⇒ 理论情形、当前不可达、不修**；Neng-22 观察项、非缺陷）；**④ R41-⑤ 缺口登记**（端侧会话固化载荷**先落本地 storage 键 `liwu_meditation_session_v1`** 在 **App 侧尚未落地**——键全仓源码零命中、`buildSessionSolidification` 无消费方 ⇒ **列入待补**，云侧仍按 C18 未裁；同步 **C18 补注**）。**本批不改动任何已裁参数、不改历史版本行、不预写实现状态**（**R43 / X20 保持「已定口径、待实现」**）。
> **2026-09-24（v4.13）更新**：依 **R44（小程序端侧接入口径，①~⑬）**——**本清单未新增挂账项**（**R44 是第二批实现项、不是挂账**；**Step 1（共享层接入）＝已实现（Kong）、待质检确认** 与 **既有同步脚本 `rm -rf` 缺陷（已修、待质检确认）** 属**实现进度 / 缺陷修复**，**不入本清单**；**时段键收尾＝已派、待交**，亦**不入本清单**）；**C4** 补「**小程序端侧接入口径已定＝R44（v4.13）；实现待 R9 S1**」。**R44 的状态词＝「已定口径、待实现」**，**不得**据此认为 C4 已关闭。

| # | 挂账项 | 不修的理由 | 归属 / 重启条件 |
|---|--------|-----------|-----------------|
| C1 | 老音频库 ▶ 播放中不翻转为 ⏸（播放态图标不切换） | 老四 tab 已**冻结只读**（D10），交互不再投入；随 tab 下线自然消失 | 随 D10 下线处置（**不修**） |
| C2 | 老四 tab 保存失败横幅被未关闭弹窗遮挡（R8 同类） | **边界（R17，Zang 裁定 2026-09-24）**：本案挂账**仅指「失败提示被未关闭弹窗遮挡」的 UI 可见性问题**；**老四 tab 不豁免 R7**——其四个 writer（`saveMeditationCalendar` / `saveMeditationCompositionSettings` / `saveMeditationAudioLibrary` / `saveMeditationLibrary`）的**写入结果校验已实现（Kong）、待质检确认**（**复验状态（v4.9）＝静态 PASS、动态复验待按 R40 执行（判据已定）**——静态 8/8 断言存在且行号已核：L5183/L5190、L5249/L5256、L5315/L5322、L5381/L5388，集合缺失另抛 L5172/L5238/L5304/L5370；动态仅冥想库 1 条完成，非属主身份得 `{updated:0, upsertedId:null, requestId:3b734af94bab9}` 且断言不抛、页面零提示——**该 v4.9 动态观察已由 v4.11 实测取代：非属主保存现已「可见失败」**〔逐字＝「冥想文库保存失败：未能确认写入生效（未检测到任何变化）（requestId: 2c26a5bfd807a8）」、`[role=dialog]=0`、**文案不含「无权限」**；**X17＝已裁并已 PASS（Neng-20，2026-09-24）**〕），与本挂账**无关**（**v4.11 补注**：该 tab 的写入失败提示已在本批改为 **tab 级内联 `[role=alert]` 提示**、并消除未捕获 Promise 拒绝——**与本挂账的「提示被未关闭弹窗遮挡」分别登记**；本挂账仍按 D10 下线处置，**不得据此认为 C2 已关闭**）。挂账理由：老四 tab 冻结、D10 后下线，其**可见性**改造不在第一批交付范围 | D10 下线处置；**第二批若保留该 tab 则必须修可见性**；**不得据此认为写入结果校验被豁免**（R17） |
| C3 | `stale_paragraph_ids` 仅写「本次新增差集」（非累积集合） | **第一批接受（R18-①，Zang 裁定 2026-09-24）**：`stale = true` 且 `stale_paragraph_ids = []` 的中间态**允许存在、不作为缺陷、不要求第一批回修**；第一批期间该字段**不得当作完整重录清单**（以 `stale` ＋ 快照比对为准）。不修理由：第一批按最小改动交付；累积语义需配合 `text_snapshot` / `paragraph_ids_snapshot` 比对重写，改动面涉及级联与展示两侧 | **第二批**（目标口径已定，见 R4；第一批接受口径见 R18-①） |
| C4 | Track 预览（双轨：背景 loop + 人声 sequence） | 依赖端侧播放能力，第一批只交付配置面 | **第二批**（R9；§1.2 / §3.7 已标批次）；**执行位置（R30）**：在 **① 转码执行器 → ② D6 只读云函数** 之后，**先 App、后小程序**；**D6 为硬前置**（端侧在「仅创建者可读」下读 `med_tracks` / `med_section_audios` 只会得到静默空集，R28-①）；**（v4.10）接入口径已定＝R41 ①~⑫**（数据源一律经 D6、端侧永不直连 DB、格式降级与失败可见且不静默回退、端侧计时按 Track 组装结果）；**（v4.11）恢复路径与格式降级口径已定＝R42 ①~⑥**——其中 **⑥（重签只刷新当前段 playlist）经 Neng-21 实测未生效**（覆盖表 `segmentPlaylistOverrideRef` 从未被写入 ⇒ 段内回落旧签 URL、**误报跳段**）＝**中型缺陷 ⇒ 已修复（Kong）并经 Neng-22 复验 PASS（桩面，2026-09-24；真链路待部署）**；状态＝**共享模块＝已实现（Kong）、质检 PASS（Neng-19，桩面）**、**App 接入 B1＝已实现（Kong）、质检 PASS（Neng-19，桩面与静态）**、**B2a＝已实现（Kong）、质检 PASS（Neng-22，桩面）**、小程序本批只支持前台播放（**真实 D6 往返与真机项＝未实测**）；**（v4.12）后台 Track 预览口径已定＝R43（v4.12）；实现待 R9 S1**（状态＝**已定口径、待实现**——**不得**据此认为 C4 已关闭）；**（v4.13）小程序端侧接入口径已定＝R44（v4.13）；实现待 R9 S1**（状态＝**已定口径、待实现**） |
| C5 | `med_*` 权限收紧（匿名可写 → 仅 partner 管理员可写） | **R16 已裁定（2026-09-24）**：规范口径不变（仅 partner 管理员可读写、匿名无权限，D6）；匿名可写＝**实现现状偏差 / 已知安全缺口**，**第一批期间接受**（dev 环境、非生产）→ **第二批必须收紧**。不修理由：需与端侧只读云函数（D6）配套上线，单独收紧会直接打断端侧读取 | **第二批**（R13 / R16-③）；**⚠ 不得单独执行（R29，Zang 裁定 2026-09-24）**：**必须先解决后台身份模型（非匿名登录 ＋ 管理员角色）**，否则匿名会话下收紧会**静默失效**（越权写只返回 `updated:0`、无错误；`app_settings` 为先例）——三个方案**待人工拍板**（**附录 B.7**，**方案 1 推荐**：非匿名后台身份 + `med_*` 仅管理员可写/所有用户可读 + 端侧走 D6）；**另有待人工确认项**：需在生产环境**人工确认 CloudBase 实际权限规则**（R16-④），结论回填本清单与正本权限小节 |
| C6 | 转码执行器（raw → Opus 主体 + mp3 兜底的实际转码） | **R33（Zang 裁定 2026-09-24）后不再是「参数未定」的挂账**：**参数与执行形态已定稿**（**R34 定稿**：Opus `-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000` → `.ogg`；mp3 `-c:a libmp3lame -b:a 48k -ac 2 -ar 44100`；**单次 ffmpeg 调用双路输出**；SCF **256MB / 单次超时 60s**；静态 ffmpeg 不入仓）——**`-ac 1`（32k 单声道）口径已作废**（附录 A.2 / **A33**）。第一批只落「录音 → 原始文件 → 待转码状态」，**执行器本体**仍为独立工作量 | **第二批**；**顺序（R30）＝第二批第一项**（其后为 D6 只读云函数 → 端侧双轨播放 → D10）。实现须**逐条落实 R33-③ ~ ⑨ ＋ R34-① ~ ⑤ ＋ R35-① ~ ⑥**（含 `duration=N/A` 硬约束、**输出保留双声道**、**队列分区（D-B2-9）**、**口径收紧（取消 `item_id` 回退）**与**字段权威（D-B2-10）**）；其中**队列分区与口径收紧已落地**（Kong 自测 **15/15 PASS**），**上线纪律须同时写入 `scripts/README.md`**（该文件**存在**）；实现侧 `scripts/audio-transcode-worker.mjs` **第 28 行已随本轮更新为 48k 立体声硬 CBR**（**原「现仍为旧参数（48k VBR）」表述已由 R35-③ 更正**；该 worker **L295 `output.opus`** 与排队方 `.opus` 扩展名**未改**，见 **C12**） |
| C7 | `med_tracks` 集合缺失（环境 `liwu-d8gek6jjdab1d087c`） | **✅ 已关闭（R37-②，2026-09-24 实测确认）**——集合**已创建**，证据链＝① 读取 `res.code` **无 `code` / `message`**（非 `DATABASE_COLLECTION_NOT_EXIST`）；② **正对照同形**（`med_section_raws` 同读法同形态）；③ **`add` 成功**（排除「集合不存在却假成功」的假否定）；④ **两轮端到端写入 / 读回 / 删除均成功**（R7 g/h 的**数据层与 UI 层均通过**）；⑤ **测试文档已删除**。原「不修理由」中的**人工创建**一步**已完成**；旧口径「缺失 ⇒ 一切 Track 落库类验收一律标「阻塞」」**作废**（附录 A.2 / **A34**） | **已关闭**（保留记录：R12 的人工创建已于 2026-09-24 完成）；**D10 的该项前置 ✅ 已满足**；D10 仍须**同时**满足「R7 端到端验收通过」——其中 **Track 路径已通过（R37-③）**、四个老口径 writer **待质检确认**（R20-② / R17）；**R30 补注不变**：D10 在第二批顺序中排**末位**（转码执行器 → D6 只读云函数 → 端侧双轨播放 → D10），**前置不因排末位而放宽** |
| C8 | 「加入音频库」下拉行渲染顺序（R6 旧实现为「首段摘要 ＋ `section_type 名 · N条`」） | **R20-① 已裁定（2026-09-24）**：行顺序**以规范为准**＝`{section_type 名} · {段落数}条 · {首段摘要(前 40 字)}`，规范顺序**不回改**；实现侧已按规范顺序调整（K8）。**本项不再挂「不修」**，转为「**已实现（Kong）、待质检确认**」 | **已实现（Kong）、待质检确认**（复验项见质检计划 §8.1 / K8）；**若质检不通过则退回 Kong 修正**，不再计入第二批范围 |
| C9 | `med_section_raws` **无删除路径**（第一批只实现段落删除与候选音频删除） | **低危、非阻塞**（R32 同轮登记）：Section-Raw 可编辑、可增删段落、可挂候选音频，**缺删除入口不影响第一批验收与新链路主流程**；不修理由＝第一批按最小改动交付 | **第二批**（若做）；**若实施删除需连带处理**：该 raw 的候选音频 `med_section_audios`（含 `med_section_raws.audio_candidates` 引用）与下游引用；**未实施前不得把「无删除路径」当作缺陷计入第一批** |
| C10 | **响度归一（loudnorm）是否沿用 —— 待用户拍板** | **新链路（`cloudfunctions/meditation-transcoder`）当前无任何 `-af`**；老 worker（`scripts/audio-transcode-worker.mjs`）为**两遍 loudnorm**（第 1 遍 `-af loudnorm=I=-18:TP=-1.5:LRA=15:linear=true:print_format=json -f null -` 只取 measured 参数、解析 stderr 的 `[Parsed_loudnorm` JSON，失败报 `LOUDNORM_JSON_NOT_FOUND`；第 2 遍按 `measured_*` 重编），`profile=nature` 在第 2 遍追加 `volume=0.2`、`tts_simple` 跳过 loudnorm。**不修/未启用理由**：既定「**单次 ffmpeg 调用双路输出**」形态**放不下两遍测量**——启用需 **2 次 ffmpeg 调用**、耗时 **≈×2**（R33-⑥ 的 60s 超时与吞吐预算需重算）；且 `nature` 的 `volume=0.2` 是否继续适用**需重新裁定**。**实现侧建议**：本批先按**纯参数化（无 loudnorm）**交付（体积与耗时可控、行为可预测） | **待用户（Kevin）拍板**；**启用点只有一处**＝`cloudfunctions/meditation-transcoder/lib/transcode-command.js`（改后须与 worker 同步）；**未拍板前不得由实现者自裁启用**，也不得把「响度一致」写成已达成 |
| C11 | **`audio_url` 是 2 小时临时 URL** | 新执行器取 URL 用 `app.getTempFileURL` 且 **`maxAge = 7200`（2 小时）** ⇒ **`audio_url` 过期后播放必然失败**；**长期可用的标识只有 `file_id`**。本批只登记口径、不改取 URL 逻辑（改动面涉及 D6 只读云函数与端侧播放两侧） | **第二批（随 D6 / X14 落地）**：**D6 只读云函数必须承担 `file_id` → 临时 URL 的重新签发**，端侧不缓存过期 URL；**判据归属**＝质检计划 §8.1 / **X14**（**D6 判据已增设「重新签发临时 URL」一条**，本批同步落位）；**未落地前不得以「后台预览能播放」推断「长期可播放」** |
| C12 | **排队方 `target_cloud_path` 与执行器输出路径不一致 ＋ `.opus` 扩展名遗留** | 排队方（`MeditationPage.jsx`）写 `target_cloud_path = meditation-audio/{section_type}/{section_raw_id 或 'audio-only'}/take-{section_audio_id}.opus`；执行器实际输出 `meditation-audio-final/{section_type}/take-{section_audio_id}.ogg` 与 **`.mp3`**——**目录前缀与扩展名两处都不一致**；另有 worker 第 **295** 行临时文件名仍为 `output.opus`。本批只登记、不改代码（改动需前端排队方与两个执行器**同轮同步**，属独立工作量） | **待前端后续单同步**（第二批，随 C6 / X13）；**同步时必须一次改齐**：排队方 `target_cloud_path` ＋ 新执行器输出/上传路径 ＋ worker 临时文件名（**不得只改一侧**，否则产物路径继续分叉）；**未同步前以执行器实际输出路径为准**判产物存在性 |
| C13 | **`audio_transcode_jobs` 文档字段冗余 ＋ 权威/镜像双写** | ① `createMeditationAudioTranscodeJob` 末尾 `...(jobData \|\| {})` 展开 ⇒ **camelCase 原键（`sourceFileId` / `targetCloudPath` / `transcodeProfile` 等）与 snake_case 规范键并存**；② `transcode_profile` 默认值 `'default'` 与实传 `'section_audio'` **双写**（默认值易误导读取方）；③ **权威字段（`attempts` / `transcode_error`）与过渡期镜像（`attempt_count` / `error_message`）同时写**（R35-②）；④ **排队方 `database.js:5915` 只写镜像键 `attempt_count: 0`、未写权威键 `attempts`**（因本批硬约束**禁改该文件**）⇒ **读取侧必须保留 `attempts ?? attempt_count` 回退**，**首轮领取前权威键缺省属已知过渡态、不得当缺陷**。不修理由：本批按**最小改动**交付，写入链路改动会影响老 worker | **第二批**：**待老 worker 退役后**收敛为**只写权威字段**并清理冗余键（前提＝老 worker 不再消费 queue，见 R35-① 上线纪律）；**未清理前**：一律以 `attempts` / `transcode_error` 为准，**不得**把镜像字段当权威、**不得**据字段冗余判数据异常 |
| C14 | **默认种子 Track 的 UI 预估 ≠ 基准**（预估 **26:55** vs 基准 **15:00**，**+79%**） | **R38-③①（2026-09-24 新登记）**：根因＝**UI 预估用的是「章时长上限之和 910s」**（六章 `max_duration_seconds` 300+30+130+150+270+30），而非**按字数预算的实际朗读时长**；`total_target_seconds = 900` 是**软基准**、**不是**同一把尺子（§3.7 术语澄清）。不修理由：**预估口径属产品定义、须用户裁定**（改口径会影响所有 Track 的展示与验收判据） | **待用户（Kevin）拍板**；拍板后须**同步**：§3.7 术语澄清、`med_tracks` 字段说明与质检判据。**未拍板前不得由实现者自裁改预估算法**，也**不得**把 26:55 当缺陷计入第一批 |
| C15 | **dev 身份 / 环境治理**（匿名 dev 会话**直写真实 CloudBase**、数据删不掉） | **R38-②③（2026-09-24 新登记）**：dev 后台经 `apps/web/vite.config.js` → `scripts/dev-cloudbase-proxy.mjs`（:3020）直连**真实环境 `liwu-d8gek6jjdab1d087c`**，且 **`CLOUDBASE_ADMIN_API_KEY` 实测未配置** ⇒ 写入以**调用者匿名 `_openid`** 落库；**换 profile 既看不见也删不掉**（实测 `deleted: 0`、owner profile 复读仍在）。不修理由：**环境治理方案须人工拍板**（涉及是否引入固定 dev 身份 / 本地可清空库 / 读路径注入 admin 凭据，以及清理动作的授权边界） | **待用户（Kevin）拍板**（**三选一**：**固定 dev 身份** / **本地可清空库** / **读路径也注 admin 凭据**）；**只读盘点（服务端凭据）已在做**；**删除须人工确认清单后执行**——**未拍板前不得在 dev 会话里尝试清库**（必然 `deleted: 0`），也**不得**据「新 profile 看不到数据」判「数据已清 / 不存在」（R31-①） |
| C16 | **`cloudfunctions/getHomePageData` 有目录但未登记进 `cloudbaserc.json`**（既有差异） | **本批（v4.8）登记、未处理**：仓库根 `cloudbaserc.json` 的 `functions` 列只有 `fortuneDailySettlement` / `getUserPhone` / `resolve-user-duplicates` / `meditation-read` / `meditation-transcoder`；`cloudfunctions/getHomePageData/`（`index.js` ＋ `package.json`）**存在但无登记项** ⇒ 该函数**无法随 `cloudbase deploy` 全量部署**（只能单独 `functions:deploy`），其 runtime / 内存 / 超时口径**在仓库内无单一来源**。不修理由：与冥想第二批无关的**既有差异**，是否补登记、以及是否需连带核对线上配置**须裁定**；本批硬约束（只改两个文档）也不允许改 `cloudbaserc.json`。**注**：D6 的旧表述「照 `getHomePageData` 模式」**与登记状态无关**——D6 的契约自 v4.8 起以 **R39** 为准 | **待裁定**（补登记 `cloudbaserc.json` ／ 确认线上函数实际存在与规格 ／ 或确认该目录为待删残留）；**裁定前**：**不得**据「`cloudbaserc.json` 里没有」推断该函数「不存在 / 未部署」，也**不得**据目录存在推断它「已登记」 |
| C17 | **`database.js` 另有 38 处含易变字段的 update 路径未接 R40-⑤ 的读回断言** | **R41 同批登记（2026-09-24）**：本批**只覆盖冥想链路 8 处**（四个老口径 writer ＋ `updateMedParagraph` / `updateMedSectionRaw` / `updateMedSectionAudio` / `updateMedTrack`）；其余 **38 处**（如 `saveAiSettings` / `saveThemeSettings` / `saveMeditationSettings` / `savePartnerBrand` / `saveShopProduct` / `updateUser` 等）**未接**——**另有 9 处未检出易变字段的 update 不得接**（接了会把「同值 no-op」误判为失败，违背 R40-⑤ 的适用前提「载荷必然含易变字段」）。 | **不修理由**＝**爆炸半径大**：每条须先**逐路径确认「载荷必然变化」**（含易变字段），确认前接入会制造假失败；**归属**＝**待排期**（未排期前**不得**由实现者扩大 R40-⑤ 的适用范围，正本 R40-⑤「仅 8 处」不变） |
| C18 | **端侧冥想会话记录的云侧写入未定**（现只落本地 storage） | **R41-⑤（2026-09-24）**：端侧固化载荷（`{track_id, track_version, date_key, session_key, selections[]}`）**先落本地 storage（键 `liwu_meditation_session_v1`）**，**云侧写入另裁**。 | **不修理由**＝**新建云集合会与「`med_*` 仅管理员可写」的目标（附录 B.7 方案 1）冲突**——端侧身份若无写权限，新集合必然落成「静默 `{updated:0}` / 写不进」，需与权限方案同拍；**归属**＝**待用户（Kevin）拍板**（与 B.7 权限方案同批）。**拍板前**：**不得**由实现者自建云集合、也**不得**把「云侧已写入会话记录」写成已实现。**补注（2026-09-24，D1 同批登记）**：**R41-⑤ 的「本地 storage 固化」经实测在 App 侧尚未落地**——`liwu_meditation_session_v1` **全仓源码零命中**、`buildSessionSolidification`（`packages/shared-utils/meditation-track-playback-plan.js:397`）**无任何消费方** ⇒ **已列入待补**（**App 侧本地 storage；云侧仍按本条未裁**）；**不得**把「本地已固化」写成已实现 |
| C19 | **背景轨是否「按章切换」**（现为「取一条背景音**整场铺底 `loop`**」，R41-②） | **R42 同批登记（2026-09-24，Jing）**：现状＝背景轨**整场只取一条**、按 R41-② 以 `loop` 铺底 ⇒ **同时启用「自然」与「颂钵」等章**时，**除该条之外各章的背景抽选结果不会被播放**。**这不是缺陷**（R41-② 的播放模型本就是「背景 `loop` / 人声 `sequence`」），本项是**产品口径待定**：是否在走到某章时**切播该章选中的背景音**（备选实现须处理章界切换与过渡，而 R41-⑩ 已明「本批不做渐变」）。**不修理由**＝**属产品行为、非实现缺陷、非规范冲突**，需用户拍板后才能改 | **归属**＝**待用户（Kevin）拍板**；**拍板前**：**不得**由实现者自行改为按章切换（会实质改变 R41-② 的 `loop` 语义） |
| C20 | **非 403 的取源失败（如断网）未做「同 URL 原样重试」** | **R42 同批登记（2026-09-24，Jing）**：现状＝一律走 **降级 → 跳段**（R42-⑤：`fetch` 失败 / 非 403 ⇒ 按 `formats[]` 降级前进；段内全失败 ⇒ **跳段 ＋ warning ＋ 可见提示**，背景轨继续、不整场失败）。**不修理由**＝**重试策略待裁**——网络瞬断与「链接失效（403）」本就分属两条路径（R42-①④/⑤），补「同 URL 原样重试一次」会引入新的等待与重入维度，且**须与 R42-② 的有界要求一并设计**（重试次数、退避、是否占用段级额度）；现取「**快速降级 / 跳段、不卡播放**」 | **归属**＝**待排期**（随端侧完善，第二批）；**判断口径不变**：**403 仍只由「同参重调 D6」处理**（R42-①④），**不得**把 `onerror` / 非 403 失败接到重调路径上 |
| C21 | **`getSetupErrorMessage` 的 `DATABASE_COLLECTION_NOT_EXIST` 分支不拼接 `rawMessage`** | **v4.11 同批登记（2026-09-24，Jing）**：`apps/web/src/admin/hooks/useDatabase.js` 的 `getSetupErrorMessage`（**L36-42** 集合缺失分支）**不拼接 `rawMessage`**，故当「消息含 requestId ＋ 命中该分支」时会把代理 trace 的 **requestId 一并省掉**（本批新增的 `/requestid/i` 守卫只作用于拼接路径，无法在此分支补回）；**实测该组合现实几乎不可能**（集合缺失与「读回未生效」不是同一场景）。**修法（一行可改）**＝把守卫**收窄为「仅通用分支生效」** | **归属**＝**已列入下一单**（与两条 low 修复同源）；**修复前**：**不得**声称失败提示一律带 requestId |
| C22 | **`apps/app/public/audio/meditation/` 下三个老兜底音频是否删除**（`sea_wave1.mp3` / `sea_wave2.mp3` / `sea_wave_seagull.mp3`） | **v4.11 同批登记（2026-09-24，Jing）**：三文件**均被 git 跟踪**（`apps/app/public/audio/meditation/`；**合计 1,424,439 B ≈ 1.42 MB**＝483,831 ＋ 470,304 ＋ 470,304）、**源码零引用**（`apps/app/src` / `packages` / `apps/web/src` / `apps/miniprogram` 检索该三路径与 `sea_wave` **零命中**）——属**老规则 A 的兜底音**（旧本地兜底音频列表），**已被 D6（R39 契约）＋ R41-⑦「错误可见且不静默回退」取代**（端侧**不得**回退本地兜底音频）。**Zang 已建议删除**，**待用户（Kevin）一句话**。**注**：三文件经 `public/` **原样拷贝进产物**（**文件拷贝、不是字符串引用**）⇒ **删除后重建的产物内不再携带**；当前仅**构建产物**（`apps/app/dist`、`.vercel/output`、`apps/app/android/**/assets` 内的旧 bundle，**均非源码、非跟踪**）残留该三路径字符串，**随下一次重建消失** | **归属**＝**待用户（Kevin）拍板**；**拍板前**：**不得**由实现者自行删除（会改动端侧产物构成，属交付范围裁定）；**拍板后**：删除三文件 ＋ 复核重建产物内零命中（对 `dist` / 产物目录 `grep -r sea_wave`） |
| C23 | **同一 plan 内同一 `section_type` 出现多次时，重签取刷新 playlist 会命中第 1 个实例** | **Neng-22 观察项（2026-09-24，Jing 同批登记；非缺陷）**：R42-⑥ 的写回实现按 `(trackKey, sectionType)` **`find` 首条匹配段**（`MeditationPlayerScreen.jsx` 重签路径：`refreshedPlan.segments.find(candidate => candidate.trackKey === … && String(candidate.sectionType) === String(segment.sectionType))`）⇒ **同一 plan 内若同一 `section_type` 出现多次，第 2 个实例会拿到第 1 个实例的抽签结果**。**当前不可达**：六章固定模板（R10）**每 `section_type` 唯一**，无实例可复现。**不修理由**＝**理论情形、当前不可达**（模板约束保证 `section_type` 唯一；修正需同时改抽签与覆盖表键口径，超出本批范围） | **归属**＝**不修（观察项已登记）**；**重启条件**＝**若模板放开「同一 `section_type` 多实例」**（如允许多章复用同一 `section_type`），本条升级为实现缺陷，须改用实例级键（段 id）重新裁定 |

---

**维护责任**：
- 实现 & 更新：Kong（操作员）
- 前端细节验证（5175 访问）：Neng（质检员）
- 合规审查：Jing（规范员）
- 最终审批：Zang（管理员）

更新日期：2026-09-24（**v4.13**，依据 **Kong 的小程序端侧侦察（含微信官方文档逐条核实）＋ 正本 R41 / R42 / R43 ＋ Zang 的裁定** 回填，**不改任何已裁参数（R33 / R34 / R40 / R41 / R42 / R43 原样）、不改历史版本行、不预写实现状态、不改代码**：**① 新增 R44（小程序端侧接入口径，①~⑬；状态＝「已定口径、待实现」）**＝**数据源只经 D6**（注入 `({ name, data }) => wx.cloud.callFunction({ name, data })`；**不直连 DB 读 `med_*`**、不读老 5 项 `app_settings`、不算老 plan）、**前台双轨不降级**（两个独立 `InnerAudioContext`：背景 `loop = true` ＋ 人声 `sequence`；**官方文档无「同时只允许一个」条款**、**官方问答对「无法叠加播放」给的解法即创建多对象**、小游戏文档仅「**Android 最多同时 10 个**」**远高于 2** ⇒ **不得**因「担心叠加」降为单轨）、**本批只前台**（**5 秒后停 JS 线程**、需后台能力才持续；`BackgroundAudioManager` **全局单例**、**无 `loop`** ⇒ 切后台停播属**平台限制、不得判缺陷**，也**不得**引入 `BackgroundAudioManager`）、**格式只取 mp3**（**ogg 仅 Android、iOS 不支持** ⇒ **mp3 是唯一跨端公共格式**；**无 `canPlayType`**〔属 HTML5〕⇒ **不得**用它作判据）、**恢复策略的小程序例外（Zang 裁定）**＝无 `fetch` / `Blob` 阶段 ⇒ 链接过期与解码失败**都落 `onError`** ⇒ 允许**同参整场重调 `getTrack` 至多 1 次（闸门级，与 R43-⑦ 同形）**、重调后仍 `onError` ⇒ **跳段 ＋ warning ＋ 可见提示**、**不得无限重试**——**条文为 R42-④ 的明文例外**（理由已写清）、**取源＝直设 `ctx.src`**（**零部署前置**；**不做** `wx.downloadFile` 预取〔需下载域名白名单，将来须单独立项并登记部署前置〕；**不得**用 `wx.cloud.downloadFile`——D6 **不下发 `file_id`**，R39-⑤）、**资源释放**（卸载时 **`destroy()` 两个实例**——官方「注意事项」：资源**不自动释放**；否则计内存泄漏）、**iOS 静音模式出声**需 **`wx.setInnerAudioOption`**（`obeyMuteSwitch` **自 2.3.0 起不再由属性控制**）⇒ **真机项未实测**、**音量取响应**（同 R41-②）＋ **计时节流＝按 Track 组装结果**（**Σ 人声实测 ＋ Σ 章间留白**、**弃 900s 固定值**；`MIN_VALID_MEDITATION_SECONDS = 180` 两端不变）、**会话固化先落本地**（`wx.setStorageSync('liwu_meditation_session_v1', …)`；**不写云**〔C18 未裁〕；**不得**自建云集合；与 R41-⑤ 同属「**App 侧尚未落地**」的待补项）、**共享层单一源**（只能经 `npm run miniprogram:sync`，**禁手抄 CJS 副本**）、**时段键 `morning`** 已统一（**不动 `BADGE_SLOT_KEYS`**）、**失败可见**（五类错误码各自可见文案 ＋ `requestId`；空池 / 缺段 ⇒ 跳段 ＋ warning、**不整场失败**；**不得**回退老音频库；**零 fixture 分支**、**桩读数不得当 X21 PASS**）；**② 登记 Step 1（共享层接入）＝已实现（Kong）、待质检确认**（白名单 **8→10**、转换器补 `export class`、门禁 **15→17**；`^export ` **零命中**、`node --check` 通过、**运行时 12/12**、**单一源 10/10 逐字节相等**；小程序写入侧 `dawn`→`morning`；App **读侧**归一〔探针 **19/19** ＋ **负对照 4 FAIL**〕；`BADGE_SLOT_KEYS` **sha256 前后一致**）；**③ 另登记既有脚本缺陷（已修、待质检确认）**＝`scripts/sync-miniprogram-packages.mjs` 原先 **`rm -rf` 整个 `apps/miniprogram/src/utils/shared/`**（该目录住着 **6 个手工维护**的包内工具，且被 `requiredSyncedUtils` 门禁要求存在）⇒ 每次同步**自毁 6 文件**、`build:miniprogram` **直接退 1**；**已修为「只删本脚本自己生成的产物」**（`managedOutputs`）；**④ 时段键收尾**（App 写入侧新值改 `morning` ＋ 小程序边界对齐 App：**0:00–4:59 不再算 `morning`**）＝**已派、待交**；**⑤ 附录 B.5 索引扩为 R1~R44**、**附录 C / C4 补注指向 R44**、**本批未新增附录 A.2 条目与挂账项**（R44 为**新增口径**、Step 1 与脚本缺陷为**已修 / 待交项**，均不构成「旧条款作废」）。**以下为上一版（v4.12）**的回填内容——依据 **Zang 对「后台 Track 预览」口径的 10 条裁定（R43 ①~⑩）＋ Kong 的后台「冥想轨道」tab 侦察结论 ＋ 正本 R9 / R41 / R42 / C4** 回填，**不改任何已裁参数、不预写实现状态、不改代码**：**① 新增 R43（后台 Track 预览口径，①~⑩）**＝数据源**一律经 D6**（**后台也不得直连 DB 组装播放**，延伸 R41-①）、**预览不落盘**（不写 `liwu_meditation_session_v1`、不写云——**C18 未裁**）、**基于已保存版本**且 UI 必须明示「**预览基于已保存版本 vN；未保存改动不生效**」、**每次开预览抽一次 ＋「换一批」显式重抽**（`rng` 可注入、**无固定种子**）、**缺音频分两类并可计数**（**池空** / **池非空但无可用格式**）＋ 段级文案「**{章节名 · section 名} 暂无可播放音频，已跳过该段（继续播放）**」＋ 面板汇总、**绝不整场失败**、**失败态三态分开**（**函数未部署 / 调用失败** ≠ **`TRACK_NOT_FOUND`** ≠ **`TRACK_DISABLED`**；带 `requestId` ＋「重试」；**未部署不得显示为「无数据」或「Track 不存在」**、文案**不得**声称「无权限」）、**后台恢复策略简化**（403 ⇒ **同参整场重调 `getTrack` 至多 1 次（闸门级）**、**不做段级覆盖表**，并明写**不得依赖 R42-⑥**）、**时长两把尺子并存**（现有面板估算 ＋ 并列「**实测预览总时长＝Σ 人声段实测 ＋ Σ 章间留白（背景不计入）**」，并标注 15:00 软基准与 910s 章上限之和**不是同一把尺子**）、**UI 显示实际音量取值并标明「响应值 / 回退常量」**、**R41-⑧ 零 fixture 纪律适用于后台预览**（桩只打测试侧、**产品代码不得留 DEV 开关 / 桩分支**、**桩读数不得当 X20 验收 PASS**）；**② 实现约束**（`apps/web/src/admin/services/cloudbase.js` **新增 2 行**接入 D6 客户端；两个共享模块**原样复用、后台不另写一份**；**新建独立组件、不塞进 4598 行单文件**；**不得改造老预览器**；最小插入点＝`:2990` 保存按钮之后；**未部署时＝明确错误态**）；**③ 状态词＝「已定口径、待实现」**（**不得预写「已实现」**）；**④ `resolveMeditationUrlPolicyStaleness` 消费方注记更新**（当前消费方＝App 播放器；**后台预览（R43）实现后为其第二消费方**，**不得**写成已双端生效）；**⑤ R9 口径缺口已补**（B.5 / R9 行与 §3.7 **两处标「功能口径见 R43（v4.12）」**）；**⑥ 附录 C / C4 补注**（「预览口径已定＝R43（v4.12）；实现待 R9 S1」）；**⑦ 附录 B.5 索引扩为 R1~R43**）。以下为**上一版（v4.11）**的回填内容——依据 **Neng-20 真实验（X17 结案 PASS）＋ 两条 low 缺陷修复与范围边界 ＋ R42（端侧恢复路径与格式降级口径，①~⑥）＋ 新增挂账 C19~C21 ＋ 附录 B.5 索引扩为 R1~R42** 回填，**不改任何已裁参数、不新增 D-B2 编号**：**① R40-⑤ 状态升为「已实现（Kong）、质检 PASS（Neng-20，2026-09-24）」**（例外条件经实测成立＝属主不误报、非属主可见失败：逐字文案「冥想文库保存失败：未能确认写入生效（未检测到任何变化）（requestId: 2c26a5bfd807a8）」、`[role=dialog]=0`、不含「无权限」、4 个 `app_settings` 文档 `_id` / body sha256 / `updated_at` 前后逐项未变、属主静态 8/8 载荷必含易变字段、动态两例 `updated:1` ⇒ 读回比对之前即返回〔仅 1 条 POST、零读回 GET〕、刷新 `version` 4→5、`deleted:1`、`med_tracks` 回 0 条）；**② 两条 low 缺陷修复 ＋ 范围边界**（`apps/web/src/admin/hooks/useDatabase.js` 的 `getSetupErrorMessage` 新增 `/requestid/i` 守卫 ⇒ 失败提示不再重复追加 requestId；`MeditationPage.jsx` 的 `MeditationPresetsTab` 改为 tab 级 `try/catch` ＋ `writeError` state ＋ `[role=alert]` 内联提示 ⇒ 消除未捕获 Promise 拒绝；**同文件另有 8 处裸 `await onUpdate`〔音频库 / 冥想设置 / 冥想日历〕本批未动 ＝ 范围边界，不得当遗漏缺陷重报**）；**③ 新增 R42（端侧恢复路径与格式降级口径，①~⑥）**＝链接失效恢复＝**同参重调 D6**（不依赖 `file_id`、不走 `getSectionAudios`）；**三层重入防护**（段级 Set / 闸门级 / 基准级）；**陈旧判定＝以收到响应的本地时刻起算 ＋ `max_age_seconds / 2`（缺省 3600s），刻意不用绝对时钟与 `issued_at` / `expires_at` 直接比较**；**`onerror` 与链接过期解耦**（`fetch` → `Blob` → `objectURL` ⇒ 过期只表现为 **403**）⇒ **`onerror` 只降级、不重调**；**降级与跳段**（每段按 `formats[]` 顺序多条、段内全失败 ⇒ 跳段 ＋ warning ＋ 可见提示、**背景轨继续、不整场失败**）；**⑥ 重签只刷新当前段 playlist、不替换整场时间轴 ＝ 设计口径 —— Neng-21 实测尚未真正生效**（覆盖表 `segmentPlaylistOverrideRef` **从未被写入**：全文件仅 L228 声明 / L237 唯一读取 / L721 clear，**无 `.set(...)`** ⇒ 段内回落旧签 URL ⇒ 403 ⇒ **误报跳段并清空该段音频**）＝**中型缺陷、修复单已派、待复验**；**`resolveMeditationUrlPolicyStaleness` 为共享层定义、当前唯一消费方是 App 播放器**（不得写成已双端生效）；**④ 端侧状态词按 R22 分面**（两个共享模块＝**质检 PASS（Neng-19，桩面：独立 50/50 ＋ 反向反证 10/10）**；App 接入 **B1＝质检 PASS（Neng-19，桩面与静态）**；**B2a＝已实现（Kong），复验未全过（Neng-21：1 条中型 ＋ 1 条低「dist 产物落后」），修复单已派、待复验**；**真实 D6 往返与真机项（iOS WKWebView 音量、小程序 iOS 直取 mp3）＝未实测**）；**⑤ 新增挂账 C19（背景轨是否按章切换，待用户拍板）/ C20（非 403 取源失败是否补「原样重试一次」，待排期）/ C21（`getSetupErrorMessage` 集合缺失分支不拼接 `rawMessage`，一行可修、已列入下一单）**；**⑥ 附录 C / C2 补注**。以下为**上一版（v4.10）**的回填内容——依据 **R41（端侧双轨播放接入口径，12 条已定裁决；依据＝Kong 侦察 ＋ Zang 裁定）＋ 新增挂账 C17 / C18 ＋ 附录 A.2 / A40 ＋ B.5 索引扩为 R1~R41**，**不改任何已裁参数、不新增 D-B2 编号**：**新增 R41（R41-①~⑫）**＝数据源一律经 **D6（R39 契约）**、**端侧永不直连 DB 读 `med_*`**、不读老 5 项 `app_settings`、不算老 plan（D9）；播放模型（背景 `loop` / 人声 `sequence`）与**音量取自响应**（`background_track.volume` / `voice_track.volume`，现 0.33 / 1；**缺省才回退常量、常量非权威源、绝不覆盖响应值**）；留白只在章间且**末『有可用段的』章恒 0**；段时长取**响应实测值**、**端侧计时按 Track 组装结果**（不沿用固定 15 分钟）、`MIN_VALID_MEDITATION_SECONDS = 180` 两端不变；抽签在端侧（`rng` 可注入）＋ 固化载荷与**本地 storage 落点 `liwu_meditation_session_v1`**（云侧写入另裁＝C18）；App `opus → mp3` ＋ `onerror` 降级、小程序直取 mp3；**失败可见且不静默回退**（五个错误码显式 ＋ `requestId`；空池 / 缺段跳段 ＋ warning、不整场失败）；**端侧零 fixture 分支**、桩打测试侧、**桩结论不得当验收 PASS**；小程序**本批只支持前台播放**；**不做渐变**；**iOS App 音量未验**须真机实测（FAIL ⇒ 挂账另立项、**不得判 X12 整体 FAIL**）；冻结边界（老四 tab ＋ `meditation-session-plan.js` 不得删改）与时段键 `dawn` → `morning`（含 `point_ledger.activity_slot` 历史值口径说明）；**新增挂账 C17 / C18**、**新增 A40**；**上一版 v4.9** 依据 **R40（`updated` 语义与写入成功判据，含 **D-B2-14** 改写；依据＝Neng-17 真实验 ＋ Zang 裁定）＋ §F 两条更正 ＋ 附录 A.2 / **A39**（＋ A36 依据改写）** 回填，**不改任何已裁参数、不新增挂账 / D-B2 编号**：**新增 R40（R40-①~⑧）**＝`updated` 计「内容真正发生变化的文档数」、`updated:0` **三义同形**（值本来相同 ／ **无权写静默** ／ 文档不存在）、含**对象数组**载荷上 `updated` **非确定**、**反向纪律保留 ＋ 依据改写（D-B2-14 结论对、依据错）**、**有条件例外（仅 8 处**：四个老口径 writer ＋ 四个 `med_*` updater；`updated < 1` 且无 `code` ⇒ **一次性读回比对**，**文案不得声称无权限**，**读回失败抛独立文案**）、强信号依据 **8/8 恒为 `1`**、**`app_settings` 两条更正**（非属主 update 既有文档＝静默 `{updated:0}`、非属主 `add`＝成功；**旧「显式拒绝」表述作废**）；**新增 A39**、**A36 依据同步改写**。**上一版 v4.8** 依据 **R39（D6 读契约）＋ 本批质检结论（Neng-16）＋ 两条现状登记** 回填，**不改任何已裁参数**：**新增 R39＝D6 只读云函数读契约**——把实现方 **12 条假设升格为口径**（函数 `cloudfunctions/meditation-read/`，`cloudbaserc.json` 已登记 **30s / 128MB / Nodejs18.15 / 无触发器**；**action 集 3 个**＝`getTrack`（**缺省**；定位顺序 `track_id`→`track_key`→`is_default`→`track-default`）/ `getSectionAudios`（必填 `section_types` 或 `section_type`）/ `listTracks`（只列 `enabled !== false`，**不签发链接、不读音频集合**）；**未知 / 非字符串 action ⇒ `INVALID_ACTION`**；成功 `{ok:true,data,meta}`、失败 `{ok:false,error,message,details?}`（至少含 `READ_FAILED` / `INVALID_ACTION` / `TRACK_NOT_FOUND` / `TRACK_DISABLED`）；**CloudBase 以 resolve 返回 `{code,message}`（含权限静默空集）一律当错抛、收敛 `READ_FAILED`**——**不把「没报错」当「读到了」、不返回部分数据当成功**；**可下发＝`transcoded_formats` 同时含 opus 与 mp3 且 file_id 齐备**、`transcode_status ∈ {queued, processing, failed}` **一律不下发**、**`idle` / 空状态但齐备的历史文档仍下发**、不可下发项按 `stats.excluded` 五类（`incomplete_transcode` / `transcode_failed` / `transcode_in_progress` / `missing_file_id` / `signing_failed`）**逐条计数不静默丢弃**；**临时 URL 现签**＝唯一对外调用 `getTempFileURL`、去重后**一次批量签发** `maxAge = 7200`（对齐 C11）、**绝不透传落库 `audio_url`**、`url_policy = {max_age_seconds, issued_at, expires_at, reissue:'call_again'}`、**长期标识只有 `file_id` 但响应不下发 `file_id`**、部分签发失败该条剔除并计数（**半条音频不得下发**）、**全部失败整单 `READ_FAILED`**；**15 项字段不得下发**（`file_id` / `fallback_file_id` / `mp3_file_id` / `audio_url` / `fallback_audio_url` / `mp3_url` / `recorded_by` / `text_snapshot` / `paragraph_ids_snapshot` / `original_file_id` / `transcode_error` / `created_by` / `updated_by` / `char_count` / `stale`）；Track **折回六章固定模板**（`chapters` 恒 6、末章 gap 恒 0，对齐 R10）、`getTrack` **只下发启用章覆盖的 `section_type`**、`getSectionAudios` **不查 Track 启用态**（定向取 / 重签接口）；**不抽签、不写会话**（抽签在端侧、固化写端侧会话记录，D7 / D9）、唯一口径源 `med_section_audios`（**不读 `med_section_raws` 的 `file_id`/`audio_url`**，D8）；**上限**＝单 `section_type` 查询 **50** / 下发 **10**、`listTracks` **20**（截断在 `stats.truncated_section_types` 如实回报）；**不做端侧身份校验＝现为口径、非疏漏**（收紧到「仅登录用户」**须另裁**，**并入 C15 / X9**）；**端侧缓存 ≤ `max_age_seconds` 的一半（≈1 小时）或按 `url_policy.expires_at` 判陈旧**、过期 / `onerror` **同参重调本函数**；部署前提＝**SCF 内置凭证**（不硬编码密钥）＋ `lib/*.js` 为权威源**精简等价副本**（对齐 D-B2-8）、本地无 Track 文档时 `TRACK_NOT_FOUND` **属预期**（`med_tracks` 已建、**C7 已关闭**，**不得再写「未创建 / 标阻塞」**）；**状态词（R22）＝「已实现（Kong）、待质检确认」**，**Zang 独立复核**＝自测 **124/124 PASS**、零写路径静态 grep **零命中**、`npx eslint cloudfunctions/meditation-read` **0 problem**、共 **1219 行**、只依赖 `@cloudbase/node-sdk` ＋ `./lib/*`）；**R38-① 质检结论登记为 PASS（Neng-16，2026-09-24）**（真实 CloudBase 往返、带 requestId：删不存在 id ⇒ `{deleted:0, requestId:71e425366701d8}` **抛错**；自建文档 ⇒ `{deleted:1, requestId:a884e06fd4c59}` 成功且复读 `data:[]`、再删复抛同文案；**反向反证**＝`updateMedTrack` 在 `{updated:0, upsertedId:null, requestId:81420156b9f2b8}` 下**不抛**；静态 **15/15 处置分类全对**；`med_tracks` 清理回 **0** 条 ⇒ 状态词改为「**已实现（Kong）、质检 PASS（Neng-16，2026-09-24）**」）；**四个老口径 writer 现状登记**（**静态 8/8 断言存在且行号已核**：L5183/L5190、L5249/L5256、L5315/L5322、L5381/L5388，集合缺失另抛 L5172/L5238/L5304/L5370；**动态只完成 1 条（冥想库）且受阻于 R28 权限模型**：非属主身份 `{updated:0, upsertedId:null, requestId:3b734af94bab9}`、断言不抛、页面零提示、4 个文档 body sha256 与 `updated_at` 一字未变 ⇒ 状态词＝「**静态 PASS、动态复验待按 R40 执行（判据已定）**」，**不得**写成通过、也**不得**写成实现缺陷）；**新增挂账 C16**（`cloudfunctions/getHomePageData` **有目录但未登记进 `cloudbaserc.json`**，既有差异、待裁定）；附录 A.2 / **A38**、附录 B.5 / **R39**、附录 C / **C2 补注 ＋ C16**。**v4.7 依据（承接，历史记录）**：**v4.7**，依据 **v4.6 后的准确性回填（R37~R38）** 回填：**样本实际时长口径更正**（两个真实 `MediaRecorder` 样本**实际 ≈61.2s**、不是名义 60s，`ffprobe` 实测 **61.2035s / 61.200s**；300s 样本**精确 300.0s**；**复核体积 / 码率前必须先测输入实际时长**，用名义 60s 反推得 **≈49.6kbps 的假偏差、不得据此判失败**，附录 A.2 / **A35**）；**`med_tracks` 口径矛盾清除**（集合**已建**：`res.code` 无 `code` / `message` ＋ `med_section_raws` 正对照同形 ＋ `add` 成功 ＋ **两轮端到端写入 / 读回 / 删除成功**，R7 g/h 数据层与 UI 层均通过，测试文档已删 ⇒ **附录 C / C7 关闭**、旧「未创建 ⇒ 标阻塞」口径作废（附录 A.2 / **A34**）、**当前无阻塞项**）；**第一批 UI 点击路径验收结果**（Track 配置：空态「初始化默认 Track」→ 六章模板 300/30/130/150/270/30、留白 141×5、末章无留白输入、章序不可操作、估算自洽 →「保存 Track」→ `version` 1→2、`chapters=6`、刷新保持、二次保存同 `_id` 且 `version` 2→3）＋ **术语澄清**（`total_target_seconds=900` 是**软基准**；UI「内容 15:10」＝**章时长上限之和 910s**——**不是同一把尺子**）；**新增缺陷＝删除路径静默假成功**（`remove()` 返回 **`{"deleted":0}`** 被旧断言放过 ⇒ `deleteMedTrack` 报成功而实际未删；处置＝**删除影响条数断言（`deleted=0` 必须报错）** ＋ **全库扫全部 `.remove()` 调用点（实测 `database.js` 共 15 处）**；状态＝**已实现（Kong）、待质检确认**；**反向纪律**＝**update 不得用 `updated>=1` 作成功条件**，附录 A.2 / **A36**）；**dev 环境真实事实**（`/api/cloudbase-proxy` → `scripts/dev-cloudbase-proxy.mjs`（:3020）→ **真实 CloudBase `liwu-d8gek6jjdab1d087c`**；**`CLOUDBASE_ADMIN_API_KEY` 实测未配置** ⇒ 写入以**调用者匿名 `_openid`** 落真实云端；**换 profile 既看不见也删不掉前几轮 dev 数据**；待办＝只读盘点（服务端凭据）＋ **删除须人工确认清单后执行**）；**新增挂账 C14 / C15**（预估口径 / dev 身份与环境治理，均待用户拍板；队列权威键缺省**仍在 C13 保持**）；B.5 索引扩为 **R1~R38**；**v4.6 依据（承接，历史记录）**：依据 **Kevin（用户）直接裁定的转码参数改定（R34）＋ 本批代码查实（R35 / R36）** 回填：**转码参数改定为 48k 立体声硬 CBR**＝Opus 主体 `.ogg` ＋ `-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000`、mp3 兜底 `-c:a libmp3lame -b:a 48k -ac 2 -ar 44100`（**`-ac 1` 单声道作废，附录 A.2 / A33**），**实测**＝60s → ogg **372181B / 48.65kbps / 2 声道**、mp3 **367639B / 48.06kbps**；300s → **1823385B / 1800507B**；单次双路 **325ms / 1627ms**（`ffprobe` 对 `.ogg` 的 `stream.bit_rate` 为 `N/A`，以 `format.bit_rate` 为准）；**代价**＝旧 32k 单声道 ogg 60s 243.9KB → 新 48k 立体声 ≈24kbps/声道（体积 +49%）、mp3 体积不变；**X15 改口径**＝**48k 立体声的听感验收（用户所有，未听测前不得写成已验证）**；**新增「转码执行器实现与队列分区（R35）」小节**（队列分区＝新执行器只领 `transcode_profile='section_audio'`、老 worker 跳过、**上线前先停 `audio:transcode-worker:loop`**；字段权威＝`attempts`/`transcode_error`，`attempt_count`/`error_message` 为过渡镜像；worker L28 已更新为 48k 立体声，L295 `output.opus` 未改）与**新增挂账 C10~C13**；**新增「R36 后台质检入口现状」小节**（代码内**无** `?dev_login=1` 入口、门禁＝`liwu_auth_session`＋管理员标签、OTP 未接线且为 mock `'1234'`、超管手机号 `16601061656`；**未回填可复现配方前 UI 类验收一律标「环境不可达」**）；B.5 索引扩为 **R1~R36**；**v4.5 依据（承接，历史记录）**：依据 Kong 用本机 ffmpeg 8.1.1 ＋ 真跑 `MediaRecorder` 采集的 webm 样本所做的转码实测（**R33**）回填：**转码参数定稿**＝Opus 主体 `libopus -b:a 32k -vbr off -ac 1 -ar 48000` → `.ogg`（**硬 CBR**，VBR 下实测漂到 1.71x）、mp3 兜底 `libmp3lame -b:a 48k -ac 1 -ar 44100`（**`46k` 作废，附录 A.2 / A32**），**单次 ffmpeg 调用双路输出**；**remux（`-c:a copy -f ogg`）逐样本零差异但 0.998x 不降体积 ⇒ 只作最高保真 / 比对的备选**；**SCF 建议 256MB / 单次超时 60s**（3.29–3.5 ms/音频秒、峰值内存 ≤15MB，瓶颈在 COS 上下行与冷启动）；**实现硬约束**＝原件 `duration=N/A`（时长只取客户端实测或转码产物）、**不得假设单声道**；**静态 ffmpeg linux x64 不入仓（`.gitignore`）**；**32k CBR 对真人语音的可听化程度列为「待确认」**（附录 B.3 / T4）；新增 §「**转码参数定稿与实现约束（R33）**」，B.5 索引扩为 **R1~R33**）；**v4.4 依据（承接）**：新增「**环境与权限（实测结论）**」节（`med_*` 仅创建者可读写／非创建者读写**静默**、`app_settings` 可读但非创建者写**显式被拒**、`dev_login` **换 profile 即换身份**）并**作废**「每轮开工 0/0/0＝外部清库 / 并发写者」的旧假设（附录 A.2 / A29）；R16 权限收紧升级为「**成套动作 + 前置依赖**」并登记三方案**待人工拍板**（附录 B.7，方案 1 推荐）；**D6 只读云函数升为第二批硬前置**且第二批顺序修正为「转码执行器 → D6 → 端侧双轨播放（先 App、后小程序）→ D10」（§7 / 附录 A.2 / A31）；三条质检纪律落质检计划 §0.1；别名入口文件子模块清单更新为 7 项（R32）；新登记挂账 **C9**；附录 B 新增 B.7 / B.8，B.5 索引扩为 R1~R32）；**v4.7 复核补注（2026-09-24，Jing；本批为 v4.7 后的小修正，不新增版本号、不改任何已裁参数）**：**① R38-① 改以行号级口径**（`assertCloudBaseDeleteResult` **`database.js:425`** / `removeDocBestEffort` **`:452`** / 反向纪律注释 **`:387-392`**；15 处 `.remove()`＝11 处直接严格断言 ＋ 4 处 `removeDocBestEffort`；级联 5 处带 `allowZero`；复核＝桩测 **27 PASS / 0 FAIL** ＋ lint **127 problems、未上升**）；**② 新增裁定 D-B2-16（R38-④）**＝后台自动修复（reconcile）路径的删除**保持「不抛出」**（断言照接、失败降级为显式 `console.error`；用户点击触发的删除一律严格断言；未达「自动修复也硬失败」需求时须另立裁定；附录 A.2 / **A37**）；**③ R36 扩为 ①~⑦**＝**入台配方已实测复现并回填正文**（反节流三参 → `/partner` 不加参数 → **轮询 `/uid=102/` 为真 ≈t+15s** → 「切换身份」→「管理员」卡 → nav「冥想」→「冥想轨道」），**「环境不可达」纪律放宽**为「未按配方所得 ⇒ 标**环境伪失败（采样过早）**并重跑，不得标 PASS/FAIL」；**④ 修正两处**：`deleteMedTrack`＝**保留的服务 API、当前无 UI 入口**（不得当死代码删除）；删除失败 UI **唯一落点＝`apps/web/src/admin/components/Dashboard/MeditationPage.jsx:3545`**（旧写 `admin/pages/…` 为**笔误**）。**另：旧读造成的「删除断言未落地 ⇒ 应退回待实现」的结论作废**（该修复已落地，行号见上）。**D1 结案补注（2026-09-24，Jing）**：**Neng-22 复验＝PASS（桩面）**——**桩面 36/36 ＋ 三个变异体红对照**（`no_writeback`〔**回退修复前形态**〕**6 条 FAIL 且逐字复现 D1 后果**、`wrong_key` **6 条 FAIL**、`empty_set`〔**delete 改写空数组**〕**仅卫生性断言失败、行为断言全过** ⇒ 登记「**delete 与写空数组行为等价，delete 属消中间态的卫生改进、非承重逻辑**〔不需为它返工〕」）；其它读数＝段内再入末条取源＝**新签 `mp3?sig=v2`**、**无 `SEGMENT_SKIPPED`**、同段仍只重调 **1** 次（载荷逐字相同）、覆盖表**恰 1 条 `voice:sec-alpha-1`**、**下一段仍用旧签**（只覆盖当前段）；反向「重签后无可交付音频」**不留「有键但空」**且**只有真不可交付才跳段**；静态＝写入点 `set` / `delete` **各恰 1 处**、键构造函数**全仓唯一**、`reissuedSegmentKeysRef` 的 has/add/clear **各恰 1 处且 add 在 await 前（未放宽）**、**只覆盖当前段、未动时间轴**；**`dist` 逐字节复核**＝以当前源码重建得**同名同字节** `index-Dq9F4L05.js`（sha256 `534467762f41bde129bd09043715f8076056cbf639bf7128d212d2570a4d6360`）⇒ **产物确由含修复的源码构建**、冥想相关 `fileId` **零命中**；**状态词同步**：**B2a＝已实现（Kong）、质检 PASS（Neng-22，2026-09-24，桩面）**、**X19＝桩面 PASS、真链路待部署**（**整体 PASS 仍不可判**）；**行数口径更正**＝`meditation-read-client.js` **458** 行 / `meditation-track-playback-plan.js` **459** 行（实测 `wc -l`）；**新增 C23**（Neng-22 观察项：同一 `section_type` 多实例时 `find` 取首条 ⇒ 理论情形、当前不可达、不修）；**R41-⑤ 本地固化缺口登记为待补**（App 侧本地 storage 未落地；云侧仍按 C18 未裁）。
参考代码：**`cloudfunctions/meditation-read/`（`index.js` ＋ `lib/read-contract.js` / `lib/meditation-formats.js` / `lib/meditation-track-template.js` / `lib/meditation-track-normalizers.js`；**D6 只读云函数的读契约承载（R39 ①~⑫）**，已登记 `cloudbaserc.json`：**timeout 30 / memorySize 128 / Nodejs18.15 / 无定时触发器**）、`cloudfunctions/meditation-transcoder/index.js`（＋ `lib/transcode-command.js` / `lib/transcode-state.js` / `lib/meditation-formats.js`；R34 参数与 R35 队列分区的实现承载）**、**`apps/web/src/admin/utils/meditationAudioCapture.js`**、**`packages/shared-utils/meditation-section-audio.js`**、`apps/web/src/admin/components/Dashboard/MeditationPage.jsx`、`MeditationSettings.jsx`、`useDatabase.js`、`apps/web/src/admin/services/database.js`、`packages/shared-utils/meditation-session-plan.js`、`packages/shared-utils/meditation-audio-library.js`、`packages/shared-utils/meditation-database-normalizers.js`、**`packages/shared-utils/meditation-track-template.js`**、**`packages/shared-utils/meditation-track-normalizers.js`**、**`packages/shared-utils/meditation-section-audio.js`**、`apps/app/src/modules/meditate/MeditationPlayerScreen.jsx`、`apps/miniprogram/src/utils/meditation.js`、**`scripts/audio-transcode-worker.mjs`**（转码参数**已随 R34 / R35-③ 更新为 48k 立体声硬 CBR，见 L28**；L295 `output.opus` 未改，见挂账 C12）、**`apps/miniprogram/src/pages/meditation/index.js`**（**小程序冥想页，150 行、当前零音频**——R44 的实现落点）、**`apps/miniprogram/src/utils/meditation.js`**（小程序侧 `MIN_VALID_MEDITATION_SECONDS = 180`（**:6**）、结算 `recordMeditationCompletion`（**:94-130**、门禁 **:101**）、时段键 `morning`（**:19-40**）；R41-④ / R44-⑨⑫ 的承载）、**`apps/miniprogram/src/utils/shared/`**（同步产物目录：脚本生成 11 项 ＋ **6 个手工维护**的包内工具）、**`scripts/sync-miniprogram-packages.mjs`**（**共享层单一源同步**〔R44-⑪〕：`esmSources` **10 项**、转换器支持 `export const` / `export function` / **`export class`**；清理范围＝`managedOutputs`——旧 `rm -rf` 整目录会自毁 6 个手工维护工具并令 `build:miniprogram` 退 1）、**`scripts/build-miniprogram.mjs`**（构建门禁：`requiredSyncedUtils` **17 项**（**:12-30**），`build:miniprogram` 先跑 `miniprogram:sync`）
