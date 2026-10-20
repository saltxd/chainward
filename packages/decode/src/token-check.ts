// ─── Token check (rug check) ──────────────────────────────────────────────────
//
// Who launched a Base token, how, and what the launch wallet and the supply did
// afterwards, with a verdict, for anyone about to buy it. Reads the token's code
// and ERC-20 fields, its first transfer (or the block its code appeared in), the
// launch transaction, the launch wallet (the fast wallet lookup), mints after the
// first issuance, the launch wallet's balance, and what it did with tokens it got
// in the launch transaction. Never says "safe": no_flags means nothing matched.

import { lookupWallet, type WalletLookup, type WalletLookupDeps } from './wallet-lookup.js';
import { alchemyWalletLookupDeps } from './wallet-lookup.js';
import { alchemyAssetTransfers } from './seller-demand.js';

/** Clanker's current factory; `tokenDeploymentInfo(token)` returns the token for its own launches. */
export const CLANKER_V4_FACTORY = '0xE85A59c628F7d27878ACeB4bf3b35733630083a9';
const TOKEN_DEPLOYMENT_INFO = '0x22adcdb1';
/** ClankerToken's admin(): the wallet the launch was made for, which a launch service sends on its behalf. */
const TOKEN_ADMIN = '0xf851a440';
/** A launch wallet that launched at least this many tokens through Clanker in the 24 hours up to a launch is a serial launcher. */
export const SERIAL_LAUNCHES_24H = 5;
/** Base blocks in 24 hours, at 2 seconds a block. */
const DAY_BLOCKS = 43_200;
/** The launch wallet's transactions to Clanker's factory are read from their first this many records. */
const LAUNCH_COUNT_PAGE = 1000;
/** ERC-4337 EntryPoints v0.6 to v0.9: a launch sent through one came from a smart wallet. */
const ENTRY_POINTS = new Set([
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  '0x0000000071727de22e5e9d8baf0edac6f37da032',
  '0x4337084d9e255ff0702461cf8895ce9e3b5ff108',
  '0x433709009b8330fda32311df1c2afa402ed8d009',
]);
/**
 * Virtuals' Bonding contract. An agent token is created when its prototype graduates, inside
 * whichever purchase crosses the threshold, so that transaction's sender is a buyer. Bonding
 * emits Graduated(prototype indexed, agentToken) and records the prototype's creator in
 * tokenInfo(prototype): (creator, token, pair, agentToken, ...).
 */
const VIRTUALS_BONDING = '0xf66dea7b3e897cd44a5a231c61b6b4423d613259';
const GRADUATED = '0x381d54fa425631e6266af114239150fae1d5db67bb65b4fa9ecc65013107e07e';
const TOKEN_INFO = '0xf5dab711';
/** supportsInterface(ERC-721): NFT collections answer totalSupply() too. */
const SUPPORTS_ERC721 = `0x01ffc9a7${'80ac58cd'.padEnd(64, '0')}`;
const USER_OPERATION_EVENT = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
const SEL = { totalSupply: '0x18160ddd', decimals: '0x313ce567', symbol: '0x95d89b41', name: '0x06fdde03', balanceOf: '0x70a08231' };
const ZERO = `0x${'0'.repeat(40)}`;

/** The launch wallet first seen less than this many days before the launch. */
export const NEW_CREATOR_DAYS = 7;
/** The launch wallet still holding at least this share of the supply. */
export const LARGE_SHARE_PCT = 20;
/** Mints to the launch wallet after launch answer hold from this share of today's supply (cbBTC's one-unit test mint does not). */
export const CREATOR_MINT_HOLD_PCT = 1;
/** Had sent out at least this share of the tokens it received at launch within SENT_WITHIN_SEC of the launch. */
const SENT_LAUNCH_SHARE = 0.9;
const SENT_WITHIN_SEC = 3600;
/** Sends read for the launch tokens: the day after the launch. */
const SENT_WINDOW_SEC = 86_400;
/** Mints and launch-wallet transfers are read from their first PAGE records. */
const PAGE = 100;
const MAX_SEARCH_STEPS = 40;

