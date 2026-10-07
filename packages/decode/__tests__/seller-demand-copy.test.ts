import { describe, expect, it } from 'vitest';
import { analyzeSellerDemand, demandSignals } from '../src/seller-demand.js';
import { proxiedPayerResolver } from '../src/proxied-payers.js';

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

describe('seller-demand method and limits', () => {
  const seller = '0xseller';
  const source = async (direction: 'in' | 'out', address: string) =>
    direction === 'in' && address === seller ? [{ from: '0xbuyer', to: seller, usd: 10 }] : [];
  const resolver = proxiedPayerResolver({ settlements: async () => [], receipts: async () => [] });

  it('says payers behind facilitator proxies are named when the check resolves them', async () => {
    const r = await analyzeSellerDemand(seller, source, { proxies: resolver });
    expect(r.method).toMatch(/facilitator proxy \(Meridian, Fluxa\)/);
    expect(r.method).toMatch(/x402scan/);
    expect(r.method).toMatch(/40 receipts/);
    expect(r.not_assessed.join(' ')).not.toMatch(/facilitator proxies/);
    expect(r.not_assessed.join(' ')).toMatch(/exchanges/);
  });

  it('keeps proxies under not_assessed when it does not (BNB Chain)', async () => {
    const r = await analyzeSellerDemand(seller, source);
    expect(r.method).not.toMatch(/x402scan/);
    expect(r.not_assessed.join(' ')).toMatch(/facilitator proxies/);
  });

  it('says what still stops a trail, and that a wallet the seller mostly funds does not', async () => {
    const r = await analyzeSellerDemand(seller, source);
    expect(r.method).toMatch(/4 hops/);
    expect(r.method).toMatch(/1,000\+ inflows of at least \$0\.01/);
    expect(r.method).toMatch(/most of/);
    expect(r.method).toMatch(/[Ee]xchanges stay opaque/);
    expect(JSON.stringify(r)).not.toMatch(/—/);
  });
});
