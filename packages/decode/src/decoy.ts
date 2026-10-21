// ─── Address-poisoning decoys ─────────────────────────────────────────────────
//
// A poisoning bot watches real payments (A pays B) and minutes later plants
// look-alikes: an address sharing B's first and last characters "receives" a fake
// token from A, and one sharing A's "sends" a fake to B, so each turns up in the
// other's history. Whoever copies the look-alike from that history pays the bot.
// A decoy is such a look-alike: it never sent a transaction, holds no more than dust,
// every transfer of a listed token it shows is an imitation, zero-value or dust, and
// the wallet its fakes name really paid (or was paid by) an address sharing its ends
// in the hours before. That match is the evidence; without it nothing is flagged.
//
// The matched address is evidence, never a recommendation: a wallet that already paid
// one decoy has a decoy among its payees, so when several match none is named, and no
// verdict text ever points at an address to pay.

import { imitatedToken, realToken, sharesEnds, type Imitation } from './lookalike.js';
import type { SellerChain } from './seller-demand.js';

/** An Alchemy alchemy_getAssetTransfers row, as much of it as this reads. */
export interface DecoyTransfer {
  from: string;
  to: string | null;
  hash: string;
  value?: number | null;
  asset?: string | null;
  category?: string;
  blockNum?: string;
  rawContract?: { address?: string | null; value?: string | null };
  metadata?: { blockTimestamp?: string };
}

export interface DecoyDeps {
  rpc(method: string, params: unknown[]): Promise<unknown>;
  transfers(params: Record<string, unknown>): Promise<{ transfers: DecoyTransfer[] }>;
}

export interface Decoy {
  /** payee: matches an address the counterparty paid; payer: matches an address that paid it. */
  role: 'payee' | 'payer';
  /**
   * The one address in the counterparty's real transfers sharing its first and last 4
   * characters; null when several do. Evidence for the finding, not the address to pay.
   */
  copies: string | null;
  /** Distinct addresses in those transfers sharing its ends. */
  candidates: number;
  /** The wallet whose history the fakes planted it in. */
  counterparty: string;
  /** The listed token of the real payment (USDC), from our list, never from transfer data. */
  token: string;
  /** The real payment it matches; null when several match. */
  echoes_tx: string | null;
  echoes_at: string | null;
  /** One fake transfer that put it in the counterparty's history. */
  fake_tx: string;
  /** The imitation tokens involved; empty when the plant was a zero-value or dust transfer of the real token. */
  fake_tokens: Array<{ contract: string; symbol: string; imitates: string }>;
}

/** State the caller already read (the wallet lookup has it), so it is not read twice. */
export interface DecoyState {
  sentTxs: number;
  isWallet: boolean;
  native: number;
  usdc: number;
}

const USDC: Record<SellerChain, string> = {
  base: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  bsc: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
};
const USDC_DECIMALS: Record<SellerChain, number> = { base: 6, bsc: 18 };
/** At or below these a wallet holds nothing: look-alike chains pass along gas dust. */
const NATIVE_DUST: Record<SellerChain, number> = { base: 0.0001, bsc: 0.0005 };
const USDC_DUST = 0.01;
/** Token transfers read on each side of the address. */
const TOUCH_PAGE = 25;
/** The counterparty's real transfers of the copied token searched for the original, and how many counterparties. */
const COUNTERPARTY_PAGE = 100;
const MAX_COUNTERPARTIES = 3;
/**
 * Echoes land minutes after the payment (median 142 s on Base, p99 22 min). 36,000 blocks
 * before the fake is 20 hours of 2 s Base blocks today and 2 hours of 200 ms ones after Denim.
 */
const ECHO_WINDOW_BLOCKS: Record<SellerChain, number> = { base: 36_000, bsc: 9_600 };
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;

