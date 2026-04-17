export const metadata = {
  title: 'Getting Started',
  description:
    'Set up AI agent wallet monitoring on Base in under 2 minutes. Connect your wallet, register agent addresses, and configure real-time transaction alerts.',
  alternates: { canonical: 'https://chainward.ai/docs' },
  openGraph: {
    title: 'Getting Started — ChainWard Docs',
    description: 'Set up AI agent wallet monitoring on Base in under 2 minutes.',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
};

export default function DocsPage() {
  return (
    <article className="decode-prose">
      <h1>Getting Started</h1>
      <p>
        Get up and running with ChainWard in under 2 minutes. Monitor any Base wallet
        address in real time — transactions, balances, gas, and alerts.
      </p>

      <h2>1. Connect your wallet</h2>
      <p>
        Click <strong>./connect</strong> in the nav (or hit the{' '}
        <a href="/login">login page</a>). ChainWard supports MetaMask, Coinbase
        Wallet, and WalletConnect-compatible wallets. You&apos;ll sign a message to
        prove ownership — no private keys leave your wallet, no email, no password.
      </p>

      <h2>2. Register an agent wallet</h2>
      <p>
        Navigate to <strong>Agents</strong> and click <strong>Add Agent</strong>.
        Paste any Base wallet address you want to monitor. Give it a name so you can
        find it in the dashboard.
      </p>
      <p>
        ChainWard sets up indexing automatically. New transactions are picked up
        in under 30 seconds.
      </p>

      <h2>3. View your dashboard</h2>
      <p>
        The <strong>Overview</strong> page shows fleet-level stats across every
        monitored agent — transaction counts, gas spend, and balance changes. Data
        refreshes live as new on-chain activity is detected.
      </p>

      <h2>4. Browse transactions</h2>
      <p>
        The <strong>Transactions</strong> page lists every indexed transaction with
        hash, method, gas cost (ETH and USD), and status. Click any row to see full
        detail, including token transfers and contract interactions.
      </p>

      <h2>5. Set up alerts</h2>
      <p>
        Head to <strong>Alerts</strong> to configure notifications. Pick from 7
        alert types — large transfers, balance drops, gas spikes, failed
        transactions, inactivity, new contract interactions, and idle balance.
        Deliver via Discord, Telegram, or custom webhook.
      </p>
      <p>
        See <a href="/docs/alerts">Alert Types</a> for details on each type and
        example payloads.
      </p>

      <blockquote>
        <p>
          <strong>Free tier.</strong> Monitor up to 3 agent wallets with full
          alerting and real-time indexing. No credit card, no email, no lock-in.
        </p>
      </blockquote>
    </article>
  );
}
