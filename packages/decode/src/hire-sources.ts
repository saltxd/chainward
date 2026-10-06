// ─── Hire check: BNB Chain sources ────────────────────────────────────────────
//
// Where the hire check's facts come from on BNB Smart Chain (56):
//   - the ERC-8004 Identity registry: ownerOf, getAgentWallet, and Transfer
//     events (an owner address's agents);
//   - hire events: TermiX escrow OrderCreated (provider = ERC-8004 agent id,
//     indexed) and the ERC-8183 kernel's JobCreated that six Set and Earn
//     marketplaces share (provider = address, indexed);
//   - funding: alchemy_getAssetTransfers (first incoming BNB / stablecoin, and
//     the seller check's inflow-count hub rule).
// Logs come from public JSON-RPC (the chain registry's BSC list): Alchemy's free
// tier caps eth_getLogs at a 10-block range on BNB. Contract addresses and event
// layouts: deliverables/set-and-earn-week-one (scripts/marketplace_contracts.json).

import { riskChainRpcs, type RiskChainRpc } from '@chainward/common';
import { TRANSFER_TOPIC, addressTopic, jsonRpcResult, type RpcLog } from './data-fetch.js';
import { planLogChunks, isRangeLimitError, type RpcCall } from './rpc-fixtures.js';
import {
  HUB_INFLOWS,
  SELLER_BLOCKS_PER_DAY,
  SELLER_STABLECOINS,
  alchemyFirstFunderSource,
  alchemyTransferSource,
  mapLimit,
} from './seller-demand.js';
import {
  HIRE_WINDOW_DAYS,
  HUB_NONCE,
  assessHirers,
  buildHireReport,
  groupHirers,
  type FundingGraph,
  type HireEvent,
  type HireReport,
} from './hire-check.js';

export const BSC_IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
/** TermiX job escrows on BSC: USDC, USDT (same implementation, same events). */
export const TERMIX_BSC_ESCROWS = ['0x6A52ba4C84b348FaEAe13dDC7A97b4F6af23913C', '0xCE02f987D8b8Af694e13c8A843dB9C77CABf544c'];
/** The ERC-8183 AgenticCommerce kernel Dolphin, KATTEGAT, Marque, Pokter, Agent Atlas and Mandate record hires on. */
export const ERC8183_BSC_KERNEL = '0xEa4DAa3100A767e86FDed867729ae7446476EBA6';
/** First BSC block at or after 2026-10-01 00:00 UTC, when Set and Earn opened. The hire window never starts earlier. */
export const SET_AND_EARN_START_BLOCK = 125_000_755;
/** An owner address's agents are the registry tokens transferred to it within this many days. */
export const AGENT_LOOKBACK_DAYS = 60;
/** More agents than this under one owner: ask for one agent id at a time. */
export const MAX_AGENTS_PER_OWNER = 50;

/** OrderCreated(bytes32 indexed orderId, address indexed client, uint256 indexed providerAgentId, bytes32, uint256, uint64, uint256) */
export const ORDER_CREATED_TOPIC = '0xac4801e0cf6c58578da06571bd840e030ab529c0ca954375ff4e7b45086fef7c';
/** JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook) */
export const JOB_CREATED_TOPIC = '0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9';

const OWNER_OF = '0x6352211e';
const GET_AGENT_WALLET = '0x00339509';
const BALANCE_OF = '0x70a08231';
const BLOCKS_PER_DAY = SELLER_BLOCKS_PER_DAY.bsc;
/** Stay a few blocks under the Alchemy head: a public RPC pool can lag it. */
const LOG_HEAD_LAG = 5;
const RPC_TIMEOUT_MS = 15_000;
const LOG_CONCURRENCY = 8;
const MIN_SPLIT_BLOCKS = 500;
const ZERO = '0x0000000000000000000000000000000000000000';

export type HireAgentInput = { kind: 'id'; id: number } | { kind: 'owner'; address: string };

export class HireCheckError extends Error {
  constructor(
    readonly code: 'AGENT_NOT_FOUND' | 'TOO_MANY_AGENTS',
    message: string,
  ) {
    super(message);
    this.name = 'HireCheckError';
  }
}

