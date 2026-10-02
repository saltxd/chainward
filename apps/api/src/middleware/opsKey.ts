import type { MiddlewareHandler } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { AppError } from './errorHandler.js';

/**
 * Operator-only routes, authed by the shared OPS_API_KEY (chainward-secrets) in
 * the x-ops-key header. Used by the off-cluster fulfillment poller and for
 * observatory curation. No session or wallet can reach these.
 */
export const requireOpsKey: MiddlewareHandler = async (c, next) => {
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
