/* global Buffer */
export const config = {
  api: {
    bodyParser: false
  }
};

const ADMIN_API_KEY = process.env.CLOUDBASE_ADMIN_API_KEY || '';

const DB_WRITE_URL_PATTERNS = [
  '/documents',
  '/update',
  '/add',
  '/remove',
  '/set',
];

const isDbWriteOperation = (target, method) => {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  try {
    const url = new URL(target);
    return DB_WRITE_URL_PATTERNS.some((p) => url.pathname.includes(p));
  } catch {
    return false;
  }
};

const REQUEST_HEADER_BLOCKLIST = new Set([
  'host',
  'connection',
  'content-length',
  'origin',
  'referer',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'x-real-ip'
]);

const RESPONSE_HEADER_BLOCKLIST = new Set([
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'connection',
  'content-disposition'
]);

const buildRequestId = () => `cbp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const logProxyEvent = (requestId, stage, details = {}) => {
  console.log(JSON.stringify({
    scope: 'cloudbase-proxy',
    requestId,
    stage,
    ...details
  }));
};

const readRawBody = async (req) => {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
};

const isAllowedTarget = (target) => {
  try {
    const targetUrl = new URL(target);
    return (
      targetUrl.hostname.endsWith('.tcb-api.tencentcloudapi.com') ||
      targetUrl.hostname.endsWith('.myqcloud.com') ||
      targetUrl.hostname.endsWith('.qcloud.la') ||
      targetUrl.hostname.endsWith('.tcb.qcloud.la') ||
      targetUrl.hostname.includes('liwu-d8gek6jjdab1d087c') ||
      targetUrl.hostname.includes('-liwu-d8gek6jjdab1d087c.')
    );
  } catch {
    return false;
  }
};

const inferMediaContentType = (target = '') => {
  const normalizedTarget = String(target || '').toLowerCase();
  if (normalizedTarget.includes('.opus')) {
    return 'audio/ogg; codecs=opus';
  }
  if (normalizedTarget.includes('.mp3')) {
    return 'audio/mpeg';
  }
  if (normalizedTarget.includes('.m4a') || normalizedTarget.includes('.aac')) {
    return 'audio/mp4';
  }
  if (normalizedTarget.includes('.wav')) {
    return 'audio/wav';
  }
  if (normalizedTarget.includes('.webp')) {
    return 'image/webp';
  }
  if (normalizedTarget.includes('.png')) {
    return 'image/png';
  }
  if (normalizedTarget.includes('.jpg') || normalizedTarget.includes('.jpeg')) {
    return 'image/jpeg';
  }
  return '';
};

export default async function handler(req, res) {
  const rawRequestId = Array.isArray(req.query?.requestId) ? req.query.requestId[0] : req.query?.requestId;
  const requestId = rawRequestId || buildRequestId();
  const rawTarget = Array.isArray(req.query?.target) ? req.query.target[0] : req.query?.target;
  const startedAt = Date.now();

  if (!rawTarget || !isAllowedTarget(rawTarget)) {
    logProxyEvent(requestId, 'invalid_target', {
      method: req.method,
      rawTarget: rawTarget || ''
    });
    res.status(400).json({ error: 'invalid_target' });
    return;
  }

  logProxyEvent(requestId, 'request_started', {
    method: req.method,
    rawTarget
  });

  try {
    const upstreamHeaders = new Headers();

    Object.entries(req.headers || {}).forEach(([key, value]) => {
      if (REQUEST_HEADER_BLOCKLIST.has(key.toLowerCase()) || value === undefined) {
        return;
      }

      upstreamHeaders.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    });

    const requestBody = ['GET', 'HEAD'].includes(req.method)
      ? undefined
      : await readRawBody(req);

    // Inject admin API key for database write operations.
    // Only elevate requests that carry the x-liwu-admin header (set by
    // the partner admin panel), so regular user writes stay scoped to
    // their own _openid and don't get unintended admin privileges.
    const isWrite = isDbWriteOperation(rawTarget, req.method);
    const isAdminRequest = req.headers['x-liwu-admin'] === '1';
    if (ADMIN_API_KEY && isWrite && isAdminRequest) {
      upstreamHeaders.set('x-cloudbase-credentials', ADMIN_API_KEY);
    }

    const upstreamResponse = await fetch(rawTarget, {
      method: req.method,
      headers: upstreamHeaders,
      body: requestBody && requestBody.length > 0 ? requestBody : undefined,
      redirect: 'manual'
    });

    logProxyEvent(requestId, 'upstream_response', {
      method: req.method,
      rawTarget,
      status: upstreamResponse.status,
      durationMs: Date.now() - startedAt
    });

    res.status(upstreamResponse.status);
    res.setHeader('x-liwu-proxy-request-id', requestId);

    upstreamResponse.headers.forEach((value, key) => {
      if (!RESPONSE_HEADER_BLOCKLIST.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const inferredContentType = inferMediaContentType(rawTarget);
    if (inferredContentType) {
      res.setHeader('content-type', inferredContentType);
      res.setHeader('content-disposition', 'inline');
    }

    const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    res.send(responseBuffer);
  } catch (error) {
    logProxyEvent(requestId, 'proxy_failed', {
      method: req.method,
      rawTarget,
      durationMs: Date.now() - startedAt,
      message: error?.message || 'Proxy request failed',
      stack: error?.stack || ''
    });
    res.status(502).json({
      error: 'proxy_failed',
      message: error?.message || 'Proxy request failed',
      requestId
    });
  }
}
