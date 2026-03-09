'use client';

import { use } from 'react';
import Link from 'next/link';
import { publicApi, type WalletLookupResult, type LookupTransaction } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ui/error-banner';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatEthFromHex(hex: string): string {
  const wei = BigInt(hex);
  const eth = Number(wei) / 1e18;
  if (eth === 0) return '0';
  if (eth < 0.0001) return '< 0.0001';
  return eth.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatTokenBalance(hex: string, decimals = 18): string {
  const raw = BigInt(hex);
  const value = Number(raw) / 10 ** decimals;
  if (value === 0) return '0';
  if (value < 0.0001) return '< 0.0001';
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatValue(value: number | null): string {
  if (value === null || value === 0) return '-';
  if (value < 0.0001) return '< 0.0001';
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function blockHexToNumber(hex: string): number {
  return parseInt(hex, 16);
}

function getCtaContent(data: WalletLookupResult): {
  heading: string;
  description: string;
} {
  const outboundCount = data.transactions.filter((tx) => tx.direction === 'outbound').length;

  if (outboundCount > 20) {
    return {
      heading: 'This wallet is burning gas.',
      description:
        'Set up gas alerts to get notified when spending spikes. ChainWard monitors your agent wallets 24/7 with Discord, Telegram, and webhook delivery.',
    };
  }

  if (data.transactions.length >= 40) {
    return {
      heading: 'Active wallet detected.',
      description:
        'With this much activity, you need persistent monitoring and charts. ChainWard tracks balances, transactions, and gas spend over time with historical analytics.',
    };
  }

  return {
    heading: 'Want persistent monitoring for this wallet?',
    description:
      'ChainWard gives you real-time alerts, balance charts, gas analytics, and transaction history for your onchain agent wallets. Free during beta.',
  };
}

export default function WalletLookupResultPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);

  const {
    data,
    loading,
    error,
    refetch,
  } = useApi<WalletLookupResult>(() => publicApi.lookupWallet(address), [address]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <Skeleton className="mb-6 h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
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
        <p className="text-muted-foreground">No data found for this wallet.</p>
      </div>
    );
  }

  // Compute stats
  const nativeBalance = data.balances.find((b) => b.contractAddress === 'native');
  const ethBalance = nativeBalance ? formatEthFromHex(nativeBalance.tokenBalance) : '0';
  const nonNativeTokens = data.balances.filter(
    (b) => b.contractAddress !== 'native' && b.tokenBalance !== '0x0000000000000000000000000000000000000000000000000000000000000000',
  );
  const tokenCount = nonNativeTokens.length;
  const txCount = data.transactions.length;

  const cta = getCtaContent(data);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          Wallet Activity
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {address}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Base &middot; cached at {new Date(data.cachedAt).toLocaleString()}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Transactions" value={String(txCount)} />
        <StatCard label="ETH Balance" value={`${ethBalance} ETH`} />
        <StatCard label="Token Holdings" value={String(tokenCount)} />
      </div>

      {/* Token Balances */}
      {nonNativeTokens.length > 0 && (
        <div className="mt-8 rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold">Token Balances</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">Contract</th>
                  <th className="pb-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {nonNativeTokens.slice(0, 10).map((token) => (
                  <tr key={token.contractAddress} className="border-b border-border/50">
                    <td className="py-2.5 pr-4">
                      <a
                        href={`https://basescan.org/token/${token.contractAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {truncateAddress(token.contractAddress)}
                      </a>
                    </td>
                    <td className="py-2.5 text-right font-mono">
                      {formatTokenBalance(token.tokenBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nonNativeTokens.length > 10 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing top 10 of {nonNativeTokens.length} tokens
            </p>
          )}
        </div>
      )}

      {/* Recent Transactions */}
      <div className="mt-8 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Recent Transactions</h2>
        {data.transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No recent transactions found
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">Tx Hash</th>
                  <th className="pb-2 pr-4">Direction</th>
                  <th className="pb-2 pr-4">From / To</th>
                  <th className="pb-2 pr-4 text-right">Value</th>
                  <th className="pb-2 pr-4">Asset</th>
                  <th className="pb-2 text-right">Block</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx: LookupTransaction) => (
                  <tr key={`${tx.hash}-${tx.direction}`} className="border-b border-border/50">
                    <td className="py-2.5 pr-4">
                      <a
                        href={`https://basescan.org/tx/${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {truncateAddress(tx.hash)}
                      </a>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={
                          tx.direction === 'inbound'
                            ? 'text-[#4ade80]'
                            : 'text-orange-400'
                        }
                      >
                        {tx.direction === 'inbound' ? 'IN' : 'OUT'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-muted-foreground">
                      {tx.direction === 'inbound'
                        ? truncateAddress(tx.from)
                        : tx.to
                          ? truncateAddress(tx.to)
                          : 'Contract Creation'}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono">
                      {formatValue(tx.value)}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {tx.asset ?? tx.category}
                    </td>
                    <td className="py-2.5 text-right font-mono text-muted-foreground">
                      {blockHexToNumber(tx.blockNum).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Contextual CTA */}
      <div className="mt-10 rounded-lg border border-[#4ade80]/20 bg-[#4ade80]/5 p-8 text-center">
        <h3 className="text-xl font-bold">{cta.heading}</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          {cta.description}
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-xl bg-[#4ade80] px-8 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#22c55e]"
        >
          Start Monitoring &mdash; Free
        </Link>
      </div>

      {/* Footer */}
      <p className="mt-8 text-center text-xs text-muted-foreground/60">
        Powered by Chain<span className="text-[#4ade80]/60">Ward</span> &mdash; Datadog for on-chain agents
      </p>
    </div>
  );
}
