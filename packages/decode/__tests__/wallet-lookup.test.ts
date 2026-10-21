import { afterEach, describe, expect, it } from 'vitest';
import { OFAC_SNAPSHOT } from '../src/ofac-snapshot.js';
import { OFAC_LIST_FILES, ofacListUrl, refreshOfacList, resetOfacListForTests } from '../src/ofac.js';
import { PRIVACY_RELAYS } from '../src/privacy-relays.js';
import { lookupWallet, type WalletLookupDeps } from '../src/wallet-lookup.js';

// The fast wallet lookup: facts in about a second, and a verdict an operator can
// act on before paying, onboarding or airdropping to a wallet. Never "safe".

const NOW = new Date('2026-10-13T12:00:00Z');
const A = `0x${'a'.repeat(40)}`;
const FUNDER = `0x${'f'.repeat(40)}`;
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

interface Chain {
  code?: Record<string, string>;
  nonce?: Record<string, number>;
  firstIn?: { from: string; ts: string; hash: string } | null;
  lastOut?: string | null;
  funderRecipients?: number;
  /** The funder's recipients are contracts (DEX routers, pools), not wallets. */
  recipientsAreContracts?: boolean;
}

const ZERO = `0x${'0'.repeat(40)}`;
const recipient = (i: number) => `0x${(i + 1).toString(16).padStart(40, '0')}`;

function deps(c: Chain, calls: string[] = []): WalletLookupDeps {
  return {
    now: () => NOW,
    rpc: async (method, params) => {
      const p = params as string[];
      if (method === 'eth_getCode') {
        if (c.recipientsAreContracts && p[0]!.startsWith('0x00000000')) return '0x6080';
        return c.code?.[p[0]!] ?? '0x';
      }
      if (method === 'eth_getTransactionCount') return `0x${(c.nonce?.[p[0]!] ?? 0).toString(16)}`;
      if (method === 'eth_getBalance') return '0xde0b6b3a7640000';
      if (method === 'eth_call') return '0x' + (512_400_000).toString(16).padStart(64, '0');
      if (method === 'eth_blockNumber') return '0x3220000';
      throw new Error(`unexpected ${method}`);
    },
    transfers: async (params) => {
      const q = params as { toAddress?: string; fromAddress?: string; order?: string };
      calls.push(q.fromAddress ? `from:${q.fromAddress}` : `to:${q.toAddress}`);
      if (q.toAddress) return { transfers: c.firstIn ? [{ from: c.firstIn.from, to: q.toAddress, hash: c.firstIn.hash, metadata: { blockTimestamp: c.firstIn.ts } }] : [] };
      if (q.fromAddress === A) return { transfers: c.lastOut ? [{ from: A, to: FUNDER, hash: '0x1', metadata: { blockTimestamp: c.lastOut } }] : [] };
      if (q.fromAddress === c.firstIn?.from) {
        const n = c.funderRecipients ?? 1;
        return { transfers: Array.from({ length: n }, (_, i) => ({ from: q.fromAddress!, to: recipient(i), hash: `0x${i}`, metadata: { blockTimestamp: days(1) } })) };
      }
      return { transfers: [] };
    },
  };
}

