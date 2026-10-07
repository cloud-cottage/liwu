# meditation-transcoder（冥想音频转码执行器 · 腾讯云函数）

第二批第 ① 项（规范 §7 / C6 / X13）。把 `audio_transcode_jobs` 里 `status='queued'`
的任务领走，用**一次 ffmpeg 调用**同时产出 Opus 主体（`.ogg`）与 mp3 兜底（`.mp3`），
上传云存储后回写 `med_section_audios` 的规范字段。

- 迁移来源（方案 B 既有实现）：`scripts/audio-transcode-worker.mjs`（队列领取、CloudBase 调用、
  错误码风格、凭证环境变量回退链均沿用；差别见 `index.js` 头部注释）。
- 参数口径（**不得自行调整**）：**Kevin（用户）2026-09-24 裁定「48k 立体声硬 CBR」**（覆盖此前
  R33 的 32k 单声道口径）——Opus `-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000`（`.ogg`）、
  mp3 `-c:a libmp3lame -b:a 48k -ac 2 -ar 44100`（`.mp3`）；`-vbr off` 必须保留（48k VBR 实测漂到
  ≈73kbps，预算不可控），**不下混单声道**。实现在 `lib/transcode-command.js`。

## 1. 触发与领取（D-B2-1 / D-B2-9）

- 定时触发器**每分钟**一次：`0 * * * * * *`（7 段 cron，与 `cloudbaserc.json` 中现有触发器等长）。
- 单次最多领 **3** 条（`lib/transcode-state.js` 的 `MAX_JOBS_PER_RUN`），可用事件参数覆盖：
  `{"limit": 1}`（上限仍为 3）。
- **队列分区（D-B2-9，强制）**：领取查询条件写死
  `where({ status: 'queued', transcode_profile: 'section_audio' })`——过滤**进查询**、
  **不是先领后筛**；乐观锁的 `where` 条件同样带 `transcode_profile`。
  老 profile（`default` / `nature` / `tts_simple`）的 job 一律**不碰**，
  由 `scripts/audio-transcode-worker.mjs` 消费；该 worker 侧也加了「跳过 `section_audio`」的守卫。
  - job 缺 **`section_audio_id`** 属**永久性结构错误**：领取后立即终结（`status='failed'`，
    不退回 `queued`、不空耗 3 轮重试），处理方式同 `MISSING_SOURCE_FILE`。
- **乐观锁**：`where({ _id, status: 'queued', transcode_profile: 'section_audio' }).update({ status: 'processing' })`，
  返回 `updated === 0` 即被别的实例/上一轮领走 ⇒ 跳过，不重做。
- 函数配置：**内存 512MB / 超时 300s**（本单把内存由 256MB 提到 **512MB** —— 音视频解码 +
  混音 / 双路输出时 ffmpeg 驻留内存更高；R33-⑥ 的 CPU 估算 3.29–3.5 ms/音频秒、每轮 3 条约 3–4s 不变）。
  同值登记在仓库根 `cloudbaserc.json`，并由 `scripts/deploy-meditation-functions.sh` 的
  `assert_cfg meditation-transcoder memorySize 512` 拦住配置漂移（**不得绕过**）。

### 1.1 上线纪律（**强制**，停老 worker 再上新执行器）

> 同一时刻**只允许一侧消费** `audio_transcode_jobs`。分区虽已落地（新执行器只领 `section_audio`、
> 老 worker 跳过 `section_audio`），但两侧对同一文档的字段口径/写入路径不一致（老 worker 回写
> `app_settings.meditation_audio_library.items[]`，本执行器回写 `med_section_audios`），
> 并行运行会互相抢状态。

上线顺序：

1. 先停老 worker：结束 `npm run audio:transcode-worker:loop`（及任何 `audio:transcode-worker` 手动实例）。
2. 确认没有残留进程：`pgrep -fl audio-transcode-worker` 为空。
3. 再部署/启用本云函数（步骤见 §6），部署后用 `cloudbase functions:invoke` 手动跑一轮核对。
4. 回滚方向相反：先停云函数定时触发器，再恢复 `audio:transcode-worker:loop`。

## 2. 状态机 / 幂等 / 重试（D-B2-2 / D-B2-3）

