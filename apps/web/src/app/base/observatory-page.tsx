'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { FRAMEWORK_COLORS, DIRECTION_STYLES } from '@/lib/design-tokens';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

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
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function formatEth(value: number): string {
  if (value >= 1) return `${value.toFixed(2)} ETH`;
  if (value >= 0.01) return `${value.toFixed(4)} ETH`;
  return `${value.toFixed(6)} ETH`;
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-white/5 ${className}`}
    />
  );
}

function TickerStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      <span className="font-mono text-foreground text-sm font-semibold">{value}</span>
      {sub && <span className="font-mono text-muted-foreground text-xs">{sub}</span>}
    </div>
  );
}

function PulseDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-foreground opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-foreground" />
    </span>
  );
}

function FrameworkBadge({ framework }: { framework: string }) {
  const key = framework.toLowerCase();
  const fallback = { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: framework };
  const colors = FRAMEWORK_COLORS[key] ?? fallback;
  return (
    <span
      className={`inline-flex rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}
    >
      {colors.label}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const key = direction.toUpperCase() as keyof typeof DIRECTION_STYLES;
  const style = DIRECTION_STYLES[key] ?? DIRECTION_STYLES.OUT;
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Leaderboard tabs                                                          */
/* -------------------------------------------------------------------------- */

type LeaderboardTab = 'mostActive' | 'highestGas' | 'largestPortfolio' | 'healthiest';

const TAB_LABELS: Record<LeaderboardTab, string> = {
  mostActive: 'Most Active',
  highestGas: 'Highest Gas',
  largestPortfolio: 'Largest Portfolio',
  healthiest: 'Healthiest',
};