describe('lookupWallet', () => {
  it('answers no_flags for an established wallet with an ordinary funder', async () => {
    const r = await lookupWallet(A, 'base', deps({ nonce: { [A]: 41, [FUNDER]: 3 }, firstIn: { from: FUNDER, ts: days(200), hash: '0xabc' }, lastOut: days(1) }));
    expect(r.verdict.label).toBe('no_flags');
    expect(r).toMatchObject({ address: A, chain: 'base', sanctioned: false, type: 'wallet', age_days: 200, sent_txs: 41 });
    expect(r.first_funder).toMatchObject({ address: FUNDER, exchange_or_hub: false, sanctioned: false });
    expect(r.balances).toEqual({ native: 1, usdc: 512.4 });
    expect(r.as_of_block).toBe(0x3220000);
    expect(JSON.stringify(r)).not.toMatch(/\bsafe\b/i);
  });

  it('answers hold for a sanctioned wallet', async () => {
    const listed = OFAC_SNAPSHOT.addresses[0]!;
    const r = await lookupWallet(listed, 'base', { ...deps({ firstIn: { from: FUNDER, ts: days(400), hash: '0x1' } }) });
    expect(r.verdict.label).toBe('hold');
    expect(r.sanctioned).toBe(true);
    expect(r.flags).toContain('sanctioned');
  });

  it('answers hold when the first funder is sanctioned', async () => {
    const listed = OFAC_SNAPSHOT.addresses[0]!;
    const r = await lookupWallet(A, 'base', deps({ firstIn: { from: listed, ts: days(90), hash: '0x2' }, nonce: { [A]: 5 } }));
    expect(r.verdict.label).toBe('hold');
    expect(r.flags).toContain('funded_by_sanctioned');
  });

  it('answers review for a wallet under a week old', async () => {
    const r = await lookupWallet(A, 'base', deps({ nonce: { [A]: 2, [FUNDER]: 3 }, firstIn: { from: FUNDER, ts: days(2), hash: '0x3' } }));
    expect(r.verdict.label).toBe('review');
    expect(r.flags).toContain('new_wallet');
  });

  it('answers review for a wallet with no history', async () => {
    const r = await lookupWallet(A, 'bsc', deps({ firstIn: null }));
    expect(r.verdict.label).toBe('review');
    expect(r.flags).toContain('no_history');
    expect(r.first_seen).toBeNull();
    expect(r.first_funder).toBeNull();
  });

  it('answers review when the funder funded many wallets and is not an exchange', async () => {
    const r = await lookupWallet(A, 'base', deps({ nonce: { [A]: 9, [FUNDER]: 60 }, firstIn: { from: FUNDER, ts: days(60), hash: '0x4' }, funderRecipients: 14 }));
    expect(r.verdict.label).toBe('review');
    expect(r.flags).toContain('shared_funder');
    expect(r.first_funder?.funded_wallets).toBe(14);
    expect(r.verdict.reason).toMatch(/14/);
  });

  it('treats a busy funder (an exchange or hub) as no signal', async () => {
    const r = await lookupWallet(A, 'base', deps({ nonce: { [A]: 9, [FUNDER]: 250_000 }, firstIn: { from: FUNDER, ts: days(60), hash: '0x5' }, funderRecipients: 900 }));
    expect(r.verdict.label).toBe('no_flags');
    expect(r.first_funder?.exchange_or_hub).toBe(true);
    expect(r.first_funder?.funded_wallets).toBeNull();
    expect(r.flags).not.toContain('shared_funder');
  });

  // An active trader's outgoing transfers go to routers and pools: those are not wallets it funded.
  it('does not count contracts the funder paid as wallets it funded', async () => {
    const r = await lookupWallet(
      A,
      'base',
      deps({ nonce: { [A]: 9, [FUNDER]: 400 }, firstIn: { from: FUNDER, ts: days(60), hash: '0x7' }, funderRecipients: 12, recipientsAreContracts: true }),
    );
    expect(r.flags).not.toContain('shared_funder');
    expect(r.verdict.label).toBe('no_flags');
    expect(r.first_funder?.funded_wallets).toBe(0);
  });

  // USDC bridged in by Circle's CCTP arrives as a mint: there is no funder to trace.
  it('treats a mint as no funder and does not trace the zero address', async () => {
    const calls: string[] = [];
    const r = await lookupWallet(A, 'base', deps({ nonce: { [A]: 12 }, firstIn: { from: ZERO, ts: days(200), hash: '0x8' }, lastOut: days(3) }, calls));
    expect(r.first_funder).toBeNull();
    expect(r.verdict.label).toBe('no_flags');
    expect(r.first_seen).not.toBeNull();
    expect(calls).not.toContain(`from:${ZERO}`);
  });

  it('says when the address is a contract', async () => {
    const r = await lookupWallet(A, 'base', deps({ code: { [A]: '0x6080' }, nonce: { [A]: 1 }, firstIn: { from: FUNDER, ts: days(300), hash: '0x6' } }));
    expect(r.type).toBe('contract');
    expect(r.flags).toContain('contract');
  });

  // An OptimismPortal deposit lists as a transfer from the wallet to itself: bridged from L1,
  // with no funder to trace. Traced, its own sends made it a "shared funder" (VIRTUAL's deployer).
  it('treats funds bridged in from L1 (a transfer from itself) as no funder', async () => {
    const recipients = Array.from({ length: 14 }, (_, i) => ({ from: A, to: recipient(i), hash: `0x${i}`, metadata: { blockTimestamp: days(1) } }));
    const r = await lookupWallet(A, 'base', {
      ...deps({ nonce: { [A]: 30 } }),
      transfers: async (params) => {
        const q = params as { toAddress?: string; fromAddress?: string };
        if (q.toAddress === A) return { transfers: [{ from: A, to: A, hash: '0xdeposit', metadata: { blockTimestamp: days(400) } }] };
        if (q.fromAddress === A) return { transfers: recipients };
        return { transfers: [] };
      },
    });
    expect(r.first_funder).toBeNull();
    expect(r.flags).not.toContain('shared_funder');
    expect(r.age_days).toBe(400);
  });

  // EIP-7702: an EOA that delegates to a contract carries 0xef0100 + the delegate as its code.
  it('calls an EIP-7702 delegated EOA a wallet, not a contract', async () => {
    const r = await lookupWallet(A, 'base', deps({ code: { [A]: `0xef0100${'ab'.repeat(20)}` }, nonce: { [A]: 12, [FUNDER]: 3 }, firstIn: { from: FUNDER, ts: days(90), hash: '0x9' } }));
    expect(r.type).toBe('wallet');
    expect(r.flags).not.toContain('contract');
  });

  // Bridge fills, disperse contracts and smart wallets pay ETH by internal call. HOOK's
  // launch wallet got 1.02 ETH that way 42 minutes before the launch; read without
  // internal transfers, its first funder was the pool it bought from at launch.
  // BNB Chain's provider refuses the internal category, so it is not asked there.
  describe('a first funder that paid by internal transfer', () => {
    const BRIDGE = `0x${'b'.repeat(40)}`;
    const POOL = `0x${'c'.repeat(40)}`;
    const internalDeps = (supported: boolean): WalletLookupDeps => ({
      ...deps({ nonce: { [A]: 3, [BRIDGE]: 1, [POOL]: 1 } }),
      transfers: async (params) => {
        const q = params as { toAddress?: string; category: string[] };
        const internal = q.category.includes('internal');
        if (internal && !supported) throw new Error("The 'internal' category is not supported for this network.");
        if (q.toAddress !== A) return { transfers: [] };
        const fill = { from: BRIDGE, to: A, hash: '0xfill', metadata: { blockTimestamp: days(3) } };
        const buy = { from: POOL, to: A, hash: '0xbuy', metadata: { blockTimestamp: days(1) } };
        return { transfers: [internal ? fill : buy] };
      },
    });

    it('is found on Base, with the age it gives', async () => {
      const r = await lookupWallet(A, 'base', internalDeps(true));
      expect(r.first_funder).toMatchObject({ address: BRIDGE, tx: '0xfill' });
      expect(r.first_seen).toBe(days(3));
      expect(r.age_days).toBe(3);
    });

    it('is not asked for on BNB Chain, where the provider refuses it', async () => {
      const r = await lookupWallet(A, 'bsc', internalDeps(false));
      expect(r.first_funder?.address).toBe(POOL);
    });
  });
});

