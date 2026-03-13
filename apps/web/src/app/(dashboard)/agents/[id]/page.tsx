'use client';

import Link from 'next/link';
import { use, useState, useRef, useEffect } from 'react';
import { api, type AgentStats, type Transaction, type BalanceHistoryBucket, type GasBucket } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Address } from '@/components/ui/address';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { BalanceChart } from '@/components/charts/balance-chart';
import { GasChart } from '@/components/charts/gas-chart';
import { TxTable } from '@/components/dashboard/tx-table';
import { ErrorBanner } from '@/components/ui/error-banner';
import { cn } from '@/lib/utils';

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const agentId = Number(id);

  const { data: agentStats, loading, error, refetch: refetchAgent } = useApi<AgentStats>(
    () => api.getAgentStats(agentId),
    [agentId],
  );

  const wallet = agentStats?.agent.walletAddress;

  const { data: balanceHistory } = useApi<BalanceHistoryBucket[]>(
    () => {
      if (!wallet) return Promise.resolve({ data: [] as BalanceHistoryBucket[] });
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      return api.getBalanceHistory({ wallet, bucket: '1h', from });
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

  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

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

  if (error) {
    return <ErrorBanner message={error} onRetry={refetchAgent} />;
  }

  if (!agentStats) {
    return <p className="text-muted-foreground">Agent not found</p>;
  }

  const { agent, stats } = agentStats;

  async function saveName() {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === agent.agentName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await api.updateAgent(agentId, { agentName: trimmed });
      refetchAgent();
      setEditing(false);
    } catch {
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          {editing ? (
            <input
              ref={inputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') setEditing(false);
              }}
              disabled={saving}
              className="rounded-lg border border-border bg-card px-3 py-1 text-2xl font-bold outline-none focus:border-primary"
              placeholder="Agent name"
            />
          ) : (
            <button
              onClick={() => { setNameValue(agent.agentName ?? ''); setEditing(true); }}
              className="group flex items-center gap-2 text-2xl font-bold hover:text-primary transition-colors"
              title="Click to rename"
            >
              {agent.agentName ?? 'Unnamed Agent'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-60 transition-opacity">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
          )}
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
        <div className="mt-3">
          <Link
            href={`/alerts?wallet=${encodeURIComponent(agent.walletAddress)}&preset=failed_tx&source=agent-detail`}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/30 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Create failed-tx alert
          </Link>
        </div>
      </div>

      {/* Public page toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-3">
        <div>
          <p className="text-sm font-medium">Public Status Page</p>
          <p className="text-xs text-muted-foreground">
            {agent.isPublic
              ? <>Live at <a href={`/agent/${agent.walletAddress}`} target="_blank" rel="noopener noreferrer" className="text-[#4ade80] hover:underline">chainward.ai/agent/{agent.walletAddress.slice(0, 8)}...</a></>
              : 'Share a read-only dashboard of this agent'}
          </p>
        </div>
        <button
          onClick={async () => {
            await api.updateAgent(agentId, { isPublic: !agent.isPublic });
            refetchAgent();
          }}
          className={cn(
            'relative h-6 w-11 rounded-full transition-colors',
            agent.isPublic ? 'bg-[#4ade80]' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
              agent.isPublic && 'translate-x-5',
            )}
          />
        </button>
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