export type TokenFlag =
  | 'not_a_contract'
  | 'not_a_token'
  | 'launch_unknown'
  | 'creator_sanctioned'
  | 'creator_funded_by_sanctioned'
  | 'creator_minted_after_launch'
  | 'minted_after_launch'
  | 'creator_sent_launch_tokens'
  | 'creator_holds_large_share'
  | 'new_creator'
  | 'creator_shared_funder'
  | 'creator_serial_launcher';

export interface TokenCheck {
  token: string;
  chain: 'base';
  verdict: { label: 'hold' | 'review' | 'no_flags'; reason: string };
  token_info: { name: string | null; symbol: string | null; decimals: number | null; total_supply: number | null };
  launch: {
    block: number;
    time: string | null;
    tx: string | null;
    /** The wallet that sent the launch transaction (the smart wallet, for a launch through an ERC-4337 bundler). */
    creator: string | null;
    /** The contract the launch transaction called (a factory, router or EntryPoint); null for a direct deploy. */
    via: string | null;
    launcher: 'clanker' | 'virtuals' | null;
    launcher_note: string | null;
    /**
     * Clanker launches: the token's admin, the wallet the launch was made for. When it differs from
     * the launch wallet, a service (such as Clanker's X bot) sent the launch for it.
     */
    token_admin: string | null;
  } | null;
  creator: {
    address: string;
    type: WalletLookup['type'];
    sanctioned: boolean;
    first_seen: string | null;
    age_days_at_launch: number | null;
    sent_txs: number;
    first_funder: WalletLookup['first_funder'];
    /** Share of the current supply the launch wallet holds now, in percent. */
    holds_pct: number | null;
    /**
     * Tokens it received in the launch transaction (a dev buy or an allocation), and what it
     * sent on within a day: the share, its first send, and when 90% of it had gone. Null when
     * it got none, or was also minted to in the launch transaction (its sends could be that).
     */
    launch_tokens: { received: number; sent_pct: number; first_send_after_sec: number | null; sent_90pct_after_sec: number | null } | null;
    /**
     * Clanker launches it made for itself: the transactions it sent to Clanker's factory in the 24
     * hours up to and including this launch (a floor at 1,000). Null when not read.
     */
    clanker_launches_24h: number | null;
  } | null;
  supply: {
    /** Mints after the first issuance (the transaction of the first mint). A floor when `capped`. */
    mints_after_launch: number;
    minted_after_launch: number | null;
    /** How many of those mints went to the launch wallet, and how many tokens they made. */
    to_creator: number;
    minted_to_creator: number | null;
    capped: boolean;
  };
  flags: TokenFlag[];
  as_of_block: number;
  limits: string;
}

export interface TokenTransfer {
  from: string;
  to: string | null;
  hash: string;
  blockNum?: string;
  value?: number | null;
  /** The amount in raw units, as hex; Alchemy leaves `value` null for tokens it has no decimals for. */
  rawContract?: { value?: string | null };
  metadata?: { blockTimestamp?: string };
}

/** The wallet lookup's deps, with transfers that also carry block numbers and amounts. */
export interface TokenCheckDeps extends WalletLookupDeps {
  transfers(params: Record<string, unknown>): Promise<{ transfers: TokenTransfer[] }>;
}

const LIMITS =
  'On-chain facts about the launch, the supply and the wallet that sent the launch transaction, which can be a bot, relayer or smart wallet acting for someone else. Tokens the launch wallet received at launch and sent out are not traced further: they may have been sold, moved or locked. Not a honeypot or sell simulation, holder concentration or liquidity-lock check. Mints and launch-wallet transfers are read from their first 100 records; for a Clanker launch, the other launches of the launch wallet are the transactions it sent to the Clanker factory itself in the 24 hours up to this one. no_flags means none of these checks matched; it is not a clearance.';
const CLANKER_NOTE =
  "Launched through Clanker's current factory, which deploys every token from one verified template with no owner mint, pause, blacklist or transfer tax.";
const VIRTUALS_NOTE =
  "A Virtuals agent token: created when its prototype graduated from Virtuals' bonding curve, inside another wallet's purchase. The wallet that launched it is the prototype's creator, as Virtuals' Bonding contract records it.";

