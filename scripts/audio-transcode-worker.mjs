#!/usr/bin/env node

import tcb from '@cloudbase/node-sdk';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const APP_SETTINGS_COLLECTION = 'app_settings';
const AUDIO_TRANSCODE_JOBS_COLLECTION = 'audio_transcode_jobs';
const MEDITATION_AUDIO_LIBRARY_KEY = 'meditation_audio_library';
const DEFAULT_ENV_ID = process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || 'liwu-d8gek6jjdab1d087c';
const JOB_STATUS = Object.freeze({
  queued: 'queued',
  processing: 'processing',
  succeeded: 'succeeded',
  failed: 'failed'
});
const TRANSCODE_PROFILE = Object.freeze({
  default: 'default',
  nature: 'nature',
  ttsSimple: 'tts_simple',
  // D-B2-9 队列分区：新链路（冥想段落音频，云函数 meditation-transcoder）专用 profile。
  // 字面值与排队方一致（MeditationPage.jsx `transcode_profile: 'section_audio'`）；本 worker
  // **必须跳过**带该 profile 的 job，否则会把新链路的 job 吃掉（见下方 fetchQueuedJobs 守卫）。
  // v4.22 / R45 起另有 `track_mix`（Track 级服务端预混）分区：**不在下方白名单内 ⇒ 同样跳过**。
  sectionAudio: 'section_audio'
});
// Kevin（用户）2026-09-24 裁定：Opus 主体改 **48k 立体声硬 CBR** ⇒ `-b:a 48k -vbr off -ac 2 -ar 48000`。
// `-vbr off` 必须保留（48k VBR 实测漂到 ≈73kbps，预算不可控）；不再下混单声道。
// 旧值 `-b:a 48k -vbr on -compression_level 10 -application audio` 已废弃（VBR 下 `-b:a` 不可控）。
// 输出容器由扩展名决定：本 worker 现有 `<tmp>/output.opus`（第 295 行）与 `.ogg` 同为 Ogg 封装，未改。
// 同步责任：与 cloudfunctions/meditation-transcoder/lib/transcode-command.js 同口径，两处必须同步。
const DEFAULT_FFMPEG_AUDIO_ARGS = ['-c:a', 'libopus', '-b:a', '48k', '-vbr', 'off', '-ac', '2', '-ar', '48000'];

