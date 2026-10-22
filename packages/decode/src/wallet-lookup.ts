// ─── Fast wallet lookup ───────────────────────────────────────────────────────
//
// Facts about one address in about a second, for anyone about to pay, onboard or
// airdrop to it: sanctions, wallet or contract, age, activity, balances and its
// first funder, with a verdict. Two rounds of parallel reads (the wallet, then
// its first funder), no tracing. The slow, thorough check is the risk report.
// Never says "safe": no_flags means none of these checks matched.

import { alchemyAssetTransfers, type SellerChain } from './seller-demand.js';
import { isSanctioned } from './ofac.js';
import { PRIVACY_RELAY_REASON, privacyRelay } from './privacy-relays.js';
import { publicLabels, type LabelKind, type LabelsFor } from './labels.js';
import { decoyReason, detectDecoy, type Decoy } from './decoy.js';
import { nativeToken, realToken } from './lookalike.js';


export type LookupChain = SellerChain;
/**
 * privacy_relay: a known px402 reserve or relayer (privacy-relays.ts); whoever it pays for is not on chain.
 * poisoning_decoy: a look-alike an address-poisoning bot planted in another wallet's history (decoy.ts).
 * decoy_unchecked: a never-used wallet whose decoy reads failed or timed out.
 */
export type LookupFlag =
  | 'sanctioned'
  | 'funded_by_sanctioned'
  | 'poisoning_decoy'
  | 'decoy_unchecked'
  | 'privacy_relay'
  | 'labeled'
  | 'no_history'
  | 'new_wallet'
  | 'shared_funder'
  | 'contract';

export interface WalletLookup {
  address: string;
  chain: LookupChain;
  verdict: { label: 'hold' | 'review' | 'no_flags'; reason: string };
  sanctioned: boolean;
  type: 'wallet' | 'contract';
  first_seen: string | null;
  age_days: number | null;
  last_active: string | null;
  sent_txs: number;
  balances: { native: number; usdc: number };
  first_funder: {
    address: string;
    tx: string;
    sanctioned: boolean;
    /** ChainWard's labels name it an exchange or other known service (a public `service` label). Nothing else makes it one. */
    exchange_or_hub: boolean;
    /** 10,000 or more sent transactions, or 1,000 or more transfers out in the latest read: too busy to read each recipient. */
    busy: boolean;
    /**
     * Wallets (no contract code) among the first 20 distinct recipients of the
     * funder's latest 1,000 outgoing transfers: a floor. For a busy funder, the
     * brand-new ones (recent_recipients.fresh). null for a known exchange or
     * service, or when its recipients were not read.
     */
    funded_wallets: number | null;
    /**
     * A busy funder that is not a known exchange (Base): of the first 20 distinct wallets it sent funds to in its
     * latest transfers out (`checked`), how many had no ETH, no transactions and no code at `before_block`, the
     * block before the earliest of those sends (`fresh`). Null when not read.
     */
    recent_recipients: RecentRecipients | null;
  } | null;
  /** When it looks like an address-poisoning decoy: the real address it copies and the transfers that show it. */
  decoy: Decoy | null;
  /** Its public labels from ChainWard's investigations and detectors, strongest first. */
  labels: Array<{ kind: LabelKind; strength: 'strong' | 'weak'; sentence: string; source_url: string | null }>;
  flags: LookupFlag[];
  as_of_block: number;
  limits: string;
}

export interface RecentRecipients {
  checked: number;
  fresh: number;
  before_block: number;
}

interface Transfer {
  from: string;
  to: string | null;
  hash: string;
  blockNum?: string;
  category?: string;
  value?: number | null;
  rawContract?: { address?: string | null; value?: string | null };
  metadata?: { blockTimestamp?: string };
}

export interface WalletLookupDeps {
  rpc(method: string, params: unknown[]): Promise<unknown>;
  transfers(params: Record<string, unknown>): Promise<{ transfers: Transfer[] }>;
  now(): Date;
  /** ChainWard's labels for an address (the API's label book); none when absent. */
  labelsFor?: LabelsFor;
}

