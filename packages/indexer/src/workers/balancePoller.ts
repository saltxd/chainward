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
  type: 'poll' | 'poll-observatory' | 'initial';
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

      if (job.data.type === 'poll-observatory') {
        await pollObservatoryBalances();
        return;
      }

      // Poll only user-registered agents (not observatory)
      await pollUserBalances();
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

/** Set up repeatable balance polling jobs — user agents every 5 min, observatory every 30 min */
export async function setupBalancePolling(redis: import('ioredis').default) {
  const { Queue } = await import('bullmq');
  const queue = new Queue('balance-poll', { connection: redis });

  // Remove existing repeatable jobs before adding new ones
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // User-registered agents: poll every 5 minutes
  await queue.add(
    'poll-users',
    { type: 'poll' },
    {
      repeat: { every: 5 * 60 * 1000 },
      jobId: 'balance-poll-users',
    },
  );

  // Observatory agents: poll every 30 minutes (saves ~85% CUs vs 5 min)
  await queue.add(
    'poll-observatory',
    { type: 'poll-observatory' },
    {
      repeat: { every: 30 * 60 * 1000 },
      jobId: 'balance-poll-observatory',
    },
  );

  logger.info('Balance polling scheduled (users: 5min, observatory: 30min)');
  await queue.close();
}

/** Poll only user-registered agents (non-observatory) */
async function pollUserBalances() {
  const db = getDb();
  const agents = await db.select().from(agentRegistry);
  const userAgents = agents.filter((a) => !a.isObservatory);

  if (userAgents.length === 0) return;

  logger.info({ count: userAgents.length }, 'Polling balances for user agents');

  for (const agent of userAgents) {
    try {
      await snapshotWallet(agent.walletAddress, agent.chain);
    } catch (err) {
      logger.error({ err, walletAddress: agent.walletAddress }, 'Failed to snapshot balance');
    }
  }
}

/** Poll observatory agents at lower frequency to save CUs */
async function pollObservatoryBalances() {
  const db = getDb();
  const agents = await db.select().from(agentRegistry);
  const obsAgents = agents.filter((a) => a.isObservatory);

  if (obsAgents.length === 0) return;

  logger.info({ count: obsAgents.length }, 'Polling balances for observatory agents (30min interval)');

  // Pre-fetch ETH price ONCE for the entire batch instead of per-agent
  const ethPrice = await getEthPrice();

  for (const agent of obsAgents) {
    try {
      // ETH only for observatory — skip ERC-20 tokens to save CUs
      await snapshotWalletEthOnly(agent.walletAddress, agent.chain, ethPrice);
    } catch (err) {
      logger.error({ err, walletAddress: agent.walletAddress }, 'Failed to snapshot observatory balance');
    }
  }
}

/** Lightweight snapshot: ETH balance only (1 RPC call vs 7) */
async function snapshotWalletEthOnly(walletAddress: string, chain: string, preloadedEthPrice?: number | null) {
  if (chain !== 'base') return;

  const db = getDb();
  const client = getBaseClient();
  const ethBalance = await client.getBalance({ address: walletAddress as Address });
  const ethAmount = parseFloat(formatEther(ethBalance));
  const ethPrice = preloadedEthPrice ?? await getEthPrice();

  await db.insert(balanceSnapshots).values({
    timestamp: new Date(),
    chain: 'base',
    walletAddress,
    tokenAddress: null,
    tokenSymbol: 'ETH',
    balanceRaw: ethBalance.toString(),
    balanceUsd: ethPrice ? (ethAmount * ethPrice).toFixed(6) : null,
    snapshotType: 'periodic',
  });
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
