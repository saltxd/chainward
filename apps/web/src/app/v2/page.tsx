import Link from 'next/link';
import { HeroTerminal } from './_components/hero-terminal';
import { TelemetryBar } from './_components/telemetry-bar';
import { ReceiptsWall } from './_components/receipts-wall';
import { AlertMatrix } from './_components/alert-matrix';
import { PricingBlocks } from './_components/pricing-blocks';
import { StatusTicker } from './_components/status-ticker';

export default function V2Landing() {
  return (
    <div className="v2-root">
      <style>{`
        .v2-root {
          --bg: #0a0b0a;
          --bg-1: #0f1110;
          --bg-2: #141714;
          --line: #1e231f;
          --line-2: #2a312b;
          --fg: #e8ebe4;
          --fg-dim: #9ba397;
          --muted: #585f56;
          --phosphor: #3dd88d;
          --phosphor-dim: #1d6b42;
          --amber: #e8a033;
          --danger: #e66767;
          --cyan: #5ec4e6;

          background: var(--bg);
          color: var(--fg);
          font-family: var(--font-mono), ui-monospace, monospace;
          min-height: 100vh;
          letter-spacing: 0.01em;
        }
        .v2-root .display {
          font-family: var(--font-display), Georgia, serif;
          font-weight: 500;
          letter-spacing: -0.035em;
          font-variation-settings: 'opsz' 144, 'SOFT' 50, 'WONK' 0;
        }
        .v2-root .serif { font-family: var(--font-serif), Georgia, serif; font-style: italic; letter-spacing: -0.01em; }
        .v2-root a { color: inherit; text-decoration: none; }
        .v2-root ::selection { background: var(--phosphor); color: var(--bg); }

        /* Scanline + grain overlay */
        .v2-root::before {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          background:
            repeating-linear-gradient(0deg,
              rgba(255,255,255,0.012) 0px,
              rgba(255,255,255,0.012) 1px,
              transparent 1px,
              transparent 3px);
          z-index: 50;
          mix-blend-mode: overlay;
        }
        .v2-root::after {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image: radial-gradient(rgba(92,240,164,0.012) 1px, transparent 1px);
          background-size: 3px 3px;
          z-index: 49;
        }

        .v2-shell {
          position: relative;
          z-index: 1;
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 32px;
        }
        @media (max-width: 720px) { .v2-shell { padding: 0 20px; } }

        /* Nav */
        .v2-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 0;
          border-bottom: 1px solid var(--line);
          font-size: 12px;
        }
        .v2-nav-brand {
          display: flex; align-items: center; gap: 10px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .v2-nav-brand::before {
          content: '';
          display: block;
          width: 10px; height: 10px;
          background: var(--phosphor);
          box-shadow: 0 0 8px var(--phosphor);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.9); }
        }
        .v2-nav-links { display: flex; gap: 24px; align-items: center; color: var(--fg-dim); }
        .v2-nav-links a:hover { color: var(--phosphor); }
        .v2-nav-cta {
          padding: 8px 18px;
          background: var(--phosphor);
          color: var(--bg);
          font-weight: 600;
          font-size: 12px;
          letter-spacing: 0.02em;
          transition: box-shadow 0.15s;
        }
        .v2-nav-cta:hover { box-shadow: 0 0 24px rgba(92,240,164,0.4); }

        /* Hero */
        .v2-hero {
          padding-top: 56px;
          padding-bottom: 40px;
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 60px;
          align-items: start;
        }
        @media (max-width: 960px) {
          .v2-hero { grid-template-columns: 1fr; gap: 40px; }
        }

        .v2-hero-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--fg-dim);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding-bottom: 20px;
        }
        .v2-hero-kicker::before {
          content: '';
          width: 20px; height: 1px;
          background: var(--phosphor);
        }

        .v2-hero-title {
          font-family: var(--font-display), Georgia, serif;
          font-size: clamp(44px, 7vw, 88px);
          line-height: 0.96;
          letter-spacing: -0.04em;
          font-weight: 500;
          color: var(--fg);
          font-variation-settings: 'opsz' 144, 'SOFT' 50, 'WONK' 0;
        }
        .v2-hero-title .accent {
          color: var(--phosphor);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-variant-numeric: tabular-nums;
          font-size: 0.82em;
          letter-spacing: -0.02em;
        }
        .v2-hero-title .narrative {
          display: block;
          font-weight: 400;
          color: var(--fg-dim);
          margin-top: 4px;
        }

        .v2-hero-sub {
          margin-top: 28px;
          font-size: 14px;
          line-height: 1.7;
          color: var(--fg-dim);
          max-width: 480px;
        }
        .v2-hero-sub strong { color: var(--fg); font-weight: 500; }

        .v2-hero-cta {
          display: flex; gap: 12px; margin-top: 32px;
          flex-wrap: wrap;
        }
        .v2-btn-primary {
          padding: 14px 22px;
          background: var(--phosphor);
          color: var(--bg);
          font-weight: 600;
          font-size: 13px;
          display: inline-flex; align-items: center; gap: 8px;
          transition: all 0.15s;
        }
        .v2-btn-primary:hover {
          box-shadow: 0 0 32px rgba(92,240,164,0.35);
          transform: translateY(-1px);
        }
        .v2-btn-ghost {
          padding: 14px 22px;
          background: transparent;
          color: var(--fg);
          font-weight: 500;
          font-size: 13px;
          border: 1px solid var(--line-2);
          display: inline-flex; align-items: center; gap: 8px;
          transition: border-color 0.15s;
        }
        .v2-btn-ghost:hover { border-color: var(--phosphor); color: var(--phosphor); }

        .v2-hero-meta {
          margin-top: 20px;
          display: flex; gap: 24px; flex-wrap: wrap;
          font-size: 11px; color: var(--muted);
          letter-spacing: 0.04em;
        }
        .v2-hero-meta span::before {
          content: '// ';
          color: var(--phosphor-dim);
        }

        /* Section dividers */
        .v2-section {
          padding: 80px 0;
          border-top: 1px solid var(--line);
        }
        .v2-section-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 40px;
          margin-bottom: 40px;
          flex-wrap: wrap;
        }
        .v2-section-tag {
          font-size: 11px;
          color: var(--phosphor);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .v2-section-tag::before { content: '[ '; color: var(--fg-dim); }
        .v2-section-tag::after { content: ' ]'; color: var(--fg-dim); }
        .v2-section-title {
          font-family: var(--font-display), Georgia, serif;
          font-size: clamp(28px, 4vw, 48px);
          font-weight: 500;
          letter-spacing: -0.035em;
          line-height: 1.02;
          max-width: 720px;
          font-variation-settings: 'opsz' 144, 'SOFT' 30, 'WONK' 0;
        }
        .v2-section-title .serif { color: var(--phosphor); font-weight: 400; }
        .v2-section-lede {
          max-width: 400px;
          color: var(--fg-dim);
          font-size: 13px;
          line-height: 1.7;
        }

        /* Pricing CTA bar */
        .v2-bottom {
          border-top: 1px solid var(--line);
          padding: 56px 0 80px;
        }
        .v2-final {
          border: 1px solid var(--line-2);
          padding: 48px;
          background:
            radial-gradient(ellipse at 10% 0%, rgba(92,240,164,0.06), transparent 60%),
            var(--bg-1);
          position: relative;
        }
        .v2-final::before {
          content: '$ cw deploy --production';
          position: absolute;
          top: 14px; left: 20px;
          font-size: 11px;
          color: var(--phosphor);
          letter-spacing: 0.04em;
        }
        .v2-final-title {
          font-family: var(--font-display), Georgia, serif;
          font-size: clamp(32px, 4.5vw, 56px);
          font-weight: 500;
          letter-spacing: -0.04em;
          line-height: 1.02;
          margin-top: 24px;
          max-width: 780px;
          font-variation-settings: 'opsz' 144, 'SOFT' 50, 'WONK' 0;
        }
        .v2-final-title .serif { color: var(--phosphor); }
        .v2-final-sub {
          margin-top: 16px;
          color: var(--fg-dim);
          max-width: 520px;
          font-size: 13px;
          line-height: 1.7;
        }

        .v2-footer {
          border-top: 1px solid var(--line);
          padding: 24px 0 48px;
          display: flex; align-items: center; justify-content: space-between;
          font-size: 11px;
          color: var(--muted);
          flex-wrap: wrap;
          gap: 16px;
        }
        .v2-footer a:hover { color: var(--phosphor); }
        .v2-footer-links { display: flex; gap: 20px; color: var(--fg-dim); }
      `}</style>

      <StatusTicker />

      <div className="v2-shell">
        {/* Nav */}
        <nav className="v2-nav">
          <Link href="/v2" className="v2-nav-brand">
            <span>chainward<span style={{ color: 'var(--phosphor)' }}>.ai</span></span>
          </Link>
          <div className="v2-nav-links">
            <Link href="/base">observatory</Link>
            <Link href="/decodes">decodes</Link>
            <Link href="/wallet">lookup</Link>
            <Link href="/login" className="v2-nav-cta">
              ./connect →
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <section className="v2-hero">
          <div>
            <div className="v2-hero-kicker">Base mainnet · indexed live</div>
            <h1 className="v2-hero-title">
              Your agent failed a swap
              <span className="narrative">
                at <span className="accent">03:47</span>.
                <br />
                <span className="serif">You found out at noon.</span>
              </span>
            </h1>
            <p className="v2-hero-sub">
              <strong>ChainWard</strong> is a real-time monitoring layer for AI agent
              wallets on Base. You paste an address, every transaction gets indexed
              on our own node, and a Discord or Telegram alert fires in under 30
              seconds when something goes wrong. No vendor lock-in. No Coinbase
              account to close. Free tier, 3 agents, every alert type.
            </p>
            <div className="v2-hero-cta">
              <Link href="/login" className="v2-btn-primary">
                ./connect-wallet
                <span>→</span>
              </Link>
              <Link href="/base" className="v2-btn-ghost">
                cat observatory.json
              </Link>
            </div>
            <div className="v2-hero-meta">
              <span>free tier</span>
              <span>3 agents</span>
              <span>no credit card</span>
              <span>paid in USDC</span>
            </div>
          </div>

          <HeroTerminal />
        </section>
      </div>

      {/* Telemetry (full-bleed strip) */}
      <TelemetryBar />

      <div className="v2-shell">
        <section className="v2-section">
          <div className="v2-section-head">
            <div>
              <div className="v2-section-tag">01 / proof</div>
              <h2 className="v2-section-title" style={{ marginTop: 16 }}>
                We ingest from our own sentinel node.
                <br />
                <span className="serif">No Alchemy middleman.</span>
              </h2>
            </div>
            <p className="v2-section-lede">
              Every tx ChainWard serves traces back to a block height we verified
              ourselves. The dashboard shows the receipt. You can grep it.
            </p>
          </div>
          <ReceiptsWall />
        </section>

        <section className="v2-section">
          <div className="v2-section-head">
            <div>
              <div className="v2-section-tag">02 / triggers</div>
              <h2 className="v2-section-title" style={{ marginTop: 16 }}>
                Seven alert types.
                <br />
                <span className="serif">Discord, Telegram, webhook.</span>
              </h2>
            </div>
            <p className="v2-section-lede">
              Pick the condition, pick the channel, go do something else. No
              dashboard tab to babysit. No cron you have to write yourself.
            </p>
          </div>
          <AlertMatrix />
        </section>

        <section className="v2-section">
          <div className="v2-section-head">
            <div>
              <div className="v2-section-tag">03 / pricing</div>
              <h2 className="v2-section-title" style={{ marginTop: 16 }}>
                USDC on Base.
                <br />
                <span className="serif">No Stripe. No middleman.</span>
              </h2>
            </div>
            <p className="v2-section-lede">
              No credit card company taking 3%. No subscription platform deciding
              when to bill you. Stablecoin hits the contract, you&apos;re live.
            </p>
          </div>
          <PricingBlocks />
        </section>

        <section className="v2-bottom">
          <div className="v2-final">
            <h2 className="v2-final-title">
              Self-reliance is the{' '}
              <span className="serif">ultimate goal.</span>
            </h2>
            <p className="v2-final-sub">
              If your ability to operate depends on someone else&apos;s permission,
              you don&apos;t have a business. You have a favor.
            </p>
            <div style={{ marginTop: 32 }}>
              <Link href="/login" className="v2-btn-primary">
                ./start-monitoring
                <span>→</span>
              </Link>
            </div>
          </div>
        </section>

        <footer className="v2-footer">
          <div>
            chainward.ai · operator-grade monitoring for base
          </div>
          <div className="v2-footer-links">
            <Link href="/base">observatory</Link>
            <Link href="/wallet">lookup</Link>
            <Link href="/docs">docs</Link>
            <a href="https://x.com/chainwardai" target="_blank" rel="noopener noreferrer">x</a>
            <Link href="/">v1 landing</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
