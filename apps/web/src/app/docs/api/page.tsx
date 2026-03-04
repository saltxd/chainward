export const metadata = { title: 'API Reference — ChainWard Docs' };

const endpoints = [
  {
    method: 'GET',
    path: '/api/agents',
    desc: 'List all your monitored agents.',
    curl: `curl -b "chainward-session=YOUR_JWT" \\
  https://api.chainward.ai/api/agents`,
    response: `{
  "success": true,
  "data": [
    {
      "id": 1,
      "walletAddress": "0x3cAc...",
      "chain": "base",
      "agentName": "My Trading Bot",
      "createdAt": "2026-03-01T00:00:00Z"
    }
  ]
}`,
  },
  {
    method: 'GET',
    path: '/api/agents/:id',
    desc: 'Get details for a specific agent.',
    curl: `curl -b "chainward-session=YOUR_JWT" \\
  https://api.chainward.ai/api/agents/1`,
  },
  {
    method: 'POST',
    path: '/api/agents',
    desc: 'Register a new wallet address to monitor.',
    curl: `curl -X POST \\
  -b "chainward-session=YOUR_JWT" \\
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
    method: 'DELETE',
    path: '/api/agents/:id',
    desc: 'Remove an agent and stop monitoring its wallet.',
    curl: `curl -X DELETE \\
  -b "chainward-session=YOUR_JWT" \\
  https://api.chainward.ai/api/agents/1`,
  },
  {
    method: 'GET',
    path: '/api/transactions',
    desc: 'List transactions for a wallet. Supports pagination.',
    curl: `curl -b "chainward-session=YOUR_JWT" \\
  "https://api.chainward.ai/api/transactions?wallet=0x...&limit=50&offset=0"`,
    response: `{
  "success": true,
  "transactions": [...],
  "total": 142,
  "limit": 50,
  "offset": 0
}`,
  },
  {
    method: 'GET',
    path: '/api/stats/overview',
    desc: 'Fleet-wide stats across all your agents.',
    curl: `curl -b "chainward-session=YOUR_JWT" \\
  https://api.chainward.ai/api/stats/overview`,
  },
  {
    method: 'GET',
    path: '/api/balances/history',
    desc: 'Historical balance data points for charting.',
    curl: `curl -b "chainward-session=YOUR_JWT" \\
  "https://api.chainward.ai/api/balances/history?walletAddress=0x..."`,
  },
  {
    method: 'GET',
    path: '/api/gas/analytics',
    desc: 'Gas spend analytics for your agents.',
    curl: `curl -b "chainward-session=YOUR_JWT" \\
  https://api.chainward.ai/api/gas/analytics`,
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
            API endpoints are authenticated via your session cookie. When you sign in with your wallet,
            a{' '}
            <code className="rounded bg-[#1a1a2e] px-1.5 py-0.5 font-mono text-[#4ade80]">chainward-session</code>{' '}
            JWT cookie is set automatically. Browser requests include this cookie by default.
          </p>
          <p>
            For programmatic access (scripts, bots), pass the cookie value with{' '}
            <code className="rounded bg-[#1a1a2e] px-1.5 py-0.5 font-mono text-[#4ade80]">-b</code> in curl:
          </p>
          <CodeBlock>{`curl -b "chainward-session=YOUR_JWT_TOKEN" \\
  https://api.chainward.ai/api/agents`}</CodeBlock>
          <p>
            You can find your JWT token in your browser&apos;s cookies under{' '}
            <code className="rounded bg-[#1a1a2e] px-1.5 py-0.5 font-mono text-[#4ade80]">chainward-session</code>.
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-[#4ade80]/20 bg-[#4ade80]/5 p-4">
          <p className="text-sm text-[#4ade80]">
            <strong>Coming soon:</strong> API key authentication (<code className="font-mono">ag_</code> prefix).
            Generate keys in Settings and use{' '}
            <code className="font-mono">Authorization: Bearer ag_YOUR_KEY</code> for
            programmatic access without browser sessions.
          </p>
        </div>
      </section>

      {/* Endpoints */}
      <section className="mt-12 space-y-10">
        <h2 className="text-lg font-semibold text-white">Endpoints</h2>
        {endpoints.map((ep) => (
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
