'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { GasBucket } from '@/lib/api';

interface GasChartProps {
  data: GasBucket[];
}

export function GasChart({ data }: GasChartProps) {
  const chartData = data.map((d) => ({
    time: new Date(d.bucket).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    gas: parseFloat(d.total_gas_usd ?? '0'),
    txCount: d.tx_count,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
          tickFormatter={(v: number) => v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
          contentStyle={{
            backgroundColor: '#111827',
            border: '1px solid #27272a',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#a1a1aa' }}
          formatter={(value: number, name: string) => [
            name === 'gas' ? `$${value.toFixed(4)}` : value,
            name === 'gas' ? 'Gas Spend' : 'Tx Count',
          ]}
        />
        <Bar dataKey="gas" fill="#4ade80" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
