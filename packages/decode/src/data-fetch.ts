import { fetchCurrentBlock } from './sentinel-block.js';

// USDC contract on Base mainnet (8453). balanceOf(address) selector + 32-byte address arg.
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BALANCE_OF_SELECTOR = '0x70a08231';

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value).
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// Base targets ~2s blocks — used to approximate a log's timestamp from its block
// number, so the node transfer fetch needs no eth_getBlockByNumber per block.
const BASE_BLOCK_SECONDS = 2;
// ~30d of Base blocks (matches ACTIVITY_WINDOW_MS), chunked for safe eth_getLogs.
const SENTINEL_WINDOW_BLOCKS = parseInt(
  process.env.SENTINEL_TRANSFER_WINDOW_BLOCKS ?? String(1_300_000),
  10,
);
const SENTINEL_CHUNK_BLOCKS = parseInt(
  process.env.SENTINEL_TRANSFER_CHUNK_BLOCKS ?? '120000',
  10,
);
const MAX_SENTINEL_TRANSFERS = 2000;

function addressTopic(address: string): string {
  return '0x' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

export interface FetchedFixtures {
  acp_details: any;
  blockscout_counters: any;
  blockscout_transfers: any;
  sentinel_code: { result: string };
  sentinel_nonce: { result: string };
  sentinel_eth_balance: { result: string };
  sentinel_usdc_balance: { result: string };
  geckoterminal?: any;
  sentinel_block?: { number: string; hash: string };
}

/**
 * Minimal logger shape so this module stays free of any concrete logging
 * dependency. Callers (acp-decoder, the indexer risk worker) inject their own
 * pino instance; if omitted, failures degrade silently (still graceful).
 */
export interface FetchLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface FetchOptions {
  sentinelRpc: string;
  fetchTimeoutMs: number;
  agentName?: string;
  logger?: FetchLogger;
}

/**
 * Fetches all data sources needed for quickDecode against a live wallet.
 * Each source is fetched independently — partial failures degrade gracefully.
 * Every fetch has an AbortSignal.timeout so a hung upstream can't lock the caller.
 */
export async function fetchFixtures(
  walletAddress: string,
  opts: FetchOptions,
): Promise<FetchedFixtures> {
  const t = opts.fetchTimeoutMs;
  const log = opts.logger;
  const [
    acpResult,
    countersResult,
    transfersResult,
    codeResult,
    nonceResult,
    ethBalanceResult,
    usdcBalanceResult,
    blockResult,
  ] = await Promise.allSettled([
    fetchAcpDetails(walletAddress, t, opts.agentName),
    fetchBlockscoutCounters(walletAddress, t),
    fetchTransfers(walletAddress, opts),
    fetchSentinelCode(walletAddress, opts.sentinelRpc, t),
    fetchSentinelNonce(walletAddress, opts.sentinelRpc, t),
    fetchSentinelEthBalance(walletAddress, opts.sentinelRpc, t),
    fetchSentinelUsdcBalance(walletAddress, opts.sentinelRpc, t),
    fetchCurrentBlock(opts.sentinelRpc).then((b) => ({
      number: '0x' + b.number.toString(16),
      hash: b.hash,
    })),
  ]);

  const acp_details = settled(acpResult, { data: null }, log);
  const blockscout_counters = settled(countersResult, {
    transactions_count: '0',
    token_transfers_count: '0',
  }, log);
  const blockscout_transfers = settled(transfersResult, { items: [] as any[], truncated: false }, log);
  const sentinel_code = settled(codeResult, { result: '0x' }, log);
  const sentinel_nonce = settled(nonceResult, { result: '0x0' }, log);
  const sentinel_eth_balance = settled(ethBalanceResult, { result: '0x0' }, log);
  const sentinel_usdc_balance = settled(usdcBalanceResult, { result: '0x0' }, log);
  const sentinel_block = settled(blockResult, undefined, log);

  const tokenAddress: string | null =
    acp_details?.data?.tokenAddress ?? acp_details?.tokenAddress ?? null;
  let geckoterminal: any = null;
  if (tokenAddress) {
    try {
      geckoterminal = await fetchGeckoterminal(tokenAddress, t);
    } catch (err: any) {
      log?.warn(
        { err: err.message, tokenAddress },
        'data-fetch: geckoterminal failed; using null',
      );
    }
  }

  return {
    acp_details,
    blockscout_counters,
    blockscout_transfers,
    sentinel_code,
    sentinel_nonce,
    sentinel_eth_balance,
    sentinel_usdc_balance,
    geckoterminal,
    sentinel_block,
  };
}

function settled<T>(result: PromiseSettledResult<T>, fallback: T, log?: FetchLogger): T {
  if (result.status === 'fulfilled') return result.value;
  log?.warn(
    { err: result.reason?.message ?? String(result.reason) },
    'data-fetch: source failed',
  );
  return fallback;
}

async function fetchAcpDetails(walletAddress: string, timeoutMs: number, agentName?: string): Promise<any> {
  if (agentName) {
    const handle = agentName.replace(/^@/, '');
    const resp = await fetch(
      `https://acpx.virtuals.io/api/agents?filters[twitterHandle][$eqi]=${encodeURIComponent(handle)}&pagination[pageSize]=1`,
      { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    if (resp.ok) {
      const body: any = await resp.json();
      const agent = body?.data?.[0];
      if (agent?.id) {
        const detailResp = await fetch(
          `https://acpx.virtuals.io/api/agents/${agent.id}/details`,
          { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'Mozilla/5.0' } },
        );
        if (detailResp.ok) return await detailResp.json();
      }
    }
  }

  const resp = await fetch(
    `https://acpx.virtuals.io/api/agents?filters[walletAddress][$eqi]=${walletAddress}&pagination[pageSize]=1`,
    { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'Mozilla/5.0' } },
  );
  if (!resp.ok) return { data: null };
  const body: any = await resp.json();
  const agent = body?.data?.[0];
  if (!agent?.id) return { data: null };
  const detailResp = await fetch(`https://acpx.virtuals.io/api/agents/${agent.id}/details`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!detailResp.ok) return { data: null };
  return await detailResp.json();
}

async function fetchBlockscoutCounters(walletAddress: string, timeoutMs: number): Promise<any> {
  const resp = await fetch(
    `https://base.blockscout.com/api/v2/addresses/${walletAddress}/counters`,
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  if (!resp.ok) throw new Error(`blockscout counters: ${resp.status}`);
  return await resp.json();
}

const MAX_TRANSFER_PAGES = 20; // ~50 transfers/page → ~1000 max; bounds latency for mega-agents
const ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // widest window computeActivity looks back

/**
 * Paginates the wallet's ERC-20 transfers, following Blockscout `next_page_params`
 * until the history is exhausted, the oldest item on a page falls outside the 30d
 * activity window (computeActivity never looks further back), or a hard page cap is
 * hit. Returns `truncated: true` only when the cap was reached with more pages still
 * available — so a capped count can never silently masquerade as complete (the
 * structural lesson from the lifetime-undercount bug; the old single-page fetch
 * undercounted any agent with >1 page of recent transfers).
 */
export async function fetchBlockscoutTransfers(
  walletAddress: string,
  timeoutMs: number,
): Promise<{ items: any[]; truncated: boolean }> {
  const base = `https://base.blockscout.com/api/v2/addresses/${walletAddress}/token-transfers?type=ERC-20`;
  const cutoff = Date.now() - ACTIVITY_WINDOW_MS;
  const items: any[] = [];
  let pageParams: Record<string, unknown> | null = null;
  let truncated = false;

  for (let page = 0; page < MAX_TRANSFER_PAGES; page++) {
    const url = pageParams
      ? `${base}&${Object.entries(pageParams)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')}`
      : base;
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) {
      if (page === 0) throw new Error(`blockscout transfers: ${resp.status}`);
      break; // a later page failed — return what we have rather than nothing
    }
    const body: any = await resp.json();
    const pageItems: any[] = Array.isArray(body?.items) ? body.items : [];
    items.push(...pageItems);

    pageParams = (body?.next_page_params as Record<string, unknown> | null) ?? null;
    if (!pageParams) break; // history exhausted
    if (pageItems.length === 0) break; // cursor present but empty page — no progress, don't spin

    const oldest = pageItems[pageItems.length - 1];
    const oldestMs = oldest?.timestamp ? new Date(oldest.timestamp).getTime() : NaN;
    if (Number.isFinite(oldestMs) && oldestMs < cutoff) break; // covered the 30d window
    if (!Number.isFinite(oldestMs)) {
      // unparseable/absent timestamp — can't confirm we're still inside the window, so stop
      // rather than page blindly (up to 20× the per-request timeout), and flag it uncertain.
      truncated = true;
      break;
    }

    if (page === MAX_TRANSFER_PAGES - 1) truncated = true; // cap reached, more pages remain
  }

  return { items, truncated };
}

// ── Node-native ERC-20 transfers (PRIMARY; Blockscout is the fallback) ───────
// A plain node has no by-address transaction index, so we get the transfer LIST
// via eth_getLogs on the Transfer topic filtered by the address (as the from/to
// topic), chunked across the window. This reads from OUR OWN node — reliable and
// on-brand — instead of the eventually-consistent Blockscout endpoint that
// intermittently returned empty for active ERC-4337 agents.

interface RpcLog {
  address: string;
  topics: string[];
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

interface NodeTransfer {
  from: { hash: string };
  to: { hash: string };
  timestamp: string;
  token: { address: string };
}

async function jsonRpcResult<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs: number,
): Promise<T> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  if (!resp.ok) throw new Error(`${method}: ${resp.status}`);
  const body: any = await resp.json();
  if (body?.error) throw new Error(`${method}: ${body.error.message ?? 'rpc error'}`);
  return body.result as T;
}

