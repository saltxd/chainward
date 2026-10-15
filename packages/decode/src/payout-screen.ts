// ─── Payout screen: which wallets on a payout list share a funder ─────────────
//
// chainward.ai/screen: a program sends the list of wallets it is about to pay
// (rewards, cashback, an airdrop) and gets back the groups of wallets that share
// a funder, with the transactions that link each group, and any OFAC hits. For
// every wallet, follow its first incoming native coin and its first incoming
// stablecoin back up to SCREEN_MAX_HOPS funders, stopping at hubs and contracts
// as the hire check does (hire-check.ts). Wallets whose trails meet at one
// wallet, that funded one another, or that were first funded in one transaction
// form a group. Describes where money moved, never who controls a wallet or why.

import { HUB_NONCE } from './hire-check.js';
import { isSanctioned } from './ofac.js';
import { HUB_INFLOWS, mapLimit, type FirstFunding, type FundingKind, type SellerChain } from './seller-demand.js';

/** Funders followed back from each wallet, per kind. Each hop is one transfer lookup. */
export const SCREEN_MAX_HOPS = 2;
/** Wallets traced at once. */
export const SCREEN_CONCURRENCY = 3;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ─── The list ─────────────────────────────────────────────────────────────────

export interface PayoutEntry {
  /** Lowercased. */
  address: string;
  /** What the program plans to pay this wallet, in its own unit; null when the list gives none. */
  amount: number | null;
}

export interface PayoutList {
  entries: PayoutEntry[];
  /** Non-empty lines with no EVM address (a first-line header is skipped, not listed here). */
  invalid: string[];
  /** Addresses listed more than once; their amounts are added up. */
  duplicates: string[];
}

/**
 * A CSV (or tab- or semicolon-separated) payout list: the first EVM address on
 * each line, and the first number after it as the amount. A first line with no
 * address is a header.
 */
