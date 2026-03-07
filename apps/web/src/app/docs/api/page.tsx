export const metadata = { title: 'API Reference — ChainWard Docs' };

const endpoints = [
  {
    group: 'Agents',
    items: [
      {
        method: 'GET',
        path: '/api/agents',
        desc: 'List all your monitored agents.',
        curl: `curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/agents`,
        response: `{
  "success": true,
  "data": [
    {
      "id": 1,
      "walletAddress": "0x3cAc...",
      "chain": "base",
      "agentName": "My Trading Bot",
      "agentFramework": "agentkit",
      "createdAt": "2026-03-01T00:00:00Z"
    }
  ]
}`,
      },
      {
        method: 'GET',
        path: '/api/agents/:id',
        desc: 'Get details for a specific agent.',
        curl: `curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/agents/1`,
      },
      {
        method: 'POST',
        path: '/api/agents',
        desc: 'Register a new wallet address to monitor.',
        curl: `curl -X POST \\
  -H "Authorization: Bearer ag_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress":"0x...","chain":"base","agentName":"My Bot"}' \\
  https://api.chainward.ai/api/agents`,
        response: `{
  "success": true,
  "data": {
    "id": 1,
    "walletAddress": "0x...",
    "chain": "base",
    "agentName": "My Bot"
  }
}`,
      },
      {
        method: 'PATCH',
        path: '/api/agents/:id',
        desc: 'Update agent name, framework, or tags.',
        curl: `curl -X PATCH \\
  -H "Authorization: Bearer ag_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"agentName":"Renamed Bot","tags":["production"]}' \\
  https://api.chainward.ai/api/agents/1`,
      },
      {
        method: 'DELETE',
        path: '/api/agents/:id',
        desc: 'Remove an agent and stop monitoring its wallet.',
        curl: `curl -X DELETE \\
  -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/agents/1`,
      },
    ],
  },
  {
    group: 'Transactions',
    items: [
      {
        method: 'GET',
        path: '/api/transactions',
        desc: 'List transactions across your agents. Supports filtering and pagination.',
        curl: `curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  "https://api.chainward.ai/api/transactions?wallet=0x...&limit=50&offset=0"`,
        response: `{
  "success": true,
  "data": [...],
  "pagination": { "total": 142, "limit": 50, "offset": 0, "hasMore": true }
}`,
      },
      {
        method: 'GET',
        path: '/api/transactions/stats',
        desc: 'Transaction volume over time, bucketed by interval.',
        curl: `curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  "https://api.chainward.ai/api/transactions/stats?wallet=0x...&bucket=1h"`,
      },
    ],
  },
  {
    group: 'Alerts',
    items: [
      {
        method: 'GET',
        path: '/api/alerts',
        desc: 'List all alert configurations.',
        curl: `curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/alerts`,
        response: `{
  "success": true,
  "data": [
    {
      "id": 1,
      "walletAddress": "0x...",
      "chain": "base",
      "alertType": "large_transfer",
      "thresholdValue": "1000",
      "thresholdUnit": "usd",
      "channels": ["discord"],
      "enabled": true
    }
  ]
}`,
      },
      {
        method: 'POST',
        path: '/api/alerts',
        desc: 'Create a new alert. Types: large_transfer, balance_drop, gas_spike, failed_tx, inactivity, new_contract.',
        curl: `curl -X POST \\
  -H "Authorization: Bearer ag_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress":"0x...","chain":"base","alertType":"large_transfer","thresholdValue":"1000","thresholdUnit":"usd","channels":["discord"],"discordWebhook":"https://discord.com/api/webhooks/..."}' \\
  https://api.chainward.ai/api/alerts`,
      },
      {
        method: 'PATCH',
        path: '/api/alerts/:id',
        desc: 'Update an alert configuration (threshold, channels, enabled state).',
        curl: `curl -X PATCH \\
  -H "Authorization: Bearer ag_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"thresholdValue":"500","enabled":false}' \\
  https://api.chainward.ai/api/alerts/1`,
      },
      {
        method: 'DELETE',
        path: '/api/alerts/:id',
        desc: 'Delete an alert configuration.',
        curl: `curl -X DELETE \\
  -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/alerts/1`,
      },
      {
        method: 'POST',
        path: '/api/alerts/:id/test',
        desc: 'Send a test alert to verify your delivery channels. Rate limited to 5/min.',
        curl: `curl -X POST \\
  -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/alerts/1/test`,
      },
      {
        method: 'GET',
        path: '/api/alerts/events',
        desc: 'List alert event history with delivery status.',
        curl: `curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  "https://api.chainward.ai/api/alerts/events?limit=20&offset=0"`,
      },
    ],
  },
  {
    group: 'Data',
    items: [
      {
        method: 'GET',
        path: '/api/stats/overview',
        desc: 'Fleet-wide stats: total agents, transactions, gas spend, balance.',
        curl: `curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/stats/overview`,
      },
      {
        method: 'GET',
        path: '/api/stats/agents/:id',
        desc: 'Per-agent stats: transaction count, gas, balance, last activity.',
        curl: `curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/stats/agents/1`,
      },
      {
        method: 'GET',
        path: '/api/balances/latest',
        desc: 'Latest balance snapshot for each agent.',
        curl: `curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/balances/latest`,
      },
      {
        method: 'GET',
        path: '/api/balances/history',
        desc: 'Historical balance data for charting. Params: wallet, from, to, bucket (1h or 1d).',
        curl: `curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  "https://api.chainward.ai/api/balances/history?wallet=0x...&bucket=1h"`,
      },
      {
        method: 'GET',
        path: '/api/gas/analytics',
        desc: 'Gas spend analytics over time. Params: wallet, from, to, bucket.',
        curl: `curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/gas/analytics`,
      },
    ],
  },
];

