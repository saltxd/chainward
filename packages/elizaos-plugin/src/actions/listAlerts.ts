import type {
  Action,
  ActionExample,
  IAgentRuntime,
  Memory,
} from '@elizaos/core';
import { createClient, validateConfig } from '../environment.js';

const listAlerts: Action = {
  name: 'CHAINWARD_LIST_ALERTS',
  similes: [
    'SHOW_ALERTS',
    'MY_ALERTS',
    'ACTIVE_ALERTS',
    'CHAINWARD_ALERTS',
    'ALERT_STATUS',
  ],
  description: 'List all active alert configurations on ChainWard.',

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      validateConfig(runtime);
      return true;
    } catch {
      return false;
    }
  },

  handler: async (runtime, _message, _state, _options, callback) => {
    const client = createClient(runtime);

    try {
      const result = await client.alerts.list();
      const alerts = result.data;

      if (!alerts.length) {
        await callback?.({ text: 'No alerts configured on ChainWard. Use "create alert" to set one up.' });
        return { success: true, text: 'No alerts configured' };
      }

      const lines = alerts.map((a) => {
        const wallet = `${a.walletAddress.slice(0, 6)}...${a.walletAddress.slice(-4)}`;
        const threshold = a.thresholdValue ? ` (${a.thresholdValue} ${a.thresholdUnit ?? 'usd'})` : '';
        const status = a.enabled ? 'active' : 'paused';
        return `#${a.id} ${a.alertType}${threshold} — ${wallet} [${status}]`;
      });

      await callback?.({
        text: `${alerts.length} alert${alerts.length === 1 ? '' : 's'} on ChainWard:\n${lines.join('\n')}`,
      });
      return { success: true, data: { alerts } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await callback?.({ text: `Failed to list alerts: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'Show my ChainWard alerts' },
      },
      {
        name: '{{agent}}',
        content: {
          text: '2 alerts on ChainWard:\n#1 large_transfer (1000 usd) — 0xAf09...9A53 [active]\n#2 failed_tx — 0xAf09...9A53 [active]',
          actions: ['CHAINWARD_LIST_ALERTS']
        },
      },
    ],
  ] as ActionExample[][],
};

export default listAlerts;
