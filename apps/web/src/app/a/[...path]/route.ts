import { NextRequest, NextResponse } from 'next/server';

/**
 * First-party Umami proxy. Umami is cluster-internal only — public visitors
 * can't reach it, but the web pod can. We proxy the tracker script and the
 * beacon endpoint through our own origin so tracking is same-origin (no
 * third-party blockers) and, critically, we forward the real client IP and
 * User-Agent so Umami's per-visitor session hashing works. Without those, the
 * old /u proxy attributed every event to the pod IP — i.e. no useful data.
 *
 *   GET  /a/script.js  → ${UMAMI_INTERNAL_URL}/script.js
 *   POST /a/api/send   → ${UMAMI_INTERNAL_URL}/api/send
 *
 * When UMAMI_INTERNAL_URL is unset (local dev / self-hosters) the routes no-op
 * gracefully: 204 for beacons, 404 for the script.
 *
 * Runtime loader config (website id) is served by the sibling ../meta route;
 * the tracker itself is injected client-side by components/press/Analytics.
 */

const UMAMI_URL = process.env.UMAMI_INTERNAL_URL;

const ALLOWED_PATHS = new Set(['/script.js', '/api/send']);

function clientIp(req: NextRequest): string | null {
  // Behind Cloudflare, cf-connecting-ip is the single real client IP;
  // x-forwarded-for may accumulate proxy hops.
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff;
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri;
  return null;
}

async function proxy(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/a/, '');

  if (!ALLOWED_PATHS.has(path)) {
    return new NextResponse(null, { status: 404 });
  }

  // No upstream configured — behave like analytics is simply off.
  if (!UMAMI_URL) {
    return new NextResponse(null, { status: path === '/api/send' ? 204 : 404 });
  }

  const upstream = `${UMAMI_URL}${path}${url.search}`;

  // Forward the headers Umami needs to identify the visitor. The session hash
  // is derived from IP + User-Agent + website id, so both must be the client's.
  const headers = new Headers();
  headers.set('content-type', req.headers.get('content-type') ?? 'application/json');
  const ua = req.headers.get('user-agent');
  if (ua) headers.set('user-agent', ua);
  const ip = clientIp(req);
  if (ip) {
    headers.set('x-forwarded-for', ip);
    // x-real-ip: first hop only (Umami reads x-forwarded-for first, but keep both consistent)
    const firstHop = ip.split(',')[0]?.trim();
    if (firstHop) headers.set('x-real-ip', firstHop);
  }
  const accept = req.headers.get('accept');
  if (accept) headers.set('accept', accept);
  // Umami's /api/send returns a session cache token that the tracker re-sends
  // on subsequent events via x-umami-cache — forward it so the session isn't
  // re-derived (and re-queried) for every beacon.
  const umamiCache = req.headers.get('x-umami-cache');
  if (umamiCache) headers.set('x-umami-cache', umamiCache);

  let res: Response;
  try {
    res = await fetch(upstream, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? await req.text() : undefined,
    });
  } catch {
    // Never surface analytics failures to the visitor.
    return new NextResponse(null, { status: path === '/api/send' ? 204 : 502 });
  }

  // Upstream 5xx bodies can carry stack traces / internals (observed: a full
  // Prisma error through /api/send). Pass the status, never the body.
  if (res.status >= 500) {
    return new NextResponse(null, { status: res.status });
  }

  const body = await res.arrayBuffer();
  const responseHeaders = new Headers();
  const contentType = res.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);
  if (path.endsWith('.js')) {
    responseHeaders.set('cache-control', 'public, max-age=86400');
  }

  return new NextResponse(body, { status: res.status, headers: responseHeaders });
}

export const GET = proxy;
export const POST = proxy;
