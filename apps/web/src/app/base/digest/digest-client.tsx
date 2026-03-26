'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface HeadlineNumbers {
  totalRevenue: number;
  totalGas: number;
  netProfit: number;
  activeAgents: number;
  totalJobs: number;
  newAgents: number;
  wow: {
    revenueChange: number | null;
    gasChange: number | null;
    profitChange: number | null;
    activeAgentsChange: number | null;
    jobsChange: number | null;
  };
}

interface LeaderboardEntry {
  name: string | null;
  walletAddress: string;
  revenue: number;
  gasCost: number;
  profit: number;
}

interface EfficientEntry extends LeaderboardEntry {
  efficiency: number;
}

interface MoverEntry {
  name: string | null;
  walletAddress: string;
  previousRevenue: number;
  currentRevenue: number;
  changePct: number;
}

interface Leaderboards {
  mostProfitable: LeaderboardEntry[];
  mostEfficient: EfficientEntry[];
  biggestMovers: {
    gainers: MoverEntry[];
    decliners: MoverEntry[];
  };
}

interface SpotlightData {
  name: string | null;
  walletAddress: string;
  revenue: number;
  gasCost: number;
  profit: number;
  margin: number;
  jobs: number;
  successRate: number;
  uniqueHirers: number;
  topProtocols: string[];
  healthScore: number | null;
  notable: string;
}

interface ProtocolEntry {
  protocolName: string;
  txCount: number;
  sharePct: number;
  gasCost: number;
}

interface AnomalyEntry {
  type: string;
  agentName: string | null;
  walletAddress: string;
  detail: string;
}

interface QuickStats {
  busiestHour: { day: string; hour: number; txCount: number } | null;
  mostExpensiveTx: { txHash: string; gasCostUsd: number; walletAddress: string } | null;
  longestIdleAgent: { name: string | null; walletAddress: string; lastTxDaysAgo: number } | null;
  highestRevenue: { name: string | null; revenue: number } | null;
}

export interface DigestData {
  week_start: string;
  week_end: string;
  generated_at: string;
  headline: HeadlineNumbers | null;
  leaderboards: Leaderboards | null;
  spotlight: SpotlightData | null;
  protocol_activity: ProtocolEntry[] | null;
  alerts_anomalies: AnomalyEntry[] | null;
  quick_stats: QuickStats | null;
  social_snippets: string[] | null;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(weekEnd + 'T00:00:00Z');
  // Show end as the day before (weekEnd is exclusive Monday)
  end.setUTCDate(end.getUTCDate() - 1);

  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', timeZone: 'UTC' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

function wowBadge(change: number | null) {
  if (change == null) {
    return (
      <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-gray-500">
        First week
      </span>
    );
  }
  const positive = change >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        positive
          ? 'bg-[#4ade80]/10 text-[#4ade80]'
          : 'bg-red-500/10 text-red-400'
      }`}
    >
      {positive ? (
        <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
        </svg>
      )}
      {positive ? '+' : ''}{change}%
    </span>
  );
}

const ANOMALY_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  revenue_drop: { icon: '\u{1F4C9}', color: 'border-red-500/20 bg-red-500/5', label: 'Revenue Drop' },
  operating_at_loss: { icon: '\u{1F6A8}', color: 'border-red-500/20 bg-red-500/5', label: 'Operating at Loss' },
  went_inactive: { icon: '\u{1F4A4}', color: 'border-yellow-500/20 bg-yellow-500/5', label: 'Went Inactive' },
  strong_debut: { icon: '\u{1F31F}', color: 'border-[#4ade80]/20 bg-[#4ade80]/5', label: 'Strong Debut' },
  success_rate_divergence: { icon: '\u{26A0}\u{FE0F}', color: 'border-yellow-500/20 bg-yellow-500/5', label: 'Success Rate Mismatch' },
};

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-white/5 ${className}`} />
  );
}

