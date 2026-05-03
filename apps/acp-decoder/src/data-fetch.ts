import { fetchCurrentBlock } from '@chainward/decode';
import { logger } from './logger.js';

// USDC contract on Base mainnet (8453). balanceOf(address) selector + 32-byte address arg.
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BALANCE_OF_SELECTOR = '0x70a08231';

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

export interface FetchOptions {
  sentinelRpc: string;
  fetchTimeoutMs: number;
  agentName?: string;
}

/**
 * Fetches all data sources needed for quickDecode against a live wallet.
 * Each source is fetched independently — partial failures degrade gracefully.
 * Every fetch has an AbortSignal.timeout so a hung upstream can't lock the handler.
 */
export async function fetchFixtures(
  walletAddress: string,
  opts: FetchOptions,
): Promise<FetchedFixtures> {
  const t = opts.fetchTimeoutMs;
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
    fetchBlockscoutTransfers(walletAddress, t),
    fetchSentinelCode(walletAddress, opts.sentinelRpc, t),
    fetchSentinelNonce(walletAddress, opts.sentinelRpc, t),
    fetchSentinelEthBalance(walletAddress, opts.sentinelRpc, t),
    fetchSentinelUsdcBalance(walletAddress, opts.sentinelRpc, t),
    fetchCurrentBlock(opts.sentinelRpc).then((b) => ({
      number: '0x' + b.number.toString(16),
      hash: b.hash,
    })),
  ]);

  const acp_details = settled(acpResult, { data: null });
  const blockscout_counters = settled(countersResult, {
    transactions_count: '0',
    token_transfers_count: '0',
  });
  const blockscout_transfers = settled(transfersResult, { items: [] });
  const sentinel_code = settled(codeResult, { result: '0x' });
  const sentinel_nonce = settled(nonceResult, { result: '0x0' });
  const sentinel_eth_balance = settled(ethBalanceResult, { result: '0x0' });
  const sentinel_usdc_balance = settled(usdcBalanceResult, { result: '0x0' });
  const sentinel_block = settled(blockResult, undefined);

  const tokenAddress: string | null =
    acp_details?.data?.tokenAddress ?? acp_details?.tokenAddress ?? null;
  let geckoterminal: any = null;
  if (tokenAddress) {
    try {
      geckoterminal = await fetchGeckoterminal(tokenAddress, t);
    } catch (err: any) {
      logger.warn(
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

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  if (result.status === 'fulfilled') return result.value;
  logger.warn(
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

async function fetchBlockscoutTransfers(walletAddress: string, timeoutMs: number): Promise<any> {
  const resp = await fetch(
    `https://base.blockscout.com/api/v2/addresses/${walletAddress}/token-transfers?type=ERC-20`,
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  if (!resp.ok) throw new Error(`blockscout transfers: ${resp.status}`);
  return await resp.json();
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
