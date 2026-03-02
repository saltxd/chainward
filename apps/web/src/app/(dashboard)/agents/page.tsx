'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, type Agent, type AgentStats, type FleetOverview } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { StatCard } from '@/components/ui/stat-card';
import { Address } from '@/components/ui/address';
import { Skeleton } from '@/components/ui/skeleton';

function AgentCard({ agent }: { agent: Agent }) {
  const { data: stats } = useApi<AgentStats>(
    () => api.getAgentStats(agent.id),
    [agent.id],
  );

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="font-medium">{agent.agentName ?? 'Unnamed Agent'}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {agent.chain}
          </span>
          {agent.agentFramework && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
              {agent.agentFramework}
            </span>
          )}
        </div>
        <Address address={agent.walletAddress} chain={agent.chain} />
      </div>
      <div className="flex items-center gap-4">
        {stats ? (
          <div className="flex gap-4 text-right text-xs text-muted-foreground">
            <div>
              <div className="font-medium text-foreground">{stats.stats.txCount24h}</div>
              <div>24h txs</div>
            </div>
            <div>
              <div className="font-medium text-foreground">{stats.stats.txCount7d}</div>
              <div>7d txs</div>
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Loading...</span>
        )}
        <span className="text-sm text-muted-foreground">→</span>
      </div>
    </Link>
  );
}

export default function AgentsPage() {
  const { data: overview, loading: overviewLoading } = useApi<FleetOverview>(
    () => api.getOverview(),
    [],
  );
  const { data: agents, loading: agentsLoading, refetch } = useApi<Agent[]>(
    () => api.getAgents(),
    [],
  );

  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState({ chain: 'base', walletAddress: '', agentName: '' });
  const [registering, setRegistering] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegistering(true);
    try {
      const defaultName = `Agent ${form.walletAddress.slice(0, 6)}...${form.walletAddress.slice(-4)}`;
      await api.createAgent({
        chain: form.chain,
        walletAddress: form.walletAddress,
        agentName: form.agentName || defaultName,
      });
      setShowRegister(false);
      setForm({ chain: 'base', walletAddress: '', agentName: '' });
      refetch();
    } catch {
      // error handling in future
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-muted-foreground">Monitor your registered AI agent wallets</p>
        </div>
        <button
          onClick={() => setShowRegister(!showRegister)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Register Agent
        </button>
      </div>

      {/* Register form */}
      {showRegister && (
        <form onSubmit={handleRegister} className="rounded-lg border border-border bg-card p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Chain</label>
              <select
                value={form.chain}
                onChange={(e) => setForm({ ...form, chain: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="base">Base</option>
                <option value="solana" disabled>Solana (coming soon)</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Wallet Address</label>
              <input
                value={form.walletAddress}
                onChange={(e) => setForm({ ...form, walletAddress: e.target.value })}
                placeholder="0x..."
                required
                className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Name</label>
              <input
                value={form.agentName}
                onChange={(e) => setForm({ ...form, agentName: e.target.value })}
                placeholder="My Trading Agent"
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={registering}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {registering ? 'Registering...' : 'Register'}
          </button>
        </form>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {overviewLoading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            <StatCard label="Total Agents" value={String(overview?.agents.total ?? 0)} />
            <StatCard
              label="Total Value"
              value={`$${(overview?.totalValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
            <StatCard
              label="24h Transactions"
              value={String(overview?.transactions24h ?? 0)}
              subValue={overview?.gasSpend24h ? `$${overview.gasSpend24h.toFixed(2)} gas` : undefined}
            />
          </>
        )}
      </div>

      {/* Agent list */}
      {agentsLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : agents && agents.length > 0 ? (
        <div className="grid gap-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No agents registered yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Register a wallet address to start monitoring.
          </p>
        </div>
      )}
    </div>
  );
}
