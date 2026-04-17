import { CodeBlock } from '@/components/v2';

export const metadata = {
  title: 'Alert Types',
  description:
    '7 alert types for AI agent wallets: large transfers, gas spikes, failed transactions, balance drops, new contracts, inactivity, and idle balance. Delivered via Discord, Telegram, or webhook.',
  alternates: { canonical: 'https://chainward.ai/docs/alerts' },
  openGraph: {
    title: 'Alert Types — ChainWard Docs',
    description: '7 alert types for AI agent wallets delivered via Discord, Telegram, or webhook.',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
};

const alertTypes = [
  {
    type: 'large_transfer',
    name: 'Large Transfer',
    desc: 'Fires when a single transaction exceeds a USD value threshold.',
    defaultThreshold: '$500',
    unit: 'USD',
  },
  {
    type: 'balance_drop',
    name: 'Balance Drop',
    desc: "Fires when an agent's balance drops by a percentage within a lookback window.",
    defaultThreshold: '20% in 1 hour',
    unit: 'Percentage',
  },
  {
    type: 'gas_spike',
    name: 'Gas Spike',
    desc: 'Fires when gas cost on a single transaction exceeds a threshold.',
    defaultThreshold: '$50',
    unit: 'USD',
  },
  {
    type: 'failed_tx',
    name: 'Failed Transaction',
    desc: 'Fires on any reverted transaction. No threshold needed — any failure fires the alert.',
    defaultThreshold: 'Any failure',
    unit: 'N/A',
  },
  {
    type: 'inactivity',
    name: 'Inactivity',
    desc: 'Fires when no transactions are detected within a lookback window. Useful for detecting stuck or crashed agents.',
    defaultThreshold: '24 hours',
    unit: 'Duration',
  },
  {
    type: 'new_contract',
    name: 'New Contract Interaction',
    desc: 'Fires when an agent interacts with a contract address it has never transacted with before.',
    defaultThreshold: 'Any new contract',
    unit: 'N/A',
  },
  {
    type: 'idle_balance',
    name: 'Idle Balance',
    desc: 'Fires when token balance stays above a USD threshold with no outgoing transactions for a specified duration. Detects unused capital sitting in agent wallets.',
    defaultThreshold: '$50 for 24 hours',
    unit: 'USD + Duration',
  },
];

const channels = [
  {
    name: 'Discord Webhook',
    desc: 'Send alerts to a Discord channel via webhook URL. Alerts appear as rich embeds with transaction details.',
  },
  {
    name: 'Telegram',
    desc: 'Send alerts to a Telegram chat via Bot API. Provide your chat ID.',
  },
  {
    name: 'Custom Webhook',
    desc: 'Send a POST request with the alert payload to any URL you specify. Ideal for custom integrations.',
  },
];

const examplePayload = `{
  "alertType": "large_transfer",
  "severity": "warning",
  "title": "Large transfer detected",
  "description": "0xYOUR...WALLET sent 2.5 ETH ($6,250) to 0xdead...beef",
  "walletAddress": "0xYourAgentWalletAddress",
  "chain": "base",
  "transactionHash": "0xabc123...",
  "timestamp": "2026-03-03T14:30:00Z",
  "metadata": {
    "valueUsd": 6250,
    "valueEth": 2.5,
    "to": "0xdead...beef"
  }
}`;

export default function AlertTypesPage() {
  return (
    <article className="decode-prose">
      <h1>Alert Types</h1>
      <p>
        ChainWard supports 7 alert types covering common failure modes for on-chain
        AI agents. Every alert can be delivered through multiple channels.
      </p>

      <h2>Types</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Key</th>
            <th>Default</th>
            <th>Unit</th>
          </tr>
        </thead>
        <tbody>
          {alertTypes.map((a) => (
            <tr key={a.type}>
              <td>
                <strong>{a.name}</strong>
                <br />
                <span style={{ color: 'var(--muted)' }}>{a.desc}</span>
              </td>
              <td>
                <code>{a.type}</code>
              </td>
              <td>{a.defaultThreshold}</td>
              <td>{a.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Delivery Channels</h2>
      <ul>
        {channels.map((ch) => (
          <li key={ch.name}>
            <strong>{ch.name}</strong> — {ch.desc}
          </li>
        ))}
      </ul>

      <h2>Example Webhook Payload</h2>
      <p>
        When using a custom webhook, ChainWard sends a POST request with the
        following JSON body:
      </p>
      <CodeBlock>{examplePayload}</CodeBlock>

      <blockquote>
        <p>
          <strong>Testing alerts.</strong> Each alert rule has a{' '}
          <strong>Test</strong> button in the dashboard. This sends a sample payload
          to your configured delivery channel so you can verify the integration
          works. Test deliveries are rate-limited to 5 per minute.
        </p>
      </blockquote>
    </article>
  );
}
