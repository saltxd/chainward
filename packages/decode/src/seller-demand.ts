// ─── x402 seller demand check ─────────────────────────────────────────────────
//
// Where do a seller's buyers get their USDC? For an address that receives
// payments, sample its recent USDC inflows, then walk each top buyer's funding
// backward (largest funder per hop) to see whether the trail reaches the seller.
// Also: how much the seller sends back to its own buyers, and whether one
// wallet is the first funder of most buyers. Method and cases:
// chainward.ai/decodes/x402-on-base. Describes where money moved, never why.

export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export type SellerChain = 'base' | 'bsc';

/** The stablecoins x402 / agent-marketplace payments move in, per chain. */
export const SELLER_STABLECOINS: Record<SellerChain, string[]> = {
  base: [USDC_BASE],
  // BSC: Binance-Peg USDT and USDC (18 decimals; Alchemy scales `value` for us)
  bsc: ['0x55d398326f99059fF775485246999027B3197955', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'],
};

/** Base 2 s blocks; BSC ~0.45 s after Maxwell (measured 2026-10-03, docs/BSC.md). */
export const SELLER_BLOCKS_PER_DAY: Record<SellerChain, number> = { base: 43_200, bsc: 192_000 };

/**
 * The Alchemy RPC the seller check, the hire check and the boards built from
 * them use on a chain: SELLER_DEMAND_RPC_URL (else BASE_RPC_URL) for Base; for
 * BNB Chain SELLER_DEMAND_BSC_RPC_URL, else the Base URL with its host rewritten
 * (same key). alchemy_getAssetTransfers is Alchemy-only, so anything else is
 * undefined rather than a URL that would run the check on the wrong chain.
 */
export function sellerDemandRpcUrl(chain: SellerChain, env: Record<string, string | undefined>): string | undefined {
  const base = env.SELLER_DEMAND_RPC_URL ?? env.BASE_RPC_URL;
  if (!base || !/alchemy\.com/.test(base)) return undefined;
  if (chain === 'base') return base;
  if (env.SELLER_DEMAND_BSC_RPC_URL) return env.SELLER_DEMAND_BSC_RPC_URL;
  const derived = base.replace('base-mainnet', 'bnb-mainnet');
  return derived === base ? undefined : derived;
}
const MAX_HOPS = 4;
const TOP_BUYERS = 30;
/** An address with this many stablecoin inflows in the window is a hub (exchange,
 * router, custodian); walking past it says nothing about the seller. The seller
 * check counts only inflows of at least HUB_MIN_USD. */
export const HUB_INFLOWS = 1000;
/**
 * Inflows under a cent (sub-cent spam, address-poisoning dust) don't count toward
 * HUB_INFLOWS: one distributor collected 663 of them and stopped a trace. Alchemy
 * reports `value` in token units for 6- and 18-decimal stablecoins alike, so this is
 * 10,000 atomic units of USDC on Base and 1e16 of BSC's 18-decimal USDT/USDC.
 */
export const HUB_MIN_USD = 0.01;
/**
 * A wallet that got at least this share of its sampled stablecoin inflow from the seller
 * holds the seller's money, however busy it is: a trail that reaches it reaches the
 * seller one hop further. botpay's second payTo has 1,000+ inflows (its own buyers' payments)
 * but 90% of its money comes from the first payTo, and it funds the root of the buyers' tree.
 * An exchange's hot wallet holds mostly other people's money, so it still stops a trail.
 */
export const SELLER_MAJORITY = 0.5;
/** Transfers per alchemy_getAssetTransfers page (maxCount). Equal to HUB_INFLOWS. */
const TRANSFER_PAGE = 1000;
/** Pages the hub test reads past dust before it stops looking. */
const HUB_MAX_PAGES = 5;
export const DEMAND_WINDOW_DAYS = 30;

export interface UsdcTransfer {
  from: string;
  to: string;
  usd: number;
}

/** Only transfers of at least `minUsd`, read back past one page until `atLeast` are found. */
export interface TransferFilter {
  minUsd: number;
  atLeast: number;
}

/**
 * Newest-first stablecoin transfers into (`in`) or out of (`out`) an address, within
 * the window: one page (up to 1,000). With `filter`, only transfers of at least
 * `filter.minUsd`, reading further pages until `filter.atLeast` are found or the
 * window runs out.
 */
export type TransferSource = (direction: 'in' | 'out', address: string, filter?: TransferFilter) => Promise<UsdcTransfer[]>;

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
  'Payments in tokens other than the chain\'s main stablecoins',
];

