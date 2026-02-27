'use client';

import type { Transaction } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TxTableProps {
  transactions: Transaction[];
  showWallet?: boolean;
}

export function TxTable({ transactions, showWallet }: TxTableProps) {
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
            <tr key={`${tx.txHash}-${i}`} className="border-b border-border/50 last:border-0">
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
                  {tx.txType ?? 'unknown'}
                </span>
              </td>
              <td className="py-3 pr-4">
                <span
                  className={cn(
                    'text-xs font-medium',
                    tx.direction === 'in' && 'text-[#4ade80]',
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
                {tx.amountUsd ? `$${parseFloat(tx.amountUsd).toFixed(2)}` : '-'}
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
                    tx.status === 'confirmed' && 'text-[#4ade80]',
                    tx.status === 'failed' && 'text-destructive',
                  )}
                >
                  {tx.status}
                </span>
              </td>
              <td className="py-3">
                <a
                  href={`https://basescan.org/tx/${tx.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {tx.txHash.slice(0, 10)}...
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