| 状态 | 落点 | 说明 |
|---|---|---|
| `queued` | `audio_transcode_jobs.status`、`med_section_audios.transcode_status` | 排队；只领这个状态 |
| `processing` | 同上 | 领取即置位（乐观锁条件更新） |
| `succeeded` | 同上 | 双格式齐备的终结态 |
| `failed` | 同上 | `attempt_count >= 3` 或永久性错误（如二进制缺失 / 目标文档不存在） |

- **幂等**：`succeeded` / `failed` 的 job 不再领取；`transcoded_formats` 回写一律
  「先 resolve 现值 → 合并去重 → 规范顺序」⇒ 重复执行不产生重复条目。
- **重试**：`attempts`（权威）在**领取时 +1**（沿用 worker 口径：= 已执行次数），
  失败且次数 `< 3` 时 job 退回 `queued`（下个 tick 重试），`>= 3` 置 `failed` 并写
  `transcode_error`（`med_section_audios` 同步写 `transcode_status='failed'` + `transcode_error`）。
- 单条失败**不中断整批**：每条 job 独立 try/catch，结果逐条回传（`results[]`）。

### 2.1 字段权威 / 镜像口径（D-B2-10，过渡期）

`audio_transcode_jobs` 文档上：

| 权威字段（**以此为准**） | 过渡期镜像（兼容老 worker 读取） |
|---|---|
| `attempts` | `attempt_count` |
| `transcode_error` | `error_message` |

- 读：权威键优先（`attempts ?? attempt_count`）；写：**两键同写同值**（领取 / 成功 / 失败三处
  patch 均如此，`lib/transcode-state.js#buildClaimPatch` / `#buildJobSuccessPatch` / `#buildJobFailurePatch`）。
- 领取时两键**一起清空**（只清镜像会让权威字段留着上一轮的旧错误）。
- **待老 worker 退役后收敛为单一口径**（job 文档只留 `attempts` / `transcode_error`）。
  本批保留镜像的唯一原因是老 worker `scripts/audio-transcode-worker.mjs` 仍在读
  `attempt_count` / `error_message`。

### 2.2 失败文案口径（D-3，可诊断性）

失败时写入 job 的 `transcode_error` / `error_message` **与** `med_section_audios.transcode_error`
的是**同一段文案**（都由 `lib/transcode-state.js#normalizeErrorMessage` 产出）。口径：

- **命令原文不进文案**：只保留「可执行文件 + 输入/输出文件名 + 关键编码参数」摘要，并附「完整命令见执行日志」
  （`index.js` 在 `job_failed` 事件里 `logEvent` 了 `error.message` ＝ `Command failed: <完整命令>\n<stderr>`）。
  旧实现在 `error.message` 上再拼 stderr，命令原文已占满预算 ⇒ **真正原因行被截掉**（本单修复的缺陷）。
- **stderr 先剔 banner 再取尾部**：逐行剔除 `ffmpeg version …` / `built with …` / `configuration: …`
  （含折行续行）与 `libav*` 组件版本行（这些对定位无用），再取**最后 `ERROR_STDERR_TAIL_MAX_LENGTH` 字**
  （ffmpeg 的原因行在末尾）。
- **结构**：`<一句原因摘要>` ＋ `\n--- stderr 尾部 ---\n<尾部文本>`；**尾部优先保留**，摘要按剩余预算截断。
- **上限**：`ERROR_MESSAGE_MAX_LENGTH`＝**1200**（本单由 500 提高，故在此登记）；`ERROR_STDERR_TAIL_MAX_LENGTH`＝800。
  两个常量与实现同在 `lib/transcode-state.js`，供自测/规范核对。
- 非命令类失败（永久性结构错误 / 下载 / 回写失败）其 `message` 本就是一句可定位的原因，原样保留。

### 2.3 输入完整性防护（下载后校验 ＋ 重下）＋ 失败分层重试预算 ＋ 输入体积登记（本单新增）

背景（实测）：批量上传后偶发 ffmpeg 报 `moov atom not found` / `Invalid data found when processing
input`（输入容器不完整）；但**同一对象重新排队 1 次即成功**，且客户端上传链路已实证逐字节完整、
云侧处理是串行的 ⇒ 结论：对象本身是好的，**瞬时时段内下载 / 环境异常取到了不完整输入**。用防御纵深吸收，
不靠猜：

