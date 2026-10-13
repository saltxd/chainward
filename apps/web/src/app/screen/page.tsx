import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';

// One offer, sold by email: check a list of wallets before paying them. Fulfilled
// by hand with the funding-trace scripts behind the decodes; nothing is published.

const TITLE = 'Check a payout list before you pay it';
const DESCRIPTION =
  'Before you send rewards, cashback or an airdrop, send ChainWard the wallet list. We flag the wallets that share a funder, with the transactions behind each group, and any OFAC sanctions hits. The first 500 wallets of your first list are free.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://chainward.ai/screen' },
  openGraph: { title: TITLE, description: DESCRIPTION, images: [{ url: '/chainward-og-card.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/chainward-og-card.png'] },
};

const CONTACT = 'hello@chainward.ai';

export default function ScreenPage() {
  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <article className="da">
          <header className="da-header press-measure">
            <div className="press-fileno">
              Services <span className="ph-dateline-sep">·</span> By email
            </div>
            <h1 className="da-title press-display">{TITLE}</h1>
            <p className="da-sub">
              Paying rewards, cashback or an airdrop to a list of wallets? Send us the list first. We tell
              you which wallets share a funder, with the transactions that link each group, and which are
              on the US sanctions list (OFAC). We don&apos;t publish or share your list.
            </p>
          </header>

          <div className="da-body press-measure">
            <div className="decode-prose">
              <h2>What you send</h2>
              <p>
                A CSV with one wallet address per line, and the chain: Base or BNB Chain. Email it to{' '}
                <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
              </p>

              <h2>What you get, within 48 hours</h2>
              <ul>
                <li>Groups of wallets that share a funder, each with the transactions that link them.</li>
                <li>Any wallet on the OFAC sanctions list.</li>
                <li>A one-page summary: how many wallets, how many groups, and which to look at first.</li>
              </ul>

              <h2>Price</h2>
              <p>
                The first 500 wallets of your first list are free. After that, $0.05 per wallet, $25 minimum, paid in USDC on Base
                (or USDT or USDC on BNB Chain) to the ChainWard treasury once you have the results. No
                account, no subscription.
              </p>

              <h2>Limits</h2>
              <ul>
                <li>
                  A shared funder is not proof that one person controls the wallets. Teams, families and
                  services fund wallets too.
                </li>
                <li>Exchange hot wallets and faucets stop the trace: money that passed through one is not followed further.</li>
                <li>Use the result as a list to review, not an automatic ban list.</li>
                <li>This is on-chain analysis, not compliance advice.</li>
              </ul>

              <h2>How we work</h2>
              <p>
                The same tracing is behind our public decodes: who funded the wallets hiring agents on{' '}
                <Link href="/decodes/termix-on-chain">TermiX</Link>, and who hired whom in{' '}
                <Link href="/decodes/set-and-earn-week-one">Set and Earn&apos;s first week</Link>. Your list
                gets the same tracing, and the results go only to you.
              </p>
              <p>
                Questions, or a list ready to go: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
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
      `}</style>
    </PressShell>
  );
}
