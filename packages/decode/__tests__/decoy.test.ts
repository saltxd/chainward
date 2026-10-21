import { describe, expect, it } from 'vitest';
import { decoyReason, decoySentence, detectDecoy, type DecoyDeps, type DecoyTransfer } from '../src/decoy.js';

// Address poisoning as it happened on Base on 2026-10-21: Would Pay Again's payout wallet
// paid ChainWard's treasury 0.1 USDC at 15:43:13 UTC, and at 15:45:01 a fake "USDC" put a
// look-alike of each side into the other's history. A decoy is the look-alike: it never
// sent a transaction, holds nothing real, and only appears in fake transfers.

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const PAYER = '0x228440f8d5df8b2e29c37255b291599060894bfb';
const PAYER_LOOKALIKE = '0x2284822677fb1adb234f97e6d807d7b59db94bfb';
const PAYEE = '0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd';
const PAYEE_LOOKALIKE = '0xf7eea0bae744497d7e7dcf93c7bc4a46b61667cd';
const ZERO_VALUE_LOOKALIKE = `0xf7ee${'1'.repeat(32)}67cd`;
const FAKE = '0x72846b6b37ee99e88e1cfb0acd490ed766d91a00';
const FAKE_SYMBOL = 'ሀ‌‍Ѕ​‌D​​С';
const REAL_TX = '0xcec19f99cfdaf19108dc7313855f2fe0eff23b9f0ec035fdf55047c6f40d0446';
const FAKE_TX = '0xfb329dcb45f3e01ef2d65ac9b5404dad3513c57e4bab5f89205baea8c970bb64';
const STRANGER = `0x${'5'.repeat(40)}`;

const real = (from: string, to: string, value: number, hash: string, ts: string): DecoyTransfer => ({
  from, to, hash, value, asset: 'USDC', category: 'erc20', rawContract: { address: USDC }, metadata: { blockTimestamp: ts },
});
const fake = (from: string, to: string, hash = FAKE_TX): DecoyTransfer => ({
  from, to, hash, value: 0.1, asset: FAKE_SYMBOL, category: 'erc20', rawContract: { address: FAKE }, metadata: { blockTimestamp: '2026-10-21T15:45:01.000Z' },
});

interface World {
  nonce?: Record<string, number>;
  code?: Record<string, string>;
  eth?: Record<string, bigint>;
  usdc?: Record<string, bigint>;
  transfers: DecoyTransfer[];
}

const TODAY: DecoyTransfer[] = [
  real(PAYER, PAYEE, 0.1, REAL_TX, '2026-10-21T15:43:13.000Z'),
  real(STRANGER, PAYER, 25, '0xfund', '2026-10-01T00:00:00.000Z'),
  fake(PAYER_LOOKALIKE, PAYEE),
  fake(PAYER, PAYEE_LOOKALIKE),
];

function deps(w: World, calls: string[] = []): DecoyDeps {
  return {
    rpc: async (method, params) => {
      const p = params as Array<string | { to: string; data: string }>;
      calls.push(method);
      if (method === 'eth_getTransactionCount') return `0x${(w.nonce?.[p[0] as string] ?? 0).toString(16)}`;
      if (method === 'eth_getCode') return w.code?.[p[0] as string] ?? '0x';
      if (method === 'eth_getBalance') return `0x${(w.eth?.[p[0] as string] ?? 0n).toString(16)}`;
      if (method === 'eth_call') {
        const holder = `0x${(p[0] as { data: string }).data.slice(-40)}`;
        return `0x${(w.usdc?.[holder] ?? 0n).toString(16).padStart(64, '0')}`;
      }
      throw new Error(`unexpected ${method}`);
    },
    transfers: async (params) => {
      const q = params as { fromAddress?: string; toAddress?: string; contractAddresses?: string[]; excludeZeroValue?: boolean; maxCount?: string };
      calls.push(`transfers:${q.fromAddress ? `from:${q.fromAddress}` : `to:${q.toAddress}`}`);
      const max = q.maxCount ? parseInt(q.maxCount, 16) : 1000;
      const hits = w.transfers
        .filter((t) => (q.fromAddress ? t.from === q.fromAddress : true) && (q.toAddress ? t.to === q.toAddress : true))
        .filter((t) => !q.contractAddresses || q.contractAddresses.map((c) => c.toLowerCase()).includes((t.rawContract?.address ?? '').toLowerCase()))
        .filter((t) => !q.excludeZeroValue || (t.value ?? 0) > 0)
        .sort((a, b) => (b.metadata?.blockTimestamp ?? '').localeCompare(a.metadata?.blockTimestamp ?? ''));
      return { transfers: hits.slice(0, max) };
    },
  };
}

