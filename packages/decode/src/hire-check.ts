// ─── Hire check: wallets you neither own nor fund ─────────────────────────────
//
// BNB Chain's Set and Earn asks a builder for "at least 3 completed hires from 3
// distinct wallets that are not yours and not funded by yours". For every wallet
// that hired an agent, follow its first incoming BNB and its first incoming
// stablecoin back up to 4 hops, do the same for the agent's owner and agent
// wallet, and say how the two connect, if they do within those limits. Method and
// cases: chainward.ai/decodes/set-and-earn-week-one. Describes where money moved,
// never who controls a wallet or why.

import { HUB_INFLOWS, SELLER_BLOCKS_PER_DAY, mapLimit, type FirstFunding, type FundingKind } from './seller-demand.js';

export const HIRE_WINDOW_DAYS = 30;
export const HIRE_MAX_HOPS = 4;
/** Hirers traced per check, by first hire; the rest are reported untraced. */
export const MAX_TRACED_HIRERS = 20;
/** A wallet that has sent this many transactions is an exchange-style hot wallet (the decode's rule). */
export const HUB_NONCE = 100_000;
/** Hirer and owner first funded by the same hub this close together (24h of BSC blocks) is a burst, not two customers. */
export const SAME_HUB_BLOCKS = SELLER_BLOCKS_PER_DAY.bsc;

export type HirerVerdict = 'owner' | 'owner_funded' | 'direct_transfer' | 'shared_funder' | 'independent_within_limits' | 'inconclusive';
export type HireSource = 'termix_escrow' | 'erc8183_shared';

export interface HireEvent {
  source: HireSource;
  hirer: string;
  block: number;
  tx: string;
}

export interface HirerInput {
  address: string;
  hires: number;
  first_hire_at: string;
}

export interface HirerAssessment extends HirerInput {
  verdict: HirerVerdict;
  evidence: string;
  /** From the hirer to whatever ended the check (the owner, a shared funder, a hub). */
  path: string[];
}

export interface HireSummary {
  owner_linked: number;
  inconclusive: number;
  independent_within_limits: number;
  passes_three_independent: boolean;
}

export interface HireReport {
  chain: 'bsc';
  agent_id: number | null;
  agent_ids: number[];
  owner: string;
  agent_wallet: string | null;
  window_days: number;
  hires: { total: number; distinct_hirers: number; by_source: Record<HireSource, number> };
  hirers: HirerAssessment[];
  summary: HireSummary;
  method: string;
  limits: string[];
  as_of: { block: number; time: string };
}

/** Who funded whom, as far as the check can see. Implementations should memoize. */
/** Sender and block of a first incoming transfer; the same-hub rule compares the blocks. */
export type FirstFunder = Pick<FirstFunding, 'from' | 'block'>;

export interface FundingGraph {
  /** Sender and block of the address's first incoming transfer of this kind, or null when there is none. */
  firstFunder(kind: FundingKind, address: string): Promise<FirstFunder | null>;
  /** Whether `from` ever sent `to` BNB or a stablecoin (any amount, any time). */
  hasTransfer(from: string, to: string): Promise<boolean>;
  /** Exchange-style hot wallet, router or custodian: what's behind it isn't visible. */
  isHub(address: string): Promise<boolean>;
  isContract(address: string): Promise<boolean>;
}

const fmt = (n: number) => n.toLocaleString('en-US');

export const HIRE_METHOD =
  `Hires are TermiX escrow OrderCreated events naming the agent as provider and shared ERC-8183 JobCreated events naming the owner or agent wallet as provider, on BNB Chain, in a ${HIRE_WINDOW_DAYS}-day hire window that starts no earlier than Set and Earn's first block. ` +
  `For each distinct hirer the check follows its first incoming BNB and first incoming stablecoin (USDT, USDC) back to their senders, up to ${HIRE_MAX_HOPS} hops, and does the same for the owner and the agent wallet. ` +
  'owner: the hirer is the owner or the agent wallet. owner_funded: the owner or agent wallet is in the hirer\'s trail. ' +
  'direct_transfer: the hirer and the owner or agent wallet sent each other BNB or a stablecoin at any time, in either direction. ' +
  'shared_funder: the hirer\'s trail and the owner\'s (or agent wallet\'s) trail meet at a wallet that is not a hub or a contract, or the hirer is in the owner\'s trail. ' +
  `Trails stop at hubs (${fmt(HUB_INFLOWS)}+ incoming stablecoin transfers of at least $0.01 in ${HIRE_WINDOW_DAYS} days, or ${fmt(HUB_NONCE)}+ sent transactions) and at contracts. ` +
  'inconclusive: the hirer\'s and the owner\'s (or agent wallet\'s) same-kind trails end at the same hub with first funding under 24 hours apart, or no incoming BNB or stablecoin is visible. ' +
  'independent_within_limits: none of these, including trails that end at a hub or a contract (the decode\'s "no link found").';

