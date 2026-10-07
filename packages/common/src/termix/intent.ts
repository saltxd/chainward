// ─── TermiX tx-intents: what an unattended provider key will sign ─────────────
//
// The backend ABI-encodes every on-chain step and hands back an unsigned
// intent. A provider worker signs these with a hot key, so it checks each one
// against what it asked for before signing: the right chain, one of the
// configured escrows, zero value, the expected function, and this order's id as
// the only argument (plus the delivery hash for submitDelivery). Anything else,
// an ERC-20 approve included, is refused.

import { toFunctionSelector } from 'viem';
import type { TermixContractsConfig } from './client.js';

export type TermixProviderAction = 'acceptOrder' | 'submitDelivery' | 'claimAfterTimeout';

/** Selectors on TermixEscrow (verified against BSC mainnet calls, 2026-10-07). */
export const TERMIX_SELECTORS: Record<TermixProviderAction, `0x${string}`> = {
  acceptOrder: toFunctionSelector('acceptOrder(bytes32)'),
  submitDelivery: toFunctionSelector('submitDelivery(bytes32,bytes32)'),
  claimAfterTimeout: toFunctionSelector('claimAfterTimeout(bytes32)'),
};

/** bytes32 arguments after the selector. */
const ARG_WORDS: Record<TermixProviderAction, number> = { acceptOrder: 1, submitDelivery: 2, claimAfterTimeout: 1 };

/**
 * Gas used by each call on the BSC escrows (median of 50 mainnet calls,
 * 2026-10-07). claimAfterTimeout was not observed; it settles like
 * releaseEscrow (148,022), so that figure stands in for it.
 */
export const TERMIX_MEASURED_GAS: Record<TermixProviderAction, bigint> = {
  acceptOrder: 86_882n,
  submitDelivery: 79_064n,
  claimAfterTimeout: 148_022n,
};

export interface TermixTxIntent {
  action?: string;
  chainId?: number | string;
  contract?: string;
  to?: string;
  callData?: string;
  data?: string;
  value?: string | number;
  nonceKey?: string;
  status?: string;
}

export interface CheckedIntent {
  to: `0x${string}`;
  data: `0x${string}`;
}

export class TermixIntentError extends Error {
  constructor(message: string) {
    super(`refusing TermiX tx-intent: ${message}`);
    this.name = 'TermixIntentError';
  }
}

function isZero(value: string | number): boolean {
  try {
    return BigInt(value) === 0n;
  } catch {
    return false;
  }
}

/** Every escrow in the live config (one per settlement currency). */
export function termixEscrows(config: Pick<TermixContractsConfig, 'settlementCurrencies'>): string[] {
  return config.settlementCurrencies.map((c) => c.contracts.escrow);
}

export function checkProviderIntent(
  intent: TermixTxIntent,
  expected: { action: TermixProviderAction; chainId: number; escrows: string[]; chainOrderId: string },
): CheckedIntent {
  if (intent.action !== undefined && intent.action !== expected.action) {
    throw new TermixIntentError(`asked for ${expected.action}, got ${intent.action}`);
  }
  if (Number(intent.chainId) !== expected.chainId) {
    throw new TermixIntentError(`chainId ${String(intent.chainId)} is not ${expected.chainId}`);
  }
  const to = intent.contract ?? intent.to;
  const escrow = expected.escrows.find((e) => e.toLowerCase() === to?.toLowerCase());
  if (!to || !escrow) throw new TermixIntentError(`${String(to)} is not a configured TermiX escrow`);
  if (intent.value !== undefined && !isZero(intent.value)) throw new TermixIntentError('non-zero value');

  const data = (intent.callData ?? intent.data ?? '').toLowerCase();
  const selector = TERMIX_SELECTORS[expected.action];
  if (!data.startsWith(selector)) throw new TermixIntentError(`calldata is not ${expected.action}`);
  if (!/^0x[0-9a-f]*$/.test(data) || data.length !== 10 + 64 * ARG_WORDS[expected.action]) {
    throw new TermixIntentError(`calldata length does not fit ${expected.action}`);
  }
  const orderArg = `0x${data.slice(10, 74)}`;
  if (orderArg !== expected.chainOrderId.toLowerCase()) throw new TermixIntentError('calldata names another order');
  return { to: escrow as `0x${string}`, data: data as `0x${string}` };
}
