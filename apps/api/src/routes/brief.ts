import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import { briefOrders } from '@chainward/db';
import type { AppVariables } from '../types.js';
import { getDb } from '../lib/db.js';
import { requireApiKeyOrSession } from '../middleware/apiKeyAuth.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../lib/logger.js';
import { verifyUsdcPayment } from '../lib/verifyUsdcPayment.js';

// Price for the paid "Intel Brief" (forensic on-chain decode), in micro-USDC
// (6 decimals). Env-overridable so the price can be tuned WITHOUT a redeploy.
// Defaults to the 1-USDC launch rate (ChainWard's literal first dollar).
const BRIEF_PRICE_USDC = BigInt(process.env.BRIEF_PRICE_MICRO_USDC ?? '1000000');

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const brief = new Hono<{ Variables: AppVariables }>();

function treasuryOrThrow(): string {
  const treasury = process.env.TREASURY_WALLET_ADDRESS?.toLowerCase();
  if (!treasury) {
    throw new AppError(503, 'PAYMENTS_UNCONFIGURED', 'Payments are not configured yet');
  }
  return treasury;
}

// ── Public config ───────────────────────────────────────────────────────────
// Treasury address + price are read at RUNTIME by the checkout page, so the
// receiving wallet can be set/rotated via API env alone — no web rebuild
// (NEXT_PUBLIC_* vars are baked at build time, so we never rely on them here).
brief.get('/config', (c) => {
  const treasury = process.env.TREASURY_WALLET_ADDRESS ?? null;
  return c.json({
    success: true,
    treasuryAddress: treasury,
    priceMicroUsdc: BRIEF_PRICE_USDC.toString(),
    priceUsdc: Number(BRIEF_PRICE_USDC) / 1e6,
    available: Boolean(treasury),
  });
});

// ── Create a pending order ────────────────────────────────────────────────────
const createSchema = z.object({
  target: z.string().trim().min(1).max(200),
  contact: z.string().trim().min(3).max(200),
  contactMethod: z.enum(['email', 'telegram', 'x', 'discord', 'other']),
  notes: z.string().trim().max(2000).optional(),
});

brief.post('/orders', requireApiKeyOrSession('write'), async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { target, contact, contactMethod, notes } = createSchema.parse(body);

  // Normalize the decode target: 0x… address vs agent handle.
  const isAddress = ADDRESS_RE.test(target);
  const normalizedTarget = isAddress ? target.toLowerCase() : target.replace(/^@/, '');
  const targetKind = isAddress ? 'address' : 'handle';

  const db = getDb();
  const [order] = await db
    .insert(briefOrders)
    .values({
      userId: user.id,
      walletAddress: user.walletAddress.toLowerCase(),
      target: normalizedTarget,
      targetKind,
      contact,
      contactMethod,
      notes: notes ?? null,
      plan: 'brief',
      amountUsdc: Number(BRIEF_PRICE_USDC), // lock the quoted price at order time
      status: 'pending',
    })
    .returning();

  logger.info({ userId: user.id, orderId: order!.id, target: normalizedTarget, targetKind }, 'Brief order created (pending)');

  return c.json({ success: true, order });
});

// ── Pay for an order (verify the on-chain USDC transfer) ──────────────────────
const paySchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

brief.post('/orders/:id/pay', requireApiKeyOrSession('write'), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw new AppError(400, 'INVALID_ORDER_ID', 'Invalid order id');
  }
  const body = await c.req.json().catch(() => ({}));
  const { txHash } = paySchema.parse(body);

  const treasury = treasuryOrThrow();
  const db = getDb();

  const [order] = await db.select().from(briefOrders).where(eq(briefOrders.id, id)).limit(1);
  if (!order || order.userId !== user.id) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
  }
  if (order.status === 'paid' || order.status === 'fulfilled') {
    // Idempotent: already paid → return current state instead of erroring.
    return c.json({ success: true, order });
  }
  if (order.status !== 'pending') {
    throw new AppError(409, 'ORDER_NOT_PAYABLE', `Order is ${order.status}`);
  }

  // Guard against reusing the same on-chain tx for a different order.
  const [dupe] = await db
    .select({ id: briefOrders.id })
    .from(briefOrders)
    .where(eq(briefOrders.txHash, txHash))
    .limit(1);
  if (dupe && dupe.id !== order.id) {
    throw new AppError(409, 'PAYMENT_ALREADY_USED', 'This transaction is already attached to another order');
  }

  const result = await verifyUsdcPayment({
    txHash,
    fromWallet: user.walletAddress,
    toTreasury: treasury,
    minAmount: BigInt(order.amountUsdc),
  });

  if (!result.ok) {
    if (result.reason === 'TX_NOT_FOUND') {
      throw new AppError(400, 'TX_NOT_FOUND', 'Transaction not found or not yet confirmed');
    }
    if (result.reason === 'TX_FAILED') {
      throw new AppError(400, 'TX_FAILED', 'Transaction reverted on-chain');
    }
    throw new AppError(
      400,
      'INVALID_PAYMENT',
      'No matching USDC transfer found. Expected ' + Number(order.amountUsdc) / 1e6 + ' USDC from your wallet to the treasury.',
    );
  }

  const [updated] = await db
    .update(briefOrders)
    .set({ status: 'paid', txHash, paidAt: new Date() })
    .where(eq(briefOrders.id, order.id))
    .returning();

  logger.info({ userId: user.id, orderId: order.id, txHash }, 'Brief order PAID');

  // Fire-and-forget ops notification so a paid order is never missed.
  void notifyPaidOrder(updated!).catch((err) =>
    logger.error({ err: err instanceof Error ? err.message : String(err), orderId: order.id }, 'brief: order notify failed'),
  );

  return c.json({ success: true, order: updated });
});

