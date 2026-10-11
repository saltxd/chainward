import { Hono } from 'hono';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { tierPayments, users } from '@chainward/db';
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

// A payment is verified right after it is sent; a transfer older than this was for something else.
const MAX_PAYMENT_AGE_MS = 24 * 3600_000;

const payments = new Hono<{ Variables: AppVariables }>();

const verifySchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  plan: z.enum(['operator', 'community', 'brief']),
});

payments.post('/verify', requireApiKeyOrSession('write'), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = verifySchema.parse(body);
  const { plan } = parsed;
  const txHash = parsed.txHash.toLowerCase();

  const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS?.toLowerCase();
  if (!treasuryAddress) {
    throw new AppError(500, 'CONFIG_ERROR', 'Treasury address not configured');
  }

  const db = getDb();
  const alreadyUsed = () => new AppError(409, 'PAYMENT_ALREADY_USED', 'This transaction has already been used');

  // Each transfer counts once.
  const [dupe] = await db
    .select({ id: tierPayments.id })
    .from(tierPayments)
    .where(sql`lower(${tierPayments.txHash}) = ${txHash}`)
    .limit(1);
  if (dupe) throw alreadyUsed();

  // Only a transfer made after the account existed, and recently, pays for this request.
  const [account] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, user.id)).limit(1);
  const notBefore = new Date(
    Math.max(Date.now() - MAX_PAYMENT_AGE_MS, account ? account.createdAt.getTime() - 60_000 : 0),
  );

  // Find the USDC Transfer log from the user's wallet to the treasury
  const expectedAmount = PLAN_PRICES[plan]!;
  const result = await verifyUsdcPayment({
    txHash,
    fromWallet: user.walletAddress,
    toTreasury: treasuryAddress,
    minAmount: expectedAmount,
    notBefore,
  });

  if (!result.ok) {
    if (result.reason === 'TX_NOT_FOUND') {
      throw new AppError(400, 'TX_NOT_FOUND', 'Transaction not found or not yet confirmed');
    }
    if (result.reason === 'TX_FAILED') {
      throw new AppError(400, 'TX_FAILED', 'Transaction reverted on-chain');
    }
    if (result.reason === 'TOO_OLD') {
      throw new AppError(400, 'PAYMENT_TOO_OLD', 'This transaction is older than 24 hours or predates your account');
    }
    throw new AppError(400, 'INVALID_PAYMENT', 'No matching USDC transfer found in transaction. Expected ' + (Number(expectedAmount) / 1e6) + ' USDC from your wallet to treasury.');
  }

  // Record the transfer and apply the upgrade together; the unique index on
  // lower(tx_hash) refuses a concurrent request with the same transaction.
  const upgrade = PLAN_UPGRADES[plan];
  await db.transaction(async (tx) => {
    const recorded = await tx
      .insert(tierPayments)
      .values({ txHash, userId: user.id, plan, payerWallet: result.from, amountUsdc: Number(result.value) })
      .onConflictDoNothing()
      .returning({ id: tierPayments.id });
    if (recorded.length === 0) throw alreadyUsed();
    if (upgrade) {
      await tx
        .update(users)
        .set({
          tier: upgrade.tier,
          agentLimit: upgrade.agentLimit,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }
  });

  if (upgrade) {
    logger.info({ userId: user.id, plan, txHash, tier: upgrade.tier }, 'User tier upgraded via USDC payment');
  } else {
    logger.info({ userId: user.id, plan, txHash }, 'One-time payment verified (no tier change)');
  }

  return c.json({ success: true, plan, txHash });
});

export { payments };
