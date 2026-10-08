import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// GET /api/risk/hires through the Hono router, without the x402 payment
// middleware that index.ts mounts in front of it. No network, no real Redis:
// the check itself (runHireCheck) is mocked; only its wiring is under test.
const redis = vi.hoisted(() => ({
  get: vi.fn<(key: string) => Promise<string | null>>(),
  set: vi.fn(async (..._args: unknown[]) => 'OK'),
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
const runHireCheck = vi.hoisted(() => vi.fn());

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('@chainward/decode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chainward/decode')>()),
  runHireCheck,
}));

import { HireCheckError } from '@chainward/decode';
import { risk } from '../routes/risk.js';
import { handleError } from '../middleware/errorHandler.js';

const OWNER = '0x15d08640aeefbdce11930d9c9a30884011f654f6';
const ALCHEMY_BASE = 'https://base-mainnet.g.alchemy.com/v2/test-key';

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

const headResponse = () =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x7821000' }), { headers: { 'content-type': 'application/json' } });

describe('GET /api/risk/hires', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    redis.get.mockReset().mockResolvedValue(null);
    redis.set.mockClear();
    runHireCheck.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('answers 400 for chain=base: the hire check is BNB Chain only for now', async () => {
    const res = await app().request('/api/risk/hires?agent=332962&chain=base');
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toBe('hire check is BNB Chain only for now');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runHireCheck).not.toHaveBeenCalled();
  });

  it('answers 400 for an unknown chain', async () => {
    const res = await app().request('/api/risk/hires?agent=332962&chain=foo');
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['', 'abc', '0x123', '-1', '1.5', `${OWNER}00`, '12345678901234567890'])(
    'answers 400 INVALID_TARGET for agent=%j',
    async (agent) => {
      const res = await app().request(`/api/risk/hires?agent=${encodeURIComponent(agent)}&chain=bsc`);
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe('INVALID_TARGET');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(runHireCheck).not.toHaveBeenCalled();
    },
  );

  it('serves a cached report from Redis without any fetch', async () => {
    const cached = { chain: 'bsc', agent_id: 332962, owner: OWNER, hirers: [] };
    redis.get.mockImplementation(async (key) => (key === 'hires:bsc:332962' ? JSON.stringify(cached) : null));

    const res = await app().request('/api/risk/hires?agent=332962&chain=bsc');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: cached });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runHireCheck).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('keys an owner address on its lowercase form, and defaults chain to bsc', async () => {
    const cached = { chain: 'bsc', agent_id: null, owner: OWNER };
    redis.get.mockImplementation(async (key) => (key === `hires:bsc:${OWNER}` ? JSON.stringify(cached) : null));

    const res = await app().request(`/api/risk/hires?agent=${OWNER.toUpperCase().replace('0X', '0x')}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: cached });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 UNAVAILABLE without an Alchemy RPC', async () => {
    vi.stubEnv('SELLER_DEMAND_RPC_URL', '');
    vi.stubEnv('BASE_RPC_URL', 'https://mainnet.base.org');
    const res = await app().request('/api/risk/hires?agent=332962&chain=bsc');
    expect(res.status).toBe(503);
    expect(((await res.json()) as ErrorBody).error.code).toBe('UNAVAILABLE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 UNAVAILABLE when BNB is not enabled for the Alchemy app', async () => {
    vi.stubEnv('SELLER_DEMAND_RPC_URL', ALCHEMY_BASE);
    vi.stubEnv('SELLER_DEMAND_BSC_RPC_URL', '');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'BNB_MAINNET is not enabled for this app.' } }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await app().request('/api/risk/hires?agent=332962&chain=bsc');
    expect(res.status).toBe(503);
    expect(((await res.json()) as ErrorBody).error.code).toBe('UNAVAILABLE');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://bnb-mainnet.g.alchemy.com/v2/test-key');
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('answers 503 SOURCES_UNAVAILABLE, not 500, when Alchemy is still throttling after retries', async () => {
    vi.stubEnv('SELLER_DEMAND_RPC_URL', ALCHEMY_BASE);
    vi.stubEnv('SELLER_DEMAND_BSC_RPC_URL', '');
    fetchMock.mockImplementation(async () => headResponse());
    runHireCheck.mockRejectedValue(new Error('transfer source throttled'));
    const res = await app().request('/api/risk/hires?agent=332962&chain=bsc');
    expect(res.status).toBe(503);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('SOURCES_UNAVAILABLE');
    expect(body.error.message).toMatch(/not charged/);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('runs the check on the BNB Alchemy URL and caches the report for an hour', async () => {
    vi.stubEnv('SELLER_DEMAND_RPC_URL', ALCHEMY_BASE);
    vi.stubEnv('SELLER_DEMAND_BSC_RPC_URL', '');
    fetchMock.mockImplementation(async () => headResponse());
    const report = { chain: 'bsc', agent_id: 332962, owner: OWNER, hirers: [], summary: { passes_three_independent: false } };
    runHireCheck.mockResolvedValue(report);

    const res = await app().request('/api/risk/hires?agent=332962&chain=bsc');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: report });
    expect(runHireCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: { kind: 'id', id: 332962 },
        head: 0x7821000,
        alchemyUrl: 'https://bnb-mainnet.g.alchemy.com/v2/test-key',
      }),
    );
    expect(redis.set).toHaveBeenCalledWith('hires:bsc:332962', JSON.stringify(report), 'EX', 3600);
  });

  it('answers 404 NOT_FOUND (so the buyer is not charged) for an unknown agent id', async () => {
    vi.stubEnv('SELLER_DEMAND_RPC_URL', ALCHEMY_BASE);
    fetchMock.mockImplementation(async () => headResponse());
    runHireCheck.mockRejectedValue(new HireCheckError('AGENT_NOT_FOUND', 'No ERC-8004 agent #5 on BNB Chain'));

    const res = await app().request('/api/risk/hires?agent=5&chain=bsc');

    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorBody).error.code).toBe('NOT_FOUND');
    expect(redis.set).not.toHaveBeenCalled();
  });
});
