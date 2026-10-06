// ─── Set and Earn board: every new BSC agent that has been hired ─────────────
//
// BNB Chain's Set and Earn (Oct 1 – Nov 5 2026) asks each builder's agent for
// "at least 3 completed hires from 3 distinct wallets that are not yours and not
// funded by yours". The board lists every ERC-8004 agent registered on BSC
// mainnet since the campaign opened that has at least one hire, and the hire
// check's verdict (hire-check.ts) for those with 3+ distinct hirers. This file
// is the pure part: decoding registry and marketplace logs into registrations,
// hires and completions, and assembling the board. The indexer worker
// (packages/indexer/src/workers/setAndEarnBoard.ts) scans, caches and traces.
// Event layouts and the marketplace rule: deliverables/set-and-earn-week-one.

import type { RpcLog } from './data-fetch.js';
import { HIRE_LIMITS, groupHirers, type HireEvent, type HireSource, type HireSummary } from './hire-check.js';
import {
  BSC_IDENTITY_REGISTRY,
  ERC8183_BSC_KERNEL,
  JOB_CREATED_TOPIC,
  ORDER_CREATED_TOPIC,
  SET_AND_EARN_START_BLOCK,
  TERMIX_BSC_ESCROWS,
  decodeHireLog,
} from './hire-sources.js';

export const SET_AND_EARN_START = '2026-10-01T00:00:00Z';
export const SET_AND_EARN_END = '2026-11-05T23:59:59Z';
/** Rows on the board; the totals cover every agent. */
export const BOARD_MAX_ROWS = 500;
/** The campaign's bar, and the point at which the board runs the hire check. */
export const MIN_DISTINCT_HIRERS = 3;
/** Stored agentURI length: the marketplace and card name are read from the whole URI first. */
const STORED_URI_CHARS = 256;
const NAME_CHARS = 120;

/** Registered(uint256 indexed agentId, string agentURI, address indexed owner) */
export const REGISTERED_TOPIC = '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a';
/** URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy) */
export const URI_UPDATED_TOPIC = '0x3a2c7fffc2cba7582c690e3b82c453ea02a308326a98a3ad7576c606336409fb';
/** MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue) */
export const METADATA_SET_TOPIC = '0x2c149ed548c6d2993cd73efe187df6eccabe4538091b33adbd25fafdb8a1468b';
/** keccak256("agentWallet"): MetadataSet's indexed key. Set at registration, emptied when the agent is transferred. */
export const AGENT_WALLET_KEY_TOPIC = '0x2ac6109326e720d1435c0db66f7e35eda7839f52b6f1f5520a60788e132b4e39';
/** ERC-721 Transfer(address indexed from, address indexed to, uint256 indexed tokenId) */
export const ERC721_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
/** TermiX OrderSettled(bytes32 indexed orderId, bool providerUpheld, uint256 clientAmount, uint256 providerAmount, uint256 feeAmount) */
export const ORDER_SETTLED_TOPIC = '0xdd533cd5141138294c3af311a217f94675d6ab3f45a7eee05943a2d51058e1a7';
/** ERC-8183 JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason) */
export const JOB_COMPLETED_TOPIC = '0x0fd54bd364fa9e67f17b091aefe930932c09fe7651cf5ad02c71a418f3341444';

/** Registry events the board reads, for one eth_getLogs filter. */
export const REGISTRY_TOPICS = [REGISTERED_TOPIC, URI_UPDATED_TOPIC, ERC721_TRANSFER_TOPIC, METADATA_SET_TOPIC];
/** Marketplace contracts and events the board reads, for one eth_getLogs filter. */
export const HIRE_CONTRACTS = [...TERMIX_BSC_ESCROWS, ERC8183_BSC_KERNEL];
export const HIRE_TOPICS = [ORDER_CREATED_TOPIC, ORDER_SETTLED_TOPIC, JOB_CREATED_TOPIC, JOB_COMPLETED_TOPIC];

// ─── Marketplace of an agent ──────────────────────────────────────────────────

export type SetAndEarnMarketplace =
  | 'termix'
  | 'agent_souk'
  | 'dolphin'
  | 'hellofugu'
  | 'kattegat'
  | 'marque'
  | 'pokter'
  | 'agent_atlas'
  | 'mandate'
  | 'other'
  | 'none';