**① 下载后完整性校验（`index.js#downloadFileWithIntegrity`）**：`app.downloadFile` 之后**验证本地文件与对象一致**：
- 体积判据：优先 `getTempFileURL` 元数据（`size`）→ 否则对临时 URL 发 `HEAD` 取 `content-length`；
- 可解析判据：两者均不可得时，退回 ffprobe 能否解析（`assertInputProbeable`，复用既有 `buildProbeArgs`，
  **编码参数一字未动**）；
- 不一致 / 不可解析 ⇒ **重下（上限 `DOWNLOAD_MAX_REDOWNLOADS`＝2 次、短退避 250ms×n）**；仍不行按类别抛错：
  对象被截断 ⇒ 永久「输入完整性」类（`INPUT_MEDIA_INVALID` / `INPUT_SIZE_MISMATCH`，1 次即终态）；
  下载本身失败 ⇒ 「瞬时」类（`INPUT_DOWNLOAD_FAILED`）。
- 无头 webm（MediaRecorder 原件 `duration=N/A`）探测**成功** ⇒ 照常放行（不得把「无时长头」误判为不完整）。
- `section_audio` 与 `track_mix` 两个分区的**每个输入**（人声各段 ＋ 背景）都走此校验。

**② 失败分层与重试预算（`lib/transcode-state.js`）**：不改「达到上限 ⇒ 终态 `failed`」的总语义，只改预算与分类。
`resolveFailureClass` 分三类（错误对象可显式带 `failure_class`；`permanent===true` ⇒ permanent；其余＝ encoding 默认类）：

| 类别 | 触发 | 重试预算 | 退避 |
|---|---|---|---|
| `permanent`（输入完整性 / 结构性） | 对象被截断、缺必需字段、二进制缺失 | **1**（立即终态） | — |
| `transient`（下载 / 网络） | `INPUT_DOWNLOAD_FAILED` 等 | **6** | 指数（60s×2^(n-1)，封顶 900s） |
| `encoding`（转码 / 编码，默认） | ffmpeg 命令失败、产物缺失、回写失败 | **3**（维持现状） | — |

- 瞬时类**非终态**时写入 `next_attempt_at`（ISO）；`runBatch` 对未到点的 job **只读跳过**
  （`skip_reason=deferred_backoff`），不领取、不写字段；领取时 `buildClaimPatch` 把该键清空。

**③ 输入体积登记**：job 文档**新键 `input_bytes`**（`lib/transcode-state.js#buildInputSizePatch`），
值为**下载后的输入字节数**（`track_mix` 为各输入之和）；成功与失败回写、`job_failed` /
`input_media_unreadable` 日志与执行结果都带上。未下载成功（如提前失败）⇒ **键完全不写入**，
既有文档形状与判据不受影响。**客户端配对**：`med_section_audios` 侧写入**新键 `source_size`**
（本地 File 字节数；见后台 `database.js#createMedSectionAudio` 与 `MeditationPage.jsx`）——
两者配对，使「对象 / 下载链路」还是「源文件本身」一眼可判。`source_size` **不进 D6 读契约**。

**④ 输入容器指纹登记（本单新增）**：输入探测失败（`index.js#assertInputProbeable`）时，**只读输入文件前
`INPUT_HEAD_SAMPLE_BYTES`＝32 字节**（`lib/input-container-fingerprint.js#readInputHeadBuffer`，用
`openSync`+`readSync(...,0,32,0)`，**绝不多读**整个文件，无隐私风险），登记两个 **job 文档新键**：
- `input_container`：按**魔数**判定的容器字面值，`lib/input-container-fingerprint.js#detectInputContainer`
  依序判定 —— 偏移 4 起 `ftyp`⇒`mp4`；`#!AMR`⇒`amr`；`#!SILK` / `\x02#!SILK`⇒`silk`；`RIFF`⇒`wav`；
  `ID3` 或首两字节 `0xFFFB`/`0xFFF3`⇒`mp3`；`OggS`⇒`ogg`；其余（含空文件）⇒`unknown`。
- `input_head_hex`：前 32 字节的**小写十六进制、无分隔符（连写）**（`formatInputHeadHex`，`Buffer.toString('hex')`；
  **固定此一种写法**，本文即写法定点；空文件为 `''`）。

