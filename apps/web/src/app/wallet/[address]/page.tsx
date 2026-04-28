'use client';

import { use } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { publicApi, type WalletLookupResult, type LookupTransaction } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
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

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatEthFromHex(hex: string): string {
  const wei = BigInt(hex);
  const eth = Number(wei) / 1e18;
  if (eth === 0) return '0';
  if (eth < 0.0001) return '< 0.0001';
  return eth.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatTokenBalance(hex: string, decimals = 18): string {
  const raw = BigInt(hex);
  const value = Number(raw) / 10 ** decimals;
  if (value === 0) return '0';
  if (value < 0.0001) return '< 0.0001';
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatValue(value: number | null): string {
  if (value === null || value === 0) return '—';
  if (value < 0.0001) return '< 0.0001';
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function blockHexToNumber(hex: string): number {
  return parseInt(hex, 16);
}

function getCtaContent(data: WalletLookupResult): {
  heading: string;
  description: string;
} {
  const outboundCount = data.transactions.filter((tx) => tx.direction === 'outbound').length;

  if (outboundCount > 20) {
    return {
      heading: 'This wallet is burning gas.',
      description:
        'Set up gas alerts to get notified when spending spikes. ChainWard monitors your agent wallets 24/7 with Discord, Telegram, and webhook delivery.',
    };
  }

  if (data.transactions.length >= 40) {
    return {
      heading: 'Active wallet detected.',
      description:
        'With this much activity, you need persistent monitoring and charts. ChainWard tracks balances, transactions, and gas spend over time with historical analytics.',
    };
  }

  return {
    heading: 'Want persistent monitoring for this wallet?',
    description:
      'ChainWard gives you real-time alerts, balance charts, gas analytics, and transaction history for your onchain agent wallets. Free during beta.',
  };
}

export default function WalletLookupResultPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);

  const {
    data,
    loading,
    error,
    refetch,
  } = useApi<WalletLookupResult>(() => publicApi.lookupWallet(address), [address]);

  // Compute derived stats (guarded so hooks stay at top-level)
  const nativeBalance = data?.balances.find((b) => b.contractAddress === 'native');
  const ethBalance = nativeBalance ? formatEthFromHex(nativeBalance.tokenBalance) : '0';
  const nonNativeTokens = (data?.balances ?? []).filter(
    (b) =>
      b.contractAddress !== 'native' &&
      b.tokenBalance !==
        '0x0000000000000000000000000000000000000000000000000000000000000000',
  );
  const tokenCount = nonNativeTokens.length;
  const txCount = data?.transactions.length ?? 0;
  const inboundCount = (data?.transactions ?? []).filter((t) => t.direction === 'inbound')
    .length;
  const outboundCount = (data?.transactions ?? []).filter(
    (t) => t.direction === 'outbound',
  ).length;

  const txChartData = (data?.transactions ?? [])
    .map((tx) => ({
      block: blockHexToNumber(tx.blockNum),
      value: Math.max(tx.value ?? 0, 0),
    }))
    .sort((a, b) => a.block - b.block);

  const txColumns: Column<LookupTransaction>[] = [
    {
      key: 'hash',
      header: 'tx',
      width: '120px',
      render: (t) => (
        <a
          href={`https://basescan.org/tx/${t.hash}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--fg-dim)', textDecoration: 'none' }}
        >
          {truncateAddress(t.hash)}
        </a>
      ),
    },
    {
      key: 'dir',
      header: 'dir',
      width: '60px',
      render: (t) => (
        <Badge tone={t.direction === 'inbound' ? 'phosphor' : 'neutral'}>
          {t.direction === 'inbound' ? 'IN' : 'OUT'}
        </Badge>
      ),
    },
    {
      key: 'party',
      header: 'counterparty',
      render: (t) => (
        <span style={{ color: 'var(--fg-dim)' }}>
          {t.direction === 'inbound'
            ? truncateAddress(t.from)
            : t.to
              ? truncateAddress(t.to)
              : 'contract creation'}
        </span>
      ),
    },
    {
      key: 'asset',
      header: 'asset',
      width: '90px',
      render: (t) => (
        <span style={{ color: 'var(--fg)' }}>{t.asset ?? t.category}</span>
      ),
    },
    {
      key: 'value',
      header: 'value',
      align: 'right',
      width: '120px',
      render: (t) => (
        <span style={{ color: 'var(--fg)' }}>{formatValue(t.value)}</span>
      ),
    },
    {
      key: 'block',
      header: 'block',
      align: 'right',
      width: '120px',
      render: (t) => (
        <span style={{ color: 'var(--muted)' }}>
          {blockHexToNumber(t.blockNum).toLocaleString()}
        </span>
      ),
    },
  ];

  const tokenColumns = [
    {
      key: 'contract',
      header: 'contract',
      render: (t: (typeof nonNativeTokens)[number]) => (
        <a
          href={`https://basescan.org/token/${t.contractAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--fg-dim)', textDecoration: 'none' }}
        >
          {truncateAddress(t.contractAddress)}
        </a>
      ),
    },
    {
      key: 'balance',
      header: 'balance',
      align: 'right' as const,
      render: (t: (typeof nonNativeTokens)[number]) => (
        <span style={{ color: 'var(--fg)' }}>{formatTokenBalance(t.tokenBalance)}</span>
      ),
    },
  ];

  const cta = data ? getCtaContent(data) : null;
  const cachedAt = data ? new Date(data.cachedAt).toLocaleString() : '';

  return (
    <PageShell>
      <StatusTicker />
      <div className="v2-shell" style={{ paddingTop: 0, paddingBottom: 80 }}>
        <NavBar ctaHref="/login" ctaLabel="./connect" />

        <section style={{ paddingTop: 56 }}>
          <div className="v2-wa-kicker">
            <span className="v2-wa-kicker-dot" aria-hidden />
            wallet.inspect
          </div>
          <div className="v2-wa-hero">
            <div className="v2-wa-address">{address}</div>
            <div className="v2-wa-meta">
              <Badge tone="phosphor">base</Badge>
              {data && (
                <span className="v2-wa-meta-cached">cached @ {cachedAt}</span>
              )}
            </div>
          </div>
        </section>

        {loading && (
          <section style={{ paddingTop: 48 }}>
            <div className="v2-wa-loading">
              <span className="v2-wa-loading-pulse" />
              loading wallet data…
            </div>
          </section>
        )}

        {error && (
          <section style={{ paddingTop: 48 }}>
            <div className="v2-wa-error">
              <div>// failed to load wallet data</div>
              <p>{error}</p>
              <Button variant="ghost" onClick={refetch}>
                ./retry
              </Button>
            </div>
          </section>
        )}

        {!loading && !error && data && (
          <>
            <section style={{ paddingTop: 48 }}>
              <div className="v2-wa-stats">
                <StatTile
                  label="txs.indexed"
                  value={String(txCount)}
                  unit="transactions"
                />
                <StatTile
                  label="eth.balance"
                  value={ethBalance}
                  unit="eth"
                />
                <StatTile
                  label="tokens.held"
                  value={String(tokenCount)}
                  unit={tokenCount === 1 ? 'asset' : 'assets'}
                />
                <StatTile
                  label="flow"
                  value={
                    <>
                      <span style={{ color: 'var(--phosphor)' }}>{inboundCount}</span>
                      <span style={{ color: 'var(--muted)' }}> / </span>
                      <span style={{ color: 'var(--fg)' }}>{outboundCount}</span>
                    </>
                  }
                  unit="in / out"
                />
              </div>
            </section>

            {txChartData.length >= 2 && (
              <section style={{ paddingTop: 64 }}>
                <SectionHead
                  tag="activity"
                  title={
                    <>
                      Transaction <span className="serif">value flow.</span>
                    </>
                  }
                />
                <div className="v2-wa-chart-card">
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart
                      data={txChartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="block"
                        stroke="#585f56"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={32}
                        tickFormatter={(v: number) => v.toLocaleString()}
                      />
                      <YAxis
                        stroke="#585f56"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f1110',
                          border: '1px solid #1e231f',
                          borderRadius: 0,
                          fontSize: 11,
                        }}
                        labelStyle={{ color: '#9ba397' }}
                        itemStyle={{ color: '#3aa76d' }}
                        labelFormatter={(v: number) => `block ${v.toLocaleString()}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#3aa76d"
                        fill="#3aa76d"
                        fillOpacity={0.1}
                        strokeWidth={1.5}
                        name="value"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {nonNativeTokens.length > 0 && (
              <section style={{ paddingTop: 64 }}>
                <SectionHead
                  tag="balances"
                  title={
                    <>
                      Token <span className="serif">holdings.</span>
                    </>
                  }
                />
                <DataTable
                  columns={tokenColumns}
                  rows={nonNativeTokens.slice(0, 10)}
                  empty="No token balances."
                  mobileCard
                />
                {nonNativeTokens.length > 10 && (
                  <p className="v2-wa-table-note">
                    // showing top 10 of {nonNativeTokens.length} tokens
                  </p>
                )}
              </section>
            )}

            <section style={{ paddingTop: 64 }}>
              <SectionHead
                tag="recent.tx"
                title={
                  <>
                    Recent <span className="serif">activity.</span>
                  </>
                }
              />
              <DataTable
                columns={txColumns}
                rows={data.transactions}
                empty="No recent transactions."
                mobileCard
              />
            </section>

            {cta && (
              <section style={{ paddingTop: 80 }}>
                <div className="v2-wa-cta">
                  <div>
                    <h3
                      className="display"
                      style={{ fontSize: 28, margin: 0, color: 'var(--fg)' }}
                    >
                      {cta.heading.replace(/\.$/, '')}
                      <span className="serif" style={{ color: 'var(--phosphor)' }}>
                        .
                      </span>
                    </h3>
                    <p
                      style={{
                        marginTop: 10,
                        color: 'var(--fg-dim)',
                        fontSize: 13,
                        lineHeight: 1.7,
                        maxWidth: 520,
                      }}
                    >
                      {cta.description}
                    </p>
                  </div>
                  <Button href="/login">./start-monitoring →</Button>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <style>{`
        .v2-wa-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--fg-dim);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding-bottom: 16px;
        }
        .v2-wa-kicker-dot {
          width: 20px;
          height: 1px;
          background: var(--phosphor);
        }
        .v2-wa-hero {
          padding-bottom: 20px;
          border-bottom: 1px solid var(--line);
        }
        .v2-wa-address {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: clamp(16px, 2.4vw, 26px);
          color: var(--fg);
          letter-spacing: -0.01em;
          word-break: break-all;
          line-height: 1.3;
        }
        .v2-wa-meta {
          margin-top: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .v2-wa-meta-cached {
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.04em;
        }
        .v2-wa-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 32px;
        }
        .v2-wa-chart-card {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 16px;
        }
        .v2-wa-table-note {
          margin-top: 12px;
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.04em;
        }
        .v2-wa-loading {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          color: var(--fg-dim);
          font-size: 13px;
          letter-spacing: 0.04em;
        }
        .v2-wa-loading-pulse {
          width: 8px;
          height: 8px;
          background: var(--phosphor);
          box-shadow: 0 0 6px var(--phosphor);
          animation: v2-pulse 1.4s ease-in-out infinite;
        }
        .v2-wa-error {
          border: 1px solid rgba(230, 103, 103, 0.3);
          padding: 24px;
          background: rgba(230, 103, 103, 0.04);
        }
        .v2-wa-error div {
          color: var(--danger);
          font-size: 11px;
          letter-spacing: 0.1em;
          margin-bottom: 8px;
        }
        .v2-wa-error p {
          color: var(--fg-dim);
          font-size: 13px;
          line-height: 1.6;
          margin: 0 0 18px 0;
        }
        .v2-wa-cta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 40px;
          padding: 40px;
          border: 1px solid var(--line-2);
          background: var(--bg-1);
          flex-wrap: wrap;
        }
        @media (max-width: 960px) {
          .v2-wa-stats { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </PageShell>
  );
}
