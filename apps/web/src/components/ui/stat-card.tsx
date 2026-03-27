import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function StatCard({ label, value, subValue, trend, className }: StatCardProps) {
  return (
    <div className={cn('rounded-sm border border-border bg-card p-5', className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {subValue && (
          <span
            className={cn(
              'text-xs font-medium',
              trend === 'up' && 'text-accent-foreground',
              trend === 'down' && 'text-destructive',
              trend === 'neutral' && 'text-muted-foreground',
            )}
          >
            {subValue}
          </span>
        )}
      </div>
    </div>
  );
}