落库与日志（`lib/transcode-state.js#buildInputFingerprintPatch`）：**只在失败回写时写**这两个键
（成功路径不写；`buildJobFailurePatch` 里与既有 `input_bytes` **同批展开**——已有 `input_bytes` 时一并带上）；
`job_failed` / `input_media_unreadable` / `track_mix_job_failed` 日志亦带 `input_container` 与
`input_head_hex`。读不到输入文件 / 无指纹 ⇒ 两键**完全不写入**（既有文档形状与判据不受影响）。
两键 **不进 D6 读契约**（同 `source_size` 口径）。

**用途**：**无需人工比对**即可分辨两类成因——`input_container=mp4`（且体积偏小）＝对象/上传被截断
（「上传丢字节」）；`input_container=amr/silk/wav/mp3/ogg`＝**文件本身就不是 MP4 容器**（源文件传错/格式不符）。
失败文案**逐字保留原人话句**，仅在末尾**追加**一句不敏感的格式线索 `；输入容器：<值>（非 MP4）`
（`buildInputMediaInvalidError`；`mp4`/`unknown` 不补「非 MP4」；无指纹则与从前完全一致）。

- 边界：**不改** R34 编码参数 / ffmpeg 命令、队列分区、终态判定总语义、D6 读契约。

## 3. 回写字段（D-B2-6，与 `packages/shared-utils/meditation-section-audio.js` normalizer 逐字对齐）

`med_section_audios`：`file_id` / `audio_url`（Opus 主体）、`fallback_file_id` /
`fallback_audio_url` / `fallback_mime_type`（mp3）、`transcoded_formats`（合并后规范顺序）、
`transcode_status`、`transcode_error`、`updated_at`；`duration` **仅在现值空/0 时**补写产物实测值
（D-B2-4：原始上传件 `duration=N/A`，不得对原件取时长）。不新增/不改名任何字段。

云存储路径（D-B2-7）：`meditation-audio-final/{section_type}/take-{section_audio_id}.ogg|.mp3`
（若 job 的 `target_cloud_path` 已落在 `meditation-audio-final/` 下则沿用其基准名换扩展名）。
**两份产物都上传成功后才回写**；任一步失败整条 job 记失败，不留「半个成功」。

## 4. ffmpeg 二进制（D-B2-5 / R33-⑧，**不入仓库**）

`.gitignore` 已排除静态二进制。两条取法：

**A. 云函数层（推荐）**：把 linux x64 静态构建打成层后挂载。**层 zip 内为 `bin/` 目录** ⇒ 挂载后函数内路径为 **`/opt/bin/ffmpeg`** 与 **`/opt/bin/ffprobe`**（与 `cloudbaserc.json` 里实设的 `FFMPEG_PATH=/opt/bin/ffmpeg` 对应）。

```bash
# 1) 取静态构建（示例：johnvansickle 静态包，linux x64；实测 7.0.2 版含 libopus / libmp3lame / amix）
curl -LO https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar -xf ffmpeg-release-amd64-static.tar.xz
mkdir -p layer/bin && cp ffmpeg-*-amd64-static/{ffmpeg,ffprobe} layer/bin/
# 2) 打包为层（腾讯云层：解包后落在 /opt 下）
cd layer && zip -r ../ffmpeg-layer.zip bin
# 3) 在云函数「层管理」挂载后，函数内路径为 /opt/bin/ffmpeg ⇒ 设 FFMPEG_PATH=/opt/bin/ffmpeg
```

**层包体上限（实测，硬）**：CloudBase 官方限制 **「层的总大小限制为 50MB」**，且单函数**最多绑定 5 个层**。
上例两个静态二进制各约 76MB，合并 zip 约 **56MB ⇒ 超限**。此时**拆成两个层**（各约 28MB）：

```bash
mkdir -p layerA/bin layerB/bin
cp layer/bin/ffmpeg  layerA/bin/          # 层一：内含 bin/ffmpeg
cp layer/bin/ffprobe layerB/bin/          # 层二：内含 bin/ffprobe
(cd layerA && zip -r ../ffmpeg-layer-a.zip bin)
(cd layerB && zip -r ../ffmpeg-layer-b.zip bin)
```

两层分别发布后**同时绑定**到函数（加载顺序无关：层内无同名文件，互不覆盖），
挂载路径仍为 `/opt/bin/ffmpeg` 与 `/opt/bin/ffprobe` ⇒ `FFMPEG_PATH` / `FFPROBE_PATH` 不必改。

