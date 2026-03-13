'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

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
      className={`animate-pulse rounded bg-white/5 ${className}`}
    />
  );
}

function StatCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-[#0a0a0f] p-5">
      <p className="text-sm text-gray-500">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <>
          <p className="mt-1 text-2xl font-bold text-white">{value}</p>
          {sub && <p className="mt-0.5 text-sm text-gray-500">{sub}</p>}
        </>
      )}
    </div>
  );
}

function PulseDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade80] opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#4ade80]" />
    </span>
  );
}

const FRAMEWORK_COLORS: Record<string, string> = {
  elizaos: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  olas: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  virtuals: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  agentkit: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  crewai: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  langchain: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  custom: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

function FrameworkBadge({ framework }: { framework: string }) {
  const colors = FRAMEWORK_COLORS[framework.toLowerCase()] ?? FRAMEWORK_COLORS.custom;
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${colors}`}
    >
      {framework}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const isIn = direction.toLowerCase() === 'in';
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        isIn
          ? 'bg-[#4ade80]/10 text-[#4ade80]'
          : 'bg-red-500/10 text-red-400'
      }`}
    >
      {isIn ? 'IN' : 'OUT'}
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
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-bold text-white">Agent Leaderboard</h2>
      <div className="flex gap-1 rounded-lg border border-white/5 bg-[#0a0a0f] p-1">
        {(Object.keys(TAB_LABELS) as LeaderboardTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-white/10 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-white/5 bg-[#0a0a0f]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Framework</th>
              <th className="px-4 py-3 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-6" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-4 w-20" /></td>
                  </tr>
                ))
              : entries.map((entry) => (
                  <tr
                    key={`${entry.walletAddress}-${entry.rank}`}
                    className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 font-mono text-gray-500">
                      {entry.rank}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/wallet/${entry.walletAddress}`}
                        className="text-white transition-colors hover:text-[#4ade80]"
                      >
                        {entry.agentName || truncateAddress(entry.walletAddress)}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-gray-600">
                        {truncateAddress(entry.walletAddress)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {entry.agentFramework && <FrameworkBadge framework={entry.agentFramework} />}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-white">
                      {tab === 'healthiest' ? (
                        <span className={
                          (entry.healthScore ?? 0) >= 80 ? 'text-[#4ade80]' :
                          (entry.healthScore ?? 0) >= 50 ? 'text-yellow-400' :
                          'text-red-400'
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
                <td colSpan={4} className="px-4 py-8 text-center text-gray-600">
                  No data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
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

  const updatedAgo = overview?.updatedAt ? timeAgo(overview.updatedAt) : '...';

  const txChartData = (trends?.dailyTxCount ?? []).map((d) => ({
    date: formatChartDate(d.date),
    count: d.count ?? 0,
  }));

  const gasChartData = (trends?.dailyGasSpend ?? []).map((d) => ({
    date: formatChartDate(d.date),
    gasUsd: d.gasUsd ?? 0,
  }));

  return (
    <div className="min-h-screen bg-[#050508]">
      {/* Subtle grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(74,222,128,1) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between border-b border-white/5 px-6 py-4 md:px-12">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/chainward-logo.svg" alt="ChainWard" className="h-7 w-7" />
          <span className="text-base font-semibold tracking-tight text-white">
            Chain<span className="text-[#4ade80]">Ward</span>
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/wallet"
            className="hidden text-sm text-gray-400 transition-colors hover:text-white sm:block"
          >
            Wallet Lookup
          </Link>
          <Link
            href="/login"
            className="whitespace-nowrap rounded-md bg-[#1B5E20] px-3 py-2 text-xs font-medium text-white transition-all hover:bg-[#2E7D32] hover:shadow-[0_0_20px_rgba(74,222,128,0.15)] sm:px-4 sm:text-sm"
          >
            Connect Wallet
          </Link>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* ---------------------------------------------------------------- */}
        {/*  Header                                                          */}
        {/* ---------------------------------------------------------------- */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Base Agent Observatory
          </h1>
          <p className="mt-2 text-base text-gray-400">
            Real-time intelligence on AI agent activity on Base
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-[#4ade80]">
            <PulseDot />
            {loading ? (
              <Skeleton className="h-4 w-60" />
            ) : (
              <span>
                Tracking {overview?.agentsTracked ?? 0} agents &middot; Updated{' '}
                {updatedAgo}
              </span>
            )}
          </p>
        </header>

        {/* ---------------------------------------------------------------- */}
        {/*  SEO blurb                                                       */}
        {/* ---------------------------------------------------------------- */}
        <p className="mb-8 max-w-3xl text-sm leading-relaxed text-gray-500">
          The Base Agent Observatory tracks autonomous AI agent wallets operating
          on Base chain. View real-time transaction volumes, gas analytics, agent
          leaderboards, and a live feed of on-chain activity. All data is sourced
          from Base mainnet and updated continuously.
        </p>

        {/* ---------------------------------------------------------------- */}
        {/*  Fleet Stats                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label="Agents Tracked"
            value={String(overview?.agentsTracked ?? 0)}
            loading={loading}
          />
          <StatCard
            label="24h Transactions"
            value={String(overview?.transactions24h ?? 0)}
            loading={loading}
          />
          <StatCard
            label="24h Gas Burned"
            value={formatEth(overview?.gasBurned24h?.eth ?? 0)}
            sub={`(${formatUsd(overview?.gasBurned24h?.usd ?? 0)})`}
            loading={loading}
          />
          <StatCard
            label="Active Agents"
            value={`${overview?.activeAgents24h ?? 0} / ${overview?.totalAgents ?? 0}`}
            loading={loading}
          />
        </section>

        {/* ---------------------------------------------------------------- */}
        {/*  Activity Charts                                                 */}
        {/* ---------------------------------------------------------------- */}
        <section className="mt-10 grid gap-4 md:grid-cols-2">
          {/* Tx Volume Chart */}
          <div className="rounded-lg border border-white/5 bg-[#0a0a0f] p-4 sm:p-6">
            <h3 className="mb-4 text-sm font-medium text-gray-400">
              Daily Transaction Volume (30d)
            </h3>
            {loading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={txChartData}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="date"
                    stroke="#666"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#666"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a2e',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#999' }}
                    itemStyle={{ color: '#4ade80' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#4ade80"
                    strokeWidth={2}
                    dot={false}
                    name="Transactions"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Gas Spend Chart */}
          <div className="rounded-lg border border-white/5 bg-[#0a0a0f] p-4 sm:p-6">
            <h3 className="mb-4 text-sm font-medium text-gray-400">
              Daily Gas Spend (30d)
            </h3>
            {loading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={gasChartData}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="date"
                    stroke="#666"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#666"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`
                    }
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                    contentStyle={{
                      backgroundColor: '#1a1a2e',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#999' }}
                    itemStyle={{ color: '#4ade80' }}
                  />
                  <Bar
                    dataKey="gasUsd"
                    fill="#4ade80"
                    radius={[4, 4, 0, 0]}
                    name="Gas (USD)"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/*  Live Feed                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section className="mt-12">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-xl font-bold text-white">Live Feed</h2>
            <PulseDot />
          </div>

          <div className="overflow-x-auto rounded-lg border border-white/5 bg-[#0a0a0f]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-gray-500">
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Time</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Agent</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Dir</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Token</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                    Amount
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                    Gas
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                    Tx
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="px-4 py-3"><Skeleton className="h-4 w-14" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                        <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-4 w-16" /></td>
                        <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-4 w-14" /></td>
                        <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-4 w-10" /></td>
                      </tr>
                    ))
                  : (feed ?? []).map((item, i) => (
                      <tr
                        key={`${item.txHash}-${i}`}
                        className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">
                          {timeAgo(item.timestamp)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Link
                            href={`/wallet/${item.walletAddress}`}
                            className="text-white transition-colors hover:text-[#4ade80]"
                          >
                            {item.agentName || truncateAddress(item.walletAddress)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <DirectionBadge direction={item.direction} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">
                          {item.tokenSymbol ?? 'ETH'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-white">
                          {formatUsd(item.amountUsd)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-gray-500">
                          {formatUsd(item.gasCostUsd)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <a
                            href={`https://basescan.org/tx/${item.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-[#4ade80]/70 transition-colors hover:text-[#4ade80]"
                          >
                            {item.txHash.slice(0, 6)}...
                            <svg
                              className="ml-0.5 inline-block h-3 w-3"
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
                        </td>
                      </tr>
                    ))}
                {!loading && (!feed || feed.length === 0) && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-gray-600"
                    >
                      No recent activity
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/*  Leaderboard                                                     */}
        {/* ---------------------------------------------------------------- */}
        <LeaderboardSection data={leaderboard} loading={loading} />

        {/* ---------------------------------------------------------------- */}
        {/*  CTA                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section className="mt-16">
          <div className="relative overflow-hidden rounded-2xl border border-[#1B5E20]/30 bg-gradient-to-b from-[#0a0f0a] to-[#050508] p-10 text-center shadow-[0_0_40px_rgba(74,222,128,0.08)] md:p-14">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(27,94,32,0.15),_transparent_70%)]" />
            <h2 className="relative text-xl font-bold text-white md:text-2xl">
              This is public data. Want private monitoring for{' '}
              <span className="text-[#4ade80]">your</span> agents?
            </h2>
            <p className="relative mx-auto mt-3 max-w-lg text-sm text-gray-400">
              Real-time alerts &middot; 7 alert types &middot; Discord, Telegram,
              webhook
            </p>
            <p className="relative mt-1 text-sm text-gray-500">
              chainward.ai - free during beta
            </p>
            <div className="relative mt-6">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 rounded-lg bg-[#4ade80] px-8 py-3 text-sm font-semibold text-[#050508] transition-all hover:bg-[#22c55e] hover:shadow-[0_0_30px_rgba(74,222,128,0.25)]"
              >
                Start Monitoring
                <svg
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/*  Footer                                                            */}
      {/* ------------------------------------------------------------------ */}
      <footer className="relative z-10 border-t border-white/5 px-6 py-8 md:px-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center text-xs text-gray-600">
          <p>
            Data sourced from Base mainnet via Alchemy. Updated every 15 min.
          </p>
          <p>
            Powered by{' '}
            <Link href="/" className="text-gray-400 transition-colors hover:text-white">
              ChainWard
            </Link>{' '}
            - AgentOps for Base
          </p>
        </div>
      </footer>
    </div>
  );
}
