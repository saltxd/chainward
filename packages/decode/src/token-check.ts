// ─── Token check (rug check) ──────────────────────────────────────────────────
//
// Who launched a Base token, how, and what the launch wallet and the supply did
// afterwards, with a verdict, for anyone about to buy it. Reads the token's code
// and ERC-20 fields, its first transfer (or the block its code appeared in), the
// launch transaction, the launch wallet (the fast wallet lookup, and its nonce and
// code a week before the launch), mints after the first issuance, the launch
// wallet's balance, and what it did with tokens it got in the launch transaction
// (its transfers, and its balance at the launch, an hour later and now), and its
// own launches around this one. When the launch receipt names the wallet a launch
// service launched it for (Clanker's token admin, Zora's payout recipient, the one
// wallet a Doppler token vests to), the wallet facts describe that wallet. For a
// token outside the launchpads that lock its liquidity, the liquidity the launch
// wallet added to and removed from its Uniswap v2 and Aerodrome pools; for a
// Doppler launch, the supply still vesting to the launch wallet; for a Clanker
// launch, the supply in Clanker's vault and airdrop. No eth_getLogs: Alchemy's free
// tier refuses ranges over 10 blocks. Never says "safe": no_flags means nothing matched.

import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem';
import { freshWallets, lookupWallet, type WalletLookup, type WalletLookupDeps } from './wallet-lookup.js';
import { imitatedToken, type Imitation } from './lookalike.js';
import { alchemyWalletLookupDeps } from './wallet-lookup.js';
import { alchemyAssetTransfers } from './seller-demand.js';

/** Clanker's current factory; `tokenDeploymentInfo(token)` returns the token for its own launches. */
export const CLANKER_V4_FACTORY = '0xE85A59c628F7d27878ACeB4bf3b35733630083a9';
const TOKEN_DEPLOYMENT_INFO = '0x22adcdb1';
/**
 * ClankerToken's originalAdmin(): the admin set at launch, the wallet the launch was made for (a launch
 * service sends it on that wallet's behalf). Later updateAdmin calls change admin() but not this.
 */
const ORIGINAL_ADMIN = '0x1c7b2ff4';
/**
 * Clanker's factory logs TokenCreated(msgSender, tokenAddress indexed, tokenAdmin indexed, ...) for each launch: the admin
 * is the wallet the launch was made for, which a launch service names when it launches for someone.
 */
const TOKEN_CREATED = '0x9299d1d1a88d8e1abdc591ae7a167a6bc63a8f17d695804e9091ee33aa89fb67';
/** Doppler's clone token logs, per vesting beneficiary, (beneficiary indexed, scheduleId indexed, amount) at launch. */
const DOPPLER_VESTING_ALLOCATED = '0x6b467f0a76daac5283d2251b6e7660fed01ea99dbd70aa7092f3318731690c9d';
/** A wallet with at least this many launches in 24 hours that include this one is a serial launcher. */
export const SERIAL_LAUNCHES_24H = 5;
const DAY_SEC = 86_400;
/** Blocks searched back for a day of launches: a day at 5 blocks a second (Base's Denim upgrade); the day itself is cut by block time. */
const DAY_BLOCKS_MAX = 432_000;
/** The launch wallet's own transactions around the launch are read from their newest this many records. */
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
/**
 * Virtuals' Bonding V5: puts a new agent token on Virtuals' bonding curve in a transaction from its
 * creator (or the creator's smart wallet), and logs the launch with the token as the first topic.
 */
const VIRTUALS_BONDING_V5 = '0x1a540088125d00dd3990f9da45ca0859af4d3b01';
/**
 * Doppler's Airlock logs Create(asset, numeraire, initializer, poolOrHook) for each launch, and Zora's factory logs
 * each coin it creates: a log from either naming the token, in the launch transaction, names the launchpad.
 */
const DOPPLER_AIRLOCK = '0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12';
const ZORA_FACTORY = '0x777777751622c0d3258f214f9df38e35bf45baf3';
type Launchpad = 'clanker' | 'doppler' | 'zora' | 'virtuals';
/**
 * Where a wallet's own launch transactions go: each transaction to one of these creates a token (Doppler's Airlock also
 * takes the call that moves a finished sale to its pool). Virtuals' bonding curve is not here: purchases and sales on it
 * go to the same contract as launches.
 */
const LAUNCH_CONTRACTS: Record<string, Exclude<Launchpad, 'virtuals'>> = {
  [CLANKER_V4_FACTORY.toLowerCase()]: 'clanker',
  [DOPPLER_AIRLOCK]: 'doppler',
  [ZORA_FACTORY]: 'zora',
};
const LAUNCHPAD_NAMES: Array<[Launchpad, string]> = [
  ['clanker', 'Clanker'],
  ['doppler', 'Doppler'],
  ['zora', 'Zora'],
  ['virtuals', 'Virtuals'],
];
/**
 * Uniswap v2's factory answers getPair(a, b) and Aerodrome's basic-pool factory getPool(a, b, stable): one Multicall3
 * eth_call asks both for the token against each paired token named below (volatile pools on Aerodrome).
 */
const POOL_FACTORIES = [
  { address: '0x8909dc15e40173ff4699343b6eb8132c65e18ec6', dex: 'uniswap_v2', lookup: (a: string, b: string) => `0xe6a43905${pad(a)}${pad(b)}` },
  { address: '0x420dd381b31aef6683db6b902084cb0ffece40da', dex: 'aerodrome', lookup: (a: string, b: string) => `0x79bc57d5${pad(a)}${pad(b)}${'0'.repeat(64)}` },
] as const;
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
const AGGREGATE3 = parseAbi(['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)']);
/**
 * Both pools log Mint(sender indexed, amount0, amount1); Burn is (sender indexed, amount0, amount1, to indexed) on
 * Uniswap v2 and (sender indexed, to indexed, amount0, amount1) on Aerodrome. The amounts are the data either way.
 */
const POOL_MINT = '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f';
const POOL_BURNS = new Set(['0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496', '0x5d624aa9c148153ab3446c1b154f660ee7701e549fe9b62dab7171b1c80e6fa2']);
/** A token's pools read: at most this many. */
const POOL_CAP = 10;
/** The pools' LP-token transfers read: the first this many. */
const LP_PAGE = 1000;
/** The launch wallet sent back to the pool at least this share of the LP tokens it was minted: creator_removed_liquidity. */
export const LIQUIDITY_REMOVED_PCT = 50;
/** The paired tokens its pools are looked up against, named without a read. */
const PAIRED: Record<string, { symbol: string; decimals: number }> = {
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
  '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': { symbol: 'USDbC', decimals: 6 },
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': { symbol: 'cbBTC', decimals: 8 },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', decimals: 18 },
  '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b': { symbol: 'VIRTUAL', decimals: 18 },
  '0x940181a94a35a4569e4529a3cdfb74e38fd98631': { symbol: 'AERO', decimals: 18 },
};
/** Doppler's token: getVestingDataOf(account) answers (totalAmount, releasedAmount), vesting linearly from vestingStart() over vestingDuration(). */
const GET_VESTING_DATA_OF = '0xf6939d34';
const VESTING_START = '0x254800d4';
const VESTING_DURATION = '0x1514617e';
/**
 * Doppler's clone token, with several schedules: getScheduleIdsOf(account) answers its schedule ids, vestingOf(account, id)
 * (totalAmount, releasedAmount), vestingSchedules(id) (cliff, duration), counted from vestingStart().
 */
const GET_SCHEDULE_IDS_OF = '0xd2482469';
const VESTING_OF = '0x6f503e67';
const VESTING_SCHEDULES = '0x6d3cbe21';
/** Vesting schedules read for the launch wallet. */
const SCHEDULE_CAP = 3;
/** An EIP-1167 minimal proxy, or Solady's variant: Doppler deploys its newer tokens as clones of the scheduled token. */
const MINIMAL_PROXY = /^0x(?:363d3d373d3d3d363d73|3d3d3d3d363d3d37363d73)[0-9a-f]{40}5af43d/i;
/** Clanker's factory logs ExtensionTriggered(extension, extensionSupply, msgValue) for each extension of a launch. */
const EXTENSION_TRIGGERED = '0xe80ed94c33183ba307727bf230f18d40178975f51b301a8415b90f4c9f549b7f';
/**
 * Clanker's vault logs AllocationCreated(token indexed, admin indexed, supply, lockupDuration, vestingDuration) and its
 * airdrop AirdropCreated(token indexed, admin indexed, merkleRoot, supply, lockupDuration, vestingDuration).
 */
const EXTENSION_LOGS: Record<string, { kind: 'vault' | 'airdrop'; lockupWord: number }> = {
  '0x7090ec2ef3719d9bf817463bcacd6d90bc8f956cafa66eb86763eec0628f19f8': { kind: 'vault', lockupWord: 1 },
  '0x30d4da1efc8f5b956bb2dd6d54c332ec580cc814ab7c5fa0a3c5bb0584f619c2': { kind: 'airdrop', lockupWord: 2 },
};
/** Extension balances read for a Clanker launch. */
const EXTENSION_CAP = 4;
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
/** The launch wallet's own activity is read this long before the launch. */
const WEEK_SEC = NEW_CREATOR_DAYS * DAY_SEC;
/** Mints and launch-wallet transfers are read from their first PAGE records. */
const PAGE = 100;
const MAX_SEARCH_STEPS = 40;

export type TokenFlag =
  | 'not_a_contract'
  | 'not_a_token'
  | 'imitates_known_token'
  | 'launch_unknown'
  | 'creator_sanctioned'
  | 'creator_funded_by_sanctioned'
  | 'creator_removed_liquidity'
  | 'creator_minted_after_launch'
  | 'minted_after_launch'
  | 'creator_sent_launch_tokens'
  | 'creator_holds_large_share'
  | 'creator_labeled'
  | 'new_creator'
  | 'creator_shared_funder'
  | 'creator_serial_launcher';

