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

interface Transfer {
  from: string;
  to: string;
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
  launchReceiptLogs?: Array<{ address: string; topics: string[] }>;
  /** eth_calls the provider refuses ('registry', or a selector on the token), as a throttled RPC does. */
  failCalls?: string[];
}

function deps(c: Chain, log: string[] = []): WalletLookupDeps {
  const codeFrom = c.codeFromBlock ?? LAUNCH_BLOCK;
  const tokenTransfers = [...(c.transfers ?? [])].sort((a, b) => a.block - b.block);
  const asAlchemy = (t: Transfer) => ({ from: t.from, to: t.to, value: t.value, hash: t.hash, blockNum: `0x${t.block.toString(16)}`, metadata: { blockTimestamp: t.time } });
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
          if (to === CLANKER_V4_FACTORY.toLowerCase()) {
            const tokenWord = c.clanker ? TOKEN.slice(2).padStart(64, '0') : word(0n);
            return `0x${word(32n)}${tokenWord}${word(0n)}${word(0n)}`;
          }
          if (to === TOKEN) {
            if (data === '0x18160ddd') {
              if (c.totalSupply === null) throw new Error('execution reverted');
              return `0x${word(c.totalSupply ?? SUPPLY)}`;
            }
            if (data === '0x313ce567') return `0x${word(18n)}`;
            if (data === '0x95d89b41') return abiString('CLK2');
            if (data === '0x06fdde03') return abiString('ClankerToken');
            if (data.startsWith('0x70a08231')) return `0x${word(c.creatorBalance ?? 0n)}`;
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
          return { transactionHash: p[0], logs: c.launchReceiptLogs ?? [] };
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
      const q = raw as { contractAddresses?: string[]; fromAddress?: string; toAddress?: string; order?: string; maxCount?: string };
      log.push(`transfers:${q.contractAddresses ? 'token' : 'wallet'}:${q.fromAddress === ZERO ? 'mints' : q.fromAddress ? 'from' : q.toAddress ? 'to' : 'all'}`);
      const max = q.maxCount ? Number(BigInt(q.maxCount)) : 1000;
      if (q.contractAddresses) {
        let list = tokenTransfers;
        if (q.fromAddress) list = list.filter((t) => t.from === q.fromAddress);
        if (q.toAddress) list = list.filter((t) => t.to === q.toAddress);
        if (q.order === 'desc') list = [...list].reverse();
        return { transfers: list.slice(0, max).map(asAlchemy) };
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
    expect(r.supply).toMatchObject({ mints_after_launch: 2, minted_after_launch: 1_000_000, to_creator: 2 });
    expect(r.verdict.reason).toMatch(/minted/i);
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
  it('names the smart wallet, not the bundler, when the launch came through the EntryPoint', async () => {
    const entryPoint = '0x0000000071727de22e5e9d8baf0edac6f37da032';
    const bundler = `0x${'b'.repeat(40)}`;
    const smartWallet = `0x${'5'.repeat(40)}`;
    const topic = (a: string) => `0x${a.slice(2).padStart(64, '0')}`;
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
    expect(r.creator?.launch_tokens).toMatchObject({ received: 6_416_006_425.89, sent_pct: 100, first_send_after_sec: 26 });
    expect(r.flags).toContain('creator_sent_launch_tokens');
    expect(r.flags).toContain('new_creator');
    expect(r.verdict.label).toBe('review');
    expect(r.verdict.reason).toMatch(/26 seconds/);
    // Received, not bought: a factory can hand the launch wallet an allocation.
    expect(r.verdict.reason).toMatch(/received 6,416,006,425\.89 tokens in the launch transaction/);
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
        transfers: [mint(listed, 10, LAUNCH_BLOCK, LAUNCH_TX), mint(listed, 10, LAUNCH_BLOCK + 5, '0xm2', 10)],
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
});
