// ─── 输入容器指纹（纯判定 + 只读前 32 字节） ───────────────────────────────────
//
// 目的：输入探测失败时，**不经人工比对**就能分辨两类成因——
//   ① 「上传丢字节」：源文件本身是 MP4 容器，只是被截断（指纹仍是 mp4 / `ftyp`）；
//   ② 「文件本身就不是 MP4 容器」：源文件其实是 amr / silk / wav / mp3 / ogg 等（指纹即非 mp4）。
//
// 做法：只读输入文件**前 `INPUT_HEAD_SAMPLE_BYTES`（32）字节**（绝不多读，无隐私风险），
//   算出：
//     · `input_head_hex`   前 32 字节的**小写十六进制、无分隔符（连写）**（固定此一种写法）；
//     · `input_container`  按魔数判定的容器字面值（见下）。
//
// 判定口径（按顺序，命中即返回）：
//   · 偏移 4 起 4 字节 = `ftyp`            ⇒ `mp4`
//   · 起始 = `#!AMR`                       ⇒ `amr`
//   · 起始 = `#!SILK` 或 `\x02#!SILK`      ⇒ `silk`
//   · 起始 = `RIFF`                        ⇒ `wav`
//   · 起始 = `ID3` 或 起始两字节 `0xFFFB` / `0xFFF3` ⇒ `mp3`
//   · 起始 = `OggS`                        ⇒ `ogg`
//   · 其余（含空文件 / 不足 32 字节）      ⇒ `unknown`
//
// ⚠ 本模块**只读**输入文件，不写、不删、不改；编码参数 / ffmpeg 命令与此无关（不得据此改命令）。
// ⚠ 只覆盖「输入探测失败」的诊断用途；成功路径不落库（见 README §2.3）。

const fs = require('node:fs')

// 前 32 字节（唯一采样长度；改此常量需同步 README 的写法登记）。
const INPUT_HEAD_SAMPLE_BYTES = 32

// 容器字面值（写入 job 文档 `input_container`；字面值一经确定不得改名）。
const INPUT_CONTAINERS = Object.freeze({
  mp4: 'mp4',
  amr: 'amr',
  silk: 'silk',
  wav: 'wav',
  mp3: 'mp3',
  ogg: 'ogg',
  unknown: 'unknown'
})

const toBuffer = (value) => (Buffer.isBuffer(value) ? value : Buffer.alloc(0))

// 起始 N 字节是否逐字节等于给定字节序列。
const startsWithBytes = (buffer, bytes) => {
  const head = toBuffer(buffer)
  if (head.length < bytes.length) {
    return false
  }

  for (let index = 0; index < bytes.length; index += 1) {
    if (head[index] !== bytes[index]) {
      return false
    }
  }

  return true
}

// 起始 N 字节是否等于 ASCII 文本（按 latin1 逐字节比较，避免多字节误判）。
const startsWithAscii = (buffer, text) => startsWithBytes(buffer, Buffer.from(text, 'latin1'))

const hasMp4Brand = (head) => head.length >= 8 && head.subarray(4, 8).toString('latin1') === 'ftyp'

// SILK：`#!SILK` 或前导 0x02 的 `\x02#!SILK`。
const hasSilkHeader = (head) => (
  startsWithAscii(head, '#!SILK')
  || (head.length >= 1 && head[0] === 0x02 && startsWithAscii(head.subarray(1), '#!SILK'))
)

// MP3：ID3v2 标签（`ID3`）或裸 MPEG 帧同步 `0xFFFB` / `0xFFF3`。
const hasMp3Header = (head) => (
  startsWithAscii(head, 'ID3')
  || (head.length >= 2 && head[0] === 0xFF && (head[1] === 0xFB || head[1] === 0xF3))
)

// 魔数判定：入参为「文件前若干字节」的 Buffer，返回容器字面值。
const detectInputContainer = (buffer) => {
  const head = toBuffer(buffer)
  if (head.length === 0) {
    return INPUT_CONTAINERS.unknown
  }

  if (hasMp4Brand(head)) {
    return INPUT_CONTAINERS.mp4
  }
  if (startsWithAscii(head, '#!AMR')) {
    return INPUT_CONTAINERS.amr
  }
  if (hasSilkHeader(head)) {
    return INPUT_CONTAINERS.silk
  }
  if (startsWithAscii(head, 'RIFF')) {
    return INPUT_CONTAINERS.wav
  }
  if (hasMp3Header(head)) {
    return INPUT_CONTAINERS.mp3
  }
  if (startsWithAscii(head, 'OggS')) {
    return INPUT_CONTAINERS.ogg
  }

  return INPUT_CONTAINERS.unknown
}

// 前 N 字节 → 小写十六进制、**无分隔符（连写）**。空 Buffer ⇒ 空串。
const formatInputHeadHex = (buffer) => toBuffer(buffer).toString('hex')

// **只读前 `maxBytes` 字节**：用 fd + readSync(..., 0, limit, 0)，绝不多读整个文件。
// 返回实际读到的字节（可能少于 limit：文件更短 / 空文件返回空 Buffer）。
const readInputHeadBuffer = (filePath, maxBytes = INPUT_HEAD_SAMPLE_BYTES) => {
  const limit = Math.max(1, Math.floor(Number(maxBytes) || INPUT_HEAD_SAMPLE_BYTES))
  let fd = null

  try {
    fd = fs.openSync(filePath, 'r')
    const headBuffer = Buffer.alloc(limit)
    const bytesRead = fs.readSync(fd, headBuffer, 0, limit, 0)

    return bytesRead > 0 ? headBuffer.subarray(0, bytesRead) : Buffer.alloc(0)
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        // 关闭失败不致命：文件句柄异常不该盖住主流程。
      }
    }
  }
}

// 输入文件指纹：读不到文件 ⇒ null（调用方据此不写任何指纹键）。
const fingerprintInputFile = (filePath) => {
  try {
    const head = readInputHeadBuffer(filePath, INPUT_HEAD_SAMPLE_BYTES)

    return {
      input_container: detectInputContainer(head),
      input_head_hex: formatInputHeadHex(head),
      head_bytes: head.length
    }
  } catch {
    return null
  }
}

module.exports = {
  INPUT_HEAD_SAMPLE_BYTES,
  INPUT_CONTAINERS,
  detectInputContainer,
  formatInputHeadHex,
  readInputHeadBuffer,
  fingerprintInputFile
}
