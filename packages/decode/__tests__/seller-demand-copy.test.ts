import { describe, expect, it } from 'vitest';
import { analyzeSellerDemand, demandSignals } from '../src/seller-demand.js';

describe('seller-demand report copy', () => {
  it('describes stablecoins, not USDC on Base, so a BSC (USDT) report is not mislabelled', async () => {
    const seller = '0xseller';
    const rows = Array.from({ length: 5 }, (_, i) => ({ from: `0xbuyer${i}`, to: seller, usd: 10 }));
    const source = async (direction: 'in' | 'out', address: string) =>
      direction === 'in' && address === seller ? rows : direction === 'in' ? [{ from: seller, to: address, usd: 10 }] : [];
    const report = await analyzeSellerDemand(seller, source);
    const text = JSON.stringify(report) + JSON.stringify(demandSignals(report));
    expect(text).not.toMatch(/USDC/);
    expect(text).not.toMatch(/on Base/);
  });
});
