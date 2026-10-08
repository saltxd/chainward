import { RISK_CHAINS, riskChainAddressUrl, riskChainStablecoin } from '@chainward/common';
import type { DecodeChain, DecodeDataSource, QuickDecodeResult, QuickDecodeResultData, Source } from './types.js';
import { SCHEMA_VERSION, CLASSIFIER_VERSION, DISCLOSURE_TEXT } from './types.js';
import { classifyWallet } from './wallet-arch.js';
import { formatWindowDays } from './rpc-fixtures.js';
import { computeActivity, computeBalances } from './chain-audit.js';
import { compareACPClaims } from './discrepancies.js';
import { classifySurvival } from './survival.js';
import { classifyUsdcPattern } from './usdc-pattern.js';
import { findPeers, computeClusterStatus, type ObservatoryAgent } from './peers.js';
import { extractTokenTrading } from './token-trading.js';
import { writeReport } from './report-writer.js';
import { parseSentinelBlock } from './sentinel-block.js';

export interface QuickDecodeInput {
  input: string;
  wallet_address: string;
  job_id: string;
  pipeline_version: string;
  now?: Date;
  /** Chain the fixtures were read from. Defaults to base (the original path). */
  chain?: DecodeChain;
  fixtures: {
    acp_details: any;
    blockscout_counters: any;
    blockscout_transfers: any;
    sentinel_code: { result: string };
    sentinel_nonce: { result: string };
    sentinel_eth_balance?: { result: string };
    sentinel_usdc_balance?: { result: string };
    geckoterminal?: any;
    observatory?: ObservatoryAgent[];
    sentinel_block?: { number: string; hash: string };
    /** Freshness provenance of the RPC that served the `latest` reads (see data-fetch). */
    data_source?: {
      rpc_role: DecodeDataSource;
      head_number: number;
      head_age_seconds: number;
      head_stale: boolean;
    };
    /** The transfer window actually scanned, when narrower than 30 days (rpc-fixtures). */
    window?: { days: number; requested_days?: number; from_block: number; to_block: number };
  };
  // Optional spot prices for ETH and USDC, used to USD-quote balances.
  // Defaulting USDC to 1 is fine; ETH defaults to 0 and yields a $0 USD
  // figure rather than a misleading hardcoded number.
  ethUsdPrice?: number;
  usdcUsdPrice?: number;
  replayMode?: boolean;
}

/**
 * The classifier output of a quick decode, minus the LLM prose step.
 *
 * `data` is the full QuickDecodeResultData (everything deriveRiskFlags reads);
 * `sources` + `meta` are stamped identically to quickDecode. The markdown
 * report (writeReport / claude --print) is intentionally NOT produced here —
 * the risk-check hot path needs flags, which are pure over `data`, so it must
 * never spawn claude. quickDecode() composes this with the prose step.
 */
export interface QuickDecodeData {
  data: QuickDecodeResultData;
  sources: Source[];
  meta: Omit<QuickDecodeResult['meta'], 'report_source'>;
}

/**
 * Computes the full classifier result for a quick decode WITHOUT invoking the
 * LLM prose step. Pure aside from the data it was handed (no claude, no extra
 * I/O). Used directly by the risk-check worker; quickDecode() wraps it.
 */
