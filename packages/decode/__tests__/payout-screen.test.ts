import { describe, expect, it } from 'vitest';
import { OFAC_SNAPSHOT } from '../src/ofac-snapshot.js';
import {
  SCREEN_LIMITS,
  buildPayoutScreen,
  findLinks,
  parsePayoutList,
  renderPayoutScreen,
  traceWallets,
  type PayoutList,
  type ScreenFundingSource,
} from '../src/payout-screen.js';
import type { FirstFunding } from '../src/seller-demand.js';

const a = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const ZERO = a(0);

// An in-memory funding source: each map is "address -> its first funding" for one kind.
type Funding = { from: string; tx?: string; block?: number };
function source(opts: {
  native?: Record<string, Funding>;
  stable?: Record<string, Funding>;
  hubs?: string[];
  contracts?: string[];
  failing?: string[];
}): ScreenFundingSource & { calls: string[] } {
  const calls: string[] = [];
  const funding = (f: Funding | undefined, to: string): FirstFunding | null =>
    f ? { from: f.from, hash: f.tx ?? `0x${to.slice(-8)}${f.from.slice(-8)}`, block: f.block ?? 1 } : null;
  return {
    calls,
    async firstFunding(kind, address) {
      calls.push(`${kind}:${address}`);
      if (opts.failing?.includes(address)) throw new Error('budget');
      return funding((kind === 'native' ? opts.native : opts.stable)?.[address], address);
    },
    async isHub(address) {
      calls.push(`hub:${address}`);
      return (opts.hubs ?? []).includes(address);
    },
    async isContract(address) {
      calls.push(`code:${address}`);
      return (opts.contracts ?? []).includes(address);
    },
  };
}

const list = (entries: Array<[string, number | null]>): PayoutList => ({
  entries: entries.map(([address, amount]) => ({ address, amount })),
  invalid: [],
  duplicates: [],
});

async function screen(entries: Array<[string, number | null]>, src: ScreenFundingSource, maxHops?: number) {
  const l = list(entries);
  const trails = await traceWallets(l.entries.map((e) => e.address), src, { maxHops });
  return buildPayoutScreen({ chain: 'base', list: l, trails, generatedAt: '2026-10-15T00:00:00.000Z', maxHops });
}

describe('parsePayoutList', () => {
  it('reads the first address and the first number after it, skipping a header', () => {
    const csv = [
      'wallet,points,reward',
      `${a(1).toUpperCase().replace('0X', '0x')},12,100.5`,
      `"${a(2)}";;$7`,
      `note\t${a(3)}`,
      '',
      'not a wallet',
      `${a(1)},3,4`,
    ].join('\n');
    const parsed = parsePayoutList(csv);
    expect(parsed.entries).toEqual([
      { address: a(1), amount: 15 },
      { address: a(2), amount: 7 },
      { address: a(3), amount: null },
    ]);
    expect(parsed.invalid).toEqual(['not a wallet']);
    expect(parsed.duplicates).toEqual([a(1)]);
  });

  it('treats a first line with an address as data', () => {
    expect(parsePayoutList(`${a(9)}\n${a(8)}`).entries.map((e) => e.address)).toEqual([a(9), a(8)]);
  });
});

