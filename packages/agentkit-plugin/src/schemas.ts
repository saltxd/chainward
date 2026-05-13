import { z } from "zod";

export const RegisterAgentSchema = z.object({
  wallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .describe("The wallet address to register for monitoring (0x-prefixed, 40 hex chars)"),
  name: z
    .string()
    .optional()
    .describe("Display name for the agent (defaults to 'AgentKit agent')"),
});

export const ListAgentsSchema = z.object({}).describe("No parameters required");

export const ListTransactionsSchema = z.object({
  wallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .describe("Filter transactions by wallet address. If omitted, returns transactions for all monitored wallets."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Number of transactions to return (default 10, max 50)"),
});

export const CheckBalanceSchema = z.object({
  wallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .describe("The wallet address to check the balance for"),
});

export const CreateAlertSchema = z.object({
  wallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .describe("The wallet address to create the alert for"),
  type: z
    .enum([
      "large_transfer",
      "gas_spike",
      "failed_tx",
      "new_contract",
      "balance_drop",
      "inactivity",
      "idle_balance",
    ])
    .describe("The type of alert to create"),
  threshold: z
    .number()
    .optional()
    .describe("Threshold value for the alert (e.g., 100 for $100 large_transfer)"),
  channels: z
    .array(z.enum(["discord", "telegram", "webhook"]))
    .min(1)
    .describe("Delivery channels for the alert"),
  discordWebhook: z
    .string()
    .url()
    .optional()
    .describe("Discord webhook URL (required if discord channel is selected)"),
  telegramChatId: z
    .string()
    .optional()
    .describe("Telegram chat ID (required if telegram channel is selected)"),
  webhookUrl: z
    .string()
    .url()
    .optional()
    .describe("Webhook URL (required if webhook channel is selected)"),
});

export const ListAlertsSchema = z.object({}).describe("No parameters required");
