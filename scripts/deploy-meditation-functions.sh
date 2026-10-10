#!/usr/bin/env bash
#
# 部署冥想云函数（meditation-read / meditation-session / meditation-transcoder）——前置检查 + 部署
# 风格对齐 scripts/deploy-fortune-daily-settlement.sh。
#
# 用法：
#   ./scripts/deploy-meditation-functions.sh <read|session|transcoder|all> [--yes] [--force]
#
# 安全默认（默认不动手）：
#   * 不带 --yes ⇒ **dry-run**：只做只读检查（CLI / 登录态 / 环境 ID / cloudbaserc.json 条目与层回填）
#     并逐条回显将要执行的命令，**不执行任何写操作**（不装依赖、不部署、不改云端配置）。
#   * 带 --yes ⇒ 真正执行；每一步仍**先把命令原文打印出来再执行**。
#
# 环境变量（均可覆盖）：
#   CLOUDBASE_ENV_ID       环境 ID，默认 liwu-d8gek6jjdab1d087c（环境 ID 非凭据，可打印）
#   FFMPEG_PATH            层内 ffmpeg 路径，默认 /opt/bin/ffmpeg（与 cloudbaserc.json envVariables 对齐）
#   FFMPEG_CHECK_BIN       可选：本机**可执行**的 ffmpeg，用于预检 libopus / libmp3lame；
#                          留空 ⇒ 跳过本机预检并打印云端校验指引（不静默当通过）
#   SKIP_LAYER_CHECK=1     明确跳过 transcoder 的层检查（先部署、后 bind 层时用；默认不跳过）
#   ALLOW_WORKER_RUNNING=1 允许在检测到 audio-transcode-worker 仍在跑时继续（README §1.1 队列分区）
#   FORCE=1                等价于 --force（部署时覆盖同名函数）
#
# 凭据纪律：本脚本**不读取、不打印、不硬编码任何密钥**。云端执行用 SCF 角色内置凭证；
# 本机登录态由 cloudbase CLI 自身管理（脚本不读取其凭据内容）。
#
# 注意：cloudbaserc.json 里的 envVariables 为**覆盖式**语义
# （见 @cloudbase/manager-node/src/function/index.ts：Environment 为覆盖式修改，不保留已有字段），
# 即本次部署 transcoder 会把该函数上**其它环境变量清掉**。部署后请用
#   cloudbase functions:detail meditation-transcoder -e "$ENV_ID"
# 复核环境变量（本脚本结尾也会回显该命令）。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_ID="${CLOUDBASE_ENV_ID:-liwu-d8gek6jjdab1d087c}"
FUNCTION_ROOT="$ROOT_DIR/cloudfunctions"
FFMPEG_PATH="${FFMPEG_PATH:-/opt/bin/ffmpeg}"
FFMPEG_CHECK_BIN="${FFMPEG_CHECK_BIN:-}"
SKIP_LAYER_CHECK="${SKIP_LAYER_CHECK:-0}"
ALLOW_WORKER_RUNNING="${ALLOW_WORKER_RUNNING:-0}"
FORCE="${FORCE:-0}"

usage() {
  cat <<'EOF'
用法：./scripts/deploy-meditation-functions.sh <read|session|transcoder|all> [--yes] [--force]
  read        只处理 meditation-read
  session     只处理 meditation-session（上报＋发放写云函数）
  transcoder  只处理 meditation-transcoder（先查 ffmpeg 层，缺则中止并提示 README §4）
  all         三个都处理
  --yes       真正执行（缺省为 dry-run：仅只读检查 + 回显命令）
  --force     部署时附加 --force（覆盖同名函数）
EOF
}

say() { printf '%s\n' "$*"; }
step() { printf '\n=== %s ===\n' "$*"; }
die() { printf '\n[中止] %s\n' "$*" >&2; exit 1; }

# 失败归类提示：仅在 --yes 真正执行失败时打印（不改任何部署命令、不改退出码）
hint_on_failure() {
  local rc="$1"
  {
    printf '\n[失败归类] 上一步退出码 %s。\n' "$rc"
    printf '  若上方错误信息含以下任一措辞，则属**账号环境问题，非代码/配置问题**：\n'
    printf '    「账户余额不足」「InsufficientBalance」「余额不足」「欠费」\n'
    printf '  ⇒ 症状：云端**函数未创建**（常伴随 “function not found / 函数不存在”），\n'
    printf '     此时 cloudfunctions/ 代码与 cloudbaserc.json 配置本身都无需改动，\n'
    printf '     不要据此改代码、调参数或重试同一命令。\n'
    printf '  ⇒ 处理：到费用中心确认/充值后原样重跑本脚本：\n'
    printf '     https://console.cloud.tencent.com/expense/recharge\n'
    printf '  （若错误是权限/网络/层相关，请对照上方错误原文与脚本内对应提示处理）\n'
  } >&2
}