const parseArgs = (argv = process.argv.slice(2)) => ({
  envId: (() => {
    const envFlagIndex = argv.findIndex((entry) => entry === '--env' || entry === '--env-id' || entry === '-e');
    return envFlagIndex >= 0 && argv[envFlagIndex + 1] ? argv[envFlagIndex + 1] : DEFAULT_ENV_ID;
  })(),
  limit: Math.max(1, Number((argv[argv.indexOf('--limit') + 1]) || 1) || 1),
  loop: argv.includes('--loop'),
  intervalMs: Math.max(1000, Number((argv[argv.indexOf('--interval-ms') + 1]) || 5000) || 5000)
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getDocumentId = (document = {}) => document?._id || document?.id || '';

const loadEnvFiles = (paths = []) => {
  const env = {};

  for (const filePath of paths) {
    if (!existsSync(filePath)) {
      continue;
    }

    const fileContent = readFileSync(filePath, 'utf8');
    for (const rawLine of fileContent.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) {
        continue;
      }

      const separatorIndex = line.indexOf('=');
      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();
      value = value.replace(/^['"]|['"]$/g, '');
      if (key && env[key] === undefined) {
        env[key] = value;
      }
    }
  }

  return env;
};

const LOCAL_ENV = loadEnvFiles([
  path.resolve('.env'),
  path.resolve('apps/web/.env')
]);

const readEnvValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key] || LOCAL_ENV[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

const getCloudBaseApp = (envId) => {
  const secretId = readEnvValue('TENCENT_SECRET_ID', 'TENCENTCLOUD_SECRET_ID', 'VITE_TENCENT_SECRET_ID');
  const secretKey = readEnvValue('TENCENT_SECRET_KEY', 'TENCENTCLOUD_SECRET_KEY', 'VITE_TENCENT_SECRET_KEY');

  if (!secretId || !secretKey) {
    throw new Error('MISSING_TENCENT_CREDENTIALS');
  }

  return tcb.init({
    env: envId,
    secretId,
    secretKey
  });
};

const buildCloudBaseFileId = (envId, cloudPath) => `cloud://${envId}/${String(cloudPath || '').replace(/^\/+/, '')}`;

const parseLoudnormJsonFromStderr = (stderrText = '') => {
  const normalizedText = String(stderrText || '');
  const markerIndex = normalizedText.lastIndexOf('[Parsed_loudnorm');
  const searchStart = markerIndex >= 0 ? markerIndex : 0;
  const startIndex = normalizedText.indexOf('{', searchStart);
  const endIndex = normalizedText.lastIndexOf('}');
  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error('LOUDNORM_JSON_NOT_FOUND');
  }

  return JSON.parse(normalizedText.slice(startIndex, endIndex + 1));
};

const buildLoudnormSecondPassFilter = (metrics = {}, profile = TRANSCODE_PROFILE.default) => {
  const loudnormFilter = [
    'loudnorm=I=-18',
    'TP=-1.5',
    'LRA=15',
    'linear=true',
    `measured_I=${metrics.input_i}`,
    `measured_TP=${metrics.input_tp}`,
    `measured_LRA=${metrics.input_lra}`,
    `measured_thresh=${metrics.input_thresh}`,
    `offset=${metrics.target_offset}`,
    'print_format=summary'
  ].join(':');

  if (profile === TRANSCODE_PROFILE.nature) {
    return `${loudnormFilter},volume=0.2`;
  }

  return loudnormFilter;
};

const runFfmpegTwoPassLoudnorm = async ({ inputPath, outputPath, profile }) => {
  const firstPass = await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-sn',
    '-dn',
    '-af',
    'loudnorm=I=-18:TP=-1.5:LRA=15:linear=true:print_format=json',
    '-f',
    'null',
    '-'
  ], {
    maxBuffer: 20 * 1024 * 1024
  }).catch((error) => ({
    stdout: error.stdout || '',
    stderr: error.stderr || '',
    code: error.code
  }));

  const metrics = parseLoudnormJsonFromStderr(firstPass.stderr || '');
  const secondPassFilter = buildLoudnormSecondPassFilter(metrics, profile);

  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-sn',
    '-dn',
    '-af',
    secondPassFilter,
    ...DEFAULT_FFMPEG_AUDIO_ARGS,
    outputPath
  ], {
    maxBuffer: 20 * 1024 * 1024
  });

  return metrics;
};

const runFfmpegSimpleOpusTranscode = async ({ inputPath, outputPath, profile }) => {
  const audioFilters = profile === TRANSCODE_PROFILE.nature ? ['-af', 'volume=0.2'] : [];

  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-sn',
    '-dn',
    ...audioFilters,
    ...DEFAULT_FFMPEG_AUDIO_ARGS,
    outputPath
  ], {
    maxBuffer: 20 * 1024 * 1024
  });

  return null;
};

const probeAudioDurationSeconds = async (filePath) => {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath
  ]);

  return Math.max(0, Number(String(stdout || '').trim()) || 0);
};

const processTranscode = async ({ inputPath, outputPath, profile }) => {
  if (profile === TRANSCODE_PROFILE.ttsSimple) {
    return runFfmpegSimpleOpusTranscode({ inputPath, outputPath, profile });
  }

  return runFfmpegTwoPassLoudnorm({ inputPath, outputPath, profile });
};

const getMeditationAudioLibraryDocument = async (db) => {
  const result = await db.collection(APP_SETTINGS_COLLECTION).where({ key: MEDITATION_AUDIO_LIBRARY_KEY }).limit(1).get();
  return (result?.data || [])[0] || null;
};

const updateMeditationAudioItem = async ({ db, itemId, patch }) => {
  const libraryDocument = await getMeditationAudioLibraryDocument(db);
  if (!libraryDocument) {
    throw new Error('MEDITATION_AUDIO_LIBRARY_NOT_FOUND');
  }

  const items = Array.isArray(libraryDocument.items) ? libraryDocument.items : [];
  const nextItems = items.map((item) => (
    String(item.id || item._id || '') === String(itemId || '')
      ? { ...item, ...patch }
      : item
  ));

  await db.collection(APP_SETTINGS_COLLECTION)
    .doc(getDocumentId(libraryDocument))
    .update({
      items: nextItems,
      updated_at: new Date()
    });
};

