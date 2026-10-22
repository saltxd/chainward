import { decodeFunctionData, encodeFunctionResult, parseAbi } from 'viem';
import { describe, expect, it } from 'vitest';
import { OFAC_SNAPSHOT } from '../src/ofac-snapshot.js';
import { CLANKER_V4_FACTORY, checkToken } from '../src/token-check.js';
import type { WalletLookupDeps } from '../src/wallet-lookup.js';

// The token check (rug check): who launched a Base token, how, and what the
// launch wallet and the supply did afterwards. Facts with a verdict, never "safe".
// Cases follow real tokens read on 2026-10-20: CLK2 (a copycat whose creator
// minted to itself after launch), HOOK (a Clanker launch whose creator sent out its
// launch buy 26 s later), USDC (a proxy whose code predates its first transfer).

const NOW = new Date('2026-10-20T00:00:00Z');
const TOKEN = `0x${'7'.repeat(40)}`;
const CREATOR = `0x${'c'.repeat(40)}`;
const FUNDER = `0x${'f'.repeat(40)}`;
const POOL = `0x${'9'.repeat(40)}`;
const ZERO = `0x${'0'.repeat(40)}`;
const LAUNCH_BLOCK = 30_000_000;
const LAUNCH_TIME = '2026-05-09T15:29:25.000Z';
const LAUNCH_TX = `0x${'1'.repeat(64)}`;
const HEAD = 52_800_000;
const ts = (iso: string, sec: number) => new Date(new Date(iso).getTime() + sec * 1000).toISOString();
const days = (n: number) => ts(LAUNCH_TIME, -n * 86_400);
const word = (n: bigint) => n.toString(16).padStart(64, '0');
// Byte length, not UTF-16 length: the look-alike symbols are multi-byte.
const abiString = (s: string) => {
  const hex = Buffer.from(s, 'utf8').toString('hex');
  return `0x${word(32n)}${word(BigInt(Buffer.byteLength(s, 'utf8')))}${hex.padEnd(Math.ceil(hex.length / 64) * 64 || 64, '0')}`;
};
const SUPPLY = 1_000_000n * 10n ** 18n;
const BONDING = '0xf66dea7b3e897cd44a5a231c61b6b4423d613259';
const topic = (a: string) => `0x${a.slice(2).padStart(64, '0')}`;

interface Transfer {
  from: string;
  to: string;
  /** Raw units, when the test needs them exact; otherwise derived from value (18 decimals). */
  raw?: bigint;
  /** Alchemy leaves value null for tokens it has no decimals for. */
  nullValue?: boolean;
  value: number;
  hash: string;
  block: number;
  time: string;
}

interface Chain {
  code?: boolean; // token has code at head
  /** symbol() and name() of the token. Default CLK2 / ClankerToken. */
  symbol?: string;
  name?: string;
  codeFromBlock?: number; // first block with token code (default LAUNCH_BLOCK)
  totalSupply?: bigint | null; // null = totalSupply() reverts
  transfers?: Transfer[]; // token transfers, any order
  launchTx?: { hash: string; from: string; to: string | null };
  receipts?: Array<{ transactionHash: string; contractAddress: string | null; logs: Array<{ address: string }> }>;
  clanker?: boolean;
  creatorBalance?: bigint;
  creatorFirstInbound?: { from: string; time: string; hash: string } | null;
  creatorCode?: string;
  creatorNonce?: number;
  funderNonce?: number;
  launchReceiptLogs?: Array<{ address: string; topics: string[]; data?: string }>;
  /** The creator Virtuals' Bonding contract records for the graduated prototype. */
  virtualsCreator?: string;
  /** An ERC-721 collection: no decimals(), and supportsInterface(ERC-721) is true. */
  nft?: boolean;
  /** Every asset-transfer query made, for tests about the queries themselves. */
  queries?: Array<Record<string, unknown>>;
  /** eth_calls the provider refuses ('registry', or a selector on the token), as a throttled RPC does. */
  failCalls?: string[];
  /** ClankerToken originalAdmin(), the admin set at launch; null = it reverts. Default: the launch transaction's sender. */
  originalAdmin?: string | null;
  /** ClankerToken admin(), the current admin, which updateAdmin can change after launch. Default: originalAdmin. */
  currentAdmin?: string;
  /** Launch transactions to Clanker's factory in the 24 hours up to this launch, newest first (this launch's own first). */
  factoryLaunches?: number;
  /** More transactions to the factory, older than 24 hours before the launch. */
  factoryOlder?: number;
  /** This launch did not go straight from the launch wallet to the factory (a router or multicall in between). */
  factoryOmitsLaunch?: boolean;
  /** The wallet whose transactions to the factory exist. Default: the launch transaction's sender. */
  factoryWallet?: string;
  /** The asset-transfer read of the factory transactions fails, as a throttled provider does. */
  failFactory?: boolean;
  /** Every eth_call made, as `to:selector`. */
  calls?: string[];
  /** Block timestamps (seconds) by block number; without it every block reads as the launch's. */
  timestampOf?: (block: number) => number;
  head?: number;
  now?: Date;
  /** The launch wallet's nonce and code at any past block (the reads a week before the launch). */
  weekBefore?: { nonce: number; code?: string };
  /** Every read made at a past block, as `method:address:block` (balanceOf as `balanceOf:address:block`). */
  pastReads?: string[];
  /** Logs eth_getLogs answers from, filtered as a node filters them; or a refusal. */
  logs?: RpcLog[];
  /** A refusal of the pool reads it names: the pool lookup (the multicall eth_call), or the pools' LP-token transfers. */
  failPools?: { on: 'lookup' | 'lp'; message: string };
  /** The pools' LP-token transfers fill the read's page (1,000), so the read is capped. */
  lpPageFull?: boolean;
  /** Doppler's legacy vesting data on the token: getVestingDataOf(launch wallet), vestingStart, vestingDuration. */
  vesting?: { total: bigint; released: bigint; start: number; duration: number };
  /** decimals() of other contracts (a pool's paired token). */
  decimalsOf?: Record<string, number>;
}

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

/** eth_getLogs as a node answers it: address (one or several), topics by position (null = any, a list = any of), block range. */
function filterLogs(logs: RpcLog[], q: { address?: string | string[]; topics?: Array<string | string[] | null>; fromBlock?: string; toBlock?: string }, head: number): RpcLog[] {
  const at = (tag: string | undefined) => (tag === undefined || tag === 'latest' ? head : Number(BigInt(tag)));
  const addrs = q.address === undefined ? null : (Array.isArray(q.address) ? q.address : [q.address]).map((a) => a.toLowerCase());
  return logs.filter((l) => {
    const b = Number(BigInt(l.blockNumber));
    if (b < at(q.fromBlock) || b > at(q.toBlock) || (addrs && !addrs.includes(l.address.toLowerCase()))) return false;
    return (q.topics ?? []).every((t, i) => t === null || t === undefined || (Array.isArray(t) ? t : [t]).some((x) => x.toLowerCase() === l.topics[i]?.toLowerCase()));
  });
}

