import { Badge } from '@/components/v2';
import { CodeBlock } from '@/components/press';

export const metadata = {
  title: 'API Reference',
  description:
    'ChainWard monitoring API reference. Endpoints for managing agents, transactions, alerts, balances, and gas analytics. TypeScript SDK included.',
  alternates: { canonical: 'https://chainward.ai/docs/api' },
  openGraph: {
    title: 'API Reference | ChainWard Docs',
    description: 'ChainWard REST API reference for AI agent wallet monitoring on Base.',
    images: [{ url: '/chainward-og-card.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'API Reference | ChainWard Docs',
    description: 'ChainWard REST API reference for AI agent wallet monitoring on Base.',
    images: ['/chainward-og-card.png'],
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
        desc: 'Create a new alert. alertType is one of large_transfer, balance_drop, gas_spike, failed_tx, inactivity, new_contract, idle_balance (see Alert Types). thresholdUnit is usd, native or percentage. lookbackWindow (for example "24 hours") sets the window for balance_drop and inactivity, and how long the balance must sit idle for idle_balance. channels takes discord, telegram and webhook, with discordWebhook, telegramChatId and webhookUrl.',
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
      <p>
        The monitoring API manages the agent wallets you watch from the dashboard. Every
        endpoint on this page needs your API key or a signed-in session; without one it
        answers <code>401</code>. The free public checks are on the{' '}
        <a href="/docs">Public API</a> page.
      </p>

      <h2>Authentication</h2>
      <p>
        <strong>Base URL:</strong> <code>https://api.chainward.ai</code>
      </p>
      <p>Every endpoint accepts either of two credentials:</p>

      <h3>API key (recommended)</h3>
      <p>
        Generate an API key in <a href="/settings">Settings</a> (sign in with your
        wallet first). Keys start with <code>ag_</code> and are shown only once, when
        you create them. A key with the <code>read</code> scope can make GET requests;
        POST, PATCH and DELETE need <code>write</code>, or the API answers{' '}
        <code>403</code>.
      </p>
      <CodeBlock>{`curl -H "Authorization: Bearer ag_YOUR_KEY" \\
  https://api.chainward.ai/api/agents`}</CodeBlock>

      <h3>Session cookie</h3>
      <p>
        When you sign in on the dashboard, a <code>chainward-session</code> cookie is
        set. Browser requests send it automatically.
      </p>

      <h2>TypeScript SDK</h2>
      <p>Install the SDK for typed access to agents, transactions and alerts:</p>
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
            <div key={`${ep.method} ${ep.path}`} className="docs-endpoint">
              <div className="docs-endpoint-head">
                <Badge tone={methodTone[ep.method]}>{ep.method}</Badge>
                <code className="docs-endpoint-path">{ep.path}</code>
              </div>
              <div className="docs-endpoint-body">
                <p>{ep.desc}</p>
                <div className="press-label docs-endpoint-label">Example</div>
                <CodeBlock>{ep.curl}</CodeBlock>
                {ep.response && (
                  <>
                    <div className="press-label docs-endpoint-label">Response</div>
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
          <strong>Rate limits.</strong> 100 requests a minute per IP address. Every
          response carries <code>X-RateLimit-Limit</code>,{' '}
          <code>X-RateLimit-Remaining</code> and <code>X-RateLimit-Reset</code> headers.
        </p>
      </blockquote>
    </article>
  );
}
