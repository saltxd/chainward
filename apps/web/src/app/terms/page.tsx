import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';

// Plain-language Terms of Service. Review these with counsel and fill the
// [[BRACKETED]] placeholders (legal entity, mailing address, governing law)
// before relying on them. "Last updated" is the day the text last changed.

const TITLE = 'Terms of Service';
const UPDATED = 'October 28, 2026';

export const metadata = {
  title: TITLE,
  description: 'The terms for using ChainWard.',
  alternates: { canonical: 'https://chainward.ai/terms' },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />
        <article className="da">
          <header className="da-header press-measure">
            <div className="press-fileno">Legal</div>
            <h1 className="da-title press-display">Terms of Service</h1>
            <p className="da-sub">Last updated {UPDATED}.</p>
          </header>
          <div className="da-body press-measure">
            <div className="decode-prose">
              <p>
                These terms are an agreement between you and [[LEGAL ENTITY NAME]] (&quot;ChainWard&quot;,
                &quot;we&quot;, &quot;us&quot;) for the ChainWard website and services at chainward.ai. By using them you
                agree to these terms. If you do not agree, do not use them.
              </p>

              <h2>Who can use ChainWard</h2>
              <p>
                You must be at least 18 years old, or the age of majority where you live if that is higher, and able to
                form a binding contract. ChainWard is not directed to children, and we do not knowingly collect data from
                anyone under 18. By using ChainWard you confirm that you meet this age requirement.
              </p>

              <h2>What ChainWard is, and is not</h2>
              <p>
                ChainWard reads public on-chain data and tells you what the chain shows: the answer, the reason, and the
                evidence. It describes on-chain behavior only and cannot see promises or facts that live off-chain. Nothing
                on ChainWard is financial, investment, legal, or tax advice, and nothing is a recommendation to buy, sell,
                or hold any asset or to transact with any party. You are responsible for your own decisions. On-chain data
                can be incomplete or ambiguous, and a result is a reading of public data, not a verdict about any person.
              </p>

              <h2>Payments</h2>
              <p>
                Paid checks and reports are priced in USDC on Base and shown before you pay. A brief or report is a
                one-time payment. The x402 endpoint watch is billed at $10 per month in USDC on Base: there is no stored
                payment method and no automatic charge, so each month continues only if you choose to pay it, and you can
                stop at any time by replying to any of our emails. We do not take custody of your funds; payments move
                directly on-chain from your own wallet. Because blockchain payments are final, refunds are handled case by
                case under the guarantee stated with each product.
              </p>

              <h2>Acceptable use</h2>
              <p>
                Do not use ChainWard to break the law, to infringe anyone&apos;s rights, to attack or overload the service,
                to scrape it in a way that degrades it for others, or to present our output as someone else&apos;s. Do not
                use ChainWard to harass or endanger any individual. Our investigations name wallets and organizations, not
                private people, and we ask that you use them the same way.
              </p>

              <h2>Intellectual property</h2>
              <p>
                The site, its text, and its software are ours or our licensors&apos;, except where we say otherwise (some
                components are open source under their own licenses). You keep whatever rights you have in the data you
                submit. If you believe content on ChainWard infringes your copyright, see our{' '}
                <a href="/dmca">DMCA policy</a>.
              </p>

              <h2>No warranty; limit of liability</h2>
              <p>
                ChainWard is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, to
                the extent the law allows. We do not warrant that it will be accurate, uninterrupted, or error-free. To the
                extent the law allows, our total liability for any claim relating to ChainWard is limited to the amount you
                paid us for the service in the three months before the claim.
              </p>

              <h2>Changes and contact</h2>
              <p>
                We may update these terms; the &quot;last updated&quot; date shows when. Material changes will be noted on
                this page. These terms are governed by the laws of [[GOVERNING LAW / STATE]], without regard to conflict of
                law rules. Questions: <span className="mono">hello@chainward.ai</span>, or [[MAILING ADDRESS]].
              </p>
            </div>
          </div>
        </article>
        <Colophon />
      </div>
    </PressShell>
  );
}
