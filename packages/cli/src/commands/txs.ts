import chalk from 'chalk';
import ora from 'ora';
import { api, handleError } from '../client.js';
import {
  createTable,
  shortAddr,
  usd,
  relativeTime,
  directionBadge,
  basescanTxLink,
} from '../format.js';

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

export async function txsCommand(options: { agent?: string; limit?: string }) {
  try {
    const spinner = ora('Fetching transactions...').start();

    const params = new URLSearchParams();
    if (options.agent) params.set('wallet', options.agent);
    params.set('limit', options.limit ?? '20');

    const [txRes, agentsRes] = await Promise.all([
      api<Transaction[]>(`/api/transactions?${params}`),
      api<Agent[]>('/api/agents'),
    ]);

    spinner.stop();

    const txs = txRes.data;
    if (txs.length === 0) {
      console.log(chalk.dim('\n  No transactions found.\n'));
      return;
    }

    // Agent name lookup by wallet
    const nameByWallet = new Map<string, string>();
    for (const a of agentsRes.data) {
      nameByWallet.set(a.walletAddress.toLowerCase(), a.agentName ?? shortAddr(a.walletAddress));
    }

    const table = createTable(['Time', 'Agent', 'Dir', 'Token', 'Amount', 'Gas', 'Tx Hash']);

    for (const tx of txs) {
      const agentLabel = nameByWallet.get(tx.walletAddress.toLowerCase()) ?? shortAddr(tx.walletAddress);

      table.push([
        relativeTime(tx.timestamp),
        agentLabel,
        directionBadge(tx.direction),
        tx.tokenSymbol ?? chalk.dim('ETH'),
        usd(tx.amountUsd),
        usd(tx.gasCostUsd),
        basescanTxLink(tx.txHash),
      ]);
    }

    console.log(`\n${table.toString()}\n`);
  } catch (err) {
    handleError(err);
  }
}
