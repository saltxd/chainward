import { erc20Abi, type Address } from 'viem';
import { getBaseClient } from '../lib/viem.js';
import { logger } from '../lib/logger.js';
import { getRedis } from '../lib/redis.js';

interface TokenMetadata {
  symbol: string;
  decimals: number;
  name: string;
}

const CACHE_TTL = 86400; // 24 hours

/** Resolve ERC-20 token metadata with Redis caching */
export async function resolveToken(tokenAddress: string): Promise<TokenMetadata | null> {
  const redis = getRedis();
  const cacheKey = `token:${tokenAddress.toLowerCase()}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as TokenMetadata;

  try {
    const client = getBaseClient();
    const address = tokenAddress as Address;

    const [symbol, decimals, name] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
      client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
      client.readContract({ address, abi: erc20Abi, functionName: 'name' }).catch(() => 'Unknown'),
    ]);

    const metadata: TokenMetadata = {
      symbol: symbol as string,
      decimals: Number(decimals),
      name: name as string,
    };

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(metadata));
    return metadata;
  } catch (err) {
    logger.warn({ err, tokenAddress }, 'Failed to resolve token metadata');
    return null;
  }
}
