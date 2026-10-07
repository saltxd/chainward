import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSellerDemand, type TransferSource, type UsdcTransfer } from '../src/seller-demand.js';
import { proxiedPayerResolver, type ReceiptSource, type Settlement, type SettlementSource } from '../src/proxied-payers.js';

// The Meridian ring and 0xc2204317 (chainward.ai/decodes/x402-on-base-two-weeks-later):
// every x402 payment among the six ring wallets, and from 0xc2204317's only payer,
// goes payer → Meridian's proxy → payee in one transaction, so the seller only ever
// sees the proxy. The fixture is the week of Sep 29 - Oct 5 2026 from x402scan, per
// ordered pair, plus the 30-day USDC inflows of 0xc2204317's payer from Alchemy.
interface Fixture {
  ring: string[];
  pairs: Array<[string, string, number, number, string[]]>;
  payer_inflows: Record<string, Array<[string, number, number]>>;
}
const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'meridian-ring-w3.json'), 'utf8')) as Fixture;
const MERIDIAN = '0x8e7769d440b3460b92159dd9c6d17302b036e2d6';
const C2 = '0xc2204317799b521cd1ff1f7c6cab84d3ac5f774e';
const C2_PAYER = '0x1cfffac9aa5590338f2650f1461b70feddad0fcb';

interface World {
  transfers: UsdcTransfer[];
  settlements: Settlement[];
  receipts: Map<string, UsdcTransfer[]>;
}

let txSeq = 0;
const tx = () => `0x${(++txSeq).toString(16).padStart(64, '0')}`;

/** Each settlement: payer → proxy (gross, Meridian keeps ~1%), proxy → payee, one tx. */
function proxied(w: World, proxy: string, payer: string, payee: string, usd: number, facilitator: string) {
  const hash = tx();
  const legs = [
    { from: payer, to: proxy, usd: usd * 1.0101, hash },
    { from: proxy, to: payee, usd, hash },
  ];
  w.transfers.push(...legs);
  w.receipts.set(hash, legs);
  w.settlements.push({ tx: hash, payer, payee, usd, facilitator });
}

function world(): World {
  const w: World = { transfers: [], settlements: [], receipts: new Map() };
  for (const [payer, payee, n, usd, facs] of fx.pairs) {
    if (!facs.includes('mrdn')) continue;
    for (let i = 0; i < n; i++) proxied(w, MERIDIAN, payer, payee, usd / n, 'mrdn');
  }
  for (const [payer, rows] of Object.entries(fx.payer_inflows)) {
    for (const [from, n, usd] of rows) for (let i = 0; i < n; i++) w.transfers.push({ from, to: payer, usd: usd / n, hash: tx() });
  }
  // Meridian's other customers: the proxy is a high-throughput address.
  for (let i = 0; i < 1000; i++) proxied(w, MERIDIAN, `0xother${i}`, `0xshop${i % 7}`, 2, 'mrdn');
  return w;
}

const transferSource = (w: World): TransferSource => async (dir, addr) =>
  w.transfers.filter((t) => (dir === 'in' ? t.to === addr : t.from === addr));
const settlementSource = (w: World): SettlementSource => async (dir, addr, facilitators) =>
  w.settlements.filter((s) => (dir === 'in' ? s.payee === addr : s.payer === addr) && facilitators.includes(s.facilitator));
const receiptSource = (w: World): ReceiptSource => async (hash) => {
  const legs = w.receipts.get(hash);
  if (!legs) throw new Error('no receipt');
  return legs;
};

