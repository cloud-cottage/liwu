#!/usr/bin/env node

/**
 * CloudBase 云存储文件迁移
 *
 * 环境变量：
 *   SOURCE_ACCESS_KEY   源账号 API Key
 *   TARGET_ACCESS_KEY   目标账号 API Key
 *
 * 用法：
 *   node scripts/migrations/20260805_migrate_storage.mjs           # dry-run
 *   node scripts/migrations/20260805_migrate_storage.mjs --write   # 实际迁移
 */

import cloudbase from '@cloudbase/node-sdk';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseFlag, hasFlag } from './lib/cloudbase-nosql.mjs';

const SOURCE_ENV = 'liwu-0gtd91eebd863ccf';
const TARGET_ENV = 'liwu-d8gek6jjdab1d087c';
const TMP_DIR = path.join(os.tmpdir(), 'liwu-storage-migration');

// 从数据库中扫描出的所有云存储文件
const FILES = [
  // 品牌轮播图
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/liwu/brand-carousel/brand_slide_1-1776763269677.webp',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/liwu/brand-carousel/brand_slide_2-1776763278986.webp',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/liwu/brand-carousel/brand_slide_3-1776763463996.webp',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/liwu/brand-carousel/brand_slide_4-1776763483216.webp',
  // 用户头像选项
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/liwu/user-avatar-options/avatar_01-1777955908772.webp',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/liwu/user-avatar-options/avatar_02-1776938171936.webp',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/liwu/user-avatar-options/avatar_03-1776939844639.webp',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/liwu/user-avatar-options/avatar_04-1776939892958.webp',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/liwu/user-avatar-options/avatar_05-1776939859489.webp',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/liwu/user-avatar-options/avatar_06-1776939876112.webp',
  // 冥想音频
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/bowl/1780386216116-rv16y-bowl1.opus',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/goodbye/1780399463274-4g1yc.mp3',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/goodbye/1780399503605-xjbno.mp3',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/goodbye/1780399568137-ukn3i.mp3',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/goodbye/1780399616549-0sem1.mp3',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/nature/nature-default/1780442019215-by3xr-gentle-ocean-waves-crashing-on_060226.mp3',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/greeting/greeting-settling/1780442115432-ndzix.mp3',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/greeting/greeting-posture/1780442160611-9ggja.mp3',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/greeting/greeting-breath-guidance/1780442205613-tkbhc.mp3',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/breath/breath-opening/1780442237481-8vpo0.mp3',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/breath/breath-main/1780442300311-0tb6g.mp3',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/quote/quote-logic/1780442422881-7xrtn.mp3',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/quote/quote-reinforcement/1780442555686-hfq53.mp3',
  'cloud://liwu-0gtd91eebd863ccf.6c69-liwu-0gtd91eebd863ccf-1400600646/meditation-audio/greeting/greeting-self-intro/1780449777627-58rdt.mp3',
];

const extractCloudPath = (fileId) => {
  // cloud://env.bucket-uid/path → /path
  const match = fileId.match(/^cloud:\/\/[^/]+\/(.+)$/);
  return match ? match[1] : fileId;
};

const main = async () => {
  const dryRun = !hasFlag('--write');
  const sourceKey = process.env.SOURCE_ACCESS_KEY;
  const targetKey = process.env.TARGET_ACCESS_KEY;

  if (!sourceKey || !targetKey) {
    console.error('缺少 API Key。');
    process.exit(1);
  }

  const srcApp = cloudbase.init({ env: SOURCE_ENV, accessKey: sourceKey });
  const tgtApp = cloudbase.init({ env: TARGET_ENV, accessKey: targetKey });

  console.log('========================================');
  console.log('  CloudBase 存储文件迁移');
  console.log('========================================');
  console.log(`  源: ${SOURCE_ENV}`);
  console.log(`  目标: ${TARGET_ENV}`);
  console.log(`  文件数: ${FILES.length}`);
  console.log(`  模式: ${dryRun ? 'DRY-RUN' : 'WRITE'}`);
  console.log('========================================\n');

  fs.mkdirSync(TMP_DIR, { recursive: true });

  let ok = 0, fail = 0;

  for (const fileId of FILES) {
    const cloudPath = extractCloudPath(fileId);
    const fileName = path.basename(cloudPath);
    const localPath = path.join(TMP_DIR, fileName);

    console.log(`📄 ${cloudPath}`);

    if (dryRun) {
      console.log(`   🔍 [DRY-RUN] cloud://${SOURCE_ENV}/${cloudPath} → cloud://${TARGET_ENV}/${cloudPath}`);
      continue;
    }

    // 1. 下载
    try {
      const dl = await srcApp.downloadFile({ fileID: fileId });
      fs.writeFileSync(localPath, Buffer.from(dl.fileContent, 'base64'));
      console.log(`   ✅ 下载: ${(dl.fileContent.length / 1024).toFixed(1)}KB`);
    } catch (e) {
      console.error(`   ❌ 下载失败: ${e.message}`);
      fail++;
      continue;
    }

    // 2. 上传到目标
    try {
      const up = await tgtApp.uploadFile({
        cloudPath,
        fileContent: fs.readFileSync(localPath)
      });
      console.log(`   ✅ 上传: ${up.fileID}`);
      ok++;
    } catch (e) {
      console.error(`   ❌ 上传失败: ${e.message}`);
      fail++;
    }

    // 清理临时文件
    try { fs.unlinkSync(localPath); } catch {}
  }

  console.log('\n========================================');
  console.log(`  成功: ${ok} | 失败: ${fail}`);
  console.log('========================================');

  if (dryRun) {
    console.log('\n🔍 Dry-run 完成。执行 --write 实际迁移。');
  }

  // 清理临时目录
  try { fs.rmdirSync(TMP_DIR); } catch {}
};

main().catch(e => {
  console.error('异常:', e);
  process.exit(1);
});
