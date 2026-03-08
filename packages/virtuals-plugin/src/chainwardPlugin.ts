import {
  GameWorker,
  GameFunction,
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
} from "@virtuals-protocol/game";
import { ChainWard } from "@chainward/sdk";

export interface ChainwardPluginOptions {
  apiKey: string;
  baseUrl?: string;
}

export class ChainwardPlugin {
  private client: ChainWard;

  constructor(options: ChainwardPluginOptions) {
    this.client = new ChainWard({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
  }

  public get registerAgentFunction() {
    return new GameFunction({
      name: "chainward_register_agent",
      description:
        "Register a wallet address with ChainWard for real-time transaction monitoring and alerts on Base. Use this when you want to start monitoring an agent wallet.",
      args: [
        {
          name: "wallet",
          description: "The wallet address to register for monitoring",
        },
        {
          name: "name",
          description: "Optional display name for the agent",
          optional: true,
        },
      ] as const,
      executable: async (args, logger) => {
        try {
          if (!args.wallet) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              "Missing required argument: wallet",
            );
          }

          const result = await this.client.agents.register({
            chain: "base",
            wallet: args.wallet,
            name: args.name ?? "Virtuals agent",
            framework: "virtuals",
          });

          const agent = result.data;
          const message = `Successfully registered wallet ${agent.walletAddress} with ChainWard (agent #${agent.id}). Real-time monitoring is now active on Base.`;
          logger(message);

          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            JSON.stringify({
              message,
              id: agent.id,
              wallet: agent.walletAddress,
              chain: agent.chain,
            }),
          );
        } catch (e) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Failed to register agent: ${e instanceof Error ? e.message : "Unknown error"}`,
          );
        }
      },
    });
  }

  public get listAgentsFunction() {
    return new GameFunction({
      name: "chainward_list_agents",
      description:
        "List all agent wallets currently monitored by ChainWard. Returns wallet addresses, names, and registration details.",
      args: [] as const,
      executable: async (_args, logger) => {
        try {
          const result = await this.client.agents.list();
          const agents = result.data;

          if (!agents.length) {
            const message =
              "No agents registered. Use chainward_register_agent to start monitoring a wallet.";
            logger(message);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              message,
            );
          }

          const lines = agents.map(
            (a) =>
              `#${a.id} ${a.agentName ?? "unnamed"} — ${a.walletAddress} (${a.chain})`,
          );
          const message = `Monitored agents (${agents.length}):\n${lines.join("\n")}`;
          logger(message);

          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            JSON.stringify({ message, count: agents.length }),
          );
        } catch (e) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Failed to list agents: ${e instanceof Error ? e.message : "Unknown error"}`,
          );
        }
      },
    });
  }

  public get listTransactionsFunction() {
    return new GameFunction({
      name: "chainward_list_transactions",
      description:
        "List recent transactions for monitored agent wallets from ChainWard. Shows amounts, gas costs, direction, and timestamps.",
      args: [
        {
          name: "wallet",
          description: "Filter by wallet address",
          optional: true,
        },
        {
          name: "limit",
          description:
            "Maximum number of transactions to return (default: 10)",
          optional: true,
        },
      ] as const,
      executable: async (args, logger) => {
        try {
          const limit = args.limit ? parseInt(args.limit, 10) : 10;
          const result = await this.client.transactions.list({
            wallet: args.wallet,
            limit,
          });
          const txs = result.data;

          if (!txs.length) {
            const message = "No transactions found.";
            logger(message);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              message,
            );
          }

          const lines = txs.map((tx) => {
            const amount = tx.amountUsd
              ? `$${parseFloat(tx.amountUsd).toFixed(2)}`
              : "N/A";
            const gas = tx.gasCostUsd
              ? `$${parseFloat(tx.gasCostUsd).toFixed(4)}`
              : "";
            const time = new Date(tx.timestamp).toLocaleString();
            return `${tx.direction.toUpperCase()} ${amount} ${tx.tokenSymbol ?? "ETH"} | gas ${gas} | ${tx.txHash.slice(0, 10)}... | ${time}`;
          });

          const message = `Last ${txs.length} transactions:\n${lines.join("\n")}`;
          logger(message);

          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            JSON.stringify({ message, count: txs.length }),
          );
        } catch (e) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Failed to fetch transactions: ${e instanceof Error ? e.message : "Unknown error"}`,
          );
        }
      },
    });
  }

  public get checkBalanceFunction() {
    return new GameFunction({
      name: "chainward_check_balance",
      description:
        "Check the current status and last activity for a monitored wallet on Base via ChainWard.",
      args: [
        {
          name: "wallet",
          description: "The wallet address to check",
        },
      ] as const,
      executable: async (args, logger) => {
        try {
          if (!args.wallet) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              "Missing required argument: wallet",
            );
          }

          const result = await this.client.agents.list();
          const agent = result.data.find(
            (a) =>
              a.walletAddress.toLowerCase() === args.wallet!.toLowerCase(),
          );

          if (!agent) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `Wallet ${args.wallet} is not registered with ChainWard. Register it first with chainward_register_agent.`,
            );
          }

          const txResult = await this.client.transactions.list({
            wallet: args.wallet,
            limit: 1,
          });
          const lastTx = txResult.data[0];
          const lastActivity = lastTx
            ? `Last activity: ${new Date(lastTx.timestamp).toLocaleString()}`
            : "No recent activity";

          const message = `Agent: ${agent.agentName ?? "unnamed"} (${agent.walletAddress})\nChain: ${agent.chain}\n${lastActivity}`;
          logger(message);

          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            JSON.stringify({
              message,
              agent: agent.agentName,
              wallet: agent.walletAddress,
              chain: agent.chain,
              lastActivity: lastTx
                ? new Date(lastTx.timestamp).toISOString()
                : null,
            }),
          );
        } catch (e) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Failed to check balance: ${e instanceof Error ? e.message : "Unknown error"}`,
          );
        }
      },
    });
  }

  public get createAlertFunction() {
    return new GameFunction({
      name: "chainward_create_alert",
      description:
        "Create a monitoring alert for a wallet on ChainWard. Alert types: large_transfer, gas_spike, failed_tx, new_contract, balance_drop, inactivity. Delivery via Discord, Telegram, or webhook.",
      args: [
        {
          name: "wallet",
          description: "The wallet address to monitor",
        },
        {
          name: "type",
          description:
            "Alert type: large_transfer, gas_spike, failed_tx, new_contract, balance_drop, or inactivity",
        },
        {
          name: "threshold",
          description:
            "Threshold value for the alert (e.g. dollar amount for large_transfer)",
          optional: true,
        },
        {
          name: "channels",
          description:
            "Comma-separated delivery channels: discord, telegram, webhook",
        },
        {
          name: "discord_webhook",
          description: "Discord webhook URL (required if channels includes discord)",
          optional: true,
        },
        {
          name: "telegram_chat_id",
          description:
            "Telegram chat ID (required if channels includes telegram)",
          optional: true,
        },
        {
          name: "webhook_url",
          description: "Webhook URL (required if channels includes webhook)",
          optional: true,
        },
      ] as const,
      executable: async (args, logger) => {
        try {
          if (!args.wallet) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              "Missing required argument: wallet",
            );
          }
          if (!args.type) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              "Missing required argument: type",
            );
          }
          if (!args.channels) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              "Missing required argument: channels",
            );
          }

          const channels = args.channels
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
          const threshold = args.threshold
            ? parseFloat(args.threshold)
            : undefined;

          const result = await this.client.alerts.create({
            wallet: args.wallet,
            type: args.type,
            threshold,
            channels,
            discordWebhook: args.discord_webhook,
            telegramChatId: args.telegram_chat_id,
            webhookUrl: args.webhook_url,
          });

          const alert = result.data;
          const message = `Alert created (ID: ${alert.id}). Type: ${alert.alertType}, channels: ${alert.channels.join(", ")}. Monitoring wallet ${alert.walletAddress} on ${alert.chain}.`;
          logger(message);

          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            JSON.stringify({
              message,
              id: alert.id,
              type: alert.alertType,
              channels: alert.channels,
            }),
          );
        } catch (e) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Failed to create alert: ${e instanceof Error ? e.message : "Unknown error"}`,
          );
        }
      },
    });
  }

  public get listAlertsFunction() {
    return new GameFunction({
      name: "chainward_list_alerts",
      description:
        "List all active monitoring alerts configured in ChainWard. Shows alert types, thresholds, and delivery channels.",
      args: [] as const,
      executable: async (_args, logger) => {
        try {
          const result = await this.client.alerts.list();
          const alerts = result.data;

          if (!alerts.length) {
            const message =
              "No alerts configured. Use chainward_create_alert to set one up.";
            logger(message);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              message,
            );
          }

          const lines = alerts.map(
            (a) =>
              `#${a.id} ${a.alertType} on ${a.walletAddress.slice(0, 10)}... | ${a.enabled ? "enabled" : "disabled"} | channels: ${a.channels.join(", ")}${a.thresholdValue ? ` | threshold: ${a.thresholdValue}` : ""}`,
          );
          const message = `Alerts (${alerts.length}):\n${lines.join("\n")}`;
          logger(message);

          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            JSON.stringify({ message, count: alerts.length }),
          );
        } catch (e) {
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Failed to list alerts: ${e instanceof Error ? e.message : "Unknown error"}`,
          );
        }
      },
    });
  }

  public getWorker(overrides?: {
    id?: string;
    name?: string;
    description?: string;
  }): GameWorker {
    return new GameWorker({
      id: overrides?.id ?? "chainward_monitor",
      name: overrides?.name ?? "ChainWard Monitor",
      description:
        overrides?.description ??
        "Monitors AI agent wallets on Base via ChainWard. Can register wallets, view transactions, check balances, and manage alerts.",
      functions: [
        this.registerAgentFunction,
        this.listAgentsFunction,
        this.listTransactionsFunction,
        this.checkBalanceFunction,
        this.createAlertFunction,
        this.listAlertsFunction,
      ],
    });
  }
}
