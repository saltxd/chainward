import Link from 'next/link';
import { cookies } from 'next/headers';
import { ActivityFeed } from '@/components/landing/activity-feed';
import { FeatureGrid } from '@/components/landing/feature-grid';

export default async function LandingPage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.has('chainward-session');

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050508]">
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
      <div className="pointer-events-none absolute -top-[400px] left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-[#1B5E20]/20 blur-[120px]" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#1B5E20]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="#4ade80" strokeWidth="1.5" fill="none" />
              <path d="M8 5L11 6.75V10.25L8 12L5 10.25V6.75L8 5Z" fill="#4ade80" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            Chain<span className="text-[#4ade80]">Ward</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Link
              href="/overview"
              className="rounded-md bg-[#1B5E20] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#2E7D32] hover:shadow-[0_0_20px_rgba(74,222,128,0.15)]"
            >
              Dashboard &rarr;
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-[#1B5E20] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#2E7D32] hover:shadow-[0_0_20px_rgba(74,222,128,0.15)]"
            >
              Connect Wallet
            </Link>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-20 text-center md:pt-32">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/5 px-4 py-1.5 text-xs text-[#4ade80]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade80] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4ade80]" />
          </span>
          Live on Base Mainnet
        </div>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-6xl lg:text-7xl">
          See everything your agents do{' '}
          <span className="bg-gradient-to-r from-[#4ade80] to-[#22c55e] bg-clip-text text-transparent">
            on-chain
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#a1a1aa] md:text-lg">
          Real-time monitoring, smart alerts, and gas analytics for autonomous AI agents
          operating on Base. Know what your agents are doing before it costs you.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className="group relative inline-flex items-center gap-2 rounded-lg bg-[#1B5E20] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-[#2E7D32] hover:shadow-[0_0_30px_rgba(74,222,128,0.2)]"
          >
            Start monitoring free
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
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-lg border border-[#27272a] px-8 py-3.5 text-sm font-medium text-[#a1a1aa] transition-all hover:border-[#3f3f46] hover:text-white"
          >
            Learn more &darr;
          </a>
        </div>

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
            <span className="text-[#a1a1aa]">Are you watching?</span>
          </h2>
          <p className="mt-4 text-[#71717a] md:text-base">
            Autonomous agents execute transactions 24/7. Without real-time visibility,
            a misconfigured strategy or unexpected market condition can drain wallets
            before you even notice.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-xl border border-[#1a1a2e] bg-[#0a0a0f] p-8 md:p-10">
          <div className="flex flex-col items-center gap-6 md:flex-row md:gap-10">
            <div className="shrink-0 text-center">
              <div className="text-4xl font-bold text-[#4ade80]">&lt;30s</div>
              <div className="mt-1 text-sm text-[#71717a]">Alert latency</div>
            </div>
            <div className="h-px w-full bg-[#1a1a2e] md:h-16 md:w-px" />
            <p className="text-center text-[#a1a1aa] md:text-left">
              Get notified via Discord, Telegram, or webhook within seconds of on-chain activity.
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
          <p className="mt-3 text-[#71717a]">
            Everything you need to monitor, understand, and control your on-chain AI agents.
          </p>
        </div>
        <div className="mt-12">
          <FeatureGrid />
        </div>
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
              title: 'Set up alerts',
              desc: 'Get notified on large transfers, gas spikes, failed txs, or inactivity via Discord or webhook.',
            },
          ].map((item) => (
            <div key={item.step} className="relative">
              <div className="font-mono text-xs text-[#4ade80]/50">{item.step}</div>
              <h3 className="mt-2 text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-[#71717a]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-32 md:pb-32 md:pt-40">
        <div className="relative overflow-hidden rounded-2xl border border-[#1B5E20]/30 bg-gradient-to-b from-[#0a0f0a] to-[#050508] p-12 text-center md:p-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(27,94,32,0.15),_transparent_70%)]" />
          <h2 className="relative text-2xl font-bold text-white md:text-4xl">
            Stop flying blind
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-[#a1a1aa]">
            Join teams monitoring their AI agents on Base with ChainWard.
            Free tier includes 3 agents with full alerting.
          </p>
          <div className="relative mt-8">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-[#4ade80] px-8 py-3.5 text-sm font-semibold text-[#050508] transition-all hover:bg-[#22c55e] hover:shadow-[0_0_40px_rgba(74,222,128,0.3)]"
            >
              Start monitoring free
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#1a1a2e] px-6 py-8 md:px-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2 text-sm text-[#71717a]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-[#1B5E20]">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="#4ade80" strokeWidth="1.5" fill="none" />
                <path d="M8 5L11 6.75V10.25L8 12L5 10.25V6.75L8 5Z" fill="#4ade80" />
              </svg>
            </div>
            <span>&copy; 2026 ChainWard</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#71717a]">
            <Link href="/docs" className="transition-colors hover:text-white">Docs</Link>
            <a href="https://x.com/chainwardai" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">Twitter</a>
            <a href="mailto:hello@chainward.ai" className="transition-colors hover:text-white">Contact</a>
            <span className="text-[#4ade80]/60">Built on Base</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
