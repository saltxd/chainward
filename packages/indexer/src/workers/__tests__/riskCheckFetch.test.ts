import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/redis.js', () => ({ getRedis: () => ({}) }));
vi.mock('../../lib/db.js', () => ({ getDb: () => ({}) }));

import { baseFetchOptions } from '../riskCheck.js';

// The indexer as deployed: the sentinel node, a public fallback RPC for `latest`
// reads, and the Alchemy URL (SELLER_DEMAND_RPC_URL) the x402 board already uses.
const PROD_ENV = {
  SENTINEL_RPC: 'http://cw-sentinel.nox:8545',
  BASE_RPC_URL: 'https://base-rpc.publicnode.com',
  BASE_RPC_FALLBACK_URL: 'https://base.drpc.org',
  SELLER_DEMAND_RPC_URL: 'https://base-mainnet.g.alchemy.com/v2/key',
  FETCH_TIMEOUT_MS: '15000',
};

describe('baseFetchOptions (Base risk check)', () => {
  it("gives the transfer fetch the Alchemy URL, so a stale node doesn't leave it without a source", () => {
    expect(baseFetchOptions(PROD_ENV, 'axelrod')).toMatchObject({
      sentinelRpc: 'http://cw-sentinel.nox:8545',
      fallbackRpc: 'https://base.drpc.org',
      alchemyRpc: 'https://base-mainnet.g.alchemy.com/v2/key',
      fetchTimeoutMs: 15000,
      agentName: '@axelrod',
    });
  });

  it('leaves the Alchemy source off when no Alchemy URL is configured', () => {
    const { SELLER_DEMAND_RPC_URL: _unused, ...env } = PROD_ENV;
    const opts = baseFetchOptions(env, undefined);
    expect(opts.alchemyRpc).toBeUndefined();
    expect(opts.agentName).toBeUndefined();
  });
});