const hex = (n: number) => `0x${n.toString(16)}`;
const hexToNumber = (h: unknown) => (typeof h === 'string' && /^0x[0-9a-f]+$/i.test(h) ? Number(BigInt(h)) : 0);
const lower = (a: string | null | undefined) => (a ?? '').toLowerCase();
const isWalletCode = (c: unknown) => c === '0x' || c === null || c === undefined || (typeof c === 'string' && /^0xef0100[0-9a-f]{40}$/i.test(c));
const balanceOfData = (addr: string) => `0x70a08231${addr.slice(2).toLowerCase().padStart(64, '0')}`;
/** Alchemy leaves `value` null for tokens without decimals: the raw value still says zero. */
const isZero = (t: DecoyTransfer) => t.value === 0 || (t.value === null || t.value === undefined ? /^0x0*$/i.test(t.rawContract?.value ?? '') : false);

async function readState(address: string, chain: SellerChain, deps: DecoyDeps): Promise<DecoyState> {
  const [nonce, code, balance, usdc] = await Promise.all([
    deps.rpc('eth_getTransactionCount', [address, 'latest']),
    deps.rpc('eth_getCode', [address, 'latest']),
    deps.rpc('eth_getBalance', [address, 'latest']),
    deps.rpc('eth_call', [{ to: USDC[chain], data: balanceOfData(address) }, 'latest']),
  ]);
  return { sentTxs: hexToNumber(nonce), isWallet: isWalletCode(code), native: hexToNumber(balance) / 1e18, usdc: hexToNumber(usdc) / 10 ** USDC_DECIMALS[chain] };
}

interface Plant {
  transfer: DecoyTransfer;
  side: 'in' | 'out';
  imitation: Imitation | null;
  /** The real listed token whose payments it copies. */
  realToken: string;
  token: string;
}

/**
 * The decoy finding for an address, or null. Reads nothing past the state gate for a
 * wallet that has sent a transaction, holds more than dust, or is a contract; then two
 * pages of its token transfers and, in parallel, one page per counterparty (three at most).
 */
