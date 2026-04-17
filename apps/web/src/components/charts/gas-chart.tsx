'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { GasBucket } from '@/lib/api';

interface GasChartProps {
  data: GasBucket[];
}

export function GasChart({ data }: GasChartProps) {
  const chartData = data.map((d) => ({
    time: new Date(d.bucket).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    gas: parseFloat(d.total_gas_usd ?? '0'),
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
          tickFormatter={(v: number) =>
            v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`
          }
        />
        <Tooltip
          cursor={{ fill: 'rgba(61, 216, 141, 0.06)' }}
          contentStyle={{
            backgroundColor: '#0f1110',
            border: '1px solid #1e231f',
            borderRadius: 0,
            fontSize: '12px',
          }}
          labelStyle={{ color: '#9ba397' }}
          formatter={(value: number, name: string) => [
            name === 'gas' ? `$${value.toFixed(4)}` : value,
            name === 'gas' ? 'Gas Spend' : 'Tx Count',
          ]}
        />
        <Bar dataKey="gas" fill="#3dd88d" />
      </BarChart>
    </ResponsiveContainer>
  );
}
