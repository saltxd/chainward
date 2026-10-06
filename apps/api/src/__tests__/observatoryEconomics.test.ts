import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// profit30d must be 30-day revenue minus 30-day gas. It used to be lifetime ACP
// revenue minus 30-day gas, so a long-dormant agent showed a huge "30-day profit".
// The DB is faked per query; the fixture agent's lifetime revenue (572,800) is
// far from its 30-day on-chain revenue (40).
const redis = vi.hoisted(() => ({
  get: vi.fn(async () => null),
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
const queries = vi.hoisted(() => ({ handler: (_text: string): unknown[] => [] }));

vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/db.js', () => {
  const dialect = new PgDialect();
  return {
    getDb: () => ({
      execute: async (query: SQL) => queries.handler(dialect.sqlToQuery(query).sql),
    }),
  };
});

import { observatory } from '../routes/observatory.js';

const WALLET = '0xfc9f1ff5ec524759c1dc8e0a6eba6c22805b9d8b';

const acpRow = {
  name: 'Ethy AI',
  wallet_address: WALLET,
  acp_wallet: WALLET,
  obs_wallet: WALLET,
  symbol: 'ETHY',
  role: 'provider',
  profile_pic: null,
  has_graduated: true,
  is_online: false,
  twitter_handle: null,
  revenue: '572800',
  agdp: '900000',
  jobs: 4000,
  success_rate: '98',
  unique_buyers: 120,
  offerings: [],
  last_active_at: '2026-06-03T00:00:00Z',
};

function app(): Hono {
  const a = new Hono();
  a.route('/api/observatory', observatory);
  return a;
}

interface Economics {
  revenue: number;
  revenue30d: number;
  gasCost30d: number;
  profit30d: number;
  gasEfficiency: number | null;
}

describe('ACP economics profit30d', () => {
  beforeEach(() => {
    redis.get.mockClear();
  });

  it('GET /economics/:wallet is 30-day revenue minus 30-day gas', async () => {
    queries.handler = (text) => {
      if (text.includes('acp_agent_data')) return [acpRow];
      if (text.includes('transactions')) {
        return [{ gas_30d: '13', revenue_30d: '40', tx_count_30d: '4', failed_tx_30d: '0' }];
      }
      return [];
    };

    const res = await app().request(`/api/observatory/economics/${WALLET}`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Economics };
    expect(data.revenue).toBe(572800);
    expect(data.revenue30d).toBe(40);
    expect(data.gasCost30d).toBe(13);
    expect(data.profit30d).toBe(27);
    expect(data.gasEfficiency).toBeCloseTo(40 / 13);
  });

  it('GET /economics/:wallet with no 30-day activity has zero profit, not lifetime revenue', async () => {
    queries.handler = (text) => {
      if (text.includes('acp_agent_data')) return [acpRow];
      if (text.includes('transactions')) return [{ gas_30d: '0', revenue_30d: '0', tx_count_30d: '0', failed_tx_30d: '0' }];
      return [];
    };

    const { data } = (await (await app().request(`/api/observatory/economics/${WALLET}`)).json()) as { data: Economics };
    expect(data.profit30d).toBe(0);
    expect(data.gasEfficiency).toBeNull();
  });

  it('GET /economics lists each agent with 30-day revenue minus 30-day gas', async () => {
    queries.handler = (text) => {
      if (text.includes('acp_ecosystem_metrics')) return [];
      if (text.includes('acp_agent_data')) return [{ ...acpRow, gas_cost_30d: '13', revenue_30d: '40' }];
      return [];
    };

    const res = await app().request('/api/observatory/economics');
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { topAgents: Economics[] } };
    const agent = data.topAgents[0]!;
    expect(agent.revenue).toBe(572800);
    expect(agent.revenue30d).toBe(40);
    expect(agent.profit30d).toBe(27);
  });
});