export interface TokenCheck {
  token: string;
  chain: 'base';
  verdict: { label: 'hold' | 'review' | 'no_flags'; reason: string };
  token_info: { name: string | null; symbol: string | null; decimals: number | null; total_supply: number | null };
  /** When its name or symbol passes for a well-known token (USDC, USDT...): which one, and that token's real contract on Base. */
  imitation: Imitation | null;
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
     * Clanker launches: the token's admin at launch (originalAdmin). When it is not the launch wallet,
     * the launch was sent for it, as when Clanker's X bot launches for someone.
     */
    token_admin: string | null;
    /**
     * The wallet the launch was made for, when the launch receipt names one that did not send it: Clanker's token admin
     * (TokenCreated), Zora's payout recipient (the coin's creation log), or the one wallet a Doppler clone token vests
     * to (its vesting allocation log), as when a launch service launches for someone. The creator facts describe this
     * wallet; `creator` above stays the wallet that sent the launch. Null when the receipt names none, or names the sender.
     */
    made_for: { address: string; named_as: 'token_admin' | 'payout_recipient' | 'vesting_beneficiary' } | null;
  } | null;
  creator: {
    address: string;
    /** Which wallet these facts describe: the wallet that sent the launch, or the wallet it was made for (launch.made_for). */
    role: 'launch_wallet' | 'made_for';
    type: WalletLookup['type'];
    sanctioned: boolean;
    first_seen: string | null;
    age_days_at_launch: number | null;
    sent_txs: number;
    first_funder: WalletLookup['first_funder'];
    /** Share of the current supply the launch wallet holds now, in percent. */
    holds_pct: number | null;
    /**
     * Doppler launches: tokens the token contract still holds for the launch wallet and releases to it as they vest
     * (Doppler's vesting data for it), not yet in its balance. Amounts in token units, the share in percent of the
     * supply; start, cliff end and full vesting as ISO times, when read. All zero when nothing vests to it. Null when
     * not read: not a Doppler launch, or the token answers neither of Doppler's vesting reads.
     */
    vesting: { amount: number | null; pct: number | null; released: number | null; start: string | null; cliff_end: string | null; end: string | null } | null;
    /** holds_pct plus the share still vesting to it: what creator_holds_large_share is judged on. */
    holds_with_vesting_pct: number | null;
    /**
     * Clanker launches: the share of the supply still in Clanker's extension contracts (supply.extensions) whose admin
     * at launch is the launch wallet. Reported apart: not counted in creator_holds_large_share. Null off Clanker.
     */
    extensions_pct: number | null;
    /**
     * Its sent-transaction count and whether it had code at the block 7 days before the launch (by
     * measured block time). 0 and false: its own activity began within that week, whatever reached it
     * earlier. Null when not read.
     */
    week_before_launch: { block: number; sent_txs: number; has_code: boolean } | null;
    /**
     * Tokens it received in the launch transaction (a dev buy or an allocation), and what it
     * sent on within a day: the share, its first send, and when 90% of it had gone. Null when
     * it got none, or was also minted to in the launch transaction (its sends could be that).
     * The share and timings come from its first 100 transfers; the held_ fields from its balance
     * at the end of the launch block and about an hour later (by measured block time, or now for
     * a token under an hour old), which no number of small sends can hide. sent_pct is the larger
     * of the two shares. held_now and sent_now_pct: its balance at this check against what it got,
     * held_now_after_sec after the launch, whatever came in or went out since. Amounts in token units.
     */
    launch_tokens: {
      received: number;
      sent_pct: number;
      first_send_after_sec: number | null;
      sent_90pct_after_sec: number | null;
      held_at_launch: number | null;
      held_1h: number | null;
      held_1h_after_sec: number | null;
      /** The share of the launch tokens it no longer held at the second balance read, in percent. */
      sent_1h_pct: number | null;
      held_now: number | null;
      held_now_after_sec: number | null;
      /** The share of the launch tokens it no longer holds at this check, in percent (a floor: tokens it got later count as kept). */
      sent_now_pct: number | null;
    } | null;
    /** Clanker launches: launches_24h.by_launchpad.clanker. Null off Clanker, or when the launches were not read. */
    clanker_launches_24h: number | null;
    /**
     * Its launches in the 24 hours with the most of them that include this one: its own transactions to Clanker's
     * factory, Doppler's Airlock and Zora's factory from a day before the launch to a day after it or this check,
     * whichever is sooner (the newest 1,000), and this launch, whoever sent it. By launchpad (`other`: this launch,
     * when it is not on one of them), seconds from the first to the last, and the time the read ran to. A floor when
     * `capped`. Null when not read.
     */
    launches_24h: {
      total: number;
      by_launchpad: Record<Launchpad | 'other', number>;
      span_sec: number;
      read_to: string;
      capped: boolean;
    } | null;
    /** The launch wallet's public labels from ChainWard's investigations and detectors, strongest first. */
    labels: WalletLookup['labels'];
  } | null;
  supply: {
    /** Mints after the first issuance (the transaction of the first mint). A floor when `capped`. */
    mints_after_launch: number;
    minted_after_launch: number | null;
    /** How many of those mints went to the launch wallet, and how many tokens they made. */
    to_creator: number;
    minted_to_creator: number | null;
    capped: boolean;
    /**
     * Clanker launches: supply the launch put in Clanker's extension contracts (the factory's ExtensionTriggered logs
     * in the launch transaction), and what each still holds of it now (its balance). kind: 'vault' or 'airdrop' when
     * the contract logged Clanker's vault or airdrop allocation for the token, with its admin and lockup and vesting
     * ends from that log (the admin can be changed later). Amounts in token units, shares in percent of today's
     * supply. Empty when the launch set none aside; null off Clanker.
     */
    extensions: Array<{
      contract: string;
      kind: 'vault' | 'airdrop' | null;
      at_launch: number | null;
      at_launch_pct: number | null;
      holds: number | null;
      holds_pct: number | null;
      admin_at_launch: string | null;
      unlocks: string | null;
      vested: string | null;
    }> | null;
  };
  /**
   * The token's liquidity. locked_by: the launchpad that launched it, when that launchpad holds the pool's liquidity
   * so the launch wallet cannot withdraw it (Clanker, Zora, Doppler, Virtuals); its pools are not read. pools: its
   * Uniswap v2 and Aerodrome basic pools against the paired tokens named in PAIRED, and what the launch wallet put in
   * and took out of each; null when not read (a launchpad's lock, or no launch wallet). capped: more LP-token transfers
   * than one read returns (the launch wallet's part is then null). Null when the address is not a token.
   */
  liquidity: { locked_by: 'clanker' | 'zora' | 'doppler' | 'virtuals' | null; pools: LiquidityPool[] | null; capped: boolean } | null;
  flags: TokenFlag[];
  as_of_block: number;
  limits: string;
}

export interface LiquidityPool {
  address: string;
  dex: 'uniswap_v2' | 'aerodrome';
  paired_with: string;
  /** The paired token's symbol, for WETH, USDC and the other paired tokens named without a read. */
  paired_symbol: string | null;
  /**
   * What the launch wallet put in, through LP tokens minted to it, and took out, through LP tokens it sent back to
   * the pool to burn: amounts of the paired token and of this token, from the pool's Mint and Burn logs in the receipt
   * of its one add and its one removal (null when it made several, or for a pool other than the one it took the most
   * out of). removed_pct: the share of its LP tokens it sent back, in percent. pool_pct: the share of the pool's
   * liquidity its removals took, what they burned against that plus what the pool had left after its last removal.
   * Times in seconds after the launch, from the block time of the LP transfers. Null when it added and removed none.
   */
  launch_wallet: {
    added: number | null;
    added_tokens: number | null;
    added_after_sec: number | null;
    removed: number | null;
    removed_tokens: number | null;
    removed_pct: number | null;
    pool_pct: number | null;
    removed_after_sec: number | null;
    removal_tx: string | null;
  } | null;
}

export interface TokenTransfer {
  from: string;
  to: string | null;
  hash: string;
  blockNum?: string;
  value?: number | null;
  /** The amount in raw units, as hex; Alchemy leaves `value` null for tokens it has no decimals for. */
  rawContract?: { value?: string | null; address?: string | null };
  /** Alchemy's id for a token transfer: `<tx>:log:<logIndex>`. */
  uniqueId?: string;
  metadata?: { blockTimestamp?: string };
}

/** The wallet lookup's deps, with transfers that also carry block numbers and amounts. */
export interface TokenCheckDeps extends WalletLookupDeps {
  transfers(params: Record<string, unknown>): Promise<{ transfers: TokenTransfer[] }>;
}

