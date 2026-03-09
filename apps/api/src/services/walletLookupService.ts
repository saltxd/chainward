import type IORedis from 'ioredis';
import { getChainDataProvider } from '../providers/index.js';
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

    const provider = getChainDataProvider();

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
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);

    return result;
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