describe('payout screen grouping', () => {
  const F = a(0xf0);
  const HUB = a(0xb0);
  const DISPERSE = a(0xd0);

  it('groups wallets whose first stablecoin came from one wallet, with the funding transactions', async () => {
    const src = source({ stable: { [a(1)]: { from: F, tx: '0xt1' }, [a(2)]: { from: F, tx: '0xt2' }, [a(3)]: { from: F, tx: '0xt3' } } });
    const r = await screen([[a(1), 10], [a(2), 10], [a(3), 10], [a(4), 70]], src);
    expect(r.groups).toHaveLength(1);
    const [g] = r.groups;
    expect(g!.wallets).toEqual([a(1), a(2), a(3)]);
    expect(g!.links).toEqual([{ kind: 'shared_funder', funding: 'stable', via: F, wallets: [a(1), a(2), a(3)], txs: ['0xt1', '0xt2', '0xt3'], hops: 1 }]);
    expect(g!.amount).toBe(30);
    expect(g!.amount_share).toBe(0.3);
    expect(r.summary).toMatchObject({ groups: 1, grouped_wallets: 3, grouped_share: 0.75, largest_group: 3, amount_total: 100, grouped_amount: 30, grouped_amount_share: 0.3 });
  });

  it('does not group wallets funded by the same hub, contract or mint', async () => {
    const src = source({
      native: { [a(1)]: { from: HUB }, [a(2)]: { from: HUB } },
      stable: { [a(3)]: { from: DISPERSE, tx: '0xa' }, [a(4)]: { from: DISPERSE, tx: '0xb' }, [a(5)]: { from: ZERO }, [a(6)]: { from: ZERO } },
      hubs: [HUB],
      contracts: [DISPERSE],
    });
    const r = await screen([1, 2, 3, 4, 5, 6].map((n) => [a(n), null]), src);
    expect(r.groups).toEqual([]);
    expect(r.trail_stops).toMatchObject({ hub: 2, contract: 2, mint: 2, no_funding: 6 });
  });

  it('links wallets first funded in one transaction, naming the sender, even when it is a contract', async () => {
    const src = source({ stable: { [a(1)]: { from: DISPERSE, tx: '0xbatch' }, [a(2)]: { from: DISPERSE, tx: '0xbatch' } }, contracts: [DISPERSE] });
    const r = await screen([[a(1), null], [a(2), null]], src);
    expect(r.groups[0]!.links).toEqual([{ kind: 'same_tx', funding: 'stable', via: DISPERSE, wallets: [a(1), a(2)], txs: ['0xbatch'], hops: 1 }]);
  });

  it('links a wallet funded by another listed wallet', async () => {
    const src = source({ native: { [a(2)]: { from: a(1), tx: '0xgas' } } });
    const r = await screen([[a(1), null], [a(2), null]], src);
    expect(r.groups[0]!.links).toEqual([{ kind: 'listed_funder', funding: 'native', via: a(1), wallets: [a(1), a(2)], txs: ['0xgas'], hops: 1 }]);
    expect(r.trail_stops.listed).toBe(1);
  });

  it('follows funders back up to the hop limit', async () => {
    const R = a(0xee);
    const src = source({
      stable: {
        [a(1)]: { from: a(0x11), tx: '0x1' },
        [a(0x11)]: { from: R, tx: '0x11' },
        [a(2)]: { from: a(0x22), tx: '0x2' },
        [a(0x22)]: { from: R, tx: '0x22' },
      },
    });
    const two = await screen([[a(1), null], [a(2), null]], src, 2);
    expect(two.groups[0]!.links).toEqual([{ kind: 'shared_funder', funding: 'stable', via: R, wallets: [a(1), a(2)], txs: ['0x1', '0x11', '0x2', '0x22'], hops: 2 }]);
    expect(two.method).toContain('up to 2 funders');
    const one = await screen([[a(1), null], [a(2), null]], src, 1);
    expect(one.groups).toEqual([]);
    expect(one.method).toContain('up to 1 funder.');
  });

  it("leaves out a farther funder that links exactly the wallets a nearer one does", async () => {
    const P = a(0x71);
    const G = a(0x72);
    const src = source({
      stable: { [a(1)]: { from: F }, [a(2)]: { from: F }, [F]: { from: P }, [a(3)]: { from: G }, [G]: { from: P } },
    });
    const r = await screen([[a(1), null], [a(2), null], [a(3), null]], src);
    expect(r.groups[0]!.links.map((l) => [l.via, l.wallets, l.hops])).toEqual([
      [F, [a(1), a(2)], 1],
      [P, [a(1), a(2), a(3)], 2],
    ]);
    const twoOnly = await screen([[a(1), null], [a(2), null]], src);
    expect(twoOnly.groups[0]!.links.map((l) => l.via)).toEqual([F]);
  });

  it('joins groups through shared members and notes when both kinds link them', async () => {
    const Q = a(0x51);
    const S = a(0x52);
    const src = source({
      native: { [a(1)]: { from: Q }, [a(2)]: { from: Q } },
      stable: { [a(2)]: { from: S }, [a(3)]: { from: S } },
    });
    const r = await screen([[a(1), null], [a(2), null], [a(3), null]], src);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.wallets).toEqual([a(1), a(2), a(3)]);
    expect(r.groups[0]!.both_kinds).toBe(true);
  });

  it('ranks groups by amount, then by size', async () => {
    const X = a(0x61);
    const Y = a(0x62);
    const src = source({ stable: { [a(1)]: { from: X }, [a(2)]: { from: X }, [a(3)]: { from: X }, [a(4)]: { from: Y }, [a(5)]: { from: Y } } });
    const byAmount = await screen([[a(1), 1], [a(2), 1], [a(3), 1], [a(4), 50], [a(5), 50]], src);
    expect(byAmount.groups.map((g) => [g.rank, g.wallets.length])).toEqual([[1, 2], [2, 3]]);
    const bySize = await screen([[a(1), null], [a(2), null], [a(3), null], [a(4), null], [a(5), null]], src);
    expect(bySize.groups.map((g) => g.wallets.length)).toEqual([3, 2]);
  });

  it('reports wallets it could not trace or that have no visible funding', async () => {
    const src = source({ stable: { [a(2)]: { from: F } }, failing: [a(1)] });
    const r = await screen([[a(1), null], [a(2), null], [a(3), null]], src);
    expect(r.wallets).toMatchObject({ listed: 3, not_traced: 1, no_funding: 1 });
  });

  it('looks up a shared funder once', async () => {
    const src = source({ stable: { [a(1)]: { from: F }, [a(2)]: { from: F }, [a(3)]: { from: F } } });
    await screen([[a(1), null], [a(2), null], [a(3), null]], src);
    expect(src.calls.filter((c) => c === `hub:${F}`)).toHaveLength(1);
    expect(src.calls.filter((c) => c === `stable:${F}`)).toHaveLength(1);
  });

  it('flags listed wallets and funders on the OFAC list', async () => {
    const sanctioned = OFAC_SNAPSHOT.addresses[0]!;
    const src = source({ native: { [a(1)]: { from: sanctioned }, [a(2)]: { from: sanctioned } } });
    const r = await screen([[a(1), null], [a(2), null], [sanctioned, null]], src);
    expect(r.summary.sanctioned).toEqual([sanctioned]);
    expect(r.summary.sanctioned_funders).toEqual([{ address: sanctioned, wallets: [a(1), a(2)] }]);
  });

  it('never makes a one-wallet link', () => {
    const links = findLinks(new Map([[a(1), [{ kind: 'native', hops: [{ from: a(1), tx: '0x', block: 1 }], stop: 'cycle' }]]]));
    expect(links).toEqual([]);
  });
});