const updateJob = async ({ db, jobId, patch }) => {
  await db.collection(AUDIO_TRANSCODE_JOBS_COLLECTION)
    .doc(jobId)
    .update(patch);
};

// 【队列领取白名单（**白名单而非黑名单**，D-B2-9 分区守卫的正确形态）】
// 本 worker 只领取**它自己实现得了**的 profile —— 即本文件真正带处理分支的那三个：
// `default`（两遍 loudnorm）/ `nature`（两遍 loudnorm ＋ volume=0.2）/ `tts_simple`（单遍 Opus），
// 分支见 processTranscode / buildLoudnormSecondPassFilter / runFfmpegSimpleOpusTranscode。
// **凡不在本清单的 profile 一律跳过**（不领取、不改状态、不写任何回写字段）——当前命中：
//   · `section_audio`（云函数 meditation-transcoder 的段落音频分区，D-B2-9）
//   · `track_mix`（Track 级服务端预混分区，R45；排队方 meditationTrackMixJob.js）
//   · 以及**任何未来新增的 profile 字面值**。
// ⚠ **为什么必须是白名单**：旧写法是黑名单 `job.transcode_profile !== 'section_audio'`，
//   含义是「除 section_audio 以外都领」⇒ 新增 profile 时**默认失败**：`track_mix` 一上线就被本地
//   worker 当自己的活吃掉，用旧的单输入双路链路处理它（错产物）并回写老字段（误写）。
//   白名单把「新增 profile」默认划到**跳过侧**：必须显式加进本清单才会被领取
//   ⇒ 未来新增分区不会再踩同一个坑（这就是本次改动的理由，不是为 track_mix 打单点补丁）。
const WORKER_CLAIMABLE_PROFILES = Object.freeze([
  TRANSCODE_PROFILE.default,
  TRANSCODE_PROFILE.nature,
  TRANSCODE_PROFILE.ttsSimple
]);

// 老口径保留：profile 缺失/空串一律按 `default` 处理（排队方默认值也是 'default'，
// 见 database.js#createMeditationAudioTranscodeJob 的 `jobData.transcodeProfile || 'default'`）。
const normalizeJobProfile = (job) => String(job?.transcode_profile || '').trim() || TRANSCODE_PROFILE.default;

const isClaimableByThisWorker = (job) => WORKER_CLAIMABLE_PROFILES.includes(normalizeJobProfile(job));

const fetchQueuedJobs = async ({ db, limit = 1 }) => {
  const result = await db.collection(AUDIO_TRANSCODE_JOBS_COLLECTION)
    .where({ status: JOB_STATUS.queued })
    .limit(limit)
    .get();

  // D-B2-9 队列分区守卫（**白名单**，理由见 WORKER_CLAIMABLE_PROFILES 上方注释）：
  // section_audio 归云函数 meditation-transcoder、track_mix 归云侧混音消费，本 worker 一律跳过。
  // 跳过 ＝ 不领取、不改状态、不写回写字段（跳过而非失败；绝不把别的分区的 job 置 processing / failed）。
  // ⚠ 上线纪律：启用新执行器前先停掉 `npm run audio:transcode-worker:loop`，且同一时刻只允许一侧消费。
  const queuedJobs = result?.data || [];
  const skippedByProfile = {};
  const claimableJobs = [];

  for (const job of queuedJobs) {
    if (isClaimableByThisWorker(job)) {
      claimableJobs.push(job);
      continue;
    }

    const profileKey = normalizeJobProfile(job);
    skippedByProfile[profileKey] = (skippedByProfile[profileKey] || 0) + 1;
  }

  // 跳过计数：一行汇总，按 profile 分列；仅在确有跳过时打印 ⇒ 不刷屏、无调试代码。
  if (claimableJobs.length !== queuedJobs.length) {
    console.log(`[audio-transcode-worker] 跳过非本 worker profile 的 job ${queuedJobs.length - claimableJobs.length} 条：${JSON.stringify(skippedByProfile)}`);
  }

  return claimableJobs;
};

