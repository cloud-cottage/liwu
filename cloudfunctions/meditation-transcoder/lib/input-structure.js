// ─── 输入结构完整性校验（写完即验·内容级） ───────────────────────────────────
//
// 背景（生产实测根因）：云函数内「下载 → 使用」之间存在**写入未完成竞态**——本地文件字节数
//   已到目标值，但尾部内容尚未落盘，ffprobe/ffmpeg 立即读取 ⇒ 报 `moov atom not found`；
//   **体积判据检测不到**这种「尺寸对、尾部空」的情形。
// 对策：下载写盘完成（finish ＋ fs.close）后，对文件做**内容级结构校验**：
//   · 容器按**魔数**判定（复用 lib/input-container-fingerprint.js，按内容不按扩展名）；
//   · MP4/M4A（`ftyp` 头）：扫描**顶层盒子链**——逐盒解析，支持 `size==1`（64 位 largesize）
//     与 `size==0`（到文件尾）两种头部形态，要求**最后一个盒子的声明结束 ＝ 文件长度**（链闭合）
//     且**存在 moov**；不闭合 ⇒ 本地文件不完整（触发重下）；
//   · 非 MP4 容器（wav/ogg/webm/mp3/amr/silk/unknown…）无通用盒子链 ⇒ **跳过扫描**，
//     只验体积（由调用方的体积判据覆盖），不得误判。
//
// ⚠ 本模块**只读**输入文件（fd 定位读盒子头，不整读文件、不写、不删）；
//   编码参数 / ffmpeg 命令与此无关（不得据此改命令）。

const fs = require('node:fs')

const {
  INPUT_HEAD_SAMPLE_BYTES,
  INPUT_CONTAINERS,
  detectInputContainer,
  readInputHeadBuffer
} = require('./input-container-fingerprint.js')

// 单文件顶层盒子数上限（防病态文件把扫描拖成死循环；真实音频顶层盒子只有个位数）。
const MP4_BOX_SCAN_MAX_BOXES = 65536

// 盒子头是否为「合理的 4 字节类型」：常规类型为可打印 ASCII（ftyp/mdat/moov/free/udta…），
// © 版权类首字节 ≥ 0x80。**全零 / 含控制字节**（＝「尾部内容未写入」的典型形态）一律判非法。
const isPlausibleBoxType = (typeBuffer) => {
  if (!Buffer.isBuffer(typeBuffer) || typeBuffer.length !== 4) {
    return false
  }

  for (const byte of typeBuffer) {
    const printable = (byte >= 0x20 && byte <= 0x7e) || byte >= 0x80
    if (!printable) {
      return false
    }
  }

  return true
}