const hex = (n: number) => `0x${n.toString(16)}`;
const hexToNumber = (h: unknown) => (typeof h === 'string' && h.startsWith('0x') && h !== '0x' ? Number(BigInt(h)) : 0);
const hasCode = (c: unknown) => typeof c === 'string' && c !== '0x' && c !== '0x0' && c.length > 2;
const lower = (a: string | null | undefined) => (a ? a.toLowerCase() : null);
const pad = (addr: string) => addr.slice(2).toLowerCase().padStart(64, '0');

/** The contract itself refused the call (Alchemy answers "execution reverted"): its answer is no. */
const EXECUTION_ERROR = /revert|invalid opcode|out of gas|stack (?:under|over)flow|EVM error/i;

/** An eth_call the contract may refuse. A throttled or failed read throws: it is not the contract's answer. */
async function safeCall(deps: TokenCheckDeps, to: string, data: string): Promise<string | null> {
  try {
    const r = await deps.rpc('eth_call', [{ to, data }, 'latest']);
    return typeof r === 'string' && r.length > 2 ? r : null;
  } catch (err) {
    if (err instanceof Error && EXECUTION_ERROR.test(err.message)) return null;
    throw err;
  }
}

/** ABI string (dynamic) or bytes32, trimmed and stripped of control characters. */
function decodeString(h: string | null): string | null {
  if (!h) return null;
  try {
    const b = Buffer.from(h.slice(2), 'hex');
    let raw: Buffer;
    if (b.length >= 64 && BigInt(`0x${b.subarray(0, 32).toString('hex')}`) === 32n) {
      const len = Number(BigInt(`0x${b.subarray(32, 64).toString('hex')}`));
      raw = b.subarray(64, 64 + Math.min(len, 256));
    } else if (b.length === 32) {
      raw = b;
    } else {
      return null;
    }
    // eslint-disable-next-line no-control-regex
    const s = raw.toString('utf8').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return s ? s.slice(0, 64) : null;
  } catch {
    return null;
  }
}

/** The launch block and transaction, from the first transfer or, failing that, a search for the block the code appeared in. */
async function findLaunch(token: string, deps: TokenCheckDeps, head: number): Promise<{ block: number; tx: string | null; time: string | null }> {
  const page = await deps.transfers({
    fromBlock: '0x0',
    toBlock: 'latest',
    contractAddresses: [token],
    category: ['erc20'],
    order: 'asc',
    maxCount: '0x1',
    withMetadata: true,
    excludeZeroValue: false,
  });
  const first = page.transfers[0];
  if (first?.blockNum) {
    const b = hexToNumber(first.blockNum);
    const before = b > 0 ? await deps.rpc('eth_getCode', [token, hex(b - 1)]) : '0x';
    if (!hasCode(before)) return { block: b, tx: first.hash.toLowerCase(), time: first.metadata?.blockTimestamp ?? null };
    return searchLaunch(token, deps, b - 1);
  }
  return searchLaunch(token, deps, head);
}

async function searchLaunch(token: string, deps: TokenCheckDeps, hi: number): Promise<{ block: number; tx: string | null; time: string | null }> {
  let lo = 0;
  for (let step = 0; lo < hi && step < MAX_SEARCH_STEPS; step++) {
    const mid = Math.floor((lo + hi) / 2);
    if (hasCode(await deps.rpc('eth_getCode', [token, hex(mid)]))) hi = mid;
    else lo = mid + 1;
  }
  const block = hi;
  const [receipts, header] = await Promise.all([
    deps.rpc('eth_getBlockReceipts', [hex(block)]) as Promise<Array<{ transactionHash: string; contractAddress?: string | null; logs?: Array<{ address: string }> }> | null>,
    deps.rpc('eth_getBlockByNumber', [hex(block), false]) as Promise<{ timestamp?: string } | null>,
  ]);
  const list = receipts ?? [];
  const hit =
    list.find((r) => lower(r.contractAddress) === token) ?? list.find((r) => (r.logs ?? []).some((l) => lower(l.address) === token));
  const time = header?.timestamp ? new Date(hexToNumber(header.timestamp) * 1000).toISOString() : null;
  return { block, tx: hit ? hit.transactionHash.toLowerCase() : null, time };
}

const wordAddr = (w: string | undefined) => (w && w.length >= 40 ? `0x${w.slice(-40).toLowerCase()}` : null);

