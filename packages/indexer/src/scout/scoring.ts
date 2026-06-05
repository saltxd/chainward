export interface AgentRow {
  acpId: number;
  name: string;
  walletAddress: string;
  twitterHandle: string | null;
  grossAgenticAmount: number | null;
  revenue: number | null;
  uniqueBuyerCount: number | null;
  transactionCount: number | null;
  walletBalance: string | null;
  successfulJobCount: number | null;
  lastActiveAt: string | null;
}

export interface ScoreResult {
  anomaly: number;
  reach: number;
  juice: number;
  ratio: number | null;
  gapBucket: 'measured' | 'unmeasurable' | 'none';
  belowFloor: boolean;
  capFlag: boolean;
  proof: string;
}

const AGDP_FLOOR = 5_000;
const AGDP_CAP = 99_999_999.99;
const RATIO_ALERT = 100;

export function scoreCandidate(a: AgentRow): ScoreResult {
  const agdp = a.grossAgenticAmount ?? 0;
  const rev = a.revenue;
  const buyers = a.uniqueBuyerCount ?? 0;
  const capFlag = Math.abs(agdp - AGDP_CAP) < 0.011;

  if (agdp < AGDP_FLOOR) {
    return { anomaly: 0, reach: buyers, juice: 0, ratio: null, gapBucket: 'none', belowFloor: true, capFlag, proof: '' };
  }

  let anomaly = 0;
  let ratio: number | null = null;
  let gapBucket: ScoreResult['gapBucket'] = 'none';

  if (rev === null || rev === 0) {
    gapBucket = 'unmeasurable';
    anomaly = Math.min(Math.log10(agdp + 1) / 9, 1);
  } else if (rev >= agdp) {
    anomaly = 0;
    ratio = agdp / rev;
    gapBucket = 'measured';
  } else {
    ratio = agdp / rev;
    gapBucket = 'measured';
    anomaly = Math.min(Math.log10(ratio) / Math.log10(10_000), 1);
  }

  const reachNorm = Math.min(Math.log10(buyers + 1) / 4, 1);
  const juice = anomaly * reachNorm;

  const agdpStr = agdp >= 1e6 ? `$${(agdp / 1e6).toFixed(1)}M` : agdp >= 1e3 ? `$${(agdp / 1e3).toFixed(1)}K` : `$${agdp.toFixed(0)}`;
  const revStr = rev === null || rev === 0 ? 'no on-chain revenue' : rev >= 1e3 ? `$${(rev / 1e3).toFixed(1)}K` : `$${rev.toFixed(0)}`;
  const ratioStr = ratio && ratio >= 1 ? ` — ${Math.round(ratio).toLocaleString()}× gap` : gapBucket === 'unmeasurable' ? ` — unmeasurable gap` : '';
  const proof = `${agdpStr} aGDP vs ${revStr}${ratioStr}; ${buyers.toLocaleString()} unique on-chain buyers`;

  return { anomaly, reach: buyers, juice, ratio, gapBucket, belowFloor: false, capFlag, proof };
}

export const SCOUT_THRESHOLDS = { AGDP_FLOOR, AGDP_CAP, RATIO_ALERT };