export async function detectDecoy(rawAddress: string, chain: SellerChain, deps: DecoyDeps, known?: DecoyState): Promise<Decoy | null> {
  const address = rawAddress.toLowerCase();
  const state = known ?? (await readState(address, chain, deps));
  if (state.sentTxs > 0 || !state.isWallet || state.native > NATIVE_DUST[chain] || state.usdc > USDC_DUST) return null;

  // Zero-value rows are kept: a zero-value transferFrom of the real token is another way to plant a look-alike.
  const page = { category: ['erc20'], excludeZeroValue: false, withMetadata: true, order: 'desc', maxCount: hex(TOUCH_PAGE) };
  const [inbound, outbound] = await Promise.all([deps.transfers({ ...page, toAddress: address }), deps.transfers({ ...page, fromAddress: address })]);

  const plants: Plant[] = [];
  const sides: Array<['in' | 'out', DecoyTransfer[]]> = [
    ['in', inbound.transfers],
    ['out', outbound.transfers],
  ];
  for (const [side, rows] of sides) {
    for (const t of rows) {
      const contract = lower(t.rawContract?.address);
      const imitation = imitatedToken({ symbol: t.asset ?? null, contract, chain });
      if (imitation) {
        if (imitation.real) plants.push({ transfer: t, side, imitation, realToken: lower(imitation.real), token: imitation.imitates });
        continue;
      }
      const listed = realToken(contract, chain);
      // Tokens we do not list (airdropped spam, say) neither make nor break the case, and their names are never quoted.
      if (!listed) continue;
      if (isZero(t) || (typeof t.value === 'number' && t.value <= listed.dust)) {
        plants.push({ transfer: t, side, imitation: null, realToken: contract, token: listed.symbol });
        continue;
      }
      // A real payment of a listed token, in or out: a wallet in use, whatever else reached it.
      return null;
    }
  }

  const targets = new Map<string, Plant>();
  for (const p of plants) {
    const counterparty = lower(p.side === 'in' ? p.transfer.from : p.transfer.to);
    if (!counterparty || counterparty === address || counterparty === ZERO_ADDRESS) continue;
    const key = `${p.side}:${counterparty}:${p.realToken}`;
    if (!targets.has(key)) targets.set(key, p);
    if (targets.size >= MAX_COUNTERPARTIES) break;
  }

  const traced = await Promise.all(
    [...targets.values()].map(async (p) => {
      const counterparty = lower(p.side === 'in' ? p.transfer.from : p.transfer.to);
      const at = hexToNumber(p.transfer.blockNum);
      const window = at > 0 ? { fromBlock: hex(Math.max(0, at - ECHO_WINDOW_BLOCKS[chain])), toBlock: hex(at) } : {};
      const query = { category: ['erc20'], contractAddresses: [p.realToken], excludeZeroValue: true, withMetadata: true, order: 'desc', maxCount: hex(COUNTERPARTY_PAGE), ...window };
      // A payee look-alike matches someone the counterparty paid; a payer look-alike, someone who paid it.
      const { transfers } = await deps.transfers(p.side === 'in' ? { ...query, fromAddress: counterparty } : { ...query, toAddress: counterparty });
      return { p, counterparty, transfers };
    }),
  );

  for (const { p, counterparty, transfers } of traced) {
    const dust = realToken(p.realToken, chain)?.dust ?? 0;
    const other = (t: DecoyTransfer) => lower(p.side === 'in' ? t.to : t.from);
    const matches = transfers.filter((t) => typeof t.value === 'number' && t.value > dust && sharesEnds(other(t), address));
    if (matches.length === 0) continue;
    const distinct = [...new Set(matches.map(other))];
    const original = distinct.length === 1 ? matches[0]! : null;
    return {
      role: p.side === 'in' ? 'payee' : 'payer',
      copies: distinct.length === 1 ? distinct[0]! : null,
      candidates: distinct.length,
      counterparty,
      token: p.token,
      echoes_tx: original?.hash ?? null,
      echoes_at: original?.metadata?.blockTimestamp ?? null,
      fake_tx: p.transfer.hash,
      fake_tokens: imitationTokens(plants),
    };
  }
  return null;
}

function imitationTokens(plants: Plant[]): Decoy['fake_tokens'] {
  const out = new Map<string, Decoy['fake_tokens'][number]>();
  for (const p of plants) {
    const contract = lower(p.transfer.rawContract?.address);
    if (p.imitation && contract && !out.has(contract)) out.set(contract, { contract, symbol: p.transfer.asset ?? '', imitates: p.imitation.imitates });
  }
  return [...out.values()];
}

const utc = (iso: string | null) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : null);

/** One sentence for a verdict, naming no address: nothing in it can be copied and paid. */
export function decoyReason(_d: Decoy): string {
  return 'It looks like an address-poisoning decoy: a never-used address made to match the first and last characters of a real one, so it gets copied from wallet history by mistake. Get the full address from whoever you are paying.';
}

/** The evidence for a flag: who was poisoned and the transactions, but not the address it matches. */
export function decoySentence(d: Decoy): string {
  const when = utc(d.echoes_at);
  const real = d.echoes_tx
    ? `${d.role === 'payee' ? `the recipient of a real ${d.token} payment from` : `the sender of a real ${d.token} payment to`} ${d.counterparty}${when ? ` on ${when}` : ''} (tx ${d.echoes_tx})`
    : `${d.role === 'payee' ? `the recipients of ${d.candidates} real ${d.token} payments from` : `the senders of ${d.candidates} real ${d.token} payments to`} ${d.counterparty} in the hours before`;
  return (
    `This address has never sent a transaction, and its newest token transfers are all fakes: look-alike ${d.token} or zero-value and dust transfers (tx ${d.fake_tx}). ` +
    `Its first and last 4 characters match ${real}, the way address-poisoning bots plant a decoy in a wallet's history to be copied by mistake. ` +
    'Get the full address from whoever you are paying, not from wallet history.'
  );
}