function deps(c: Chain, log: string[] = []): WalletLookupDeps {
  const codeFrom = c.codeFromBlock ?? LAUNCH_BLOCK;
  const tokenTransfers = [...(c.transfers ?? [])].sort((a, b) => a.block - b.block);
  const rawOf = (t: Transfer) => t.raw ?? BigInt(Math.round(t.value * 1e6)) * 10n ** 12n;
  const asAlchemy = (t: Transfer) => ({
    from: t.from,
    to: t.to,
    value: t.nullValue ? null : t.value,
    rawContract: { value: `0x${rawOf(t).toString(16)}` },
    hash: t.hash,
    blockNum: `0x${t.block.toString(16)}`,
    metadata: { blockTimestamp: t.time },
  });
  const head = c.head ?? HEAD;
  return {
    now: () => c.now ?? NOW,
    rpc: async (method, params) => {
      log.push(method);
      const p = params as unknown[];
      if ((method === 'eth_getTransactionCount' || method === 'eth_getCode') && p[0] === CREATOR && p[1] !== 'latest') {
        c.pastReads?.push(`${method}:${CREATOR}:${p[1]}`);
        return method === 'eth_getCode' ? (c.weekBefore?.code ?? c.creatorCode ?? '0x') : `0x${(c.weekBefore?.nonce ?? c.creatorNonce ?? 40).toString(16)}`;
      }
      switch (method) {
        case 'eth_blockNumber':
          return `0x${head.toString(16)}`;
        case 'eth_getCode': {
          const [addr, block] = p as [string, string];
          if (addr === TOKEN) {
            if (c.code === false) return '0x';
            const b = block === 'latest' ? head : Number(BigInt(block));
            return b >= codeFrom ? '0x6080' : '0x';
          }
          if (addr === CREATOR) return c.creatorCode ?? '0x';
          return '0x';
        }
        case 'eth_call': {
          const [{ to, data }, tag] = p as [{ to: string; data: string }, string];
          // Multicall3 over the pool factories: each answers the pool its creation log names for the pair, or none.
          if (to === MULTICALL3) {
            c.calls?.push(`${to}:aggregate3`);
            if (c.failPools?.on === 'lookup') throw new Error(c.failPools.message);
            const { args } = decodeFunctionData({ abi: AGGREGATE3, data: data as `0x${string}` });
            const result = (args[0] as ReadonlyArray<{ target: string; callData: string }>).map((call) => {
              const [a, b] = [`0x${call.callData.slice(34, 74)}`, `0x${call.callData.slice(98, 138)}`];
              const created = (c.logs ?? []).find(
                (l) => l.address === call.target.toLowerCase() && [T.pairCreated, T.poolCreated].includes(l.topics[0]!) && [a, b].every((x) => l.topics.slice(1, 3).includes(topic(x))),
              );
              return { success: true, returnData: `0x${(created ? created.data.slice(26, 66) : '0'.repeat(40)).padStart(64, '0')}` as `0x${string}` };
            });
            return encodeFunctionResult({ abi: AGGREGATE3, functionName: 'aggregate3', result });
          }
          // A balance at a past block: what the token's transfers had left the address with by then.
          if (to === TOKEN && data.startsWith('0x70a08231') && tag !== 'latest') {
            if (c.failCalls?.includes('0x70a08231')) throw new Error('eth_call: Your app has exceeded its compute units per second capacity');
            const who = `0x${data.slice(-40)}`;
            c.pastReads?.push(`balanceOf:${who}:${tag}`);
            const upTo = tokenTransfers.filter((t) => t.block <= Number(BigInt(tag)));
            const held = upTo.reduce((s, t) => s + (t.to === who ? rawOf(t) : 0n) - (t.from === who ? rawOf(t) : 0n), 0n);
            return `0x${word(held)}`;
          }
          c.calls?.push(`${to}:${data.slice(0, 10)}`);
          const key = to === CLANKER_V4_FACTORY.toLowerCase() ? 'registry' : to === TOKEN ? data.slice(0, 10) : null;
          if (key && c.failCalls?.includes(key)) throw new Error('eth_call: Your app has exceeded its compute units per second capacity');
          if (to === BONDING && data.startsWith('0xf5dab711') && c.virtualsCreator) {
            const prototype = `0x${data.slice(34)}`;
            return `0x${[c.virtualsCreator, prototype, POOL, TOKEN].map((a) => a.slice(2).padStart(64, '0')).join('')}`;
          }
          if (to === CLANKER_V4_FACTORY.toLowerCase()) {
            const tokenWord = c.clanker ? TOKEN.slice(2).padStart(64, '0') : word(0n);
            return `0x${word(32n)}${tokenWord}${word(0n)}${word(0n)}`;
          }
          if (to === TOKEN) {
            if (data === '0x18160ddd') {
              if (c.totalSupply === null) throw new Error('execution reverted');
              return `0x${word(c.totalSupply ?? SUPPLY)}`;
            }
            if (data === '0x313ce567') {
              if (c.nft) throw new Error('execution reverted');
              return `0x${word(18n)}`;
            }
            if (data.startsWith('0x01ffc9a7')) return `0x${word(c.nft && data.slice(10, 18) === '80ac58cd' ? 1n : 0n)}`;
            if (data === '0x95d89b41') return abiString(c.symbol ?? 'CLK2');
            if (data === '0x06fdde03') return abiString(c.name ?? 'ClankerToken');
            if (data.startsWith('0x70a08231')) return `0x${word(c.creatorBalance ?? 0n)}`;
            if (data === '0x1c7b2ff4') {
              if (c.originalAdmin === null) throw new Error('execution reverted');
              return `0x${(c.originalAdmin ?? c.launchTx?.from ?? CREATOR).slice(2).padStart(64, '0')}`;
            }
            if (data === '0xf851a440') return `0x${(c.currentAdmin ?? c.originalAdmin ?? c.launchTx?.from ?? CREATOR).slice(2).padStart(64, '0')}`;
            if (data.startsWith('0xf6939d34') && c.vesting) return `0x${word(c.vesting.total)}${word(c.vesting.released)}`;
            if (data === '0x254800d4' && c.vesting) return `0x${word(BigInt(c.vesting.start))}`;
            if (data === '0x1514617e' && c.vesting) return `0x${word(BigInt(c.vesting.duration))}`;
          }
          if (data === '0x313ce567' && c.decimalsOf?.[to] !== undefined) return `0x${word(BigInt(c.decimalsOf[to]!))}`;
          return `0x${word(0n)}`; // USDC balanceOf in the wallet lookup
        }
        case 'eth_getTransactionByHash': {
          const tx = c.launchTx ?? { hash: LAUNCH_TX, from: CREATOR, to: null };
          return p[0] === tx.hash ? { hash: tx.hash, from: tx.from, to: tx.to } : null;
        }
        case 'eth_getBlockReceipts':
          return c.receipts ?? [];
        case 'eth_getTransactionReceipt':
          if (p[0] !== (c.launchTx?.hash ?? LAUNCH_TX)) return { transactionHash: p[0], logs: (c.logs ?? []).filter((l) => l.transactionHash === p[0]) };
          return { transactionHash: p[0], logs: (c.launchReceiptLogs ?? []).map((l) => ({ data: '0x', ...l })) };
        case 'eth_getBlockByNumber': {
          const b = p[0] === 'latest' ? head : Number(BigInt(p[0] as string));
          const sec = c.timestampOf ? c.timestampOf(b) : Math.floor(new Date(LAUNCH_TIME).getTime() / 1000);
          return { timestamp: `0x${Math.floor(sec).toString(16)}` };
        }
        case 'eth_getTransactionCount': {
          const addr = p[0] as string;
          if (addr === CREATOR) return `0x${(c.creatorNonce ?? 40).toString(16)}`;
          if (addr === FUNDER) return `0x${(c.funderNonce ?? 3).toString(16)}`;
          return '0x0';
        }
        case 'eth_getBalance':
          return '0x0';
        case 'eth_getLogs': {
          // Alchemy's free tier, which production runs on, refuses ranges over 10 blocks.
          const q = p[0] as Parameters<typeof filterLogs>[1];
          const at = (tag: string | undefined) => (tag === undefined || tag === 'latest' ? head : Number(BigInt(tag)));
          if (at(q.toBlock) - at(q.fromBlock) >= 10) throw new Error('eth_getLogs: Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.');
          return filterLogs(c.logs ?? [], q, head);
        }
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
    transfers: async (raw) => {
      c.queries?.push(raw);
      const q = raw as { contractAddresses?: string[]; fromAddress?: string; toAddress?: string; order?: string; maxCount?: string; fromBlock?: string; category?: string[] };
      log.push(`transfers:${q.contractAddresses ? 'token' : 'wallet'}:${q.fromAddress === ZERO ? 'mints' : q.fromAddress ? 'from' : q.toAddress ? 'to' : 'all'}`);
      const max = q.maxCount ? Number(BigInt(q.maxCount)) : 1000;
      // The pools' LP-token transfers, oldest first, from their Transfer logs.
      if (q.contractAddresses && !q.contractAddresses.includes(TOKEN)) {
        if (c.failPools?.on === 'lp') throw new Error(c.failPools.message);
        const pools = q.contractAddresses.map((a) => a.toLowerCase());
        const rows = (c.logs ?? [])
          .filter((l) => pools.includes(l.address) && l.topics[0] === T.transfer)
          .map((l) => ({
            from: `0x${l.topics[1]!.slice(26)}`,
            to: `0x${l.topics[2]!.slice(26)}`,
            value: null,
            rawContract: { value: `0x${BigInt(l.data).toString(16)}`, address: l.address },
            hash: l.transactionHash,
            blockNum: l.blockNumber,
            uniqueId: `${l.transactionHash}:log:${l.logIndex}`,
            metadata: { blockTimestamp: ts(LAUNCH_TIME, (Number(BigInt(l.blockNumber)) - LAUNCH_BLOCK) * 2) },
          }));
        const filler = c.lpPageFull ? Array.from({ length: 1000 - rows.length }, (_, i) => ({ ...rows[0]!, hash: `0xlp${i}`, uniqueId: `0xlp${i}:log:0x0` })) : [];
        return { transfers: [...rows, ...filler].slice(0, max) };
      }
      if (q.contractAddresses) {
        let list = tokenTransfers;
        if (q.fromBlock) list = list.filter((t) => t.block >= Number(BigInt(q.fromBlock!)));
        if (q.fromAddress) list = list.filter((t) => t.from === q.fromAddress);
        if (q.toAddress) list = list.filter((t) => t.to === q.toAddress);
        if (q.order === 'desc') list = [...list].reverse();
        return { transfers: list.slice(0, max).map(asAlchemy) };
      }
      // A wallet's own transactions around the launch (external only), newest first, with block times: its launches
      // straight to Clanker's factory.
      if (q.fromAddress && q.category?.length === 1 && q.category[0] === 'external' && q.fromBlock) {
        if (c.failFactory) throw new Error('alchemy_getAssetTransfers: Your app has exceeded its compute units per second capacity');
        const owner = c.factoryWallet ?? c.launchTx?.from ?? CREATOR;
        if (q.fromAddress !== owner) return { transfers: [] };
        const within = c.factoryLaunches ?? 0;
        const rows: Array<{ hash: string; sec: number }> = [];
        for (let i = 0; i < within; i++) rows.push({ hash: i === 0 && !c.factoryOmitsLaunch ? LAUNCH_TX : `0xl${i}`, sec: -Math.floor((i * 86_000) / within) });
        for (let j = 0; j < (c.factoryOlder ?? 0); j++) rows.push({ hash: `0xo${j}`, sec: -86_400 - 3_600 * (j + 1) });
        return {
          transfers: rows.slice(0, max).map((r) => ({ from: owner, to: CLANKER_V4_FACTORY.toLowerCase(), hash: r.hash, value: 0, metadata: { blockTimestamp: ts(LAUNCH_TIME, r.sec) } })),
        };
      }
      // The wallet lookup of the creator and its funder (no contract filter).
      if (q.toAddress === CREATOR) {
        const first = c.creatorFirstInbound === undefined ? { from: FUNDER, time: days(200), hash: '0xf1' } : c.creatorFirstInbound;
        return { transfers: first ? [{ from: first.from, to: CREATOR, hash: first.hash, metadata: { blockTimestamp: first.time } }] : [] };
      }
      return { transfers: [] };
    },
  };
}

const mint = (to: string, value: number, block: number, hash: string, secAfterLaunch = 0): Transfer => ({
  from: ZERO,
  to,
  value,
  hash,
  block,
  time: ts(LAUNCH_TIME, secAfterLaunch),
});

describe('checkToken: tokens passing for a well-known one', () => {
  // The fake USDC airdropped by an address-poisoning bot on Base, 2026-10-21 (0x72846b6b…).
  it('answers hold for a token whose symbol passes for USDC, and names the real USDC', async () => {
    const r = await checkToken(TOKEN, deps({ symbol: 'ሀ‌‍Ѕ​‌D​​С', name: 'USD Coin', transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], creatorBalance: SUPPLY / 20n }));
    expect(r.flags[0]).toBe('imitates_known_token');
    expect(r.imitation).toEqual({ imitates: 'USDC', real: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' });
    expect(r.verdict).toEqual({ label: 'hold', reason: 'It passes itself off as USDC, but it is not: the real USDC on Base is 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913.' });
  });

  // A launch-mill token on Base (0x06cbcba1…) whose symbol spells "TetherUSD" in Cyrillic and Armenian.
  it('answers hold for a look-alike Tether without naming a contract it cannot vouch for', async () => {
    const r = await checkToken(TOKEN, deps({ symbol: 'ТеthеrՍՏD ​‌​‍​', transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], creatorBalance: SUPPLY / 20n }));
    expect(r.imitation).toEqual({ imitates: 'USDT', real: null });
    expect(r.verdict).toEqual({ label: 'hold', reason: 'Its name or symbol spells USDT with look-alike or hidden characters, a sign it is posing as USDT.' });
  });

  // The real fake USDC (0x72846b6b…) only emits Transfer events: totalSupply() reverts.
  it('still answers hold for a USDC look-alike that is not a full ERC-20', async () => {
    const r = await checkToken(TOKEN, deps({ symbol: 'ሀ‌‍Ѕ​‌D​​С', totalSupply: null }));
    expect(r.flags).toEqual(['not_a_token', 'imitates_known_token']);
    expect(r.imitation).toEqual({ imitates: 'USDC', real: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' });
    expect(r.verdict).toEqual({ label: 'hold', reason: 'It passes itself off as USDC, but it is not: the real USDC on Base is 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913.' });
  });

  it('leaves an ordinary token alone', async () => {
    const r = await checkToken(TOKEN, deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], creatorBalance: SUPPLY / 20n }));
    expect(r.imitation).toBeNull();
    expect(r.flags).not.toContain('imitates_known_token');
  });
});

describe('checkToken', () => {
  it('answers no_flags for a direct deploy with an established creator and no later mints', async () => {
    const r = await checkToken(TOKEN, deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], creatorBalance: SUPPLY / 20n }));
    expect(r.verdict.label).toBe('no_flags');
    expect(r.launch).toMatchObject({ block: LAUNCH_BLOCK, tx: LAUNCH_TX, creator: CREATOR, via: null, launcher: null, time: LAUNCH_TIME });
    expect(r.token_info).toMatchObject({ symbol: 'CLK2', name: 'ClankerToken', decimals: 18, total_supply: 1_000_000 });
    expect(r.creator).toMatchObject({ address: CREATOR, sanctioned: false, age_days_at_launch: 200, holds_pct: 5 });
    expect(r.supply).toMatchObject({ mints_after_launch: 0, to_creator: 0 });
    expect(r.flags).toEqual([]);
    expect(r.verdict.reason).toBe("None of the checks matched: sanctions, mints after the first issuance, and the launch wallet's age, funder, holdings and send-outs after launch.");
    expect(r.as_of_block).toBe(HEAD);
    expect(JSON.stringify(r)).not.toMatch(/\bsafe\b/i);
  });

  // CLK2: 10,000 minted to the creator at launch, then 500,000 more to the creator twice.
  it('answers hold when tokens were minted to the creator after launch', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        transfers: [
          mint(CREATOR, 10_000, LAUNCH_BLOCK, LAUNCH_TX),
          mint(CREATOR, 500_000, LAUNCH_BLOCK + 1192, '0xm2', 2384),
          mint(CREATOR, 500_000, LAUNCH_BLOCK + 1300, '0xm3', 2600),
        ],
      }),
    );
    expect(r.verdict.label).toBe('hold');
    expect(r.flags).toContain('creator_minted_after_launch');
    expect(r.supply).toMatchObject({ mints_after_launch: 2, minted_after_launch: 1_000_000, to_creator: 2, minted_to_creator: 1_000_000 });
    expect(r.verdict.reason).toBe('After the first issuance, 1,000,000 more tokens were minted to the wallet that launched it in 2 mints, 100% of the supply today.');
  });

  // cbBTC: one test mint of a single unit to its deployer, among thousands of real mints.
  it('does not answer hold for a negligible mint to the launch wallet', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        transfers: [
          mint(POOL, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX),
          { ...mint(CREATOR, 1e-18, LAUNCH_BLOCK + 9, '0xm2', 18), raw: 1n },
          mint(POOL, 5_000, LAUNCH_BLOCK + 20, '0xm3', 40),
        ],
      }),
    );
    expect(r.flags).not.toContain('creator_minted_after_launch');
    expect(r.flags).toContain('minted_after_launch');
    expect(r.verdict.label).toBe('review');
    expect(r.supply).toMatchObject({ mints_after_launch: 2, to_creator: 1 });
  });

  // Alchemy leaves value null for tokens it has no decimals for; the raw amount is always there.
  it('reads mint amounts from the raw value, and never prints a real mint as 0 tokens', async () => {
    const r = await checkToken(
      TOKEN,
      deps({ transfers: [mint(POOL, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX), { ...mint(POOL, 0, LAUNCH_BLOCK + 3, '0xm2', 6), raw: 10n ** 10n, nullValue: true }] }),
    );
    expect(r.supply.minted_after_launch).toBe(1e-8);
    expect(r.verdict.reason).toBe('1 mint after the first issuance created 0.00000001 more tokens.');
  });

  // An airdrop-style launch can mint to more wallets than one page of records holds.
  it('looks past a first issuance that fills the first page of mints', async () => {
    const airdrop = Array.from({ length: 120 }, (_, i) => mint(`0x${(i + 1).toString(16).padStart(40, '0')}`, 1_000, LAUNCH_BLOCK, LAUNCH_TX));
    const later = Array.from({ length: 5 }, (_, i) => mint(CREATOR, 100_000, LAUNCH_BLOCK + 10 + i, `0xc${i}`, 20 + i));
    const r = await checkToken(TOKEN, deps({ transfers: [...airdrop, ...later] }));
    expect(r.supply).toMatchObject({ mints_after_launch: 5, to_creator: 5 });
    expect(r.flags).toContain('creator_minted_after_launch');
  });

  // Reading from genesis made Alchemy fail on busy tokens (WBTC); nothing can precede the launch.
  it('reads the token transfers from the launch block on, not from genesis', async () => {
    const queries: Array<Record<string, unknown>> = [];
    await checkToken(TOKEN, deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], queries }));
    const tokenQueries = queries.filter((q) => q.contractAddresses);
    expect(tokenQueries[0]!.fromBlock).toBe('0x0');
    expect(tokenQueries.length).toBeGreaterThan(1);
    expect(tokenQueries.slice(1).every((q) => q.fromBlock === `0x${LAUNCH_BLOCK.toString(16)}`)).toBe(true);
  });

  // A common pattern: deploy the contract, then mint the starting supply in a second transaction.
  it('does not count the first issuance as a mint after launch when it comes in a later transaction', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        codeFromBlock: LAUNCH_BLOCK - 5,
        transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, '0xinit', 10)],
        receipts: [{ transactionHash: LAUNCH_TX, contractAddress: TOKEN, logs: [] }],
      }),
    );
    expect(r.launch).toMatchObject({ block: LAUNCH_BLOCK - 5, tx: LAUNCH_TX, creator: CREATOR });
    expect(r.supply.mints_after_launch).toBe(0);
    expect(r.flags).not.toContain('creator_minted_after_launch');
    expect(r.flags).not.toContain('minted_after_launch');
  });

  // Smart-wallet launches arrive through an ERC-4337 bundler: the sender of record is the bundler.
  // v0.9 is live on Base (bundles 0xe2261e90..., 2026-10).
  it.each([
    ['v0.6', '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789'],
    ['v0.7', '0x0000000071727de22e5e9d8baf0edac6f37da032'],
    ['v0.8', '0x4337084d9e255ff0702461cf8895ce9e3b5ff108'],
    ['v0.9', '0x433709009b8330fda32311df1c2afa402ed8d009'],
  ])('names the smart wallet, not the bundler, when the launch came through EntryPoint %s', async (_v, entryPoint) => {
    const bundler = `0x${'b'.repeat(40)}`;
    const smartWallet = `0x${'5'.repeat(40)}`;
    const r = await checkToken(
      TOKEN,
      deps({
        launchTx: { hash: LAUNCH_TX, from: bundler, to: entryPoint },
        launchReceiptLogs: [
          {
            address: entryPoint,
            topics: ['0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f', `0x${'a'.repeat(64)}`, topic(smartWallet), topic(ZERO)],
          },
        ],
        transfers: [mint(smartWallet, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
      }),
    );
    expect(r.launch).toMatchObject({ creator: smartWallet, via: entryPoint });
    expect(r.creator?.address).toBe(smartWallet);
  });

  // USDC: the proxy was deployed well before the first mint, and mints keep coming to other wallets.
  it('finds a launch that predates the first transfer, and answers review when supply keeps growing', async () => {
    const other = `0x${'a'.repeat(40)}`;
    const r = await checkToken(
      TOKEN,
      deps({
        codeFromBlock: LAUNCH_BLOCK - 50_000,
        transfers: [mint(other, 10, LAUNCH_BLOCK, '0xm1'), mint(other, 99, LAUNCH_BLOCK + 10, '0xm2')],
        receipts: [
          { transactionHash: '0xnoise', contractAddress: null, logs: [] },
          { transactionHash: LAUNCH_TX, contractAddress: TOKEN, logs: [] },
        ],
      }),
    );
    expect(r.launch).toMatchObject({ block: LAUNCH_BLOCK - 50_000, tx: LAUNCH_TX, creator: CREATOR });
    expect(r.flags).toContain('minted_after_launch');
    expect(r.flags).not.toContain('creator_minted_after_launch');
    expect(r.verdict.label).toBe('review');
    expect(r.supply).toMatchObject({ mints_after_launch: 1, minted_after_launch: 99, to_creator: 0 });
    expect(r.verdict.reason).toBe('1 mint after the first issuance created 99 more tokens.');
  });

  // HOOK: launched through Clanker's factory with a 1 ETH dev buy, all of it sent out 26 s later.
  it('names a genuine Clanker launch and flags a creator that sent out the tokens it received at launch within the hour', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        clanker: true,
        launchTx: { hash: LAUNCH_TX, from: CREATOR, to: CLANKER_V4_FACTORY.toLowerCase() },
        transfers: [
          mint(CLANKER_V4_FACTORY.toLowerCase(), 100_000_000_000, LAUNCH_BLOCK, LAUNCH_TX),
          { from: POOL, to: CREATOR, value: 6_416_006_425.89, hash: LAUNCH_TX, block: LAUNCH_BLOCK, time: LAUNCH_TIME },
          { from: CREATOR, to: POOL, value: 6_416_006_425.89, hash: '0xsell', block: LAUNCH_BLOCK + 13, time: ts(LAUNCH_TIME, 26) },
        ],
        creatorFirstInbound: { from: POOL, time: LAUNCH_TIME, hash: LAUNCH_TX },
      }),
    );
    expect(r.launch).toMatchObject({ via: CLANKER_V4_FACTORY.toLowerCase(), launcher: 'clanker' });
    expect(r.creator?.launch_tokens).toMatchObject({ received: 6_416_006_425.89, sent_pct: 100, first_send_after_sec: 26, sent_90pct_after_sec: 26 });
    expect(r.flags).toContain('creator_sent_launch_tokens');
    expect(r.flags).toContain('new_creator');
    expect(r.verdict.label).toBe('review');
    expect(r.verdict.reason).toMatch(/26 seconds/);
    // Received, not bought: a factory can hand the launch wallet an allocation.
    expect(r.verdict.reason).toMatch(/received 6,416,006,425\.89 tokens in the launch transaction/);
    expect(r.verdict.reason).toMatch(/had sent out 100% of them 26 seconds later/);
    // Sent is what the chain shows; where it went is not traced.
    expect(r.limits).toMatch(/may have been sold, moved or locked/);
  });

  it('does not call a factory launch Clanker when the registry does not know the token', async () => {
    const r = await checkToken(
      TOKEN,
      deps({ clanker: false, launchTx: { hash: LAUNCH_TX, from: CREATOR, to: `0x${'e'.repeat(40)}` }, transfers: [mint(POOL, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)] }),
    );
    expect(r.launch?.launcher).toBeNull();
    expect(r.launch?.via).toBe(`0x${'e'.repeat(40)}`);
  });

  it('treats a creator that kept the tokens it received at launch as no signal', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        clanker: true,
        launchTx: { hash: LAUNCH_TX, from: CREATOR, to: CLANKER_V4_FACTORY.toLowerCase() },
        transfers: [
          mint(CLANKER_V4_FACTORY.toLowerCase(), 100_000_000_000, LAUNCH_BLOCK, LAUNCH_TX),
          { from: POOL, to: CREATOR, value: 1_000, hash: LAUNCH_TX, block: LAUNCH_BLOCK, time: LAUNCH_TIME },
        ],
        creatorBalance: 1_000n * 10n ** 18n,
      }),
    );
    expect(r.flags).not.toContain('creator_sent_launch_tokens');
    expect(r.creator?.launch_tokens).toMatchObject({ received: 1_000, sent_pct: 0, first_send_after_sec: null, held_now: 1_000, sent_now_pct: 0 });
  });

  // 1% sent five minutes in and the rest 22 hours later: flagged, and the reason says it was 22 hours later, not within the hour.
  it('flags launch tokens sent out after the first hour, and says when', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        clanker: true,
        launchTx: { hash: LAUNCH_TX, from: CREATOR, to: CLANKER_V4_FACTORY.toLowerCase() },
        transfers: [
          mint(CLANKER_V4_FACTORY.toLowerCase(), 100_000_000_000, LAUNCH_BLOCK, LAUNCH_TX),
          { from: POOL, to: CREATOR, value: 10_000, hash: LAUNCH_TX, block: LAUNCH_BLOCK, time: LAUNCH_TIME },
          { from: CREATOR, to: POOL, value: 100, hash: '0xs1', block: LAUNCH_BLOCK + 150, time: ts(LAUNCH_TIME, 300) },
          { from: CREATOR, to: POOL, value: 9_900, hash: '0xs2', block: LAUNCH_BLOCK + 39_600, time: ts(LAUNCH_TIME, 79_200) },
        ],
      }),
    );
    expect(r.flags).toContain('creator_sent_launch_tokens');
    expect(r.creator?.launch_tokens).toMatchObject({ received: 10_000, sent_pct: 100, first_send_after_sec: 300, sent_90pct_after_sec: 79_200 });
    expect(r.verdict.reason).toBe('The wallet that launched it received 10,000 tokens in the launch transaction and had sent out 100% of them 22 hours later.');
  });

  // Its sends could be the minted supply (liquidity, say), not the tokens it got from others.
  it('does not judge the launch tokens of a wallet that was also minted to in the launch transaction', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        transfers: [
          mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX),
          { from: POOL, to: CREATOR, value: 10, hash: LAUNCH_TX, block: LAUNCH_BLOCK, time: LAUNCH_TIME },
          { from: CREATOR, to: POOL, value: 500_000, hash: '0xs1', block: LAUNCH_BLOCK + 30, time: ts(LAUNCH_TIME, 60) },
        ],
      }),
    );
    expect(r.creator?.launch_tokens).toBeNull();
    expect(r.flags).not.toContain('creator_sent_launch_tokens');
  });

  // Virtuals: the agent token is created when its prototype graduates, inside some buyer's
  // purchase. AIXBT's graduation was sent by a buyer; its prototype's creator launched it.
  describe('a Virtuals agent token', () => {
    const GRADUATED = '0x381d54fa425631e6266af114239150fae1d5db67bb65b4fa9ecc65013107e07e';
    const BUYER = `0x${'b'.repeat(40)}`;
    const PROTOTYPE = `0x${'e'.repeat(40)}`;
    const graduation = (agentToken: string) =>
      deps({
        launchTx: { hash: LAUNCH_TX, from: BUYER, to: BONDING },
        launchReceiptLogs: [{ address: BONDING, topics: [GRADUATED, topic(PROTOTYPE)], data: topic(agentToken) }],
        virtualsCreator: CREATOR,
        transfers: [mint(POOL, 1_000_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
      });

    it("names the prototype's creator, not the buyer whose purchase graduated it", async () => {
      const r = await checkToken(TOKEN, graduation(TOKEN));
      expect(r.launch).toMatchObject({ creator: CREATOR, via: BONDING, launcher: 'virtuals' });
      expect(r.launch?.launcher_note).toMatch(/graduated/);
      expect(r.creator?.address).toBe(CREATOR);
    });

    it('keeps the sender when the graduation in the transaction was for another token', async () => {
      const r = await checkToken(TOKEN, graduation(`0x${'d'.repeat(40)}`));
      expect(r.launch).toMatchObject({ creator: BUYER, launcher: null });
    });
  });

  it('answers hold when the creator is on the OFAC list', async () => {
    const listed = OFAC_SNAPSHOT.addresses[0]!.toLowerCase();
    const d = deps({ launchTx: { hash: LAUNCH_TX, from: listed, to: null }, transfers: [mint(listed, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)] });
    const r = await checkToken(TOKEN, d);
    expect(r.verdict.label).toBe('hold');
    expect(r.flags).toContain('creator_sanctioned');
    expect(r.verdict.reason).toMatch(/OFAC/);
  });

  it('answers hold when the creator was first funded by an OFAC-listed address', async () => {
    const listed = OFAC_SNAPSHOT.addresses[0]!.toLowerCase();
    const r = await checkToken(
      TOKEN,
      deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], creatorFirstInbound: { from: listed, time: days(30), hash: '0xf9' } }),
    );
    expect(r.verdict.label).toBe('hold');
    expect(r.flags).toContain('creator_funded_by_sanctioned');
  });

  it('puts sanctions ahead of every other reason', async () => {
    const listed = OFAC_SNAPSHOT.addresses[0]!.toLowerCase();
    const r = await checkToken(
      TOKEN,
      deps({
        launchTx: { hash: LAUNCH_TX, from: listed, to: null },
        transfers: [mint(listed, 10, LAUNCH_BLOCK, LAUNCH_TX), mint(listed, 500_000, LAUNCH_BLOCK + 5, '0xm2', 10)],
      }),
    );
    expect(r.flags).toEqual(expect.arrayContaining(['creator_sanctioned', 'creator_minted_after_launch']));
    expect(r.verdict.reason).toMatch(/OFAC/);
  });

  it('answers review for a creator first seen days before launch', async () => {
    const r = await checkToken(
      TOKEN,
      deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], creatorFirstInbound: { from: FUNDER, time: days(2), hash: '0xf2' } }),
    );
    expect(r.flags).toContain('new_creator');
    expect(r.creator?.age_days_at_launch).toBe(2);
    expect(r.verdict.label).toBe('review');
  });

  // BRETT's launch wallet was first seen ten hours before its launch, on the day before.
  it('says less than a day, not the same day, for a launch wallet first seen hours before launch', async () => {
    const r = await checkToken(
      TOKEN,
      deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], creatorFirstInbound: { from: FUNDER, time: ts(LAUNCH_TIME, -36_000), hash: '0xf3' } }),
    );
    expect(r.flags).toContain('new_creator');
    expect(r.verdict.reason).toBe('The wallet that launched it was first seen less than a day before the launch.');
  });

  it('leaves the age unknown when the launch wallet first shows up after the launch', async () => {
    const r = await checkToken(
      TOKEN,
      deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], creatorFirstInbound: { from: FUNDER, time: ts(LAUNCH_TIME, 30 * 86_400), hash: '0xf4' } }),
    );
    expect(r.creator?.age_days_at_launch).toBeNull();
    expect(r.flags).not.toContain('new_creator');
  });

  it('answers review when the creator still holds a large share of the supply', async () => {
    const r = await checkToken(TOKEN, deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], creatorBalance: (SUPPLY * 3n) / 5n }));
    expect(r.flags).toContain('creator_holds_large_share');
    expect(r.creator?.holds_pct).toBe(60);
    expect(r.verdict.reason).toMatch(/60%/);
  });

  it('answers review, and stops, when there is no contract at the address', async () => {
    const log: string[] = [];
    const r = await checkToken(TOKEN, deps({ code: false }, log));
    expect(r.flags).toEqual(['not_a_contract']);
    expect(r.verdict.label).toBe('review');
    expect(r.launch).toBeNull();
    expect(log.some((m) => m.startsWith('transfers'))).toBe(false);
  });

  it('answers review, and stops, for a contract that is not an ERC-20 token', async () => {
    const r = await checkToken(TOKEN, deps({ totalSupply: null }));
    expect(r.flags).toEqual(['not_a_token']);
    expect(r.verdict.label).toBe('review');
  });

  // The Uniswap V3 positions NFT answers totalSupply() too.
  it('answers not_a_token for an ERC-721 collection', async () => {
    const r = await checkToken(TOKEN, deps({ nft: true }));
    expect(r.flags).toEqual(['not_a_token']);
    expect(r.verdict.reason).toMatch(/ERC-721/);
    expect(r.launch).toBeNull();
  });

  // Alchemy reports amounts as floats; 0.1 + 0.2 must read 0.3, not 0.30000000000000004.
  it('adds mint amounts without float noise', async () => {
    const r = await checkToken(
      TOKEN,
      deps({ transfers: [mint(POOL, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX), mint(POOL, 0.1, LAUNCH_BLOCK + 5, '0xm2'), mint(POOL, 0.2, LAUNCH_BLOCK + 6, '0xm3')] }),
    );
    expect(r.supply).toMatchObject({ mints_after_launch: 2, minted_after_launch: 0.3 });
  });

  // A throttled read is not the contract's answer. Swallowed, it turned a token into
  // not_a_token (charged, and cached for ten minutes); failing lets the API answer 503.
  it.each([
    ['totalSupply', '0x18160ddd'],
    ['Clanker registry', 'registry'],
    ['launch wallet balance', '0x70a08231'],
  ])('fails rather than guess when the provider refuses the %s read', async (_name, call) => {
    const chain = deps({ transfers: [mint(POOL, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], failCalls: [call] });
    await expect(checkToken(TOKEN, chain)).rejects.toThrow(/capacity/);
  });

  it('answers review when the launch transaction cannot be found', async () => {
    const r = await checkToken(
      TOKEN,
      deps({ codeFromBlock: LAUNCH_BLOCK - 10, transfers: [mint(POOL, 5, LAUNCH_BLOCK, '0xm1')], receipts: [{ transactionHash: '0xnoise', contractAddress: null, logs: [] }] }),
    );
    expect(r.flags).toContain('launch_unknown');
    expect(r.launch).toMatchObject({ block: LAUNCH_BLOCK - 10, tx: null, creator: null });
    expect(r.creator).toBeNull();
    expect(r.verdict.label).toBe('review');
  });

  it('reports a large supply exactly, without floating-point drift', async () => {
    const r = await checkToken(TOKEN, deps({ totalSupply: 100_000_000_000n * 10n ** 18n, transfers: [mint(CREATOR, 1, LAUNCH_BLOCK, LAUNCH_TX)] }));
    expect(r.token_info.total_supply).toBe(100_000_000_000);
  });

  it('lowercases the token it was given', async () => {
    const r = await checkToken(TOKEN.toUpperCase().replace('0X', '0x'), deps({ transfers: [mint(CREATOR, 1, LAUNCH_BLOCK, LAUNCH_TX)] }));
    expect(r.token).toBe(TOKEN);
  });

  // The label set: a strong public label on the launch wallet answers review, naming it.
  describe('labels on the launch wallet', () => {
    const established = () => deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], creatorBalance: SUPPLY / 20n });
    const ring = {
      chain: 'base',
      address: CREATOR,
      kind: 'run_together' as const,
      strength: 'strong' as 'strong' | 'weak',
      visibility: 'public' as 'public' | 'private',
      group_key: 'ring-48',
      group_size: 48,
      sentence: 'One of 48 wallets that appear to be run together in Set and Earn, from our decode.',
      source_type: 'dataset' as const,
      source_ref: 'set-and-earn-week-one',
      source_url: 'https://chainward.ai/decodes/set-and-earn-week-one',
      evidence_url: null,
      as_of: '2026-10-01',
    };
    const labelled = (l: typeof ring) => ({ ...established(), labelsFor: (a: string, chain: string) => (a === CREATOR && chain === 'base' ? [l] : []) });

    it('answers review naming a strong public label', async () => {
      const r = await checkToken(TOKEN, labelled(ring));
      expect(r.flags).toContain('creator_labeled');
      expect(r.verdict).toEqual({ label: 'review', reason: `The wallet that launched it is labeled in our investigations: ${ring.sentence}` });
      expect(r.creator?.labels).toEqual([{ kind: 'run_together', strength: 'strong', sentence: ring.sentence, source_url: ring.source_url }]);
    });

    it('lists a weak label without a flag', async () => {
      const r = await checkToken(TOKEN, labelled({ ...ring, strength: 'weak' }));
      expect(r.flags).not.toContain('creator_labeled');
      expect(r.verdict.label).toBe('no_flags');
      expect(r.creator?.labels).toHaveLength(1);
    });

    it('never shows a private label', async () => {
      const r = await checkToken(TOKEN, labelled({ ...ring, visibility: 'private' }));
      expect(r.flags).not.toContain('creator_labeled');
      expect(r.creator?.labels).toEqual([]);
    });

    // A launch service (Clanker's X bot) sends launches for other admins: its labels are not the token admin's.
    it('does not flag the labels of a wallet that launched for another admin', async () => {
      const OTHER = `0x${'e'.repeat(40)}`;
      const chain = {
        ...deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], creatorBalance: SUPPLY / 20n, clanker: true, originalAdmin: OTHER }),
        labelsFor: (a: string, c: string) => (a === CREATOR && c === 'base' ? [ring] : []),
      };
      const r = await checkToken(TOKEN, chain);
      expect(r.launch?.token_admin).toBe(OTHER);
      expect(r.flags).not.toContain('creator_labeled');
    });

    // The check counts launches itself; its own detector label would only repeat an older count.
    it('leaves out serial_launcher labels, which the check measures live', async () => {
      const serial = { ...ring, kind: 'serial_launcher' as never, sentence: 'Launched 97 tokens through Clanker in one day (seen 2026-10-20).' };
      const r = await checkToken(TOKEN, labelled(serial));
      expect(r.flags).not.toContain('creator_labeled');
      expect(r.creator?.labels).toEqual([]);
    });
  });

  // The free check on chainward.ai spends its allowance only on tokens: a wallet pasted
  // into the same box is answered from the first reads, without spending any.
  describe('before the launch search', () => {
    it('runs the hook once for a token, before any transfers are read', async () => {
      const log: string[] = [];
      let runs = 0;
      let transfersBeforeHook = -1;
      const r = await checkToken(TOKEN, deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)] }, log), {
        beforeLaunchSearch: async () => {
          runs++;
          transfersBeforeHook = log.filter((m) => m.startsWith('transfers')).length;
        },
      });
      expect(runs).toBe(1);
      expect(transfersBeforeHook).toBe(0);
      expect(log.some((m) => m.startsWith('transfers'))).toBe(true);
      expect(r.launch).not.toBeNull();
    });

    it.each([
      ['there is no contract', { code: false }],
      ['the contract is not an ERC-20', { totalSupply: null }],
      ['the contract is an NFT collection', { nft: true }],
    ] as const)('does not run the hook when %s', async (_case, chain) => {
      let runs = 0;
      await checkToken(TOKEN, deps({ ...chain }), {
        beforeLaunchSearch: async () => {
          runs++;
        },
      });
      expect(runs).toBe(0);
    });

    it('stops the check when the hook refuses, reading no transfers', async () => {
      const log: string[] = [];
      const refusal = new Error('free checks used up');
      await expect(
        checkToken(TOKEN, deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)] }, log), {
          beforeLaunchSearch: async () => {
            throw refusal;
          },
        }),
      ).rejects.toBe(refusal);
      expect(log.some((m) => m.startsWith('transfers'))).toBe(false);
    });
  });

  describe('serial launchers through Clanker', () => {
    const OTHER = `0x${'a'.repeat(40)}`;
    const DEAD = '0x000000000000000000000000000000000000dead';
    const ENTRY_POINT = '0x0000000071727de22e5e9d8baf0edac6f37da032';
    const USER_OP = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
    const clankerLaunch = (extra: Partial<Chain> = {}) =>
      deps({
        clanker: true,
        launchTx: { hash: LAUNCH_TX, from: CREATOR, to: CLANKER_V4_FACTORY.toLowerCase() },
        transfers: [
          mint(CLANKER_V4_FACTORY.toLowerCase(), 100_000_000_000, LAUNCH_BLOCK, LAUNCH_TX),
          { from: POOL, to: CREATOR, value: 9_948.97, hash: LAUNCH_TX, block: LAUNCH_BLOCK, time: LAUNCH_TIME },
        ],
        creatorFirstInbound: { from: FUNDER, time: days(31), hash: '0xf1' },
        // It still holds the tokens it got at launch.
        creatorBalance: 9_948_970_000n * 10n ** 12n,
        ...extra,
      });

    // 0x1afab1f6...: two same-name tokens every 30 minutes, about 96 a day, admin and fee recipient of each.
    it('answers review when the launch wallet launched many tokens through Clanker in 24 hours that include this one', async () => {
      const queries: Array<Record<string, unknown>> = [];
      const r = await checkToken(TOKEN, clankerLaunch({ factoryLaunches: 96, queries }));
      expect(r.flags).toContain('creator_serial_launcher');
      expect(r.creator?.clanker_launches_24h).toBe(96);
      expect(r.creator?.launches_24h).toMatchObject({ total: 96, by_launchpad: { clanker: 96, doppler: 0, zora: 0, virtuals: 0, other: 0 }, span_sec: 85_104, capped: false });
      expect(r.launch?.token_admin).toBe(CREATOR);
      expect(r.verdict).toEqual({ label: 'review', reason: 'The wallet that launched it launched 96 tokens within 24 hours, this one included: 96 through Clanker.' });
      // One read of its own transactions, any destination: launches to any launchpad, before and after this one.
      const q = queries.find((x) => x.fromAddress === CREATOR && Array.isArray(x.category) && x.category.length === 1 && x.category[0] === 'external')!;
      expect(q).toMatchObject({ category: ['external'], excludeZeroValue: false, order: 'desc', withMetadata: true });
      expect(q.toAddress).toBeUndefined();
      // Wide enough for a day at 5 blocks a second (Denim); the day itself is cut by block time.
      expect(q.fromBlock).toBe(`0x${(LAUNCH_BLOCK - 432_000).toString(16)}`);
      // A day after the launch at the pace since, which a later speed-up can only lengthen.
      const launchSec = new Date(LAUNCH_TIME).getTime() / 1000;
      const dayAfter = Math.ceil((86_400 * (HEAD - LAUNCH_BLOCK)) / (NOW.getTime() / 1000 - launchSec));
      expect(q.toBlock).toBe(`0x${(LAUNCH_BLOCK + dayAfter).toString(16)}`);
    });

    it('does not flag a launch wallet below the threshold', async () => {
      const r = await checkToken(TOKEN, clankerLaunch({ factoryLaunches: 4 }));
      expect(r.flags).not.toContain('creator_serial_launcher');
      expect(r.creator?.clanker_launches_24h).toBe(4);
      expect(r.verdict.label).toBe('no_flags');
    });

    it('counts by block time, so launches older than 24 hours do not count', async () => {
      const r = await checkToken(TOKEN, clankerLaunch({ factoryLaunches: 3, factoryOlder: 10 }));
      expect(r.creator?.clanker_launches_24h).toBe(3);
      expect(r.flags).not.toContain('creator_serial_launcher');
    });

    it('says at least when the launch count fills a page', async () => {
      const r = await checkToken(TOKEN, clankerLaunch({ factoryLaunches: 5_000 }));
      expect(r.creator?.clanker_launches_24h).toBe(1_000);
      expect(r.creator?.launches_24h).toMatchObject({ total: 1_000, capped: true });
      expect(r.verdict.reason).toBe('The wallet that launched it launched at least 1,000 tokens within 5 hours, this one included: 1,000 through Clanker.');
    });

    // A launch through a router or multicall is not a transaction to the factory: it is counted as this launch, on top of
    // the wallet's own launches straight to the factory.
    it('counts this launch when it did not go straight from the launch wallet to the factory', async () => {
      const r = await checkToken(TOKEN, clankerLaunch({ factoryLaunches: 96, factoryOmitsLaunch: true }));
      expect(r.creator?.clanker_launches_24h).toBe(97);
      expect(r.flags).toContain('creator_serial_launcher');
    });

    it('leaves the count unknown for a smart-wallet launch through an EntryPoint', async () => {
      const bundler = `0x${'b'.repeat(40)}`;
      const smartWallet = `0x${'5'.repeat(40)}`;
      const r = await checkToken(
        TOKEN,
        clankerLaunch({
          launchTx: { hash: LAUNCH_TX, from: bundler, to: ENTRY_POINT },
          launchReceiptLogs: [{ address: ENTRY_POINT, topics: [USER_OP, `0x${'a'.repeat(64)}`, topic(smartWallet), topic(ZERO)] }],
          originalAdmin: smartWallet,
          factoryLaunches: 96,
        }),
      );
      expect(r.launch?.creator).toBe(smartWallet);
      // A smart wallet sends no transactions of its own: this launch is the one counted.
      expect(r.creator?.launches_24h).toMatchObject({ total: 1, by_launchpad: { clanker: 1 } });
      expect(r.flags).not.toContain('creator_serial_launcher');
    });

    // Clanker's X bot sends the launch for whoever asked it; the admin at launch is that wallet.
    it('names the admin at launch when it is not the launch wallet, and does not count the launches', async () => {
      const r = await checkToken(TOKEN, clankerLaunch({ originalAdmin: OTHER, factoryLaunches: 500 }));
      expect(r.launch?.token_admin).toBe(OTHER);
      expect(r.launch?.launcher_note).toContain(`The token's admin at launch, ${OTHER}, is not the wallet that sent the launch`);
      expect(r.launch?.launcher_note).toMatch(/describe the wallet that sent the launch/);
      expect(r.flags).not.toContain('creator_serial_launcher');
      expect(r.creator?.clanker_launches_24h).toBeNull();
    });

    // updateAdmin can renounce (to zero) or move the admin after launch; the verdict must not move with it.
    it.each([
      ['renounced', ZERO],
      ['moved to a dead address', DEAD],
      ['moved to another wallet', OTHER],
    ])('reads the admin at launch, so an admin %s later does not change the answer', async (_how, now) => {
      const r = await checkToken(TOKEN, clankerLaunch({ currentAdmin: now, factoryLaunches: 96 }));
      expect(r.launch?.token_admin).toBe(CREATOR);
      expect(r.flags).toContain('creator_serial_launcher');
    });

    it.each([
      ['zero', ZERO],
      ['unreadable', null],
    ])('treats a %s admin at launch as a launch for the sender', async (_how, admin) => {
      const r = await checkToken(TOKEN, clankerLaunch({ originalAdmin: admin, factoryLaunches: 96 }));
      expect(r.launch?.token_admin).toBeNull();
      expect(r.flags).toContain('creator_serial_launcher');
    });

    it('does not say a service launched it when the launch wallet is unknown', async () => {
      const bundler = `0x${'b'.repeat(40)}`;
      const r = await checkToken(
        TOKEN,
        clankerLaunch({
          launchTx: { hash: LAUNCH_TX, from: bundler, to: ENTRY_POINT },
          launchReceiptLogs: [
            { address: ENTRY_POINT, topics: [USER_OP, `0x${'a'.repeat(64)}`, topic(`0x${'5'.repeat(40)}`), topic(ZERO)] },
            { address: ENTRY_POINT, topics: [USER_OP, `0x${'d'.repeat(64)}`, topic(`0x${'6'.repeat(40)}`), topic(ZERO)] },
          ],
          originalAdmin: OTHER,
        }),
      );
      expect(r.flags).toContain('launch_unknown');
      expect(r.launch?.token_admin).toBe(OTHER);
      expect(r.launch?.launcher_note).not.toMatch(/is not the wallet that sent the launch/);
    });

    // A plain deploy by a wallet that also launches through Clanker: its Clanker launches count, and this one as outside them.
    it('reads no admin for a token Clanker did not launch, and counts the wallet\'s Clanker launches with this one', async () => {
      const calls: string[] = [];
      const r = await checkToken(TOKEN, deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], factoryLaunches: 96, factoryOmitsLaunch: true, calls }));
      expect(r.launch?.token_admin).toBeNull();
      expect(r.creator?.clanker_launches_24h).toBeNull();
      expect(r.creator?.launches_24h).toMatchObject({ total: 97, by_launchpad: { clanker: 96, other: 1 } });
      expect(r.verdict.reason).toBe('The wallet that launched it launched 97 tokens within 24 hours, this one included: 96 through Clanker and 1 outside these launchpads.');
      expect(calls.some((c) => c.endsWith(':0x1c7b2ff4') || c.endsWith(':0xf851a440'))).toBe(false);
    });

    it('ranks a send-out within the hour ahead of serial launching', async () => {
      const r = await checkToken(
        TOKEN,
        clankerLaunch({
          factoryLaunches: 96,
          transfers: [
            mint(CLANKER_V4_FACTORY.toLowerCase(), 100_000_000_000, LAUNCH_BLOCK, LAUNCH_TX),
            { from: POOL, to: CREATOR, value: 1_000, hash: LAUNCH_TX, block: LAUNCH_BLOCK, time: LAUNCH_TIME },
            { from: CREATOR, to: POOL, value: 1_000, hash: '0xsell', block: LAUNCH_BLOCK + 30, time: ts(LAUNCH_TIME, 60) },
          ],
        }),
      );
      expect(r.flags).toEqual(expect.arrayContaining(['creator_sent_launch_tokens', 'creator_serial_launcher']));
      expect(r.verdict.reason).toMatch(/had sent out 100% of them 60 seconds later/);
    });

    // A throttled read must not turn into a cached no_flags for a mill token: the API answers 503, uncharged.
    it.each([
      ['launch count', { failFactory: true }],
      ['admin at launch', { failCalls: ['0x1c7b2ff4'] }],
    ])('fails rather than guess when the provider refuses the %s read', async (_name, extra) => {
      await expect(checkToken(TOKEN, clankerLaunch({ factoryLaunches: 96, ...extra }))).rejects.toThrow(/capacity/);
    });
  });
});

