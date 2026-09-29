'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { TxVolumeBucket } from '@/lib/api';

interface VolumeChartProps {
  data: TxVolumeBucket[];
  /** Bucket size the data was fetched with; sets the axis label format. */
  bucket?: '1h' | '1d';
}

// Bars, not a smoothed area: buckets are discrete, and a curve drawn through
// sparse points turns one transfer into a day-long hill.
export function VolumeChart({ data, bucket = '1h' }: VolumeChartProps) {
  const chartData = data.map((d) => ({
    time: new Date(d.bucket).toLocaleDateString(
      undefined,
      bucket === '1d'
        ? { month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    ),
    volume: parseFloat(d.total_volume_usd ?? '0'),
    txCount: d.tx_count,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="time"
          tick={{ fill: '#9ba397', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={32}
        />
        <YAxis
          tick={{ fill: '#9ba397', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${v.toLocaleString()}`}
        />
        <Tooltip
          cursor={{ fill: 'rgba(58, 167, 109, 0.08)' }}
          contentStyle={{
            backgroundColor: '#0f1110',
            border: '1px solid #1e231f',
            borderRadius: 0,
            fontSize: '12px',
          }}
          labelStyle={{ color: '#9ba397' }}
          formatter={(value: number, name: string) => [
            name === 'volume' ? `$${value.toFixed(2)}` : value,
            name === 'volume' ? 'Volume' : 'Transactions',
          ]}
        />
        <Bar dataKey="volume" fill="#3aa76d" maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
