'use client';

import { useState } from 'react';
import { api, type Transaction, type TxVolumeBucket } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { TxTable } from '@/components/dashboard/tx-table';
import { VolumeChart } from '@/components/charts/volume-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ui/error-banner';
import { TxDetailPanel } from '@/components/dashboard/tx-detail-panel';
import { SectionHead, Button } from '@/components/v2';

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

  const {
    data: txPage,
    loading,
    error,
    refetch,
  } = useApi<TxPage>(
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <SectionHead
        tag="fleet.transactions"
        title={
          <>
            Every <span className="serif">on-chain move.</span>
          </>
        }
        lede="Unified ledger across every monitored agent. Filter by direction, type, or paste a tx hash to jump to it."
      />

      {error && <ErrorBanner message={error} onRetry={refetch} />}

      <div className="v2-dash-card">
        <SectionHead tag="volume.7d" title="Transaction volume." />
        {volumeData && volumeData.length > 0 ? (
          <VolumeChart data={volumeData} />
        ) : (
          <Skeleton className="h-48" />
        )}
      </div>

      {/* Filters */}
      <div className="v2-tx-filters">
        <input
          placeholder="search by tx hash…"
          value={filters.search}
          onChange={(e) => handleFilterChange({ search: e.target.value })}
          className="v2-tx-input"
        />
        <select
          value={filters.direction}
          onChange={(e) => handleFilterChange({ direction: e.target.value })}
          className="v2-tx-input"
        >
          <option value="">all directions</option>
          <option value="in">incoming</option>
          <option value="out">outgoing</option>
          <option value="self">self</option>
        </select>
        <select
          value={filters.type}
          onChange={(e) => handleFilterChange({ type: e.target.value })}
          className="v2-tx-input"
        >
          <option value="">all types</option>
          <option value="transfer">transfer</option>
          <option value="swap">swap</option>
          <option value="approval">approval</option>
          <option value="contract_call">contract call</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <Skeleton className="h-96" />
      ) : (
        <div>
          <TxTable transactions={transactions} showWallet onSelectTx={setSelectedTx} />

          {pagination && pagination.total > 0 && (
            <div className="v2-tx-pager">
              <p style={{ color: 'var(--fg-dim)', fontSize: 12, margin: 0 }}>
                showing {rangeStart}–{rangeEnd} of {pagination.total.toLocaleString()}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                >
                  ← prev
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!pagination.hasMore}
                >
                  next →
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <TxDetailPanel transaction={selectedTx} onClose={() => setSelectedTx(null)} />

      <style>{`
        .v2-dash-card {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 24px;
        }
        .v2-tx-filters {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .v2-tx-input {
          background: transparent;
          border: 1px solid var(--line-2);
          color: var(--fg);
          font-family: var(--font-mono);
          font-size: 13px;
          padding: 10px 14px;
          min-height: 44px;
          flex: 1;
          min-width: 180px;
        }
        .v2-tx-input::placeholder { color: var(--muted); }
        .v2-tx-input:focus {
          outline: none;
          border-color: var(--phosphor);
        }
        .v2-tx-pager {
          margin-top: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          border-top: 1px solid var(--line);
          padding-top: 16px;
        }
      `}</style>
    </div>
  );
}