const processJob = async ({ app, db, envId, job }) => {
  const now = new Date().toISOString();
  const jobId = getDocumentId(job);
  const attemptCount = Math.max(0, Number(job.attempt_count || 0)) + 1;

  await updateJob({
    db,
    jobId,
    patch: {
      status: JOB_STATUS.processing,
      attempt_count: attemptCount,
      error_message: '',
      updated_at: new Date()
    }
  });

  await updateMeditationAudioItem({
    db,
    itemId: job.item_id,
    patch: {
      transcode_status: JOB_STATUS.processing,
      transcode_error: '',
      transcode_job_id: jobId,
      transcode_updated_at: now,
      loudness_profile: job.transcode_profile || TRANSCODE_PROFILE.default
    }
  });

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'liwu-audio-transcode-'));
  const inputExtension = path.extname(String(job.source_file_name || 'audio.bin')) || '.bin';
  const inputPath = path.join(tmpRoot, `input${inputExtension}`);
  const outputPath = path.join(tmpRoot, 'output.opus');
  const sourceFileId = String(job.source_file_id || '').trim() || buildCloudBaseFileId(envId, job.source_cloud_path || '');

  try {
    await app.downloadFile({
      fileID: sourceFileId,
      tempFilePath: inputPath
    });

    const pass1Metrics = await processTranscode({
      inputPath,
      outputPath,
      profile: job.transcode_profile || TRANSCODE_PROFILE.default
    });

    const fileContent = await readFile(outputPath);
    const outputFileId = await app.uploadFile({
      cloudPath: job.target_cloud_path,
      fileContent
    }).then((result) => result.fileID || result.fileId || buildCloudBaseFileId(envId, job.target_cloud_path));

    const outputDuration = await probeAudioDurationSeconds(outputPath);
    const completedAt = new Date().toISOString();

    await updateMeditationAudioItem({
      db,
      itemId: job.item_id,
      patch: {
        file_id: outputFileId,
        audio_url: '',
        duration: outputDuration,
        transcode_status: JOB_STATUS.succeeded,
        transcode_error: '',
        transcode_job_id: jobId,
        transcode_updated_at: completedAt,
        loudness_profile: job.transcode_profile || TRANSCODE_PROFILE.default
      }
    });

    await updateJob({
      db,
      jobId,
      patch: {
        status: JOB_STATUS.succeeded,
        output_file_id: outputFileId,
        output_audio_url: '',
        output_duration: outputDuration,
        pass1_metrics_json: pass1Metrics ? JSON.stringify(pass1Metrics) : '',
        updated_at: new Date()
      }
    });

    return {
      jobId,
      status: JOB_STATUS.succeeded
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    await updateMeditationAudioItem({
      db,
      itemId: job.item_id,
      patch: {
        transcode_status: JOB_STATUS.failed,
        transcode_error: error?.message || 'TRANSCODE_FAILED',
        transcode_job_id: jobId,
        transcode_updated_at: failedAt
      }
    }).catch(() => {});

    await updateJob({
      db,
      jobId,
      patch: {
        status: JOB_STATUS.failed,
        error_message: error?.message || 'TRANSCODE_FAILED',
        updated_at: new Date()
      }
    }).catch(() => {});

    return {
      jobId,
      status: JOB_STATUS.failed,
      error: error?.message || 'TRANSCODE_FAILED'
    };
  } finally {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
};

const runOnce = async ({ app, db, envId, limit }) => {
  const jobs = await fetchQueuedJobs({ db, limit });
  const results = [];

  for (const job of jobs) {
    results.push(await processJob({ app, db, envId, job }));
  }

  return {
    envId,
    processed: jobs.length,
    results
  };
};

const main = async () => {
  const { envId, limit, loop, intervalMs } = parseArgs();
  const app = getCloudBaseApp(envId);
  const db = app.database();

  if (loop) {
    while (true) {
      const result = await runOnce({ app, db, envId, limit });
      console.log(JSON.stringify(result, null, 2));
      await sleep(intervalMs);
    }
  }

  const result = await runOnce({ app, db, envId, limit });
  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
