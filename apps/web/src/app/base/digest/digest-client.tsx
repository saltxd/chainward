'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
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

function formatChange(change: number | null): string {
  if (change == null) return 'first.week';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change}% wow`;
}

function statToneForChange(change: number | null): 'default' | 'phosphor' | 'danger' {
  if (change == null) return 'default';
  return change >= 0 ? 'phosphor' : 'danger';
}

const ANOMALY_CONFIG: Record<
  string,
  { tone: 'phosphor' | 'amber' | 'danger' | 'neutral'; label: string }
> = {
  revenue_drop: { tone: 'danger', label: 'Revenue Drop' },
  operating_at_loss: { tone: 'danger', label: 'Operating at Loss' },
  went_inactive: { tone: 'amber', label: 'Went Inactive' },
  strong_debut: { tone: 'phosphor', label: 'Strong Debut' },
  success_rate_divergence: { tone: 'amber', label: 'Success Rate Mismatch' },
};

/* -------------------------------------------------------------------------- */
/*  Loading skeleton                                                          */
/* -------------------------------------------------------------------------- */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`v2-digest-skeleton ${className}`} />;
}

/* -------------------------------------------------------------------------- */
/*  Section: Leaderboards                                                     */
/* -------------------------------------------------------------------------- */

// Re-enable gas columns after sentinel node is live and ACP agents are registered in observatory.
type LeaderboardTab = 'mostProfitable' | 'biggestMovers';

const LB_TAB_LABELS: Record<LeaderboardTab, string> = {
  mostProfitable: 'top.revenue',
  biggestMovers: 'biggest.movers',
};

type MoverRow = MoverEntry & { isGainer: boolean };

function LeaderboardsSection({
  data,
  loading,
}: {
  data: Leaderboards | null;
  loading: boolean;
}) {
  const [tab, setTab] = useState<LeaderboardTab>('mostProfitable');
  const visibleTabs = Object.keys(LB_TAB_LABELS) as LeaderboardTab[];

  if (loading) {
    return (
      <section style={{ paddingTop: 64 }}>
        <SectionHead
          tag="leaderboard"
          title={
            <>
              Top <span className="serif">performers.</span>
            </>
          }
        />
        <div className="v2-obs-tabs">
          {visibleTabs.map((t) => (
            <button
              key={t}
              className={`v2-obs-tab ${tab === t ? 'v2-obs-tab-active' : ''}`}
              onClick={() => setTab(t)}
            >
              {LB_TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="v2-digest-skel-table">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="v2-digest-skel-row" />
          ))}
        </div>
      </section>
    );
  }

  const mostProfitableColumns: Column<LeaderboardEntry>[] = [
    {
      key: 'rank',
      header: '#',
      width: '48px',
      render: (_r, i) => <span style={{ color: 'var(--muted)' }}>{i + 1}</span>,
    },
    {
      key: 'agent',
      header: 'agent',
      render: (r) => (
        <a
          href={`https://basescan.org/address/${r.walletAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--fg)', textDecoration: 'none' }}
        >
          {r.name ?? truncateAddress(r.walletAddress)}
          <span style={{ marginLeft: 10, color: 'var(--muted)', fontSize: 11 }}>
            {truncateAddress(r.walletAddress)}
          </span>
        </a>
      ),
    },
    {
      key: 'revenue',
      header: 'revenue',
      align: 'right',
      width: '140px',
      render: (r) => (
        <span style={{ color: 'var(--phosphor)' }}>{formatUsd(r.revenue)}</span>
      ),
    },
  ];

  const moverColumns: Column<MoverRow>[] = [
    {
      key: 'rank',
      header: '#',
      width: '48px',
      render: (_r, i) => <span style={{ color: 'var(--muted)' }}>{i + 1}</span>,
    },
    {
      key: 'agent',
      header: 'agent',
      render: (r) => (
        <a
          href={`https://basescan.org/address/${r.walletAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--fg)', textDecoration: 'none' }}
        >
          {r.name ?? truncateAddress(r.walletAddress)}
          <span style={{ marginLeft: 10, color: 'var(--muted)', fontSize: 11 }}>
            {truncateAddress(r.walletAddress)}
          </span>
        </a>
      ),
    },
    {
      key: 'current',
      header: 'current',
      align: 'right',
      width: '110px',
      render: (r) => formatUsd(r.currentRevenue),
    },
    {
      key: 'previous',
      header: 'previous',
      align: 'right',
      width: '110px',
      render: (r) => (
        <span style={{ color: 'var(--muted)' }}>{formatUsd(r.previousRevenue)}</span>
      ),
    },
    {
      key: 'change',
      header: 'change',
      align: 'right',
      width: '100px',
      render: (r) => (
        <span style={{ color: r.isGainer ? 'var(--phosphor)' : 'var(--danger)' }}>
          {r.isGainer ? '+' : ''}
          {r.changePct.toFixed(1)}%
        </span>
      ),
    },
  ];

  const moversData: MoverRow[] = [
    ...(data?.biggestMovers?.gainers ?? []).map((m) => ({ ...m, isGainer: true })),
    ...(data?.biggestMovers?.decliners ?? []).map((m) => ({ ...m, isGainer: false })),
  ];

  return (
    <section style={{ paddingTop: 64 }}>
      <SectionHead
        tag="leaderboard"
        title={
          <>
            Top <span className="serif">performers.</span>
          </>
        }
      />
      <div className="v2-obs-tabs">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`v2-obs-tab ${tab === t ? 'v2-obs-tab-active' : ''}`}
          >
            {LB_TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'mostProfitable' ? (
        <DataTable
          columns={mostProfitableColumns}
          rows={data?.mostProfitable ?? []}
          empty="No data yet."
        />
      ) : (
        <DataTable
          columns={moverColumns}
          rows={moversData}
          empty="No data yet — need two weeks of snapshots."
        />
      )}
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
      <section style={{ paddingTop: 64 }}>
        <SectionHead
          tag="spotlight"
          title={
            <>
              Agent <span className="serif">spotlight.</span>
            </>
          }
        />
        <div className="v2-digest-spotlight">
          <Skeleton className="v2-digest-skel-spotlight" />
        </div>
      </section>
    );
  }

  if (!data) return null;

  const healthTone =
    data.healthScore == null
      ? 'neutral'
      : data.healthScore >= 80
        ? 'phosphor'
        : data.healthScore >= 50
          ? 'amber'
          : 'danger';

  return (
    <section style={{ paddingTop: 64 }}>
      <SectionHead
        tag="spotlight"
        title={
          <>
            Agent <span className="serif">spotlight.</span>
          </>
        }
      />
      <div className="v2-digest-spotlight">
        <div className="v2-digest-spotlight-head">
          <div>
            <h3 className="display" style={{ fontSize: 28, margin: 0, color: 'var(--fg)' }}>
              {data.name ?? truncateAddress(data.walletAddress)}
            </h3>
            <p
              style={{
                marginTop: 6,
                fontSize: 11,
                color: 'var(--muted)',
                letterSpacing: '0.06em',
              }}
            >
              {truncateAddress(data.walletAddress)}
            </p>
            {data.topProtocols.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                {data.topProtocols.map((p) => (
                  <Badge key={p} tone="neutral">
                    {p}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          {data.healthScore != null && (
            <div className={`v2-digest-health v2-digest-health-${healthTone}`}>
              <div className="v2-digest-health-label">health</div>
              <div className="v2-digest-health-value">{data.healthScore}</div>
            </div>
          )}
        </div>

        <div className="v2-digest-spotlight-metrics">
          <StatTile label="revenue" value={formatUsd(data.revenue)} size="md" tone="phosphor" />
          <StatTile label="jobs" value={data.jobs.toLocaleString()} size="md" />
          <StatTile label="success.rate" value={`${data.successRate}%`} size="md" />
          <StatTile label="unique.hirers" value={data.uniqueHirers.toString()} size="md" />
        </div>

        <p className="v2-digest-spotlight-notable serif">{data.notable}</p>

        <div style={{ marginTop: 20 }}>
          <Button
            href={`https://basescan.org/address/${data.walletAddress}`}
            variant="link"
            external
          >
            view on basescan →
          </Button>
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
      <section style={{ paddingTop: 64 }}>
        <SectionHead
          tag="protocols"
          title={
            <>
              Protocol <span className="serif">activity.</span>
            </>
          }
        />
        <div className="v2-digest-skel-table">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="v2-digest-skel-row" />
          ))}
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) return null;

  const maxTxCount = Math.max(...data.map((p) => p.txCount), 1);

  const columns: Column<ProtocolEntry>[] = [
    {
      key: 'protocol',
      header: 'protocol',
      render: (p) => <span style={{ color: 'var(--fg)' }}>{p.protocolName}</span>,
    },
    {
      key: 'txCount',
      header: 'transactions',
      width: '140px',
      render: (p) => (
        <span style={{ color: 'var(--fg-dim)' }}>{p.txCount.toLocaleString()}</span>
      ),
    },
    {
      key: 'share',
      header: 'share',
      width: '2fr',
      render: (p) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="v2-digest-bar-track">
            <div
              className="v2-digest-bar-fill"
              style={{ width: `${(p.txCount / maxTxCount) * 100}%` }}
            />
          </div>
          <span
            style={{
              minWidth: 50,
              textAlign: 'right',
              color: 'var(--muted)',
              fontSize: 12,
            }}
          >
            {p.sharePct}%
          </span>
        </div>
      ),
    },
  ];

  return (
    <section style={{ paddingTop: 64 }}>
      <SectionHead
        tag="protocols"
        title={
          <>
            Protocol <span className="serif">activity.</span>
          </>
        }
      />
      <DataTable columns={columns} rows={data} empty="No protocol data yet." />
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
      <section style={{ paddingTop: 64 }}>
        <SectionHead
          tag="anomalies"
          title={
            <>
              Alerts &amp; <span className="serif">anomalies.</span>
            </>
          }
        />
        <div className="v2-digest-anomalies">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="v2-digest-skel-anomaly" />
          ))}
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <section style={{ paddingTop: 64 }}>
      <SectionHead
        tag="anomalies"
        title={
          <>
            Alerts &amp; <span className="serif">anomalies.</span>
          </>
        }
      />
      <div className="v2-digest-anomalies">
        {data.map((anomaly, i) => {
          const config = ANOMALY_CONFIG[anomaly.type] ?? {
            tone: 'neutral' as const,
            label: anomaly.type.replace(/_/g, ' '),
          };
          return (
            <div
              key={`${anomaly.walletAddress}-${anomaly.type}-${i}`}
              className={`v2-digest-anomaly v2-digest-anomaly-${config.tone}`}
            >
              <div className="v2-digest-anomaly-head">
                <a
                  href={`https://basescan.org/address/${anomaly.walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="v2-digest-anomaly-name"
                >
                  {anomaly.agentName ?? truncateAddress(anomaly.walletAddress)}
                </a>
                <Badge tone={config.tone}>{config.label}</Badge>
              </div>
              <p className="v2-digest-anomaly-detail">{anomaly.detail}</p>
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
      <section style={{ paddingTop: 64 }}>
        <SectionHead
          tag="quick.stats"
          title={
            <>
              Notable <span className="serif">moments.</span>
            </>
          }
        />
        <div className="v2-digest-quickstats">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="v2-digest-skel-stat" />
          ))}
        </div>
      </section>
    );
  }

  if (!data) return null;

  const cards: { label: string; value: string; sub: string }[] = [];

  if (data.busiestHour) {
    const h = data.busiestHour.hour;
    const hStr = `${h.toString().padStart(2, '0')}:00 utc`;
    cards.push({
      label: 'busiest.hour',
      value: hStr,
      sub: `${data.busiestHour.txCount} txs · ${data.busiestHour.day}`,
    });
  }

  // Re-enable gas columns after sentinel node is live and ACP agents are registered in observatory.

  if (data.longestIdleAgent) {
    cards.push({
      label: 'longest.idle',
      value: `${data.longestIdleAgent.lastTxDaysAgo}d`,
      sub: data.longestIdleAgent.name ?? truncateAddress(data.longestIdleAgent.walletAddress),
    });
  }

  if (data.highestRevenue) {
    cards.push({
      label: 'highest.revenue',
      value: formatUsd(data.highestRevenue.revenue),
      sub: data.highestRevenue.name ?? 'Unknown',
    });
  }

  if (cards.length === 0) return null;

  return (
    <section style={{ paddingTop: 64 }}>
      <SectionHead
        tag="quick.stats"
        title={
          <>
            Notable <span className="serif">moments.</span>
          </>
        }
      />
      <div className="v2-digest-quickstats">
        {cards.map((card) => (
          <div key={card.label} className="v2-digest-quickstat">
            <div className="v2-digest-quickstat-label">{card.label}</div>
            <div className="v2-digest-quickstat-value">{card.value}</div>
            <div className="v2-digest-quickstat-sub">{card.sub}</div>
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
    <section style={{ paddingTop: 80, paddingBottom: 80, textAlign: 'center' }}>
      <div className="v2-digest-soon">
        <div className="v2-digest-soon-tag">[ scheduled ]</div>
        <h1
          className="display"
          style={{
            fontSize: 'clamp(32px, 5vw, 56px)',
            lineHeight: 1.02,
            marginTop: 24,
            color: 'var(--fg)',
          }}
        >
          Weekly agent economy{' '}
          <span className="serif" style={{ color: 'var(--phosphor)' }}>
            digest.
          </span>
        </h1>
        <p className="v2-digest-soon-sub">
          Coming soon — the first digest publishes next Monday. Check back for weekly intelligence
          on the Base agent economy.
        </p>
        <div style={{ marginTop: 32 }}>
          <Button href="/base" variant="ghost">
            ← back to observatory
          </Button>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export function DigestClient({ initialData }: { initialData: DigestData | null }) {
  const [digest, setDigest] = useState<DigestData | null>(initialData ?? null);
  const [loading, setLoading] = useState(initialData == null);

  useEffect(() => {
    if (initialData != null) return;
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
  const headline = digest?.headline ?? null;
  const wow = headline?.wow ?? null;

  return (
    <PageShell>
      <StatusTicker />

      <div className="v2-shell" style={{ paddingBottom: 80 }}>
        <NavBar ctaHref="/login" ctaLabel="./connect" />

        {!hasData && !loading ? (
          <ComingSoon />
        ) : (
          <>
            {/* Hero */}
            <section style={{ paddingTop: 56 }}>
              <SectionHead
                tag="weekly.digest"
                title={
                  <>
                    Base agent{' '}
                    <span className="serif" style={{ color: 'var(--phosphor)' }}>
                      economy.
                    </span>
                  </>
                }
                lede={
                  loading
                    ? 'Loading weekly intelligence…'
                    : `Week of ${formatWeekRange(digest!.week_start, digest!.week_end)}. Published by ChainWard.`
                }
              />

              {/* Headline stats */}
              <div className="v2-digest-stats">
                <StatTile
                  label="total.revenue"
                  value={loading ? '…' : formatUsd(headline?.totalRevenue ?? 0)}
                  unit={loading ? undefined : formatChange(wow?.revenueChange ?? null)}
                  tone={statToneForChange(wow?.revenueChange ?? null)}
                />
                <StatTile
                  label="active.agents"
                  value={loading ? '…' : String(headline?.activeAgents ?? 0)}
                  unit={loading ? undefined : formatChange(wow?.activeAgentsChange ?? null)}
                  tone={statToneForChange(wow?.activeAgentsChange ?? null)}
                />
                <StatTile
                  label="jobs.completed"
                  value={loading ? '…' : (headline?.totalJobs ?? 0).toLocaleString()}
                  unit={loading ? undefined : formatChange(wow?.jobsChange ?? null)}
                  tone={statToneForChange(wow?.jobsChange ?? null)}
                />
                {(headline?.newAgents ?? 0) > 0 && (
                  <StatTile
                    label="new.agents"
                    value={loading ? '…' : String(headline?.newAgents ?? 0)}
                  />
                )}
              </div>
              <p className="v2-digest-source">
                // revenue data from Virtuals ACP
              </p>
            </section>

            <LeaderboardsSection
              data={digest?.leaderboards ?? null}
              loading={loading}
            />

            <SpotlightSection
              data={digest?.spotlight ?? null}
              loading={loading}
            />

            <ProtocolSection
              data={digest?.protocol_activity ?? null}
              loading={loading}
            />

            <AnomaliesSection
              data={digest?.alerts_anomalies ?? null}
              loading={loading}
            />

            <QuickStatsSection
              data={digest?.quick_stats ?? null}
              loading={loading}
            />

            {/* CTA */}
            <section style={{ paddingTop: 80 }}>
              <div className="v2-digest-cta">
                <div>
                  <h3
                    className="display"
                    style={{ fontSize: 28, margin: 0, color: 'var(--fg)' }}
                  >
                    Private monitoring for{' '}
                    <span className="serif" style={{ color: 'var(--phosphor)' }}>
                      your agents.
                    </span>
                  </h3>
                  <p
                    style={{
                      marginTop: 8,
                      color: 'var(--fg-dim)',
                      fontSize: 13,
                      lineHeight: 1.7,
                      maxWidth: 520,
                    }}
                  >
                    Real-time alerts, 7 alert types, Discord · Telegram · webhook. The digest
                    watches the whole ecosystem. Want pings when YOUR agents misbehave?
                  </p>
                </div>
                <Button href="/login">./start-monitoring →</Button>
              </div>
            </section>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="v2-digest-footer">
        <div className="v2-shell v2-digest-footer-inner">
          <div>// published every monday · chainward.ai</div>
          <div className="v2-digest-footer-links">
            <Link href="/base">observatory</Link>
            <Link href="/decodes">decodes</Link>
            <Link href="/wallet">lookup</Link>
          </div>
        </div>
      </footer>

      <style>{`
        .v2-digest-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 32px;
          padding-top: 32px;
          border-top: 1px solid var(--line);
        }
        .v2-digest-source {
          margin-top: 16px;
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.04em;
        }

        /* Tabs reuse observatory pattern */
        .v2-obs-tabs {
          display: flex;
          gap: 0;
          margin-bottom: 12px;
          border: 1px solid var(--line);
          background: var(--bg-1);
        }
        .v2-obs-tab {
          flex: 1;
          background: transparent;
          border: none;
          padding: 10px 14px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          color: var(--fg-dim);
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: color 0.15s, background 0.15s;
          border-right: 1px solid var(--line);
        }
        .v2-obs-tab:last-child { border-right: none; }
        .v2-obs-tab:hover { color: var(--phosphor); }
        .v2-obs-tab-active {
          color: var(--phosphor);
          background: rgba(58, 167, 109, 0.06);
        }

        /* Spotlight */
        .v2-digest-spotlight {
          border: 1px solid var(--line-2);
          background:
            radial-gradient(ellipse at 0% 0%, rgba(58, 167, 109, 0.05), transparent 60%),
            var(--bg-1);
          padding: 32px;
        }
        .v2-digest-spotlight-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }
        .v2-digest-spotlight-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid var(--line);
        }
        .v2-digest-spotlight-notable {
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid var(--line);
          color: var(--fg-dim);
          font-size: 18px;
          line-height: 1.5;
        }
        .v2-digest-health {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 12px 18px;
          border: 1px solid var(--line-2);
          min-width: 80px;
        }
        .v2-digest-health-label {
          font-size: 10px;
          letter-spacing: 0.1em;
          color: var(--muted);
          text-transform: lowercase;
        }
        .v2-digest-health-value {
          font-size: 28px;
          font-weight: 500;
          font-variant-numeric: tabular-nums;
          margin-top: 4px;
        }
        .v2-digest-health-phosphor { border-color: var(--phosphor-dim); }
        .v2-digest-health-phosphor .v2-digest-health-value { color: var(--phosphor); }
        .v2-digest-health-amber { border-color: rgba(232, 160, 51, 0.3); }
        .v2-digest-health-amber .v2-digest-health-value { color: var(--amber); }
        .v2-digest-health-danger { border-color: rgba(230, 103, 103, 0.3); }
        .v2-digest-health-danger .v2-digest-health-value { color: var(--danger); }
        .v2-digest-health-neutral .v2-digest-health-value { color: var(--fg-dim); }

        /* Protocol bar */
        .v2-digest-bar-track {
          flex: 1;
          height: 4px;
          background: var(--bg-2);
          border: 1px solid var(--line);
          overflow: hidden;
        }
        .v2-digest-bar-fill {
          height: 100%;
          background: var(--phosphor);
          transition: width 0.3s;
        }

        /* Anomalies */
        .v2-digest-anomalies {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .v2-digest-anomaly {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 20px 24px;
        }
        .v2-digest-anomaly-phosphor { border-left: 3px solid var(--phosphor); }
        .v2-digest-anomaly-amber { border-left: 3px solid var(--amber); }
        .v2-digest-anomaly-danger { border-left: 3px solid var(--danger); }
        .v2-digest-anomaly-head {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .v2-digest-anomaly-name {
          color: var(--fg);
          font-weight: 500;
          text-decoration: none;
          transition: color 0.15s;
        }
        .v2-digest-anomaly-name:hover { color: var(--phosphor); }
        .v2-digest-anomaly-detail {
          margin-top: 10px;
          color: var(--fg-dim);
          font-size: 13px;
          line-height: 1.7;
        }

        /* Quick stats */
        .v2-digest-quickstats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .v2-digest-quickstat {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .v2-digest-quickstat-label {
          font-size: 10px;
          letter-spacing: 0.1em;
          color: var(--muted);
          text-transform: lowercase;
        }
        .v2-digest-quickstat-value {
          font-size: 22px;
          font-weight: 500;
          color: var(--fg);
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
        }
        .v2-digest-quickstat-sub {
          font-size: 11px;
          color: var(--fg-dim);
          letter-spacing: 0.04em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* CTA */
        .v2-digest-cta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 40px;
          padding: 40px;
          border: 1px solid var(--line-2);
          background:
            radial-gradient(ellipse at 90% 0%, rgba(58, 167, 109, 0.06), transparent 60%),
            var(--bg-1);
          flex-wrap: wrap;
        }

        /* Footer */
        .v2-digest-footer {
          border-top: 1px solid var(--line);
          padding: 24px 0 48px;
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.04em;
        }
        .v2-digest-footer-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }
        .v2-digest-footer-links {
          display: flex;
          gap: 20px;
        }
        .v2-digest-footer-links :global(a) {
          color: var(--fg-dim);
          text-decoration: none;
          transition: color 0.15s;
        }
        .v2-digest-footer-links :global(a:hover) { color: var(--phosphor); }

        /* Coming soon */
        .v2-digest-soon {
          border: 1px solid var(--line-2);
          background:
            radial-gradient(ellipse at 50% 0%, rgba(58, 167, 109, 0.06), transparent 60%),
            var(--bg-1);
          padding: 64px 32px;
          max-width: 720px;
          margin: 0 auto;
        }
        .v2-digest-soon-tag {
          font-size: 11px;
          color: var(--phosphor);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .v2-digest-soon-sub {
          margin-top: 20px;
          color: var(--fg-dim);
          font-size: 14px;
          line-height: 1.7;
          max-width: 520px;
          margin-left: auto;
          margin-right: auto;
        }

        /* Skeletons */
        @keyframes v2-digest-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.9; }
        }
        .v2-digest-skeleton {
          background: var(--bg-2);
          animation: v2-digest-pulse 1.5s ease-in-out infinite;
        }
        .v2-digest-skel-table {
          border: 1px solid var(--line);
          background: var(--bg-1);
        }
        .v2-digest-skel-row {
          height: 44px;
          margin: 8px;
        }
        .v2-digest-skel-spotlight {
          height: 320px;
        }
        .v2-digest-skel-anomaly {
          height: 70px;
        }
        .v2-digest-skel-stat {
          height: 100px;
        }

        @media (max-width: 960px) {
          .v2-digest-stats { grid-template-columns: repeat(2, 1fr); }
          .v2-digest-spotlight-metrics { grid-template-columns: repeat(2, 1fr); }
          .v2-digest-quickstats { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .v2-digest-spotlight { padding: 24px 20px; }
        }
      `}</style>
    </PageShell>
  );
}
