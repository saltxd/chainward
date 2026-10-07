import { describe, expect, it } from 'vitest';
import { INITIAL, payReducer, type PayEvent, type PayState } from '../payState';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const run = (events: PayEvent[], from: PayState = INITIAL) => events.reduce(payReducer, from);

describe('payReducer', () => {
  it('starts idle and loads the wallet stack on open', () => {
    expect(INITIAL).toEqual({ step: 'idle' });
    expect(run([{ type: 'open' }])).toEqual({ step: 'loading' });
  });

  it('asks to connect when no wallet is connected', () => {
    expect(run([{ type: 'open' }, { type: 'loaded', account: null }])).toEqual({ step: 'connect' });
  });

  it('stops at the confirm step after connecting: connecting never signs', () => {
    expect(run([{ type: 'open' }, { type: 'loaded', account: null }, { type: 'connected', account: ACCOUNT }])).toEqual({
      step: 'ready',
      account: ACCOUNT,
    });
  });

  it('stops at the confirm step when a wallet was already connected', () => {
    expect(run([{ type: 'open' }, { type: 'loaded', account: ACCOUNT }])).toEqual({ step: 'ready', account: ACCOUNT });
  });

  it('pays only from the confirm step', () => {
    const ready = run([{ type: 'open' }, { type: 'loaded', account: ACCOUNT }]);
    expect(payReducer(ready, { type: 'pay' })).toEqual({ step: 'paying', account: ACCOUNT });
    for (const state of [INITIAL, { step: 'loading' }, { step: 'connect' }] as PayState[]) {
      expect(payReducer(state, { type: 'pay' })).toBe(state);
    }
  });

  it('ignores a second pay while paying: one click, one payment', () => {
    const paying = run([{ type: 'open' }, { type: 'loaded', account: ACCOUNT }, { type: 'pay' }]);
    expect(payReducer(paying, { type: 'pay' })).toBe(paying);
    expect(payReducer(paying, { type: 'close' })).toBe(paying);
    expect(payReducer(paying, { type: 'connected', account: '0x2222222222222222222222222222222222222222' })).toBe(paying);
  });

  it('shows the result, or the error, when payment ends', () => {
    const paying = run([{ type: 'open' }, { type: 'loaded', account: ACCOUNT }, { type: 'pay' }]);
    expect(payReducer(paying, { type: 'paid', data: { ok: 1 }, transaction: '0xabc' })).toEqual({
      step: 'done',
      data: { ok: 1 },
      transaction: '0xabc',
    });
    expect(payReducer(paying, { type: 'failed', message: 'Not enough USDC on Base in this wallet.', charged: false })).toEqual({
      step: 'error',
      message: 'Not enough USDC on Base in this wallet.',
      charged: false,
      account: ACCOUNT,
    });
  });

  it('goes back to the confirm step on retry, not straight to paying', () => {
    const error = run([
      { type: 'open' },
      { type: 'loaded', account: ACCOUNT },
      { type: 'pay' },
      { type: 'failed', message: 'x', charged: false },
    ]);
    expect(payReducer(error, { type: 'retry' })).toEqual({ step: 'ready', account: ACCOUNT });
  });

  it('follows the wallet while confirming', () => {
    const ready = run([{ type: 'open' }, { type: 'loaded', account: ACCOUNT }]);
    const other = '0x2222222222222222222222222222222222222222';
    expect(payReducer(ready, { type: 'connected', account: other })).toEqual({ step: 'ready', account: other });
    expect(payReducer(ready, { type: 'disconnected' })).toEqual({ step: 'connect' });
    expect(payReducer(ready, { type: 'connected', account: ACCOUNT })).toBe(ready);
  });

  it('ignores wallet events while idle (a reconnect on page load opens nothing)', () => {
    expect(payReducer(INITIAL, { type: 'connected', account: ACCOUNT })).toBe(INITIAL);
    expect(payReducer(INITIAL, { type: 'loaded', account: ACCOUNT })).toBe(INITIAL);
  });

  it('closes back to idle from any step but paying', () => {
    const states: PayState[] = [
      { step: 'loading' },
      { step: 'connect' },
      { step: 'ready', account: ACCOUNT },
      { step: 'done', data: {}, transaction: null },
      { step: 'error', message: 'x', charged: false, account: ACCOUNT },
    ];
    for (const state of states) expect(payReducer(state, { type: 'close' })).toEqual(INITIAL);
  });
});
