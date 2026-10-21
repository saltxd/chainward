import { describe, expect, it } from 'vitest';
import { decoyReason, decoySentence, type Decoy, type DecoyTransfer } from '../src/decoy.js';
import { RISK_CHECKS, withDecoyFlag, withSanctionsFlag, type RiskAssessment } from '../src/risk-flags.js';
import { OFAC_SNAPSHOT } from '../src/ofac-snapshot.js';
import { counterpartyVerdict } from '../src/verdict.js';
import { lookupWallet, type WalletLookupDeps } from '../src/wallet-lookup.js';

// The decoy finding reaches every check: the report's flags (free report page, paid
// counterparty check), the counterparty verdict and the fast wallet lookup.

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const PAYER = '0x228440f8d5df8b2e29c37255b291599060894bfb';
const PAYEE = '0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd';
const PAYEE_LOOKALIKE = '0xf7eea0bae744497d7e7dcf93c7bc4a46b61667cd';
const FAKE = '0x72846b6b37ee99e88e1cfb0acd490ed766d91a00';
const FAKE_SYMBOL = 'ሀ‌‍Ѕ​‌D​​С';
const REAL_TX = '0xcec19f99cfdaf19108dc7313855f2fe0eff23b9f0ec035fdf55047c6f40d0446';
const FAKE_TX = '0xfb329dcb45f3e01ef2d65ac9b5404dad3513c57e4bab5f89205baea8c970bb64';

const DECOY: Decoy = {
  role: 'payee',
  imitates: PAYEE,
  counterparty: PAYER,
  token: 'USDC',
  echoes_tx: REAL_TX,
  echoes_at: '2026-10-21T15:43:13.000Z',
  fake_tx: FAKE_TX,
  fake_tokens: [{ contract: FAKE, symbol: FAKE_SYMBOL, imitates: 'USDC' }],
};
const empty: RiskAssessment = { band: 'low-signal', flags: [], not_assessed: ['x'], classifier_version: 'v1', signal_density: 0 };

describe('withDecoyFlag', () => {
  it('adds one high poisoning_decoy flag with the evidence, a one-line summary and the address page as source', () => {
    const a = withDecoyFlag(empty, DECOY, PAYEE_LOOKALIKE, 'base');
    expect(a.flags).toHaveLength(1);
    expect(a.flags[0]).toEqual({
      id: 'poisoning_decoy',
      severity: 'high',
      title: 'Looks like an address-poisoning decoy',
      evidence: decoySentence(DECOY),
      summary: decoyReason(DECOY),
      source: `https://base.blockscout.com/address/${PAYEE_LOOKALIKE}`,
    });
    expect(a.band).toBe('high-signal');
  });

  it('goes after a sanctions flag, is idempotent, and leaves the assessment alone without a finding', () => {
    const listed = OFAC_SNAPSHOT.addresses[0]!;
    const a = withDecoyFlag(withSanctionsFlag(empty, listed), DECOY, listed, 'base');
    expect(a.flags.map((f) => f.id)).toEqual(['ofac_sanctioned', 'poisoning_decoy']);
    expect(withDecoyFlag(a, DECOY, listed, 'base').flags).toHaveLength(2);
    expect(withDecoyFlag(empty, null, PAYEE_LOOKALIKE, 'base')).toBe(empty);
  });

  it('is in the catalog of checks the report says it covered', () => {
    expect(RISK_CHECKS.find((c) => c.id === 'poisoning_decoy')?.title).toBe('Looks like an address-poisoning decoy');
  });
});

describe('counterpartyVerdict on a decoy', () => {
  it('holds with the one-line summary, even when the activity sources were down', () => {
    const a = withDecoyFlag(empty, DECOY, PAYEE_LOOKALIKE, 'base');
    for (const v of [counterpartyVerdict(a, null), counterpartyVerdict(a, null, { transfersUnavailable: true })]) {
      expect(v.label).toBe('hold');
      expect(v.text).toBe('Hold');
      expect(v.reason).toBe(decoyReason(DECOY));
      expect(v.limits).toBe(
        'Matched on transfer history: a look-alike that never sent a transaction and appears only in fake transfers. Absence of this flag is not a clearance.',
      );
    }
  });
});

