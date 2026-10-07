/**
 * The pay-with-wallet flow as a pure state machine. The only way into `paying`
 * is a `pay` event from the confirm step (`ready`), which a click sends; nothing
 * the wallet does (connecting, reconnecting, switching account) can start a
 * payment, and `paying` ignores everything but its own outcome.
 */
import type { PayOutcome } from '@/lib/x402Pay';

export type PayState =
  | { step: 'idle' }
  /** The wallet stack is loading (first click on the page). */
  | { step: 'loading' }
  /** No wallet connected: the connect modal is up. */
  | { step: 'connect' }
  /** Connected: price and terms shown, waiting for the pay click. */
  | { step: 'ready'; account: string }
  | { step: 'paying'; account: string }
  | { step: 'done'; data: unknown; transaction: string | null }
  /** `charged: 'unknown'` when the paid request broke off and the API may have settled. */
  | { step: 'error'; message: string; charged: false | 'unknown'; account: string };

export type PayEvent =
  | { type: 'open' }
  | { type: 'loaded'; account: string | null }
  | { type: 'connected'; account: string }
  | { type: 'disconnected' }
  | { type: 'pay' }
  | { type: 'paid'; data: unknown; transaction: string | null }
  | { type: 'failed'; message: string; charged: false | 'unknown' }
  | { type: 'retry' }
  | { type: 'close' };

export const INITIAL: PayState = { step: 'idle' };

export function payReducer(state: PayState, event: PayEvent): PayState {
  if (state.step === 'paying') {
    if (event.type === 'paid') return { step: 'done', data: event.data, transaction: event.transaction };
    if (event.type === 'failed') return { step: 'error', message: event.message, charged: event.charged, account: state.account };
    return state;
  }
  if (event.type === 'close') return state.step === 'idle' ? state : INITIAL;

  switch (state.step) {
    case 'idle':
      return event.type === 'open' ? { step: 'loading' } : state;
    case 'loading':
      if (event.type !== 'loaded') return state;
      return event.account ? { step: 'ready', account: event.account } : { step: 'connect' };
    case 'connect':
      return event.type === 'connected' ? { step: 'ready', account: event.account } : state;
    case 'ready':
      if (event.type === 'pay') return { step: 'paying', account: state.account };
      if (event.type === 'connected') return event.account === state.account ? state : { step: 'ready', account: event.account };
      if (event.type === 'disconnected') return { step: 'connect' };
      return state;
    case 'error':
      return event.type === 'retry' ? { step: 'ready', account: state.account } : state;
    default:
      return state;
  }
}

/** The event a finished payment attempt sends. */
export function outcomeEvent(outcome: PayOutcome): PayEvent {
  switch (outcome.kind) {
    case 'paid':
      return { type: 'paid', data: outcome.data, transaction: outcome.transaction };
    case 'refused':
    case 'failed':
      return { type: 'failed', message: outcome.message, charged: false };
    case 'cancelled':
      return { type: 'failed', message: 'Signature cancelled.', charged: false };
    case 'interrupted':
      return { type: 'failed', message: 'The connection dropped after the payment was sent.', charged: 'unknown' };
  }
}