/** Under this age a wallet is new: farm wallets are made the week of the payout. */
export const NEW_WALLET_DAYS = 7;
/** A funder that funded this many wallets, and is not an exchange or hub, is worth a look. */
export const SHARED_FUNDER_MIN = 5;
/** Sent transactions at which a funder is busy: too busy to read each of its recipients. */
export const LOOKUP_HUB_NONCE = 10_000;
/** A busy funder is a shared funder when at least this share of its recent recipients, and SHARED_FUNDER_MIN of them, were brand new. */
export const BUSY_FRESH_SHARE = 0.75;
const FUNDER_PAGE = 1000;
/** Its first transfers in, oldest first, searched for the first one that funded it. */
const FIRST_IN_PAGE = 50;
const FUNDER_CODE_CHECKS = 20;
const FUNDER_CODE_BATCH = 5;
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;
/** The decoy reads get this long inside the lookup's budget; past it the lookup says it could not check. */
const DECOY_TIMEOUT_MS = 6_000;
const DECOY_LIMITS = ' A decoy finding is read from transfer history. Anyone can send transfers to an unused address, so confirm the full address with whoever gave it to you.';
const DECOY_UNCHECKED = "Couldn't check whether this never-used address is a planted look-alike. Confirm the full address with whoever gave it to you.";

const USDC: Record<LookupChain, { address: string; decimals: number }> = {
  base: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  bsc: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
};

const hexToNumber = (h: unknown) => (typeof h === 'string' && h.startsWith('0x') ? Number(BigInt(h)) : 0);
/** No code, or EIP-7702's 0xef0100 + delegate: an EOA, which can delegate to a contract and still be a wallet. */
const isWalletCode = (c: unknown) => c === '0x' || c === null || c === undefined || (typeof c === 'string' && /^0xef0100[0-9a-f]{40}$/i.test(c));
const scaled = (h: unknown, decimals: number) => (typeof h === 'string' && h.startsWith('0x') && h !== '0x' ? Number(BigInt(h)) / 10 ** decimals : 0);
const balanceOfData = (addr: string) => `0x70a08231${addr.slice(2).toLowerCase().padStart(64, '0')}`;
/**
 * Init code for a deployless eth_call (no `to`): for each 32-byte address appended to it, EXTCODEHASH, one word each.
 * EXTCODEHASH is 0 for an account with no ETH, no transactions and no code, so one call at a past block tells which
 * addresses had never been used by then. Program: off = 43; while off < codesize { mem[32 + off - 43] =
 * extcodehash(code[off:off+32]); off += 32 }; return mem[32 : 32 + codesize - 43].
 */
const EXTCODEHASH_PROGRAM = '0x602b5b388110156023576020816000396000513f81602b9003602001526020016002565b602b90036020f3';

