import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { api, handleError } from '../client.js';
import { createTable, shortAddr, statusBadge, brand } from '../format.js';
import { alertParams } from '../alertParams.js';

interface AlertConfig {
  id: number;
  walletAddress: string;
  alertType: string;
  thresholdValue: string | null;
  thresholdUnit: string | null;
  lookbackWindow: string | null;
  channels: string[];
  enabled: boolean;
}

interface Agent {
  id: number;
  walletAddress: string;
  chain: string;
  agentName: string | null;
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  large_transfer: 'Large Transfer',
  balance_drop: 'Balance Drop',
  gas_spike: 'Gas Spike',
  failed_tx: 'Failed Tx',
  inactivity: 'Inactivity',
  new_contract: 'New Contract',
  idle_balance: 'Idle Balance',
};

export async function listAlerts() {
  try {
    const spinner = ora('Fetching alerts...').start();
    const { data: alerts } = await api<AlertConfig[]>('/api/alerts');
    spinner.stop();

    if (alerts.length === 0) {
      console.log(chalk.dim('\n  No alerts configured. Run `chainward alerts create` to set one up.\n'));
      return;
    }

    const table = createTable(['Agent', 'Type', 'Threshold', 'Channels', 'Status']);

    for (const alert of alerts) {
      // An inactivity alert has no threshold: its lookback window is the quiet time.
      const threshold = alert.thresholdValue
        ? `${alert.thresholdValue} ${alert.thresholdUnit ?? ''}`
        : alert.alertType === 'inactivity' && alert.lookbackWindow
          ? `${alert.lookbackWindow} quiet`
          : chalk.dim('—');

      table.push([
        shortAddr(alert.walletAddress),
        ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType,
        threshold,
        alert.channels.join(', '),
        statusBadge(alert.enabled),
      ]);
    }

    console.log(`\n${table.toString()}\n`);
    console.log(chalk.dim(`  ${alerts.length} alert${alerts.length === 1 ? '' : 's'}\n`));
  } catch (err) {
    handleError(err);
  }
}

export async function createAlert() {
  try {
    // 1. Select agent
    const agentSpinner = ora('Loading agents...').start();
    const { data: agents } = await api<Agent[]>('/api/agents');
    agentSpinner.stop();

    if (agents.length === 0) {
      console.log(chalk.dim('\n  No agents registered. Run `chainward agents add <address>` first.\n'));
      return;
    }

    const agentWallet = await select({
      message: 'Select agent',
      choices: agents.map((a) => ({
        name: `${a.agentName ?? shortAddr(a.walletAddress)} (${a.chain})`,
        value: a.walletAddress,
      })),
    });

    const agent = agents.find((a) => a.walletAddress === agentWallet)!;

    // 2. Select alert type
    const alertType = await select({
      message: 'Alert type',
      choices: Object.entries(ALERT_TYPE_LABELS).map(([value, name]) => ({ name, value })),
    });

    // 3. Threshold / params
    let value: string | undefined;
    let window: string | undefined;

    if (alertType === 'large_transfer' || alertType === 'gas_spike') {
      value = await input({
        message: 'Threshold (USD)',
        default: alertType === 'large_transfer' ? '100' : '5',
        validate: (v) => (isNaN(parseFloat(v)) ? 'Enter a number' : true),
      });
    } else if (alertType === 'balance_drop') {
      value = await input({
        message: 'Drop percentage (%)',
        default: '20',
        validate: (v) => (isNaN(parseFloat(v)) ? 'Enter a number' : true),
      });
      window = await select({
        message: 'Lookback window',
        choices: [
          { name: '1 hour', value: '1 hour' },
          { name: '6 hours', value: '6 hours' },
          { name: '24 hours', value: '24 hours' },
        ],
      });
    } else if (alertType === 'inactivity') {
      value = await input({
        message: 'Inactive hours',
        default: '24',
        validate: (v) => (parseFloat(v) > 0 ? true : 'Enter a number of hours above 0'),
      });
    } else if (alertType === 'idle_balance') {
      value = await input({
        message: 'Min balance (USD)',
        default: '50',
        validate: (v) => (isNaN(parseFloat(v)) ? 'Enter a number' : true),
      });
      window = await select({
        message: 'Idle duration (no outgoing tx)',
        choices: [
          { name: '6 hours', value: '6 hours' },
          { name: '12 hours', value: '12 hours' },
          { name: '24 hours', value: '24 hours' },
          { name: '48 hours', value: '2 days' },
          { name: '7 days', value: '7 days' },
        ],
      });
    }
    // failed_tx and new_contract have no threshold

    // 4. Delivery channel
    const channel = await select({
      message: 'Delivery channel',
      choices: [
        { name: 'Discord webhook', value: 'discord' },
        { name: 'Telegram', value: 'telegram' },
        { name: 'Webhook (custom URL)', value: 'webhook' },
      ],
    });

    const payload: Record<string, unknown> = {
      walletAddress: agentWallet,
      chain: agent.chain,
      alertType,
      channels: [channel],
    };

    for (const [key, v] of Object.entries(alertParams(alertType, { value, window }))) {
      if (v) payload[key] = v;
    }

    if (channel === 'discord') {
      payload.discordWebhook = await input({
        message: 'Discord webhook URL',
        validate: (v) => (v.startsWith('https://discord.com/api/webhooks/') ? true : 'Must be a Discord webhook URL'),
      });
    } else if (channel === 'telegram') {
      payload.telegramChatId = await input({
        message: 'Telegram chat ID',
        validate: (v) => (v.trim().length > 0 ? true : 'Required'),
      });
    } else if (channel === 'webhook') {
      payload.webhookUrl = await input({
        message: 'Webhook URL (HTTPS)',
        validate: (v) => (v.startsWith('https://') ? true : 'Must use HTTPS'),
      });
    }

    const spinner = ora('Creating alert...').start();
    await api('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    spinner.succeed(`Alert created: ${brand(ALERT_TYPE_LABELS[alertType] ?? alertType)} → ${channel}`);
  } catch (err) {
    handleError(err);
  }
}
