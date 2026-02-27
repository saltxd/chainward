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
