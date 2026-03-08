import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { listAgents, addAgent, removeAgent } from './commands/agents.js';
import { statusCommand } from './commands/status.js';
import { txsCommand } from './commands/txs.js';
import { listAlerts, createAlert } from './commands/alerts.js';
import { watchCommand } from './commands/watch.js';

const program = new Command();

program
  .name('chainward')
  .description('Monitor agent wallets on Base')
  .version('0.1.0');

program
  .command('login')
  .description('Authenticate with your ChainWard API key')
  .action(loginCommand);

program
  .command('status')
  .description('Fleet overview: agents, txs, gas, portfolio')
  .action(statusCommand);

// --- agents ---
const agents = program
  .command('agents')
  .description('Manage monitored agent wallets');

agents
  .command('list')
  .description('List all registered agents')
  .action(listAgents);

agents
  .command('add')
  .description('Register a new agent wallet')
  .argument('<address>', 'Wallet address (0x...)')
  .option('-n, --name <name>', 'Agent display name')
  .action(addAgent);

agents
  .command('remove')
  .description('Stop monitoring an agent')
  .argument('<address>', 'Wallet address (0x...)')
  .action(removeAgent);

// --- txs ---
program
  .command('txs')
  .description('List recent transactions')
  .option('-a, --agent <address>', 'Filter by agent wallet')
  .option('-l, --limit <n>', 'Number of transactions', '20')
  .action(txsCommand);

// --- alerts ---
const alerts = program
  .command('alerts')
  .description('Manage alert rules');

alerts
  .command('list')
  .description('Show all configured alerts')
  .action(listAlerts);

alerts
  .command('create')
  .description('Create a new alert rule (interactive)')
  .action(createAlert);

// --- watch ---
program
  .command('watch')
  .description('Live transaction feed')
  .option('-a, --agent <address>', 'Watch specific agent')
  .action(watchCommand);

program.parse();
