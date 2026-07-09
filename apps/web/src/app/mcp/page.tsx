import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';

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

const SURFACES = [
  { surface: 'Claude Desktop', transport: 'stdio', status: 'live' },
  { surface: 'Cursor', transport: 'stdio', status: 'live' },
  { surface: 'Claude Code', transport: 'stdio', status: 'live' },
  { surface: 'Codex', transport: 'stdio', status: 'live' },
  { surface: 'Remote / your own client', transport: 'streamable HTTP', status: 'live' },
];

export default function McpPage() {
  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        {/* Hero */}
        <section className="mcp-hero">
          <div className="press-fileno">
            Integrations <span className="ph-dateline-sep">·</span> Live on npm
          </div>
          <h1 className="mcp-title press-display">
            Your AI assistant can now ask who&apos;s on the other side.
          </h1>
          <p className="mcp-lede">
            <strong>chainward-mcp-server</strong> is the read-side intelligence
            layer for the AI agent economy on Base. Install it once and any
            MCP-compatible assistant — Claude Desktop, Cursor, Claude Code, Codex —
            can look up labeled agent wallets, ACP economics, and our Decodes corpus
            before you sign a single transaction.
          </p>
          <pre className="mcp-install mono">
            <code>{`$ npx -y chainward-mcp-server`}</code>
          </pre>
          <div className="mcp-meta">
            <span>v0.1.0</span>
            <span>read-only</span>
            <span>no api key required</span>
            <span>npm: chainward-mcp-server</span>
          </div>
        </section>

        <hr className="press-rule" />

        {/* The gap */}
        <section className="mcp-section">
          <span className="press-label">The gap</span>
          <h2 className="mcp-h2 press-display">
            Base MCP shipped 7 day-one plugins. All of them answer{' '}
            <em>&quot;how do I act?&quot;</em>
          </h2>
          <p className="mcp-p">
            Morpho, Bankr, Moonwell, Avantis, Aerodrome, Virtuals, Uniswap. Every
            one is a write-side tool — swap, lend, launch, send. None of them
            answer the question that comes a step earlier:{' '}
            <em>who&apos;s the deployer of this token, what does their wallet
            history look like, and is this an agent ChainWard has investigated?</em>
          </p>
          <p className="mcp-p">We shipped that one.</p>
        </section>

        <hr className="press-rule" />

        {/* The tools */}
        <section className="mcp-section">
          <span className="press-label">The tools</span>
          <h2 className="mcp-h2 press-display">Eight tools. All read-only.</h2>
          <p className="mcp-p">
            Your assistant picks the right tool from the description. No prompting
            required.
          </p>
          <dl className="mcp-tools">
            {TOOLS.map((t) => (
              <div key={t.name} className="mcp-tool">
                <dt className="mcp-tool-name mono">{t.name}</dt>
                <dd className="mcp-tool-desc">{t.desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        <hr className="press-rule" />

        {/* Composition */}
        <section className="mcp-section">
          <span className="press-label">Composition</span>
          <h2 className="mcp-h2 press-display">
            Pair it with Base MCP. Read before you write.
          </h2>
          <p className="mcp-p">
            ChainWard reads. Base MCP writes. Different namespaces, different
            concerns. Your assistant sees both and composes naturally — look up
            the deployer with ChainWard, then build the unsigned swap with Base
            MCP. The user signs in their own Base Account. ChainWard never sees
            the key.
          </p>
          <pre className="mcp-config mono">
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

        <hr className="press-rule" />

        {/* Install */}
        <section className="mcp-section">
          <span className="press-label">Install</span>
          <h2 className="mcp-h2 press-display">
            Works in every MCP-capable surface today. No partnership required.
          </h2>
          <div className="mcp-table">
            <div className="mcp-row mcp-row-head">
              <span>Surface</span>
              <span>Transport</span>
              <span>Status</span>
            </div>
            {SURFACES.map((s) => (
              <div key={s.surface} className="mcp-row">
                <span>{s.surface}</span>
                <span className="mono">{s.transport}</span>
                <span className="mcp-ok mono">{s.status}</span>
              </div>
            ))}
          </div>
          <p className="mcp-p" style={{ marginTop: 24 }}>
            For HTTP transport:{' '}
            <code className="mcp-inline mono">
              CHAINWARD_MCP_TRANSPORT=http PORT=3300 npx -y chainward-mcp-server
            </code>
            . MCP endpoint at <code className="mcp-inline mono">/mcp</code>, health
            at <code className="mcp-inline mono">/healthz</code>.
          </p>
        </section>

        {/* Closing */}
        <section className="mcp-close">
          <h2 className="mcp-close-title press-display">
            The agent economy needs a read step before every write step.
          </h2>
          <p className="mcp-close-sub">
            ChainWard is the read step. Install it next to whatever signs.
          </p>
          <div className="mcp-close-ctas">
            <a
              href="https://www.npmjs.com/package/chainward-mcp-server"
              target="_blank"
              rel="noopener noreferrer"
              className="press-btn"
            >
              npm: chainward-mcp-server →
            </a>
            <Link href="/decodes" className="press-btn press-btn--ghost">
              Read the decodes
            </Link>
          </div>
        </section>

        <Colophon />
      </div>

      <style>{`
        .mcp-hero { padding: 44px 0 40px; }
        .mcp-title {
          margin: 16px 0 0;
          font-size: clamp(36px, 5.6vw, 66px);
          line-height: 1;
          letter-spacing: -0.03em;
          max-width: 900px;
        }
        .mcp-lede {
          margin: 22px 0 0;
          font-family: var(--font-text);
          font-size: 19px;
          line-height: 1.55;
          color: var(--ink-soft);
          max-width: 640px;
        }
        .mcp-lede strong { color: var(--ink); font-weight: 640; }
        .mcp-install {
          margin: 28px 0 0;
          background: var(--paper-2);
          border: 1px solid var(--rule-strong);
          padding: 18px 22px;
          font-size: 14px;
          color: var(--ink);
          max-width: 620px;
          overflow-x: auto;
        }
        .mcp-meta {
          margin-top: 18px;
          display: flex;
          gap: 10px 22px;
          flex-wrap: wrap;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .mcp-meta span::before { content: '§ '; color: var(--oxblood); }

        .mcp-section { padding: 44px 0; }
        .mcp-h2 {
          margin: 14px 0 0;
          font-size: clamp(26px, 3.6vw, 40px);
          line-height: 1.05;
          max-width: 820px;
        }
        .mcp-h2 em {
          font-style: italic;
          color: var(--oxblood);
          font-variation-settings: "opsz" 60, "SOFT" 40;
        }
        .mcp-p {
          margin: 20px 0 0;
          font-family: var(--font-text);
          font-size: 17px;
          line-height: 1.6;
          color: var(--ink-soft);
          max-width: 660px;
        }
        .mcp-p em { font-style: italic; color: var(--ink); }

        .mcp-tools {
          margin: 28px 0 0;
          padding: 0;
          border-top: 3px double var(--rule-strong);
        }
        .mcp-tool {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 24px;
          padding: 14px 0;
          border-bottom: 1px solid var(--rule);
          align-items: baseline;
        }
        .mcp-tool-name { font-size: 13px; color: var(--oxblood); }
        .mcp-tool-desc {
          margin: 0;
          font-family: var(--font-text);
          font-size: 16px;
          line-height: 1.5;
          color: var(--ink-soft);
        }
        @media (max-width: 640px) {
          .mcp-tool { grid-template-columns: 1fr; gap: 4px; }
        }

        .mcp-config {
          margin: 28px 0 0;
          background: var(--paper-2);
          border: 1px solid var(--rule-strong);
          padding: 18px 22px;
          font-size: 12.5px;
          line-height: 1.6;
          color: var(--ink);
          max-width: 620px;
          overflow-x: auto;
        }
        .mcp-inline {
          color: var(--oxblood);
          background: var(--oxblood-wash);
          border: 1px solid var(--rule);
          padding: 1px 6px;
          font-size: 0.82em;
          overflow-wrap: anywhere;
        }

        .mcp-table {
          margin-top: 28px;
          border-top: 3px double var(--rule-strong);
          border-bottom: 1px solid var(--rule-strong);
          max-width: 720px;
        }
        .mcp-row {
          display: grid;
          grid-template-columns: 1.6fr 1.4fr 0.8fr;
          gap: 16px;
          padding: 12px 4px;
          border-bottom: 1px solid var(--rule);
          font-family: var(--font-text);
          font-size: 15px;
          color: var(--ink-soft);
        }
        .mcp-row:last-child { border-bottom: none; }
        .mcp-row .mono { font-size: 12px; }
        .mcp-row-head {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-faint);
          border-bottom: 1px solid var(--rule-strong);
        }
        .mcp-ok { color: var(--seal); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }

        .mcp-close {
          margin-top: 20px;
          border-top: 3px double var(--rule-strong);
          padding: 40px 0 8px;
        }
        .mcp-close-title {
          margin: 0;
          font-size: clamp(28px, 4.4vw, 48px);
          line-height: 1.02;
          max-width: 780px;
        }
        .mcp-close-sub {
          margin: 16px 0 0;
          font-family: var(--font-text);
          font-size: 18px;
          line-height: 1.5;
          color: var(--ink-soft);
          max-width: 520px;
        }
        .mcp-close-ctas {
          margin-top: 28px;
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
        }
        @media (max-width: 480px) {
          .mcp-hero { padding: 32px 0 28px; }
          .mcp-section { padding: 32px 0; }
        }
      `}</style>
    </PressShell>
  );
}
