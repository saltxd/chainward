import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSellerDemand, type TransferSource, type UsdcTransfer } from '../src/seller-demand.js';

// botpay's payment tree (chainward.ai/decodes/x402-on-base-two-weeks-later): buyers pay
// api.botpay; api.botpay forwards to video.botpay, botpay's other payTo; video.botpay is
// the only funder of root 0x8736ae11, and the root funds every buyer through two layers
// of tree wallets. So a buyer's trail is buyer ← tree ← tree ← root ← video.botpay ←
// api.botpay: five hops, and video.botpay has 1,000+ inflows because the same buyers
// paid it directly in mid-September.
//
// The fixture is every USDC query the check made for api.botpay in the research's
// Sep 29 - Oct 5 run (30-day window), grouped per counterparty.
interface Fixture {
  addresses: string[];
  in: Record<string, Array<[number, number, number]>>;
  out: Record<string, Array<[number, number, number]>>;
  older_in: Record<string, Array<[number, number, number]>>;
}
const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'botpay-tree-w3.json'), 'utf8')) as Fixture;
const API_BOTPAY = '0x159be9e316bc5fac8ce05aec4eaae46e8f8a4908';
const VIDEO_BOTPAY = '0xcc1984e79726e7a0ae2b9df2ac9e79fb4983930e';
const ROOT = '0x8736ae11c1f3c6eba0a023baa455b2372fca2aab';

function expand(addr: string, dir: 'in' | 'out', groups: Array<[number, number, number]> = []): UsdcTransfer[] {
  const out: UsdcTransfer[] = [];
  for (const [cp, n, total] of groups) {
    const other = fx.addresses[cp]!;
    for (let i = 0; i < n; i++) out.push(dir === 'in' ? { from: other, to: addr, usd: total / n } : { from: addr, to: other, usd: total / n });
  }
  return out;
}

/** The recorded pages; with `filter`, the recorded page plus older inflows, as alchemyTransferSource pages back. */
function recorded(opts: { videoQuiet?: boolean } = {}): TransferSource {
  return async (dir, address, filter) => {
    const i = String(fx.addresses.indexOf(address));
    const page = expand(address, dir, fx[dir][i]);
    if (!filter) return page;
    const older = opts.videoQuiet ? [] : expand(address, 'in', fx.older_in[i]);
    return [...page, ...older].filter((t) => t.usd >= filter.minUsd);
  };
}

describe('botpay payment tree (research fixture)', () => {
  it('the fixture is the tree the decode describes', async () => {
    const src = recorded();
    const rootIn = await src('in', ROOT);
    const fromVideo = rootIn.filter((t) => t.from === VIDEO_BOTPAY).reduce((a, t) => a + t.usd, 0);
    expect(fromVideo / rootIn.reduce((a, t) => a + t.usd, 0)).toBeGreaterThan(0.99);
    const videoReal = await src('in', VIDEO_BOTPAY, { minUsd: 0.01, atLeast: 1000 });
    expect(videoReal.length).toBeGreaterThanOrEqual(1000);
  });

  it('traces the buyers through video.botpay, a busy wallet api.botpay funds', async () => {
    const r = await analyzeSellerDemand(API_BOTPAY, recorded());
    expect(r.buyers_checked).toBe(30);
    expect(r.walk_stops).toEqual({});
    expect(r.seller_funded.buyers).toBe(30);
    expect(r.seller_funded.hops).toEqual({ '5': 30 });
    expect(r.signals.map((s) => s.id)).toContain('buyers_funded_by_seller');
  });

  it('still reaches api.botpay once video.botpay is too quiet to count as a hub', async () => {
    const r = await analyzeSellerDemand(API_BOTPAY, recorded({ videoQuiet: true }));
    expect(r.seller_funded.buyers).toBe(30);
    expect(r.seller_funded.hops).toEqual({ '5': 30 });
  });
});
