import type { Plugin, IAgentRuntime } from '@elizaos/core';
import { ChainWard } from '@chainward/sdk';
import registerAgent from './actions/registerAgent.js';
import listAgents from './actions/listAgents.js';
import listTransactions from './actions/listTransactions.js';
import checkBalance from './actions/checkBalance.js';
import createAlert from './actions/createAlert.js';
import listAlerts from './actions/listAlerts.js';

export const chainwardPlugin: Plugin = {
  name: 'chainward',
  description:
    'ChainWard — real-time monitoring & alerts for AI agent wallets on Base. Register wallets, view transactions, check balances, and manage alerts.',
  actions: [
    registerAgent,
    listAgents,
    listTransactions,
    checkBalance,
    createAlert,
    listAlerts,
  ],
  providers: [],
  evaluators: [],

  async init(config: Record<string, string>, _runtime: IAgentRuntime) {
    // Auto-register the agent wallet on startup if configured
    const apiKey = config.CHAINWARD_API_KEY;
    const wallet = config.CHAINWARD_AGENT_WALLET;

    if (!apiKey || !wallet) return;

    const client = new ChainWard({
      apiKey,
      baseUrl: config.CHAINWARD_BASE_URL,
    });

    try {
      // Check if already registered
      const existing = await client.agents.list();
      const alreadyRegistered = existing.data.some(
        (a) => a.walletAddress.toLowerCase() === wallet.toLowerCase(),
      );

      if (!alreadyRegistered) {
        await client.agents.register({
          chain: 'base',
          wallet,
          name: config.CHAINWARD_AGENT_NAME ?? 'elizaOS agent',
          framework: 'elizaos',
        });
        console.log(`[chainward] Auto-registered wallet ${wallet} for monitoring`);
      } else {
        console.log(`[chainward] Wallet ${wallet} already monitored`);
      }
    } catch (error) {
      console.error('[chainward] Auto-registration failed:', error);
    }
  },
};

export default chainwardPlugin;
