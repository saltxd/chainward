import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalBytes, fromHex, toHex } from '../lib/near/canonical.js';
import { keyPairFromSeed, signBytes, verifyBytes } from '../lib/near/sign.js';
import { DOMAIN, VERSION, type PaymentAuth } from '../lib/near/types.js';
import { validate } from '../lib/near/validate.js';

// The NEAR guard contract verifies ChainWard's signature over canonical bytes
// that saltxd/near-payment-guard specifies. lib/near/ is a vendored copy of that
// repo's TypeScript signer; this file is a byte-for-byte copy of its shared
// vectors/canonical-vectors.json, which its Rust verifier (the code the contract
// runs) is tested against too. If any vector disagrees, the route would sign
// bytes the contract does not check, so a signed Pay would be refused or worse.

interface AuthJson {
  guard_id: string;
  deposit_address: string;
  destination: string;
  chain: string;
  amount: string;
  verdict: string;
  reason: string;
  issued_at: string;
  quote_expiry: string;
  nonce: string;
}

interface VectorFile {
  version: number;
  domain: string;
  test_signer: { seed_phrase: string; public_key_hex: string };
  encoding: Array<{ name: string; auth: AuthJson; canonical_hex: string; canonical_len: number; canonical_sha256: string }>;
  distinctness: Array<{ name: string; a: AuthJson; b: AuthJson }>;
  verification: Array<{ name: string; message_hex: string; public_key_hex: string; signature_hex: string; expect_valid: boolean }>;
  validation: Array<{ name: string; auth: AuthJson; expect_failure: string | null }>;
  differential: { account_id: Array<[string, boolean]>; deposit_address: Array<[string, boolean]> };
}

const vectors = JSON.parse(readFileSync(new URL('./fixtures/near/canonical-vectors.json', import.meta.url), 'utf8')) as VectorFile;

const toAuth = (json: AuthJson): PaymentAuth => ({
  guardId: json.guard_id,
  depositAddress: json.deposit_address,
  destination: json.destination,
  chain: json.chain as PaymentAuth['chain'],
  amount: BigInt(json.amount),
  verdict: json.verdict as PaymentAuth['verdict'],
  reason: json.reason,
  issuedAt: BigInt(json.issued_at),
  quoteExpiry: BigInt(json.quote_expiry),
  nonce: BigInt(json.nonce),
});

describe('the vendored NEAR guard encoder, against the guard repo vectors', () => {
  it('declares the same domain and version', () => {
    expect(vectors.domain).toBe(DOMAIN);
    expect(vectors.version).toBe(VERSION);
  });

  it('has every family populated (a truncated copy would pass vacuously)', () => {
    expect(vectors.encoding.length).toBeGreaterThanOrEqual(15);
    expect(vectors.distinctness.length).toBeGreaterThanOrEqual(10);
    expect(vectors.verification.length).toBeGreaterThanOrEqual(15);
    expect(vectors.validation.length).toBeGreaterThanOrEqual(30);
    expect(vectors.differential.account_id.length).toBeGreaterThanOrEqual(1000);
  });

  it.each(vectors.encoding.map((v) => [v.name, v] as const))('encodes %s byte for byte', (_name, vector) => {
    const bytes = canonicalBytes(toAuth(vector.auth));
    expect(toHex(bytes)).toBe(vector.canonical_hex);
    expect(bytes.length).toBe(vector.canonical_len);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(vector.canonical_sha256);
  });

  it.each(vectors.distinctness.map((v) => [v.name, v] as const))('keeps %s distinct', (_name, vector) => {
    expect(toHex(canonicalBytes(toAuth(vector.a)))).not.toBe(toHex(canonicalBytes(toAuth(vector.b))));
  });

  it.each(vectors.verification.map((v) => [v.name, v] as const))('verifies %s as the guard does', (_name, vector) => {
    expect(verifyBytes(fromHex(vector.message_hex), fromHex(vector.signature_hex), fromHex(vector.public_key_hex))).toBe(vector.expect_valid);
  });

  it('reproduces the vectors signature from their throwaway seed phrase (ed25519 is deterministic)', () => {
    const signer = keyPairFromSeed(new Uint8Array(createHash('sha256').update(vectors.test_signer.seed_phrase, 'utf8').digest()));
    expect(toHex(signer.publicKeyBytes)).toBe(vectors.test_signer.public_key_hex);
    const valid = vectors.verification.find((v) => v.name === 'valid-signature')!;
    expect(toHex(signBytes(fromHex(valid.message_hex), signer.privateKey))).toBe(valid.signature_hex);
  });

  it.each(vectors.validation.map((v) => [v.name, v] as const))('validates %s with the same reason', (_name, vector) => {
    expect(validate(toAuth(vector.auth))).toBe(vector.expect_failure);
  });

  it('agrees on every enumerated account id and deposit address', () => {
    const base = toAuth(vectors.encoding[0]!.auth);
    for (const [value, expected] of vectors.differential.account_id) {
      expect(validate({ ...base, guardId: value }) === null, `account id ${JSON.stringify(value)}`).toBe(expected);
    }
    for (const [value, expected] of vectors.differential.deposit_address) {
      expect(validate({ ...base, depositAddress: value }) === null, `deposit address ${JSON.stringify(value)}`).toBe(expected);
    }
  });
});
