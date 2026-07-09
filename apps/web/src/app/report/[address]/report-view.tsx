'use client';

/**
 * Risk report client view — filed as a forensic case file on paper. Orchestrates
 * the full state machine for a single address:
 *
 *   invalid  → bad address format, never hits the API
 *   loading  → initial GET /api/risk/report/:address
 *   ready    → cached fresh report exists → render full report
 *   stale    → cached report is stale → render full report + amber re-check
 *   teaser   → novel address with history → public_stats + "decoding now"
 *   pending  → a decode is queued → poll GET /api/risk/check/:id
 *   no_history → address has no on-chain history
 *   error    → transport / unexpected failure → retry
 *
 * INTEGRITY: no SAFE verdict, no grade, no safety %, signal_density never shown.
 * The state machine + data flow are unchanged from v1 — only presentation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon, BriefOffer } from '@/components/press';
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
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="rr-hero">
          <div className="press-fileno">
            Case File <span className="ph-dateline-sep">·</span> On-chain risk check
          </div>
          <div className="rr-subject mono">{address}</div>
          <div className="rr-hero-note">
            <span className="rr-chip">Base</span>
            <span>Flags, not promises — read from the chain.</span>
          </div>
        </section>

        {/* ── invalid ─────────────────────────────────────────────────── */}
        {state.kind === 'invalid' && (
          <div className="rr-notice rr-notice--danger">
            <div className="rr-notice-tag">Invalid target</div>
            <p>
              That doesn&apos;t look like a Base address. Paste a 40-character hex
              address starting with <code>0x</code>.
            </p>
            <Link href="/" className="press-btn press-btn--ghost">
              ← Back to check
            </Link>
          </div>
        )}

        {/* ── loading ─────────────────────────────────────────────────── */}
        {state.kind === 'loading' && (
          <div className="rr-loading">
            <span className="rr-loading-pulse" aria-hidden /> Reading the chain…
          </div>
        )}

        {/* ── pending (decode queued) ─────────────────────────────────── */}
        {state.kind === 'pending' && (
          <div className="rr-notice">
            <div className="rr-notice-tag">
              <span className="rr-loading-pulse" aria-hidden /> Decode running
            </div>
            <p>
              Running the forensic decode against our Base node. This usually takes
              under a minute — flags will appear here automatically.
            </p>
            <div className="rr-steps">
              <span>Fetching transfers</span>
              <span>Classifying behavior</span>
              <span>Deriving flags</span>
            </div>
          </div>
        )}

        {/* ── rate limited ────────────────────────────────────────────── */}
        {state.kind === 'rate_limited' && (
          <div className="rr-notice rr-notice--amber">
            <div className="rr-notice-tag">Rate limited</div>
            <p>
              Too many checks from this address right now. Wait a moment, then
              retry — checks are free, just throttled to keep the node honest.
            </p>
            <button className="press-btn press-btn--ghost" onClick={() => load()}>
              Retry
            </button>
          </div>
        )}

        {/* ── error ───────────────────────────────────────────────────── */}
        {state.kind === 'error' && (
          <div className="rr-notice rr-notice--danger">
            <div className="rr-notice-tag">Check failed</div>
            <p>{state.message}</p>
            <button className="press-btn press-btn--ghost" onClick={() => load()}>
              Retry
            </button>
          </div>
        )}

        {/* ── no_history ──────────────────────────────────────────────── */}
        {state.kind === 'no_history' && (
          <>
            <div className="rr-notice">
              <div className="rr-notice-tag">No on-chain history</div>
              <p>
                This address has no transactions and no token transfers on Base.
                There is nothing on-chain to check yet.
              </p>
              <Link href="/" className="press-btn press-btn--ghost">
                ← Check another address
              </Link>
            </div>
            <div className="rr-block">
              <HonestDisclaimer text={DISCLAIMER} />
            </div>
          </>
        )}

        {/* ── teaser (novel address, NO flags yet) ────────────────────── */}
        {state.kind === 'teaser' && (
          <>
            <div className="rr-block">
              <span className="press-label">Public stats</span>
              <h2 className="rr-h2 press-display">Has history. Decoding now.</h2>
              <p className="rr-lede">
                The full forensic decode is running against our own Base node —
                flags appear below automatically when it finishes. Here is the cheap
                public snapshot meanwhile. No flags are shown until the decode
                completes.
              </p>
              <div className="rr-stats">
                <Stat label="txs" value={fmtNum(state.teaser.public_stats.tx_count, 0)} unit="transactions" />
                <Stat label="eth.balance" value={fmtNum(state.teaser.public_stats.eth_balance)} unit="eth" />
                <Stat label="usdc.balance" value={fmtNum(state.teaser.public_stats.usdc_balance, 2)} unit="usdc" />
                <Stat label="tokens.held" value={fmtNum(state.teaser.public_stats.token_count, 0)} unit="assets" />
                <Stat
                  label="counterparties.30d"
                  value={fmtNum(state.teaser.public_stats.unique_counterparties_30d, 0)}
                  unit="lower bound"
                />
                <Stat
                  label="acp.agent"
                  value={state.teaser.public_stats.is_acp_agent ? 'yes' : 'no'}
                  unit="virtuals acp"
                />
              </div>
            </div>

            <div className="rr-block">
              <div className="rr-notice">
                <div className="rr-notice-tag">
                  <span className="rr-loading-pulse" aria-hidden /> Decode running
                </div>
                <p>
                  Running the full forensic decode against our own Base node now —
                  reading transfers, classifying behavior, deriving flags with
                  on-chain evidence. Flags appear here automatically, usually under
                  a minute. The result becomes a free, public, shareable report.
                </p>
                <button className="press-btn press-btn--ghost" onClick={() => load()}>
                  ↻ Refresh
                </button>
              </div>
            </div>

            <div className="rr-block">
              <NotAssessedTeaserNote />
              <div className="rr-block">
                <HonestDisclaimer text={DISCLAIMER} />
              </div>
            </div>
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

        <Colophon />
      </div>

      <ReportStyles />
    </PressShell>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rr-stat">
      <span className="rr-stat-label">{label}</span>
      <span className="rr-stat-value mono">{value}</span>
      <span className="rr-stat-unit">{unit}</span>
    </div>
  );
}