# 回显要执行的命令（带 %q 引号，与原命令逐字对应），仅在 --yes 下真正执行
run() {
  printf '$'
  printf ' %q' "$@"
  printf '\n'
  if [ "$EXECUTE" -eq 1 ]; then
    "$@" || {
      local rc=$?
      hint_on_failure "$rc"
      return "$rc"
    }
  else
    say "  （dry-run：未执行；加 --yes 才真正执行）"
  fi
}

TARGET="${1:-}"
if [ $# -gt 0 ]; then shift; fi
EXECUTE=0
for arg in "$@"; do
  case "$arg" in
    --yes | -y) EXECUTE=1 ;;
    --force) FORCE=1 ;;
    *) usage; printf '\n[中止] 未知参数：%s\n' "$arg" >&2; exit 2 ;;
  esac
done

case "$TARGET" in
  read | session | transcoder | all) ;;
  *) usage; exit 2 ;;
esac

say "目标函数：$TARGET        模式：$( [ "$EXECUTE" -eq 1 ] && echo '执行（--yes）' || echo 'dry-run（默认，不动手）' )"
say "环境 ID：${ENV_ID}（环境 ID 非凭据）"

step "前置检查（只读）"
command -v cloudbase >/dev/null 2>&1 || die "未找到 cloudbase CLI（本机应已安装 @cloudbase/cli 1.5.2）"
printf '$ cloudbase --version\n'
cloudbase --version 2>/dev/null | tr '\n' ' ' || true
printf '\n'

printf '$ cloudbase env:list\n'
ENV_LIST="$(cloudbase env:list 2>&1 || true)"
printf '%s\n' "$ENV_LIST"
if printf '%s' "$ENV_LIST" | grep -q '请求超时\|网络'; then
  die "env:list 读取失败（网络/代理问题，非登录态问题）：重试或设置终端 HTTP 代理后重跑"
fi
printf '%s' "$ENV_LIST" | grep -q "$ENV_ID" ||
  die "登录态或环境不可用：env:list 中未见 ${ENV_ID}（请先 cloudbase login / 确认权限；本脚本不处理凭据）"

# 读取 cloudbaserc.json 条目（只读，node 保证与 CLI 同源 JSON 语义）
# 缺字段 / 非数组一律回落到 "0"，便于直接做数值判定（避免空串被当成「已回填」）
cfg_field() {
  local out
  out="$(node -e '
const fs = require("fs");
const [file, name, field] = process.argv.slice(1);
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
const fn = (cfg.functions || []).find((f) => f.name === name);
const v = fn ? fn[field] : undefined;
process.stdout.write(Array.isArray(v) ? String(v.length) : (v === undefined || v === null ? "" : String(v)));
' "$ROOT_DIR/cloudbaserc.json" "$1" "$2")"
  printf '%s' "${out:-0}"
}

assert_cfg() {
  local name="$1" field="$2" want="$3" got
  got="$(cfg_field "$name" "$field")"
  if [ "$got" != "$want" ]; then
    die "cloudbaserc.json 中 $name.$field = \"$got\"，期望 \"$want\"（配置被动过？本单不改语义）"
  fi
  say "· cloudbaserc.json[$name].$field = $got ✓"
}

step "cloudbaserc.json 条目自检（只读）"
assert_cfg meditation-read installDependency true
assert_cfg meditation-read timeout 30
assert_cfg meditation-read memorySize 128
assert_cfg meditation-session installDependency true
assert_cfg meditation-session timeout 30
assert_cfg meditation-session memorySize 128
assert_cfg meditation-transcoder installDependency true
assert_cfg meditation-transcoder timeout 300
assert_cfg meditation-transcoder memorySize 512
say "· cloudbaserc.json[meditation-transcoder].layers 条目数 = $(cfg_field meditation-transcoder layers)（0 ⇒ 层未回填，见下）"

