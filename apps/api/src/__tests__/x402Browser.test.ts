import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// People open paid links from catalogs in a browser. The x402 library's own
// page for them says "Note to developers: install @x402/paywall", which reads
// as broken. Each paid route instead answers browsers with a ChainWard page
// that says what the call is, what it costs, how to pay, and the free options,
// while agents still get the JSON body and the PAYMENT-REQUIRED header.
const redis = vi.hoisted(() => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => 'OK'),
  incr: vi.fn(async () => 1),
  decr: vi.fn(async () => 0),
  expire: vi.fn(async () => 1),
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

import { createApp } from '../app.js';
import { PUBLISHED_DATASETS, x402CheckMiddleware, x402OpenApiDocument, x402PaidRoutes } from '../lib/x402.js';

const ADDR = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';
const BROWSER = { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };

function facilitatorFetch(url: string | URL | Request): Promise<Response> {
  const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
  if (href.endsWith('/supported')) {
    return Promise.resolve(
      new Response(JSON.stringify({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }], extensions: [], signers: {} }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
  }
  return Promise.reject(new Error(`unexpected fetch in test: ${href}`));
}

let app: ReturnType<typeof createApp>;
beforeAll(() => {
  vi.stubEnv('X402_PAY_TO', '0x000000000000000000000000000000000000dEaD');
  vi.stubGlobal('fetch', vi.fn(facilitatorFetch));
  app = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: x402CheckMiddleware() });
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('paid routes opened in a browser', () => {
  it.each([
    ['/api/risk/wallet', 'ChainWard wallet lookup', '$0.01'],
    ['/api/risk/sanctions', 'ChainWard sanctions screen', '$0.01'],
    ['/api/risk/x402', 'ChainWard counterparty check', '$0.05'],
  ])('%s answers a ChainWard page with the price and the free options', async (path, name, price) => {
    const res = await app.request(`${path}?address=${ADDR}`, { headers: BROWSER });
    expect(res.status).toBe(402);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(res.headers.get('payment-required')).toBeTruthy();
    const html = await res.text();
    expect(html).toContain(name);
    expect(html).toContain(price);
    expect(html).toContain('https://chainward.ai/wallet-api');
    expect(html).toContain('x402');
    expect(html).not.toMatch(/install <code>@x402\/paywall/);
  });

  it('says plainly that the client pays, not the API', async () => {
    const html = await (await app.request(`/api/risk/wallet?address=${ADDR}`, { headers: BROWSER })).text();
    expect(html).toContain('the client pays');
  });

  it('gives /screen its real terms', async () => {
    const html = await (await app.request(`/api/risk/wallet?address=${ADDR}`, { headers: BROWSER })).text();
    expect(html).toContain('first 500 wallets of your first list');
  });

  it('still answers agents with JSON and the payment header', async () => {
    const res = await app.request(`/api/risk/wallet?address=${ADDR}`, { headers: { Accept: 'application/json' } });
    expect(res.status).toBe(402);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(((await res.json()) as { error: string }).error).toBe('payment_required');
  });
});

// The dataset routes look the slug up in the database, so their pages are read from the route config.
describe('paid route pages that have a free or in-browser equivalent', () => {
  const routes = x402PaidRoutes('0x000000000000000000000000000000000000dEaD');
  const page = (key: string) => routes[key]!.customPaywallHtml ?? '';

  it.each(PUBLISHED_DATASETS.map((d) => d.slug))('the %s file page sends people to buy it in the browser', (slug) => {
    const html = page(`GET /api/paid/${slug}/file`);
    expect(html).toContain(`https://chainward.ai/paid/${slug}`);
    expect(html).toContain('one download');
    expect(html).not.toContain("a browser can't pay it");
  });

  it.each(PUBLISHED_DATASETS.map((d) => d.slug))('the %s check page offers the free one-wallet check', (slug) => {
    expect(page(`GET /api/paid/${slug}/check`)).toContain(`https://chainward.ai/paid/${slug}`);
  });

  it('the hire check page links the free Set and Earn board', () => {
    expect(page('GET /api/risk/hires')).toContain('https://chainward.ai/set-and-earn');
  });

  it('the seller check page links the free x402 seller board', () => {
    expect(page('GET /api/risk/seller-demand')).toContain('https://chainward.ai/x402');
  });
});

describe('OpenAPI for agent clients', () => {
  const doc = x402OpenApiDocument() as {
    info: { contact: { email?: string }; 'x-guidance'?: string };
    paths: Record<string, { get: { parameters?: Array<{ name: string; in: string; schema: { pattern?: string; example?: string } }> } }>;
  };

  it('gives every address parameter a callable example', () => {
    for (const [path, item] of Object.entries(doc.paths)) {
      for (const p of item.get.parameters ?? []) {
        if (p.name !== 'address') continue;
        expect(p.schema.example, `${path} address example`).toMatch(/^0x[a-fA-F0-9]{40}$/);
      }
    }
  });

  it('names a contact email and says where to start', () => {
    expect(doc.info.contact.email).toBe('hello@chainward.ai');
    expect(doc.info['x-guidance']).toMatch(/\/api\/risk\/wallet/);
  });

  it('quotes the configured prices in its guidance', () => {
    vi.stubEnv('X402_WALLET_PRICE', '$0.02');
    try {
      const g = (x402OpenApiDocument() as { info: { 'x-guidance': string } }).info['x-guidance'];
      expect(g).toContain('/api/risk/wallet?address=0x... ($0.02)');
    } finally {
      vi.stubEnv('X402_WALLET_PRICE', undefined as unknown as string);
    }
  });

  // An example the list does not contain would charge $0.05 for a not_listed answer.
  it.each(PUBLISHED_DATASETS.map((d) => [d.slug, d.example]))('the %s check example is a wallet in that dataset', (slug, example) => {
    const params = doc.paths[`/api/paid/${slug}/check`]!.get.parameters!;
    expect(params.find((q) => q.name === 'address')!.schema.example).toBe(example);
  });

  // Agents call listed paths literally; a {slug} template answers 400. The concrete dataset paths stay.
  it('lists no templated dataset paths', () => {
    expect(Object.keys(doc.paths).filter((p) => p.includes('{'))).toEqual([]);
    expect(doc.paths['/api/paid/termix-wallets/file']).toBeDefined();
  });
});
