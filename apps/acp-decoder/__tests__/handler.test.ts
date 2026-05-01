import { describe, it, expect, vi } from 'vitest';
import { handleNewTask, validateRequest } from '../src/handler.js';

describe('validateRequest', () => {
  it('rejects invalid wallet address', () => {
    const r = validateRequest({ wallet_address: 'not-an-address' });
    expect(r).toEqual({ ok: false, reason: 'invalid_address' });
  });
  it('accepts a valid 0x40-hex address', () => {
    const r = validateRequest({ wallet_address: '0x' + '1'.repeat(40) });
    expect(r).toEqual({ ok: true, wallet_address: '0x' + '1'.repeat(40) });
  });
});

describe('handleNewTask (REQUEST phase)', () => {
  it('rejects when wallet_address is invalid', async () => {
    const ctx = makeCtx();
    await handleNewTask(ctx, makeJob('REQUEST', { wallet_address: 'bad' }));
    expect(ctx.api.reject).toHaveBeenCalledWith(expect.any(String), { reason: 'invalid_address' });
  });
  it('rejects when rate limiter denies', async () => {
    const ctx = makeCtx({ rateLimitResult: 'rate_limited' });
    await handleNewTask(ctx, makeJob('REQUEST', { wallet_address: '0x' + '1'.repeat(40) }));
    expect(ctx.api.reject).toHaveBeenCalledWith(expect.any(String), { reason: 'rate_limited' });
  });
  it('accepts when validation + rate limit pass', async () => {
    const ctx = makeCtx({ rateLimitResult: 'ok' });
    await handleNewTask(ctx, makeJob('REQUEST', { wallet_address: '0x' + '1'.repeat(40) }));
    expect(ctx.api.accept).toHaveBeenCalled();
    expect(ctx.persist.persistAccepted).toHaveBeenCalled();
  });
});

describe('handleNewTask (TRANSACTION phase)', () => {
  it('runs quickDecode and delivers', async () => {
    const ctx = makeCtx({ decodeResult: { report: '# x', data: {}, sources: [], meta: {} } });
    await handleNewTask(ctx, makeJob('TRANSACTION', { wallet_address: '0x' + '1'.repeat(40) }));
    expect(ctx.decode.quickDecode).toHaveBeenCalled();
    expect(ctx.api.deliver).toHaveBeenCalledWith(expect.any(String), expect.any(Object));
    expect(ctx.persist.persistDelivered).toHaveBeenCalled();
  });
});

function makeJob(phase: string, requirement: any): any {
  return { id: 'job-1', phase, buyerWallet: '0xbuyer', requirement };
}

function makeCtx(overrides: any = {}): any {
  return {
    api: {
      accept: vi.fn().mockResolvedValue(undefined),
      reject: vi.fn().mockResolvedValue(undefined),
      requirement: vi.fn().mockResolvedValue(undefined),
      deliver: vi.fn().mockResolvedValue(undefined),
    },
    rateLimiter: {
      tryAcquire: vi.fn().mockResolvedValue(overrides.rateLimitResult ?? 'ok'),
      release: vi.fn().mockResolvedValue(undefined),
    },
    persist: {
      persistAccepted: vi.fn().mockResolvedValue(undefined),
      persistDelivered: vi.fn().mockResolvedValue(undefined),
      persistRejected: vi.fn().mockResolvedValue(undefined),
    },
    decode: { quickDecode: vi.fn().mockResolvedValue(overrides.decodeResult ?? { report: '', data: {}, sources: [], meta: {} }) },
    chainHistory: {
      checkHistory: vi.fn().mockResolvedValue(
        overrides.historyResult ?? { transactions_count: 1, token_transfers_count: 1 },
      ),
    },
    config: { feeUsdc: 25 },
  };
}

describe('handleNewTask (REQUEST phase) — no_history reject', () => {
  it('rejects when wallet has zero history on Base', async () => {
    const ctx = makeCtx({
      rateLimitResult: 'ok',
      historyResult: { transactions_count: 0, token_transfers_count: 0 },
    });
    await handleNewTask(ctx, makeJob('REQUEST', { wallet_address: '0x' + '1'.repeat(40) }));
    expect(ctx.api.reject).toHaveBeenCalledWith(expect.any(String), { reason: 'no_history' });
  });

  it('accepts when wallet has any history', async () => {
    const ctx = makeCtx({
      rateLimitResult: 'ok',
      historyResult: { transactions_count: 5, token_transfers_count: 0 },
    });
    await handleNewTask(ctx, makeJob('REQUEST', { wallet_address: '0x' + '1'.repeat(40) }));
    expect(ctx.api.accept).toHaveBeenCalled();
  });
});

describe('handleNewTask (TRANSACTION) — execution watchdog', () => {
  it('delivers partial result when quickDecode exceeds 5min watchdog', async () => {
    vi.useFakeTimers();
    const ctx = makeCtx();
    // quickDecode returns a never-resolving promise — should hit watchdog
    ctx.decode.quickDecode = vi.fn(() => new Promise(() => {}));
    const handlerPromise = handleNewTask(ctx, makeJob('TRANSACTION', { wallet_address: '0x' + '1'.repeat(40) }));
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    await handlerPromise;
    expect(ctx.api.deliver).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: 'json',
        value: expect.objectContaining({
          status: 'partial',
          error: 'timeout',
        }),
      }),
    );
    vi.useRealTimers();
  });

  it('delivers normal result when quickDecode finishes under 5min', async () => {
    const ctx = makeCtx({ decodeResult: { report: '# x', data: { target: { name: 'x' } }, sources: [], meta: {} } });
    await handleNewTask(ctx, makeJob('TRANSACTION', { wallet_address: '0x' + '1'.repeat(40) }));
    expect(ctx.api.deliver).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: 'json',
        value: expect.objectContaining({ report: '# x' }),
      }),
    );
  });
});
