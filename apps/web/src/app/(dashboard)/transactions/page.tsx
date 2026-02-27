'use client';

import { useState } from 'react';
import { api, type Transaction, type TxVolumeBucket } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { TxTable } from '@/components/dashboard/tx-table';
import { VolumeChart } from '@/components/charts/volume-chart';
import { Skeleton } from '@/components/ui/skeleton';

export default function TransactionsPage() {
  const [filters, setFilters] = useState({
    direction: '',
    type: '',
    search: '',
  });

  const filterParams: Record<string, string> = { limit: '50' };
  if (filters.direction) filterParams.direction = filters.direction;
  if (filters.type) filterParams.type = filters.type;
  if (filters.search) filterParams.search = filters.search;

  const { data: txResponse, loading } = useApi(
    () => api.getTransactions(filterParams),
    [filters.direction, filters.type, filters.search],
  );

  const { data: volumeData } = useApi<TxVolumeBucket[]>(
    () => api.getTxStats({ bucket: '1h' }),
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          All on-chain transactions across your monitored agents
        </p>
      </div>

      {/* Volume chart */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Transaction Volume (7d)</h2>
        {volumeData && volumeData.length > 0 ? (
          <VolumeChart data={volumeData} />
        ) : (
          <Skeleton className="h-48" />
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Search by tx hash..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm placeholder:text-muted-foreground"
        />
        <select
          value={filters.direction}
          onChange={(e) => setFilters({ ...filters, direction: e.target.value })}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="">All directions</option>
          <option value="in">Incoming</option>
          <option value="out">Outgoing</option>
          <option value="self">Self</option>
        </select>
        <select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          <option value="transfer">Transfer</option>
          <option value="swap">Swap</option>
          <option value="approval">Approval</option>
          <option value="contract_call">Contract Call</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="rounded-lg border border-border bg-card p-5">
          <TxTable
            transactions={(txResponse as { data: Transaction[] } | null)?.data ?? []}
            showWallet
          />
          {txResponse && 'pagination' in txResponse && (
            <p className="mt-4 text-xs text-muted-foreground">
              Showing {Math.min((txResponse as { pagination: { total: number } }).pagination.total, 50)} of{' '}
              {(txResponse as { pagination: { total: number } }).pagination.total} transactions
            </p>
          )}
        </div>
      )}
    </div>
  );
}