function LeaderboardSection({
  data,
  loading,
}: {
  data: LeaderboardData | null;
  loading: boolean;
}) {
  const [tab, setTab] = useState<LeaderboardTab>('mostActive');

  const entries = data?.[tab] ?? [];

  function valueForEntry(entry: LeaderboardEntry): string {
    if (tab === 'mostActive') return `${entry.txCount ?? 0} txs`;
    if (tab === 'highestGas') return formatUsd(entry.gasSpendUsd ?? 0);
    if (tab === 'healthiest') return `${entry.healthScore ?? 0}/100`;
    return formatUsd(entry.portfolioValueUsd ?? 0);
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-foreground">Agent Leaderboard</h2>
      <div className="flex gap-1 border border-border bg-muted p-1">
        {(Object.keys(TAB_LABELS) as LeaderboardTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t
                ? 'border border-border bg-card text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="mt-2 overflow-x-auto border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Agent</th>
              <th className="px-3 py-2 font-medium">Framework</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-3 py-2"><Skeleton className="h-4 w-6" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-2 text-right"><Skeleton className="ml-auto h-4 w-20" /></td>
                  </tr>
                ))
              : entries.map((entry) => (
                  <tr
                    key={`${entry.walletAddress}-${entry.rank}`}
                    className={`border-b border-border transition-colors hover:bg-[rgba(255,255,255,0.02)] ${
                      entry.rank <= 3 ? 'bg-[rgba(255,255,255,0.02)]' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {entry.rank}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/agent/${entry.walletAddress}`}
                        className="text-link hover:underline"
                      >
                        {entry.agentName || truncateAddress(entry.walletAddress)}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-text-muted">
                        {truncateAddress(entry.walletAddress)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {entry.agentFramework && <FrameworkBadge framework={entry.agentFramework} />}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">
                      {tab === 'healthiest' ? (
                        <span className={
                          (entry.healthScore ?? 0) >= 80 ? 'text-accent-foreground' :
                          (entry.healthScore ?? 0) >= 50 ? 'text-warning' :
                          'text-destructive'
                        }>
                          {valueForEntry(entry)}
                        </span>
                      ) : (
                        valueForEntry(entry)
                      )}
                    </td>
                  </tr>
                ))}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-text-muted">
                  No data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export function ObservatoryPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);

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
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh feed every 60s
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

  return (
    <div className="min-h-screen bg-background">
      {/* -------------------------------------------------------------- */}
      {/*  Status bar                                                     */}
      {/* -------------------------------------------------------------- */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/chainward-logo-128.png" alt="ChainWard" width={20} height={20} />
            <span className="text-sm font-semibold text-foreground">ChainWard</span>
          </Link>
          <nav className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
            <Link href="/base" className="text-foreground">Observatory</Link>
            <Link href="/base/digest" className="hover:text-foreground transition-colors">Digest</Link>
            <Link href="/wallet" className="hover:text-foreground transition-colors">Wallet Lookup</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
          <span className="hidden items-center gap-1.5 sm:flex">
            <PulseDot /> Tracking {overview?.agentsTracked ?? '\u2014'} agents
          </span>
          <Link href="/login" className="rounded-sm border border-border px-3 py-1.5 text-xs text-foreground hover:border-border-hover transition-colors">
            Connect Wallet
          </Link>
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/*  Stat ticker                                                    */}
      {/* -------------------------------------------------------------- */}
      <div className="flex items-center gap-6 border-b border-border px-4 py-2.5 overflow-x-auto">
        <TickerStat label="Agents" value={String(overview?.agentsTracked ?? 0)} />
        <div className="h-3 w-px bg-border" />
        <TickerStat label="Active (24h)" value={String(overview?.activeAgents24h ?? 0)} />
        <div className="h-3 w-px bg-border" />
        <TickerStat label="Txns (24h)" value={(overview?.transactions24h ?? 0).toLocaleString()} />
        <div className="h-3 w-px bg-border" />
        <TickerStat label="Gas (24h)" value={formatUsd(overview?.gasBurned24h?.usd ?? 0)} />
        <div className="h-3 w-px bg-border" />
        <TickerStat label="Portfolio" value={formatUsd(overview?.totalPortfolioValue ?? 0)} />
      </div>

      {/* -------------------------------------------------------------- */}
      {/*  SEO blurb (sr-only for screen readers, visible to crawlers)    */}
      {/* -------------------------------------------------------------- */}
      <p className="sr-only">
        The Base Agent Observatory tracks autonomous AI agent wallets operating
        on Base chain. View real-time transaction volumes, gas analytics, agent
        leaderboards, and a live feed of on-chain activity. All data is sourced
        from Base mainnet and updated continuously.
      </p>

      {/* -------------------------------------------------------------- */}
      {/*  Two-column: Leaderboard + Live Feed                            */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-5">
        {/* Leaderboard */}
        <div className="col-span-1 lg:col-span-3 border-b border-border lg:border-b-0 lg:border-r p-4">
          <LeaderboardSection data={leaderboard} loading={loading} />
        </div>

        {/* Live Feed */}
        <div className="col-span-1 lg:col-span-2 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Live Transactions</h2>
            <PulseDot />
          </div>
          <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <Skeleton className="h-4 w-10" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-8" />
                    <Skeleton className="h-4 w-10" />
                    <Skeleton className="ml-auto h-4 w-14" />
                  </div>
                ))
              : (feed ?? []).map((item, i) => (
                  <div
                    key={`${item.txHash}-${i}`}
                    className="flex items-center gap-3 py-2 text-xs transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    <span className="font-mono text-muted-foreground whitespace-nowrap">
                      {timeAgo(item.timestamp)}
                    </span>
                    <Link
                      href={`/wallet/${item.walletAddress}`}
                      className="text-foreground hover:text-link truncate max-w-[120px]"
                    >
                      {item.agentName || truncateAddress(item.walletAddress)}
                    </Link>
                    <DirectionBadge direction={item.direction} />
                    <span className="font-mono text-muted-foreground">
                      {item.tokenSymbol ?? 'ETH'}
                    </span>
                    <span className="ml-auto font-mono text-foreground whitespace-nowrap">
                      {formatUsd(item.amountUsd)}
                    </span>
                    <a
                      href={`https://basescan.org/tx/${item.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-muted-foreground hover:text-accent-foreground transition-colors"
                      title={item.txHash}
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </div>
                ))}
            {!loading && (!feed || feed.length === 0) && (
              <div className="py-12 text-center text-text-muted text-xs">
                No recent activity
              </div>
            )}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/*  Charts — half-width side-by-side                               */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-0 border-t border-border md:grid-cols-2">
        {/* Tx Volume Chart */}
        <div className="border-b border-border md:border-b-0 md:border-r p-4">
          <h3 className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Transaction Volume (30d)
          </h3>
          {loading ? (
            <Skeleton className="h-[180px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={txChartData}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <XAxis
                  dataKey="date"
                  stroke="#666"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#666"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0d1117',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '0',
                    fontSize: '11px',
                  }}
                  labelStyle={{ color: '#8b949e' }}
                  itemStyle={{ color: '#4ade80' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#4ade80"
                  fill="#4ade80"
                  fillOpacity={0.08}
                  strokeWidth={1.5}
                  name="Transactions"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Gas Spend Chart */}
        <div className="p-4">
          <h3 className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Gas Spend (30d)
          </h3>
          {loading ? (
            <Skeleton className="h-[180px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={gasChartData}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <XAxis
                  dataKey="date"
                  stroke="#666"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#666"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0d1117',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '0',
                    fontSize: '11px',
                  }}
                  labelStyle={{ color: '#8b949e' }}
                  itemStyle={{ color: '#4ade80' }}
                />
                <Area
                  type="monotone"
                  dataKey="gasUsd"
                  stroke="#4ade80"
                  fill="#4ade80"
                  fillOpacity={0.08}
                  strokeWidth={1.5}
                  name="Gas (USD)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/*  Compact CTA footer                                             */}
      {/* -------------------------------------------------------------- */}
      <div className="border-t border-border px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Private monitoring for your agents &mdash;{' '}
          <Link href="/login" className="text-accent-foreground hover:underline">
            Start monitoring
          </Link>
        </p>
      </div>

      {/* -------------------------------------------------------------- */}
      {/*  Footer                                                         */}
      {/* -------------------------------------------------------------- */}
      <footer className="border-t border-border px-6 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 text-center text-xs text-text-muted">
          <p>
            Data sourced from Base mainnet via Alchemy. Updated every 15 min.
          </p>
          <p>
            Powered by{' '}
            <Link href="/" className="text-muted-foreground transition-colors hover:text-foreground">
              ChainWard
            </Link>{' '}
            &mdash; AgentOps for Base
          </p>
        </div>
      </footer>
    </div>
  );
}