/**
 * The wallet behind the launch transaction: its sender; the one smart wallet a bundle executed;
 * or, for a Virtuals agent token, the prototype's creator (the sender was a buyer).
 */
async function findCreator(
  deps: TokenCheckDeps,
  txHash: string,
  token: string,
): Promise<{ creator: string | null; via: string | null; launcher: 'virtuals' | null }> {
  const [tx, receipt] = await Promise.all([
    deps.rpc('eth_getTransactionByHash', [txHash]) as Promise<{ from?: string; to?: string | null } | null>,
    deps.rpc('eth_getTransactionReceipt', [txHash]) as Promise<{ logs?: Array<{ address: string; topics?: string[]; data?: string }> } | null>,
  ]);
  if (!tx?.from) return { creator: null, via: null, launcher: null };
  const logs = receipt?.logs ?? [];
  const graduation = logs.find(
    (l) => lower(l.address) === VIRTUALS_BONDING && l.topics?.[0]?.toLowerCase() === GRADUATED && wordAddr(l.data?.slice(2, 66)) === token,
  );
  if (graduation) {
    const prototype = wordAddr(graduation.topics?.[1]);
    const info = prototype ? await safeCall(deps, VIRTUALS_BONDING, `${TOKEN_INFO}${pad(prototype)}`) : null;
    const words = info?.slice(2).match(/.{64}/g) ?? [];
    const recorded = wordAddr(words[1]) === prototype && wordAddr(words[3]) === token ? wordAddr(words[0]) : null;
    // Unconfirmed, the launch wallet is unknown: the sender only bought.
    return { creator: recorded && recorded !== ZERO ? recorded : null, via: VIRTUALS_BONDING, launcher: 'virtuals' };
  }
  const via = lower(tx.to ?? null);
  if (via && ENTRY_POINTS.has(via)) {
    const senders = new Set(
      logs
        .filter((l) => lower(l.address) === via && l.topics?.[0]?.toLowerCase() === USER_OPERATION_EVENT && l.topics[2])
        .map((l) => wordAddr(l.topics![2])!),
    );
    return { creator: senders.size === 1 ? [...senders][0]! : null, via, launcher: null };
  }
  return { creator: tx.from.toLowerCase(), via, launcher: null };
}

/** Raw units to token units, splitting whole and fraction in BigInt so large supplies stay exact. */
function scaleUnits(raw: bigint, decimals: number): number {
  const unit = 10n ** BigInt(decimals);
  return Number(raw / unit) + Number(raw % unit) / Number(unit);
}

