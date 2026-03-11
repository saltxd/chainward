import { sql } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const CACHE_TTL = 86400; // 24 hours

/**
 * Resolve protocol name for a contract address via known_contracts table.
 * Uses Redis caching (24hr TTL) following the same pattern as tokenResolver.
 */
export async function resolveProtocol(
  contractAddress: string,
  chain: string = 'base',
): Promise<string | null> {
  if (!contractAddress) return null;

  const redis = getRedis();
  const cacheKey = `protocol:${chain}:${contractAddress.toLowerCase()}`;

  // Check cache (empty string = cached miss)
  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === '' ? null : cached;

  try {
    const db = getDb();

    const rows = await db.execute(sql`
      SELECT protocol_name
      FROM known_contracts
      WHERE LOWER(contract_address) = ${contractAddress.toLowerCase()}
        AND chain = ${chain}
      LIMIT 1
    `);

    const protocolName = (rows as unknown as Array<{ protocol_name: string }>)[0]?.protocol_name ?? null;

    // Cache both hits and misses (empty string = miss)
    await redis.setex(cacheKey, CACHE_TTL, protocolName ?? '');

    return protocolName;
  } catch (err) {
    logger.warn({ err, contractAddress, chain }, 'Failed to resolve protocol name');
    return null;
  }
}
