import { fetchCurrentBlock } from '@chainward/decode';
import { logger } from './logger.js';

export interface FetchedFixtures {
  acp_details: any;
  blockscout_counters: any;
  blockscout_transfers: any;
  sentinel_code: { result: string };
  sentinel_nonce: { result: string };
  geckoterminal?: any;
  sentinel_block?: { number: string; hash: string };
}

export interface FetchOptions {
  sentinelRpc: string;
  agentName?: string;
}

/**
 * Fetches all data sources needed for quickDecode against a live wallet.
 * Each source is fetched independently — partial failures degrade gracefully
 * (e.g., if Blockscout is 5xx, transfers come back empty, classifiers see
 * "no activity" and the report reflects sparse data rather than crashing).
 */
export async function fetchFixtures(
  walletAddress: string,
  opts: FetchOptions,
): Promise<FetchedFixtures> {
  const [acpResult, countersResult, transfersResult, codeResult, nonceResult, blockResult] =
    await Promise.allSettled([
      fetchAcpDetails(walletAddress, opts.agentName),
      fetchBlockscoutCounters(walletAddress),
      fetchBlockscoutTransfers(walletAddress),
      fetchSentinelCode(walletAddress, opts.sentinelRpc),
      fetchSentinelNonce(walletAddress, opts.sentinelRpc),
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
  const sentinel_block = settled(blockResult, undefined);

  // Conditionally fetch GeckoTerminal token data if ACP details has tokenAddress
  const tokenAddress: string | null =
    acp_details?.data?.tokenAddress ?? acp_details?.tokenAddress ?? null;
  let geckoterminal: any = null;
  if (tokenAddress) {
    try {
      geckoterminal = await fetchGeckoterminal(tokenAddress);
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

async function fetchAcpDetails(walletAddress: string, agentName?: string): Promise<any> {
  // Try resolving by agent name first if provided (handle in @ form)
  if (agentName) {
    const handle = agentName.replace(/^@/, '');
    const resp = await fetch(
      `https://acpx.virtuals.io/api/agents?filters[twitterHandle][$eqi]=${encodeURIComponent(handle)}&pagination[pageSize]=1`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    if (resp.ok) {
      const body: any = await resp.json();
      const agent = body?.data?.[0];
      if (agent?.id) {
        const detailResp = await fetch(
          `https://acpx.virtuals.io/api/agents/${agent.id}/details`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } },
        );
        if (detailResp.ok) return await detailResp.json();
      }
    }
  }

  // Fallback: search by wallet address
  const resp = await fetch(
    `https://acpx.virtuals.io/api/agents?filters[walletAddress][$eqi]=${walletAddress}&pagination[pageSize]=1`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  );
  if (!resp.ok) return { data: null };
  const body: any = await resp.json();
  const agent = body?.data?.[0];
  if (!agent?.id) return { data: null };
  const detailResp = await fetch(`https://acpx.virtuals.io/api/agents/${agent.id}/details`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!detailResp.ok) return { data: null };
  return await detailResp.json();
}

async function fetchBlockscoutCounters(walletAddress: string): Promise<any> {
  const resp = await fetch(
    `https://base.blockscout.com/api/v2/addresses/${walletAddress}/counters`,
  );
  if (!resp.ok) throw new Error(`blockscout counters: ${resp.status}`);
  return await resp.json();
}

async function fetchBlockscoutTransfers(walletAddress: string): Promise<any> {
  const resp = await fetch(
    `https://base.blockscout.com/api/v2/addresses/${walletAddress}/token-transfers?type=ERC-20`,
  );
  if (!resp.ok) throw new Error(`blockscout transfers: ${resp.status}`);
  return await resp.json();
}

async function fetchSentinelCode(
  walletAddress: string,
  rpcUrl: string,
): Promise<{ result: string }> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getCode',
      params: [walletAddress, 'latest'],
      id: 1,
    }),
  });
  if (!resp.ok) throw new Error(`sentinel eth_getCode: ${resp.status}`);
  return (await resp.json()) as { result: string };
}

async function fetchSentinelNonce(
  walletAddress: string,
  rpcUrl: string,
): Promise<{ result: string }> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [walletAddress, 'latest'],
      id: 1,
    }),
  });
  if (!resp.ok) throw new Error(`sentinel eth_getTransactionCount: ${resp.status}`);
  return (await resp.json()) as { result: string };
}

async function fetchGeckoterminal(tokenAddress: string): Promise<any> {
  const resp = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/base/tokens/${tokenAddress}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!resp.ok) throw new Error(`geckoterminal: ${resp.status}`);
  return await resp.json();
}