# ---- transcoder 专属前置：ffmpeg 层 + 二进制能力 ----
check_transcoder_layer() {
  step "[meditation-transcoder] ffmpeg 层前置检查（只读）"

  local layer_count
  layer_count="$(cfg_field meditation-transcoder layers)"
  layer_count="${layer_count:-0}"

  # 已发布层探测：CLI 1.5.2 的层命令在本机**不可用**（实测三种写法均失败），
  #   `cloudbase fn layer list`        ⇒ error: unknown command 'layer'
  #   `cloudbase functions:layer:list` ⇒ Error: functions:layer:list 不是有效的命令
  #   `cloudbase functions:layer:list -e <env>` ⇒ error: unknown option '-e'
  # 故只能以 cloudbaserc.json 的 layers 回填为准（deploy 时作为 Layers 参数自动挂载），
  # 已发布层请用控制台「层管理」确认。
  if [ "$SKIP_LAYER_CHECK" = "1" ]; then
    say "SKIP_LAYER_CHECK=1 ⇒ 明确跳过层检查（先部署、后手工绑层的场景）"
  elif [ "$layer_count" -eq 0 ]; then
    cat <<EOF

[中止] meditation-transcoder 依赖 ffmpeg 二进制，层尚未发布/未回填 ⇒ 不静默部署。
按 cloudfunctions/meditation-transcoder/README.md §4 执行：
  1) 取静态构建（linux x64，含 libopus / libmp3lame）：
     curl -LO https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
     tar -xf ffmpeg-release-amd64-static.tar.xz
     mkdir -p layer/bin && cp ffmpeg-*-amd64-static/{ffmpeg,ffprobe} layer/bin/
  2) 打包为层（解包后落在 /opt 下）：cd layer && zip -r ../ffmpeg-layer.zip bin
  3) 发布层（控制台「云函数 → 层管理 → 新建层」）并记下别名与版本号
  4) 回填 cloudbaserc.json 的 functions[meditation-transcoder]：
     "layers": [{ "name": "<层别名>", "version": <版本号> }]
     （回填后本脚本部署即自动挂载；层名/版本以控制台为准）
  5) 本函数 envVariables 已设 FFMPEG_PATH=${FFMPEG_PATH}（层内 bin/ffmpeg 路径）
已发布层 / 绑定结果建议在控制台复核：https://console.cloud.tencent.com/tcb/scf?envId=$ENV_ID
已知要跳过检查：SKIP_LAYER_CHECK=1 ./scripts/deploy-meditation-functions.sh transcoder --yes
EOF
    die "transcoder 层前置未满足（见上方 README §4 步骤）"
  else
    say "· cloudbaserc.json 已回填 $layer_count 个层条目（部署时作为 Layers 参数自动挂载）✓"
    say "· 已发布层清单**无法**经本机 CLI 只读确认（1.5.2 层命令缺陷，见脚本注释）⇒"
    say "  请在控制台「层管理」确认层存在：https://console.cloud.tencent.com/tcb/scf?envId=$ENV_ID"
  fi

  # ffmpeg 能力校验：能本机验就验（层内二进制为 linux x64，通常只能在云上验）
  if [ -n "$FFMPEG_CHECK_BIN" ]; then
    say "本机预检 ffmpeg 能力：$FFMPEG_CHECK_BIN"
    "$FFMPEG_CHECK_BIN" -hide_banner -encoders 2>/dev/null | grep -q 'libopus' ||
      die "FFMPEG_CHECK_BIN 不含 libopus（README §4：Opus 主体必需），不继续"
    "$FFMPEG_CHECK_BIN" -hide_banner -encoders 2>/dev/null | grep -q 'libmp3lame' ||
      die "FFMPEG_CHECK_BIN 不含 libmp3lame（README §4：mp3 兜底必需），不继续"
    say "· libopus / libmp3lame 均存在 ✓"
  else
    cat <<EOF
[提示] 未提供 FFMPEG_CHECK_BIN ⇒ 跳过本机预检（**不等于**校验通过）。层内为 linux x64 静态构建，
       须在云端校验（README §4「部署后实地校验（必做）」）：
         ffmpeg -hide_banner -encoders | grep -E 'libopus|libmp3lame'   # 期望两行
         ffmpeg -hide_banner -h muxer=ogg
       方式：cloudbase 控制台「函数测试」跑上述命令，或部署后调用：
         cloudbase functions:invoke meditation-transcoder -e $ENV_ID
       缺任一编码器 ⇒ 函数内报 FFMPEG_NOT_FOUND / FFPROBE_NOT_FOUND（永久失败、不静默）。