describe('detectDecoy', () => {
  it('finds the look-alike of the payee planted in the payer history, and the real address it copies', async () => {
    const d = await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: TODAY }));
    expect(d).toEqual({
      role: 'payee',
      imitates: PAYEE,
      counterparty: PAYER,
      token: 'USDC',
      echoes_tx: REAL_TX,
      echoes_at: '2026-10-21T15:43:13.000Z',
      fake_tx: FAKE_TX,
      fake_tokens: [{ contract: FAKE, symbol: FAKE_SYMBOL, imitates: 'USDC' }],
    });
  });

  it('finds the look-alike of the payer planted in the payee history', async () => {
    const d = await detectDecoy(PAYER_LOOKALIKE, 'base', deps({ transfers: TODAY }));
    expect(d).toMatchObject({ role: 'payer', imitates: PAYER, counterparty: PAYEE, echoes_tx: REAL_TX, fake_tx: FAKE_TX });
  });

  it('finds a look-alike planted with a zero-value transfer of the real USDC', async () => {
    const zero: DecoyTransfer = { ...real(PAYER, ZERO_VALUE_LOOKALIKE, 0, '0xzero', '2026-10-21T15:44:00.000Z') };
    const d = await detectDecoy(ZERO_VALUE_LOOKALIKE, 'base', deps({ transfers: [...TODAY, zero] }));
    expect(d).toMatchObject({ role: 'payee', imitates: PAYEE, counterparty: PAYER, fake_tx: '0xzero', fake_tokens: [] });
  });

  it('leaves the real payee alone even though fakes reached it too', async () => {
    expect(await detectDecoy(PAYEE, 'base', deps({ transfers: TODAY, usdc: { [PAYEE]: 13_360_040n } }))).toBeNull();
    expect(await detectDecoy(PAYEE, 'base', deps({ transfers: TODAY }))).toBeNull();
  });

  it('leaves a fresh wallet alone that has only been paid in real USDC', async () => {
    const fresh = `0x${'6'.repeat(40)}`;
    const w = { transfers: [real(STRANGER, fresh, 5, '0xpaid', '2026-10-21T10:00:00.000Z')] };
    expect(await detectDecoy(fresh, 'base', deps(w))).toBeNull();
  });

  it('does not call an address a decoy when no real address it copies can be found', async () => {
    const odd = `0x${'7'.repeat(40)}`;
    expect(await detectDecoy(odd, 'base', deps({ transfers: [...TODAY, fake(PAYER, odd, '0xodd')] }))).toBeNull();
  });

  it('never calls a contract or a wallet that has sent transactions a decoy, and reads no transfers for them', async () => {
    const calls: string[] = [];
    expect(await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: TODAY, nonce: { [PAYEE_LOOKALIKE]: 3 } }, calls))).toBeNull();
    expect(await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: TODAY, code: { [PAYEE_LOOKALIKE]: '0x6080604052' } }, calls))).toBeNull();
    expect(calls.filter((c) => c.startsWith('transfers:'))).toEqual([]);
  });

  it('uses state the caller already read instead of reading it again', async () => {
    const calls: string[] = [];
    const d = await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: TODAY }, calls), { sentTxs: 0, isWallet: true, native: 0, usdc: 0 });
    expect(d?.imitates).toBe(PAYEE);
    expect(calls.filter((c) => !c.startsWith('transfers:'))).toEqual([]);
  });
});

describe('decoyReason', () => {
  it('is one sentence naming the copied address and what to do', async () => {
    const d = (await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: TODAY })))!;
    expect(decoyReason(d)).toBe(
      `It looks like an address-poisoning decoy of ${PAYEE}, planted after a real USDC payment. Check every character of the address you meant to pay.`,
    );
  });
});

describe('decoySentence', () => {
  it('names both full addresses, the fake token and the real payment, and never says safe or scam', async () => {
    const d = (await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: TODAY })))!;
    const s = decoySentence(d);
    expect(s).toContain(PAYEE);
    expect(s).toContain(PAYER);
    expect(s).toContain('never sent a transaction');
    expect(s).toContain('fake USDC');
    expect(s).toContain('2026-10-21 15:43 UTC');
    expect(s).not.toMatch(/\bsafe\b|\bscam/i);
    expect(s).not.toContain('—');
  });

  it('words a payer look-alike from the payee side', async () => {
    const d = (await detectDecoy(PAYER_LOOKALIKE, 'base', deps({ transfers: TODAY })))!;
    expect(decoySentence(d)).toContain(`${PAYER}, which paid ${PAYEE}`);
  });
});
