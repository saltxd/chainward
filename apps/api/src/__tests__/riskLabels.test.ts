import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { CLASSIFIER_VERSION } from '@chainward/decode';

// The label set in the counterparty check: a strong public label is a list match, like
// OFAC. It answers Hold with the label's sentence, needs no chain read, and is applied
// on read, so a report filed before the label existed carries it too.

const redis = vi.hoisted(() => {
  const strings = new Map<string, string>();
  const pipeline = () => {
    const p: Record<string, unknown> = {
      exec: async () => [
        [null, 0],
        [null, 0],
        [null, 1],
        [null, 1],
      ],
    };
    for (const m of ['zremrangebyscore', 'zcard', 'zadd', 'zrem', 'expire']) p[m] = () => p;
    return p;
  };
  return {
    strings,
    get: vi.fn(async (k: string) => strings.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => (strings.set(k, v), 'OK')),
    zremrangebyscore: async () => 0,
    zcard: async () => 0,
    zadd: async () => 1,
    zrem: async () => 1,
    expire: async () => 1,
    pipeline,
  };
});
const job = vi.hoisted(() => ({ id: 'job-1', getState: vi.fn(async () => 'completed') }));
const riskCheck = vi.hoisted(() => ({ add: vi.fn(async () => job) }));
/** latestReport() answers, in order; the last one repeats. */
const reports = vi.hoisted(() => ({ queue: [] as unknown[][] }));

const labelStore = vi.hoisted(() => ({ map: new Map<string, unknown[]>() }));
vi.mock('../lib/labels.js', () => ({
  labelsFor: async (address: string, chain: string) => labelStore.map.get(`${chain}:${address.toLowerCase()}`) ?? [],
  publicLabelsForRows: async (rows: Array<{ chain: string; walletAddress: string }>) =>
    new Map(rows.map((r) => [`${r.chain}:${r.walletAddress.toLowerCase()}`, labelStore.map.get(`${r.chain}:${r.walletAddress.toLowerCase()}`) ?? []])),
}));
vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/queue.js', () => ({ getQueues: () => ({ riskCheck }) }));
vi.mock('../lib/db.js', () => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'from', 'where', 'orderBy']) q[m] = () => q;
  q.limit = async () => (reports.queue.length > 1 ? reports.queue.shift() : reports.queue[0]) ?? [];
  return { getDb: () => q };
});
// Our node's wallet lookup: nothing there either, so an unlisted address is no_history.
vi.mock('../services/walletLookupService.js', () => ({
  WalletLookupService: class {
    async lookup() {
      return { balances: [], transactions: [] };
    }
  },
}));

import { risk } from '../routes/risk.js';
import { handleError } from '../middleware/errorHandler.js';

const LABELED = '0x2d0b6cd9485e59a6edc10b048227faf0e81d174d';
const UNAVAILABLE = 'Every transfer source failed: public Base RPC logs (eth_getLogs: 400).';
const SENTENCE = "One of 48 wallets that appear to be run together in Set and Earn, from our decode Set and Earn's First Week.";

function label(strength: 'strong' | 'weak' = 'strong') {
  return {
    chain: 'base',
    address: LABELED,
    kind: 'run_together',
    strength,
    visibility: 'public',
    group_key: 'ring-48',
    group_size: 48,
    sentence: SENTENCE,
    source_type: 'dataset',
    source_ref: 'set-and-earn-week-one',
    source_url: 'https://chainward.ai/decodes/set-and-earn-week-one',
    evidence_url: null,
    as_of: '2026-10-01',
  };
}

/** A stored report as the indexer filed it, before the label existed. */
function row(address: string, opts: { fetchMeta?: Record<string, unknown>; flags?: unknown[]; attested?: boolean } = {}) {
  const flags = opts.flags ?? [];
  return {
    id: 'r1',
    walletAddress: address,
    chain: 'base',
    asOfBlock: 52_276_747,
    classifierVersion: CLASSIFIER_VERSION,
    band: 'low-signal',
    flagCount: flags.length,
    topFlags: [],
    viewCount: 0,
    attestationUid: opts.attested ? `0x${'ab'.repeat(32)}` : null,
    attestationTx: null,
    attestedAt: opts.attested ? new Date() : null,
    generatedAt: new Date(),
    riskAssessment: { band: flags.length ? 'mixed' : 'low-signal', flags, not_assessed: ['x'], classifier_version: CLASSIFIER_VERSION, signal_density: 0 },
    reportData: {
      wallet: { type: 'eoa', nonce: 0 },
      activity: { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_at: null },
      fetch_meta: { transfers_fetched: 0, transfers_truncated: false, ...opts.fetchMeta },
      survival: { classification: 'unknown' },
    },
  };
}

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/risk', risk);
  return a;
}

