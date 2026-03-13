import { Worker, Queue, type Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { getBaseClient } from '../lib/viem.js';
import { logger } from '../lib/logger.js';
import { type Abi, type Address, parseAbiItem, formatEther } from 'viem';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const ERC8004_IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as Address;
const MIN_TX_COUNT = 5;
const REDIS_LAST_BLOCK_KEY = 'registry-scout:last-block';
// How far back to start on first run (roughly 1 day of Base blocks at 2s/block)
const INITIAL_LOOKBACK_BLOCKS = 43200n;
// Max blocks to scan per poll (avoid huge log queries)
const MAX_BLOCK_RANGE = 10000n;

// ERC-8004 event & function signatures
const REGISTERED_EVENT = parseAbiItem(
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
);

const GET_AGENT_WALLET_ABI = [
  {
    name: 'getAgentWallet',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const satisfies Abi;

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface RegistryScoutJobData {
  type: 'scan-registrations';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Worker
// ═══════════════════════════════════════════════════════════════════════════════

export function createRegistryScoutWorker() {
  const worker = new Worker<RegistryScoutJobData>(
    'registry-scout',
    async (job: Job<RegistryScoutJobData>) => {
      if (job.data.type === 'scan-registrations') {
        await scanRegistrations();
      }
    },
    {
      connection: getRedis(),
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Registry scout scan completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Registry scout scan failed');
  });

  logger.info('Registry scout worker started');
  return worker;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Schedule
// ═══════════════════════════════════════════════════════════════════════════════

export async function setupRegistryScoutSchedule(redis: import('ioredis').default) {
  const queue = new Queue('registry-scout', { connection: redis });

  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Every 6 hours — low priority background scan
  await queue.add(
    'scan-registrations',
    { type: 'scan-registrations' },
    {
      repeat: { pattern: '0 */6 * * *' },
      jobId: 'registry-scout-scan',
    },
  );

  logger.info('Registry scout schedule configured (every 6h)');
  await queue.close();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Core logic
// ═══════════════════════════════════════════════════════════════════════════════

async function scanRegistrations() {
  const client = getBaseClient();
  const redis = getRedis();
  const db = getDb();

  // Determine block range to scan
  const currentBlock = await client.getBlockNumber();
  const lastScannedRaw = await redis.get(REDIS_LAST_BLOCK_KEY);
  let fromBlock: bigint;

  if (lastScannedRaw) {
    fromBlock = BigInt(lastScannedRaw) + 1n;
  } else {
    // First run: start from ~1 day ago
    fromBlock = currentBlock - INITIAL_LOOKBACK_BLOCKS;
  }

  if (fromBlock > currentBlock) {
    logger.debug('Registry scout: no new blocks to scan');
    return;
  }

  // Cap the range to avoid huge log queries
  const toBlock = fromBlock + MAX_BLOCK_RANGE < currentBlock
    ? fromBlock + MAX_BLOCK_RANGE
    : currentBlock;

  logger.info(
    { fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), range: (toBlock - fromBlock).toString() },
    'Scanning ERC-8004 Registered events',
  );

  // Fetch Registered events
  const logs = await client.getLogs({
    address: ERC8004_IDENTITY_REGISTRY,
    event: REGISTERED_EVENT,
    fromBlock,
    toBlock,
  });

  logger.info({ eventCount: logs.length }, 'ERC-8004 events found');

  let candidates = 0;
  let skippedNoWallet = 0;
  let skippedLowTx = 0;
  let skippedExisting = 0;

  for (const log of logs) {
    const agentId = log.args.agentId;
    const owner = log.args.owner;
    const agentURI = log.args.agentURI;

    if (agentId === undefined || owner === undefined) continue;

    try {
      // 1. Check if agent has a wallet address set
      const agentWallet = await client.readContract({
        address: ERC8004_IDENTITY_REGISTRY,
        abi: GET_AGENT_WALLET_ABI,
        functionName: 'getAgentWallet',
        args: [agentId],
      });

      const zeroAddress = '0x0000000000000000000000000000000000000000';
      if (!agentWallet || agentWallet === zeroAddress) {
        skippedNoWallet++;
        continue;
      }

      // 2. Check if wallet has >5 transactions
      const txCount = await client.getTransactionCount({ address: agentWallet });

      if (txCount <= MIN_TX_COUNT) {
        skippedLowTx++;
        continue;
      }

      // 3. Check if already in candidates or observatory
      const existingCandidate = await db.execute(sql`
        SELECT 1 FROM observatory_candidates
        WHERE chain = 'base' AND registry_token_id = ${Number(agentId)}
        LIMIT 1
      `);

      if ((existingCandidate as unknown[]).length > 0) {
        skippedExisting++;
        continue;
      }

      const existingAgent = await db.execute(sql`
        SELECT 1 FROM agent_registry
        WHERE chain = 'base' AND wallet_address = ${agentWallet.toLowerCase()}
        LIMIT 1
      `);

      if ((existingAgent as unknown[]).length > 0) {
        skippedExisting++;
        continue;
      }

      // 4. Get balance for context
      const balanceWei = await client.getBalance({ address: agentWallet });
      const balanceEth = formatEther(balanceWei);

      // 5. Parse agent name from URI if base64 data URI
      const agentName = parseAgentName(agentURI);

      // 6. Insert candidate
      await db.execute(sql`
        INSERT INTO observatory_candidates
          (chain, wallet_address, agent_name, registry_token_id, registry_owner, token_uri, tx_count, balance_eth)
        VALUES
          ('base', ${agentWallet.toLowerCase()}, ${agentName}, ${Number(agentId)}, ${owner.toLowerCase()}, ${agentURI ?? null}, ${txCount}, ${balanceEth})
        ON CONFLICT (chain, registry_token_id) DO UPDATE SET
          tx_count = EXCLUDED.tx_count,
          balance_eth = EXCLUDED.balance_eth,
          wallet_address = EXCLUDED.wallet_address
      `);

      candidates++;
      logger.info(
        {
          tokenId: agentId.toString(),
          wallet: agentWallet,
          txCount,
          balanceEth,
          name: agentName,
        },
        'Observatory candidate found',
      );
    } catch (err) {
      logger.warn(
        { tokenId: agentId.toString(), err },
        'Error processing ERC-8004 registration',
      );
    }
  }

  // Save progress
  await redis.set(REDIS_LAST_BLOCK_KEY, toBlock.toString());

  logger.info(
    {
      scanned: logs.length,
      candidates,
      skippedNoWallet,
      skippedLowTx,
      skippedExisting,
      toBlock: toBlock.toString(),
    },
    'Registry scout scan complete',
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function parseAgentName(uri: string | undefined): string | null {
  if (!uri) return null;

  try {
    if (uri.startsWith('data:application/json;base64,')) {
      const json = JSON.parse(
        Buffer.from(uri.split(',', 2)[1]!, 'base64').toString('utf-8'),
      );
      return typeof json.name === 'string' ? json.name : null;
    }
  } catch {
    // Ignore parse errors — URI may be a URL, IPFS, or gzip-encoded
  }

  return null;
}
