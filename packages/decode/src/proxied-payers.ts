// ─── Payers behind facilitator proxies ────────────────────────────────────────
//
// Some x402 facilitators settle through a proxy contract: the payer's USDC goes
// into the proxy and the proxy pays the seller in the same transaction, so the
// seller's inflow names the proxy, not the payer. Meridian uses one proxy for
// everyone; Fluxa deploys one per seller. x402scan records the real payer of each
// settlement (`sender`), and the receipt shows it on-chain (payer → proxy, then
// proxy → seller). Verified on 12 receipts across Sep 15 - Oct 5 2026:
// chainward.ai/decodes/x402-on-base-two-weeks-later.

import {
  DEMAND_WINDOW_DAYS,
  USDC_BASE,
  mapLimit,
  type ProxiedPayers,
  type ProxyResolver,
  type SellerChain,
  type SellerDemandOptions,
  type UsdcTransfer,
} from './seller-demand.js';

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

/**
 * The seller check's options for a chain, shared by the paid route and the x402 board:
 * on Base, payers behind facilitator proxies come from x402scan, verified on receipts
 * read from the check's own RPC. BNB Chain has no proxied facilitators to resolve.
 */
export function sellerDemandOptions(chain: SellerChain, rpcUrl: string): SellerDemandOptions {
  if (chain !== 'base') return {};
  return { proxies: proxiedPayerResolver({ settlements: x402scanSettlementSource(), receipts: alchemyReceiptSource(rpcUrl) }) };
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/** Receipts one check may read (verification plus fallback), and how many at a time. */
export const PROXY_RECEIPTS_MAX = 40;
const RECEIPT_CONCURRENCY = 3;
/** Receipts per proxy that check x402scan's payer against the chain. */
const VERIFY_PER_PROXY = 3;

export interface ProxyDeps {
  /** Primary: the payer x402scan recorded for each settlement. */
  settlements?: SettlementSource;
  /** Verification, and the fallback when x402scan is unavailable or disagrees with the chain. */
  receipts?: ReceiptSource;
  registry?: readonly FacilitatorProxy[];
}

interface ProxyState {
  name: string;
  facilitator: string;
  /** The seller's inflows this proxy delivered. */
  legs: UsdcTransfer[];
  read: number;
  matched: number;
  mismatched: number;
}

/** `count` items spread evenly over `list` (first, ..., last), or all of it. */
function spread<T>(list: T[], count: number): T[] {
  if (count <= 0) return [];
  if (list.length <= count) return list;
  if (count === 1) return [list[0]!];
  return Array.from({ length: count }, (_, i) => list[Math.round((i * (list.length - 1)) / (count - 1))]!);
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Builds a fresh ProxyResolver per check. Payers come from x402scan's record of each
 * settlement, checked against up to 3 receipts per proxy; when x402scan is down, has no
 * record, or disagrees with the chain, they come from an even sample of receipts instead
 * (at most PROXY_RECEIPTS_MAX per check, 3 at a time). Receipts of the seller's own
 * payments through a proxy name who it paid, which is what links a payer to the seller
 * when x402scan can't.
 */
export function proxiedPayerResolver(deps: ProxyDeps): (seller: string) => ProxyResolver {
  return (sellerAddress) => {
    const seller = sellerAddress.toLowerCase();
    const known = new Map((deps.registry ?? FACILITATOR_PROXIES).map((p) => [p.address.toLowerCase(), p]));
    const proxies = new Map<string, ProxyState>();
    const addProxy = (address: string, facilitator: string) => {
      if (proxies.has(address)) return;
      const listed = known.get(address);
      proxies.set(address, {
        name: listed?.name ?? PROXY_FACILITATORS[facilitator] ?? facilitator,
        facilitator: listed?.facilitator ?? facilitator,
        legs: [],
        read: 0,
        matched: 0,
        mismatched: 0,
      });
    };
    const isProxy = (a: string) => proxies.has(a) || known.has(a);
    const facilitatorOf = (a: string) => (proxies.get(a) ?? known.get(a))!.facilitator;

    // `${tx}|${payee}` → payer and `${tx}|${payer}` → payee, from x402scan and from receipts.
    const indexPayer = new Map<string, Settlement>();
    const indexPayee = new Map<string, string>();
    const chainPayer = new Map<string, string>();
    const chainPayee = new Map<string, string>();
    const distrusted = new Set<string>();
    let indexDown = !deps.settlements;
    let sellerIndexFailed = !deps.settlements;
    let indexFailedMidway = false;
    const lookups = new Map<string, Promise<void>>();
    let budget = deps.receipts ? PROXY_RECEIPTS_MAX : 0;
    const take = (n: number) => {
      const k = Math.max(0, Math.min(n, budget));
      budget -= k;
      return k;
    };

    const lookup = (direction: 'in' | 'out', address: string, facilitators: string[]): Promise<void> => {
      const key = `${direction}:${address}:${[...facilitators].sort().join(',')}`;
      if (!lookups.has(key)) {
        lookups.set(
          key,
          (async () => {
            if (indexDown) return;
            try {
              for (const s of await deps.settlements!(direction, address, facilitators)) {
                indexPayer.set(`${s.tx}|${s.payee}`, s);
                indexPayee.set(`${s.tx}|${s.payer}`, s.payee);
              }
            } catch {
              indexDown = true;
              if (address === seller) sellerIndexFailed = true;
              else indexFailedMidway = true;
            }
          })(),
        );
      }
      return lookups.get(key)!;
    };

    /** x402scan's payer for a delivery `t` to `payee`, when it names someone other than the proxy. */
    const indexedPayer = (t: UsdcTransfer, payee: string): string | undefined => {
      const s = indexPayer.get(`${t.hash}|${payee}`);
      return s && s.payer !== t.from ? s.payer : undefined;
    };
    /** The payer behind a proxy delivery `t` to `payee`, if known. */
    const payerOf = (t: UsdcTransfer, payee: string): string | undefined =>
      chainPayer.get(`${t.hash}|${payee}`) ?? (distrusted.has(t.from) ? undefined : indexedPayer(t, payee));
    /** Who `payer` paid with its payment `t` through a proxy, if known. */
    const payeeOf = (t: UsdcTransfer, payer: string): string | undefined =>
      chainPayee.get(`${t.hash}|${payer}`) ?? (distrusted.has(t.to) ? undefined : indexPayee.get(`${t.hash}|${payer}`));
    const rewriteIn = (rows: UsdcTransfer[], payee: string) =>
      rows.map((t) => {
        if (!t.hash || !isProxy(t.from)) return t;
        const payer = payerOf(t, payee);
        return payer ? { ...t, from: payer } : t;
      });

    /** Reads a receipt and records who paid into the proxy (`in`) or whom the proxy paid (`out`). */
    const readReceipt = async (t: UsdcTransfer, side: 'in' | 'out'): Promise<string | undefined> => {
      const proxy = side === 'in' ? t.from : t.to;
      let legs: UsdcTransfer[];
      try {
        legs = await deps.receipts!(t.hash!);
      } catch {
        return undefined;
      }
      if (side === 'in') {
        proxies.get(proxy)!.read++;
        // payer → proxy → payee; the payer sends the gross amount, so take the smallest leg that covers it.
        const into = legs.filter((l) => l.to === proxy && l.from !== proxy && l.from !== t.to);
        const covering = into.filter((l) => l.usd >= t.usd * 0.99).sort((a, b) => a.usd - b.usd);
        const payer = (covering[0] ?? into.sort((a, b) => b.usd - a.usd)[0])?.from;
        if (payer) {
          chainPayer.set(`${t.hash}|${t.to}`, payer);
          chainPayee.set(`${t.hash}|${payer}`, t.to);
        }
        return payer;
      }
      const payee = legs.filter((l) => l.from === proxy && l.to !== t.from && l.to !== proxy).sort((a, b) => b.usd - a.usd)[0]?.to;
      if (payee) {
        chainPayee.set(`${t.hash}|${t.from}`, payee);
        chainPayer.set(`${t.hash}|${payee}`, t.from);
      }
      return payee;
    };

    return {
      async seller(rawIn, rawOut) {
        await lookup('in', seller, Object.keys(PROXY_FACILITATORS));
        // A delivery x402scan attributes to someone else came through a proxy (Fluxa deploys one per seller).
        for (const t of rawIn) {
          const s = t.hash ? indexPayer.get(`${t.hash}|${seller}`) : undefined;
          if (s && s.payer !== t.from) addProxy(t.from, s.facilitator);
          else if (known.has(t.from)) addProxy(t.from, known.get(t.from)!.facilitator);
        }
        for (const t of rawIn) if (t.hash && proxies.has(t.from)) proxies.get(t.from)!.legs.push(t);
        const outLegs = rawOut.filter((t) => t.hash && isProxy(t.to));
        if (outLegs.length > 0) await lookup('out', seller, [...new Set(outLegs.map((t) => facilitatorOf(t.to)))]);

        if (deps.receipts) {
          // Check x402scan's payer on a few receipts per proxy; one disagreement and its record isn't used.
          const checks = [...proxies.values()].flatMap((p) => {
            const named = p.legs.filter((t) => indexedPayer(t, seller));
            return spread(named, take(Math.min(VERIFY_PER_PROXY, named.length))).map((t) => ({ t, p }));
          });
          await mapLimit(checks, RECEIPT_CONCURRENCY, async ({ t, p }) => {
            const claimed = indexedPayer(t, seller);
            const payer = await readReceipt(t, 'in');
            if (payer === undefined) return;
            if (payer === claimed) p.matched++;
            else p.mismatched++;
          });
          for (const [address, p] of proxies) if (p.mismatched > 0) distrusted.add(address);

          // Whatever is still unnamed: an even sample of receipts, split between the seller's
          // inflows (who paid it) and its own payments through the proxy (whom it paid).
          const inGaps = [...proxies.values()].flatMap((p) => p.legs).filter((t) => !payerOf(t, seller));
          const outGaps = outLegs.filter((t) => !payeeOf(t, seller));
          const outTake = Math.min(outGaps.length, budget - Math.min(inGaps.length, Math.ceil(budget / 2)));
          const inTake = Math.min(inGaps.length, budget - outTake);
          const sample = [
            ...spread(inGaps, take(inTake)).map((t) => ({ t, side: 'in' as const })),
            ...spread(outGaps, take(outTake)).map((t) => ({ t, side: 'out' as const })),
          ];
          await mapLimit(sample, RECEIPT_CONCURRENCY, async ({ t, side }) => {
            const named = await readReceipt(t, side);
            if (named && side === 'in') proxies.get(t.from)!.matched++;
          });
        }

        const outflows = rawOut.map((t) => {
          if (!t.hash || !isProxy(t.to)) return t;
          const payee = payeeOf(t, seller);
          return payee ? { ...t, to: payee } : t;
        });
        return { inflows: rewriteIn(rawIn, seller), outflows };
      },

      async inflows(address, rows) {
        const unnamed = rows.filter((t) => t.hash && isProxy(t.from) && !distrusted.has(t.from) && !payerOf(t, address));
        if (unnamed.length > 0) await lookup('in', address, [...new Set(unnamed.map((t) => facilitatorOf(t.from)))]);
        return rewriteIn(rows, address);
      },

      isProxy,

      summary(checked, funded) {
        const checkedSet = new Set(checked);
        const notes: string[] = [];
        const ranked = [...proxies]
          .filter(([, p]) => p.legs.length > 0)
          .map(([address, p]) => ({ address, p, value: p.legs.reduce((a, t) => a + t.usd, 0) }))
          .sort((a, b) => b.value - a.value);
        const proxied_payers = ranked.map(({ address, p, value }): ProxiedPayers => {
          const payers = new Set<string>();
          let named = 0;
          for (const t of p.legs) {
            const payer = payerOf(t, seller);
            if (!payer || payer === seller) continue;
            payers.add(payer);
            named += t.usd;
          }
          const coverage = value > 0 ? Math.round((named / value) * 1000) / 1000 : 0;
          const byIndex = !distrusted.has(address) && p.legs.some((t) => indexedPayer(t, seller));
          const source = payers.size === 0 ? null : byIndex ? 'x402scan' : 'receipts';
          if (distrusted.has(address)) {
            notes.push(
              `x402scan's payer disagreed with the chain on ${p.mismatched} of ${p.matched + p.mismatched} receipts checked for ${p.name}, so its payers here come from on-chain receipts instead: ${pct(coverage)} of ${p.name}'s payments to this address (partial coverage).`,
            );
          } else if (source !== 'x402scan') {
            const why = sellerIndexFailed ? 'x402scan was unavailable' : 'x402scan has no record of these payments';
            notes.push(
              payers.size === 0
                ? `${why} and no receipt named a payer, so the payers behind ${p.name} were not resolved.`
                : `${why}, so the payers behind ${p.name} come from ${p.read} on-chain receipts: ${pct(coverage)} of its payments to this address (partial coverage).`,
            );
          }
          const inTop = [...payers].filter((a) => checkedSet.has(a));
          return {
            proxy: address,
            name: p.name,
            payers_resolved: payers.size,
            coverage_share: coverage,
            source,
            receipts: { read: p.read, matched: p.matched },
            payers_checked: inTop.length,
            payers_funded_by_seller: inTop.filter((a) => funded.has(a)).length,
          };
        });
        if (indexFailedMidway) {
          notes.push("x402scan stopped answering during the check, so some payers' own payments through a proxy were not resolved.");
        }
        return { proxied_payers, notes };
      },
    };
  };
}
