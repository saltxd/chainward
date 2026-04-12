import { Worker, type Job } from 'bullmq';
import { erc20Abi, formatEther, formatUnits, type Address } from 'viem';
import { agentRegistry, balanceSnapshots } from '@chainward/db';
import { TRACKED_TOKENS } from '@chainward/common';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { getBaseClient } from '../lib/viem.js';
import { getEthPrice, getUsdPrices } from '../processors/priceResolver.js';
import { logger } from '../lib/logger.js';

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;
const multicall3Abi = [{
  name: 'getEthBalance',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'addr', type: 'address' }],
  outputs: [{ name: 'balance', type: 'uint256' }],
}] as const;

/** Max wallets per multicall batch to stay under RPC payload limits */
const MULTICALL_CHUNK = 200;

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
        await snapshotWalletBatched([job.data.walletAddress], job.data.chain, true);
        return;
      }

      if (job.data.type === 'poll-observatory') {
        await pollObservatoryBalances();
        return;
      }

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

/** Set up repeatable balance polling jobs — user agents every 15 min, observatory every 2 hours */
export async function setupBalancePolling(redis: import('ioredis').default) {
  const { Queue } = await import('bullmq');
  const queue = new Queue('balance-poll', { connection: redis });

  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  await queue.add(
    'poll-users',
    { type: 'poll' },
    {
      repeat: { every: 15 * 60 * 1000 },
      jobId: 'balance-poll-users',
    },
  );

  await queue.add(
    'poll-observatory',
    { type: 'poll-observatory' },
    {
      repeat: { every: 2 * 60 * 60 * 1000 },
      jobId: 'balance-poll-observatory',
    },
  );

  logger.info('Balance polling scheduled (users: 15min, observatory: 2h)');
  await queue.close();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Multicall-batched polling
// ═══════════════════════════════════════════════════════════════════════════════

/** Batch ETH balances for a list of wallets via Multicall3.getEthBalance — 1 RPC call per chunk */
async function batchGetEthBalances(wallets: string[]): Promise<Map<string, bigint>> {
  const client = getBaseClient();
  const result = new Map<string, bigint>();

  for (let i = 0; i < wallets.length; i += MULTICALL_CHUNK) {
    const chunk = wallets.slice(i, i + MULTICALL_CHUNK);
    const contracts = chunk.map((addr) => ({
      address: MULTICALL3,
      abi: multicall3Abi,
      functionName: 'getEthBalance' as const,
      args: [addr as Address] as const,
    }));

    const results = await client.multicall({ contracts, allowFailure: true });

    for (let j = 0; j < chunk.length; j++) {
      const r = results[j]!;
      if (r.status === 'success') {
        result.set(chunk[j]!, r.result as bigint);
      } else {
        logger.warn({ wallet: chunk[j], error: r.error?.message }, 'getEthBalance failed in multicall');
      }
    }
  }

  return result;
}

/** Batch ERC-20 balanceOf for multiple wallets × multiple tokens — 1 RPC call per chunk */
async function batchGetTokenBalances(
  wallets: string[],
  tokens: typeof TRACKED_TOKENS.base,
): Promise<Map<string, Map<string, bigint>>> {
  const client = getBaseClient();
  // Map<walletAddress, Map<tokenSymbol, balance>>
  const result = new Map<string, Map<string, bigint>>();

  // Build all contract calls: wallets × tokens
  const calls: Array<{
    address: Address;
    abi: typeof erc20Abi;
    functionName: 'balanceOf';
    args: readonly [Address];
    wallet: string;
    token: typeof tokens[number];
  }> = [];

  for (const wallet of wallets) {
    for (const token of tokens) {
      calls.push({
        address: token.address as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [wallet as Address],
        wallet,
        token,
      });
    }
  }

  for (let i = 0; i < calls.length; i += MULTICALL_CHUNK) {
    const chunk = calls.slice(i, i + MULTICALL_CHUNK);
    const contracts = chunk.map(({ address, abi, functionName, args }) => ({
      address, abi, functionName, args,
    }));

    const results = await client.multicall({ contracts, allowFailure: true });

    for (let j = 0; j < chunk.length; j++) {
      const r = results[j]!;
      const call = chunk[j]!;
      if (r.status === 'success') {
        const bal = r.result as bigint;
        if (bal === 0n) continue;
        if (!result.has(call.wallet)) result.set(call.wallet, new Map());
        result.get(call.wallet)!.set(call.token.symbol, bal);
      }
    }
  }

  return result;
}

/** Poll observatory agents — ETH only, all batched via multicall */
async function pollObservatoryBalances() {
  const db = getDb();
  const agents = await db.select().from(agentRegistry);
  const obsAgents = agents.filter((a) => a.isObservatory && a.chain === 'base');

  if (obsAgents.length === 0) return;

  const wallets = obsAgents.map((a) => a.walletAddress);
  const ethPrice = await getEthPrice();

  logger.info({ count: obsAgents.length, rpcCalls: Math.ceil(wallets.length / MULTICALL_CHUNK) },
    'Polling observatory balances via multicall');

  const ethBalances = await batchGetEthBalances(wallets);
  const now = new Date();

  // Batch insert all snapshots
  const rows: Array<typeof balanceSnapshots.$inferInsert> = [];
  for (const [wallet, balance] of ethBalances) {
    const ethAmount = parseFloat(formatEther(balance));
    rows.push({
      timestamp: now,
      chain: 'base',
      walletAddress: wallet,
      tokenAddress: null,
      tokenSymbol: 'ETH',
      balanceRaw: balance.toString(),
      balanceUsd: ethPrice ? (ethAmount * ethPrice).toFixed(6) : null,
      snapshotType: 'periodic',
    });
  }

  if (rows.length > 0) {
    // Insert in batches to avoid hitting PG param limits (65535 / 8 columns ≈ 8191 rows max)
    const INSERT_CHUNK = 5000;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await db.insert(balanceSnapshots).values(rows.slice(i, i + INSERT_CHUNK));
    }
  }

  logger.info({ snapshots: rows.length, failed: wallets.length - ethBalances.size },
    'Observatory balance poll complete');
}

