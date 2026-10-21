import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';
import { CheckForm } from '../_check/check-form';

// The rug check for people: paste a Base token, and the report page shows who launched
// it, how, and what the launch wallet did next. Free here; bots and apps pay per call.

const TITLE = 'Rug check for Base tokens';
const DESCRIPTION =
  'Paste a Base token and see who launched it, how, and what the launch wallet did next: whether it sent out its launch tokens within the hour, how many tokens it launched that day, and any mints after launch. Free for people.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://chainward.ai/rugcheck' },
  openGraph: { title: TITLE, description: DESCRIPTION, images: [{ url: '/chainward-og-card.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/chainward-og-card.png'] },
};

export default function RugCheckPage() {
  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <article className="da">
          <header className="da-header press-measure">
            <div className="press-fileno">
              Free tools <span className="ph-dateline-sep">·</span> Rug check
            </div>
            <h1 className="da-title press-display">{TITLE}</h1>
            <p className="da-sub">
              About to buy a new token on Base? Paste its address first. We read who launched it and what the
              launch wallet did next.
            </p>
            <div className="rc-form">
              <CheckForm variant="token" />
            </div>
          </header>

          <div className="da-body press-measure">
            <div className="decode-prose">
              <h2>What it reads</h2>
              <ul>
                <li>Who launched it, and how: through Clanker, through Virtuals, or a direct deploy, with the launch transaction.</li>
                <li>The launch wallet: how new it was, who first funded it, and whether it is on the US sanctions list.</li>
                <li>Whether the launch wallet sent out the tokens it got at launch within the hour, the usual shape of a dump.</li>
                <li>How many tokens the same wallet launched through Clanker in the day up to this one.</li>
                <li>Tokens minted after launch, and how many went to the launch wallet.</li>
              </ul>

              <h2>The answer</h2>
              <p>
                Hold means something should make you stop. Review means look closer before you buy. No flags means none of
                these checks matched, and it is not a guarantee.
              </p>

              <h2>What it does not do</h2>
              <ul>
                <li>It does not test whether you can sell (a honeypot), and it does not read the contract&apos;s code.</li>
                <li>It does not judge the project, the team or the price.</li>
                <li>It reads Base only, for now.</li>
              </ul>

              <h2>For bots and apps</h2>
              <p>
                The same check is <code>GET https://api.chainward.ai/api/risk/rugcheck?address=0x…</code>, $0.02 a call over
                x402, no account needed. <Link href="/docs">Docs</Link>.
              </p>

              <h2>Further reading</h2>
              <p>
                How a copycat of a Clanker token hid a mint where buyers did not look:{' '}
                <Link href="/decodes/clankertoken-honeypot-check">The Honeypot Isn&apos;t in ClankerToken</Link>.
              </p>
            </div>
          </div>
        </article>

        <Colophon />
      </div>

      {/* The decode page's header styles (decodes/[slug]/page.tsx), which live inline there too. */}
      <style>{`
        .da { padding-top: 44px; }
        .da-header {
          padding-bottom: 28px;
          border-bottom: 3px double var(--rule-strong);
          margin-bottom: 40px;
        }
        .da-title {
          margin: 16px 0 0;
          font-size: clamp(30px, 5vw, 52px);
          line-height: 1.08;
          letter-spacing: -0.01em;
        }
        .da-sub {
          margin: 18px 0 0;
          font-family: var(--font-display), Georgia, serif;
          font-style: italic;
          font-size: clamp(20px, 3vw, 27px);
          line-height: 1.3;
          color: var(--ink-soft);
        }
        .rc-form { margin-top: 28px; }
      `}</style>
    </PressShell>
  );
}
