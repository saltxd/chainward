import { describe, expect, it } from 'vitest';
import { decoyReason, decoySentence, detectDecoy, type DecoyDeps, type DecoyTransfer } from '../src/decoy.js';

// Address poisoning as it happened on Base on 2026-10-21: Would Pay Again's payout wallet
// paid ChainWard's treasury 0.1 USDC at 15:43:13 UTC, and at 15:45:01 a fake "USDC" put a
// look-alike of each side into the other's history. A decoy is the look-alike: it never
// sent a transaction, holds nothing real, and only shows fake, zero-value or dust transfers.

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WETH = '0x4200000000000000000000000000000000000006';
const PAYER = '0x228440f8d5df8b2e29c37255b291599060894bfb';
const PAYER_LOOKALIKE = '0x2284822677fb1adb234f97e6d807d7b59db94bfb';
const PAYEE = '0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd';
const PAYEE_LOOKALIKE = '0xf7eea0bae744497d7e7dcf93c7bc4a46b61667cd';
const ZERO_VALUE_LOOKALIKE = `0xf7ee${'1'.repeat(32)}67cd`;
const EARLIER_DECOY = `0xf7ee${'2'.repeat(32)}67cd`;
const FAKE = '0x72846b6b37ee99e88e1cfb0acd490ed766d91a00';
const SPAM = `0x${'d'.repeat(40)}`;
const FAKE_SYMBOL = 'ሀ‌‍Ѕ​‌D​​С';
const REAL_TX = '0xcec19f99cfdaf19108dc7313855f2fe0eff23b9f0ec035fdf55047c6f40d0446';
const FAKE_TX = '0xfb329dcb45f3e01ef2d65ac9b5404dad3513c57e4bab5f89205baea8c970bb64';
const STRANGER = `0x${'5'.repeat(40)}`;
const ZERO = `0x${'0'.repeat(40)}`;
const FAKE_BLOCK = 52_904_077;

const real = (from: string, to: string, value: number, hash: string, ts: string, block = FAKE_BLOCK - 54, contract = USDC, asset = 'USDC'): DecoyTransfer => ({
  from, to, hash, value, asset, category: 'erc20', blockNum: `0x${block.toString(16)}`, rawContract: { address: contract, value: `0x${Math.round(value * 1e6).toString(16)}` }, metadata: { blockTimestamp: ts },
});
const fake = (from: string, to: string, hash = FAKE_TX, block = FAKE_BLOCK): DecoyTransfer => ({
  from, to, hash, value: 0.1, asset: FAKE_SYMBOL, category: 'erc20', blockNum: `0x${block.toString(16)}`, rawContract: { address: FAKE, value: '0x186a0' }, metadata: { blockTimestamp: '2026-10-21T15:45:01.000Z' },
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
  real(STRANGER, PAYER, 25, '0xfund', '2026-10-01T00:00:00.000Z', FAKE_BLOCK - 1_000_000),
  fake(PAYER_LOOKALIKE, PAYEE),
  fake(PAYER, PAYEE_LOOKALIKE),
];

function deps(w: World, calls: string[] = [], queries: Array<Record<string, unknown>> = []): DecoyDeps {
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
      const q = params as { fromAddress?: string; toAddress?: string; contractAddresses?: string[]; excludeZeroValue?: boolean; maxCount?: string; fromBlock?: string; toBlock?: string; category?: string[] };
      calls.push(`transfers:${q.fromAddress ? `from:${q.fromAddress}` : `to:${q.toAddress}`}`);
      queries.push(q);
      const max = q.maxCount ? parseInt(q.maxCount, 16) : 1000;
      const lo = q.fromBlock ? parseInt(q.fromBlock, 16) : 0;
      const hi = q.toBlock ? parseInt(q.toBlock, 16) : Infinity;
      const hits = w.transfers
        .filter((t) => (q.fromAddress ? t.from === q.fromAddress : true) && (q.toAddress ? t.to === q.toAddress : true))
        .filter((t) => !q.category || q.category.includes(t.category ?? 'erc20'))
        .filter((t) => !q.contractAddresses || q.contractAddresses.map((c) => c.toLowerCase()).includes((t.rawContract?.address ?? '').toLowerCase()))
        .filter((t) => !q.excludeZeroValue || (t.value ?? 0) > 0)
        .filter((t) => { const b = t.blockNum ? parseInt(t.blockNum, 16) : 0; return b >= lo && b <= hi; })
        .sort((a, b) => (b.metadata?.blockTimestamp ?? '').localeCompare(a.metadata?.blockTimestamp ?? ''));
      return { transfers: hits.slice(0, max) };
    },
  };
}

