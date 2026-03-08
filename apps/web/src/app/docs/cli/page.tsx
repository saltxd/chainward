export const metadata = { title: 'CLI — ChainWard Docs' };

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

export default function CliDocsPage() {
  return (
    <article className="prose-invert max-w-none md:max-w-3xl">
      <h1 className="text-2xl font-bold text-white">CLI</h1>
      <p className="mt-2 text-[#a1a1aa]">
        Monitor your agents from the terminal.
      </p>

      {/* Install */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-white">Install</h2>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-[#1a1a2e] bg-[#0a0a0f] px-5 py-4 font-mono text-sm text-[#e4e4e7]">
          npm i -g @chainward/cli
        </pre>
      </div>

      {/* Authentication */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-white">Authentication</h2>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-[#1a1a2e] bg-[#0a0a0f] px-5 py-4 font-mono text-sm text-[#e4e4e7]">
          chainward login
        </pre>
        <p className="mt-3 text-sm text-[#a1a1aa]">
          Get your API key at{' '}
          <a href="/settings" className="text-[#4ade80] underline underline-offset-2 hover:text-[#22c55e]">
            chainward.ai &rarr; Settings &rarr; Generate Key
          </a>
          . Keys start with <code className="rounded bg-[#1a1a2e] px-1.5 py-0.5 text-xs text-[#4ade80]">ag_</code> and
          are stored locally at <code className="rounded bg-[#1a1a2e] px-1.5 py-0.5 text-xs text-[#a1a1aa]">~/.chainward/config.json</code>.
        </p>
      </div>

      {/* Commands */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-white">Commands</h2>
        <div className="mt-6 space-y-8">
          {commands.map((cmd) => (
            <div key={cmd.name}>
              <pre className="overflow-x-auto rounded-lg border border-[#1a1a2e] bg-[#0a0a0f] px-5 py-4 font-mono text-sm text-[#4ade80]">
                {cmd.name}
              </pre>
              <p className="mt-2 text-sm text-[#a1a1aa]">{cmd.desc}</p>
              {cmd.flags && (
                <div className="mt-2 space-y-1">
                  {cmd.flags.map((f) => (
                    <div key={f.flag} className="flex gap-3 text-sm">
                      <code className="shrink-0 rounded bg-[#1a1a2e] px-1.5 py-0.5 text-xs text-[#e4e4e7]">{f.flag}</code>
                      <span className="text-[#71717a]">{f.desc}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Config */}
      <div className="mt-12 rounded-lg border border-[#1a1a2e] bg-[#0a0a0f] p-6">
        <h3 className="text-sm font-semibold text-white">Configuration</h3>
        <p className="mt-2 text-sm text-[#a1a1aa]">
          All config is stored at <code className="rounded bg-[#1a1a2e] px-1.5 py-0.5 text-xs text-[#a1a1aa]">~/.chainward/config.json</code>.
          Run <code className="rounded bg-[#1a1a2e] px-1.5 py-0.5 text-xs text-[#4ade80]">chainward login</code> again
          to update your API key.
        </p>
      </div>
    </article>
  );
}
