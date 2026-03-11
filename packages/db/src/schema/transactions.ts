import { pgTable, text, bigint, numeric, smallint, timestamp, index, jsonb, boolean } from 'drizzle-orm/pg-core';
import { agentRegistry } from './agents';

/**
 * Transactions table — will be converted to a TimescaleDB hypertable via raw SQL migration.
 * Drizzle manages the schema; TimescaleDB features (hypertable, compression, continuous aggregates)
 * are set up in timescale-setup.sql.
 */
export const transactions = pgTable(
  'transactions',
  {
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    chain: text('chain').notNull(),
    txHash: text('tx_hash').notNull(),
    blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
    walletAddress: text('wallet_address').notNull(),
    direction: text('direction').notNull(), // 'in' | 'out' | 'self'
    counterparty: text('counterparty'),
    tokenAddress: text('token_address'), // null for native (ETH/SOL)
    tokenSymbol: text('token_symbol'),
    tokenDecimals: smallint('token_decimals'),
    amountRaw: numeric('amount_raw', { precision: 78, scale: 0 }),
    amountUsd: numeric('amount_usd', { precision: 20, scale: 6 }),
    gasUsed: bigint('gas_used', { mode: 'number' }),
    gasPriceGwei: numeric('gas_price_gwei', { precision: 20, scale: 9 }),
    gasCostNative: numeric('gas_cost_native', { precision: 30, scale: 18 }),
    gasCostUsd: numeric('gas_cost_usd', { precision: 20, scale: 6 }),
    txType: text('tx_type'), // 'transfer' | 'swap' | 'contract_call' | 'approval' | 'x402_payment'
    methodId: text('method_id'),
    methodName: text('method_name'),
    contractAddress: text('contract_address'),
    protocolName: text('protocol_name'),
    status: text('status').notNull().default('confirmed'),
    isAgentInteraction: boolean('is_agent_interaction').default(false),
    counterpartyAgentId: bigint('counterparty_agent_id', { mode: 'number' })
      .references(() => agentRegistry.id),
    rawData: jsonb('raw_data'),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tx_wallet_time').on(table.walletAddress, table.timestamp),
    index('idx_tx_chain_wallet').on(table.chain, table.walletAddress, table.timestamp),
    index('idx_tx_hash').on(table.txHash),
    index('idx_tx_type').on(table.txType, table.timestamp),
  ],
);
