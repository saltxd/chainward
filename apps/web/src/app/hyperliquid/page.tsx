import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell, NavBar, SectionHead, StatTile, Badge } from '@/components/v2';
import { getArenaAudit, type AuditRow } from '@/lib/hyperliquid-audit';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Hyperliquid Agent Audit — Live Arena Truth Check',
  description:
    "Independent audit of Virtuals' Arena leaderboard against Hyperliquid's public API. Side-by-side display of what the dashboard claims vs what the chain actually shows.",
  alternates: { canonical: 'https://chainward.ai/hyperliquid' },
  openGraph: {
    title: 'Hyperliquid Agent Audit | ChainWard',
    description:
      "Independent audit of Virtuals' Arena leaderboard vs Hyperliquid's public clearinghouse + spot endpoints.",
    url: 'https://chainward.ai/hyperliquid',
    type: 'website',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hyperliquid Agent Audit | ChainWard',
    images: ['/chainward-og.png'],
  },
};

function fmtUsd(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fmtPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / (1000 * 60 * 60 * 24));
  const h = Math.floor((ms / (1000 * 60 * 60)) % 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  const m = Math.floor(ms / (1000 * 60));
  return `${m}m ago`;
}

function deltaColor(deltaPct: number): string {
  const abs = Math.abs(deltaPct);
  if (abs < 5) return 'var(--phosphor)';
  if (abs < 25) return 'var(--fg-dim)';
  return '#f87171';
}

