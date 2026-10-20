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
  /** The token's admin() (Clanker tokens have one); null = admin() reverts. Default: the launch transaction's sender. */
  tokenAdmin?: string | null;
  /** Transactions the launch wallet sent to Clanker's factory in the queried window. */
  factoryLaunches?: number;
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
            if (data === '0xf851a440') {
              if (c.tokenAdmin === null) throw new Error('execution reverted');
              return `0x${(c.tokenAdmin ?? c.launchTx?.from ?? CREATOR).slice(2).padStart(64, '0')}`;
            }
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
      // The launch wallet's own launch transactions to Clanker's factory.
      if (q.toAddress === CLANKER_V4_FACTORY.toLowerCase()) {
        const n = Math.min(c.factoryLaunches ?? 0, max);
        return { transfers: Array.from({ length: n }, (_, i) => ({ from: q.fromAddress!, to: q.toAddress!, hash: `0xl${i}`, value: 0.0001 })) };
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

  describe('serial launchers through Clanker', () => {
    const OTHER = `0x${'a'.repeat(40)}`;
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
    it('answers review when the launch wallet, also the token admin, launched many tokens through Clanker that day', async () => {
      const queries: Array<Record<string, unknown>> = [];
      const r = await checkToken(TOKEN, clankerLaunch({ factoryLaunches: 96, queries }));
      expect(r.flags).toContain('creator_serial_launcher');
      expect(r.creator?.clanker_launches_24h).toBe(96);
      expect(r.launch?.token_admin).toBe(CREATOR);
      expect(r.verdict).toEqual({ label: 'review', reason: 'The wallet that launched it launched 96 tokens through Clanker in the 24 hours up to and including this one.' });
      const q = queries.find((x) => x.toAddress === CLANKER_V4_FACTORY.toLowerCase())!;
      expect(q).toMatchObject({ fromAddress: CREATOR, category: ['external'], excludeZeroValue: false });
      expect(q.fromBlock).toBe(`0x${(LAUNCH_BLOCK - 43_200).toString(16)}`);
      expect(q.toBlock).toBe(`0x${LAUNCH_BLOCK.toString(16)}`);
    });

    it('does not flag a launch wallet below the threshold', async () => {
      const r = await checkToken(TOKEN, clankerLaunch({ factoryLaunches: 4 }));
      expect(r.flags).not.toContain('creator_serial_launcher');
      expect(r.creator?.clanker_launches_24h).toBe(4);
      expect(r.verdict.label).toBe('no_flags');
    });

    it('says at least when the launch count fills a page', async () => {
      const r = await checkToken(TOKEN, clankerLaunch({ factoryLaunches: 5_000 }));
      expect(r.creator?.clanker_launches_24h).toBe(1_000);
      expect(r.verdict.reason).toBe('The wallet that launched it launched at least 1,000 tokens through Clanker in the 24 hours up to and including this one.');
    });

    // Clanker's X bot sends the launch for whoever asked it; the token admin is that wallet.
    it('names the token admin when a service launched it for another wallet, and does not count the service', async () => {
      const queries: Array<Record<string, unknown>> = [];
      const r = await checkToken(TOKEN, clankerLaunch({ tokenAdmin: OTHER, factoryLaunches: 500, queries }));
      expect(r.launch?.token_admin).toBe(OTHER);
      expect(r.launch?.launcher_note).toContain(OTHER);
      expect(r.launch?.launcher_note).toMatch(/describe the wallet that sent the launch/);
      expect(r.flags).not.toContain('creator_serial_launcher');
      expect(r.creator?.clanker_launches_24h).toBeNull();
    });

    it('neither reads an admin nor counts launches for a token Clanker did not launch', async () => {
      const queries: Array<Record<string, unknown>> = [];
      const log: string[] = [];
      const r = await checkToken(TOKEN, deps({ transfers: [mint(CREATOR, 1_000_000, LAUNCH_BLOCK, LAUNCH_TX)], factoryLaunches: 96, queries }, log));
      expect(r.launch?.token_admin).toBeNull();
      expect(r.creator?.clanker_launches_24h).toBeNull();
      expect(queries.some((x) => x.toAddress === CLANKER_V4_FACTORY.toLowerCase())).toBe(false);
      expect(r.flags).not.toContain('creator_serial_launcher');
    });

    it('treats a Clanker token without a readable admin as launched by its sender', async () => {
      const r = await checkToken(TOKEN, clankerLaunch({ tokenAdmin: null, factoryLaunches: 96 }));
      expect(r.launch?.token_admin).toBeNull();
      expect(r.flags).toContain('creator_serial_launcher');
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
  });
});
