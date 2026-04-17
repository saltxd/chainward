'use client';

import Link from 'next/link';
import {
  api,
  type FleetOverview,
  type Transaction,
  type TxVolumeBucket,
  type BalanceHistoryBucket,
  type GasBucket,
} from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Skeleton } from '@/components/ui/skeleton';
import { VolumeChart } from '@/components/charts/volume-chart';
import { BalanceChart } from '@/components/charts/balance-chart';
import { GasChart } from '@/components/charts/gas-chart';
import { ErrorBanner } from '@/components/ui/error-banner';
import { OnboardingBanner } from '@/components/onboarding-banner';
import {
  SectionHead,
  StatTile,
  DataTable,
  Badge,
  type Column,
} from '@/components/v2';

export default function OverviewPage() {
  const {
    data: overview,
    loading: overviewLoading,
    error: overviewError,
  } = useApi<FleetOverview>(() => api.getOverview(), []);

  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: volumeData } = useApi<TxVolumeBucket[]>(
    () => api.getTxStats({ bucket: '1h', from }),
    [],
  );

  const { data: balanceData } = useApi<BalanceHistoryBucket[]>(
    () =>
      api.getBalanceHistory({
        bucket: '1d',
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
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

  const hasVolumeData =
    volumeData && volumeData.some((d) => parseFloat(d.total_volume_usd ?? '0') > 0);
  const hasGasData = gasData && gasData.some((d) => parseFloat(d.total_gas_usd ?? '0') > 0);

  const txColumns: Column<Transaction>[] = [
    {
      key: 'time',
      header: 'time',
      width: '140px',
      render: (tx) => (
        <span style={{ color: 'var(--muted)' }}>
          {new Date(tx.timestamp).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'dir',
      header: 'dir',
      width: '70px',
      render: (tx) => (
        <Badge tone={tx.direction === 'in' ? 'phosphor' : tx.direction === 'out' ? 'danger' : 'neutral'}>
          {tx.direction === 'in' ? 'IN' : tx.direction === 'out' ? 'OUT' : 'SELF'}
        </Badge>
      ),
    },
    {
      key: 'tok',
      header: 'token',
      width: '80px',
      render: (tx) => tx.tokenSymbol ?? 'ETH',
    },
    {
      key: 'usd',
      header: 'amount',
      align: 'right',
      render: (tx) =>
        tx.amountUsd && parseFloat(tx.amountUsd) > 0.005 ? (
          `$${parseFloat(tx.amountUsd).toFixed(2)}`
        ) : (
          <span style={{ color: 'var(--muted)' }}>—</span>
        ),
    },
    {
      key: 'gas',
      header: 'gas',
      align: 'right',
      width: '90px',
      render: (tx) =>
        tx.gasCostUsd ? (
          <span style={{ color: 'var(--fg-dim)' }}>
            ${parseFloat(tx.gasCostUsd).toFixed(4)}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'hash',
      header: 'tx',
      width: '120px',
      render: (tx) => (
        <a
          href={`https://basescan.org/tx/${tx.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--fg-dim)', textDecoration: 'none' }}
        >
          {tx.txHash.slice(0, 10)}…
        </a>
      ),
    },
  ];

  return (
    <div className="flex flex-col" style={{ gap: 40 }}>
      {overviewError && (
        <ErrorBanner message={overviewError} onRetry={() => window.location.reload()} />
      )}

      {overview && overview.agents.total === 0 && <OnboardingBanner />}

      <SectionHead
        tag="fleet.overview"
        title={
          <>
            Your agents,{' '}
            <span className="serif" style={{ color: 'var(--phosphor)' }}>
              at a glance.
            </span>
          </>
        }
        lede="Fleet-wide monitoring dashboard. Transaction volumes, gas analytics, and balance history — all on Base."
      />

      {/* Stats */}
      {overviewLoading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 32,
            paddingTop: 8,
            borderTop: '1px solid var(--line)',
          }}
        >
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : (
        <div className="v2-dash-stats">
          <StatTile
            label="agents.registered"
            value={String(overview?.agents.total ?? 0)}
            size="md"
          />
          <StatTile
            label="tx.24h"
            value={String(overview?.transactions24h ?? 0)}
            size="md"
          />
          <StatTile
            label="gas.24h"
            value={`$${(overview?.gasSpend24h ?? 0).toFixed(2)}`}
            size="md"
          />
          <StatTile
            label="portfolio"
            value={`$${(overview?.totalValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            size="md"
          />
        </div>
      )}

      {/* Charts */}
      <div className="v2-dash-grid">
        <div className="v2-dash-card">
          <SectionHead tag="volume.7d" title="Transaction volume." />
          {hasVolumeData ? (
            <VolumeChart data={volumeData!} />
          ) : (
            <div className="v2-dash-empty">
              No transaction volume yet. Data appears when your agents transact.
            </div>
          )}
        </div>
        <div className="v2-dash-card">
          <SectionHead tag="balance.30d" title="Fleet balance." />
          {balanceData && balanceData.length > 0 ? (
            <BalanceChart data={balanceData} />
          ) : (
            <div className="v2-dash-empty">No balance data yet.</div>
          )}
        </div>
      </div>

      <div className="v2-dash-card">
        <SectionHead tag="gas.7d" title="Gas spend." />
        {hasGasData ? (
          <GasChart data={gasData!} />
        ) : (
          <div className="v2-dash-empty">
            No gas spend yet. Data appears when your agents transact.
          </div>
        )}
      </div>

      <div>
        <div className="v2-dash-section-head">
          <SectionHead
            tag="recent.activity"
            title={
              <>
                Last five <span className="serif">transactions.</span>
              </>
            }
          />
          <Link href="/transactions" className="v2-dash-link">
            view all →
          </Link>
        </div>
        <DataTable
          columns={txColumns}
          rows={recentTxs ?? []}
          empty="No transactions yet."
        />
      </div>

      <style>{`
        .v2-dash-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 32px;
          padding-top: 8px;
          border-top: 1px solid var(--line);
        }
        .v2-dash-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
        }
        .v2-dash-card {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 24px;
        }
        .v2-dash-empty {
          padding: 48px 24px;
          text-align: center;
          font-size: 13px;
          color: var(--muted);
          border: 1px solid var(--line);
          font-style: italic;
        }
        .v2-dash-section-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 16px;
        }
        .v2-dash-section-head .v2-sh-head { margin-bottom: 0; }
        .v2-dash-link {
          color: var(--phosphor);
          font-size: 12px;
          letter-spacing: 0.04em;
          text-decoration: none;
          transition: color 0.15s;
          font-family: var(--font-mono);
        }
        .v2-dash-link:hover { color: var(--fg); }
        @media (max-width: 960px) {
          .v2-dash-stats { grid-template-columns: repeat(2, 1fr); }
          .v2-dash-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
