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

  const responseHeaders = new Headers();
  res.headers.forEach((value, key) => {
    responseHeaders.append(key, value);
  });

  return new NextResponse(res.body, {
    status: res.status,
    headers: responseHeaders,
  });
}

export const GET = proxyAuth;
export const POST = proxyAuth;
