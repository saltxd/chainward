import type IORedis from 'ioredis';
import { getEnv } from '../config.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/errorHandler.js';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface TokenBalance {
  contractAddress: string;
  /** Raw hex balance from Alchemy (use BigInt to parse) */
  tokenBalance: string;
  /** null for ERC-20s without on-chain errors */
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

// ── Alchemy RPC response types ──────────────────────────────────────────────

interface AlchemyTransfer {
  hash: string;
  blockNum: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: string;
}

interface AlchemyAssetTransfersResult {
  transfers: AlchemyTransfer[];
}

interface AlchemyTokenBalancesResult {
  address: string;
  tokenBalances: Array<{
    contractAddress: string;
    tokenBalance: string;
    error: string | null;
  }>;
}

interface AlchemyRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result: T;
  error?: { code: number; message: string };
}

// ── Constants ───────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'lookup:';
const CACHE_TTL_SECONDS = 600; // 10 minutes
const TRANSFER_PAGE_SIZE = 25; // 25 inbound + 25 outbound = 50 max
const MAX_MERGED_TXS = 50;

// ── Service ─────────────────────────────────────────────────────────────────

export class WalletLookupService {
  constructor(private redis: IORedis) {}

  async lookup(address: string): Promise<WalletLookupResult> {
    const cacheKey = `${CACHE_PREFIX}${address.toLowerCase()}`;

    // 1. Check Redis cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      logger.debug({ address }, 'Wallet lookup cache hit');
      return JSON.parse(cached) as WalletLookupResult;
    }

    logger.info({ address }, 'Wallet lookup cache miss, fetching from Alchemy');

    // 2. Parallel Alchemy calls
    const rpcUrl = getEnv().BASE_RPC_URL;

    const [inboundTxs, outboundTxs, tokenBalances, nativeBalance] = await Promise.all([
      this.fetchAssetTransfers(rpcUrl, address, 'inbound'),
      this.fetchAssetTransfers(rpcUrl, address, 'outbound'),
      this.fetchTokenBalances(rpcUrl, address),
      this.fetchNativeBalance(rpcUrl, address),
    ]);

    // 3. Merge and sort transactions by block descending, take 50
    const mergedTxs = this.mergeTransactions(inboundTxs, outboundTxs);

    // 4. Build balances array
    const balances: (TokenBalance | NativeBalance)[] = [
      {
        contractAddress: 'native' as const,
        tokenBalance: nativeBalance,
        error: null,
      },
      ...tokenBalances,
    ];

    // 5. Build result
    const result: WalletLookupResult = {
      address: address.toLowerCase(),
      chain: 'base',
      balances,
      transactions: mergedTxs,
      cachedAt: new Date().toISOString(),
    };

    // 6. Cache in Redis
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);

    return result;
  }

  // ── Alchemy RPC helpers ─────────────────────────────────────────────────

  private async fetchAssetTransfers(
    rpcUrl: string,
    address: string,
    direction: 'inbound' | 'outbound',
  ): Promise<LookupTransaction[]> {
    const params: Record<string, unknown> = {
      category: ['external', 'internal', 'erc20', 'erc721', 'erc1155'],
      maxCount: `0x${TRANSFER_PAGE_SIZE.toString(16)}`,
      order: 'desc',
      withMetadata: false,
    };

    if (direction === 'inbound') {
      params.toAddress = address;
    } else {
      params.fromAddress = address;
    }

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getAssetTransfers',
      params: [params],
    };

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, direction, address },
        'Alchemy getAssetTransfers HTTP error',
      );
      throw new AppError(
        502,
        'ALCHEMY_ERROR',
        `Alchemy getAssetTransfers failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as AlchemyRpcResponse<AlchemyAssetTransfersResult>;

    if (data.error) {
      logger.error(
        { rpcError: data.error, direction, address },
        'Alchemy getAssetTransfers RPC error',
      );
      throw new AppError(502, 'ALCHEMY_RPC_ERROR', data.error.message);
    }

    return data.result.transfers.map((tx) => ({
      hash: tx.hash,
      blockNum: tx.blockNum,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      asset: tx.asset,
      category: tx.category,
      direction,
    }));
  }

  private async fetchTokenBalances(
    rpcUrl: string,
    address: string,
  ): Promise<TokenBalance[]> {
    const body = {
      jsonrpc: '2.0',
      id: 2,
      method: 'alchemy_getTokenBalances',
      params: [address],
    };

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, address },
        'Alchemy getTokenBalances HTTP error',
      );
      throw new AppError(
        502,
        'ALCHEMY_ERROR',
        `Alchemy getTokenBalances failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as AlchemyRpcResponse<AlchemyTokenBalancesResult>;

    if (data.error) {
      logger.error(
        { rpcError: data.error, address },
        'Alchemy getTokenBalances RPC error',
      );
      throw new AppError(502, 'ALCHEMY_RPC_ERROR', data.error.message);
    }

    return data.result.tokenBalances.map((tb) => ({
      contractAddress: tb.contractAddress,
      tokenBalance: tb.tokenBalance,
      error: tb.error,
    }));
  }

  private async fetchNativeBalance(rpcUrl: string, address: string): Promise<string> {
    const body = {
      jsonrpc: '2.0',
      id: 3,
      method: 'eth_getBalance',
      params: [address, 'latest'],
    };

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, address },
        'Alchemy eth_getBalance HTTP error',
      );
      throw new AppError(
        502,
        'ALCHEMY_ERROR',
        `Alchemy eth_getBalance failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as AlchemyRpcResponse<string>;

    if (data.error) {
      logger.error(
        { rpcError: data.error, address },
        'Alchemy eth_getBalance RPC error',
      );
      throw new AppError(502, 'ALCHEMY_RPC_ERROR', data.error.message);
    }

    return data.result;
  }

  // ── Merge logic ─────────────────────────────────────────────────────────

  private mergeTransactions(
    inbound: LookupTransaction[],
    outbound: LookupTransaction[],
  ): LookupTransaction[] {
    // Deduplicate by hash (a tx can appear in both directions for self-transfers)
    const seen = new Set<string>();
    const merged: LookupTransaction[] = [];

    // Interleave: both arrays are already sorted desc by block from Alchemy
    let i = 0;
    let j = 0;

    while (merged.length < MAX_MERGED_TXS && (i < inbound.length || j < outbound.length)) {
      const inTx = inbound[i];
      const outTx = outbound[j];

      let pick: LookupTransaction | undefined;

      if (inTx && outTx) {
        // Compare block numbers (hex strings) — higher block = more recent
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
