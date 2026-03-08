import chalk from 'chalk';
import Table from 'cli-table3';

export const brand = chalk.hex('#4ade80');

export function usd(value: number | string | null | undefined): string {
  if (value == null) return chalk.dim('—');
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return chalk.dim('—');
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}...`;
}

export function basescanTxLink(hash: string): string {
  const url = `https://basescan.org/tx/${hash}`;
  // OSC 8 hyperlink — works in iTerm2, VS Code terminal, etc.
  return `\x1b]8;;${url}\x07${shortHash(hash)}\x1b]8;;\x07`;
}

export function relativeTime(dateStr: string | Date | null): string {
  if (!dateStr) return chalk.dim('never');
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

export function directionBadge(dir: string): string {
  if (dir === 'out' || dir === 'outgoing') return chalk.red('OUT');
  if (dir === 'in' || dir === 'incoming') return chalk.green(' IN');
  return chalk.yellow(dir.toUpperCase().padStart(3));
}

export function statusBadge(enabled: boolean): string {
  return enabled ? chalk.green('active') : chalk.dim('paused');
}

export function severityBadge(severity: string): string {
  if (severity === 'critical') return chalk.red.bold(severity);
  if (severity === 'warning') return chalk.yellow(severity);
  return chalk.blue(severity);
}

export function createTable(head: string[], colWidths?: number[]): Table.Table {
  const opts: Table.TableConstructorOptions = {
    head: head.map((h) => brand(h)),
    style: { head: [], border: ['dim'] },
    chars: {
      top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
      bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      left: ' ', 'left-mid': '', mid: '', 'mid-mid': '',
      right: '', 'right-mid': '', middle: '  ',
    },
  };
  if (colWidths) opts.colWidths = colWidths;
  return new Table(opts);
}
