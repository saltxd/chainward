'use client';

/**
 * Risk report client view. Orchestrates the full state machine for a single
 * address:
 *
 *   invalid  → bad address format, never hits the API
 *   loading  → initial GET /api/risk/report/:address
 *   ready    → cached fresh report exists → render full report
 *   stale    → cached report is stale → render full report + amber re-check
 *   teaser   → novel address with history → public_stats + "run the check"
 *   pending  → a decode is queued → poll GET /api/risk/check/:id
 *   no_history → address has no on-chain history
 *   error    → transport / unexpected failure → retry
 *
 * INTEGRITY: no SAFE verdict, no grade, no safety %, signal_density never shown.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  PageShell,
  NavBar,
  StatusTicker,
  SectionHead,
  StatTile,
  Button,
  Badge,
} from '@/components/v2';
import { RISK_NAV_LINKS } from '@/components/v2/nav-links';
import { ApiError, publicApi, type RiskReport, type RiskTeaser } from '@/lib/api';
import { DISCLAIMER } from '@/lib/risk';
import {
  BandSummary,
  FlagList,
  FreshnessStamp,
  HonestDisclaimer,
  NotAssessed,
} from './_components';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 40; // ~2 min ceiling

type ViewState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; report: RiskReport }
  | { kind: 'stale'; report: RiskReport }
  | { kind: 'teaser'; teaser: RiskTeaser }
  | { kind: 'no_history' }
  | { kind: 'pending' }
  | { kind: 'rate_limited' }
  | { kind: 'error'; message: string };

function fmtNum(n: number, maxFrac = 4): string {
  if (n === 0) return '0';
  if (n > 0 && n < 0.0001) return '< 0.0001';
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
}

export function ReportView({ address }: { address: string }) {
  const lowered = address.toLowerCase();
  const valid = ADDRESS_RE.test(address);

  const [state, setState] = useState<ViewState>(
    valid ? { kind: 'loading' } : { kind: 'invalid' },
  );
  const [checkLoading, setCheckLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollCheck = useCallback(
    (checkId: string) => {
      const tick = async () => {
        attemptsRef.current += 1;
        try {
          const res = await publicApi.getCheckStatus(checkId);
          const data = res.data;
          if (data.status === 'ready') {
            clearPoll();
            setState({ kind: 'ready', report: data.report });
            return;
          }
          if (data.status === 'failed') {
            clearPoll();
            setState({ kind: 'error', message: data.error });
            return;
          }
          // pending
          if (attemptsRef.current >= POLL_MAX_ATTEMPTS) {
            clearPoll();
            setState({
              kind: 'error',
              message:
                'The decode is taking longer than expected. Refresh in a moment to see the report.',
            });
            return;
          }
          pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        } catch (err) {
          clearPoll();
          setState({
            kind: 'error',
            message:
              err instanceof Error ? err.message : 'Failed to poll the check.',
          });
        }
      };
      pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    },
    [clearPoll],
  );

  // Poll the public report endpoint until the (already-enqueued) decode caches it.
  // Used after a teaser so the preview auto-upgrades to the full report.
  const pollReport = useCallback(
    (addr: string) => {
      const tick = async () => {
        attemptsRef.current += 1;
        try {
          const res = await publicApi.getReport(addr);
          clearPoll();
          const report = res.data.report;
          setState(
            report.freshness.ttl_state === 'stale'
              ? { kind: 'stale', report }
              : { kind: 'ready', report },
          );
        } catch (err) {
          // 404 = decode still running → keep waiting up to the ceiling.
          if (
            err instanceof ApiError &&
            err.code === 'NOT_FOUND' &&
            attemptsRef.current < POLL_MAX_ATTEMPTS
          ) {
            pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
            return;
          }
          clearPoll(); // give up quietly — the teaser preview stays visible
        }
      };
      pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    },
    [clearPoll],
  );

  // Initial load — try the cached public report first.
  const load = useCallback(async () => {
    if (!valid) {
      setState({ kind: 'invalid' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const res = await publicApi.getReport(lowered);
      const report = res.data.report;
      setState(
        report.freshness.ttl_state === 'stale'
          ? { kind: 'stale', report }
          : { kind: 'ready', report },
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') {
        // No cached report — kick off a check to get a teaser or queue a decode.
        await runCheck(false);
        return;
      }
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
        setState({ kind: 'rate_limited' });
        return;
      }
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to load report.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowered, valid]);

  // Run / re-run a check. forceRecheck=true for the re-check button.
  const runCheck = useCallback(
    async (forceRecheck: boolean) => {
      clearPoll();
      attemptsRef.current = 0;
      setCheckLoading(true);
      try {
        const res = await publicApi.checkAddress(lowered, forceRecheck);
        const data = res.data;
        switch (data.status) {
          case 'ready':
            setState({ kind: 'ready', report: data.report });
            break;
          case 'stale':
            setState({ kind: 'stale', report: data.report });
            break;
          case 'teaser':
            setState({ kind: 'teaser', teaser: data.teaser });
            // The decode is already enqueued server-side; poll the report so the
            // teaser auto-upgrades to the full report when flags are ready.
            attemptsRef.current = 0;
            pollReport(lowered);
            break;
          case 'no_history':
            setState({ kind: 'no_history' });
            break;
          case 'queued':
            setState({ kind: 'pending' });
            pollCheck(data.check_id);
            break;
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
          setState({ kind: 'rate_limited' });
        } else if (err instanceof ApiError && err.code === 'INVALID_TARGET') {
          setState({ kind: 'invalid' });
        } else {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Check failed.',
          });
        }
      } finally {
        setCheckLoading(false);
      }
    },
    [lowered, clearPoll, pollCheck, pollReport],
  );

  useEffect(() => {
    load();
    return clearPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowered]);

  return (
    <PageShell>
      <StatusTicker />
      <div className="v2-shell" style={{ paddingTop: 0, paddingBottom: 80 }}>
        <NavBar links={RISK_NAV_LINKS} ctaHref="/" ctaLabel="./check" />

        <section style={{ paddingTop: 56 }}>
          <div className="v2-rr-kicker">
            <span className="v2-rr-kicker-dot" aria-hidden />
            risk.check
          </div>
          <div className="v2-rr-hero">
            <div className="v2-rr-address">{address}</div>
            <div className="v2-rr-hero-meta">
              <Badge tone="phosphor">base</Badge>
              <span className="v2-rr-hero-note">
                flags, not promises · read from the chain
              </span>
            </div>
          </div>
        </section>

        {/* ── invalid ─────────────────────────────────────────────────── */}
        {state.kind === 'invalid' && (
          <section style={{ paddingTop: 48 }}>
            <div className="v2-rr-panel v2-rr-panel-danger">
              <div className="v2-rr-panel-tag">// invalid target</div>
              <p>
                That doesn&apos;t look like a Base address. Paste a 40-character
                hex address starting with <code>0x</code>.
              </p>
              <Button href="/">← back to check</Button>
            </div>
          </section>
        )}

        {/* ── loading ─────────────────────────────────────────────────── */}
        {state.kind === 'loading' && (
          <section style={{ paddingTop: 48 }}>
            <div className="v2-rr-loading">
              <span className="v2-rr-loading-pulse" />
              reading the chain…
            </div>
          </section>
        )}

        {/* ── pending (decode queued) ─────────────────────────────────── */}
        {state.kind === 'pending' && (
          <section style={{ paddingTop: 48 }}>
            <div className="v2-rr-panel">
              <div className="v2-rr-panel-tag">
                <span className="v2-rr-loading-pulse" /> // decode running
              </div>
              <p>
                Running the forensic decode against our Base node. This usually
                takes under a minute — flags will appear here automatically.
              </p>
              <div className="v2-rr-pending-steps">
                <span>fetching transfers</span>
                <span>classifying behavior</span>
                <span>deriving flags</span>
              </div>
            </div>
          </section>
        )}

        {/* ── rate limited ────────────────────────────────────────────── */}
        {state.kind === 'rate_limited' && (
          <section style={{ paddingTop: 48 }}>
            <div className="v2-rr-panel v2-rr-panel-amber">
              <div className="v2-rr-panel-tag">// rate limited</div>
              <p>
                Too many checks from this address right now. Wait a moment, then
                retry — checks are free, just throttled to keep the node honest.
              </p>
              <Button variant="ghost" onClick={() => load()}>
                ./retry
              </Button>
            </div>
          </section>
        )}

        {/* ── error ───────────────────────────────────────────────────── */}
        {state.kind === 'error' && (
          <section style={{ paddingTop: 48 }}>
            <div className="v2-rr-panel v2-rr-panel-danger">
              <div className="v2-rr-panel-tag">// check failed</div>
              <p>{state.message}</p>
              <Button variant="ghost" onClick={() => load()}>
                ./retry
              </Button>
            </div>
          </section>
        )}

        {/* ── no_history ──────────────────────────────────────────────── */}
        {state.kind === 'no_history' && (
          <section style={{ paddingTop: 48 }}>
            <div className="v2-rr-panel">
              <div className="v2-rr-panel-tag">// no on-chain history</div>
              <p>
                This address has no transactions and no token transfers on Base.
                There is nothing on-chain to check yet.
              </p>
              <Button href="/">← check another address</Button>
            </div>
            <div style={{ marginTop: 32 }}>
              <HonestDisclaimer text={DISCLAIMER} />
            </div>
          </section>
        )}

        {/* ── teaser (novel address, NO flags) ───────────────────────── */}
        {state.kind === 'teaser' && (
          <>
            <section style={{ paddingTop: 48 }}>
              <SectionHead
                tag="public stats"
                title={
                  <>
                    Has history.{' '}
                    <span className="serif" style={{ color: 'var(--phosphor)' }}>
                      Decoding now.
                    </span>
                  </>
                }
                lede="The full forensic decode is running against our own Base node — flags appear below automatically when it finishes. Here is the cheap public snapshot meanwhile. No flags are shown until the decode completes."
              />
              <div className="v2-rr-stats">
                <StatTile
                  label="txs"
                  value={fmtNum(state.teaser.public_stats.tx_count, 0)}
                  unit="transactions"
                />
                <StatTile
                  label="eth.balance"
                  value={fmtNum(state.teaser.public_stats.eth_balance)}
                  unit="eth"
                />
                <StatTile
                  label="usdc.balance"
                  value={fmtNum(state.teaser.public_stats.usdc_balance, 2)}
                  unit="usdc"
                />
                <StatTile
                  label="tokens.held"
                  value={fmtNum(state.teaser.public_stats.token_count, 0)}
                  unit="assets"
                />
                <StatTile
                  label="counterparties.30d"
                  value={fmtNum(
                    state.teaser.public_stats.unique_counterparties_30d,
                    0,
                  )}
                  unit="lower bound"
                />
                <StatTile
                  label="acp.agent"
                  value={state.teaser.public_stats.is_acp_agent ? 'yes' : 'no'}
                  unit="virtuals acp"
                />
              </div>
            </section>

            <section style={{ paddingTop: 56 }}>
              <div className="v2-rr-panel">
                <div className="v2-rr-panel-tag">
                  <span className="v2-rr-loading-pulse" /> // decode running
                </div>
                <p>
                  Running the full forensic decode against our own Base node now —
                  reading transfers, classifying behavior, deriving flags with
                  on-chain evidence. Flags appear here automatically, usually under
                  a minute. The result becomes a free, public, shareable report.
                </p>
                <Button variant="ghost" onClick={() => load()}>
                  ↻ refresh
                </Button>
              </div>
            </section>

            <section style={{ paddingTop: 56 }}>
              <NotAssessedTeaserNote />
              <div style={{ marginTop: 28 }}>
                <HonestDisclaimer text={DISCLAIMER} />
              </div>
            </section>
          </>
        )}

        {/* ── ready / stale (full report) ─────────────────────────────── */}
        {(state.kind === 'ready' || state.kind === 'stale') && (
          <FullReport
            report={state.report}
            stale={state.kind === 'stale'}
            recheckLoading={checkLoading}
            onRecheck={() => runCheck(true)}
          />
        )}
      </div>

      <ReportStyles />
    </PageShell>
  );
}