function AuditRowDisplay({ row }: { row: AuditRow }) {
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--line)',
      }}
    >
      <td style={{ padding: '14px 12px', color: 'var(--fg-dim)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        {row.rank}
      </td>
      <td style={{ padding: '14px 12px' }}>
        <div style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 500 }}>{row.name}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono, ui-monospace)' }}>
          ${row.tokenSymbol}{' '}
          <a
            href={`https://app.hyperliquid.xyz/explorer/address/${row.agentAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--fg-dim)', textDecoration: 'none' }}
          >
            {row.agentAddress.slice(0, 6)}…{row.agentAddress.slice(-4)} ↗
          </a>
        </div>
      </td>
      <td
        style={{
          padding: '14px 12px',
          textAlign: 'right',
          fontFamily: 'var(--font-mono, ui-monospace)',
          color: 'var(--fg)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmtUsd(row.displayedAcct)}
      </td>
      <td
        style={{
          padding: '14px 12px',
          textAlign: 'right',
          fontFamily: 'var(--font-mono, ui-monospace)',
          color: row.fetched ? 'var(--fg)' : 'var(--fg-dim)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {row.fetched ? fmtUsd(row.hlCombined) : 'err'}
        {row.fetched && row.hlSpotUsdcHeld > 0 && (
          <div style={{ fontSize: 10, color: 'var(--fg-dim)' }}>
            perp {fmtUsd(row.hlPerpAcct, 0)} + spot {fmtUsd(row.hlSpotUsdc, 0)}
          </div>
        )}
      </td>
      <td
        style={{
          padding: '14px 12px',
          textAlign: 'right',
          fontFamily: 'var(--font-mono, ui-monospace)',
          color: row.fetched ? deltaColor(row.acctDeltaPct) : 'var(--fg-dim)',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 13,
        }}
      >
        {row.fetched ? fmtPct(row.acctDeltaPct) : '—'}
      </td>
      <td
        style={{
          padding: '14px 12px',
          textAlign: 'right',
          fontFamily: 'var(--font-mono, ui-monospace)',
          color: row.displayedRealized >= 0 ? 'var(--phosphor)' : '#f87171',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmtUsd(row.displayedRealized)}
      </td>
      <td
        style={{
          padding: '14px 12px',
          textAlign: 'right',
          color: 'var(--fg-dim)',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 13,
        }}
      >
        {row.displayedTrades.toLocaleString()}
      </td>
      <td
        style={{
          padding: '14px 12px',
          textAlign: 'right',
          color: 'var(--fg-dim)',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 13,
        }}
      >
        {(row.displayedWinRate * 100).toFixed(1)}%
      </td>
      <td
        style={{
          padding: '14px 12px',
          textAlign: 'right',
          color: 'var(--fg-dim)',
          fontSize: 12,
        }}
      >
        {fmtAgo(row.lastTradeAt)}
      </td>
    </tr>
  );
}

export default async function HyperliquidPage() {
  let snapshot;
  let error: string | null = null;
  try {
    snapshot = await getArenaAudit(30);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <PageShell>
      <NavBar ctaHref="/login" ctaLabel="./connect" />

      <section
        className="v2-shell"
        style={{ paddingTop: 64, paddingBottom: 24 }}
      >
        <div style={{ marginBottom: 16 }}>
          <Badge>BETA</Badge>{' '}
          <Badge>HYPERLIQUID</Badge>
        </div>
        <SectionHead
          tag="audit"
          title="Hyperliquid Agent Audit"
          lede="Side-by-side: what Virtuals' Arena leaderboard at degen.virtuals.io claims about each agent, vs what Hyperliquid's public clearinghouse + spot endpoints actually report. No interpretation — just the two numbers."
        />
      </section>

      {error ? (
        <section className="v2-shell" style={{ paddingBottom: 96 }}>
          <div
            style={{
              padding: 24,
              background: 'var(--bg-1, #12121f)',
              border: '1px solid var(--line)',
              color: 'var(--fg-dim)',
            }}
          >
            Couldn&apos;t fetch live audit: {error}
          </div>
        </section>
      ) : (
        <>
          <section className="v2-shell" style={{ paddingBottom: 32 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 16,
              }}
              className="v2-hl-stat-grid"
            >
              <StatTile
                label="match.within.10%"
                value={`${snapshot!.totals.matchWithin10}/30`}
                unit="agents"
                tone="phosphor"
              />
              <StatTile
                label="displayed.total"
                value={fmtUsd(snapshot!.totals.displayedAcct, 0)}
                unit={`HL: ${fmtUsd(snapshot!.totals.hlCombined, 0)}`}
              />
              <StatTile
                label="off.by.gte.25%"
                value={String(snapshot!.totals.offBy25Plus)}
                unit="of 30"
                tone={snapshot!.totals.offBy25Plus > 5 ? 'amber' : 'default'}
              />
              <StatTile
                label="dormant.gte.7d"
                value={String(snapshot!.totals.dormant7d)}
                unit="last trade"
              />
            </div>
            <style>{`
              @media (max-width: 720px) {
                .v2-hl-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
              }
            `}</style>
          </section>

          <section className="v2-shell" style={{ paddingBottom: 32, overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                minWidth: 1000,
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>#</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agent</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Displayed Acct</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>HL Combined</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Δ%</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Realized PnL</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trades</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Win%</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--fg-dim)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Trade</th>
                </tr>
              </thead>
              <tbody>
                {snapshot!.rows.map((row) => (
                  <AuditRowDisplay key={row.agentAddress} row={row} />
                ))}
              </tbody>
            </table>
          </section>

          <section
            className="v2-shell"
            style={{
              paddingTop: 48,
              paddingBottom: 80,
              borderTop: '1px solid var(--line)',
            }}
          >
            <h2 className="display" style={{ fontSize: 24, color: 'var(--fg)', marginTop: 0, marginBottom: 16 }}>
              Methodology
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 32 }} className="v2-hl-faq-grid">
              <div>
                <h3 style={{ fontSize: 14, color: 'var(--fg)', margin: 0, marginBottom: 8 }}>What is &quot;Displayed Acct&quot;?</h3>
                <p style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.7, margin: 0 }}>
                  The <code>holdingsValueUsd</code> field returned by <code>degen.virtuals.io/api/leaderboard</code> for each agent. That&apos;s the same number rendered in the &quot;Account Value&quot; column on Virtuals&apos; Arena leaderboard.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 14, color: 'var(--fg)', margin: 0, marginBottom: 8 }}>What is &quot;HL Combined&quot;?</h3>
                <p style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.7, margin: 0 }}>
                  The agent address&apos;s Hyperliquid perp <code>marginSummary.accountValue</code> + their spot stablecoin balance (USDC/USDE/USDT0/USDH totals). Same address, both sides of the chain.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 14, color: 'var(--fg)', margin: 0, marginBottom: 8 }}>Why might Δ% be non-zero?</h3>
                <p style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.7, margin: 0 }}>
                  degen.virtuals.io snapshots a periodic <code>calculatedAt</code> timestamp; Hyperliquid is live. Spot USDC that&apos;s pledged as perp collateral (the <code>hold</code> field) can also create small differences depending on how each side accounts for it. Anything &gt;25% is worth a closer look.
                </p>
              </div>
              <div>
                <h3 style={{ fontSize: 14, color: 'var(--fg)', margin: 0, marginBottom: 8 }}>Why aren&apos;t you alleging fraud?</h3>
                <p style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.7, margin: 0 }}>
                  Because when we last audited the top 30, 22/30 matched within 25% after counting spot USDC. The Arena leaderboard is mostly accurate. We&apos;re publishing the live diff so you can see for yourself rather than trust either side.
                </p>
              </div>
            </div>
            <style>{`
              @media (max-width: 720px) {
                .v2-hl-faq-grid { grid-template-columns: 1fr !important; }
              }
            `}</style>
            <div
              style={{
                marginTop: 32,
                paddingTop: 16,
                borderTop: '1px solid var(--line)',
                fontSize: 12,
                color: 'var(--fg-dim)',
                fontFamily: 'var(--font-mono, ui-monospace)',
              }}
            >
              Last refresh: {snapshot!.fetchedAt} · Refreshes every 5 minutes ·{' '}
              <Link href="/base" style={{ color: 'var(--phosphor)' }}>← Base observatory</Link>
            </div>
          </section>
        </>
      )}
    </PageShell>
  );
}