export function parsePayoutList(text: string): PayoutList {
  const byAddress = new Map<string, PayoutEntry>();
  const invalid: string[] = [];
  const duplicates = new Set<string>();
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const first = lines.findIndex((l) => l !== '');
  lines.forEach((line, i) => {
    if (line === '') return;
    const fields = line.split(/[,\t;]/).map((f) => f.trim().replace(/^["']|["']$/g, ''));
    const at = fields.findIndex((f) => ADDRESS.test(f));
    if (at < 0) {
      if (i !== first) invalid.push(line);
      return;
    }
    const address = fields[at]!.toLowerCase();
    const amountField = fields.slice(at + 1).find((f) => f !== '' && Number.isFinite(Number(f.replace(/[$_\s]/g, ''))));
    const amount = amountField === undefined ? null : Number(amountField.replace(/[$_\s]/g, ''));
    const prev = byAddress.get(address);
    if (prev) {
      duplicates.add(address);
      if (amount !== null) prev.amount = (prev.amount ?? 0) + amount;
      return;
    }
    byAddress.set(address, { address, amount });
  });
  return { entries: [...byAddress.values()], invalid, duplicates: [...duplicates] };
}

// ─── Funding trails ───────────────────────────────────────────────────────────

/** Where the funding facts come from. Implementations may throw (a budget, a transport error): the wallet is then reported untraced. */
export interface ScreenFundingSource {
  /** Sender, transaction and block of the address's first incoming transfer of this kind, or null when there is none. */
  firstFunding(kind: FundingKind, address: string): Promise<FirstFunding | null>;
  /** Exchange-style hot wallet, faucet, router or custodian: what's behind it isn't visible. */
  isHub(address: string): Promise<boolean>;
  isContract(address: string): Promise<boolean>;
}

/**
 * listed: the funder is another wallet on the list. mint: the transfer came
 * from the zero address (a mint, or a bridge that mints). not_traced: a lookup
 * failed, so the trail is incomplete.
 */
export type TrailStop = 'listed' | 'no_funding' | 'mint' | 'hub' | 'contract' | 'cycle' | 'max_hops' | 'not_traced';

export interface TrailHop {
  from: string;
  tx: string;
  block: number;
}

export interface ScreenTrail {
  kind: FundingKind;
  /** Funders, nearest first: hops[0] sent the wallet its first transfer of `kind`. */
  hops: TrailHop[];
  stop: TrailStop;
}

function memoSource(source: ScreenFundingSource): ScreenFundingSource {
  const memo = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    if (!memo.has(key)) memo.set(key, fn());
    return memo.get(key) as Promise<T>;
  };
  return {
    firstFunding: (kind, a) => once(`f:${kind}:${a}`, () => source.firstFunding(kind, a)),
    isHub: (a) => once(`h:${a}`, () => source.isHub(a)),
    isContract: (a) => once(`c:${a}`, () => source.isContract(a)),
  };
}

async function walk(start: string, kind: FundingKind, source: ScreenFundingSource, listed: Set<string>, maxHops: number): Promise<ScreenTrail> {
  const hops: TrailHop[] = [];
  const seen = new Set([start]);
  let node = start;
  try {
    for (let hop = 1; hop <= maxHops; hop++) {
      const funding = await source.firstFunding(kind, node);
      if (!funding) return { kind, hops, stop: 'no_funding' };
      const from = funding.from.toLowerCase();
      hops.push({ from, tx: funding.hash.toLowerCase(), block: funding.block });
      if (from === ZERO_ADDRESS) return { kind, hops, stop: 'mint' };
      if (seen.has(from)) return { kind, hops, stop: 'cycle' };
      if (listed.has(from)) return { kind, hops, stop: 'listed' };
      if (await source.isContract(from)) return { kind, hops, stop: 'contract' };
      if (await source.isHub(from)) return { kind, hops, stop: 'hub' };
      seen.add(from);
      node = from;
    }
    return { kind, hops, stop: 'max_hops' };
  } catch {
    return { kind, hops, stop: 'not_traced' };
  }
}

/** Both funding trails of every wallet, keyed by address. Lookups are shared across wallets. */
export async function traceWallets(
  wallets: string[],
  source: ScreenFundingSource,
  opts: { maxHops?: number; concurrency?: number; onWallet?: (done: number) => void } = {},
): Promise<Map<string, ScreenTrail[]>> {
  const memo = memoSource(source);
  const listed = new Set(wallets);
  const maxHops = opts.maxHops ?? SCREEN_MAX_HOPS;
  let done = 0;
  const trails = await mapLimit(wallets, opts.concurrency ?? SCREEN_CONCURRENCY, async (w) => {
    const both = [await walk(w, 'native', memo, listed, maxHops), await walk(w, 'stable', memo, listed, maxHops)];
    opts.onWallet?.(++done);
    return both;
  });
  return new Map(wallets.map((w, i) => [w, trails[i]!]));
}

// ─── Groups ───────────────────────────────────────────────────────────────────

/**
 * shared_funder: the wallets' trails meet at `via`, which is not a hub, a
 * contract or the zero address. listed_funder: `via` is itself on the list and
 * is in the others' trails. same_tx: one transaction (`txs[0]`, sent by `via`)
 * was the first funding of each wallet.
 */
export type LinkKind = 'shared_funder' | 'listed_funder' | 'same_tx';

export interface GroupLink {
  kind: LinkKind;
  funding: FundingKind;
  via: string;
  /** Listed wallets the link joins (for listed_funder, `via` included). */
  wallets: string[];
  /** The transactions that make the link: every hop from each wallet up to `via`. */
  txs: string[];
  /** How far up the farthest wallet's trail `via` is: 1 = it sent the wallet its first transfer. */
  hops: number;
}

export interface ScreenGroup {
  /** 1 = look at first: the largest amount, else the most wallets. */
  rank: number;
  wallets: string[];
  amount: number | null;
  /** Of the whole list's amount. */
  amount_share: number | null;
  links: GroupLink[];
  link_kinds: LinkKind[];
  /** Linked through both the native-coin and the stablecoin trails. */
  both_kinds: boolean;
  sanctioned: string[];
}

export interface PayoutScreenReport {
  chain: SellerChain;
  generated_at: string;
  max_hops: number;
  wallets: {
    listed: number;
    invalid: number;
    duplicates: number;
    /** At least one trail incomplete because a lookup failed. */
    not_traced: number;
    /** No incoming native coin or stablecoin visible at all. */
    no_funding: number;
  };
  summary: {
    groups: number;
    grouped_wallets: number;
    grouped_share: number;
    largest_group: number;
    amount_total: number | null;
    grouped_amount: number | null;
    grouped_amount_share: number | null;
    sanctioned: string[];
    /** Funders in any trail that are on the OFAC list, with the listed wallets they funded. */
    sanctioned_funders: Array<{ address: string; wallets: string[] }>;
  };
  groups: ScreenGroup[];
  /** How each trail ended, over every wallet and both kinds. */
  trail_stops: Record<TrailStop, number>;
  invalid_lines: string[];
  method: string;
  limits: string[];
}

const KIND_LABEL: Record<FundingKind, string> = { native: 'native coin', stable: 'stablecoin' };
const round = (n: number) => Math.round(n * 10_000) / 10_000;
const fmt = (n: number) => n.toLocaleString('en-US');

export const screenMethod = (maxHops: number = SCREEN_MAX_HOPS): string =>
  `For every listed wallet the screen follows its first incoming native coin (ETH on Base, BNB on BNB Chain) and its first incoming stablecoin (USDC on Base, USDT or USDC on BNB Chain) back to their senders, up to ${maxHops} funder${maxHops === 1 ? '' : 's'}. ` +
  `A trail stops at a hub (${fmt(HUB_NONCE)}+ sent transactions, or ${fmt(HUB_INFLOWS)}+ incoming stablecoin transfers of at least $0.01 in 30 days), at a contract, at a mint or bridge (the zero address), and at another listed wallet. ` +
  'shared_funder: two or more wallets\' trails meet at a wallet that is not a hub or a contract. listed_funder: a listed wallet is in other listed wallets\' trails. ' +
  'same_tx: one transaction was the first funding of two or more listed wallets. ' +
  'Wallets joined by any of these links, directly or through each other, form one group. Groups are ranked by the amount they would receive, else by size.';

export const SCREEN_LIMITS: string[] = [
  'A shared funder is not proof that one person controls the wallets. Teams, families and services fund wallets too.',
  "Only each wallet's first incoming native coin and first incoming stablecoin are followed. Later funding, and transfers between listed wallets after that, are not checked.",
  'Trails stop at exchange hot wallets, faucets and other hubs, at contracts, and at mints and bridges: money that passed through one is not followed further, so wallets funded from the same exchange are not grouped, even minutes apart.',
  'Native coin moved by contract-internal calls is not visible (top-level transfers only).',
  'A batch payout by a program or a service can fund many wallets in one transaction. same_tx links name the sender so you can judge.',
  'OFAC hits are listed wallets and funders in their trails on the sanctions list in use when the screen ran.',
  'Counts are addresses, not people. Use the result as a list to review, not an automatic ban list. This is on-chain analysis, not compliance advice.',
];

/** Disjoint sets over listed wallets. */
function unionFind(items: string[]) {
  const parent = new Map(items.map((a) => [a, a]));
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(a, r);
    return r;
  };
  return {
    find,
    union: (a: string, b: string) => {
      const [ra, rb] = [find(a), find(b)];
      if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
    },
  };
}

/** Trail nodes that say who funded it: every funder but a hub, contract or mint the trail stopped at. */
function linkHops(t: ScreenTrail): TrailHop[] {
  return t.stop === 'hub' || t.stop === 'contract' || t.stop === 'mint' ? t.hops.slice(0, -1) : t.hops;
}

/**
 * Every link between listed wallets the trails show. A funder that links
 * exactly the wallets a nearer funder of the same kind links (the funder's own
 * funder, say) adds nothing and is left out.
 */
export function findLinks(trails: Map<string, ScreenTrail[]>): GroupLink[] {
  const listed = new Set(trails.keys());
  // funding kind + node -> wallet -> the transactions from that wallet up to the node
  const byNode = new Map<string, Map<string, string[]>>();
  // funding kind + first-funding tx -> sender and wallets
  const byTx = new Map<string, { via: string; wallets: Set<string> }>();

  for (const [wallet, ts] of trails) {
    for (const t of ts) {
      const hops = linkHops(t);
      hops.forEach((hop, i) => {
        const key = `${t.kind}:${hop.from}`;
        const members = byNode.get(key) ?? new Map<string, string[]>();
        if (!members.has(wallet)) members.set(wallet, hops.slice(0, i + 1).map((h) => h.tx));
        byNode.set(key, members);
      });
      const first = t.hops[0];
      if (first?.tx) {
        const key = `${t.kind}:${first.tx}`;
        const entry = byTx.get(key) ?? { via: first.from, wallets: new Set<string>() };
        entry.wallets.add(wallet);
        byTx.set(key, entry);
      }
    }
  }

  // funding kind + joined wallets -> the nearest funder link for exactly those wallets
  const funderLinks = new Map<string, GroupLink>();
  for (const [key, members] of byNode) {
    const [kind, via] = key.split(':') as [FundingKind, string];
    const isListed = listed.has(via);
    const wallets = [...members.keys()].filter((w) => w !== via).sort();
    if (wallets.length < (isListed ? 1 : 2)) continue;
    const link: GroupLink = {
      kind: isListed ? 'listed_funder' : 'shared_funder',
      funding: kind,
      via,
      wallets: isListed ? [via, ...wallets] : wallets,
      txs: [...new Set(wallets.flatMap((w) => members.get(w)!))],
      hops: Math.max(...wallets.map((w) => members.get(w)!.length)),
    };
    const same = `${kind}:${[...link.wallets].sort().join(',')}`;
    const prev = funderLinks.get(same);
    if (!prev || link.hops < prev.hops) funderLinks.set(same, link);
  }
  const links = [...funderLinks.values()];
  for (const [key, { via, wallets }] of byTx) {
    if (wallets.size < 2) continue;
    links.push({ kind: 'same_tx', funding: key.split(':')[0] as FundingKind, via, wallets: [...wallets].sort(), txs: [key.slice(key.indexOf(':') + 1)], hops: 1 });
  }
  return links;
}

export function buildPayoutScreen(input: {
  chain: SellerChain;
  list: PayoutList;
  trails: Map<string, ScreenTrail[]>;
  generatedAt: string;
  maxHops?: number;
}): PayoutScreenReport {
  const { list, trails } = input;
  const amounts = new Map(list.entries.map((e) => [e.address, e.amount]));
  const hasAmounts = list.entries.some((e) => e.amount !== null);
  const amountOf = (ws: string[]) => ws.reduce((a, w) => a + (amounts.get(w) ?? 0), 0);
  const amountTotal = hasAmounts ? amountOf(list.entries.map((e) => e.address)) : null;
  const share = (n: number) => (amountTotal ? round(n / amountTotal) : null);

  const links = findLinks(trails);
  const uf = unionFind([...trails.keys()]);
  for (const l of links) for (const w of l.wallets.slice(1)) uf.union(l.wallets[0]!, w);

  const members = new Map<string, string[]>();
  for (const w of trails.keys()) {
    const root = uf.find(w);
    members.set(root, [...(members.get(root) ?? []), w]);
  }
  const groups: ScreenGroup[] = [...members.values()]
    .filter((ws) => ws.length >= 2)
    .map((ws) => {
      const wallets = ws.sort();
      const root = uf.find(wallets[0]!);
      const groupLinks = links.filter((l) => uf.find(l.wallets[0]!) === root);
      const amount = hasAmounts ? amountOf(wallets) : null;
      return {
        rank: 0,
        wallets,
        amount,
        amount_share: amount === null ? null : share(amount),
        links: groupLinks,
        link_kinds: [...new Set(groupLinks.map((l) => l.kind))],
        both_kinds: new Set(groupLinks.map((l) => l.funding)).size === 2,
        sanctioned: wallets.filter((w) => isSanctioned(w)),
      };
    })
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0) || b.wallets.length - a.wallets.length || (a.wallets[0]! < b.wallets[0]! ? -1 : 1));
  groups.forEach((g, i) => (g.rank = i + 1));

  const trailStops = Object.fromEntries(
    (['listed', 'no_funding', 'mint', 'hub', 'contract', 'cycle', 'max_hops', 'not_traced'] as TrailStop[]).map((s) => [s, 0]),
  ) as Record<TrailStop, number>;
  const sanctionedFunders = new Map<string, Set<string>>();
  let notTraced = 0;
  let noFunding = 0;
  for (const [wallet, ts] of trails) {
    for (const t of ts) {
      trailStops[t.stop] += 1;
      for (const h of t.hops) {
        if (h.from !== ZERO_ADDRESS && isSanctioned(h.from)) sanctionedFunders.set(h.from, (sanctionedFunders.get(h.from) ?? new Set()).add(wallet));
      }
    }
    if (ts.some((t) => t.stop === 'not_traced')) notTraced += 1;
    if (ts.every((t) => t.stop === 'no_funding' && t.hops.length === 0)) noFunding += 1;
  }

  const grouped = groups.flatMap((g) => g.wallets);
  const listedCount = list.entries.length;
  return {
    chain: input.chain,
    generated_at: input.generatedAt,
    max_hops: input.maxHops ?? SCREEN_MAX_HOPS,
    wallets: { listed: listedCount, invalid: list.invalid.length, duplicates: list.duplicates.length, not_traced: notTraced, no_funding: noFunding },
    summary: {
      groups: groups.length,
      grouped_wallets: grouped.length,
      grouped_share: listedCount ? round(grouped.length / listedCount) : 0,
      largest_group: Math.max(0, ...groups.map((g) => g.wallets.length)),
      amount_total: amountTotal,
      grouped_amount: hasAmounts ? amountOf(grouped) : null,
      grouped_amount_share: hasAmounts ? share(amountOf(grouped)) : null,
      sanctioned: list.entries.map((e) => e.address).filter((a) => isSanctioned(a)),
      sanctioned_funders: [...sanctionedFunders].map(([address, ws]) => ({ address, wallets: [...ws].sort() })),
    },
    groups,
    trail_stops: trailStops,
    invalid_lines: list.invalid,
    method: screenMethod(input.maxHops),
    limits: SCREEN_LIMITS,
  };
}