const DISCLAIMER =
  'Describes where stablecoins moved on this chain, not why. A common funder can be a legitimate faucet, exchange or custodian. Not a safety verdict.';

type WalkResult =
  | { buyer: string; reached: true; hops: number }
  | { buyer: string; reached: false; stop: 'no_funding' | 'hub' | 'max_hops' };

const round = (n: number) => Math.round(n * 1000) / 1000;

function sumBy(transfers: UsdcTransfer[], key: 'from' | 'to'): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of transfers) out.set(t[key], (out.get(t[key]) ?? 0) + t.usd);
  return out;
}

const countReal = (ts: UsdcTransfer[]) => ts.filter((t) => t.usd >= HUB_MIN_USD).length;

/**
 * The hub rule shared by the seller check and the hire check: HUB_INFLOWS+ stablecoin
 * inflows of at least HUB_MIN_USD in the window. `page` is the newest page of inflows;
 * when it is full but short on inflows that count, `readBack` reads further back for them.
 */
export async function isInflowHub(page: UsdcTransfer[], readBack: () => Promise<UsdcTransfer[]>): Promise<boolean> {
  if (countReal(page) >= HUB_INFLOWS) return true;
  // Less than a full page is the whole window, and it falls short.
  if (page.length < TRANSFER_PAGE) return false;
  // A full page that is part dust: read further back for inflows that count.
  return countReal(await readBack()) >= HUB_INFLOWS;
}

/** Promise.all over `items` with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

  const realInflows = (addr: string) => {
    const key = `real:${addr}`;
    if (!memo.has(key)) memo.set(key, source('in', addr, { minUsd: HUB_MIN_USD, atLeast: HUB_INFLOWS }));
    return memo.get(key)!;
  };
  const isHub = async (addr: string): Promise<boolean> => isInflowHub(await get('in', addr), () => realInflows(addr));

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
    if (await isHub(sender)) intermediaries.add(sender);
    else top.push(sender);
  }
  const byBuyer = new Map([...bySender].filter(([a]) => !intermediaries.has(a)));
  const total = [...byBuyer.values()].reduce((a, b) => a + b, 0);
  const viaIntermediary = [...intermediaries].reduce((a, i) => a + (bySender.get(i) ?? 0), 0);

  const fundersOf = async (addr: string) => sumBy((await get('in', addr)).filter((t) => t.from !== addr), 'from');
  // Reads the same page the hub test does, so it costs no extra call.
  const sellerMostlyFunds = async (addr: string): Promise<boolean> => {
    const funders = await fundersOf(addr);
    const total = [...funders.values()].reduce((a, b) => a + b, 0);
    return total > 0 && (funders.get(seller) ?? 0) / total >= SELLER_MAJORITY;
  };

  const walks = await mapLimit(top, 3, async (buyer): Promise<WalkResult> => {
    let node = buyer;
    const seen = new Set([buyer]);
    for (let hop = 1; hop <= MAX_HOPS; hop++) {
      const funders = await fundersOf(node);
      if (funders.size === 0) return { buyer, reached: false, stop: 'no_funding' };
      if (funders.has(seller)) return { buyer, reached: true, hops: hop };
      const [largest] = [...funders.entries()].sort((a, b) => b[1] - a[1])[0]!;
      if (seen.has(largest)) return { buyer, reached: false, stop: 'no_funding' };
      if (await sellerMostlyFunds(largest)) return { buyer, reached: true, hops: hop + 1 };
      if (await isHub(largest)) return { buyer, reached: false, stop: 'hub' };
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
      title: "Most checked buyers' stablecoins trace back to this address",
      evidence: `${r.seller_funded.buyers} of ${checked} top buyers reach this address within ${maxHop} hop${maxHop === 1 ? '' : 's'} of their largest funders (${Math.round((r.seller_funded.volume_share ?? 0) * 100)}% of their volume).`,
    });
  }
  if ((r.paid_back_share ?? 0) >= 0.25) {
    out.push({
      id: 'money_flows_back',
      title: 'Sends stablecoins back to its own buyers',
      evidence: `Stablecoins sent to its own buyers equal ${Math.round((r.paid_back_share ?? 0) * 100)}% of sampled inflow.`,
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

export interface AlchemyTransfer {
  from: string;
  to: string | null;
  value: number | null;
  hash?: string;
  blockNum?: string;
  /** ERC-721 transfers only. */
  erc721TokenId?: string | null;
}

