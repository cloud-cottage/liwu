/* global Buffer */

const REGION = 'ap-guangzhou';
const HOST = 'tts.tencentcloudapi.com';
const DEFAULT_VOICE_TYPE = 1001;
const QUOTA_EXHAUSTED_CODE_SET = new Set([
  'UnsupportedOperation.PkgExhausted',
  'UnsupportedOperation.NoFreeAccount'
]);

const readRawBody = async (req) => {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
};

const sha256hex = async (value) => {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const hmacSha256 = async (key, data) => {
  const keyBuffer = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)));
};

const bufferToHex = (buffer) => (
  Array.from(buffer).map((byte) => byte.toString(16).padStart(2, '0')).join('')
);

const getTencentSecrets = (envSource = process.env) => {
  const secretId = envSource.TENCENT_SECRET_ID || envSource.VITE_TENCENT_SECRET_ID || '';
  const secretKey = envSource.TENCENT_SECRET_KEY || envSource.VITE_TENCENT_SECRET_KEY || '';
  return { secretId, secretKey };
};

const buildAuthorization = async ({ payload, secretId, secretKey }) => {
  const date = new Date().toISOString().slice(0, 10);
  const timestamp = Math.floor(Date.now() / 1000);
  const service = 'tts';
  const algorithm = 'TC3-HMAC-SHA256';
  const credentialScope = `${date}/${service}/tc3_request`;

  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:application/json\nhost:${HOST}\n`,
    'content-type;host',
    await sha256hex(payload)
  ].join('\n');

  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    await sha256hex(canonicalRequest)
  ].join('\n');

  const dateKey = await hmacSha256(`TC3${secretKey}`, date);
  const serviceKey = await hmacSha256(dateKey, service);
  const signingKey = await hmacSha256(await hmacSha256(serviceKey, 'tc3_request'), stringToSign);

  return {
    authorization: `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${bufferToHex(signingKey)}`,
    timestamp
  };
};

const createQuotaError = (message, code) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 429;
  error.userMessage = '腾讯云 TTS 资源包已耗尽。当前文本已保留，你可以先补传音频文件，或在腾讯云语音合成中领取免费资源包、开通后付费后再重试。';
  return error;
};

const normalizeTencentError = (error) => {
  if (error?.userMessage) {
    return error;
  }

  const code = error?.code || '';
  const message = error?.message || '腾讯云 TTS 调用失败';
  const lowerMessage = String(message).toLowerCase();
  const isQuotaExhausted = QUOTA_EXHAUSTED_CODE_SET.has(code)
    || lowerMessage.includes('resource pack allowance has been exhausted')
    || lowerMessage.includes('pkgexhausted');

  if (isQuotaExhausted) {
    return createQuotaError(message, code || 'UnsupportedOperation.PkgExhausted');
  }

  const normalizedError = new Error(message);
  normalizedError.code = code;
  normalizedError.statusCode = error?.statusCode || 502;
  normalizedError.userMessage = message;
  return normalizedError;
};

export const synthesizeTencentTtsAudio = async ({ text }, envSource = process.env) => {
  const { secretId, secretKey } = getTencentSecrets(envSource);

  if (!secretId || !secretKey) {
    const error = new Error('TTS 服务端缺少腾讯云密钥配置');
    error.statusCode = 500;
    error.userMessage = 'TTS 服务端缺少腾讯云密钥配置。';
    throw error;
  }

  const payload = JSON.stringify({
    Text: text,
    SessionId: `admin-${Date.now()}`,
    ProjectId: 0,
    ModelType: 1,
    VoiceType: DEFAULT_VOICE_TYPE,
    PrimaryLanguage: 1,
    SampleRate: 16000,
    Codec: 'mp3',
    SegmentRate: 2
  });

  const { authorization, timestamp } = await buildAuthorization({ payload, secretId, secretKey });
  const response = await fetch(`https://${HOST}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: HOST,
      Authorization: authorization,
      'X-TC-Action': 'TextToVoice',
      'X-TC-Version': '2019-08-23',
      'X-TC-Region': REGION,
      'X-TC-Timestamp': String(timestamp)
    },
    body: payload
  });

  const json = await response.json();
  if (json?.Response?.Error) {
    const apiError = new Error(json.Response.Error.Message || '腾讯云 TTS 调用失败');
    apiError.code = json.Response.Error.Code || '';
    apiError.requestId = json.Response.RequestId || '';
    throw normalizeTencentError(apiError);
  }

  if (!json?.Response?.Audio) {
    const invalidResponseError = new Error('腾讯云 TTS 未返回音频数据');
    invalidResponseError.statusCode = 502;
    invalidResponseError.userMessage = '腾讯云 TTS 未返回音频数据。';
    throw invalidResponseError;
  }

  return Buffer.from(json.Response.Audio, 'base64');
};

export const handleTencentTtsProxy = async (req, res, envSource = process.env) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'method_not_allowed', message: 'Only POST is supported.' }));
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    const body = rawBody.length > 0 ? JSON.parse(rawBody.toString('utf8')) : {};
    const text = String(body?.text || '').trim();

    if (!text) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'invalid_text', message: '缺少待合成文本。' }));
      return;
    }

    const audioBuffer = await synthesizeTencentTtsAudio({ text }, envSource);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.end(audioBuffer);
  } catch (error) {
    const normalizedError = normalizeTencentError(error);
    res.statusCode = normalizedError.statusCode || 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: normalizedError.code || 'tts_failed',
      message: normalizedError.message,
      userMessage: normalizedError.userMessage
    }));
  }
};
