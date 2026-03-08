import chalk from 'chalk';
import ora from 'ora';
import { api, handleError } from '../client.js';
import { usd, brand } from '../format.js';

interface OverviewStats {
  agents: { total: number };
  transactions24h: number;
  gasSpend24h: number;
  totalValue: number;
}

export async function statusCommand() {
  try {
    const spinner = ora('Fetching overview...').start();
    const { data } = await api<OverviewStats>('/api/stats/overview');
    spinner.stop();

    console.log(`
  ${brand.bold('ChainWard')} ${chalk.dim('— Fleet Overview')}

  ${brand('Agents')}          ${data.agents.total}
  ${brand('Txs (24h)')}       ${data.transactions24h}
  ${brand('Gas (24h)')}       ${usd(data.gasSpend24h)}
  ${brand('Portfolio')}       ${usd(data.totalValue)}
`);
  } catch (err) {
    handleError(err);
  }
}