// MP4 顶层盒子链扫描：从偏移 0 起逐盒解析（fd 定位读，只读每盒 8/16 字节头）。
// 判据：① 每盒声明结束 ≤ 文件长度；② 链走完时偏移 ＝ 文件长度（闭合）；
//       ③ 顶层盒子中存在 moov。任一不满足 ⇒ ok:false ＋ 人话 reason（可定位到偏移）。
const scanMp4BoxChain = ({ filePath, fileSizeBytes }) => {
  const fileSize = Number(fileSizeBytes)
  const fail = (reason, offset, boxTypes) => ({
    ok: false,
    reason,
    offset,
    box_types: boxTypes
  })

  let fd = null

  try {
    fd = fs.openSync(filePath, 'r')
    const headerBuffer = Buffer.alloc(16)
    const boxTypes = []
    let offset = 0

    while (offset < fileSize) {
      if (boxTypes.length >= MP4_BOX_SCAN_MAX_BOXES) {
        return fail(`顶层盒子数超过上限（${MP4_BOX_SCAN_MAX_BOXES}），疑似异常文件`, offset, boxTypes)
      }

      const remainingBytes = fileSize - offset
      if (remainingBytes < 8) {
        return fail(`偏移 ${offset} 处只剩 ${remainingBytes} 字节，不足一个盒子头（尾部不完整）`, offset, boxTypes)
      }

      if (fs.readSync(fd, headerBuffer, 0, 8, offset) < 8) {
        return fail(`偏移 ${offset} 处盒子头读取不完整`, offset, boxTypes)
      }

      const sizeField = headerBuffer.readUInt32BE(0)
      const typeBuffer = headerBuffer.subarray(4, 8)
      if (!isPlausibleBoxType(typeBuffer)) {
        return fail(
          `偏移 ${offset} 处盒子类型非法（0x${typeBuffer.toString('hex')}，疑似该区域内容未写入或被破坏）`,
          offset,
          boxTypes
        )
      }
      const boxType = typeBuffer.toString('latin1')

      let declaredEnd = 0

      if (sizeField === 1) {
        // 64 位 largesize 形态：8 字节头之后紧跟 8 字节大端长度。
        if (remainingBytes < 16) {
          return fail(`偏移 ${offset} 处 ${boxType} 盒声明 largesize，但剩余 ${remainingBytes} 字节不足 16 字节扩展头`, offset, boxTypes)
        }
        if (fs.readSync(fd, headerBuffer, 8, 8, offset + 8) < 8) {
          return fail(`偏移 ${offset} 处 ${boxType} 盒 largesize 读取不完整`, offset, boxTypes)
        }
        const largeSize = headerBuffer.readBigUInt64BE(8)
        if (largeSize < 16n) {
          return fail(`偏移 ${offset} 处 ${boxType} 盒 largesize=${largeSize} 非法（必须 ≥ 头长 16）`, offset, boxTypes)
        }
        declaredEnd = offset + Number(largeSize)
      } else if (sizeField === 0) {
        // 「到文件尾」形态：盒子占满剩余全部字节（必然是最后一个盒子）。
        declaredEnd = fileSize
      } else {
        if (sizeField < 8) {
          return fail(`偏移 ${offset} 处 ${boxType} 盒声明大小 ${sizeField} 非法（必须 ≥ 头长 8）`, offset, boxTypes)
        }
        declaredEnd = offset + sizeField
      }

      if (declaredEnd > fileSize) {
        return fail(
          `${boxType} 盒（偏移 ${offset}）声明结束于 ${declaredEnd} 字节，超出文件实际长度 ${fileSize} 字节（尾部不完整）`,
          offset,
          boxTypes
        )
      }

      boxTypes.push(boxType)
      offset = declaredEnd
    }

    if (offset !== fileSize) {
      return fail(`盒子链结束于 ${offset} 字节，与文件长度 ${fileSize} 字节不一致（链未闭合）`, offset, boxTypes)
    }

    if (!boxTypes.includes('moov')) {
      return fail(`盒子链已闭合但未找到 moov 盒（顶层盒子：${boxTypes.join('→')}）`, offset, boxTypes)
    }

    return {
      ok: true,
      box_types: boxTypes,
      has_moov: true,
      box_count: boxTypes.length
    }
  } catch (error) {
    return fail(`盒子链扫描失败：${error?.message || ''}`, 0, [])
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        // 关闭失败不致命：扫描结果已产出，不该让句柄异常盖住主流程。
      }
    }
  }
}

// 下载后输入文件的结构校验入口：
//   · 读不到 / 空文件 ⇒ ok:false（调用方按「本地下载不完整」处理）；
//   · 魔数判定非 MP4 ⇒ ok:true ＋ box_scan:'skipped'（结构不可扫，只验体积，不误判）；
//   · MP4 ⇒ 盒子链扫描（闭合 ＋ 存在 moov）。
const verifyDownloadedInputStructure = (filePath) => {
  let fileSizeBytes = 0
  try {
    fileSizeBytes = fs.statSync(filePath).size
  } catch (error) {
    return { ok: false, container: '', box_scan: 'unavailable', box_types: [], reason: `无法读取本地文件信息：${error?.message || ''}` }
  }

  if (!(fileSizeBytes > 0)) {
    return { ok: false, container: '', box_scan: 'unavailable', box_types: [], reason: '本地文件为空（0 字节）' }
  }

  let container = INPUT_CONTAINERS.unknown
  try {
    container = detectInputContainer(readInputHeadBuffer(filePath, INPUT_HEAD_SAMPLE_BYTES))
  } catch {
    container = INPUT_CONTAINERS.unknown
  }

  if (container !== INPUT_CONTAINERS.mp4) {
    return {
      ok: true,
      container,
      box_scan: 'skipped',
      box_types: [],
      has_moov: false,
      size_bytes: fileSizeBytes
    }
  }

  const scan = scanMp4BoxChain({ filePath, fileSizeBytes })

  return scan.ok
    ? {
      ok: true,
      container,
      box_scan: 'scanned',
      box_types: scan.box_types || [],
      has_moov: true,
      size_bytes: fileSizeBytes
    }
    : {
      ok: false,
      container,
      box_scan: 'scanned',
      box_types: scan.box_types || [],
      reason: scan.reason || '盒子链未闭合'
    }
}

module.exports = {
  MP4_BOX_SCAN_MAX_BOXES,
  isPlausibleBoxType,
  scanMp4BoxChain,
  verifyDownloadedInputStructure
}
