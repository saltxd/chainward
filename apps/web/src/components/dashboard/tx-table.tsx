'use client';

import type { Transaction } from '@/lib/api';
import { cn } from '@/lib/utils';

function formatTxType(txType: string | null, methodName?: string | null): string {
  if (methodName) {
    const name = methodName.toLowerCase();
    if (name.includes('swap')) return 'Swap';
    if (name.includes('approve')) return 'Approval';
    if (name.includes('transfer')) return 'Transfer';
    if (name.includes('deposit') || name.includes('wrap')) return 'Deposit';
    if (name.includes('withdraw') || name.includes('unwrap')) return 'Withdraw';
  }
  if (txType === 'contract_call') return 'Contract Call';
  if (txType === 'transfer') return 'Transfer';
  return txType ?? 'Unknown';
}

interface TxTableProps {
  transactions: Transaction[];
  showWallet?: boolean;
  onSelectTx?: (tx: Transaction) => void;
}

export function TxTable({ transactions, showWallet, onSelectTx }: TxTableProps) {
  if (transactions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-3 pr-4">Time</th>
            <th className="pb-3 pr-4">Type</th>
            <th className="pb-3 pr-4">Dir</th>
            {showWallet && <th className="pb-3 pr-4">Wallet</th>}
            <th className="pb-3 pr-4">Token</th>
            <th className="pb-3 pr-4 text-right">Amount (USD)</th>
            <th className="pb-3 pr-4 text-right">Gas (USD)</th>
            <th className="pb-3 pr-4">Counterparty</th>
            <th className="pb-3 pr-4">Status</th>
            <th className="pb-3">Tx Hash</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, i) => (
            <tr
              key={`${tx.txHash}-${i}`}
              onClick={() => onSelectTx?.(tx)}
              className={cn(
                'border-b border-border/50 last:border-0',
                onSelectTx && 'cursor-pointer transition-colors hover:bg-muted/50',
              )}
            >
              <td className="py-3 pr-4 text-muted-foreground">
                {new Date(tx.timestamp).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td className="py-3 pr-4">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {formatTxType(tx.txType, tx.methodName)}
                </span>
              </td>
              <td className="py-3 pr-4">
                <span
                  className={cn(
                    'text-xs font-medium',
                    tx.direction === 'in' && 'text-accent-foreground',
                    tx.direction === 'out' && 'text-destructive',
                    tx.direction === 'self' && 'text-muted-foreground',
                  )}
                >
                  {tx.direction === 'in' ? '↓ IN' : tx.direction === 'out' ? '↑ OUT' : '↔ SELF'}
                </span>
              </td>
              {showWallet && (
                <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                  {tx.walletAddress.slice(0, 6)}...{tx.walletAddress.slice(-4)}
                </td>
              )}
              <td className="py-3 pr-4 font-mono text-xs">{tx.tokenSymbol ?? 'ETH'}</td>
              <td className="py-3 pr-4 text-right font-mono text-xs">
                {tx.amountUsd && parseFloat(tx.amountUsd) > 0.005
                  ? `$${parseFloat(tx.amountUsd).toFixed(2)}`
                  : <span className="text-muted-foreground">&mdash;</span>}
              </td>
              <td className="py-3 pr-4 text-right font-mono text-xs text-muted-foreground">
                {tx.gasCostUsd ? `$${parseFloat(tx.gasCostUsd).toFixed(4)}` : '-'}
              </td>
              <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                {tx.counterparty
                  ? `${tx.counterparty.slice(0, 6)}...${tx.counterparty.slice(-4)}`
                  : '-'}
              </td>
              <td className="py-3 pr-4">
                <span
                  className={cn(
                    'text-xs',
                    tx.status === 'confirmed' && 'text-accent-foreground',
                    tx.status === 'failed' && 'text-destructive',
                  )}
                >
                  {tx.status}
                </span>
              </td>
              <td className="py-3">
                <span className="font-mono text-xs text-muted-foreground">
                  {tx.txHash.slice(0, 10)}...
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
