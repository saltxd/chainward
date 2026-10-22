import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeFunctionData, encodeFunctionResult, parseAbi } from 'viem';
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
/** A wallet the check reads: the launch wallet, or the wallet a launch was made for. */
interface Wallet {
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
    value: number | null;
    rawContract: { address: string | null; value: string | null };
    blockNum: string;
    metadata: { blockTimestamp: string };
  }>;
}
interface Fixture {
  token: string;
  symbol: string;
  name: string;
  decimals: number;
  supply: string;
  head: number;
  now: string;
  launch: { block: number; time: string; tx: string; from: string; to: string | null };
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
  /** Its own transactions to launchpad contracts around the launch, as recorded. Default: the launch transaction, when it sent it. */
  launchTxs?: Array<{ hash: string; block: number; to: string }>;
  /** First funders the QA run's answer called an exchange or hub. */
  hubFunders?: string[];
  /** The wallet whose facts the check reads: the launch wallet, or for a launch made for another wallet, that wallet. */
  creator: Wallet;
  /** The wallet a launch was made for, when the fixture's `creator` is the launch wallet. */
  madeFor?: Wallet;
  firstTransfer: Move;
  mints: Move[];
  inflows: Move[];
  outflows: Move[];
  balanceDeltas: Array<[number, string]>;
  /** D6 and D8 at the second QA run: the launch wallet's transfers of the token since the first run's head, and its balance then. */
  later?: { head: number; now: string; outflows: Move[]; inflows: Move[]; tokenBalance: string };
}

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}
/** A funder's latest sends as the explorer listed them, and one EXTCODEHASH read of its recipients at the block before the earliest. */
interface FunderRecord {
  sends: Array<{ hash: string; block: number; to: string; eth: number }>;
  fresh: { before_block: number; recipients: string[]; answer: string };
}

const here = dirname(fileURLToPath(import.meta.url));
const FILE = JSON.parse(readFileSync(join(here, 'fixtures', 'rugcheck-qa-2026-10-21.json'), 'utf8')) as { tokens: Record<string, Fixture>; funders: Record<string, FunderRecord> };
const QA = FILE.tokens;

