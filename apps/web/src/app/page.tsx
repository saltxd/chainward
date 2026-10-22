/**
 * Home has two doors. People: paste a wallet or a Base token and get the answer
 * free, with the newest findings, dated, right under the check so a visitor can
 * see the site is alive. Businesses (reward programs, launchpads, wallets, bots):
 * a free first check, then a regular one, quoted per program. Then the quiet
 * Intel Brief offer, how to read a report, and the recent wallet checks.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon, BriefOffer, OnTheRecord } from '@/components/press';
import { getAllDecodes } from '@/lib/decodes';
import { watchWalletHref } from '@/lib/watch';
import { DEFAULT_OG_IMAGE, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '@/lib/siteCopy';
import { CheckForm } from './_check/check-form';
import { RecentlyChecked } from './_check/recently-checked';

// The home page owns the site's canonical URL; the root layout sets none, so
// other pages don't inherit it.
export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: 'ChainWard',
    url: `${SITE_URL}/`,
    type: 'website',
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@chainwardai',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE.url],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'ChainWard',
  applicationCategory: 'SecurityApplication',
  operatingSystem: 'Web',
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: {
    '@type': 'Organization',
    name: 'ChainWard',
    url: 'https://chainward.ai',
  },
};

/** "Oct 22": the day a finding was published, short enough to read at a glance. */
function shortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`;
}

const PRINCIPLES = [
  {
    k: 'Pay means nothing turned up',
    v: "Pay means we found nothing on-chain against paying in the last 30 days (14 on BNB Chain). It isn't a guarantee, so for a big payment, start small.",
  },
  {
    k: 'Hold means look closer',
    v: 'Hold means something should make you stop, like USDC left sitting in a wallet that has gone quiet. The report names it.',
  },
  {
    k: 'Check it yourself',
    v: 'Every finding links to the on-chain record, so you can see the transactions behind it.',
  },
  {
    k: 'Free and public',
    v: 'Every check on the site is free. The first check of an address files a public report you can share.',
  },
  {
    k: 'What we cannot see',
    v: "Promises made off-chain, private deals, or what someone intends. We only read what the chain shows.",
  },
];

export default async function CheckHomePage({
  searchParams,
}: {
  searchParams: Promise<{ chain?: string | string[] }>;
}) {
  const featuredDecodes = getAllDecodes().slice(0, 3);
  // `/?chain=bsc` preselects the chain toggle (the report page links back here).
  const { chain } = await searchParams;
  const initialChain = Array.isArray(chain) ? chain[0] : chain;

  return (
    <PressShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PressDateline />

      <div className="press-wrap">
        <Masthead />

        {/* Door one, for people: paste it, get the answer free. */}
        <section className="home-hero">
          <div className="home-hero-lead">
            <div className="press-fileno">
              Free check <span className="ph-dateline-sep">·</span> Base and BNB Chain
            </div>
            <h1 className="home-title press-display">
              About to buy a token or pay a wallet? Paste the address first.
            </h1>
            <p className="home-kicker press-kicker">
              Free, and back in about a minute.
            </p>
            <ul className="home-points">
              <li>
                <strong>A wallet:</strong> we answer Pay or Hold, with the reason.
              </li>
              <li>
                <strong>A Base token:</strong> the{' '}
                <Link href="/rugcheck" className="press-link">
                  rug check
                </Link>{' '}
                shows who launched it and whether they dumped it.
              </li>
              <li>We only read the public blockchain record, and every answer links to it.</li>
            </ul>
          </div>

          <div className="home-intake-row">
            <CheckForm initialChain={initialChain} />
            <aside className="home-stamp">
              <div className="press-stamp" aria-hidden>
                <span className="press-stamp-lead">On-Chain Behavior Only</span>
                <span className="press-stamp-sub">Verdict · Evidence · Sources</span>
              </div>
              <p className="home-stamp-note">
                Pay means nothing was found against paying in the window checked. It is
                not a clearance of the counterparty.
              </p>
            </aside>
          </div>
        </section>

        {/* What we found lately, dated, so a visitor can see the site is alive. */}
        <section className="home-latest" aria-label="Latest findings">
          <div className="home-latest-head">
            <span className="press-label">Latest findings</span>
            <Link href="/decodes" className="press-link">
              All findings →
            </Link>
          </div>
          {featuredDecodes.length > 0 && (
            <ol className="home-filings">
              {featuredDecodes.map((d) => (
                <li key={d.slug} className="home-filing">
                  <Link href={`/decodes/${d.slug}`} className="home-filing-link">
                    <time className="home-filing-date mono" dateTime={d.date}>
                      {shortDate(d.date)}
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
        </section>

        <hr className="press-rule" />

        {/* Door two, for businesses: a free first check, then a regular one. */}
        <section className="home-door" aria-label="For businesses">
          <h2 className="home-h2 press-display">Running a reward program or a platform?</h2>
          <div className="home-door-grid">
            <div className="home-door-card">
              <h3 className="home-door-title press-display">Reward programs</h3>
              <p className="home-door-copy">
                Points, airdrops, referral or trading rewards: send us your program or your
                payout list and we run a free first check for farmed wallets, with the
                on-chain evidence for each one. If it helps, we check every payout list
                before it goes out.
              </p>
              <p className="home-door-proof">
                What a check finds:{' '}
                <Link href="/decodes/termix-on-chain" className="press-link">
                  99% of TermiX&apos;s job fees came from wallets hiring each other
                </Link>
                .
              </p>
            </div>
            <div className="home-door-card">
              <h3 className="home-door-title press-display">Launchpads, wallets and trading bots</h3>
              <p className="home-door-copy">
                Warn your users before they buy. A free first check of your last week of
                launches: which launch wallets dumped, and which launch dozens of tokens a
                day. If it helps, get it as a daily feed or through our API.
              </p>
              <p className="home-door-proof">
                See it on one token:{' '}
                <Link href="/rugcheck" className="press-link">
                  the free rug check
                </Link>
                .
              </p>
            </div>
          </div>
          <p className="home-door-terms">
            Quoted per program, paid on delivery.{' '}
            <a href="mailto:hello@chainward.ai?subject=Free%20first%20check" className="press-link">
              Ask for a free first check: hello@chainward.ai →
            </a>
          </p>
        </section>

        <hr className="press-rule" />

        {/* The paid brief, right after the free checks it upgrades */}
        <div className="home-offer">
          <BriefOffer
            placement="landing-document"
            title="Need more than a list of flags?"
            lede="Every check above is free. The Intel Brief is the full investigation on one wallet: we trace where the money goes, test every public claim against on-chain evidence, and hand you a written brief you can cite."
          />
        </div>

        <hr className="press-rule" />

        {/* Statement of method: the honest framing, as an editorial policy */}
        <section className="home-policy">
          <div className="home-policy-head">
            <h2 className="home-h2 press-display">How to read a report</h2>
            <p className="home-policy-lede">
              Every report opens with one answer: Pay or Hold. If there isn&apos;t enough
              recent history to judge, it says so (Inactive or No track record) instead
              of guessing. Below the answer: the reason, and what we checked to get there.
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

        {/* The latest public wallet checks: last 14 days, hidden when there are none. */}
        <section className="home-recent" aria-label="Recent wallet checks">
          <RecentlyChecked />
          <OnTheRecord />
          <div className="home-casebook-links">
            <Link href="/decodes" className="press-link">
              All findings →
            </Link>
            <Link href="/reports" className="press-link">
              The public record →
            </Link>
            {/* Signed-out visitors go through /login and come back to the form. */}
            <a href={watchWalletHref()} className="press-link">
              Run an agent? Watch it free →
            </a>
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
          font-size: clamp(36px, 5.6vw, 68px);
          line-height: 1.08;
          letter-spacing: -0.01em;
        }
        .home-kicker {
          margin: 14px 0 0;
          font-size: clamp(22px, 3vw, 34px);
          line-height: 1.15;
        }
        .home-points {
          margin: 22px 0 0;
          padding: 0;
          list-style: none;
          font-family: var(--font-text);
          font-size: 19px;
          line-height: 1.5;
          color: var(--ink-soft);
          max-width: 640px;
        }
        .home-points li {
          position: relative;
          padding: 5px 0 5px 20px;
        }
        .home-points li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0.8em;
          width: 7px;
          height: 7px;
          background: var(--oxblood);
        }
        .home-points strong { color: var(--ink); font-weight: 640; }
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
          .home-stamp { flex-direction: row; align-items: center; padding-top: 0; flex-wrap: wrap; }
        }
        @media (max-width: 480px) {
          .home-stamp { flex-direction: column; align-items: flex-start; }
        }

        .home-h2 {
          font-size: clamp(24px, 3.4vw, 34px);
          margin: 0;
        }
        .home-offer {
          padding: 36px 0;
        }
        .home-policy {
          padding: 44px 0;
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 48px;
        }
        .home-policy-lede {
          margin: 14px 0 0;
          font-family: var(--font-text);
          font-size: 17px;
          line-height: 1.55;
          color: var(--ink-soft);
        }
        @media (max-width: 780px) {
          .home-policy {
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

        .home-latest {
          padding: 0 0 36px;
        }
        .home-latest-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          padding-top: 20px;
          border-top: 1px solid var(--rule);
        }

        .home-door {
          padding: 44px 0;
        }
        .home-door-grid {
          margin-top: 24px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 28px;
        }
        .home-door-card {
          border: 1px solid var(--rule);
          padding: 22px 24px;
        }
        .home-door-title {
          margin: 0;
          font-size: 24px;
          line-height: 1.1;
        }
        .home-door-copy {
          margin: 12px 0 0;
          font-family: var(--font-text);
          font-size: 17px;
          line-height: 1.55;
          color: var(--ink-soft);
        }
        .home-door-proof {
          margin: 12px 0 0;
          font-family: var(--font-text);
          font-size: 15px;
          line-height: 1.5;
          color: var(--ink-soft);
        }
        .home-door-terms {
          margin: 24px 0 0;
          display: flex;
          flex-wrap: wrap;
          gap: 8px 18px;
          align-items: baseline;
          font-family: var(--font-text);
          font-size: 17px;
          color: var(--ink);
        }
        @media (max-width: 780px) {
          .home-door-grid { grid-template-columns: 1fr; }
        }

        .home-recent {
          padding: 0 0 44px;
        }
      `}</style>
    </PressShell>
  );
}
