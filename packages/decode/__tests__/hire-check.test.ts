import { describe, expect, it } from 'vitest';
import {
  HIRE_METHOD,
  HIRE_LIMITS,
  assessHirers,
  buildHireReport,
  groupHirers,
  summarizeHirers,
  SAME_HUB_BLOCKS,
  type FirstFunder,
  type FundingGraph,
  type HirerAssessment,
  type HirerInput,
} from '../src/hire-check.js';

// A tiny in-memory funding graph: each map is "address -> its first funder" for one kind.
function graph(opts: {
  native?: Record<string, string | FirstFunder>;
  stable?: Record<string, string | FirstFunder>;
  hubs?: string[];
  contracts?: string[];
  /** Directed pairs that moved BNB or a stablecoin at some point. */
  transfers?: Array<[string, string]>;
}): FundingGraph & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async hasTransfer(from, to) {
      calls.push(`t:${from}>${to}`);
      return (opts.transfers ?? []).some(([f, t]) => f === from && t === to);
    },
    async firstFunder(kind, address) {
      calls.push(`${kind}:${address}`);
      const v = (kind === 'native' ? opts.native : opts.stable)?.[address];
      return v == null ? null : typeof v === 'string' ? { from: v, block: 0 } : v;
    },
    async isHub(address) {
      return (opts.hubs ?? []).includes(address);
    },
    async isContract(address) {
      return (opts.contracts ?? []).includes(address);
    },
  };
}

const OWNER = '0x00000000000000000000000000000000000000aa';
const AGENT_WALLET = '0x00000000000000000000000000000000000000ab';
const hirer = (n: number): HirerInput => ({
  address: `0x${n.toString(16).padStart(40, '0')}`,
  hires: 1,
  first_hire_at: `2026-10-0${(n % 9) + 1}T00:00:00.000Z`,
});
const H1 = hirer(1);
const H2 = hirer(2);
const H3 = hirer(3);

async function one(h: HirerInput, g: FundingGraph): Promise<HirerAssessment> {
  const [a] = await assessHirers({ owner: OWNER, agentWallets: [AGENT_WALLET], hirers: [h], graph: g });
  return a!;
}