async function paid(address: string) {
  const pending = Promise.resolve(app().request(`/api/risk/x402?address=${address}`));
  await vi.advanceTimersByTimeAsync(5_000);
  const res = await pending;
  return { status: res.status, body: (await res.json()) as any };
}

async function freeCheck(address: string) {
  const res = await app().request('/api/risk/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
    body: JSON.stringify({ target: address }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

function expectSanctionsHold(report: any) {
  expect(report.verdict).toMatchObject({ label: 'hold', text: 'Hold' });
  expect(report.verdict.reason).toMatch(/US sanctions list \(OFAC\)/);
  expect(report.flags[0]).toMatchObject({ id: 'ofac_sanctioned', severity: 'high' });
  expect(report.band).toBe('high-signal');
  expect(report.coverage.checks.find((c: any) => c.id === 'ofac_sanctioned')).toMatchObject({ status: 'raised' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  riskCheck.add.mockClear();
  redis.strings.clear();
  // Blockscout counters: no transactions, no token transfers.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ transactions_count: '0', token_transfers_count: '0' }))));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});


beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  riskCheck.add.mockClear();
  redis.strings.clear();
  labelStore.map.clear();
  // Blockscout counters: no transactions, no token transfers.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ transactions_count: '0', token_transfers_count: '0' }))));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function expectLabelHold(report: any) {
  expect(report.verdict).toMatchObject({ label: 'hold', text: 'Hold', reason: SENTENCE });
  expect(report.flags[0]).toMatchObject({ id: 'known_label', severity: 'medium', evidence: SENTENCE });
  expect(report.coverage.checks.find((c: any) => c.id === 'known_label')).toMatchObject({ status: 'raised' });
}

describe('GET /api/risk/x402 on a labeled address', () => {
  it('serves a cached report filed before the label with the flag and Hold', async () => {
    labelStore.map.set(`base:${LABELED}`, [label()]);
    reports.queue = [[row(LABELED)]];
    const { status, body } = await paid(LABELED);
    expect(riskCheck.add).not.toHaveBeenCalled();
    expect(status).toBe(200);
    expectLabelHold(body.data.report);
  });

  it('runs the check instead of answering no_history, and answers Hold', async () => {
    labelStore.map.set(`base:${LABELED}`, [label()]);
    reports.queue = [[], [row(LABELED)]];
    const { status, body } = await paid(LABELED);
    expect(riskCheck.add).toHaveBeenCalledTimes(1);
    expect(status).toBe(200);
    expectLabelHold(body.data.report);
  });

  it('answers Hold instead of 503 when the transfer list could not be read', async () => {
    labelStore.map.set(`base:${LABELED}`, [label()]);
    reports.queue = [[], [row(LABELED, { fetchMeta: { transfers_unavailable: UNAVAILABLE } })]];
    const { status, body } = await paid(LABELED);
    expect(status).toBe(200);
    expectLabelHold(body.data.report);
  });

  it('keeps the no-history answer for a weak label', async () => {
    labelStore.map.set(`base:${LABELED}`, [label('weak')]);
    reports.queue = [[]];
    const { body } = await paid(LABELED);
    expect(riskCheck.add).not.toHaveBeenCalled();
    expect(body.data.status).toBe('no_history');
  });
});

describe('POST /api/risk/check on a labeled address', () => {
  it('queues the check instead of answering no_history', async () => {
    labelStore.map.set(`base:${LABELED}`, [label()]);
    reports.queue = [[]];
    const { status, body } = await freeCheck(LABELED);
    expect(status).toBe(200);
    expect(riskCheck.add).toHaveBeenCalledTimes(1);
    expect(body.data.status).not.toBe('no_history');
  });
});
