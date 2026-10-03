import type IORedis from 'ioredis';
import { formatUnits } from 'viem';
import { RISK_CHAINS, riskChainStablecoin, type RiskChainId } from '@chainward/common';
import { fetchRpcFixtures, type RpcFixtureCache, type RpcFixtures } from '@chainward/decode';
import { logger } from './logger.js';

/**
 * Fixture access for risk-check chains we read through public RPC only (BSC).
 * The API runs a shallow version of the worker's fetch (same code, 1-day window)
 * for the history gate + teaser; it is cached in Redis per (chain, address,
 * window) so a retry or a concurrent submit never re-scans.
 */

const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS ?? '15000', 10);
// The precheck runs INSIDE the POST /check request (the web proxy times out at
// 30s), so it is a shallow scan: one day of logs under a short budget. The
// worker's full-window scan has its own cache entry.
const PRECHECK_WINDOW_DAYS = parseFloat(process.env.RISK_RPC_PRECHECK_WINDOW_DAYS ?? '1');
const PRECHECK_BUDGET_MS = parseInt(process.env.RISK_RPC_PRECHECK_BUDGET_MS ?? '8000', 10);

export function redisFixtureCache(redis: IORedis): RpcFixtureCache {
  return {
    get: (key) => redis.get(key),
    set: (key, value, ttlSec) => redis.set(key, value, 'EX', ttlSec),
  };
}

export async function fetchChainFixtures(chain: RiskChainId, address: string, redis: IORedis): Promise<RpcFixtures> {
  return fetchRpcFixtures(chain, address, {
    fetchTimeoutMs: FETCH_TIMEOUT_MS,
    windowDays: PRECHECK_WINDOW_DAYS,
    scanBudgetMs: PRECHECK_BUDGET_MS,
    cache: redisFixtureCache(redis),
    logger,
  });
}

function hexToBigInt(hex: string | undefined): bigint {
  if (!hex || hex === '0x') return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

export interface RpcTeaserStats {
  tx_count: number;
  eth_balance: number;
  usdc_balance: number;
  token_count: number;
  unique_counterparties_30d: number;
  latest_transfer_at: string | null;
  is_acp_agent: boolean;
}

/** Cheap public stats from an RPC fixture set — balances and counts only, never flags. */
export function teaserStatsFromFixtures(address: string, fx: RpcFixtures): RpcTeaserStats {
  const cfg = RISK_CHAINS[fx.chain];
  const usdc = riskChainStablecoin(fx.chain, 'USDC');
  const self = address.toLowerCase();

  // Counterparties over the scanned window (a lower bound), excluding the wallet itself.
  const counterparties = new Set<string>();
  let latest: string | null = null;
  const items = fx.blockscout_transfers.items as Array<{ from: { hash: string }; to: { hash: string }; timestamp: string }>;
  for (const t of items) {
    for (const h of [t.from.hash, t.to.hash]) {
      const lower = h.toLowerCase();
      if (lower !== self) counterparties.add(lower);
    }
    if (!latest || t.timestamp > latest) latest = t.timestamp;
  }

  return {
    tx_count: parseInt(fx.sentinel_nonce.result, 16) || 0,
    eth_balance: Number(formatUnits(hexToBigInt(fx.sentinel_eth_balance.result), cfg.nativeDecimals)),
    usdc_balance: usdc ? Number(formatUnits(hexToBigInt(fx.stablecoin_balances.USDC), usdc.decimals)) : 0,
    token_count: fx.token_count,
    unique_counterparties_30d: counterparties.size,
    latest_transfer_at: latest,
    // ACP is a Base registry.
    is_acp_agent: false,
  };
}
