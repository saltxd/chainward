import { describe, it, expect, vi } from 'vitest';
import { handleEntry, parseTarget } from '../src/handler.js';

const VALID_ADDRESS = '0x' + '1'.repeat(40);

describe('parseTarget', () => {
  it('rejects empty input', () => {
    expect(parseTarget('').ok).toBe(false);
  });
  it('accepts a JSON {target} address', () => {
    const r = parseTarget(JSON.stringify({ target: VALID_ADDRESS }));
    expect(r).toMatchObject({ ok: true, target: { kind: 'address', address: VALID_ADDRESS } });
  });
  it('accepts the legacy {wallet_address} field for backwards compat', () => {
    const r = parseTarget(JSON.stringify({ wallet_address: VALID_ADDRESS }));
    expect(r).toMatchObject({ ok: true, target: { kind: 'address', address: VALID_ADDRESS } });
  });
  it('accepts a bare address string (non-JSON content)', () => {
    const r = parseTarget(VALID_ADDRESS);
    expect(r).toMatchObject({ ok: true, target: { kind: 'address', address: VALID_ADDRESS } });
  });
  it('accepts an @handle target', () => {
    const r = parseTarget(JSON.stringify({ target: '@axelrod' }));
    expect(r).toMatchObject({ ok: true, target: { kind: 'handle', handle: 'axelrod' } });
  });
  it('rejects malformed addresses', () => {
    expect(parseTarget(JSON.stringify({ target: 'not-an-address' })).ok).toBe(false);
  });
});

// SystemEntry
function makeEntry(type: string): any {
  return { kind: 'system', event: { type }, onChainJobId: 'job-1', chainId: 8453, timestamp: Date.now() };
}

// MessageEntry
function makeMessageEntry(contentType: string, content: string): any {
  return { kind: 'message', contentType, content, from: '0xbuyer' };
}

function makeSession(opts: { jobExists?: boolean; requirement?: any; status?: string; chainId?: number } = {}): any {
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
    chainId: opts.chainId ?? 8453,
    status: opts.status ?? 'open',
    setBudget: vi.fn().mockResolvedValue(undefined),
    submit: vi.fn().mockResolvedValue(undefined),
    reject: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
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
      persistSettled: vi.fn().mockResolvedValue(undefined),
    },
    decode: { quickDecode: vi.fn().mockResolvedValue(overrides.decodeResult ?? { report: '# x', data: {}, sources: [], meta: {} }) },
    resolver: {
      resolveHandle: vi.fn().mockResolvedValue(
        // Allow tests to explicitly pass null without falling through to the default
        Object.prototype.hasOwnProperty.call(overrides, 'resolverResult') ? overrides.resolverResult : VALID_ADDRESS,
      ),
    },
    chainHistory: { checkHistory: vi.fn().mockResolvedValue(overrides.historyResult ?? { transactions_count: 1, token_transfers_count: 1 }) },
    config: { feeUsdc: 10, defaultChainId: 8453, decodeWatchdogMs: 5 * 60 * 1000 },
    assetTokenForUsdc: vi.fn().mockResolvedValue({ amount: 10, address: '0xUSDC' }),
    onJobStart: vi.fn(),
    onJobEnd: vi.fn(),
  };
}

describe('handleEntry — requirement message', () => {
  it('rejects invalid wallet address', async () => {
    const ctx = makeCtx();
    const session = makeSession();
    await handleEntry(ctx, session, makeMessageEntry('requirement', JSON.stringify({ target: 'bad' })));
    expect(session.reject).toHaveBeenCalledWith('invalid_address');
  });

  it('accepts the documented {target} field', async () => {
    const ctx = makeCtx();
    const session = makeSession();
    await handleEntry(ctx, session, makeMessageEntry('requirement', JSON.stringify({ target: VALID_ADDRESS })));
    expect(session.setBudget).toHaveBeenCalled();
    expect(ctx.persist.persistAccepted).toHaveBeenCalled();
  });

  it('still accepts legacy {wallet_address} field', async () => {
    const ctx = makeCtx();
    const session = makeSession();
    await handleEntry(ctx, session, makeMessageEntry('requirement', JSON.stringify({ wallet_address: VALID_ADDRESS })));
    expect(session.setBudget).toHaveBeenCalled();
  });

  it('rejects when rate limiter denies', async () => {
    const ctx = makeCtx({ rateLimitResult: 'rate_limited' });
    const session = makeSession();
    await handleEntry(ctx, session, makeMessageEntry('requirement', JSON.stringify({ target: VALID_ADDRESS })));
    expect(session.reject).toHaveBeenCalledWith('rate_limited');
  });

  it('rejects when wallet has zero history', async () => {
    const ctx = makeCtx({ historyResult: { transactions_count: 0, token_transfers_count: 0 } });
    const session = makeSession();
    await handleEntry(ctx, session, makeMessageEntry('requirement', JSON.stringify({ target: VALID_ADDRESS })));
    expect(session.reject).toHaveBeenCalledWith('no_history');
    expect(ctx.rateLimiter.release).toHaveBeenCalledWith('0xbuyer');
  });

  it('passes session.chainId and configured fee to assetTokenForUsdc', async () => {
    const ctx = makeCtx();
    const session = makeSession({ chainId: 8453 });
    await handleEntry(ctx, session, makeMessageEntry('requirement', JSON.stringify({ target: VALID_ADDRESS })));
    expect(ctx.assetTokenForUsdc).toHaveBeenCalledWith(10, 8453);
  });

  it('does not double-process when session.status is not open', async () => {
    const ctx = makeCtx();
    const session = makeSession({ status: 'funded' });
    await handleEntry(ctx, session, makeMessageEntry('requirement', JSON.stringify({ target: VALID_ADDRESS })));
    expect(session.setBudget).not.toHaveBeenCalled();
    expect(session.reject).not.toHaveBeenCalled();
  });

  it('resolves @handle to address before validation', async () => {
    const ctx = makeCtx({ resolverResult: VALID_ADDRESS });
    const session = makeSession();
    await handleEntry(ctx, session, makeMessageEntry('requirement', JSON.stringify({ target: '@axelrod' })));
    expect(ctx.resolver.resolveHandle).toHaveBeenCalledWith('axelrod');
    expect(session.setBudget).toHaveBeenCalled();
  });

  it('rejects @handle that does not resolve', async () => {
    const ctx = makeCtx({ resolverResult: null });
    const session = makeSession();
    await handleEntry(ctx, session, makeMessageEntry('requirement', JSON.stringify({ target: '@nope' })));
    expect(session.reject).toHaveBeenCalledWith('handle_not_found');
  });
});

