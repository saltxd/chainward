import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// POST /api/payments/verify upgrades a tier for a USDC transfer to the treasury.
// Nothing recorded the transfer, so any past qualifying transfer from the wallet
// could repeat the upgrade. Each tx hash now upgrades once, and only a transfer
// made after the account existed and within the last 24h counts.
const state = vi.hoisted(() => ({
  usedTx: new Set<string>(),
  inserted: [] as Array<Record<string, unknown>>,
  updates: 0,
  accountCreatedAt: new Date('2026-10-01T00:00:00Z'),
}));

const verifyUsdcPayment = vi.hoisted(() =>
  vi.fn(async (_opts: { txHash: string; notBefore?: Date }) => ({ ok: true as const, value: 25_000_000n, from: '0x1111111111111111111111111111111111111111' })),
);

vi.mock('../lib/verifyUsdcPayment.js', () => ({ verifyUsdcPayment }));
vi.mock('../middleware/apiKeyAuth.js', () => ({
  requireApiKeyOrSession: () => async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'user-1', walletAddress: '0x1111111111111111111111111111111111111111', displayName: null, tier: 'free' });
    await next();
  },
}));
vi.mock('../lib/db.js', async () => {
  const { tierPayments, users } = await import('@chainward/db');
  const { PgDialect } = await import('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  const db = {
    select: () => {
      let table: unknown;
      let params: unknown[] = [];
      const q: Record<string, unknown> = {
        from: (t: unknown) => ((table = t), q),
        where: (cond: Parameters<typeof dialect.sqlToQuery>[0]) => ((params = dialect.sqlToQuery(cond).params), q),
        limit: async () => {
          if (table === users) return [{ createdAt: state.accountCreatedAt }];
          if (table === tierPayments) return params.some((p) => state.usedTx.has(String(p))) ? [{ id: 'x' }] : [];
          return [];
        },
      };
      return q;
    },
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (table !== tierPayments) return [];
            const tx = String(v.txHash).toLowerCase();
            if (state.usedTx.has(tx)) return [];
            state.usedTx.add(tx);
            state.inserted.push(v);
            return [{ id: 'new' }];
          },
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => void state.updates++ }) }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { getDb: () => db };
});

import { payments } from '../routes/payments.js';
import { handleError } from '../middleware/errorHandler.js';

function app(): Hono {
  const a = new Hono();
  a.onError(handleError);
  a.route('/api/payments', payments);
  return a;
}

const TX = `0x${'ab'.repeat(32)}`;
const verify = (txHash: string, plan = 'operator') =>
  app().request('/api/payments/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ txHash, plan }),
  });

describe('POST /api/payments/verify', () => {
  beforeEach(() => {
    vi.stubEnv('TREASURY_WALLET_ADDRESS', '0x000000000000000000000000000000000000dEaD');
    state.usedTx.clear();
    state.inserted = [];
    state.updates = 0;
    state.accountCreatedAt = new Date('2026-10-01T00:00:00Z');
    verifyUsdcPayment.mockClear();
  });

  it('upgrades once for a transfer and records its tx hash', async () => {
    const res = await verify(TX);
    expect(res.status).toBe(200);
    expect(state.updates).toBe(1);
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({ txHash: TX, userId: 'user-1', plan: 'operator', amountUsdc: 25_000_000 });
  });

  it('refuses a tx hash that was already used, without checking the chain or upgrading', async () => {
    expect((await verify(TX)).status).toBe(200);
    const again = await verify(TX.toUpperCase().replace('0X', '0x'));
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe('PAYMENT_ALREADY_USED');
    expect(verifyUsdcPayment).toHaveBeenCalledTimes(1);
    expect(state.updates).toBe(1);
  });

  it('refuses when a concurrent request recorded the same tx first', async () => {
    // The pre-check passes, then the insert finds the hash taken.
    verifyUsdcPayment.mockImplementationOnce(async (opts) => {
      state.usedTx.add(opts.txHash.toLowerCase());
      return { ok: true, value: 25_000_000n, from: '0x1111111111111111111111111111111111111111' };
    });
    const res = await verify(TX);
    expect(res.status).toBe(409);
    expect(state.updates).toBe(0);
  });

  it('only counts transfers from the last 24h', async () => {
    const before = Date.now();
    await verify(TX);
    const notBefore = verifyUsdcPayment.mock.calls[0]![0].notBefore!;
    expect(notBefore).toBeInstanceOf(Date);
    expect(Math.abs(notBefore.getTime() - (before - 24 * 3600_000))).toBeLessThan(5_000);
  });

  it('only counts transfers made after the account existed', async () => {
    state.accountCreatedAt = new Date(Date.now() - 3600_000);
    await verify(TX);
    const notBefore = verifyUsdcPayment.mock.calls[0]![0].notBefore!;
    expect(notBefore.getTime()).toBeGreaterThanOrEqual(state.accountCreatedAt.getTime() - 60_000);
    expect(notBefore.getTime()).toBeLessThanOrEqual(state.accountCreatedAt.getTime());
  });

  it('answers a transfer that is too old with PAYMENT_TOO_OLD', async () => {
    verifyUsdcPayment.mockResolvedValueOnce({ ok: false, reason: 'TOO_OLD' } as never);
    const res = await verify(TX);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('PAYMENT_TOO_OLD');
    expect(state.updates).toBe(0);
    expect(state.inserted).toHaveLength(0);
  });
});
