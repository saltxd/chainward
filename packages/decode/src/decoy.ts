// ─── Address-poisoning decoys ─────────────────────────────────────────────────
//
// A poisoning bot watches real payments (A pays B) and minutes later plants
// look-alikes: an address sharing B's first and last characters "receives" a fake
// token from A, and one sharing A's "sends" a fake to B, so each turns up in the
// other's history. Whoever copies the look-alike from that history pays the bot.
// A decoy is such a look-alike: it never sent a transaction, holds no ETH or USDC,
// every transfer of a real token it shows is zero-value or an imitation, and the
// wallet its fakes name really paid (or was paid by) the address it copies.
// That last match is the evidence; without it nothing is flagged.

import { imitatedToken, sharesEnds, type Imitation } from './lookalike.js';
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
  rawContract?: { address?: string | null };
  metadata?: { blockTimestamp?: string };
}

export interface DecoyDeps {
  rpc(method: string, params: unknown[]): Promise<unknown>;
  transfers(params: Record<string, unknown>): Promise<{ transfers: DecoyTransfer[] }>;
}

export interface Decoy {
  /** payee: copies an address the counterparty paid; payer: copies an address that paid it. */
  role: 'payee' | 'payer';
  /** The real address this one was made to look like. */
  imitates: string;
  /** The wallet whose history the fakes planted it in. */
  counterparty: string;
  /** The token of the real payment it copies (USDC). */
  token: string;
  echoes_tx: string;
  echoes_at: string | null;
  /** One fake transfer that put it in the counterparty's history. */
  fake_tx: string;
  /** The imitation tokens involved; empty when the fake was a zero-value transfer of the real token. */
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
/** Transfers read on each side of the address. */
const TOUCH_PAGE = 25;
/** The counterparty's real transfers of the copied token searched for the original, and how many counterparties. */
const COUNTERPARTY_PAGE = 100;
const MAX_COUNTERPARTIES = 3;
/** Echoes land minutes after the payment; a day back from the fake is ample (432,000 blocks = a day of 200 ms Base blocks). */
const ECHO_WINDOW_BLOCKS: Record<SellerChain, number> = { base: 432_000, bsc: 115_200 };

const hex = (n: number) => `0x${n.toString(16)}`;
const hexToNumber = (h: unknown) => (typeof h === 'string' && /^0x[0-9a-f]+$/i.test(h) ? Number(BigInt(h)) : 0);
const isWalletCode = (c: unknown) => c === '0x' || c === null || c === undefined || (typeof c === 'string' && /^0xef0100[0-9a-f]{40}$/i.test(c));
const balanceOfData = (addr: string) => `0x70a08231${addr.slice(2).toLowerCase().padStart(64, '0')}`;

async function readState(address: string, chain: SellerChain, deps: DecoyDeps): Promise<DecoyState> {
  const [nonce, code, balance, usdc] = await Promise.all([
    deps.rpc('eth_getTransactionCount', [address, 'latest']),
    deps.rpc('eth_getCode', [address, 'latest']),
    deps.rpc('eth_getBalance', [address, 'latest']),
    deps.rpc('eth_call', [{ to: USDC[chain], data: balanceOfData(address) }, 'latest']),
  ]);
  return { sentTxs: hexToNumber(nonce), isWallet: isWalletCode(code), native: hexToNumber(balance), usdc: hexToNumber(usdc) };
}

interface Fake {
  transfer: DecoyTransfer;
  side: 'in' | 'out';
  imitation: Imitation | null;
  /** The real token whose payments it copies: the imitation's real contract, or the zero-value token itself. */
  realToken: string | null;
  tokenSymbol: string;
}

/**
 * The decoy finding for an address, or null. Reads nothing past the state gate for a
 * wallet that has sent a transaction, holds ETH or USDC, or is a contract; then at most
 * two pages of its token transfers and one page per counterparty (three at most).
 */
export async function detectDecoy(rawAddress: string, chain: SellerChain, deps: DecoyDeps, known?: DecoyState): Promise<Decoy | null> {
  const address = rawAddress.toLowerCase();
  const state = known ?? (await readState(address, chain, deps));
  if (state.sentTxs > 0 || !state.isWallet || state.native > 0 || state.usdc > 0) return null;

  // Zero-value transfers are kept: a zero-value transferFrom of the real token is the other way to plant a look-alike.
  const page = { category: ['erc20'], excludeZeroValue: false, withMetadata: true, order: 'desc', maxCount: hex(TOUCH_PAGE) };
  const [inbound, outbound] = await Promise.all([deps.transfers({ ...page, toAddress: address }), deps.transfers({ ...page, fromAddress: address })]);

  const fakes: Fake[] = [];
  const sides: Array<['in' | 'out', DecoyTransfer[]]> = [
    ['in', inbound.transfers],
    ['out', outbound.transfers],
  ];
  for (const [side, rows] of sides) {
    for (const t of rows) {
      const contract = (t.rawContract?.address ?? '').toLowerCase();
      const imitation = imitatedToken({ symbol: t.asset ?? null, contract, chain });
      if (imitation) {
        fakes.push({ transfer: t, side, imitation, realToken: imitation.real?.toLowerCase() ?? null, tokenSymbol: imitation.imitates });
      } else if (t.value === 0) {
        fakes.push({ transfer: t, side, imitation: null, realToken: contract || null, tokenSymbol: t.asset ?? 'tokens' });
      } else if (contract === USDC[chain]) {
        // A real USDC payment in or out: a wallet in use, whatever else reached it.
        return null;
      }
      // Other tokens (airdropped spam, say) neither make nor break the case.
    }
  }

  const traced = new Set<string>();
  for (const f of fakes) {
    const counterparty = (f.side === 'in' ? f.transfer.from : f.transfer.to)?.toLowerCase();
    if (!counterparty || counterparty === address || !f.realToken || traced.has(counterparty)) continue;
    if (traced.size >= MAX_COUNTERPARTIES) break;
    traced.add(counterparty);
    const at = hexToNumber(f.transfer.blockNum);
    const window = at > 0 ? { fromBlock: hex(Math.max(0, at - ECHO_WINDOW_BLOCKS[chain])), toBlock: hex(at) } : {};
    const query = { category: ['erc20'], contractAddresses: [f.realToken], excludeZeroValue: true, withMetadata: true, order: 'desc', maxCount: hex(COUNTERPARTY_PAGE), ...window };
    // A payee look-alike copies someone the counterparty paid; a payer look-alike copies someone who paid it.
    const { transfers } = await deps.transfers(f.side === 'in' ? { ...query, fromAddress: counterparty } : { ...query, toAddress: counterparty });
    const original = transfers.find((t) => sharesEnds(f.side === 'in' ? (t.to ?? '') : t.from, address));
    if (!original) continue;
    return {
      role: f.side === 'in' ? 'payee' : 'payer',
      imitates: (f.side === 'in' ? original.to! : original.from).toLowerCase(),
      counterparty,
      token: f.tokenSymbol,
      echoes_tx: original.hash,
      echoes_at: original.metadata?.blockTimestamp ?? null,
      fake_tx: f.transfer.hash,
      fake_tokens: uniqueFakeTokens(fakes),
    };
  }
  return null;
}

function uniqueFakeTokens(fakes: Fake[]): Decoy['fake_tokens'] {
  const out = new Map<string, Decoy['fake_tokens'][number]>();
  for (const f of fakes) {
    const contract = (f.transfer.rawContract?.address ?? '').toLowerCase();
    if (f.imitation && contract && !out.has(contract)) out.set(contract, { contract, symbol: f.transfer.asset ?? '', imitates: f.imitation.imitates });
  }
  return [...out.values()];
}

const utc = (iso: string | null) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : null);

/** One sentence for a verdict: what it copies and what to do. */
export function decoyReason(d: Decoy): string {
  return `It looks like an address-poisoning decoy of ${d.imitates}, planted after a real ${d.token} payment. Check every character of the address you meant to pay.`;
}

/** The evidence behind the finding, for a flag: both full addresses, the fake and the real payment. */
export function decoySentence(d: Decoy): string {
  const kind = d.fake_tokens.length > 0 ? `fake ${d.token}` : `zero-value ${d.token}`;
  const when = utc(d.echoes_at);
  const payment =
    d.role === 'payee'
      ? `${d.imitates}, which ${d.counterparty} paid in real ${d.token}${when ? ` on ${when}` : ''}`
      : `${d.imitates}, which paid ${d.counterparty} in real ${d.token}${when ? ` on ${when}` : ''}`;
  return (
    `This address has never sent a transaction and appears only in ${kind} transfers (tx ${d.fake_tx}). ` +
    `It shares its first and last 4 characters with ${payment} (tx ${d.echoes_tx}), so it looks like a decoy planted in ${d.counterparty}'s history. ` +
    'Check every character of the address you meant to pay.'
  );
}
