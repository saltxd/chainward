import { describe, it, expect } from 'vitest';
import {
  validateEvmAddress,
  validateSolanaAddress,
  truncateAddress,
  validateAddress,
  isPlaceholderAddress,
  PLACEHOLDER_ADDRESS_PATTERN,
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

describe('isPlaceholderAddress', () => {
  it('treats near-zero addresses (precompiles, 0x…0001 test checks) as placeholders', () => {
    expect(isPlaceholderAddress('0x0000000000000000000000000000000000000001')).toBe(true);
    expect(isPlaceholderAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    expect(isPlaceholderAddress('0x00000000000000000000000000000000000000FF')).toBe(true);
  });

  it('keeps real wallets, including vanity ones with a few leading zeros', () => {
    expect(isPlaceholderAddress('0x4baadba26c3c0bdef9e8faf173925d463aa53bb2')).toBe(false);
    expect(isPlaceholderAddress('0x0000000000a1b2c3d4e5f60718293a4b5c6d7e8f')).toBe(false);
    expect(isPlaceholderAddress('0x000000000000d1a1e0c8f0e3a2b4c5d6e7f8a9b0')).toBe(false);
  });

  it('is the same rule as the pattern the API filters the report library with', () => {
    const re = new RegExp(PLACEHOLDER_ADDRESS_PATTERN, 'i');
    expect(re.test('0x0000000000000000000000000000000000000001')).toBe(true);
    expect(re.test('0x0000000000a1b2c3d4e5f60718293a4b5c6d7e8f')).toBe(false);
  });
});
