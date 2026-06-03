/* global Buffer */

const REGION = 'ap-guangzhou';
const HOST = 'tts.tencentcloudapi.com';
const DEFAULT_VOICE_TYPE = 1001;
const FAST_VOICE_CLONE_VOICE_TYPE = 200000000;
const MAX_TTS_CHINESE_CHARS = 150;
const QUOTA_EXHAUSTED_CODE_SET = new Set([
  'UnsupportedOperation.PkgExhausted',
  'UnsupportedOperation.NoFreeAccount'
]);
const TEXT_TOO_LONG_CODE_SET = new Set([
  'InvalidParameterValue.TextTooLong',
  'UnsupportedOperation.TextTooLong'
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

const readFirstPopulatedEnv = (envSource, keys) => {
  for (const key of keys) {
    const value = envSource[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

const getTencentSecrets = (envSource = process.env) => {
  const secretId = readFirstPopulatedEnv(envSource, [
    'TENCENT_SECRET_ID',
    'TENCENTCLOUD_SECRET_ID',
    'VITE_TENCENT_SECRET_ID',
    'VITE_TENCENTCLOUD_SECRET_ID'
  ]);
  const secretKey = readFirstPopulatedEnv(envSource, [
    'TENCENT_SECRET_KEY',
    'TENCENTCLOUD_SECRET_KEY',
    'VITE_TENCENT_SECRET_KEY',
    'VITE_TENCENTCLOUD_SECRET_KEY'
  ]);
  return { secretId, secretKey };
};

const getTencentVoiceConfig = (envSource = process.env, requestOptions = {}) => {
  const fastVoiceType = String(
    requestOptions.fastVoiceType
    || readFirstPopulatedEnv(envSource, [
      'TENCENT_TTS_FAST_VOICE_TYPE',
      'TENCENT_FAST_VOICE_TYPE',
      'VITE_TENCENT_TTS_FAST_VOICE_TYPE',
      'VITE_TENCENT_FAST_VOICE_TYPE'
    ])
  ).trim();

  const voiceTypeSource = requestOptions.voiceType ?? readFirstPopulatedEnv(envSource, [
    'TENCENT_TTS_VOICE_TYPE',
    'TENCENT_VOICE_TYPE',
    'VITE_TENCENT_TTS_VOICE_TYPE',
    'VITE_TENCENT_VOICE_TYPE'
  ]);
  const parsedVoiceType = Number(voiceTypeSource);
  const voiceType = fastVoiceType
    ? FAST_VOICE_CLONE_VOICE_TYPE
    : Number.isFinite(parsedVoiceType) && parsedVoiceType > 0
      ? parsedVoiceType
      : DEFAULT_VOICE_TYPE;
  const longVoiceTypeSource = requestOptions.longVoiceType ?? readFirstPopulatedEnv(envSource, [
    'TENCENT_TTS_LONG_VOICE_TYPE',
    'TENCENT_LONG_VOICE_TYPE',
    'VITE_TENCENT_TTS_LONG_VOICE_TYPE',
    'VITE_TENCENT_LONG_VOICE_TYPE'
  ]);
  const parsedLongVoiceType = Number(longVoiceTypeSource);
  const longVoiceType = Number.isFinite(parsedLongVoiceType) && parsedLongVoiceType > 0
    ? parsedLongVoiceType
    : '';

  return { voiceType, fastVoiceType, longVoiceType };
};

const buildAuthorization = async ({ payload, secretId, secretKey, action }) => {
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
    timestamp,
    action
  };
};

const isTextTooLongError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return TEXT_TOO_LONG_CODE_SET.has(code)
    || message.includes('text too long')
    || message.includes('文本过长')
    || message.includes('字符过长');
};

const isSsmlWrappedText = (text = '') => /^<speak[\s>]/i.test(String(text || '').trim());

const normalizeSsmlBreakDurations = (ssmlText = '') => String(ssmlText || '').replace(
  /(<break\b[^>]*\btime\s*=\s*)(["'])(\d+(?:\.\d+)?)s\2/gi,
  (fullMatch, prefix, quote, secondsValue) => {
    const millisecondsValue = Math.round(Number(secondsValue) * 1000);
    if (!Number.isFinite(millisecondsValue) || millisecondsValue <= 0) {
      return fullMatch;
    }

    return `${prefix}${quote}${millisecondsValue}ms${quote}`;
  }
);

const estimateTencentTextLength = (text = '') => {
  let length = 0;
  for (const character of String(text || '')) {
    length += character.charCodeAt(0) > 127 ? 1 : 1;
  }
  return length;
};

const splitPlainTextIntoSegments = (text = '', maxLength = MAX_TTS_CHINESE_CHARS) => {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    return [];
  }

  const segments = [];
  let buffer = '';
  const sentenceFragments = normalizedText
    .split(/(?<=[。！？；.!?;])/u)
    .map((item) => item.trim())
    .filter(Boolean);

  const flushBuffer = () => {
    const nextValue = buffer.trim();
    if (nextValue) {
      segments.push(nextValue);
    }
    buffer = '';
  };

  const appendChunk = (chunk = '') => {
    if (!chunk) {
      return;
    }

    const combinedValue = `${buffer}${chunk}`;
    if (estimateTencentTextLength(combinedValue) <= maxLength) {
      buffer = combinedValue;
      return;
    }

    if (buffer) {
      flushBuffer();
    }

    if (estimateTencentTextLength(chunk) <= maxLength) {
      buffer = chunk;
      return;
    }

    let innerBuffer = '';
    for (const character of chunk) {
      const nextValue = `${innerBuffer}${character}`;
      if (estimateTencentTextLength(nextValue) > maxLength) {
        if (innerBuffer.trim()) {
          segments.push(innerBuffer.trim());
        }
        innerBuffer = character;
      } else {
        innerBuffer = nextValue;
      }
    }
    buffer = innerBuffer;
  };

  sentenceFragments.forEach((fragment) => appendChunk(fragment));
  flushBuffer();

  return segments;
};

const escapeXmlText = (value = '') => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const parseSsmlBody = (ssmlText = '') => {
  const trimmedText = String(ssmlText || '').trim();
  const match = trimmedText.match(/^<speak([^>]*)>([\s\S]*)<\/speak>$/i);
  if (!match) {
    return null;
  }

  return {
    openTag: `<speak${match[1] || ''}>`,
    innerContent: match[2] || '',
    closeTag: '</speak>'
  };
};

const tokenizeSsmlInnerContent = (content = '') => {
  const tokens = [];
  const tokenPattern = /<[^>]+>|[^<]+/g;
  let match = tokenPattern.exec(content);

  while (match) {
    const value = match[0];
    if (value.startsWith('<')) {
      const isClosingTag = /^<\//.test(value);
      const isSelfClosingTag = /\/>$/.test(value);
      const tagNameMatch = value.match(/^<\/?\s*([a-zA-Z0-9:_-]+)/);
      tokens.push({
        type: 'tag',
        value,
        tagName: tagNameMatch?.[1] || '',
        isClosingTag,
        isSelfClosingTag
      });
    } else {
      tokens.push({
        type: 'text',
        value
      });
    }

    match = tokenPattern.exec(content);
  }

  return tokens;
};

const splitSsmlTextToken = (text = '', maxLength = MAX_TTS_CHINESE_CHARS) => {
  const pieces = [];
  const plainSegments = splitPlainTextIntoSegments(text, maxLength);
  plainSegments.forEach((segment) => {
    pieces.push({
      type: 'text',
      value: segment
    });
  });
  return pieces;
};

const rebuildSsmlSegment = (speakOpenTag, segmentTokens, speakCloseTag) => {
  const activeOpenTags = [];
  const fragmentValues = [speakOpenTag];

  segmentTokens.forEach((token) => {
    if (token.type === 'tag') {
      fragmentValues.push(token.value);
      if (!token.isClosingTag && !token.isSelfClosingTag) {
        activeOpenTags.push(token);
      } else if (token.isClosingTag) {
        const lastIndex = [...activeOpenTags].map((item) => item.tagName).lastIndexOf(token.tagName);
        if (lastIndex >= 0) {
          activeOpenTags.splice(lastIndex, 1);
        }
      }
      return;
    }

    fragmentValues.push(escapeXmlText(token.value));
  });

  for (let index = activeOpenTags.length - 1; index >= 0; index -= 1) {
    fragmentValues.push(`</${activeOpenTags[index].tagName}>`);
  }

  fragmentValues.push(speakCloseTag);
  return fragmentValues.join('');
};

const splitSsmlIntoSegments = (ssmlText = '', maxLength = MAX_TTS_CHINESE_CHARS) => {
  const ssmlBody = parseSsmlBody(ssmlText);
  if (!ssmlBody) {
    return [String(ssmlText || '').trim()].filter(Boolean);
  }

  const tokens = tokenizeSsmlInnerContent(ssmlBody.innerContent);
  const segments = [];
  let currentSegmentTokens = [];
  let currentTextLength = 0;

  const flushSegment = () => {
    if (!currentSegmentTokens.length) {
      return;
    }
    segments.push(rebuildSsmlSegment(ssmlBody.openTag, currentSegmentTokens, ssmlBody.closeTag));
    currentSegmentTokens = [];
    currentTextLength = 0;
  };

  tokens.forEach((token) => {
    if (token.type === 'tag') {
      currentSegmentTokens.push(token);
      return;
    }

    const textPieces = splitSsmlTextToken(token.value, maxLength);
    textPieces.forEach((piece) => {
      const pieceLength = estimateTencentTextLength(piece.value);
      if (currentTextLength > 0 && currentTextLength + pieceLength > maxLength) {
        flushSegment();
      }

      currentSegmentTokens.push(piece);
      currentTextLength += pieceLength;
    });
  });

  flushSegment();
  return segments.filter(Boolean);
};

const splitTextForTencentTts = ({ text, isSSML }) => {
  if (isSSML || isSsmlWrappedText(text)) {
    return splitSsmlIntoSegments(normalizeSsmlBreakDurations(text), MAX_TTS_CHINESE_CHARS);
  }

  return splitPlainTextIntoSegments(text, MAX_TTS_CHINESE_CHARS);
};

const requestTencentTtsApi = async ({ action, payloadObject }, envSource = process.env) => {
  const { secretId, secretKey } = getTencentSecrets(envSource);

  if (!secretId || !secretKey) {
    const error = new Error('TTS 服务端缺少腾讯云密钥配置');
    error.statusCode = 500;
    error.userMessage = 'TTS 服务端缺少腾讯云密钥配置。';
    throw error;
  }

  const payload = JSON.stringify(payloadObject);
  const { authorization, timestamp } = await buildAuthorization({ payload, secretId, secretKey, action });
  const response = await fetch(`https://${HOST}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: HOST,
      Authorization: authorization,
      'X-TC-Action': action,
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

  return json?.Response || {};
};

const createQuotaError = (message, code, requestId = '') => {
  const error = new Error(message);
  error.code = code;
  error.requestId = requestId;
  error.statusCode = 429;
  error.userMessage = '腾讯云返回资源包不可用（PkgExhausted）。这通常表示当前密钥对应账号的当前音色资源包已耗尽，或未开通后付费模式。请核对密钥所属账号、资源包类型，以及语音合成后付费开关。';
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
    return createQuotaError(message, code || 'UnsupportedOperation.PkgExhausted', error?.requestId || '');
  }

  const normalizedError = new Error(message);
  normalizedError.code = code;
  normalizedError.requestId = error?.requestId || '';
  normalizedError.statusCode = error?.statusCode || 502;
  normalizedError.userMessage = message;
  return normalizedError;
};

export const synthesizeTencentTtsAudio = async ({ text, voiceType, fastVoiceType }, envSource = process.env) => {
  const voiceConfig = getTencentVoiceConfig(envSource, { voiceType, fastVoiceType });
  const payloadObject = {
    Text: text,
    SessionId: `admin-${Date.now()}`,
    ProjectId: 0,
    ModelType: 1,
    VoiceType: voiceConfig.voiceType,
    PrimaryLanguage: 1,
    SampleRate: 16000,
    Codec: 'mp3',
    SegmentRate: 2
  };
  if (voiceConfig.fastVoiceType) {
    payloadObject.FastVoiceType = voiceConfig.fastVoiceType;
  }
  const response = await requestTencentTtsApi({
    action: 'TextToVoice',
    payloadObject
  }, envSource);

  if (!response?.Audio) {
    const invalidResponseError = new Error('腾讯云 TTS 未返回音频数据');
    invalidResponseError.statusCode = 502;
    invalidResponseError.userMessage = '腾讯云 TTS 未返回音频数据。';
    throw invalidResponseError;
  }

  return Buffer.from(response.Audio, 'base64');
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
    const fastVoiceType = String(body?.fastVoiceType || '').trim();
    const requestVoiceType = body?.voiceType;
    const isSSML = Boolean(body?.isSSML);

    if (!text) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'invalid_text', message: '缺少待合成文本。' }));
      return;
    }

    const textSegments = splitTextForTencentTts({ text, isSSML });
    if (textSegments.length === 0) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'invalid_text', message: '缺少可合成的文本内容。' }));
      return;
    }

    const audioBuffers = [];
    for (const segmentText of textSegments) {
      const audioBuffer = await synthesizeTencentTtsAudio({
        text: segmentText,
        voiceType: requestVoiceType,
        fastVoiceType
      }, envSource);
      audioBuffers.push(audioBuffer);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.concat(audioBuffers));
  } catch (error) {
    const normalizedError = normalizeTencentError(error);
    res.statusCode = normalizedError.statusCode || 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: normalizedError.code || 'tts_failed',
      message: normalizedError.message,
      userMessage: normalizedError.userMessage,
      requestId: normalizedError.requestId || ''
    }));
  }
};