const defaultRpcCall: RpcCall = (url, method, params, timeoutMs) => jsonRpcResult(url, method, params, timeoutMs);
const topicToAddress = (t: string) => '0x' + t.slice(-40).toLowerCase();
const idTopic = (id: number) => '0x' + BigInt(id).toString(16).padStart(64, '0');
const hex = (n: number) => '0x' + n.toString(16);

/** The hire window: 30 days back from `head`, never before Set and Earn opened. */
export function hireWindow(head: number): { from: number; to: number } {
  return { from: Math.max(head - HIRE_WINDOW_DAYS * BLOCKS_PER_DAY, SET_AND_EARN_START_BLOCK), to: head };
}

/** A TermiX OrderCreated or ERC-8183 JobCreated log as a hire event (the client is topic 2 in both). */
export function decodeHireLog(log: RpcLog): HireEvent | null {
  const source = log.topics[0] === ORDER_CREATED_TOPIC ? 'termix_escrow' : log.topics[0] === JOB_CREATED_TOPIC ? 'erc8183_shared' : null;
  if (!source || !log.topics[2]) return null;
  return { source, hirer: topicToAddress(log.topics[2]), block: Number(BigInt(log.blockNumber)), tx: log.transactionHash };
}

export interface ScanHireLogsInput {
  rpcs: RiskChainRpc[];
  rpcCall?: RpcCall;
  address: string[];
  topics: Array<string | string[] | null>;
  fromBlock: number;
  toBlock: number;
  concurrency?: number;
}

/**
 * Every log matching the filter in [fromBlock, toBlock], in chunks the endpoint
 * accepts. A chunk that fails twice moves to the next endpoint; if no endpoint
 * can read it the scan throws. A hire count is never returned incomplete.
 */
export async function scanHireLogs(input: ScanHireLogsInput): Promise<RpcLog[]> {
  const rpcCall = input.rpcCall ?? defaultRpcCall;
  if (input.toBlock < input.fromBlock || input.rpcs.length === 0) return [];
  const primary = input.rpcs[0]!;

  const read = async (url: string, from: number, to: number) =>
    (await rpcCall(
      url,
      'eth_getLogs',
      [{ address: input.address, topics: input.topics, fromBlock: hex(from), toBlock: hex(to) }],
      RPC_TIMEOUT_MS,
    )) as RpcLog[];

  const readChunk = async (from: number, to: number): Promise<RpcLog[]> => {
    let lastErr: unknown;
    for (const rpc of input.rpcs) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const out: RpcLog[] = [];
          // A smaller-capped fallback reads the chunk in its own sub-chunks.
          for (const sub of planLogChunks(from, to, rpc.logChunkBlocks)) out.push(...(await read(rpc.url, sub.from, sub.to)));
          return out;
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          // Halve on "range too wide", never on throttling (that would multiply the calls).
          if (isRangeLimitError(msg) && !/rate|429|too many requests|capacity/i.test(msg) && to - from >= MIN_SPLIT_BLOCKS) {
            const mid = Math.floor((from + to) / 2);
            return [...(await readChunk(from, mid)), ...(await readChunk(mid + 1, to))];
          }
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  };

  const chunks = planLogChunks(input.fromBlock, input.toBlock, primary.logChunkBlocks);
  const results = await mapLimit(chunks, input.concurrency ?? LOG_CONCURRENCY, (c) => readChunk(c.from, c.to));
  return results.flat();
}

// ─── Registry reads ───────────────────────────────────────────────────────────

async function registryCall(rpcCall: RpcCall, rpcUrl: string, data: string): Promise<string | null> {
  try {
    return (await rpcCall(rpcUrl, 'eth_call', [{ to: BSC_IDENTITY_REGISTRY, data }, 'latest'], RPC_TIMEOUT_MS)) as string;
  } catch (err) {
    // ownerOf reverts for an id that was never minted; anything else is a transport failure.
    if (err instanceof Error && /revert/i.test(err.message)) return null;
    throw err;
  }
}

