export const metadata = { title: 'Getting Started — ChainWard Docs' };

export default function DocsPage() {
  return (
    <article className="prose-invert max-w-none md:max-w-3xl">
      <h1 className="text-2xl font-bold text-white">Getting Started</h1>
      <p className="mt-2 text-[#a1a1aa]">
        Get up and running with ChainWard in under 2 minutes. Monitor any Base wallet address in real time.
      </p>

      <div className="mt-10 space-y-10">
        <Step num="1" title="Connect your wallet">
          <p>
            Click <strong>Connect Wallet</strong> on the landing page. ChainWard supports MetaMask,
            Coinbase Wallet, and WalletConnect-compatible wallets. You&apos;ll sign a message to prove
            ownership &mdash; no private keys are ever shared.
          </p>
        </Step>

        <Step num="2" title="Register an agent wallet">
          <p>
            Navigate to <strong>Agents</strong> and click <strong>Add Agent</strong>. Paste any Base wallet
            address you want to monitor. Give it a name to identify it in your dashboard.
          </p>
          <p className="mt-2">
            ChainWard automatically sets up an Alchemy webhook to index all transactions for this address.
          </p>
        </Step>

        <Step num="3" title="View your dashboard">
          <p>
            The <strong>Overview</strong> page shows fleet-level stats across all your monitored agents.
            Transaction counts, gas spend, and balance changes update in real time as new on-chain
            activity is detected.
          </p>
        </Step>

        <Step num="4" title="Browse transactions">
          <p>
            The <strong>Transactions</strong> page lists every indexed transaction with hash, method,
            gas cost (ETH + USD), and status. Click any transaction to see full details including
            token transfers and contract interactions.
          </p>
        </Step>

        <Step num="5" title="Set up alerts">
          <p>
            Go to <strong>Alerts</strong> to configure notifications. Choose from 6 alert types (large
            transfers, balance drops, gas spikes, failed transactions, inactivity, and new contract
            interactions). Deliver alerts via Discord, Telegram, or custom webhook.
          </p>
          <p className="mt-2">
            See <a href="/docs/alerts" className="text-[#4ade80] underline underline-offset-2 hover:text-[#22c55e]">Alert Types</a> for
            details on each type and example payloads.
          </p>
        </Step>
      </div>

      <div className="mt-12 rounded-lg border border-[#1a1a2e] bg-[#0a0a0f] p-6">
        <h3 className="text-sm font-semibold text-white">Free tier</h3>
        <p className="mt-2 text-sm text-[#a1a1aa]">
          Monitor up to 3 agent wallets with full alerting and real-time indexing. No credit card required.
        </p>
      </div>
    </article>
  );
}

function Step({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#4ade80]/30 font-mono text-sm text-[#4ade80]">
        {num}
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-[#a1a1aa]">{children}</div>
      </div>
    </div>
  );
}
