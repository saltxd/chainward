'use client';

import { useState } from 'react';

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
    flags: [
      { flag: '--agent <address>', desc: 'Watch a specific agent' },
    ],
  },
];

function CodeBlock({ children, color = 'text-foreground' }: { children: string; color?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group relative">
      <pre className={`overflow-x-auto rounded-lg border border-border bg-muted px-5 py-4 font-mono text-sm ${color}`}>
        {children}
      </pre>
      <button
        onClick={copy}
        className="absolute right-2.5 top-2.5 rounded-md border border-border bg-muted px-2 py-1 text-xs text-text-muted opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

export default function CliDocsPage() {
  return (
    <article className="prose-invert max-w-none md:max-w-3xl">
      <h1 className="text-2xl font-bold text-white">CLI</h1>
      <p className="mt-2 text-muted-foreground">
        Monitor your agents from the terminal.
      </p>

      {/* Install */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-white">Install</h2>
        <div className="mt-3">
          <CodeBlock>npm i -g @chainward/cli</CodeBlock>
        </div>
      </div>

      {/* Authentication */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-white">Authentication</h2>
        <div className="mt-3">
          <CodeBlock>chainward login</CodeBlock>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          You&apos;ll need an API key. If you don&apos;t have one:
        </p>
        <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>
            1. Go to{' '}
            <a href="https://chainward.ai" className="text-accent-foreground underline underline-offset-2 hover:text-accent-foreground/80">
              chainward.ai
            </a>
          </li>
          <li>2. Connect your wallet</li>
          <li>
            3. Go to{' '}
            <a href="/settings" className="text-accent-foreground underline underline-offset-2 hover:text-accent-foreground/80">
              Settings
            </a>
            {' '}&rarr; Generate Key
          </li>
          <li>4. Paste the <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-accent-foreground">ag_</code> key when prompted</li>
        </ol>
        <p className="mt-3 text-xs text-text-muted">
          Keys are stored locally at <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-text-muted">~/.chainward/config.json</code>.
        </p>
      </div>

      {/* Commands */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-white">Commands</h2>
        <div className="mt-6 space-y-8">
          {commands.map((cmd) => (
            <div key={cmd.name}>
              <CodeBlock color="text-accent-foreground">{cmd.name}</CodeBlock>
              <p className="mt-2 text-sm text-muted-foreground">{cmd.desc}</p>
              {cmd.flags && (
                <div className="mt-2 space-y-1">
                  {cmd.flags.map((f) => (
                    <div key={f.flag} className="flex gap-3 text-sm">
                      <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{f.flag}</code>
                      <span className="text-text-muted">{f.desc}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Config */}
      <div className="mt-12 rounded-lg border border-border bg-muted p-6">
        <h3 className="text-sm font-semibold text-white">Configuration</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          All config is stored at <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">~/.chainward/config.json</code>.
          Run <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-accent-foreground">chainward login</code> again
          to update your API key.
        </p>
      </div>
    </article>
  );
}
