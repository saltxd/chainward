import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { diversifyFeed, summarizeRoster, type FeedItem } from '@chainward/observatory';

// The observatory used to count every agent_registry row (~3,400, mostly unnamed
// ERC-8004 registrations that never move money) and its wire was one agent's
// token dust. Shown wallets are named or moved money in 30 days; the wire keeps
// one row per transaction and at most two per agent.
const redis = vi.hoisted(() => ({
  get: vi.fn(async (): Promise<string | null> => null),
  set: vi.fn(async () => 'OK'),
  setex: vi.fn(async () => 'OK'),
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
const queries = vi.hoisted(() => ({
  handler: (_text: string, _params: unknown[]): unknown[] => [],
}));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/db.js', () => {
  const dialect = new PgDialect();
  return {
    getDb: () => ({
      execute: async (query: SQL) => {
        const q = dialect.sqlToQuery(query);
        return queries.handler(q.sql, q.params);
      },
    }),
  };
});

import { observatory } from '../routes/observatory.js';

function app(): Hono {
  const a = new Hono();
  a.route('/api/observatory', observatory);
  return a;
}

const NAMED_ACTIVE = '0x1111111111111111111111111111111111111111';
const NAMED_IDLE = '0x2222222222222222222222222222222222222222';
const UNNAMED_IDLE = '0x3333333333333333333333333333333333333333';
const UNNAMED_ACTIVE = '0x4444444444444444444444444444444444444444';
const NAMED_8004_IDLE = '0x5555555555555555555555555555555555555555';

const rosterRows = [
  { wallet_address: NAMED_ACTIVE, registry_source: 'virtuals', named: true, active_30d: true },
  { wallet_address: NAMED_IDLE, registry_source: 'virtuals', named: true, active_30d: false },
  { wallet_address: UNNAMED_IDLE, registry_source: 'erc8004', named: false, active_30d: false },
  { wallet_address: UNNAMED_ACTIVE, registry_source: 'erc8004', named: false, active_30d: true },
  { wallet_address: NAMED_8004_IDLE, registry_source: 'erc8004', named: true, active_30d: false },
];

const isRosterQuery = (text: string) => text.includes('agent_registry') && text.includes('active_30d');

function feedRow(over: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    timestamp: '2026-10-11 18:00:00+00',
    agent_name: 'Larry',
    slug: 'larry',
    wallet_address: NAMED_ACTIVE,
    direction: 'in',
    token_symbol: 'USDC',
    amount_usd: '10',
    gas_cost_usd: '0.01',
    tx_hash: '0xaaa',
    tx_type: 'transfer',
    status: 'confirmed',
    ...over,
  };
}

beforeEach(() => {
  redis.get.mockReset();
  redis.get.mockResolvedValue(null);
  queries.handler = () => [];
});

describe('summarizeRoster', () => {
  it('drops unnamed wallets with no transfer in 30 days and counts the rest', () => {
    const s = summarizeRoster(rosterRows);
    expect(s.wallets).toEqual([NAMED_ACTIVE, NAMED_IDLE, UNNAMED_ACTIVE, NAMED_8004_IDLE]);
    expect(s.named).toBe(3);
    expect(s.bySource).toEqual({ virtuals: 2, erc8004: 2, other: 0 });
  });

  it('counts a wallet once even when two registry rows point at it', () => {
    const s = summarizeRoster([rosterRows[0]!, { ...rosterRows[0]!, registry_source: 'manual' }]);
    expect(s.wallets).toEqual([NAMED_ACTIVE]);
    expect(s.named).toBe(1);
  });
});

describe('GET /api/observatory', () => {
  it('counts named wallets plus unnamed ones that moved money, never idle unnamed rows', async () => {
    let statsWallets: unknown;
    queries.handler = (text, params) => {
      if (isRosterQuery(text)) return rosterRows;
      if (text.includes('tx_24h')) {
        statsWallets = params.find((p) => typeof p === 'string' && p.startsWith('{0x'));
        return [{ tx_24h: '5', tx_7d: '40', tx_30d: '90', active_24h: '1', active_7d: '2', active_30d: '2' }];
      }
      return [];
    };

    const res = await app().request('/api/observatory');
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, unknown> };
    expect(data.agentsTracked).toBe(4);
    expect(data.totalAgents).toBe(4);
    expect(data.namedAgents).toBe(3);
    expect(data.agentsBySource).toEqual({ virtuals: 2, erc8004: 2, other: 0 });
    expect(data.activeAgents24h).toBe(1);
    expect(data.activeAgents7d).toBe(2);
    expect(data.activeAgents30d).toBe(2);
    expect(data.transactions7d).toBe(40);
    expect(String(statsWallets)).not.toContain(UNNAMED_IDLE);
    expect(String(statsWallets)).toContain(UNNAMED_ACTIVE);
  });
});