const ZERO = `0x${'0'.repeat(40)}`;
/** Base block 0. Every block since has come 2 s after the last (52,911,567 was 2026-10-21T19:54:41Z). */
const GENESIS = 1_686_789_347;
const hex = (n: number | bigint) => `0x${n.toString(16)}`;
const word = (n: bigint) => n.toString(16).padStart(64, '0');
const isoAt = (block: number) => new Date((GENESIS + 2 * block) * 1000).toISOString();
const abiString = (s: string) => {
  const h = Buffer.from(s, 'utf8').toString('hex');
  return `0x${word(32n)}${word(BigInt(Buffer.byteLength(s, 'utf8')))}${h.padEnd(Math.ceil(h.length / 64) * 64 || 64, '0')}`;
};
const blockOf = (tag: unknown, head: number) => (tag === 'latest' || tag === undefined ? head : Number(BigInt(tag as string)));
/** Alchemy's free tier, which production runs on, refuses eth_getLogs over more than 10 blocks. */
const FREE_TIER_LOG_BLOCKS = 10;
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
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
const POOL_FACTORIES = ['0x8909dc15e40173ff4699343b6eb8132c65e18ec6', '0x420dd381b31aef6683db6b902084cb0ffece40da'];
const AGGREGATE3 = parseAbi(['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)']);
const PAIR_CREATED = '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9';
/** Init code of the deployless EXTCODEHASH read, which the recorded answers belong to. */
const EXTCODEHASH_PROGRAM = '0x602b5b388110156023576020816000396000513f81602b9003602001526020016002565b602b90036020f3';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** The chain as the QA recordings show it, answering each read the check makes; anything unrecorded is refused. */
function chainOf(f: Fixture, calls: string[] = [], opts: { wideLogs?: boolean } = {}): TokenCheckDeps {
  const wallets = new Map<string, Wallet>([[f.creator.address, f.creator]]);
  if (f.madeFor) wallets.set(f.madeFor.address, f.madeFor);
  const w = f.creator.address;
  const asAlchemy = (m: Move) => ({
    from: m.from,
    to: m.to,
    value: Number(BigInt(m.raw)) / 10 ** f.decimals,
    rawContract: { value: hex(BigInt(m.raw)), address: f.token },
    hash: m.hash,
    blockNum: hex(m.block),
    metadata: { blockTimestamp: m.time },
  });
  const heldAt = (block: number) => f.balanceDeltas.filter(([b]) => b <= block).reduce((s, [, d]) => s + BigInt(d), 0n);
  const pairLogs = f.pairLogs ?? [];
  const lpTransfers = (pools: string[], fromBlock: number) =>
    pairLogs
      .filter((l) => pools.includes(l.address.toLowerCase()) && l.topics[0] === TRANSFER && Number(BigInt(l.blockNumber)) >= fromBlock)
      .map((l) => ({
        from: `0x${l.topics[1]!.slice(26)}`,
        to: `0x${l.topics[2]!.slice(26)}`,
        value: null,
        rawContract: { value: hex(BigInt(l.data)), address: l.address.toLowerCase() },
        hash: l.transactionHash,
        blockNum: l.blockNumber,
        uniqueId: `${l.transactionHash}:log:${l.logIndex}`,
        metadata: { blockTimestamp: isoAt(Number(BigInt(l.blockNumber))) },
      }));
  // The pool each factory answers for (token, paired): the PairCreated logs recorded for the token.
  const poolFor = (factory: string, a: string, b: string) => {
    const hit = (f.factoryLogs ?? []).find(
      (l) => l.address.toLowerCase() === factory && l.topics[0] === PAIR_CREATED && [a, b].every((x) => l.topics.slice(1, 3).some((t) => t.slice(26) === x.slice(2))),
    );
    return hit ? `0x${hit.data.slice(26, 66)}` : ZERO;
  };
  const ownTxs = (wallet: string) => {
    if (wallet !== w) return [];
    if (f.launchTxs) return f.launchTxs;
    if (f.factoryTxs) return f.factoryTxs.map((t) => ({ ...t, to: CLANKER_V4_FACTORY.toLowerCase() }));
    return f.launch.from === w ? [{ hash: f.launch.tx, block: f.launch.block, to: f.launch.to ?? '' }] : [];
  };
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
          const wallet = wallets.get(addr);
          if (wallet) {
            if (tag === 'latest') return wallet.code;
            if (blockOf(tag, f.head) !== wallet.weekBefore.block) throw new Error(`no recorded code for ${addr} at block ${blockOf(tag, f.head)}`);
            return wallet.weekBefore.has_code ? wallet.code : '0x';
          }
          return '0x';
        }
        case 'eth_getTransactionCount': {
          const [addr, tag] = p as [string, string];
          const wallet = wallets.get(addr);
          if (wallet) {
            if (tag === 'latest') return hex(wallet.nonce);
            if (blockOf(tag, f.head) !== wallet.weekBefore.block) throw new Error(`no recorded nonce for ${addr} at block ${blockOf(tag, f.head)}`);
            return hex(wallet.weekBefore.nonce);
          }
          return hex(HUB_FUNDERS.has(addr) || f.hubFunders?.includes(addr) ? 10_000 : 0);
        }
        case 'eth_getBalance':
          return '0x0';
        case 'eth_call': {
          const [{ to, data }, tag] = p as [{ to?: string; data: string }, string];
          // The deployless EXTCODEHASH read of a funder's recipients: answered from the recording, at the block it was made at.
          if (to === undefined) {
            const rec = Object.values(FILE.funders ?? {}).find(
              (r) => data === EXTCODEHASH_PROGRAM + r.fresh.recipients.map((a) => a.slice(2).padStart(64, '0')).join('') && blockOf(tag, f.head) === r.fresh.before_block,
            );
            if (!rec) throw new Error(`no recorded deployless read for ${data.slice(0, 140)} at ${tag}`);
            return rec.fresh.answer;
          }
          // Multicall3 over the pool factories: each answers the pool recorded for the pair, or none.
          if (to === MULTICALL3) {
            const { args } = decodeFunctionData({ abi: AGGREGATE3, data: data as `0x${string}` });
            const result = (args[0] as ReadonlyArray<{ target: string; callData: string }>).map((c) => {
              const target = c.target.toLowerCase();
              if (!POOL_FACTORIES.includes(target)) throw new Error(`unexpected multicall target ${target}`);
              const [a, b] = [`0x${c.callData.slice(34, 74)}`, `0x${c.callData.slice(98, 138)}`];
              return { success: true, returnData: `0x${poolFor(target, a, b).slice(2).padStart(64, '0')}` as `0x${string}` };
            });
            return encodeFunctionResult({ abi: AGGREGATE3, functionName: 'aggregate3', result });
          }
          if (to === CLANKER_V4_FACTORY.toLowerCase()) return `0x${word(32n)}${f.clanker ? f.token.slice(2).padStart(64, '0') : word(0n)}${word(0n)}${word(0n)}`;
          if (to !== f.token) return `0x${word(0n)}`; // the wallet's USDC balance
          if (data === '0x18160ddd') return `0x${word(BigInt(f.supply))}`;
          if (data === '0x313ce567') return `0x${word(BigInt(f.decimals))}`;
          if (data === '0x95d89b41') return abiString(f.symbol);
          if (data === '0x06fdde03') return abiString(f.name);
          if (data.startsWith('0x01ffc9a7')) return `0x${word(0n)}`;
          if (data === '0x1c7b2ff4') return `0x${w.slice(2).padStart(64, '0')}`; // Clanker's originalAdmin: the fixture's wallet
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
        case 'eth_getTransactionReceipt': {
          if (p[0] === f.launch.tx) return { transactionHash: f.launch.tx, logs: f.logs.map((l) => ({ ...l, logIndex: hex(l.logIndex), data: l.data ?? '0x' })) };
          const logs = pairLogs.filter((l) => l.transactionHash === p[0]);
          if (!logs.length) throw new Error(`no recorded receipt for ${String(p[0])}`);
          return { transactionHash: p[0], logs };
        }
        case 'eth_getLogs': {
          const q = p[0] as Parameters<typeof filterLogs>[1];
          const span = blockOf(q.toBlock, f.head) - blockOf(q.fromBlock, f.head);
          if (!opts.wideLogs && span >= FREE_TIER_LOG_BLOCKS) throw new Error('eth_getLogs: Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.');
          return filterLogs([...(f.factoryLogs ?? []), ...pairLogs], q, f.head);
        }
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
    transfers: async (raw) => {
      calls.push('transfers');
      const q = raw as { contractAddresses?: string[]; fromAddress?: string; toAddress?: string; maxCount?: string; fromBlock?: string; toBlock?: string; category?: string[]; order?: string };
      const max = q.maxCount ? Number(BigInt(q.maxCount)) : 1000;
      if (q.contractAddresses) {
        const contracts = q.contractAddresses.map((c) => c.toLowerCase());
        if (!contracts.includes(f.token)) return { transfers: lpTransfers(contracts, blockOf(q.fromBlock, f.head)).slice(0, max) };
        if (q.fromBlock === '0x0') return { transfers: [asAlchemy(f.firstTransfer)] };
        if (q.fromAddress === ZERO) return { transfers: f.mints.slice(0, max).map(asAlchemy) };
        if (q.toAddress === w) return { transfers: f.inflows.slice(0, max).map(asAlchemy) };
        if (q.fromAddress === w) return { transfers: f.outflows.slice(0, max).map(asAlchemy) };
        return { transfers: [] };
      }
      // Main's read: the launch wallet's transactions to Clanker's factory up to the launch, newest first.
      if (q.toAddress === CLANKER_V4_FACTORY.toLowerCase()) {
        if (q.fromAddress !== w || !f.clanker) return { transfers: [] };
        const rows = f.launchTxs?.filter((t) => t.to === q.toAddress) ?? f.factoryTxs ?? [{ hash: f.launch.tx, block: f.launch.block }];
        const [lo, hi] = [blockOf(q.fromBlock, f.head), blockOf(q.toBlock, f.head)];
        return {
          transfers: rows
            .filter((r) => r.block >= lo && r.block <= hi)
            .sort((a, b) => b.block - a.block)
            .slice(0, max)
            .map((r) => ({ from: w, to: q.toAddress!, hash: r.hash, metadata: { blockTimestamp: isoAt(r.block) } })),
        };
      }
      // A wallet's own transactions (external only) over a block range: what it sent to launchpad contracts, as recorded.
      if (q.fromAddress && q.category?.length === 1 && q.category[0] === 'external' && q.fromBlock) {
        const [lo, hi] = [blockOf(q.fromBlock, f.head), blockOf(q.toBlock, f.head)];
        const rows = ownTxs(q.fromAddress)
          .filter((r) => r.block >= lo && r.block <= hi)
          .sort((a, b) => (q.order === 'desc' ? b.block - a.block : a.block - b.block));
        return {
          transfers: rows.slice(0, max).map((r) => ({ from: q.fromAddress!, to: r.to || null, hash: r.hash, blockNum: hex(r.block), category: 'external', metadata: { blockTimestamp: isoAt(r.block) } })),
        };
      }
      const wallet = q.toAddress ? wallets.get(q.toAddress) : undefined;
      if (wallet) return { transfers: wallet.inbound.slice(0, max).map((t) => ({ ...t, to: wallet.address })) };
      // A funder's latest sends, newest first, as the explorer listed them.
      const funder = q.fromAddress ? FILE.funders?.[q.fromAddress] : undefined;
      if (funder) {
        return {
          transfers: funder.sends
            .slice(0, max)
            .map((s) => ({ from: q.fromAddress!, to: s.to, hash: s.hash, blockNum: hex(s.block), category: 'external', value: s.eth, metadata: { blockTimestamp: isoAt(s.block) } })),
        };
      }
      return { transfers: [] };
    },
  };
}

