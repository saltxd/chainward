'use client';

/**
 * Seven alert types × three channels, rendered as a dense terminal-style
 * table. Reads left-to-right: trigger → what it catches → example.
 */

const alerts = [
  { id: 'failed_tx', trigger: 'failed_tx', catches: 'Transaction reverted on-chain', example: 'ERC20 insufficient allowance' },
  { id: 'gas_spike', trigger: 'gas_spike', catches: 'Gas cost exceeds threshold', example: '$4.20 (3× baseline)' },
  { id: 'balance_drop', trigger: 'balance_drop', catches: 'Wallet balance falls below floor', example: 'ETH < 0.05' },
  { id: 'inactivity', trigger: 'inactivity', catches: 'No activity for N hours', example: '12h silent · expected swaps' },
  { id: 'large_tx', trigger: 'large_tx', catches: 'Transfer or swap above threshold', example: '$10k+ movement' },
  { id: 'new_counterparty', trigger: 'new_counterparty', catches: 'Interacts with unknown contract', example: 'First seen 0x7Fc6…3a1d' },
  { id: 'approval', trigger: 'approval', catches: 'ERC20 unlimited approval granted', example: 'router spend = max' },
];

export function AlertMatrix() {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        background: 'var(--bg-1)',
        fontSize: 13,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '180px 1fr 1fr 140px',
          padding: '12px 20px',
          borderBottom: '1px solid var(--line)',
          color: 'var(--muted)',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
        className="v2-matrix-header"
      >
        <div>trigger</div>
        <div>catches</div>
        <div>example</div>
        <div style={{ textAlign: 'right' }}>delivery</div>
      </div>

      {alerts.map((a, i) => (
        <div
          key={a.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr 1fr 140px',
            padding: '16px 20px',
            borderTop: i === 0 ? 'none' : '1px solid var(--line)',
            alignItems: 'center',
            transition: 'background 0.15s',
          }}
          className="v2-matrix-row"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(92,240,164,0.03)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <div style={{ color: 'var(--phosphor)' }}>{a.trigger}</div>
          <div style={{ color: 'var(--fg)' }}>{a.catches}</div>
          <div style={{ color: 'var(--fg-dim)', fontStyle: 'italic' }}>{a.example}</div>
          <div
            style={{
              textAlign: 'right',
              color: 'var(--muted)',
              fontSize: 11,
              letterSpacing: '0.04em',
            }}
          >
            discord · tg · hook
          </div>
        </div>
      ))}

      <style>{`
        @media (max-width: 880px) {
          .v2-matrix-header { display: none !important; }
          .v2-matrix-row {
            display: block !important;
            padding: 18px 20px !important;
          }
          .v2-matrix-row > div { margin-bottom: 6px; text-align: left !important; }
        }
      `}</style>
    </div>
  );
}
