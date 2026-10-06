import { describe, expect, it } from 'vitest';
import { isPlaceholderAddress } from '../params';

describe('isPlaceholderAddress', () => {
  it('treats near-zero addresses (precompiles, 0x…0001 test checks) as placeholders', () => {
    expect(isPlaceholderAddress('0x0000000000000000000000000000000000000001')).toBe(true);
    expect(isPlaceholderAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    expect(isPlaceholderAddress('0x00000000000000000000000000000000000000ff')).toBe(true);
  });

  it('keeps real wallets, including vanity ones with a few leading zeros', () => {
    expect(isPlaceholderAddress('0x4baadba26c3c0bdef9e8faf173925d463aa53bb2')).toBe(false);
    expect(isPlaceholderAddress('0x0000000000a1b2c3d4e5f60718293a4b5c6d7e8f')).toBe(false);
    expect(isPlaceholderAddress('0x000000000000d1a1e0c8f0e3a2b4c5d6e7f8a9b0')).toBe(false);
  });
});
