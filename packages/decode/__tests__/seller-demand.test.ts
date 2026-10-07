import { describe, expect, it } from 'vitest';
import { analyzeSellerDemand, type TransferSource, type UsdcTransfer } from '../src/seller-demand.js';

// Tiny transfer graphs shaped like the cases in chainward.ai/decodes/x402-on-base.
function graph(edges: Array<[string, string, number]>, hubs: string[] = []): TransferSource {
  const transfers: UsdcTransfer[] = edges.map(([from, to, usd]) => ({ from, to, usd }));
  for (const hub of hubs) {
    for (let i = 0; i < 1000; i++) transfers.push({ from: `0xmany${i}`, to: hub, usd: 1 });
  }
  return async (dir, addr) => transfers.filter((t) => (dir === 'in' ? t.to === addr : t.from === addr));
}

const buyers = (n: number) => Array.from({ length: n }, (_, i) => `0xbuyer${i}`);

describe('hub test ignores dust', () => {
  // seller → 0xdist → buyers → seller. 0xdist also collects lots of sub-cent spam.
  function loopVia(dist: string): Array<[string, string, number]> {
    const edges: Array<[string, string, number]> = [['0xseller', dist, 500]];
    for (const b of buyers(10)) edges.push([dist, b, 10], [b, '0xseller', 5]);
    return edges;
  }

  it('walks past a wallet with 1,200 dust inflows and 50 real ones', async () => {
    const edges = loopVia('0xdist');
    for (let i = 0; i < 1200; i++) edges.push([`0xdust${i}`, '0xdist', 0.001]);
    for (let i = 0; i < 50; i++) edges.push([`0xreal${i}`, '0xdist', 5]);
    const r = await analyzeSellerDemand('0xseller', graph(edges));
    expect(r.walk_stops).toEqual({});
    expect(r.seller_funded.buyers).toBe(10);
    expect(r.seller_funded.hops).toEqual({ '2': 10 });
  });

  it('still stops at a wallet with 1,000 inflows of at least $0.01, dust or not', async () => {
    const edges = loopVia('0xdist');
    edges.push(['0xother', '0xdist', 5000]); // most of 0xdist's money is not the seller's
    for (let i = 0; i < 300; i++) edges.push([`0xdust${i}`, '0xdist', 0.001]);
    for (let i = 0; i < 1000; i++) edges.push([`0xreal${i}`, '0xdist', 0.01]);
    const r = await analyzeSellerDemand('0xseller', graph(edges));
    expect(r.walk_stops).toEqual({ hub: 10 });
  });

  it('still stops at an exchange the seller also deposits into', async () => {
    // Buyers withdraw from an exchange the seller cashes out to; most of the exchange's
    // money is other people's, so the trail says nothing about the seller.
    const edges: Array<[string, string, number]> = [['0xseller', '0xexchange', 2000]];
    for (const b of buyers(10)) edges.push(['0xexchange', b, 10], [b, '0xseller', 5]);
    for (let i = 0; i < 1000; i++) edges.push([`0xdepositor${i}`, '0xexchange', 3]);
    const r = await analyzeSellerDemand('0xseller', graph(edges));
    expect(r.walk_stops).toEqual({ hub: 10 });
    expect(r.seller_funded.buyers).toBe(0);
  });

  it('reads further back when a full page of inflows is part dust', async () => {
    // The source returns 1,000 transfers a page. 0xdist's newest page is 300 dust
    // + 700 real; 300 more real ones sit further back, so it is a hub after all.
    const edges = loopVia('0xdist');
    const dist: UsdcTransfer[] = [
      ...Array.from({ length: 300 }, (_, i) => ({ from: `0xdust${i}`, to: '0xdist', usd: 0.001 })),
      ...Array.from({ length: 1000 }, (_, i) => ({ from: `0xreal${i}`, to: '0xdist', usd: 1 })),
    ];
    const base = graph(edges);
    const paged: TransferSource = async (dir, addr, opts) => {
      if (dir !== 'in' || addr !== '0xdist') return base(dir, addr);
      if (!opts) return dist.slice(0, 1000);
      return dist.filter((t) => t.usd >= opts.minUsd).slice(0, Math.max(opts.atLeast, 1000));
    };
    const r = await analyzeSellerDemand('0xseller', paged);
    expect(r.walk_stops).toEqual({ hub: 10 });
  });
});