/** Poll user-registered agents — ETH + all tracked tokens, batched via multicall */
async function pollUserBalances() {
  const db = getDb();
  const agents = await db.select().from(agentRegistry);
  const userAgents = agents.filter((a) => !a.isObservatory && a.chain === 'base');

  if (userAgents.length === 0) return;

  const wallets = userAgents.map((a) => a.walletAddress);
  const tokens = TRACKED_TOKENS.base;

  logger.info({ count: userAgents.length }, 'Polling user balances via multicall');

  // Fetch all prices in one batch CoinGecko call
  const prices = await getUsdPrices(['ETH', ...tokens.map((t) => t.symbol)]);
  const ethPrice = prices.get('ETH') ?? null;

  // Batch-fetch ETH + token balances (2 multicalls max for 4 agents)
  const [ethBalances, tokenBalances] = await Promise.all([
    batchGetEthBalances(wallets),
    batchGetTokenBalances(wallets, tokens),
  ]);

  const now = new Date();
  const rows: Array<typeof balanceSnapshots.$inferInsert> = [];

  for (const wallet of wallets) {
    // ETH snapshot
    const ethBal = ethBalances.get(wallet);
    if (ethBal != null) {
      const ethAmount = parseFloat(formatEther(ethBal));
      rows.push({
        timestamp: now,
        chain: 'base',
        walletAddress: wallet,
        tokenAddress: null,
        tokenSymbol: 'ETH',
        balanceRaw: ethBal.toString(),
        balanceUsd: ethPrice ? (ethAmount * ethPrice).toFixed(6) : null,
        snapshotType: 'periodic',
      });
    }

    // Token snapshots
    const walletTokens = tokenBalances.get(wallet);
    if (walletTokens) {
      for (const token of tokens) {
        const bal = walletTokens.get(token.symbol);
        if (!bal) continue;
        const amount = parseFloat(formatUnits(bal, token.decimals));
        const price = prices.get(token.symbol.toUpperCase()) ?? null;
        rows.push({
          timestamp: now,
          chain: 'base',
          walletAddress: wallet,
          tokenAddress: token.address,
          tokenSymbol: token.symbol,
          balanceRaw: bal.toString(),
          balanceUsd: price ? (amount * price).toFixed(6) : null,
          snapshotType: 'periodic',
        });
      }
    }
  }

  if (rows.length > 0) {
    await db.insert(balanceSnapshots).values(rows);
  }

  logger.info({ snapshots: rows.length }, 'User balance poll complete');
}

/** Single-wallet snapshot used for initial registration — batched internally */
async function snapshotWalletBatched(wallets: string[], chain: string, includeTokens: boolean) {
  if (chain !== 'base') return;

  const tokens = TRACKED_TOKENS.base;
  const prices = await getUsdPrices(['ETH', ...tokens.map((t) => t.symbol)]);
  const ethPrice = prices.get('ETH') ?? null;

  const ethBalances = await batchGetEthBalances(wallets);
  const tokenBalances = includeTokens ? await batchGetTokenBalances(wallets, tokens) : new Map();

  const now = new Date();
  const db = getDb();
  const rows: Array<typeof balanceSnapshots.$inferInsert> = [];

  for (const wallet of wallets) {
    const ethBal = ethBalances.get(wallet);
    if (ethBal != null) {
      const ethAmount = parseFloat(formatEther(ethBal));
      rows.push({
        timestamp: now,
        chain: 'base',
        walletAddress: wallet,
        tokenAddress: null,
        tokenSymbol: 'ETH',
        balanceRaw: ethBal.toString(),
        balanceUsd: ethPrice ? (ethAmount * ethPrice).toFixed(6) : null,
        snapshotType: 'periodic',
      });
    }

    const walletTokens = tokenBalances.get(wallet);
    if (walletTokens) {
      for (const token of tokens) {
        const bal = walletTokens.get(token.symbol);
        if (!bal) continue;
        const amount = parseFloat(formatUnits(bal, token.decimals));
        const price = prices.get(token.symbol.toUpperCase()) ?? null;
        rows.push({
          timestamp: now,
          chain: 'base',
          walletAddress: wallet,
          tokenAddress: token.address,
          tokenSymbol: token.symbol,
          balanceRaw: bal.toString(),
          balanceUsd: price ? (amount * price).toFixed(6) : null,
          snapshotType: 'periodic',
        });
      }
    }
  }

  if (rows.length > 0) {
    await db.insert(balanceSnapshots).values(rows);
  }

  logger.debug({ wallets: wallets.length, snapshots: rows.length }, 'Batch snapshot complete');
}