/** decoy: false skips the address-poisoning reads, for a caller that is not about to pay the address (the rug check). */
export async function lookupWallet(rawAddress: string, chain: LookupChain, deps: WalletLookupDeps, opts: { decoy?: boolean } = {}): Promise<WalletLookup> {
  const address = rawAddress.toLowerCase();
  const now = deps.now();
  // Bridge fills, disperse contracts and smart wallets move ETH by internal call. Alchemy
  // indexes those on Base; on BNB Chain it refuses the category, so it is not asked there.
  const category = chain === 'base' ? ['external', 'internal', 'erc20'] : ['external', 'erc20'];
  const transferBase = { category, excludeZeroValue: true, withMetadata: true };

  const [code, nonceHex, balanceHex, usdcHex, blockHex, firstIn, lastOut] = await Promise.all([
    deps.rpc('eth_getCode', [address, 'latest']),
    deps.rpc('eth_getTransactionCount', [address, 'latest']),
    deps.rpc('eth_getBalance', [address, 'latest']),
    deps.rpc('eth_call', [{ to: USDC[chain].address, data: balanceOfData(address) }, 'latest']),
    deps.rpc('eth_blockNumber', []),
    deps.transfers({ ...transferBase, toAddress: address, order: 'asc', maxCount: `0x${FIRST_IN_PAGE.toString(16)}` }),
    deps.transfers({ ...transferBase, fromAddress: address, order: 'desc', maxCount: '0x1' }),
  ]);

  const first = firstIn.transfers[0] ?? null;
  const funding = firstIn.transfers.find((t) => funds(t, chain)) ?? null;
  const sentTxs = hexToNumber(nonceHex);
  const firstSeen = first?.metadata?.blockTimestamp ?? null;
  const ageDays = firstSeen ? Math.floor((now.getTime() - new Date(firstSeen).getTime()) / 86_400_000) : null;
  const isWallet = isWalletCode(code);
  const native = scaled(balanceHex, 18);
  const usdc = scaled(usdcHex, USDC[chain].decimals);

  // Only a wallet that never sent a transaction can be a planted look-alike; its first
  // "transfer in" is then a fake, so there is no funder to trace. Base only for now. A failed
  // or slow read does not fail the lookup: it says it could not check.
  let decoy: Decoy | null = null;
  let decoyUnchecked = false;
  if (chain === 'base' && sentTxs === 0 && isWallet && opts.decoy !== false) {
    try {
      decoy = await withTimeout(detectDecoy(address, chain, deps, { sentTxs, isWallet, native, usdc }), DECOY_TIMEOUT_MS);
    } catch {
      decoyUnchecked = true;
    }
  }

  let funder: WalletLookup['first_funder'] = null;
  // A mint (USDC bridged in by CCTP, say) comes from the zero address, and an OptimismPortal
  // deposit lists as a transfer from the wallet to itself (bridged from L1): no funder to trace.
  if (!decoy && funding && funding.from.toLowerCase() !== ZERO_ADDRESS && funding.from.toLowerCase() !== address) {
    const f = funding.from.toLowerCase();
    const [fNonce, fOut, fLabels] = await Promise.all([
      deps.rpc('eth_getTransactionCount', [f, 'latest']),
      deps.transfers({ ...transferBase, fromAddress: f, order: 'desc', maxCount: `0x${FUNDER_PAGE.toString(16)}` }),
      Promise.resolve(deps.labelsFor?.(f, chain) ?? []),
    ]);
    // Only ChainWard's labels make a funder an exchange: a busy wallet is not one by being busy (launch mills fund from busy wallets too).
    const service = publicLabels(fLabels).some((l) => l.kind === 'service');
    const busy = hexToNumber(fNonce) >= LOOKUP_HUB_NONCE || fOut.transfers.length >= FUNDER_PAGE;
    // A busy funder's recipients are judged in one read, on Base; on BNB Chain they are not read.
    const recent = !service && busy && chain === 'base' ? await freshRecipients(fOut.transfers, f, deps) : null;
    funder = {
      address: f,
      tx: funding.hash,
      sanctioned: isSanctioned(f),
      exchange_or_hub: service,
      busy,
      funded_wallets: service || (busy && !recent) ? null : busy ? recent!.fresh : await countFundedWallets(fOut.transfers, f, deps),
      recent_recipients: recent,
    };
  }

  const sanctioned = isSanctioned(address);
  const type = isWallet ? 'wallet' : 'contract';
  const flags: LookupFlag[] = [];
  if (sanctioned) flags.push('sanctioned');
  if (funder?.sanctioned) flags.push('funded_by_sanctioned');
  if (decoy) flags.push('poisoning_decoy');
  if (decoyUnchecked) flags.push('decoy_unchecked');
  if (privacyRelay(address, chain)) flags.push('privacy_relay');
  const labels = publicLabels((await deps.labelsFor?.(address, chain)) ?? []);
  if (labels[0]?.strength === 'strong') flags.push('labeled');
  if (!first && sentTxs === 0) flags.push('no_history');
  if (ageDays !== null && ageDays < NEW_WALLET_DAYS) flags.push('new_wallet');
  if (funder && sharedFunder(funder)) flags.push('shared_funder');
  if (type === 'contract') flags.push('contract');

  return {
    address,
    chain,
    verdict: verdictFor(flags, { ageDays, funder, label: labels[0]?.sentence ?? null, decoy }),
    sanctioned,
    type,
    first_seen: firstSeen,
    age_days: ageDays,
    last_active: lastOut.transfers[0]?.metadata?.blockTimestamp ?? null,
    sent_txs: sentTxs,
    balances: { native, usdc },
    first_funder: funder,
    decoy,
    labels: labels.map((l) => ({ kind: l.kind, strength: l.strength, sentence: l.sentence, source_url: l.source_url })),
    flags,
    as_of_block: hexToNumber(blockHex),
    limits:
      "On-chain facts only. A shared funder is not proof of one owner, and exchanges and other hubs hide who funded a wallet. A funder counts as an exchange only when ChainWard's labels name it one. A busy funder (10,000 or more transactions, or 1,000 or more recent transfers out) without such a label is read once, on Base: how many of the 20 wallets it most recently sent funds to had no ETH, transactions or code before the earliest of those sends. no_flags means none of these checks matched; it is not a clearance." +
      (decoy ? DECOY_LIMITS : ''),
  };
}

