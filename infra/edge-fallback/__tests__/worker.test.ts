import { describe, expect, it } from 'vitest';
import { handle, type Deps, type Env, type Marker, type SnapshotStore } from '../src/worker';

// When the house loses internet, the Cloudflare tunnel drops and chainward.ai
// answered Cloudflare's 1033 error page for two hours (2026-10-13). This Worker
// passes every request through untouched while home is up, keeps a copy of the
// public pages, and serves those copies, or a plain "briefly offline" answer,
// while the tunnel is down.

const NOW = 1_792_000_000_000;
const HOUR = 3_600_000;

function memoryStore(): SnapshotStore & { data: Map<string, { value: ArrayBuffer; metadata: { contentType: string; savedAt: number } }>; puts: number } {
  const data = new Map<string, { value: ArrayBuffer; metadata: { contentType: string; savedAt: number } }>();
  const store = {
    data,
    puts: 0,
    async getWithMetadata(key: string) {
      const hit = data.get(key);
      return hit ? { value: hit.value, metadata: hit.metadata } : { value: null, metadata: null };
    },
    async put(key: string, value: ArrayBuffer, opts: { metadata: { contentType: string; savedAt: number } }) {
      store.puts++;
      data.set(key, { value, metadata: opts.metadata });
    },
  };
  return store;
}

function memoryMarker(): Marker {
  const seen = new Map<string, number>();
  return {
    async has(key) {
      return (seen.get(key) ?? 0) > NOW;
    },
    async mark(key, ttlSec) {
      seen.set(key, NOW + ttlSec * 1000);
    },
  };
}

function setup(upstream: Deps['upstream'], now = NOW) {
  const store = memoryStore();
  const env: Env = { SNAPSHOTS: store };
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) };
  const deps: Deps = { upstream, now: () => now, marker: memoryMarker() };
  const call = async (req: Request) => {
    const res = await handle(req, env, ctx, deps);
    await Promise.all(pending.splice(0));
    return res;
  };
  return { store, env, ctx, deps, call };
}

const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
const tunnelDown = () => new Response('error code: 1033', { status: 530 });

