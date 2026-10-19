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


export type LookupChain = SellerChain;
/** privacy_relay: a known px402 reserve or relayer (privacy-relays.ts); whoever it pays for is not on chain. */
export type LookupFlag = 'sanctioned' | 'funded_by_sanctioned' | 'privacy_relay' | 'no_history' | 'new_wallet' | 'shared_funder' | 'contract';

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
    exchange_or_hub: boolean;
    /**
     * Wallets (no contract code) among the first 20 distinct recipients of the
     * funder's latest 1,000 outgoing transfers: a floor. null for an exchange or hub.
     */
    funded_wallets: number | null;
  } | null;
  flags: LookupFlag[];
  as_of_block: number;
  limits: string;
}

interface Transfer {
  from: string;
  to: string | null;
  hash: string;
  metadata?: { blockTimestamp?: string };
}

export interface WalletLookupDeps {
  rpc(method: string, params: unknown[]): Promise<unknown>;
  transfers(params: Record<string, unknown>): Promise<{ transfers: Transfer[] }>;
  now(): Date;
}

/** Under this age a wallet is new: farm wallets are made the week of the payout. */
export const NEW_WALLET_DAYS = 7;
/** A funder that funded this many wallets, and is not an exchange or hub, is worth a look. */
export const SHARED_FUNDER_MIN = 5;
/** Sent transactions at which a funder counts as an exchange, bridge or other hub. */
export const LOOKUP_HUB_NONCE = 10_000;
const FUNDER_PAGE = 1000;
const FUNDER_CODE_CHECKS = 20;
const FUNDER_CODE_BATCH = 5;
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;

const USDC: Record<LookupChain, { address: string; decimals: number }> = {
  base: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  bsc: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
};

const hexToNumber = (h: unknown) => (typeof h === 'string' && h.startsWith('0x') ? Number(BigInt(h)) : 0);
const scaled = (h: unknown, decimals: number) => (typeof h === 'string' && h.startsWith('0x') && h !== '0x' ? Number(BigInt(h)) / 10 ** decimals : 0);
const balanceOfData = (addr: string) => `0x70a08231${addr.slice(2).toLowerCase().padStart(64, '0')}`;

export async function lookupWallet(rawAddress: string, chain: LookupChain, deps: WalletLookupDeps): Promise<WalletLookup> {
  const address = rawAddress.toLowerCase();
  const now = deps.now();
  const transferBase = { category: ['external', 'erc20'], excludeZeroValue: true, withMetadata: true };

  const [code, nonceHex, balanceHex, usdcHex, blockHex, firstIn, lastOut] = await Promise.all([
    deps.rpc('eth_getCode', [address, 'latest']),
    deps.rpc('eth_getTransactionCount', [address, 'latest']),
    deps.rpc('eth_getBalance', [address, 'latest']),
    deps.rpc('eth_call', [{ to: USDC[chain].address, data: balanceOfData(address) }, 'latest']),
    deps.rpc('eth_blockNumber', []),
    deps.transfers({ ...transferBase, toAddress: address, order: 'asc', maxCount: '0x1' }),
    deps.transfers({ ...transferBase, fromAddress: address, order: 'desc', maxCount: '0x1' }),
  ]);

  const first = firstIn.transfers[0] ?? null;
  const sentTxs = hexToNumber(nonceHex);
  const firstSeen = first?.metadata?.blockTimestamp ?? null;
  const ageDays = firstSeen ? Math.floor((now.getTime() - new Date(firstSeen).getTime()) / 86_400_000) : null;

  let funder: WalletLookup['first_funder'] = null;
  // A mint (USDC bridged in by CCTP, say) comes from the zero address: no funder to trace.
  if (first && first.from.toLowerCase() !== ZERO_ADDRESS) {
    const f = first.from.toLowerCase();
    const [fNonce, fOut] = await Promise.all([
      deps.rpc('eth_getTransactionCount', [f, 'latest']),
      deps.transfers({ ...transferBase, fromAddress: f, order: 'desc', maxCount: `0x${FUNDER_PAGE.toString(16)}` }),
    ]);
    const hub = hexToNumber(fNonce) >= LOOKUP_HUB_NONCE || fOut.transfers.length >= FUNDER_PAGE;
    funder = {
      address: f,
      tx: first.hash,
      sanctioned: isSanctioned(f),
      exchange_or_hub: hub,
      funded_wallets: hub ? null : await countFundedWallets(fOut.transfers, f, deps),
    };
  }

  const sanctioned = isSanctioned(address);
  const type = typeof code === 'string' && code !== '0x' ? 'contract' : 'wallet';
  const flags: LookupFlag[] = [];
  if (sanctioned) flags.push('sanctioned');
  if (funder?.sanctioned) flags.push('funded_by_sanctioned');
  if (privacyRelay(address, chain)) flags.push('privacy_relay');
  if (!first && sentTxs === 0) flags.push('no_history');
  if (ageDays !== null && ageDays < NEW_WALLET_DAYS) flags.push('new_wallet');
  if (funder && !funder.exchange_or_hub && (funder.funded_wallets ?? 0) >= SHARED_FUNDER_MIN) flags.push('shared_funder');
  if (type === 'contract') flags.push('contract');

  return {
    address,
    chain,
    verdict: verdictFor(flags, { ageDays, funder }),
    sanctioned,
    type,
    first_seen: firstSeen,
    age_days: ageDays,
    last_active: lastOut.transfers[0]?.metadata?.blockTimestamp ?? null,
    sent_txs: sentTxs,
    balances: { native: scaled(balanceHex, 18), usdc: scaled(usdcHex, USDC[chain].decimals) },
    first_funder: funder,
    flags,
    as_of_block: hexToNumber(blockHex),
    limits:
      'On-chain facts only. A shared funder is not proof of one owner, and exchanges and other hubs hide who funded a wallet. no_flags means none of these checks matched; it is not a clearance.',
  };
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
    wallets += codes.filter((c) => c === '0x' || c === null || c === undefined).length;
  }
  return wallets;
}

function verdictFor(
  flags: LookupFlag[],
  ctx: { ageDays: number | null; funder: WalletLookup['first_funder'] },
): WalletLookup['verdict'] {
  if (flags.includes('sanctioned')) return { label: 'hold', reason: 'This address is on the US Treasury OFAC SDN list.' };
  if (flags.includes('funded_by_sanctioned')) return { label: 'hold', reason: 'Its first funds came from an address on the OFAC SDN list.' };
  // Below sanctions, above everything else: the relay's own age and funder say nothing about the payer behind it.
  if (flags.includes('privacy_relay')) return { label: 'review', reason: PRIVACY_RELAY_REASON };
  if (flags.includes('no_history')) return { label: 'review', reason: 'No transfers or transactions on this chain yet.' };
  if (flags.includes('new_wallet')) {
    const d = ctx.ageDays ?? 0;
    return { label: 'review', reason: `First seen ${d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`}.` };
  }
  if (flags.includes('shared_funder')) {
    return { label: 'review', reason: `Its first funder has funded at least ${ctx.funder!.funded_wallets} wallets and is not an exchange.` };
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
