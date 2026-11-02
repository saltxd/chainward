import { logger } from '../logger.js';
import { keyPairFromSeed, type SignerKeyPair } from './sign.js';
import { LIMITS } from './types.js';

// ChainWard's side of the NEAR payment guard: the key its verdicts are signed with,
// and the one rule ChainWard adds to a verdict before signing it (the reason must fit
// the guard's 256-byte, control-free field). The canonical bytes themselves are the
// vendored files next to this one.

/** The k8s secret key (chainward-secrets) the API reads the signing key from. */
export const SIGNING_KEY_ENV = 'NEAR_VERDICT_SIGNING_KEY';

/** A raw 32-byte ed25519 seed, as `openssl rand -hex 32` prints one. */
const SEED_HEX = /^[0-9a-fA-F]{64}$/;

let memo: { raw: string; signer: SignerKeyPair | null } | undefined;

/**
 * The verdict signing key, or null when NEAR_VERDICT_SIGNING_KEY is unset or malformed.
 * Null means the NEAR routes answer 503 and sign nothing. The key only ever comes from the
 * environment (a k8s secret in production) and is never logged or returned.
 */
export function verdictSigner(): SignerKeyPair | null {
  const raw = (process.env[SIGNING_KEY_ENV] ?? '').trim();
  if (memo?.raw === raw) return memo.signer;
  let signer: SignerKeyPair | null = null;
  if (SEED_HEX.test(raw)) {
    signer = keyPairFromSeed(new Uint8Array(Buffer.from(raw, 'hex')));
  } else if (raw) {
    logger.error(`${SIGNING_KEY_ENV} is set but is not a 32-byte seed in 64 hex characters; NEAR verdict signing stays off`);
  }
  memo = { raw, signer };
  return signer;
}

const ELLIPSIS = '…';

/** C0, DEL and C1 controls (which the guard refuses), and lone surrogates (which JSON parsers refuse). */
function unsafe(code: number): boolean {
  return code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f) || (code >= 0xd800 && code <= 0xdfff);
}

/**
 * A verdict reason the guard accepts: control characters become spaces, whitespace runs
 * collapse, and anything over 256 UTF-8 bytes is cut on a character boundary with an
 * ellipsis. Our reasons are one sentence, so this only bites on a long label or flag.
 */
export function fitReason(text: string): string {
  let clean = '';
  for (const ch of text) clean += unsafe(ch.codePointAt(0) ?? 0) ? ' ' : ch;
  clean = clean.replace(/\s+/g, ' ').trim();
  if (Buffer.byteLength(clean, 'utf8') <= LIMITS.reasonMax) return clean;
  const budget = LIMITS.reasonMax - Buffer.byteLength(ELLIPSIS, 'utf8');
  let out = '';
  let used = 0;
  for (const ch of clean) {
    const size = Buffer.byteLength(ch, 'utf8');
    if (used + size > budget) break;
    out += ch;
    used += size;
  }
  return `${out.trimEnd()}${ELLIPSIS}`;
}