/**
 * A transfer that funded the wallet: the chain's coin (ETH, BNB) or a listed token (USDC, WETH...)
 * above its dust floor. Airdrops of other tokens and dust fund nothing, so their sender is not its
 * first funder. A transfer the provider did not describe (no category) still counts.
 */
function funds(t: Transfer, chain: LookupChain): boolean {
  if (!t.category) return true;
  const value = typeof t.value === 'number' ? t.value : null;
  if (t.category === 'external' || t.category === 'internal') return value === null || value > nativeToken(chain).dust;
  if (t.category !== 'erc20') return false;
  const listed = realToken(t.rawContract?.address, chain);
  return listed !== null && (value === null || value > listed.dust);
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * A funder that funded wallets together: an ordinary one that funded SHARED_FUNDER_MIN wallets, or a busy one whose recent
 * recipients were mostly brand new (BUSY_FRESH_SHARE, and SHARED_FUNDER_MIN of them). Never a known exchange or service.
 */
export function sharedFunder(funder: NonNullable<WalletLookup['first_funder']>): boolean {
  if (funder.exchange_or_hub) return false;
  const recent = funder.recent_recipients;
  if (recent) return recent.fresh >= SHARED_FUNDER_MIN && recent.fresh >= recent.checked * BUSY_FRESH_SHARE;
  return !funder.busy && (funder.funded_wallets ?? 0) >= SHARED_FUNDER_MIN;
}

/** How many of a busy funder's recent recipients were brand new, in words: "all 13 wallets", "15 of the 20 wallets". */
export function freshWallets(recent: RecentRecipients): string {
  return recent.fresh === recent.checked ? `all ${recent.checked} wallets` : `${recent.fresh} of the ${recent.checked} wallets`;
}

/** The plain words for a shared funder: how many wallets it funded, or how many of a busy funder's recent recipients were brand new. */
export function sharedFunderClause(funder: NonNullable<WalletLookup['first_funder']>): string {
  const recent = funder.recent_recipients;
  if (!recent) return `has funded at least ${funder.funded_wallets ?? 0} wallets and is not an exchange`;
  return `is a busy wallet that is not a known exchange, and ${freshWallets(recent)} it most recently sent funds to had never been used before`;
}

/**
 * A busy funder's first FUNDER_CODE_CHECKS distinct recipients (most recent first): how many were brand new, with no
 * ETH, no transactions and no code at the block before the earliest send among those read. One deployless eth_call at
 * that block. Null when there are no recipients, or the transfers carry no block numbers.
 */
async function freshRecipients(transfers: Transfer[], funder: string, deps: WalletLookupDeps): Promise<RecentRecipients | null> {
  const recipients: string[] = [];
  let earliest: number | null = null;
  for (const t of transfers) {
    const to = t.to?.toLowerCase();
    if (!to || to === funder || to === ZERO_ADDRESS) continue;
    if (!recipients.includes(to)) {
      if (recipients.length === FUNDER_CODE_CHECKS) break;
      recipients.push(to);
    }
    const block = hexToNumber(t.blockNum);
    if (!block) return null;
    earliest = earliest === null ? block : Math.min(earliest, block);
  }
  if (!recipients.length || earliest === null || earliest < 1) return null;
  const before = earliest - 1;
  const data = EXTCODEHASH_PROGRAM + recipients.map((r) => r.slice(2).padStart(64, '0')).join('');
  const answer = await deps.rpc('eth_call', [{ data }, `0x${before.toString(16)}`]);
  const words = typeof answer === 'string' ? (answer.slice(2).match(/.{64}/g) ?? []) : [];
  if (words.length !== recipients.length) return null;
  return { checked: recipients.length, fresh: words.filter((w) => /^0+$/.test(w)).length, before_block: before };
}

/**
 * Of the funder's distinct recipients (most recent first), how many are wallets:
 * no contract code. Routers and pools an active trader pays are not wallets it
 * funded. At most FUNDER_CODE_CHECKS reads, FUNDER_CODE_BATCH at a time, so a
 * count at the cap is a floor.
 */
async function countFundedWallets(transfers: Transfer[], funder: string, deps: WalletLookupDeps): Promise<number> {
  const recipients = [...new Set(transfers.map((t) => t.to?.toLowerCase()).filter((t): t is string => !!t && t !== funder && t !== ZERO_ADDRESS))].slice(
    0,
    FUNDER_CODE_CHECKS,
  );
  let wallets = 0;
  for (let i = 0; i < recipients.length; i += FUNDER_CODE_BATCH) {
    const codes = await Promise.all(recipients.slice(i, i + FUNDER_CODE_BATCH).map((r) => deps.rpc('eth_getCode', [r, 'latest'])));
    wallets += codes.filter(isWalletCode).length;
  }
  return wallets;
}

function verdictFor(
  flags: LookupFlag[],
  ctx: { ageDays: number | null; funder: WalletLookup['first_funder']; label: string | null; decoy: Decoy | null },
): WalletLookup['verdict'] {
  if (flags.includes('sanctioned')) return { label: 'hold', reason: 'This address is on the US Treasury OFAC SDN list.' };
  if (flags.includes('funded_by_sanctioned')) return { label: 'hold', reason: 'Its first funds came from an address on the OFAC SDN list.' };
  if (flags.includes('poisoning_decoy') && ctx.decoy) return { label: 'hold', reason: decoyReason(ctx.decoy) };
  // Below sanctions, above everything else: the relay's own age and funder say nothing about the payer behind it.
  if (flags.includes('privacy_relay')) return { label: 'review', reason: PRIVACY_RELAY_REASON };
  if (flags.includes('labeled') && ctx.label) return { label: 'review', reason: ctx.label };
  if (flags.includes('decoy_unchecked')) return { label: 'review', reason: DECOY_UNCHECKED };
  if (flags.includes('no_history')) return { label: 'review', reason: 'No transfers or transactions on this chain yet.' };
  if (flags.includes('new_wallet')) {
    const d = ctx.ageDays ?? 0;
    return { label: 'review', reason: `First seen ${d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`}.` };
  }
  if (flags.includes('shared_funder')) {
    return { label: 'review', reason: `Its first funder ${sharedFunderClause(ctx.funder!)}.` };
  }
  return { label: 'no_flags', reason: 'None of the checks matched: sanctions, age, history and first funder.' };
}

/** Deps that read Base or BNB Chain through an Alchemy URL. */
export function alchemyWalletLookupDeps(rpcUrl: string): WalletLookupDeps {
  return {
    now: () => new Date(),
    async rpc(method, params) {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (body.error) throw new Error(`${method}: ${body.error.message}`);
      return body.result;
    },
    transfers: (params) => alchemyAssetTransfers(rpcUrl, params) as Promise<{ transfers: Transfer[] }>,
  };
}