/**
 * Maps raw eth_getLogs Transfer logs to the minimal transfer shape computeActivity
 * consumes ({from,to,timestamp,token}). PURE + exported for unit tests. Keeps only
 * fungible ERC-20 transfers (exactly 3 topics; ERC-721 has 4), dedupes by
 * txHash:logIndex, sorts newest-first, and caps at `cap` so the kept set is the
 * most-recent — what the activity windows care about — flagging truncation.
 * Timestamps are approximated from block number (Base ~2s blocks).
 */
export function mapLogsToTransfers(
  logs: RpcLog[],
  headBlockNumber: number,
  headTimestampSec: number,
  cap: number = MAX_SENTINEL_TRANSFERS,
): { items: NodeTransfer[]; truncated: boolean } {
  const valid = logs.filter(
    (lg) =>
      Array.isArray(lg.topics) &&
      lg.topics.length === 3 &&
      lg.topics[0]?.toLowerCase() === TRANSFER_TOPIC,
  );
  valid.sort((a, b) => {
    const byBlock = parseInt(b.blockNumber, 16) - parseInt(a.blockNumber, 16);
    if (byBlock !== 0) return byBlock;
    return parseInt(b.logIndex, 16) - parseInt(a.logIndex, 16);
  });

  const seen = new Set<string>();
  const items: NodeTransfer[] = [];
  let truncated = false;
  for (const lg of valid) {
    const key = `${lg.transactionHash}:${lg.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (items.length >= cap) {
      truncated = true;
      break;
    }
    const fromTopic = lg.topics[1];
    const toTopic = lg.topics[2];
    if (!fromTopic || !toTopic) continue;
    const blockNum = parseInt(lg.blockNumber, 16);
    const tsSec =
      headTimestampSec - Math.max(0, headBlockNumber - blockNum) * BASE_BLOCK_SECONDS;
    items.push({
      from: { hash: '0x' + fromTopic.slice(-40) },
      to: { hash: '0x' + toTopic.slice(-40) },
      timestamp: new Date(tsSec * 1000).toISOString(),
      token: { address: lg.address },
    });
  }
  return { items, truncated };
}

async function fetchSentinelTransfers(
  walletAddress: string,
  rpcUrl: string,
  timeoutMs: number,
): Promise<{ items: NodeTransfer[]; truncated: boolean }> {
  const head = await jsonRpcResult<{ number: string; timestamp: string } | null>(
    rpcUrl,
    'eth_getBlockByNumber',
    ['latest', false],
    timeoutMs,
  );
  if (!head?.number || !head?.timestamp) {
    throw new Error('eth_getBlockByNumber: missing head block');
  }
  const headNum = parseInt(head.number, 16);
  const headTs = parseInt(head.timestamp, 16);
  const fromBlock = Math.max(0, headNum - SENTINEL_WINDOW_BLOCKS);
  const topic = addressTopic(walletAddress);

  const logs: RpcLog[] = [];
  // Newest chunk first so the cap keeps the most-recent transfers.
  for (let end = headNum; end >= fromBlock; end -= SENTINEL_CHUNK_BLOCKS) {
    const start = Math.max(fromBlock, end - SENTINEL_CHUNK_BLOCKS + 1);
    const range = { fromBlock: '0x' + start.toString(16), toBlock: '0x' + end.toString(16) };
    const [fromLogs, toLogs] = await Promise.all([
      jsonRpcResult<RpcLog[]>(
        rpcUrl,
        'eth_getLogs',
        [{ ...range, topics: [TRANSFER_TOPIC, topic] }],
        timeoutMs,
      ),
      jsonRpcResult<RpcLog[]>(
        rpcUrl,
        'eth_getLogs',
        [{ ...range, topics: [TRANSFER_TOPIC, null, topic] }],
        timeoutMs,
      ),
    ]);
    if (Array.isArray(fromLogs)) logs.push(...fromLogs);
    if (Array.isArray(toLogs)) logs.push(...toLogs);
    // Enough raw logs to fill the cap several times over → stop scanning further back.
    if (logs.length > MAX_SENTINEL_TRANSFERS * 3) break;
  }

  return mapLogsToTransfers(logs, headNum, headTs, MAX_SENTINEL_TRANSFERS);
}

/**
 * Transfer list with the node as PRIMARY (reliable, our own infra) and Blockscout
 * as the fallback ONLY when the node query fails. A successful node response is
 * authoritative — including an empty one (genuinely no transfers in the window),
 * which is the honest "no recent activity" signal rather than a Blockscout flake.
 */
async function fetchTransfers(
  walletAddress: string,
  opts: FetchOptions,
): Promise<{ items: any[]; truncated: boolean }> {
  try {
    return await fetchSentinelTransfers(walletAddress, opts.sentinelRpc, opts.fetchTimeoutMs);
  } catch (err: any) {
    opts.logger?.warn(
      { err: err?.message ?? String(err) },
      'data-fetch: sentinel transfers failed; falling back to Blockscout',
    );
    return await fetchBlockscoutTransfers(walletAddress, opts.fetchTimeoutMs);
  }
}

async function jsonRpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs: number,
): Promise<{ result: string }> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  if (!resp.ok) throw new Error(`${method}: ${resp.status}`);
  return (await resp.json()) as { result: string };
}

async function fetchSentinelCode(walletAddress: string, rpcUrl: string, timeoutMs: number) {
  return jsonRpcCall(rpcUrl, 'eth_getCode', [walletAddress, 'latest'], timeoutMs);
}

async function fetchSentinelNonce(walletAddress: string, rpcUrl: string, timeoutMs: number) {
  return jsonRpcCall(rpcUrl, 'eth_getTransactionCount', [walletAddress, 'latest'], timeoutMs);
}

async function fetchSentinelEthBalance(walletAddress: string, rpcUrl: string, timeoutMs: number) {
  return jsonRpcCall(rpcUrl, 'eth_getBalance', [walletAddress, 'latest'], timeoutMs);
}

// Reads USDC balance via eth_call(balanceOf, address). Returns the raw uint256 hex result.
async function fetchSentinelUsdcBalance(walletAddress: string, rpcUrl: string, timeoutMs: number) {
  const data = BALANCE_OF_SELECTOR + walletAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return jsonRpcCall(
    rpcUrl,
    'eth_call',
    [{ to: USDC_BASE, data }, 'latest'],
    timeoutMs,
  );
}

async function fetchGeckoterminal(tokenAddress: string, timeoutMs: number): Promise<any> {
  const resp = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/base/tokens/${tokenAddress}`,
    { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } },
  );
  if (!resp.ok) throw new Error(`geckoterminal: ${resp.status}`);
  return await resp.json();
}
