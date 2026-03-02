/**
 * Spam token detection for Base chain.
 * Filters known scam airdrops and tokens with suspicious naming patterns.
 */

/** Known spam/scam token contract addresses on Base (lowercased) */
export const SPAM_TOKENS: Set<string> = new Set([
  '0x1b7a3aadd3a0007986e3ff1f07005e6b4e1dbe50', // SDO scam
  '0x66caf5b9d0a96489918cea7d888c7748bd052e6e', // SDO variant
  '0xea7e17526ccce09f38b472dac3b4fcdfff100c39', // t.me/US_POOL spam
  '0x3f4132119c2d97fc24b2f4da3a439f1d866b27b0', // t.me/US_POOL spam
  '0xc9d8cd393292cfebc6729200316416953a9b7928', // Unicode lookalike (ꓴꓢꓓС)
  '0x5498a94e085ac1c0f46601247157760ffab981b4', // NFT spam airdrop
  '0x04964cee94c862b6d0d5aa77cb8a60bdff338699', // NoLimit spam
  '0x32b98fac63535b7670584a1ded619159920b7d4b', // CWB spam
  '0x6e5218d93e173717c328cb4ea7dfa2ac0f224787', // NOVA spam
  '0x8ea408a1a64a3d5fef1700da455e455549feeb07', // WCHAN spam
  '0x3744974d674fafb675095fe1249887fe76d3677c', // USA spam
  '0x08979d848edbf470277d6757d171907cc161a4b5', // Fake Tether USD
]);

/** Legitimate token addresses on Base (lowercased) — never flagged as spam */
export const KNOWN_TOKENS: Set<string> = new Set([
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', // USDT (real)
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI
  '0x4200000000000000000000000000000000000006', // WETH
  '0x4ed4e862860bed51a9570b96d89af5e1b0efefed', // DEGEN
  '0x1111111111166b7fe7bd91427724b487980afc69', // ZORA
  '0x242d45a48bcfdb6d7dd9a7733569a906c25facf3', // X402T
]);

/** Name/symbol patterns commonly used by scam tokens */
const SPAM_NAME_PATTERNS = [
  /claim.*at/i,
  /claim\s+until/i,
  /visit.*\.(com|io|xyz|net)/i,
  /airdrop.*free/i,
  /free.*claim/i,
  /t\.me\//i,
  /\.(com|io|xyz|net)$/i,
];

/** Check if a token is likely spam based on address and metadata */
export function isSpamToken(
  address: string,
  name?: string | null,
  symbol?: string | null,
): boolean {
  const lower = address.toLowerCase();
  if (KNOWN_TOKENS.has(lower)) return false;
  if (SPAM_TOKENS.has(lower)) return true;

  const text = `${name ?? ''} ${symbol ?? ''}`;

  // Check name/symbol patterns
  if (SPAM_NAME_PATTERNS.some((p) => p.test(text))) return true;

  // Non-ASCII characters in symbol suggest lookalike spam
  if (symbol && /[^\x20-\x7E]/.test(symbol)) return true;

  return false;
}
