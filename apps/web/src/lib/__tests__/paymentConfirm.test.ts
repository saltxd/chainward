import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import {
  CONFIRM_WINDOW_MS,
  classifyClaimError,
  confirmWithRetry,
  parseTxHash,
  retryDelayMs,
  walletErrorMessage,
  type ClaimErrorOutcome,
} from '../paymentConfirm';

const HASH = '0x' + 'ab'.repeat(32);

describe('parseTxHash', () => {
  it('accepts 0x plus 64 hex characters, trimmed and lowercased', () => {
    expect(parseTxHash(HASH)).toBe(HASH);
    expect(parseTxHash(`  0x${'AB'.repeat(32)}\n`)).toBe(HASH);
  });

  it('pulls the hash out of a pasted BaseScan link', () => {
    expect(parseTxHash(`https://basescan.org/tx/${HASH}`)).toBe(HASH);
    expect(parseTxHash(`https://basescan.org/tx/${HASH}#eventlog`)).toBe(HASH);
  });

  it('refuses anything else', () => {
    for (const bad of [
      '',
      '0x',
      HASH.slice(0, 65), // one short
      HASH + 'a', // one long
      HASH.replace('0x', ''), // no prefix
      '0x' + 'zz'.repeat(32), // not hex
      '0x42A09A72eC47647FE9BE1f450Ab8F835D0FF556a', // an address, not a tx
      `https://basescan.org/address/${HASH}`,
    ]) {
      expect(parseTxHash(bad), bad).toBeNull();
    }
  });
});

describe('classifyClaimError', () => {
  const retry: ClaimErrorOutcome = { kind: 'retry' };

  it('keeps waiting while the transaction is not yet indexed', () => {
    expect(classifyClaimError(new ApiError('Transaction not found or not yet confirmed', 'TX_NOT_FOUND'), 'dataset')).toEqual(retry);
    expect(classifyClaimError(new ApiError('Transaction not found or not yet confirmed', 'TX_NOT_FOUND'), 'brief')).toEqual(retry);
  });

  it('keeps waiting through network trouble, rate limits and server hiccups', () => {
    expect(classifyClaimError(new TypeError('Failed to fetch'), 'dataset')).toEqual(retry);
    for (const code of ['RATE_LIMITED', 'BAD_RESPONSE', 'UPSTREAM', 'INTERNAL_ERROR', 'PAYMENTS_UNCONFIGURED', 'SOMETHING_NEW']) {
      expect(classifyClaimError(new ApiError('x', code), 'dataset'), code).toEqual(retry);
    }
  });

  it('does not treat "order not found" as a pending transaction', () => {
    const out = classifyClaimError(new ApiError('Order not found', 'ORDER_NOT_FOUND'), 'brief');
    expect(out.kind).toBe('final');
  });

  it('stops on a payment that can never count, with a plain reason', () => {
    const cases: Array<[string, 'dataset' | 'brief', RegExp]> = [
      ['INVALID_PAYMENT', 'dataset', /full price/],
      ['INVALID_PAYMENT', 'brief', /wallet you signed in with/],
      ['TX_FAILED', 'dataset', /failed on Base/],
      ['PAYMENT_TOO_OLD', 'dataset', /before this file went on sale/],
      ['PAYMENT_BEFORE_ORDER', 'brief', /before this order was placed/],
      ['PAYMENT_ALREADY_USED', 'dataset', /already been used/],
      ['PAYMENT_ALREADY_USED', 'brief', /different order/],
      ['VALIDATION_ERROR', 'dataset', /transaction hash/],
    ];
    for (const [code, product, re] of cases) {
      const out = classifyClaimError(new ApiError('server words', code), product);
      expect(out.kind, code).toBe('final');
      expect(out.kind === 'final' && out.message, code).toMatch(re);
    }
  });

  it('tells a buyer whose claim was already used who to email', () => {
    const out = classifyClaimError(new ApiError('This transaction has already been used', 'PAYMENT_ALREADY_USED'), 'dataset');
    expect(out.kind === 'final' && out.message).toContain('hello@chainward.ai');
  });

  it('asks a brief buyer whose session lapsed to sign in again, instead of failing', () => {
    expect(classifyClaimError(new ApiError('Invalid or expired session', 'UNAUTHORIZED'), 'brief').kind).toBe('signin');
  });

  it('uses no em dashes in any message', () => {
    for (const code of ['INVALID_PAYMENT', 'TX_FAILED', 'PAYMENT_TOO_OLD', 'PAYMENT_BEFORE_ORDER', 'PAYMENT_ALREADY_USED', 'ORDER_NOT_FOUND', 'ORDER_NOT_PAYABLE', 'NOT_FOUND', 'VALIDATION_ERROR', 'UNAUTHORIZED']) {
      for (const product of ['dataset', 'brief'] as const) {
        const out = classifyClaimError(new ApiError('x', code), product);
        if (out.kind !== 'retry') expect(out.message).not.toContain('—');
      }
    }
  });
});