**控制台发布层（本仓实际采用；CLI 不可用）**：官方 CLI 1.5.2 的层子命令实测不可用（`functions:layer:*` 报「不是有效的命令」/ 未知选项）⇒ 层只能在控制台发布：

1. 云开发控制台 → 环境 `liwu-d8gek6jjdab1d087c` → 云函数 → **层管理** → 新建
2. 层名 `meditation-ffmpeg`（运行环境 Nodejs18.15）上传 `bin/ffmpeg` 那一个 zip；层名 `meditation-ffprobe` 上传 `bin/ffprobe` 那一个 zip
3. 记下**两个层的版本号**（新建后通常为 1），回填 `cloudbaserc.json` 里 `meditation-transcoder` 的 `layers` 数组（每项含层名与版本号），再跑 `./scripts/deploy-meditation-functions.sh transcoder --yes`

**层版本一旦创建不可修改**，更新需新建版本（改 `layers` 里的版本号后重部署）。

**B. 自建静态构建**：自行编译带 `libopus` / `libmp3lame` 的 linux x64 构建，随层下发；
或（仅内网/自建环境）把二进制放到函数目录**之外**的挂载点，用 `FFMPEG_PATH` / `FFPROBE_PATH` 指定。

**部署后实地校验（必做）**：

```bash
# 云函数内执行（或云函数控制台「测试」里用 child_process 跑一次）
ffmpeg -hide_banner -encoders | grep -E 'libopus|libmp3lame'
# 期望两行：libopus / libmp3lame
ffmpeg -hide_banner -h muxer=ogg   # 确认 ogg 复用器可用（本执行器 -f ogg）
```

二进制缺失时执行器报 `FFMPEG_NOT_FOUND` / `FFPROBE_NOT_FOUND`（**永久失败、不静默**），
错误文案内含上述两条取法提示。

## 5. 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `FFMPEG_PATH` | `/opt/ffmpeg`（**代码内兜底**）；**本仓部署实设为 `/opt/bin/ffmpeg`**（见 `cloudbaserc.json` 的 `envVariables`，与 §4 层内 `bin/ffmpeg` 对应） | ffmpeg 可执行文件路径（层挂载点，D-B2-5） |
| `FFPROBE_PATH` | ffmpeg 同目录 `ffprobe`，否则 `/opt/ffprobe`（**代码内兜底**）；**本仓部署实设为 `/opt/bin/ffprobe`** | ffprobe 路径 |
| `CLOUDBASE_ENV_ID` / `TCB_ENV` / `SCF_NAMESPACE` | `liwu-d8gek6jjdab1d087c` | 环境 ID（函数内优先用运行环境变量） |
| `TENCENT_SECRET_ID` → `TENCENTCLOUD_SECRET_ID` → `VITE_TENCENT_SECRET_ID` | 空 | **云函数内不用填**（用 SCF 角色内置凭证）；命名与 worker 一致，仅本地手动 invoke 时用。密钥**不入日志** |

## 6. 部署

```bash
# 单个函数（含依赖安装）
cloudbase functions:deploy meditation-transcoder -e liwu-d8gek6jjdab1d087c

# 含定时触发器：在仓库根执行全量部署
cloudbase deploy

# 手动触发一次（等价定时轮询一轮）
cloudbase functions:invoke meditation-transcoder -e liwu-d8gek6jjdab1d087c
```

函数条目（内存/超时/触发器）登记在仓库根 `cloudbaserc.json`。

## 7. 响度归一（loudnorm）——**待 Zang 拍板**，本链路未实现

- 老 worker（`scripts/audio-transcode-worker.mjs`）做法：`default` profile 跑**两遍** ffmpeg
  （第 1 遍 `-af loudnorm=I=-18:TP=-1.5:LRA=15:linear=true:print_format=json -f null -` 只为取测量值，
  解析 stderr 的 `[Parsed_loudnorm` JSON，解析失败报 `LOUDNORM_JSON_NOT_FOUND`；第 2 遍带
  `measured_*` 实测参数重编）；`nature` profile 在第 2 遍再叠 `volume=0.2`；`tts_simple` 不跑 loudnorm。
  单条 job 失败即整条 `failed`（无 `attempt_count` 重试）。