async function ownerOf(rpcCall: RpcCall, rpcUrl: string, id: number): Promise<string | null> {
  const res = await registryCall(rpcCall, rpcUrl, OWNER_OF + idTopic(id).slice(2));
  if (!res || res === '0x') return null;
  const owner = topicToAddress(res);
  return owner === ZERO ? null : owner;
}

async function agentWallet(rpcCall: RpcCall, rpcUrl: string, id: number): Promise<string | null> {
  const res = await registryCall(rpcCall, rpcUrl, GET_AGENT_WALLET + idTopic(id).slice(2));
  if (!res || res === '0x') return null;
  const wallet = topicToAddress(res);
  return wallet === ZERO ? null : wallet;
}

/** Agents an owner holds now, from registry Transfer events to it in the lookback window. */
async function agentsOwnedBy(rpcCall: RpcCall, rpcs: RiskChainRpc[], owner: string, head: number): Promise<number[]> {
  const balance = await registryCall(rpcCall, rpcs[0]!.url, BALANCE_OF + addressTopic(owner).slice(2));
  if (!balance || BigInt(balance) === 0n) return [];
  const logs = await scanHireLogs({
    rpcs,
    rpcCall,
    address: [BSC_IDENTITY_REGISTRY],
    topics: [TRANSFER_TOPIC, null, addressTopic(owner)],
    fromBlock: Math.max(0, head - AGENT_LOOKBACK_DAYS * BLOCKS_PER_DAY),
    toBlock: head,
  });
  const candidates = [...new Set(logs.filter((l) => l.topics[3]).map((l) => Number(BigInt(l.topics[3]!))))].sort((a, b) => a - b);
  const owners = await mapLimit(candidates, 8, (id) => ownerOf(rpcCall, rpcs[0]!.url, id));
  return candidates.filter((_, i) => owners[i] === owner);
}

// ─── Funding graph ────────────────────────────────────────────────────────────

/** EIP-7702: an EOA delegating to code carries 0xef0100 ‖ address. Still a wallet. */
const isDelegation = (code: string) => /^0xef0100[0-9a-f]{40}$/i.test(code);

/**
 * The live funding graph: first funders from Alchemy, code and nonce from the
 * public RPC, hub = 100,000+ sent transactions (exchange-style hot wallet) or
 * the seller check's 1,000+ stablecoin inflows in the window.
 */
export function bscFundingGraph(opts: {
  alchemyUrl: string;
  rpcUrl: string;
  windowFromBlock: number;
  rpcCall?: RpcCall;
  log?: { warn: (msg: string) => void };
}): FundingGraph {
  const rpcCall = opts.rpcCall ?? defaultRpcCall;
  const first = alchemyFirstFunderSource(opts.alchemyUrl, SELLER_STABLECOINS.bsc, opts.log);
  const inflows = alchemyTransferSource(opts.alchemyUrl, BigInt(opts.windowFromBlock), opts.log, SELLER_STABLECOINS.bsc);
  return {
    firstFunder: async (kind, address) => (await first(kind, address))?.from ?? null,
    isContract: async (address) => {
      const code = String((await rpcCall(opts.rpcUrl, 'eth_getCode', [address, 'latest'], RPC_TIMEOUT_MS)) ?? '0x');
      return code !== '0x' && !isDelegation(code);
    },
    isHub: async (address) => {
      const nonce = Number(BigInt(String(await rpcCall(opts.rpcUrl, 'eth_getTransactionCount', [address, 'latest'], RPC_TIMEOUT_MS))));
      if (nonce >= HUB_NONCE) return true;
      return (await inflows('in', address)).length >= HUB_INFLOWS;
    },
  };
}

// ─── The check ────────────────────────────────────────────────────────────────

export interface RunHireCheckInput {
  agent: HireAgentInput;
  /** Head block from the Alchemy RPC (the route probes it first). */
  head: number;
  alchemyUrl: string;
  /** Public BSC RPCs for logs, calls and headers; defaults to the chain registry's list. */
  rpcs?: RiskChainRpc[];
  rpcCall?: RpcCall;
  /** Injected funding graph (tests); defaults to bscFundingGraph. */
  graph?: FundingGraph;
  log?: { warn: (msg: string) => void };
}

