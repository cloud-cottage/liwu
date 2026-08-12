/**
 * Local development CloudBase Proxy Server
 * Replicates apps/app/api/cloudbase-proxy.js logic for local dev.
 * Run alongside Vite dev server.
 *
 * Usage:
 *   CLOUDBASE_ADMIN_API_KEY=eyJ... node scripts/dev-cloudbase-proxy.mjs
 *   (starts on port 3020)
 *
 * When CLOUDBASE_ADMIN_API_KEY is set, the proxy inspects the request body
 * for database write actions (add/update/delete/set) and injects the admin
 * API key, bypassing _openid permission mismatches caused by migration.
 */

import http from 'node:http';

const PORT = 3020;
const ADMIN_API_KEY = process.env.CLOUDBASE_ADMIN_API_KEY || '';

const ALLOWED_HOST_SUFFIXES = [
  '.tcb-api.tencentcloudapi.com',
  '.myqcloud.com',
  '.qcloud.la',
  '.tcb.qcloud.la',
];
const ALLOWED_HOST_INFIXES = [
  'liwu-d8gek6jjdab1d087c',
  '-liwu-d8gek6jjdab1d087c.',
];

const REQUEST_HEADER_BLOCKLIST = new Set([
  'host', 'connection', 'content-length', 'origin', 'referer',
  'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-port',
  'x-forwarded-proto', 'x-real-ip',
]);

const RESPONSE_HEADER_BLOCKLIST = new Set([
  'content-length', 'content-encoding', 'transfer-encoding',
  'connection', 'content-disposition',
]);

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// CloudBase web API uses a single /web endpoint; the action is in the body.
// These action prefixes indicate database write operations.
const DB_WRITE_ACTIONS = [
  'database.addDocument',
  'database.updateDocument',
  'database.deleteDocument',
  'database.setDocument',
  'database.insertDocument',
  'database.removeDocument',
];

const isDbWriteBody = (bodyBuffer) => {
  if (!bodyBuffer || bodyBuffer.length === 0) return false;
  try {
    const text = bodyBuffer.toString('utf-8', 0, Math.min(bodyBuffer.length, 4096));
    return DB_WRITE_ACTIONS.some((action) => text.includes(action));
  } catch {
    return false;
  }
};

const isAllowedTarget = (target) => {
  try {
    const url = new URL(target);
    return (
      ALLOWED_HOST_SUFFIXES.some((s) => url.hostname.endsWith(s)) ||
      ALLOWED_HOST_INFIXES.some((s) => url.hostname.includes(s))
    );
  } catch {
    return false;
  }
};

const readRawBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...CORS_HEADERS, 'access-control-max-age': '86400' });
    res.end();
    return;
  }

  const rawTarget =
    typeof req.url === 'string'
      ? new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('target')
      : null;

  if (!rawTarget || !isAllowedTarget(rawTarget)) {
    res.writeHead(400, { 'content-type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'invalid_target' }));
    return;
  }

  try {
    const upstreamHeaders = new Headers();
    Object.entries(req.headers).forEach(([key, value]) => {
      if (REQUEST_HEADER_BLOCKLIST.has(key.toLowerCase()) || value === undefined) return;
      upstreamHeaders.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    });

    const body = ['GET', 'HEAD'].includes(req.method)
      ? undefined
      : await readRawBody(req);

    // Inject admin API key for database write operations
    const isWrite = isDbWriteBody(body);
    if (ADMIN_API_KEY && isWrite) {
      upstreamHeaders.set('x-cloudbase-credentials', ADMIN_API_KEY);
    }

    const label = isWrite ? '(admin write)' : '';
    console.log('[dev-cloudbase-proxy]', req.method, rawTarget.slice(0, 120),
      'bodyLen:', body ? body.length : 0, label);

    const upstreamResponse = await fetch(rawTarget, {
      method: req.method,
      headers: upstreamHeaders,
      body: body && body.length > 0 ? body : undefined,
      redirect: 'manual',
    });

    console.log('[dev-cloudbase-proxy] upstream status:', upstreamResponse.status,
      'for', req.method, rawTarget.slice(0, 80));

    const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());

    const responseHeaders = { ...CORS_HEADERS, 'x-liwu-proxy': 'dev' };
    upstreamResponse.headers.forEach((value, key) => {
      if (!RESPONSE_HEADER_BLOCKLIST.has(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    res.writeHead(upstreamResponse.status, responseHeaders);
    res.end(responseBuffer);
  } catch (err) {
    console.error('[dev-cloudbase-proxy] Failed:', err.message);
    res.writeHead(502, { 'content-type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'proxy_failed', message: err.message }));
  }
});

server.listen(PORT, () => {
  const keyStatus = ADMIN_API_KEY ? 'ENABLED (admin key set)' : 'DISABLED (no CLOUDBASE_ADMIN_API_KEY)';
  console.log(`[dev-cloudbase-proxy] Running on http://localhost:${PORT} — admin injection: ${keyStatus}`);
});
