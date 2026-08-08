/**
 * Local development CloudBase Proxy Server
 * Replicates apps/app/api/cloudbase-proxy.js logic for local dev.
 * Run alongside Vite dev server.
 *
 * Usage:
 *   node scripts/dev-cloudbase-proxy.mjs
 *   (starts on port 3020)
 *
 * Vite proxy config addition:
 *   '/api/cloudbase-proxy': {
 *     target: 'http://localhost:3020',
 *     changeOrigin: true,
 *   }
 */
import http from 'node:http';

const PORT = 3020;
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
  // Handle CORS preflight first
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

    console.log('[dev-cloudbase-proxy]', req.method, rawTarget.slice(0, 150), 'bodyLen:', body ? body.length : 0);

    const upstreamResponse = await fetch(rawTarget, {
      method: req.method,
      headers: upstreamHeaders,
      body: body && body.length > 0 ? body : undefined,
      redirect: 'manual',
    });

    console.log('[dev-cloudbase-proxy] upstream status:', upstreamResponse.status, 'for', req.method, rawTarget.slice(0, 100));

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
  console.log(`[dev-cloudbase-proxy] Running on http://localhost:${PORT}`);
});
