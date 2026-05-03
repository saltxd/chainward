import { describe, it, expect } from 'vitest';
import { classifyWallet, isVirtualsFactoryProxy } from '../src/wallet-arch.js';

const VIRTUALS_FACTORY_PROXY_BYTECODE_PREFIX = '0x363d3d373d3d363d7f';

describe('classifyWallet', () => {
  it('classifies a Virtuals factory ERC-1967 proxy as erc1967_proxy', () => {
    const result = classifyWallet({
      code: VIRTUALS_FACTORY_PROXY_BYTECODE_PREFIX + '360894' + '1'.repeat(60),
      nonce: 1,
    });
    expect(result.type).toBe('erc1967_proxy');
    expect(result.is_virtuals_factory).toBe(true);
    expect(result.code_size).toBeGreaterThan(0);
  });

  it('classifies an EOA (no code) as eoa', () => {
    const result = classifyWallet({ code: '0x', nonce: 5 });
    expect(result.type).toBe('eoa');
    expect(result.is_virtuals_factory).toBe(false);
    expect(result.code_size).toBe(0);
  });

  it('classifies an unknown contract as contract', () => {
    const result = classifyWallet({ code: '0x6080604052' + 'a'.repeat(200), nonce: 1 });
    expect(result.type).toBe('contract');
    expect(result.is_virtuals_factory).toBe(false);
  });
});

describe('isVirtualsFactoryProxy', () => {
  it('returns true for the standard Virtuals minimal proxy bytecode', () => {
    expect(isVirtualsFactoryProxy('0x363d3d373d3d363d7f360894' + '0'.repeat(60))).toBe(true);
  });
  it('returns false for empty code', () => {
    expect(isVirtualsFactoryProxy('0x')).toBe(false);
  });
});