// The reads a week before and an hour after the launch are placed by measured block times, so they
// hold when Base moves from 2 s to 200 ms blocks (Denim, November 2026).
describe('checkToken: reads placed by block time', () => {
  const LAUNCH_SEC = new Date(LAUNCH_TIME).getTime() / 1000;
  const WEEK = 7 * 86_400;
  const at = (blocks: number) => `0x${(LAUNCH_BLOCK + blocks).toString(16)}`;
  const buyAndSell = (sellBlocks: number, sellSec: number): Transfer[] => [
    mint(POOL, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX),
    { from: POOL, to: CREATOR, value: 10_000, hash: LAUNCH_TX, block: LAUNCH_BLOCK, time: LAUNCH_TIME },
    { from: CREATOR, to: POOL, value: 10_000, hash: '0xsell', block: LAUNCH_BLOCK + sellBlocks, time: ts(LAUNCH_TIME, sellSec) },
  ];
  // Two hours after a launch on 2 s blocks.
  const twoSecond = (extra: Partial<Chain> = {}): Chain => ({
    timestampOf: (b) => LAUNCH_SEC + (b - LAUNCH_BLOCK) * 2,
    head: LAUNCH_BLOCK + 3_600,
    now: new Date((LAUNCH_SEC + 7_200) * 1000),
    transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
    ...extra,
  });

  it('reads 3,024,000 blocks back for the week and 18,000 on for the hour on 200 ms blocks', async () => {
    const pastReads: string[] = [];
    await checkToken(
      TOKEN,
      deps({
        timestampOf: (b) => LAUNCH_SEC + (b - LAUNCH_BLOCK) * 0.2,
        head: LAUNCH_BLOCK + 36_000,
        now: new Date((LAUNCH_SEC + 7_200) * 1000),
        transfers: buyAndSell(100, 20),
        weekBefore: { nonce: 3 },
        pastReads,
      }),
    );
    expect(pastReads).toEqual(
      expect.arrayContaining([
        `eth_getTransactionCount:${CREATOR}:${at(-3_024_000)}`,
        `eth_getCode:${CREATOR}:${at(-3_024_000)}`,
        `balanceOf:${CREATOR}:${at(0)}`,
        `balanceOf:${CREATOR}:${at(18_000)}`,
      ]),
    );
  });

  // Blocks went from 2 s to 200 ms a day before the launch: a week of 200 ms blocks reaches back 61 days.
  it('never reads further back than a week, or further on than an hour, when the block time changed in between', async () => {
    const FORK = LAUNCH_BLOCK - 432_000;
    const FORK_SEC = LAUNCH_SEC - 86_400;
    const timestampOf = (b: number) => (b >= FORK ? LAUNCH_SEC + (b - LAUNCH_BLOCK) * 0.2 : FORK_SEC - (FORK - b) * 2);
    const pastReads: string[] = [];
    await checkToken(
      TOKEN,
      deps({ timestampOf, head: LAUNCH_BLOCK + 36_000, now: new Date((LAUNCH_SEC + 7_200) * 1000), transfers: buyAndSell(100, 20), weekBefore: { nonce: 0 }, pastReads }),
    );
    const blockOf = (prefix: string) => Number(BigInt(pastReads.find((r) => r.startsWith(prefix))!.split(':')[2]!));
    const weekRead = blockOf('eth_getTransactionCount');
    expect(LAUNCH_SEC - timestampOf(weekRead)).toBeLessThanOrEqual(WEEK);
    const hourRead = Math.max(...pastReads.filter((r) => r.startsWith('balanceOf')).map((r) => Number(BigInt(r.split(':')[2]!))));
    expect(timestampOf(hourRead) - LAUNCH_SEC).toBeLessThanOrEqual(3_600);
  });

  // An airdrop 200 days before the launch made the wallet look old; it had sent nothing a week before.
  it('flags a wallet with no transactions and no code a week before the launch, without claiming the age of its first transfer in', async () => {
    const r = await checkToken(TOKEN, deps(twoSecond({ weekBefore: { nonce: 0 } })));
    expect(r.creator?.week_before_launch).toEqual({ block: LAUNCH_BLOCK - 302_400, sent_txs: 0, has_code: false });
    expect(r.flags).toContain('new_creator');
    expect(r.creator?.age_days_at_launch).toBeNull();
    expect(r.verdict.reason).toBe('The wallet that launched it had not sent a single transaction a week before the launch, so its own activity is less than 7 days old.');
  });

  // A smart wallet deployed months ago whose first transfer in came two days before the launch.
  it('does not flag a wallet that had sent transactions a week before the launch, whatever its first transfer in says', async () => {
    const r = await checkToken(TOKEN, deps(twoSecond({ weekBefore: { nonce: 1, code: '0x6080' }, creatorFirstInbound: { from: FUNDER, time: days(2), hash: '0xf2' } })));
    expect(r.flags).not.toContain('new_creator');
    expect(r.creator?.age_days_at_launch).toBeNull();
    expect(r.creator?.week_before_launch).toMatchObject({ sent_txs: 1, has_code: true });
  });

  it('keeps the age from its first transfer in when its own activity agrees', async () => {
    const r = await checkToken(TOKEN, deps(twoSecond({ weekBefore: { nonce: 0 }, creatorFirstInbound: { from: FUNDER, time: days(2), hash: '0xf2' } })));
    expect(r.creator?.age_days_at_launch).toBe(2);
    expect(r.verdict.reason).toBe('The wallet that launched it was first seen 2 days before the launch.');
  });

  // 150 sends of one token each, then the rest sold 10 minutes in: the first 100 transfers show 1%.
  it('reads the share gone from the balance an hour in, and says so, when small sends fill the first transfers', async () => {
    const dust = Array.from({ length: 150 }, (_, i): Transfer => ({ from: CREATOR, to: `0x${(i + 1).toString(16).padStart(40, '0')}`, value: 1, hash: `0xd${i}`, block: LAUNCH_BLOCK + 10 + i, time: ts(LAUNCH_TIME, 20 + 2 * i) }));
    const r = await checkToken(
      TOKEN,
      deps(
        twoSecond({
          weekBefore: { nonce: 9 },
          transfers: [
            mint(POOL, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX),
            { from: POOL, to: CREATOR, value: 10_000, hash: LAUNCH_TX, block: LAUNCH_BLOCK, time: LAUNCH_TIME },
            ...dust,
            { from: CREATOR, to: POOL, value: 9_350, hash: '0xsell', block: LAUNCH_BLOCK + 300, time: ts(LAUNCH_TIME, 600) },
          ],
        }),
      ),
    );
    expect(r.creator?.launch_tokens).toMatchObject({ received: 10_000, held_at_launch: 10_000, held_1h: 500, held_1h_after_sec: 3_600, sent_1h_pct: 95, sent_pct: 95, first_send_after_sec: 20, sent_90pct_after_sec: null });
    expect(r.flags).toContain('creator_sent_launch_tokens');
    expect(r.verdict.reason).toBe('The wallet that launched it received 10,000 tokens in the launch transaction and an hour later held only 5% of them.');
  });

  it('reads a token under an hour old as of now, with no read past the head', async () => {
    const pastReads: string[] = [];
    const r = await checkToken(
      TOKEN,
      deps({ ...twoSecond(), head: LAUNCH_BLOCK + 900, now: new Date((LAUNCH_SEC + 1_800) * 1000), transfers: buyAndSell(100, 200), creatorBalance: 0n, weekBefore: { nonce: 4 }, pastReads }),
    );
    expect(pastReads.filter((x) => x.startsWith('balanceOf'))).toEqual([`balanceOf:${CREATOR}:${at(0)}`]);
    expect(r.creator?.launch_tokens).toMatchObject({ held_1h: 0, held_1h_after_sec: 1_800, sent_1h_pct: 100 });
  });

  it('does not read balances for a launch wallet that got no tokens in the launch transaction', async () => {
    const pastReads: string[] = [];
    await checkToken(TOKEN, deps(twoSecond({ weekBefore: { nonce: 4 }, pastReads })));
    expect(pastReads.some((x) => x.startsWith('balanceOf'))).toBe(false);
  });

  // Several smart wallets' operations in one bundle; the logs arrive out of order.
  it('names the smart wallet whose UserOperationEvent first follows the token\'s first log', async () => {
    const entryPoint = '0x0000000071727de22e5e9d8baf0edac6f37da032';
    const userOp = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
    const [a, b, d] = ['a', 'b', 'd'].map((x) => `0x${x.repeat(40)}`);
    const op = (sender: string, i: number) => ({ address: entryPoint, topics: [userOp, `0x${String(i).repeat(64)}`, topic(sender!), topic(ZERO)], logIndex: `0x${i.toString(16)}` });
    const r = await checkToken(
      TOKEN,
      deps({
        launchTx: { hash: LAUNCH_TX, from: `0x${'e'.repeat(40)}`, to: entryPoint },
        launchReceiptLogs: [op(d!, 9), op(b!, 7), { address: TOKEN, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'], logIndex: '0x5' }, op(a!, 3)],
        transfers: [mint(POOL, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
      }),
    );
    expect(r.launch?.creator).toBe(b);
    expect(r.flags).not.toContain('launch_unknown');
  });
});

// Liquidity the launch wallet added to and removed from the token's v2-style pools, read from the factories'
// creation logs and the pools' LP logs; and supply vesting to it on a Doppler token.
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
const AGGREGATE3 = parseAbi(['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)']);
const UNI_V2_FACTORY = '0x8909dc15e40173ff4699343b6eb8132c65e18ec6';
const AERO_FACTORY = '0x420dd381b31aef6683db6b902084cb0ffece40da';
const T = {
  pairCreated: '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9',
  poolCreated: '0x2128d88d14c80cb081c1252a5acff7a264671bf199ce226b53788fb26065005e',
  transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  mint: '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f',
  burnV2: '0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496',
  burnAero: '0x5d624aa9c148153ab3446c1b154f660ee7701e549fe9b62dab7171b1c80e6fa2',
};
const WETH = '0x4200000000000000000000000000000000000006';
const ROUTER = `0x${'4'.repeat(40)}`;
const E18 = 10n ** 18n;

describe('checkToken: liquidity the launch wallet removed', () => {
  let index = 0;
  const rpcLog = (address: string, topics: string[], words: bigint[], block: number, tx: string): RpcLog => ({
    address,
    topics,
    data: `0x${words.map(word).join('')}`,
    blockNumber: `0x${block.toString(16)}`,
    transactionHash: tx,
    logIndex: `0x${(index++).toString(16)}`,
  });
  const lp = (from: string, to: string, amount: bigint, block: number, tx: string) => rpcLog(POOL, [T.transfer, topic(from), topic(to)], [amount], block, tx);
  /** A pool of TOKEN (0x77..) against `paired`, created by a factory, with token0 the lower address. */
  const created = (factory: string, paired: string, block: number) => {
    const [t0, t1] = paired < TOKEN ? [paired, TOKEN] : [TOKEN, paired];
    return factory === AERO_FACTORY
      ? rpcLog(factory, [T.poolCreated, topic(t0), topic(t1), topic(ZERO)], [BigInt(POOL), 9n], block, '0xpool')
      : rpcLog(factory, [T.pairCreated, topic(t0), topic(t1)], [BigInt(POOL), 9n], block, '0xpool');
  };
  /** LP minted to `to` for `paired` of the paired token and `tokens` of TOKEN (amount0 is the paired token's: it sorts first). */
  const add = (lpAmount: bigint, paired: bigint, tokens: bigint, block: number, tx: string, to = CREATOR) => [
    lp(ZERO, to, lpAmount, block, tx),
    rpcLog(POOL, [T.mint, topic(ROUTER)], [paired, tokens], block, tx),
  ];
  const remove = (lpAmount: bigint, paired: bigint, tokens: bigint, block: number, tx: string, burn: 'v2' | 'aero') => [
    lp(CREATOR, POOL, lpAmount, block, tx),
    lp(POOL, ZERO, lpAmount, block, tx),
    burn === 'v2'
      ? rpcLog(POOL, [T.burnV2, topic(ROUTER), topic(ROUTER)], [paired, tokens], block, tx)
      : rpcLog(POOL, [T.burnAero, topic(ROUTER), topic(ROUTER)], [paired, tokens], block, tx),
  ];
  // The launch wallet's own token transfers into the pool and back, which date the adds and removals.
  const moves = (rows: Array<[string, string, number, number, string, number]>) =>
    rows.map(([from, to, value, block, hash, sec]) => ({ from, to, value, hash, block, time: ts(LAUNCH_TIME, sec) }));

  it('answers hold when the launch wallet removed most of its liquidity from an Aerodrome pool, in two goes', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        logs: [
          created(AERO_FACTORY, WETH, LAUNCH_BLOCK + 5),
          lp(ZERO, `0x${'0'.repeat(39)}1`, 1000n, LAUNCH_BLOCK + 5, '0xadd'),
          ...add(1000n * E18, 2n * E18, 500_000n * E18, LAUNCH_BLOCK + 5, '0xadd'),
          ...remove(300n * E18, 6n * 10n ** 17n, 150_000n * E18, LAUNCH_BLOCK + 300, '0xrm1', 'aero'),
          ...remove(300n * E18, 62n * 10n ** 16n, 140_000n * E18, LAUNCH_BLOCK + 600, '0xrm2', 'aero'),
        ],
        transfers: [
          mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX),
          ...moves([
            [CREATOR, POOL, 500_000, LAUNCH_BLOCK + 5, '0xadd', 10],
            [POOL, CREATOR, 150_000, LAUNCH_BLOCK + 300, '0xrm1', 600],
            [POOL, CREATOR, 140_000, LAUNCH_BLOCK + 600, '0xrm2', 1200],
          ]),
        ],
      }),
    );
    expect(r.liquidity?.pools?.[0]).toEqual({
      address: POOL,
      dex: 'aerodrome',
      paired_with: WETH,
      paired_symbol: 'WETH',
      launch_wallet: {
        added: 2,
        added_tokens: 500_000,
        added_after_sec: 10,
        // Two removals: their amounts are not read (one receipt each); the shares come from the LP transfers.
        removed: null,
        removed_tokens: null,
        removed_pct: 60,
        pool_pct: 59.99,
        removed_after_sec: 1200,
        removal_tx: '0xrm2',
      },
    });
    expect(r.flags).toContain('creator_removed_liquidity');
    expect(r.verdict).toEqual({
      label: 'hold',
      reason: "The wallet that launched it removed 60% of its liquidity from the token's Aerodrome pool by 20 minutes after the launch: it took out 59.99% of what the pool held, after putting in 2 WETH.",
    });
  });

  it('reports a removal of less than half of what it added, without the flag', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        logs: [
          created(UNI_V2_FACTORY, WETH, LAUNCH_BLOCK + 5),
          ...add(1000n * E18, 2n * E18, 500_000n * E18, LAUNCH_BLOCK + 5, '0xadd'),
          ...remove(300n * E18, 6n * 10n ** 17n, 150_000n * E18, LAUNCH_BLOCK + 300, '0xrm1', 'v2'),
        ],
        transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
      }),
    );
    expect(r.liquidity?.pools?.[0]?.launch_wallet).toMatchObject({ removed: 0.6, removed_pct: 30, pool_pct: 30 });
    expect(r.flags).not.toContain('creator_removed_liquidity');
    expect(r.verdict.label).toBe('no_flags');
  });

  // LP tokens sent to a locker (or any other wallet) are not followed: only LP it sent back to the pool counts as removed.
  it('does not count LP tokens the launch wallet moved elsewhere as removed', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        logs: [
          created(UNI_V2_FACTORY, WETH, LAUNCH_BLOCK + 5),
          ...add(1000n * E18, 2n * E18, 500_000n * E18, LAUNCH_BLOCK + 5, '0xadd'),
          lp(CREATOR, `0x${'b'.repeat(40)}`, 1000n * E18, LAUNCH_BLOCK + 9, '0xlock'),
        ],
        transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
      }),
    );
    expect(r.liquidity?.pools?.[0]?.launch_wallet).toMatchObject({ added: 2, removed: null, removed_pct: 0, pool_pct: null, removal_tx: null });
    expect(r.flags).not.toContain('creator_removed_liquidity');
  });

  it('reports a pool the launch wallet never added to, without its part', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        logs: [created(UNI_V2_FACTORY, WETH, LAUNCH_BLOCK + 5), ...add(1000n * E18, 2n * E18, 500_000n * E18, LAUNCH_BLOCK + 5, '0xadd', FUNDER)],
        transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
      }),
    );
    expect(r.liquidity).toEqual({ locked_by: null, capped: false, pools: [{ address: POOL, dex: 'uniswap_v2', paired_with: WETH, paired_symbol: 'WETH', launch_wallet: null }] });
  });

  // A token paired with something other than WETH, USDC and the other listed assets: no pool lookup asks for it.
  it('does not look up pools against an unlisted paired token', async () => {
    const paired = `0x${'5'.repeat(40)}`;
    const calls: string[] = [];
    const r = await checkToken(
      TOKEN,
      deps({
        calls,
        logs: [created(UNI_V2_FACTORY, paired, LAUNCH_BLOCK + 5), ...add(1000n * E18, 1_000n * 10n ** 6n, 500_000n * E18, LAUNCH_BLOCK + 5, '0xadd')],
        transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
      }),
    );
    expect(r.liquidity).toEqual({ locked_by: null, pools: [], capped: false });
    expect(calls.filter((c) => c.endsWith(':aggregate3'))).toHaveLength(1);
    expect(calls.some((c) => c.endsWith(':0x313ce567') && !c.startsWith(TOKEN))).toBe(false);
  });

  // LP transfers that fill one read: the pools are listed, the launch wallet's part unread, never a guess.
  it("lists the pools but leaves the launch wallet's part unread when their LP transfers fill the read", async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        logs: [created(UNI_V2_FACTORY, WETH, LAUNCH_BLOCK + 5), ...add(1000n * E18, 2n * E18, 500_000n * E18, LAUNCH_BLOCK + 5, '0xadd')],
        lpPageFull: true,
        transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
      }),
    );
    expect(r.liquidity).toEqual({ locked_by: null, capped: true, pools: [{ address: POOL, dex: 'uniswap_v2', paired_with: WETH, paired_symbol: 'WETH', launch_wallet: null }] });
    expect(r.flags).not.toContain('creator_removed_liquidity');
  });

  it.each([
    ['pool lookup', 'lookup'],
    ['LP transfers', 'lp'],
  ] as const)('fails rather than guess when the provider refuses the %s read', async (_name, on) => {
    await expect(
      checkToken(
        TOKEN,
        deps({
          logs: [created(UNI_V2_FACTORY, WETH, LAUNCH_BLOCK + 5)],
          failPools: { on, message: 'Your app has exceeded its compute units per second capacity' },
          transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
        }),
      ),
    ).rejects.toThrow(/capacity/);
  });

  // Alchemy's free tier refuses eth_getLogs over more than 10 blocks: the liquidity read uses none.
  it('reads the liquidity without eth_getLogs', async () => {
    const log: string[] = [];
    const r = await checkToken(
      TOKEN,
      deps(
        {
          logs: [
            created(UNI_V2_FACTORY, WETH, LAUNCH_BLOCK + 5),
            ...add(1000n * E18, 2n * E18, 500_000n * E18, LAUNCH_BLOCK + 5, '0xadd'),
            ...remove(1000n * E18, 3n * E18, 450_000n * E18, LAUNCH_BLOCK + 30, '0xrm', 'v2'),
          ],
          transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
        },
        log,
      ),
    );
    expect(r.flags[0]).toBe('creator_removed_liquidity');
    expect(r.liquidity?.pools?.[0]?.launch_wallet).toMatchObject({ added: 2, added_tokens: 500_000, removed: 3, removed_tokens: 450_000, removed_pct: 100, pool_pct: 100, removed_after_sec: 60 });
    expect(log).not.toContain('eth_getLogs');
  });

  it('reads no pools when the launch wallet is unknown', async () => {
    const log: string[] = [];
    const r = await checkToken(TOKEN, deps({ codeFromBlock: LAUNCH_BLOCK - 10, transfers: [mint(POOL, 5, LAUNCH_BLOCK, '0xm1')], receipts: [] }, log));
    expect(r.flags).toContain('launch_unknown');
    expect(r.liquidity).toEqual({ locked_by: null, pools: null, capped: false });
    expect(log).not.toContain('eth_getLogs');
  });
});

