import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createPublicClient, http, fallback, type PublicClient } from 'viem';
import { base } from 'viem/chains';
import { users } from '@chainward/db';
import type { AppVariables } from '../types.js';
import { getDb } from '../lib/db.js';
import { requireApiKeyOrSession } from '../middleware/apiKeyAuth.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../lib/logger.js';

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();

const PLAN_PRICES: Record<string, bigint> = {
  operator: 25_000_000n,  // 25 USDC (6 decimals)
  community: 49_000_000n, // 49 USDC
  brief: 99_000_000n,     // 99 USDC
};

const PLAN_UPGRADES: Record<string, { tier: 'pro'; agentLimit: number } | null> = {
  operator: { tier: 'pro', agentLimit: 10 },
  community: { tier: 'pro', agentLimit: 10 },
  brief: null, // one-time service, no tier change
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

function getViemClient(): PublicClient {
  if (!_client) {
    const primary = http(process.env.BASE_RPC_URL, { timeout: 5_000 });
    const fb = process.env.BASE_RPC_FALLBACK_URL;
    _client = createPublicClient({
      chain: base,
      transport: fb ? fallback([primary, http(fb, { timeout: 10_000 })], { rank: false }) : primary,
    });
  }
  return _client as PublicClient;
}

const payments = new Hono<{ Variables: AppVariables }>();

const verifySchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  plan: z.enum(['operator', 'community', 'brief']),
});

payments.post('/verify', requireApiKeyOrSession('write'), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { txHash, plan } = verifySchema.parse(body);

  const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS?.toLowerCase();
  if (!treasuryAddress) {
    throw new AppError(500, 'CONFIG_ERROR', 'Treasury address not configured');
  }

  const client = getViemClient();

  const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null);
  if (!receipt) {
    throw new AppError(400, 'TX_NOT_FOUND', 'Transaction not found or not yet confirmed');
  }

  if (receipt.status !== 'success') {
    throw new AppError(400, 'TX_FAILED', 'Transaction reverted on-chain');
  }

  // Find the USDC Transfer log from the user's wallet to the treasury
  const expectedAmount = PLAN_PRICES[plan]!;
  let matched = false;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== USDC_ADDRESS) continue;
    if (!log.topics[0] || log.topics[0] !== '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') continue;

    // topics[1] = from, topics[2] = to (padded to 32 bytes)
    const from = ('0x' + log.topics[1]!.slice(26)).toLowerCase();
    const to = ('0x' + log.topics[2]!.slice(26)).toLowerCase();
    const value = BigInt(log.data);

    if (from === user.walletAddress.toLowerCase() && to === treasuryAddress && value >= expectedAmount) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    throw new AppError(400, 'INVALID_PAYMENT', 'No matching USDC transfer found in transaction. Expected ' + (Number(expectedAmount) / 1e6) + ' USDC from your wallet to treasury.');
  }

  // Apply tier upgrade if applicable
  const upgrade = PLAN_UPGRADES[plan];
  if (upgrade) {
    const db = getDb();
    await db
      .update(users)
      .set({
        tier: upgrade.tier,
        agentLimit: upgrade.agentLimit,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    logger.info({ userId: user.id, plan, txHash, tier: upgrade.tier }, 'User tier upgraded via USDC payment');
  } else {
    logger.info({ userId: user.id, plan, txHash }, 'One-time payment verified (no tier change)');
  }

  return c.json({ success: true, plan, txHash });
});

export { payments };
