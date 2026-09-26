'use client';

import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PressShell, Masthead, PressDateline, Colophon, BriefOffer } from '@/components/press';
import { reportPath } from '@/lib/risk';

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
  balanceSeries: Array<{ date: string; balanceUsd: number | null }>;
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
    /** Percentage, 0–100 (as stored by the ACP sync). */
    successRate: number;
    uniqueBuyers: number;
    hasGraduated: boolean;
    isOnline: boolean;
  } | null;
}

const CHART_AXIS = '#6b6152'; // --ink-faint
const CHART_STROKE = '#1b1815'; // --ink
const CHART_TOOLTIP = {
  background: '#f7f3ea',
  border: '1px solid #bcb19b',
  borderRadius: 0,
  fontSize: 12,
};

function healthColor(score: number): string {
  if (score >= 80) return 'var(--seal)';
  if (score >= 50) return 'var(--sev-medium)';
  return 'var(--oxblood)';
}

function formatChartDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The indexer can store more than one row per tx (e.g. a transfer and the
 * call around it) with identical visible fields — show each once. */
function uniqueTransactions(txs: AgentDetail['transactions']): AgentDetail['transactions'] {
  const seen = new Set<string>();
  return txs.filter((tx) => {
    const key = [tx.txHash, tx.timestamp, tx.direction, tx.tokenSymbol, tx.amountUsd, tx.txType].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function AgentDetailClient({ agent }: { agent: AgentDetail }) {
  const name = agent.agentName ?? agent.slug;
  const balanceData = agent.balanceSeries.map((p) => ({
    date: formatChartDate(p.date),
    balanceUsd: p.balanceUsd,
  }));
  const txs = uniqueTransactions(agent.transactions).slice(0, 20);

  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="agd-lead">
          <Link href="/base" className="press-link agd-back">
            ← Observatory
          </Link>
          <span className="press-label agd-label">Agent file · Base</span>
          <h1 className="agd-title press-display">{name}</h1>
          <a
            href={`https://basescan.org/address/${agent.walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="agd-wallet mono"
          >
            {agent.walletAddress}
          </a>
          <div className="agd-tags">
            {agent.agentFramework && <span className="agd-tag mono">{agent.agentFramework}</span>}
            {agent.acp?.role && <span className="agd-tag mono">{agent.acp.role}</span>}
            {agent.acp?.hasGraduated && <span className="agd-tag mono">graduated</span>}
            {agent.acp?.isOnline && <span className="agd-tag mono">online</span>}
            {agent.twitterHandle && (
              <a
                href={`https://x.com/${agent.twitterHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="press-link agd-x"
              >
                @{agent.twitterHandle}
              </a>
            )}
          </div>
          <Link href={reportPath(agent.walletAddress)} className="press-btn agd-check">
            Run a risk check on this wallet →
          </Link>
        </section>

        <div className="agd-stats">
          {agent.health && (
            <div className="agd-stat">
              <span className="agd-stat-label">Health</span>
              <span className="agd-stat-value mono" style={{ color: healthColor(agent.health.score) }}>
                {agent.health.score}/100
              </span>
              <span className="agd-stat-note mono">
                uptime {agent.health.uptimePct.toFixed(0)}% · fail {agent.health.failureRate.toFixed(1)}%
              </span>
            </div>
          )}
          {agent.acp && (
            <>
              <div className="agd-stat">
                <span className="agd-stat-label">ACP revenue</span>
                <span className="agd-stat-value mono">${Math.round(agent.acp.revenue).toLocaleString()}</span>
              </div>
              <div className="agd-stat">
                <span className="agd-stat-label">Jobs</span>
                <span className="agd-stat-value mono">{agent.acp.jobs.toLocaleString()}</span>
              </div>
              <div className="agd-stat">
                <span className="agd-stat-label">Success</span>
                <span className="agd-stat-value mono">{agent.acp.successRate.toFixed(1)}%</span>
              </div>
              <div className="agd-stat">
                <span className="agd-stat-label">Unique buyers</span>
                <span className="agd-stat-value mono">{agent.acp.uniqueBuyers.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>

        <section className="agd-section">
          <h2 className="agd-h2 press-display">Balance, 30 days</h2>
          {balanceData.length === 0 ? (
            <p className="agd-empty">No balance history yet.</p>
          ) : (
            <div className="agd-chart">
              <ResponsiveContainer>
                <LineChart data={balanceData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    stroke={CHART_AXIS}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                  />
                  <YAxis stroke={CHART_AXIS} fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    labelStyle={{ color: '#4a4238' }}
                    itemStyle={{ color: '#1b1815' }}
                    cursor={{ stroke: '#bcb19b' }}
                    formatter={(v) => [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 })}`, 'balance']}
                  />
                  <Line
                    type="monotone"
                    dataKey="balanceUsd"
                    stroke={CHART_STROKE}
                    strokeWidth={1.25}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="agd-section">
          <h2 className="agd-h2 press-display">Recent transactions</h2>
          {txs.length === 0 ? (
            <p className="agd-empty">No indexed transactions yet.</p>
          ) : (
            <div className="agd-table">
              <div className="agd-row agd-thead">
                <span>When (UTC)</span>
                <span>Type</span>
                <span className="agd-token">Token</span>
                <span className="agd-right">Amount</span>
                <span className="agd-right agd-gas">Gas</span>
                <span>Tx</span>
              </div>
              {txs.map((tx) => (
                <div key={[tx.txHash, tx.timestamp, tx.direction, tx.tokenSymbol].join('|')} className="agd-row">
                  <span className="mono agd-muted">
                    {new Date(tx.timestamp).toISOString().slice(0, 16).replace('T', ' ')}
                  </span>
                  <span className="mono">{tx.txType}</span>
                  <span className="mono agd-token">{tx.tokenSymbol ?? '—'}</span>
                  <span className="mono agd-right">${tx.amountUsd.toFixed(2)}</span>
                  <span className="mono agd-right agd-muted agd-gas">${tx.gasCostUsd.toFixed(4)}</span>
                  <a
                    href={`https://basescan.org/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="press-link mono"
                  >
                    {tx.txHash.slice(0, 10)}…
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="agd-offer">
          <BriefOffer
            placement="agent-document"
            title={`Want the full brief on ${name}?`}
            lede={`This page shows what ${name}'s wallet does. The Intel Brief is the full investigation: we trace where the money goes, test its public claims against on-chain evidence, and hand you a written brief you can cite.`}
          />
        </div>

        <Colophon />
      </div>

      <style>{`
        .agd-lead { padding: 40px 0 0; display: flex; flex-direction: column; align-items: flex-start; }
        .agd-back { font-size: 12px; }
        .agd-label { margin-top: 22px; }
        .agd-title {
          margin: 12px 0 0;
          font-size: clamp(34px, 6vw, 60px);
          line-height: 1.02;
          letter-spacing: -0.03em;
          overflow-wrap: anywhere;
        }
        .agd-wallet {
          margin-top: 12px;
          font-size: 13px;
          color: var(--ink-soft);
          text-decoration: none;
          overflow-wrap: anywhere;
        }
        .agd-wallet:hover { color: var(--oxblood); }
        .agd-tags { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .agd-tag {
          font-size: 11px;
          letter-spacing: 0.06em;
          padding: 3px 8px;
          border: 1px solid var(--rule-strong);
          color: var(--ink-soft);
        }
        .agd-x { font-size: 12px; }
        .agd-check { margin-top: 22px; }

        .agd-stats {
          margin-top: 32px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 1px;
          background: var(--rule);
          border: 1px solid var(--rule);
        }
        .agd-stat { background: var(--paper); padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
        /* An odd stat count leaves a hole in the 2-up phone grid — let the last one span it. */
        @media (max-width: 560px) {
          .agd-stat:last-child:nth-child(odd) { grid-column: 1 / -1; }
        }
        .agd-stat-label {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .agd-stat-value { font-size: 24px; line-height: 1; color: var(--ink); }
        .agd-stat-note { font-size: 11px; color: var(--ink-faint); }

        .agd-section { padding-top: 48px; }
        .agd-h2 { margin: 0 0 14px; font-size: clamp(22px, 2.8vw, 30px); }
        .agd-chart { height: 220px; }
        .agd-empty { margin: 0; font-family: var(--font-text); color: var(--ink-faint); }

        .agd-table { border-bottom: 1px solid var(--rule-strong); }
        .agd-row {
          display: grid;
          grid-template-columns: 130px 120px minmax(0, 1fr) 90px 80px 110px;
          gap: 12px;
          align-items: center;
          padding: 9px 4px;
          border-top: 1px solid var(--rule);
          font-size: 12px;
          color: var(--ink);
        }
        .agd-thead {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-faint);
          border-top: none;
          border-bottom: 1px solid var(--rule-strong);
        }
        .agd-right { text-align: right; }
        .agd-muted { color: var(--ink-faint); }
        .agd-row > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width: 720px) {
          .agd-row { grid-template-columns: 1fr 1fr 70px; }
          .agd-row .agd-token, .agd-row .agd-gas, .agd-row > :nth-child(2) { display: none; }
        }

        .agd-offer { padding-top: 56px; }
      `}</style>
    </PressShell>
  );
}
