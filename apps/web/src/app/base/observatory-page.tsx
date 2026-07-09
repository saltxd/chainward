'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';
import { fetchDedup } from '@/lib/api-dedup';

interface OverviewData {
  agentsTracked: number;
  transactions24h: number;
  transactions7d: number;
  gasBurned24h: { eth: number; usd: number };
  gasBurned7d: { eth: number; usd: number };
  totalPortfolioValue: number;
  activeAgents24h: number;
  activeAgents7d: number;
  totalAgents: number;
  updatedAt: string;
}

interface FeedItem {
  timestamp: string;
  agentName: string;
  walletAddress: string;
  direction: string;
  tokenSymbol: string | null;
  amountUsd: number;
  gasCostUsd: number;
  txHash: string;
  txType: string;
  status: string;
}

interface LeaderboardEntry {
  walletAddress: string;
  agentName: string;
  agentFramework: string | null;
  slug: string;
  txCount?: number;
  gasSpendUsd?: number;
  portfolioValueUsd?: number;
  healthScore?: number;
  rank: number;
}

interface LeaderboardData {
  mostActive: LeaderboardEntry[];
  highestGas: LeaderboardEntry[];
  largestPortfolio: LeaderboardEntry[];
  healthiest: LeaderboardEntry[];
}

interface TrendPoint {
  date: string;
  count?: number;
  gasUsd?: number;
}

interface TrendsData {
  dailyTxCount: TrendPoint[];
  dailyGasSpend: TrendPoint[];
  dailyActiveAgents: TrendPoint[];
  avgTxPerAgentPerDay: number;
}