export default function ApiReferencePage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-2xl font-bold text-white">API Reference</h1>
      <p className="mt-2 text-[#a1a1aa]">
        Programmatic access to ChainWard. All endpoints require authentication.
      </p>

      {/* Auth section */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">Authentication</h2>
        <div className="mt-4 space-y-3 text-sm text-[#a1a1aa]">
          <p>
            <strong className="text-white">Base URL:</strong>{' '}
            <code className="rounded bg-[#1a1a2e] px-1.5 py-0.5 font-mono text-[#4ade80]">
              https://api.chainward.ai
            </code>
          </p>
          <p>
            All API endpoints accept two authentication methods:
          </p>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-[#4ade80]/20 bg-[#0a0a0f] p-5">
            <h3 className="text-sm font-semibold text-[#4ade80]">API Key (recommended)</h3>
            <p className="mt-2 text-sm text-[#a1a1aa]">
              Generate an API key in{' '}
              <a href="/settings" className="text-[#4ade80] underline underline-offset-2 hover:text-[#22c55e]">Settings</a>.
              Keys use the <code className="rounded bg-[#1a1a2e] px-1.5 py-0.5 font-mono text-[#4ade80]">ag_</code> prefix
              and are shown only once at creation.
            </p>
            <CodeBlock>{`curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/agents`}</CodeBlock>
          </div>

          <div className="rounded-lg border border-[#1a1a2e] bg-[#0a0a0f] p-5">
            <h3 className="text-sm font-semibold text-white">Session Cookie</h3>
            <p className="mt-2 text-sm text-[#a1a1aa]">
              When signed in via the dashboard, a{' '}
              <code className="rounded bg-[#1a1a2e] px-1.5 py-0.5 font-mono text-[#4ade80]">chainward-session</code>{' '}
              JWT cookie is set automatically. Browser requests include this cookie by default.
            </p>
          </div>
        </div>
      </section>

      {/* SDK section */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">TypeScript SDK</h2>
        <div className="mt-4 text-sm text-[#a1a1aa]">
          <p>Install the SDK for typed access to all endpoints:</p>
          <CodeBlock>{`npm install @chainward/sdk`}</CodeBlock>
          <CodeBlock>{`import { ChainWard } from '@chainward/sdk';

const cw = new ChainWard({ apiKey: 'ag_YOUR_KEY' });

// Register an agent
await cw.agents.register({ chain: 'base', wallet: '0x...' });

// List transactions
const txs = await cw.transactions.list({ limit: 50 });

// Create an alert
await cw.alerts.create({
  wallet: '0x...',
  type: 'large_transfer',
  threshold: 1000,
  channels: ['discord'],
  discordWebhook: 'https://discord.com/api/webhooks/...',
});`}</CodeBlock>
        </div>
      </section>

      {/* Endpoints */}
      <section className="mt-12 space-y-12">
        <h2 className="text-lg font-semibold text-white">Endpoints</h2>
        {endpoints.map((group) => (
          <div key={group.group}>
            <h3 className="mb-4 text-base font-semibold text-white">{group.group}</h3>
            <div className="space-y-6">
              {group.items.map((ep) => (
                <div key={`${ep.method} ${ep.path}`} className="rounded-lg border border-[#1a1a2e] bg-[#0a0a0f]">
                  <div className="flex items-center gap-3 border-b border-[#1a1a2e] px-5 py-3">
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${
                        ep.method === 'GET'
                          ? 'bg-blue-500/10 text-blue-400'
                          : ep.method === 'POST'
                            ? 'bg-green-500/10 text-green-400'
                            : ep.method === 'DELETE'
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-yellow-500/10 text-yellow-400'
                      }`}
                    >
                      {ep.method}
                    </span>
                    <code className="font-mono text-sm text-white">{ep.path}</code>
                  </div>
                  <div className="p-5">
                    <p className="text-sm text-[#a1a1aa]">{ep.desc}</p>
                    <div className="mt-4">
                      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[#71717a]">
                        Example
                      </div>
                      <CodeBlock>{ep.curl}</CodeBlock>
                    </div>
                    {ep.response && (
                      <div className="mt-4">
                        <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[#71717a]">
                          Response
                        </div>
                        <CodeBlock>{ep.response}</CodeBlock>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="mt-12 rounded-lg border border-[#1a1a2e] bg-[#0a0a0f] p-6">
        <h3 className="text-sm font-semibold text-white">Rate limits</h3>
        <p className="mt-2 text-sm text-[#a1a1aa]">
          API requests are rate-limited to 100 requests per minute per session.
          Rate limit headers are included in all responses.
        </p>
      </div>
    </article>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-[#111118] p-4 font-mono text-xs leading-relaxed text-[#e4e4e7]">
      {children}
    </pre>
  );
}