describe('checkToken: supply vesting to the launch wallet (Doppler)', () => {
  const AIRLOCK = '0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12';
  const created = { address: AIRLOCK, topics: ['0x68ff1cfcdcf76864161555fc0de1878d8f83ec6949bf351df74d8a4a1a2679ab', topic(WETH)], data: `0x${word(BigInt(TOKEN))}${word(0n)}${word(0n)}` };
  const launchSec = Math.floor(new Date(LAUNCH_TIME).getTime() / 1000);

  it('says the vested share can be claimed once its vesting has ended', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        launchReceiptLogs: [created],
        transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
        creatorBalance: SUPPLY / 20n,
        vesting: { total: 300_000n * E18, released: 100_000n * E18, start: launchSec, duration: 86_400 },
      }),
    );
    expect(r.liquidity).toEqual({ locked_by: 'doppler', pools: null, capped: false });
    expect(r.creator?.vesting).toEqual({ amount: 200_000, pct: 20, released: 100_000, start: LAUNCH_TIME, cliff_end: null, end: ts(LAUNCH_TIME, 86_400) });
    expect(r.creator?.holds_with_vesting_pct).toBe(25);
    expect(r.verdict).toEqual({ label: 'review', reason: 'The wallet that launched it holds 5% of the supply and can claim another 20% that has vested to it.' });
  });

  it('keeps the large-share reason as it was when nothing vests to the launch wallet', async () => {
    const r = await checkToken(
      TOKEN,
      deps({ launchReceiptLogs: [created], transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], creatorBalance: SUPPLY / 4n, vesting: { total: 0n, released: 0n, start: 0, duration: 0 } }),
    );
    expect(r.creator?.vesting).toEqual({ amount: 0, pct: 0, released: 0, start: null, cliff_end: null, end: null });
    expect(r.verdict).toEqual({ label: 'review', reason: 'The wallet that launched it still holds 25% of the supply.' });
  });
});

