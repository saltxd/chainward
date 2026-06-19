import { describe, it, expect } from 'vitest';
import {
  validateEvmAddress,
  validateSolanaAddress,
  truncateAddress,
  validateAddress,
} from '../utils/address.js';

const EVM = '0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825';
const SOL = 'So11111111111111111111111111111111111111112';

describe('validateEvmAddress', () => {
  it('checksums a valid lowercase address', () => {
    expect(validateEvmAddress(EVM.toLowerCase())).toBe(EVM);
  });

  it('returns null for non-addresses', () => {
    expect(validateEvmAddress('not-an-address')).toBeNull();
    expect(validateEvmAddress('0x123')).toBeNull();
  });
});

describe('validateSolanaAddress', () => {
  it('accepts a base58 address of valid length', () => {
    expect(validateSolanaAddress(SOL)).toBe(true);
  });

  it('rejects too-short strings and excluded base58 chars', () => {
    expect(validateSolanaAddress('abc')).toBe(false);
    expect(validateSolanaAddress('0OIl' + '1'.repeat(30))).toBe(false);
  });
});

describe('truncateAddress', () => {
  it('truncates long addresses with defaults', () => {
    expect(truncateAddress(EVM)).toBe('0x4F9F...A825');
  });

  it('leaves short strings untouched', () => {
    expect(truncateAddress('0x1234')).toBe('0x1234');
  });
});

describe('validateAddress', () => {
  it('validates and normalizes base addresses', () => {
    expect(validateAddress('base', EVM.toLowerCase())).toEqual({ valid: true, normalized: EVM });
    expect(validateAddress('base', 'nope')).toEqual({ valid: false, normalized: null });
  });

  it('validates solana addresses', () => {
    expect(validateAddress('solana', SOL)).toEqual({ valid: true, normalized: SOL });
    expect(validateAddress('solana', 'bad')).toEqual({ valid: false, normalized: null });
  });
});
