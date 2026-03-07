'use client';

import Link from 'next/link';
import { api, type FleetOverview, type Transaction, type TxVolumeBucket, type BalanceHistoryBucket, type GasBucket } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { VolumeChart } from '@/components/charts/volume-chart';
import { BalanceChart } from '@/components/charts/balance-chart';
import { GasChart } from '@/components/charts/gas-chart';
import { ErrorBanner } from '@/components/ui/error-banner';
import { OnboardingBanner } from '@/components/onboarding-banner';
import { cn } from '@/lib/utils';

export default function OverviewPage() {
  const { data: overview, loading: overviewLoading, error: overviewError } = useApi<FleetOverview>(
    () => api.getOverview(),
    [],
  );

  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: volumeData } = useApi<TxVolumeBucket[]>(
    () => api.getTxStats({ bucket: '1h', from }),
    [],
  );

  const { data: balanceData } = useApi<BalanceHistoryBucket[]>(
    () => api.getBalanceHistory({ bucket: '1d', from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }),
    [],
  );

  const { data: gasData } = useApi<GasBucket[]>(
    () => api.getGasAnalytics({ bucket: '1d', from }),
    [],
  );

  const { data: recentTxs } = useApi<Transaction[]>(
    () => api.getTransactions({ limit: '5' }).then((r) => ({ data: r.data })),
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">Fleet-wide agent monitoring dashboard</p>
      </div>

      {overviewError && <ErrorBanner message={overviewError} onRetry={() => window.location.reload()} />}

      {overview && overview.agents.total === 0 && <OnboardingBanner />}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        {overviewLoading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            <StatCard label="Total Agents" value={String(overview?.agents.total ?? 0)} />
            <StatCard label="24h Transactions" value={String(overview?.transactions24h ?? 0)} />
            <StatCard
              label="24h Gas Spend"
              value={`$${(overview?.gasSpend24h ?? 0).toFixed(2)}`}
            />
            <StatCard
              label="Portfolio Value"
              value={`$${(overview?.totalValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Volume (7d)</h2>
          {volumeData && volumeData.length > 0 ? (
            <VolumeChart data={volumeData} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No volume data yet</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Balance (30d)</h2>
          {balanceData && balanceData.length > 0 ? (
            <BalanceChart data={balanceData} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No balance data yet</p>
          )}
        </div>
      </div>

      {/* Gas chart full-width */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Gas Spend (7d)</h2>
        {gasData && gasData.length > 0 ? (
          <GasChart data={gasData} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No gas data yet</p>
        )}
      </div>

      {/* Recent transactions */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Recent Transactions</h2>
          <Link
            href="/transactions"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            View all →
          </Link>
        </div>
        {recentTxs && recentTxs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-3 pr-4">Time</th>
                  <th className="pb-3 pr-4">Dir</th>
                  <th className="pb-3 pr-4">Token</th>
                  <th className="pb-3 pr-4 text-right">Amount (USD)</th>
                  <th className="pb-3 pr-4 text-right">Gas (USD)</th>
                  <th className="pb-3">Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {recentTxs.map((tx, i) => (
                  <tr key={`${tx.txHash}-${i}`} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                      {new Date(tx.timestamp).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={cn(
                          'text-xs font-medium',
                          tx.direction === 'in' && 'text-[#4ade80]',
                          tx.direction === 'out' && 'text-destructive',
                          tx.direction === 'self' && 'text-muted-foreground',
                        )}
                      >
                        {tx.direction === 'in' ? '↓ IN' : tx.direction === 'out' ? '↑ OUT' : '↔ SELF'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{tx.tokenSymbol ?? 'ETH'}</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs">
                      {tx.amountUsd && parseFloat(tx.amountUsd) > 0.005
                        ? `$${parseFloat(tx.amountUsd).toFixed(2)}`
                        : <span className="text-muted-foreground">&mdash;</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs text-muted-foreground">
                      {tx.gasCostUsd ? `$${parseFloat(tx.gasCostUsd).toFixed(4)}` : '-'}
                    </td>
                    <td className="py-2.5">
                      <a
                        href={`https://basescan.org/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {tx.txHash.slice(0, 10)}...
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet</p>
        )}
      </div>
    </div>
  );
}
