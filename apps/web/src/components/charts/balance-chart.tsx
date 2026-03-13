'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { BalanceHistoryBucket } from '@/lib/api';

interface BalanceChartProps {
  data: BalanceHistoryBucket[];
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
      time: new Date(bucket).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value,
    }));

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
          tick={{ fill: '#a1a1aa', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
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
