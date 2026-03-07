export const metadata = { title: 'Alert Types — ChainWard Docs' };

const alertTypes = [
  {
    type: 'large_transfer',
    name: 'Large Transfer',
    desc: 'Triggers when a single transaction exceeds a USD value threshold.',
    defaultThreshold: '$500',
    unit: 'USD',
  },
  {
    type: 'balance_drop',
    name: 'Balance Drop',
    desc: 'Triggers when an agent\'s balance drops by a percentage within a lookback window.',
    defaultThreshold: '20% in 1 hour',
    unit: 'Percentage',
  },
  {
    type: 'gas_spike',
    name: 'Gas Spike',
    desc: 'Triggers when gas cost on a single transaction exceeds a threshold.',
    defaultThreshold: '$50',
    unit: 'USD',
  },
  {
    type: 'failed_tx',
    name: 'Failed Transaction',
    desc: 'Triggers on any reverted transaction. No threshold needed — any failure fires the alert.',
    defaultThreshold: 'Any failure',
    unit: 'N/A',
  },
  {
    type: 'inactivity',
    name: 'Inactivity',
    desc: 'Triggers when no transactions are detected within a lookback window. Useful for detecting stuck or crashed agents.',
    defaultThreshold: '24 hours',
    unit: 'Duration',
  },
  {
    type: 'new_contract',
    name: 'New Contract Interaction',
    desc: 'Triggers when an agent interacts with a contract address it has never transacted with before.',
    defaultThreshold: 'Any new contract',
    unit: 'N/A',
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
  "description": "0x3cAc...CBfA sent 2.5 ETH ($6,250) to 0xdead...beef",
  "walletAddress": "0x3cAc468EF749d75af4a864903a17D0870f38CBfA",
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
    <article className="max-w-none md:max-w-3xl">
      <h1 className="text-2xl font-bold text-white">Alert Types</h1>
      <p className="mt-2 text-[#a1a1aa]">
        ChainWard supports 6 alert types covering common failure modes for on-chain AI agents.
        Each alert can be delivered through multiple channels.
      </p>

      {/* Alert types */}
      <section className="mt-10 space-y-4">
        <h2 className="text-lg font-semibold text-white">Types</h2>
        {alertTypes.map((alert) => (
          <div key={alert.type} className="rounded-lg border border-[#1a1a2e] bg-[#0a0a0f] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white">{alert.name}</h3>
                  <code className="rounded bg-[#1a1a2e] px-1.5 py-0.5 font-mono text-xs text-[#4ade80]">
                    {alert.type}
                  </code>
                </div>
                <p className="mt-2 text-sm text-[#a1a1aa]">{alert.desc}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-[#71717a]">
              <span>
                Default: <span className="text-[#a1a1aa]">{alert.defaultThreshold}</span>
              </span>
              <span>
                Unit: <span className="text-[#a1a1aa]">{alert.unit}</span>
              </span>
            </div>
          </div>
        ))}
      </section>

      {/* Delivery channels */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-white">Delivery Channels</h2>
        <div className="mt-4 space-y-4">
          {channels.map((ch) => (
            <div key={ch.name} className="rounded-lg border border-[#1a1a2e] bg-[#0a0a0f] p-5">
              <h3 className="font-semibold text-white">{ch.name}</h3>
              <p className="mt-1 text-sm text-[#a1a1aa]">{ch.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Example payload */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-white">Example Webhook Payload</h2>
        <p className="mt-2 text-sm text-[#a1a1aa]">
          When using a custom webhook, ChainWard sends a POST request with the following JSON body:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md bg-[#111118] p-4 font-mono text-xs leading-relaxed text-[#e4e4e7]">
          {examplePayload}
        </pre>
      </section>

      <div className="mt-12 rounded-lg border border-[#1a1a2e] bg-[#0a0a0f] p-6">
        <h3 className="text-sm font-semibold text-white">Testing alerts</h3>
        <p className="mt-2 text-sm text-[#a1a1aa]">
          Each alert rule has a <strong className="text-white">Test</strong> button in the dashboard.
          This sends a sample payload to your configured delivery channel so you can verify
          the integration works. Test deliveries are rate-limited to 5 per minute.
        </p>
      </div>
    </article>
  );
}
