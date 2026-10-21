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
const abiString = (s: string) => `0x${word(32n)}${word(BigInt(s.length))}${Buffer.from(s).toString('hex').padEnd(64, '0')}`;
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
  return {
    now: () => NOW,
    rpc: async (method, params) => {
      log.push(method);
      const p = params as unknown[];
      switch (method) {
        case 'eth_blockNumber':
          return `0x${HEAD.toString(16)}`;
        case 'eth_getCode': {
          const [addr, block] = p as [string, string];
          if (addr === TOKEN) {
            if (c.code === false) return '0x';
            const b = block === 'latest' ? HEAD : Number(BigInt(block));
            return b >= codeFrom ? '0x6080' : '0x';
          }
          if (addr === CREATOR) return c.creatorCode ?? '0x';
          return '0x';
        }
        case 'eth_call': {
          const [{ to, data }] = p as [{ to: string; data: string }];
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
            if (data === '0x95d89b41') return abiString('CLK2');
            if (data === '0x06fdde03') return abiString('ClankerToken');
            if (data.startsWith('0x70a08231')) return `0x${word(c.creatorBalance ?? 0n)}`;
            if (data === '0x1c7b2ff4') {
              if (c.originalAdmin === null) throw new Error('execution reverted');
              return `0x${(c.originalAdmin ?? c.launchTx?.from ?? CREATOR).slice(2).padStart(64, '0')}`;
            }
            if (data === '0xf851a440') return `0x${(c.currentAdmin ?? c.originalAdmin ?? c.launchTx?.from ?? CREATOR).slice(2).padStart(64, '0')}`;
          }
          return `0x${word(0n)}`; // USDC balanceOf in the wallet lookup
        }
        case 'eth_getTransactionByHash': {
          const tx = c.launchTx ?? { hash: LAUNCH_TX, from: CREATOR, to: null };
          return p[0] === tx.hash ? { hash: tx.hash, from: tx.from, to: tx.to } : null;
        }
        case 'eth_getBlockReceipts':
          return c.receipts ?? [];
        case 'eth_getTransactionReceipt':
          return { transactionHash: p[0], logs: (c.launchReceiptLogs ?? []).map((l) => ({ data: '0x', ...l })) };
        case 'eth_getBlockByNumber':
          return { timestamp: `0x${Math.floor(new Date(LAUNCH_TIME).getTime() / 1000).toString(16)}` };
        case 'eth_getTransactionCount': {
          const addr = p[0] as string;
          if (addr === CREATOR) return `0x${(c.creatorNonce ?? 40).toString(16)}`;
          if (addr === FUNDER) return `0x${(c.funderNonce ?? 3).toString(16)}`;
          return '0x0';
        }
        case 'eth_getBalance':
          return '0x0';
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
    transfers: async (raw) => {
      c.queries?.push(raw);
      const q = raw as { contractAddresses?: string[]; fromAddress?: string; toAddress?: string; order?: string; maxCount?: string; fromBlock?: string };
      log.push(`transfers:${q.contractAddresses ? 'token' : 'wallet'}:${q.fromAddress === ZERO ? 'mints' : q.fromAddress ? 'from' : q.toAddress ? 'to' : 'all'}`);
      const max = q.maxCount ? Number(BigInt(q.maxCount)) : 1000;
      if (q.contractAddresses) {
        let list = tokenTransfers;
        if (q.fromBlock) list = list.filter((t) => t.block >= Number(BigInt(q.fromBlock!)));
        if (q.fromAddress) list = list.filter((t) => t.from === q.fromAddress);
        if (q.toAddress) list = list.filter((t) => t.to === q.toAddress);
        if (q.order === 'desc') list = [...list].reverse();
        return { transfers: list.slice(0, max).map(asAlchemy) };
      }
      // The launch wallet's own transactions to Clanker's factory, newest first, with block times.
      if (q.toAddress === CLANKER_V4_FACTORY.toLowerCase()) {
        if (c.failFactory) throw new Error('alchemy_getAssetTransfers: Your app has exceeded its compute units per second capacity');
        const owner = c.factoryWallet ?? c.launchTx?.from ?? CREATOR;
        if (q.fromAddress !== owner) return { transfers: [] };
        const within = c.factoryLaunches ?? 0;
        const rows: Array<{ hash: string; sec: number }> = [];
        for (let i = 0; i < within; i++) rows.push({ hash: i === 0 && !c.factoryOmitsLaunch ? LAUNCH_TX : `0xl${i}`, sec: -Math.floor((i * 86_000) / within) });
        for (let j = 0; j < (c.factoryOlder ?? 0); j++) rows.push({ hash: `0xo${j}`, sec: -86_400 - 3_600 * (j + 1) });
        return {
          transfers: rows.slice(0, max).map((r) => ({ from: owner, to: q.toAddress!, hash: r.hash, value: 0, metadata: { blockTimestamp: ts(LAUNCH_TIME, r.sec) } })),
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
      }),
    );
    expect(r.flags).not.toContain('creator_sent_launch_tokens');
    expect(r.creator?.launch_tokens).toMatchObject({ received: 1_000, sent_pct: 0, first_send_after_sec: null });
  });

  // 1% sent five minutes in and the rest 22 hours later is not a dump within the hour.
  it('flags a send-out only when most of the launch tokens left within the hour', async () => {
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
    expect(r.flags).not.toContain('creator_sent_launch_tokens');
    expect(r.creator?.launch_tokens).toMatchObject({ received: 10_000, sent_pct: 100, first_send_after_sec: 300, sent_90pct_after_sec: 79_200 });
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
        ...extra,
      });

    // 0x1afab1f6...: two same-name tokens every 30 minutes, about 96 a day, admin and fee recipient of each.
    it('answers review when the launch wallet launched many tokens through Clanker in the 24 hours up to this one', async () => {
      const queries: Array<Record<string, unknown>> = [];
      const r = await checkToken(TOKEN, clankerLaunch({ factoryLaunches: 96, queries }));
      expect(r.flags).toContain('creator_serial_launcher');
      expect(r.creator?.clanker_launches_24h).toBe(96);
      expect(r.launch?.token_admin).toBe(CREATOR);
      expect(r.verdict).toEqual({ label: 'review', reason: 'The wallet that launched it launched 96 tokens through Clanker in the 24 hours up to and including this one.' });
      const q = queries.find((x) => x.toAddress === CLANKER_V4_FACTORY.toLowerCase())!;
      expect(q).toMatchObject({ fromAddress: CREATOR, category: ['external'], excludeZeroValue: false, order: 'desc', withMetadata: true });
      // Wide enough for a day at 5 blocks a second (Denim); the day itself is cut by block time.
      expect(q.fromBlock).toBe(`0x${(LAUNCH_BLOCK - 432_000).toString(16)}`);
      expect(q.toBlock).toBe(`0x${LAUNCH_BLOCK.toString(16)}`);
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
      expect(r.verdict.reason).toBe('The wallet that launched it launched at least 1,000 tokens through Clanker in the 24 hours up to and including this one.');
    });

    // A launch through a router or multicall is not a transaction to the factory: the count would read too low.
    it('leaves the count unknown when this launch did not go straight from the launch wallet to the factory', async () => {
      const r = await checkToken(TOKEN, clankerLaunch({ factoryLaunches: 96, factoryOmitsLaunch: true }));
      expect(r.creator?.clanker_launches_24h).toBeNull();
      expect(r.flags).not.toContain('creator_serial_launcher');
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
      expect(r.creator?.clanker_launches_24h).toBeNull();
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

    it('neither reads an admin nor counts launches for a token Clanker did not launch', async () => {
      const queries: Array<Record<string, unknown>> = [];
      const calls: string[] = [];
      const r = await checkToken(TOKEN, deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], factoryLaunches: 96, queries, calls }));
      expect(r.launch?.token_admin).toBeNull();
      expect(r.creator?.clanker_launches_24h).toBeNull();
      expect(queries.some((x) => x.toAddress === CLANKER_V4_FACTORY.toLowerCase())).toBe(false);
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