/** The nine campaign marketplaces, keyed by the host fragment the decode matched, in its order. */
const CAMPAIGN_HOSTS: Array<[string, SetAndEarnMarketplace]> = [
  ['termix', 'termix'],
  ['agentsouk', 'agent_souk'],
  ['dolphinamp', 'dolphin'],
  ['hellofugu', 'hellofugu'],
  ['kattegat', 'kattegat'],
  ['marque', 'marque'],
  ['pokter', 'pokter'],
  ['agent-atlas', 'agent_atlas'],
  ['mandatemarkets', 'mandate'],
];
export const CAMPAIGN_MARKETPLACES: readonly SetAndEarnMarketplace[] = CAMPAIGN_HOSTS.map(([, m]) => m);

/** Where an agent's card lives, as the week-one decode classified it: a campaign host anywhere in the agentURI. */
export function classifyMarketplace(agentUri: string): SetAndEarnMarketplace {
  const u = agentUri.toLowerCase();
  for (const [host, marketplace] of CAMPAIGN_HOSTS) if (u.includes(host)) return marketplace;
  return agentUri === '' ? 'none' : 'other';
}

function inlineCard(agentUri: string): Record<string, unknown> | null {
  try {
    let json: string | null = null;
    if (agentUri.startsWith('data:application/json;base64,')) {
      const b64 = agentUri.slice(agentUri.indexOf(',') + 1);
      if (!/^[A-Za-z0-9+/=_-]*$/.test(b64)) return null;
      json = Buffer.from(b64, 'base64').toString('utf8');
    } else if (agentUri.startsWith('data:application/json,')) {
      json = decodeURIComponent(agentUri.slice(agentUri.indexOf(',') + 1));
    } else if (agentUri.trimStart().startsWith('{')) {
      json = agentUri;
    }
    const card: unknown = json === null ? null : JSON.parse(json);
    return card && typeof card === 'object' && !Array.isArray(card) ? (card as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The `name` on an inline (data: or raw JSON) agent card; null for a hosted card. */
export function inlineCardName(agentUri: string): string | null {
  const name = inlineCard(agentUri)?.name;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, NAME_CHARS) : null;
}

// ─── Registrations ────────────────────────────────────────────────────────────

export type LogWithData = RpcLog & { data: string };

export interface AgentRegistration {
  agent_id: number;
  /** Current owner, from Registered and later Transfer events. */
  owner: string;
  /** Current agent wallet, from MetadataSet("agentWallet"); null when unset or cleared by a transfer. */
  agent_wallet: string | null;
  /** First 256 characters of the latest agentURI. */
  agent_uri: string;
  name: string | null;
  marketplace: SetAndEarnMarketplace;
  registered_block: number;
  /** Block time of registered_block; filled in when the agent first makes the board. */
  registered_at: string | null;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const topicToAddress = (t: string) => '0x' + t.slice(-40).toLowerCase();
const topicToNumber = (t: string) => Number(BigInt(t));
const logOrder = (a: RpcLog, b: RpcLog) =>
  Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || Number(BigInt(a.logIndex) - BigInt(b.logIndex));

/** The bytes of the ABI-encoded dynamic value (string or bytes) at head word `index`. */
function abiDynamic(data: string, index: number): Buffer {
  const buf = Buffer.from(data.replace(/^0x/, ''), 'hex');
  const offset = Number(BigInt('0x' + buf.subarray(index * 32, index * 32 + 32).toString('hex')));
  const length = Number(BigInt('0x' + buf.subarray(offset, offset + 32).toString('hex')));
  return buf.subarray(offset + 32, offset + 32 + length);
}

function abiString(data: string, index: number): string {
  try {
    return abiDynamic(data, index).toString('utf8');
  } catch {
    return '';
  }
}

function describeUri(uri: string): Pick<AgentRegistration, 'agent_uri' | 'name' | 'marketplace'> {
  return { agent_uri: uri.slice(0, STORED_URI_CHARS), name: inlineCardName(uri), marketplace: classifyMarketplace(uri) };
}

/**
 * Applies Identity registry logs, in block order, to the registrations map:
 * Registered (from Set and Earn's first block, through `lastBlock` once the
 * campaign has closed) adds an agent; URIUpdated, Transfer and
 * MetadataSet("agentWallet") update one already in the map. Returns the ids it changed.
 */
export function applyRegistryLogs(
  regs: Map<number, AgentRegistration>,
  logs: LogWithData[],
  opts: { lastBlock?: number } = {},
): Set<number> {
  const lastBlock = opts.lastBlock ?? Infinity;
  const registry = BSC_IDENTITY_REGISTRY.toLowerCase();
  const changed = new Set<number>();
  for (const log of [...logs].sort(logOrder)) {
    if (log.address.toLowerCase() !== registry || !log.topics[1]) continue;
    const block = Number(BigInt(log.blockNumber));
    const t0 = log.topics[0];
    if (t0 === REGISTERED_TOPIC && log.topics[2]) {
      if (block < SET_AND_EARN_START_BLOCK || block > lastBlock) continue;
      const id = topicToNumber(log.topics[1]);
      const prev = regs.get(id);
      regs.set(id, {
        agent_id: id,
        owner: topicToAddress(log.topics[2]),
        agent_wallet: null,
        ...describeUri(abiString(log.data, 0)),
        registered_block: block,
        registered_at: prev?.registered_block === block ? prev.registered_at : null,
      });
      changed.add(id);
      continue;
    }
    if (t0 === ERC721_TRANSFER_TOPIC) {
      const id = log.topics[3] ? topicToNumber(log.topics[3]) : NaN;
      const reg = regs.get(id);
      if (!reg || !log.topics[2] || topicToAddress(log.topics[1]) === ZERO_ADDRESS) continue;
      reg.owner = topicToAddress(log.topics[2]);
      changed.add(id);
      continue;
    }
    const id = topicToNumber(log.topics[1]);
    const reg = regs.get(id);
    if (!reg) continue;
    if (t0 === URI_UPDATED_TOPIC) {
      Object.assign(reg, describeUri(abiString(log.data, 0)));
      changed.add(id);
    } else if (t0 === METADATA_SET_TOPIC && log.topics[2] === AGENT_WALLET_KEY_TOPIC) {
      let value: Buffer;
      try {
        value = abiDynamic(log.data, 1);
      } catch {
        continue;
      }
      const wallet = value.length >= 20 ? '0x' + value.subarray(value.length - 20).toString('hex') : null;
      reg.agent_wallet = wallet && wallet !== ZERO_ADDRESS ? wallet : null;
      changed.add(id);
    }
  }
  return changed;
}

// ─── Hires and completions ────────────────────────────────────────────────────

export interface BoardHire extends HireEvent {
  log_index: number;
  /** Escrow or kernel that recorded the hire, lowercased. */
  contract: string;
  /** TermiX orderId or ERC-8183 jobId, as its 32-byte topic. */
  job: string;
  /** TermiX: the hired agent's id. */
  agent_id: number | null;
  /** ERC-8183: the provider address (an owner or agent wallet). */
  provider: string | null;
}

export const hireKey = (h: Pick<BoardHire, 'tx' | 'log_index'>) => `${h.tx}:${h.log_index}`;
export const jobKey = (contract: string, job: string) => `${contract.toLowerCase()}:${job.toLowerCase()}`;

/**
 * Hire events and completions from TermiX escrow and ERC-8183 kernel logs, in
 * block order. TermiX orders are kept only for campaign agents (the registry is
 * scanned to the same block first); every ERC-8183 job is kept, since its
 * provider is an address that is matched to agents when the board is built.
 * A completion (OrderSettled, JobCompleted) is kept only for a known hire.
 */
export function applyHireLogs(input: {
  logs: LogWithData[];
  isCampaignAgent: (agentId: number) => boolean;
  /** jobKey of every hire already stored. */
  knownJobs: Set<string>;
}): { hires: BoardHire[]; completions: string[] } {
  const escrows = new Set(TERMIX_BSC_ESCROWS.map((a) => a.toLowerCase()));
  const kernel = ERC8183_BSC_KERNEL.toLowerCase();
  const known = new Set(input.knownJobs);
  const hires: BoardHire[] = [];
  const completions: string[] = [];
  for (const log of [...input.logs].sort(logOrder)) {
    const contract = log.address.toLowerCase();
    const isEscrow = escrows.has(contract);
    if ((!isEscrow && contract !== kernel) || !log.topics[1]) continue;
    const t0 = log.topics[0];
    const job = log.topics[1].toLowerCase();
    if (t0 === ORDER_SETTLED_TOPIC || t0 === JOB_COMPLETED_TOPIC) {
      if ((t0 === ORDER_SETTLED_TOPIC) === isEscrow && known.has(jobKey(contract, job))) completions.push(jobKey(contract, job));
      continue;
    }
    if ((t0 === ORDER_CREATED_TOPIC) !== isEscrow || !log.topics[3]) continue;
    const event = decodeHireLog(log);
    if (!event || event.block < SET_AND_EARN_START_BLOCK) continue;
    const agentId = isEscrow ? topicToNumber(log.topics[3]) : null;
    if (agentId !== null && !input.isCampaignAgent(agentId)) continue;
    hires.push({
      ...event,
      log_index: Number(BigInt(log.logIndex)),
      contract,
      job,
      agent_id: agentId,
      provider: isEscrow ? null : topicToAddress(log.topics[3]),
    });
    known.add(jobKey(contract, job));
  }
  return { hires, completions };
}

// ─── Per-agent counts ─────────────────────────────────────────────────────────

export interface AgentHireStats {
  agent_id: number;
  hires: BoardHire[];
  hires_total: number;
  completed: number;
  distinct_hirers: number;
  by_source: Record<HireSource, number>;
}

/**
 * Each campaign agent's hires: TermiX by agent id; ERC-8183 by provider, for
 * every agent whose current owner or agent wallet is that provider (as the
 * paid check counts them). Agents with no hire are absent.
 */
export function hiresByAgent(
  regs: Map<number, AgentRegistration>,
  hires: BoardHire[],
  completions: Set<string>,
): Map<number, AgentHireStats> {
  const byProvider = new Map<string, number[]>();
  const link = (address: string, id: number) => {
    const ids = byProvider.get(address) ?? [];
    if (!ids.includes(id)) ids.push(id);
    byProvider.set(address, ids);
  };
  for (const r of regs.values()) {
    link(r.owner, r.agent_id);
    if (r.agent_wallet) link(r.agent_wallet, r.agent_id);
  }

  const stats = new Map<number, AgentHireStats>();
  for (const h of hires) {
    const ids = h.agent_id !== null ? (regs.has(h.agent_id) ? [h.agent_id] : []) : (byProvider.get(h.provider ?? '') ?? []);
    for (const id of ids) {
      const s = stats.get(id) ?? {
        agent_id: id,
        hires: [],
        hires_total: 0,
        completed: 0,
        distinct_hirers: 0,
        by_source: { termix_escrow: 0, erc8183_shared: 0 },
      };
      s.hires.push(h);
      s.hires_total += 1;
      if (completions.has(jobKey(h.contract, h.job))) s.completed += 1;
      s.by_source[h.source] += 1;
      stats.set(id, s);
    }
  }
  for (const s of stats.values()) s.distinct_hirers = groupHirers(s.hires).length;
  return stats;
}

/** Board order: most hires first, then lowest agent id. */
export function boardOrder(stats: Map<number, AgentHireStats>): AgentHireStats[] {
  return [...stats.values()].sort((a, b) => b.hires_total - a.hires_total || a.agent_id - b.agent_id);
}

// ─── The board ────────────────────────────────────────────────────────────────

export type VerdictStatus = 'checked' | 'fewer_than_3_hirers' | 'error' | 'pending';

/** The hire check's outcome for one agent: checked, failed after a retry, or not reached yet. */
export interface AgentVerdict {
  status: 'checked' | 'error' | 'pending';
  summary: HireSummary | null;
  checked_at: string | null;
}

export interface SetAndEarnBoardRow {
  agent_id: number;
  name: string | null;
  owner: string;
  marketplace: SetAndEarnMarketplace;
  registered_at: string | null;
  hires_total: number;
  completed: number | null;
  distinct_hirers: number;
  by_source: Record<HireSource, number>;
  verdict_status: VerdictStatus;
  owner_linked: number | null;
  independent_within_limits: number | null;
  inconclusive: number | null;
  /** false when there are fewer than 3 distinct hirers; null when the check has not run. */
  passes_three_independent: boolean | null;
  checked_at: string | null;
}

export interface SetAndEarnBoard {
  generated_at: string;
  as_of: { block: number; time: string };
  window: { from_block: number; start: string; end: string };
  totals: {
    agents_registered: number;
    agents_on_campaign_marketplaces: number;
    agents_with_hires: number;
    hires: { total: number; by_source: Record<HireSource, number> };
    agents_with_3_distinct_hirers: number;
    agents_passing: number;
  };
  rows: SetAndEarnBoardRow[];
  method: string;
  limits: string[];
}

export const SET_AND_EARN_BOARD_METHOD =
  `Agents: ERC-8004 Registered events on BNB Chain's identity registry from Set and Earn's first block (125,000,755, ${SET_AND_EARN_START}) to its last (${SET_AND_EARN_END}) or as_of, whichever is earlier; their hires are counted to as_of. ` +
  'Marketplace: the agentURI matched against the nine campaign marketplaces\' hosts, as in the week-one decode. ' +
  'Hires: TermiX escrow OrderCreated naming the agent id, and shared ERC-8183 JobCreated naming the agent\'s owner or agent wallet as provider. ' +
  'Completed: TermiX OrderSettled and ERC-8183 JobCompleted for those hires. ' +
  `Verdicts: agents with ${MIN_DISTINCT_HIRERS} or more distinct hirers go through ChainWard's hire check (GET /api/risk/hires): each hirer's first incoming BNB and stablecoin are followed back up to 4 hops and compared with the owner's and agent wallet's. ` +
  'passes_three_independent means 3 or more hirers with no owner link or shared funder found within those limits.';

export const SET_AND_EARN_BOARD_LIMITS: string[] = [
  ...HIRE_LIMITS,
  'BSC mainnet only: agents registered Oct 1 – Nov 5 (from block 125,000,755), and their hires since Oct 1. The paid check looks back 30 days, so after Oct 31 the two can differ.',
  'An ERC-8183 hire names an address, not an agent: it counts for every listed agent that address owns or uses as its agent wallet.',
  'Completed counts TermiX OrderSettled and ERC-8183 JobCompleted. The verdict counts every hirer, completed or not; ERC-8183 payments wait out a 7-day dispute window.',
  'Counts are addresses, not people.',
  'Never a safety verdict on an agent or its builder.',
];

function verdictColumns(stats: AgentHireStats, verdict: AgentVerdict | undefined) {
  if (stats.distinct_hirers < MIN_DISTINCT_HIRERS) {
    return {
      verdict_status: 'fewer_than_3_hirers' as const,
      owner_linked: null,
      independent_within_limits: null,
      inconclusive: null,
      passes_three_independent: false,
      checked_at: null,
    };
  }
  if (verdict?.status === 'checked' && verdict.summary) {
    return {
      verdict_status: 'checked' as const,
      owner_linked: verdict.summary.owner_linked,
      independent_within_limits: verdict.summary.independent_within_limits,
      inconclusive: verdict.summary.inconclusive,
      passes_three_independent: verdict.summary.passes_three_independent,
      checked_at: verdict.checked_at,
    };
  }
  return {
    verdict_status: verdict?.status === 'error' ? ('error' as const) : ('pending' as const),
    owner_linked: null,
    independent_within_limits: null,
    inconclusive: null,
    passes_three_independent: null,
    checked_at: null,
  };
}

export function assembleSetAndEarnBoard(input: {
  registrations: Map<number, AgentRegistration>;
  hires: BoardHire[];
  completions: Set<string>;
  verdicts: Map<number, AgentVerdict>;
  asOf: { block: number; time: string };
  generatedAt: string;
  maxRows?: number;
}): SetAndEarnBoard {
  const stats = boardOrder(hiresByAgent(input.registrations, input.hires, input.completions));
  const rows: SetAndEarnBoardRow[] = stats.map((s) => {
    const reg = input.registrations.get(s.agent_id)!;
    return {
      agent_id: s.agent_id,
      name: reg.name,
      owner: reg.owner,
      marketplace: reg.marketplace,
      registered_at: reg.registered_at,
      hires_total: s.hires_total,
      completed: s.completed,
      distinct_hirers: s.distinct_hirers,
      by_source: s.by_source,
      ...verdictColumns(s, input.verdicts.get(s.agent_id)),
    };
  });

  const counted = new Map<string, BoardHire>();
  for (const s of stats) for (const h of s.hires) counted.set(hireKey(h), h);
  const bySource: Record<HireSource, number> = { termix_escrow: 0, erc8183_shared: 0 };
  for (const h of counted.values()) bySource[h.source] += 1;
  const regs = [...input.registrations.values()];

  return {
    generated_at: input.generatedAt,
    as_of: input.asOf,
    window: { from_block: SET_AND_EARN_START_BLOCK, start: SET_AND_EARN_START, end: SET_AND_EARN_END },
    totals: {
      agents_registered: regs.length,
      agents_on_campaign_marketplaces: regs.filter((r) => CAMPAIGN_MARKETPLACES.includes(r.marketplace)).length,
      agents_with_hires: rows.length,
      hires: { total: counted.size, by_source: bySource },
      agents_with_3_distinct_hirers: rows.filter((r) => r.distinct_hirers >= MIN_DISTINCT_HIRERS).length,
      agents_passing: rows.filter((r) => r.passes_three_independent === true).length,
    },
    rows: rows.slice(0, input.maxRows ?? BOARD_MAX_ROWS),
    method: SET_AND_EARN_BOARD_METHOD,
    limits: SET_AND_EARN_BOARD_LIMITS,
  };
}
