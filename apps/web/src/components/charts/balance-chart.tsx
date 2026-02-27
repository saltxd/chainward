'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { BalanceHistoryBucket } from '@/lib/api';

interface BalanceChartProps {
  data: BalanceHistoryBucket[];
}

export function BalanceChart({ data }: BalanceChartProps) {
  const chartData = data
    .filter((d) => d.token_symbol === 'ETH' || d.token_address === null)
    .map((d) => ({
      time: new Date(d.bucket).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      value: parseFloat(d.balance_usd ?? '0'),
    }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#1B5E20" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#1B5E20" stopOpacity={0} />
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
          stroke="#1B5E20"
          fill="url(#balanceGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
