import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// The x402-sellers-base dataset was built from x402scan's internal API, whose
// Terms bar harvesting the service, so it is off sale. The DB rows stay; every
// paid route answers 410 for it before any payment challenge.
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
const db = vi.hoisted(() => ({ rows: (_params: unknown[]): unknown[] => [] }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/db.js', async () => {
  const { PgDialect } = await import('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  return {
    getDb: () => {
      let params: unknown[] = [];
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'from']) q[m] = () => q;
      q.where = (cond: Parameters<typeof dialect.sqlToQuery>[0]) => {
        params = dialect.sqlToQuery(cond).params;
        return q;
      };
      q.orderBy = () => q;
      q.limit = async () => db.rows(params);
      q.then = (resolve: (v: unknown) => unknown) => resolve(db.rows(params));
      return q;
    },
  };
});

import { paid } from '../routes/paid.js';
import { handleError } from '../middleware/errorHandler.js';
import { createApp } from '../app.js';
import { x402CheckMiddleware, x402DiscoveryDocument, x402OpenApiDocument } from '../lib/x402.js';

const WITHDRAWN = 'x402-sellers-base';
const ADDR = '0x68396bd35874695ad86cd29410bd80a550991a2b';
const TX = `0x${'a'.repeat(64)}`;
const row = (slug: string) => ({
  slug,
  title: `${slug} title`,
  description: 'test',
  filename: `${slug}.csv`,
  contentType: 'text/csv',
  priceUsdc: 10_000_000,
  sizeBytes: 10,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  content: Buffer.from('a,b\n'),
});
const ROWS = [row(WITHDRAWN), row('termix-wallets'), row('set-and-earn-week-one')];

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

function paidApp(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/paid', paid);
  return a;
}

beforeEach(() => {
  // A query keyed by slug returns that row; the unfiltered list returns all three.
  db.rows = (params) => {
    const hit = ROWS.filter((r) => params.includes(r.slug));
    return params.length === 0 ? ROWS : hit;
  };
});

describe('a withdrawn dataset', () => {
  it('is left out of GET /api/paid', async () => {
    const res = await paidApp().request('/api/paid');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ slug: string }> };
    expect(body.data.map((d) => d.slug).sort()).toEqual(['set-and-earn-week-one', 'termix-wallets']);
  });

  it('still answers GET /api/paid/:slug, saying it is withdrawn and why', async () => {
    const res = await paidApp().request(`/api/paid/${WITHDRAWN}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { slug: string; withdrawn: { reason: string } | null } };
    expect(body.data.withdrawn?.reason).toMatch(/permission/);
    const live = (await (await paidApp().request('/api/paid/termix-wallets')).json()) as { data: { withdrawn: unknown } };
    expect(live.data.withdrawn).toBeNull();
  });

  it.each([
    ['GET', `/api/paid/${WITHDRAWN}/file`],
    ['GET', `/api/paid/${WITHDRAWN}/check?address=${ADDR}`],
    ['GET', `/api/paid/${WITHDRAWN}/lookup/${ADDR}`],
    ['GET', `/api/paid/${WITHDRAWN}/download?token=x`],
    ['POST', `/api/paid/${WITHDRAWN}/claim`],
  ])('%s %s answers 410 WITHDRAWN', async (method, path) => {
    const res = await paidApp().request(path, {
      method,
      ...(method === 'POST' ? { body: JSON.stringify({ txHash: TX }), headers: { 'content-type': 'application/json' } } : {}),
    });
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('WITHDRAWN');
  });
});

describe('a withdrawn dataset behind the payment middleware', () => {
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

  it.each([`/api/paid/${WITHDRAWN}/file`, `/api/paid/${WITHDRAWN}/check?address=${ADDR}`])(
    'GET %s answers 410 with no payment challenge',
    async (path) => {
      const res = await app.request(path);
      expect(res.status).toBe(410);
      expect(res.headers.get('payment-required')).toBeNull();
    },
  );

  it('leaves the datasets still on sale behind the challenge', async () => {
    const res = await app.request('/api/paid/termix-wallets/file');
    expect(res.status).toBe(402);
    expect(res.headers.get('payment-required')).toBeTruthy();
  });

  it('is gone from /.well-known/x402 and /openapi.json', () => {
    expect(JSON.stringify(x402DiscoveryDocument())).not.toContain(WITHDRAWN);
    expect(JSON.stringify(x402OpenApiDocument())).not.toContain(WITHDRAWN);
  });
});
