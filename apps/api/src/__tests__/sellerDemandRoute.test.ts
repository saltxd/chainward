import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// GET /api/risk/seller-demand through the Hono router, without the x402 payment
// middleware that index.ts mounts in front of it. No network, no real Redis.
const redis = vi.hoisted(() => ({
  get: vi.fn<(key: string) => Promise<string | null>>(),
  set: vi.fn(async () => 'OK'),
  // rateLimit(): zremrangebyscore, zcard, zadd, expire → exec()
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

import { risk } from '../routes/risk.js';
import { handleError } from '../middleware/errorHandler.js';

const SELLER = '0x68396bd35874695ad86cd29410bd80a550991a2b';

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/risk', risk);
  return a;
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string };
}

describe('GET /api/risk/seller-demand', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    redis.get.mockReset().mockResolvedValue(null);
    redis.set.mockClear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rejects an unknown chain with 400 INVALID_TARGET', async () => {
    const res = await app().request(`/api/risk/seller-demand?address=${SELLER}&chain=foo`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('INVALID_TARGET');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 UNAVAILABLE naming bsc when BNB is not enabled for the Alchemy app', async () => {
    vi.stubEnv('SELLER_DEMAND_RPC_URL', 'https://base-mainnet.g.alchemy.com/v2/test-key');
    vi.stubEnv('SELLER_DEMAND_BSC_RPC_URL', '');
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32600, message: 'BNB_MAINNET is not enabled for this app. Visit ...' },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );

    const res = await app().request(`/api/risk/seller-demand?address=${SELLER}&chain=bsc`);

    expect(res.status).toBe(503);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('UNAVAILABLE');
    expect(body.error.message).toMatch(/bsc/);
    // The head probe went to the BNB host derived from the Base URL, and nothing was cached.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://bnb-mainnet.g.alchemy.com/v2/test-key');
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('serves a cached Base report from Redis without any fetch', async () => {
    const cached = { address: SELLER, window_days: 30, signals: [], chain: 'base' };
    redis.get.mockImplementation(async (key) => (key === `seller-demand:${SELLER}` ? JSON.stringify(cached) : null));

    // Mixed-case input still hits the lowercase cache key.
    const res = await app().request(`/api/risk/seller-demand?address=${SELLER.toUpperCase().replace('0X', '0x')}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: cached });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
