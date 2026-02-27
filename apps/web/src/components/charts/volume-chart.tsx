'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { TxVolumeBucket } from '@/lib/api';

interface VolumeChartProps {
  data: TxVolumeBucket[];
}

export function VolumeChart({ data }: VolumeChartProps) {
  const chartData = data.map((d) => ({
    time: new Date(d.bucket).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    volume: parseFloat(d.total_volume_usd ?? '0'),
    txCount: d.tx_count,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
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
          formatter={(value: number, name: string) => [
            name === 'volume' ? `$${value.toFixed(2)}` : value,
            name === 'volume' ? 'Volume' : 'Transactions',
          ]}
        />
        <Area
          type="monotone"
          dataKey="volume"
          stroke="#4ade80"
          fill="url(#volumeGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
