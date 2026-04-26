import { Worker, Queue, type Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { getBaseClient } from '../lib/viem.js';
import { getEnv } from '../config.js';
import { parseAbiItem, type Address } from 'viem';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

// Known contract addresses to exclude from destination analysis
const EXCLUDE_ADDRESSES = new Set([
  '0xa6c9ba866992cfd7fd6460ba912bfa405ada9df0', // ACP V2
  '0x6a1fe26d54ab0d3e1e3168f2e0c0cda5cc0a0a4a', // ACP V1
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
  '0x4200000000000000000000000000000000000006', // WETH
  '0x0000000000000000000000000000000000000000', // zero
  '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b', // VIRTUAL token
]);

interface TracerJobData {
  type: 'trace';
  topN?: number;
}

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

// ═══════════════════════════════════════════════════════════════════════════════
// Fund flow tracing
// ═══════════════════════════════════════════════════════════════════════════════

async function traceTopAgents(topN: number) {
  const db = getDb();

  // Get top N ACP agents by revenue that don't yet have a matched ops wallet
  const agents = await db.execute(sql`
    SELECT acp.acp_id, acp.name, acp.wallet_address, acp.virtual_agent_id,
      COALESCE(CAST(acp.revenue AS numeric), 0) AS revenue
    FROM acp_agent_data acp
    WHERE acp.revenue IS NOT NULL
      AND CAST(acp.revenue AS numeric) > 100
      AND acp.virtual_agent_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM agent_registry ar
        WHERE ar.registry_id = acp.virtual_agent_id::text
          AND ar.is_observatory = true
          AND ar.tags @> ARRAY['ACP fund flow trace']
      )
    ORDER BY CAST(acp.revenue AS numeric) DESC
    LIMIT ${topN}
  `);

  const agentList = agents as unknown as Array<{
    acp_id: number;
    name: string;
    wallet_address: string;
    virtual_agent_id: number;
    revenue: string;
  }>;

  logger.info({ count: agentList.length, topN }, 'Starting ACP wallet fund flow tracing');

  let traced = 0;
  let matched = 0;

  for (const agent of agentList) {
    try {
      const candidate = await traceWallet(agent.wallet_address);

      if (!candidate) {
        logger.debug({ name: agent.name }, 'No candidate operational wallet found');
        continue;
      }

      traced++;

      // Check if this wallet is already in the observatory
      const existing = await db.execute(sql`
        SELECT id FROM agent_registry
        WHERE LOWER(wallet_address) = LOWER(${candidate.address})
          AND is_observatory = true
      `);

      if ((existing as unknown[]).length > 0) {
        // Already tracked — just link it
        await db.execute(sql`
          UPDATE agent_registry
          SET acp_agent_id = ${agent.acp_id},
              registry_id = ${String(agent.virtual_agent_id)}
          WHERE LOWER(wallet_address) = LOWER(${candidate.address})
            AND is_observatory = true
            AND acp_agent_id IS NULL
        `);
        matched++;
        logger.info({ name: agent.name, opsWallet: candidate.address }, 'Linked existing observatory agent to ACP');
      } else {
        // Add new observatory agent
        await db.execute(sql`
          INSERT INTO agent_registry (
            chain, wallet_address, agent_name, agent_framework,
            registry_source, registry_id, is_public, is_observatory,
            user_id, tags, agent_type, acp_agent_id
          ) VALUES (
            'base',
            ${candidate.address},
            ${agent.name + ' (ops)'},
            'virtuals',
            'acp-trace',
            ${String(agent.virtual_agent_id)},
            true, true,
            ${SYSTEM_USER_ID},
            ARRAY['ACP fund flow trace'],
            'trading',
            ${agent.acp_id}
          )
          ON CONFLICT (chain, wallet_address, user_id) DO UPDATE SET
            acp_agent_id = EXCLUDED.acp_agent_id,
            registry_id = EXCLUDED.registry_id,
            tags = EXCLUDED.tags
        `);
        matched++;
        logger.info({
          name: agent.name,
          opsWallet: candidate.address,
          txCount: candidate.txCount,
          totalValue: candidate.totalValue,
        }, 'Added new operational wallet from ACP fund flow trace');
      }

      // Rate limit: 200ms between agents
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      logger.warn({ err, name: agent.name }, 'Failed to trace ACP agent fund flow');
    }
  }

  logger.info({ traced, matched, total: agentList.length }, 'ACP wallet tracing complete');
}

async function traceWallet(
  acpWallet: string,
): Promise<{ address: string; txCount: number; totalValue: number } | null> {
  const client = getBaseClient();
  const currentBlock = await client.getBlockNumber();
  // Scan last 30 days (~1.3M blocks at 2s/block)
  const startBlock = currentBlock - BigInt(1_296_000);
  const from = startBlock > 0n ? startBlock : 0n;

  // Fetch ERC20 Transfer events FROM this wallet in 100K-block chunks
  // (Reth/sentinel limits eth_getLogs to 100K blocks per query)
  const CHUNK = BigInt(100_000);
  const logs: Array<{ args: { from?: Address; to?: Address; value?: bigint }; [k: string]: unknown }> = [];
  for (let cursor = from; cursor <= currentBlock; cursor += CHUNK) {
    const end = cursor + CHUNK - 1n > currentBlock ? currentBlock : cursor + CHUNK - 1n;
    const chunk = await client.getLogs({
      event: TRANSFER_EVENT,
      args: { from: acpWallet as Address },
      fromBlock: cursor,
      toBlock: end,
    });
    logs.push(...chunk);
  }

  if (logs.length === 0) return null;

  // Count destination wallets (excluding known contracts)
  const destCounts = new Map<string, { count: number; totalValue: number }>();

  for (const log of logs) {
    const to = (log.args.to ?? '').toLowerCase();
    if (!to || EXCLUDE_ADDRESSES.has(to)) continue;

    const entry = destCounts.get(to) ?? { count: 0, totalValue: 0 };
    entry.count++;
    entry.totalValue += Number(log.args.value ?? 0n) / 1e18;
    destCounts.set(to, entry);
  }

  if (destCounts.size === 0) return null;

  // Find the most frequent destination
  let topDest = '';
  let topCount = 0;
  let topValue = 0;

  for (const [addr, { count, totalValue }] of destCounts) {
    if (count > topCount) {
      topDest = addr;
      topCount = count;
      topValue = totalValue;
    }
  }

  // Only return if there's a clear pattern (>= 2 transfers to same address)
  if (topCount < 2) return null;

  return { address: topDest, txCount: topCount, totalValue: topValue };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Worker setup
// ═══════════════════════════════════════════════════════════════════════════════

export function createAcpWalletTracerWorker() {
  const worker = new Worker<TracerJobData>(
    'acp-wallet-tracer',
    async (job: Job<TracerJobData>) => {
      // Only run when cw-sentinel is the PRIMARY RPC. Wide-window eth_getLogs against
      // Alchemy/public Base burns rate budget; cw-sentinel has the data and no quota.
      // Disabled by design while sentinel is secondary (post-2026-04-18 RPC reorder, see
      // BookStack page 182). Re-enabled automatically when BASE_RPC_URL points back at sentinel.
      const env = getEnv();
      if (!env.BASE_RPC_URL.includes('192.168.1.194')) {
        logger.info('Skipping wallet tracer — sentinel node not primary RPC');
        return;
      }
      const topN = job.data.topN ?? 200;
      await traceTopAgents(topN);
    },
    {
      connection: getRedis(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'ACP wallet tracer job failed');
  });

  logger.info('ACP wallet tracer worker started');
  return worker;
}

export async function setupAcpWalletTracerSchedule(redis: import('ioredis').default) {
  const queue = new Queue('acp-wallet-tracer', { connection: redis });

  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Run daily at 03:00 UTC (after ACP sync at 00:00/06:00 and digest at 01:00)
  await queue.add('trace-top', { type: 'trace', topN: 200 }, {
    repeat: { pattern: '0 3 * * *' },
    jobId: 'acp-tracer-daily',
  });

  logger.info('ACP wallet tracer scheduled (daily 03:00 UTC, top 200 agents)');
  await queue.close();
}