describe('checkToken: the wallet a launch was made for', () => {
  const SERVICE = `0x${'5'.repeat(40)}`;
  const FOR = `0x${'6'.repeat(40)}`;
  const ZORA = '0x777777751622c0d3258f214f9df38e35bf45baf3';
  const AIRLOCK = '0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12';
  const TOKEN_CREATED = '0x9299d1d1a88d8e1abdc591ae7a167a6bc63a8f17d695804e9091ee33aa89fb67';
  const COIN_CREATED = '0x2de436107c2096e039c98bbcc3c5a2560583738ce15c234557eecb4d3221aa81';
  const VESTING_ALLOCATED = '0x6b467f0a76daac5283d2251b6e7660fed01ea99dbd70aa7092f3318731690c9d';
  const words = (...ws: string[]) => `0x${ws.join('')}`;
  const addrWord = (a: string) => a.slice(2).padStart(64, '0');

  // A launch service sends Clanker launches for other wallets: TokenCreated names the admin.
  it("describes Clanker's token admin when a launch service sent the launch, and counts the admin's own launches", async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        clanker: true,
        launchTx: { hash: LAUNCH_TX, from: SERVICE, to: CLANKER_V4_FACTORY.toLowerCase() },
        launchReceiptLogs: [{ address: CLANKER_V4_FACTORY.toLowerCase(), topics: [TOKEN_CREATED, topic(TOKEN), topic(FOR)], data: words(addrWord(SERVICE)) }],
        originalAdmin: FOR,
        transfers: [mint(CLANKER_V4_FACTORY.toLowerCase(), 100_000_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
        factoryWallet: FOR,
        factoryLaunches: 5,
        factoryOmitsLaunch: true,
      }),
    );
    expect(r.launch).toMatchObject({ creator: SERVICE, token_admin: FOR, made_for: { address: FOR, named_as: 'token_admin' } });
    expect(r.launch?.launcher_note).toContain(`The token's admin at launch, ${FOR}, is not the wallet that sent the launch, ${SERVICE}`);
    expect(r.creator).toMatchObject({ address: FOR, role: 'made_for', clanker_launches_24h: 6 });
    expect(r.flags).toContain('creator_serial_launcher');
    expect(r.verdict).toEqual({ label: 'review', reason: 'The wallet it was launched for has 6 launches within 19 hours, this one included: 6 through Clanker.' });
  });

  it("describes Zora's payout recipient when another wallet created the coin", async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        launchTx: { hash: LAUNCH_TX, from: SERVICE, to: ZORA },
        launchReceiptLogs: [{ address: ZORA, topics: [COIN_CREATED, topic(SERVICE), topic(FOR), topic(ZERO)], data: words(addrWord(WETH), addrWord(TOKEN)) }],
        transfers: [mint(ZORA, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
      }),
    );
    expect(r.launch).toMatchObject({ creator: SERVICE, made_for: { address: FOR, named_as: 'payout_recipient' } });
    expect(r.creator).toMatchObject({ address: FOR, role: 'made_for' });
    expect(r.liquidity?.locked_by).toBe('zora');
  });

  it('describes the sender when the Zora coin pays the wallet that created it', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        launchTx: { hash: LAUNCH_TX, from: CREATOR, to: ZORA },
        launchReceiptLogs: [{ address: ZORA, topics: [COIN_CREATED, topic(CREATOR), topic(CREATOR), topic(ZERO)], data: words(addrWord(WETH), addrWord(TOKEN)) }],
        transfers: [mint(ZORA, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
      }),
    );
    expect(r.launch?.made_for).toBeNull();
    expect(r.creator).toMatchObject({ address: CREATOR, role: 'launch_wallet' });
  });

  // Several wallets vest: none of them is the wallet it was made for.
  it('describes the sender when a Doppler token vests to several wallets', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        launchTx: { hash: LAUNCH_TX, from: SERVICE, to: AIRLOCK },
        launchReceiptLogs: [
          { address: AIRLOCK, topics: ['0x68ff1cfc', topic(WETH)], data: words(addrWord(TOKEN), addrWord(POOL), addrWord(TOKEN)) },
          { address: TOKEN, topics: [VESTING_ALLOCATED, topic(FOR), topic(ZERO)], data: words(word(10n ** 27n)) },
          { address: TOKEN, topics: [VESTING_ALLOCATED, topic(FUNDER), topic(ZERO)], data: words(word(10n ** 27n)) },
        ],
        transfers: [mint(AIRLOCK, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)],
      }),
    );
    expect(r.launch?.made_for).toBeNull();
    expect(r.creator?.address).toBe(SERVICE);
  });
});

