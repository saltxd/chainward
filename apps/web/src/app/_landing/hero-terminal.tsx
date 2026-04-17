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
  { kind: 'prompt', text: 'cw agents add 0xFfe8…8c06 --name "struktur v2"', delay: 200 },
  {
    kind: 'stdout',
    text: '✓ agent registered · indexing started',
    color: 'var(--phosphor)',
    delay: 400,
  },
  { kind: 'blank', text: '', delay: 200 },
  {
    kind: 'prompt',
    text: 'cw alerts create --type failed_tx --channel discord',
    delay: 400,
  },
  {
    kind: 'stdout',
    text: '✓ alert armed · latency target <30s',
    color: 'var(--phosphor)',
    delay: 400,
  },
  { kind: 'blank', text: '', delay: 1200 },
  {
    kind: 'stdout',
    text: '[03:47:12] block #28,402,917 · struktur v2',
    color: 'var(--fg-dim)',
    delay: 120,
  },
  {
    kind: 'stderr',
    text: '  ✗ tx 0x1a2b…f3c9 reverted — ERC20: insufficient allowance',
    color: 'var(--danger)',
    delay: 300,
  },
  {
    kind: 'alert',
    text: '→ posted to #agent-ops · 0.4s after revert',
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
          <span style={{ color: 'var(--phosphor)' }}>$</span> <Cursor />
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
        background: 'var(--phosphor)',
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
        <span style={{ color: 'var(--phosphor)', marginRight: 10 }}>$</span>
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