describe('assessHirers', () => {
  it('owner: the hirer is the owner wallet', async () => {
    const a = await one({ ...H1, address: OWNER }, graph({}));
    expect(a.verdict).toBe('owner');
    expect(a.path).toEqual([OWNER]);
    expect(a.evidence).toMatch(/owner wallet/);
  });

  it('owner: the hirer is the agent wallet', async () => {
    const a = await one({ ...H1, address: AGENT_WALLET }, graph({}));
    expect(a.verdict).toBe('owner');
    expect(a.evidence).toMatch(/agent wallet/);
  });

  it('owner_funded: the owner is 2 hops up the hirer\'s first-BNB trail', async () => {
    const a = await one(H1, graph({ native: { [H1.address]: '0xmid', '0xmid': OWNER } }));
    expect(a.verdict).toBe('owner_funded');
    expect(a.path).toEqual([H1.address, '0xmid', OWNER]);
    expect(a.evidence).toMatch(/BNB/);
    expect(a.evidence).toMatch(/2 hops/);
  });

  it('owner_funded: the agent wallet sent the hirer its first stablecoin', async () => {
    const a = await one(H1, graph({ stable: { [H1.address]: AGENT_WALLET } }));
    expect(a.verdict).toBe('owner_funded');
    expect(a.path).toEqual([H1.address, AGENT_WALLET]);
    expect(a.evidence).toMatch(/stablecoin/);
    expect(a.evidence).toMatch(/1 hop\b/);
  });

  it('shared_funder: hirer and owner got their first stablecoin from the same wallet', async () => {
    const a = await one(H1, graph({ stable: { [H1.address]: '0xdrip', [OWNER]: '0xdrip' } }));
    expect(a.verdict).toBe('shared_funder');
    expect(a.path).toEqual([H1.address, '0xdrip', OWNER]);
    expect(a.evidence).toMatch(/0xdrip/);
  });

  it('shared_funder: the trails meet further up (hirer hop 2 BNB, owner hop 1 stablecoin)', async () => {
    const a = await one(
      H1,
      graph({ native: { [H1.address]: '0xh1', '0xh1': '0xboss' }, stable: { [OWNER]: '0xboss' } }),
    );
    expect(a.verdict).toBe('shared_funder');
    expect(a.path).toEqual([H1.address, '0xh1', '0xboss', OWNER]);
  });

  it('shared_funder: the hirer itself funded the owner', async () => {
    const a = await one(H1, graph({ native: { [OWNER]: H1.address } }));
    expect(a.verdict).toBe('shared_funder');
    expect(a.path).toEqual([H1.address, OWNER]);
    expect(a.evidence).toMatch(/hirer .*funding trail|owner's funding trail/);
  });

  it('direct_transfer: the hirer sent the owner BNB or a stablecoin at some point', async () => {
    const a = await one(H1, graph({ native: { [H1.address]: '0xbinance' }, hubs: ['0xbinance'], transfers: [[H1.address, OWNER]] }));
    expect(a.verdict).toBe('direct_transfer');
    expect(a.path).toEqual([H1.address, OWNER]);
    expect(a.evidence).toMatch(/hirer sent the owner wallet/);
  });

  it('direct_transfer: the agent wallet paid the hirer', async () => {
    const a = await one(H1, graph({ transfers: [[AGENT_WALLET, H1.address]] }));
    expect(a.verdict).toBe('direct_transfer');
    expect(a.path).toEqual([H1.address, AGENT_WALLET]);
    expect(a.evidence).toMatch(/agent wallet sent the hirer/);
  });

  it('owner_funded beats direct_transfer', async () => {
    const a = await one(H1, graph({ native: { [H1.address]: OWNER }, transfers: [[H1.address, OWNER]] }));
    expect(a.verdict).toBe('owner_funded');
  });

  it('independent_within_limits: a trail that stops at a hub is no link found (funding behind an exchange is not visible)', async () => {
    const a = await one(
      H1,
      graph({ native: { [H1.address]: '0xbinance', [OWNER]: '0xokx' }, hubs: ['0xbinance', '0xokx'] }),
    );
    expect(a.verdict).toBe('independent_within_limits');
    expect(a.path).toEqual([H1.address, '0xbinance']);
    expect(a.evidence).toMatch(/hub/);
    expect(a.evidence).toMatch(/not visible/);
  });

  it('inconclusive: the hirer and the owner were first funded by the same hub less than 24h apart', async () => {
    const a = await one(
      H1,
      graph({
        native: { [H1.address]: { from: '0xbinance', block: 1_000 }, [OWNER]: { from: '0xbinance', block: 1_000 + SAME_HUB_BLOCKS - 1 } },
        hubs: ['0xbinance'],
      }),
    );
    expect(a.verdict).toBe('inconclusive');
    expect(a.path).toEqual([H1.address, '0xbinance', OWNER]);
    expect(a.evidence).toMatch(/same hub/);
  });

  it('independent_within_limits: the same hub more than 24h apart is just an exchange', async () => {
    const a = await one(
      H1,
      graph({
        native: { [H1.address]: { from: '0xbinance', block: 1_000 }, [OWNER]: { from: '0xbinance', block: 1_000 + SAME_HUB_BLOCKS } },
        hubs: ['0xbinance'],
      }),
    );
    expect(a.verdict).toBe('independent_within_limits');
  });

  it('same hub rule compares the same kind of trail only', async () => {
    const a = await one(
      H1,
      graph({
        native: { [H1.address]: { from: '0xbinance', block: 1_000 } },
        stable: { [OWNER]: { from: '0xbinance', block: 1_000 } },
        hubs: ['0xbinance'],
      }),
    );
    expect(a.verdict).toBe('independent_within_limits');
  });

  it('independent_within_limits: the trail ends at an unidentified contract', async () => {
    const a = await one(H1, graph({ stable: { [H1.address]: '0xrouter' }, contracts: ['0xrouter'] }));
    expect(a.verdict).toBe('independent_within_limits');
    expect(a.evidence).toMatch(/contract/);
  });

  it('inconclusive: no incoming BNB or stablecoin is visible at all', async () => {
    const a = await one(H1, graph({}));
    expect(a.verdict).toBe('inconclusive');
    expect(a.path).toEqual([H1.address]);
    expect(a.evidence).toMatch(/no incoming/i);
  });

  it('independent_within_limits: trails end without reaching the owner, a hub or a contract', async () => {
    const a = await one(
      H1,
      graph({ native: { [H1.address]: '0xa', '0xa': '0xb' }, stable: { [OWNER]: '0xz' } }),
    );
    expect(a.verdict).toBe('independent_within_limits');
    expect(a.path).toEqual([H1.address, '0xa', '0xb']);
    expect(a.evidence).toMatch(/4 hops/);
  });

  it('stops after 4 hops', async () => {
    const g = graph({ native: { [H1.address]: '0x1', '0x1': '0x2', '0x2': '0x3', '0x3': '0x4', '0x4': OWNER } });
    const a = await one(H1, g);
    expect(a.verdict).toBe('independent_within_limits');
    expect(a.path).toEqual([H1.address, '0x1', '0x2', '0x3', '0x4']);
  });

  it('owner beats a hub on the other trail', async () => {
    const a = await one(
      H1,
      graph({ native: { [H1.address]: '0xbinance' }, stable: { [H1.address]: OWNER }, hubs: ['0xbinance'] }),
    );
    expect(a.verdict).toBe('owner_funded');
  });

  it('keeps input order and traces only the first maxTraced hirers', async () => {
    const out = await assessHirers({
      owner: OWNER,
      agentWallets: [],
      hirers: [H1, H2, H3],
      graph: graph({ native: { [H1.address]: '0xa', [H2.address]: '0xb' } }),
      maxTraced: 2,
    });
    expect(out.map((a) => a.address)).toEqual([H1.address, H2.address, H3.address]);
    expect(out[2]).toMatchObject({ verdict: 'inconclusive', path: [H3.address] });
    expect(out[2]!.evidence).toMatch(/not traced/i);
  });
});

describe('summarizeHirers', () => {
  const at = (verdict: HirerAssessment['verdict']): HirerAssessment => ({ ...H1, verdict, evidence: '', path: [] });

  it('needs three independent_within_limits hirers to pass', () => {
    expect(
      summarizeHirers([at('independent_within_limits'), at('independent_within_limits'), at('inconclusive'), at('owner')]),
    ).toEqual({ owner_linked: 1, inconclusive: 1, independent_within_limits: 2, passes_three_independent: false });
    expect(summarizeHirers([at('direct_transfer')]).owner_linked).toBe(1);
    expect(
      summarizeHirers([
        at('independent_within_limits'),
        at('independent_within_limits'),
        at('independent_within_limits'),
        at('owner_funded'),
        at('shared_funder'),
      ]),
    ).toEqual({ owner_linked: 2, inconclusive: 0, independent_within_limits: 3, passes_three_independent: true });
  });
});

describe('groupHirers', () => {
  it('one row per hirer, ordered by first hire, counting hires across both sources', () => {
    const rows = groupHirers([
      { source: 'erc8183_shared', hirer: '0xB', block: 20, tx: '0x2' },
      { source: 'termix_escrow', hirer: '0xa', block: 30, tx: '0x3' },
      { source: 'termix_escrow', hirer: '0xb', block: 10, tx: '0x1' },
    ]);
    expect(rows).toEqual([
      { address: '0xb', hires: 2, first_block: 10 },
      { address: '0xa', hires: 1, first_block: 30 },
    ]);
  });
});

describe('buildHireReport', () => {
  const report = buildHireReport({
    agentIds: [332962],
    owner: OWNER,
    agentWallet: OWNER,
    events: [
      { source: 'termix_escrow', hirer: H1.address, block: 1, tx: '0x1' },
      { source: 'termix_escrow', hirer: H1.address, block: 2, tx: '0x2' },
      { source: 'erc8183_shared', hirer: H2.address, block: 3, tx: '0x3' },
    ],
    assessments: [
      { ...H1, hires: 2, verdict: 'independent_within_limits', evidence: 'x', path: [H1.address] },
      { ...H2, verdict: 'shared_funder', evidence: 'y', path: [H2.address, OWNER] },
    ],
    asOf: { block: 125_000_000, time: '2026-10-05T00:00:00.000Z' },
  });

  it('has the documented shape', () => {
    expect(report).toMatchObject({
      chain: 'bsc',
      agent_id: 332962,
      owner: OWNER,
      agent_wallet: OWNER,
      window_days: 30,
      hires: { total: 3, distinct_hirers: 2, by_source: { termix_escrow: 2, erc8183_shared: 1 } },
      summary: { owner_linked: 1, inconclusive: 0, independent_within_limits: 1, passes_three_independent: false },
      as_of: { block: 125_000_000, time: '2026-10-05T00:00:00.000Z' },
    });
    expect(report.hirers).toHaveLength(2);
  });

  it('agent_id is null when an owner address resolved to several agents', () => {
    const r = buildHireReport({ agentIds: [1, 2], owner: OWNER, agentWallet: null, events: [], assessments: [], asOf: { block: 1, time: 't' } });
    expect(r.agent_id).toBeNull();
    expect(r.agent_ids).toEqual([1, 2]);
  });

  it('says what was checked and what "independent_within_limits" does not mean', () => {
    expect(report.method).toBe(HIRE_METHOD);
    expect(HIRE_METHOD).toMatch(/first incoming BNB/);
    expect(HIRE_METHOD).toMatch(/first incoming stablecoin/);
    expect(HIRE_METHOD).toMatch(/4 hops/);
    expect(HIRE_METHOD).toMatch(/30-day/);
    expect(HIRE_METHOD).toMatch(/stablecoin transfers of at least \$0\.01/);
    expect(report.limits).toBe(HIRE_LIMITS);
    expect(HIRE_LIMITS.join(' ')).toMatch(/independent_within_limits.*no link .*within these limits.*not .*proven independen/i);
  });

  it('never calls a hirer clean or safe', () => {
    const text = JSON.stringify(report).toLowerCase();
    expect(text).not.toMatch(/\bclean\b/);
    expect(text).not.toMatch(/\bsafe\b/);
  });
});
