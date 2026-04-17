import { CodeBlock } from '@/components/v2';

export const metadata = {
  title: 'CLI',
  description:
    'ChainWard CLI reference. Monitor agents, list transactions, stream alerts, and create alert rules from your terminal. Install via npm.',
  alternates: { canonical: 'https://chainward.ai/docs/cli' },
  openGraph: {
    title: 'CLI — ChainWard Docs',
    description: 'Monitor your agents from the terminal.',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
};

const commands = [
  {
    name: 'chainward status',
    desc: 'Fleet overview — total agents, 24h transactions, gas spend, portfolio value.',
  },
  {
    name: 'chainward agents list',
    desc: 'List all monitored agents with name, address, balance, and last transaction.',
  },
  {
    name: 'chainward agents add <address> --name "My Agent"',
    desc: 'Register a new wallet for monitoring. Indexing starts immediately.',
  },
  {
    name: 'chainward agents remove <address>',
    desc: 'Stop monitoring an agent. Confirms before removing.',
  },
  {
    name: 'chainward txs',
    desc: 'List recent transactions across all agents. Clickable Basescan links in supported terminals.',
    flags: [
      { flag: '--agent <address>', desc: 'Filter by agent wallet' },
      { flag: '--limit <n>', desc: 'Number of results (default: 20)' },
    ],
  },
  {
    name: 'chainward alerts list',
    desc: 'Show all configured alerts with type, threshold, channels, and status.',
  },
  {
    name: 'chainward alerts create',
    desc: 'Interactive prompt to create an alert — select agent, type, threshold, and delivery channel.',
  },
  {
    name: 'chainward watch',
    desc: 'Live transaction feed. Polls every 5 seconds and prints new transactions as they arrive. Ctrl+C to stop.',
    flags: [{ flag: '--agent <address>', desc: 'Watch a specific agent' }],
  },
];

export default function CliDocsPage() {
  return (
    <article className="decode-prose">
      <h1>CLI</h1>
      <p>Monitor your agents from the terminal. Same data as the dashboard, piped into stdout.</p>

      <h2>Install</h2>
      <CodeBlock>npm i -g @chainward/cli</CodeBlock>

      <h2>Authentication</h2>
      <CodeBlock>chainward login</CodeBlock>
      <p>You&apos;ll need an API key. If you don&apos;t have one yet:</p>
      <ol>
        <li>
          Go to <a href="https://chainward.ai">chainward.ai</a>
        </li>
        <li>Connect your wallet</li>
        <li>
          Open <a href="/settings">Settings</a> → Generate Key
        </li>
        <li>
          Paste the <code>ag_</code> key when prompted
        </li>
      </ol>
      <p>
        Keys are stored locally at <code>~/.chainward/config.json</code>. Run{' '}
        <code>chainward login</code> again any time to replace the key.
      </p>

      <h2>Commands</h2>
      {commands.map((cmd) => (
        <div key={cmd.name} style={{ marginBottom: 28 }}>
          <CodeBlock>{cmd.name}</CodeBlock>
          <p style={{ marginTop: 8 }}>{cmd.desc}</p>
          {cmd.flags && (
            <ul>
              {cmd.flags.map((f) => (
                <li key={f.flag}>
                  <code>{f.flag}</code> — {f.desc}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <blockquote>
        <p>
          <strong>Configuration.</strong> All config is stored at{' '}
          <code>~/.chainward/config.json</code>. Delete the file to wipe your local
          session, or run <code>chainward login</code> to replace the key.
        </p>
      </blockquote>
    </article>
  );
}
