import { CodeBlock, Badge } from '@/components/v2';

export const metadata = {
  title: 'API Reference',
  description:
    'ChainWard REST API reference. Endpoints for managing agents, transactions, alerts, balances, and gas analytics. TypeScript SDK included.',
  alternates: { canonical: 'https://chainward.ai/docs/api' },
  openGraph: {
    title: 'API Reference — ChainWard Docs',
    description: 'ChainWard REST API reference for AI agent wallet monitoring on Base.',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
};

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const methodTone: Record<Method, 'cyan' | 'phosphor' | 'amber' | 'danger'> = {
  GET: 'cyan',
  POST: 'phosphor',
  PATCH: 'amber',
  DELETE: 'danger',
};

interface Endpoint {
  method: Method;
  path: string;
  desc: string;
  curl: string;
  response?: string;
}

const endpoints: Array<{ group: string; items: Endpoint[] }> = [
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
        desc: 'Create a new alert. Types: large_transfer, balance_drop, gas_spike, failed_tx, inactivity, new_contract, idle_balance.',
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
    <article className="decode-prose">
      <h1>API Reference</h1>
      <p>Programmatic access to ChainWard. All endpoints require authentication.</p>

      <h2>Authentication</h2>
      <p>
        <strong>Base URL:</strong> <code>https://api.chainward.ai</code>
      </p>
      <p>All API endpoints accept two authentication methods:</p>

      <h3>API key (recommended)</h3>
      <p>
        Generate an API key in <a href="/settings">Settings</a>. Keys use the{' '}
        <code>ag_</code> prefix and are shown only once at creation.
      </p>
      <CodeBlock>{`curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/agents`}</CodeBlock>

      <h3>Session cookie</h3>
      <p>
        When signed in via the dashboard, a <code>chainward-session</code> JWT cookie
        is set automatically. Browser requests include this cookie by default.
      </p>

      <h2>TypeScript SDK</h2>
      <p>Install the SDK for typed access to every endpoint:</p>
      <CodeBlock>npm install @chainward/sdk</CodeBlock>
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

      <h2>Endpoints</h2>
      {endpoints.map((group) => (
        <section key={group.group}>
          <h3>{group.group}</h3>
          {group.items.map((ep) => (
            <div
              key={`${ep.method} ${ep.path}`}
              className="v2-api-endpoint"
              style={{
                border: '1px solid var(--line)',
                background: 'var(--bg-1)',
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <Badge tone={methodTone[ep.method]}>{ep.method}</Badge>
                <code
                  className="v2-code-inline"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--fg)',
                    padding: 0,
                  }}
                >
                  {ep.path}
                </code>
              </div>
              <div style={{ padding: '16px' }}>
                <p style={{ marginBottom: 16 }}>{ep.desc}</p>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    marginBottom: 6,
                  }}
                >
                  Example
                </div>
                <CodeBlock>{ep.curl}</CodeBlock>
                {ep.response && (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'var(--muted)',
                        margin: '16px 0 6px',
                      }}
                    >
                      Response
                    </div>
                    <CodeBlock>{ep.response}</CodeBlock>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      ))}

      <blockquote>
        <p>
          <strong>Rate limits.</strong> API requests are rate-limited to 100
          requests per minute per session. Rate limit headers are included in every
          response.
        </p>
      </blockquote>
    </article>
  );
}
