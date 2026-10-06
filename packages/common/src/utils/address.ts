import { getAddress, isAddress } from 'viem';

/** Validate and checksum an EVM address */
export function validateEvmAddress(address: string): string | null {
  if (!isAddress(address)) return null;
  return getAddress(address);
}

/** Validate a Solana base58 address (basic check) */
export function validateSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

/** Truncate address for display: 0x1234...abcd */
export function truncateAddress(address: string, start = 6, end = 4): string {
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

/** Validate address based on chain */
export function validateAddress(
  chain: 'base' | 'solana',
  address: string,
): { valid: boolean; normalized: string | null } {
  if (chain === 'base') {
    const checksummed = validateEvmAddress(address);
    return { valid: checksummed !== null, normalized: checksummed };
  }
  const valid = validateSolanaAddress(address);
  return { valid, normalized: valid ? address : null };
}

/**
 * Near-zero addresses: precompiles, 0x…0001 test checks. Real reports exist for
 * them, but nobody pays or hires one, so they are refused as check targets and
 * kept out of public listings. One pattern for JS and SQL (Postgres `~*`).
 */
export const PLACEHOLDER_ADDRESS_PATTERN = '^0x0{30,}[0-9a-f]{0,10}$';
const PLACEHOLDER_ADDRESS_RE = new RegExp(PLACEHOLDER_ADDRESS_PATTERN, 'i');

export function isPlaceholderAddress(value: string): boolean {
  return PLACEHOLDER_ADDRESS_RE.test(value);
}
