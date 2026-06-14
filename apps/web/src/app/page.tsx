/**
 * Home = the Risk-Check hero. Dead-simple centered input (paste a Base address
 * or @handle), honest framing ("flags, not promises"), a "recently checked"
 * strip from the public library, and featured /decodes as proof. Free-first v1:
 * no payment, no safety verdict — just flags with evidence.
 */

import Link from 'next/link';
import {
  PageShell,
  NavBar,
  StatusTicker,
  SectionHead,
  Button,
  RISK_NAV_LINKS,
} from '@/components/v2';
import { getAllDecodes } from '@/lib/decodes';
import { CheckForm } from './_check/check-form';
import { RecentlyChecked } from './_check/recently-checked';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'ChainWard Risk Check',
  applicationCategory: 'SecurityApplication',
  operatingSystem: 'Web',
  description:
    'Paste a Base address or agent handle and get a forensic on-chain risk report — risk flags from on-chain behavior, with evidence. Free, public, and never a safety verdict.',
  url: 'https://chainward.ai',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: {
    '@type': 'Organization',
    name: 'ChainWard',
    url: 'https://chainward.ai',
  },
};

function formatIsoDate(dateStr: string): string {
  return new Date(dateStr).toISOString().slice(0, 10);
}

const HONEST_POINTS = [
  {
    k: 'flags, not promises',
    v: 'We surface what on-chain behavior shows. We never say an address is safe.',
  },
  {
    k: 'evidence, always',
    v: 'Every flag carries on-chain evidence and a source link. No uncited claims.',
  },
  {
    k: 'free & public',
    v: 'Every check is free. The first check of an address becomes a public, shareable report.',
  },
  {
    k: 'what we cannot see',
    v: 'No off-chain agreements, no social engineering, no intent. Absence of flags is not a guarantee.',
  },
];

