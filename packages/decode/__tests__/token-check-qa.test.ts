import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLANKER_V4_FACTORY, checkToken, type TokenCheckDeps } from '../src/token-check.js';

// Regressions from a QA run that called the rug check on 34 tokens launched on Base on
// 2026-10-21 and checked every answer on chain. Each case replays what the check reads for
// one of the 11 tokens it got wrong: the launch receipt (the logs from the token, the
// EntryPoints and Virtuals' Bonding contracts), the token's launch mints, the launch wallet's
// transfers of the token and its balance by block (from every recorded transfer), its nonce and
// code a week before the launch, and its first inbound transfers.

interface Move {
  from: string;
  to: string;
  raw: string;
  block: number;
  time: string;
  hash: string;
}
interface Fixture {
  token: string;
  symbol: string;
  name: string;
  decimals: number;
  supply: string;
  head: number;
  now: string;
  launch: { block: number; time: string; tx: string; from: string; to: string };
  logs: Array<{ address: string; topics: string[]; data?: string; logIndex: number }>;
  clanker: boolean;
  clankerLaunches24h: number | null;
  /** The token's code, when the check's reads depend on it (a Doppler clone is an EIP-1167 proxy). Default: a full contract. */
  code?: string;
  /** Recorded eth_call answers on the token, by calldata (null: it reverted). */
  calls?: Record<string, string | null>;
  /** The Uniswap v2 factory's PairCreated logs naming the token, and the pair's LP Transfer, Mint and Burn logs. */
  factoryLogs?: RpcLog[];
  pairLogs?: RpcLog[];
  /** The launch wallet's transactions to Clanker's factory in the 24 hours up to the launch, newest first. Default: this launch. */
  factoryTxs?: Array<{ hash: string; block: number }>;
  /** First funders the QA run's answer called an exchange or hub. */
  hubFunders?: string[];
  creator: {
    address: string;
    kind: string;
    code: string;
    nonce: number;
    weekBefore: { block: number; nonce: number; has_code: boolean };
    tokenBalance: string;
    inbound: Array<{
      from: string;
      hash: string;
      category: string;
      asset: string | null;
      value: number;
      rawContract: { address: string | null; value: string };
      blockNum: string;
      metadata: { blockTimestamp: string };
    }>;
  };
  firstTransfer: Move;
  mints: Move[];
  inflows: Move[];
  outflows: Move[];
  balanceDeltas: Array<[number, string]>;
}

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const QA = (JSON.parse(readFileSync(join(here, 'fixtures', 'rugcheck-qa-2026-10-21.json'), 'utf8')) as { tokens: Record<string, Fixture> }).tokens;

const ZERO = `0x${'0'.repeat(40)}`;
/** Base block 0. Every block since has come 2 s after the last (52,911,567 was 2026-10-21T19:54:41Z). */
const GENESIS = 1_686_789_347;
const hex = (n: number | bigint) => `0x${n.toString(16)}`;
const word = (n: bigint) => n.toString(16).padStart(64, '0');
const abiString = (s: string) => {
  const h = Buffer.from(s, 'utf8').toString('hex');
  return `0x${word(32n)}${word(BigInt(Buffer.byteLength(s, 'utf8')))}${h.padEnd(Math.ceil(h.length / 64) * 64 || 64, '0')}`;
};
const blockOf = (tag: unknown, head: number) => (tag === 'latest' || tag === undefined ? head : Number(BigInt(tag as string)));
/** eth_getLogs as a node answers it: address (one or several), topics by position (null = any, a list = any of), block range. */
function filterLogs(logs: RpcLog[], q: { address?: string | string[]; topics?: Array<string | string[] | null>; fromBlock?: string; toBlock?: string }, head: number): RpcLog[] {
  const addrs = q.address === undefined ? null : (Array.isArray(q.address) ? q.address : [q.address]).map((a) => a.toLowerCase());
  const from = blockOf(q.fromBlock ?? 'latest', head);
  const to = blockOf(q.toBlock ?? 'latest', head);
  return logs.filter((l) => {
    const b = Number(BigInt(l.blockNumber));
    if (b < from || b > to || (addrs && !addrs.includes(l.address.toLowerCase()))) return false;
    return (q.topics ?? []).every((t, i) => t === null || t === undefined || (Array.isArray(t) ? t : [t]).some((x) => x.toLowerCase() === l.topics[i]?.toLowerCase()));
  });
}
/** Reads on the token that only the vesting and Clanker extension checks make: answered from the recording, or refused. */
const RECORDED_ONLY = new Set(['0xf6939d34', '0x254800d4', '0x1514617e', '0xd2482469', '0x6f503e67', '0x6d3cbe21', '0x70a08231']);
/** The funders the QA run's answers named, by whether the check called them an exchange or hub. */
const HUB_FUNDERS = new Set(['0x3aadcd657aa9d270da0f92e95bf9830f961b4f2e']);

