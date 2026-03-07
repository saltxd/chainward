'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, type Agent, type AgentStats, type FleetOverview } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { StatCard } from '@/components/ui/stat-card';
import { Address } from '@/components/ui/address';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ui/error-banner';
import { cn } from '@/lib/utils';

function AgentCard({ agent }: { agent: Agent }) {
  const { data: stats } = useApi<AgentStats>(
    () => api.getAgentStats(agent.id),
    [agent.id],
  );

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
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
  return (
    <Suspense>
      <AgentsContent />
    </Suspense>
  );
}

function AgentsContent() {
  const searchParams = useSearchParams();
  const { data: overview, loading: overviewLoading, error: overviewError, refetch: refetchOverview } = useApi<FleetOverview>(
    () => api.getOverview(),
    [],
  );
  const { data: agents, loading: agentsLoading, error: agentsError, refetch } = useApi<Agent[]>(
    () => api.getAgents(),
    [],
  );

  const [showRegister, setShowRegister] = useState(searchParams.get('register') === 'true');
  const [form, setForm] = useState({ chain: 'base', walletAddress: '', agentName: '' });
  const [registering, setRegistering] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);

  function validateAddress(address: string): boolean {
    if (!address.startsWith('0x')) {
      setAddressError('Address must start with 0x');
      return false;
    }
    if (address.length !== 42) {
      setAddressError('Address must be 42 characters (0x + 40 hex chars)');
      return false;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      setAddressError('Address contains invalid characters');
      return false;
    }
    setAddressError(null);
    return true;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAddress(form.walletAddress)) return;
    setRegistering(true);
    setCreateError(null);
    try {
      await api.createAgent({
        chain: form.chain,
        walletAddress: form.walletAddress,
        agentName: form.agentName || undefined,
      });
      setShowRegister(false);
      setForm({ chain: 'base', walletAddress: '', agentName: '' });
      setAddressError(null);
      refetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to register agent');
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-muted-foreground">Monitor your registered AI agent wallets</p>
        </div>
        <button
          onClick={() => setShowRegister(!showRegister)}
          className="min-h-[44px] shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Register Agent
        </button>
      </div>

      {(overviewError || agentsError) && (
        <ErrorBanner
          message={overviewError ?? agentsError ?? ''}
          onRetry={() => { refetchOverview(); refetch(); }}
        />
      )}

      {createError && <ErrorBanner message={createError} />}

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
                onChange={(e) => {
                  setForm({ ...form, walletAddress: e.target.value });
                  if (addressError) setAddressError(null);
                }}
                placeholder="0x..."
                required
                className={cn(
                  'rounded-lg border bg-background px-3 py-2 font-mono text-sm',
                  addressError ? 'border-destructive' : 'border-border',
                )}
              />
              {addressError && (
                <p className="text-xs text-destructive">{addressError}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Name <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input
                value={form.agentName}
                onChange={(e) => setForm({ ...form, agentName: e.target.value })}
                placeholder={form.walletAddress ? `Agent ${form.walletAddress.slice(0, 6)}...${form.walletAddress.slice(-4)}` : 'Optional — auto-generated from address'}
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
