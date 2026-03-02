'use client';

import { use } from 'react';
import { api, type AgentStats, type Transaction, type BalanceHistoryBucket, type GasBucket } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Address } from '@/components/ui/address';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { BalanceChart } from '@/components/charts/balance-chart';
import { GasChart } from '@/components/charts/gas-chart';
import { TxTable } from '@/components/dashboard/tx-table';

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const agentId = Number(id);

  const { data: agentStats, loading } = useApi<AgentStats>(
    () => api.getAgentStats(agentId),
    [agentId],
  );

  const wallet = agentStats?.agent.walletAddress;

  const { data: balanceHistory } = useApi<BalanceHistoryBucket[]>(
    () => {
      if (!wallet) return Promise.resolve({ data: [] as BalanceHistoryBucket[] });
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      return api.getBalanceHistory({ wallet, bucket: '1d', from });
    },
    [wallet],
  );

  const { data: gasData } = useApi<GasBucket[]>(
    () => {
      if (!wallet) return Promise.resolve({ data: [] as GasBucket[] });
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      return api.getGasAnalytics({ wallet, bucket: '1d', from });
    },
    [wallet],
  );

  const { data: txResponse } = useApi(
    () =>
      wallet
        ? api.getTransactions({ wallet, limit: '20' })
        : Promise.resolve({ data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } }),
    [wallet],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!agentStats) {
    return <p className="text-muted-foreground">Agent not found</p>;
  }

  const { agent, stats } = agentStats;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{agent.agentName ?? 'Unnamed Agent'}</h1>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {agent.chain}
          </span>
          {agent.agentFramework && (
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground">
              {agent.agentFramework}
            </span>
          )}
        </div>
        <Address address={agent.walletAddress} chain={agent.chain} className="mt-1" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="24h Transactions" value={String(stats.txCount24h)} />
        <StatCard
          label="24h Volume"
          value={`$${stats.volume24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
        />
        <StatCard
          label="24h Gas Spend"
          value={`$${stats.gasSpend24h.toFixed(2)}`}
        />
        <StatCard label="7d Transactions" value={String(stats.txCount7d)} />
      </div>

      {/* Balance chart */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Balance History</h2>
        {balanceHistory && balanceHistory.length > 0 ? (
          <BalanceChart data={balanceHistory} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No balance data yet</p>
        )}
      </div>

      {/* Gas chart */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Gas Analytics</h2>
        {gasData && gasData.length > 0 ? (
          <GasChart data={gasData} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No gas data yet</p>
        )}
      </div>

      {/* Transaction table */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Recent Transactions</h2>
        <TxTable transactions={txResponse ?? []} />
      </div>
    </div>
  );
}
