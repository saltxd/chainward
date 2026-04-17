'use client';

/**
 * Proof-of-infrastructure wall. Three cards: sentinel node, Blockscout
 * cross-check, own indexer. Shows the actual moat instead of abstracting
 * it into "real-time indexing" marketing copy.
 */

const receipts = [
  {
    tag: 'node.sentinel',
    title: 'We run our own Base node.',
    body:
      'Every balance and transaction ChainWard serves is read from a sentinel node we own. No shared RPC rate limit, no Alchemy CU quota, no provider that can deprecate an endpoint at 2am.',
    metrics: [
      { label: 'uptime', value: '99.94%' },
      { label: 'block.lag', value: '<2' },
    ],
  },
  {
    tag: 'verify.blockscout',
    title: 'Every claim is cross-checked.',
    body:
      'Balance snapshots and transaction receipts are verified against Blockscout before they hit your dashboard. If the sentinel and the public chain disagree, the UI flags it — not silently hides it.',
    metrics: [
      { label: 'checks/day', value: '120k+' },
      { label: 'discrepancies', value: '0' },
    ],
  },
  {
    tag: 'indexer.native',
    title: 'Timescale hypertables, not a ledger SaaS.',
    body:
      'Transactions, balances, and gas live in hypertables we run ourselves. You can export everything via API or CLI. If ChainWard disappeared tomorrow, your historical data would still be yours.',
    metrics: [
      { label: 'retention', value: '30d+' },
      { label: 'export', value: 'CSV · API' },
    ],
  },
];

export function ReceiptsWall() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 0,
        border: '1px solid var(--line)',
      }}
      className="v2-receipts-grid"
    >
      <style>{`
        @media (max-width: 880px) {
          .v2-receipts-grid { grid-template-columns: 1fr !important; }
          .v2-receipts-grid > div + div { border-left: none !important; border-top: 1px solid var(--line); }
        }
      `}</style>
      {receipts.map((r, i) => (
        <div
          key={r.tag}
          style={{
            padding: '32px 28px',
            borderLeft: i === 0 ? 'none' : '1px solid var(--line)',
            background: i % 2 === 0 ? 'var(--bg-1)' : 'transparent',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.14em',
              color: 'var(--phosphor)',
              marginBottom: 18,
            }}
          >
            // {r.tag}
          </div>
          <h3
            style={{
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              color: 'var(--fg)',
              marginBottom: 12,
            }}
          >
            {r.title}
          </h3>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.7,
              color: 'var(--fg-dim)',
              flex: 1,
              marginBottom: 24,
            }}
          >
            {r.body}
          </p>
          <div
            style={{
              display: 'flex',
              gap: 24,
              paddingTop: 16,
              borderTop: '1px dashed var(--line-2)',
            }}
          >
            {r.metrics.map((m) => (
              <div key={m.label}>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--muted)',
                    letterSpacing: '0.08em',
                    marginBottom: 4,
                  }}
                >
                  {m.label}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    color: 'var(--fg)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
