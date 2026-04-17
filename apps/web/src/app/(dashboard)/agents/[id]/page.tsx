'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState, useRef, useEffect } from 'react';
import {
  api,
  type AgentStats,
  type BalanceHistoryBucket,
  type GasBucket,
} from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Skeleton } from '@/components/ui/skeleton';
import { BalanceChart, getBalanceSummary } from '@/components/charts/balance-chart';
import { GasChart } from '@/components/charts/gas-chart';
import { TxTable } from '@/components/dashboard/tx-table';
import { EventTimeline } from '@/components/dashboard/event-timeline';
import { ErrorBanner } from '@/components/ui/error-banner';
import { GlassToggle } from '@/components/ui/glass-toggle';
import { StatTile, Badge, Button, SectionHead } from '@/components/v2';

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const agentId = Number(id);
  const router = useRouter();

  const {
    data: agentStats,
    loading,
    error,
    refetch: refetchAgent,
  } = useApi<AgentStats>(() => api.getAgentStats(agentId), [agentId]);

  const wallet = agentStats?.agent.walletAddress;

  const { data: balanceHistory } = useApi<BalanceHistoryBucket[]>(() => {
    if (!wallet) return Promise.resolve({ data: [] as BalanceHistoryBucket[] });
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    return api.getBalanceHistory({ wallet, bucket: '1h', from });
  }, [wallet]);

  const { data: gasData } = useApi<GasBucket[]>(() => {
    if (!wallet) return Promise.resolve({ data: [] as GasBucket[] });
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return api.getGasAnalytics({ wallet, bucket: '1d', from });
  }, [wallet]);

  const { data: txResponse } = useApi(
    () =>
      wallet
        ? api.getTransactions({ wallet, limit: '20' })
        : Promise.resolve({
            data: [],
            pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
          }),
    [wallet],
  );

  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Skeleton className="h-20" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refetchAgent} />;
  }

  if (!agentStats) {
    return <p style={{ color: 'var(--fg-dim)' }}>Agent not found</p>;
  }

  const { agent, stats } = agentStats;
  const balanceSummary = getBalanceSummary(balanceHistory ?? []);

  async function saveName() {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === agent.agentName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await api.updateAgent(agentId, { agentName: trimmed });
      refetchAgent();
      setEditing(false);
    } catch {
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setDeleting(true);
    try {
      await api.deleteAgent(agentId);
      router.push('/agents');
    } catch (err) {
      console.error('Delete agent failed:', err);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      {/* Header */}
      <div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--phosphor)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          <span style={{ color: 'var(--fg-dim)' }}>[ </span>
          agent.detail
          <span style={{ color: 'var(--fg-dim)' }}> ]</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {editing ? (
            <input
              ref={inputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') setEditing(false);
              }}
              disabled={saving}
              className="v2-agent-name-input"
              placeholder="Agent name"
            />
          ) : (
            <button
              onClick={() => {
                setNameValue(agent.agentName ?? '');
                setEditing(true);
              }}
              className="v2-agent-name-btn display"
              title="Click to rename"
            >
              {agent.agentName ?? 'Unnamed Agent'}
            </button>
          )}
          <Badge>{agent.chain}</Badge>
          {agent.agentFramework && <Badge tone="phosphor">{agent.agentFramework}</Badge>}
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--fg-dim)',
          }}
        >
          {agent.walletAddress}
        </div>
        <div
          style={{
            marginTop: 16,
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            href={`/alerts?wallet=${encodeURIComponent(agent.walletAddress)}&preset=failed_tx&source=agent-detail`}
          >
            + failed-tx alert
          </Button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={`v2-agent-delete ${confirmDelete ? 'v2-agent-delete-confirm' : ''}`}
          >
            {deleting
              ? 'deleting…'
              : confirmDelete
                ? 'click again to confirm'
                : 'delete agent'}
          </button>
        </div>
      </div>

      {/* Public page toggle */}
      <div className="v2-agent-public">
        <div>
          <p style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, margin: 0 }}>
            Public Status Page
          </p>
          <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 4, marginBottom: 0 }}>
            {agent.isPublic ? (
              <>
                Live at{' '}
                <a
                  href={`/agent/${agent.walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--phosphor)', textDecoration: 'none' }}
                >
                  chainward.ai/agent/{agent.walletAddress.slice(0, 8)}…
                </a>
              </>
            ) : (
              'Share a read-only dashboard of this agent.'
            )}
          </p>
        </div>
        <GlassToggle
          enabled={agent.isPublic}
          onChange={async () => {
            await api.updateAgent(agentId, { isPublic: !agent.isPublic });
            refetchAgent();
          }}
          label={
            agent.isPublic ? 'Disable public status page' : 'Enable public status page'
          }
        />
      </div>

      {/* Stats row */}
      <div className="v2-dash-stats">
        <StatTile label="tx.24h" value={String(stats.txCount24h)} size="md" />
        <StatTile
          label="volume.24h"
          value={`$${stats.volume24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          size="md"
        />
        <StatTile label="gas.24h" value={`$${stats.gasSpend24h.toFixed(2)}`} size="md" />
        <StatTile label="tx.7d" value={String(stats.txCount7d)} size="md" />
      </div>

      {/* Balance chart */}
      <div className="v2-dash-card">
        <div className="v2-dash-section-head">
          <div>
            <SectionHead tag="balance.7d" title="Balance history." />
            {balanceSummary && (
              <div className="v2-agent-balance">
                <span className="v2-agent-balance-big">
                  $
                  {balanceSummary.current.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </span>
                {balanceSummary.hasDelta && (
                  <span
                    className="v2-agent-balance-delta"
                    style={{
                      color:
                        balanceSummary.deltaAbs >= 0 ? 'var(--phosphor)' : 'var(--danger)',
                    }}
                  >
                    {balanceSummary.deltaAbs >= 0 ? '+' : ''}
                    $
                    {balanceSummary.deltaAbs.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                    {' ('}
                    {balanceSummary.deltaPct >= 0 ? '+' : ''}
                    {balanceSummary.deltaPct.toFixed(2)}%) · 7d
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {balanceHistory && balanceHistory.length > 0 ? (
          <BalanceChart data={balanceHistory} />
        ) : (
          <div className="v2-dash-empty">No balance data yet.</div>
        )}
      </div>

      {/* Gas chart */}
      <div className="v2-dash-card">
        <SectionHead tag="gas.30d" title="Gas analytics." />
        {gasData && gasData.length > 0 ? (
          <GasChart data={gasData} />
        ) : (
          <div className="v2-dash-empty">No gas data yet.</div>
        )}
      </div>

      {/* Event timeline */}
      <div className="v2-dash-card">
        <SectionHead tag="events" title={<>Agent <span className="serif">events.</span></>} />
        <EventTimeline agentId={agentId} />
      </div>

      {/* Transaction table */}
      <div>
        <SectionHead tag="recent.tx" title="Recent transactions." />
        <TxTable transactions={txResponse ?? []} />
      </div>

      <style>{`
        .v2-agent-name-btn {
          background: transparent;
          border: none;
          color: var(--fg);
          font-size: clamp(28px, 4vw, 44px);
          cursor: pointer;
          padding: 0;
          letter-spacing: -0.035em;
          line-height: 1.02;
        }
        .v2-agent-name-btn:hover { color: var(--phosphor); }
        .v2-agent-name-input {
          background: transparent;
          border: 1px solid var(--line-2);
          color: var(--fg);
          font-family: var(--font-display);
          font-size: clamp(28px, 4vw, 44px);
          padding: 4px 10px;
          letter-spacing: -0.035em;
          font-variation-settings: 'opsz' 144, 'SOFT' 50;
          font-weight: 500;
        }
        .v2-agent-name-input:focus {
          outline: none; border-color: var(--phosphor);
        }
        .v2-agent-delete {
          padding: 8px 14px;
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          background: transparent;
          border: 1px solid var(--line-2);
          color: var(--fg-dim);
          cursor: pointer;
          transition: all 0.15s;
        }
        .v2-agent-delete:hover {
          color: var(--danger);
          border-color: rgba(230, 103, 103, 0.3);
        }
        .v2-agent-delete-confirm {
          color: var(--danger) !important;
          border-color: var(--danger) !important;
          background: rgba(230, 103, 103, 0.08);
        }
        .v2-agent-delete:disabled { opacity: 0.5; cursor: not-allowed; }
        .v2-agent-public {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 20px 24px;
          border: 1px solid var(--line-2);
          background: var(--bg-1);
        }
        .v2-dash-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 32px;
          padding-top: 8px;
          border-top: 1px solid var(--line);
        }
        .v2-dash-card {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 24px;
        }
        .v2-dash-empty {
          padding: 48px 24px;
          text-align: center;
          color: var(--muted);
          font-size: 13px;
          font-style: italic;
        }
        .v2-dash-section-head .v2-sh-head { margin-bottom: 16px; }
        .v2-agent-balance {
          display: flex;
          align-items: baseline;
          gap: 12px;
          margin-top: -8px;
          margin-bottom: 8px;
          flex-wrap: wrap;
        }
        .v2-agent-balance-big {
          font-family: var(--font-mono);
          font-size: 36px;
          font-weight: 500;
          letter-spacing: -0.03em;
          color: var(--fg);
          font-variant-numeric: tabular-nums;
        }
        .v2-agent-balance-delta {
          font-family: var(--font-mono);
          font-size: 13px;
          font-variant-numeric: tabular-nums;
        }
        @media (max-width: 720px) {
          .v2-dash-stats { grid-template-columns: repeat(2, 1fr); }
          .v2-agent-public { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