const rawOf = (t: TokenTransfer): bigint | null => {
  const v = t.rawContract?.value;
  return typeof v === 'string' && /^0x[0-9a-f]+$/i.test(v) ? BigInt(v) : null;
};
/** Raw units summed exactly, or null when a transfer lacks them. */
const rawSum = (ts: TokenTransfer[]): bigint | null => {
  let total = 0n;
  for (const t of ts) {
    const r = rawOf(t);
    if (r === null) return null;
    total += r;
  }
  return total;
};
/** Token units: exact from raw units when the decimals are known, else Alchemy's floats kept to the 15 digits a float holds. */
function sumAmounts(ts: TokenTransfer[], decimals: number | null): number {
  const raw = decimals !== null ? rawSum(ts) : null;
  if (raw !== null) return scaleUnits(raw, decimals!);
  return Number(ts.reduce((s, t) => s + (typeof t.value === 'number' ? t.value : 0), 0).toPrecision(15));
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Two decimals, and tiny amounts to four significant digits, so a real mint never reads "0". */
const amount = (n: number) =>
  n > 0 && n < 0.01 ? n.toLocaleString('en-US', { maximumSignificantDigits: 4 }) : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const duration = (sec: number) => (sec < 120 ? plural(sec, 'second') : sec < 7200 ? plural(Math.round(sec / 60), 'minute') : plural(Math.round(sec / 3600), 'hour'));

export async function checkToken(rawToken: string, deps: TokenCheckDeps): Promise<TokenCheck> {
  const token = rawToken.toLowerCase();
  const [code, supplyHex, decimalsHex, symbolHex, nameHex, headHex] = await Promise.all([
    deps.rpc('eth_getCode', [token, 'latest']),
    safeCall(deps, token, SEL.totalSupply),
    safeCall(deps, token, SEL.decimals),
    safeCall(deps, token, SEL.symbol),
    safeCall(deps, token, SEL.name),
    deps.rpc('eth_blockNumber', []),
  ]);
  const head = hexToNumber(headHex);
  const decimalsRead = decimalsHex ? Number(BigInt(decimalsHex)) : null;
  const decimals = decimalsRead !== null && decimalsRead <= 77 ? decimalsRead : null;
  const supplyRaw = supplyHex ? BigInt(supplyHex) : null;
  const token_info = {
    name: decodeString(nameHex),
    symbol: decodeString(symbolHex),
    decimals,
    total_supply: supplyRaw !== null && decimals !== null ? scaleUnits(supplyRaw, decimals) : null,
  };
  const empty = { mints_after_launch: 0, minted_after_launch: null, to_creator: 0, minted_to_creator: null, capped: false };
  const stop = (flag: 'not_a_contract' | 'not_a_token', reason: string = REASONS[flag]()): TokenCheck => ({
    token,
    chain: 'base',
    verdict: { label: 'review', reason },
    token_info,
    launch: null,
    creator: null,
    supply: empty,
    flags: [flag],
    as_of_block: head,
    limits: LIMITS,
  });
  if (!hasCode(code)) return stop('not_a_contract');
  if (supplyRaw === null) return stop('not_a_token');
  // An ERC-721 collection answers totalSupply() but has no decimals().
  if (decimalsRead === null && BigInt((await safeCall(deps, token, SUPPORTS_ERC721)) ?? '0x0') === 1n) return stop('not_a_token', NFT_REASON);

  const launch0 = await findLaunch(token, deps, head);
  const [who, clankerHex] = await Promise.all([
    launch0.tx ? findCreator(deps, launch0.tx, token) : Promise.resolve({ creator: null, via: null, launcher: null }),
    safeCall(deps, CLANKER_V4_FACTORY.toLowerCase(), `${TOKEN_DEPLOYMENT_INFO}${pad(token)}`),
  ]);
  const launcher = clankerRegistryMatches(clankerHex, token) ? 'clanker' : who.launcher;
  const launch: NonNullable<TokenCheck['launch']> = {
    block: launch0.block,
    time: launch0.time,
    tx: launch0.tx,
    creator: who.creator,
    via: who.via,
    launcher,
    launcher_note: launcher === 'clanker' ? CLANKER_NOTE : launcher === 'virtuals' ? VIRTUALS_NOTE : null,
    token_admin: null,
  };
  const creatorAddr = who.creator;
  // Nothing precedes the launch, and reading from genesis made Alchemy fail on busy tokens.
  const transferBase = { fromBlock: hex(launch.block), toBlock: 'latest', contractAddresses: [token], category: ['erc20'], order: 'asc', excludeZeroValue: false };
  const mintsFrom = (block: number) => deps.transfers({ ...transferBase, fromBlock: hex(block), fromAddress: ZERO, maxCount: hex(PAGE), withMetadata: false });

  const clanker = launcher === 'clanker';
  const [wallet, mintsPage, balanceHex, inflows, outflows, adminHex, factoryTxs] = await Promise.all([
    creatorAddr ? lookupWallet(creatorAddr, 'base', deps) : Promise.resolve(null),
    mintsFrom(launch.block),
    creatorAddr ? safeCall(deps, token, `${SEL.balanceOf}${pad(creatorAddr)}`) : Promise.resolve(null),
    creatorAddr && launch.tx ? deps.transfers({ ...transferBase, toAddress: creatorAddr, maxCount: hex(PAGE), withMetadata: true }) : Promise.resolve(null),
    creatorAddr && launch.tx ? deps.transfers({ ...transferBase, fromAddress: creatorAddr, maxCount: hex(PAGE), withMetadata: true }) : Promise.resolve(null),
    clanker ? safeCall(deps, token, TOKEN_ADMIN) : Promise.resolve(null),
    // Its launches through Clanker's factory in the day up to this one (each launch is one transaction to it).
    clanker && creatorAddr
      ? deps.transfers({
          fromAddress: creatorAddr,
          toAddress: CLANKER_V4_FACTORY.toLowerCase(),
          category: ['external'],
          excludeZeroValue: false,
          fromBlock: hex(Math.max(0, launch.block - DAY_BLOCKS)),
          toBlock: hex(launch.block),
          maxCount: hex(LAUNCH_COUNT_PAGE),
          withMetadata: false,
        })
      : Promise.resolve(null),
  ]);
  const admin = clanker ? wordAddr(adminHex ?? undefined) : null;
  launch.token_admin = admin && admin !== ZERO ? admin : null;
  // A service sent the launch for the token's admin: its own launch count describes the service, not this launch.
  const forAnother = launch.token_admin !== null && launch.token_admin !== creatorAddr;
  if (forAnother) {
    launch.launcher_note = `${CLANKER_NOTE} A service sent the launch for another wallet: the token's admin is ${launch.token_admin}. The launch-wallet facts below describe the wallet that sent the launch.`;
  }
  const launchCount = factoryTxs && !forAnother ? new Set(factoryTxs.transfers.map((t) => t.hash.toLowerCase())).size : null;

  // Supply: every mint after the transaction of the first mint (the first issuance).
  const mints = mintsPage.transfers;
  const firstIssuance = mints[0]?.hash.toLowerCase();
  let later = mints.filter((m) => m.hash.toLowerCase() !== firstIssuance);
  let capped = mints.length >= PAGE;
  if (capped && later.length === 0 && mints[0]?.blockNum) {
    // The whole page is the first issuance (an airdrop-style launch): read on from the next block.
    const next = (await mintsFrom(hexToNumber(mints[0].blockNum) + 1)).transfers;
    later = next.filter((m) => m.hash.toLowerCase() !== firstIssuance);
    capped = next.length >= PAGE;
  }
  const laterToCreator = creatorAddr ? later.filter((m) => lower(m.to) === creatorAddr) : [];
  const supply: TokenCheck['supply'] = {
    mints_after_launch: later.length,
    minted_after_launch: later.length ? sumAmounts(later, decimals) : null,
    to_creator: laterToCreator.length,
    minted_to_creator: laterToCreator.length ? sumAmounts(laterToCreator, decimals) : null,
    capped,
  };
  const creatorMintPct = mintSharePct(laterToCreator, supplyRaw, supply.minted_to_creator, token_info.total_supply);

  let creator: TokenCheck['creator'] = null;
  let sentPctAt90: number | null = null;
  if (creatorAddr && wallet) {
    const launchMs = launch.time ? new Date(launch.time).getTime() : null;
    const firstSeenMs = wallet.first_seen ? new Date(wallet.first_seen).getTime() : null;
    // First seen after the launch: its funding came by a path the transfers do not show, so its age is unknown.
    const age = launchMs !== null && firstSeenMs !== null && firstSeenMs <= launchMs ? Math.floor((launchMs - firstSeenMs) / 86_400_000) : null;
    const balance = balanceHex ? BigInt(balanceHex) : null;
    const holds_pct = balance !== null && supplyRaw > 0n ? Number((balance * 10_000n) / supplyRaw) / 100 : null;
    const lt = launchTokens(launch, launchMs, inflows?.transfers ?? [], outflows?.transfers ?? [], decimals);
    sentPctAt90 = lt?.pctAt90 ?? null;
    creator = {
      address: creatorAddr,
      type: wallet.type,
      sanctioned: wallet.sanctioned,
      first_seen: wallet.first_seen,
      age_days_at_launch: age,
      sent_txs: wallet.sent_txs,
      first_funder: wallet.first_funder,
      holds_pct,
      launch_tokens: lt?.result ?? null,
      clanker_launches_24h: launchCount,
    };
  }

  const flags: TokenFlag[] = [];
  if (!launch.tx || !creatorAddr) flags.push('launch_unknown');
  if (creator?.sanctioned) flags.push('creator_sanctioned');
  if (wallet?.flags.includes('funded_by_sanctioned')) flags.push('creator_funded_by_sanctioned');
  if (creatorMintPct !== null && creatorMintPct >= CREATOR_MINT_HOLD_PCT) flags.push('creator_minted_after_launch');
  else if (supply.mints_after_launch > 0) flags.push('minted_after_launch');
  const lb = creator?.launch_tokens;
  if (lb && lb.sent_90pct_after_sec !== null && lb.sent_90pct_after_sec <= SENT_WITHIN_SEC) flags.push('creator_sent_launch_tokens');
  if (creator?.holds_pct !== null && creator?.holds_pct !== undefined && creator.holds_pct >= LARGE_SHARE_PCT) flags.push('creator_holds_large_share');
  if (creator?.clanker_launches_24h !== null && creator?.clanker_launches_24h !== undefined && creator.clanker_launches_24h >= SERIAL_LAUNCHES_24H) {
    flags.push('creator_serial_launcher');
  }
  if (creator?.age_days_at_launch !== null && creator?.age_days_at_launch !== undefined && creator.age_days_at_launch < NEW_CREATOR_DAYS) {
    flags.push('new_creator');
  }
  if (wallet?.flags.includes('shared_funder')) flags.push('creator_shared_funder');

  return {
    token,
    chain: 'base',
    verdict: verdictFor(flags, { supply, creator, creatorMintPct, sentPctAt90 }),
    token_info,
    launch,
    creator,
    supply,
    flags,
    as_of_block: head,
    limits: LIMITS,
  };
}

/** The registry answers a tuple (offset, token, hook, ...) for its own launches, zeros otherwise. */
function clankerRegistryMatches(result: string | null, token: string): boolean {
  if (!result) return false;
  const words = result.slice(2).match(/.{64}/g) ?? [];
  const asAddr = (w: string | undefined) => (w ? `0x${w.slice(24)}` : null);
  return asAddr(words[0]) === token || (words[0] !== undefined && BigInt(`0x${words[0]}`) === 32n && asAddr(words[1]) === token);
}

/** The share of today's supply the mints made, in percent: from raw units, else from token amounts. */
function mintSharePct(ts: TokenTransfer[], supplyRaw: bigint, amountMinted: number | null, totalSupply: number | null): number | null {
  if (!ts.length) return null;
  const raw = rawSum(ts);
  if (raw !== null) return supplyRaw > 0n ? Number((raw * 10_000n) / supplyRaw) / 100 : 100;
  if (amountMinted !== null && totalSupply) return Math.round((amountMinted / totalSupply) * 10_000) / 100;
  return 100;
}

/**
 * What the launch wallet did with tokens it received in the launch transaction from other
 * wallets (not minted to it): how much it sent on within a day, its first send, and when 90%
 * had gone. A wallet also minted to in that transaction is not judged: its sends could be that.
 */
function launchTokens(
  launch: NonNullable<TokenCheck['launch']>,
  launchMs: number | null,
  inflows: TokenTransfer[],
  outflows: TokenTransfer[],
  decimals: number | null,
): { result: NonNullable<NonNullable<TokenCheck['creator']>['launch_tokens']>; pctAt90: number | null } | null {
  const inLaunch = inflows.filter((t) => t.hash.toLowerCase() === launch.tx);
  if (launchMs === null || inLaunch.some((t) => t.from.toLowerCase() === ZERO)) return null;
  const received = sumAmounts(inLaunch, decimals);
  if (received <= 0) return null;
  const sends = outflows
    .map((t) => ({ value: sumAmounts([t], decimals), ms: t.metadata?.blockTimestamp ? new Date(t.metadata.blockTimestamp).getTime() : null }))
    .filter((t): t is { value: number; ms: number } => t.ms !== null && t.ms >= launchMs && t.ms - launchMs <= SENT_WINDOW_SEC * 1000)
    .sort((a, b) => a.ms - b.ms);
  let sent = 0;
  let at90: { ms: number; pct: number } | null = null;
  for (const t of sends) {
    sent += t.value;
    if (!at90 && sent >= received * SENT_LAUNCH_SHARE) at90 = { ms: t.ms, pct: Math.min(100, Math.round((sent / received) * 100)) };
  }
  const sec = (ms: number) => Math.round((ms - launchMs) / 1000);
  return {
    result: {
      received,
      sent_pct: Math.min(100, Math.round((sent / received) * 100)),
      first_send_after_sec: sends.length ? sec(sends[0]!.ms) : null,
      sent_90pct_after_sec: at90 ? sec(at90.ms) : null,
    },
    pctAt90: at90?.pct ?? null,
  };
}

const NFT_REASON = 'This contract is an ERC-721 collection (NFTs), not an ERC-20 token.';
const REASONS = {
  not_a_contract: () => 'There is no contract at this address on Base, so it is not a token.',
  not_a_token: () => 'This contract does not answer totalSupply(), so it is not an ERC-20 token.',
};

function verdictFor(
  flags: TokenFlag[],
  ctx: { supply: TokenCheck['supply']; creator: TokenCheck['creator']; creatorMintPct: number | null; sentPctAt90: number | null },
): TokenCheck['verdict'] {
  const { supply, creator } = ctx;
  const atLeast = supply.capped ? 'at least ' : '';
  if (flags.includes('creator_sanctioned')) return { label: 'hold', reason: 'The wallet that launched it is on the US Treasury OFAC SDN list.' };
  if (flags.includes('creator_funded_by_sanctioned')) {
    return { label: 'hold', reason: 'The wallet that launched it got its first funds from an address on the OFAC SDN list.' };
  }
  if (flags.includes('creator_minted_after_launch') && supply.minted_to_creator !== null && ctx.creatorMintPct !== null) {
    return {
      label: 'hold',
      reason: `After the first issuance, ${atLeast}${amount(supply.minted_to_creator)} more tokens were minted to the wallet that launched it in ${atLeast}${plural(supply.to_creator, 'mint')}, ${amount(ctx.creatorMintPct)}% of the supply today.`,
    };
  }
  if (flags.includes('minted_after_launch') && supply.minted_after_launch !== null) {
    const count = `${atLeast}${plural(supply.mints_after_launch, 'mint')}`;
    return {
      label: 'review',
      reason: `${count.charAt(0).toUpperCase()}${count.slice(1)} after the first issuance created ${atLeast}${amount(supply.minted_after_launch)} more tokens.`,
    };
  }
  const lb = creator?.launch_tokens;
  if (flags.includes('creator_sent_launch_tokens') && lb && lb.sent_90pct_after_sec !== null && ctx.sentPctAt90 !== null) {
    return {
      label: 'review',
      reason: `The wallet that launched it received ${amount(lb.received)} tokens in the launch transaction and had sent out ${ctx.sentPctAt90}% of them ${duration(lb.sent_90pct_after_sec)} later.`,
    };
  }
  if (flags.includes('creator_holds_large_share') && creator?.holds_pct !== null && creator?.holds_pct !== undefined) {
    return { label: 'review', reason: `The wallet that launched it still holds ${creator.holds_pct}% of the supply.` };
  }
  if (flags.includes('creator_serial_launcher') && creator?.clanker_launches_24h) {
    const n = creator.clanker_launches_24h;
    return {
      label: 'review',
      reason: `The wallet that launched it launched ${n >= LAUNCH_COUNT_PAGE ? 'at least ' : ''}${n.toLocaleString('en-US')} tokens through Clanker in the 24 hours up to and including this one.`,
    };
  }
  if (flags.includes('new_creator') && creator?.age_days_at_launch !== null && creator?.age_days_at_launch !== undefined) {
    const d = creator.age_days_at_launch;
    return { label: 'review', reason: `The wallet that launched it was first seen ${d === 0 ? 'less than a day' : plural(d, 'day')} before the launch.` };
  }
  if (flags.includes('creator_shared_funder')) {
    const n = creator?.first_funder?.funded_wallets ?? 0;
    return { label: 'review', reason: `The wallet that launched it was first funded by a wallet that funded at least ${n} wallets and is not an exchange.` };
  }
  if (flags.includes('launch_unknown')) {
    return { label: 'review', reason: 'The launch transaction could not be traced to one wallet, so the launch wallet was not checked.' };
  }
  return {
    label: 'no_flags',
    reason: "None of the checks matched: sanctions, mints after the first issuance, and the launch wallet's age, funder, holdings and send-outs after launch.",
  };
}

/** Deps that read Base through an Alchemy URL. */
export function alchemyTokenCheckDeps(rpcUrl: string): TokenCheckDeps {
  return {
    ...alchemyWalletLookupDeps(rpcUrl),
    transfers: (params) => alchemyAssetTransfers(rpcUrl, params) as Promise<{ transfers: TokenTransfer[] }>,
  };
}
