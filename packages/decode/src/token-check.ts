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
/** ERC-4337 EntryPoints v0.6, v0.7 and v0.8: a launch sent through one came from a smart wallet. */
const ENTRY_POINTS = new Set([
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  '0x0000000071727de22e5e9d8baf0edac6f37da032',
  '0x4337084d9e255ff0702461cf8895ce9e3b5ff108',
]);
const USER_OPERATION_EVENT = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
const SEL = { totalSupply: '0x18160ddd', decimals: '0x313ce567', symbol: '0x95d89b41', name: '0x06fdde03', balanceOf: '0x70a08231' };
const ZERO = `0x${'0'.repeat(40)}`;

/** The launch wallet first seen less than this many days before the launch. */
export const NEW_CREATOR_DAYS = 7;
/** The launch wallet still holding at least this share of the supply. */
export const LARGE_SHARE_PCT = 20;
/** Sent out at least this share of the tokens it received at launch, the first part within SENT_WITHIN_SEC. */
const SENT_LAUNCH_BUY_PCT = 90;
const SENT_WITHIN_SEC = 3600;
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
  | 'creator_shared_funder';

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
    launcher: 'clanker' | null;
    launcher_note: string | null;
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
    /** Tokens it received in the launch transaction (a dev buy or an allocation), and how much of that it sent on within a day. */
    launch_tokens: { received: number; sent_pct: number; first_send_after_sec: number | null } | null;
  } | null;
  supply: {
    /** Mints after the first issuance (the transaction of the first mint). A floor when `capped`. */
    mints_after_launch: number;
    minted_after_launch: number | null;
    to_creator: number;
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
  metadata?: { blockTimestamp?: string };
}

/** The wallet lookup's deps, with transfers that also carry block numbers and amounts. */
export interface TokenCheckDeps extends WalletLookupDeps {
  transfers(params: Record<string, unknown>): Promise<{ transfers: TokenTransfer[] }>;
}

const LIMITS =
  'On-chain facts about the launch, the supply and the wallet that sent the launch transaction, which can be a bot, relayer or smart wallet acting for someone else. Tokens the launch wallet received at launch and sent out are not traced further: they may have been sold, moved or locked. Not a honeypot or sell simulation, holder concentration or liquidity-lock check. Mints and launch-wallet transfers are read from their first 100 records. no_flags means none of these checks matched; it is not a clearance.';
const CLANKER_NOTE =
  "Launched through Clanker's current factory, which deploys every token from one verified template with no owner mint, pause, blacklist or transfer tax.";

const hex = (n: number) => `0x${n.toString(16)}`;
const hexToNumber = (h: unknown) => (typeof h === 'string' && h.startsWith('0x') && h !== '0x' ? Number(BigInt(h)) : 0);
const hasCode = (c: unknown) => typeof c === 'string' && c !== '0x' && c !== '0x0' && c.length > 2;
const lower = (a: string | null | undefined) => (a ? a.toLowerCase() : null);
const pad = (addr: string) => addr.slice(2).toLowerCase().padStart(64, '0');

