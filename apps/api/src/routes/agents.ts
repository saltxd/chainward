import { Hono } from 'hono';
import { z } from 'zod';
import { AGENT_FRAMEWORKS } from '@agentguard/common';
import type { AppVariables } from '../types.js';
import { AgentService } from '../services/agentService.js';
import { getDb } from '../lib/db.js';
import { getQueues } from '../lib/queue.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const agents = new Hono<{ Variables: AppVariables }>();

// All routes require auth
agents.use('*', requireAuth);

const createAgentSchema = z.object({
  chain: z.enum(['base', 'solana']),
  walletAddress: z.string().min(1),
  agentName: z.string().optional(),
  agentFramework: z.enum(AGENT_FRAMEWORKS).optional(),
  tags: z.array(z.string()).optional(),
});

const updateAgentSchema = z.object({
  agentName: z.string().optional(),
  agentFramework: z.enum(AGENT_FRAMEWORKS).optional(),
  tags: z.array(z.string()).optional(),
});

agents.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const input = createAgentSchema.parse(body);

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

  const service = new AgentService(getDb());
  await service.delete(user.id, id);

  return c.json({ success: true, data: null });
});

export { agents };
