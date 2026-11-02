/**
 * ed25519 signing and verification over the canonical bytes, on Node's built-in crypto.
 * The message is NOT pre-hashed: ed25519 hashes internally (RFC 8032).
 *
 * VENDORED from saltxd/near-payment-guard ts/src/sign.ts (commit 1341b48), minus its
 * seed-phrase test-key helper, which has no place in a service that signs. See types.ts.
 */

import { createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify, type KeyObject } from 'node:crypto';
import { canonicalBytes } from './canonical.js';
import type { PaymentAuth } from './types.js';
import { assertValid } from './validate.js';

/** DER prefix for a PKCS#8-wrapped Ed25519 private key, followed by the 32-byte seed. */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** DER prefix for an SPKI-wrapped Ed25519 public key, followed by the 32-byte point. */
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface SignerKeyPair {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  /** The raw 32-byte public key, which is what the contract stores. */
  readonly publicKeyBytes: Uint8Array;
}

/** Builds a key pair from a raw 32-byte ed25519 seed. */
export const keyPairFromSeed = (seed: Uint8Array): SignerKeyPair => {
  if (seed.length !== 32) {
    throw new RangeError(`ed25519 seed must be 32 bytes, got ${seed.length}`);
  }
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seed)]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = createPublicKey(privateKey);
  const publicKeyBytes = new Uint8Array(publicKey.export({ format: 'der', type: 'spki' }).subarray(SPKI_ED25519_PREFIX.length));
  return { privateKey, publicKey, publicKeyBytes };
};

/** Rebuilds a verifying key from the raw 32 bytes the contract stores. */
export const publicKeyFromBytes = (publicKeyBytes: Uint8Array): KeyObject => {
  if (publicKeyBytes.length !== 32) {
    throw new RangeError(`ed25519 public key must be 32 bytes, got ${publicKeyBytes.length}`);
  }
  return createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(publicKeyBytes)]),
    format: 'der',
    type: 'spki',
  });
};

/** Signs raw bytes. Prefer signAuth, which validates first. */
export const signBytes = (message: Uint8Array, privateKey: KeyObject): Uint8Array => new Uint8Array(nodeSign(null, Buffer.from(message), privateKey));

/** Verifies a signature over raw bytes. Never throws; a malformed input is `false`. */
export const verifyBytes = (message: Uint8Array, signature: Uint8Array, publicKey: KeyObject | Uint8Array): boolean => {
  try {
    const key = publicKey instanceof Uint8Array ? publicKeyFromBytes(publicKey) : publicKey;
    return nodeVerify(null, Buffer.from(message), key, Buffer.from(signature));
  } catch {
    return false;
  }
};

/**
 * Validates, encodes and signs a payment authorization. Validation is not optional:
 * a signature over a shape-invalid authorization is one the contract must refuse.
 */
export const signAuth = (auth: PaymentAuth, privateKey: KeyObject): Uint8Array => {
  assertValid(auth);
  return signBytes(canonicalBytes(auth), privateKey);
};

/** Verifies a signature over an authorization, re-encoding it rather than trusting bytes. */
export const verifyAuth = (auth: PaymentAuth, signature: Uint8Array, publicKey: KeyObject | Uint8Array): boolean => {
  if (signature.length !== 64) return false;
  return verifyBytes(canonicalBytes(auth), signature, publicKey);
};
