'use client';

import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Mirrors the API payload — keep in sync with ObservatoryService.getAgentDetail
interface AgentDetail {
  slug: string;
  walletAddress: string;
  agentName: string | null;
  agentFramework: string | null;
  twitterHandle: string | null;
  projectUrl: string | null;
  health: {
    score: number;
    uptimePct: number;
    gasEfficiency: number;
    failureRate: number;
    consistency: number;
  } | null;
  balanceSeries: Array<{ date: string; balanceUsd: number | null; balanceEth: number | null }>;
  transactions: Array<{
    timestamp: string;
    direction: string;
    tokenSymbol: string | null;
    amountUsd: number;
    gasCostUsd: number;
    txHash: string;
    txType: string;
    status: string;
  }>;
  acp: {
    name: string;
    symbol: string | null;
    role: string | null;
    revenue: number;
    agdp: number;
    jobs: number;
    successRate: number;
    uniqueBuyers: number;
    hasGraduated: boolean;
    isOnline: boolean;
  } | null;
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? '#4ade80' : score >= 40 ? '#facc15' : '#f87171';
  return (
    <div className="relative inline-flex items-center justify-center w-24 h-24">
      <svg className="absolute inset-0" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="42" fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 264} 264`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="text-2xl font-mono" style={{ color }}>{score}</span>
    </div>
  );
}

export function AgentDetailClient({ agent }: { agent: AgentDetail }) {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <header className="flex items-start gap-6 flex-wrap">
        <div>
          <Link href="/base" className="text-sm text-neutral-400 hover:text-neutral-200">← Observatory</Link>
          <h1 className="text-3xl font-mono mt-2">{agent.agentName ?? agent.slug}</h1>
          <div className="text-sm text-neutral-400 mt-1 font-mono break-all">{agent.walletAddress}</div>
          <div className="flex gap-2 mt-2 text-xs">
            {agent.agentFramework && (
              <span className="px-2 py-1 bg-neutral-800 rounded">{agent.agentFramework}</span>
            )}
            {agent.acp?.role && (
              <span className="px-2 py-1 bg-neutral-800 rounded">{agent.acp.role}</span>
            )}
            {agent.acp?.hasGraduated && (
              <span className="px-2 py-1 bg-green-900/40 text-green-300 rounded">graduated</span>
            )}
            {agent.acp?.isOnline && (
              <span className="px-2 py-1 bg-green-900/40 text-green-300 rounded">online</span>
            )}
          </div>
          {agent.twitterHandle && (
            <a
              href={`https://twitter.com/${agent.twitterHandle}`}
              target="_blank" rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:underline mt-2 inline-block"
            >@{agent.twitterHandle}</a>
          )}
        </div>

        {/* Score */}
        {agent.health && (
          <div className="ml-auto flex items-center gap-4">
            <ScoreRing score={agent.health.score} />
            <div className="text-xs space-y-0.5 text-neutral-400">
              <div>uptime {agent.health.uptimePct.toFixed(0)}%</div>
              <div>gas-eff {agent.health.gasEfficiency.toFixed(0)}</div>
              <div>fail {agent.health.failureRate.toFixed(1)}%</div>
              <div>consist {agent.health.consistency.toFixed(0)}</div>
            </div>
          </div>
        )}
      </header>

      {/* ACP economics row */}
      {agent.acp && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="revenue" value={`$${Math.round(agent.acp.revenue).toLocaleString()}`} />
          <Stat label="jobs" value={agent.acp.jobs.toLocaleString()} />
          <Stat label="success" value={`${(agent.acp.successRate * 100).toFixed(1)}%`} />
          <Stat label="unique buyers" value={agent.acp.uniqueBuyers.toLocaleString()} />
        </section>
      )}

      {/* Balance chart */}
      <section>
        <h2 className="text-sm font-mono text-neutral-400 mb-2">balance — 30d</h2>
        {agent.balanceSeries.length === 0 ? (
          <div className="text-sm text-neutral-500 p-6 border border-neutral-800 rounded">no balance history yet</div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={agent.balanceSeries}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                  contentStyle={{ background: '#0a0a0a', border: '1px solid #333', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="balanceUsd" stroke="#4ade80" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Transactions */}
      <section>
        <h2 className="text-sm font-mono text-neutral-400 mb-2">recent transactions</h2>
        <div className="border border-neutral-800 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2">when</th>
                <th className="text-left px-3 py-2">type</th>
                <th className="text-left px-3 py-2">token</th>
                <th className="text-right px-3 py-2">amount</th>
                <th className="text-right px-3 py-2">gas</th>
                <th className="text-left px-3 py-2">tx</th>
              </tr>
            </thead>
            <tbody>
              {agent.transactions.slice(0, 20).map((tx) => (
                <tr key={tx.txHash + tx.timestamp} className="border-t border-neutral-900">
                  <td className="px-3 py-2 text-xs text-neutral-400">{new Date(tx.timestamp).toISOString().slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-3 py-2 text-xs">{tx.txType}</td>
                  <td className="px-3 py-2 text-xs">{tx.tokenSymbol ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-xs">${tx.amountUsd.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-xs text-neutral-400">${tx.gasCostUsd.toFixed(4)}</td>
                  <td className="px-3 py-2 text-xs">
                    <a
                      href={`https://basescan.org/tx/${tx.txHash}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:underline font-mono"
                    >{tx.txHash.slice(0, 10)}…</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-800 p-3 rounded">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="text-lg font-mono mt-1">{value}</div>
    </div>
  );
}