/** A short note shown under the teaser so the no-flags state is never read as a
 * clearance even before the decode runs. */
function NotAssessedTeaserNote() {
  return (
    <div className="rr-na">
      <div className="rr-na-tag">Before you trust this snapshot</div>
      <p className="rr-na-lede">
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
        <div className="rr-block">
          <div className="rr-stale">
            <div className="rr-stale-head">
              <span className="rr-chip rr-chip--amber">Stale</span>
              <span>
                This report is past its freshness window. It is served as-is,
                flagged stale — never presented as current.
              </span>
            </div>
            <button
              className="press-btn press-btn--ghost"
              onClick={onRecheck}
              disabled={recheckLoading}
            >
              {recheckLoading ? 'Re-checking…' : 'Re-check (free) →'}
            </button>
          </div>
        </div>
      )}

      <div className="rr-block">
        <BandSummary band={report.band} flags={report.flags} />
      </div>

      <div className="rr-block">
        <span className="press-label">Exhibits</span>
        <h2 className="rr-h2 press-display">On-chain signals</h2>
        <FlagList flags={report.flags} />
      </div>

      {/* The single, serious upsell — a document artifact, not a pricing card. */}
      <div className="rr-block">
        <BriefOffer variant="document" />
      </div>

      <div className="rr-block">
        <FreshnessStamp freshness={report.freshness} />
        <p className="rr-classifier mono">
          classifier v{report.classifier_version} · {report.view_count}{' '}
          {report.view_count === 1 ? 'view' : 'views'}
        </p>
      </div>

      <div className="rr-block">
        <NotAssessed items={report.not_assessed} />
      </div>

      <div className="rr-block">
        <HonestDisclaimer text={report.disclaimer} />
      </div>

      <div className="rr-block">
        <Link href="/reports" className="press-link">
          ← Browse the public record
        </Link>
      </div>
    </>
  );
}