/** A short note shown under the teaser so the no-flags state is never read as a
 * clearance even before the decode runs. */
function NotAssessedTeaserNote() {
  return (
    <div className="v2-rr-na">
      <div className="v2-rr-na-tag">// before you trust this snapshot</div>
      <p className="v2-rr-na-lede">
        Public stats are balances and counts only. They are not a safety
        assessment, and they do not cover contract code, token approvals,
        off-chain agreements, or social engineering. Run the decode for flags.
      </p>
    </div>
  );
}

function FullReport({
  report,
  stale,
  recheckLoading,
  onRecheck,
}: {
  report: RiskReport;
  stale: boolean;
  recheckLoading: boolean;
  onRecheck: () => void;
}) {
  return (
    <>
      {stale && (
        <section style={{ paddingTop: 40 }}>
          <div className="v2-rr-stale">
            <div className="v2-rr-stale-head">
              <Badge tone="amber">stale</Badge>
              <span>
                This report is past its freshness window. It is served as-is,
                flagged stale — never presented as current.
              </span>
            </div>
            <Button
              variant="ghost"
              onClick={onRecheck}
              disabled={recheckLoading}
            >
              {recheckLoading ? 're-checking…' : './re-check (free) →'}
            </Button>
          </div>
        </section>
      )}

      <section style={{ paddingTop: stale ? 40 : 48 }}>
        <BandSummary band={report.band} flags={report.flags} />
      </section>

      <section style={{ paddingTop: 48 }}>
        <SectionHead
          tag="flags"
          title={
            <>
              On-chain{' '}
              <span className="serif" style={{ color: 'var(--phosphor)' }}>
                signals.
              </span>
            </>
          }
        />
        <FlagList flags={report.flags} />
      </section>

      <section style={{ paddingTop: 48 }}>
        <FreshnessStamp freshness={report.freshness} />
        <p className="v2-rr-classifier">
          // classifier v{report.classifier_version} · {report.view_count}{' '}
          {report.view_count === 1 ? 'view' : 'views'}
        </p>
      </section>

      <section style={{ paddingTop: 48 }}>
        <NotAssessed items={report.not_assessed} />
      </section>

      <section style={{ paddingTop: 40 }}>
        <HonestDisclaimer text={report.disclaimer} />
      </section>

      <section style={{ paddingTop: 40 }}>
        <Link href="/reports" className="v2-rr-back">
          ← browse the public library
        </Link>
      </section>
    </>
  );
}