export const HIRE_LIMITS: string[] = [
  'independent_within_limits means no link was found within these limits; it is not proven independence.',
  `Only each wallet's first incoming BNB and first incoming stablecoin are followed, up to ${HIRE_MAX_HOPS} hops. Later funding, and transfers between hirer and owner after that, are not checked.`,
  'BNB moved by contract-internal calls is not visible to the trail (top-level transfers only).',
  'Trails stop at hubs and contracts and count as no link found: who funded a wallet through an exchange is not visible, so an owner who withdrew from their own exchange account to a hirer is not detected.',
  'Pairwise only: wallets that hire each other inside a closed group can each look unlinked pair by pair (chainward.ai/decodes/set-and-earn-week-one).',
  'Counts hire events (OrderCreated, JobCreated), not completed hires, and does not check which marketplace a hire came from. Hires on other contracts or on BSC testnet are not counted.',
  'Owner and agent wallet are read at the as_of block. For an owner address, its agents are the registry tokens transferred to it in the last 60 days that it still owns.',
  `At most ${MAX_TRACED_HIRERS} hirers are traced per check, in order of first hire.`,
  'Describes where money moved, not who controls a wallet or why. Not a verdict on the agent or its builder.',
];

const KIND_LABEL: Record<FundingKind, string> = { native: 'BNB', stable: 'stablecoin' };
const hops = (n: number) => `${n} hop${n === 1 ? '' : 's'}`;

type TrailStop = 'linked' | 'no_funding' | 'hub' | 'contract' | 'cycle' | 'max_hops';
interface Trail {
  kind: FundingKind;
  /** Funders, nearest first (path[0] sent the start address its first transfer of `kind`). */
  path: string[];
  /** Block of each transfer in `path` (blocks[i] is when path[i] funded the node below it). */
  blocks: number[];
  stop: TrailStop;
}

async function walk(start: string, kind: FundingKind, graph: FundingGraph, targets?: Set<string>): Promise<Trail> {
  const path: string[] = [];
  const blocks: number[] = [];
  const seen = new Set([start]);
  let node = start;
  for (let hop = 1; hop <= HIRE_MAX_HOPS; hop++) {
    const funding = await graph.firstFunder(kind, node);
    if (!funding) return { kind, path, blocks, stop: 'no_funding' };
    const funder = funding.from;
    path.push(funder);
    blocks.push(funding.block);
    if (targets?.has(funder)) return { kind, path, blocks, stop: 'linked' };
    if (seen.has(funder)) return { kind, path, blocks, stop: 'cycle' };
    if (await graph.isContract(funder)) return { kind, path, blocks, stop: 'contract' };
    if (await graph.isHub(funder)) return { kind, path, blocks, stop: 'hub' };
    seen.add(funder);
    node = funder;
  }
  return { kind, path, blocks, stop: 'max_hops' };
}

/** The decode's "same hub, <24h": both same-kind trails end at one hub that funded each side within a day. */
function sameHubBurst(ht: Trail, sides: OwnerSide[]): { side: OwnerSide; hub: string; apart: number } | null {
  if (ht.stop !== 'hub') return null;
  const hub = ht.path[ht.path.length - 1]!;
  const hb = ht.blocks[ht.blocks.length - 1]!;
  for (const side of sides) {
    for (const ot of side.trails) {
      if (ot.kind !== ht.kind || ot.stop !== 'hub' || ot.path[ot.path.length - 1] !== hub) continue;
      const apart = Math.abs(hb - ot.blocks[ot.blocks.length - 1]!);
      if (apart < SAME_HUB_BLOCKS) return { side, hub, apart };
    }
  }
  return null;
}

/** Trail nodes that say something about who funded it: everything but a hub or contract it stopped at. */
function linkNodes(t: Trail): string[] {
  return t.stop === 'hub' || t.stop === 'contract' ? t.path.slice(0, -1) : t.path;
}

function memoGraph(graph: FundingGraph): FundingGraph {
  const memo = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    if (!memo.has(key)) memo.set(key, fn());
    return memo.get(key) as Promise<T>;
  };
  return {
    firstFunder: (kind, a) => once(`f:${kind}:${a}`, () => graph.firstFunder(kind, a)),
    hasTransfer: (a, b) => once(`t:${a}>${b}`, () => graph.hasTransfer(a, b)),
    isHub: (a) => once(`h:${a}`, () => graph.isHub(a)),
    isContract: (a) => once(`c:${a}`, () => graph.isContract(a)),
  };
}

