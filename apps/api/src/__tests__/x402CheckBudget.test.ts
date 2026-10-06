import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// GET /api/risk/x402 without the payment middleware. The web proxy gives paid
// paths 65 s, and x402 settles on any 2xx even if the caller has gone, so the
// handler's 55 s budget must cover the whole request, including the history
// precheck that runs before the decode is queued.
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
const job = vi.hoisted(() => ({ id: 'job-1', getState: vi.fn(async () => 'active') }));
const riskCheck = vi.hoisted(() => ({ add: vi.fn(async () => job) }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/queue.js', () => ({ getQueues: () => ({ riskCheck }) }));
vi.mock('../lib/db.js', () => {
  // select().from().where().orderBy().limit() → no report on file
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'from', 'where', 'orderBy']) q[m] = () => q;
  q.limit = async () => [];
  return { getDb: () => q };
});

import { risk } from '../routes/risk.js';
import { handleError } from '../middleware/errorHandler.js';

const ADDRESS = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/risk', risk);
  return a;
}

describe('GET /api/risk/x402 time budget', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    // Blockscout's counters answer after 15 s (its timeout): the wallet has history.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(
              () => resolve(new Response(JSON.stringify({ transactions_count: '12', token_transfers_count: '3' }))),
              15_000,
            ),
          ),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('gives up with 504 within 55 s of the request arriving, slow precheck included', async () => {
    let status: number | undefined;
    const pending = Promise.resolve(app().request(`/api/risk/x402?address=${ADDRESS}`)).then((res) => {
      status = res.status;
      return res;
    });

    await vi.advanceTimersByTimeAsync(57_000);

    expect(riskCheck.add).toHaveBeenCalled();
    expect(status).toBe(504);
    const body = (await (await pending).json()) as { error: { code: string } };
    expect(body.error.code).toBe('CHECK_TIMEOUT');
  });
});
