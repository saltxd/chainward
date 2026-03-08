'use client';

import { useEffect, useState } from 'react';

interface Line {
  id: number;
  type: 'command' | 'output' | 'status' | 'feed';
  text: string;
  highlight?: string;
}

const LINES: Line[] = [
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

export function CliTerminal() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    LINES.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleCount((c) => Math.max(c, i + 1));
        }, 600 + i * 500),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#1a1a2e] bg-[#0a0a0f]">
      {/* Terminal header */}
      <div className="flex items-center gap-2 border-b border-[#1a1a2e] px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="ml-2 font-mono text-xs text-[#71717a]">terminal</span>
      </div>

      {/* Lines — all rendered for stable height, visibility toggled */}
      <div className="px-4 py-3 font-mono text-xs leading-relaxed md:text-sm md:leading-relaxed">
        {LINES.map((line, i) => {
          const visible = i < visibleCount;
          return (
            <div
              key={line.id}
              className="transition-opacity duration-500"
              style={{ opacity: visible ? 1 : 0 }}
            >
              {line.type === 'command' && (
                <div className="py-0.5">
                  <span className="text-[#4ade80]">$</span>{' '}
                  <span className="text-[#e4e4e7]">{line.text}</span>
                </div>
              )}
              {line.type === 'output' && (
                <div className="py-0.5 text-[#71717a]">{line.text}</div>
              )}
              {line.type === 'status' && (
                <div className="mt-1 flex items-center gap-2 py-0.5 text-[#4ade80]">
                  {visible && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade80] opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
                    </span>
                  )}
                  {line.text}
                </div>
              )}
              {line.type === 'feed' && (
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[#d4d4d8]">{line.text}</span>
                  {line.highlight && (
                    <span className="text-[#4ade80]">{line.highlight}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Blinking cursor */}
        <div className="py-0.5" style={{ opacity: visibleCount >= LINES.length ? 1 : 0 }}>
          <span className="text-[#4ade80]">$</span>{' '}
          <span className="animate-pulse text-[#4ade80]">_</span>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#0a0a0f] to-transparent" />
    </div>
  );
}
