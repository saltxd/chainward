// chainward.ai and api.chainward.ai run in the homelab behind a Cloudflare Tunnel.
// When the house loses internet the tunnel drops and Cloudflare answers 530 /
// error 1033 for every request (2026-10-13: 119 minutes). This Worker sits on
// both hostnames: while home is up it passes each request through untouched and
// keeps a copy of the public pages; while the tunnel is down it serves those
// copies, or a plain "briefly offline" answer (JSON for the API).

export interface SnapshotMeta {
  contentType: string;
  savedAt: number;
}

export interface SnapshotStore {
  getWithMetadata(key: string, type: 'arrayBuffer'): Promise<{ value: ArrayBuffer | null; metadata: SnapshotMeta | null }>;
  put(key: string, value: ArrayBuffer, opts: { metadata: SnapshotMeta }): Promise<void>;
}

/** "Already saved recently" marks, so a busy page costs no KV reads per request. */
export interface Marker {
  has(key: string): Promise<boolean>;
  mark(key: string, ttlSec: number): Promise<void>;
}

export interface Env {
  SNAPSHOTS: SnapshotStore;
}

export interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

export interface Deps {
  upstream: (req: Request) => Promise<Response>;
  now: () => number;
  marker: Marker;
}

// Cloudflare's own origin errors: 530 is the tunnel being down (error 1033), 52x
// the origin unreachable. Our API's 502/503/504 are real answers and pass through.
const EDGE_OUTAGE = (status: number) => status >= 520 && status <= 530;
const PAGE_REFRESH_MS = 6 * 3_600_000;
const ASSET_MARK_SEC = 30 * 86_400;
const MAX_BYTES = 5 * 1024 * 1024;

const SITE_PAGES =
  /^\/$|^\/(decodes|reports|x402|wallet-api|set-and-earn|screen|mcp|attest|docs)(\/[\w.-]+)*$|^\/(report|base|paid|agent)\/[\w.-]+$|^\/(llms\.txt|robots\.txt|sitemap\.xml)$/;
const SITE_ASSETS = /^\/_next\/static\/|^\/[\w.-]+\.(png|ico|svg|jpe?g|webp|woff2?)$/;
const API_DOCS = /^\/$|^\/openapi\.json$|^\/\.well-known\/(x402|402index-verify\.txt|x402list\.txt)$/;

const isApi = (url: URL) => url.hostname.startsWith('api.');
const keyFor = (url: URL) => `${url.hostname}${url.pathname}`;

function kindOf(url: URL): 'page' | 'asset' | null {
  if (isApi(url)) return API_DOCS.test(url.pathname) ? 'page' : null;
  if (SITE_ASSETS.test(url.pathname)) return 'asset';
  return SITE_PAGES.test(url.pathname) ? 'page' : null;
}

function keepable(req: Request, url: URL, res: Response): boolean {
  if (req.method !== 'GET' || url.search !== '' || res.status !== 200) return false;
  if (req.headers.has('cookie') || req.headers.has('authorization')) return false;
  if (res.headers.has('set-cookie') || !res.headers.get('content-type')) return false;
  const length = Number(res.headers.get('content-length') ?? 0);
  return length <= MAX_BYTES && kindOf(url) !== null;
}

async function keep(env: Env, deps: Deps, url: URL, res: Response): Promise<void> {
  const key = keyFor(url);
  if (await deps.marker.has(key)) return;
  const asset = kindOf(url) === 'asset';
  const now = deps.now();
  const { value, metadata } = await env.SNAPSHOTS.getWithMetadata(key, 'arrayBuffer');
  const fresh = value !== null && metadata !== null && (asset || now - metadata.savedAt < PAGE_REFRESH_MS);
  if (!fresh) {
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return;
    await env.SNAPSHOTS.put(key, body, { metadata: { contentType: res.headers.get('content-type')!, savedAt: now } });
  }
  await deps.marker.mark(key, asset ? ASSET_MARK_SEC : PAGE_REFRESH_MS / 1000);
}

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ChainWard is briefly offline</title>
<style>body{font:17px/1.6 Georgia,serif;max-width:560px;margin:72px auto;padding:0 20px;color:#1a1a1a;background:#faf8f3}a{color:#1a1a1a}</style></head>
<body><h1>ChainWard is briefly offline</h1><p>Our servers lost their internet connection. This page will be back on its own shortly; please try again in a few minutes.</p>
<p>Saved copies of our <a href="/decodes">decodes</a> stay readable meanwhile.</p></body></html>`;

function offline(url: URL, method: string): Response {
  const headers = { 'cache-control': 'no-store', 'retry-after': '300', 'x-chainward-fallback': 'offline' };
  if (isApi(url)) {
    const body = {
      success: false,
      error: { code: 'TEMPORARILY_OFFLINE', message: 'ChainWard is briefly offline. You were not charged; try again in a few minutes.' },
    };
    return new Response(method === 'HEAD' ? null : JSON.stringify(body), { status: 503, headers: { ...headers, 'content-type': 'application/json' } });
  }
  return new Response(method === 'HEAD' ? null : OFFLINE_PAGE, { status: 503, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
}

async function fallback(req: Request, url: URL, env: Env): Promise<Response> {
  if ((req.method === 'GET' || req.method === 'HEAD') && kindOf(url) !== null) {
    const { value, metadata } = await env.SNAPSHOTS.getWithMetadata(keyFor(url), 'arrayBuffer');
    if (value !== null && metadata !== null) {
      return new Response(req.method === 'HEAD' ? null : value, {
        status: 200,
        headers: {
          'content-type': metadata.contentType,
          'cache-control': 'no-store',
          'x-chainward-fallback': `snapshot ${new Date(metadata.savedAt).toISOString()}`,
        },
      });
    }
  }
  return offline(url, req.method);
}

export async function handle(req: Request, env: Env, ctx: Ctx, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  let res: Response | null = null;
  try {
    res = await deps.upstream(req);
  } catch {
    res = null;
  }
  if (res !== null && !EDGE_OUTAGE(res.status)) {
    if (keepable(req, url, res)) ctx.waitUntil(keep(env, deps, url, res.clone()).catch(() => {}));
    return res;
  }
  try {
    return await fallback(req, url, env);
  } catch {
    return offline(url, req.method);
  }
}

// Marks live in this data center's cache under the zone's own hostname.
function cacheMarker(): Marker {
  const cache = (globalThis as unknown as { caches: { default: Cache } }).caches.default;
  const markUrl = (key: string) => `https://chainward.ai/__edge-fallback-seen/${encodeURIComponent(key)}`;
  return {
    async has(key) {
      return (await cache.match(markUrl(key))) !== undefined;
    },
    async mark(key, ttlSec) {
      await cache.put(markUrl(key), new Response('1', { headers: { 'cache-control': `max-age=${ttlSec}` } }));
    },
  };
}

export default {
  fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    return handle(req, env, ctx, { upstream: (r) => fetch(r), now: () => Date.now(), marker: cacheMarker() });
  },
};