function ReportStyles() {
  return (
    <style>{`
      .v2-rr-kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: var(--fg-dim);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        padding-bottom: 16px;
      }
      .v2-rr-kicker-dot {
        width: 20px;
        height: 1px;
        background: var(--phosphor);
      }
      .v2-rr-hero {
        padding-bottom: 20px;
        border-bottom: 1px solid var(--line);
      }
      .v2-rr-address {
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: clamp(16px, 2.4vw, 26px);
        color: var(--fg);
        letter-spacing: -0.01em;
        word-break: break-all;
        line-height: 1.3;
      }
      .v2-rr-hero-meta {
        margin-top: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .v2-rr-hero-note {
        font-size: 11px;
        color: var(--muted);
        letter-spacing: 0.04em;
      }
      .v2-rr-loading {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        color: var(--fg-dim);
        font-size: 13px;
        letter-spacing: 0.04em;
      }
      .v2-rr-loading-pulse {
        width: 8px;
        height: 8px;
        background: var(--phosphor);
        box-shadow: 0 0 6px var(--phosphor);
        animation: v2-pulse 1.4s ease-in-out infinite;
        display: inline-block;
      }
      .v2-rr-panel {
        border: 1px solid var(--line-2);
        background: var(--bg-1);
        padding: 28px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        align-items: flex-start;
      }
      .v2-rr-panel p {
        color: var(--fg-dim);
        font-size: 13px;
        line-height: 1.7;
        margin: 0;
        max-width: 560px;
      }
      .v2-rr-panel code {
        color: var(--phosphor);
        background: rgba(58,167,109,0.08);
        padding: 1px 6px;
        border: 1px solid var(--line);
      }
      .v2-rr-panel-tag {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        letter-spacing: 0.1em;
        color: var(--muted);
      }
      .v2-rr-panel-danger { border-color: rgba(230,103,103,0.3); background: rgba(230,103,103,0.04); }
      .v2-rr-panel-danger .v2-rr-panel-tag { color: var(--danger); }
      .v2-rr-panel-amber { border-color: rgba(232,160,51,0.3); background: rgba(232,160,51,0.04); }
      .v2-rr-panel-amber .v2-rr-panel-tag { color: var(--amber); }
      .v2-rr-pending-steps {
        display: flex;
        gap: 18px;
        flex-wrap: wrap;
        font-size: 11px;
        color: var(--muted);
        letter-spacing: 0.06em;
      }
      .v2-rr-pending-steps span::before { content: '// '; color: var(--phosphor-dim); }
      .v2-rr-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 32px 24px;
      }
      .v2-rr-cta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 40px;
        padding: 36px;
        border: 1px solid var(--line-2);
        background: var(--bg-1);
        flex-wrap: wrap;
      }
      .v2-rr-cta-sub {
        margin-top: 10px;
        color: var(--fg-dim);
        font-size: 13px;
        line-height: 1.7;
        max-width: 520px;
      }
      .v2-rr-stale {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 18px 24px;
        border: 1px solid rgba(232,160,51,0.3);
        background: rgba(232,160,51,0.04);
        flex-wrap: wrap;
      }
      .v2-rr-stale-head {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        font-size: 12px;
        color: var(--fg-dim);
        line-height: 1.6;
        max-width: 640px;
      }
      /* ── band summary ── */
      .v2-rr-band {
        border: 1px solid var(--line);
        background: var(--bg-1);
        padding: 24px;
      }
      .v2-rr-band-head {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .v2-rr-band-tag {
        font-size: 11px;
        color: var(--muted);
        letter-spacing: 0.1em;
      }
      .v2-rr-band-desc {
        margin: 16px 0 0 0;
        color: var(--fg-dim);
        font-size: 13px;
        line-height: 1.7;
        max-width: 600px;
      }
      .v2-rr-counts {
        margin-top: 18px;
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .v2-rr-count-zero {
        font-size: 12px;
        color: var(--fg-dim);
        letter-spacing: 0.04em;
      }
      /* ── flag list ── */
      .v2-rr-flags {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 14px;
      }
      .v2-rr-flag {
        position: relative;
        border: 1px solid var(--line);
        border-left: 2px solid var(--line-2);
        background: var(--bg-1);
        padding: 20px 22px;
      }
      .v2-rr-flag-danger { border-left-color: var(--danger); }
      .v2-rr-flag-amber { border-left-color: var(--amber); }
      .v2-rr-flag-cyan { border-left-color: var(--cyan); }
      .v2-rr-flag-neutral { border-left-color: var(--muted); }
      .v2-rr-flag-head {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .v2-rr-flag-title {
        color: var(--fg);
        font-size: 14px;
        letter-spacing: -0.01em;
      }
      .v2-rr-flag-evidence {
        margin: 12px 0 0 0;
        color: var(--fg-dim);
        font-size: 12.5px;
        line-height: 1.7;
        max-width: 640px;
      }
      .v2-rr-flag-source {
        display: inline-block;
        margin-top: 12px;
        font-size: 11px;
        color: var(--phosphor);
        text-decoration: none;
        letter-spacing: 0.04em;
      }
      .v2-rr-flag-source:hover { color: var(--fg); }
      .v2-rr-flag-id {
        position: absolute;
        top: 14px;
        right: 18px;
        font-size: 10px;
        color: var(--muted);
        letter-spacing: 0.06em;
      }
      .v2-rr-noflags {
        border: 1px solid var(--line);
        background: var(--bg-1);
        padding: 28px;
      }
      .v2-rr-noflags-mark { color: var(--phosphor-dim); font-size: 13px; }
      .v2-rr-noflags p {
        margin: 8px 0 0 0;
        color: var(--fg);
        font-size: 15px;
        line-height: 1.5;
      }
      .v2-rr-noflags-note {
        display: block;
        margin-top: 12px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.6;
      }
      /* ── freshness ── */
      .v2-rr-fresh {
        display: flex;
        gap: 32px;
        flex-wrap: wrap;
        padding: 18px 22px;
        border: 1px solid var(--line);
        background: var(--bg-1);
      }
      .v2-rr-fresh-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .v2-rr-fresh-key {
        font-size: 10px;
        color: var(--muted);
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .v2-rr-fresh-val {
        font-size: 13px;
        color: var(--fg);
        font-variant-numeric: tabular-nums;
      }
      .v2-rr-classifier {
        margin-top: 14px;
        font-size: 11px;
        color: var(--muted);
        letter-spacing: 0.04em;
      }
      /* ── not assessed ── */
      .v2-rr-na {
        border: 1px solid var(--line);
        border-top: 2px solid var(--line-2);
        background: var(--bg-1);
        padding: 24px;
      }
      .v2-rr-na-tag {
        font-size: 11px;
        color: var(--muted);
        letter-spacing: 0.1em;
        margin-bottom: 12px;
      }
      .v2-rr-na-lede {
        margin: 0 0 16px 0;
        color: var(--fg-dim);
        font-size: 13px;
        line-height: 1.7;
        max-width: 600px;
      }
      .v2-rr-na-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 10px;
      }
      .v2-rr-na-list li {
        position: relative;
        padding-left: 20px;
        color: var(--fg-dim);
        font-size: 12.5px;
        line-height: 1.6;
      }
      .v2-rr-na-list li::before {
        content: '—';
        position: absolute;
        left: 0;
        color: var(--muted);
      }
      /* ── disclaimer ── */
      .v2-rr-disclaimer {
        border: 1px dashed var(--line-2);
        padding: 18px 22px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.7;
        max-width: 720px;
      }
      .v2-rr-back {
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 12px;
        color: var(--fg-dim);
        text-decoration: none;
        letter-spacing: 0.04em;
        transition: color 0.15s;
      }
      .v2-rr-back:hover { color: var(--phosphor); }
      @media (max-width: 880px) {
        .v2-rr-stats { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 520px) {
        .v2-rr-stats { grid-template-columns: 1fr; }
        .v2-rr-fresh { gap: 18px 24px; }
      }
    `}</style>
  );
}