describe('handleEntry — job.created', () => {
  it('does nothing (log only) on job.created', async () => {
    const ctx = makeCtx();
    const session = makeSession({ requirement: { target: VALID_ADDRESS } });
    await handleEntry(ctx, session, makeEntry('job.created'));
    expect(session.setBudget).not.toHaveBeenCalled();
    expect(session.reject).not.toHaveBeenCalled();
  });
});

describe('handleEntry — job.funded', () => {
  it('runs quickDecode, submits, and persists', async () => {
    const ctx = makeCtx({ decodeResult: { report: '# done', data: {}, sources: [], meta: {} } });
    const session = makeSession({ requirement: { target: VALID_ADDRESS } });
    await handleEntry(ctx, session, makeEntry('job.funded'));
    expect(ctx.decode.quickDecode).toHaveBeenCalled();
    expect(session.submit).toHaveBeenCalled();
    expect(ctx.persist.persistDelivered).toHaveBeenCalled();
    expect(ctx.rateLimiter.release).toHaveBeenCalledWith('0xbuyer');
  });

  it('rejects with decode_failed when watchdog fires (no partial submit)', async () => {
    vi.useFakeTimers();
    const ctx = makeCtx();
    ctx.decode.quickDecode = vi.fn(() => new Promise(() => {}));
    const session = makeSession({ requirement: { target: VALID_ADDRESS } });
    const p = handleEntry(ctx, session, makeEntry('job.funded'));
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    await p;
    expect(session.reject).toHaveBeenCalledWith('decode_failed');
    expect(session.submit).not.toHaveBeenCalled();
    expect(ctx.persist.persistRejected).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('rejects when quickDecode throws', async () => {
    const ctx = makeCtx();
    ctx.decode.quickDecode = vi.fn().mockRejectedValue(new Error('boom'));
    const session = makeSession({ requirement: { target: VALID_ADDRESS } });
    await expect(
      handleEntry(ctx, session, makeEntry('job.funded')),
    ).rejects.toThrow('boom');
    expect(session.reject).toHaveBeenCalledWith('decode_failed');
    expect(session.submit).not.toHaveBeenCalled();
    expect(ctx.rateLimiter.release).toHaveBeenCalledWith('0xbuyer');
  });

  it('tracks job lifecycle for graceful shutdown', async () => {
    const ctx = makeCtx();
    const session = makeSession({ requirement: { target: VALID_ADDRESS } });
    await handleEntry(ctx, session, makeEntry('job.funded'));
    expect(ctx.onJobStart).toHaveBeenCalledWith('1');
    expect(ctx.onJobEnd).toHaveBeenCalledWith('1');
  });
});

describe('handleEntry — terminal events', () => {
  it('persistSettled on job.completed (does NOT overwrite delivered result)', async () => {
    const ctx = makeCtx();
    const session = makeSession({ requirement: { target: VALID_ADDRESS } });
    await handleEntry(ctx, session, makeEntry('job.completed'));
    expect(ctx.persist.persistSettled).toHaveBeenCalledWith('1');
    expect(ctx.persist.persistDelivered).not.toHaveBeenCalled();
  });

  it('releases rate-limit slot on job.rejected', async () => {
    const ctx = makeCtx();
    const session = makeSession({ requirement: { target: VALID_ADDRESS } });
    await handleEntry(ctx, session, makeEntry('job.rejected'));
    expect(ctx.rateLimiter.release).toHaveBeenCalledWith('0xbuyer');
    expect(ctx.persist.persistRejected).toHaveBeenCalled();
  });

  it('releases rate-limit slot on job.expired', async () => {
    const ctx = makeCtx();
    const session = makeSession({ requirement: { target: VALID_ADDRESS } });
    await handleEntry(ctx, session, makeEntry('job.expired'));
    expect(ctx.rateLimiter.release).toHaveBeenCalledWith('0xbuyer');
  });
});

describe('handleEntry — non-requirement message entries ignored', () => {
  it('does nothing for plain text message entries', async () => {
    const ctx = makeCtx();
    const session = makeSession();
    const msgEntry: any = { kind: 'message', contentType: 'text', content: 'hello', from: '0xbuyer' };
    await handleEntry(ctx, session, msgEntry);
    expect(session.reject).not.toHaveBeenCalled();
    expect(session.setBudget).not.toHaveBeenCalled();
  });
});
