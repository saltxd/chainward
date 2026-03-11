import { pgTable, bigserial, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const knownContracts = pgTable(
  'known_contracts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chain: text('chain').notNull().default('base'),
    contractAddress: text('contract_address').notNull(),
    protocolName: text('protocol_name').notNull(),
    contractLabel: text('contract_label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_known_contracts_chain_addr').on(table.chain, table.contractAddress),
    index('idx_known_contracts_protocol').on(table.protocolName),
  ],
);
