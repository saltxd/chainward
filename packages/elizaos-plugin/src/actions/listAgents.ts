import type {
  Action,
  ActionExample,
  IAgentRuntime,
  Memory,
} from '@elizaos/core';
import { createClient, validateConfig } from '../environment.js';

const listAgents: Action = {
  name: 'CHAINWARD_LIST_AGENTS',
  similes: [
    'LIST_MONITORED_WALLETS',
    'SHOW_AGENTS',
    'MY_AGENTS',
    'CHAINWARD_AGENTS',
    'MONITORED_WALLETS',
  ],
  description: 'List all wallet addresses currently monitored by ChainWard.',

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
      const result = await client.agents.list();
      const agents = result.data;

      if (!agents.length) {
        await callback?.({ text: 'No agents are currently monitored on ChainWard.' });
        return { success: true, text: 'No agents monitored' };
      }

      const lines = agents.map(
        (a) =>
          `#${a.id} ${a.agentName ?? 'Unnamed'} — ${a.walletAddress.slice(0, 6)}...${a.walletAddress.slice(-4)} (${a.chain})`,
      );

      await callback?.({
        text: `Monitoring ${agents.length} agent${agents.length === 1 ? '' : 's'} on ChainWard:\n${lines.join('\n')}`,
      });
      return { success: true, data: { agents } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await callback?.({ text: `Failed to list agents: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'What wallets am I monitoring on ChainWard?' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Monitoring 2 agents on ChainWard:\n#1 Trading Bot — 0xAf09...9A53 (base)\n#2 Yield Agent — 0x3cAc...CBfA (base)',
          actions: ['CHAINWARD_LIST_AGENTS']
        },
      },
    ],
  ] as ActionExample[][],
};

export default listAgents;
