import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

// Hop-by-hop headers that must not be forwarded between HTTP/2 and HTTP/1.1
const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
]);

async function proxy(req: NextRequest) {
  const url = new URL(req.url);
  const upstream = `${API_URL}${url.pathname}${url.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  let res: Response;
  try {
    res = await fetch(upstream, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined,
    });
  } catch (err) {
    console.error('API proxy fetch failed:', err);
    return NextResponse.json(
      { error: 'Failed to reach API' },
      { status: 502 },
    );
  }

  const body = await res.arrayBuffer();

  const responseHeaders = new Headers();
  res.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== 'content-encoding') {
      responseHeaders.set(key, value);
    }
  });

  // Forward Set-Cookie headers (excluded from Headers iterator per spec)
  // Force Path=/ so auth cookies work across all routes
  for (const cookie of res.headers.getSetCookie()) {
    const withPath = /path=/i.test(cookie)
      ? cookie.replace(/path=\/[^;]*/i, 'Path=/')
      : cookie + '; Path=/';
    responseHeaders.append('Set-Cookie', withPath);
  }

  return new NextResponse(body, {
    status: res.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
