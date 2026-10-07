import { describe, expect, it } from 'vitest';
import { checkKind, counterpartyCheckUrl, hireCheckUrl, priceAtomic, sellerCheckUrl } from '../paidChecks';

const ADDR = '0x68396bd35874695ad86cd29410bd80a550991a2b';

describe('paid check URLs', () => {
  it('point at api.chainward.ai, never the chainward.ai proxy', () => {
    expect(sellerCheckUrl(ADDR)).toBe(`https://api.chainward.ai/api/risk/seller-demand?address=${ADDR}`);
    expect(sellerCheckUrl(ADDR, 'bsc')).toBe(`https://api.chainward.ai/api/risk/seller-demand?address=${ADDR}&chain=bsc`);
    expect(hireCheckUrl(332962)).toBe('https://api.chainward.ai/api/risk/hires?agent=332962&chain=bsc');
    expect(counterpartyCheckUrl(ADDR, 'base')).toBe(`https://api.chainward.ai/api/risk/x402?address=${ADDR}`);
    expect(counterpartyCheckUrl(ADDR, 'bsc')).toBe(`https://api.chainward.ai/api/risk/x402?address=${ADDR}&chain=bsc`);
  });

  it('lower-cases the address', () => {
    expect(sellerCheckUrl('0xABCDEFabcdef0123456789012345678901234567')).toContain('address=0xabcdefabcdef0123456789012345678901234567');
  });
});

describe('checkKind', () => {
  it('names the check a URL buys', () => {
    expect(checkKind(sellerCheckUrl(ADDR))).toBe('seller');
    expect(checkKind(hireCheckUrl(1))).toBe('hires');
    expect(checkKind(counterpartyCheckUrl(ADDR, 'base'))).toBe('counterparty');
    expect(checkKind(`https://api.chainward.ai/api/risk/x402/${ADDR}`)).toBe('counterparty');
    expect(checkKind('https://api.chainward.ai/api/paid/termix-wallets/file')).toBeNull();
  });
});

describe('priceAtomic', () => {
  it('reads a displayed price as atomic USDC', () => {
    expect(priceAtomic('$0.10')).toBe(100_000n);
    expect(priceAtomic('$0.05')).toBe(50_000n);
    expect(priceAtomic('0.1')).toBe(100_000n);
    expect(priceAtomic('$10')).toBe(10_000_000n);
  });

  it('refuses a price it cannot read', () => {
    expect(() => priceAtomic('free')).toThrow();
  });
});
