import { pgTable, bigserial, text, numeric, boolean, timestamp, interval, index, bigint, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const alertConfigs = pgTable(
  'alert_configs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    walletAddress: text('wallet_address').notNull(),
    chain: text('chain').notNull(),
    alertType: text('alert_type').notNull(), // 'large_transfer' | 'gas_spike' | 'inactivity' | 'balance_drop' | 'new_contract' | 'failed_tx'
    thresholdValue: numeric('threshold_value', { precision: 30, scale: 6 }),
    thresholdUnit: text('threshold_unit'), // 'usd' | 'native' | 'percentage'
    lookbackWindow: interval('lookback_window'),
    channels: text('channels').array().notNull().default(['webhook']),
    webhookUrl: text('webhook_url'),
    slackWebhook: text('slack_webhook'),
    discordWebhook: text('discord_webhook'),
    enabled: boolean('enabled').notNull().default(true),
    cooldown: interval('cooldown').notNull().default('5 minutes'),
    lastTriggered: timestamp('last_triggered', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_alert_configs_user').on(table.userId),
    index('idx_alert_configs_wallet').on(table.walletAddress, table.chain),
  ],
);

/**
 * Alert events — will be converted to a TimescaleDB hypertable via raw SQL migration.
 */
export const alertEvents = pgTable(
  'alert_events',
  {
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    alertConfigId: bigint('alert_config_id', { mode: 'number' }).notNull(),
    walletAddress: text('wallet_address').notNull(),
    chain: text('chain').notNull(),
    alertType: text('alert_type').notNull(),
    severity: text('severity').notNull().default('info'),
    title: text('title').notNull(),
    description: text('description'),
    triggerValue: numeric('trigger_value', { precision: 30, scale: 6 }),
    triggerTxHash: text('trigger_tx_hash'),
    delivered: boolean('delivered').notNull().default(false),
    deliveryChannel: text('delivery_channel'),
    deliveryError: text('delivery_error'),
    contextData: jsonb('context_data'),
  },
  (table) => [
    index('idx_alert_events_config').on(table.alertConfigId, table.timestamp),
    index('idx_alert_events_wallet').on(table.walletAddress, table.timestamp),
  ],
);