interface OwnerSide {
  address: string;
  label: string;
  trails: Trail[];
}

interface DirectLink {
  address: string;
  label: string;
  direction: 'hirer_to_side' | 'side_to_hirer';
}

/** The decode's "direct transfer": hirer and owner/agent wallet moved BNB or a stablecoin between them, ever. */
async function directLink(h: string, ids: Map<string, string>, graph: FundingGraph): Promise<DirectLink | null> {
  for (const [address, label] of ids) {
    if (await graph.hasTransfer(h, address)) return { address, label, direction: 'hirer_to_side' };
    if (await graph.hasTransfer(address, h)) return { address, label, direction: 'side_to_hirer' };
  }
  return null;
}

function assessOne(
  hirer: HirerInput,
  ids: Map<string, string>,
  hirerTrails: Trail[],
  sides: OwnerSide[],
  direct: DirectLink | null,
): Omit<HirerAssessment, keyof HirerInput> {
  const h = hirer.address;
  const self = ids.get(h);
  if (self) return { verdict: 'owner', evidence: `The hirer is the ${self}.`, path: [h] };

  for (const t of hirerTrails) {
    if (t.stop !== 'linked') continue;
    const reached = t.path[t.path.length - 1]!;
    return {
      verdict: 'owner_funded',
      evidence: `The ${ids.get(reached)} is ${hops(t.path.length)} up the hirer's first-incoming-${KIND_LABEL[t.kind]} trail.`,
      path: [h, ...t.path],
    };
  }

  if (direct) {
    const who = direct.direction === 'hirer_to_side' ? `The hirer sent the ${direct.label}` : `The ${direct.label} sent the hirer`;
    return {
      verdict: 'direct_transfer',
      evidence: `${who} BNB or a stablecoin directly (any amount, any time).`,
      path: [h, direct.address],
    };
  }

  for (const side of sides) {
    for (const t of side.trails) {
      const idx = t.path.indexOf(h);
      if (idx < 0) continue;
      return {
        verdict: 'shared_funder',
        evidence: `The hirer is in the ${side.label}'s funding trail, ${hops(idx + 1)} up its first-incoming-${KIND_LABEL[t.kind]} trail.`,
        path: [h, ...t.path.slice(0, idx).reverse(), side.address],
      };
    }
  }

  for (const ht of hirerTrails) {
    const nodes = linkNodes(ht);
    for (let i = 0; i < nodes.length; i++) {
      for (const side of sides) {
        for (const ot of side.trails) {
          const j = linkNodes(ot).indexOf(nodes[i]!);
          if (j < 0) continue;
          return {
            verdict: 'shared_funder',
            evidence:
              `The hirer's and the ${side.label}'s funding trails meet at ${nodes[i]}, which is not a hub or a contract ` +
              `(hirer: ${hops(i + 1)} up its first-incoming-${KIND_LABEL[ht.kind]} trail; ${side.label}: ${hops(j + 1)} up its first-incoming-${KIND_LABEL[ot.kind]} trail).`,
            path: [h, ...ht.path.slice(0, i + 1), ...ot.path.slice(0, j).reverse(), side.address],
          };
        }
      }
    }
  }

  for (const t of hirerTrails) {
    const burst = sameHubBurst(t, sides);
    if (!burst) continue;
    return {
      verdict: 'inconclusive',
      evidence:
        `The hirer's and the ${burst.side.label}'s first-incoming-${KIND_LABEL[t.kind]} trails both end at the same hub, ${burst.hub}, ` +
        `which funded each side ${burst.apart.toLocaleString('en-US')} blocks apart (under 24 hours); funding behind a hub is not visible.`,
      path: [h, ...t.path, burst.side.address],
    };
  }

  for (const t of hirerTrails) {
    if (t.stop !== 'hub' && t.stop !== 'contract') continue;
    const end = t.path[t.path.length - 1]!;
    const what = t.stop === 'hub' ? 'a hub (exchange-style wallet, router or custodian)' : 'a contract';
    return {
      verdict: 'independent_within_limits',
      evidence:
        `No owner wallet, agent wallet or shared funder within ${hops(HIRE_MAX_HOPS)}. ` +
        `The hirer's first-incoming-${KIND_LABEL[t.kind]} trail stops at ${end}, ${what}, after ${hops(t.path.length)}; funding behind it is not visible.`,
      path: [h, ...t.path],
    };
  }

  if (hirerTrails.every((t) => t.path.length === 0)) {
    return {
      verdict: 'inconclusive',
      evidence: 'No incoming BNB or stablecoin transfer to the hirer is visible (BNB moved by contract-internal calls is not traced).',
      path: [h],
    };
  }

  const longest = hirerTrails.reduce((a, b) => (b.path.length > a.path.length ? b : a));
  return {
    verdict: 'independent_within_limits',
    evidence: `No owner wallet, agent wallet, shared funder, hub or contract within ${hops(HIRE_MAX_HOPS)} of the hirer's first incoming BNB and first incoming stablecoin.`,
    path: [h, ...longest.path],
  };
}