EOF
  fi
}

# ---- 队列分区纪律（README §1.1）：同一时刻只允许一侧消费 audio_transcode_jobs ----
check_worker_discipline() {
  step "[meditation-transcoder] 上线纪律：老 worker 必须先停（README §1.1）"
  if pgrep -fl 'audio-transcode-worker' >/dev/null 2>&1; then
    printf '$ pgrep -fl audio-transcode-worker\n'
    pgrep -fl 'audio-transcode-worker' || true
    if [ "$ALLOW_WORKER_RUNNING" = "1" ]; then
      say "⚠ ALLOW_WORKER_RUNNING=1 ⇒ 已知风险继续（两侧并行会互相抢 job 状态）"
    else
      say "⚠ 检测到老 worker 仍在运行；先执行："
      say "    结束 npm run audio:transcode-worker:loop（及手动实例）后确认 pgrep -fl audio-transcode-worker 为空"
      say "  确知要并行：ALLOW_WORKER_RUNNING=1 <本脚本> transcoder --yes"
    fi
  else
    say "· 未检测到 audio-transcode-worker 进程 ✓"
  fi
}

deploy_function() {
  local name="$1"
  step "[$name] 依赖与部署"
  local fn_dir="$FUNCTION_ROOT/$name"
  [ -d "$fn_dir" ] || die "函数目录不存在：$fn_dir"

  if [ -d "$fn_dir/node_modules" ]; then
    say "· 已有 $name/node_modules ⇒ 跳过安装"
  else
    say "· 缺 $name/node_modules（依赖 @cloudbase/node-sdk ^3.18.3）"
    say "  installDependency=true 时 CLI 打包会忽略 node_modules 并在云端安装；"
    say "  此处仍先本地装齐，避免 installDependency 被误关时上传不带依赖。"
    (cd "$fn_dir" && run npm install --omit=dev)
  fi

  local cmd=(cloudbase functions:deploy "$name" -e "$ENV_ID")
  if [ "$FORCE" = "1" ]; then cmd+=(--force); fi
  (cd "$ROOT_DIR" && run "${cmd[@]}")
}

if [ "$TARGET" = "transcoder" ] || [ "$TARGET" = "all" ]; then
  check_transcoder_layer
  if [ "$EXECUTE" -eq 1 ]; then check_worker_discipline; else say "（dry-run：上线纪律检查在 --yes 执行时进行）"; fi
fi

if [ "$TARGET" = "read" ] || [ "$TARGET" = "all" ]; then
  deploy_function meditation-read
fi
if [ "$TARGET" = "session" ] || [ "$TARGET" = "all" ]; then
  deploy_function meditation-session
fi
if [ "$TARGET" = "transcoder" ] || [ "$TARGET" = "all" ]; then
  deploy_function meditation-transcoder
fi

step "收尾：部署后复核（人工执行）"
if [ "$TARGET" = "read" ] || [ "$TARGET" = "all" ]; then
  say "cloudbase functions:invoke meditation-read -e $ENV_ID        # 传 {\"action\":\"listTracks\"} 等验证"
fi
if [ "$TARGET" = "session" ] || [ "$TARGET" = "all" ]; then
  say "cloudbase functions:invoke meditation-session -e $ENV_ID --params '{\"action\":\"reportCompletion\",...}'   # 参数只能走 --params"
  say "  · 依赖控制台把新集合 med_play_sessions 的客户端权限关死（仅云函数可写），见 meditation-session/README.md §5"
fi
if [ "$TARGET" = "transcoder" ] || [ "$TARGET" = "all" ]; then
  say "cloudbase functions:detail meditation-transcoder -e $ENV_ID   # 复核环境变量 FFMPEG_PATH=${FFMPEG_PATH}（envVariables 为覆盖式）"
  say "cloudbase functions:invoke meditation-transcoder -e $ENV_ID   # 手动跑一轮（等价定时轮询；先确认老 worker 已停）"
fi
say ""
say "done（$( [ "$EXECUTE" -eq 1 ] && echo '已按显示顺序执行' || echo 'dry-run，未执行任何写操作' )）"
