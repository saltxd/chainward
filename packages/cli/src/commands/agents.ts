import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { api, handleError } from '../client.js';
import { createTable, shortAddr, usd, relativeTime, brand } from '../format.js';

interface Agent {
  id: number;
  walletAddress: string;
  chain: string;
  agentName: string | null;
  agentFramework: string | null;
  tags: string[];
  createdAt: string;
}

interface BalanceSnapshot {
  wallet_address: string;
  balance_usd: string | null;
}

interface Transaction {
  walletAddress: string;
  timestamp: string;
}

export async function listAgents() {
  try {
    const spinner = ora('Fetching agents...').start();

    const [agentsRes, balancesRes, txRes] = await Promise.all([
      api<Agent[]>('/api/agents'),
      api<BalanceSnapshot[]>('/api/balances/latest'),
      api<Transaction[]>('/api/transactions?limit=200'),
    ]);

    spinner.stop();

    const agents = agentsRes.data;
    if (agents.length === 0) {
      console.log(chalk.dim('\n  No agents registered. Run `chainward agents add <address>` to add one.\n'));
      return;
    }

    // Build balance lookup by wallet
    const balanceByWallet = new Map<string, number>();
    for (const b of balancesRes.data) {
      const addr = b.wallet_address.toLowerCase();
      const val = b.balance_usd ? parseFloat(b.balance_usd) : 0;
      balanceByWallet.set(addr, (balanceByWallet.get(addr) ?? 0) + val);
    }

    // Find latest tx per wallet
    const lastTxByWallet = new Map<string, string>();
    for (const tx of txRes.data) {
      const addr = tx.walletAddress.toLowerCase();
      if (!lastTxByWallet.has(addr)) {
        lastTxByWallet.set(addr, tx.timestamp);
      }
    }

    const table = createTable(['Name', 'Address', 'Chain', 'Balance', 'Last Tx']);

    for (const agent of agents) {
      const addr = agent.walletAddress.toLowerCase();
      table.push([
        agent.agentName ?? chalk.dim('unnamed'),
        shortAddr(agent.walletAddress),
        agent.chain,
        usd(balanceByWallet.get(addr) ?? null),
        relativeTime(lastTxByWallet.get(addr) ?? null),
      ]);
    }

    console.log(`\n${table.toString()}\n`);
    console.log(chalk.dim(`  ${agents.length} agent${agents.length === 1 ? '' : 's'}\n`));
  } catch (err) {
    handleError(err);
  }
}

export async function addAgent(address: string, options: { name?: string }) {
  const body: Record<string, unknown> = {
    walletAddress: address,
    chain: 'base',
  };
  if (options.name) body.agentName = options.name;

  try {
    const spinner = ora('Registering agent...').start();

    const res = await api<Agent>('/api/agents', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    spinner.succeed(
      `Agent registered. Monitoring started for ${brand(res.data.agentName ?? shortAddr(address))} on Base.`,
    );
  } catch (err) {
    // Handle contract warning — ask user to confirm
    const { ApiError } = await import('../client.js');
    if (err instanceof ApiError && err.code === 'CONTRACT_WARNING') {
      const spinner2 = ora();
      spinner2.warn(err.message);

      const ok = await confirm({
        message: 'Register this contract address anyway?',
        default: false,
      });

      if (!ok) {
        console.log(chalk.dim('  Cancelled.'));
        return;
      }

      const retrySpinner = ora('Registering agent...').start();
      body.confirmContract = true;
      const res = await api<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      retrySpinner.succeed(
        `Agent registered. Monitoring started for ${brand(res.data.agentName ?? shortAddr(address))} on Base.`,
      );
      return;
    }

    handleError(err);
  }
}

export async function removeAgent(address: string) {
  try {
    // Find the agent by address
    const spinner = ora('Looking up agent...').start();
    const { data: agents } = await api<Agent[]>('/api/agents');
    const agent = agents.find(
      (a) => a.walletAddress.toLowerCase() === address.toLowerCase(),
    );

    if (!agent) {
      spinner.fail(`No agent found with address ${shortAddr(address)}`);
      process.exit(1);
    }

    spinner.stop();

    const display = agent.agentName ?? shortAddr(address);
    const ok = await confirm({
      message: `Remove ${display} (${shortAddr(agent.walletAddress)})? This stops all monitoring.`,
      default: false,
    });

    if (!ok) {
      console.log(chalk.dim('  Cancelled.'));
      return;
    }

    const delSpinner = ora('Removing agent...').start();
    await api(`/api/agents/${agent.id}`, { method: 'DELETE' });
    delSpinner.succeed(`${display} removed.`);
  } catch (err) {
    handleError(err);
  }
}
