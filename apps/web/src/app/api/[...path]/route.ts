import { NextRequest, NextResponse } from 'next/server';
import { readCappedBody } from '@/lib/readCappedBody';
import { upstreamTimeoutMs } from './upstreamTimeout';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

// Matches the API's bodyLimit; anything larger is refused before it is buffered here.
const MAX_BODY_BYTES = 1024 * 1024;

// Only these request headers reach the API. Forwarding everything let clients
// set X-Forwarded-For / X-Real-IP / Expect and similar on the upstream request.
// cf-connecting-ip is set by Cloudflare on the inbound request (it overwrites
// any client value), and the API rate-limits on it.
const FORWARD_REQUEST_HEADERS = [
  'accept',
  'authorization',
  'cf-connecting-ip',
  'content-type',
  'cookie',
  'if-none-match',
  'user-agent',
  'x-ops-key',
  'x-alchemy-signature',
  // x402: v2 sends PAYMENT-SIGNATURE, v1 X-PAYMENT
  'payment-signature',
  'x-payment',
];

// Hop-by-hop headers that must not be copied onto the response
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'upgrade',
  'proxy-authenticate',
  'proxy-connection',
]);

function hasBody(method: string) {
  return method === 'POST' || method === 'PUT' || method === 'PATCH';
}

function tooLarge() {
  return NextResponse.json(
    { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 1 MB' } },
    { status: 413 },
  );
}

async function proxy(req: NextRequest) {
  const url = new URL(req.url);
  const upstream = `${API_URL}${url.pathname}${url.search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  let body: Uint8Array<ArrayBuffer> | undefined;
  if (hasBody(req.method)) {
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) return tooLarge();
    const capped = await readCappedBody(req.body, MAX_BODY_BYTES);
    if (capped === null) return tooLarge();
    body = capped;
  }

  let res: Response;
  try {
    res = await fetch(upstream, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(upstreamTimeoutMs(url.pathname)),
    });
  } catch (err) {
    console.error('API proxy fetch failed:', err);
    return NextResponse.json(
      { error: 'Failed to reach API' },
      { status: 502 },
    );
  }

  const resBody = await res.arrayBuffer();

  const responseHeaders = new Headers();
  res.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    // set-cookie is re-added below with Path=/; copying it here too sent it twice
    if (!HOP_BY_HOP.has(name) && name !== 'content-encoding' && name !== 'content-length' && name !== 'set-cookie') {
      responseHeaders.set(key, value);
    }
  });

  // Force Path=/ so auth cookies work across all routes
  for (const cookie of res.headers.getSetCookie()) {
    const withPath = /path=/i.test(cookie)
      ? cookie.replace(/path=\/[^;]*/i, 'Path=/')
      : cookie + '; Path=/';
    responseHeaders.append('Set-Cookie', withPath);
  }

  // Responses to credentialed requests are per-user: never let a shared cache keep them.
  if (req.headers.has('cookie') || req.headers.has('authorization')) {
    responseHeaders.set('Cache-Control', 'private, no-store');
  }

  return new NextResponse(resBody, {
    status: res.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
