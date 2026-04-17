/* global Buffer */
export const config = {
  api: {
    bodyParser: false
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
  'connection'
]);

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
    return targetUrl.hostname.endsWith('.tcb-api.tencentcloudapi.com');
  } catch {
    return false;
  }
};

export default async function handler(req, res) {
  const rawTarget = Array.isArray(req.query?.target) ? req.query.target[0] : req.query?.target;

  if (!rawTarget || !isAllowedTarget(rawTarget)) {
    res.status(400).json({ error: 'invalid_target' });
    return;
  }

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

    const upstreamResponse = await fetch(rawTarget, {
      method: req.method,
      headers: upstreamHeaders,
      body: requestBody && requestBody.length > 0 ? requestBody : undefined,
      redirect: 'manual'
    });

    res.status(upstreamResponse.status);

    upstreamResponse.headers.forEach((value, key) => {
      if (!RESPONSE_HEADER_BLOCKLIST.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    res.send(responseBuffer);
  } catch (error) {
    res.status(502).json({
      error: 'proxy_failed',
      message: error?.message || 'Proxy request failed'
    });
  }
}
