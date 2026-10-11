import { ApiError } from './api';

/**
 * Confirming an in-browser USDC payment (a dataset at /paid/<slug>, an Intel
 * Brief order at /request-brief). The wallet's own transfer is the only thing
 * that moves money; everything here re-asks our API to verify a transaction
 * that already exists, so retrying is always safe.
 *
 * The API reads receipts from our own Base node. A transfer the wallet just
 * broadcast can take a while to show up there, so "not found yet" means wait,
 * not fail. The old loop gave up after ~60s, dropped the hash, and left a buyer
 * who had paid with nothing on screen.
 */

export type PaymentProduct = 'dataset' | 'brief';

/** Where one payment stands, as the checkout shows it. */
export type ConfirmPhase = 'idle' | 'waiting' | 'confirmed' | 'failed' | 'signin' | 'timeout';

export const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const TX_IN_URL_RE = /\/tx\/(0x[0-9a-fA-F]{64})(?:[/?#]|$)/;

/** A transaction hash from what a buyer pasted (bare hash or a BaseScan link), lowercased; null if neither. */
export function parseTxHash(input: string): string | null {
  const s = input.trim();
  if (TX_HASH_RE.test(s)) return s.toLowerCase();
  const fromUrl = TX_IN_URL_RE.exec(s)?.[1];
  return fromUrl ? fromUrl.toLowerCase() : null;
}

/** Keep confirming this long before showing the "still waiting" state. */
export const CONFIRM_WINDOW_MS = 10 * 60_000;

/**
 * Wait before the next check, after `attempt` failed checks (0-based): 4s, 6s,
 * 9s, ... capped at 30s. Six checks in the first minute keeps a buyer under the
 * claim endpoint's 10-a-minute rate limit.
 */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000, Math.round(4000 * 1.5 ** attempt));
}

export type ClaimErrorOutcome =
  | { kind: 'retry' }
  | { kind: 'final'; message: string }
  | { kind: 'signin'; message: string };

const CONTACT = 'hello@chainward.ai';

const FINAL_MESSAGES: Record<string, Record<PaymentProduct, string>> = {
  INVALID_PAYMENT: {
    dataset:
      "This transaction doesn't include a payment of the full price in USDC to ChainWard on Base. Check the amount and the address it was sent to.",
    brief:
      "This transaction doesn't include a payment of the order price in USDC to ChainWard from the wallet you signed in with. Check the amount, the address it was sent to, and which wallet paid.",
  },
  TX_FAILED: {
    dataset: 'This transaction failed on Base, so no USDC was sent. You can start over and pay again.',
    brief: 'This transaction failed on Base, so no USDC was sent. You can start over and pay again.',
  },
  PAYMENT_TOO_OLD: {
    dataset: "This transaction was sent before this file went on sale, so it can't pay for it.",
    brief: "This transaction was sent before this order was placed, so it can't pay for it.",
  },
  PAYMENT_BEFORE_ORDER: {
    dataset: "This transaction was sent before this file went on sale, so it can't pay for it.",
    brief: "This transaction was sent before this order was placed, so it can't pay for it.",
  },
  PAYMENT_ALREADY_USED: {
    dataset: `This transaction has already been used to unlock a file. If you paid and don't have your download, email ${CONTACT} with this transaction hash.`,
    brief: `This transaction already paid for a different order. If that's a mistake, email ${CONTACT} with this transaction hash.`,
  },
  ORDER_NOT_FOUND: {
    dataset: `We couldn't find this order. Email ${CONTACT} with this transaction hash.`,
    brief: "We couldn't find this order under the wallet you're signed in with. Sign in with the wallet that placed it.",
  },
  ORDER_NOT_PAYABLE: {
    dataset: `This order can't take a payment any more. Email ${CONTACT} with this transaction hash.`,
    brief: `This order can't take a payment any more. Email ${CONTACT} with this transaction hash.`,
  },
  NOT_FOUND: {
    dataset: `This file is no longer for sale. Email ${CONTACT} with this transaction hash.`,
    brief: `We couldn't find this order. Email ${CONTACT} with this transaction hash.`,
  },
  VALIDATION_ERROR: {
    dataset: "That doesn't look like a Base transaction hash.",
    brief: "That doesn't look like a Base transaction hash.",
  },
};

const SIGNIN_CODES = new Set(['UNAUTHORIZED', 'USER_NOT_FOUND', 'INVALID_API_KEY']);
const SIGNIN_MESSAGE =
  "Your sign-in expired. Sign in again with the wallet you paid from and we'll finish confirming. Your transaction is saved.";

/**
 * What to do after a failed check. Only answers that can never change (wrong
 * amount, wrong recipient, already used, reverted) stop the loop. Everything
 * else, including network trouble, rate limits, server errors and codes this
 * build doesn't know, keeps waiting: a retry only re-verifies.
 */
export function classifyClaimError(err: unknown, product: PaymentProduct): ClaimErrorOutcome {
  if (!(err instanceof ApiError)) return { kind: 'retry' };
  const final = FINAL_MESSAGES[err.code]?.[product];
  if (final) return { kind: 'final', message: final };
  if (SIGNIN_CODES.has(err.code)) return { kind: 'signin', message: SIGNIN_MESSAGE };
  return { kind: 'retry' };
}

export type ConfirmResult<T> =
  | { status: 'confirmed'; value: T }
  | { status: 'failed'; message: string }
  | { status: 'signin'; message: string }
  | { status: 'timeout' }
  | { status: 'aborted' };

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done);
  });
}

/**
 * Ask the API to verify one transaction until it answers yes, answers a final
 * no, or the window runs out. `confirm` is the only side effect, and it only
 * verifies; nothing here can send a second payment.
 */
export async function confirmWithRetry<T>(opts: {
  confirm: () => Promise<T>;
  classify: (err: unknown) => ClaimErrorOutcome;
  signal?: AbortSignal;
  windowMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): Promise<ConfirmResult<T>> {
  const { confirm, classify, signal, windowMs = CONFIRM_WINDOW_MS, now = Date.now, sleep = abortableSleep } = opts;
  const started = now();
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) return { status: 'aborted' };
    try {
      // A yes is returned even if the run was cancelled meanwhile: the API has
      // recorded the claim and answers "already used" to the same hash next time.
      return { status: 'confirmed', value: await confirm() };
    } catch (err) {
      if (signal?.aborted) return { status: 'aborted' };
      const outcome = classify(err);
      if (outcome.kind === 'final') return { status: 'failed', message: outcome.message };
      if (outcome.kind === 'signin') return { status: 'signin', message: outcome.message };
      const delay = retryDelayMs(attempt);
      if (now() - started + delay > windowMs) return { status: 'timeout' };
      await sleep(delay, signal);
    }
  }
}

/** What to tell a buyer when the wallet itself refused or failed to send. */
export function walletErrorMessage(err: unknown): string {
  const short = (err as { shortMessage?: unknown })?.shortMessage;
  const raw = typeof short === 'string' && short ? short : err instanceof Error ? err.message : '';
  if (/user (rejected|denied)|rejected the request|cancel/i.test(raw)) {
    return 'You cancelled the payment in your wallet. Nothing was sent.';
  }
  const reason = raw ? (raw.length > 140 ? `${raw.slice(0, 140)}…` : raw).replace(/\.$/, '') : 'unknown error';
  return `Your wallet couldn't send the payment (${reason}). If your wallet shows it went through anyway, paste its transaction hash below.`;
}
