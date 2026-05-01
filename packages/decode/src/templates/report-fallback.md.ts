import type { QuickDecodeResultData } from '../types.js';

export function renderFallbackReport(data: QuickDecodeResultData): string {
  const { target, survival, balances, activity, usdc_pattern, peers, discrepancies } = data;
  const name = target.name ?? target.wallet_address;
  const acpId = target.acp_id ? `ACP #${target.acp_id}` : '';
  const heading = acpId ? `# ${name} (${acpId}) — ${survival.classification}` : `# ${name} — ${survival.classification}`;

  const para1 = activity.latest_transfer_at
    ? `Last on-chain activity: ${activity.latest_transfer_at} (${formatAge(activity.latest_transfer_age_hours)} ago). ${survival.rationale}.`
    : `No ERC-20 transfer history found for this wallet.`;

  const usdcLine = balances.usdc.amount > 0
    ? `Wallet holds $${balances.usdc.usd.toFixed(2)} USDC.`
    : `Wallet holds no USDC.`;
  const stranded = usdc_pattern === 'graveyard'
    ? ` This is stranded value — settlement waiting for an operator that has gone quiet.`
    : '';

  const discrepancyLine = discrepancies.length > 0
    ? `Dashboard discrepancies detected: ${discrepancies.map((d) => d.field).join(', ')}.`
    : `No dashboard-vs-chain discrepancies.`;

  const peersLine =
    peers.similar_active.length > 0
      ? `Active peers in this cohort: ${peers.similar_active.slice(0, 4).join(', ')}.`
      : '';
  const clusterLine = peers.cluster_status === 'collapsed'
    ? `The ${peers.cluster} cluster has collapsed: ≥75% of members are dormant.`
    : '';

  return [
    heading,
    '',
    para1,
    '',
    `${usdcLine}${stranded}`,
    '',
    discrepancyLine,
    '',
    [peersLine, clusterLine].filter(Boolean).join(' '),
  ].filter((line) => line !== '' || true).join('\n').trim() + '\n';
}

function formatAge(hours: number | null): string {
  if (hours === null) return 'unknown';
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours < 24) return `${Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}
