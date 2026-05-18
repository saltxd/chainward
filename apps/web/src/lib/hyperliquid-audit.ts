// Audits Virtuals' Arena leaderboard (degen.virtuals.io) against Hyperliquid's
// public clearinghouseState + spot endpoints. Read-only, no DB writes.

const DEGEN_LEADERBOARD = 'https://degen.virtuals.io/api/leaderboard?limit=100';
const HL_API = 'https://api.hyperliquid.xyz/info';

export interface DegenAgent {
  id: string;
  name: string;
  tokenAddress: string;
  agentAddress: string;
  tokenSymbol: string;
  owner: { walletAddress: string } | null;
  performance: {
    totalRealizedPnl: number;
    holdingsValueUsd: number;
    totalTradeCount: number;
    totalTradeVolume: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    openPerps: number;
    lastTradeAt: string | null;
    calculatedAt: string;
  } | null;
}

export interface AuditRow {
  rank: number;
  name: string;
  tokenSymbol: string;
  agentAddress: string;
  tokenAddress: string;
  ownerAddress: string;
  displayedAcct: number;
  displayedRealized: number;
  displayedTrades: number;
  displayedWinRate: number;
  lastTradeAt: string | null;
  hlPerpAcct: number;
  hlSpotUsdc: number;
  hlSpotUsdcHeld: number;
  hlCombined: number;
  hlPositions: number;
  hlWithdrawable: number;
  acctDeltaPct: number;
  fetched: boolean;
}

export interface AuditSnapshot {
  rows: AuditRow[];
  fetchedAt: string;
  source: { degen: string; hyperliquid: string };
  totals: {
    displayedAcct: number;
    hlCombined: number;
    matchWithin10: number;
    matchWithin25: number;
    offBy25Plus: number;
    dormant7d: number;
  };
}

async function postHL(body: object): Promise<unknown> {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`HL ${(body as { type?: string }).type}: HTTP ${res.status}`);
  return res.json();
}

interface HLFetchResult {
  hlPerpAcct: number;
  hlSpotUsdc: number;
  hlSpotUsdcHeld: number;
  hlCombined: number;
  hlPositions: number;
  hlWithdrawable: number;
  fetched: boolean;
}

async function fetchHLForAgent(addr: string): Promise<HLFetchResult> {
  try {
    const [cs, spot] = await Promise.all([
      postHL({ type: 'clearinghouseState', user: addr }),
      postHL({ type: 'spotClearinghouseState', user: addr }),
    ]);

    const csTyped = cs as { marginSummary?: { accountValue?: string }; assetPositions?: unknown[]; withdrawable?: string };
    const spotTyped = spot as { balances?: Array<{ coin: string; total?: string; hold?: string }> };

    const perp = parseFloat(csTyped.marginSummary?.accountValue ?? '0');
    const positions = csTyped.assetPositions?.length ?? 0;
    const withdrawable = parseFloat(csTyped.withdrawable ?? '0');

    const usdcCoins = new Set(['USDC', 'USDE', 'USDT0', 'USDH']);
    let usdc = 0;
    let usdcHeld = 0;
    for (const b of spotTyped.balances ?? []) {
      if (usdcCoins.has(b.coin)) {
        usdc += parseFloat(b.total ?? '0');
        if (b.coin === 'USDC') usdcHeld += parseFloat(b.hold ?? '0');
      }
    }

    return {
      hlPerpAcct: perp,
      hlSpotUsdc: usdc,
      hlSpotUsdcHeld: usdcHeld,
      hlCombined: perp + usdc,
      hlPositions: positions,
      hlWithdrawable: withdrawable,
      fetched: true,
    };
  } catch {
    return {
      hlPerpAcct: 0,
      hlSpotUsdc: 0,
      hlSpotUsdcHeld: 0,
      hlCombined: 0,
      hlPositions: 0,
      hlWithdrawable: 0,
      fetched: false,
    };
  }
}

export async function getArenaAudit(topN = 30): Promise<AuditSnapshot> {
  const degenRes = await fetch(DEGEN_LEADERBOARD, { next: { revalidate: 300 } });
  if (!degenRes.ok) throw new Error(`degen leaderboard HTTP ${degenRes.status}`);
  const degenJson = (await degenRes.json()) as { data: DegenAgent[] };

  const ranked = degenJson.data
    .filter((a) => (a.performance?.totalTradeCount ?? 0) > 0)
    .sort((a, b) => (b.performance?.totalRealizedPnl ?? 0) - (a.performance?.totalRealizedPnl ?? 0))
    .slice(0, topN);

  const hlData = await Promise.all(ranked.map((a) => fetchHLForAgent(a.agentAddress)));

  const rows: AuditRow[] = ranked.map((a, i) => {
    const perf = a.performance;
    if (!perf) throw new Error(`unexpected: agent ${a.id} passed filter but has no performance`);
    const displayedAcct = perf.holdingsValueUsd;
    const hl = hlData[i]!;
    const acctDeltaPct = displayedAcct > 0 ? ((hl.hlCombined - displayedAcct) / displayedAcct) * 100 : 0;
    return {
      rank: i + 1,
      name: a.name,
      tokenSymbol: a.tokenSymbol,
      agentAddress: a.agentAddress,
      tokenAddress: a.tokenAddress,
      ownerAddress: a.owner?.walletAddress ?? '',
      displayedAcct,
      displayedRealized: perf.totalRealizedPnl,
      displayedTrades: perf.totalTradeCount,
      displayedWinRate: perf.winRate,
      lastTradeAt: perf.lastTradeAt,
      acctDeltaPct,
      hlPerpAcct: hl.hlPerpAcct,
      hlSpotUsdc: hl.hlSpotUsdc,
      hlSpotUsdcHeld: hl.hlSpotUsdcHeld,
      hlCombined: hl.hlCombined,
      hlPositions: hl.hlPositions,
      hlWithdrawable: hl.hlWithdrawable,
      fetched: hl.fetched,
    };
  });

  const fetched = rows.filter((r) => r.fetched);
  const now = Date.now();
  const dormant = rows.filter((r) => {
    if (!r.lastTradeAt) return false;
    const age = (now - new Date(r.lastTradeAt).getTime()) / (1000 * 60 * 60 * 24);
    return age >= 7;
  }).length;

  return {
    rows,
    fetchedAt: new Date().toISOString(),
    source: { degen: DEGEN_LEADERBOARD, hyperliquid: HL_API },
    totals: {
      displayedAcct: rows.reduce((s, r) => s + r.displayedAcct, 0),
      hlCombined: fetched.reduce((s, r) => s + r.hlCombined, 0),
      matchWithin10: fetched.filter((r) => r.displayedAcct > 0 && Math.abs(r.hlCombined - r.displayedAcct) / r.displayedAcct < 0.10).length,
      matchWithin25: fetched.filter((r) => r.displayedAcct > 0 && Math.abs(r.hlCombined - r.displayedAcct) / r.displayedAcct < 0.25).length,
      offBy25Plus: fetched.filter((r) => r.displayedAcct > 0 && Math.abs(r.hlCombined - r.displayedAcct) / r.displayedAcct >= 0.25).length,
      dormant7d: dormant,
    },
  };
}
