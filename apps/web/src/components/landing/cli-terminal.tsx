'use client';

import { useEffect, useState } from 'react';

interface Line {
  id: number;
  type: 'command' | 'output' | 'status' | 'feed';
  text: string;
  highlight?: string;
}

const HUMAN_LINES: Line[] = [
  { id: 1, type: 'command', text: 'npm i -g @chainward/cli' },
  { id: 2, type: 'command', text: 'chainward login' },
  { id: 3, type: 'output', text: 'Logged in. 1 agent found.' },
  { id: 4, type: 'command', text: 'chainward agents add 0xAf09... --name "Rebalancer"' },
  { id: 5, type: 'output', text: 'Agent registered. Monitoring started.' },
  { id: 6, type: 'command', text: 'chainward watch' },
  { id: 7, type: 'status', text: 'Watching 1 agent on Base...' },
  {
    id: 8,
    type: 'feed',
    text: '0.4s ago  Rebalancer  Swapped ETH for USDC on Aerodrome',
    highlight: '$312.48',
  },
];

function TerminalLines({ lines }: { lines: Line[] }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    const timers: NodeJS.Timeout[] = [];
    lines.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleCount((c) => Math.max(c, i + 1));
        }, 600 + i * 500),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [lines]);

  return (
    <div className="px-4 py-3 font-mono text-xs leading-relaxed md:text-sm md:leading-relaxed">
      {lines.map((line, i) => {
        const visible = i < visibleCount;
        return (
          <div
            key={line.id}
            className="transition-opacity duration-500"
            style={{ opacity: visible ? 1 : 0 }}
          >
            {line.type === 'command' && (
              <div className="py-0.5">
                <span className="text-accent-foreground">$</span>{' '}
                <span className="text-foreground">{line.text}</span>
              </div>
            )}
            {line.type === 'output' && (
              <div className="py-0.5 text-muted-foreground">{line.text || '\u00A0'}</div>
            )}
            {line.type === 'status' && (
              <div className="mt-1 flex items-center gap-2 py-0.5 text-accent-foreground">
                {visible && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-foreground opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-foreground" />
                  </span>
                )}
                {line.text}
              </div>
            )}
            {line.type === 'feed' && (
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-foreground">{line.text}</span>
                {line.highlight && (
                  <span className="font-mono text-accent-foreground">{line.highlight}</span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Blinking cursor */}
      <div className="py-0.5" style={{ opacity: visibleCount >= lines.length ? 1 : 0 }}>
        <span className="text-accent-foreground">$</span>{' '}
        <span className="animate-pulse text-accent-foreground">_</span>
      </div>
    </div>
  );
}

export function CliTerminal() {
  return (
    <div className="relative overflow-hidden rounded-sm border border-border bg-background">
      {/* Terminal header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="ml-4 font-mono text-xs text-muted-foreground">chainward</span>
      </div>

      <TerminalLines lines={HUMAN_LINES} />

      {/* Bottom fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
