import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// chainward.ai buys paid checks from the browser, straight from api.chainward.ai
// (never through the web proxy). The browser can only read the x402 headers the
// API exposes, and only sends the payment header if the preflight allows it.
const redis = vi.hoisted(() => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => 'OK'),
  pipeline: vi.fn(() => {
    const p = {
      zremrangebyscore: () => p,
      zcard: () => p,
      zadd: () => p,
      expire: () => p,
      exec: async () => [
        [null, 0],
        [null, 0],
        [null, 1],
        [null, 1],
      ],
    };
    return p;
  }),
}));
vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/db.js', () => ({ getDb: () => ({}) }));

import { createApp } from '../app.js';
import { x402CheckMiddleware } from '../lib/x402.js';

const ADDR = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';
const PAY_TO = '0x000000000000000000000000000000000000dEaD';
const WEB = 'https://chainward.ai';

function facilitatorFetch(url: string | URL | Request): Promise<Response> {
  const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
  if (href.endsWith('/supported')) {
    return Promise.resolve(
      Response.json({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }], extensions: [], signers: {} }),
    );
  }
  return Promise.reject(new Error(`unexpected fetch in test: ${href}`));
}

const PAID = [
  `/api/risk/x402?address=${ADDR}`,
  `/api/risk/seller-demand?address=${ADDR}`,
  '/api/risk/hires?agent=352475&chain=bsc',
];

const exposed = (res: Response) =>
  (res.headers.get('access-control-expose-headers') ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase());

describe('paid routes: CORS for chainward.ai', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    vi.stubEnv('X402_PAY_TO', PAY_TO);
    vi.stubGlobal('fetch', vi.fn(facilitatorFetch));
    app = createApp({ corsOrigins: ['http://chainward.internal', WEB], x402Check: x402CheckMiddleware() });
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(PAID)('GET %s exposes the 402 challenge to chainward.ai', async (path) => {
    const res = await app.request(path, { headers: { Origin: WEB } });
    expect(res.status).toBe(402);
    expect(res.headers.get('access-control-allow-origin')).toBe(WEB);
    expect(res.headers.get('payment-required')).toBeTruthy();
    expect(exposed(res)).toEqual(expect.arrayContaining(['payment-required', 'payment-response']));
  });

  it.each([
    ['payment-signature'],
    ['x-payment'],
    // @x402/fetch also sets this (a response header name) on the paid retry.
    ['access-control-expose-headers,payment-signature'],
  ])('preflight allows the %s request header', async (requested) => {
    for (const path of PAID) {
      const res = await app.request(path, {
        method: 'OPTIONS',
        headers: { Origin: WEB, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': requested },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe(WEB);
      expect(res.headers.get('access-control-allow-methods')).toContain('GET');
      const allowed = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase().split(',').map((h) => h.trim());
      expect(allowed).toEqual(expect.arrayContaining(requested.split(',')));
    }
  });

  it('gives an origin that is not configured no CORS grant', async () => {
    const res = await app.request(`/api/risk/seller-demand?address=${ADDR}`, { headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(402);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
