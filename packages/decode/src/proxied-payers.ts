// ─── Payers behind facilitator proxies ────────────────────────────────────────
//
// Some x402 facilitators settle through a proxy contract: the payer's USDC goes
// into the proxy and the proxy pays the seller in the same transaction, so the
// seller's inflow names the proxy, not the payer. Meridian uses one proxy for
// everyone; Fluxa deploys one per seller. x402scan records the real payer of each
// settlement (`sender`), and the receipt shows it on-chain (payer → proxy, then
// proxy → seller). Verified on 12 receipts across Sep 15 - Oct 5 2026:
// chainward.ai/decodes/x402-on-base-two-weeks-later.

import { DEMAND_WINDOW_DAYS, USDC_BASE, type UsdcTransfer } from './seller-demand.js';

export interface FacilitatorProxy {
  address: string;
  name: string;
  /** The facilitator's id on x402scan. */
  facilitator: string;
}

/** x402scan facilitator ids whose settlements can arrive through a proxy, and their names. */
export const PROXY_FACILITATORS: Record<string, string> = { mrdn: 'Meridian', fluxa: 'Fluxa' };

/**
 * Proxies the research verified on receipts. Fluxa's per-seller proxies are also
 * found per check, from x402scan (an inflow whose recorded payer is someone else).
 */
export const FACILITATOR_PROXIES: readonly FacilitatorProxy[] = [
  // X402ProxyFacilitatorV7; delivers the Meridian ring's and 0xc2204317's payments.
  { address: '0x8e7769d440b3460b92159dd9c6d17302b036e2d6', name: 'Meridian', facilitator: 'mrdn' },
  // Fluxa's proxy for payTo 0xfe802b35 (5 receipts, Sep 28 - Oct 5).
  { address: '0x9c955c40dc98fce89a133f402ffbf94070e6e299', name: 'Fluxa', facilitator: 'fluxa' },
];

/** One x402 settlement as an indexer recorded it. */
export interface Settlement {
  tx: string;
  payer: string;
  payee: string;
  usd: number;
  facilitator: string;
}

/**
 * x402 settlements paid to (`in`) or by (`out`) an address in the window, by the given
 * facilitators, newest first. Throws when the index can't be read.
 */
export type SettlementSource = (direction: 'in' | 'out', address: string, facilitators: string[]) => Promise<Settlement[]>;

/** The stablecoin transfers in one transaction's receipt. Throws when the receipt can't be read. */
export type ReceiptSource = (tx: string) => Promise<UsdcTransfer[]>;

// ─── Live sources ─────────────────────────────────────────────────────────────

const X402SCAN = 'https://www.x402scan.com/api/trpc';
const UA = { 'user-agent': 'chainward-seller-check/1.0 (+https://chainward.ai/x402)' };
/** Settlements per x402scan call; the check samples the seller's newest 1,000 inflows too. */
const SETTLEMENT_PAGE = 1000;

interface X402ScanTransfer {
  tx_hash: string;
  sender: string;
  recipient: string;
  amount: number;
  decimals?: number;
  facilitator_id: string;
}

/** x402scan's public tRPC (`public.transfers.list`, no key), Base, the check's 30-day window. */
export function x402scanSettlementSource(opts: { timeoutMs?: number; days?: number } = {}): SettlementSource {
  return async (direction, address, facilitators) => {
    const input = {
      chain: 'base',
      timeframe: opts.days ?? DEMAND_WINDOW_DAYS,
      [direction === 'in' ? 'recipients' : 'senders']: { include: [address.toLowerCase()] },
      facilitatorIds: facilitators,
      sorting: { id: 'block_timestamp', desc: true },
      pagination: { page: 0, page_size: SETTLEMENT_PAGE },
    };
    const url = `${X402SCAN}/public.transfers.list?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
    const body = (await res.json().catch(() => null)) as { result?: { data?: { json?: { items?: X402ScanTransfer[] } } } } | null;
    const items = body?.result?.data?.json?.items;
    if (!res.ok || !items) throw new Error(`x402scan public.transfers.list failed (${res.status})`);
    return items.map((t) => ({
      tx: t.tx_hash.toLowerCase(),
      payer: t.sender.toLowerCase(),
      payee: t.recipient.toLowerCase(),
      usd: t.amount / 10 ** (t.decimals ?? 6),
      facilitator: t.facilitator_id,
    }));
  };
}

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** eth_getTransactionReceipt on an RPC (the check's Alchemy URL); USDC on Base, 6 decimals. */
export function alchemyReceiptSource(rpcUrl: string, opts: { timeoutMs?: number } = {}): ReceiptSource {
  const usdc = USDC_BASE.toLowerCase();
  return async (tx) => {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [tx] }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    const body = (await res.json().catch(() => null)) as {
      result?: { logs: Array<{ address: string; topics: string[]; data: string }> } | null;
    } | null;
    if (!body?.result) throw new Error(`eth_getTransactionReceipt: no receipt for ${tx}`);
    const hash = tx.toLowerCase();
    return body.result.logs
      .filter((l) => l.address.toLowerCase() === usdc && l.topics.length === 3 && l.topics[0] === TRANSFER_TOPIC)
      .map((l) => ({
        from: `0x${l.topics[1]!.slice(-40)}`.toLowerCase(),
        to: `0x${l.topics[2]!.slice(-40)}`.toLowerCase(),
        usd: Number(BigInt(l.data)) / 1e6,
        hash,
      }));
  };
}
