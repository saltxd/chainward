import type {
  Action,
  ActionExample,
  IAgentRuntime,
  Memory,
} from '@elizaos/core';
import { createClient, validateConfig } from '../environment.js';

const ALERT_TYPE_MAP: Record<string, string> = {
  'large transfer': 'large_transfer',
  'balance drop': 'balance_drop',
  'gas spike': 'gas_spike',
  'failed transaction': 'failed_tx',
  'failed tx': 'failed_tx',
  inactivity: 'inactivity',
  'new contract': 'new_contract',
  'idle balance': 'idle_balance',
};

function parseAlertType(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [key, value] of Object.entries(ALERT_TYPE_MAP)) {
    if (lower.includes(key)) return value;
  }
  return null;
}

function parseThreshold(text: string): number | undefined {
  const match = text.match(/\$?([\d,]+(?:\.\d+)?)/);
  if (match) return parseFloat(match[1]!.replace(/,/g, ''));
  return undefined;
}

const createAlert: Action = {
  name: 'CHAINWARD_CREATE_ALERT',
  similes: [
    'SET_ALERT',
    'CREATE_MONITORING_ALERT',
    'ADD_ALERT',
    'NOTIFY_ME',
    'CHAINWARD_ALERT',
    'SETUP_ALERT',
  ],
  description:
    'Create a ChainWard alert for a monitored wallet. Supports: large_transfer, balance_drop, gas_spike, failed_tx, inactivity, new_contract, idle_balance.',

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      validateConfig(runtime);
      return true;
    } catch {
      return false;
    }
  },

  handler: async (runtime, message, _state, _options, callback) => {
    const client = createClient(runtime);
    const config = validateConfig(runtime);

    const text = (message.content as { text?: string })?.text ?? '';
    const walletMatch = text.match(/0x[a-fA-F0-9]{40}/);
    const wallet = walletMatch?.[0] ?? config.CHAINWARD_AGENT_WALLET;

    if (!wallet) {
      await callback?.({
        text: 'No wallet address specified. Include a wallet address or set CHAINWARD_AGENT_WALLET.',
      });
      return { success: false, error: 'No wallet address' };
    }

    const alertType = parseAlertType(text);
    if (!alertType) {
      await callback?.({
        text: 'Could not determine alert type. Supported types: large transfer, balance drop, gas spike, failed transaction, inactivity, new contract.',
      });
      return { success: false, error: 'Unknown alert type' };
    }

    const threshold = parseThreshold(text);

    try {
      const result = await client.alerts.create({
        wallet,
        type: alertType,
        threshold,
        channels: ['webhook'],
      });

      const alert = result.data;
      await callback?.({
        text: `Created ${alert.alertType} alert for ${wallet.slice(0, 6)}...${wallet.slice(-4)}${threshold ? ` (threshold: $${threshold})` : ''}. Alert #${alert.id} is now active.`,
      });
      return { success: true, data: { alert } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await callback?.({ text: `Failed to create alert: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Set up a large transfer alert for 0xAf09B7fa44058D40738DaBEbD4f014ac3aBf9A53 with a $1000 threshold',
        },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Created large_transfer alert for 0xAf09...9A53 (threshold: $1000). Alert #1 is now active.',
          actions: ['CHAINWARD_CREATE_ALERT']
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: { text: 'Alert me if my agent has a failed transaction' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Created failed_tx alert for 0xAf09...9A53. Alert #2 is now active.',
          actions: ['CHAINWARD_CREATE_ALERT']
        },
      },
    ],
  ] as ActionExample[][],
};

export default createAlert;
