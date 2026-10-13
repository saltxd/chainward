import { describe, expect, it } from 'vitest';
import { OFAC_SNAPSHOT } from '../src/ofac-snapshot.js';
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
}

function deps(c: Chain): WalletLookupDeps {
  return {
    now: () => NOW,
    rpc: async (method, params) => {
      const p = params as string[];
      if (method === 'eth_getCode') return c.code?.[p[0]!] ?? '0x';
      if (method === 'eth_getTransactionCount') return `0x${(c.nonce?.[p[0]!] ?? 0).toString(16)}`;
      if (method === 'eth_getBalance') return '0xde0b6b3a7640000';
      if (method === 'eth_call') return '0x' + (512_400_000).toString(16).padStart(64, '0');
      if (method === 'eth_blockNumber') return '0x3220000';
      throw new Error(`unexpected ${method}`);
    },
    transfers: async (params) => {
      const q = params as { toAddress?: string; fromAddress?: string; order?: string };
      if (q.toAddress) return { transfers: c.firstIn ? [{ from: c.firstIn.from, to: q.toAddress, hash: c.firstIn.hash, metadata: { blockTimestamp: c.firstIn.ts } }] : [] };
      if (q.fromAddress === A) return { transfers: c.lastOut ? [{ from: A, to: FUNDER, hash: '0x1', metadata: { blockTimestamp: c.lastOut } }] : [] };
      if (q.fromAddress === c.firstIn?.from) {
        const n = c.funderRecipients ?? 1;
        return { transfers: Array.from({ length: n }, (_, i) => ({ from: q.fromAddress!, to: `0x${i.toString(16).padStart(40, '0')}`, hash: `0x${i}`, metadata: { blockTimestamp: days(1) } })) };
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
    expect(r.flags).not.toContain('shared_funder');
  });

  it('says when the address is a contract', async () => {
    const r = await lookupWallet(A, 'base', deps({ code: { [A]: '0x6080' }, nonce: { [A]: 1 }, firstIn: { from: FUNDER, ts: days(300), hash: '0x6' } }));
    expect(r.type).toBe('contract');
    expect(r.flags).toContain('contract');
  });
});
