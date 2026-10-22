import Link from 'next/link';
import { getAddress, isAddress } from 'viem';
import { PressShell, Masthead, PressDateline, Colophon, CodeBlock } from '@/components/press';
import { BASE_USDC } from '@/lib/x402Pay';
import { WatchEmailLink, WATCH_CONTACT } from './WatchEmailLink';

// One offer for x402 sellers, sold by email: a stock x402 buyer tries the seller's
// paid endpoints once a day, never paying, and we email the seller when one breaks
// or recovers. The job behind it lives in scripts/x402-watch.

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

// Rendered per request: the treasury address is the API's runtime config (the same
// GET /api/brief/config the Brief checkout pays to), never baked into the build.
export const dynamic = 'force-dynamic';

const TITLE = 'x402 endpoint watch';
const HEADLINE = 'Will a standard x402 buyer be able to pay you tomorrow?';
const DESCRIPTION =
  'Every day a standard x402 buyer tries each of your paid endpoints without paying. The day a payment would fail, or a buyer would sign a payment that stays open for more than a day, we email you what broke and the field to fix. First check free, then $10 a month in USDC on Base.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://chainward.ai/x402/watch' },
  openGraph: { title: HEADLINE, description: DESCRIPTION, images: [{ url: '/chainward-og-card.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: HEADLINE, description: DESCRIPTION, images: ['/chainward-og-card.png'] },
};

/** The treasury from the API's runtime config, checksummed; null when it can't be read. */
async function getTreasury(): Promise<string | null> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/brief/config`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const { treasuryAddress } = (await res.json()) as { treasuryAddress?: unknown };
    return typeof treasuryAddress === 'string' && isAddress(treasuryAddress, { strict: false })
      ? getAddress(treasuryAddress)
      : null;
  } catch {
    return null;
  }
}

// The six problems a stock buyer ran into on 2026-10-21 (five fail the payment, one over-authorizes), with the endpoint counts
// from that run (ops lint summary, outcomes_all_live).
const CHECKS: { plain: string; name: string; oct21: number }[] = [
  {
    plain:
      "Your 402 names its network the old way, like 'base', while it says it is x402 version 2, so the buyer finds no network it can pay on",
    name: 'v1 network names in a v2 challenge',
    oct21: 16,
  },
  {
    plain:
      "The token name or version in your signing details doesn't match the token's contract, so the buyer signs a payment the token will reject",
    name: 'wrong EIP-712 domain in extra.name or extra.version',
    oct21: 12,
  },
  {
    plain:
      'The payment you ask for stays valid for more than a day, so the buyer signs something that could still be collected long after the request',
    name: 'maxTimeoutSeconds over 86,400, or a Unix time in its place',
    oct21: 6,
  },
  {
    plain: 'The token address has no contract behind it, so there is nothing to pay with',
    name: 'asset is not a contract',
    oct21: 3,
  },
  {
    plain: 'The offer is only in the response body, without the header an x402 version 2 buyer reads',
    name: 'v2 challenge without the PAYMENT-REQUIRED header',
    oct21: 2,
  },
  {
    plain: 'The 402 carries no x402 offer at all, as when a host pauses a deployment',
    name: 'no x402 challenge',
    oct21: 2,
  },
];

const SAMPLE_REQUEST = `GET https://api.example.com/v1/quote
user-agent: chainward-x402-lint/1.0 (+https://chainward.ai)
accept: application/json, */*;q=0.5`;

const SAMPLE_RESPONSE = `402 Payment Required
PAYMENT-REQUIRED header, decoded:
  x402Version: 2
  accepts[0].scheme: "exact"
  accepts[0].network: "base"
  accepts[0].amount: "10000"
  accepts[0].asset: 0x833589fC…bdA02913`;

export default async function X402WatchPage() {
  const treasury = await getTreasury();

  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <article className="da">
          <header className="da-header press-measure">
            <div className="press-fileno">
              Services <span className="ph-dateline-sep">·</span> For x402 sellers{' '}
              <span className="ph-dateline-sep">·</span> $10 a month
            </div>
            <h1 className="da-title press-display">{HEADLINE}</h1>
            <p className="da-sub">
              Every day a stock x402 client (@x402/fetch with its default settings) tries each of your paid
              endpoints. It never pays. The day a payment would fail, or a buyer would sign a payment that
              stays open for more than a day, we email you what broke and the field to fix.
            </p>
            <div className="wa-cta">
              <WatchEmailLink placement="watch-hero" className="press-btn">
                Email us your host →
              </WatchEmailLink>
              <span className="wa-cta-note">First check free. Then $10 a month in USDC on Base.</span>
            </div>
          </header>

          <div className="da-body press-measure">
            <div className="decode-prose">
              <h2>Why</h2>
              <p>
                x402 lets a program pay for one API request, usually in USDC, with no account: your server answers{' '}
                <code>402 Payment Required</code> with its price, and the buyer signs a payment and sends the
                request again. If one field in that 402 is wrong, the buyer gives up, and you never get paid for
                the call.
              </p>
              <p>
                On Oct 21, 2026 we pointed a standard buyer (@x402/fetch and @x402/evm 2.27.0, default
                settings) at 1,500 paid endpoints from public x402 catalogs, picked from the 50,102 they list.
                It never paid: we kept each 402 and replayed the payment offline with a throwaway key. 1,391
                endpoints answered with a live 402.
              </p>
              <ul>
                <li>
                  39 of them would make the buyer&apos;s payment fail (33) or have it sign a payment that stays
                  open for more than a day (6). Every one of the 39 sat on a host whose catalog listing already
                  showed a mistake, and it was still broken on Oct 21.
                </li>
                <li>
                  On hosts whose listings showed no mistake, the buyer tried to pay 1,267 endpoints, and none failed on an
                  x402 mistake. The only 2 failures there were paused deployments that answered 402 with no x402
                  offer at all.
                </li>
              </ul>
              <p>
                The sample leaned on purpose toward hosts whose listings showed a problem, so these counts are
                not a rate for x402 as a whole. What they do show: most sellers are fine, and the broken ones
                already showed the mistake in their listing and stayed broken. A catalog listing doesn&apos;t reach your inbox.
                This does.
              </p>

              <h2>What it checks</h2>
              <p>
                Each day the buyer requests each of your endpoints once, without paying, reads the 402 the way
                @x402/fetch does and signs the payment it would send, offline. Then we check that payment
                against the token&apos;s contract on its chain. On Oct 21 it ran into these six problems. Five make the payment fail; the
                sixth has the buyer sign a payment that stays open for more than a day:
              </p>
              <ul className="wa-checks">
                {CHECKS.map((c) => (
                  <li key={c.name}>
                    {c.plain} (<span className="wa-term">{c.name}</span>).{' '}
                    <span className="wa-count">
                      Oct 21: {c.oct21} endpoint{c.oct21 === 1 ? '' : 's'}.
                    </span>
                  </li>
                ))}
              </ul>
              <p>
                We also try each of your offers on its own, as a buyer who pays only on that network, or only in
                that token, would. So a broken offer next to a working one still shows up: a second chain whose
                token name is off, say.
              </p>

              <h2>What you get</h2>
              <ul>
                <li>
                  The first check, free, within a day of your email: each paid endpoint we can find on your host,
                  what the buyer did with it, and the field to fix where it failed.
                </li>
                <li>Then one run a day.</li>
                <li>
                  An email only when something changes: an endpoint breaks, or starts working again. It shows the
                  request we sent, what came back and the fix. A quiet day sends nothing.
                </li>
              </ul>

              <h2>A sample alert</h2>
              <p>What one looks like, for a made-up host:</p>
              <aside className="wa-exhibit" aria-label="Sample alert">
                <span className="press-label">x402 watch · api.example.com · 1 endpoint broke</span>
                <p className="wa-exhibit-lead">
                  At 06:00 UTC our standard buyer requested GET https://api.example.com/v1/quote. The 402 offered
                  only &apos;base&apos; under x402Version 2, so the buyer found no network it could match and
                  stopped. Yesterday it passed. Fix: use the CAIP-2 id &apos;eip155:8453&apos;.
                </p>
                <span className="press-label">Request we sent</span>
                <pre>
                  <code>{SAMPLE_REQUEST}</code>
                </pre>
                <span className="press-label">What came back</span>
                <pre>
                  <code>{SAMPLE_RESPONSE}</code>
                </pre>
              </aside>

              <h2>Price</h2>
              <p>
                $10 a month in USDC on Base, paid after the free first check, and only if you keep the watch. No
                account. To stop, reply to any of our emails.
              </p>

              <h2>How to start</h2>
              <p>
                Email <WatchEmailLink placement="watch-start">{WATCH_CONTACT}</WatchEmailLink> with your host, or
                your <code>/.well-known/x402</code> or <code>openapi.json</code> URL. Already have a fix note
                from us? Reply &apos;start&apos; to it. Your first check comes back within a day.
              </p>
              <div className="wa-cta wa-cta--body">
                <WatchEmailLink placement="watch-start-button" className="press-btn">
                  Email us your host →
                </WatchEmailLink>
              </div>

              <h2>Paying us</h2>
              <p>
                Send USDC on Base (the token at <code>{BASE_USDC}</code>) to the ChainWard treasury:
              </p>
              {treasury ? (
                <>
                  <div className="wa-address">
                    <CodeBlock>{treasury}</CodeBlock>
                  </div>
                  <p>
                    <strong>
                      The only address we use; copy it from this page, never from a transaction history.
                    </strong>{' '}
                    Look-alike addresses that share its first and last characters get planted in payment
                    histories, so check every character. Then reply with the transaction hash, so we can match
                    the payment to your host.
                  </p>
                </>
              ) : (
                <p className="wa-missing">
                  The address could not be loaded just now. Reload this page in a minute, and never copy it from
                  a transaction history.
                </p>
              )}

              <h2>Limits</h2>
              <ul>
                <li>
                  We replay each payment offline with a throwaway key, so we see what the buyer would sign and
                  whether the token would accept it. We can&apos;t see what happens after a payment: your
                  handler, or the uptime of your facilitator (the service that settles the payment on-chain).
                </li>
                <li>
                  Offers on non-EVM chains like Solana, and prices above the stock client&apos;s $1 cap, are
                  reported, not judged.
                </li>
                <li>
                  One unpaid request per endpoint a day, at least 1.2 seconds apart, with the user agent{' '}
                  <code>chainward-x402-lint/1.0 (+https://chainward.ai)</code>. No payment headers, and no
                  redirects followed.
                </li>
                <li>
                  POST endpoints get an empty JSON body. If yours needs a sample request before it answers 402,
                  send us one.
                </li>
              </ul>

              <h2>Who runs it</h2>
              <p>
                ChainWard reads x402 payments on-chain and publishes what it finds: the weekly{' '}
                <Link href="/x402">x402 seller board</Link>, which traces where the buyers of Base&apos;s top
                x402 sellers get their USDC, and our x402 decodes:{' '}
                <Link href="/decodes/x402-on-base">one week of x402 on Base</Link>,{' '}
                <Link href="/decodes/x402-on-base-two-weeks-later">two weeks later</Link>,{' '}
                <Link href="/decodes/x402-closed-six">six wallets paid only by each other</Link> and{' '}
                <Link href="/decodes/x402-top-ten-self-funded">three top-ten sellers that pay their own buyers</Link>.
                Questions: <WatchEmailLink placement="watch-footer">{WATCH_CONTACT}</WatchEmailLink>.
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
        .wa-cta {
          margin-top: 26px;
          display: flex;
          align-items: center;
          gap: 12px 20px;
          flex-wrap: wrap;
        }
        .wa-cta--body { margin: 0 0 1.3rem; }
        .wa-cta-note {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          line-height: 1.5;
          color: var(--ink-faint);
        }
        .press .decode-prose .press-btn,
        .press .decode-prose .press-btn:hover {
          color: var(--paper);
          text-decoration: none;
        }
        .wa-term {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 0.82em;
          color: var(--ink);
        }
        .wa-count {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 0.78em;
          color: var(--ink-faint);
          white-space: nowrap;
        }
        .wa-exhibit {
          border: 1px solid var(--rule-strong);
          border-top: 3px double var(--rule-strong);
          background: var(--paper-2);
          padding: 22px 24px 6px;
          margin: 0 0 1.3rem;
        }
        .press .decode-prose .wa-exhibit .wa-exhibit-lead {
          margin: 12px 0 18px;
          color: var(--ink);
        }
        .press .decode-prose .wa-exhibit pre {
          margin: 8px 0 18px;
          background: var(--paper);
        }
        /* The sample and the address read in full on a phone: wrap, never scroll. */
        .press .decode-prose .wa-exhibit pre code {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .press .wa-address .press-code .press-code-pre {
          white-space: pre-wrap;
        }
        .press .wa-address .press-code .press-code-pre code {
          overflow-wrap: anywhere;
          word-break: break-all;
        }
        .press .decode-prose .wa-missing {
          border-left: 3px solid var(--oxblood);
          padding-left: 14px;
          color: var(--ink);
        }
        @media (max-width: 720px) {
          .wa-exhibit { padding: 18px 16px 4px; }
        }
      `}</style>
    </PressShell>
  );
}
