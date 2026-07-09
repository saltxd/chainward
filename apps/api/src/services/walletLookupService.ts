import type IORedis from 'ioredis';
import {
  assessNodeFreshness,
  getMaxHeadLagSec,
  type ChainDataProvider,
  type NodeFreshness,
} from '@chainward/common';
import { getChainDataProvider, getFallbackChainDataProvider } from '../providers/index.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/errorHandler.js';

// -- Public interfaces (API response shape) -----------------------------------

export interface TokenBalance {
  contractAddress: string;
  tokenBalance: string;
  error: string | null;
}

export interface NativeBalance {
  contractAddress: 'native';
  tokenBalance: string;
  error: null;
}

export interface LookupTransaction {
  hash: string;
  blockNum: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: string;
  direction: 'inbound' | 'outbound';
}

export interface WalletLookupResult {
  address: string;
  chain: string;
  balances: (TokenBalance | NativeBalance)[];
  transactions: LookupTransaction[];
  cachedAt: string;
  /** RPC role that served this lookup — 'primary' normally, 'fallback' when the primary head was stale. */
  dataSource?: 'primary' | 'fallback';
}

// -- Constants ----------------------------------------------------------------

const CACHE_PREFIX = 'lookup:';
const CACHE_TTL_SECONDS = 600;
const TRANSFER_PAGE_SIZE = 25;
const MAX_MERGED_TXS = 50;

// -- Service ------------------------------------------------------------------

export class WalletLookupService {
  constructor(private redis: IORedis) {}