function chainOf(f: Fixture, calls: string[] = []): TokenCheckDeps {
  const w = f.creator.address;
  const asAlchemy = (m: Move) => ({
    from: m.from,
    to: m.to,
    value: Number(BigInt(m.raw)) / 10 ** f.decimals,
    rawContract: { value: hex(BigInt(m.raw)) },
    hash: m.hash,
    blockNum: hex(m.block),
    metadata: { blockTimestamp: m.time },
  });
  const heldAt = (block: number) => f.balanceDeltas.filter(([b]) => b <= block).reduce((s, [, d]) => s + BigInt(d), 0n);
  return {
    now: () => new Date(f.now),
    rpc: async (method, params) => {
      calls.push(method);
      const p = params as unknown[];
      switch (method) {
        case 'eth_blockNumber':
          return hex(f.head);
        case 'eth_getBlockByNumber':
          return { timestamp: hex(GENESIS + 2 * blockOf(p[0], f.head)) };
        case 'eth_getCode': {
          const [addr, tag] = p as [string, string];
          if (addr === f.token) return blockOf(tag, f.head) >= f.launch.block ? (f.code ?? '0x6080') : '0x';
          if (addr === w) {
            if (tag === 'latest') return f.creator.code;
            if (blockOf(tag, f.head) !== f.creator.weekBefore.block) throw new Error(`no recorded code for the launch wallet at block ${blockOf(tag, f.head)}`);
            return f.creator.weekBefore.has_code ? f.creator.code : '0x';
          }
          return '0x';
        }
        case 'eth_getTransactionCount': {
          const [addr, tag] = p as [string, string];
          if (addr === w) {
            if (tag === 'latest') return hex(f.creator.nonce);
            if (blockOf(tag, f.head) !== f.creator.weekBefore.block) throw new Error(`no recorded nonce for the launch wallet at block ${blockOf(tag, f.head)}`);
            return hex(f.creator.weekBefore.nonce);
          }
          return hex(HUB_FUNDERS.has(addr) || f.hubFunders?.includes(addr) ? 10_000 : 0);
        }
        case 'eth_getBalance':
          return '0x0';
        case 'eth_call': {
          const [{ to, data }, tag] = p as [{ to: string; data: string }, string];
          if (to === CLANKER_V4_FACTORY.toLowerCase()) return `0x${word(32n)}${f.clanker ? f.token.slice(2).padStart(64, '0') : word(0n)}${word(0n)}${word(0n)}`;
          if (to !== f.token) return `0x${word(0n)}`; // the wallet's USDC balance
          if (data === '0x18160ddd') return `0x${word(BigInt(f.supply))}`;
          if (data === '0x313ce567') return `0x${word(BigInt(f.decimals))}`;
          if (data === '0x95d89b41') return abiString(f.symbol);
          if (data === '0x06fdde03') return abiString(f.name);
          if (data.startsWith('0x01ffc9a7')) return `0x${word(0n)}`;
          if (data === '0x1c7b2ff4') return `0x${w.slice(2).padStart(64, '0')}`; // Clanker's originalAdmin: the launch wallet
          if (data === `0x70a08231${w.slice(2).padStart(64, '0')}`) return `0x${word(tag === 'latest' ? BigInt(f.creator.tokenBalance) : heldAt(blockOf(tag, f.head)))}`;
          if (f.calls && data in f.calls) {
            if (f.calls[data] === null) throw new Error('execution reverted');
            return f.calls[data];
          }
          if (RECORDED_ONLY.has(data.slice(0, 10))) throw new Error(`no recorded answer for ${data} on ${f.symbol}`);
          return `0x${word(0n)}`;
        }
        case 'eth_getTransactionByHash':
          return p[0] === f.launch.tx ? { hash: f.launch.tx, from: f.launch.from, to: f.launch.to } : null;
        case 'eth_getTransactionReceipt':
          return p[0] === f.launch.tx ? { transactionHash: f.launch.tx, logs: f.logs.map((l) => ({ ...l, logIndex: hex(l.logIndex), data: l.data ?? '0x' })) } : null;
        case 'eth_getLogs':
          return filterLogs([...(f.factoryLogs ?? []), ...(f.pairLogs ?? [])], p[0] as Parameters<typeof filterLogs>[1], f.head);
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
    transfers: async (raw) => {
      calls.push('transfers');
      const q = raw as { contractAddresses?: string[]; fromAddress?: string; toAddress?: string; maxCount?: string; fromBlock?: string };
      const max = q.maxCount ? Number(BigInt(q.maxCount)) : 1000;
      if (q.contractAddresses) {
        if (q.fromBlock === '0x0') return { transfers: [asAlchemy(f.firstTransfer)] };
        if (q.fromAddress === ZERO) return { transfers: f.mints.slice(0, max).map(asAlchemy) };
        if (q.toAddress === w) return { transfers: f.inflows.slice(0, max).map(asAlchemy) };
        if (q.fromAddress === w) return { transfers: f.outflows.slice(0, max).map(asAlchemy) };
        return { transfers: [] };
      }
      // The launch wallet's transactions to Clanker's factory: this launch only.
      if (q.toAddress === CLANKER_V4_FACTORY.toLowerCase()) {
        if (q.fromAddress !== w || !f.clanker) return { transfers: [] };
        const rows = f.factoryTxs ?? [{ hash: f.launch.tx, block: f.launch.block }];
        const [lo, hi] = [blockOf(q.fromBlock, f.head), blockOf((q as { toBlock?: string }).toBlock, f.head)];
        return {
          transfers: rows
            .filter((r) => r.block >= lo && r.block <= hi)
            .slice(0, max)
            .map((r) => ({ from: w, to: q.toAddress!, hash: r.hash, metadata: { blockTimestamp: new Date((GENESIS + 2 * r.block) * 1000).toISOString() } })),
        };
      }
      if (q.toAddress === w) return { transfers: f.creator.inbound.slice(0, max).map((t) => ({ ...t, to: w })) };
      return { transfers: [] };
    },
  };
}

const check = (id: string, calls?: string[]) => checkToken(QA[id]!.token, chainOf(QA[id]!, calls));

describe('rug check QA regressions (Base, 2026-10-21)', () => {
  // USOE: from 32 s after launch the launch wallet made 2,002 sends of 3 to 6 tokens, then at +270 s sold
  // its whole launch buy (tx 0x758657b5...). Its first 100 transfers were all dust, so we said "sent 0%".
  it('D4: reads what the launch wallet still held an hour later, so 100 dust sends cannot hide a dump', async () => {
    const r = await check('D4');
    expect(r.flags).toContain('creator_sent_launch_tokens');
    expect(r.creator?.launch_tokens).toMatchObject({ received: 1_620_558_652.653604, first_send_after_sec: 32, sent_pct: 100, sent_1h_pct: 100, held_1h: 0 });
    expect(r.creator?.launch_tokens?.held_at_launch).toBe(1_620_558_652.653604);
    expect(r.verdict).toEqual({
      label: 'review',
      reason: 'The wallet that launched it received 1,620,558,652.65 tokens in the launch transaction and an hour later held none of them.',
    });
  });

  // BLOHARD and BOAT (Bankr) and LEAK (Virtuals): EIP-7702 accounts whose gas was sponsored, so no
  // transfer ever reached them; each had nonce 0 and no code a week before, and became active at launch.
  it.each([
    ['D2', '0xb250d2d6a2441dc5c18d641f809b26a626e159f2'],
    ['D7', '0x346549f6921a02d7de98530ffecf23c6e225a2bf'],
    ['V1', '0x4c58d4688bf6800919a97643db4d9f765e716a31'],
  ])('%s: flags a launch wallet with no transactions a week before the launch, though no transfer ever reached it', async (id, wallet) => {
    const r = await check(id);
    expect(r.launch?.creator).toBe(wallet);
    expect(r.creator?.first_seen).toBeNull();
    expect(r.creator?.week_before_launch).toEqual({ block: QA[id]!.creator.weekBefore.block, sent_txs: 0, has_code: false });
    expect(r.flags).toContain('new_creator');
    expect(r.verdict).toEqual({
      label: 'review',
      reason: 'The wallet that launched it had not sent a single transaction a week before the launch, so its own activity is less than 7 days old.',
    });
  });

  // ՍՏDߠ / ߠеthеr USD: N'Ko Na Woloso and Armenian letters spelling USDT. Its launch wallet was first
  // "seen" 153 days earlier in a 179-transfer spam airdrop (35.75 of a spam token and 0.0000000088 WETH),
  // and got its first ETH, and sent its first transaction, 6 days before the launch.
  it('C4: answers hold for a USDT spelled in N\'Ko and Armenian, and does not take the wallet\'s age from an airdrop', async () => {
    const r = await check('C4');
    expect(r.imitation).toEqual({ imitates: 'USDT', real: null });
    expect(r.verdict).toEqual({ label: 'hold', reason: 'Its name or symbol spells USDT with look-alike or hidden characters, a sign it is posing as USDT.' });
    expect(r.flags).toEqual(expect.arrayContaining(['imitates_known_token', 'new_creator']));
    expect(r.creator?.age_days_at_launch).toBeNull();
    expect(r.creator?.first_funder?.address).toBe('0x694c29ba8099f7e46364149c900c015bd75cc870');
    expect(r.creator?.first_funder?.tx).toBe('0x95639e0d0d331456159fd1654dbe350cbc324d467c321c71630c17729363833a');
  });

  // COPYTRADIN: a Virtuals Bonding V5 launch whose creator's first inbound transfer was 178 ELVT from a
  // distributor 678 days earlier; it got its first ETH, and sent its first transaction, the day before.
  it('V2: names a Virtuals Bonding V5 launch, and does not take the wallet\'s age from an old token distribution', async () => {
    const r = await check('V2');
    expect(r.launch).toMatchObject({ launcher: 'virtuals', via: '0x1a540088125d00dd3990f9da45ca0859af4d3b01', creator: '0x1f2fd1c2ed08c7a9af93d7dda1ac461c2af24603' });
    expect(r.launch?.launcher_note).toMatch(/Bonding V5/);
    expect(r.flags).toContain('new_creator');
    expect(r.creator?.age_days_at_launch).toBeNull();
    expect(r.creator?.first_funder?.address).toBe('0x6812b9ece52368950146161607f074d69db6cad4');
    expect(r.verdict.reason).not.toMatch(/678/);
  });

  it('V1: names a Virtuals Bonding V5 launch sent through a smart wallet', async () => {
    const r = await check('V1');
    expect(r.launch).toMatchObject({ launcher: 'virtuals', via: '0x0000000071727de22e5e9d8baf0edac6f37da032' });
  });

  // Zora and Doppler launches bundled with other smart wallets' operations in one EntryPoint v0.6
  // transaction: the token's first log comes inside the launching operation, just before its UserOperationEvent.
  it.each([
    ['Z1', '0x47e899dd501382d49a0d02c3a4bfe046cb49d2ad', 9],
    ['Z2', '0xa10dc472c77aacf6f8f666301460e66261fe2954', 7],
    ['Z6', '0x643fb771bb8334363eb86f497e2ad131d3c4f126', 6],
    ['D10', '0xfc0d9bcb2ad45a1b1d3d0f743ba38077e79345ce', 3],
    ['D5', '0x47e899dd501382d49a0d02c3a4bfe046cb49d2ad', 4],
  ])('%s: names the smart wallet whose operation launched the token, in a bundle of several', async (id, wallet, senders) => {
    const f = QA[id]!;
    const ops = f.logs.filter((l) => l.topics[0] === '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f');
    expect(new Set(ops.map((l) => l.topics[2])).size).toBe(senders);
    const r = await check(id);
    expect(r.launch).toMatchObject({ creator: wallet, via: '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789' });
    expect(r.flags).not.toContain('launch_unknown');
    // Smart wallets 296 to 582 days old, with code and a nonce a week before the launch.
    expect(r.creator?.week_before_launch).toMatchObject({ has_code: true, sent_txs: 1 });
    expect(r.flags).not.toContain('new_creator');
  });

  // The check's cost: at most 4 more provider reads than main before the liquidity and vesting reads.
  it.each(Object.keys(QA))('%s: stays within the read budget', async (id) => {
    const calls: string[] = [];
    await check(id, calls);
    expect(calls.length).toBeLessThanOrEqual(MAIN_READS[id]! + 4);
  });
});

const WETH = '0x4200000000000000000000000000000000000006';

describe('rug check QA: liquidity the launch wallet removed, and supply it will control', () => {
  // ANTHROPIC, LIQUIDBGT, openhuman and ANTHROPIC: plain deploys from one script. The launch wallet put the whole
  // supply and 1.6 (P3: 15) WETH into a new Uniswap v2 pair, then sent all its LP tokens back to the pair 11 to 38
  // minutes after the launch. We said only "new wallet" (P3: "still holds 83.1%", the tokens the removal returned).
  it.each([
    ['P1', '0x361500aadbb98d42139b95dfa8fe0d8d5aab4801', 1.6, 5_600_000_000, 46, 2.023640527057826, 4_431_732_304.788401, 99.99, 654, '0x7e9150c10af5f0d467cffc713f7e4565fe288e95422b2e3bc5daeb56ffa80f4e', '11 minutes', '2.02', '1.6'],
    ['P2', '0xce6559dc93c5bc3bceb39508c17e93aba32d821c', 1.6, 5_600_000_000, 26, 1.9985606042839297, 4_488_379_433.687187, 99.98, 972, '0xc6e2b18a236c104461a93cc0bbffb2d69c01416fb0b25814a397e8fa11560a53', '16 minutes', '2', '1.6'],
    ['P3', '0x3cc17a4be9ae48f90762dda3f3ecd628eecc3e99', 15, 9_900_000_000, 14, 18.05676516731827, 8_227_868_038.12006, 99.99, 2258, '0x5d2e3b2f3e60c8865a73f1413d7c42841d6ba27fd2f66a1846db12f3391d3645', '38 minutes', '18.06', '15'],
    ['P4', '0xe263abe60d19c59065f912ade7aee4d8d45dfc47', 1.6, 5_600_000_000, 46, 2.019397807868855, 4_441_652_371.293971, 99.98, 968, '0xf59379b4aca3835fe37f35603242d28e1472736da2c26f8c513340ed5e5f21db', '16 minutes', '2.02', '1.6'],
  ] as const)(
    '%s: answers hold when the launch wallet removed the liquidity it added',
    async (id, pool, added, addedTokens, addedAfter, removed, removedTokens, poolPct, removedAfter, tx, when, removedText, addedText) => {
      const calls: string[] = [];
      const r = await check(id, calls);
      expect(r.liquidity).toEqual({
        locked_by: null,
        capped: false,
        pools: [
          {
            address: pool,
            dex: 'uniswap_v2',
            paired_with: WETH,
            paired_symbol: 'WETH',
            launch_wallet: {
              added,
              added_tokens: addedTokens,
              added_after_sec: addedAfter,
              removed,
              removed_tokens: removedTokens,
              removed_pct: 100,
              pool_pct: poolPct,
              removed_after_sec: removedAfter,
              removal_tx: tx,
            },
          },
        ],
      });
      expect(r.flags[0]).toBe('creator_removed_liquidity');
      expect(r.verdict).toEqual({
        label: 'hold',
        reason: `The wallet that launched it removed its liquidity from the token's Uniswap v2 pool ${when} after the launch: it took out ${removedText} WETH, ${poolPct}% of what the pool held, after putting in ${addedText} WETH.`,
      });
      // The factories' creation logs (the token as token0, then as token1) and the pair's LP logs; WETH needs no decimals read.
      expect(calls.filter((m) => m === 'eth_getLogs')).toHaveLength(3);
    },
  );

  // Clanker, Zora, Doppler and Virtuals hold the pool's liquidity themselves: no pool reads for their tokens.
  it.each([
    ['C1', 'clanker'],
    ['C4', 'clanker'],
    ['Z1', 'zora'],
    ['Z2', 'zora'],
    ['Z6', 'zora'],
    ['D4', 'doppler'],
    ['D2', 'doppler'],
    ['D6', 'doppler'],
    ['D8', 'doppler'],
    ['V1', 'virtuals'],
    ['V2', 'virtuals'],
  ])('%s: reads no pools for a launchpad that locks the liquidity (%s)', async (id, pad) => {
    const calls: string[] = [];
    const r = await check(id, calls);
    expect(r.liquidity).toEqual({ locked_by: pad, pools: null, capped: false });
    expect(calls).not.toContain('eth_getLogs');
    expect(r.flags).not.toContain('creator_removed_liquidity');
  });

  // MONERO and XTO: Doppler tokens that vest 80% of the supply to the launch wallet (getVestingDataOf), over a year
  // (MONERO) or a day (XTO), on top of the 16.21% each bought at launch. We said no_flags (MONERO) and "new wallet" (XTO).
  it.each([
    ['D6', '2026-10-21T20:27:33.000Z', '2027-10-21T20:27:33.000Z', '2027-10-21'],
    ['D8', '2026-10-21T21:15:39.000Z', '2026-10-22T21:15:39.000Z', '2026-10-22'],
  ])('%s: counts the supply vesting to the launch wallet toward its share', async (id, start, end, endDate) => {
    const r = await check(id);
    expect(r.creator?.holds_pct).toBe(16.21);
    expect(r.creator?.vesting).toEqual({ amount: 8_000_000_000, pct: 80, released: 0, start, cliff_end: null, end });
    expect(r.creator?.holds_with_vesting_pct).toBe(96.21);
    expect(r.flags).toContain('creator_holds_large_share');
    expect(r.verdict).toEqual({
      label: 'review',
      reason: `The wallet that launched it holds 16.21% of the supply and will receive another 80% as it vests, in full by ${endDate}.`,
    });
  });

  // USOE: the launch wallet sold its launch buy, and 80% of the supply still vests to it over a year.
  it('D4: reports the 80% vesting to a launch wallet that sold everything it held', async () => {
    const r = await check('D4');
    expect(r.creator?.vesting).toEqual({ amount: 8_000_000_000, pct: 80, released: 0, start: '2026-10-21T19:54:41.000Z', cliff_end: null, end: '2027-10-21T19:54:41.000Z' });
    expect(r.creator?.holds_with_vesting_pct).toBe(80);
    expect(r.flags).toEqual(expect.arrayContaining(['creator_sent_launch_tokens', 'creator_holds_large_share']));
    expect(r.verdict.reason).toMatch(/^The wallet that launched it received 1,620,558,652.65 tokens/);
  });

  // BLOHARD (Bankr): a clone of Doppler's multi-schedule token, where getVestingDataOf reverts. One schedule vests
  // 15% of the supply to the launch wallet: a 30-day cliff, then over a year. Under the 20% line on its own.
  it('D2: reads the vesting schedule of a Doppler clone token', async () => {
    const r = await check('D2');
    expect(r.creator?.vesting).toEqual({
      amount: 15_000_000_000,
      pct: 15,
      released: 0,
      start: '2026-10-21T20:43:29.000Z',
      cliff_end: '2026-11-20T20:43:29.000Z',
      end: '2027-10-21T20:43:29.000Z',
    });
    expect(r.creator?.holds_with_vesting_pct).toBe(15);
    expect(r.flags).not.toContain('creator_holds_large_share');
  });

  it.each(['D7', 'D10', 'D5'])('%s: reports nothing vesting to a launch wallet without a schedule', async (id) => {
    const r = await check(id);
    expect(r.creator?.vesting).toEqual({ amount: 0, pct: 0, released: 0, start: null, cliff_end: null, end: null });
  });

  it.each(['P1', 'C1', 'C4', 'Z1', 'V2'])('%s: reads no vesting off Doppler', async (id) => {
    const r = await check(id);
    expect(r.creator?.vesting).toBeNull();
  });

  // XCHAT: a 169-launches-a-day wallet put 82% of the supply in Clanker's airdrop contract and 5% in its vault, both
  // with itself as the admin. Reported apart from what it holds; not counted toward the large-share rule.
  it("C1: reports the supply in Clanker's vault and airdrop for the launch wallet, apart from what it holds", async () => {
    const r = await check('C1');
    const wallet = '0x1afab1f6b0d565544effb26fca7d6b5e9cb46c81';
    expect(r.supply.extensions).toEqual([
      {
        contract: '0x8e845ead15737bf71904a30bddd3aee76d6adf6c',
        kind: 'vault',
        at_launch: 5_000_000_000,
        at_launch_pct: 5,
        holds: 5_000_000_000,
        holds_pct: 5,
        admin_at_launch: wallet,
        unlocks: '2026-10-28T19:25:09.000Z',
        vested: '2026-10-28T19:25:09.000Z',
      },
      {
        contract: '0xf652b3610d75d81871bf96db50825d9af28391e0',
        kind: 'airdrop',
        at_launch: 82_000_000_000,
        at_launch_pct: 82,
        holds: 82_000_000_000,
        holds_pct: 82,
        admin_at_launch: wallet,
        unlocks: '2026-10-22T19:25:09.000Z',
        vested: '2026-10-22T19:25:09.000Z',
      },
    ]);
    expect(r.creator).toMatchObject({ holds_pct: 0, vesting: null, holds_with_vesting_pct: 0, extensions_pct: 87 });
    expect(r.flags).toEqual(['creator_serial_launcher']);
    expect(r.verdict).toEqual({ label: 'review', reason: 'The wallet that launched it launched 169 tokens through Clanker in the 24 hours up to and including this one.' });
  });

  it.each(['P1', 'D6', 'Z1'])('%s: reads no Clanker extensions off Clanker', async (id) => {
    const r = await check(id);
    expect(r.supply.extensions).toBeNull();
    expect(r.creator?.extensions_pct).toBeNull();
  });

  it('C4: reports no extension supply for a Clanker launch that set none aside', async () => {
    const r = await check('C4');
    expect(r.supply.extensions).toEqual([]);
    expect(r.creator?.extensions_pct).toBe(0);
  });

  it('P1: still answers when the chain source refuses the pool log reads, and says the liquidity was not read', async () => {
    // Alchemy's free tier refuses eth_getLogs over more than 10 blocks (production, 2026-10-22): the pool scan must not
    // turn a whole check into "sources unavailable".
    const deps = chainOf(QA.P1!);
    const refusing: TokenCheckDeps = {
      ...deps,
      rpc: async (method, params) => {
        if (method === 'eth_getLogs') throw new Error('eth_getLogs: Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.');
        return deps.rpc(method, params);
      },
    };
    const r = await checkToken(QA.P1!.token, refusing);
    expect(r.liquidity).toEqual({ locked_by: null, pools: null, capped: false });
    expect(r.flags).not.toContain('creator_removed_liquidity');
    expect(r.flags).toContain('new_creator');
    expect(r.verdict.label).toBe('review');
    expect(r.limits).toMatch(/liquidity of its pools could not be read/);
  });

  it('says what the liquidity read covers, in plain words', async () => {
    const r = await check('P1');
    expect(r.limits).not.toMatch(/liquidity-lock check/);
    expect(r.limits).toMatch(/Uniswap v2 and Aerodrome/);
    expect(JSON.stringify(r)).not.toMatch(/\b(safe|scam|rug|fraud)\b|—/i);
  });
});

/**
 * Provider reads per fresh check on main before the liquidity and vesting reads, counted with this replay.
 * The QA fixes (PR #79) were held to +4 over the check before them; these reads are held to +4 over main.
 */
const MAIN_READS: Record<string, number> = {
  D4: 28,
  D2: 24,
  D7: 24,
  V1: 24,
  C4: 28,
  V2: 26,
  Z1: 26,
  Z2: 26,
  Z6: 26,
  D10: 24,
  D5: 24,
  P1: 26,
  P2: 26,
  P3: 26,
  P4: 26,
  D6: 28,
  D8: 28,
  C1: 30,
};