// ── List the caller's own orders ──────────────────────────────────────────────
brief.get('/orders/mine', requireApiKeyOrSession('read'), async (c) => {
  const user = c.get('user');
  const db = getDb();
  const orders = await db
    .select()
    .from(briefOrders)
    .where(eq(briefOrders.userId, user.id))
    .orderBy(desc(briefOrders.createdAt))
    .limit(50);
  return c.json({ success: true, orders });
});

// ── Ops endpoints (fulfillment worker) ────────────────────────────────────────
// Authed by a shared OPS_API_KEY (chainward-secrets), used by the off-cluster
// fulfillment poller on sg-scribe to claim + settle orders. No session/wallet.
const requireOpsKey: MiddlewareHandler = async (c, next) => {
  const expected = process.env.OPS_API_KEY;
  if (!expected) throw new AppError(503, 'OPS_DISABLED', 'Ops API not configured');
  const got = c.req.header('x-ops-key') ?? '';
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid ops key');
  }
  await next();
};

// Paid orders awaiting fulfillment, oldest first.
brief.get('/ops/queue', requireOpsKey, async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 10), 1), 50);
  const db = getDb();
  const orders = await db
    .select()
    .from(briefOrders)
    .where(eq(briefOrders.status, 'paid'))
    .orderBy(briefOrders.createdAt)
    .limit(limit);
  return c.json({ success: true, orders });
});

const opsStatusSchema = z.object({
  status: z.enum(['fulfilling', 'fulfilled', 'failed']),
  deliveryRef: z.string().max(500).optional(),
  error: z.string().max(1000).optional(),
});

brief.post('/ops/orders/:id/status', requireOpsKey, async (c) => {
  const id = c.req.param('id');
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw new AppError(400, 'INVALID_ORDER_ID', 'Invalid order id');
  }
  const body = await c.req.json().catch(() => ({}));
  const { status, deliveryRef, error } = opsStatusSchema.parse(body);
  const db = getDb();

  // 'fulfilling' is an atomic claim: only succeeds from 'paid', so a crashed
  // run or a second poller can't double-decode/double-post the same order.
  if (status === 'fulfilling') {
    const claimed = await db
      .update(briefOrders)
      .set({ status: 'fulfilling' })
      .where(and(eq(briefOrders.id, id), eq(briefOrders.status, 'paid')))
      .returning();
    return c.json({ success: true, claimed: claimed.length > 0, order: claimed[0] ?? null });
  }

  const note = deliveryRef ? `delivered: ${deliveryRef}` : error ? `error: ${error}` : null;
  const [updated] = await db
    .update(briefOrders)
    .set({
      status,
      ...(status === 'fulfilled' ? { fulfilledAt: new Date() } : {}),
      ...(note ? { notes: sql`concat_ws(' | ', ${briefOrders.notes}, ${note})` } : {}),
    })
    .where(eq(briefOrders.id, id))
    .returning();
  if (!updated) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
  logger.info({ orderId: id, status, deliveryRef }, 'Brief order status updated (ops)');
  return c.json({ success: true, order: updated });
});

type BriefOrderRow = typeof briefOrders.$inferSelect;

async function notifyPaidOrder(order: BriefOrderRow): Promise<void> {
  const webhookUrl = process.env.DIGEST_DISCORD_WEBHOOK;
  if (!webhookUrl) return;

  const usdc = (Number(order.amountUsdc) / 1e6).toFixed(2);
  const targetLine =
    order.targetKind === 'address'
      ? `\`${order.target}\` ([basescan](https://basescan.org/address/${order.target}))`
      : `${order.target} (handle)`;
  const lines = [
    `💸 **New paid Intel Brief — ${usdc} USDC**`,
    `**Target:** ${targetLine}`,
    `**Deliver to:** ${order.contact} _(${order.contactMethod})_`,
    `**Buyer:** \`${order.walletAddress}\``,
    order.notes ? `**Notes:** ${order.notes}` : null,
    `**Order:** \`${order.id}\``,
    order.txHash ? `**Tx:** https://basescan.org/tx/${order.txHash}` : null,
  ].filter(Boolean);

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: lines.join('\n') }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status, orderId: order.id }, 'brief: Discord notify non-OK');
  }
}

export { brief };
