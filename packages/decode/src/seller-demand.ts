// ─── x402 seller demand check ─────────────────────────────────────────────────
//
// Where do a seller's buyers get their USDC? For an address that receives
// payments, sample its recent USDC inflows, then walk each top buyer's funding
// backward (largest funder per hop) to see whether the trail reaches the seller.
// Also: how much the seller sends back to its own buyers, and whether one
// wallet is the first funder of most buyers. Method and cases:
// chainward.ai/decodes/x402-on-base. Describes where money moved, never why.

export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MAX_HOPS = 4;
const TOP_BUYERS = 30;
/** An address with this many USDC inflows in the window is a hub (exchange, router,
 * custodian); walking past it says nothing about the seller. */
const HUB_INFLOWS = 1000;
export const DEMAND_WINDOW_DAYS = 30;

export interface UsdcTransfer {
  from: string;
  to: string;
  usd: number;
}

/** Newest-first USDC transfers into (`in`) or out of (`out`) an address, within the window. */
export type TransferSource = (direction: 'in' | 'out', address: string) => Promise<UsdcTransfer[]>;

export interface DemandSignal {
  id: 'buyers_funded_by_seller' | 'money_flows_back' | 'common_funder' | 'concentrated_buyers';
  title: string;
  evidence: string;
}

export interface SellerDemandReport {
  address: string;
  window_days: number;
  sample: { inflow_transfers: number; buyers: number; capped: boolean };
  /** Share of inflow from high-throughput senders (facilitator proxies, exchanges):
   * the real payers behind them aren't traced. */
  via_intermediary_share: number | null;
  top_buyer_share: number | null;
  buyers_checked: number;
  seller_funded: { buyers: number; volume_share: number | null; hops: Record<string, number> };
  paid_back_share: number | null;
  common_first_funder: { address: string; buyer_share: number } | null;
  walk_stops: Record<string, number>;
  signals: DemandSignal[];
  not_assessed: string[];
  disclaimer: string;
}

const NOT_ASSESSED = [
  'Transfers older than the window or beyond the 1,000-transfer sample',
  'Funding trails past high-throughput hubs (exchanges, routers, custodians)',
  'Payers behind facilitator proxies and other high-throughput senders',
  'Anything but the largest funder at each hop',
  'Who controls any address, or why money moved',
  'Payments in tokens other than USDC',
];

const DISCLAIMER =
  'Describes where USDC moved on Base, not why. A common funder can be a legitimate faucet, exchange or custodian. Not a safety verdict.';

type WalkResult =
  | { buyer: string; reached: true; hops: number }
  | { buyer: string; reached: false; stop: 'no_funding' | 'hub' | 'max_hops' };

const round = (n: number) => Math.round(n * 1000) / 1000;

function sumBy(transfers: UsdcTransfer[], key: 'from' | 'to'): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of transfers) out.set(t[key], (out.get(t[key]) ?? 0) + t.usd);
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

