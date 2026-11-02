/**
 * Types for the payment authorization that ChainWard signs and the NEAR guard verifies.
 *
 * VENDORED from saltxd/near-payment-guard ts/src/types.ts (commit 1341b48). The files in
 * this folder are that repo's TypeScript signer, copied here so the API needs no new
 * workspace package; only the import extensions differ. Do not edit them in place: a
 * change to the canonical bytes is a change to the contract. Re-vendor, then refresh
 * __tests__/fixtures/near/canonical-vectors.json from the guard repo's vectors/.
 *
 * Integers are carried as `bigint`, never `number`: `amount` and `nonce` are u128, and
 * `issued_at` and `quote_expiry` are u64, which `number` cannot hold above 2^53.
 */

export type Chain = 'base' | 'bsc';

export type VerdictLabel = 'pay' | 'hold' | 'unknown';

/** A payment authorization, in the field order the canonical encoding uses. */
export interface PaymentAuth {
  /** NEAR account id of the guard contract this authorization is for. */
  readonly guardId: string;
  /** The only address the guard will pay. */
  readonly depositAddress: string;
  /** Lowercase 0x-prefixed EVM address the money must surface at. */
  readonly destination: string;
  readonly chain: Chain;
  /** Exact amount this authorization covers, in the asset's smallest unit. u128. */
  readonly amount: bigint;
  readonly verdict: VerdictLabel;
  /** The one fact the verdict rests on. May be empty. */
  readonly reason: string;
  /** Unix seconds when ChainWard signed. u64. */
  readonly issuedAt: bigint;
  /** Unix seconds, the 1Click quote deadline. u64. */
  readonly quoteExpiry: bigint;
  /** Replay protection. u128. */
  readonly nonce: bigint;
}

/**
 * Stable machine-readable reasons a `PaymentAuth` fails shape validation. The strings are
 * part of the guard's spec (the contract echoes them), so they are never renamed here.
 */
export type ValidationFailure =
  | 'guard_id_invalid'
  | 'deposit_address_invalid'
  | 'destination_invalid'
  | 'chain_invalid'
  | 'verdict_invalid'
  | 'reason_invalid';

export const DOMAIN = 'chainward.near-payment-guard.auth';
export const VERSION = 1;

/** Field length bounds, in UTF-8 bytes. */
export const LIMITS = {
  guardIdMin: 2,
  guardIdMax: 64,
  depositAddressMin: 1,
  depositAddressMax: 128,
  reasonMax: 256,
} as const;
