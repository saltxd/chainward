/**
 * The canonical byte encoding of a payment authorization: the exact bytes ChainWard signs
 * and the guard contract verifies with env::ed25519_verify.
 *
 * VENDORED from saltxd/near-payment-guard ts/src/canonical.ts (commit 1341b48); see
 * types.ts. The encoder does not validate and does not transform: call validate()
 * separately, before signing.
 */

import { DOMAIN, VERSION, type PaymentAuth } from './types.js';

const U32_MAX = 0xffffffffn;
export const U64_MAX = 2n ** 64n - 1n;
export const U128_MAX = 2n ** 128n - 1n;

/** Encodes an unsigned integer as `width` big-endian bytes. Refuses out-of-range values. */
const uint = (value: bigint, width: number, label: string): Uint8Array => {
  const max = (1n << BigInt(width * 8)) - 1n;
  if (value < 0n || value > max) {
    throw new RangeError(`${label} out of range: ${value} does not fit in ${label}`);
  }
  const out = new Uint8Array(width);
  let rest = value;
  for (let i = width - 1; i >= 0; i -= 1) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
};

const u8 = (value: number): Uint8Array => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`u8 out of range: ${value}`);
  }
  return Uint8Array.of(value);
};

const u32 = (value: bigint): Uint8Array => uint(value, 4, 'u32');
const u64 = (value: bigint): Uint8Array => uint(value, 8, 'u64');
const u128 = (value: bigint): Uint8Array => uint(value, 16, 'u128');

const UTF8 = new TextEncoder();

/**
 * `str(s)` = u32(utf8 byte length) || utf8 bytes. The length is the UTF-8 BYTE count,
 * deliberately not `s.length`, which counts UTF-16 code units.
 */
const str = (value: string): Uint8Array => {
  const bytes = UTF8.encode(value);
  if (BigInt(bytes.length) > U32_MAX) {
    throw new RangeError('string too long to length-prefix');
  }
  return concat([u32(BigInt(bytes.length)), bytes]);
};

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

/** Produces the exact bytes that get signed and verified. Field order is part of the spec. */
export const canonicalBytes = (auth: PaymentAuth): Uint8Array =>
  concat([
    str(DOMAIN),
    u8(VERSION),
    str(auth.guardId),
    str(auth.depositAddress),
    str(auth.destination),
    str(auth.chain),
    u128(auth.amount),
    str(auth.verdict),
    str(auth.reason),
    u64(auth.issuedAt),
    u64(auth.quoteExpiry),
    u128(auth.nonce),
  ]);

export const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

export const fromHex = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/.test(hex)) {
    throw new TypeError('expected an even-length lowercase hex string');
  }
  return new Uint8Array(Buffer.from(hex, 'hex'));
};
