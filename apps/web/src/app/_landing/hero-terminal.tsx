'use client';

import { useEffect, useState } from 'react';
import { TerminalCard } from '@/components/v2';

interface Line {
  kind: 'prompt' | 'stdout' | 'stderr' | 'alert' | 'blank';
  text: string;
  color?: string;
  delay: number;
}

const SCRIPT: Line[] = [
  { kind: 'prompt', text: 'cw scan --base --sort onchain-7d', delay: 200 },
  {
    kind: 'stdout',
    text: '✓ indexing every agent wallet on base',
    color: 'var(--terminal-green)',
    delay: 400,
  },
  {
    kind: 'stdout',
    text: '  source · our own sentinel node, no middleman',
    color: 'var(--fg-dim)',
    delay: 300,
  },
  { kind: 'blank', text: '', delay: 700 },
  {
    kind: 'stdout',
    text: '  claimed ..... lifetime totals, marketing decks',
    color: 'var(--fg-dim)',
    delay: 300,
  },
  {
    kind: 'stdout',
    text: '  on-chain .... what the wallet actually did this week',
    color: 'var(--fg-dim)',
    delay: 300,
  },
  { kind: 'blank', text: '', delay: 1100 },
  {
    kind: 'alert',
    text: '→ we report the second one. the chain doesn\'t do PR.',
    color: 'var(--amber)',
    delay: 400,
  },
];

export function HeroTerminal() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cumulative = 400;
    SCRIPT.forEach((line, i) => {
      cumulative += line.delay;
      timers.push(setTimeout(() => setVisible(i + 1), cumulative));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <TerminalCard bodyStyle={{ minHeight: 320 }}>
      {SCRIPT.slice(0, visible).map((line, i) => (
        <TerminalLine key={i} line={line} isLast={i === visible - 1} />
      ))}
      {visible >= SCRIPT.length && (
        <div style={{ marginTop: 8, color: 'var(--fg-dim)', fontSize: 12 }}>
          <span style={{ color: 'var(--terminal-green)' }}>$</span> <Cursor />
        </div>
      )}
    </TerminalCard>
  );
}

function Cursor() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 14,
        background: 'var(--terminal-green)',
        verticalAlign: 'text-bottom',
        animation: 'v2-pulse 1s steps(2) infinite',
      }}
    />
  );
}

function TerminalLine({ line, isLast }: { line: Line; isLast: boolean }) {
  if (line.kind === 'blank') return <div style={{ height: 8 }} />;

  if (line.kind === 'prompt') {
    return (
      <div style={{ color: 'var(--fg)', wordBreak: 'break-word' }}>
        <span style={{ color: 'var(--terminal-green)', marginRight: 10 }}>$</span>
        {line.text}
        {isLast && (
          <span style={{ marginLeft: 4 }}>
            <Cursor />
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        color: line.color ?? 'var(--fg)',
        paddingLeft: line.kind === 'alert' ? 0 : 22,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {line.text}
    </div>
  );
}