describe('lookupWallet on a decoy', () => {
  const real = (from: string, to: string, value: number, hash: string, ts: string): DecoyTransfer => ({
    from, to, hash, value, asset: 'USDC', category: 'erc20', rawContract: { address: USDC }, metadata: { blockTimestamp: ts },
  });
  const fake = (from: string, to: string): DecoyTransfer => ({
    from, to, hash: FAKE_TX, value: 0.1, asset: FAKE_SYMBOL, category: 'erc20', rawContract: { address: FAKE }, metadata: { blockTimestamp: '2026-10-21T15:45:01.000Z' },
  });
  const world: DecoyTransfer[] = [real(PAYER, PAYEE, 0.1, REAL_TX, '2026-10-21T15:43:13.000Z'), fake(PAYER, PAYEE_LOOKALIKE)];

  function deps(nonce: number, calls: string[]): WalletLookupDeps {
    return {
      now: () => new Date('2026-10-21T16:00:00Z'),
      rpc: async (method) => {
        if (method === 'eth_getTransactionCount') return `0x${nonce.toString(16)}`;
        if (method === 'eth_getCode') return '0x';
        if (method === 'eth_getBalance') return '0x0';
        if (method === 'eth_call') return `0x${'0'.repeat(64)}`;
        if (method === 'eth_blockNumber') return '0x3274f0d';
        throw new Error(`unexpected ${method}`);
      },
      transfers: async (params) => {
        const q = params as { fromAddress?: string; toAddress?: string; contractAddresses?: string[]; order?: string; maxCount?: string };
        // side:address:page:contract-filtered, so the funder trace (a 1,000 page, no filter) tells apart from decoy reads
        calls.push(`${q.fromAddress ? `from:${q.fromAddress}` : `to:${q.toAddress}`}:${q.maxCount}:${q.contractAddresses ? 'usdc' : ''}`);
        const rows = world
          .filter((t) => (q.fromAddress ? t.from === q.fromAddress : t.to === q.toAddress))
          .filter((t) => !q.contractAddresses || q.contractAddresses.includes(t.rawContract?.address ?? ''));
        return { transfers: q.order === 'asc' ? rows.slice(0, 1) : rows };
      },
    };
  }

  it('answers hold, names the address it copies and does not trace the fake sender as its funder', async () => {
    const calls: string[] = [];
    const r = await lookupWallet(PAYEE_LOOKALIKE, 'base', deps(0, calls));
    expect(r.verdict).toEqual({ label: 'hold', reason: decoyReason(DECOY) });
    expect(r.flags).toContain('poisoning_decoy');
    expect(r.decoy).toMatchObject({ role: 'payee', imitates: PAYEE, counterparty: PAYER, echoes_tx: REAL_TX });
    expect(r.first_funder).toBeNull();
    expect(calls).not.toContain(`from:${PAYER}:0x3e8:`);
    expect(calls).toContain(`from:${PAYER}:0x64:usdc`);
  });

  it('runs no decoy reads for a wallet that has sent transactions', async () => {
    const calls: string[] = [];
    const r = await lookupWallet(PAYEE_LOOKALIKE, 'base', deps(4, calls));
    expect(r.decoy).toBeNull();
    expect(r.flags).not.toContain('poisoning_decoy');
    // The lookup's own two reads (first in, last out) and the funder trace, nothing more.
    expect(calls).toEqual([`to:${PAYEE_LOOKALIKE}:0x1:`, `from:${PAYEE_LOOKALIKE}:0x1:`, `from:${PAYER}:0x3e8:`]);
  });
});