/**
 * Pure apart from the injected graph: one verdict per hirer, in input order.
 * Hirers past `maxTraced` are reported inconclusive and not traced.
 */
export async function assessHirers(input: {
  owner: string;
  agentWallets: string[];
  hirers: HirerInput[];
  graph: FundingGraph;
  maxTraced?: number;
}): Promise<HirerAssessment[]> {
  const graph = memoGraph(input.graph);
  const owner = input.owner.toLowerCase();
  const ids = new Map<string, string>([[owner, 'owner wallet']]);
  for (const w of input.agentWallets) if (!ids.has(w.toLowerCase())) ids.set(w.toLowerCase(), 'agent wallet');
  const targets = new Set(ids.keys());
  const kinds: FundingKind[] = ['native', 'stable'];

  const sides: OwnerSide[] = await Promise.all(
    [...ids].map(async ([address, label]) => ({
      address,
      label,
      trails: await Promise.all(kinds.map((k) => walk(address, k, graph))),
    })),
  );

  const limit = input.maxTraced ?? MAX_TRACED_HIRERS;
  const indexed = input.hirers.map((hirer, i) => ({ hirer, i }));
  return mapLimit(indexed, 3, async ({ hirer, i }): Promise<HirerAssessment> => {
    const h = { ...hirer, address: hirer.address.toLowerCase() };
    if (i >= limit) {
      return {
        ...h,
        verdict: 'inconclusive',
        evidence: `Not traced: this check follows the first ${limit} hirers by first hire.`,
        path: [h.address],
      };
    }
    const self = ids.has(h.address);
    const [trails, direct] = await Promise.all([
      self ? Promise.resolve([]) : Promise.all(kinds.map((k) => walk(h.address, k, graph, targets))),
      self ? Promise.resolve(null) : directLink(h.address, ids, graph),
    ]);
    return { ...h, ...assessOne(h, ids, trails, sides, direct) };
  });
}

export function summarizeHirers(assessments: HirerAssessment[]): HireSummary {
  const count = (...v: HirerVerdict[]) => assessments.filter((a) => v.includes(a.verdict)).length;
  const independent = count('independent_within_limits');
  return {
    owner_linked: count('owner', 'owner_funded', 'direct_transfer', 'shared_funder'),
    inconclusive: count('inconclusive'),
    independent_within_limits: independent,
    passes_three_independent: independent >= 3,
  };
}

/** One row per distinct hirer, ordered by first hire (block), with its hire count across sources. */
export function groupHirers(events: HireEvent[]): Array<{ address: string; hires: number; first_block: number }> {
  const by = new Map<string, { address: string; hires: number; first_block: number }>();
  for (const e of events) {
    const address = e.hirer.toLowerCase();
    const row = by.get(address) ?? { address, hires: 0, first_block: e.block };
    row.hires += 1;
    row.first_block = Math.min(row.first_block, e.block);
    by.set(address, row);
  }
  return [...by.values()].sort((a, b) => a.first_block - b.first_block || a.address.localeCompare(b.address));
}

export function buildHireReport(input: {
  agentIds: number[];
  owner: string;
  agentWallet: string | null;
  events: HireEvent[];
  assessments: HirerAssessment[];
  asOf: { block: number; time: string };
}): HireReport {
  const bySource: Record<HireSource, number> = { termix_escrow: 0, erc8183_shared: 0 };
  for (const e of input.events) bySource[e.source] += 1;
  return {
    chain: 'bsc',
    agent_id: input.agentIds.length === 1 ? input.agentIds[0]! : null,
    agent_ids: input.agentIds,
    owner: input.owner.toLowerCase(),
    agent_wallet: input.agentWallet?.toLowerCase() ?? null,
    window_days: HIRE_WINDOW_DAYS,
    hires: {
      total: input.events.length,
      distinct_hirers: new Set(input.events.map((e) => e.hirer.toLowerCase())).size,
      by_source: bySource,
    },
    hirers: input.assessments,
    summary: summarizeHirers(input.assessments),
    method: HIRE_METHOD,
    limits: HIRE_LIMITS,
    as_of: input.asOf,
  };
}
