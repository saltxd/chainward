/**
 * Home = the Risk-Check intake, filed like a forensic dossier. The intake form
 * is the hero (paste a Base address or @handle), framed by the honest
 * positioning ("flags, not promises"), a "recently filed" strip, a quiet paid
 * Intel Brief offer, and featured /decodes as proof. Free-first: no safety
 * verdict — just flags with evidence.
 */

import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon, BriefOffer } from '@/components/press';
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

const PRINCIPLES = [
  {
    k: 'Flags, not promises',
    v: 'We surface what on-chain behavior shows. We never say an address is safe.',
  },
  {
    k: 'Evidence, always',
    v: 'Every flag carries on-chain evidence and a source link. No uncited claims.',
  },
  {
    k: 'Free & public',
    v: 'Every check is free. The first check of an address files a public, shareable report.',
  },
  {
    k: 'What we cannot see',
    v: 'No off-chain agreements, no social engineering, no intent. Absence of flags is not a guarantee.',
  },
];

export default function CheckHomePage() {
  const featuredDecodes = getAllDecodes().slice(0, 3);

  return (
    <PressShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PressDateline />

      <div className="press-wrap">
        <Masthead />

        {/* Hero — the intake document */}
        <section className="home-hero">
          <div className="home-hero-lead">
            <div className="press-fileno">
              File № CW-∎ <span className="ph-dateline-sep">·</span> Forensic risk intake
            </div>
            <h1 className="home-title press-display">
              Run an on-chain risk check on any Base address.
            </h1>
            <p className="home-kicker press-kicker">Flags, not promises.</p>
            <p className="home-lede">
              Paste a Base address or agent handle. We run a forensic decode from
              our own Base node and return <strong>risk flags</strong> — each with
              on-chain evidence and a source. We never hand out a safety verdict, a
              grade, or a green check.
            </p>
          </div>

          <div className="home-intake-row">
            <CheckForm />
            <aside className="home-stamp">
              <div className="press-stamp" aria-hidden>
                <span className="press-stamp-lead">No Safety Verdict</span>
                <span className="press-stamp-sub">Flags · Evidence · Sources</span>
              </div>
              <p className="home-stamp-note">
                A report is a list of signals — read it like evidence, not a
                clearance.
              </p>
            </aside>
          </div>

          <RecentlyChecked />
        </section>

        <hr className="press-rule" />

        {/* Quiet paid-brief offer, immediately after the hero */}
        <BriefOffer variant="line" />

        <hr className="press-rule" />

        {/* Statement of method — the honest framing, as an editorial policy */}
        <section className="home-policy">
          <div className="home-policy-head">
            <h2 className="home-h2 press-display">How to read a report</h2>
            <p className="home-policy-lede">
              ChainWard describes on-chain behavior in a neutral band — low, mixed,
              elevated, or high signal. That is a count of what surfaced, never a
              claim that an address is safe or unsafe.
            </p>
          </div>
          <dl className="home-principles">
            {PRINCIPLES.map((p) => (
              <div key={p.k} className="home-principle">
                <dt className="home-principle-k">{p.k}</dt>
                <dd className="home-principle-v">{p.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <hr className="press-rule" />

        {/* Proof — featured decodes as a casebook */}
        <section className="home-casebook">
          <div className="home-casebook-head">
            <h2 className="home-h2 press-display">From the casebook</h2>
            <p className="home-casebook-lede">
              We&apos;ve been checking the chain by hand — claims against receipts,
              fund flows, the gap between the pitch and the ledger. Now that method
              runs on a button. Read a few filings to see how we work.
            </p>
          </div>

          {featuredDecodes.length > 0 && (
            <ol className="home-filings">
              {featuredDecodes.map((d) => (
                <li key={d.slug} className="home-filing">
                  <Link href={`/decodes/${d.slug}`} className="home-filing-link">
                    <time className="home-filing-date mono" dateTime={d.date}>
                      {formatIsoDate(d.date)}
                    </time>
                    <div className="home-filing-body">
                      <h3 className="home-filing-title press-display">{d.title}</h3>
                      {d.subtitle && (
                        <p className="home-filing-sub">{d.subtitle}</p>
                      )}
                    </div>
                    <span className="home-filing-read">Read →</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}

          <div className="home-casebook-links">
            <Link href="/decodes" className="press-link">
              All decodes →
            </Link>
            <Link href="/reports" className="press-link">
              The public record →
            </Link>
          </div>
        </section>

        <Colophon />
      </div>

      <style>{`
        .home-hero {
          padding: 44px 0 40px;
        }
        .home-hero-lead {
          max-width: 820px;
        }
        .home-title {
          margin: 18px 0 0;
          font-size: clamp(40px, 6.4vw, 78px);
          line-height: 0.98;
          letter-spacing: -0.03em;
        }
        .home-kicker {
          margin: 14px 0 0;
          font-size: clamp(22px, 3vw, 34px);
          line-height: 1;
        }
        .home-lede {
          margin: 24px 0 0;
          font-family: var(--font-text);
          font-size: 19px;
          line-height: 1.55;
          color: var(--ink-soft);
          max-width: 620px;
        }
        .home-lede strong { color: var(--ink); font-weight: 640; }
        .home-intake-row {
          margin-top: 36px;
          display: flex;
          gap: 40px;
          align-items: flex-start;
        }
        .home-stamp {
          flex: 1;
          padding-top: 18px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          align-items: flex-start;
        }
        .home-stamp-note {
          margin: 0;
          font-family: var(--font-text);
          font-style: italic;
          font-size: 16px;
          line-height: 1.5;
          color: var(--ink-soft);
          max-width: 260px;
        }
        @media (max-width: 860px) {
          .home-intake-row { flex-direction: column; gap: 28px; }
          .home-stamp { flex-direction: row; align-items: center; padding-top: 0; }
        }
        @media (max-width: 480px) {
          .home-stamp { flex-direction: column; align-items: flex-start; }
        }

        .home-h2 {
          font-size: clamp(24px, 3.4vw, 34px);
          margin: 0;
        }
        .home-policy, .home-casebook {
          padding: 44px 0;
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 48px;
        }
        .home-policy-lede, .home-casebook-lede {
          margin: 14px 0 0;
          font-family: var(--font-text);
          font-size: 17px;
          line-height: 1.55;
          color: var(--ink-soft);
        }
        @media (max-width: 780px) {
          .home-policy, .home-casebook {
            grid-template-columns: 1fr;
            gap: 24px;
          }
        }

        .home-principles {
          margin: 0;
          padding: 0;
        }
        .home-principle {
          padding: 16px 0;
          border-top: 1px solid var(--rule);
          display: grid;
          grid-template-columns: 220px 1fr;
          gap: 24px;
          align-items: baseline;
        }
        .home-principle:first-child { border-top: 0; padding-top: 0; }
        .home-principle-k {
          font-family: var(--font-display), Georgia, serif;
          font-style: italic;
          font-size: 20px;
          color: var(--ink);
          font-variation-settings: "opsz" 40, "SOFT" 40;
        }
        .home-principle-v {
          margin: 0;
          font-family: var(--font-text);
          font-size: 16px;
          line-height: 1.55;
          color: var(--ink-soft);
        }
        @media (max-width: 560px) {
          .home-principle { grid-template-columns: 1fr; gap: 6px; }
        }

        .home-filings {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .home-filing {
          border-top: 1px solid var(--rule);
        }
        .home-filing:first-child { border-top: 0; }
        .home-filing-link {
          display: grid;
          grid-template-columns: 120px 1fr auto;
          gap: 24px;
          align-items: baseline;
          padding: 22px 0;
          text-decoration: none;
          color: inherit;
        }
        .home-filing-date {
          font-size: 12px;
          color: var(--ink-faint);
          letter-spacing: 0.04em;
        }
        .home-filing-title {
          font-size: clamp(22px, 2.6vw, 30px);
          line-height: 1.06;
          margin: 0;
          transition: color 0.15s;
        }
        .home-filing-link:hover .home-filing-title { color: var(--oxblood); }
        .home-filing-sub {
          margin: 8px 0 0;
          font-family: var(--font-text);
          font-size: 17px;
          line-height: 1.4;
          color: var(--ink-soft);
        }
        .home-filing-read {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--oxblood);
          white-space: nowrap;
        }
        @media (max-width: 640px) {
          .home-filing-link { grid-template-columns: 1fr; gap: 8px; }
          .home-filing-read { display: none; }
        }
        .home-casebook-links {
          margin-top: 22px;
          display: flex;
          gap: 26px;
          flex-wrap: wrap;
        }
      `}</style>
    </PressShell>
  );
}
