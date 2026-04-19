'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  api,
  ApiError,
  type Agent,
  type AgentStats,
  type FleetOverview,
} from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ui/error-banner';
import {
  SectionHead,
  StatTile,
  Badge,
  Button,
} from '@/components/v2';

function AgentRow({ agent }: { agent: Agent }) {
  const { data: stats } = useApi<AgentStats>(
    () => api.getAgentStats(agent.id),
    [agent.id],
  );

  return (
    <Link href={`/agents/${agent.id}`} className="v2-agent-row">
      <div className="v2-agent-row-main">
        <div className="v2-agent-row-head">
          <span style={{ color: 'var(--fg)', fontWeight: 500 }}>
            {agent.agentName ?? 'Unnamed Agent'}
          </span>
          <Badge>{agent.chain}</Badge>
          {agent.agentFramework && <Badge tone="phosphor">{agent.agentFramework}</Badge>}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--fg-dim)',
            marginTop: 4,
          }}
        >
          {agent.walletAddress.slice(0, 10)}…{agent.walletAddress.slice(-8)}
        </div>
      </div>
      <div className="v2-agent-row-stats">
        {stats ? (
          <>
            <div>
              <span style={{ color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                {stats.stats.txCount24h}
              </span>
              <span style={{ color: 'var(--muted)', marginLeft: 6 }}>24h</span>
            </div>
            <div>
              <span style={{ color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                {stats.stats.txCount7d}
              </span>
              <span style={{ color: 'var(--muted)', marginLeft: 6 }}>7d</span>
            </div>
          </>
        ) : (
          <span style={{ color: 'var(--muted)' }}>…</span>
        )}
        <span style={{ color: 'var(--phosphor)', marginLeft: 16 }}>→</span>
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    data: overview,
    loading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useApi<FleetOverview>(() => api.getOverview(), []);
  const {
    data: agents,
    loading: agentsLoading,
    error: agentsError,
    refetch,
  } = useApi<Agent[]>(() => api.getAgents(), []);

  const [showRegister, setShowRegister] = useState(searchParams.get('register') === 'true');
  const [form, setForm] = useState({ chain: 'base', walletAddress: '', agentName: '' });
  const [registering, setRegistering] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [contractWarning, setContractWarning] = useState(false);

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

  async function handleRegister(e: React.FormEvent, confirmContract = false) {
    e.preventDefault();
    if (!validateAddress(form.walletAddress)) return;
    setRegistering(true);
    setCreateError(null);
    setContractWarning(false);
    try {
      const created = await api.createAgent({
        chain: form.chain,
        walletAddress: form.walletAddress,
        agentName: form.agentName || undefined,
        confirmContract: confirmContract || undefined,
      });

      const shouldGuideToFirstAlert = (agents?.length ?? 0) === 0;
      setShowRegister(false);
      setForm({ chain: 'base', walletAddress: '', agentName: '' });
      setAddressError(null);

      if (shouldGuideToFirstAlert) {
        const params = new URLSearchParams({
          wallet: created.data.walletAddress,
          preset: 'failed_tx',
          source: 'first-agent',
        });
        router.push(`/alerts?${params.toString()}`);
        return;
      }

      refetch();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONTRACT_WARNING') {
        setContractWarning(true);
        setCreateError(err.message);
      } else {
        setCreateError(err instanceof Error ? err.message : 'Failed to register agent');
      }
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 40 }}>
      <div className="v2-agents-header">
        <SectionHead
          tag="fleet"
          title={
            <>
              Registered <span className="serif">agents.</span>
            </>
          }
          lede="Your monitored wallets. Click one for full telemetry, alerts, and history."
        />
        <Button onClick={() => setShowRegister(!showRegister)}>+ register agent</Button>
      </div>

      {(overviewError || agentsError) && (
        <ErrorBanner
          message={overviewError ?? agentsError ?? ''}
          onRetry={() => {
            refetchOverview();
            refetch();
          }}
        />
      )}

      {createError && (
        <div>
          <ErrorBanner message={createError} />
          {contractWarning && (
            <button
              type="button"
              onClick={(e) => handleRegister(e as unknown as React.FormEvent, true)}
              disabled={registering}
              className="v2-agents-warn-btn"
            >
              {registering ? 'registering…' : 'register anyway'}
            </button>
          )}
        </div>
      )}

      {showRegister && (
        <form onSubmit={handleRegister} className="v2-agents-form">
          <div className="v2-agents-form-grid">
            <label>
              <span>chain</span>
              <select
                value={form.chain}
                onChange={(e) => setForm({ ...form, chain: e.target.value })}
              >
                <option value="base">base</option>
              </select>
            </label>
            <label>
              <span>wallet address</span>
              <input
                value={form.walletAddress}
                onChange={(e) => {
                  setForm({ ...form, walletAddress: e.target.value });
                  if (addressError) setAddressError(null);
                }}
                placeholder="0x…"
                required
                style={{
                  borderColor: addressError ? 'var(--danger)' : 'var(--line-2)',
                }}
              />
              {addressError && (
                <span className="v2-agents-form-err">{addressError}</span>
              )}
            </label>
            <label>
              <span>
                name <span style={{ color: 'var(--muted)' }}>(optional)</span>
              </span>
              <input
                value={form.agentName}
                onChange={(e) => setForm({ ...form, agentName: e.target.value })}
                placeholder={
                  form.walletAddress
                    ? `Agent ${form.walletAddress.slice(0, 6)}…${form.walletAddress.slice(-4)}`
                    : 'auto-generated if empty'
                }
              />
            </label>
          </div>
          <div style={{ marginTop: 20 }}>
            <Button type="submit" disabled={registering}>
              {registering ? 'registering…' : './register'}
            </Button>
          </div>
        </form>
      )}

      {/* Stats */}
      {overviewLoading ? (
        <div className="v2-dash-stats">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : (
        <div className="v2-dash-stats v2-dash-stats-3">
          <StatTile
            label="agents.registered"
            value={String(overview?.agents.total ?? 0)}
            size="md"
          />
          <StatTile
            label="portfolio"
            value={`$${(overview?.totalValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            size="md"
          />
          <StatTile
            label="tx.24h"
            value={String(overview?.transactions24h ?? 0)}
            unit={
              overview?.gasSpend24h
                ? `$${overview.gasSpend24h.toFixed(2)} gas`
                : undefined
            }
            size="md"
          />
        </div>
      )}

      {/* Agent list */}
      {agentsLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : agents && agents.length > 0 ? (
        <div
          style={{
            border: '1px solid var(--line)',
            background: 'var(--bg-1)',
          }}
        >
          {agents.map((agent) => (
            <AgentRow key={agent.id} agent={agent} />
          ))}
        </div>
      ) : (
        <div className="v2-agents-empty">
          <p style={{ color: 'var(--fg)', fontSize: 14, margin: 0 }}>
            No agents registered yet.
          </p>
          <p style={{ color: 'var(--fg-dim)', fontSize: 13, marginTop: 8 }}>
            Paste a wallet address above to start monitoring.
          </p>
        </div>
      )}

      <style>{`
        .v2-agents-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }
        .v2-agents-header .v2-sh-head { margin-bottom: 0; }
        .v2-dash-stats {
          display: grid;
          gap: 32px;
          padding-top: 8px;
          border-top: 1px solid var(--line);
          grid-template-columns: repeat(4, 1fr);
        }
        .v2-dash-stats-3 { grid-template-columns: repeat(3, 1fr); }
        .v2-agents-form {
          border: 1px solid var(--line-2);
          background: var(--bg-1);
          padding: 24px;
        }
        .v2-agents-form-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: 120px 1fr 1fr;
        }
        .v2-agents-form-grid label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .v2-agents-form-grid label > span {
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .v2-agents-form-grid input,
        .v2-agents-form-grid select {
          background: transparent;
          border: 1px solid var(--line-2);
          color: var(--fg);
          padding: 10px 12px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 13px;
        }
        .v2-agents-form-grid input:focus,
        .v2-agents-form-grid select:focus {
          outline: none;
          border-color: var(--phosphor);
        }
        .v2-agents-form-err {
          color: var(--danger);
          font-size: 11px;
        }
        .v2-agents-warn-btn {
          margin-top: 12px;
          padding: 10px 16px;
          border: 1px solid rgba(232, 160, 51, 0.3);
          background: rgba(232, 160, 51, 0.08);
          color: var(--amber);
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: background 0.15s;
        }
        .v2-agents-warn-btn:hover {
          background: rgba(232, 160, 51, 0.15);
        }
        .v2-agents-warn-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .v2-agent-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 24px;
          padding: 18px 24px;
          border-top: 1px solid var(--line);
          text-decoration: none;
          transition: background 0.15s;
          align-items: center;
        }
        .v2-agent-row:first-child { border-top: none; }
        .v2-agent-row:hover { background: rgba(58, 167, 109, 0.03); }
        .v2-agent-row-head {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          font-size: 14px;
        }
        .v2-agent-row-stats {
          display: flex;
          align-items: center;
          gap: 24px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 13px;
        }
        .v2-agents-empty {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 48px 24px;
          text-align: center;
        }

        @media (max-width: 720px) {
          .v2-agents-form-grid { grid-template-columns: 1fr; }
          .v2-dash-stats, .v2-dash-stats-3 { grid-template-columns: 1fr 1fr; }
          .v2-agent-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