describe('GET /api/observatory/feed', () => {
  it('keeps one row per transaction and at most two per agent, with the agent slug', async () => {
    queries.handler = (text) => {
      if (isRosterQuery(text)) return rosterRows;
      if (text.includes('tx_hash')) {
        return [
          feedRow({ tx_hash: '0xa1', token_symbol: 'MAMO', amount_usd: null, timestamp: '2026-10-11 18:33:00+00' }),
          feedRow({ tx_hash: '0xa1', token_symbol: 'USDC', amount_usd: '11051.38', timestamp: '2026-10-11 18:33:00+00' }),
          feedRow({ tx_hash: '0xa2', timestamp: '2026-10-11 18:30:00+00' }),
          feedRow({ tx_hash: '0xa3', timestamp: '2026-10-11 18:20:00+00' }),
          feedRow({
            tx_hash: '0xb1',
            agent_name: 'Solveig',
            slug: 'solveig',
            wallet_address: UNNAMED_ACTIVE,
            timestamp: '2026-10-11 18:10:00+00',
          }),
        ];
      }
      return [];
    };

    const res = await app().request('/api/observatory/feed');
    const { data } = (await res.json()) as { data: FeedItem[] };
    expect(data.map((r) => r.txHash)).toEqual(['0xa1', '0xa2', '0xb1']);
    expect(data[0]!.tokenSymbol).toBe('USDC');
    expect(data[0]!.amountUsd).toBeCloseTo(11051.38);
    expect(data[0]!.slug).toBe('larry');
  });
});

describe('diversifyFeed', () => {
  const base: FeedItem = {
    timestamp: '2026-10-11T18:00:00Z',
    agentName: 'A',
    slug: 'a',
    walletAddress: '0xA',
    direction: 'in',
    tokenSymbol: 'ETH',
    amountUsd: 1,
    gasCostUsd: 0,
    txHash: '0x1',
    txType: 'transfer',
    status: 'confirmed',
  };

  it('caps the list and keeps newest first', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      ...base,
      walletAddress: `0x${i}`,
      txHash: `0x${i}`,
      timestamp: new Date(Date.UTC(2026, 9, 11, 18, 59 - i)).toISOString(),
    }));
    const out = diversifyFeed(rows, { limit: 10 });
    expect(out).toHaveLength(10);
    expect(out[0]!.txHash).toBe('0x0');
  });

  it('prefers the priced transfer within one transaction', () => {
    const out = diversifyFeed([
      { ...base, tokenSymbol: 'AAPLc', amountUsd: null },
      { ...base, tokenSymbol: 'USDC', amountUsd: 5 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.tokenSymbol).toBe('USDC');
  });
});

describe('GET /api/observatory/agent/:slug', () => {
  it('sends an old, mangled slug to the agent’s current slug with a 301', async () => {
    queries.handler = (text) => {
      if (text.includes('agent_slug_redirects')) return [{ slug: 'captain-dackie' }];
      return [];
    };
    const res = await app().request('/api/observatory/agent/aptain-ackie');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/api/observatory/agent/captain-dackie');
    const body = (await res.json()) as { movedTo: string };
    expect(body.movedTo).toBe('captain-dackie');
  });

  it('is a 404 when the slug is neither current nor an old one', async () => {
    const res = await app().request('/api/observatory/agent/nobody-here');
    expect(res.status).toBe(404);
  });

  it('is a 404, not a 500, when the redirect table is not there yet', async () => {
    queries.handler = (text) => {
      if (text.includes('agent_slug_redirects')) throw new Error('relation "agent_slug_redirects" does not exist');
      return [];
    };
    const res = await app().request('/api/observatory/agent/aptain-ackie');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/observatory/sitemap', () => {
  it('lists only named agents that moved money in the last 30 days, with when they last did', async () => {
    let sitemapSql = '';
    queries.handler = (text) => {
      if (text.includes('last_active_at')) {
        sitemapSql = text;
        return [{ slug: 'larry', last_active_at: '2026-10-11 18:33:19+00' }];
      }
      return [];
    };
    const res = await app().request('/api/observatory/sitemap');
    const { data } = (await res.json()) as { data: Array<{ slug: string; lastActiveAt: string; updatedAt: string }> };
    expect(sitemapSql).toContain('transactions');
    expect(sitemapSql).toContain("INTERVAL '30 days'");
    expect(data).toEqual([
      { slug: 'larry', lastActiveAt: '2026-10-11T18:33:19.000Z', updatedAt: '2026-10-11T18:33:19.000Z' },
    ]);
  });
});
