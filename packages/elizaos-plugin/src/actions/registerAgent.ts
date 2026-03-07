import type {
  Action,
  ActionExample,
  IAgentRuntime,
  Memory,
} from '@elizaos/core';
import { createClient, validateConfig } from '../environment.js';

const registerAgent: Action = {
  name: 'CHAINWARD_REGISTER_AGENT',
  similes: [
    'REGISTER_WALLET_MONITORING',
    'MONITOR_WALLET',
    'ADD_AGENT_WALLET',
    'START_MONITORING',
    'CHAINWARD_ADD_AGENT',
  ],
  description:
    'Register a wallet address with ChainWard for real-time transaction monitoring and alerts on Base.',

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
        text: 'No wallet address provided. Include a wallet address in your message or set CHAINWARD_AGENT_WALLET.',
      });
      return { success: false, error: 'No wallet address provided' };
    }

    try {
      const result = await client.agents.register({
        chain: 'base',
        wallet,
        name: config.CHAINWARD_AGENT_NAME ?? 'elizaOS agent',
        framework: 'elizaos',
      });

      const agent = result.data;
      await callback?.({
        text: `Registered wallet ${agent.walletAddress} with ChainWard (agent #${agent.id}). Real-time monitoring is now active on Base.`,
      });
      return { success: true, text: `Registered ${wallet}`, data: { agent } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await callback?.({ text: `Failed to register agent with ChainWard: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'Register my agent wallet 0xAf09B7fa44058D40738DaBEbD4f014ac3aBf9A53 with ChainWard' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Registered wallet 0xAf09...9A53 with ChainWard (agent #1). Real-time monitoring is now active on Base.',
          actions: ['CHAINWARD_REGISTER_AGENT']
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: { text: 'Start monitoring my wallet on ChainWard' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Registered wallet with ChainWard. Real-time monitoring is now active on Base.',
          actions: ['CHAINWARD_REGISTER_AGENT']
        },
      },
    ],
  ] as ActionExample[][],
};

export default registerAgent;