  async lookup(address: string): Promise<WalletLookupResult> {
    const cacheKey = `${CACHE_PREFIX}${address.toLowerCase()}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      logger.debug({ address }, 'Wallet lookup cache hit');
      return JSON.parse(cached) as WalletLookupResult;
    }

    logger.info({ address }, 'Wallet lookup cache miss, fetching from chain data provider');

    // Freshness gate: a stale-but-answering primary node would silently return
    // balances/transfers frozen days behind tip. Refuse to source a lookup from it —
    // prefer the fallback RPC, else fail loud (503). Never serve stale public stats.
    const { provider, role } = await this.selectFreshProvider(address);

    let inboundTransfers, outboundTransfers, tokenBalances: Awaited<ReturnType<typeof provider.getTokenBalances>>, nativeBalance: string;

    try {
      [inboundTransfers, outboundTransfers, tokenBalances, nativeBalance] = await Promise.all([
        provider.getTransferHistory({
          address,
          direction: 'inbound',
          maxCount: TRANSFER_PAGE_SIZE,
        }),
        provider.getTransferHistory({
          address,
          direction: 'outbound',
          maxCount: TRANSFER_PAGE_SIZE,
        }),
        provider.getTokenBalances(address),
        provider.getNativeBalance(address),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown provider error';
      logger.error({ err, address }, 'Chain data provider error');
      throw new AppError(502, 'PROVIDER_ERROR', message);
    }

    const inbound: LookupTransaction[] = inboundTransfers.map((tx) => ({
      hash: tx.hash,
      blockNum: tx.blockNum,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      asset: tx.asset,
      category: tx.category,
      direction: 'inbound' as const,
    }));

    const outbound: LookupTransaction[] = outboundTransfers.map((tx) => ({
      hash: tx.hash,
      blockNum: tx.blockNum,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      asset: tx.asset,
      category: tx.category,
      direction: 'outbound' as const,
    }));

    const mergedTxs = this.mergeTransactions(inbound, outbound);

    const balances: (TokenBalance | NativeBalance)[] = [
      { contractAddress: 'native' as const, tokenBalance: nativeBalance, error: null },
      ...tokenBalances.map((tb) => ({
        contractAddress: tb.contractAddress,
        tokenBalance: tb.tokenBalance,
        error: tb.error,
      })),
    ];

    const result: WalletLookupResult = {
      address: address.toLowerCase(),
      chain: 'base',
      balances,
      transactions: mergedTxs,
      cachedAt: new Date().toISOString(),
      dataSource: role,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);

    return result;
  }

  /**
   * Picks a fresh chain-data provider. Probes the primary node head (BASE_RPC_URL);
   * if fresh, uses the default provider. If the primary is stale-but-answering or
   * unreachable, prefers the fallback RPC (BASE_RPC_FALLBACK_URL) when it is fresh.
   * If neither is fresh, throws 503 rather than serve numbers from a frozen head.
   * Emits a structured warn line on every trip for prod observability.
   */
  private async selectFreshProvider(
    address: string,
  ): Promise<{ provider: ChainDataProvider; role: 'primary' | 'fallback' }> {
    const primaryUrl = process.env.BASE_RPC_URL;
    // No identifiable primary URL — keep prior behavior (default provider, ungated).
    if (!primaryUrl) return { provider: getChainDataProvider(), role: 'primary' };

    const fallbackUrl = process.env.BASE_RPC_FALLBACK_URL;
    const maxLagSec = getMaxHeadLagSec();

    let primary: NodeFreshness | null = null;
    try {
      primary = await assessNodeFreshness(primaryUrl, { maxLagSec });
    } catch (err) {
      logger.warn(
        { address, err: err instanceof Error ? err.message : String(err) },
        'wallet-lookup: primary RPC head probe failed',
      );
    }

    if (primary?.fresh) return { provider: getChainDataProvider(), role: 'primary' };

    logger.warn(
      {
        address,
        primaryHeadNumber: primary?.headNumber ?? null,
        primaryHeadAgeSeconds: primary?.ageSeconds ?? null,
        maxLagSec,
        fallbackConfigured: Boolean(fallbackUrl),
      },
      'wallet-lookup: primary RPC head stale; attempting fallback',
    );

    if (fallbackUrl) {
      try {
        const fb = await assessNodeFreshness(fallbackUrl, { maxLagSec });
        if (fb.fresh) {
          logger.warn(
            { address, fallbackHeadNumber: fb.headNumber, fallbackHeadAgeSeconds: fb.ageSeconds, maxLagSec },
            'wallet-lookup: using fallback RPC (primary head stale)',
          );
          return { provider: getFallbackChainDataProvider(), role: 'fallback' };
        }
        logger.warn(
          { address, fallbackHeadAgeSeconds: fb.ageSeconds, maxLagSec },
          'wallet-lookup: fallback RPC head also stale',
        );
      } catch (err) {
        logger.warn(
          { address, err: err instanceof Error ? err.message : String(err) },
          'wallet-lookup: fallback RPC head probe failed',
        );
      }
    }

    throw new AppError(
      503,
      'NODE_STALE',
      'Chain data source is stale; refusing to serve a lookup from a frozen node head',
    );
  }

  private mergeTransactions(
    inbound: LookupTransaction[],
    outbound: LookupTransaction[],
  ): LookupTransaction[] {
    const seen = new Set<string>();
    const merged: LookupTransaction[] = [];

    let i = 0;
    let j = 0;

    while (merged.length < MAX_MERGED_TXS && (i < inbound.length || j < outbound.length)) {
      const inTx = inbound[i];
      const outTx = outbound[j];

      let pick: LookupTransaction | undefined;

      if (inTx && outTx) {
        const inBlock = parseInt(inTx.blockNum, 16);
        const outBlock = parseInt(outTx.blockNum, 16);
        if (inBlock >= outBlock) {
          pick = inTx;
          i++;
        } else {
          pick = outTx;
          j++;
        }
      } else if (inTx) {
        pick = inTx;
        i++;
      } else if (outTx) {
        pick = outTx;
        j++;
      }

      if (pick && !seen.has(pick.hash)) {
        seen.add(pick.hash);
        merged.push(pick);
      }
    }

    return merged;
  }
}
