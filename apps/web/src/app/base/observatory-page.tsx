'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  PageShell,
  NavBar,
  StatusTicker,
  SectionHead,
  StatTile,
  DataTable,
  Badge,
  Button,
  type Column,
} from '@/components/v2';

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
    const res = await fetch(`/api/observatory${path}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data;
  } catch {
    return null;
  }
}

type LeaderboardTab = 'mostActive' | 'highestGas' | 'largestPortfolio' | 'healthiest';

const TAB_LABELS: Record<LeaderboardTab, string> = {
  mostActive: 'most.active',
  highestGas: 'highest.gas',
  largestPortfolio: 'largest.portfolio',
  healthiest: 'healthiest',
};

export function ObservatoryPage() {
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

  const leaderboardColumns: Column<LeaderboardEntry>[] = [
    {
      key: 'rank',
      header: '#',
      width: '48px',
      render: (r) => <span style={{ color: 'var(--muted)' }}>{r.rank}</span>,
    },
    {
      key: 'name',
      header: 'agent',
      render: (r) => (
        <Link
          href={`/base/${r.slug}`}
          style={{ color: 'var(--fg)', textDecoration: 'none' }}
          className="hover:underline"
        >
          {r.agentName || truncateAddress(r.walletAddress)}
          <span style={{ marginLeft: 10, color: 'var(--muted)', fontSize: 11 }}>
            {truncateAddress(r.walletAddress)}
          </span>
        </Link>
      ),
    },
    {
      key: 'framework',
      header: 'framework',
      width: '140px',
      render: (r) =>
        r.agentFramework ? <Badge tone="phosphor">{r.agentFramework}</Badge> : null,
    },
    {
      key: 'value',
      header: 'value',
      align: 'right',
      width: '140px',
      render: (r) => {
        if (tab === 'mostActive') return `${r.txCount ?? 0} txs`;
        if (tab === 'highestGas') return formatUsd(r.gasSpendUsd ?? 0);
        if (tab === 'healthiest') {
          const score = r.healthScore ?? 0;
          const color =
            score >= 80 ? 'var(--phosphor)' : score >= 50 ? 'var(--amber)' : 'var(--danger)';
          return <span style={{ color }}>{score}/100</span>;
        }
        return formatUsd(r.portfolioValueUsd ?? 0);
      },
    },
  ];

  const feedColumns: Column<FeedItem>[] = [
    {
      key: 'time',
      header: 'time',
      width: '80px',
      render: (r) => <span style={{ color: 'var(--muted)' }}>{timeAgo(r.timestamp)}</span>,
    },
    {
      key: 'agent',
      header: 'agent',
      render: (r) => (
        <Link
          href={`/wallet/${r.walletAddress}`}
          style={{ color: 'var(--fg)', textDecoration: 'none' }}
        >
          {r.agentName || truncateAddress(r.walletAddress)}
        </Link>
      ),
    },
    {
      key: 'dir',
      header: 'dir',
      width: '60px',
      render: (r) => (
        <Badge tone={r.direction.toUpperCase() === 'IN' ? 'phosphor' : 'neutral'}>
          {r.direction.slice(0, 3).toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'tok',
      header: 'tok',
      width: '70px',
      render: (r) => r.tokenSymbol ?? 'ETH',
    },
    {
      key: 'usd',
      header: 'usd',
      align: 'right',
      width: '90px',
      render: (r) => formatUsd(r.amountUsd),
    },
  ];

  return (
    <PageShell>
      <StatusTicker />
      <div className="v2-shell" style={{ paddingTop: 0, paddingBottom: 80 }}>
        <NavBar ctaHref="/login" ctaLabel="./connect" />

        <section style={{ paddingTop: 56 }}>
          <SectionHead
            tag="live"
            title={
              <>
                Base Agent{' '}
                <span className="serif" style={{ color: 'var(--phosphor)' }}>
                  Observatory.
                </span>
              </>
            }
            lede="Every Virtuals, Olas, and operator-built agent transacting on Base — indexed live. Browse activity, stack-rank by health, watch tx flow in real time."
          />
          <div className="v2-obs-stats">
            <StatTile
              label="agents.tracked"
              value={overview ? overview.totalAgents.toLocaleString() : '…'}
              unit="wallets"
            />
            <StatTile
              label="active.24h"
              value={overview ? String(overview.activeAgents24h) : '…'}
            />
            <StatTile
              label="tx.24h"
              value={overview ? overview.transactions24h.toLocaleString() : '…'}
            />
            <StatTile
              label="gas.24h"
              value={overview ? formatUsd(overview.gasBurned24h.usd) : '…'}
            />
            <StatTile
              label="portfolio"
              value={overview ? formatUsd(overview.totalPortfolioValue) : '…'}
              unit="usd"
            />
          </div>
        </section>

        <p className="sr-only">
          The Base Agent Observatory tracks autonomous AI agent wallets operating on Base chain.
          View real-time transaction volumes, gas analytics, agent leaderboards, and a live feed of
          on-chain activity. All data is sourced from Base mainnet and updated continuously.
        </p>

        <section className="v2-obs-grid" style={{ paddingTop: 64 }}>
          <div>
            <SectionHead
              tag="leaderboard"
              title={
                <>
                  Top agents <span className="serif">by activity.</span>
                </>
              }
            />
            <div className="v2-obs-tabs">
              {(Object.keys(TAB_LABELS) as LeaderboardTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`v2-obs-tab ${tab === t ? 'v2-obs-tab-active' : ''}`}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
            <DataTable
              columns={leaderboardColumns}
              rows={leaderboardRows}
              empty="No leaderboard data yet."
              mobileCard
            />
          </div>

          <div>
            <SectionHead
              tag="live.tx"
              title={<span className="display">Live tx feed.</span>}
            />
            <div className="v2-obs-feed-scroll">
              <DataTable
                columns={feedColumns}
                rows={feed ?? []}
                empty="No recent activity."
                mobileCard
              />
            </div>
          </div>
        </section>

        <section className="v2-obs-charts" style={{ paddingTop: 64 }}>
          <div>
            <SectionHead tag="tx.30d" title="Transaction volume." />
            <div className="v2-obs-chart-card">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart
                  data={txChartData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="date"
                    stroke="#585f56"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                  />
                  <YAxis
                    stroke="#585f56"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f1110',
                      border: '1px solid #1e231f',
                      borderRadius: 0,
                      fontSize: 11,
                    }}
                    labelStyle={{ color: '#9ba397' }}
                    itemStyle={{ color: '#3aa76d' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3aa76d"
                    fill="#3aa76d"
                    fillOpacity={0.1}
                    strokeWidth={1.5}
                    name="tx"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <SectionHead tag="gas.30d" title="Gas spend." />
            <div className="v2-obs-chart-card">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart
                  data={gasChartData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="date"
                    stroke="#585f56"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                  />
                  <YAxis
                    stroke="#585f56"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f1110',
                      border: '1px solid #1e231f',
                      borderRadius: 0,
                      fontSize: 11,
                    }}
                    labelStyle={{ color: '#9ba397' }}
                    itemStyle={{ color: '#3aa76d' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="gasUsd"
                    stroke="#3aa76d"
                    fill="#3aa76d"
                    fillOpacity={0.1}
                    strokeWidth={1.5}
                    name="gas"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section style={{ paddingTop: 80 }}>
          <div className="v2-obs-cta">
            <div>
              <h3 className="display" style={{ fontSize: 28, margin: 0, color: 'var(--fg)' }}>
                Private monitoring for{' '}
                <span className="serif" style={{ color: 'var(--phosphor)' }}>
                  your fleet.
                </span>
              </h3>
              <p
                style={{
                  marginTop: 8,
                  color: 'var(--fg-dim)',
                  fontSize: 13,
                  lineHeight: 1.7,
                  maxWidth: 520,
                }}
              >
                The public observatory watches the whole ecosystem. Want Discord pings when one of
                YOUR agents fails a swap? Free tier — 3 agents, every alert type.
              </p>
            </div>
            <Button href="/login">./start-monitoring →</Button>
          </div>
        </section>
      </div>

      <style>{`
        .v2-obs-stats {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 32px;
          padding-top: 32px;
          border-top: 1px solid var(--line);
        }
        .v2-obs-grid {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 32px;
          align-items: start;
        }
        .v2-obs-feed-scroll {
          max-height: 720px;
          overflow-y: auto;
          border: 1px solid var(--line);
        }
        .v2-obs-feed-scroll .v2-tbl {
          border: none;
        }
        .v2-obs-feed-scroll .v2-tbl-header {
          position: sticky;
          top: 0;
          background: var(--bg-1);
          z-index: 2;
        }
        @media (max-width: 1100px) {
          .v2-obs-feed-scroll {
            max-height: none;
            overflow: visible;
            border: none;
          }
          .v2-obs-feed-scroll .v2-tbl {
            border: 1px solid var(--line);
          }
          .v2-obs-feed-scroll .v2-tbl-header {
            position: static;
          }
        }
        .v2-obs-charts {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
        }
        .v2-obs-chart-card {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 16px;
        }
        .v2-obs-tabs {
          display: flex;
          gap: 0;
          margin-bottom: 12px;
          border: 1px solid var(--line);
          background: var(--bg-1);
        }
        .v2-obs-tab {
          flex: 1;
          background: transparent;
          border: none;
          padding: 10px 14px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          color: var(--fg-dim);
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: color 0.15s, background 0.15s;
          border-right: 1px solid var(--line);
        }
        .v2-obs-tab:last-child { border-right: none; }
        .v2-obs-tab:hover { color: var(--phosphor); }
        .v2-obs-tab-active { color: var(--phosphor); background: rgba(58, 167, 109, 0.06); }
        .v2-obs-cta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 40px;
          padding: 40px;
          border: 1px solid var(--line-2);
          background: var(--bg-1);
          flex-wrap: wrap;
        }
        @media (max-width: 1100px) {
          .v2-obs-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 960px) {
          .v2-obs-stats { grid-template-columns: repeat(2, 1fr); }
          .v2-obs-charts { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .v2-obs-stats {
            gap: 16px 20px !important;
            padding-top: 24px !important;
          }
          .v2-obs-tabs {
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
            scroll-snap-type: x mandatory;
          }
          .v2-obs-tab {
            padding: 8px 12px !important;
            font-size: 10px !important;
            scroll-snap-align: start;
            flex: 0 0 auto !important;
          }
          .v2-obs-cta {
            padding: 24px !important;
            gap: 20px !important;
          }
          .v2-obs-chart-card {
            padding: 8px !important;
          }
        }
      `}</style>
    </PageShell>
  );
}
