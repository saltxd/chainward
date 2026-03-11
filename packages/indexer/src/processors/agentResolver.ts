import { agentRegistry } from '@chainward/db';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';

const CACHE_KEY = 'agent:wallet-map';
const CACHE_TTL = 300; // 5 minutes

interface AgentRef {
  id: number;
  walletAddress: string;
}

/**
 * Resolve a wallet address to a registered agent.
 * Uses Redis cache (5min TTL) to avoid hitting the DB on every transaction.
 */
export async function resolveAgentByAddress(address: string): Promise<AgentRef | null> {
  const redis = getRedis();
  const addrLower = address.toLowerCase();

  // Try cache first
  const cached = await redis.hget(CACHE_KEY, addrLower);
  if (cached !== null) {
    return cached === '' ? null : JSON.parse(cached);
  }

  // Cache miss — rebuild entire map (it's small, ~100 agents max)
  const exists = await redis.exists(CACHE_KEY);
  if (!exists) {
    await rebuildAgentCache();
  }

  // Re-check after rebuild
  const rechecked = await redis.hget(CACHE_KEY, addrLower);
  if (rechecked !== null) {
    return rechecked === '' ? null : JSON.parse(rechecked);
  }

  // Address not in our registry
  return null;
}

async function rebuildAgentCache(): Promise<void> {
  const db = getDb();
  const redis = getRedis();

  const agents = await db
    .select({ id: agentRegistry.id, walletAddress: agentRegistry.walletAddress })
    .from(agentRegistry);

  const pipeline = redis.pipeline();
  pipeline.del(CACHE_KEY);

  for (const agent of agents) {
    pipeline.hset(CACHE_KEY, agent.walletAddress.toLowerCase(), JSON.stringify({
      id: agent.id,
      walletAddress: agent.walletAddress,
    }));
  }

  pipeline.expire(CACHE_KEY, CACHE_TTL);
  await pipeline.exec();
}