describe('edge fallback', () => {
  it('passes a healthy response through untouched', async () => {
    const { call } = setup(async () => html('<h1>live</h1>', { 'x-origin': 'home' }));
    const res = await call(new Request('https://chainward.ai/decodes/x402-on-base'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-origin')).toBe('home');
    expect(await res.text()).toBe('<h1>live</h1>');
  });

  it('keeps a copy of a public page and serves it while the tunnel is down', async () => {
    let up = true;
    const { call } = setup(async () => (up ? html('<h1>decode</h1>') : tunnelDown()));
    await call(new Request('https://chainward.ai/decodes/x402-on-base'));
    up = false;
    const res = await call(new Request('https://chainward.ai/decodes/x402-on-base'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<h1>decode</h1>');
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('x-chainward-fallback')).toMatch(/^snapshot /);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('serves the copy when the origin cannot be reached at all', async () => {
    let up = true;
    const { call } = setup(async () => {
      if (up) return html('<h1>home</h1>');
      throw new Error('network connection lost');
    });
    await call(new Request('https://chainward.ai/'));
    up = false;
    const res = await call(new Request('https://chainward.ai/?chain=bsc'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<h1>home</h1>');
  });

  // A signed-in visitor's page may carry their session; it must never be shown to anyone else.
  it('never keeps a page requested with a cookie or answered with set-cookie', async () => {
    const { call, store } = setup(async (req) => html('<h1>x</h1>', req.url.endsWith('/screen') ? { 'set-cookie': 'a=b' } : {}));
    await call(new Request('https://chainward.ai/decodes', { headers: { cookie: 'session=abc' } }));
    await call(new Request('https://chainward.ai/screen'));
    expect(store.data.size).toBe(0);
  });

  it('never keeps dashboard, auth or API data paths', async () => {
    const { call, store } = setup(async () => html('<h1>x</h1>'));
    for (const p of ['/overview', '/settings', '/login', '/api/risk/report/0xabc', '/agents/1']) {
      await call(new Request(`https://chainward.ai${p}`));
    }
    await call(new Request('https://api.chainward.ai/api/risk/sanctions?address=0xabc'));
    expect(store.data.size).toBe(0);
  });

  it('keeps build assets once, with their content type, and serves them while down', async () => {
    let up = true;
    const css = '.a{color:red}';
    const { call, store } = setup(async () => (up ? new Response(css, { status: 200, headers: { 'content-type': 'text/css' } }) : tunnelDown()));
    await call(new Request('https://chainward.ai/_next/static/css/app-123.css'));
    await call(new Request('https://chainward.ai/_next/static/css/app-123.css'));
    expect(store.puts).toBe(1);
    up = false;
    const res = await call(new Request('https://chainward.ai/_next/static/css/app-123.css'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/css');
    expect(await res.text()).toBe(css);
  });

  // KV allows 1,000 writes a day on the free plan and the sitemap lists ~280 pages:
  // a page copy is rewritten at most once a day.
  it('rewrites a page copy at most once a day', async () => {
    const first = setup(async () => html('<h1>v1</h1>'));
    await first.call(new Request('https://chainward.ai/wallet-api'));
    await first.call(new Request('https://chainward.ai/wallet-api'));
    expect(first.store.puts).toBe(1);
    const saved = first.store.data.get('chainward.ai/wallet-api')!;

    const sameDay = setup(async () => html('<h1>v2</h1>'), NOW + 7 * HOUR);
    sameDay.store.data.set('chainward.ai/wallet-api', saved);
    await sameDay.call(new Request('https://chainward.ai/wallet-api'));
    expect(sameDay.store.puts).toBe(0);

    const nextDay = setup(async () => html('<h1>v2</h1>'), NOW + 25 * HOUR);
    nextDay.store.data.set('chainward.ai/wallet-api', saved);
    await nextDay.call(new Request('https://chainward.ai/wallet-api'));
    expect(nextDay.store.puts).toBe(1);
    expect(new TextDecoder().decode(nextDay.store.data.get('chainward.ai/wallet-api')!.value)).toBe('<h1>v2</h1>');
  });

  it('answers a page it has no copy of with a plain offline page and 503', async () => {
    const { call } = setup(async () => tunnelDown());
    const res = await call(new Request('https://chainward.ai/report/0xabc'));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('300');
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(await res.text()).toMatch(/briefly offline/i);
  });

  it('answers the API with JSON 503 that says nothing was charged', async () => {
    const { call } = setup(async () => tunnelDown());
    const res = await call(new Request('https://api.chainward.ai/api/risk/wallet?address=0xabc'));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('TEMPORARILY_OFFLINE');
    expect(body.error.message).toMatch(/not charged/i);
  });

  // Agents and catalogs read these to find the paid routes; keep them answering.
  it('keeps the API discovery documents', async () => {
    let up = true;
    const doc = '{"x402Version":2}';
    const { call } = setup(async () => (up ? new Response(doc, { status: 200, headers: { 'content-type': 'application/json' } }) : tunnelDown()));
    await call(new Request('https://api.chainward.ai/.well-known/x402'));
    up = false;
    const res = await call(new Request('https://api.chainward.ai/.well-known/x402'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(doc);
  });

  // The API's own 503 and 504 (e.g. a wallet lookup that was not charged) are real answers.
  it("leaves the API's own 503 and 504 answers alone", async () => {
    const { call } = setup(async () => new Response('{"error":{"code":"LOOKUP_TIMEOUT"}}', { status: 504, headers: { 'content-type': 'application/json' } }));
    const res = await call(new Request('https://api.chainward.ai/api/risk/wallet?address=0xabc'));
    expect(res.status).toBe(504);
    expect(await res.text()).toMatch(/LOOKUP_TIMEOUT/);
  });

  it('answers HEAD from a copy without a body', async () => {
    let up = true;
    const { call } = setup(async () => (up ? html('<h1>decode</h1>') : tunnelDown()));
    await call(new Request('https://chainward.ai/decodes'));
    up = false;
    const res = await call(new Request('https://chainward.ai/decodes', { method: 'HEAD' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});