describe('renderPayoutScreen', () => {
  it('leads with the summary and links every wallet and transaction to the explorer', async () => {
    const F = a(0xf0);
    const src = source({ stable: { [a(1)]: { from: F, tx: '0xabc' }, [a(2)]: { from: F, tx: '0xdef' } } });
    const md = renderPayoutScreen(await screen([[a(1), 5], [a(2), 5], [a(3), 10]], src));
    expect(md.indexOf('## Summary')).toBeLessThan(md.indexOf('## Look at these first'));
    expect(md).toContain('**2 of 3 wallets (66.7%) fall into 1 group that share a funder.**');
    expect(md).toContain('Grouped wallets would receive 10 of 20 (50.0%).');
    expect(md).toContain('OFAC: no listed wallet is on the sanctions list.');
    expect(md).toContain(`(https://basescan.org/address/${F})`);
    expect(md).toContain('(https://basescan.org/tx/0xabc)');
    for (const l of SCREEN_LIMITS) expect(md).toContain(l);
  });

  it('drops the amount column when the list has no amounts', async () => {
    const F = a(0xf0);
    const src = source({ stable: { [a(1)]: { from: F }, [a(2)]: { from: F } } });
    const md = renderPayoutScreen(await screen([[a(1), null], [a(2), null]], src));
    expect(md).toContain('| # | Wallets | Linked by |');
    expect(md).not.toContain('Grouped wallets would receive');
  });
});