function ReportStyles() {
  return (
    <style>{`
      .rr-hero {
        padding: 40px 0 22px;
        border-bottom: 3px double var(--rule-strong);
      }
      .rr-subject {
        margin-top: 14px;
        font-size: clamp(16px, 2.6vw, 26px);
        color: var(--ink);
        word-break: break-all;
        line-height: 1.3;
      }
      .rr-hero-note {
        margin-top: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 11px;
        letter-spacing: 0.04em;
        color: var(--ink-faint);
      }
      .rr-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 9px;
        border: 1px solid var(--rule-strong);
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }
      .rr-chip--amber { color: var(--sev-medium); border-color: var(--sev-medium); }
      .rr-chip--fresh { color: var(--seal); border-color: var(--seal); }

      .rr-block { padding-top: 40px; }
      .rr-h2 {
        margin: 8px 0 20px;
        font-size: clamp(24px, 3.4vw, 34px);
      }
      .rr-lede {
        margin: 8px 0 24px;
        font-family: var(--font-text);
        font-size: 18px;
        line-height: 1.55;
        color: var(--ink-soft);
        max-width: 640px;
      }

      .rr-loading {
        margin-top: 40px;
        display: inline-flex;
        align-items: center;
        gap: 12px;
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 13px;
        letter-spacing: 0.04em;
        color: var(--ink-soft);
      }
      .rr-loading-pulse {
        width: 8px;
        height: 8px;
        background: var(--oxblood);
        border-radius: 50%;
        animation: rr-pulse 1.4s ease-in-out infinite;
        display: inline-block;
      }
      @keyframes rr-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.85); }
      }

      .rr-notice {
        margin-top: 40px;
        border: 1px solid var(--rule-strong);
        background: var(--paper-2);
        padding: 26px 28px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        align-items: flex-start;
      }
      .rr-notice p {
        margin: 0;
        font-family: var(--font-text);
        font-size: 17px;
        line-height: 1.55;
        color: var(--ink-soft);
        max-width: 600px;
      }
      .rr-notice code {
        font-family: var(--font-mono), ui-monospace, monospace;
        color: var(--oxblood);
        background: var(--oxblood-wash);
        border: 1px solid var(--rule);
        padding: 1px 6px;
        font-size: 0.85em;
      }
      .rr-notice-tag {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ink-faint);
      }
      .rr-notice--danger { border-color: var(--oxblood); }
      .rr-notice--danger .rr-notice-tag { color: var(--oxblood); }
      .rr-notice--amber { border-color: var(--sev-medium); }
      .rr-notice--amber .rr-notice-tag { color: var(--sev-medium); }
      .rr-steps {
        display: flex;
        gap: 18px;
        flex-wrap: wrap;
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 11px;
        letter-spacing: 0.06em;
        color: var(--ink-faint);
      }
      .rr-steps span::before { content: '§ '; color: var(--oxblood); }

      .rr-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1px;
        background: var(--rule);
        border: 1px solid var(--rule);
      }
      .rr-stat {
        background: var(--paper);
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .rr-stat-label {
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--ink-faint);
      }
      .rr-stat-value {
        font-size: 26px;
        line-height: 1;
        color: var(--ink);
      }
      .rr-stat-unit {
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ink-faint);
      }
      @media (max-width: 720px) { .rr-stats { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 460px) { .rr-stats { grid-template-columns: 1fr; } }

      .rr-stale {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 18px 22px;
        border: 1px solid var(--sev-medium);
        background: var(--paper-2);
        flex-wrap: wrap;
      }
      .rr-stale-head {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        font-family: var(--font-text);
        font-size: 15px;
        color: var(--ink-soft);
        line-height: 1.5;
        max-width: 640px;
      }

      /* Band summary */
      .rr-band {
        border: 1px solid var(--rule-strong);
        border-top: 3px double var(--rule-strong);
        background: var(--paper-2);
        padding: 26px 28px;
        position: relative;
      }
      .rr-band-head {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .rr-band-tag {
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ink-faint);
      }
      .rr-band-label {
        font-family: var(--font-display), Georgia, serif;
        font-size: 22px;
        font-style: italic;
        color: var(--ink);
        font-variation-settings: "opsz" 40, "SOFT" 40;
      }
      .rr-band-desc {
        margin: 16px 0 0;
        font-family: var(--font-text);
        font-size: 16px;
        line-height: 1.55;
        color: var(--ink-soft);
        max-width: 600px;
      }
      .rr-counts {
        margin-top: 18px;
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .rr-sev {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border: 1px solid currentColor;
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .rr-sev--high { color: var(--sev-high); }
      .rr-sev--medium { color: var(--sev-medium); }
      .rr-sev--low { color: var(--sev-low); }
      .rr-sev--info { color: var(--sev-info); }
      .rr-count-zero {
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 13px;
        color: var(--ink-soft);
      }

      /* Flag list — exhibits */
      .rr-flags { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
      .rr-flag {
        position: relative;
        border: 1px solid var(--rule);
        border-left: 3px solid var(--rule-strong);
        background: var(--paper);
        padding: 20px 22px;
      }
      .rr-flag--high { border-left-color: var(--sev-high); }
      .rr-flag--medium { border-left-color: var(--sev-medium); }
      .rr-flag--low { border-left-color: var(--sev-low); }
      .rr-flag--info { border-left-color: var(--sev-info); }
      .rr-flag-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .rr-flag-title {
        font-family: var(--font-display), Georgia, serif;
        font-size: 19px;
        color: var(--ink);
        letter-spacing: -0.01em;
        font-variation-settings: "opsz" 40, "SOFT" 0;
      }
      .rr-flag-evidence {
        margin: 12px 0 0;
        font-family: var(--font-text);
        font-size: 16px;
        line-height: 1.6;
        color: var(--ink-soft);
        max-width: 660px;
      }
      .rr-flag-source {
        display: inline-block;
        margin-top: 12px;
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 11px;
        letter-spacing: 0.04em;
        color: var(--oxblood);
        text-decoration: none;
        border-bottom: 1px solid transparent;
      }
      .rr-flag-source:hover { border-bottom-color: var(--oxblood); }
      .rr-flag-id {
        position: absolute;
        top: 16px;
        right: 18px;
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.06em;
        color: var(--rule-strong);
      }
      .rr-noflags {
        border: 1px solid var(--rule-strong);
        background: var(--paper);
        padding: 26px 28px;
      }
      .rr-noflags-mark {
        font-family: var(--font-mono), ui-monospace, monospace;
        color: var(--oxblood);
        font-size: 13px;
      }
      .rr-noflags p {
        margin: 8px 0 0;
        font-family: var(--font-display), Georgia, serif;
        font-size: 22px;
        line-height: 1.3;
        color: var(--ink);
        font-variation-settings: "opsz" 40, "SOFT" 0;
      }
      .rr-noflags-note {
        display: block;
        margin-top: 12px;
        font-family: var(--font-text);
        font-size: 15px;
        line-height: 1.55;
        color: var(--ink-soft);
      }

      /* Freshness stamp */
      .rr-fresh {
        display: flex;
        gap: 40px;
        flex-wrap: wrap;
        padding: 18px 22px;
        border: 1px solid var(--rule);
        background: var(--paper-2);
      }
      .rr-fresh-item { display: flex; flex-direction: column; gap: 8px; }
      .rr-fresh-key {
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--ink-faint);
      }
      .rr-fresh-val {
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 14px;
        color: var(--ink);
        font-variant-numeric: tabular-nums;
      }
      .rr-classifier {
        margin-top: 14px;
        font-size: 11px;
        letter-spacing: 0.04em;
        color: var(--ink-faint);
      }

      /* Not assessed */
      .rr-na {
        border: 1px solid var(--rule);
        border-top: 2px solid var(--rule-strong);
        background: var(--paper);
        padding: 24px 26px;
      }
      .rr-na-tag {
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ink-faint);
        margin-bottom: 12px;
      }
      .rr-na-lede {
        margin: 0 0 16px;
        font-family: var(--font-text);
        font-size: 16px;
        line-height: 1.55;
        color: var(--ink-soft);
        max-width: 620px;
      }
      .rr-na-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
      .rr-na-list li {
        position: relative;
        padding-left: 22px;
        font-family: var(--font-text);
        font-size: 15px;
        line-height: 1.5;
        color: var(--ink-soft);
      }
      .rr-na-list li::before { content: '—'; position: absolute; left: 0; color: var(--oxblood); }

      /* Disclaimer */
      .rr-disclaimer {
        border: 1px dashed var(--rule-strong);
        padding: 18px 22px;
        font-family: var(--font-mono), ui-monospace, monospace;
        font-size: 12px;
        line-height: 1.7;
        color: var(--ink-faint);
        max-width: 720px;
      }

      @media (max-width: 520px) {
        .rr-fresh { gap: 18px 32px; }
      }
    `}</style>
  );
}