- 本链路按 Kevin 裁定参数（`-c:a libopus -b:a 48k -vbr off -ac 2 -ar 48000` + `libmp3lame -b:a 48k
  -ac 2 -ar 44100`）**未加任何 `-af`**。若沿用 loudnorm：既定的**单次调用双路输出**形态放不下两遍
  测量，需要 ① 先跑一遍 measured 测量（多一次全解码），② 再把同一
  `-af loudnorm=...measured_*` 应用到**两路**输出（`-map 0:a` 双路共用同一 filtergraph），
  合计 **2 次 ffmpeg 调用**、耗时约 ×2；且 `nature` 的 `volume=0.2` 是否继续适用需重新裁定。
- 建议：**本批先按纯参数化（无 loudnorm）交付**（体积与耗时可控、行为可预测），loudnorm 是否必要
  需与规范附录 B.3 / T4 的听测结论**一起拍板**；拍板后若需启用，改动集中在
  `lib/transcode-command.js` 一处。

## 8. 共享代码同步责任（D-B2-8）

云函数**不能** require 仓库内共享模块（SCF 只打包函数目录）⇒ `lib/meditation-formats.js` 是
`packages/shared-utils/meditation-section-audio.js` 的**精简等价副本**（字段名、规范顺序、
历史 `mp3_*` 别名、状态字面量）。**改权威源必须同步本副本**，不一致时以权威源为准。
本地自测脚本会逐项比对两份实现（见下）。

## 9. 本地自测/举证

本批（收口）的**队列分区自测**脚本：`/Users/kevin/.hermes/profiles/zang/cache/scratch/kong-b2r2/partition-selftest.mjs`
（**脚本与产物均不进仓库**；桩库/桩 COS，跑**真实** `fetchQueuedJobs` / `processJob` / `claimJob`，
并抽取 `scripts/audio-transcode-worker.mjs` 的 `fetchQueuedJobs` 源码实测其守卫）：

```bash
node /Users/kevin/.hermes/profiles/zang/cache/scratch/kong-b2r2/partition-selftest.mjs
# 期望：15/15 PASS —— section_audio 正常 job 成功；老 profile（default）job 两侧都不被新执行器领取；
#       缺 section_audio_id 的 job 领取后立即 failed（is_terminal=true）
```

上一批的转码/口径自测脚本：`/Users/kevin/.hermes/profiles/zang/cache/scratch/kong-b2-transcoder/selftest.mjs`

```bash
node /Users/kevin/.hermes/profiles/zang/cache/scratch/kong-b2-transcoder/selftest.mjs
```

它做三件事：① 用函数内**真实的命令构造器**对本机真 webm 样本跑出 `.ogg`/`.mp3`，再用 `ffprobe`
回报 codec / channels / bit_rate / duration / size；② 比对精简副本与权威源的口径；③ 用桩对象跑
状态机（领取 / 置 processing / 幂等 / 重试）各分支。

## 10. 已知遗留（报告给 Zang，未在本单处理）

- **D-B2-11 挂账（本批刻意不改）**：① 老 worker `scripts/audio-transcode-worker.mjs` 第 295 行临时
  文件名为 `output.opus`（与 `.ogg` 同为 Ogg 封装，本批保留原样）；② 排队方
  `target_cloud_path` 的 `.opus` 扩展名（见下条）。两处已交 Jing 记账，待专项裁定。
- `audio_url` / `fallback_audio_url` 用 `getTempFileURL`（有效期 7200s）写入，与前端
  `uploadAudioFile` 口径一致；前端那条会再套一层 cloudbase 代理前缀，云函数内做不到
  （代理是 web 层能力）。长期播放依赖 `file_id`。
- 排队方（`MeditationPage.jsx` → `database.js#createMeditationAudioTranscodeJob`）给的
  `target_cloud_path` 仍是 `meditation-audio/...take-<id>.opus`（非 `-final`、扩展名 `.opus`）；
  本执行器按 D-B2-7 统一落到 `meditation-audio-final/.../*.ogg|*.mp3`。**本期不改前端**，
  故该字段对 opus 任务实际上被忽略（仅 `meditation-audio-final/` 前缀才被沿用）。
- **D-B2-10 遗留**：排队方 `database.js` 第 5915 行只写了镜像键 `attempt_count: 0`，
  未写权威键 `attempts`（本批不得改 `database.js`）。执行器读取走 `attempts ?? attempt_count`、
  写入两键同值，功能无影响；**待老 worker 退役时把排队方一并切到 `attempts` / `transcode_error`**。
