'use client';

import { useState } from 'react';
import { api, type Transaction, type TxVolumeBucket } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { TxTable } from '@/components/dashboard/tx-table';
import { VolumeChart } from '@/components/charts/volume-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ui/error-banner';
import { TxDetailPanel } from '@/components/dashboard/tx-detail-panel';

const PAGE_SIZE = 50;

interface TxPage {
  transactions: Transaction[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

export default function TransactionsPage() {
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({
    direction: '',
    type: '',
    search: '',
  });

  const filterParams: Record<string, string> = {
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  };
  if (filters.direction) filterParams.direction = filters.direction;
  if (filters.type) filterParams.type = filters.type;
  if (filters.search) filterParams.search = filters.search;

  const { data: txPage, loading, error, refetch } = useApi<TxPage>(
    () =>
      api.getTransactions(filterParams).then((r) => ({
        data: { transactions: r.data, pagination: r.pagination },
      })),
    [page, filters.direction, filters.type, filters.search],
  );

  const { data: volumeData } = useApi<TxVolumeBucket[]>(
    () => api.getTxStats({ bucket: '1h' }),
    [],
  );

  const transactions = txPage?.transactions ?? [];
  const pagination = txPage?.pagination;
  const rangeStart = pagination ? pagination.offset + 1 : 0;
  const rangeEnd = pagination ? pagination.offset + transactions.length : 0;

  function handleFilterChange(updates: Partial<typeof filters>) {
    setFilters({ ...filters, ...updates });
    setPage(0);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          All on-chain transactions across your monitored agents
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={refetch} />}

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
      <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
        <input
          placeholder="Search by tx hash..."
          value={filters.search}
          onChange={(e) => handleFilterChange({ search: e.target.value })}
          className="min-h-[44px] rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm placeholder:text-muted-foreground"
        />
        <select
          value={filters.direction}
          onChange={(e) => handleFilterChange({ direction: e.target.value })}
          className="min-h-[44px] rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="">All directions</option>
          <option value="in">Incoming</option>
          <option value="out">Outgoing</option>
          <option value="self">Self</option>
        </select>
        <select
          value={filters.type}
          onChange={(e) => handleFilterChange({ type: e.target.value })}
          className="min-h-[44px] rounded-lg border border-border bg-card px-3 py-2 text-sm"
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
          <TxTable transactions={transactions} showWallet onSelectTx={setSelectedTx} />

          {/* Pagination */}
          {pagination && pagination.total > 0 && (
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {rangeStart}–{rangeEnd} of {pagination.total.toLocaleString()} transactions
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                  className="min-h-[44px] flex-1 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50 sm:flex-none"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!pagination.hasMore}
                  className="min-h-[44px] flex-1 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50 sm:flex-none"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <TxDetailPanel transaction={selectedTx} onClose={() => setSelectedTx(null)} />
    </div>
  );
}