/** One alchemy_getAssetTransfers call, with backoff for the free tier's compute-units-per-second limit. */
export async function alchemyAssetTransfers(
  rpcUrl: string,
  params: Record<string, unknown>,
  log?: { warn: (msg: string) => void },
): Promise<{ transfers: AlchemyTransfer[]; pageKey?: string }> {
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

export type FundingKind = 'native' | 'stable';

export interface FirstFunding {
  from: string;
  hash: string;
  block: number;
}

/** The earliest incoming transfer of a kind into an address, over its whole history; null if none. */
export type FirstFunderSource = (kind: FundingKind, address: string) => Promise<FirstFunding | null>;

/**
 * First incoming native coin (top-level `external` transfers; Alchemy does not
 * report contract-internal BNB on BNB Chain) or first incoming stablecoin (the
 * given tokens), via alchemy_getAssetTransfers oldest-first.
 */
export function alchemyFirstFunderSource(
  rpcUrl: string,
  tokens: string[],
  log?: { warn: (msg: string) => void },
): FirstFunderSource {
  return async (kind, address) => {
    const result = await alchemyAssetTransfers(
      rpcUrl,
      {
        ...(kind === 'native' ? { category: ['external'] } : { category: ['erc20'], contractAddresses: tokens }),
        order: 'asc',
        maxCount: '0x1',
        excludeZeroValue: true,
        withMetadata: false,
        fromBlock: '0x0',
        toAddress: address.toLowerCase(),
      },
      log,
    );
    const t = result.transfers[0];
    if (!t) return null;
    return { from: t.from.toLowerCase(), hash: t.hash ?? '', block: t.blockNum ? Number(BigInt(t.blockNum)) : 0 };
  };
}

/**
 * USDC/USDT transfers via alchemy_getAssetTransfers on an Alchemy RPC (Base or
 * BNB), with backoff for the free tier's compute-units-per-second limit.
 */
export function alchemyTransferSource(
  rpcUrl: string,
  fromBlock: bigint,
  log?: { warn: (msg: string) => void },
  tokens: string[] = SELLER_STABLECOINS.base,
): TransferSource {
  const call = (params: Record<string, unknown>) => alchemyAssetTransfers(rpcUrl, params, log);
  const rows = (transfers: AlchemyTransfer[]): UsdcTransfer[] =>
    transfers
      .filter((t) => t.to)
      .map((t) => ({ from: t.from.toLowerCase(), to: t.to!.toLowerCase(), usd: Number(t.value ?? 0) }));

  return async (direction, address, filter) => {
    const params = {
      category: ['erc20'],
      contractAddresses: tokens,
      order: 'desc',
      maxCount: `0x${TRANSFER_PAGE.toString(16)}`,
      excludeZeroValue: true,
      withMetadata: false,
      fromBlock: `0x${fromBlock.toString(16)}`,
      [direction === 'in' ? 'toAddress' : 'fromAddress']: address,
    };
    if (!filter) return rows((await call(params)).transfers);

    const kept: UsdcTransfer[] = [];
    let pageKey: string | undefined;
    for (let page = 0; page < HUB_MAX_PAGES; page++) {
      const result = await call(pageKey ? { ...params, pageKey } : params);
      kept.push(...rows(result.transfers).filter((t) => t.usd >= filter.minUsd));
      pageKey = result.pageKey;
      if (kept.length >= filter.atLeast || !pageKey) break;
    }
    return kept;
  };
}
