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
  ttsSimple: 'tts_simple'
});
const DEFAULT_FFMPEG_AUDIO_ARGS = ['-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on', '-compression_level', '10', '-application', 'audio'];

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

const fetchQueuedJobs = async ({ db, limit = 1 }) => {
  const result = await db.collection(AUDIO_TRANSCODE_JOBS_COLLECTION)
    .where({ status: JOB_STATUS.queued })
    .limit(limit)
    .get();

  return result?.data || [];
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
