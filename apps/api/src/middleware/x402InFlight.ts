import type { MiddlewareHandler } from 'hono';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

/** Covers the longest paid handler (55 s) plus verify and settle; the authorization itself expires after 120 s. */
const IN_FLIGHT_TTL_SEC = 120;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
// EIP-3009 nonces are bytes32 hex; Permit2 nonces are uint256 decimal.
const NONCE_RE = /^(?:0x[a-fA-F0-9]{1,64}|\d{1,78})$/;

/**
 * `payer:nonce` of the authorization a payment header carries (EIP-3009, or the
 * Permit2 form of the exact scheme), or null when the header can't be read. One
 * nonce is spendable once on-chain, so this names one payment.
 */
export function paymentLockId(header: string): string | null {
  let decoded: unknown;
  try {
    decoded = decodePaymentSignatureHeader(header);
  } catch {
    return null;
  }
  const payload = (decoded as { payload?: Record<string, unknown> } | null)?.payload;
  const auth = (payload?.authorization ?? payload?.permit2Authorization) as { from?: unknown; nonce?: unknown } | undefined;
  if (typeof auth?.from !== 'string' || typeof auth.nonce !== 'string') return null;
  if (!ADDRESS_RE.test(auth.from) || !NONCE_RE.test(auth.nonce)) return null;
  return `${auth.from.toLowerCase()}:${auth.nonce.toLowerCase()}`;
}

/**
 * The payment middleware verifies, runs the handler, then settles, and tracks
 * nothing in between: one signed payment sent on many simultaneous requests
 * passed verification on each and ran every handler, and only the first settled.
 * This holds one request per payment. Mount it right before the payment middleware.
 *
 * The lock is kept for its TTL once the payment settled, and released when it did
 * not (refused, handler failed, settle failed), so a check that failed can be
 * retried with the same signature. A header it can't read goes on to the payment
 * middleware, which refuses it.
 */
export const x402InFlightLock: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('payment-signature') || c.req.header('x-payment');
  const id = header ? paymentLockId(header) : null;
  if (!id) return next();

  const key = `x402:inflight:${id}`;
  const redis = getRedis();
  const acquired = await redis.set(key, '1', 'EX', IN_FLIGHT_TTL_SEC, 'NX');
  if (acquired !== 'OK') {
    c.header('Cache-Control', 'no-store');
    return c.json(
      { success: false, error: { code: 'PAYMENT_IN_USE', message: 'This payment is already being used by another request.' } },
      409,
    );
  }

  let settled = false;
  try {
    await next();
    settled = c.res.status < 400 && (c.res.headers.has('payment-response') || c.res.headers.has('x-payment-response'));
  } finally {
    if (!settled) {
      await redis.del(key).catch((err: unknown) => logger.warn({ err, key }, 'x402: could not release in-flight payment lock'));
    }
  }
};
