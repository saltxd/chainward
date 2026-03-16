import { Worker, Queue, type Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { acpAgentData, acpInteractions, acpEcosystemMetrics, agentRegistry } from '@chainward/db';
import { getRedis } from '../lib/redis.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const ACP_API = 'https://acpx.virtuals.io/api';
const PAGE_SIZE = 100;
const REQUEST_DELAY = 200; // ms between paginated requests

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP helpers
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchJson(url: string, retries = 3): Promise<unknown> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ChainWard-ACP-Sync/1.0' },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 502 || res.status === 503 || res.status === 429) {
        if (attempt < retries - 1) {
          logger.warn({ status: res.status, attempt, url }, 'ACP API temporary error, retrying');
          await sleep(2000 * (attempt + 1)); // exponential backoff
          continue;
        }
      }
      if (!res.ok) {
        throw new Error(`ACP API error: ${res.status} ${res.statusText} for ${url}`);
      }
      return res.json();
    } catch (err) {
      if (attempt < retries - 1 && (err as Error).name === 'TimeoutError') {
        logger.warn({ attempt, url }, 'ACP API timeout, retrying');
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`ACP API failed after ${retries} retries for ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent sync — paginate through all ACP agents and upsert
// ═══════════════════════════════════════════════════════════════════════════════

async function syncAgents() {
  const db = getDb();
  let page = 1;
  let totalSynced = 0;
  let totalPages = 1;

  logger.info('Starting ACP agent sync...');

  while (page <= totalPages) {
    const url = `${ACP_API}/agents?pagination[page]=${page}&pagination[pageSize]=${PAGE_SIZE}&sort=grossAgenticAmount:desc`;
    const data = await fetchJson(url) as {
      data: Array<Record<string, unknown>>;
      meta: { pagination: { page: number; pageSize: number; pageCount: number; total: number } };
    };

    if (!data.data || data.data.length === 0) break;

    totalPages = data.meta.pagination.pageCount;

    for (const agent of data.data) {
      const metrics = (agent.metrics as Record<string, unknown>) || {};

      try {
        await db.execute(sql`
          INSERT INTO acp_agent_data (
            acp_id, document_id, wallet_address, owner_address, name, description,
            token_address, symbol, virtual_agent_id, twitter_handle, profile_pic,
            category, role, contract_address, has_graduated, is_virtual_agent, is_online,
            successful_job_count, success_rate, unique_buyer_count, transaction_count,
            gross_agentic_amount, revenue, rating, wallet_balance, processing_time,
            offerings, resources, raw_json, last_active_at, last_synced_at, updated_at
          ) VALUES (
            ${agent.id as number},
            ${(agent.documentId as string) ?? null},
            ${agent.walletAddress as string},
            ${(agent.ownerAddress as string) ?? null},
            ${(agent.name as string) ?? null},
            ${(agent.description as string) ?? null},
            ${(agent.tokenAddress as string) ?? null},
            ${(agent.symbol as string) ?? null},
            ${(agent.virtualAgentId as number) ?? null},
            ${(agent.twitterHandle as string) ?? null},
            ${(agent.profilePic as string) ?? null},
            ${(agent.category as string) ?? null},
            ${(agent.role as string) ?? null},
            ${(agent.contractAddress as string) ?? null},
            ${(agent.hasGraduated as boolean) ?? null},
            ${(agent.isVirtualAgent as boolean) ?? null},
            ${(metrics.isOnline as boolean) ?? false},
            ${(metrics.successfulJobCount as number) ?? null},
            ${(metrics.successRate as number) ?? null},
            ${(metrics.uniqueBuyerCount as number) ?? null},
            ${(metrics.transactionCount as number) ?? null},
            ${(metrics.grossAgenticAmount as number) ?? null},
            ${(metrics.revenue as number) ?? null},
            ${(metrics.rating as number) ?? null},
            ${(agent.walletBalance as string) ?? null},
            ${typeof agent.processingTime === 'number' ? agent.processingTime : null},
            ${JSON.stringify(agent.offerings ?? agent.jobs ?? null)},
            ${JSON.stringify(agent.resources ?? null)},
            ${JSON.stringify(agent)},
            ${(metrics.lastActiveAt as string) ?? null},
            NOW(),
            NOW()
          )
          ON CONFLICT (wallet_address) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            owner_address = EXCLUDED.owner_address,
            token_address = EXCLUDED.token_address,
            symbol = EXCLUDED.symbol,
            virtual_agent_id = EXCLUDED.virtual_agent_id,
            twitter_handle = EXCLUDED.twitter_handle,
            role = EXCLUDED.role,
            has_graduated = EXCLUDED.has_graduated,
            is_online = EXCLUDED.is_online,
            successful_job_count = EXCLUDED.successful_job_count,
            success_rate = EXCLUDED.success_rate,
            unique_buyer_count = EXCLUDED.unique_buyer_count,
            transaction_count = EXCLUDED.transaction_count,
            gross_agentic_amount = EXCLUDED.gross_agentic_amount,
            revenue = EXCLUDED.revenue,
            rating = EXCLUDED.rating,
            wallet_balance = EXCLUDED.wallet_balance,
            offerings = EXCLUDED.offerings,
            resources = EXCLUDED.resources,
            raw_json = EXCLUDED.raw_json,
            last_active_at = EXCLUDED.last_active_at,
            last_synced_at = NOW(),
            updated_at = NOW()
        `);
        totalSynced++;
      } catch (err) {
        logger.warn({ err, acpId: agent.id, wallet: agent.walletAddress }, 'Failed to upsert ACP agent');
      }
    }

    if (page % 50 === 0) {
      logger.info({ page, totalPages, totalSynced }, 'ACP agent sync progress');
    }

    page++;
    await sleep(REQUEST_DELAY);
  }

  logger.info({ totalSynced, totalPages }, 'ACP agent sync complete');
  return totalSynced;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Wallet matching — link ACP agents to observatory agents
// ═══════════════════════════════════════════════════════════════════════════════

async function matchWallets() {
  const db = getDb();

  const result = await db.execute(sql`
    UPDATE agent_registry ar
    SET acp_agent_id = acp.acp_id
    FROM acp_agent_data acp
    WHERE LOWER(ar.wallet_address) = LOWER(acp.wallet_address)
      AND ar.acp_agent_id IS DISTINCT FROM acp.acp_id
  `);

  const matched = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  logger.info({ matched }, 'ACP wallet matching complete');
  return matched;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Interaction sync — pull recent agent-to-agent interactions
// ═══════════════════════════════════════════════════════════════════════════════

async function syncInteractions() {
  const db = getDb();
  let page = 1;
  let totalSynced = 0;
  const maxPages = 50; // Only pull last ~5000 interactions per sync

  logger.info('Starting ACP interaction sync...');

  while (page <= maxPages) {
    const url = `${ACP_API}/interactions?pagination[page]=${page}&pagination[pageSize]=${PAGE_SIZE}&sort=createdAt:desc&mode=agent-to-agent`;
    const data = await fetchJson(url) as {
      data: Array<Record<string, unknown>>;
      meta: { pagination: { page: number; pageSize: number; pageCount: number; total: number } };
    };

    if (!data.data || data.data.length === 0) break;

    for (const interaction of data.data) {
      try {
        await db.execute(sql`
          INSERT INTO acp_interactions (
            interaction_id, document_id, job_id, tx_hash, type, memo_type,
            content, job_summary, from_agent_id, from_agent_name, from_agent_owner,
            to_agent_id, to_agent_name, to_agent_owner, client_address,
            budget, budget_token_address, usd_amount, raw_json, created_at
          ) VALUES (
            ${interaction.id as number},
            ${(interaction.documentId as string) ?? null},
            ${(interaction.jobId as string) ?? null},
            ${(interaction.txHash as string) ?? null},
            ${(interaction.type as string) ?? null},
            ${(interaction.memoType as number) ?? null},
            ${(interaction.content as string) ?? null},
            ${(interaction.jobSummary as string) ?? null},
            ${(interaction.fromAgentId as number) ?? null},
            ${(interaction.fromAgentName as string) ?? null},
            ${(interaction.fromAgentOwnerAddress as string) ?? null},
            ${(interaction.toAgentId as number) ?? null},
            ${(interaction.toAgentName as string) ?? null},
            ${(interaction.toAgentOwnerAddress as string) ?? null},
            ${(interaction.clientAddress as string) ?? null},
            ${(interaction.budget as number) ?? null},
            ${(interaction.budgetTokenAddress as string) ?? null},
            ${(interaction.usdAmount as number) ?? null},
            ${JSON.stringify(interaction)},
            ${interaction.createdAt as string}
          )
          ON CONFLICT (interaction_id) DO NOTHING
        `);
        totalSynced++;
      } catch (err) {
        // Skip duplicates silently
      }
    }

    page++;
    await sleep(REQUEST_DELAY);
  }

  logger.info({ totalSynced }, 'ACP interaction sync complete');
  return totalSynced;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Ecosystem metrics — snapshot the four-metrics endpoint
// ═══════════════════════════════════════════════════════════════════════════════

async function syncMetrics() {
  const db = getDb();

  const data = await fetchJson(`${ACP_API}/metrics/four-metrics`) as {
    data: { total: { GAV: number; JOB: number; USER: number; REVENUE: number } };
  };

  const totals = data.data.total;

  await db.insert(acpEcosystemMetrics).values({
    totalAgdp: String(totals.GAV),
    totalRevenue: String(totals.REVENUE),
    totalJobs: totals.JOB,
    totalUniqueWallets: totals.USER,
  });

  logger.info({ totals }, 'ACP ecosystem metrics snapshot saved');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Worker setup
// ═══════════════════════════════════════════════════════════════════════════════

interface AcpSyncJobData {
  type: 'agents' | 'interactions' | 'metrics';
}

export function createAcpSyncWorker() {
  const worker = new Worker<AcpSyncJobData>(
    'acp-sync',
    async (job: Job<AcpSyncJobData>) => {
      switch (job.data.type) {
        case 'agents':
          await syncAgents();
          await matchWallets();
          break;
        case 'interactions':
          await syncInteractions();
          break;
        case 'metrics':
          await syncMetrics();
          break;
        default:
          logger.warn({ type: job.data.type }, 'Unknown ACP sync job type');
      }
    },
    {
      connection: getRedis(),
      concurrency: 1, // Sequential — don't hammer ACP API
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, type: job?.data?.type, err }, 'ACP sync job failed');
  });

  logger.info('ACP sync worker started');
  return worker;
}

export async function setupAcpSyncSchedule(redis: import('ioredis').default) {
  const queue = new Queue('acp-sync', { connection: redis });

  // Remove existing repeatable jobs
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Agent sync every 6 hours
  await queue.add('sync-agents', { type: 'agents' }, {
    repeat: { every: 6 * 60 * 60 * 1000 },
    jobId: 'acp-agents-sync',
  });

  // Interaction sync every 6 hours (offset by 1 hour)
  await queue.add('sync-interactions', { type: 'interactions' }, {
    repeat: { every: 6 * 60 * 60 * 1000 },
    jobId: 'acp-interactions-sync',
  });

  // Metrics snapshot daily
  await queue.add('sync-metrics', { type: 'metrics' }, {
    repeat: { every: 24 * 60 * 60 * 1000 },
    jobId: 'acp-metrics-sync',
  });

  // Trigger initial sync immediately
  await queue.add('initial-agents', { type: 'agents' }, { jobId: 'acp-initial-agents' });
  await queue.add('initial-metrics', { type: 'metrics' }, { jobId: 'acp-initial-metrics' });

  logger.info('ACP sync scheduled (agents: 6h, interactions: 6h, metrics: 24h)');
  await queue.close();
}
