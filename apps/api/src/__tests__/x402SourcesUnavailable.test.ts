import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { CLASSIFIER_VERSION } from '@chainward/decode';

// GET /api/risk/x402 without the payment middleware. x402 settles on any 2xx, so a
// report whose transfer list could not be read (every source failed) must come
// back as a non-2xx: the buyer is not charged for a check that could not see the chain.
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
const job = vi.hoisted(() => ({ id: 'job-1', getState: vi.fn(async () => 'completed') }));
const riskCheck = vi.hoisted(() => ({ add: vi.fn(async () => job) }));
/** latestReport() answers, in order; the last one repeats. */
const reports = vi.hoisted(() => ({ queue: [] as unknown[][] }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/queue.js', () => ({ getQueues: () => ({ riskCheck }) }));
vi.mock('../lib/db.js', () => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'from', 'where', 'orderBy']) q[m] = () => q;
  q.limit = async () => (reports.queue.length > 1 ? reports.queue.shift() : reports.queue[0]) ?? [];
  return { getDb: () => q };
});

import { risk } from '../routes/risk.js';
import { handleError } from '../middleware/errorHandler.js';

const ADDRESS = '0x2d0b6cd9485e59a6edc10b048227faf0e81d174d';
const UNAVAILABLE =
  'Every transfer source failed: public Base RPC logs (eth_getLogs: 400); Blockscout (blockscout transfers: 403).';

function row(fetchMeta: Record<string, unknown>, flags: Array<{ id: string }> = []) {
  return {
    id: 'r1',
    walletAddress: ADDRESS,
    chain: 'base',
    asOfBlock: 52_276_747,
    classifierVersion: CLASSIFIER_VERSION,
    band: 'low-signal',
    flagCount: flags.length,
    topFlags: [],
    viewCount: 0,
    attestationUid: null,
    attestationTx: null,
    attestedAt: null,
    generatedAt: new Date(),
    riskAssessment: { band: 'low-signal', flags, not_assessed: ['x'], classifier_version: CLASSIFIER_VERSION },
    reportData: {
      wallet: { type: 'eoa', nonce: 129 },
      activity: { transfers_30d: 7, unique_counterparties_30d: 3, latest_transfer_at: '2026-10-07T09:12:00Z' },
      fetch_meta: { transfers_fetched: 7, transfers_truncated: false, ...fetchMeta },
      survival: { classification: 'active' },
    },
  };
}

const degraded = () => row({ transfers_fetched: 0, transfers_unavailable: UNAVAILABLE });
const good = () => row({ transfers_source: 'alchemy' });

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/risk', risk);
  return a;
}

async function paidRequest() {
  const pending = Promise.resolve(app().request(`/api/risk/x402?address=${ADDRESS}`));
  await vi.advanceTimersByTimeAsync(5_000);
  const res = await pending;
  return { status: res.status, body: (await res.json()) as any };
}

describe('GET /api/risk/x402 when the chain sources could not be read', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    riskCheck.add.mockClear();
    // Blockscout's counters (history precheck): the wallet has history.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ transactions_count: '129', token_transfers_count: '7' }))),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('answers 503 SOURCES_UNAVAILABLE instead of selling a report that could not read the transfer list', async () => {
    reports.queue = [[], [degraded()]]; // nothing cached; the fresh decode comes back degraded
    const { status, body } = await paidRequest();

    expect(riskCheck.add).toHaveBeenCalledTimes(1);
    expect(status).toBe(503);
    expect(body.error.code).toBe('SOURCES_UNAVAILABLE');
    expect(body.error.message).toMatch(/not charged/i);
  });

  it('does not resell a cached report that could not read the chain: it runs a fresh decode', async () => {
    reports.queue = [[degraded()], [good()]]; // degraded report cached inside the TTL; the re-run reads the chain
    const { status, body } = await paidRequest();

    expect(riskCheck.add).toHaveBeenCalledTimes(1);
    expect(status).toBe(200);
    expect(body.data.status).toBe('ready');
    expect(body.data.report.coverage.window.transfers_unavailable).toBeUndefined();
  });

  it('still serves a cached report whose transfer list was read, without re-running', async () => {
    reports.queue = [[good()]];
    const { status, body } = await paidRequest();

    expect(riskCheck.add).not.toHaveBeenCalled();
    expect(status).toBe(200);
    expect(body.data.report.address).toBe(ADDRESS);
  });
});