describe('detectDecoy', () => {
  it('finds the look-alike of the payee planted in the payer history, and the address it copies', async () => {
    const d = await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: TODAY }));
    expect(d).toEqual({
      role: 'payee',
      copies: PAYEE,
      candidates: 1,
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
    expect(d).toMatchObject({ role: 'payer', copies: PAYER, counterparty: PAYEE, echoes_tx: REAL_TX, fake_tx: FAKE_TX });
  });

  // 58% of this operator's fakes imitate ETH, and its biggest catches (0.5 and 0.25 ETH) came
  // through them: the original is a native ETH payment, which has no token contract to trace.
  it('finds a look-alike planted with imitation ETH, from the payer native ETH payments', async () => {
    const FAKE_ETH = `0x${'e'.repeat(40)}`;
    const ethPay: DecoyTransfer = { from: PAYER, to: PAYEE, hash: '0xethpay', value: 0.05, asset: 'ETH', category: 'external', blockNum: `0x${(FAKE_BLOCK - 40).toString(16)}`, rawContract: { address: null, value: '0xb1a2bc2ec50000' }, metadata: { blockTimestamp: '2026-10-21T15:43:40.000Z' } };
    const fakeEth: DecoyTransfer = { from: PAYER, to: PAYEE_LOOKALIKE, hash: '0xfakeeth', value: 0.05, asset: 'EṬH', category: 'erc20', blockNum: `0x${FAKE_BLOCK.toString(16)}`, rawContract: { address: FAKE_ETH, value: '0xb1a2bc2ec50000' }, metadata: { blockTimestamp: '2026-10-21T15:45:01.000Z' } };
    const queries: Array<Record<string, unknown>> = [];
    const d = await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: [ethPay, fakeEth] }, [], queries));
    expect(d).toMatchObject({ role: 'payee', copies: PAYEE, counterparty: PAYER, token: 'ETH', echoes_tx: '0xethpay', fake_tokens: [{ contract: FAKE_ETH, imitates: 'ETH' }] });
    expect(queries.find((q) => (q.category as string[] | undefined)?.includes('external'))).toMatchObject({ fromAddress: PAYER, category: ['external'] });
  });

  it('finds a look-alike planted with a zero-value transfer of the real USDC, even when the value reads null', async () => {
    const zero: DecoyTransfer = { ...real(PAYER, ZERO_VALUE_LOOKALIKE, 0, '0xzero', '2026-10-21T15:44:00.000Z', FAKE_BLOCK - 30), value: null, rawContract: { address: USDC, value: '0x0' } };
    const d = await detectDecoy(ZERO_VALUE_LOOKALIKE, 'base', deps({ transfers: [...TODAY, zero] }));
    expect(d).toMatchObject({ role: 'payee', copies: PAYEE, counterparty: PAYER, token: 'USDC', fake_tx: '0xzero', fake_tokens: [] });
  });

  it('names no address when more than one real payee shares the ends, as when the payer already paid an earlier decoy', async () => {
    const paidDecoy = real(PAYER, EARLIER_DECOY, 0.1, '0xstolen', '2026-10-21T15:44:30.000Z', FAKE_BLOCK - 15);
    const d = await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: [...TODAY, paidDecoy] }));
    expect(d).toMatchObject({ role: 'payee', copies: null, candidates: 2, counterparty: PAYER });
  });

  it('does not take a dust transfer as the payment it copies', async () => {
    const dust = real(PAYER, PAYEE, 0.000001, '0xdust', '2026-10-21T15:43:00.000Z');
    const w = { transfers: [dust, fake(PAYER, PAYEE_LOOKALIKE)] };
    expect(await detectDecoy(PAYEE_LOOKALIKE, 'base', deps(w))).toBeNull();
  });

  it('only looks for the original in the hours before the fake, never after it', async () => {
    const queries: Array<Record<string, unknown>> = [];
    const later = real(PAYER, PAYEE, 0.1, '0xlater', '2026-10-21T16:00:00.000Z', FAKE_BLOCK + 450);
    expect(await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: [later, fake(PAYER, PAYEE_LOOKALIKE)] }, [], queries))).toBeNull();
    const traced = queries.find((q) => q.contractAddresses);
    expect(traced).toMatchObject({ fromAddress: PAYER, toBlock: `0x${FAKE_BLOCK.toString(16)}`, fromBlock: `0x${(FAKE_BLOCK - 36_000).toString(16)}` });
  });

  it('ignores zero-value transfers of tokens it does not list, and never quotes their names', async () => {
    const spam: DecoyTransfer = { from: PAYER, to: PAYEE_LOOKALIKE, hash: '0xspam', value: 0, asset: 'Visit claim-base.xyz to pay', category: 'erc20', blockNum: `0x${FAKE_BLOCK.toString(16)}`, rawContract: { address: SPAM, value: '0x0' }, metadata: { blockTimestamp: '2026-10-21T15:45:01.000Z' } };
    expect(await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: [TODAY[0]!, spam] }))).toBeNull();
    const d = await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: [...TODAY, spam] }));
    expect(JSON.stringify(d)).not.toContain('claim-base');
    expect(decoySentence(d!)).not.toContain('claim-base');
  });

  it('leaves the real payee alone even though fakes reached it too', async () => {
    expect(await detectDecoy(PAYEE, 'base', deps({ transfers: TODAY, usdc: { [PAYEE]: 13_360_040n } }))).toBeNull();
    expect(await detectDecoy(PAYEE, 'base', deps({ transfers: TODAY }))).toBeNull();
  });

  it('leaves a fresh wallet alone that has been paid in any real listed token', async () => {
    const fresh = `0x${'6'.repeat(40)}`;
    expect(await detectDecoy(fresh, 'base', deps({ transfers: [real(STRANGER, fresh, 5, '0xpaid', '2026-10-21T10:00:00.000Z')] }))).toBeNull();
    const weth = real(STRANGER, PAYEE_LOOKALIKE, 3, '0xweth', '2026-10-21T10:00:00.000Z', FAKE_BLOCK - 5000, WETH, 'WETH');
    expect(await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: [...TODAY, weth] }))).toBeNull();
  });

  it('does not let a speck of dust ETH clear a decoy', async () => {
    const d = await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: TODAY, eth: { [PAYEE_LOOKALIKE]: 10_000_000_000n } }));
    expect(d?.copies).toBe(PAYEE);
  });

  it('does not call an address a decoy when no real address it copies can be found', async () => {
    const odd = `0x${'7'.repeat(40)}`;
    expect(await detectDecoy(odd, 'base', deps({ transfers: [...TODAY, fake(PAYER, odd, '0xodd')] }))).toBeNull();
  });

  it('never traces the zero address', async () => {
    const calls: string[] = [];
    const minted: DecoyTransfer = { ...fake(ZERO, PAYEE_LOOKALIKE, '0xmint') };
    expect(await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: [minted] }, calls))).toBeNull();
    expect(calls).not.toContain(`transfers:from:${ZERO}`);
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
    expect(d?.copies).toBe(PAYEE);
    expect(calls.filter((c) => !c.startsWith('transfers:'))).toEqual([]);
  });
});

