/** Format USD value with appropriate precision */
export function formatUsd(value: number): string {
  if (Math.abs(value) < 0.01) {
    return `$${value.toFixed(6)}`;
  }
  if (Math.abs(value) < 1) {
    return `$${value.toFixed(4)}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format large numbers with K/M/B suffixes */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/** Format a raw token amount given decimals */
export function formatTokenAmount(raw: string, decimals: number, maxPrecision = 6): string {
  const value = Number(raw) / 10 ** decimals;
  if (value === 0) return '0';
  if (value < 0.000001) return '<0.000001';
  return value.toFixed(Math.min(decimals, maxPrecision)).replace(/\.?0+$/, '');
}

/** Format gas in gwei */
export function formatGwei(gwei: number): string {
  if (gwei < 0.01) return '<0.01 gwei';
  return `${gwei.toFixed(2)} gwei`;
}