export async function analyzeSellerDemand(address: string, source: TransferSource): Promise<SellerDemandReport> {
  const seller = address.toLowerCase();
  const memo = new Map<string, Promise<UsdcTransfer[]>>();
  const get = (dir: 'in' | 'out', addr: string) => {
    const key = `${dir}:${addr}`;
    if (!memo.has(key)) memo.set(key, source(dir, addr));
    return memo.get(key)!;
  };

  const [inflows, outflows] = await Promise.all([get('in', seller), get('out', seller)]);
  const bySender = sumBy(inflows.filter((t) => t.from !== seller), 'from');
  const totalIn = [...bySender.values()].reduce((a, b) => a + b, 0);

  // Proxied facilitators (and exchanges) deliver payments from their own contract,
  // so a high-throughput sender is an intermediary, not a buyer. Classify the
  // largest senders; the lookups are the same ones the walk needs anyway.
  const intermediaries = new Set<string>();
  const top: string[] = [];
  for (const [sender] of [...bySender.entries()].sort((a, b) => b[1] - a[1])) {
    if (top.length >= TOP_BUYERS || top.length + intermediaries.size >= TOP_BUYERS * 2) break;
    if ((await get('in', sender)).length >= HUB_INFLOWS) intermediaries.add(sender);
    else top.push(sender);
  }
  const byBuyer = new Map([...bySender].filter(([a]) => !intermediaries.has(a)));
  const total = [...byBuyer.values()].reduce((a, b) => a + b, 0);
  const viaIntermediary = [...intermediaries].reduce((a, i) => a + (bySender.get(i) ?? 0), 0);

  const walks = await mapLimit(top, 3, async (buyer): Promise<WalkResult> => {
    let node = buyer;
    const seen = new Set([buyer]);
    for (let hop = 1; hop <= MAX_HOPS; hop++) {
      const funders = sumBy((await get('in', node)).filter((t) => t.from !== node), 'from');
      if (funders.size === 0) return { buyer, reached: false, stop: 'no_funding' };
      if (funders.has(seller)) return { buyer, reached: true, hops: hop };
      const [largest] = [...funders.entries()].sort((a, b) => b[1] - a[1])[0]!;
      if (seen.has(largest)) return { buyer, reached: false, stop: 'no_funding' };
      if ((await get('in', largest)).length >= HUB_INFLOWS) return { buyer, reached: false, stop: 'hub' };
      seen.add(largest);
      node = largest;
    }
    return { buyer, reached: false, stop: 'max_hops' };
  });

  const reached = walks.filter((w): w is Extract<WalkResult, { reached: true }> => w.reached);
  const sampledVolume = top.reduce((a, b) => a + (byBuyer.get(b) ?? 0), 0);
  const fundedVolume = reached.reduce((a, w) => a + (byBuyer.get(w.buyer) ?? 0), 0);
  const hops: Record<string, number> = {};
  for (const w of reached) hops[w.hops] = (hops[w.hops] ?? 0) + 1;
  const stops: Record<string, number> = {};
  for (const w of walks) if (!w.reached) stops[w.stop] = (stops[w.stop] ?? 0) + 1;

  const paidBack = outflows.filter((t) => byBuyer.has(t.to)).reduce((a, t) => a + t.usd, 0);

  const firstFunders = new Map<string, number>();
  await Promise.all(
    top.map(async (b) => {
      const funders = sumBy((await get('in', b)).filter((t) => t.from !== b), 'from');
      const first = [...funders.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
      if (first) firstFunders.set(first, (firstFunders.get(first) ?? 0) + 1);
    }),
  );
  const [cfAddr, cfCount] = [...firstFunders.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];

  const report: SellerDemandReport = {
    address: seller,
    window_days: DEMAND_WINDOW_DAYS,
    sample: { inflow_transfers: inflows.length, buyers: byBuyer.size, capped: inflows.length >= HUB_INFLOWS },
    via_intermediary_share: totalIn > 0 ? round(viaIntermediary / totalIn) : null,
    top_buyer_share: total > 0 && byBuyer.size > 0 ? round(Math.max(...byBuyer.values()) / total) : null,
    buyers_checked: top.length,
    seller_funded: {
      buyers: reached.length,
      volume_share: sampledVolume > 0 ? round(fundedVolume / sampledVolume) : null,
      hops,
    },
    paid_back_share: total > 0 ? round(paidBack / total) : null,
    common_first_funder: top.length > 0 && cfAddr ? { address: cfAddr, buyer_share: round(cfCount / top.length) } : null,
    walk_stops: stops,
    signals: [],
    not_assessed: NOT_ASSESSED,
    disclaimer: DISCLAIMER,
  };
  report.signals = demandSignals(report);
  return report;
}

/** Neutral signals from the measured numbers. Thresholds are deliberately high. */
export function demandSignals(r: SellerDemandReport): DemandSignal[] {
  const out: DemandSignal[] = [];
  const checked = r.buyers_checked;
  if (checked > 0 && r.seller_funded.buyers / checked >= 0.5) {
    const maxHop = Math.max(...Object.keys(r.seller_funded.hops).map(Number));
    out.push({
      id: 'buyers_funded_by_seller',
      title: "Most checked buyers' USDC traces back to this address",
      evidence: `${r.seller_funded.buyers} of ${checked} top buyers reach this address within ${maxHop} hop${maxHop === 1 ? '' : 's'} of their largest funders (${Math.round((r.seller_funded.volume_share ?? 0) * 100)}% of their volume).`,
    });
  }
  if ((r.paid_back_share ?? 0) >= 0.25) {
    out.push({
      id: 'money_flows_back',
      title: 'Sends USDC back to its own buyers',
      evidence: `USDC sent to its own buyers equals ${Math.round((r.paid_back_share ?? 0) * 100)}% of sampled inflow.`,
    });
  }
  // A shared funder means little on a handful of buyers.
  if (
    checked >= 5 &&
    r.common_first_funder &&
    r.common_first_funder.buyer_share >= 0.5 &&
    r.common_first_funder.address !== r.address
  ) {
    out.push({
      id: 'common_funder',
      title: 'One wallet funds most checked buyers',
      evidence: `${r.common_first_funder.address} is the largest funder of ${Math.round(r.common_first_funder.buyer_share * 100)}% of the top buyers checked.`,
    });
  }
  // Measured only on direct buyers; meaningless when most inflow arrives via intermediaries.
  if ((r.top_buyer_share ?? 0) >= 0.5 && (r.via_intermediary_share ?? 0) < 0.5) {
    out.push({
      id: 'concentrated_buyers',
      title: 'One buyer dominates',
      evidence: `The largest buyer is ${Math.round((r.top_buyer_share ?? 0) * 100)}% of sampled inflow.`,
    });
  }
  return out;
}

// ─── Alchemy transfer source ──────────────────────────────────────────────────

/**
 * USDC transfers via alchemy_getAssetTransfers on the API's Base RPC, with
 * backoff for the free tier's compute-units-per-second limit.
 */
export function alchemyTransferSource(
  rpcUrl: string,
  fromBlock: bigint,
  log?: { warn: (msg: string) => void },
): TransferSource {
  async function call(params: Record<string, unknown>): Promise<{ transfers: Array<{ from: string; to: string | null; value: number | null }> }> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers', params: [params] }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => null)) as { result?: never; error?: { code?: number; message?: string } } | null;
      const throttled = res.status === 429 || !body || body.error?.code === 429 || /rate|capacity|limit/i.test(body.error?.message ?? '');
      if (throttled) {
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        continue;
      }
      if (body.error) throw new Error(`alchemy_getAssetTransfers: ${body.error.message}`);
      return body.result!;
    }
    log?.warn('sellerDemand: Alchemy still throttling after retries');
    throw new Error('transfer source throttled');
  }

  return async (direction, address) => {
    const result = await call({
      category: ['erc20'],
      contractAddresses: [USDC_BASE],
      order: 'desc',
      maxCount: '0x3e8',
      excludeZeroValue: true,
      withMetadata: false,
      fromBlock: `0x${fromBlock.toString(16)}`,
      [direction === 'in' ? 'toAddress' : 'fromAddress']: address,
    });
    return result.transfers
      .filter((t) => t.to)
      .map((t) => ({ from: t.from.toLowerCase(), to: t.to!.toLowerCase(), usd: Number(t.value ?? 0) }));
  };
}
