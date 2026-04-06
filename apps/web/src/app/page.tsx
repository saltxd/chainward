import Link from 'next/link';
import { cookies } from 'next/headers';
import { ActivityFeed } from '@/components/landing/activity-feed';
import { FeatureGrid } from '@/components/landing/feature-grid';
import { CliTerminal } from '@/components/landing/cli-terminal';
import { ObservatoryStats } from '@/components/landing/observatory-stats';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ChainWard',
  description:
    'Real-time monitoring and alerts for on-chain agent wallets on Base. Cross-framework visibility, gas analytics, and operator-focused notifications.',
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
      description: 'Operator: 10 agents, 90-day history, API + CLI access. Paid in USDC on Base.',
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
    <div className="relative min-h-screen overflow-hidden bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Subtle grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(74,222,128,1) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Gradient glow at top */}
      <div className="pointer-events-none absolute -top-[400px] left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/chainward-logo.svg" alt="ChainWard" className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight text-white">Chain<span className="text-accent-foreground">Ward</span></span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/base"
            className="hidden px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-white sm:block"
          >
            Observatory
          </Link>
          <Link
            href="/decodes"
            className="hidden px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-white sm:block"
          >
            Decodes
          </Link>
          {isAuthenticated ? (
            <Link
              href="/overview"
              rel="nofollow"
              className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(74,222,128,0.15)]"
            >
              Dashboard &rarr;
            </Link>
          ) : (
            <Link
              href="/login"
              rel="nofollow"
              className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(74,222,128,0.15)]"
            >
              Connect Wallet
            </Link>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-20 text-center md:pt-32">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-foreground/20 bg-accent-foreground/5 px-4 py-1.5 text-xs text-accent-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-foreground opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-foreground" />
          </span>
          Live on Base Mainnet
        </div>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-6xl lg:text-7xl">
          Real-time monitoring and alerts for{' '}
          <span className="bg-gradient-to-r from-[#4ade80] to-[#22c55e] bg-clip-text text-transparent">
            Base agent wallets
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Base-first AgentOps for small teams running on-chain agents. Track wallet activity,
          catch failed transactions, and understand gas and balance behavior before an issue turns into a loss.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            rel="nofollow"
            className="group relative inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(74,222,128,0.2)]"
          >
            Connect Wallet
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <Link
            href="/base"
            className="inline-flex items-center gap-2 rounded-sm border border-border px-8 py-3.5 text-sm font-medium text-muted-foreground transition-all hover:border-border/80 hover:text-white"
          >
            See Live Observatory &rarr;
          </Link>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Real-time intelligence for AI agent wallets on Base.
        </p>

        {/* Live activity feed */}
        <div className="mx-auto mt-16 max-w-3xl md:mt-20">
          <ActivityFeed />
        </div>
      </section>

      {/* Problem section */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-32 md:pt-40">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Your agents are moving money.
            <br />
            <span className="text-muted-foreground">Are you watching?</span>
          </h2>
          <p className="mt-4 text-muted-foreground md:text-base">
            Autonomous agents execute transactions 24/7. Without real-time visibility,
            a misconfigured strategy or unexpected market condition can drain wallets
            before you even notice.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-sm border border-border bg-background p-8 md:p-10">
          <div className="flex flex-col items-center gap-6 md:flex-row md:gap-10">
            <div className="shrink-0 text-center">
              <div className="font-mono text-4xl font-bold text-accent-foreground">&lt;30s</div>
              <div className="mt-1 text-sm text-muted-foreground">Alert latency</div>
            </div>
            <div className="h-px w-full bg-border md:h-16 md:w-px" />
            <p className="text-center text-muted-foreground md:text-left">
              Discord alerts for crypto agents, Telegram notifications, or custom webhooks — delivered within seconds of on-chain activity.
              No more manual block explorer checks that don&apos;t scale.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-5xl scroll-mt-20 px-6 pt-32 md:pt-40">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Built for agent operators
          </h2>
          <p className="mt-3 text-muted-foreground">
            Everything you need to monitor, understand, and control your on-chain AI agents.
          </p>
        </div>
        <div className="mt-12">
          <FeatureGrid />
        </div>
      </section>

      {/* CLI / Developer section */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-32 md:pt-40">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Monitor from your terminal
          </h2>
          <p className="mt-3 text-muted-foreground">
            One install. Full visibility.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-2xl">
          <CliTerminal />
          <div className="mt-4 text-center">
            <Link
              href="/docs/cli"
              className="inline-flex items-center gap-1.5 text-sm text-accent-foreground transition-colors hover:text-accent-foreground/80"
            >
              View CLI docs &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-32 md:pt-40">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Works with</p>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-8">
          <a
            href="https://www.npmjs.com/package/@chainward/elizaos-plugin"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2.5 rounded-sm border border-border bg-background px-5 py-3 transition-all hover:border-accent-foreground/30"
          >
            <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-white">elizaOS</span>
            <span className="rounded-sm bg-accent-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">LIVE</span>
          </a>
          <a
            href="https://www.npmjs.com/package/@chainward/agentkit-plugin"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2.5 rounded-sm border border-border bg-background px-5 py-3 transition-all hover:border-accent-foreground/30"
          >
            <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-white">Coinbase AgentKit</span>
            <span className="rounded-sm bg-accent-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">LIVE</span>
          </a>
          <a
            href="https://www.npmjs.com/package/@chainward/virtuals-plugin"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2.5 rounded-sm border border-border bg-background px-5 py-3 transition-all hover:border-accent-foreground/30"
          >
            <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-white">Virtuals GAME</span>
            <span className="rounded-sm bg-accent-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">LIVE</span>
          </a>
        </div>
      </section>

      {/* Live Observatory Stats */}
      <ObservatoryStats />

      {/* Wallet Lookup CTA */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 pt-32 text-center md:pt-40">
        <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
          Research a wallet before you add it
        </h2>
        <p className="mt-3 text-muted-foreground">
          Inspect recent Base activity, balances, and gas spend before you promote a wallet into your monitored fleet.
        </p>
        <Link
          href="/wallet"
          className="mt-6 inline-flex items-center gap-2 rounded-sm border border-accent-foreground/30 px-6 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:bg-accent-foreground/10"
        >
          Open Wallet Research
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </section>

      {/* How it works */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-32 md:pt-40">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Up and running in 2 minutes
          </h2>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-8 md:grid-cols-3">
          {[
            {
              step: '01',
              title: 'Register your wallet',
              desc: 'Paste your agent\'s Base wallet address. No private keys needed.',
            },
            {
              step: '02',
              title: 'Watch activity flow in',
              desc: 'Every transaction, token transfer, and contract interaction — indexed in real time.',
            },
            {
              step: '03',
              title: 'Set up the first alert',
              desc: 'Start with a recommended failed-tx, gas-spike, or inactivity alert and route it to Discord, Telegram, or webhook.',
            },
          ].map((item) => (
            <div key={item.step} className="relative">
              <div className="font-mono text-xs text-accent-foreground/50">{item.step}</div>
              <h3 className="mt-2 text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 mx-auto max-w-5xl scroll-mt-20 px-6 pt-32 md:pt-40">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-3 text-muted-foreground">
            Pay with USDC on Base. No credit cards, no subscriptions middleman.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {/* Free — primary tier */}
          <div className="relative flex flex-col rounded-sm border border-accent-foreground/30 bg-background p-8">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-foreground px-3 py-0.5 text-xs font-semibold text-background">
              Start Here
            </div>
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white">Free</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-3xl font-bold text-white">$0</span>
              </div>
            </div>
            <ul className="mb-8 flex flex-1 flex-col gap-3 text-sm">
              <li className="text-muted-foreground">3 agents</li>
              <li className="text-muted-foreground">7-day history</li>
              <li className="text-muted-foreground">All alert types</li>
              <li className="text-muted-foreground">Discord &amp; Telegram</li>
              <li className="text-muted-foreground">Community support</li>
            </ul>
            <Link
              href="/login"
              rel="nofollow"
              className="block rounded-sm bg-primary px-6 py-2.5 text-center text-sm font-semibold text-white transition-all hover:bg-primary/90"
            >
              Get Started
            </Link>
          </div>

          {/* Operator — coming soon */}
          <div className="relative flex flex-col rounded-sm border border-border bg-background p-8 opacity-75">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-muted px-3 py-0.5 text-xs font-semibold text-muted-foreground">
              Coming Soon
            </div>
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white">Operator</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-3xl font-bold text-white">25</span>
                <span className="text-sm text-muted-foreground">USDC/mo</span>
              </div>
            </div>
            <ul className="mb-8 flex flex-1 flex-col gap-3 text-sm">
              <li className="text-muted-foreground">10 agents</li>
              <li className="text-muted-foreground">90-day history</li>
              <li className="text-muted-foreground">All alert types</li>
              <li className="text-muted-foreground">All channels + webhook</li>
              <li className="flex items-center gap-1.5 text-accent-foreground">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                API + CLI access
              </li>
            </ul>
            <button
              disabled
              className="block rounded-sm bg-muted px-6 py-2.5 text-center text-sm font-semibold text-muted-foreground cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>

          {/* Intelligence Brief */}
          <div className="flex flex-col rounded-sm border border-border bg-background p-8">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white">Intelligence Brief</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-3xl font-bold text-white">99</span>
                <span className="text-sm text-muted-foreground">USDC</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">one-time</p>
            </div>
            <ul className="mb-8 flex flex-1 flex-col gap-3 text-sm">
              <li className="text-muted-foreground">Custom fleet analysis</li>
              <li className="text-muted-foreground">Alert strategy setup</li>
              <li className="text-muted-foreground">Gas optimization review</li>
              <li className="text-muted-foreground">Written report delivery</li>
              <li className="text-muted-foreground">1:1 walkthrough call</li>
            </ul>
            <Link
              href="/login"
              rel="nofollow"
              className="block rounded-sm bg-primary px-6 py-2.5 text-center text-sm font-semibold text-white transition-all hover:bg-primary/90"
            >
              Request Brief &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-32 md:pb-32 md:pt-40">
        <div className="relative overflow-hidden rounded-sm border border-primary/30 bg-gradient-to-b from-background to-background p-12 text-center md:p-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(27,94,32,0.15),_transparent_70%)]" />
          <h2 className="relative text-2xl font-bold text-white md:text-4xl">
            Run your agents with an ops layer
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-muted-foreground">
            Join Base-first agent teams and get help setting up your first monitored wallet and alert flow.
          </p>
          <div className="relative mt-8">
            <Link
              href="/login"
              rel="nofollow"
              className="inline-flex items-center gap-2 rounded-sm bg-accent-foreground px-8 py-3.5 text-sm font-semibold text-background transition-all hover:bg-accent-foreground/90 hover:shadow-[0_0_40px_rgba(74,222,128,0.3)]"
            >
              Get Started
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* SEO summary — real HTML text for crawlers */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-16 pt-8 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          ChainWard is a Base-first operations dashboard for teams running on-chain agents. Monitor agent wallets,
          route failed-transaction and gas-spike alerts to Discord, Telegram, or webhooks, and track recent wallet
          behavior through the web app, API, TypeScript SDK, and CLI. Free tier available, paid plans in USDC on Base.
        </p>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border px-6 py-8 md:px-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chainward-logo.svg" alt="ChainWard" className="h-5 w-5" />
            <span>&copy; 2026 ChainWard</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/base" className="transition-colors hover:text-white">Observatory</Link>
            <Link href="/wallet" className="transition-colors hover:text-white">Wallet Lookup</Link>
            <Link href="/docs" className="transition-colors hover:text-white">Docs</Link>
            <a href="https://x.com/chainwardai" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">Twitter</a>
            <a href="mailto:hello@chainward.ai" className="transition-colors hover:text-white">Contact</a>
            <span className="text-accent-foreground/60">Built on Base</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