describe('payers behind facilitator proxies (Meridian ring fixture)', () => {
  it('the fixture is the ring the decode describes: 30 pairs, $26,031.27 in the week', () => {
    const inside = fx.pairs.filter(([p, q]) => fx.ring.includes(p) && fx.ring.includes(q));
    expect(inside).toHaveLength(30);
    expect(inside.reduce((a, r) => a + r[3], 0)).toBeCloseTo(26_031.27, 2);
  });

  it('without proxy resolution the ring is invisible (the miss the decode reported)', async () => {
    const r = await analyzeSellerDemand(fx.ring[3]!, transferSource(world()));
    expect(r.via_intermediary_share).toBeGreaterThan(0.98);
    expect(r.signals).toEqual([]);
    expect(r.proxied_payers).toEqual([]);
    expect(r.notes).toEqual([]);
  });

  it('names the five payers behind Meridian and flags the loop', async () => {
    const w = world();
    const seller = fx.ring[3]!;
    const r = await analyzeSellerDemand(seller, transferSource(w), {
      proxies: proxiedPayerResolver({ settlements: settlementSource(w), receipts: receiptSource(w) }),
    });
    expect(r.proxied_payers).toEqual([
      {
        proxy: MERIDIAN,
        name: 'Meridian',
        payers_resolved: 5,
        coverage_share: 1,
        source: 'x402scan',
        receipts: { read: 3, matched: 3 },
        payers_checked: 5,
        payers_funded_by_seller: 5,
      },
    ]);
    expect(r.via_intermediary_share).toBe(0);
    expect(r.seller_funded).toMatchObject({ buyers: 5, hops: { '1': 5 } });
    expect(r.buyers_checked).toBe(5);
    expect(r.signals.map((s) => s.id)).toEqual(expect.arrayContaining(['buyers_funded_by_seller', 'money_flows_back']));
    expect(r.notes).toEqual([]);
  });

  it('across the six ring wallets resolves all 30 payer → payee pairs', async () => {
    const w = world();
    const proxies = proxiedPayerResolver({ settlements: settlementSource(w), receipts: receiptSource(w) });
    let pairs = 0;
    for (const seller of fx.ring) {
      const r = await analyzeSellerDemand(seller, transferSource(w), { proxies });
      pairs += r.proxied_payers[0]!.payers_resolved;
      expect(r.signals.map((s) => s.id)).toEqual(expect.arrayContaining(['buyers_funded_by_seller', 'money_flows_back']));
    }
    expect(pairs).toBe(30);
  });

  it("finds 0xc2204317's one payer behind Meridian, funded by the seller", async () => {
    const w = world();
    const r = await analyzeSellerDemand(C2, transferSource(w), {
      proxies: proxiedPayerResolver({ settlements: settlementSource(w), receipts: receiptSource(w) }),
    });
    expect(r.proxied_payers).toMatchObject([{ proxy: MERIDIAN, payers_resolved: 1, coverage_share: 1, payers_funded_by_seller: 1 }]);
    expect(r.seller_funded).toMatchObject({ buyers: 1, hops: { '1': 1 } });
    expect(r.signals.map((s) => s.id)).toEqual(expect.arrayContaining(['buyers_funded_by_seller', 'money_flows_back']));
    expect(r.top_buyer_share).toBe(1);
    void C2_PAYER;
  });

  it('falls back to at most 40 receipts, 3 at a time, when x402scan is down, and says coverage is partial', async () => {
    const w = world();
    let inFlight = 0;
    let maxInFlight = 0;
    let read = 0;
    const receipts: ReceiptSource = async (hash) => {
      inFlight++;
      read++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return receiptSource(w)(hash);
    };
    const down: SettlementSource = async () => {
      throw new Error('x402scan public.transfers.list failed (503)');
    };
    const r = await analyzeSellerDemand(fx.ring[3]!, transferSource(w), { proxies: proxiedPayerResolver({ settlements: down, receipts }) });
    expect(read).toBeLessThanOrEqual(40);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    const [entry] = r.proxied_payers;
    expect(entry).toMatchObject({ proxy: MERIDIAN, name: 'Meridian', source: 'receipts' });
    expect(entry!.receipts.read).toBeLessThanOrEqual(40);
    expect(entry!.payers_resolved).toBeGreaterThan(0);
    expect(entry!.coverage_share).toBeGreaterThan(0);
    expect(entry!.coverage_share).toBeLessThan(1);
    expect(r.notes.join(' ')).toMatch(/x402scan was unavailable.*Meridian.*partial/);
    // The seller's own payments to its payers, read from the same receipts, still link them.
    expect(r.signals.map((s) => s.id)).toContain('buyers_funded_by_seller');
    // The proxy delivered the payers' unnamed payments; it is not their common funder.
    expect(r.common_first_funder?.address).not.toBe(MERIDIAN);
    expect(r.signals.map((s) => s.id)).not.toContain('common_funder');
  });

  it("does not use x402scan's payer for a proxy when the chain disagrees", async () => {
    const w = world();
    const seller = fx.ring[3]!;
    const lying: SettlementSource = async (dir, addr, facs) =>
      (await settlementSource(w)(dir, addr, facs)).map((s) => (s.payee === seller ? { ...s, payer: '0xbad' } : s));
    const r = await analyzeSellerDemand(seller, transferSource(w), {
      proxies: proxiedPayerResolver({ settlements: lying, receipts: receiptSource(w) }),
    });
    const [entry] = r.proxied_payers;
    expect(entry).toMatchObject({ source: 'receipts' });
    expect(r.notes.join(' ')).toMatch(/disagreed/);
    expect(r.sample.buyers).toBeGreaterThan(0);
    expect(r.buyers_checked).toBeGreaterThan(0);
    expect(r.top_buyer_share).not.toBeNull();
    expect(r.proxied_payers.some((p) => p.payers_resolved > 0)).toBe(true);
    // 0xbad never shows up as a buyer.
    expect(JSON.stringify(r)).not.toContain('0xbad');
  });

  it("names an unlisted proxy after x402scan's facilitator (Fluxa deploys one per seller)", async () => {
    const w: World = { transfers: [], settlements: [], receipts: new Map() };
    const FLUXA_PROXY = '0xf1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1';
    for (let i = 0; i < 6; i++) proxied(w, FLUXA_PROXY, `0xpayer${i}`, '0xseller', 10, 'fluxa');
    const r = await analyzeSellerDemand('0xseller', transferSource(w), {
      proxies: proxiedPayerResolver({ settlements: settlementSource(w), receipts: receiptSource(w) }),
    });
    expect(r.proxied_payers).toMatchObject([{ proxy: FLUXA_PROXY, name: 'Fluxa', payers_resolved: 6, coverage_share: 1 }]);
    expect(r.sample.buyers).toBe(6);
  });
});