async function blockTime(rpcCall: RpcCall, rpcUrl: string, block: number): Promise<string> {
  const b = (await rpcCall(rpcUrl, 'eth_getBlockByNumber', [hex(block), false], RPC_TIMEOUT_MS)) as { timestamp: string } | null;
  if (!b) throw new Error(`eth_getBlockByNumber: block ${block} not found`);
  return new Date(Number(BigInt(b.timestamp)) * 1000).toISOString();
}

export async function runHireCheck(input: RunHireCheckInput): Promise<HireReport> {
  const rpcCall = input.rpcCall ?? defaultRpcCall;
  const rpcs = input.rpcs ?? riskChainRpcs('bsc');
  const rpcUrl = rpcs[0]!.url;
  const asOfBlock = input.head - LOG_HEAD_LAG;

  let owner: string;
  let agentIds: number[];
  if (input.agent.kind === 'id') {
    const found = await ownerOf(rpcCall, rpcUrl, input.agent.id);
    if (!found) throw new HireCheckError('AGENT_NOT_FOUND', `No ERC-8004 agent #${input.agent.id} on BNB Chain`);
    owner = found;
    agentIds = [input.agent.id];
  } else {
    owner = input.agent.address.toLowerCase();
    agentIds = await agentsOwnedBy(rpcCall, rpcs, owner, asOfBlock);
    if (agentIds.length > MAX_AGENTS_PER_OWNER) {
      throw new HireCheckError(
        'TOO_MANY_AGENTS',
        `${owner} holds ${agentIds.length} agents; check one agent id at a time`,
      );
    }
  }
  const wallets = await mapLimit(agentIds, 8, (id) => agentWallet(rpcCall, rpcUrl, id));
  const distinctWallets = [...new Set(wallets.filter((w): w is string => Boolean(w)))];

  const window = hireWindow(asOfBlock);
  const providers = [...new Set([owner, ...distinctWallets])].map(addressTopic);
  const [termixLogs, kernelLogs, asOfTime] = await Promise.all([
    agentIds.length === 0
      ? Promise.resolve([] as RpcLog[])
      : scanHireLogs({
          rpcs,
          rpcCall,
          address: TERMIX_BSC_ESCROWS,
          topics: [ORDER_CREATED_TOPIC, null, null, agentIds.map(idTopic)],
          fromBlock: window.from,
          toBlock: window.to,
        }),
    scanHireLogs({
      rpcs,
      rpcCall,
      address: [ERC8183_BSC_KERNEL],
      topics: [JOB_CREATED_TOPIC, null, null, providers],
      fromBlock: window.from,
      toBlock: window.to,
    }),
    blockTime(rpcCall, rpcUrl, asOfBlock),
  ]);

  const events = [...termixLogs, ...kernelLogs]
    .map(decodeHireLog)
    .filter((e): e is HireEvent => e !== null && e.block >= window.from && e.block <= window.to);
  const rows = groupHirers(events);
  const times = await mapLimit(rows, 4, (r) => blockTime(rpcCall, rpcUrl, r.first_block));

  const graph =
    input.graph ??
    bscFundingGraph({
      alchemyUrl: input.alchemyUrl,
      rpcUrl,
      rpcCall,
      windowFromBlock: asOfBlock - HIRE_WINDOW_DAYS * BLOCKS_PER_DAY,
      log: input.log,
    });
  const assessments = await assessHirers({
    owner,
    agentWallets: distinctWallets,
    hirers: rows.map((r, i) => ({ address: r.address, hires: r.hires, first_hire_at: times[i]! })),
    graph,
  });

  return buildHireReport({
    agentIds,
    owner,
    agentWallet: distinctWallets.length === 1 ? distinctWallets[0]! : null,
    events,
    assessments,
    asOf: { block: asOfBlock, time: asOfTime },
  });
}