// px402 v2 (PRXVT) on Base: an agent deposits into the PX402Reserve and a PRXVT
// relayer pays the seller from its own USDC. A seller who screens "the payer"
// screens the relayer: an established, clean-looking wallet that hides who paid.
describe('lookupWallet on a px402 privacy relay', () => {
  const RESERVE = '0xdd31c57E8F7CAC78090a516292f0C9Dea6c6119f';
  const RELAYER_A = '0x6f890cc63aa57da9695528c9f5e3434897b32b8e';
  const RELAYER_B = '0x47e5499c44ecf8c78da82b9b64183df1e301a0b4';
  const REASON = "Payments from this address come through the px402 privacy pool: the real payer is hidden and can't be screened.";
  const established = (addr: string, extra: Partial<Chain> = {}) =>
    deps({ nonce: { [addr]: 700, [FUNDER]: 3 }, firstIn: { from: FUNDER, ts: days(200), hash: '0xabc' }, ...extra });

  afterEach(() => resetOfacListForTests());

  it('knows the reserve and both relayers, entered by hand from the px402 finding', () => {
    expect(PRIVACY_RELAYS.map((r) => r.address)).toEqual([RESERVE.toLowerCase(), RELAYER_A, RELAYER_B]);
    for (const r of PRIVACY_RELAYS) {
      expect(r.address).toMatch(/^0x[0-9a-f]{40}$/);
      expect(r.chain).toBe('base');
      expect(r.source).toMatch(/^https:\/\/basescan\.org\//);
    }
  });

  it.each([[RELAYER_A], [RELAYER_B]])('answers review with the plain reason for relayer %s, which would otherwise be no_flags', async (relayer) => {
    const r = await lookupWallet(relayer, 'base', established(relayer));
    expect(r.flags).toContain('privacy_relay');
    expect(r.verdict).toEqual({ label: 'review', reason: REASON });
  });

  it('answers review for the reserve contract, whatever the letter case', async () => {
    const r = await lookupWallet(RESERVE, 'base', established(RESERVE.toLowerCase(), { code: { [RESERVE.toLowerCase()]: '0x6080' } }));
    expect(r.flags).toEqual(expect.arrayContaining(['contract', 'privacy_relay']));
    expect(r.verdict).toEqual({ label: 'review', reason: REASON });
  });

  it('names the pool before any other review reason', async () => {
    const r = await lookupWallet(RELAYER_A, 'base', deps({ nonce: { [RELAYER_A]: 2, [FUNDER]: 3 }, firstIn: { from: FUNDER, ts: days(2), hash: '0x3' } }));
    expect(r.flags).toEqual(expect.arrayContaining(['new_wallet', 'privacy_relay']));
    expect(r.verdict.reason).toBe(REASON);
  });

  it('still answers hold when the first funder is sanctioned: sanctions win', async () => {
    const listed = OFAC_SNAPSHOT.addresses[0]!;
    const r = await lookupWallet(RELAYER_A, 'base', deps({ nonce: { [RELAYER_A]: 700 }, firstIn: { from: listed, ts: days(90), hash: '0x2' } }));
    expect(r.flags).toEqual(expect.arrayContaining(['funded_by_sanctioned', 'privacy_relay']));
    expect(r.verdict.label).toBe('hold');
  });

  it('still answers hold when the relay itself is put on the OFAC list', async () => {
    const body = (asset: string) => (asset === 'ETH' ? [...OFAC_SNAPSHOT.addresses, RELAYER_B].join('\n') : OFAC_SNAPSHOT.addresses[0]!);
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return new Response(body(OFAC_LIST_FILES.find((f) => ofacListUrl(f.asset) === url)!.asset));
    }) as typeof fetch;
    expect((await refreshOfacList({ fetch: fakeFetch })).ok).toBe(true);
    const r = await lookupWallet(RELAYER_B, 'base', established(RELAYER_B));
    expect(r.flags).toEqual(expect.arrayContaining(['sanctioned', 'privacy_relay']));
    expect(r.verdict).toEqual({ label: 'hold', reason: 'This address is on the US Treasury OFAC SDN list.' });
  });

  it('is Base only: the same key on BNB Chain is not paying through px402', async () => {
    const r = await lookupWallet(RELAYER_A, 'bsc', established(RELAYER_A));
    expect(r.flags).not.toContain('privacy_relay');
    expect(r.verdict.label).toBe('no_flags');
  });
});

