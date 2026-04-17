'use client';

import { useEffect, useState } from 'react';

/**
 * Right-hand hero widget: a faux-terminal CLI session showing a real
 * ChainWard workflow. Types itself out on page load, then streams an
 * alert at the end for visual payoff.
 */

interface Line {
  kind: 'prompt' | 'stdout' | 'stderr' | 'alert' | 'blank';
  text: string;
  color?: string;
  delay: number;
}

const SCRIPT: Line[] = [
  { kind: 'prompt', text: 'cw agents add 0xFfe8…8c06 --name "struktur v2"', delay: 200 },
  { kind: 'stdout', text: '✓ agent registered · indexing started', color: 'var(--phosphor)', delay: 400 },
  { kind: 'blank', text: '', delay: 200 },
  { kind: 'prompt', text: 'cw alerts create --type failed_tx --channel discord', delay: 400 },
  { kind: 'stdout', text: '✓ alert armed · latency target <30s', color: 'var(--phosphor)', delay: 400 },
  { kind: 'blank', text: '', delay: 1200 },
  { kind: 'stdout', text: '[03:47:12] block #28,402,917 · struktur v2', color: 'var(--fg-dim)', delay: 120 },
  { kind: 'stderr', text: '  ✗ tx 0x1a2b…f3c9 reverted — ERC20: insufficient allowance', color: 'var(--danger)', delay: 300 },
  { kind: 'alert', text: '→ posted to #agent-ops · 0.4s after revert', color: 'var(--amber)', delay: 400 },
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
    <div
      style={{
        border: '1px solid var(--line-2)',
        background: 'var(--bg-1)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12.5,
        lineHeight: 1.7,
        position: 'relative',
        boxShadow: '0 0 80px rgba(92,240,164,0.04) inset',
      }}
    >
      {/* Terminal top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderBottom: '1px solid var(--line)',
          color: 'var(--muted)',
          fontSize: 11,
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a3f38' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a3f38' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a3f38' }} />
        </span>
        <span>~/chainward</span>
        <span style={{ marginLeft: 'auto', color: 'var(--phosphor)' }}>● session.live</span>
      </div>

      {/* Output */}
      <div style={{ padding: '16px 18px', minHeight: 320 }}>
        {SCRIPT.slice(0, visible).map((line, i) => (
          <TerminalLine key={i} line={line} isLast={i === visible - 1} />
        ))}
        {visible >= SCRIPT.length && (
          <div style={{ marginTop: 8, color: 'var(--fg-dim)', fontSize: 12 }}>
            <span style={{ color: 'var(--phosphor)' }}>$</span>{' '}
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 14,
                background: 'var(--phosphor)',
                verticalAlign: 'text-bottom',
                animation: 'pulse 1s steps(2) infinite',
              }}
            />
          </div>
        )}
      </div>
    </div>
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
          <span
            style={{
              display: 'inline-block',
              width: 7,
              height: 12,
              background: 'var(--phosphor)',
              marginLeft: 4,
              verticalAlign: 'text-bottom',
              animation: 'pulse 0.8s steps(2) infinite',
            }}
          />
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