/** D6 and D8 as the second QA run read them: the transfers since the first run's head added, at the second run's head. */
function atRerun(f: Fixture): Fixture {
  const later = f.later!;
  const deltas = new Map(f.balanceDeltas.map(([b, d]) => [b, BigInt(d)] as const));
  for (const m of later.inflows) deltas.set(m.block, (deltas.get(m.block) ?? 0n) + BigInt(m.raw));
  for (const m of later.outflows) deltas.set(m.block, (deltas.get(m.block) ?? 0n) - BigInt(m.raw));
  return {
    ...f,
    head: later.head,
    now: later.now,
    inflows: [...f.inflows, ...later.inflows],
    outflows: [...f.outflows, ...later.outflows],
    balanceDeltas: [...deltas.entries()].sort(([a], [b]) => a - b).map(([b, d]) => [b, d.toString()] as [number, string]),
    creator: { ...f.creator, tokenBalance: later.tokenBalance },
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

  // BLOHARD (Bankr) and LEAK (Virtuals): EIP-7702 accounts whose gas was sponsored, so no transfer ever
  // reached them; each had nonce 0 and no code a week before, and became active at launch. (BOAT's launch
  // was made for another wallet: see the launch-services cases.)
  it.each([
    ['D2', '0xb250d2d6a2441dc5c18d641f809b26a626e159f2'],
    ['V1', '0x4c58d4688bf6800919a97643db4d9f765e716a31'],
  ])('%s: flags a launch wallet with no transactions a week before the launch, though no transfer ever reached it', async (id, wallet) => {
    const r = await check(id);
    expect(r.launch?.creator).toBe(wallet);
    expect(r.creator?.first_seen).toBeNull();
    expect(r.creator?.week_before_launch).toEqual({ block: QA[id]!.creator.weekBefore.block, sent_txs: 0, has_code: false });
    expect(r.flags).toContain('new_creator');
    expect(r.verdict).toEqual({
      label: 'review',
      reason: 'The wallet that launched it had not sent a single transaction a week before the launch, so its own activity began less than 7 days before the launch.',
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

  // The check's cost: at most 4 more provider reads than main (6ec33d3), with the liquidity read reworked to work on
  // Alchemy's free tier, and never an eth_getLogs over more than 10 blocks (the mock refuses it, as production does).
  it.each([...Object.keys(QA), 'D6@rerun', 'D8@rerun'])('%s: stays within the read budget', async (id) => {
    const f = id.endsWith('@rerun') ? atRerun(QA[id.split('@')[0]!]!) : QA[id]!;
    const calls: string[] = [];
    await checkToken(f.token, chainOf(f, calls));
    expect(MAIN_READS[id]).toBeDefined();
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
      // No log reads (Alchemy's free tier refuses ranges over 10 blocks): the pools from one multicall, the LP token's
      // transfers from the transfer index, and the add's and the removal's amounts from their two receipts.
      expect(calls).not.toContain('eth_getLogs');
      expect(calls.filter((m) => m === 'eth_getTransactionReceipt')).toHaveLength(3);
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

  it.each(['D10', 'D5'])('%s: reports nothing vesting to a launch wallet without a schedule', async (id) => {
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
    expect(r.verdict).toEqual({ label: 'review', reason: 'The wallet that launched it launched 169 tokens within 24 hours, this one included: 169 through Clanker.' });
    expect(r.creator?.launches_24h).toMatchObject({ total: 169, by_launchpad: { clanker: 169, doppler: 0, zora: 0, virtuals: 0, other: 0 }, span_sec: 86_396, capped: false });
    expect(r.creator?.clanker_launches_24h).toBe(169);
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

  it('P1: still answers hold on a chain source that refuses every eth_getLogs, since the liquidity read makes none', async () => {
    // Alchemy's free tier refuses eth_getLogs over more than 10 blocks (production, 2026-10-22), which made PR #80's pool
    // scan fail every plain-deploy check; PR #81 left the liquidity unread. The read now needs no log range at all.
    const deps = chainOf(QA.P1!);
    const refusing: TokenCheckDeps = {
      ...deps,
      rpc: async (method, params) => {
        if (method === 'eth_getLogs') throw new Error('eth_getLogs: Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.');
        return deps.rpc(method, params);
      },
    };
    const r = await checkToken(QA.P1!.token, refusing);
    expect(r.liquidity?.pools?.[0]?.launch_wallet?.removed_pct).toBe(100);
    expect(r.flags[0]).toBe('creator_removed_liquidity');
    expect(r.verdict.label).toBe('hold');
    expect(r.limits).not.toMatch(/could not be read/);
  });

  it('says what the liquidity read covers, in plain words', async () => {
    const r = await check('P1');
    expect(r.limits).not.toMatch(/liquidity-lock check/);
    expect(r.limits).toMatch(/Uniswap v2 and Aerodrome/);
    expect(JSON.stringify(r)).not.toMatch(/\b(safe|scam|rug|fraud)\b|—/i);
  });
});

/**
 * Provider reads per fresh check on main (6ec33d3: PR #80's liquidity and vesting reads included, its pool logs read
 * over the full range), counted with this replay. The QA-gap fixes and the liquidity rework are held to +4 over these.
 */
const MAIN_READS: Record<string, number> = {
  D4: 31,
  D2: 28,
  D7: 25,
  V1: 24,
  C4: 28,
  V2: 26,
  Z1: 26,
  Z2: 26,
  Z6: 26,
  D10: 25,
  D5: 25,
  P1: 29,
  P2: 29,
  P3: 29,
  P4: 29,
  D6: 31,
  D8: 31,
  C1: 32,
  C7: 31,
  C8: 28,
  D3: 27,
  'D6@rerun': 31,
  'D8@rerun': 31,
};

describe('rug check QA gaps (Base, 2026-10-22 re-run)', () => {
  // MONERO: the launch wallet sold its whole 16.2% dev buy 20,326 s after the launch (0x2d8f6fce…); XTO sold 90% of its
  // buy 19,870 to 19,886 s after (0x851ab0b1…, 0x534dd481…, 0xee9e08b2…). The send rule covered the first hour only, so an
  // agent checking at hour six got no flag.
  it.each([
    ['D6', 100, 20_326, 0, 100, 34_948, 'The wallet that launched it received 1,621,899,961.11 tokens in the launch transaction and had sent out 100% of them 6 hours later.'],
    ['D8', 90, 19_886, 159_230_552.304712, 90.17, 35_630, 'The wallet that launched it received 1,621,352,078.11 tokens in the launch transaction and had sent out 90% of them 6 hours later.'],
  ] as const)('%s: flags the launch tokens it sent out hours after the launch, and says when', async (id, sentPct, at90, heldNow, sentNowPct, nowAfter, reason) => {
    const f = atRerun(QA[id]!);
    const calls: string[] = [];
    const r = await checkToken(f.token, chainOf(f, calls));
    expect(r.flags).toEqual(expect.arrayContaining(['creator_sent_launch_tokens', 'creator_holds_large_share']));
    expect(r.creator?.launch_tokens).toMatchObject({ sent_pct: sentPct, sent_90pct_after_sec: at90, held_now: heldNow, sent_now_pct: sentNowPct, held_now_after_sec: nowAfter });
    expect(r.verdict).toEqual({ label: 'review', reason });
  });

  it.each(['D6', 'D8'])('%s: reads the later sends from what the check already reads: no more reads than at the first run', async (id) => {
    const [first, again] = [[] as string[], [] as string[]];
    await checkToken(QA[id]!.token, chainOf(QA[id]!, first));
    const f = atRerun(QA[id]!);
    await checkToken(f.token, chainOf(f, again));
    expect(again.length).toBe(first.length);
  });

  it('D6: does not flag the launch tokens while the launch wallet still holds them (the first run)', async () => {
    const r = await check('D6');
    expect(r.creator?.launch_tokens).toMatchObject({ sent_now_pct: 0 });
    expect(r.flags).not.toContain('creator_sent_launch_tokens');
  });

  // SUPERUSOR: sent by launch service blokeys.eth (0x3a08…) for admin 0x1705…, which launched 6 Clanker tokens itself in
  // the day before and USOR² (C9) 22 minutes after. The answer described the service.
  it('C8: reads the wallet facts of the token admin a launch service launched it for, and keeps the sender', async () => {
    const r = await check('C8');
    const admin = '0x170503c5548cc9bc89d7f3bb0e35faf7f4d1f924';
    expect(r.launch).toMatchObject({ creator: '0x3a08520042b20604c10ca225c40fd224d2244535', token_admin: admin, made_for: { address: admin, named_as: 'token_admin' } });
    expect(r.launch?.launcher_note).toMatch(/The facts below describe the token's admin, not the wallet that sent the launch\.$/);
    expect(r.creator).toMatchObject({ address: admin, role: 'made_for', week_before_launch: { block: 52_613_158, sent_txs: 1, has_code: true }, clanker_launches_24h: 8 });
    expect(r.creator?.first_funder?.address).toBe('0x6128d63647679c581f111c524c7d3f25d8d200c6');
    expect(r.creator?.launches_24h).toEqual({ total: 8, by_launchpad: { clanker: 8, doppler: 0, zora: 0, virtuals: 0, other: 0 }, span_sec: 83_832, read_to: '2026-10-22T01:18:47.000Z', capped: false });
    expect(r.flags).toContain('creator_serial_launcher');
    expect(r.flags).not.toContain('creator_shared_funder');
    expect(r.verdict).toEqual({ label: 'review', reason: 'The wallet it was launched for has 8 launches within 23 hours, this one included: 8 through Clanker.' });
  });

  // BOAT (Bankr): its clone token's launch receipt names one vesting beneficiary, 0x6d00…, not the 7702 account that sent
  // the launch (3 launches in 8 minutes). The beneficiary had never been used.
  it('D7: reads the wallet facts of the one wallet the Doppler token vests to, when that is not the sender', async () => {
    const r = await check('D7');
    const beneficiary = '0x6d00826a21a1684ef35f3281dc020d794d5df6c0';
    expect(r.launch).toMatchObject({ creator: '0x346549f6921a02d7de98530ffecf23c6e225a2bf', made_for: { address: beneficiary, named_as: 'vesting_beneficiary' } });
    expect(r.creator).toMatchObject({ address: beneficiary, role: 'made_for', first_seen: null, week_before_launch: { block: QA.D7!.creator.weekBefore.block, sent_txs: 0, has_code: false } });
    expect(r.creator?.vesting).toEqual({ amount: 15_000_000_000, pct: 15, released: 0, start: '2026-10-21T22:12:59.000Z', cliff_end: '2026-11-20T22:12:59.000Z', end: '2027-10-21T22:12:59.000Z' });
    expect(r.flags).toContain('new_creator');
    expect(r.verdict).toEqual({
      label: 'review',
      reason: 'The wallet it was launched for has never sent a transaction of its own, so it has no history to judge.',
    });
  });

  it.each(['C7', 'C1', 'C4', 'D2', 'Z1', 'V2', 'P1'])('%s: describes the launch wallet when the receipt names no other wallet', async (id) => {
    const r = await check(id);
    expect(r.launch?.made_for).toBeNull();
    expect(r.creator?.role).toBe('launch_wallet');
  });

  // LEAK: the launch wallet launched 9 tokens through Clanker in 45 minutes; checked after, the count stopped at 4.
  it('C7: counts the launch wallet\'s launches through to the check, not only up to this one', async () => {
    const r = await check('C7');
    expect(r.creator?.launches_24h).toEqual({ total: 9, by_launchpad: { clanker: 9, doppler: 0, zora: 0, virtuals: 0, other: 0 }, span_sec: 2_726, read_to: '2026-10-22T01:18:43.000Z', capped: false });
    expect(r.creator?.clanker_launches_24h).toBe(9);
    expect(r.flags).toEqual(expect.arrayContaining(['creator_sent_launch_tokens', 'new_creator', 'creator_serial_launcher']));
    expect(r.verdict.reason).toBe('The wallet that launched it received 893,885.25 tokens in the launch transaction and had sent out 100% of them 22 minutes later.');
  });

  // BSC (Doppler): a service EOA sending launches straight to Doppler's Airlock, 30 in the QA run's 6-hour window.
  it('D3: counts launches through Doppler\'s Airlock, and names the launchpad', async () => {
    const r = await check('D3');
    expect(r.creator?.launches_24h).toEqual({ total: 30, by_launchpad: { clanker: 0, doppler: 30, zora: 0, virtuals: 0, other: 0 }, span_sec: 20_024, read_to: '2026-10-22T00:16:47.000Z', capped: false });
    expect(r.creator?.clanker_launches_24h).toBeNull();
    expect(r.flags).toContain('creator_serial_launcher');
    expect(r.verdict).toEqual({ label: 'review', reason: 'The wallet that launched it launched 30 tokens within 6 hours, this one included: 30 through Doppler.' });
  });

  it.each(['D2', 'Z1', 'V2', 'D6'])('%s: counts this launch for a launch wallet with no launches straight to a launchpad', async (id) => {
    const r = await check(id);
    expect(r.creator?.launches_24h?.total).toBe(1);
    expect(r.flags).not.toContain('creator_serial_launcher');
  });

  // ANTHROPIC, LIQUIDBGT and ANTHROPIC: funded by unlabeled vanity EOAs that first-funded 50 of 59 plain-deploy launch
  // wallets in 6 hours. We called them an exchange or hub, which switched the shared-funder signal off.
  it.each([
    ['P1', '0xb3adbcff9100f2291c4e778bda2679e45f900000', 52_910_401],
    ['P2', '0xb3adbcff9100f2291c4e778bda2679e45f900000', 52_910_401],
    ['P4', '0x0e6e91775d24d34b90e0f3d806a90705f0199999', 52_913_939],
  ])('%s: reports a busy unlabeled funder as busy, and flags it when its recent recipients were brand new', async (id, funder, before) => {
    const calls: string[] = [];
    const r = await check(id, calls);
    expect(r.creator?.first_funder).toMatchObject({
      address: funder,
      exchange_or_hub: false,
      busy: true,
      funded_wallets: 13,
      recent_recipients: { checked: 13, fresh: 13, before_block: before },
    });
    expect(r.flags).toContain('creator_shared_funder');
    // Removed liquidity still leads.
    expect(r.verdict.label).toBe('hold');
  });

  it('P3: does not flag a busy funder when too few of its recent recipients were brand new', async () => {
    const r = await check('P3');
    expect(r.creator?.first_funder).toMatchObject({ busy: true, exchange_or_hub: false, recent_recipients: { checked: 3, fresh: 2, before_block: 52_918_784 } });
    expect(r.flags).not.toContain('creator_shared_funder');
  });

  it('P1: calls a funder an exchange only when ChainWard labels it a service', async () => {
    const deps = chainOf(QA.P1!);
    const funder = '0xb3adbcff9100f2291c4e778bda2679e45f900000';
    const service = {
      chain: 'base',
      address: funder,
      kind: 'service' as const,
      strength: 'weak' as const,
      visibility: 'public' as const,
      group_key: null,
      group_size: null,
      sentence: 'A known exchange hot wallet.',
      source_type: 'list' as const,
      source_ref: 'test',
      source_url: 'https://chainward.ai',
      evidence_url: null,
      as_of: '2026-10-22',
    };
    const r = await checkToken(QA.P1!.token, { ...deps, labelsFor: (address) => (address === funder ? [service] : []) });
    expect(r.creator?.first_funder).toMatchObject({ exchange_or_hub: true, busy: true, funded_wallets: null, recent_recipients: null });
    expect(r.flags).not.toContain('creator_shared_funder');
  });

  it('never reads logs over more than 10 blocks, the free-tier limit production runs on', async () => {
    for (const id of Object.keys(QA)) {
      const calls: string[] = [];
      await check(id, calls);
      expect(calls).not.toContain('eth_getLogs');
    }
  });

  it('says what the launch count, the funder and the wallet it describes cover, in plain words', async () => {
    const r = await check('C8');
    expect(r.limits).toMatch(/Zora's payout recipient/);
    expect(r.limits).toMatch(/Doppler's Airlock/);
    expect(r.limits).toMatch(/only when ChainWard's labels name it one/);
    expect(JSON.stringify(r)).not.toMatch(/\b(safe|scam|rug|fraud)\b|—/i);
  });
});
