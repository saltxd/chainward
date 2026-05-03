import type { QuickDecodeResult, Source } from './types.js';
import { SCHEMA_VERSION, CLASSIFIER_VERSION, DISCLOSURE_TEXT } from './types.js';
import { classifyWallet } from './wallet-arch.js';
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
  };
  // Optional spot prices for ETH and USDC, used to USD-quote balances.
  // Defaulting USDC to 1 is fine; ETH defaults to 0 and yields a $0 USD
  // figure rather than a misleading hardcoded number.
  ethUsdPrice?: number;
  usdcUsdPrice?: number;
  replayMode?: boolean;
}

export async function quickDecode(input: QuickDecodeInput): Promise<QuickDecodeResult> {
  const now = input.now ?? new Date();
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
  });

  const activity = computeActivity(
    input.fixtures.blockscout_transfers.items ?? [],
    now,
  );

  const survival = classifySurvival({
    transfers_7d: activity.transfers_7d,
    latest_transfer_age_hours: activity.latest_transfer_age_hours,
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

  const data = {
    target: {
      input: input.input,
      wallet_address: input.wallet_address,
      handle: acp.twitterHandle ?? null,
      name: acp.name ?? null,
      acp_id: acp.id ?? null,
      virtuals_agent_id: acp.virtualAgentId ?? null,
      framework: 'virtuals_acp' as const,
      owner_address: acp.ownerAddress ?? null,
    },
    wallet,
    balances,
    token_trading,
    activity,
    claims,
    chain_reality,
    discrepancies: discrepancyResult.discrepancies,
    checks_performed: discrepancyResult.checks_performed,
    survival,
    usdc_pattern,
    peers: { ...peerResult, cluster, cluster_status },
  };

  const reportResult = await writeReport(data, { replayMode: input.replayMode });

  const sources: Source[] = [
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
  ];

  return {
    report: reportResult.markdown,
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
      report_source: reportResult.source,
    },
  };
}
