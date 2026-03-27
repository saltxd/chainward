import { NextRequest, NextResponse } from 'next/server';

const UMAMI_URL = process.env.UMAMI_INTERNAL_URL || 'http://umami.umami.svc.cluster.local:3000';

async function proxy(req: NextRequest) {
  const url = new URL(req.url);
  // Strip the /u prefix and forward to Umami
  const path = url.pathname.replace(/^\/u/, '');
  const upstream = `${UMAMI_URL}${path}${url.search}`;

  let res: Response;
  try {
    res = await fetch(upstream, {
      method: req.method,
      headers: { 'Content-Type': req.headers.get('content-type') ?? 'application/json' },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined,
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }

  const body = await res.arrayBuffer();
  const headers = new Headers();
  const contentType = res.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  if (path.endsWith('.js')) headers.set('cache-control', 'public, max-age=86400');

  return new NextResponse(body, { status: res.status, headers });
}

export const GET = proxy;
export const POST = proxy;