describe('decoyReason', () => {
  it('names no address, so nothing in it can be copied and paid', async () => {
    const d = (await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: TODAY })))!;
    expect(decoyReason(d)).toBe(
      'It looks like an address-poisoning decoy: a never-used address made to match the first and last characters of a real one, so it gets copied from wallet history by mistake. Get the full address from whoever you are paying.',
    );
    expect(decoyReason(d)).not.toMatch(/0x[0-9a-f]{6}/i);
  });
});

describe('decoySentence', () => {
  it('cites the real payment by transaction and names who was poisoned, but not the address it copies', async () => {
    const d = (await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: TODAY })))!;
    const s = decoySentence(d);
    expect(s).toContain(PAYER);
    expect(s).toContain(REAL_TX);
    expect(s).toContain(FAKE_TX);
    expect(s).not.toContain(PAYEE);
    expect(s).toContain('never sent a transaction');
    expect(s).toContain('address-poisoning');
    expect(s).toContain('2026-10-21 15:43 UTC');
    expect(s).not.toMatch(/\bsafe\b|\bscam/i);
    expect(s).not.toContain('—');
  });

  it('words a payer look-alike from the payee side', async () => {
    const d = (await detectDecoy(PAYER_LOOKALIKE, 'base', deps({ transfers: TODAY })))!;
    expect(decoySentence(d)).toContain(`the sender of a real USDC payment to ${PAYEE}`);
  });

  it('says how many payees match when it cannot name one', async () => {
    const paidDecoy = real(PAYER, EARLIER_DECOY, 0.1, '0xstolen', '2026-10-21T15:44:30.000Z', FAKE_BLOCK - 15);
    const d = (await detectDecoy(PAYEE_LOOKALIKE, 'base', deps({ transfers: [...TODAY, paidDecoy] })))!;
    expect(decoySentence(d)).toContain(`the recipients of 2 real USDC payments from ${PAYER}`);
  });
});