// ─── The report a program reads ───────────────────────────────────────────────

const CHAIN_NAME: Record<SellerChain, string> = { base: 'Base', bsc: 'BNB Chain' };
const EXPLORER: Record<SellerChain, string> = { base: 'https://basescan.org', bsc: 'https://bscscan.com' };
/** Wallets and links printed per group, and transactions per link; the JSON has all of them. */
const MD_MAX_ROWS = 25;
const MD_MAX_TXS = 10;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (n: number | null) => (n === null ? '' : `${(n * 100).toFixed(1)}%`);
const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const LINK_LABEL: Record<LinkKind, string> = { shared_funder: 'shared funder', listed_funder: 'funded by a listed wallet', same_tx: 'same funding transaction' };

/** The one-page summary first, then each group with the transactions that link it, then method and limits. */
export function renderPayoutScreen(r: PayoutScreenReport): string {
  const x = EXPLORER[r.chain];
  const addr = (a: string) => `[${short(a)}](${x}/address/${a})`;
  const tx = (h: string) => `[${h.slice(0, 10)}…](${x}/tx/${h})`;
  const s = r.summary;
  const out: string[] = [];

  out.push(`# Payout list screen: ${CHAIN_NAME[r.chain]}`, '', `Screened ${r.generated_at.slice(0, 10)}. ${fmt(r.wallets.listed)} wallets.`, '');
  out.push('## Summary', '');
  out.push(`- **${fmt(s.grouped_wallets)} of ${fmt(r.wallets.listed)} wallets (${pct(s.grouped_share)}) fall into ${fmt(s.groups)} group${s.groups === 1 ? '' : 's'} that share a funder.**`);
  if (s.groups > 0) out.push(`- The largest group has ${fmt(s.largest_group)} wallets.`);
  if (s.amount_total !== null && s.grouped_amount !== null) {
    out.push(`- Grouped wallets would receive ${money(s.grouped_amount)} of ${money(s.amount_total)} (${pct(s.grouped_amount_share)}).`);
  }
  out.push(
    s.sanctioned.length > 0
      ? `- **OFAC: ${s.sanctioned.length} listed wallet${s.sanctioned.length === 1 ? ' is' : 's are'} on the sanctions list:** ${s.sanctioned.map(addr).join(', ')}.`
      : '- OFAC: no listed wallet is on the sanctions list.',
  );
  if (s.sanctioned_funders.length > 0) {
    out.push(`- **OFAC: ${s.sanctioned_funders.length} funder${s.sanctioned_funders.length === 1 ? '' : 's'} in the trails ${s.sanctioned_funders.length === 1 ? 'is' : 'are'} on the sanctions list** (${s.sanctioned_funders.map((f) => `${addr(f.address)}, ${f.wallets.length} wallet${f.wallets.length === 1 ? '' : 's'}`).join('; ')}).`);
  }
  const gaps: string[] = [];
  if (r.wallets.not_traced) gaps.push(`${fmt(r.wallets.not_traced)} could not be fully traced`);
  if (r.wallets.no_funding) gaps.push(`${fmt(r.wallets.no_funding)} have no incoming funds visible`);
  if (r.wallets.invalid) gaps.push(`${fmt(r.wallets.invalid)} lines had no wallet address`);
  if (r.wallets.duplicates) gaps.push(`${fmt(r.wallets.duplicates)} wallets were listed twice or more (amounts added up)`);
  if (gaps.length) out.push(`- Gaps: ${gaps.join('; ')}.`);
  out.push('');

  if (r.groups.length > 0) {
    out.push('## Look at these first', '');
    out.push(`| # | Wallets |${s.amount_total !== null ? ' Amount (share) |' : ''} Linked by |`);
    out.push(`|---:|---:|${s.amount_total !== null ? '---:|' : ''}---|`);
    for (const g of r.groups.slice(0, 10)) {
      const amount = g.amount !== null ? ` ${money(g.amount)} (${pct(g.amount_share)}) |` : '';
      const how = g.link_kinds.map((k) => LINK_LABEL[k]).join(', ') + (g.both_kinds ? '; native coin and stablecoin' : '');
      out.push(`| ${g.rank} | ${fmt(g.wallets.length)} |${amount} ${how} |`);
    }
    out.push('');

    out.push('## Groups', '');
    for (const g of r.groups) {
      out.push(`### Group ${g.rank}: ${fmt(g.wallets.length)} wallets${g.amount !== null ? `, ${money(g.amount)} (${pct(g.amount_share)})` : ''}`, '');
      if (g.sanctioned.length) out.push(`**On the OFAC list:** ${g.sanctioned.map(addr).join(', ')}`, '');
      out.push('Linked by:', '');
      for (const l of g.links.slice(0, MD_MAX_ROWS)) {
        const via = l.kind === 'same_tx' ? `sent by ${addr(l.via)}` : `${addr(l.via)}, ${l.hops === 1 ? 'the direct funder' : `up to ${l.hops} hops up`}`;
        const txs = l.txs.slice(0, MD_MAX_TXS).map(tx).join(', ') + (l.txs.length > MD_MAX_TXS ? `, and ${fmt(l.txs.length - MD_MAX_TXS)} more` : '');
        out.push(`- **${LINK_LABEL[l.kind]}** (${KIND_LABEL[l.funding]}), ${via}: ${fmt(l.wallets.length)} wallets. Transactions: ${txs}`);
      }
      if (g.links.length > MD_MAX_ROWS) out.push(`- and ${fmt(g.links.length - MD_MAX_ROWS)} more links (all in payout-screen.json)`);
      out.push('', 'Wallets:', '');
      for (const w of g.wallets.slice(0, MD_MAX_ROWS)) out.push(`- ${addr(w)}`);
      if (g.wallets.length > MD_MAX_ROWS) out.push(`- and ${fmt(g.wallets.length - MD_MAX_ROWS)} more (all in payout-screen.json)`);
      out.push('');
    }
  }

  out.push('## Method', '', r.method, '');
  out.push('## Limits', '', ...r.limits.map((l) => `- ${l}`), '');
  return out.join('\n');
}
