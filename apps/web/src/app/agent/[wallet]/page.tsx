'use client';

import { use } from 'react';
import {
  publicApi,
  type PublicAgentData,
  type Transaction,
  type BalanceHistoryBucket,
  type GasBucket,
} from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { BalanceChart, getBalanceSummary } from '@/components/charts/balance-chart';
import { GasChart } from '@/components/charts/gas-chart';
import {
  PageShell,
  NavBar,
  StatusTicker,
  SectionHead,
  StatTile,
  DataTable,
  Badge,
  Button,
  type Column,
} from '@/components/v2';

/** Map snake_case rows from the raw SQL response to camelCase Transaction objects */
function mapTx(row: Record<string, unknown>): Transaction {
  return {
    timestamp: String(row.timestamp ?? ''),
    chain: String(row.chain ?? ''),
    txHash: String(row.tx_hash ?? ''),
    blockNumber: Number(row.block_number ?? 0),
    walletAddress: String(row.wallet_address ?? ''),
    direction: String(row.direction ?? ''),
    counterparty: row.counterparty ? String(row.counterparty) : null,
    tokenSymbol: row.token_symbol ? String(row.token_symbol) : null,
    amountUsd: row.amount_usd != null ? String(row.amount_usd) : null,
    gasCostUsd: row.gas_cost_usd != null ? String(row.gas_cost_usd) : null,
    txType: row.tx_type ? String(row.tx_type) : null,
    methodName: row.method_name ? String(row.method_name) : null,
    status: String(row.status ?? 'confirmed'),
  };
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTxType(txType: string | null, methodName?: string | null): string {
  if (methodName) {
    const name = methodName.toLowerCase();
    if (name.includes('swap')) return 'swap';
    if (name.includes('approve')) return 'approval';
    if (name.includes('transfer')) return 'transfer';
    if (name.includes('deposit') || name.includes('wrap')) return 'deposit';
    if (name.includes('withdraw') || name.includes('unwrap')) return 'withdraw';
  }
  if (txType === 'contract_call') return 'contract';
  if (txType === 'transfer') return 'transfer';
  return txType ?? 'unknown';
}

function formatUsd(v: number): string {
  if (v === 0) return '$0';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}

export default function PublicAgentPage({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const { wallet } = use(params);

  const { data, loading, error, refetch } = useApi<PublicAgentData>(
    () => publicApi.getPublicAgent(wallet),
    [wallet],
  );

  // Map raw rows outside of render guard so hooks/types stay consistent
  const transactions: Transaction[] = data
    ? (data.recentTxs as unknown as Record<string, unknown>[]).map(mapTx)
    : [];

  const balances: BalanceHistoryBucket[] = data
    ? (data.balanceHistory as unknown as Record<string, unknown>[]).map((row) => ({
        bucket: String(row.bucket ?? ''),
        token_symbol: String(row.token_symbol ?? ''),
        token_address: row.token_address ? String(row.token_address) : null,
        balance_usd: String(row.balance_usd ?? '0'),
        balance_raw: String(row.balance_raw ?? '0'),
      }))
    : [];

  const gas: GasBucket[] = data
    ? (data.gasHistory as unknown as Record<string, unknown>[]).map((row) => ({
        bucket: String(row.bucket ?? ''),
        tx_count: Number(row.tx_count ?? 0),
        total_gas_usd: String(row.total_gas_usd ?? '0'),
        avg_gas_usd: String(row.avg_gas_usd ?? '0'),
        max_gas_usd: String(row.max_gas_usd ?? '0'),
        avg_gas_price_gwei: String(row.avg_gas_price_gwei ?? '0'),
      }))
    : [];

  const balanceSummary = getBalanceSummary(balances);

  const txColumns: Column<Transaction>[] = [
    {
      key: 'time',
      header: 'time',
      width: '120px',
      render: (t) => (
        <span style={{ color: 'var(--muted)' }}>
          {new Date(t.timestamp).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'type',
      width: '110px',
      render: (t) => (
        <Badge tone="neutral">{formatTxType(t.txType, t.methodName)}</Badge>
      ),
    },
    {
      key: 'dir',
      header: 'dir',
      width: '70px',
      render: (t) => (
        <Badge
          tone={
            t.direction === 'in'
              ? 'phosphor'
              : t.direction === 'out'
                ? 'danger'
                : 'neutral'
          }
        >
          {t.direction === 'in' ? 'IN' : t.direction === 'out' ? 'OUT' : 'SELF'}
        </Badge>
      ),
    },
    {
      key: 'token',
      header: 'token',
      width: '80px',
      render: (t) => t.tokenSymbol ?? 'ETH',
    },
    {
      key: 'amount',
      header: 'usd',
      align: 'right',
      width: '110px',
      render: (t) =>
        t.amountUsd && parseFloat(t.amountUsd) > 0.005 ? (
          <span style={{ color: 'var(--fg)' }}>
            ${parseFloat(t.amountUsd).toFixed(2)}
          </span>
        ) : (
          <span style={{ color: 'var(--muted)' }}>—</span>
        ),
    },
    {
      key: 'gas',
      header: 'gas',
      align: 'right',
      width: '100px',
      render: (t) => (
        <span style={{ color: 'var(--muted)' }}>
          {t.gasCostUsd ? `$${parseFloat(t.gasCostUsd).toFixed(4)}` : '—'}
        </span>
      ),
    },
    {
      key: 'party',
      header: 'counterparty',
      render: (t) => (
        <span style={{ color: 'var(--fg-dim)' }}>
          {t.counterparty ? truncateAddress(t.counterparty) : '—'}
        </span>
      ),
    },
    {
      key: 'hash',
      header: 'tx',
      width: '100px',
      render: (t) => (
        <a
          href={`https://basescan.org/tx/${t.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--fg-dim)', textDecoration: 'none' }}
        >
          {truncateAddress(t.txHash)}
        </a>
      ),
    },
  ];

  const monitoringSince = data
    ? new Date(data.agent.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <PageShell>
      <StatusTicker />
      <div className="v2-shell" style={{ paddingTop: 0, paddingBottom: 80 }}>
        <NavBar ctaHref="/login" ctaLabel="./connect" />

        {loading && (
          <section style={{ paddingTop: 96 }}>
            <div className="v2-pa-loading">
              <span className="v2-pa-loading-pulse" />
              loading agent data…
            </div>
          </section>
        )}

        {error && (
          <section style={{ paddingTop: 96 }}>
            <div className="v2-pa-error">
              <div>// failed to load agent</div>
              <p>{error}</p>
              <Button variant="ghost" onClick={refetch}>
                ./retry
              </Button>
            </div>
          </section>
        )}

        {!loading && !error && !data && (
          <section style={{ paddingTop: 96 }}>
            <p style={{ color: 'var(--fg-dim)' }}>
              Agent not found or is not public.
            </p>
          </section>
        )}

        {!loading && !error && data && (
          <>
            <section style={{ paddingTop: 56 }}>
              <SectionHead
                tag="public.status"
                title={
                  <span className="display">
                    {data.agent.agentName ?? 'Agent'}
                  </span>
                }
                lede={
                  <span>
                    <span className="serif" style={{ color: 'var(--phosphor)' }}>
                      Monitoring since
                    </span>{' '}
                    {monitoringSince}. Live on-chain telemetry — balance, tx flow, gas
                    spend — served from the ChainWard sentinel node.
                  </span>
                }
              />

              <div className="v2-pa-identity">
                <div className="v2-pa-address">{data.agent.walletAddress}</div>
                <div className="v2-pa-badges">
                  <Badge tone="phosphor">{data.agent.chain}</Badge>
                  {data.agent.agentFramework && (
                    <Badge tone="cyan">{data.agent.agentFramework}</Badge>
                  )}
                </div>
              </div>
            </section>

            <section style={{ paddingTop: 48 }}>
              <div className="v2-pa-stats">
                <StatTile
                  label="tx.24h"
                  value={String(data.stats.txCount24h)}
                  unit="transactions"
                />
                <StatTile
                  label="volume.24h"
                  value={formatUsd(data.stats.volume24h)}
                  unit="usd"
                />
                <StatTile
                  label="gas.24h"
                  value={formatUsd(data.stats.gasSpend24h)}
                  unit="usd"
                />
                <StatTile
                  label="tx.7d"
                  value={String(data.stats.txCount7d)}
                  unit="transactions"
                />
              </div>
            </section>

            <section style={{ paddingTop: 64 }}>
              <SectionHead
                tag="balance"
                title={
                  <>
                    Portfolio <span className="serif">value.</span>
                  </>
                }
              />
              {balanceSummary && (
                <div className="v2-pa-balance-head">
                  <div className="v2-pa-balance-value">
                    $
                    {balanceSummary.current.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  {balanceSummary.hasDelta && (
                    <div
                      className="v2-pa-balance-delta"
                      style={{
                        color:
                          balanceSummary.deltaAbs >= 0
                            ? 'var(--phosphor)'
                            : 'var(--danger)',
                      }}
                    >
                      {balanceSummary.deltaAbs >= 0 ? '+' : ''}
                      $
                      {balanceSummary.deltaAbs.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{' '}
                      ({balanceSummary.deltaPct >= 0 ? '+' : ''}
                      {balanceSummary.deltaPct.toFixed(2)}%) · 7d
                    </div>
                  )}
                </div>
              )}
              <div className="v2-pa-chart-card">
                {balances.length > 0 ? (
                  <BalanceChart data={balances} />
                ) : (
                  <p className="v2-pa-chart-empty">// no balance data yet</p>
                )}
              </div>
            </section>

            <section style={{ paddingTop: 64 }}>
              <SectionHead
                tag="gas"
                title={
                  <>
                    Gas <span className="serif">footprint.</span>
                  </>
                }
              />
              <div className="v2-pa-chart-card">
                {gas.length > 0 ? (
                  <GasChart data={gas} />
                ) : (
                  <p className="v2-pa-chart-empty">// no gas data yet</p>
                )}
              </div>
            </section>

            <section style={{ paddingTop: 64 }}>
              <SectionHead
                tag="recent.tx"
                title={
                  <>
                    Live <span className="serif">activity.</span>
                  </>
                }
              />
              <DataTable
                columns={txColumns}
                rows={transactions}
                empty="No transactions yet."
              />
            </section>

            <section style={{ paddingTop: 80 }}>
              <div className="v2-pa-cta">
                <div className="v2-pa-cta-shell">$ cw watch {data.agent.walletAddress}</div>
                <h3 className="display v2-pa-cta-title">
                  Monitor your own{' '}
                  <span className="serif" style={{ color: 'var(--phosphor)' }}>
                    fleet.
                  </span>
                </h3>
                <p className="v2-pa-cta-sub">
                  Track transactions, balances, and gas for your AI agent wallets on
                  Base. Alerts via Discord, Telegram, or webhooks. Free during beta.
                </p>
                <div style={{ marginTop: 24 }}>
                  <Button href="/login">./start-monitoring →</Button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <style>{`
        .v2-pa-identity {
          margin-top: -8px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--line);
        }
        .v2-pa-address {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: clamp(14px, 2vw, 22px);
          color: var(--fg);
          letter-spacing: -0.01em;
          word-break: break-all;
          line-height: 1.3;
        }
        .v2-pa-badges {
          margin-top: 12px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .v2-pa-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 32px;
        }
        .v2-pa-balance-head {
          display: flex;
          align-items: baseline;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .v2-pa-balance-value {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: clamp(32px, 4vw, 44px);
          color: var(--fg);
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
          font-weight: 500;
          line-height: 1;
        }
        .v2-pa-balance-delta {
          font-size: 13px;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.02em;
        }
        .v2-pa-chart-card {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 16px;
        }
        .v2-pa-chart-empty {
          padding: 32px 0;
          text-align: center;
          color: var(--muted);
          font-size: 12px;
          letter-spacing: 0.06em;
        }
        .v2-pa-loading {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          color: var(--fg-dim);
          font-size: 13px;
          letter-spacing: 0.04em;
        }
        .v2-pa-loading-pulse {
          width: 8px;
          height: 8px;
          background: var(--phosphor);
          box-shadow: 0 0 6px var(--phosphor);
          animation: v2-pulse 1.4s ease-in-out infinite;
        }
        .v2-pa-error {
          border: 1px solid rgba(230, 103, 103, 0.3);
          padding: 24px;
          background: rgba(230, 103, 103, 0.04);
        }
        .v2-pa-error div {
          color: var(--danger);
          font-size: 11px;
          letter-spacing: 0.1em;
          margin-bottom: 8px;
        }
        .v2-pa-error p {
          color: var(--fg-dim);
          font-size: 13px;
          line-height: 1.6;
          margin: 0 0 18px 0;
        }
        .v2-pa-cta {
          border: 1px solid var(--line-2);
          background:
            radial-gradient(ellipse at 10% 0%, rgba(58, 167, 109, 0.06), transparent 60%),
            var(--bg-1);
          padding: 48px;
          position: relative;
        }
        .v2-pa-cta-shell {
          font-family: var(--font-mono), ui-monospace, monospace;
          color: var(--phosphor);
          font-size: 12px;
          letter-spacing: 0.04em;
          word-break: break-all;
          margin-bottom: 20px;
        }
        .v2-pa-cta-title {
          font-size: clamp(28px, 3.6vw, 40px);
          line-height: 1.04;
          margin: 0;
          max-width: 640px;
          color: var(--fg);
        }
        .v2-pa-cta-sub {
          margin-top: 14px;
          color: var(--fg-dim);
          font-size: 13px;
          line-height: 1.7;
          max-width: 560px;
        }
        @media (max-width: 960px) {
          .v2-pa-stats { grid-template-columns: repeat(2, 1fr); }
          .v2-pa-cta { padding: 32px; }
        }
      `}</style>
    </PageShell>
  );
}
