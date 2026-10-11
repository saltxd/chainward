'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  feedHref,
  observatoryLede,
  type MostActiveEntry,
  type ObservatoryFeedItem,
  type ObservatoryOverview,
  type ObservatoryTrends,
  type X402Top,
} from '@/lib/observatory';

function timeAgo(timestamp: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function count(value: number | null | undefined): string {
  return value == null ? 'n/a' : value.toLocaleString('en-US');
}

export function ObservatoryHero({
  overview,
  trends,
}: {
  overview: ObservatoryOverview | null;
  trends: ObservatoryTrends | null;
}) {
  const stats: Array<[string, string]> = [
    ['Active, last 7 days', count(overview?.activeAgents7d)],
    ['Active, last 24 hours', count(overview?.activeAgents24h)],
    ['Named wallets', count(overview?.namedAgents)],
    ['Transfers, last 7 days', count(overview?.transactions7d)],
  ];

  return (
    <section className="obs-lead">
      <span className="press-label">The Observatory · Base</span>
      <h1 className="obs-title press-display">Base Agent Observatory.</h1>
      <p className="obs-lede">{observatoryLede(overview, trends)}</p>

      <div className="obs-stats">
        {stats.map(([label, value]) => (
          <div key={label} className="obs-stat">
            <span className="obs-stat-label">{label}</span>
            <span className="obs-stat-value mono">{value}</span>
          </div>
        ))}
      </div>
      <p className="obs-note">
        Active means we recorded a transfer in or out of the wallet. Known spam tokens don&apos;t count.
        Counts update every few minutes.
      </p>
    </section>
  );
}

type Tab = 'mostActive' | 'x402';

export function TopAgentsPanel({
  mostActive,
  x402,
}: {
  mostActive: MostActiveEntry[] | null;
  x402: X402Top | null;
}) {
  const [tab, setTab] = useState<Tab>('mostActive');
  const rows = mostActive ?? [];
  const tabs: Array<[Tab, string]> = [
    ['mostActive', 'Most active (7 days)'],
    ['x402', 'x402 sellers'],
  ];

  return (
    <div className="obs-panel">
      <h2 className="obs-h2 press-display">This week</h2>
      <div className="obs-tabs" role="tablist" aria-label="This week's lists">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            id={`obs-tab-${t}`}
            type="button"
            onClick={() => setTab(t)}
            className={`obs-tab ${tab === t ? 'obs-tab-active' : ''}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`obs-tabpanel-${t}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Both lists are in the HTML (crawlers read them); the tab only hides one. */}
      <div role="tabpanel" id="obs-tabpanel-mostActive" aria-labelledby="obs-tab-mostActive" hidden={tab !== 'mostActive'}>
        <div className="obs-table">
          <div className="obs-thead obs-lb-row">
            <span>№</span>
            <span>Agent</span>
            <span className="obs-framework">Framework</span>
            <span className="obs-right">Transfers</span>
          </div>
          {rows.length === 0 ? (
            <div className="obs-empty">No agent moved money in the last 7 days, or the list could not be read.</div>
          ) : (
            rows.map((r) => (
              <Link key={r.walletAddress} href={`/base/${r.slug}`} className="obs-row obs-lb-row">
                <span className="obs-rank mono">{r.rank}</span>
                <span className="obs-agent">
                  <span className="obs-agent-name">{r.agentName || truncateAddress(r.walletAddress)}</span>
                  <span className="obs-agent-addr mono">{truncateAddress(r.walletAddress)}</span>
                </span>
                <span className="obs-framework mono">{r.agentFramework ?? ''}</span>
                <span className="obs-value mono obs-right">{(r.txCount ?? 0).toLocaleString('en-US')}</span>
              </Link>
            ))
          )}
        </div>
      </div>

      <div role="tabpanel" id="obs-tabpanel-x402" aria-labelledby="obs-tab-x402" hidden={tab !== 'x402'}>
        <div className="obs-table">
          <div className="obs-thead obs-x4-row">
            <span>№</span>
            <span>Seller</span>
            <span>Verdict</span>
            <span className="obs-value obs-right">7-day volume</span>
          </div>
          {!x402 ? (
            <div className="obs-empty">The weekly x402 board could not be read just now.</div>
          ) : (
            x402.rows.map((r, i) => (
              <Link key={r.seller} href="/x402" className="obs-row obs-x4-row">
                <span className="obs-rank mono">{i + 1}</span>
                <span className="obs-agent">
                  <span className="obs-agent-name">{r.label ?? truncateAddress(r.seller)}</span>
                  <span className="obs-agent-addr mono">
                    {truncateAddress(r.seller)} · {r.buyers.toLocaleString('en-US')} buyers
                  </span>
                </span>
                <span className="obs-verdict">{r.verdict ?? 'check did not finish'}</span>
                <span className="obs-value mono obs-right">{formatUsd(r.volumeUsd)}</span>
              </Link>
            ))
          )}
        </div>
        <p className="obs-panel-foot">
          {x402 && (
            <>Top {x402.rows.length} of the weekly x402 seller board, built {new Date(x402.generatedAt).toUTCString().slice(5, 16)}. </>
          )}
          <Link className="press-link" href="/x402">
            The full board, with where each seller&apos;s buyers get their USDC →
          </Link>
        </p>
      </div>
    </div>
  );
}

export function WirePanel({ feed }: { feed: ObservatoryFeedItem[] | null }) {
  const rows = feed ?? [];
  return (
    <div className="obs-panel">
      <h2 className="obs-h2 press-display">The wire</h2>
      <div className="obs-feed-note press-label">Latest transfers · at most two per agent · updates every few minutes</div>
      <div className="obs-table">
        <div className="obs-thead obs-feed-row">
          <span>Time</span>
          <span>Agent</span>
          <span className="obs-dir">Dir</span>
          <span className="obs-token">Token</span>
          <span className="obs-right">USD</span>
        </div>
        {rows.length === 0 ? (
          <div className="obs-empty">No recent transfers to show.</div>
        ) : (
          rows.map((r, i) => (
            <Link key={`${r.txHash}-${i}`} href={feedHref(r)} className="obs-row obs-feed-row">
              {/* Relative time differs between the server render and the browser by design. */}
              <span className="obs-time mono" suppressHydrationWarning>
                {timeAgo(r.timestamp)}
              </span>
              <span className="obs-agent-name">{r.agentName || truncateAddress(r.walletAddress)}</span>
              <span
                className="obs-dir mono"
                style={{ color: r.direction.toUpperCase() === 'IN' ? 'var(--seal)' : 'var(--ink-faint)' }}
              >
                {r.direction.slice(0, 3).toUpperCase()}
              </span>
              <span className="obs-token mono">{r.tokenSymbol ?? 'ETH'}</span>
              <span className="obs-usd mono obs-right">{r.amountUsd == null ? 'no price' : formatUsd(r.amountUsd)}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
