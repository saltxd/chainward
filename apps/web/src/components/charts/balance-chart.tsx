'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { BalanceHistoryBucket } from '@/lib/api';

interface BalanceChartProps {
  data: BalanceHistoryBucket[];
}

export function getBalanceSummary(data: BalanceHistoryBucket[]) {
  if (!data || data.length === 0) return null;
  const bucketTotals = new Map<string, number>();
  for (const b of data) {
    bucketTotals.set(b.bucket, (bucketTotals.get(b.bucket) ?? 0) + parseFloat(b.balance_usd ?? '0'));
  }
  const sorted = Array.from(bucketTotals.entries()).sort(
    ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
  );
  if (sorted.length === 0) return null;
  const current = sorted[sorted.length - 1]![1];
  const earliest = sorted[0]![1];
  const deltaAbs = current - earliest;
  const deltaPct = earliest > 0 ? (deltaAbs / earliest) * 100 : 0;
  return { current, deltaAbs, deltaPct, hasDelta: sorted.length > 1 };
}

export function BalanceChart({ data }: BalanceChartProps) {
  // Sum all token balances per time bucket
  const bucketMap = new Map<string, number>();
  for (const d of data) {
    const key = d.bucket;
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + parseFloat(d.balance_usd ?? '0'));
  }

  const chartData = Array.from(bucketMap.entries())
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([bucket, value]) => ({
      time: new Date(bucket).getTime(),
      value,
    }));

  const spanMs = chartData.length > 1
    ? chartData[chartData.length - 1]!.time - chartData[0]!.time
    : 0;
  const spanDays = spanMs / (24 * 60 * 60 * 1000);
  const formatTick = (t: number) => {
    const d = new Date(t);
    if (spanDays <= 1) return d.toLocaleTimeString(undefined, { hour: 'numeric' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  if (chartData.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Insufficient data for chart — need at least 2 balance snapshots
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tick={{ fill: '#a1a1aa', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={40}
          tickFormatter={formatTick}
        />
        <YAxis
          tick={{ fill: '#a1a1aa', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${v.toLocaleString()}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#111827',
            border: '1px solid #27272a',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#a1a1aa' }}
          labelFormatter={(label: number) => new Date(label).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Balance']}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#4ade80"
          fill="url(#balanceGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
