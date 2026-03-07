import type {
  Action,
  ActionExample,
  IAgentRuntime,
  Memory,
} from '@elizaos/core';
import { createClient, validateConfig } from '../environment.js';

const checkBalance: Action = {
  name: 'CHAINWARD_CHECK_BALANCE',
  similes: [
    'WALLET_BALANCE',
    'CHECK_AGENT_BALANCE',
    'AGENT_FUNDS',
    'HOW_MUCH_ETH',
    'CHAINWARD_BALANCE',
  ],
  description:
    'Check the latest balance snapshots for monitored agent wallets from ChainWard.',

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
      const result = await client.request<{
        success: boolean;
        data: Array<{
          walletAddress: string;
          chain: string;
          ethBalance: string;
          usdBalance: string;
          timestamp: string;
        }>;
      }>('GET', '/api/balances/latest');

      const balances = result.data;

      if (!balances.length) {
        await callback?.({ text: 'No balance data available yet. Balances are snapshotted when agents are registered.' });
        return { success: true, text: 'No balance data' };
      }

      const lines = balances.map((b) => {
        const eth = parseFloat(b.ethBalance).toFixed(4);
        const usd = parseFloat(b.usdBalance).toFixed(2);
        const wallet = `${b.walletAddress.slice(0, 6)}...${b.walletAddress.slice(-4)}`;
        return `${wallet}: ${eth} ETH ($${usd})`;
      });

      await callback?.({
        text: `Agent balances:\n${lines.join('\n')}`,
      });
      return { success: true, data: { balances } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await callback?.({ text: `Failed to check balances: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: "What's my agent's balance?" },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Agent balances:\n0xAf09...9A53: 0.4821 ETH ($1,205.25)',
          actions: ['CHAINWARD_CHECK_BALANCE']
        },
      },
    ],
  ] as ActionExample[][],
};

export default checkBalance;