export function computeQuickDecodeData(input: QuickDecodeInput): QuickDecodeData {
  const now = input.now ?? new Date();
  const chain: DecodeChain = input.chain ?? 'base';
  const chainCfg = RISK_CHAINS[chain];
  const observatory = input.fixtures.observatory ?? [];

  const acp = input.fixtures.acp_details?.data ?? input.fixtures.acp_details ?? {};
  const wallet = classifyWallet({
    code: input.fixtures.sentinel_code.result,
    nonce: parseInt(input.fixtures.sentinel_nonce.result, 16),
  });

  const balances = computeBalances({
    ethBalanceWei: input.fixtures.sentinel_eth_balance?.result ?? '0x0',
    usdcRawBalance: input.fixtures.sentinel_usdc_balance?.result ?? '0x0',
    ethUsdPrice: input.ethUsdPrice ?? 0,
    usdcUsdPrice: input.usdcUsdPrice ?? 1,
    usdcDecimals: riskChainStablecoin(chain, 'USDC')?.decimals ?? 6,
  });

  const transfers = input.fixtures.blockscout_transfers ?? { items: [] };
  const transferItems: any[] = Array.isArray(transfers.items) ? transfers.items : [];
  // Every transfer source failed: the list is unknown, not empty.
  const unavailable: string | undefined =
    typeof transfers.unavailable === 'string' && transfers.unavailable.length > 0 ? transfers.unavailable : undefined;
  const activity = computeActivity(transferItems, now);
  const ds = input.fixtures.data_source;
  const win = input.fixtures.window;
  const fetch_meta: QuickDecodeResultData['fetch_meta'] = {
    transfers_fetched: transferItems.length,
    transfers_truncated: transfers.truncated === true,
    ...(transfers.source ? { transfers_source: transfers.source } : {}),
    ...(unavailable ? { transfers_unavailable: unavailable } : {}),
    // Record the RPC source only when the freshness-gated fetch provided it, so
    // legacy fixtures keep their exact two-key shape.
    ...(ds
      ? {
          data_source: ds.rpc_role,
          head_lag_seconds: ds.head_age_seconds,
          head_stale: ds.head_stale,
        }
      : {}),
    // The scan window, when the fetch bounded it (public-RPC chains). `days` is
    // what was covered; the requested span is kept only when the scan fell short.
    ...(win
      ? {
          window_days: Math.round(win.days * 100) / 100,
          ...(win.requested_days !== undefined && win.requested_days !== win.days
            ? { window_requested_days: win.requested_days }
            : {}),
          window_blocks: { from: win.from_block, to: win.to_block },
        }
      : {}),
  };

  const survival = unavailable
    ? {
        classification: 'unknown' as const,
        rationale: `Not assessed: the transfer list could not be read. ${unavailable}`,
      }
    : classifySurvival({
        transfers_7d: activity.transfers_7d,
        latest_transfer_age_hours: activity.latest_transfer_age_hours,
        window_days: fetch_meta.window_days ?? 30,
        holds_value: balances.usdc.amount > 0,
      });

  const usdc_pattern = classifyUsdcPattern({
    classification: survival.classification,
    usdc_balance: balances.usdc.amount,
  });

  const claims = {
    agdp: acp.grossAgenticAmount ?? null,
    revenue: acp.revenue ?? null,
    successful_jobs: acp.successfulJobCount ?? null,
    total_jobs: acp.totalJobCount ?? null,
    success_rate: acp.successRate ?? null,
    last_active_at_acp: acp.metrics?.lastActiveAt ?? acp.lastActiveAt ?? null,
    is_online_acp: acp.metrics?.isOnline ?? acp.isOnline ?? null,
  };

  const chain_reality = {
    active_today: activity.transfers_24h > 0,
    active_7d: activity.transfers_7d > 0,
    active_30d: activity.transfers_30d > 0,
    settlement_path: [],
    payment_manager_seen: false,
  };

  const discrepancyResult = compareACPClaims({
    acp: { lastActiveAt: claims.last_active_at_acp, isOnline: claims.is_online_acp },
    chain: {
      latest_transfer_at: activity.latest_transfer_at,
      active_today: chain_reality.active_today,
      active_7d: chain_reality.active_7d,
    },
  });

  const cluster = acp.cluster ?? null;
  const peerResult = findPeers({
    framework: 'virtuals_acp',
    cluster,
    observatory,
    excludeAddress: input.wallet_address,
  });
  const cluster_status = computeClusterStatus(cluster, observatory);

  const token_trading = extractTokenTrading({
    acp_details: acp,
    geckoterminal: input.fixtures.geckoterminal ?? null,
  });

  const data: QuickDecodeResultData = {
    // Only stamped off-base so Base reports keep their historical shape.
    ...(chain === 'base' ? {} : { chain }),
    target: {
      input: input.input,
      wallet_address: input.wallet_address,
      handle: acp.twitterHandle ?? null,
      name: acp.name ?? null,
      acp_id: acp.id ?? null,
      virtuals_agent_id: acp.virtualAgentId ?? null,
      // ACP is a Base registry; off-base there is no framework signal.
      framework: chainCfg.sources.acp ? ('virtuals_acp' as const) : ('unknown' as const),
      owner_address: acp.ownerAddress ?? null,
    },
    wallet,
    balances,
    token_trading,
    activity,
    fetch_meta,
    claims,
    chain_reality,
    // "ACP says online, chain shows no transfers" needs the transfer list it compares against.
    discrepancies: unavailable
      ? discrepancyResult.discrepancies.filter((d) => d.field !== 'isOnline')
      : discrepancyResult.discrepancies,
    checks_performed: unavailable
      ? discrepancyResult.checks_performed.filter((c) => c !== 'isOnline')
      : discrepancyResult.checks_performed,
    survival,
    usdc_pattern,
    peers: { ...peerResult, cluster, cluster_status },
  };

  const sources: Source[] =
    chain === 'base'
      ? [
          {
            label: 'Blockscout token-transfers',
            url: `https://base.blockscout.com/api/v2/addresses/${input.wallet_address}/token-transfers`,
            block_number: null,
            block_hash: null,
            timestamp: now.toISOString(),
          },
          {
            label: 'ACP API agent details',
            url: acp.id ? `https://acpx.virtuals.io/api/agents/${acp.id}/details` : 'https://acpx.virtuals.io/api',
            block_number: null,
            block_hash: null,
            timestamp: now.toISOString(),
          },
        ]
      : [
          {
            label: `${chainCfg.name} RPC — ERC-20 Transfer logs (${win ? `${formatWindowDays(win.days)} window` : 'bounded window'})`,
            url: riskChainAddressUrl(chain, input.wallet_address),
            block_number: win?.to_block ?? null,
            block_hash: null,
            timestamp: now.toISOString(),
          },
        ];

  return {
    data,
    sources,
    meta: {
      schema_version: SCHEMA_VERSION,
      classifier_version: CLASSIFIER_VERSION,
      tier: 'quick',
      pipeline_version: input.pipeline_version,
      generated_at: now.toISOString(),
      as_of_block: input.fixtures.sentinel_block
        ? parseSentinelBlock(input.fixtures.sentinel_block)
        : { number: 0, hash: '' },
      target_input: input.input,
      job_id: input.job_id,
      disclosure: DISCLOSURE_TEXT,
    },
  };
}

export async function quickDecode(input: QuickDecodeInput): Promise<QuickDecodeResult> {
  // Compute the full classifier result first (pure, no LLM), then add the prose
  // step. Sharing computeQuickDecodeData keeps quickDecode and the risk-check
  // worker structurally identical — there is exactly one place the data is built.
  const { data, sources, meta } = computeQuickDecodeData(input);

  const reportResult = await writeReport(data, { replayMode: input.replayMode });

  return {
    report: reportResult.markdown,
    data,
    sources,
    meta: {
      ...meta,
      report_source: reportResult.source,
    },
  };
}
