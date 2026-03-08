import chalk from 'chalk';
import { api, handleError } from '../client.js';
import { shortAddr, usd, relativeTime, directionBadge, basescanTxLink, brand } from '../format.js';

interface Transaction {
  txHash: string;
  walletAddress: string;
  direction: string;
  tokenSymbol: string | null;
  amountUsd: string | null;
  gasCostUsd: string | null;
  timestamp: string;
}

interface Agent {
  walletAddress: string;
  agentName: string | null;
}

export async function watchCommand(options: { agent?: string }) {
  try {
    // Load agent names
    const { data: agents } = await api<Agent[]>('/api/agents');
    const nameByWallet = new Map<string, string>();
    for (const a of agents) {
      nameByWallet.set(a.walletAddress.toLowerCase(), a.agentName ?? shortAddr(a.walletAddress));
    }

    const watchCount = options.agent ? 1 : agents.length;
    const seenTxs = new Set<string>();

    // Seed with latest txs so we only show new ones
    const params = new URLSearchParams({ limit: '50' });
    if (options.agent) params.set('wallet', options.agent);
    const { data: initial } = await api<Transaction[]>(`/api/transactions?${params}`);
    for (const tx of initial) seenTxs.add(tx.txHash);

    console.log(brand.bold(`\n  Watching ${watchCount} agent${watchCount === 1 ? '' : 's'} on Base...`));
    console.log(chalk.dim('  Press Ctrl+C to stop.\n'));

    const poll = async () => {
      try {
        const { data: txs } = await api<Transaction[]>(`/api/transactions?${params}`);

        // Show newest first, but print in chronological order
        const newTxs = txs.filter((tx) => !seenTxs.has(tx.txHash)).reverse();

        for (const tx of newTxs) {
          seenTxs.add(tx.txHash);
          const agent = nameByWallet.get(tx.walletAddress.toLowerCase()) ?? shortAddr(tx.walletAddress);
          const time = new Date(tx.timestamp).toLocaleTimeString();

          console.log(
            `  ${chalk.dim(time)}  ${agent.padEnd(20)}  ${directionBadge(tx.direction)}  ` +
            `${(tx.tokenSymbol ?? 'ETH').padEnd(6)}  ${usd(tx.amountUsd).padStart(12)}  ` +
            `${chalk.dim('gas')} ${usd(tx.gasCostUsd).padStart(8)}  ${basescanTxLink(tx.txHash)}`,
          );
        }
      } catch {
        // Silently retry on transient errors
      }
    };

    const interval = setInterval(poll, 5000);

    // Handle clean exit
    const cleanup = () => {
      clearInterval(interval);
      console.log(chalk.dim('\n  Stopped watching.\n'));
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep process alive
    await new Promise(() => {});
  } catch (err) {
    handleError(err);
  }
}
