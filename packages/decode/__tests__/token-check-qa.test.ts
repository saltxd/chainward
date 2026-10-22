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
  logs: Array<{ address: string; topics: string[]; logIndex: number }>;
  clanker: boolean;
  clankerLaunches24h: number | null;
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
          if (addr === f.token) return blockOf(tag, f.head) >= f.launch.block ? '0x6080' : '0x';
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
          return hex(HUB_FUNDERS.has(addr) ? 10_000 : 0);
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
          return `0x${word(0n)}`;
        }
        case 'eth_getTransactionByHash':
          return p[0] === f.launch.tx ? { hash: f.launch.tx, from: f.launch.from, to: f.launch.to } : null;
        case 'eth_getTransactionReceipt':
          return p[0] === f.launch.tx ? { transactionHash: f.launch.tx, logs: f.logs.map((l) => ({ ...l, logIndex: hex(l.logIndex), data: '0x' })) } : null;
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
        return { transfers: q.fromAddress === w && f.clanker ? [{ from: w, to: q.toAddress, hash: f.launch.tx, metadata: { blockTimestamp: f.launch.time } }] : [] };
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

  // The check's cost: at most 4 more provider reads than before the QA fixes, for any of these tokens.
  it.each(Object.keys(QA))('%s: stays within the read budget', async (id) => {
    const calls: string[] = [];
    await check(id, calls);
    expect(calls.length).toBeLessThanOrEqual(BUDGET[id]!);
  });
});

/**
 * Provider reads per fresh check before the QA fixes, counted with this replay, plus 4. The bundled
 * launches stopped at launch_unknown before (12 reads); naming their launcher gives them the reads every
 * single-wallet launch gets, so their budget is the single-operation EntryPoint launch's (D2: 22) plus 4.
 */
const BUDGET: Record<string, number> = { D4: 24 + 4, D2: 22 + 4, D7: 22 + 4, V1: 22 + 4, C4: 26 + 4, V2: 24 + 4, Z1: 22 + 4, Z2: 22 + 4, Z6: 22 + 4, D10: 22 + 4, D5: 22 + 4 };
