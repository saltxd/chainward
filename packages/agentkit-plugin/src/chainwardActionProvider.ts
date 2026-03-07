import "reflect-metadata";
import { ActionProvider, CreateAction } from "@coinbase/agentkit";
import { ChainWard } from "@chainward/sdk";
import { z } from "zod";
import {
  RegisterAgentSchema,
  ListAgentsSchema,
  ListTransactionsSchema,
  CheckBalanceSchema,
  CreateAlertSchema,
  ListAlertsSchema,
} from "./schemas.js";

export interface ChainWardActionProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

export class ChainWardActionProvider extends ActionProvider {
  private client: ChainWard;

  constructor(config: ChainWardActionProviderConfig) {
    super("chainward", []);
    this.client = new ChainWard({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
  }

  @CreateAction({
    name: "chainward_register_agent",
    description:
      "Register a wallet address with ChainWard for real-time transaction monitoring and alerts on Base. Use this when you want to start monitoring an agent wallet.",
    schema: RegisterAgentSchema,
  })
  async registerAgent(args: z.infer<typeof RegisterAgentSchema>): Promise<string> {
    try {
      const result = await this.client.agents.register({
        chain: "base",
        wallet: args.wallet,
        name: args.name ?? "AgentKit agent",
        framework: "agentkit",
      });
      const agent = result.data;
      return `Successfully registered wallet ${agent.walletAddress} with ChainWard (agent #${agent.id}). Real-time monitoring is now active on Base.`;
    } catch (error) {
      return `Failed to register agent: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  @CreateAction({
    name: "chainward_list_agents",
    description:
      "List all agent wallets currently monitored by ChainWard. Returns wallet addresses, names, and registration details.",
    schema: ListAgentsSchema,
  })
  async listAgents(_args: z.infer<typeof ListAgentsSchema>): Promise<string> {
    try {
      const result = await this.client.agents.list();
      const agents = result.data;
      if (!agents.length) {
        return "No agents registered. Use chainward_register_agent to start monitoring a wallet.";
      }
      const lines = agents.map(
        (a) => `#${a.id} ${a.agentName ?? "unnamed"} — ${a.walletAddress} (${a.chain})`,
      );
      return `Monitored agents (${agents.length}):\n${lines.join("\n")}`;
    } catch (error) {
      return `Failed to list agents: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  @CreateAction({
    name: "chainward_list_transactions",
    description:
      "List recent transactions for monitored agent wallets from ChainWard. Shows amounts, gas costs, direction, and timestamps.",
    schema: ListTransactionsSchema,
  })
  async listTransactions(args: z.infer<typeof ListTransactionsSchema>): Promise<string> {
    try {
      const result = await this.client.transactions.list({
        wallet: args.wallet,
        limit: args.limit ?? 10,
      });
      const txs = result.data;
      if (!txs.length) {
        return "No transactions found.";
      }
      const lines = txs.map((tx) => {
        const amount = tx.amountUsd ? `$${parseFloat(tx.amountUsd).toFixed(2)}` : "N/A";
        const gas = tx.gasCostUsd ? `$${parseFloat(tx.gasCostUsd).toFixed(4)}` : "";
        const time = new Date(tx.timestamp).toLocaleString();
        return `${tx.direction.toUpperCase()} ${amount} ${tx.tokenSymbol ?? "ETH"} | gas ${gas} | ${tx.txHash.slice(0, 10)}... | ${time}`;
      });
      return `Last ${txs.length} transactions:\n${lines.join("\n")}`;
    } catch (error) {
      return `Failed to fetch transactions: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  @CreateAction({
    name: "chainward_check_balance",
    description:
      "Check the current ETH balance for a monitored wallet on Base via ChainWard.",
    schema: CheckBalanceSchema,
  })
  async checkBalance(args: z.infer<typeof CheckBalanceSchema>): Promise<string> {
    try {
      const result = await this.client.agents.list();
      const agent = result.data.find(
        (a) => a.walletAddress.toLowerCase() === args.wallet.toLowerCase(),
      );
      if (!agent) {
        return `Wallet ${args.wallet} is not registered with ChainWard. Register it first with chainward_register_agent.`;
      }
      const txResult = await this.client.transactions.list({
        wallet: args.wallet,
        limit: 1,
      });
      const lastTx = txResult.data[0];
      const lastActivity = lastTx
        ? `Last activity: ${new Date(lastTx.timestamp).toLocaleString()}`
        : "No recent activity";
      return `Agent: ${agent.agentName ?? "unnamed"} (${agent.walletAddress})\nChain: ${agent.chain}\n${lastActivity}`;
    } catch (error) {
      return `Failed to check balance: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  @CreateAction({
    name: "chainward_create_alert",
    description:
      "Create a monitoring alert for a wallet on ChainWard. Alert types: large_transfer, gas_spike, failed_tx, new_contract, balance_drop, inactivity. Delivery via Discord, Telegram, or webhook.",
    schema: CreateAlertSchema,
  })
  async createAlert(args: z.infer<typeof CreateAlertSchema>): Promise<string> {
    try {
      const result = await this.client.alerts.create({
        wallet: args.wallet,
        type: args.type,
        threshold: args.threshold,
        channels: args.channels,
        discordWebhook: args.discordWebhook,
        telegramChatId: args.telegramChatId,
        webhookUrl: args.webhookUrl,
      });
      const alert = result.data;
      return `Alert created (ID: ${alert.id}). Type: ${alert.alertType}, channels: ${alert.channels.join(", ")}. Monitoring wallet ${alert.walletAddress} on ${alert.chain}.`;
    } catch (error) {
      return `Failed to create alert: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  @CreateAction({
    name: "chainward_list_alerts",
    description:
      "List all active monitoring alerts configured in ChainWard. Shows alert types, thresholds, and delivery channels.",
    schema: ListAlertsSchema,
  })
  async listAlerts(_args: z.infer<typeof ListAlertsSchema>): Promise<string> {
    try {
      const result = await this.client.alerts.list();
      const alerts = result.data;
      if (!alerts.length) {
        return "No alerts configured. Use chainward_create_alert to set one up.";
      }
      const lines = alerts.map(
        (a) =>
          `#${a.id} ${a.alertType} on ${a.walletAddress.slice(0, 10)}... | ${a.enabled ? "enabled" : "disabled"} | channels: ${a.channels.join(", ")}${a.thresholdValue ? ` | threshold: ${a.thresholdValue}` : ""}`,
      );
      return `Alerts (${alerts.length}):\n${lines.join("\n")}`;
    } catch (error) {
      return `Failed to list alerts: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  supportsNetwork = () => true;
}

export const chainwardActionProvider = (config: ChainWardActionProviderConfig) =>
  new ChainWardActionProvider(config);