describe('retryDelayMs', () => {
  it('backs off and caps at 30 seconds', () => {
    const delays = Array.from({ length: 12 }, (_, i) => retryDelayMs(i));
    for (let i = 1; i < delays.length; i++) expect(delays[i]!).toBeGreaterThanOrEqual(delays[i - 1]!);
    expect(delays[0]).toBeGreaterThanOrEqual(3000);
    expect(Math.max(...delays)).toBe(30_000);
  });

  it('stays under the claim endpoint rate limit (10 a minute) in the first minute', () => {
    let t = 0;
    let attempts = 0;
    for (let i = 0; t < 60_000; i++) {
      attempts++;
      t += retryDelayMs(i);
    }
    expect(attempts).toBeLessThanOrEqual(10);
  });

  it('keeps confirming for about ten minutes, well past the old 60 seconds', () => {
    expect(CONFIRM_WINDOW_MS).toBe(10 * 60_000);
  });
});

/** A fake clock: sleep advances time instantly. */
function fakeClock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

const notFound = () => new ApiError('Transaction not found or not yet confirmed', 'TX_NOT_FOUND');
const classifyDataset = (err: unknown) => classifyClaimError(err, 'dataset');

describe('confirmWithRetry', () => {
  it('returns the result the first time the API confirms', async () => {
    const clock = fakeClock();
    let calls = 0;
    const res = await confirmWithRetry({
      confirm: async () => {
        calls++;
        if (calls < 4) throw notFound();
        return '/api/paid/x/download?token=t';
      },
      classify: classifyDataset,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(res).toEqual({ status: 'confirmed', value: '/api/paid/x/download?token=t' });
    expect(calls).toBe(4);
    expect(clock.sleeps).toEqual([retryDelayMs(0), retryDelayMs(1), retryDelayMs(2)]);
  });

  it('confirms a payment Base takes five minutes to index (the old loop gave up at 60s)', async () => {
    const clock = fakeClock();
    const res = await confirmWithRetry({
      confirm: async () => {
        if (clock.now() < 5 * 60_000) throw notFound();
        return 'ok';
      },
      classify: classifyDataset,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(res).toEqual({ status: 'confirmed', value: 'ok' });
  });

  it('stops at the first final error without retrying', async () => {
    const clock = fakeClock();
    let calls = 0;
    const res = await confirmWithRetry({
      confirm: async () => {
        calls++;
        throw new ApiError('No USDC transfer', 'INVALID_PAYMENT');
      },
      classify: classifyDataset,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(res.status).toBe('failed');
    expect(calls).toBe(1);
    expect(clock.sleeps).toEqual([]);
  });

  it('reports a sign-in prompt for a lapsed brief session', async () => {
    const clock = fakeClock();
    const res = await confirmWithRetry({
      confirm: async () => {
        throw new ApiError('Invalid or expired session', 'UNAUTHORIZED');
      },
      classify: (err) => classifyClaimError(err, 'brief'),
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(res.status).toBe('signin');
  });

  it('times out after the window instead of looping forever', async () => {
    const clock = fakeClock();
    let calls = 0;
    const res = await confirmWithRetry({
      confirm: async () => {
        calls++;
        throw notFound();
      },
      classify: classifyDataset,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(res).toEqual({ status: 'timeout' });
    expect(clock.now()).toBeLessThanOrEqual(CONFIRM_WINDOW_MS);
    expect(clock.now()).toBeGreaterThan(CONFIRM_WINDOW_MS - 31_000);
    expect(calls).toBeGreaterThan(20);
  });

  it('stops quietly when aborted (page closed or another hash started)', async () => {
    const ctrl = new AbortController();
    const clock = fakeClock();
    let calls = 0;
    const res = await confirmWithRetry({
      confirm: async () => {
        calls++;
        if (calls === 2) ctrl.abort();
        throw notFound();
      },
      classify: classifyDataset,
      signal: ctrl.signal,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(res).toEqual({ status: 'aborted' });
    expect(calls).toBe(2);
  });

  it('still reports a success that lands after an abort: the API has recorded it and will not say yes twice', async () => {
    const ctrl = new AbortController();
    const clock = fakeClock();
    const res = await confirmWithRetry({
      confirm: async () => {
        ctrl.abort(); // e.g. the page unmounted while the claim was in flight
        return '/api/paid/x/download?token=t';
      },
      classify: classifyDataset,
      signal: ctrl.signal,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(res).toEqual({ status: 'confirmed', value: '/api/paid/x/download?token=t' });
  });

  it('only ever calls the verify function: a retry never sends money', async () => {
    // The loop is handed one function; there is no other side effect to repeat.
    const clock = fakeClock();
    const seen: string[] = [];
    await confirmWithRetry({
      confirm: async () => {
        seen.push('verify');
        if (seen.length < 3) throw notFound();
        return true;
      },
      classify: classifyDataset,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(seen).toEqual(['verify', 'verify', 'verify']);
  });
});

describe('walletErrorMessage', () => {
  it('says plainly when the buyer cancelled in the wallet', () => {
    expect(walletErrorMessage(new Error('User rejected the request.'))).toMatch(/cancelled/);
    expect(walletErrorMessage(Object.assign(new Error('long text'), { shortMessage: 'User rejected the request.' }))).toMatch(/cancelled/);
  });

  it('points anyone whose wallet errored at the paste box', () => {
    const msg = walletErrorMessage(Object.assign(new Error('very long viem dump'), { shortMessage: 'Insufficient funds' }));
    expect(msg).toContain('Insufficient funds');
    expect(msg).toMatch(/paste/i);
    expect(msg).not.toContain('—');
  });
});
