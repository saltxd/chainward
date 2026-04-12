import { Hono } from 'hono';
import { z } from 'zod';
import { and, count, desc, eq } from 'drizzle-orm';
import { agentEvents, agentRegistry } from '@chainward/db';
import { AGENT_FRAMEWORKS } from '@chainward/common';
import type { AppVariables } from '../types.js';
import { AgentService } from '../services/agentService.js';
import { getDb } from '../lib/db.js';
import { getQueues } from '../lib/queue.js';
import { requireApiKeyOrSession } from '../middleware/apiKeyAuth.js';
import { AppError } from '../middleware/errorHandler.js';
import { getWebhookProvider } from '../providers/index.js';
import { checkAddressType } from '../lib/contractCheck.js';
import { logger } from '../lib/logger.js';

const agents = new Hono<{ Variables: AppVariables }>();

// All routes require auth
agents.use('*', requireApiKeyOrSession());

const createAgentSchema = z.object({
  chain: z.enum(['base', 'solana']),
  walletAddress: z.string().min(1),
  agentName: z.string().optional(),
  agentFramework: z.enum(AGENT_FRAMEWORKS).optional(),
  tags: z.array(z.string()).optional(),
  confirmContract: z.boolean().optional(),
});

const updateAgentSchema = z.object({
  agentName: z.string().optional(),
  agentFramework: z.enum(AGENT_FRAMEWORKS).optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
});

agents.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const input = createAgentSchema.parse(body);

  // Contract detection — warn on non-wallet contracts
  if (input.chain === 'base' && !input.confirmContract) {
    const { isContract, isKnownWallet } = await checkAddressType(input.walletAddress);
    if (isContract && !isKnownWallet) {
      logger.warn(
        { address: input.walletAddress, userId: user.id },
        'User registering non-wallet contract address',
      );
      return c.json({
        success: false,
        error: {
          code: 'CONTRACT_WARNING',
          message: 'This looks like a token contract, not an agent wallet. Monitoring it may generate very high transaction volume. Are you sure?',
        },
      }, 422);
    }
  }

  const service = new AgentService(getDb());
  const agent = await service.create(user.id, user.tier ?? 'free', input);

  // Kick off backfill + initial balance snapshot
  const queues = getQueues();
  if (input.chain === 'base') {
    await queues.baseTxProcess.add('backfill', {
      type: 'backfill',
      agentId: agent!.id,
      walletAddress: agent!.walletAddress,
      chain: agent!.chain,
    });
  }
  await queues.balancePoll.add('snapshot', {
    type: 'initial',
    agentId: agent!.id,
    walletAddress: agent!.walletAddress,
    chain: agent!.chain,
  });

  // Register address with Alchemy webhook for live indexing
  if (input.chain === 'base') {
    getWebhookProvider().addAddress(agent!.walletAddress).catch(() => {});
  }

  return c.json({ success: true, data: agent }, 201);
});

agents.get('/', async (c) => {
  const user = c.get('user');
  const service = new AgentService(getDb());
  const agentList = await service.list(user.id);

  return c.json({ success: true, data: agentList });
});

agents.get('/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) throw new AppError(400, 'INVALID_ID', 'Agent ID must be a number');

  const service = new AgentService(getDb());
  const agent = await service.getById(user.id, id);

  return c.json({ success: true, data: agent });
});

agents.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) throw new AppError(400, 'INVALID_ID', 'Agent ID must be a number');

  const body = await c.req.json();
  const input = updateAgentSchema.parse(body);

  const service = new AgentService(getDb());
  const agent = await service.update(user.id, id, input);

  return c.json({ success: true, data: agent });
});

agents.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) throw new AppError(400, 'INVALID_ID', 'Agent ID must be a number');

  const db = getDb();
  const service = new AgentService(db);

  // Fetch agent before deletion to get wallet info
  const agent = await service.getById(user.id, id);

  await service.delete(user.id, id);

  // Only remove the webhook subscription when no one else is monitoring this wallet.
  if (agent.chain === 'base') {
    const [remaining] = await db
      .select({ total: count() })
      .from(agentRegistry)
      .where(
        and(
          eq(agentRegistry.chain, agent.chain),
          eq(agentRegistry.walletAddress, agent.walletAddress),
        ),
      );

    if ((remaining?.total ?? 0) === 0) {
      getWebhookProvider().removeAddress(agent.walletAddress).catch(() => {});
    }
  }

  return c.json({ success: true, data: null });
});

/**
 * POST /:id/events — Ingest structured events from an agent.
 * Body: single event object or array of events.
 * Each event: { eventType, timestamp, walletAddress?, chain?, payload? }
 */
agents.post('/:id/events', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) throw new AppError(400, 'INVALID_ID', 'Agent ID must be a number');

  const db = getDb();
  const service = new AgentService(db);
  const agent = await service.getById(user.id, id);

  const body = await c.req.json();
  const events = Array.isArray(body) ? body : [body];

  if (events.length === 0) {
    throw new AppError(400, 'EMPTY_EVENTS', 'No events provided');
  }
  if (events.length > 100) {
    throw new AppError(400, 'TOO_MANY_EVENTS', 'Maximum 100 events per request');
  }

  const rows = events.map((event: any) => {
    if (!event.eventType || !event.timestamp) {
      throw new AppError(400, 'INVALID_EVENT', 'Each event must have eventType and timestamp');
    }
    return {
      timestamp: new Date(event.timestamp),
      agentId: id,
      walletAddress: event.walletAddress || agent.walletAddress,
      chain: event.chain || 'base',
      eventType: event.eventType,
      payload: event.payload || {},
    };
  });

  await db.insert(agentEvents).values(rows);

  return c.json({ success: true, accepted: rows.length }, 202);
});

/**
 * GET /:id/events — Fetch recent events for an agent.
 * Query params: limit (default 50, max 200), offset, eventType (filter)
 */
agents.get('/:id/events', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) throw new AppError(400, 'INVALID_ID', 'Agent ID must be a number');

  const db = getDb();
  const service = new AgentService(db);
  await service.getById(user.id, id); // validates ownership

  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const eventTypeFilter = c.req.query('eventType');

  const conditions = [eq(agentEvents.agentId, id)];
  if (eventTypeFilter) {
    conditions.push(eq(agentEvents.eventType, eventTypeFilter));
  }

  const results = await db
    .select()
    .from(agentEvents)
    .where(and(...conditions))
    .orderBy(desc(agentEvents.timestamp))
    .limit(limit)
    .offset(offset);

  return c.json({ success: true, data: results, count: results.length });
});

export { agents };