function HeadlineCard({
  label,
  value,
  change,
  loading,
}: {
  label: string;
  value: string;
  change: number | null;
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
          <div className="mt-1.5">{wowBadge(change)}</div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section: Leaderboards                                                     */
/* -------------------------------------------------------------------------- */

// Re-enable gas columns after sentinel node is live and ACP agents are registered in observatory.
type LeaderboardTab = 'mostProfitable' | 'biggestMovers';

const LB_TAB_LABELS: Record<LeaderboardTab, string> = {
  mostProfitable: 'Top Revenue',
  biggestMovers: 'Biggest Movers',
};

function LeaderboardsSection({
  data,
  loading,
}: {
  data: Leaderboards | null;
  loading: boolean;
}) {
  const visibleTabs = Object.keys(LB_TAB_LABELS) as LeaderboardTab[];

  const [tab, setTab] = useState<LeaderboardTab>('mostProfitable');

  const renderTable = () => {
    if (loading) {
      return Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-white/5">
          <td className="px-4 py-3"><Skeleton className="h-4 w-6" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
          <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-4 w-20" /></td>
          <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-4 w-16" /></td>
          <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-4 w-16" /></td>
        </tr>
      ));
    }

    if (tab === 'biggestMovers') {
      const gainers = data?.biggestMovers?.gainers ?? [];
      const decliners = data?.biggestMovers?.decliners ?? [];
      const all = [
        ...gainers.map((m) => ({ ...m, isGainer: true })),
        ...decliners.map((m) => ({ ...m, isGainer: false })),
      ];

      if (all.length === 0) {
        return (
          <tr>
            <td colSpan={5} className="px-4 py-8 text-center text-gray-600">
              No data yet — need two weeks of snapshots
            </td>
          </tr>
        );
      }

      return all.map((m, i) => (
        <tr
          key={m.walletAddress}
          className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
        >
          <td className="px-4 py-3 font-mono text-gray-500">{i + 1}</td>
          <td className="px-4 py-3">
            <a
              href={`https://basescan.org/address/${m.walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white transition-colors hover:text-[#4ade80]"
            >
              {m.name ?? truncateAddress(m.walletAddress)}
            </a>
          </td>
          <td className="px-4 py-3 text-right font-mono text-white">
            {formatUsd(m.currentRevenue)}
          </td>
          <td className="px-4 py-3 text-right font-mono text-gray-500">
            {formatUsd(m.previousRevenue)}
          </td>
          <td className="px-4 py-3 text-right">
            <span
              className={`font-mono text-sm font-medium ${
                m.isGainer ? 'text-[#4ade80]' : 'text-red-400'
              }`}
            >
              {m.isGainer ? '+' : ''}{m.changePct.toFixed(1)}%
            </span>
          </td>
        </tr>
      ));
    }

    // mostProfitable
    const entries = data?.mostProfitable ?? [];
    if (entries.length === 0) {
      return (
        <tr>
          <td colSpan={5} className="px-4 py-8 text-center text-gray-600">No data yet</td>
        </tr>
      );
    }
    return entries.map((entry, i) => (
      <tr
        key={entry.walletAddress}
        className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
      >
        <td className="px-4 py-3 font-mono text-gray-500">{i + 1}</td>
        <td className="px-4 py-3">
          <a
            href={`https://basescan.org/address/${entry.walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white transition-colors hover:text-[#4ade80]"
          >
            {entry.name ?? truncateAddress(entry.walletAddress)}
          </a>
        </td>
        <td className="px-4 py-3 text-right font-mono text-white">
          {formatUsd(entry.revenue)}
        </td>
      </tr>
    ));
  };

  const colHeaders = () => {
    if (tab === 'biggestMovers') {
      return (
        <tr className="border-b border-white/10 text-left text-gray-500">
          <th className="px-4 py-3 font-medium">#</th>
          <th className="px-4 py-3 font-medium">Agent</th>
          <th className="px-4 py-3 text-right font-medium">Current</th>
          <th className="px-4 py-3 text-right font-medium">Previous</th>
          <th className="px-4 py-3 text-right font-medium">Change</th>
        </tr>
      );
    }
    return (
      <tr className="border-b border-white/10 text-left text-gray-500">
        <th className="px-4 py-3 font-medium">#</th>
        <th className="px-4 py-3 font-medium">Agent</th>
        <th className="px-4 py-3 text-right font-medium">Revenue</th>
      </tr>
    );
  };

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-bold text-white">Leaderboards</h2>
      <div className="flex gap-1 rounded-lg border border-white/5 bg-[#0a0a0f] p-1">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-white/10 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {LB_TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-white/5 bg-[#0a0a0f]">
        <table className="w-full text-sm">
          <thead>{colHeaders()}</thead>
          <tbody>{renderTable()}</tbody>
        </table>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section: Spotlight                                                        */
/* -------------------------------------------------------------------------- */

function SpotlightSection({
  data,
  loading,
}: {
  data: SpotlightData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="mt-12">
        <h2 className="mb-4 text-xl font-bold text-white">Agent Spotlight</h2>
        <div className="rounded-lg border border-[#4ade80]/20 bg-[#0a0a0f] p-6">
          <Skeleton className="h-6 w-48" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-bold text-white">Agent Spotlight</h2>
      <div className="rounded-lg border border-[#4ade80]/20 bg-gradient-to-b from-[#0a0f0a] to-[#0a0a0f] p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">
              {data.name ?? truncateAddress(data.walletAddress)}
            </h3>
            <p className="mt-0.5 font-mono text-xs text-gray-500">
              {truncateAddress(data.walletAddress)}
            </p>
            {data.topProtocols.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                {data.topProtocols.map((p) => (
                  <span
                    key={p}
                    className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-gray-400"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
          {data.healthScore != null && (
            <div
              className={`rounded-lg border px-3 py-1.5 text-center ${
                data.healthScore >= 80
                  ? 'border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80]'
                  : data.healthScore >= 50
                    ? 'border-yellow-400/20 bg-yellow-400/10 text-yellow-400'
                    : 'border-red-400/20 bg-red-400/10 text-red-400'
              }`}
            >
              <p className="text-xs font-medium">Health</p>
              <p className="text-lg font-bold">{data.healthScore}</p>
            </div>
          )}
        </div>

        {/* Metrics */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <p className="text-xs text-gray-500">Revenue</p>
            <p className="font-mono text-sm font-bold text-white">
              {formatUsd(data.revenue)}
            </p>
          </div>
          {/* Re-enable gas columns after sentinel node is live and ACP agents are registered in observatory. */}
          <div>
            <p className="text-xs text-gray-500">Jobs</p>
            <p className="font-mono text-sm font-bold text-white">
              {data.jobs.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Success Rate</p>
            <p className="font-mono text-sm font-bold text-white">
              {data.successRate}%
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Unique Hirers</p>
            <p className="font-mono text-sm font-bold text-white">
              {data.uniqueHirers}
            </p>
          </div>
        </div>

        {/* Notable */}
        <p className="mt-5 border-t border-white/5 pt-4 text-sm italic text-gray-400">
          {data.notable}
        </p>

        {/* View agent link */}
        <div className="mt-3">
          <a
            href={`https://basescan.org/address/${data.walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[#4ade80]/70 transition-colors hover:text-[#4ade80]"
          >
            View on Basescan
            <svg
              className="h-3.5 w-3.5"
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
          </a>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section: Protocol Activity                                                */
/* -------------------------------------------------------------------------- */

function ProtocolSection({
  data,
  loading,
}: {
  data: ProtocolEntry[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="mt-12">
        <h2 className="mb-4 text-xl font-bold text-white">Protocol Activity</h2>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) return null;

  const maxTxCount = Math.max(...data.map((p) => p.txCount), 1);
  // Re-enable gas columns after sentinel node is live and ACP agents are registered in observatory.
  const hasProtocolGas = false;

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-bold text-white">Protocol Activity</h2>
      <div className="overflow-x-auto rounded-lg border border-white/5 bg-[#0a0a0f]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Protocol</th>
              <th className="px-4 py-3 font-medium">Transactions</th>
              <th className="min-w-[140px] px-4 py-3 font-medium">Share</th>
              {hasProtocolGas && <th className="px-4 py-3 text-right font-medium">Gas Cost</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr
                key={p.protocolName}
                className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3 font-medium text-white">{p.protocolName}</td>
                <td className="px-4 py-3 font-mono text-gray-300">
                  {p.txCount.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-[#4ade80]"
                        style={{ width: `${(p.txCount / maxTxCount) * 100}%` }}
                      />
                    </div>
                    <span className="min-w-[3rem] text-right font-mono text-xs text-gray-500">
                      {p.sharePct}%
                    </span>
                  </div>
                </td>
                {hasProtocolGas && (
                  <td className="px-4 py-3 text-right font-mono text-gray-500">
                    {formatUsd(p.gasCost)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section: Alerts & Anomalies                                               */
/* -------------------------------------------------------------------------- */

function AnomaliesSection({
  data,
  loading,
}: {
  data: AnomalyEntry[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="mt-12">
        <h2 className="mb-4 text-xl font-bold text-white">Alerts & Anomalies</h2>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-bold text-white">Alerts & Anomalies</h2>
      <div className="space-y-3">
        {data.map((anomaly, i) => {
          const config = ANOMALY_CONFIG[anomaly.type] ?? {
            icon: '\u{2139}\u{FE0F}',
            color: 'border-white/10 bg-white/5',
            label: anomaly.type.replace(/_/g, ' '),
          };
          return (
            <div
              key={`${anomaly.walletAddress}-${anomaly.type}-${i}`}
              className={`rounded-lg border p-4 ${config.color}`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg">{config.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://basescan.org/address/${anomaly.walletAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-white transition-colors hover:text-[#4ade80]"
                    >
                      {anomaly.agentName ?? truncateAddress(anomaly.walletAddress)}
                    </a>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                      {config.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-400">{anomaly.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section: Quick Stats                                                      */
/* -------------------------------------------------------------------------- */

function QuickStatsSection({
  data,
  loading,
}: {
  data: QuickStats | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="mt-12">
        <h2 className="mb-4 text-xl font-bold text-white">Quick Stats</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </section>
    );
  }

  if (!data) return null;

  const cards: { emoji: string; label: string; value: string; sub: string }[] = [];

  if (data.busiestHour) {
    const h = data.busiestHour.hour;
    const hStr = `${h.toString().padStart(2, '0')}:00 UTC`;
    cards.push({
      emoji: '\u{23F0}',
      label: 'Busiest Hour',
      value: hStr,
      sub: `${data.busiestHour.txCount} txs on ${data.busiestHour.day}`,
    });
  }

  // Re-enable gas columns after sentinel node is live and ACP agents are registered in observatory.
  // if (data.mostExpensiveTx) {
  //   cards.push({ emoji: '\u{26FD}', label: 'Most Expensive Tx', ... });
  // }

  if (data.longestIdleAgent) {
    cards.push({
      emoji: '\u{1F634}',
      label: 'Longest Idle',
      value: `${data.longestIdleAgent.lastTxDaysAgo}d`,
      sub: data.longestIdleAgent.name ?? truncateAddress(data.longestIdleAgent.walletAddress),
    });
  }

  if (data.highestRevenue) {
    cards.push({
      emoji: '\u{1F3C6}',
      label: 'Highest Revenue',
      value: formatUsd(data.highestRevenue.revenue),
      sub: data.highestRevenue.name ?? 'Unknown',
    });
  }

  if (cards.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-bold text-white">Quick Stats</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-white/5 bg-[#0a0a0f] p-4"
          >
            <span className="text-2xl">{card.emoji}</span>
            <p className="mt-2 text-xs text-gray-500">{card.label}</p>
            <p className="mt-0.5 text-lg font-bold text-white">{card.value}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">{card.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section: Social Snippets                                                  */
/* -------------------------------------------------------------------------- */

function SnippetsSection({
  data,
  loading,
}: {
  data: string[] | null;
  loading: boolean;
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = useCallback(async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // Fallback
    }
  }, []);

  if (loading) {
    return (
      <section className="mt-12">
        <h2 className="mb-4 text-xl font-bold text-white">Social Snippets</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-bold text-white">Social Snippets</h2>
      <p className="mb-4 text-sm text-gray-500">
        Ready-to-post tweets. Click to copy.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.map((snippet, i) => (
          <div
            key={i}
            className="group relative rounded-lg border border-white/5 bg-[#0a0a0f] p-4"
          >
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
              {snippet}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span
                className={`text-xs ${
                  snippet.length > 280 ? 'text-red-400' : 'text-gray-600'
                }`}
              >
                {snippet.length}/280
              </span>
              <button
                onClick={() => handleCopy(snippet, i)}
                className="rounded px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
              >
                {copiedIdx === i ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Coming Soon                                                               */
/* -------------------------------------------------------------------------- */

function ComingSoon() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-full border border-[#4ade80]/20 bg-[#4ade80]/5 p-6">
        <svg
          className="h-12 w-12 text-[#4ade80]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z"
          />
        </svg>
      </div>
      <h2 className="mt-6 text-2xl font-bold text-white">
        Weekly Agent Economy Digest
      </h2>
      <p className="mt-3 max-w-md text-gray-400">
        Coming soon — the first digest publishes next Monday. Check back for weekly
        intelligence on the Base agent economy.
      </p>
      <Link
        href="/base"
        className="mt-6 inline-flex items-center gap-1 text-sm text-[#4ade80]/70 transition-colors hover:text-[#4ade80]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Observatory
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export function DigestClient({
  initialData,
}: {
  initialData: DigestData | null;
}) {
  const [digest, setDigest] = useState<DigestData | null>(initialData ?? null);
  const [loading, setLoading] = useState(initialData == null);

  useEffect(() => {
    if (initialData != null) return;
    // Fetch on client if server fetch failed
    async function load() {
      try {
        const res = await fetch('/api/digest/latest');
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const json = await res.json();
        setDigest(json.data ?? null);
      } catch {
        // no-op
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [initialData]);

  const hasData = digest != null && digest.headline != null;

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
            href="/base"
            className="hidden text-sm text-gray-400 transition-colors hover:text-white sm:block"
          >
            Observatory
          </Link>
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
        {!hasData && !loading ? (
          <ComingSoon />
        ) : (
          <>
            {/* ------------------------------------------------------------ */}
            {/*  Header                                                      */}
            {/* ------------------------------------------------------------ */}
            <header className="mb-10">
              <p className="text-sm font-medium uppercase tracking-wider text-[#4ade80]">
                Weekly Digest
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-4xl">
                Base Agent Economy
              </h1>
              {loading ? (
                <Skeleton className="mt-2 h-5 w-64" />
              ) : (
                <p className="mt-2 text-base text-gray-400">
                  Week of {formatWeekRange(digest!.week_start, digest!.week_end)}
                </p>
              )}
              <p className="mt-1 text-sm text-gray-600">
                Published by ChainWard &middot; chainward.ai
              </p>
            </header>

            {/* ------------------------------------------------------------ */}
            {/*  Section 1: Headline Numbers                                 */}
            {/* ------------------------------------------------------------ */}
            <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
              <HeadlineCard
                label="Total Revenue"
                value={formatUsd(digest?.headline?.totalRevenue ?? 0)}
                change={digest?.headline?.wow?.revenueChange ?? null}
                loading={loading}
              />
              {/* Re-enable gas columns after sentinel node is live and ACP agents are registered in observatory. */}
              <HeadlineCard
                label="Active Agents"
                value={String(digest?.headline?.activeAgents ?? 0)}
                change={digest?.headline?.wow?.activeAgentsChange ?? null}
                loading={loading}
              />
              <HeadlineCard
                label="Jobs Completed"
                value={(digest?.headline?.totalJobs ?? 0).toLocaleString()}
                change={digest?.headline?.wow?.jobsChange ?? null}
                loading={loading}
              />
              {(digest?.headline?.newAgents ?? 0) > 0 && (
                <HeadlineCard
                  label="New Agents"
                  value={String(digest?.headline?.newAgents ?? 0)}
                  change={null}
                  loading={loading}
                />
              )}
            </section>
            <p className="text-xs text-[#71717a] mt-2">
              Revenue data from Virtuals ACP.
            </p>

            {/* ------------------------------------------------------------ */}
            {/*  Section 2: Leaderboards                                     */}
            {/* ------------------------------------------------------------ */}
            <LeaderboardsSection
              data={digest?.leaderboards ?? null}
              loading={loading}
            />

            {/* ------------------------------------------------------------ */}
            {/*  Section 3: Spotlight                                        */}
            {/* ------------------------------------------------------------ */}
            <SpotlightSection
              data={digest?.spotlight ?? null}
              loading={loading}
            />

            {/* ------------------------------------------------------------ */}
            {/*  Section 4: Protocol Activity                                */}
            {/* ------------------------------------------------------------ */}
            <ProtocolSection
              data={digest?.protocol_activity ?? null}
              loading={loading}
            />

            {/* ------------------------------------------------------------ */}
            {/*  Section 5: Alerts & Anomalies                               */}
            {/* ------------------------------------------------------------ */}
            <AnomaliesSection
              data={digest?.alerts_anomalies ?? null}
              loading={loading}
            />

            {/* ------------------------------------------------------------ */}
            {/*  Section 6: Quick Stats                                      */}
            {/* ------------------------------------------------------------ */}
            <QuickStatsSection
              data={digest?.quick_stats ?? null}
              loading={loading}
            />

            {/* ------------------------------------------------------------ */}
            {/*  CTA                                                         */}
            {/* ------------------------------------------------------------ */}
            <section className="mt-16">
              <div className="relative overflow-hidden rounded-2xl border border-[#1B5E20]/30 bg-gradient-to-b from-[#0a0f0a] to-[#050508] p-10 text-center shadow-[0_0_40px_rgba(74,222,128,0.08)] md:p-14">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(27,94,32,0.15),_transparent_70%)]" />
                <h2 className="relative text-xl font-bold text-white md:text-2xl">
                  Want private monitoring for{' '}
                  <span className="text-[#4ade80]">your</span> agents?
                </h2>
                <p className="relative mx-auto mt-3 max-w-lg text-sm text-gray-400">
                  Real-time alerts &middot; 7 alert types &middot; Discord,
                  Telegram, webhook
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
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 px-6 py-8 md:px-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center text-xs text-gray-600">
          <p>Published every Monday by ChainWard</p>
          <p>
            Track 329+ AI agent wallets in real time{' '}
            <Link href="/base" className="text-gray-400 transition-colors hover:text-white">
              chainward.ai/base
            </Link>
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