describe('checkToken: launch tokens sent out long after the launch', () => {
  // Past the day its transfers are read for: only its balance at this check shows them gone.
  it('flags launch tokens gone from its balance at this check, and says how long after the launch', async () => {
    const r = await checkToken(
      TOKEN,
      deps({
        clanker: true,
        launchTx: { hash: LAUNCH_TX, from: CREATOR, to: CLANKER_V4_FACTORY.toLowerCase() },
        transfers: [
          mint(CLANKER_V4_FACTORY.toLowerCase(), 100_000_000_000, LAUNCH_BLOCK, LAUNCH_TX),
          { from: POOL, to: CREATOR, value: 1_000, hash: LAUNCH_TX, block: LAUNCH_BLOCK, time: LAUNCH_TIME },
          { from: CREATOR, to: POOL, value: 1_000, hash: '0xlate', block: LAUNCH_BLOCK + 130_000, time: ts(LAUNCH_TIME, 3 * 86_400) },
        ],
        creatorBalance: 0n,
      }),
    );
    expect(r.creator?.launch_tokens).toMatchObject({ sent_90pct_after_sec: null, held_now: 0, sent_now_pct: 100 });
    expect(r.flags).toContain('creator_sent_launch_tokens');
    expect(r.verdict.reason).toBe('The wallet that launched it received 1,000 tokens in the launch transaction and 163 days after the launch held none of them.');
  });
});