async function safeCall(deps: TokenCheckDeps, to: string, data: string): Promise<string | null> {
  try {
    const r = await deps.rpc('eth_call', [{ to, data }, 'latest']);
    return typeof r === 'string' && r.length > 2 ? r : null;
  } catch {
    return null;
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

/** The wallet behind the launch transaction: its sender, or the one smart wallet a bundle executed. */
async function findCreator(deps: TokenCheckDeps, txHash: string): Promise<{ creator: string | null; via: string | null }> {
  const tx = (await deps.rpc('eth_getTransactionByHash', [txHash])) as { from?: string; to?: string | null } | null;
  if (!tx?.from) return { creator: null, via: null };
  const via = lower(tx.to ?? null);
  if (via && ENTRY_POINTS.has(via)) {
    const receipt = (await deps.rpc('eth_getTransactionReceipt', [txHash])) as { logs?: Array<{ address: string; topics?: string[] }> } | null;
    const senders = new Set(
      (receipt?.logs ?? [])
        .filter((l) => lower(l.address) === via && l.topics?.[0]?.toLowerCase() === USER_OPERATION_EVENT && l.topics[2])
        .map((l) => `0x${l.topics![2]!.slice(26).toLowerCase()}`),
    );
    return { creator: senders.size === 1 ? [...senders][0]! : null, via };
  }
  return { creator: tx.from.toLowerCase(), via };
}

/** Raw units to token units, splitting whole and fraction in BigInt so large supplies stay exact. */
function scaleUnits(raw: bigint, decimals: number): number {
  const unit = 10n ** BigInt(decimals);
  return Number(raw / unit) + Number(raw % unit) / Number(unit);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const amount = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
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
  const decimals = decimalsHex ? Number(BigInt(decimalsHex)) : null;
  const supplyRaw = supplyHex ? BigInt(supplyHex) : null;
  const token_info = {
    name: decodeString(nameHex),
    symbol: decodeString(symbolHex),
    decimals: decimals !== null && decimals <= 77 ? decimals : null,
    total_supply: supplyRaw !== null && decimals !== null && decimals <= 77 ? scaleUnits(supplyRaw, decimals) : null,
  };
  const empty = { mints_after_launch: 0, minted_after_launch: null, to_creator: 0, capped: false };
  const stop = (flag: 'not_a_contract' | 'not_a_token'): TokenCheck => ({
    token,
    chain: 'base',
    verdict: { label: 'review', reason: REASONS[flag]() },
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

  const launch0 = await findLaunch(token, deps, head);
  const [who, clankerHex] = await Promise.all([
    launch0.tx ? findCreator(deps, launch0.tx) : Promise.resolve({ creator: null, via: null }),
    safeCall(deps, CLANKER_V4_FACTORY.toLowerCase(), `${TOKEN_DEPLOYMENT_INFO}${pad(token)}`),
  ]);
  const isClanker = clankerRegistryMatches(clankerHex, token);
  const launch: NonNullable<TokenCheck['launch']> = {
    block: launch0.block,
    time: launch0.time,
    tx: launch0.tx,
    creator: who.creator,
    via: who.via,
    launcher: isClanker ? 'clanker' : null,
    launcher_note: isClanker ? CLANKER_NOTE : null,
  };
  const creatorAddr = who.creator;
  const transferBase = { fromBlock: '0x0', toBlock: 'latest', contractAddresses: [token], category: ['erc20'], order: 'asc', excludeZeroValue: false };

  const [wallet, mintsPage, balanceHex, inflows, outflows] = await Promise.all([
    creatorAddr ? lookupWallet(creatorAddr, 'base', deps) : Promise.resolve(null),
    deps.transfers({ ...transferBase, fromAddress: ZERO, maxCount: hex(PAGE), withMetadata: false }),
    creatorAddr ? safeCall(deps, token, `${SEL.balanceOf}${pad(creatorAddr)}`) : Promise.resolve(null),
    creatorAddr && launch.tx ? deps.transfers({ ...transferBase, toAddress: creatorAddr, maxCount: hex(PAGE), withMetadata: true }) : Promise.resolve(null),
    creatorAddr && launch.tx ? deps.transfers({ ...transferBase, fromAddress: creatorAddr, maxCount: hex(PAGE), withMetadata: true }) : Promise.resolve(null),
  ]);

  // Supply: every mint after the transaction of the first mint (the first issuance).
  const mints = mintsPage.transfers;
  const firstIssuance = mints[0]?.hash.toLowerCase();
  const later = mints.filter((m) => m.hash.toLowerCase() !== firstIssuance);
  const supply: TokenCheck['supply'] = {
    mints_after_launch: later.length,
    minted_after_launch: later.length ? later.reduce((s, m) => s + (typeof m.value === 'number' ? m.value : 0), 0) : null,
    to_creator: creatorAddr ? later.filter((m) => lower(m.to) === creatorAddr).length : 0,
    capped: mints.length >= PAGE,
  };

  let creator: TokenCheck['creator'] = null;
  if (creatorAddr && wallet) {
    const launchMs = launch.time ? new Date(launch.time).getTime() : null;
    const firstSeenMs = wallet.first_seen ? new Date(wallet.first_seen).getTime() : null;
    const age = launchMs !== null && firstSeenMs !== null ? Math.max(0, Math.floor((launchMs - firstSeenMs) / 86_400_000)) : null;
    const balance = balanceHex ? BigInt(balanceHex) : null;
    const holds_pct = balance !== null && supplyRaw > 0n ? Number((balance * 10_000n) / supplyRaw) / 100 : null;
    creator = {
      address: creatorAddr,
      type: wallet.type,
      sanctioned: wallet.sanctioned,
      first_seen: wallet.first_seen,
      age_days_at_launch: age,
      sent_txs: wallet.sent_txs,
      first_funder: wallet.first_funder,
      holds_pct,
      launch_tokens: launchTokens(launch, launchMs, inflows?.transfers ?? [], outflows?.transfers ?? []),
    };
  }

  const flags: TokenFlag[] = [];
  if (!launch.tx || !creatorAddr) flags.push('launch_unknown');
  if (creator?.sanctioned) flags.push('creator_sanctioned');
  if (wallet?.flags.includes('funded_by_sanctioned')) flags.push('creator_funded_by_sanctioned');
  if (supply.to_creator > 0) flags.push('creator_minted_after_launch');
  else if (supply.mints_after_launch > 0) flags.push('minted_after_launch');
  const lb = creator?.launch_tokens;
  if (lb && lb.sent_pct >= SENT_LAUNCH_BUY_PCT && lb.first_send_after_sec !== null && lb.first_send_after_sec <= SENT_WITHIN_SEC) {
    flags.push('creator_sent_launch_tokens');
  }
  if (creator?.holds_pct !== null && creator?.holds_pct !== undefined && creator.holds_pct >= LARGE_SHARE_PCT) flags.push('creator_holds_large_share');
  if (creator?.age_days_at_launch !== null && creator?.age_days_at_launch !== undefined && creator.age_days_at_launch < NEW_CREATOR_DAYS) {
    flags.push('new_creator');
  }
  if (wallet?.flags.includes('shared_funder')) flags.push('creator_shared_funder');

  return {
    token,
    chain: 'base',
    verdict: verdictFor(flags, { supply, creator }),
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

/** What the launch wallet did with tokens it received in the launch transaction (not minted to it). */
function launchTokens(
  launch: NonNullable<TokenCheck['launch']>,
  launchMs: number | null,
  inflows: TokenTransfer[],
  outflows: TokenTransfer[],
): NonNullable<TokenCheck['creator']>['launch_tokens'] {
  const received = inflows
    .filter((t) => t.hash.toLowerCase() === launch.tx && t.from.toLowerCase() !== ZERO)
    .reduce((s, t) => s + (typeof t.value === 'number' ? t.value : 0), 0);
  if (received <= 0) return null;
  const sends = outflows
    .map((t) => ({ value: typeof t.value === 'number' ? t.value : 0, ms: t.metadata?.blockTimestamp ? new Date(t.metadata.blockTimestamp).getTime() : null }))
    .filter((t) => t.ms !== null && launchMs !== null && t.ms >= launchMs && t.ms - launchMs <= SENT_WINDOW_SEC * 1000);
  const sent = sends.reduce((s, t) => s + t.value, 0);
  const firstMs = sends.length ? Math.min(...sends.map((t) => t.ms!)) : null;
  return {
    received,
    sent_pct: Math.min(100, Math.round((sent / received) * 100)),
    first_send_after_sec: firstMs !== null && launchMs !== null ? Math.round((firstMs - launchMs) / 1000) : null,
  };
}

const REASONS = {
  not_a_contract: () => 'There is no contract at this address on Base, so it is not a token.',
  not_a_token: () => 'This contract does not answer totalSupply(), so it is not an ERC-20 token.',
};

function verdictFor(flags: TokenFlag[], ctx: { supply: TokenCheck['supply']; creator: TokenCheck['creator'] }): TokenCheck['verdict'] {
  const { supply, creator } = ctx;
  const atLeast = supply.capped ? 'at least ' : '';
  if (flags.includes('creator_sanctioned')) return { label: 'hold', reason: 'The wallet that launched it is on the US Treasury OFAC SDN list.' };
  if (flags.includes('creator_funded_by_sanctioned')) {
    return { label: 'hold', reason: 'The wallet that launched it got its first funds from an address on the OFAC SDN list.' };
  }
  if (flags.includes('creator_minted_after_launch')) {
    const added = supply.minted_after_launch !== null ? ` added ${amount(supply.minted_after_launch)} tokens, and` : ' followed, and';
    return {
      label: 'hold',
      reason: `After the first issuance, ${atLeast}${plural(supply.mints_after_launch, 'more mint')}${added} ${supply.to_creator} of them minted to the wallet that launched it.`,
    };
  }
  if (flags.includes('minted_after_launch')) {
    return { label: 'review', reason: `Tokens were minted ${atLeast}${plural(supply.mints_after_launch, 'time')} after the first issuance, so the supply can grow.` };
  }
  const lb = creator?.launch_tokens;
  if (flags.includes('creator_sent_launch_tokens') && lb && lb.first_send_after_sec !== null) {
    return {
      label: 'review',
      reason: `The wallet that launched it received ${amount(lb.received)} tokens in the launch transaction and sent out ${lb.sent_pct}% of them ${duration(lb.first_send_after_sec)} later.`,
    };
  }
  if (flags.includes('creator_holds_large_share') && creator?.holds_pct !== null && creator?.holds_pct !== undefined) {
    return { label: 'review', reason: `The wallet that launched it still holds ${creator.holds_pct}% of the supply.` };
  }
  if (flags.includes('new_creator') && creator?.age_days_at_launch !== null && creator?.age_days_at_launch !== undefined) {
    const d = creator.age_days_at_launch;
    return { label: 'review', reason: `The wallet that launched it was first seen ${d === 0 ? 'the same day as the launch' : `${plural(d, 'day')} before the launch`}.` };
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
    reason: "None of the checks matched: sanctions, supply after the first issuance, and the launch wallet's age, funder, holdings and launch-buy sales.",
  };
}

/** Deps that read Base through an Alchemy URL. */
export function alchemyTokenCheckDeps(rpcUrl: string): TokenCheckDeps {
  return {
    ...alchemyWalletLookupDeps(rpcUrl),
    transfers: (params) => alchemyAssetTransfers(rpcUrl, params) as Promise<{ transfers: TokenTransfer[] }>,
  };
}
