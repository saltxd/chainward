import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { users } from '@chainward/db';
import type { AppVariables } from '../types.js';
import { getDb } from '../lib/db.js';
import { requireApiKeyOrSession } from '../middleware/apiKeyAuth.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../lib/logger.js';
import { verifyUsdcPayment } from '../lib/verifyUsdcPayment.js';

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

  // Find the USDC Transfer log from the user's wallet to the treasury
  const expectedAmount = PLAN_PRICES[plan]!;
  const result = await verifyUsdcPayment({
    txHash,
    fromWallet: user.walletAddress,
    toTreasury: treasuryAddress,
    minAmount: expectedAmount,
  });

  if (!result.ok) {
    if (result.reason === 'TX_NOT_FOUND') {
      throw new AppError(400, 'TX_NOT_FOUND', 'Transaction not found or not yet confirmed');
    }
    if (result.reason === 'TX_FAILED') {
      throw new AppError(400, 'TX_FAILED', 'Transaction reverted on-chain');
    }
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
