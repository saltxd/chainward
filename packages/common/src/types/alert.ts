import type { SupportedChain } from './chain.js';

export const ALERT_TYPES = [
  'large_transfer',
  'balance_drop',
  'gas_spike',
  'failed_tx',
  'inactivity',
  'new_contract',
  'idle_balance',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const DELIVERY_CHANNELS = ['webhook', 'telegram', 'discord'] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export interface AlertConfig {
  id: number;
  userId: string;
  walletAddress: string;
  chain: SupportedChain;
  alertType: AlertType;
  thresholdValue: number | null;
  thresholdUnit: string | null;
  lookbackWindow: string | null; // interval string
  channels: DeliveryChannel[];
  webhookUrl: string | null;
  telegramChatId: string | null;
  discordWebhook: string | null;
  enabled: boolean;
  cooldown: string; // interval string
  lastTriggered: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAlertInput {
  walletAddress: string;
  chain: SupportedChain;
  alertType: AlertType;
  thresholdValue?: number;
  thresholdUnit?: string;
  lookbackWindow?: string;
  channels: DeliveryChannel[];
  webhookUrl?: string;
  telegramChatId?: string;
  discordWebhook?: string;
  cooldown?: string;
}

export interface AlertEvent {
  timestamp: Date;
  alertConfigId: number;
  walletAddress: string;
  chain: SupportedChain;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string | null;
  triggerValue: number | null;
  triggerTxHash: string | null;
  delivered: boolean;
  deliveryChannel: string | null;
  deliveryError: string | null;
}

export interface AlertPayload {
  type: AlertType;
  severity: AlertSeverity;
  agent: {
    name: string | null;
    wallet: string;
    chain: SupportedChain;
  };
  trigger: {
    value: number | null;
    unit: string | null;
    threshold: number | null;
    txHash: string | null;
  };
  timestamp: string;
  dashboardUrl: string;
}
