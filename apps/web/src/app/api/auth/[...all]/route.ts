import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

async function proxyAuth(req: NextRequest) {
  const url = new URL(req.url);
  const upstream = `${API_URL}${url.pathname}${url.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  });

  const res = await fetch(upstream, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined,
  });

  // Read full body to ensure proper Content-Length and response completion
  const body = await res.arrayBuffer();

  const responseHeaders = new Headers();
  res.headers.forEach((value, key) => {
    // Skip content-encoding since we've already decoded the body
    if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'transfer-encoding') {
      responseHeaders.set(key, value);
    }
  });

  // Set-Cookie is excluded from Headers iterator — forward explicitly
  // Ensure cookie path is / so cookies work across all routes (not just /api/auth)
  const rawCookies = res.headers.getSetCookie();
  console.log('[auth-proxy] upstream status:', res.status, 'cookies:', rawCookies.length, rawCookies.map(c => c.replace(/=.+?;/, '=REDACTED;')));
  for (const cookie of rawCookies) {
    let normalized = cookie;
    if (/path=/i.test(normalized)) {
      // Replace any existing path with /
      normalized = normalized.replace(/path=\/[^;]*/i, 'Path=/');
    } else {
      // No path set — browser would default to /api/auth; add explicit Path=/
      normalized += '; Path=/';
    }
    responseHeaders.append('Set-Cookie', normalized);
  }

  return new NextResponse(body, {
    status: res.status,
    headers: responseHeaders,
  });
}

export const GET = proxyAuth;
export const POST = proxyAuth;