// The label set: a strong public label answers review with its sentence; a weak one is
// listed but changes nothing; a private label never shows.
describe('labels in the wallet lookup', () => {
  const established = () => deps({ nonce: { [A]: 41, [FUNDER]: 3 }, firstIn: { from: FUNDER, ts: days(200), hash: '0xabc' }, lastOut: days(1) });
  const ring = {
    chain: 'base',
    address: A,
    kind: 'run_together' as const,
    strength: 'strong' as const,
    visibility: 'public' as const,
    group_key: 'ring-48',
    group_size: 48,
    sentence: 'One of 48 wallets that appear to be run together in Set and Earn, from our decode.',
    source_type: 'dataset' as const,
    source_ref: 'set-and-earn-week-one',
    source_url: 'https://chainward.ai/decodes/set-and-earn-week-one',
    evidence_url: null,
    as_of: '2026-10-01',
  };
  const withLabels = (labels: Array<typeof ring | (Omit<typeof ring, 'strength' | 'visibility'> & { strength: 'strong' | 'weak'; visibility: 'public' | 'private' })>) => ({
    ...established(),
    labelsFor: (address: string, chain: string) => labels.filter((l) => l.address === address && l.chain === chain),
  });

  it('answers review with the label sentence for a strong public label', async () => {
    const r = await lookupWallet(A, 'base', withLabels([ring]));
    expect(r.flags).toContain('labeled');
    expect(r.verdict).toEqual({ label: 'review', reason: ring.sentence });
    expect(r.labels).toEqual([{ kind: 'run_together', strength: 'strong', sentence: ring.sentence, source_url: ring.source_url }]);
  });

  it('lists a weak label without changing the verdict', async () => {
    const r = await lookupWallet(A, 'base', withLabels([{ ...ring, strength: 'weak' }]));
    expect(r.flags).not.toContain('labeled');
    expect(r.verdict.label).toBe('no_flags');
    expect(r.labels).toHaveLength(1);
  });

  it('never shows a private label', async () => {
    const r = await lookupWallet(A, 'base', withLabels([{ ...ring, visibility: 'private' }]));
    expect(r.labels).toEqual([]);
    expect(r.flags).not.toContain('labeled');
  });

  it('answers sanctions before a label', async () => {
    const listed = OFAC_SNAPSHOT.addresses[0]!;
    const r = await lookupWallet(listed, 'base', withLabels([{ ...ring, address: listed }]));
    expect(r.verdict.label).toBe('hold');
  });

  it('has no labels when none are passed in', async () => {
    const r = await lookupWallet(A, 'base', established());
    expect(r.labels).toEqual([]);
  });
});
