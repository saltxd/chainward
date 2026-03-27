'use client';

import { useEffect, useRef, useState } from 'react';
import type { Transaction } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TxDetailPanelProps {
  transaction: Transaction | null;
  onClose: () => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      className="ml-2 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-3 last:border-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{children}</span>
    </div>
  );
}

export function TxDetailPanel({ transaction, onClose }: TxDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (transaction) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [transaction, onClose]);

  if (!transaction) return null;

  const tx = transaction;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Transaction Details</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Row label="Hash">
            <span className="font-mono text-xs">{tx.txHash.slice(0, 16)}...{tx.txHash.slice(-8)}</span>
            <CopyButton text={tx.txHash} />
          </Row>
          <Row label="Block">
            {tx.blockNumber.toLocaleString()}
          </Row>
          <Row label="Time">
            {new Date(tx.timestamp).toLocaleString()}
          </Row>
          <Row label="Status">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-xs font-medium',
                tx.status === 'confirmed' && 'bg-accent-foreground/20 text-accent-foreground',
                tx.status === 'failed' && 'bg-destructive/20 text-destructive',
              )}
            >
              {tx.status}
            </span>
          </Row>
          <Row label="Direction">
            <span
              className={cn(
                'text-xs font-medium',
                tx.direction === 'in' && 'text-accent-foreground',
                tx.direction === 'out' && 'text-destructive',
                tx.direction === 'self' && 'text-muted-foreground',
              )}
            >
              {tx.direction === 'in' ? '↓ Incoming' : tx.direction === 'out' ? '↑ Outgoing' : '↔ Self'}
            </span>
          </Row>
          <Row label="Type">
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{tx.txType ?? 'unknown'}</span>
          </Row>
          {tx.methodName && (
            <Row label="Method">
              <span className="font-mono text-xs">{tx.methodName}</span>
            </Row>
          )}
          <Row label="Wallet">
            <span className="font-mono text-xs">{tx.walletAddress.slice(0, 10)}...{tx.walletAddress.slice(-6)}</span>
            <CopyButton text={tx.walletAddress} />
          </Row>
          {tx.counterparty && (
            <Row label="Counterparty">
              <span className="font-mono text-xs">{tx.counterparty.slice(0, 10)}...{tx.counterparty.slice(-6)}</span>
              <CopyButton text={tx.counterparty} />
            </Row>
          )}
          <Row label="Token">{tx.tokenSymbol ?? 'ETH'}</Row>
          <Row label="Amount (USD)">
            {tx.amountUsd ? `$${parseFloat(tx.amountUsd).toFixed(2)}` : 'No price data'}
          </Row>
          <Row label="Gas (USD)">
            {tx.gasCostUsd ? `$${parseFloat(tx.gasCostUsd).toFixed(4)}` : '-'}
          </Row>
          <Row label="Chain">{tx.chain}</Row>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <a
            href={`https://basescan.org/tx/${tx.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            View on BaseScan ↗
          </a>
        </div>
      </div>
    </>
  );
}
