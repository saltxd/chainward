/**
 * ============================================================
 * LAUNCH POST OPENER (X / blog / Discord — not part of the page)
 * ============================================================
 *
 * It's 4am. Your agent just failed a swap. Nobody told you.
 *
 * That was me three months ago. Running a swap agent on Base —
 * ETH/USDC round-trips through Aerodrome, nothing exotic. Then
 * Coinbase closed my CDP account the same day I verified KYC.
 * "Bot activity." Portal gone. Keys revoked.
 *
 * I rebuilt the agent in four hours on raw viem + a private
 * key. No Coinbase anywhere in the stack. But here's what
 * actually kept me up that night: I'd had ZERO visibility into
 * what that wallet was doing. No alerts when gas spiked. No
 * notification when a tx failed. I was checking Basescan
 * manually like it was a full-time job.
 *
 * So I built ChainWard — real-time monitoring, 7 alert types,
 * gas analytics for agent wallets on Base. You paste a wallet
 * address, every tx gets indexed, and you get a Discord ping
 * or Telegram message within 30 seconds when something goes
 * wrong. You don't have to build the monitoring yourself.
 *
 * Free tier. 3 agents. Every alert type.
 * chainward.ai
 *
 * ============================================================
 */

import { cookies } from 'next/headers';
import Link from 'next/link';
import {
  PageShell,
  NavBar,
  StatusTicker,
  SectionHead,
  Button,
} from '@/components/v2';
import { HeroTerminal } from './_landing/hero-terminal';
import { TelemetryBar } from './_landing/telemetry-bar';
import { ReceiptsWall } from './_landing/receipts-wall';
import { AlertMatrix } from './_landing/alert-matrix';
import { PricingBlocks } from './_landing/pricing-blocks';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ChainWard',
  description:
    'Real-time monitoring and alerts for AI agent wallets on Base. 7 alert types, 3 delivery channels, gas analytics. No vendor lock-in. Free tier available.',
  url: 'https://chainward.ai',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web, CLI (macOS, Linux, Windows)',
  offers: [
    {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free tier: 3 agents, 7-day history, all alerts.',
    },
    {
      '@type': 'Offer',
      price: '25',
      priceCurrency: 'USD',
      description:
        'Operator: 10 agents, 90-day history, API + CLI access. Paid in USDC on Base.',
    },
  ],
  creator: {
    '@type': 'Organization',
    name: 'ChainWard',
    url: 'https://chainward.ai',
  },
};

