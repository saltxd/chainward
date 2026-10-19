import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { CLASSIFIER_VERSION } from '@chainward/decode';

// The library lists (homepage "Recently filed", /reports, the sitemap) show the
// answer first: each card carries the same Pay / Hold / third-answer verdict the
// report page opens with, computed from the stored row.

const redis = vi.hoisted(() => {
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
  return { get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), pipeline };
});
/** Each awaited query answers with the next entry. */
const results = vi.hoisted(() => ({ queue: [] as unknown[] }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/queue.js', () => ({ getQueues: () => ({ riskCheck: { add: vi.fn() } }) }));
vi.mock('../lib/db.js', () => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'selectDistinctOn', 'from', 'where', 'orderBy', 'limit', 'offset', 'groupBy']) q[m] = () => q;
  q.as = () => ({});
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(results.queue.shift() ?? []).then(resolve, reject);
  return { getDb: () => q };
});

import { risk } from '../routes/risk.js';
import { handleError } from '../middleware/errorHandler.js';

// Lazarus Group (OFAC SDN), filed before it was listed: no flag stored.
const SANCTIONED = '0x098b716b8aaf21512996dc57eb0615e2383e2f96';

function row(address: string, opts: { activity: Record<string, unknown>; nonce?: number; flags?: Array<Record<string, unknown>>; band?: string }) {
  const flags = opts.flags ?? [];
  return {
    id: address,
    walletAddress: address,
    chain: 'base',
    agentName: null,
    asOfBlock: 1,
    classifierVersion: CLASSIFIER_VERSION,
    band: opts.band ?? 'low-signal',
    flagCount: flags.length,
    topFlags: flags.map((f) => ({ id: f.id, severity: f.severity, title: f.title })),
    viewCount: 3,
    generatedAt: new Date('2026-10-10T12:00:00Z'),
    riskAssessment: { band: opts.band ?? 'low-signal', flags, not_assessed: [], classifier_version: CLASSIFIER_VERSION, signal_density: 0 },
    reportData: { wallet: { type: 'eoa', nonce: opts.nonce ?? 5 }, activity: opts.activity, fetch_meta: {} },
  };
}

const ACTIVE = { transfers_30d: 212, unique_counterparties_30d: 41, latest_transfer_age_hours: 3 };
const QUIET = { transfers_30d: 0, unique_counterparties_30d: 0, latest_transfer_age_hours: null };
const STRANDED = {
  id: 'stranded_value',
  severity: 'high',
  title: 'USDC balance held in a dormant wallet',
  evidence: 'Holds 5451 USDC while classified dormant.',
  source: 's',
};

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/risk', risk);
  return a;
}

async function library(query = '') {
  const res = await app().request(`/api/risk/library?sort=recent&limit=10${query}`);
  return { status: res.status, body: (await res.json()) as any };
}

beforeEach(() => {
  results.queue = [];
});

describe('GET /api/risk/library', () => {
  it('puts the verdict (label and words) on every card', async () => {
    results.queue = [
      [
        row('0x1111111111111111111111111111111111111111', { activity: ACTIVE }),
        row('0x2222222222222222222222222222222222222222', { activity: ACTIVE, flags: [STRANDED], band: 'high-signal' }),
        row('0x3333333333333333333333333333333333333333', { activity: QUIET, nonce: 43 }),
        row('0x4444444444444444444444444444444444444444', { activity: QUIET, nonce: 0 }),
      ],
      [{ total: 4 }],
    ];
    const { status, body } = await library();
    expect(status).toBe(200);
    const verdicts = body.data.reports.map((r: any) => r.verdict);
    expect(verdicts).toEqual([
      { label: 'pay', text: 'Pay' },
      { label: 'hold', text: 'Hold' },
      { label: 'unknown', text: 'Inactive' },
      { label: 'unknown', text: 'No track record' },
    ]);
  });

  it('answers Hold for a sanctioned address filed before it was listed, with the sanctions flag on top', async () => {
    results.queue = [[row(SANCTIONED, { activity: ACTIVE })], [{ total: 1 }]];
    const { body } = await library();
    const card = body.data.reports[0];
    expect(card.verdict).toEqual({ label: 'hold', text: 'Hold' });
    expect(card.top_flags[0]).toMatchObject({ id: 'ofac_sanctioned', severity: 'high' });
    expect(card.top_severity).toBe('high');
    expect(card.flag_count).toBe(1);
  });

  // A px402 relayer pays sellers for agents it does not name (packages/decode/src/privacy-relays.ts).
  it('answers Payer hidden for a px402 relayer filed before it was listed, with the relay flag on top', async () => {
    results.queue = [[row('0x47e5499c44ecf8c78da82b9b64183df1e301a0b4', { activity: ACTIVE })], [{ total: 1 }]];
    const { body } = await library();
    const card = body.data.reports[0];
    expect(card.verdict).toEqual({ label: 'unknown', text: 'Payer hidden' });
    expect(card.top_flags[0]).toMatchObject({ id: 'privacy_relay', severity: 'info' });
    expect(card.flag_count).toBe(1);
  });

  it('carries the verdict in distinct=address mode too', async () => {
    results.queue = [[row('0x1111111111111111111111111111111111111111', { activity: ACTIVE })], [], [{ total: 1 }]];
    const { body } = await library('&distinct=address');
    expect(body.data.reports[0].verdict).toEqual({ label: 'pay', text: 'Pay' });
  });
});
