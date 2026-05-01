import { describe, it, expect, vi } from 'vitest';
import { handleEntry, validateRequest } from '../src/handler.js';

describe('validateRequest', () => {
  it('rejects invalid wallet address', () => {
    expect(validateRequest({ wallet_address: 'not-an-address' })).toEqual({ ok: false, reason: 'invalid_address' });
  });
  it('accepts a valid 0x40-hex address', () => {
    expect(validateRequest({ wallet_address: '0x' + '1'.repeat(40) })).toEqual({ ok: true, wallet_address: '0x' + '1'.repeat(40) });
  });
});

// SystemEntry: { kind: 'system', event: { type: '...' }, onChainJobId, chainId, timestamp }
function makeEntry(type: string): any {
  return { kind: 'system', event: { type }, onChainJobId: 'job-1', chainId: 8453, timestamp: Date.now() };
}

function makeSession(opts: { jobExists?: boolean; requirement?: any } = {}): any {
  const job = opts.jobExists !== false
    ? { id: BigInt(1), clientAddress: '0xbuyer' }
    : null;
  const entries: any[] = opts.requirement !== undefined
    ? [{
        kind: 'message',
        contentType: 'requirement',
        content: typeof opts.requirement === 'string'
          ? opts.requirement
          : JSON.stringify(opts.requirement),
      }]
    : [];
  return {
    job,
    entries,
    setBudget: vi.fn().mockResolvedValue(undefined),
    submit: vi.fn().mockResolvedValue(undefined),
    reject: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeCtx(overrides: any = {}): any {
  return {
    rateLimiter: {
      tryAcquire: vi.fn().mockResolvedValue(overrides.rateLimitResult ?? 'ok'),
      release: vi.fn().mockResolvedValue(undefined),
    },
    persist: {
      persistAccepted: vi.fn().mockResolvedValue(undefined),
      persistDelivered: vi.fn().mockResolvedValue(undefined),
      persistRejected: vi.fn().mockResolvedValue(undefined),
    },
    decode: { quickDecode: vi.fn().mockResolvedValue(overrides.decodeResult ?? { report: '# x', data: {}, sources: [], meta: {} }) },
    chainHistory: { checkHistory: vi.fn().mockResolvedValue(overrides.historyResult ?? { transactions_count: 1, token_transfers_count: 1 }) },
    config: { feeUsdc: 25, defaultChainId: 8453 },
    assetTokenForUsdc: vi.fn().mockResolvedValue({ amount: 25, address: '0xUSDC' }),
  };
}

describe('handleEntry — job.created', () => {
  it('rejects invalid wallet address', async () => {
    const ctx = makeCtx();
    const session = makeSession({ requirement: { wallet_address: 'bad' } });
    await handleEntry(ctx, session, makeEntry('job.created'));
    expect(session.reject).toHaveBeenCalledWith('invalid_address');
  });

  it('rejects when rate limiter denies', async () => {
    const ctx = makeCtx({ rateLimitResult: 'rate_limited' });
    const session = makeSession({ requirement: { wallet_address: '0x' + '1'.repeat(40) } });
    await handleEntry(ctx, session, makeEntry('job.created'));
    expect(session.reject).toHaveBeenCalledWith('rate_limited');
  });

  it('rejects when wallet has zero history', async () => {
    const ctx = makeCtx({ historyResult: { transactions_count: 0, token_transfers_count: 0 } });
    const session = makeSession({ requirement: { wallet_address: '0x' + '1'.repeat(40) } });
    await handleEntry(ctx, session, makeEntry('job.created'));
    expect(session.reject).toHaveBeenCalledWith('no_history');
  });

  it('sets budget when validation passes', async () => {
    const ctx = makeCtx();
    const session = makeSession({ requirement: { wallet_address: '0x' + '1'.repeat(40) } });
    await handleEntry(ctx, session, makeEntry('job.created'));
    expect(session.setBudget).toHaveBeenCalled();
    expect(ctx.persist.persistAccepted).toHaveBeenCalled();
  });
});

describe('handleEntry — job.funded', () => {
  it('runs quickDecode and submits', async () => {
    const ctx = makeCtx({ decodeResult: { report: '# done', data: {}, sources: [], meta: {} } });
    const session = makeSession({ requirement: { wallet_address: '0x' + '1'.repeat(40) } });
    await handleEntry(ctx, session, makeEntry('job.funded'));
    expect(ctx.decode.quickDecode).toHaveBeenCalled();
    expect(session.submit).toHaveBeenCalled();
    expect(ctx.persist.persistDelivered).toHaveBeenCalled();
  });

  it('submits partial result when quickDecode exceeds 5min watchdog', async () => {
    vi.useFakeTimers();
    const ctx = makeCtx();
    ctx.decode.quickDecode = vi.fn(() => new Promise(() => {}));
    const session = makeSession({ requirement: { wallet_address: '0x' + '1'.repeat(40) } });
    const p = handleEntry(ctx, session, makeEntry('job.funded'));
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    await p;
    expect(session.submit).toHaveBeenCalledWith(expect.stringContaining('"status":"partial"'));
    vi.useRealTimers();
  });
});

describe('handleEntry — message entries ignored', () => {
  it('does nothing for message entries', async () => {
    const ctx = makeCtx();
    const session = makeSession();
    const msgEntry: any = { kind: 'message', contentType: 'text', content: 'hello', onChainJobId: 'job-1', chainId: 8453, timestamp: Date.now() };
    await handleEntry(ctx, session, msgEntry);
    expect(session.reject).not.toHaveBeenCalled();
    expect(session.setBudget).not.toHaveBeenCalled();
  });
});