export default async function LandingPage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.has('chainward-session');

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <StatusTicker />

      <div className="v2-shell">
        <NavBar
          ctaHref={isAuthenticated ? '/overview' : '/login'}
          ctaLabel={isAuthenticated ? 'dashboard' : './connect'}
        />

        {/* Hero */}
        <section className="v2-landing-hero">
          <div>
            <div className="v2-landing-kicker">Base mainnet · indexed live</div>
            <h1 className="v2-landing-title display">
              Your agent failed a swap
              <span className="v2-landing-narrative">
                at <span className="v2-landing-accent">03:47</span>.
                <br />
                <span className="serif">You found out at noon.</span>
              </span>
            </h1>
            <p className="v2-landing-sub">
              <strong>ChainWard</strong> is a real-time monitoring layer for AI
              agent wallets on Base. You paste an address, every transaction gets
              indexed on our own node, and a Discord or Telegram alert fires in
              under 30 seconds when something goes wrong. No vendor lock-in. No
              Coinbase account to close. Free tier, 3 agents, every alert type.
            </p>
            <div className="v2-landing-cta">
              <Button href="/login">
                ./connect-wallet
                <span>→</span>
              </Button>
              <Button variant="ghost" href="/base">
                cat observatory.json
              </Button>
            </div>
            <div className="v2-landing-meta">
              <span>free tier</span>
              <span>3 agents</span>
              <span>no credit card</span>
              <span>paid in USDC</span>
            </div>
          </div>
          <HeroTerminal />
        </section>
      </div>

      <TelemetryBar />

      <div className="v2-shell">
        <section className="v2-landing-section">
          <SectionHead
            tag="01 / proof"
            title={
              <>
                We ingest from our own sentinel node.
                <br />
                <span className="serif" style={{ color: 'var(--phosphor)' }}>
                  No Alchemy middleman.
                </span>
              </>
            }
            lede="Every tx ChainWard serves traces back to a block height we verified ourselves. The dashboard shows the receipt. You can grep it."
          />
          <ReceiptsWall />
        </section>

        <section className="v2-landing-section">
          <SectionHead
            tag="02 / triggers"
            title={
              <>
                Seven alert types.
                <br />
                <span className="serif" style={{ color: 'var(--phosphor)' }}>
                  Discord, Telegram, webhook.
                </span>
              </>
            }
            lede="Pick the condition, pick the channel, go do something else. No dashboard tab to babysit. No cron you have to write yourself."
          />
          <AlertMatrix />
        </section>

        <section className="v2-landing-section">
          <SectionHead
            tag="03 / pricing"
            title={
              <>
                USDC on Base.
                <br />
                <span className="serif" style={{ color: 'var(--phosphor)' }}>
                  No Stripe. No middleman.
                </span>
              </>
            }
            lede="No credit card company taking 3%. No subscription platform deciding when to bill you. Stablecoin hits the contract, you’re live."
          />
          <PricingBlocks />
        </section>

        <section className="v2-landing-bottom">
          <div className="v2-landing-final">
            <h2 className="v2-landing-final-title display">
              Self-reliance is the{' '}
              <span className="serif" style={{ color: 'var(--phosphor)' }}>
                ultimate goal.
              </span>
            </h2>
            <p className="v2-landing-final-sub">
              If your ability to operate depends on someone else&apos;s permission,
              you don&apos;t have a business. You have a favor.
            </p>
            <div style={{ marginTop: 32 }}>
              <Button href="/login">
                ./start-monitoring
                <span>→</span>
              </Button>
            </div>
          </div>
        </section>

        <footer className="v2-landing-footer">
          <div>chainward.ai · operator-grade monitoring for base</div>
          <div className="v2-landing-footer-links">
            <Link href="/base">observatory</Link>
            <Link href="/wallet">lookup</Link>
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
        .v2-landing-hero {
          padding-top: 56px;
          padding-bottom: 40px;
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 60px;
          align-items: start;
        }
        @media (max-width: 960px) {
          .v2-landing-hero { grid-template-columns: 1fr; gap: 40px; }
        }
        @media (max-width: 480px) {
          .v2-landing-hero {
            padding-top: 32px;
            padding-bottom: 24px;
            gap: 28px;
          }
          .v2-landing-section {
            padding: 48px 0;
          }
          .v2-landing-bottom {
            padding: 32px 0 56px;
          }
          .v2-landing-final {
            padding: 32px 20px;
          }
          .v2-landing-final::before {
            top: 10px;
            left: 16px;
            font-size: 10px;
          }
          .v2-landing-meta {
            gap: 14px 18px;
          }
          .v2-landing-cta {
            gap: 8px;
          }
        }
        .v2-landing-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--fg-dim);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding-bottom: 20px;
        }
        .v2-landing-kicker::before {
          content: '';
          width: 20px;
          height: 1px;
          background: var(--phosphor);
        }
        .v2-landing-title {
          font-size: clamp(44px, 7vw, 88px);
          line-height: 0.96;
          letter-spacing: -0.04em;
          color: var(--fg);
        }
        .v2-landing-accent {
          color: var(--phosphor);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-variant-numeric: tabular-nums;
          font-size: 0.82em;
          letter-spacing: -0.02em;
        }
        .v2-landing-narrative {
          display: block;
          font-weight: 400;
          color: var(--fg-dim);
          margin-top: 4px;
        }
        .v2-landing-sub {
          margin-top: 28px;
          font-size: 14px;
          line-height: 1.7;
          color: var(--fg-dim);
          max-width: 480px;
        }
        .v2-landing-sub strong { color: var(--fg); font-weight: 500; }
        .v2-landing-cta {
          display: flex;
          gap: 12px;
          margin-top: 32px;
          flex-wrap: wrap;
        }
        .v2-landing-meta {
          margin-top: 20px;
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.04em;
        }
        .v2-landing-meta span::before {
          content: '// ';
          color: var(--phosphor-dim);
        }
        .v2-landing-section {
          padding: 80px 0;
          border-top: 1px solid var(--line);
        }
        .v2-landing-bottom {
          border-top: 1px solid var(--line);
          padding: 56px 0 80px;
        }
        .v2-landing-final {
          border: 1px solid var(--line-2);
          padding: 48px;
          background:
            radial-gradient(ellipse at 10% 0%, rgba(58, 167, 109, 0.06), transparent 60%),
            var(--bg-1);
          position: relative;
        }
        .v2-landing-final::before {
          content: '$ cw deploy --production';
          position: absolute;
          top: 14px;
          left: 20px;
          font-size: 11px;
          color: var(--phosphor);
          letter-spacing: 0.04em;
        }
        .v2-landing-final-title {
          font-size: clamp(32px, 4.5vw, 56px);
          line-height: 1.02;
          margin-top: 24px;
          max-width: 780px;
        }
        .v2-landing-final-sub {
          margin-top: 16px;
          color: var(--fg-dim);
          max-width: 520px;
          font-size: 13px;
          line-height: 1.7;
        }
        .v2-landing-footer {
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
        .v2-landing-footer :global(a) {
          color: var(--fg-dim);
          text-decoration: none;
          transition: color 0.15s;
        }
        .v2-landing-footer :global(a:hover) { color: var(--phosphor); }
        .v2-landing-footer-links {
          display: flex;
          gap: 20px;
        }
      `}</style>
    </PageShell>
  );
}