function timeAgo(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

async function fetchObservatory<T>(path: string): Promise<T | null> {
  try {
    return await fetchDedup<T>(`/api/observatory${path}`);
  } catch {
    return null;
  }
}

type LeaderboardTab = 'mostActive' | 'highestGas' | 'largestPortfolio' | 'healthiest';

const TAB_LABELS: Record<LeaderboardTab, string> = {
  mostActive: 'Most active',
  highestGas: 'Highest gas',
  largestPortfolio: 'Largest portfolio',
  healthiest: 'Healthiest',
};

// Paper chart furniture — ink strokes on manila, hairline-consistent.
const CHART_AXIS = '#6b6152'; // --ink-faint
const CHART_STROKE = '#1b1815'; // --ink
const CHART_TOOLTIP = {
  backgroundColor: '#eae3d4', // --paper-2
  border: '1px solid #bcb19b', // --rule-strong
  borderRadius: 0,
  fontSize: 11,
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
};

function healthColor(score: number): string {
  if (score >= 80) return 'var(--seal)';
  if (score >= 50) return 'var(--sev-medium)';
  return 'var(--oxblood)';
}

export function ObservatoryPage({ children }: { children?: ReactNode }) {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [tab, setTab] = useState<LeaderboardTab>('mostActive');

  const loadData = useCallback(async () => {
    const [o, f, l, t] = await Promise.all([
      fetchObservatory<OverviewData>(''),
      fetchObservatory<FeedItem[]>('/feed'),
      fetchObservatory<LeaderboardData>('/leaderboard'),
      fetchObservatory<TrendsData>('/trends'),
    ]);
    setOverview(o);
    setFeed(f);
    setLeaderboard(l);
    setTrends(t);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const f = await fetchObservatory<FeedItem[]>('/feed');
      if (f) setFeed(f);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const txChartData = (trends?.dailyTxCount ?? []).map((d) => ({
    date: formatChartDate(d.date),
    count: d.count ?? 0,
  }));

  const gasChartData = (trends?.dailyGasSpend ?? []).map((d) => ({
    date: formatChartDate(d.date),
    gasUsd: d.gasUsd ?? 0,
  }));

  const leaderboardRows = leaderboard?.[tab] ?? [];

  function tabValue(r: LeaderboardEntry): ReactNode {
    if (tab === 'mostActive') return `${r.txCount ?? 0} txs`;
    if (tab === 'highestGas') return formatUsd(r.gasSpendUsd ?? 0);
    if (tab === 'healthiest') {
      const score = r.healthScore ?? 0;
      return <span style={{ color: healthColor(score) }}>{score}/100</span>;
    }
    return formatUsd(r.portfolioValueUsd ?? 0);
  }

  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="obs-lead">
          <span className="press-label">Live · The Observatory</span>
          <h1 className="obs-title press-display">Base Agent Observatory.</h1>
          <p className="obs-lede">
            Every Virtuals, Olas, and operator-built agent transacting on Base —
            indexed live. Browse activity, stack-rank by health, watch the tx flow
            in real time.
          </p>

          {/* Market-data strip */}
          <div className="obs-stats">
            <div className="obs-stat">
              <span className="obs-stat-label">Agents tracked</span>
              <span className="obs-stat-value mono">
                {overview ? overview.totalAgents.toLocaleString() : '—'}
              </span>
            </div>
            <div className="obs-stat">
              <span className="obs-stat-label">Active 24h</span>
              <span className="obs-stat-value mono">
                {overview ? String(overview.activeAgents24h) : '—'}
              </span>
            </div>
            <div className="obs-stat">
              <span className="obs-stat-label">Tx 24h</span>
              <span className="obs-stat-value mono">
                {overview ? overview.transactions24h.toLocaleString() : '—'}
              </span>
            </div>
            <div className="obs-stat">
              <span className="obs-stat-label">Gas 24h</span>
              <span className="obs-stat-value mono">
                {overview ? formatUsd(overview.gasBurned24h.usd) : '—'}
              </span>
            </div>
            <div className="obs-stat">
              <span className="obs-stat-label">Portfolio (USD)</span>
              <span className="obs-stat-value mono">
                {overview ? formatUsd(overview.totalPortfolioValue) : '—'}
              </span>
            </div>
          </div>
        </section>

        <p className="sr-only">
          The Base Agent Observatory tracks autonomous AI agent wallets operating on Base chain.
          View real-time transaction volumes, gas analytics, agent leaderboards, and a live feed of
          on-chain activity. All data is sourced from Base mainnet and updated continuously.
        </p>

        <section className="obs-grid">
          {/* Leaderboard */}
          <div className="obs-panel">
            <h2 className="obs-h2 press-display">Top agents</h2>
            <div className="obs-tabs" role="tablist" aria-label="Leaderboard ranking">
              {(Object.keys(TAB_LABELS) as LeaderboardTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`obs-tab ${tab === t ? 'obs-tab-active' : ''}`}
                  role="tab"
                  aria-selected={tab === t}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="obs-table">
              <div className="obs-thead obs-lb-row">
                <span>№</span>
                <span>Agent</span>
                <span>Framework</span>
                <span className="obs-right">{TAB_LABELS[tab]}</span>
              </div>
              {leaderboardRows.length === 0 ? (
                <div className="obs-empty">No leaderboard data yet.</div>
              ) : (
                leaderboardRows.map((r) => (
                  <Link
                    key={`${tab}-${r.walletAddress}`}
                    href={`/base/${r.slug}`}
                    className="obs-row obs-lb-row"
                  >
                    <span className="obs-rank mono">{r.rank}</span>
                    <span className="obs-agent">
                      <span className="obs-agent-name">
                        {r.agentName || truncateAddress(r.walletAddress)}
                      </span>
                      <span className="obs-agent-addr mono">
                        {truncateAddress(r.walletAddress)}
                      </span>
                    </span>
                    <span className="obs-framework mono">
                      {r.agentFramework ?? ''}
                    </span>
                    <span className="obs-value mono obs-right">{tabValue(r)}</span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Live feed */}
          <div className="obs-panel">
            <h2 className="obs-h2 press-display">The wire</h2>
            <div className="obs-feed-note press-label">
              Live agent transactions · refreshes every 60s
            </div>
            <div className="obs-table">
              <div className="obs-thead obs-feed-row">
                <span>Time</span>
                <span>Agent</span>
                <span>Dir</span>
                <span>Token</span>
                <span className="obs-right">USD</span>
              </div>
              {(feed ?? []).length === 0 ? (
                <div className="obs-empty">No recent activity.</div>
              ) : (
                (feed ?? []).map((r, i) => (
                  <Link
                    key={`${r.txHash}-${i}`}
                    href={`/wallet/${r.walletAddress}`}
                    className="obs-row obs-feed-row"
                  >
                    <span className="obs-time mono">{timeAgo(r.timestamp)}</span>
                    <span className="obs-agent-name">
                      {r.agentName || truncateAddress(r.walletAddress)}
                    </span>
                    <span
                      className="obs-dir mono"
                      style={{
                        color:
                          r.direction.toUpperCase() === 'IN'
                            ? 'var(--seal)'
                            : 'var(--ink-faint)',
                      }}
                    >
                      {r.direction.slice(0, 3).toUpperCase()}
                    </span>
                    <span className="obs-token mono">{r.tokenSymbol ?? 'ETH'}</span>
                    <span className="obs-usd mono obs-right">
                      {formatUsd(r.amountUsd)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="obs-charts">
          <div className="obs-panel">
            <h2 className="obs-h2 press-display">Transaction volume</h2>
            <div className="obs-chart-note press-label">Trailing 30 days</div>
            <div className="obs-chart">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart
                  data={txChartData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="date"
                    stroke={CHART_AXIS}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                  />
                  <YAxis stroke={CHART_AXIS} fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    labelStyle={{ color: '#4a4238' }}
                    itemStyle={{ color: '#1b1815' }}
                    cursor={{ stroke: '#bcb19b' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={CHART_STROKE}
                    fill={CHART_STROKE}
                    fillOpacity={0.07}
                    strokeWidth={1.25}
                    name="tx"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="obs-panel">
            <h2 className="obs-h2 press-display">Gas spend</h2>
            <div className="obs-chart-note press-label">Trailing 30 days · USD</div>
            <div className="obs-chart">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart
                  data={gasChartData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="date"
                    stroke={CHART_AXIS}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                  />
                  <YAxis
                    stroke={CHART_AXIS}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`
                    }
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    labelStyle={{ color: '#4a4238' }}
                    itemStyle={{ color: '#1b1815' }}
                    cursor={{ stroke: '#bcb19b' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="gasUsd"
                    stroke={CHART_STROKE}
                    fill={CHART_STROKE}
                    fillOpacity={0.07}
                    strokeWidth={1.25}
                    name="gas"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="obs-cta">
          <div>
            <h3 className="obs-cta-title press-display">
              Private monitoring for your fleet.
            </h3>
            <p className="obs-cta-sub">
              The public observatory watches the whole ecosystem. Want Discord
              pings when one of YOUR agents fails a swap? Free tier — 3 agents,
              every alert type.
            </p>
          </div>
          <Link href="/login" className="press-btn">
            Start monitoring →
          </Link>
        </section>

        {children}

        <Colophon />
      </div>

      <style>{`
        .obs-lead { padding: 44px 0 0; }
        .obs-title {
          margin: 14px 0 0;
          font-size: clamp(36px, 5.6vw, 64px);
          line-height: 1;
          letter-spacing: -0.03em;
        }
        .obs-lede {
          margin: 20px 0 0;
          font-family: var(--font-text);
          font-size: 18px;
          line-height: 1.55;
          color: var(--ink-soft);
          max-width: 680px;
        }
        .obs-stats {
          margin-top: 32px;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1px;
          background: var(--rule);
          border: 1px solid var(--rule);
          border-top: 3px double var(--rule-strong);
        }
        .obs-stat {
          background: var(--paper);
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .obs-stat-label {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .obs-stat-value {
          font-size: 24px;
          line-height: 1;
          color: var(--ink);
        }
        @media (max-width: 960px) {
          .obs-stats { grid-template-columns: repeat(2, 1fr); }
          .obs-stats .obs-stat:last-child { grid-column: 1 / -1; }
        }

        .obs-h2 { margin: 0 0 10px; font-size: clamp(22px, 2.8vw, 30px); }
        .obs-grid {
          padding-top: 52px;
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 48px;
          align-items: start;
        }
        .obs-grid > *, .obs-charts > * { min-width: 0; }
        @media (max-width: 1100px) {
          .obs-grid { grid-template-columns: 1fr; }
        }

        .obs-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid var(--rule-strong);
          margin-bottom: 0;
        }
        .obs-tab {
          background: transparent;
          border: none;
          padding: 9px 14px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-faint);
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: color 0.15s, border-color 0.15s;
        }
        .obs-tab:hover { color: var(--oxblood); }
        .obs-tab-active { color: var(--oxblood); border-bottom-color: var(--oxblood); }

        .obs-table { border-bottom: 1px solid var(--rule-strong); }
        .obs-thead {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-faint);
          border-bottom: 1px solid var(--rule-strong);
          padding: 10px 4px;
        }
        .obs-row {
          padding: 11px 4px;
          border-bottom: 1px solid var(--rule);
          text-decoration: none;
          color: inherit;
          transition: background 0.12s;
        }
        .obs-row:hover { background: var(--oxblood-wash); }
        .obs-row:last-child { border-bottom: none; }
        .obs-lb-row {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) 110px 110px;
          gap: 14px;
          align-items: center;
        }
        .obs-feed-row {
          display: grid;
          grid-template-columns: 64px minmax(0, 1fr) 40px 64px 78px;
          gap: 10px;
          align-items: center;
        }
        .obs-rank { font-size: 12px; color: var(--ink-faint); }
        .obs-agent { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .obs-agent-name {
          font-family: var(--font-text);
          font-size: 15px;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .obs-row:hover .obs-agent-name { color: var(--oxblood); }
        .obs-agent-addr { font-size: 10.5px; color: var(--ink-faint); }
        .obs-framework { font-size: 11px; letter-spacing: 0.04em; color: var(--ink-faint); text-transform: lowercase; }
        .obs-value { font-size: 12.5px; color: var(--ink); }
        .obs-right { text-align: right; }
        .obs-time { font-size: 11px; color: var(--ink-faint); }
        .obs-dir { font-size: 10.5px; letter-spacing: 0.08em; }
        .obs-token { font-size: 11.5px; color: var(--ink-soft); }
        .obs-usd { font-size: 12px; color: var(--ink); }
        .obs-empty {
          padding: 32px 4px;
          font-family: var(--font-text);
          font-style: italic;
          font-size: 15px;
          color: var(--ink-faint);
        }
        .obs-feed-note, .obs-chart-note { display: block; margin-bottom: 10px; }

        @media (max-width: 560px) {
          .obs-lb-row { grid-template-columns: 28px minmax(0, 1fr) 90px; }
          .obs-lb-row .obs-framework { display: none; }
          .obs-feed-row { grid-template-columns: 56px minmax(0, 1fr) 70px; }
          .obs-feed-row .obs-dir, .obs-feed-row .obs-token { display: none; }
        }

        .obs-charts {
          padding-top: 52px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
        }
        @media (max-width: 960px) {
          .obs-charts { grid-template-columns: 1fr; }
        }
        .obs-chart {
          border: 1px solid var(--rule);
          background: var(--paper-2);
          padding: 14px 10px 6px;
        }

        .obs-cta {
          margin-top: 56px;
          border-top: 3px double var(--rule-strong);
          border-bottom: 1px solid var(--rule);
          padding: 32px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          flex-wrap: wrap;
        }
        .obs-cta-title { margin: 0; font-size: clamp(22px, 3vw, 32px); }
        .obs-cta-sub {
          margin: 10px 0 0;
          font-family: var(--font-text);
          font-size: 16px;
          line-height: 1.55;
          color: var(--ink-soft);
          max-width: 520px;
        }
      `}</style>
    </PressShell>
  );
}
