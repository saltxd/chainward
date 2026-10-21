import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon, CodeBlock } from '@/components/press';

// The fast wallet lookup over HTTP (apps/api/src/routes/walletLookup.ts): free with
// a key up to 1,000 lookups a month, or paid per call over x402 with no account.

const TITLE = 'Wallet screening API';
const DESCRIPTION =
  'One call tells you whether a Base or BNB Chain wallet is on the OFAC sanctions list, how old it is, when it last moved and who first funded it, with a verdict: hold, review or no_flags. 1,000 lookups a month free with a key, or $0.01 a call over x402.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://chainward.ai/wallet-api' },
  openGraph: { title: TITLE, description: DESCRIPTION, images: [{ url: '/chainward-og-card.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/chainward-og-card.png'] },
};

const CONTACT = 'hello@chainward.ai';
const EXAMPLE = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';

const keyedCurl = `curl https://api.chainward.ai/v1/wallet/${EXAMPLE} \\
  -H "Authorization: Bearer ag_your_key"`;

const paidCurl = `curl "https://api.chainward.ai/api/risk/wallet?address=${EXAMPLE}"`;

// Trimmed from a real lookup on 2026-10-13.
const response = `{
  "success": true,
  "data": {
    "address": "${EXAMPLE}",
    "chain": "base",
    "verdict": {
      "label": "no_flags",
      "reason": "None of the checks matched: sanctions, age, history and first funder."
    },
    "sanctioned": false,
    "type": "wallet",
    "first_seen": "2025-02-04T12:26:09.000Z",
    "age_days": 616,
    "last_active": "2026-01-30T15:58:27.000Z",
    "sent_txs": 87,
    "balances": { "native": 0.0192, "usdc": 5451.39 },
    "first_funder": {
      "address": "0x0dff09a6733a12366236e62111a4ce93c475db78",
      "sanctioned": false,
      "exchange_or_hub": true,
      "funded_wallets": null
    },
    "flags": [],
    "as_of_block": 52553137
  }
}`;

export default function WalletApiPage() {
  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <article className="da">
          <header className="da-header press-measure">
            <div className="press-fileno">
              API <span className="ph-dateline-sep">·</span> Base and BNB Chain
            </div>
            <h1 className="da-title press-display">{TITLE}</h1>
            <p className="da-sub">
              One call tells you whether a wallet is on the US sanctions list, how old it is, when it last
              moved and who first funded it, with a verdict: hold, review or no_flags. About a second per
              wallet. 1,000 lookups a month free.
            </p>
          </header>

          <div className="da-body press-measure">
            <div className="decode-prose">
              <h2>The call</h2>
              <CodeBlock>{keyedCurl}</CodeBlock>
              <p>
                Add <code>?chain=bsc</code> for a BNB Chain wallet. Base is the default.
              </p>

              <h2>Get a key</h2>
              <p>
                <Link href="/login">Sign in with your wallet</Link>, then create a key under{' '}
                <Link href="/settings">Settings</Link>, API keys. Every account gets 1,000 lookups a month
                for free, cached answers included; the <code>X-Quota-Remaining</code> header counts down.
                Need more? Email{' '}
                <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
              </p>

              <h2>No account? Pay per call</h2>
              <CodeBlock>{paidCurl}</CodeBlock>
              <p>
                <code>GET /api/risk/wallet?address=</code> is the same lookup for $0.01 in USDC on Base,
                paid over x402: the first request answers 402 with the price, and any x402 client pays and
                retries. A malformed address is never charged.
              </p>

              <h2>What comes back</h2>
              <CodeBlock>{response}</CodeBlock>
              <ul>
                <li>
                  <strong>hold</strong>: the wallet, or the wallet that first funded it, is on the OFAC
                  sanctions list (<code>sanctioned</code>, <code>first_funder.sanctioned</code>), or on Base it
                  looks like an address-poisoning decoy (<code>poisoning_decoy</code>): it never sent a
                  transaction, its newest token transfers are all fakes, and its first and last characters match
                  an address that a wallet in those fakes really paid or was paid by. <code>decoy.copies</code> is
                  that address when exactly one matches: evidence, not the address to pay. Get any address from
                  whoever you are paying.
                </li>
                <li>
                  <strong>review</strong>: first seen less than 7 days ago (<code>age_days</code>), no
                  history at all, its first funder has funded 5 or more wallets and is not an exchange
                  or other busy hub, or it is a known relayer of the px402 privacy pool
                  (<code>privacy_relay</code>), which pays for agents it does not name, so the real payer
                  can&apos;t be screened.
                </li>
                <li>
                  <strong>no_flags</strong>: none of those matched.
                </li>
              </ul>
              <p>
                Use it to screen signups, a payout list or a counterparty before you pay it.
              </p>

              <h2>Limits</h2>
              <ul>
                <li>no_flags means none of these checks matched. It is not a clearance.</li>
                <li>
                  A shared funder is not proof that one person controls the wallets. Teams, families and
                  services fund wallets too.
                </li>
                <li>
                  Exchanges, bridges and other busy hubs hide who really funded a wallet, so one lookup
                  cannot see a group of wallets that came in through one. To find the groups in a whole
                  list, <Link href="/screen">send us the list</Link>.
                </li>
                <li>Answers are cached for up to an hour.</li>
                <li>
                  The free tier shares a daily cap across all accounts. Past it, a new lookup answers 429
                  until the next UTC day; the pay-per-call route is not capped.
                </li>
                <li>This is on-chain analysis, not compliance advice.</li>
              </ul>

              <p>
                Full API reference: <Link href="/docs">docs</Link>. Questions:{' '}
                <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
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
