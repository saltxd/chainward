'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  publicApi,
  type PublicAgentData,
  type Transaction,
  type BalanceHistoryBucket,
  type GasBucket,
} from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Address } from '@/components/ui/address';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { BalanceChart } from '@/components/charts/balance-chart';
import { GasChart } from '@/components/charts/gas-chart';
import { TxTable } from '@/components/dashboard/tx-table';
import { ErrorBanner } from '@/components/ui/error-banner';
import { PublicHeader } from '@/components/layout/public-header';

/** Map snake_case rows from the raw SQL response to camelCase Transaction objects */
function mapTx(row: Record<string, unknown>): Transaction {
  return {
    timestamp: String(row.timestamp ?? ''),
    chain: String(row.chain ?? ''),
    txHash: String(row.tx_hash ?? ''),
    blockNumber: Number(row.block_number ?? 0),
    walletAddress: String(row.wallet_address ?? ''),
    direction: String(row.direction ?? ''),
    counterparty: row.counterparty ? String(row.counterparty) : null,
    tokenSymbol: row.token_symbol ? String(row.token_symbol) : null,
    amountUsd: row.amount_usd != null ? String(row.amount_usd) : null,
    gasCostUsd: row.gas_cost_usd != null ? String(row.gas_cost_usd) : null,
    txType: row.tx_type ? String(row.tx_type) : null,
    methodName: row.method_name ? String(row.method_name) : null,
    status: String(row.status ?? 'confirmed'),
  };
}

export default function PublicAgentPage({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const { wallet } = use(params);

  const { data, loading, error, refetch } = useApi<PublicAgentData>(
    () => publicApi.getPublicAgent(wallet),
    [wallet],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <Skeleton className="mb-2 h-8 w-48" />
        <Skeleton className="mb-6 h-5 w-64" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="mt-6 h-64" />
        <Skeleton className="mt-6 h-64" />
        <Skeleton className="mt-6 h-48" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <ErrorBanner message={error} onRetry={refetch} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-muted-foreground">Agent not found or is not public.</p>
      </div>
    );
  }

  const { agent, stats, balanceHistory, gasHistory, recentTxs } = data;

  // Map raw SQL rows to Transaction type (snake_case -> camelCase)
  const transactions: Transaction[] = (recentTxs as unknown as Record<string, unknown>[]).map(mapTx);

  // Map balance/gas history rows (may already be correct from TimescaleDB raw SQL)
  const balances: BalanceHistoryBucket[] = (balanceHistory as unknown as Record<string, unknown>[]).map((row) => ({
    bucket: String(row.bucket ?? ''),
    token_symbol: String(row.token_symbol ?? ''),
    token_address: row.token_address ? String(row.token_address) : null,
    balance_usd: String(row.balance_usd ?? '0'),
    balance_raw: String(row.balance_raw ?? '0'),
  }));

  const gas: GasBucket[] = (gasHistory as unknown as Record<string, unknown>[]).map((row) => ({
    bucket: String(row.bucket ?? ''),
    tx_count: Number(row.tx_count ?? 0),
    total_gas_usd: String(row.total_gas_usd ?? '0'),
    avg_gas_usd: String(row.avg_gas_usd ?? '0'),
    max_gas_usd: String(row.max_gas_usd ?? '0'),
    avg_gas_price_gwei: String(row.avg_gas_price_gwei ?? '0'),
  }));

  const monitoringSince = new Date(agent.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen">
      <PublicHeader />
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Agent Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {agent.agentName ?? 'Agent'}
          </h1>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {agent.chain}
          </span>
          {agent.agentFramework && (
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground">
              {agent.agentFramework}
            </span>
          )}
        </div>
        <Address address={agent.walletAddress} chain={agent.chain} className="mt-1" />
        <p className="mt-1 text-xs text-muted-foreground">
          Monitoring since {monitoringSince}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="24h Transactions" value={String(stats.txCount24h)} />
        <StatCard
          label="24h Volume"
          value={`$${stats.volume24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
        />
        <StatCard
          label="24h Gas Spend"
          value={`$${stats.gasSpend24h.toFixed(2)}`}
        />
        <StatCard label="7d Transactions" value={String(stats.txCount7d)} />
      </div>

      {/* Balance chart */}
      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Balance History</h2>
        {balances.length > 0 ? (
          <BalanceChart data={balances} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No balance data yet</p>
        )}
      </div>

      {/* Gas chart */}
      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Gas Analytics</h2>
        {gas.length > 0 ? (
          <GasChart data={gas} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No gas data yet</p>
        )}
      </div>

      {/* Transaction table */}
      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Recent Transactions</h2>
        <TxTable transactions={transactions} />
      </div>

      {/* CTA */}
      <div className="mt-10 rounded-lg border border-accent-foreground/20 bg-accent-foreground/5 p-8 text-center">
        <h3 className="text-xl font-bold">Monitor your own agents</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Track transactions, balances, and gas for your AI agent wallets on Base.
          Get alerts via Discord, Telegram, or webhooks. Free during beta.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-xl bg-accent-foreground px-8 py-3 text-sm font-semibold text-background transition-colors hover:bg-accent-foreground/90"
        >
          Start Monitoring &mdash; Free
        </Link>
      </div>

      {/* Footer */}
      <p className="mt-8 text-center text-xs text-muted-foreground/60">
        Powered by Chain<span className="text-accent-foreground/60">Ward</span> &mdash; AgentOps for Base
      </p>
    </div>
    </div>
  );
}
