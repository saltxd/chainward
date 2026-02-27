export type TimeBucket = '1h' | '4h' | '1d' | '7d' | '30d';

export const TIME_BUCKET_INTERVALS: Record<TimeBucket, string> = {
  '1h': '1 hour',
  '4h': '4 hours',
  '1d': '1 day',
  '7d': '7 days',
  '30d': '30 days',
};

/** Get a Date for N hours/days ago */
export function timeAgo(amount: number, unit: 'hours' | 'days' | 'minutes'): Date {
  const now = new Date();
  switch (unit) {
    case 'minutes':
      return new Date(now.getTime() - amount * 60 * 1000);
    case 'hours':
      return new Date(now.getTime() - amount * 60 * 60 * 1000);
    case 'days':
      return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
  }
}

/** Format a relative time string (e.g., "5m ago", "2h ago", "3d ago") */
export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
