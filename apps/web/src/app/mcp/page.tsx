import Link from 'next/link';
import { cookies } from 'next/headers';
import { PageShell, NavBar, StatusTicker, Button } from '@/components/v2';

export const metadata = {
  title: 'ChainWard MCP — read-side intel for your AI assistant',
  description:
    'Pair ChainWard with any MCP-compatible AI assistant (Claude Desktop, Cursor, Claude Code, Codex). Eight tools your agent can call before signing any transaction on Base.',
  alternates: { canonical: 'https://chainward.ai/mcp' },
  openGraph: {
    title: 'ChainWard MCP — read-side intel for your AI assistant',
    description:
      'npx -y chainward-mcp-server — labeled agent wallets, ACP economics, Decodes corpus, queryable from any MCP client.',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
};

const TOOLS = [
  { name: 'lookup_agent', desc: 'Is 0x… a known AI agent? Returns label, framework, ACP profile, related Decodes. Cheap.' },
  { name: 'get_agent_profile', desc: '24h/7d stats, hourly balance history, daily gas, 20 most recent transactions, matching Decodes.' },
  { name: 'get_agent_economics', desc: 'ACP revenue, aGDP, jobs, success rate, gas efficiency, 30-day P&L.' },
  { name: 'get_observatory_overview', desc: 'Ecosystem-wide stats: agents tracked, gas burned, portfolio value, recent volume.' },
  { name: 'get_top_agents', desc: 'Leaderboard by activity. Who is doing what on Base, ranked.' },
  { name: 'get_activity_feed', desc: 'Live feed of labeled-agent transactions across the ecosystem.' },
  { name: 'list_decodes', desc: 'Every published ChainWard Decode, newest first. Each with its target addresses.' },
  { name: 'find_decodes_for_address', desc: 'Has ChainWard written about 0x…? Returns matching Decode URLs.' },
];

export default async function McpPage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.has('chainward-session');

  return (
    <PageShell>
      <StatusTicker />

      <div className="v2-shell">
        <NavBar
          ctaHref={isAuthenticated ? '/overview' : '/login'}
          ctaLabel={isAuthenticated ? 'dashboard' : './connect'}
        />

        {/* Hero */}
        <section className="v2-mcp-hero">
          <div className="v2-mcp-kicker">04 / integrations · live on npm</div>
          <h1 className="v2-mcp-title display">
            Your AI assistant can now ask{' '}
            <span className="serif" style={{ color: 'var(--phosphor)' }}>
              who&apos;s on the other side.
            </span>
          </h1>
          <p className="v2-mcp-sub">
            <strong>chainward-mcp-server</strong> is the read-side intelligence
            layer for the AI agent economy on Base. Install it once and any
            MCP-compatible assistant — Claude Desktop, Cursor, Claude Code, Codex —
            can look up labeled agent wallets, ACP economics, and our Decodes corpus
            before you sign a single transaction.
          </p>
          <pre className="v2-mcp-install">
            <code>{`$ npx -y chainward-mcp-server`}</code>
          </pre>
          <div className="v2-mcp-meta">
            <span>v0.1.0</span>
            <span>read-only</span>
            <span>no api key required</span>
            <span>npm: chainward-mcp-server</span>
          </div>
        </section>

        {/* Section 01 — the gap */}
        <section className="v2-mcp-section">
          <div className="v2-mcp-tag">01 / the gap</div>
          <h2 className="v2-mcp-h2">
            Base MCP shipped 7 day-one plugins.
            <br />
            <span className="serif" style={{ color: 'var(--phosphor)' }}>
              All of them answer &quot;how do I act?&quot;
            </span>
          </h2>
          <p className="v2-mcp-p">
            Morpho, Bankr, Moonwell, Avantis, Aerodrome, Virtuals, Uniswap. Every
            one is a write-side tool — swap, lend, launch, send. None of them
            answer the question that comes a step earlier:{' '}
            <em>who&apos;s the deployer of this token, what does their wallet
            history look like, and is this an agent ChainWard has investigated?</em>
          </p>
          <p className="v2-mcp-p">We shipped that one.</p>
        </section>

        {/* Section 02 — the tools */}
        <section className="v2-mcp-section">
          <div className="v2-mcp-tag">02 / tools</div>
          <h2 className="v2-mcp-h2">
            Eight tools.
            <br />
            <span className="serif" style={{ color: 'var(--phosphor)' }}>
              All read-only.
            </span>
          </h2>
          <p className="v2-mcp-p">
            Your assistant picks the right tool from the description. No prompting
            required.
          </p>
          <div className="v2-mcp-tools">
            {TOOLS.map((t) => (
              <div key={t.name} className="v2-mcp-tool">
                <code className="v2-mcp-tool-name">{t.name}</code>
                <p className="v2-mcp-tool-desc">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 03 — pair with Base MCP */}
        <section className="v2-mcp-section">
          <div className="v2-mcp-tag">03 / composition</div>
          <h2 className="v2-mcp-h2">
            Pair it with Base MCP.
            <br />
            <span className="serif" style={{ color: 'var(--phosphor)' }}>
              Read before you write.
            </span>
          </h2>
          <p className="v2-mcp-p">
            ChainWard reads. Base MCP writes. Different namespaces, different
            concerns. Your assistant sees both and composes naturally — look up
            the deployer with ChainWard, then build the unsigned swap with Base
            MCP. The user signs in their own Base Account. ChainWard never sees
            the key.
          </p>
          <pre className="v2-mcp-config">
            <code>{`// claude_desktop_config.json or .cursor/mcp.json
{
  "mcpServers": {
    "chainward": {
      "command": "npx",
      "args": ["-y", "chainward-mcp-server"]
    },
    "base": {
      "command": "npx",
      "args": ["-y", "@base/mcp"]
    }
  }
}`}</code>
          </pre>
        </section>

        {/* Section 04 — install */}
        <section className="v2-mcp-section">
          <div className="v2-mcp-tag">04 / install</div>
          <h2 className="v2-mcp-h2">
            Works in every MCP-capable surface today.
            <br />
            <span className="serif" style={{ color: 'var(--phosphor)' }}>
              No partnership required.
            </span>
          </h2>
          <div className="v2-mcp-table">
            <div className="v2-mcp-row v2-mcp-row-head">
              <span>surface</span>
              <span>transport</span>
              <span>status</span>
            </div>
            <div className="v2-mcp-row">
              <span>Claude Desktop</span>
              <span>stdio</span>
              <span className="v2-mcp-ok">✓ live</span>
            </div>
            <div className="v2-mcp-row">
              <span>Cursor</span>
              <span>stdio</span>
              <span className="v2-mcp-ok">✓ live</span>
            </div>
            <div className="v2-mcp-row">
              <span>Claude Code</span>
              <span>stdio</span>
              <span className="v2-mcp-ok">✓ live</span>
            </div>
            <div className="v2-mcp-row">
              <span>Codex</span>
              <span>stdio</span>
              <span className="v2-mcp-ok">✓ live</span>
            </div>
            <div className="v2-mcp-row">
              <span>Remote / your own client</span>
              <span>streamable HTTP</span>
              <span className="v2-mcp-ok">✓ live</span>
            </div>
          </div>
          <p className="v2-mcp-p" style={{ marginTop: 24 }}>
            For HTTP transport:{' '}
            <code className="v2-code-inline">
              CHAINWARD_MCP_TRANSPORT=http PORT=3300 npx -y chainward-mcp-server
            </code>
            . MCP endpoint at <code className="v2-code-inline">/mcp</code>, health
            at <code className="v2-code-inline">/healthz</code>.
          </p>
        </section>

        <section className="v2-landing-bottom">
          <div className="v2-landing-final">
            <h2 className="v2-landing-final-title display">
              The agent economy needs a read step{' '}
              <span className="serif" style={{ color: 'var(--phosphor)' }}>
                before every write step.
              </span>
            </h2>
            <p className="v2-landing-final-sub">
              ChainWard is the read step. Install it next to whatever signs.
            </p>
            <div style={{ marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Button href="https://www.npmjs.com/package/chainward-mcp-server">
                npm: chainward-mcp-server
                <span>→</span>
              </Button>
              <Button variant="ghost" href="/decodes">
                cat decodes/
              </Button>
            </div>
          </div>
        </section>

        <footer className="v2-landing-footer">
          <div>chainward.ai · read-side intel for the agent economy on base</div>
          <div className="v2-landing-footer-links">
            <Link href="/base">observatory</Link>
            <Link href="/decodes">decodes</Link>
            <Link href="/docs">docs</Link>
            <a
              href="https://x.com/chainwardai"
              target="_blank"
              rel="noopener noreferrer"
            >
              x
            </a>
          </div>
        </footer>
      </div>

      <style>{`
        .v2-mcp-hero {
          padding-top: 56px;
          padding-bottom: 48px;
        }
        .v2-mcp-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--fg-dim);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding-bottom: 24px;
        }
        .v2-mcp-kicker::before {
          content: '';
          width: 20px;
          height: 1px;
          background: var(--phosphor);
        }
        .v2-mcp-title {
          font-size: clamp(40px, 6vw, 76px);
          line-height: 0.98;
          letter-spacing: -0.04em;
          color: var(--fg);
          max-width: 1000px;
        }
        .v2-mcp-sub {
          margin-top: 28px;
          font-size: 14px;
          line-height: 1.7;
          color: var(--fg-dim);
          max-width: 620px;
        }
        .v2-mcp-sub strong { color: var(--fg); font-weight: 500; }
        .v2-mcp-install {
          margin-top: 32px;
          background: var(--bg-1);
          border: 1px solid var(--line);
          padding: 20px 24px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 14px;
          color: var(--phosphor);
          max-width: 620px;
          overflow-x: auto;
        }
        .v2-mcp-meta {
          margin-top: 20px;
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.04em;
        }
        .v2-mcp-meta span::before {
          content: '// ';
          color: var(--phosphor-dim);
        }
        .v2-mcp-section {
          padding: 64px 0;
          border-top: 1px solid var(--line);
        }
        .v2-mcp-tag {
          font-size: 11px;
          color: var(--phosphor);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding-bottom: 24px;
        }
        .v2-mcp-h2 {
          font-size: clamp(28px, 4vw, 48px);
          line-height: 1.05;
          letter-spacing: -0.03em;
          color: var(--fg);
          max-width: 880px;
        }
        .v2-mcp-p {
          margin-top: 24px;
          font-size: 14px;
          line-height: 1.7;
          color: var(--fg-dim);
          max-width: 680px;
        }
        .v2-mcp-p em { font-style: italic; color: var(--fg); }
        .v2-mcp-tools {
          margin-top: 32px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1px;
          background: var(--line);
          border: 1px solid var(--line);
        }
        @media (max-width: 720px) {
          .v2-mcp-tools { grid-template-columns: 1fr; }
        }
        .v2-mcp-tool {
          background: var(--bg-1);
          padding: 20px 22px;
        }
        .v2-mcp-tool-name {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 13px;
          color: var(--phosphor);
        }
        .v2-mcp-tool-desc {
          margin-top: 10px;
          font-size: 13px;
          line-height: 1.55;
          color: var(--fg-dim);
        }
        .v2-mcp-config {
          margin-top: 32px;
          background: var(--bg-1);
          border: 1px solid var(--line);
          padding: 20px 24px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          line-height: 1.6;
          color: var(--fg-dim);
          max-width: 620px;
          overflow-x: auto;
        }
        .v2-mcp-table {
          margin-top: 32px;
          border: 1px solid var(--line);
        }
        .v2-mcp-row {
          display: grid;
          grid-template-columns: 1.5fr 1.5fr 1fr;
          padding: 14px 20px;
          font-size: 13px;
          color: var(--fg-dim);
          border-top: 1px solid var(--line);
        }
        .v2-mcp-row:first-child { border-top: none; }
        .v2-mcp-row-head {
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
          background: var(--bg-1);
        }
        .v2-mcp-ok { color: var(--phosphor); }
        @media (max-width: 480px) {
          .v2-mcp-hero { padding-top: 32px; padding-bottom: 28px; }
          .v2-mcp-section { padding: 40px 0; }
          .v2-mcp-meta { gap: 14px 18px; }
          .v2-mcp-row { padding: 12px 14px; font-size: 12px; }
        }
      `}</style>
    </PageShell>
  );
}
