#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_ENV_ID = process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || 'liwu-d8gek6jjdab1d087c';
const DEFAULT_BATCH_SIZE = 200;

export const getEnvId = (argv = process.argv.slice(2)) => {
  const envFlagIndex = argv.findIndex((entry) => entry === '--env' || entry === '--env-id' || entry === '-e');
  if (envFlagIndex >= 0 && argv[envFlagIndex + 1]) {
    return argv[envFlagIndex + 1];
  }
  return DEFAULT_ENV_ID;
};

export const parseFlag = (flagName, argv = process.argv.slice(2)) => {
  const index = argv.findIndex((entry) => entry === flagName);
  if (index < 0) {
    return null;
  }
  return argv[index + 1] || null;
};

export const hasFlag = (flagName, argv = process.argv.slice(2)) => argv.includes(flagName);

const extractJsonPayload = (text = '') => {
  const trimmed = String(text || '').trim();
  const firstBraceIndex = trimmed.indexOf('{');
  const lastBraceIndex = trimmed.lastIndexOf('}');
  if (firstBraceIndex < 0 || lastBraceIndex < firstBraceIndex) {
    throw new Error(`Unable to parse CloudBase JSON payload from output:\n${trimmed}`);
  }
  return JSON.parse(trimmed.slice(firstBraceIndex, lastBraceIndex + 1));
};

export const runNosqlCommands = async ({
  envId = DEFAULT_ENV_ID,
  commands = []
} = {}) => {
  if (!envId) {
    throw new Error('Missing CloudBase envId');
  }

  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error('No NoSQL commands provided');
  }

  const args = [
    'db',
    'nosql',
    'execute',
    '-e',
    envId,
    '--json',
    '--command',
    JSON.stringify(commands)
  ];

  const { stdout, stderr } = await execFileAsync('cloudbase', args, {
    maxBuffer: 20 * 1024 * 1024
  });

  if (stderr && String(stderr).trim()) {
    const stderrText = String(stderr).trim();
    if (!stderrText.startsWith('- Loading data')) {
      console.error(stderrText);
    }
  }

  return extractJsonPayload(stdout);
};

export const queryCollection = async ({
  envId = DEFAULT_ENV_ID,
  collectionName,
  filter = {},
  sort = { _id: 1 },
  skip = 0,
  limit = DEFAULT_BATCH_SIZE
} = {}) => {
  const command = {
    find: collectionName,
    filter,
    sort,
    skip,
    limit
  };

  const payload = await runNosqlCommands({
    envId,
    commands: [
      {
        TableName: collectionName,
        CommandType: 'QUERY',
        Command: JSON.stringify(command)
      }
    ]
  });

  return payload?.data?.results?.[0] || [];
};

export const countCollection = async ({
  envId = DEFAULT_ENV_ID,
  collectionName,
  filter = {}
} = {}) => {
  const payload = await runNosqlCommands({
    envId,
    commands: [
      {
        TableName: collectionName,
        CommandType: 'COMMAND',
        Command: JSON.stringify({
          count: collectionName,
          query: filter
        })
      }
    ]
  });

  const result = payload?.data?.results?.[0]?.[0] || {};
  return Number(result?.n?.$numberInt ?? result?.n ?? 0);
};

export const fetchAllCollection = async ({
  envId = DEFAULT_ENV_ID,
  collectionName,
  filter = {},
  sort = { _id: 1 },
  batchSize = DEFAULT_BATCH_SIZE
} = {}) => {
  const documents = [];
  let skip = 0;

  while (true) {
    const batch = await queryCollection({
      envId,
      collectionName,
      filter,
      sort,
      skip,
      limit: batchSize
    });

    documents.push(...batch);

    if (batch.length < batchSize) {
      break;
    }

    skip += batch.length;
  }

  return documents;
};

export const insertDocument = async ({
  envId = DEFAULT_ENV_ID,
  collectionName,
  document
} = {}) => runNosqlCommands({
  envId,
  commands: [
    {
      TableName: collectionName,
      CommandType: 'INSERT',
      Command: JSON.stringify({
        insert: collectionName,
        documents: [document]
      })
    }
  ]
});

export const updateDocument = async ({
  envId = DEFAULT_ENV_ID,
  collectionName,
  filter,
  patch
} = {}) => runNosqlCommands({
  envId,
  commands: [
    {
      TableName: collectionName,
      CommandType: 'UPDATE',
      Command: JSON.stringify({
        update: collectionName,
        updates: [
          {
            q: filter,
            u: {
              $set: patch
            }
          }
        ]
      })
    }
  ]
});

export const getDocumentId = (document = {}) => document?._id || document?.id || '';
