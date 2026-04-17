'use client';

import { DataTable, type Column } from '@/components/v2';

interface AlertRow {
  trigger: string;
  catches: string;
  example: string;
}

const alerts: AlertRow[] = [
  {
    trigger: 'failed_tx',
    catches: 'Transaction reverted on-chain',
    example: 'ERC20 insufficient allowance',
  },
  {
    trigger: 'gas_spike',
    catches: 'Gas cost exceeds threshold',
    example: '$4.20 (3× baseline)',
  },
  {
    trigger: 'balance_drop',
    catches: 'Wallet balance falls below floor',
    example: 'ETH < 0.05',
  },
  {
    trigger: 'inactivity',
    catches: 'No activity for N hours',
    example: '12h silent · expected swaps',
  },
  {
    trigger: 'large_tx',
    catches: 'Transfer or swap above threshold',
    example: '$10k+ movement',
  },
  {
    trigger: 'new_counterparty',
    catches: 'Interacts with unknown contract',
    example: 'First seen 0x7Fc6…3a1d',
  },
  {
    trigger: 'approval',
    catches: 'ERC20 unlimited approval granted',
    example: 'router spend = max',
  },
];

const columns: Column<AlertRow>[] = [
  {
    key: 'trigger',
    header: 'trigger',
    width: '180px',
    accent: true,
    render: (r) => r.trigger,
  },
  {
    key: 'catches',
    header: 'catches',
    render: (r) => r.catches,
  },
  {
    key: 'example',
    header: 'example',
    render: (r) => (
      <span style={{ color: 'var(--fg-dim)', fontStyle: 'italic' }}>{r.example}</span>
    ),
  },
  {
    key: 'delivery',
    header: 'delivery',
    align: 'right',
    width: '180px',
    render: () => (
      <span style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '0.04em' }}>
        discord · tg · hook
      </span>
    ),
  },
];

export function AlertMatrix() {
  return <DataTable columns={columns} rows={alerts} />;
}