export default function CheckHomePage() {
  const featuredDecodes = getAllDecodes().slice(0, 3);

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <StatusTicker />

      <div className="v2-shell">
        <NavBar links={RISK_NAV_LINKS} />

        {/* Hero — the checker */}
        <section className="v2-check-hero">
          <div className="v2-check-kicker">
            <span className="v2-check-kicker-dot" aria-hidden />
            Base mainnet · read from our own node
          </div>
          <h1 className="v2-check-title display">
            Run an on-chain risk check on any Base address.
          </h1>
          <p className="v2-check-tagline serif">Flags, not promises.</p>
          <p className="v2-check-sub">
            Paste a Base address or agent handle. We run a forensic decode from
            our own Base node and return <strong>risk flags</strong> — each with
            on-chain evidence and a source. We never hand out a safety verdict,
            a grade, or a green check.
          </p>

          <CheckForm />

          <RecentlyChecked />
        </section>
      </div>

      <div className="v2-shell">
        {/* 01 — the honest framing */}
        <section className="v2-check-section">
          <SectionHead
            tag="01 / how to read this"
            title={
              <>
                A risk report is a list of signals.
                <br />
                <span className="serif" style={{ color: 'var(--phosphor)' }}>
                  Not a verdict.
                </span>
              </>
            }
            lede="ChainWard reports describe on-chain behavior in a neutral band — low, mixed, elevated, or high signal. That is a count of what surfaced, never a claim that an address is safe or unsafe."
          />
          <div className="v2-check-points">
            {HONEST_POINTS.map((p) => (
              <div key={p.k} className="v2-check-point">
                <div className="v2-check-point-k">{p.k}</div>
                <div className="v2-check-point-v">{p.v}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 02 — featured decodes as proof */}
        <section className="v2-check-section">
          <SectionHead
            tag="02 / proof"
            title={
              <>
                We&apos;ve been doing this by hand.
                <br />
                <span className="serif" style={{ color: 'var(--phosphor)' }}>
                  Now it&apos;s a button.
                </span>
              </>
            }
            lede="The same forensic method behind our published decodes now runs on demand. Read a few to see how we check the chain — claims vs. receipts, fund flows, the gap between the pitch and the ledger."
          />
          {featuredDecodes.length > 0 && (
            <div className="v2-check-decodes">
              {featuredDecodes.map((d) => (
                <Link
                  key={d.slug}
                  href={`/decodes/${d.slug}`}
                  className="v2-check-decode"
                >
                  <time className="v2-check-decode-date" dateTime={d.date}>
                    // {formatIsoDate(d.date)}
                  </time>
                  <h3 className="v2-check-decode-title display">{d.title}</h3>
                  {d.subtitle && (
                    <p className="v2-check-decode-sub serif">{d.subtitle}</p>
                  )}
                  <span className="v2-check-decode-cta">read →</span>
                </Link>
              ))}
            </div>
          )}
          <div className="v2-check-section-cta">
            <Button variant="ghost" href="/decodes">
              all decodes
              <span>→</span>
            </Button>
            <Button variant="ghost" href="/reports">
              report library
            </Button>
          </div>
        </section>

        <footer className="v2-check-footer">
          <div>chainward.ai · on-chain risk flags for base · free &amp; public</div>
          <div className="v2-check-footer-links">
            <Link href="/reports">reports</Link>
            <Link href="/decodes">decodes</Link>
            <Link href="/base">observatory</Link>
            <Link href="/mcp">mcp</Link>
            <Link href="/docs">docs</Link>
            <a
              href="https://x.com/chainwardai"
              target="_blank"
              rel="noopener noreferrer"
            >
              x
            </a>
          </div>
        </footer>
      </div>

      <style>{`
        .v2-check-hero {
          padding-top: 72px;
          padding-bottom: 56px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }
        .v2-check-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--fg-dim);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding-bottom: 22px;
        }
        .v2-check-kicker-dot {
          width: 20px;
          height: 1px;
          background: var(--phosphor);
        }
        .v2-check-title {
          font-size: clamp(38px, 5.6vw, 68px);
          line-height: 1.0;
          letter-spacing: -0.04em;
          color: var(--fg);
          max-width: 880px;
        }
        .v2-check-tagline {
          margin-top: 16px;
          font-size: clamp(20px, 2.4vw, 30px);
          line-height: 1.1;
          color: var(--phosphor);
        }
        .v2-check-sub {
          margin-top: 26px;
          font-size: 14px;
          line-height: 1.7;
          color: var(--fg-dim);
          max-width: 600px;
        }
        .v2-check-sub strong { color: var(--fg); font-weight: 500; }
        .v2-check-section {
          padding: 72px 0;
          border-top: 1px solid var(--line);
        }
        .v2-check-points {
          margin-top: 8px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1px;
          background: var(--line);
          border: 1px solid var(--line);
        }
        @media (max-width: 720px) {
          .v2-check-points { grid-template-columns: 1fr; }
        }
        .v2-check-point {
          background: var(--bg-1);
          padding: 22px 24px;
        }
        .v2-check-point-k {
          font-size: 11px;
          color: var(--phosphor);
          letter-spacing: 0.08em;
          text-transform: lowercase;
          margin-bottom: 10px;
        }
        .v2-check-point-v {
          font-size: 13px;
          line-height: 1.7;
          color: var(--fg-dim);
        }
        .v2-check-decodes {
          margin-top: 8px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 880px) {
          .v2-check-decodes { grid-template-columns: 1fr; }
        }
        .v2-check-decode {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 24px;
          border: 1px solid var(--line);
          background: var(--bg-1);
          text-decoration: none;
          transition: border-color 0.15s, background 0.15s;
          min-height: 180px;
        }
        .v2-check-decode:hover {
          border-color: var(--phosphor-dim);
          background: var(--bg-2);
        }
        .v2-check-decode-date {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--phosphor);
        }
        .v2-check-decode-title {
          font-size: 20px;
          line-height: 1.1;
          color: var(--fg);
          margin: 0;
          letter-spacing: -0.02em;
        }
        .v2-check-decode-sub {
          font-size: 14px;
          line-height: 1.35;
          color: var(--fg-dim);
          margin: 0;
        }
        .v2-check-decode-cta {
          margin-top: auto;
          padding-top: 12px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          color: var(--phosphor);
          letter-spacing: 0.04em;
        }
        .v2-check-decode:hover .v2-check-decode-cta { color: var(--fg); }
        .v2-check-section-cta {
          margin-top: 28px;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .v2-check-footer {
          border-top: 1px solid var(--line);
          padding: 24px 0 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: var(--muted);
          flex-wrap: wrap;
          gap: 16px;
        }
        .v2-check-footer a {
          color: var(--fg-dim);
          text-decoration: none;
          transition: color 0.15s;
        }
        .v2-check-footer a:hover { color: var(--phosphor); }
        .v2-check-footer-links {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
        }
        @media (max-width: 480px) {
          .v2-check-hero { padding-top: 40px; padding-bottom: 36px; }
          .v2-check-section { padding: 48px 0; }
        }
      `}</style>
    </PageShell>
  );
}
