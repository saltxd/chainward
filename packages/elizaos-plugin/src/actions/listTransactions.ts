import type {
  Action,
  ActionExample,
  IAgentRuntime,
  Memory,
} from '@elizaos/core';
import { createClient, validateConfig } from '../environment.js';

const listTransactions: Action = {
  name: 'CHAINWARD_LIST_TRANSACTIONS',
  similes: [
    'CHECK_TRANSACTIONS',
    'RECENT_TRANSACTIONS',
    'WALLET_ACTIVITY',
    'TX_HISTORY',
    'CHAINWARD_TRANSACTIONS',
  ],
  description:
    'List recent transactions for monitored agent wallets from ChainWard.',

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

    const text = (message.content as { text?: string })?.text ?? '';
    const walletMatch = text.match(/0x[a-fA-F0-9]{40}/);

    try {
      const result = await client.transactions.list({
        wallet: walletMatch?.[0],
        limit: 10,
      });
      const txs = result.data;

      if (!txs.length) {
        await callback?.({ text: 'No transactions found for the specified wallet.' });
        return { success: true, text: 'No transactions found' };
      }

      const lines = txs.map((tx) => {
        const amount = tx.amountUsd ? `$${parseFloat(tx.amountUsd).toFixed(2)}` : 'N/A';
        const gas = tx.gasCostUsd ? `$${parseFloat(tx.gasCostUsd).toFixed(4)}` : '';
        const time = new Date(tx.timestamp).toLocaleString();
        return `${tx.direction.toUpperCase()} ${amount} ${tx.tokenSymbol ?? 'ETH'} | gas ${gas} | ${tx.txHash.slice(0, 10)}... | ${time}`;
      });

      await callback?.({
        text: `Last ${txs.length} transactions:\n${lines.join('\n')}`,
      });
      return { success: true, data: { transactions: txs, pagination: result.pagination } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await callback?.({ text: `Failed to fetch transactions: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'Show me recent transactions for my agent' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Last 5 transactions:\nOUT $50.00 USDC | gas $0.0012 | 0xa1b2c3... | 3/7/2026\nIN $49.80 ETH | gas $0.0008 | 0xd4e5f6... | 3/7/2026',
          actions: ['CHAINWARD_LIST_TRANSACTIONS']
        },
      },
    ],
  ] as ActionExample[][],
};

export default listTransactions;