describe('analyzeSellerDemand', () => {
  it('traces a seller → hub → distributor → buyer loop (3 hops)', async () => {
    const edges: Array<[string, string, number]> = [
      ['0xseller', '0xhub', 500],
      ['0xhub', '0xdist', 400],
    ];
    for (const b of buyers(10)) edges.push(['0xdist', b, 10], [b, '0xseller', 5]);
    const r = await analyzeSellerDemand('0xSELLER', graph(edges));
    expect(r.seller_funded.buyers).toBe(10);
    expect(r.seller_funded.hops).toEqual({ '3': 10 });
    expect(r.seller_funded.volume_share).toBe(1);
    expect(r.signals.map((s) => s.id)).toContain('buyers_funded_by_seller');
  });

  it('flags a seller that pays its buyers back (1 hop)', async () => {
    const edges: Array<[string, string, number]> = [];
    for (const b of buyers(6)) edges.push(['0xseller', b, 1], [b, '0xseller', 1]);
    const r = await analyzeSellerDemand('0xseller', graph(edges));
    expect(r.seller_funded.hops).toEqual({ '1': 6 });
    expect(r.paid_back_share).toBe(1);
    expect(r.signals.map((s) => s.id)).toEqual(expect.arrayContaining(['buyers_funded_by_seller', 'money_flows_back']));
  });

  it('stops at hubs and raises nothing for independently funded buyers', async () => {
    const edges: Array<[string, string, number]> = [];
    buyers(8).forEach((b, i) => edges.push([`0xexchange${i % 4}`, b, 50], [b, '0xseller', 10]));
    const r = await analyzeSellerDemand('0xseller', graph(edges, ['0xexchange0', '0xexchange1', '0xexchange2', '0xexchange3']));
    expect(r.seller_funded.buyers).toBe(0);
    expect(r.walk_stops).toEqual({ hub: 8 });
    expect(r.signals).toEqual([]);
  });

  it('reports one wallet seeding most buyers without calling it a loop', async () => {
    const edges: Array<[string, string, number]> = [['0xtreasury', '0xdrip', 100]];
    for (const b of buyers(10)) edges.push(['0xdrip', b, 0.1], [b, '0xseller', 0.02]);
    const r = await analyzeSellerDemand('0xseller', graph(edges));
    expect(r.seller_funded.buyers).toBe(0);
    expect(r.common_first_funder).toEqual({ address: '0xdrip', buyer_share: 1 });
    expect(r.signals.map((s) => s.id)).toEqual(['common_funder']);
  });

  it('flags one dominant buyer', async () => {
    const r = await analyzeSellerDemand('0xseller', graph([['0xwhale', '0xseller', 90], ['0xsmall', '0xseller', 10]]));
    expect(r.top_buyer_share).toBe(0.9);
    expect(r.signals.map((s) => s.id)).toContain('concentrated_buyers');
  });

  it('handles a seller with no inflows', async () => {
    const r = await analyzeSellerDemand('0xseller', graph([]));
    expect(r.buyers_checked).toBe(0);
    expect(r.top_buyer_share).toBeNull();
    expect(r.signals).toEqual([]);
  });

  it('treats a facilitator proxy as an intermediary, not a buyer', async () => {
    // Payments arrive from a busy proxy contract; the seller also pays through it.
    const edges: Array<[string, string, number]> = [
      ['0xproxy', '0xseller', 900],
      ['0xseller', '0xproxy', 300],
      ['0xexchange', '0xdirect', 50],
      ['0xdirect', '0xseller', 100],
    ];
    const r = await analyzeSellerDemand('0xseller', graph(edges, ['0xproxy', '0xexchange']));
    expect(r.via_intermediary_share).toBe(0.9);
    expect(r.buyers_checked).toBe(1);
    expect(r.paid_back_share).toBe(0);
    expect(r.signals.map((s) => s.id)).not.toContain('money_flows_back');
    expect(r.signals.map((s) => s.id)).not.toContain('concentrated_buyers');
  });
});