const LIMITS =
  "On-chain facts about the launch, the supply and the wallet behind it: the wallet that sent the launch transaction, which can be a bot, relayer or smart wallet acting for someone else (in a bundle of several smart wallets' operations, the one whose operation the token's first log came in), or the wallet the launch receipt says it was made for: Clanker's token admin, Zora's payout recipient, or the one wallet a Doppler token vests to, when that is not the sender (launch.creator stays the sender). Tokens that wallet received at launch and sent out are not traced further: they may have been sold, moved or locked. What it sent out is read from its balance at the end of the launch block, about an hour later and at this check, and from its first 100 transfers. Its age is its own activity, its transactions and code a week before the launch, where that was read, and otherwise its first transfer in; its first funder is the first wallet that sent it ETH or a listed token above a dust floor, not an airdrop of another token. A funder counts as an exchange only when ChainWard's labels name it one; a busy funder is judged by how many of the 20 wallets it most recently sent funds to had never been used before. Its share of the supply is its balance plus, for a Doppler launch, the tokens still vesting to it (Doppler's vesting data for it, from up to 3 schedules); for a Clanker launch, the supply in Clanker's vault and airdrop contracts is reported apart and not counted in it. Its launches are its own transactions to Clanker's factory, Doppler's Airlock and Zora's factory (the newest 1,000) from a day before the launch to a day after it or this check, whichever is sooner, plus this launch, counted over the 24 hours with the most of them that include this one; launches it made through a smart wallet's operations, a router or another contract, launches others sent for it (other than this one) and its other Virtuals launches are not counted, since purchases on Virtuals' bonding curve go to the same contract. Liquidity: Clanker, Zora, Doppler and Virtuals hold the liquidity of their launches, so those pools are not read. For any other token, the check looks up its Uniswap v2 and Aerodrome basic pools against WETH, USDC, USDbC, cbBTC, DAI, VIRTUAL and AERO, and what the launch wallet put in and took out of each, through LP tokens minted to it and LP tokens it sent back to the pool (the first 1,000 LP transfers), with amounts from the receipts of its add and removal in the pool it took the most out of; LP tokens it passed to another wallet or a locker are not followed, and pools against other tokens, Uniswap v3 and v4 pools, Aerodrome concentrated pools and other exchanges are not read. It does not check whether liquidity is locked or how much a pool holds today, does not simulate a sale (a honeypot check), and does not measure holder concentration. Mints are read from their first 100 records. no_flags means none of these checks matched; it is not a clearance.";
const CLANKER_NOTE =
  "Launched through Clanker's current factory, which deploys every token from one verified template with no owner mint, pause, blacklist or transfer tax.";
const VIRTUALS_NOTE =
  "A Virtuals agent token: created when its prototype graduated from Virtuals' bonding curve, inside another wallet's purchase. The wallet that launched it is the prototype's creator, as Virtuals' Bonding contract records it.";
const VIRTUALS_V5_NOTE =
  "A Virtuals agent token on Virtuals' bonding curve: Virtuals' Bonding V5 contract logged its launch, in a transaction from the wallet that launched it.";

const hex = (n: number) => `0x${n.toString(16)}`;
const hexToNumber = (h: unknown) => (typeof h === 'string' && h.startsWith('0x') && h !== '0x' ? Number(BigInt(h)) : 0);
const hasCode = (c: unknown) => typeof c === 'string' && c !== '0x' && c !== '0x0' && c.length > 2;
const lower = (a: string | null | undefined) => (a ? a.toLowerCase() : null);
const pad = (addr: string) => addr.slice(2).toLowerCase().padStart(64, '0');

/** The contract itself refused the call (Alchemy answers "execution reverted"): its answer is no. */
const EXECUTION_ERROR = /revert|invalid opcode|out of gas|stack (?:under|over)flow|EVM error/i;

