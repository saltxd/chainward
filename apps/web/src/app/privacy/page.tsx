import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';

// Plain-language Privacy Policy. It describes what the app actually does today:
// self-hosted cookieless analytics (Umami via same-origin /a proxy), self-hosted
// fonts (next/font, no font-CDN calls), no session replay, no third-party
// trackers. Keep it true to the code. Fill [[MAILING ADDRESS]] and review with
// counsel before relying on it.

const TITLE = 'Privacy Policy';
const UPDATED = 'October 28, 2026';

export const metadata = {
  title: TITLE,
  description: 'What ChainWard collects, and what it does not.',
  alternates: { canonical: 'https://chainward.ai/privacy' },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />
        <article className="da">
          <header className="da-header press-measure">
            <div className="press-fileno">Legal</div>
            <h1 className="da-title press-display">Privacy Policy</h1>
            <p className="da-sub">Last updated {UPDATED}.</p>
          </header>
          <div className="da-body press-measure">
            <div className="decode-prose">
              <p>
                This policy explains what ChainWard (operated by [[LEGAL ENTITY NAME]]) collects, and the short version is:
                very little, and nothing we sell.
              </p>

              <h2>What we collect</h2>
              <ul>
                <li>
                  <strong>Wallet address.</strong> When you connect a wallet or pay, we see the public address you pay
                  from and the on-chain payment. That is public data by nature.
                </li>
                <li>
                  <strong>Email, only if you give it.</strong> If you request a brief or an endpoint watch, we keep the
                  email and the host you send so we can deliver the result and answer you. We do not add you to a marketing
                  list.
                </li>
                <li>
                  <strong>Basic analytics.</strong> We run our own copy of Umami, a cookieless, privacy-first analytics
                  tool, served from our own domain through a same-origin proxy. It records page views and coarse,
                  non-identifying signals (such as referrer and country). It does not set cookies, does not build a profile,
                  and never leaves our infrastructure.
                </li>
                <li>
                  <strong>Server logs.</strong> Our servers keep standard request logs (including IP address) for security
                  and debugging, for a limited time.
                </li>
              </ul>

              <h2>What we do not do</h2>
              <ul>
                <li>No session replay or screen recording.</li>
                <li>No third-party advertising or tracking pixels.</li>
                <li>
                  No third-party fonts. Fonts are built into the site and served from our own domain, so loading a page
                  does not call a font CDN or leak your IP to one.
                </li>
                <li>We do not sell your data, and we do not share it except as needed to run the service or to obey the law.</li>
              </ul>

              <h2>Service providers</h2>
              <p>
                We use infrastructure and a payment facilitator to run ChainWard. They process only what they need to (for
                example, routing a payment or serving the site) and under their own terms. On-chain payments settle
                directly between your wallet and ours.
              </p>

              <h2>Your choices</h2>
              <p>
                You can use most of ChainWard without giving any personal information. If you gave us an email, you can ask
                us to delete it at any time, and you can stop an endpoint watch by replying to any of our emails. To ask
                about or delete the data we hold on you, write to <span className="mono">hello@chainward.ai</span>.
              </p>

              <h2>Changes and contact</h2>
              <p>
                We may update this policy; the &quot;last updated&quot; date shows when. Questions or requests:{' '}
                <span className="mono">hello@chainward.ai</span>, or [[MAILING ADDRESS]].
              </p>
            </div>
          </div>
        </article>
        <Colophon />
      </div>
    </PressShell>
  );
}
