import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { erc20Abi, formatEther, formatUnits, type Address } from 'viem';
import { agentRegistry, balanceSnapshots } from '@chainward/db';
import { TRACKED_TOKENS } from '@chainward/common';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { getBaseClient } from '../lib/viem.js';
import { getEthPrice, getUsdPrice } from '../processors/priceResolver.js';
import { logger } from '../lib/logger.js';

interface BalanceJobData {
  type: 'poll' | 'initial';
  agentId?: number;
  walletAddress?: string;
  chain?: string;
}

export function createBalancePollerWorker() {
  const worker = new Worker<BalanceJobData>(
    'balance-poll',
    async (job: Job<BalanceJobData>) => {
      if (job.data.type === 'initial' && job.data.walletAddress && job.data.chain) {
        await snapshotWallet(job.data.walletAddress, job.data.chain);
        return;
      }

      // Poll all registered agents
      await pollAllBalances();
    },
    {
      connection: getRedis(),
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Balance poll job failed');
  });

  logger.info('Balance poller worker started');
  return worker;
}

/** Set up repeatable balance polling job */
export async function setupBalancePolling(redis: import('ioredis').default) {
  const { Queue } = await import('bullmq');
  const queue = new Queue('balance-poll', { connection: redis });

  // Remove existing repeatable jobs before adding new one
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Poll every 5 minutes (free tier default)
  await queue.add(
    'poll-all',
    { type: 'poll' },
    {
      repeat: { every: 5 * 60 * 1000 },
      jobId: 'balance-poll-repeatable',
    },
  );

  logger.info('Balance polling scheduled (every 5 minutes)');
  await queue.close();
}

async function pollAllBalances() {
  const db = getDb();
  const agents = await db.select().from(agentRegistry);

  logger.info({ count: agents.length }, 'Polling balances for all agents');

  for (const agent of agents) {
    try {
      await snapshotWallet(agent.walletAddress, agent.chain);
    } catch (err) {
      logger.error(
        { err, walletAddress: agent.walletAddress },
        'Failed to snapshot balance',
      );
    }
  }
}

async function snapshotWallet(walletAddress: string, chain: string) {
  if (chain !== 'base') return;

  const db = getDb();
  const client = getBaseClient();
  const now = new Date();

  // Native ETH balance
  const ethBalance = await client.getBalance({ address: walletAddress as Address });
  const ethAmount = parseFloat(formatEther(ethBalance));
  const ethPrice = await getEthPrice();

  await db.insert(balanceSnapshots).values({
    timestamp: now,
    chain: 'base',
    walletAddress,
    tokenAddress: null,
    tokenSymbol: 'ETH',
    balanceRaw: ethBalance.toString(),
    balanceUsd: ethPrice ? (ethAmount * ethPrice).toFixed(6) : null,
    snapshotType: 'periodic',
  });

  // ERC-20 token balances
  const tokens = TRACKED_TOKENS.base;
  for (const token of tokens) {
    try {
      const balance = await client.readContract({
        address: token.address as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [walletAddress as Address],
      });

      if (balance === 0n) continue;

      const amount = parseFloat(formatUnits(balance, token.decimals));
      const price = await getUsdPrice(token.symbol);

      await db.insert(balanceSnapshots).values({
        timestamp: now,
        chain: 'base',
        walletAddress,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        balanceRaw: balance.toString(),
        balanceUsd: price ? (amount * price).toFixed(6) : null,
        snapshotType: 'periodic',
      });
    } catch (err) {
      logger.warn(
        { err, walletAddress, token: token.symbol },
        'Failed to fetch token balance',
      );
    }
  }

  logger.debug({ walletAddress }, 'Balance snapshot complete');
}