/** An eth_call the contract may refuse. A throttled or failed read throws: it is not the contract's answer. */
async function safeCall(deps: TokenCheckDeps, to: string, data: string, block = 'latest'): Promise<string | null> {
  try {
    const r = await deps.rpc('eth_call', [{ to, data }, block]);
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

type ReceiptLog = { address: string; topics?: string[]; data?: string; logIndex?: string };

/**
 * The wallet behind the launch transaction: its sender; the smart wallet whose operation launched
 * it, in a bundle; or, for a Virtuals agent token that graduated, the prototype's creator (the
 * sender was a buyer). A launch through Virtuals' Bonding V5 is named Virtuals, sender unchanged.
 */
async function findCreator(
  deps: TokenCheckDeps,
  txHash: string,
  token: string,
): Promise<{ creator: string | null; via: string | null; launcher: 'virtuals' | null; note: string | null; logs: ReceiptLog[] }> {
  const [tx, receipt] = await Promise.all([
    deps.rpc('eth_getTransactionByHash', [txHash]) as Promise<{ from?: string; to?: string | null } | null>,
    deps.rpc('eth_getTransactionReceipt', [txHash]) as Promise<{ logs?: ReceiptLog[] } | null>,
  ]);
  if (!tx?.from) return { creator: null, via: null, launcher: null, note: null, logs: [] };
  // In the order they were emitted (a stable sort keeps the given order when there is no logIndex).
  const logs = [...(receipt?.logs ?? [])].sort((a, b) => hexToNumber(a.logIndex) - hexToNumber(b.logIndex));
  const graduation = logs.find(
    (l) => lower(l.address) === VIRTUALS_BONDING && l.topics?.[0]?.toLowerCase() === GRADUATED && wordAddr(l.data?.slice(2, 66)) === token,
  );
  if (graduation) {
    const prototype = wordAddr(graduation.topics?.[1]);
    const info = prototype ? await safeCall(deps, VIRTUALS_BONDING, `${TOKEN_INFO}${pad(prototype)}`) : null;
    const words = info?.slice(2).match(/.{64}/g) ?? [];
    const recorded = wordAddr(words[1]) === prototype && wordAddr(words[3]) === token ? wordAddr(words[0]) : null;
    // Unconfirmed, the launch wallet is unknown: the sender only bought.
    return { creator: recorded && recorded !== ZERO ? recorded : null, via: VIRTUALS_BONDING, launcher: 'virtuals', note: VIRTUALS_NOTE, logs };
  }
  const onCurve = logs.some((l) => lower(l.address) === VIRTUALS_BONDING_V5 && wordAddr(l.topics?.[1]) === token);
  const launcher = onCurve ? ('virtuals' as const) : null;
  const note = onCurve ? VIRTUALS_V5_NOTE : null;
  const via = lower(tx.to ?? null);
  if (via && ENTRY_POINTS.has(via)) {
    const isOp = (l: ReceiptLog) => lower(l.address) === via && l.topics?.[0]?.toLowerCase() === USER_OPERATION_EVENT && !!l.topics[2];
    const senders = new Set(logs.filter(isOp).map((l) => wordAddr(l.topics![2])!));
    if (senders.size <= 1) return { creator: senders.size ? [...senders][0]! : null, via, launcher, note, logs };
    // Several smart wallets' operations in one bundle: the EntryPoint logs each operation's
    // UserOperationEvent right after what that operation did, so the token's first log falls
    // inside the operation that launched it, and the next UserOperationEvent is that operation's.
    const firstTokenLog = logs.findIndex((l) => lower(l.address) === token);
    const op = firstTokenLog >= 0 ? logs.slice(firstTokenLog + 1).find(isOp) : undefined;
    return { creator: op ? wordAddr(op.topics![2]) : null, via, launcher, note, logs };
  }
  return { creator: tx.from.toLowerCase(), via, launcher, note, logs };
}

/**
 * The block a week before the launch and the block an hour after it, from measured block times
 * (2 s on Base today, 200 ms after Denim), never an assumed one. The week is first counted at the
 * pace since the launch, then measured: the timestamp of the block it lands on gives the pace of
 * the week before the launch, and the week is counted again at that pace. Base's blocks only get
 * faster, so a guess that spans a speed-up reaches back too far, and the measured pace then
 * brings it inside the week, never past it. The hour is counted at the slower of the two paces,
 * so it never runs past the hour; a token younger than an hour is read as of now.
 */
function blockTiming(
  launchBlock: number,
  launchSec: number | null,
  nowSec: number,
  head: number,
  weekGuess: number | null,
  guessHeader: { timestamp?: string } | null,
): { weekBefore: number | null; hourAfter: number | null; hourAfterSec: number | null } {
  if (launchSec === null) return { weekBefore: null, hourAfter: null, hourAfterSec: null };
  const elapsed = Math.max(1, nowSec - launchSec);
  const paceSince = elapsed / Math.max(1, head - launchBlock);
  const guessSec = guessHeader?.timestamp ? hexToNumber(guessHeader.timestamp) : null;
  const paceBefore = weekGuess !== null && guessSec !== null && launchSec > guessSec && launchBlock > weekGuess ? (launchSec - guessSec) / (launchBlock - weekGuess) : null;
  const weekBefore = paceBefore !== null ? launchBlock - Math.round(WEEK_SEC / paceBefore) : null;
  const pace = Math.max(paceSince, paceBefore ?? 0);
  const hourBlocks = Math.round(SENT_WITHIN_SEC / pace);
  const reached = launchBlock + hourBlocks < head;
  return {
    weekBefore: weekBefore !== null && weekBefore >= 0 ? weekBefore : null,
    hourAfter: reached ? launchBlock + hourBlocks : null,
    hourAfterSec: reached ? Math.round(hourBlocks * pace) : Math.round(elapsed),
  };
}

/** The first guess at the block a week before the launch: a week at the pace of the blocks since the launch. */
function weekGuessBlock(launchBlock: number, launchSec: number | null, nowSec: number, head: number): number | null {
  if (launchSec === null || launchBlock < 2) return null;
  const paceSince = Math.max(1, nowSec - launchSec) / Math.max(1, head - launchBlock);
  return Math.max(1, launchBlock - Math.round(WEEK_SEC / paceSince));
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
/** Seconds, minutes, hours, and days past two days. */
const duration = (sec: number) =>
  sec < 120 ? plural(sec, 'second') : sec < 7200 ? plural(Math.round(sec / 60), 'minute') : sec < 172_800 ? plural(Math.round(sec / 3600), 'hour') : plural(Math.round(sec / 86_400), 'day');

const words = (h: string | null | undefined): string[] => h?.slice(2).match(/.{64}/g) ?? [];
const uint = (w: string | undefined): bigint => (w ? BigInt(`0x${w}`) : 0n);
const word = (n: bigint) => n.toString(16).padStart(64, '0');
/** A share in percent, floored to 2 decimals, so it never overstates. */
const pctOf = (part: bigint, whole: bigint) => (whole > 0n ? Number((part * 10_000n) / whole) / 100 : null);
const isoAt = (sec: number | null) => (sec === null ? null : new Date(sec * 1000).toISOString());

/** Doppler or Zora, when its contract logged the token's creation in the launch transaction (the token in a topic or a data word). */
function launchpadOf(logs: ReceiptLog[], token: string): 'doppler' | 'zora' | null {
  const names = (l: ReceiptLog) => (l.topics ?? []).slice(1).some((t) => wordAddr(t) === token) || words(l.data).some((w) => wordAddr(w) === token);
  const from = (launchpad: string) => logs.some((l) => lower(l.address) === launchpad && names(l));
  return from(DOPPLER_AIRLOCK) ? 'doppler' : from(ZORA_FACTORY) ? 'zora' : null;
}

interface PoolRef {
  address: string;
  dex: LiquidityPool['dex'];
  paired: string;
  tokenIs0: boolean;
}

/**
 * The token's Uniswap v2 and Aerodrome basic (volatile) pools against each paired token in PAIRED: one Multicall3
 * eth_call asking both factories (no log reads, which Alchemy's free tier refuses over 10 blocks). Any refusal throws.
 */
async function findPools(deps: TokenCheckDeps, token: string): Promise<PoolRef[]> {
  const asks = POOL_FACTORIES.flatMap((factory) => Object.keys(PAIRED).filter((p) => p !== token).map((paired) => ({ factory, paired })));
  const data = encodeFunctionData({
    abi: AGGREGATE3,
    functionName: 'aggregate3',
    args: [asks.map((a) => ({ target: a.factory.address as `0x${string}`, allowFailure: true, callData: a.factory.lookup(token, a.paired) as `0x${string}` }))],
  });
  const answer = await deps.rpc('eth_call', [{ to: MULTICALL3, data }, 'latest']);
  const results = decodeFunctionResult({ abi: AGGREGATE3, functionName: 'aggregate3', data: answer as `0x${string}` });
  const refs: PoolRef[] = [];
  results.forEach((r, i) => {
    const address = r.success ? wordAddr(r.returnData.slice(2, 66)) : null;
    const ask = asks[i]!;
    if (!address || address === ZERO || refs.some((x) => x.address === address)) return;
    // token0 is the lower address on both exchanges.
    refs.push({ address, dex: ask.factory.dex, paired: ask.paired, tokenIs0: token < ask.paired });
  });
  return refs.slice(0, POOL_CAP);
}

/** The pools' LP-token transfers since the launch, oldest first (one asset-transfer read, no log ranges). */
async function readPoolLp(deps: TokenCheckDeps, refs: PoolRef[], fromBlock: number): Promise<{ transfers: TokenTransfer[]; capped: boolean }> {
  if (!refs.length) return { transfers: [], capped: false };
  const page = await deps.transfers({
    fromBlock: hex(fromBlock),
    toBlock: 'latest',
    contractAddresses: refs.map((r) => r.address),
    category: ['erc20'],
    order: 'asc',
    maxCount: hex(LP_PAGE),
    withMetadata: true,
    excludeZeroValue: false,
  });
  const logIndex = (t: TokenTransfer) => {
    const m = t.uniqueId?.match(/:log:(0x[0-9a-f]+|\d+)$/i);
    return m?.[1] ? Number(m[1]) : 0;
  };
  const transfers = [...page.transfers].sort((a, b) => hexToNumber(a.blockNum) - hexToNumber(b.blockNum) || logIndex(a) - logIndex(b));
  return { transfers, capped: page.transfers.length >= LP_PAGE };
}

/**
 * What the launch wallet did in one pool, from its LP-token transfers: LP minted to it (its adds), LP it sent back to the
 * pool (its removals), and the pool's LP supply through every mint and burn, for the share its removals took.
 */
function poolActivity(ref: PoolRef, transfers: TokenTransfer[], wallet: string) {
  let supply = 0n;
  let minted = 0n;
  let returned = 0n;
  let burned = 0n;
  let left: bigint | null = null;
  const adds = new Set<string>();
  const removals = new Set<string>();
  let firstAdd: TokenTransfer | null = null;
  let lastRemoval: TokenTransfer | null = null;
  for (const t of transfers) {
    if (lower(t.rawContract?.address) !== ref.address) continue;
    const value = rawOf(t) ?? 0n;
    const [from, to, tx] = [lower(t.from), lower(t.to), t.hash.toLowerCase()];
    if (from === ZERO) {
      supply += value;
      if (to === wallet) {
        minted += value;
        adds.add(tx);
        firstAdd ??= t;
      }
    } else if (to === ZERO) {
      supply -= value;
      if (removals.has(tx)) {
        burned += value;
        left = supply;
        lastRemoval = t;
      }
    }
    if (from === wallet && to === ref.address) {
      returned += value;
      removals.add(tx);
    }
  }
  if (minted === 0n && returned === 0n) return null;
  return {
    minted,
    returned,
    removed_pct: minted > 0n ? Math.min(100, pctOf(returned, minted)!) : null,
    pool_pct: burned > 0n && left !== null ? pctOf(burned, burned + (left > 0n ? left : 0n)) : null,
    adds: [...adds],
    removals: [...removals],
    firstAdd,
    lastRemoval,
  };
}

/** The pool's Mint or Burn amounts in one transaction's receipt, as [amount0, amount1]; null when the receipt has none. */
async function poolAmounts(deps: TokenCheckDeps, tx: string, pool: string, kind: 'mint' | 'burn'): Promise<[bigint, bigint] | null> {
  const receipt = (await deps.rpc('eth_getTransactionReceipt', [tx])) as { logs?: ReceiptLog[] } | null;
  const matches = (receipt?.logs ?? []).filter((l) => {
    const topic = l.topics?.[0]?.toLowerCase();
    return lower(l.address) === pool && (kind === 'mint' ? topic === POOL_MINT : !!topic && POOL_BURNS.has(topic));
  });
  if (!matches.length) return null;
  return matches.reduce<[bigint, bigint]>((sum, l) => [sum[0] + uint(words(l.data)[0]), sum[1] + uint(words(l.data)[1])], [0n, 0n]);
}

/**
 * Pools and what the launch wallet did in each. Amounts come from at most two receipts: the one add and the one removal
 * of the pool it took the largest share out of (or, when it removed none, of the first pool it added to).
 */
async function liquidityFacts(
  deps: TokenCheckDeps,
  refs: PoolRef[],
  lp: { transfers: TokenTransfer[]; capped: boolean },
  wallet: string,
  decimals: number | null,
  launchSec: number | null,
): Promise<{ pools: LiquidityPool[]; removals: Map<string, number> }> {
  const activity = refs.map((ref) => (lp.capped ? null : poolActivity(ref, lp.transfers, wallet)));
  const ranked = activity
    .map((a, i) => ({ a, i }))
    .filter((x) => x.a)
    .sort((x, y) => (y.a!.removed_pct ?? 0) - (x.a!.removed_pct ?? 0));
  const target = ranked[0];
  const [mintAmounts, burnAmounts] = target
    ? await Promise.all([
        target.a!.adds.length === 1 ? poolAmounts(deps, target.a!.adds[0]!, refs[target.i]!.address, 'mint') : Promise.resolve(null),
        target.a!.removals.length === 1 ? poolAmounts(deps, target.a!.removals[0]!, refs[target.i]!.address, 'burn') : Promise.resolve(null),
      ])
    : [null, null];
  const units = (raw: bigint, d: number | null) => (d !== null && d <= 77 ? scaleUnits(raw, d) : null);
  const after = (t: TokenTransfer | null) => {
    const at = t?.metadata?.blockTimestamp ? new Date(t.metadata.blockTimestamp).getTime() / 1000 : null;
    return at === null || launchSec === null ? null : Math.round(at - launchSec);
  };
  const removals = new Map<string, number>();
  const pools = refs.map((ref, i): LiquidityPool => {
    const a = activity[i];
    if (a) removals.set(ref.address, a.removals.length);
    const d = PAIRED[ref.paired]?.decimals ?? null;
    const [t, p] = ref.tokenIs0 ? ([0, 1] as const) : ([1, 0] as const);
    const mint = target?.i === i ? mintAmounts : null;
    const burn = target?.i === i ? burnAmounts : null;
    return {
      address: ref.address,
      dex: ref.dex,
      paired_with: ref.paired,
      paired_symbol: PAIRED[ref.paired]?.symbol ?? null,
      launch_wallet: a
        ? {
            added: mint ? units(mint[p], d) : null,
            added_tokens: mint ? units(mint[t], decimals) : null,
            added_after_sec: after(a.firstAdd),
            removed: burn ? units(burn[p], d) : null,
            removed_tokens: burn ? units(burn[t], decimals) : null,
            removed_pct: a.removed_pct,
            pool_pct: a.pool_pct,
            removed_after_sec: after(a.lastRemoval),
            removal_tx: a.lastRemoval?.hash.toLowerCase() ?? null,
          }
        : null,
    };
  });
  return { pools, removals };
}

type RawVesting = { left: bigint; released: bigint; start: number | null; cliff: number | null; end: number | null };
const NOTHING_VESTS: RawVesting = { left: 0n, released: 0n, start: null, cliff: null, end: null };

/** Doppler's token: one vesting entry per account, linear from vestingStart over vestingDuration. Undefined when the token refuses the read. */
async function legacyVesting(deps: TokenCheckDeps, token: string, wallet: string): Promise<RawVesting | undefined> {
  const data = await safeCall(deps, token, `${GET_VESTING_DATA_OF}${pad(wallet)}`);
  if (data === null) return undefined;
  const [total, released] = words(data).map((w) => uint(w));
  const left = (total ?? 0n) > (released ?? 0n) ? total! - released! : 0n;
  if (left === 0n) return { ...NOTHING_VESTS, released: released ?? 0n };
  const [startHex, durationHex] = await Promise.all([safeCall(deps, token, VESTING_START), safeCall(deps, token, VESTING_DURATION)]);
  const start = startHex ? Number(BigInt(startHex)) : null;
  const duration = durationHex ? Number(BigInt(durationHex)) : null;
  return { left, released: released ?? 0n, start, cliff: null, end: start !== null && duration !== null ? start + duration : null };
}

/**
 * Doppler's clone token: the account's schedules (up to `maxIds`), and, for a single schedule when `timing`, its cliff
 * and duration from vestingStart. Undefined when the token refuses the read.
 */
async function scheduledVesting(deps: TokenCheckDeps, token: string, wallet: string, maxIds: number, timing: boolean): Promise<RawVesting | undefined> {
  const idsHex = await safeCall(deps, token, `${GET_SCHEDULE_IDS_OF}${pad(wallet)}`);
  if (idsHex === null) return undefined;
  const w = words(idsHex);
  const ids = w.slice(2, 2 + Number(uint(w[1]))).map((x) => uint(x));
  if (!ids.length) return NOTHING_VESTS;
  const read = ids.slice(0, maxIds);
  const one = timing && ids.length === 1;
  const [amounts, schedule, startHex] = await Promise.all([
    Promise.all(read.map((id) => safeCall(deps, token, `${VESTING_OF}${pad(wallet)}${word(id)}`))),
    one ? safeCall(deps, token, `${VESTING_SCHEDULES}${word(read[0]!)}`) : Promise.resolve(null),
    one ? safeCall(deps, token, VESTING_START) : Promise.resolve(null),
  ]);
  let total = 0n;
  let released = 0n;
  for (const a of amounts) {
    const [t, r] = words(a).map((x) => uint(x));
    total += t ?? 0n;
    released += r ?? 0n;
  }
  const start = startHex ? Number(BigInt(startHex)) : null;
  const [cliff, duration] = words(schedule).map((x) => Number(uint(x)));
  return {
    left: total > released ? total - released : 0n,
    released,
    start,
    cliff: start !== null && cliff ? start + cliff : null,
    end: start !== null && duration !== undefined ? start + duration : null,
  };
}

/**
 * Supply vesting to the launch wallet on a Doppler token. A clone (an EIP-1167 proxy) is read as Doppler's scheduled
 * token, a full contract as its original one, each falling back to the other: at most 4 reads either way.
 */
async function readVesting(deps: TokenCheckDeps, token: string, code: unknown, wallet: string): Promise<RawVesting | null> {
  if (typeof code === 'string' && MINIMAL_PROXY.test(code)) {
    return (await scheduledVesting(deps, token, wallet, SCHEDULE_CAP, true)) ?? (await legacyVesting(deps, token, wallet)) ?? null;
  }
  return (await legacyVesting(deps, token, wallet)) ?? (await scheduledVesting(deps, token, wallet, 2, false)) ?? null;
}

type RawExtension = { contract: string; kind: 'vault' | 'airdrop' | null; supply: bigint; admin: string | null; lockup: number | null; vesting: number | null };

/** Clanker's extensions that got supply in the launch transaction, with the vault's or airdrop's own allocation log for the token. */
function clankerExtensions(logs: ReceiptLog[], token: string): RawExtension[] {
  const out: RawExtension[] = [];
  for (const l of logs) {
    if (lower(l.address) !== CLANKER_V4_FACTORY.toLowerCase() || l.topics?.[0]?.toLowerCase() !== EXTENSION_TRIGGERED) continue;
    const [contractWord, supplyWord] = words(l.data);
    const contract = wordAddr(contractWord);
    const supply = uint(supplyWord);
    if (!contract || supply === 0n) continue;
    const own = logs.find((x) => lower(x.address) === contract && EXTENSION_LOGS[x.topics?.[0]?.toLowerCase() ?? ''] && wordAddr(x.topics?.[1]) === token);
    const shape = own ? EXTENSION_LOGS[own.topics![0]!.toLowerCase()]! : null;
    const w = words(own?.data);
    const at = (i: number) => (shape && w[i] ? Number(uint(w[i])) : null);
    out.push({ contract, kind: shape?.kind ?? null, supply, admin: own ? wordAddr(own.topics?.[2]) : null, lockup: shape ? at(shape.lockupWord) : null, vesting: shape ? at(shape.lockupWord + 1) : null });
  }
  return out;
}

export interface CheckTokenOptions {
  /**
   * Runs once the address is known to be an ERC-20 token, before the launch search (the costly
   * part of the check). A throw stops the check there. The free check on chainward.ai spends its
   * allowance here, so a wallet pasted into the same box spends none.
   */
  beforeLaunchSearch?: () => Promise<void>;
}

export async function checkToken(rawToken: string, deps: TokenCheckDeps, opts: CheckTokenOptions = {}): Promise<TokenCheck> {
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
  // Fake USDC airdropped by address-poisoning bots, and look-alike Tethers from launch mills. Judged
  // from the name and symbol alone, so it holds for a contract that only emits fake Transfer events too.
  const imitation = imitatedToken({ symbol: token_info.symbol, name: token_info.name, contract: token, chain: 'base' });
  const empty = { mints_after_launch: 0, minted_after_launch: null, to_creator: 0, minted_to_creator: null, capped: false, extensions: null };
  const stop = (flag: 'not_a_contract' | 'not_a_token', reason: string = REASONS[flag]()): TokenCheck => ({
    token,
    chain: 'base',
    verdict: imitation ? imitationVerdict(imitation) : { label: 'review', reason },
    token_info,
    imitation,
    launch: null,
    creator: null,
    supply: empty,
    liquidity: null,
    flags: imitation ? [flag, 'imitates_known_token'] : [flag],
    as_of_block: head,
    limits: LIMITS,
  });
  if (!hasCode(code)) return stop('not_a_contract');
  if (supplyRaw === null) return stop('not_a_token');
  // An ERC-721 collection answers totalSupply() but has no decimals().
  if (decimalsRead === null && BigInt((await safeCall(deps, token, SUPPORTS_ERC721)) ?? '0x0') === 1n) return stop('not_a_token', NFT_REASON);
  await opts.beforeLaunchSearch?.();

  const launch0 = await findLaunch(token, deps, head);
  const launchSec = launch0.time ? Math.floor(new Date(launch0.time).getTime() / 1000) : null;
  const nowSec = deps.now().getTime() / 1000;
  const weekGuess = launch0.tx ? weekGuessBlock(launch0.block, launchSec, nowSec, head) : null;
  const [who, clankerHex, guessHeader] = await Promise.all([
    launch0.tx ? findCreator(deps, launch0.tx, token) : Promise.resolve({ creator: null, via: null, launcher: null, note: null, logs: [] as ReceiptLog[] }),
    safeCall(deps, CLANKER_V4_FACTORY.toLowerCase(), `${TOKEN_DEPLOYMENT_INFO}${pad(token)}`),
    weekGuess !== null ? (deps.rpc('eth_getBlockByNumber', [hex(weekGuess), false]) as Promise<{ timestamp?: string } | null>) : Promise.resolve(null),
  ]);
  const timing = blockTiming(launch0.block, launchSec, nowSec, head, weekGuess, guessHeader);
  const launcher = clankerRegistryMatches(clankerHex, token) ? 'clanker' : who.launcher;
  // A launch service's launch names the wallet it was made for: the wallet facts below describe that wallet.
  const madeFor = launchMadeFor(who.logs, token, who.creator);
  const launch: NonNullable<TokenCheck['launch']> = {
    block: launch0.block,
    time: launch0.time,
    tx: launch0.tx,
    creator: who.creator,
    via: who.via,
    launcher,
    launcher_note: launcher === 'clanker' ? CLANKER_NOTE : who.note,
    token_admin: null,
    made_for: madeFor,
  };
  const creatorAddr = madeFor?.address ?? who.creator;
  // Nothing precedes the launch, and reading from genesis made Alchemy fail on busy tokens.
  const transferBase = { fromBlock: hex(launch.block), toBlock: 'latest', contractAddresses: [token], category: ['erc20'], order: 'asc', excludeZeroValue: false };
  const mintsFrom = (block: number) => deps.transfers({ ...transferBase, fromBlock: hex(block), fromAddress: ZERO, maxCount: hex(PAGE), withMetadata: false });

  const clanker = launcher === 'clanker';
  // Clanker, Zora, Doppler and Virtuals hold the liquidity of their launches: the launch wallet cannot pull it, so no pool reads.
  const launchpad = launchpadOf(who.logs, token);
  const lockedBy = launcher ?? launchpad;
  // Its pools from one eth_call, then their LP-token transfers from the transfer index: no log ranges.
  const poolsRead =
    !lockedBy && creatorAddr && launch.tx ? findPools(deps, token).then(async (refs) => ({ refs, lp: await readPoolLp(deps, refs, launch.block) })) : Promise.resolve(null);
  const vestingRead = launchpad === 'doppler' && creatorAddr ? readVesting(deps, token, code, creatorAddr) : Promise.resolve(null);
  const extensions = clanker ? clankerExtensions(who.logs, token) : null;
  const extensionsRead = extensions
    ? Promise.all(extensions.slice(0, EXTENSION_CAP).map((e) => safeCall(deps, token, `${SEL.balanceOf}${pad(e.contract)}`)))
    : Promise.resolve(null);
  const balanceData = creatorAddr ? `${SEL.balanceOf}${pad(creatorAddr)}` : null;
  const balanceNow = balanceData ? safeCall(deps, token, balanceData) : Promise.resolve(null);
  const inflowsRead = creatorAddr && launch.tx ? deps.transfers({ ...transferBase, toAddress: creatorAddr, maxCount: hex(PAGE), withMetadata: true }) : Promise.resolve(null);
  // What it held at the end of the launch block and an hour later (archive reads), only when it got tokens in the launch transaction.
  const heldRead = inflowsRead.then(async (page) => {
    if (!balanceData || !launchTokensIn(page?.transfers ?? [], launch.tx, decimals)) return null;
    const [atLaunch, later] = await Promise.all([
      safeCall(deps, token, balanceData, hex(launch.block)),
      timing.hourAfter !== null ? safeCall(deps, token, balanceData, hex(timing.hourAfter)) : balanceNow,
    ]);
    return { atLaunch, later, afterSec: timing.hourAfterSec };
  });
  // Its own activity a week before the launch: transactions sent and code.
  const weekRead =
    creatorAddr && timing.weekBefore !== null
      ? Promise.all([deps.rpc('eth_getTransactionCount', [creatorAddr, hex(timing.weekBefore)]), deps.rpc('eth_getCode', [creatorAddr, hex(timing.weekBefore)])])
      : Promise.resolve(null);
  // The wallet lookup's own head read would repeat this check's.
  const walletDeps: TokenCheckDeps = { ...deps, rpc: (method, params) => (method === 'eth_blockNumber' ? Promise.resolve(headHex) : deps.rpc(method, params)) };
  const [wallet, mintsPage, balanceHex, inflows, outflows, adminHex, ownTxs, held, week, pools, vestingRaw, extensionBalances] = await Promise.all([
    // No decoy reads: a planted look-alike is a payment risk, and a wallet a launch was made for can be one that never sent a transaction.
    creatorAddr ? lookupWallet(creatorAddr, 'base', walletDeps, { decoy: false }) : Promise.resolve(null),
    mintsFrom(launch.block),
    balanceNow,
    inflowsRead,
    creatorAddr && launch.tx ? deps.transfers({ ...transferBase, fromAddress: creatorAddr, maxCount: hex(PAGE), withMetadata: true }) : Promise.resolve(null),
    clanker ? safeCall(deps, token, ORIGINAL_ADMIN) : Promise.resolve(null),
    // Its own transactions from a day before the launch to a day after it, or now, newest first: its launches are the
    // ones to a launchpad. A day after is counted at the pace since the launch, which never falls short: blocks only get faster.
    creatorAddr && launch.tx && launchSec !== null
      ? deps.transfers({
          fromAddress: creatorAddr,
          category: ['external'],
          excludeZeroValue: false,
          fromBlock: hex(Math.max(0, launch.block - DAY_BLOCKS_MAX)),
          toBlock: nowSec - launchSec > DAY_SEC ? hex(launch.block + Math.ceil((DAY_SEC * Math.max(1, head - launch.block)) / Math.max(1, nowSec - launchSec))) : 'latest',
          order: 'desc',
          maxCount: hex(LAUNCH_COUNT_PAGE),
          withMetadata: true,
        })
      : Promise.resolve(null),
    heldRead,
    weekRead,
    poolsRead,
    vestingRead,
    extensionsRead,
  ]);
  const admin = clanker ? wordAddr(adminHex ?? undefined) : null;
  launch.token_admin = admin && admin !== ZERO ? admin : null;
  // An admin the receipt did not name (no TokenCreated log): the facts still describe the sender, a launch service whose
  // own launch count would describe the service.
  const forAnother = creatorAddr !== null && launch.token_admin !== null && launch.token_admin !== creatorAddr;
  if (forAnother) {
    launch.launcher_note = `${CLANKER_NOTE} The token's admin at launch, ${launch.token_admin}, is not the wallet that sent the launch, as when a launch service such as Clanker's X bot launches for someone. The launch-wallet facts below describe the wallet that sent the launch.`;
  } else if (clanker && madeFor?.named_as === 'token_admin') {
    launch.launcher_note = `${CLANKER_NOTE} The token's admin at launch, ${madeFor.address}, is not the wallet that sent the launch, ${launch.creator}, as when a launch service such as Clanker's X bot launches for someone. The facts below describe the token's admin, not the wallet that sent the launch.`;
  }
  const launches = forAnother ? null : countLaunches(ownTxs?.transfers ?? null, launch, launcher ?? launchpad, nowSec * 1000);

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
    extensions: null,
  };
  const units = (raw: bigint) => (decimals !== null ? scaleUnits(raw, decimals) : null);
  // Clanker: what the launch put in each extension, and what is still there.
  const extensionHeld = (i: number) => (extensionBalances?.[i] ? BigInt(extensionBalances[i]) : null);
  const extensionsHeld = extensions?.reduce((sum, e, i) => sum + (creatorAddr && e.admin === creatorAddr ? (extensionHeld(i) ?? 0n) : 0n), 0n) ?? null;
  if (extensions) {
    supply.extensions = extensions.map((e, i) => {
      const held = extensionHeld(i);
      return {
        contract: e.contract,
        kind: e.kind,
        at_launch: units(e.supply),
        at_launch_pct: pctOf(e.supply, supplyRaw),
        holds: held !== null ? units(held) : null,
        holds_pct: held !== null ? pctOf(held, supplyRaw) : null,
        admin_at_launch: e.admin,
        unlocks: launchSec !== null && e.lockup !== null ? isoAt(launchSec + e.lockup) : null,
        vested: launchSec !== null && e.lockup !== null && e.vesting !== null ? isoAt(launchSec + e.lockup + e.vesting) : null,
      };
    });
  }
  const liquidity: NonNullable<TokenCheck['liquidity']> = { locked_by: lockedBy, pools: null, capped: false };
  let removalsByPool = new Map<string, number>();
  if (pools && creatorAddr) {
    const facts = await liquidityFacts(deps, pools.refs, pools.lp, creatorAddr, decimals, launchSec);
    liquidity.pools = facts.pools;
    liquidity.capped = pools.lp.capped;
    removalsByPool = facts.removals;
  }
  const creatorMintPct = mintSharePct(laterToCreator, supplyRaw, supply.minted_to_creator, token_info.total_supply);

  let creator: TokenCheck['creator'] = null;
  let sentPctAt90: number | null = null;
  if (creatorAddr && wallet) {
    const launchMs = launch.time ? new Date(launch.time).getTime() : null;
    const firstSeenMs = wallet.first_seen ? new Date(wallet.first_seen).getTime() : null;
    // First seen after the launch: its funding came by a path the transfers do not show, so its age is unknown.
    const seenAge = launchMs !== null && firstSeenMs !== null && firstSeenMs <= launchMs ? Math.floor((launchMs - firstSeenMs) / 86_400_000) : null;
    const weekBefore = week && timing.weekBefore !== null ? { block: timing.weekBefore, sent_txs: hexToNumber(week[0]), has_code: hasCode(week[1]) } : null;
    // Its own activity decides, when it was read: an airdrop can reach a wallet long before it does
    // anything, and a sponsored smart account can act without a transfer ever reaching it. The age
    // its first transfer in gives is kept only when the two agree, so the answer never states an age
    // its own activity contradicts.
    const ownNew = weekBefore ? weekBefore.sent_txs === 0 && !weekBefore.has_code : null;
    const age = ownNew === null || (seenAge !== null && (seenAge < NEW_CREATOR_DAYS) === ownNew) ? seenAge : null;
    const balance = balanceHex ? BigInt(balanceHex) : null;
    const holds_pct = balance !== null && supplyRaw > 0n ? Number((balance * 10_000n) / supplyRaw) / 100 : null;
    const vesting = vestingRaw
      ? {
          amount: units(vestingRaw.left),
          pct: pctOf(vestingRaw.left, supplyRaw),
          released: units(vestingRaw.released),
          start: isoAt(vestingRaw.start),
          cliff_end: isoAt(vestingRaw.cliff),
          end: isoAt(vestingRaw.end),
        }
      : null;
    // What it holds and what still vests to it, as one share of the supply (each alone when the other was not read).
    const holdsWithVesting = balance !== null || vestingRaw ? pctOf((balance ?? 0n) + (vestingRaw?.left ?? 0n), supplyRaw) : null;
    const lt = launchTokens(launch, launchMs, inflows?.transfers ?? [], outflows?.transfers ?? [], decimals, held, { balance: balanceHex, afterSec: launchSec !== null ? Math.round(nowSec - launchSec) : null });
    sentPctAt90 = lt?.pctAt90 ?? null;
    creator = {
      address: creatorAddr,
      role: madeFor ? 'made_for' : 'launch_wallet',
      type: wallet.type,
      sanctioned: wallet.sanctioned,
      first_seen: wallet.first_seen,
      age_days_at_launch: age,
      week_before_launch: weekBefore,
      sent_txs: wallet.sent_txs,
      first_funder: wallet.first_funder,
      holds_pct,
      vesting,
      holds_with_vesting_pct: holdsWithVesting,
      extensions_pct: extensionsHeld !== null ? pctOf(extensionsHeld, supplyRaw) : null,
      launch_tokens: lt?.result ?? null,
      clanker_launches_24h: clanker && launches ? launches.by_launchpad.clanker : null,
      launches_24h: launches,
      // The check counts Clanker launches live, so its own detector's serial_launcher labels would only repeat an older count.
      labels: wallet.labels.filter((l) => l.kind !== 'serial_launcher'),
    };
  }

  const flags: TokenFlag[] = [];
  if (imitation) flags.push('imitates_known_token');
  if (!launch.tx || !creatorAddr) flags.push('launch_unknown');
  if (creator?.sanctioned) flags.push('creator_sanctioned');
  if (wallet?.flags.includes('funded_by_sanctioned')) flags.push('creator_funded_by_sanctioned');
  // The pool the launch wallet took the largest share of its liquidity back out of, at or past the line.
  const pulled =
    liquidity.pools
      ?.filter((p) => (p.launch_wallet?.removed_pct ?? 0) >= LIQUIDITY_REMOVED_PCT)
      .sort((a, b) => b.launch_wallet!.removed_pct! - a.launch_wallet!.removed_pct!)[0] ?? null;
  if (pulled) flags.push('creator_removed_liquidity');
  if (creatorMintPct !== null && creatorMintPct >= CREATOR_MINT_HOLD_PCT) flags.push('creator_minted_after_launch');
  else if (supply.mints_after_launch > 0) flags.push('minted_after_launch');
  const lb = creator?.launch_tokens;
  // 90% gone: by its transfers within the day, by its balance an hour after the launch (which dust sends cannot hide),
  // or by its balance at this check, however long after the launch.
  if (lb && (lb.sent_90pct_after_sec !== null || goneByBalance(lb) || goneNow(lb))) flags.push('creator_sent_launch_tokens');
  // Held and still vesting to it: the share it will control.
  const share = creator?.holds_with_vesting_pct;
  if (share !== null && share !== undefined && share >= LARGE_SHARE_PCT) flags.push('creator_holds_large_share');
  // A launch made for another admin was sent by a launch service: its labels describe the service, not the token's admin.
  const forAnotherAdmin = launch.token_admin !== null && launch.token_admin !== creatorAddr;
  if (creator?.labels[0]?.strength === 'strong' && !forAnotherAdmin) flags.push('creator_labeled');
  if ((creator?.launches_24h?.total ?? 0) >= SERIAL_LAUNCHES_24H) flags.push('creator_serial_launcher');
  const wb = creator?.week_before_launch;
  const ageNew = creator?.age_days_at_launch !== null && creator?.age_days_at_launch !== undefined && creator.age_days_at_launch < NEW_CREATOR_DAYS;
  if (wb ? wb.sent_txs === 0 && !wb.has_code : ageNew) flags.push('new_creator');
  if (wallet?.flags.includes('shared_funder')) flags.push('creator_shared_funder');

  return {
    token,
    chain: 'base',
    verdict: verdictFor(flags, {
      supply,
      creator,
      creatorMintPct,
      sentPctAt90,
      imitation,
      pulled: pulled ? { pool: pulled, removals: removalsByPool.get(pulled.address) ?? 1 } : null,
      nowMs: deps.now().getTime(),
    }),
    token_info,
    imitation,
    launch,
    creator,
    supply,
    liquidity,
    flags,
    as_of_block: head,
    limits: LIMITS,
  };
}

/**
 * The wallet a launch was made for, when the launch receipt names one that is not the sender: Clanker's token admin
 * (its factory's TokenCreated log for the token), Zora's payout recipient (the coin's creation log, caller,
 * payoutRecipient and platformReferrer indexed), or the one wallet a Doppler clone token vests to (its vesting
 * allocation logs, when they name exactly one wallet).
 */
function launchMadeFor(logs: ReceiptLog[], token: string, sender: string | null): NonNullable<TokenCheck['launch']>['made_for'] {
  if (!sender) return null;
  const named = (address: string | null, as: 'token_admin' | 'payout_recipient' | 'vesting_beneficiary') =>
    address && address !== ZERO && address !== sender ? { address, named_as: as } : null;
  const created = logs.find((l) => lower(l.address) === CLANKER_V4_FACTORY.toLowerCase() && l.topics?.[0]?.toLowerCase() === TOKEN_CREATED && wordAddr(l.topics[1]) === token);
  if (created) return named(wordAddr(created.topics![2]), 'token_admin');
  const coin = logs.find((l) => lower(l.address) === ZORA_FACTORY && l.topics?.length === 4 && words(l.data).some((w) => wordAddr(w) === token));
  if (coin) return named(wordAddr(coin.topics![2]), 'payout_recipient');
  const vests = logs.filter((l) => lower(l.address) === token && l.topics?.[0]?.toLowerCase() === DOPPLER_VESTING_ALLOCATED && uint(words(l.data)[0]) > 0n);
  const beneficiaries = new Set(vests.map((l) => wordAddr(l.topics?.[1])));
  return beneficiaries.size === 1 ? named([...beneficiaries][0]!, 'vesting_beneficiary') : null;
}

/**
 * Its launches in the 24 hours with the most of them that include this one, from its own transactions to a launchpad
 * (newest first, from a day before the launch to a day after it or now) and this launch, whoever sent it. Null when
 * they were not read.
 */
function countLaunches(
  rows: TokenTransfer[] | null,
  launch: NonNullable<TokenCheck['launch']>,
  pad: Launchpad | null,
  nowMs: number,
): NonNullable<TokenCheck['creator']>['launches_24h'] {
  if (!rows || !launch.tx || !launch.time) return null;
  const at = new Date(launch.time).getTime();
  const end = Math.min(nowMs, at + DAY_SEC * 1000);
  const found = new Map<string, { ms: number; pad: Launchpad | 'other' }>();
  for (const t of rows) {
    const where = LAUNCH_CONTRACTS[lower(t.to) ?? ''];
    const ms = t.metadata?.blockTimestamp ? new Date(t.metadata.blockTimestamp).getTime() : NaN;
    if (where && ms >= at - DAY_SEC * 1000 && ms <= end) found.set(t.hash.toLowerCase(), { ms, pad: where });
  }
  // This launch, through a router, a smart wallet or a launch service too: then it is not one of the wallet's own transactions.
  if (!found.has(launch.tx)) found.set(launch.tx, { ms: at, pad: pad ?? 'other' });
  const list = [...found.values()].sort((a, b) => a.ms - b.ms);
  let best = { from: 0, to: 0 };
  for (let i = 0, j = 0; i < list.length && list[i]!.ms <= at; i++) {
    j = Math.max(j, i);
    while (j + 1 < list.length && list[j + 1]!.ms <= list[i]!.ms + DAY_SEC * 1000) j++;
    // The 24 hours from list[i] hold this launch: list[i] is at or before it and no more than a day before.
    if (list[i]!.ms >= at - DAY_SEC * 1000 && j - i > best.to - best.from) best = { from: i, to: j };
  }
  const span = list.slice(best.from, best.to + 1);
  const by_launchpad: Record<Launchpad | 'other', number> = { clanker: 0, doppler: 0, zora: 0, virtuals: 0, other: 0 };
  for (const l of span) by_launchpad[l.pad]++;
  return {
    total: span.length,
    by_launchpad,
    span_sec: Math.round((span[span.length - 1]!.ms - span[0]!.ms) / 1000),
    read_to: new Date(end).toISOString(),
    capped: rows.length >= LAUNCH_COUNT_PAGE,
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
 * The tokens the launch wallet received in the launch transaction from other wallets, or null when
 * it got none or was also minted to there (its sends could then be the minted supply: liquidity, say).
 */
function launchTokensIn(inflows: TokenTransfer[], tx: string | null, decimals: number | null): TokenTransfer[] | null {
  const inLaunch = inflows.filter((t) => t.hash.toLowerCase() === tx);
  if (!inLaunch.length || inLaunch.some((t) => t.from.toLowerCase() === ZERO) || sumAmounts(inLaunch, decimals) <= 0) return null;
  return inLaunch;
}

type LaunchTokens = NonNullable<NonNullable<TokenCheck['creator']>['launch_tokens']>;
/** At least 90% of the launch tokens gone from its balance by the read an hour after the launch. */
const goneByBalance = (lb: LaunchTokens) => lb.sent_1h_pct !== null && lb.sent_1h_pct >= SENT_LAUNCH_SHARE * 100;
/** At least 90% of the launch tokens gone from its balance at this check. */
const goneNow = (lb: LaunchTokens) => lb.sent_now_pct !== null && lb.sent_now_pct >= SENT_LAUNCH_SHARE * 100;

/**
 * What the launch wallet did with tokens it received in the launch transaction from other
 * wallets (not minted to it): how much it sent on within a day, its first send, and when 90%
 * had gone, by its first transfers; and, by its balance at the end of the launch block and an
 * hour later, how much of them it no longer held. A wallet also minted to in that transaction is
 * not judged: its sends could be that.
 */
function launchTokens(
  launch: NonNullable<TokenCheck['launch']>,
  launchMs: number | null,
  inflows: TokenTransfer[],
  outflows: TokenTransfer[],
  decimals: number | null,
  held: { atLaunch: string | null; later: string | null; afterSec: number | null } | null,
  current: { balance: string | null; afterSec: number | null },
): { result: LaunchTokens; pctAt90: number | null } | null {
  const inLaunch = launchTokensIn(inflows, launch.tx, decimals);
  if (launchMs === null || !inLaunch) return null;
  const received = sumAmounts(inLaunch, decimals);
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
  // Balances: what it got (or held at the end of the launch block, if more) against what it held an hour later.
  const atLaunch = held?.atLaunch ? BigInt(held.atLaunch) : null;
  const later = held?.later ? BigInt(held.later) : null;
  const got = rawSum(inLaunch);
  const base = got !== null && (atLaunch === null || got > atLaunch) ? got : atLaunch;
  const gone = (left: bigint | null) => (base !== null && base > 0n && left !== null ? Number(((base - (left < base ? left : base)) * 10_000n) / base) / 100 : null);
  const gonePct = gone(later);
  const now = current.balance ? BigInt(current.balance) : null;
  const units = (raw: bigint | null) => (raw !== null && decimals !== null ? scaleUnits(raw, decimals) : null);
  return {
    result: {
      received,
      // Within a day: at least what its first transfers show, and at least what its balance an hour in shows gone.
      sent_pct: Math.max(Math.min(100, Math.round((sent / received) * 100)), Math.round(gonePct ?? 0)),
      first_send_after_sec: sends.length ? sec(sends[0]!.ms) : null,
      sent_90pct_after_sec: at90 ? sec(at90.ms) : null,
      held_at_launch: units(atLaunch),
      held_1h: units(later),
      held_1h_after_sec: later !== null ? (held?.afterSec ?? null) : null,
      sent_1h_pct: gonePct,
      held_now: units(now),
      held_now_after_sec: now !== null ? current.afterSec : null,
      sent_now_pct: gone(now),
    },
    pctAt90: at90?.pct ?? null,
  };
}

const NFT_REASON = 'This contract is an ERC-721 collection (NFTs), not an ERC-20 token.';

/**
 * What the launch wallet took out of a pool: when, how much of the paired token and of what the pool held, against
 * what it put in. A paired token without a known symbol is named by its address once.
 */
function liquidityReason(pool: LiquidityPool, removals: number): string {
  const lw = pool.launch_wallet!;
  const dex = pool.dex === 'aerodrome' ? 'Aerodrome' : 'Uniswap v2';
  const share = lw.removed_pct !== null && lw.removed_pct >= 100 ? 'its liquidity' : `${amount(lw.removed_pct ?? 0)}% of its liquidity`;
  const when = lw.removed_after_sec !== null ? ` ${removals > 1 ? 'by ' : ''}${duration(Math.max(0, lw.removed_after_sec))} after the launch` : '';
  const named = (x: number | null, first: boolean) =>
    x === null ? null : pool.paired_symbol ? `${amount(x)} ${pool.paired_symbol}` : first ? `${amount(x)} of the paired token ${pool.paired_with}` : amount(x);
  const took = named(lw.removed, true);
  const put = named(lw.added, took === null);
  const ofPool = lw.pool_pct !== null ? `${amount(lw.pool_pct)}% of what the pool held` : null;
  const out = took && ofPool ? `${took}, ${ofPool}` : (took ?? ofPool);
  return `The wallet that launched it removed ${share} from the token's ${dex} pool${when}${out ? `: it took out ${out}` : ''}${put ? `, after putting in ${put}` : ''}.`;
}

/** What it holds and what still vests to it: by when it vests in full, or that it has vested and can be claimed. */
function vestingClause(heldPct: number, vestingPct: number, end: string | null, nowMs: number): string {
  const vested = end !== null && new Date(end).getTime() <= nowMs;
  const by = end !== null && !vested ? `, in full by ${end.slice(0, 10)}` : '';
  if (heldPct > 0) {
    return vested
      ? `holds ${heldPct}% of the supply and can claim another ${vestingPct}% that has vested to it`
      : `holds ${heldPct}% of the supply and will receive another ${vestingPct}% as it vests${by}`;
  }
  return vested ? `can claim ${vestingPct}% of the supply that has vested to it` : `will receive ${vestingPct}% of the supply as it vests${by}`;
}

function imitationVerdict(imitation: Imitation): TokenCheck['verdict'] {
  return imitation.real
    ? { label: 'hold', reason: `It passes itself off as ${imitation.imitates}, but it is not: the real ${imitation.imitates} on Base is ${imitation.real}.` }
    : { label: 'hold', reason: `Its name or symbol spells ${imitation.imitates} with look-alike or hidden characters, a sign it is posing as ${imitation.imitates}.` };
}
const REASONS = {
  not_a_contract: () => 'There is no contract at this address on Base, so it is not a token.',
  not_a_token: () => 'This contract does not answer totalSupply(), so it is not an ERC-20 token.',
};

function verdictFor(
  flags: TokenFlag[],
  ctx: {
    supply: TokenCheck['supply'];
    creator: TokenCheck['creator'];
    creatorMintPct: number | null;
    sentPctAt90: number | null;
    imitation: Imitation | null;
    /** The pool the launch wallet removed the largest share of its liquidity from, and in how many removals. */
    pulled: { pool: LiquidityPool; removals: number } | null;
    nowMs: number;
  },
): TokenCheck['verdict'] {
  const { supply, creator, imitation } = ctx;
  const atLeast = supply.capped ? 'at least ' : '';
  // The wallet the facts describe: the one that sent the launch, or the one a launch service launched it for.
  const who = creator?.role === 'made_for' ? 'The wallet it was launched for' : 'The wallet that launched it';
  if (flags.includes('creator_sanctioned')) return { label: 'hold', reason: `${who} is on the US Treasury OFAC SDN list.` };
  if (flags.includes('creator_funded_by_sanctioned')) {
    return { label: 'hold', reason: `${who} got its first funds from an address on the OFAC SDN list.` };
  }
  // Whoever launched it, a token passing for USDC is not USDC: holding or paying with it is the trap.
  if (flags.includes('imitates_known_token') && imitation) return imitationVerdict(imitation);
  if (flags.includes('creator_removed_liquidity') && ctx.pulled) return { label: 'hold', reason: liquidityReason(ctx.pulled.pool, ctx.pulled.removals) };
  if (flags.includes('creator_minted_after_launch') && supply.minted_to_creator !== null && ctx.creatorMintPct !== null) {
    return {
      label: 'hold',
      reason: `After the first issuance, ${atLeast}${amount(supply.minted_to_creator)} more tokens were minted to ${who.charAt(0).toLowerCase()}${who.slice(1)} in ${atLeast}${plural(supply.to_creator, 'mint')}, ${amount(ctx.creatorMintPct)}% of the supply today.`,
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
  if (flags.includes('creator_sent_launch_tokens') && lb) {
    const got = `${who} received ${amount(lb.received)} tokens in the launch transaction and`;
    const at90 = lb.sent_90pct_after_sec;
    // Within the hour first, by its transfers, then by its balance an hour in (its first transfers did not reach 90%, as
    // when many small sends come first); then later, by its transfers within the day, then by its balance at this check.
    if (at90 !== null && at90 <= SENT_WITHIN_SEC && ctx.sentPctAt90 !== null) {
      return { label: 'review', reason: `${got} had sent out ${ctx.sentPctAt90}% of them ${duration(at90)} later.` };
    }
    if (goneByBalance(lb)) {
      const when = lb.held_1h_after_sec !== null && lb.held_1h_after_sec < SENT_WITHIN_SEC - 60 ? `${duration(lb.held_1h_after_sec)} later` : 'an hour later';
      return { label: 'review', reason: `${got} ${when} held ${keptClause(lb.sent_1h_pct!)}.` };
    }
    if (at90 !== null && ctx.sentPctAt90 !== null) {
      return { label: 'review', reason: `${got} had sent out ${ctx.sentPctAt90}% of them ${duration(at90)} later.` };
    }
    if (goneNow(lb) && lb.held_now_after_sec !== null) {
      return { label: 'review', reason: `${got} ${duration(Math.max(0, lb.held_now_after_sec))} after the launch held ${keptClause(lb.sent_now_pct!)}.` };
    }
  }
  const vestingPct = creator?.vesting?.pct ?? 0;
  if (flags.includes('creator_holds_large_share') && creator && vestingPct > 0) {
    return { label: 'review', reason: `${who} ${vestingClause(creator.holds_pct ?? 0, vestingPct, creator.vesting!.end, ctx.nowMs)}.` };
  }
  if (flags.includes('creator_holds_large_share') && creator?.holds_pct !== null && creator?.holds_pct !== undefined) {
    return { label: 'review', reason: `${who} still holds ${creator.holds_pct}% of the supply.` };
  }
  if (flags.includes('creator_labeled') && creator?.labels[0]) {
    return { label: 'review', reason: `${who} is labeled in our investigations: ${creator.labels[0].sentence}` };
  }
  if (flags.includes('creator_serial_launcher') && creator?.launches_24h) {
    const c = creator.launches_24h;
    const n = `${c.capped ? 'at least ' : ''}${c.total.toLocaleString('en-US')}`;
    const where = LAUNCHPAD_NAMES.filter(([k]) => c.by_launchpad[k] > 0).map(([k, name]) => `${c.by_launchpad[k].toLocaleString('en-US')} through ${name}`);
    if (c.by_launchpad.other > 0) where.push(`${c.by_launchpad.other} outside these launchpads`);
    const within = `within ${duration(Math.max(1, c.span_sec))}`;
    const list = where.length > 1 ? `${where.slice(0, -1).join(', ')} and ${where[where.length - 1]}` : where.join('');
    // Launched for it: this launch counts as one of its launches, though a launch service sent it.
    return {
      label: 'review',
      reason: creator.role === 'made_for' ? `${who} has ${n} launches ${within}, this one included: ${list}.` : `${who} launched ${n} tokens ${within}, this one included: ${list}.`,
    };
  }
  if (flags.includes('new_creator') && creator?.age_days_at_launch !== null && creator?.age_days_at_launch !== undefined) {
    const d = creator.age_days_at_launch;
    return { label: 'review', reason: `${who} was first seen ${d === 0 ? 'less than a day' : plural(d, 'day')} before the launch.` };
  }
  if (flags.includes('new_creator')) {
    return { label: 'review', reason: `${who} had not sent a single transaction a week before the launch, so its own activity is less than 7 days old.` };
  }
  if (flags.includes('creator_shared_funder')) {
    const recent = creator?.first_funder?.recent_recipients;
    if (recent) {
      return { label: 'review', reason: `${who} was first funded by a busy wallet that is not a known exchange, and ${freshWallets(recent)} it most recently sent funds to had never been used before.` };
    }
    const n = creator?.first_funder?.funded_wallets ?? 0;
    return { label: 'review', reason: `${who} was first funded by a wallet that funded at least ${n} wallets and is not an exchange.` };
  }
  if (flags.includes('launch_unknown')) {
    return { label: 'review', reason: 'The launch transaction could not be traced to one wallet, so the launch wallet was not checked.' };
  }
  return {
    label: 'no_flags',
    reason: "None of the checks matched: sanctions, mints after the first issuance, and the launch wallet's age, funder, holdings and send-outs after launch.",
  };
}

/** What it still held of the launch tokens: only a share of them, or none. */
function keptClause(sentPct: number): string {
  const kept = Math.round((100 - sentPct) * 100) / 100;
  return kept > 0 ? `only ${amount(kept)}% of them` : 'none of them';
}

/** Deps that read Base through an Alchemy URL. */
export function alchemyTokenCheckDeps(rpcUrl: string): TokenCheckDeps {
  return {
    ...alchemyWalletLookupDeps(rpcUrl),
    transfers: (params) => alchemyAssetTransfers(rpcUrl, params) as Promise<{ transfers: TokenTransfer[] }>,
  };
}
