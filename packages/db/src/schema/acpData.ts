import { pgTable, bigserial, text, boolean, integer, numeric, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const acpAgentData = pgTable(
  'acp_agent_data',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    acpId: integer('acp_id').notNull(),
    documentId: text('document_id'),
    walletAddress: text('wallet_address').notNull(),
    ownerAddress: text('owner_address'),
    name: text('name'),
    description: text('description'),
    tokenAddress: text('token_address'),
    symbol: text('symbol'),
    virtualAgentId: integer('virtual_agent_id'),
    twitterHandle: text('twitter_handle'),
    profilePic: text('profile_pic'),
    category: text('category'),
    role: text('role'),
    contractAddress: text('contract_address'),
    hasGraduated: boolean('has_graduated'),
    isVirtualAgent: boolean('is_virtual_agent'),
    isOnline: boolean('is_online'),

    // Economic metrics
    successfulJobCount: integer('successful_job_count'),
    successRate: numeric('success_rate'),
    uniqueBuyerCount: integer('unique_buyer_count'),
    transactionCount: integer('transaction_count'),
    grossAgenticAmount: numeric('gross_agentic_amount'),
    revenue: numeric('revenue'),
    rating: numeric('rating'),
    walletBalance: text('wallet_balance'),
    processingTime: numeric('processing_time'),

    // JSON fields
    offerings: jsonb('offerings'),
    resources: jsonb('resources'),
    rawJson: jsonb('raw_json').notNull(),

    // Timestamps
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_acp_agent_wallet').on(table.walletAddress),
    index('idx_acp_agent_acp_id').on(table.acpId),
    index('idx_acp_agent_jobs').on(table.successfulJobCount),
  ],
);

export const acpInteractions = pgTable(
  'acp_interactions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    interactionId: integer('interaction_id').notNull(),
    documentId: text('document_id'),
    jobId: text('job_id'),
    txHash: text('tx_hash'),
    type: text('type'),
    memoType: integer('memo_type'),
    content: text('content'),
    jobSummary: text('job_summary'),

    fromAgentId: integer('from_agent_id'),
    fromAgentName: text('from_agent_name'),
    fromAgentOwner: text('from_agent_owner'),
    toAgentId: integer('to_agent_id'),
    toAgentName: text('to_agent_name'),
    toAgentOwner: text('to_agent_owner'),
    clientAddress: text('client_address'),

    budget: numeric('budget'),
    budgetTokenAddress: text('budget_token_address'),
    usdAmount: numeric('usd_amount'),

    rawJson: jsonb('raw_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_acp_interaction').on(table.interactionId),
    index('idx_acp_interaction_time').on(table.createdAt),
    index('idx_acp_interaction_job').on(table.jobId),
  ],
);

export const acpEcosystemMetrics = pgTable(
  'acp_ecosystem_metrics',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    totalAgdp: numeric('total_agdp'),
    totalRevenue: numeric('total_revenue'),
    totalJobs: integer('total_jobs'),
    totalUniqueWallets: integer('total_unique_wallets'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_acp_eco_time').on(table.capturedAt),
  ],
);
