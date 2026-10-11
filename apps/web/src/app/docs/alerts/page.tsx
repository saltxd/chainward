import { CodeBlock } from '@/components/press';

export const metadata = {
  title: 'Alert Types',
  description:
    '7 alert types for AI agent wallets: large transfers, gas spikes, failed transactions, balance drops, new contracts, inactivity, and idle balance. Delivered via Discord, Telegram, or webhook.',
  alternates: { canonical: 'https://chainward.ai/docs/alerts' },
  openGraph: {
    title: 'Alert Types | ChainWard Docs',
    description: '7 alert types for AI agent wallets delivered via Discord, Telegram, or webhook.',
    images: [{ url: '/chainward-og-card.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Alert Types | ChainWard Docs',
    description: '7 alert types for AI agent wallets delivered via Discord, Telegram, or webhook.',
    images: ['/chainward-og-card.png'],
  },
};

const alertTypes = [
  {
    type: 'large_transfer',
    name: 'Large Transfer',
    desc: 'Fires when a single transaction moves at least a set USD amount.',
    setting: 'USD amount. The dashboard starts at $500.',
  },
  {
    type: 'balance_drop',
    name: 'Balance Drop',
    desc: "Fires when an agent's total balance falls by a set percentage within a lookback window.",
    setting: 'Percent and window. Default 20% in 1 hour.',
  },
  {
    type: 'gas_spike',
    name: 'Gas Spike',
    desc: 'Fires when the gas cost of a single transaction reaches a set USD amount.',
    setting: 'USD amount. The dashboard preset is $25.',
  },
  {
    type: 'failed_tx',
    name: 'Failed Transaction',
    desc: 'Fires on any reverted (failed) transaction.',
    setting: 'None: any failure fires.',
  },
  {
    type: 'inactivity',
    name: 'Inactivity',
    desc: 'Fires when no transactions are seen within a lookback window. Useful for catching stuck or crashed agents.',
    setting: 'Window. Default 24 hours.',
  },
  {
    type: 'new_contract',
    name: 'New Contract Interaction',
    desc: 'Fires when an agent interacts with a contract address it has never transacted with before.',
    setting: 'None: any new contract fires.',
  },
  {
    type: 'idle_balance',
    name: 'Idle Balance',
    desc: 'Fires when the balance stays above a set USD amount with no outgoing transactions for a set time. Catches unused money sitting in agent wallets.',
    setting: 'USD amount and idle time. Default $50 for 24 hours.',
  },
];

const channels = [
  {
    name: 'Discord webhook',
    desc: 'Posts to a Discord channel through its webhook URL, as an embed with the transaction details.',
  },
  {
    name: 'Telegram',
    desc: 'Sends a message to a Telegram chat through the ChainWard bot. Provide your chat ID.',
  },
  {
    name: 'Custom webhook',
    desc: 'Sends a POST request with the JSON payload below to any public HTTPS URL you choose.',
  },
];

const examplePayload = `{
  "type": "large_transfer",
  "severity": "warning",
  "agent": {
    "name": "My Trading Bot",
    "wallet": "0xYourAgentWalletAddress",
    "chain": "base"
  },
  "trigger": {
    "value": 6250,
    "unit": "usd",
    "threshold": null,
    "tx_hash": "0xabc123..."
  },
  "timestamp": "2026-03-03T14:30:00Z",
  "dashboard_url": "https://chainward.ai/agents"
}`;

export default function AlertTypesPage() {
  return (
    <article className="decode-prose">
      <h1>Alert Types</h1>
      <p>
        ChainWard has 7 alert types covering the common ways an on-chain AI agent goes
        wrong. Each alert can go to one or more channels.
      </p>

      <h2>Types</h2>
      <div className="decode-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Setting</th>
            </tr>
          </thead>
          <tbody>
            {alertTypes.map((a) => (
              <tr key={a.type}>
                <td>
                  <strong>{a.name}</strong>
                  <br />
                  <span style={{ color: 'var(--ink-faint)' }}>{a.desc}</span>
                </td>
                <td>
                  <code>{a.type}</code>
                </td>
                <td>{a.setting}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Through the API, a large transfer or gas spike alert with no threshold fires on
        every transaction, so set one. The window is the <code>lookbackWindow</code>{' '}
        field, for example <code>&quot;24 hours&quot;</code>.
      </p>

      <h2>Delivery channels</h2>
      <ul>
        {channels.map((ch) => (
          <li key={ch.name}>
            <strong>{ch.name}</strong>: {ch.desc}
          </li>
        ))}
      </ul>

      <h2>Example webhook payload</h2>
      <p>
        With a custom webhook, ChainWard sends a POST request with this JSON body:
      </p>
      <CodeBlock>{examplePayload}</CodeBlock>
      <ul>
        <li>
          <code>severity</code> is <code>info</code>, <code>warning</code> or{' '}
          <code>critical</code>. Test alerts are <code>info</code>.
        </li>
        <li>
          <code>trigger.value</code> depends on the type: the USD amount for{' '}
          <code>large_transfer</code>, <code>gas_spike</code> and{' '}
          <code>idle_balance</code>; the percent drop for <code>balance_drop</code>; hours
          since the last transaction for <code>inactivity</code>; <code>null</code> for{' '}
          <code>failed_tx</code> and <code>new_contract</code>.
        </li>
        <li>
          <code>trigger.unit</code> currently reads <code>usd</code> for every type and{' '}
          <code>trigger.threshold</code> is always <code>null</code>, so read the value
          by <code>type</code>.
        </li>
        <li>
          <code>tx_hash</code> is the transaction that fired the alert, or{' '}
          <code>null</code> for alerts that are not about one transaction.
        </li>
      </ul>

      <blockquote>
        <p>
          <strong>Testing alerts.</strong> Each alert has a Test button in the
          dashboard (or call <code>POST /api/alerts/:id/test</code>). It sends a sample
          alert to your channels so you can check they work. Up to 5 tests a minute.
        </p>
      </blockquote>
    </article>
  );
}
