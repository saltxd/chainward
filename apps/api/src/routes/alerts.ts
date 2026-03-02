import { Hono } from 'hono';
import { z } from 'zod';
import { ALERT_TYPES, DELIVERY_CHANNELS } from '@chainward/common';
import type { AppVariables } from '../types.js';
import { AlertService } from '../services/alertService.js';
import { getDb } from '../lib/db.js';
import { getQueues } from '../lib/queue.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';

const alerts = new Hono<{ Variables: AppVariables }>();
alerts.use('*', requireAuth);

const createAlertSchema = z.object({
  walletAddress: z.string().min(1),
  chain: z.enum(['base', 'solana']),
  alertType: z.enum(ALERT_TYPES),
  thresholdValue: z.string().optional(),
  thresholdUnit: z.enum(['usd', 'native', 'percentage']).optional(),
  lookbackWindow: z.string().optional(),
  channels: z.array(z.enum(DELIVERY_CHANNELS)).min(1),
  webhookUrl: z.string().url().optional(),
  slackWebhook: z.string().url().optional(),
  discordWebhook: z.string().url().optional(),
  cooldown: z.string().optional(),
});

const updateAlertSchema = z.object({
  thresholdValue: z.string().optional(),
  thresholdUnit: z.enum(['usd', 'native', 'percentage']).optional(),
  lookbackWindow: z.string().optional(),
  channels: z.array(z.enum(DELIVERY_CHANNELS)).optional(),
  webhookUrl: z.string().url().optional(),
  slackWebhook: z.string().url().optional(),
  discordWebhook: z.string().url().optional(),
  enabled: z.boolean().optional(),
  cooldown: z.string().optional(),
});

alerts.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const input = createAlertSchema.parse(body);

  const service = new AlertService(getDb());
  const alert = await service.create(user.id, input);
  return c.json({ success: true, data: alert }, 201);
});

alerts.get('/', async (c) => {
  const user = c.get('user');
  const service = new AlertService(getDb());
  const data = await service.list(user.id);
  return c.json({ success: true, data });
});

alerts.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) throw new AppError(400, 'INVALID_ID', 'Alert ID must be a number');

  const body = await c.req.json();
  const input = updateAlertSchema.parse(body);

  const service = new AlertService(getDb());
  const alert = await service.update(user.id, id, input);
  return c.json({ success: true, data: alert });
});

alerts.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) throw new AppError(400, 'INVALID_ID', 'Alert ID must be a number');

  const service = new AlertService(getDb());
  await service.delete(user.id, id);
  return c.json({ success: true, data: null });
});

// Send a test alert to verify delivery channels (max 5/min)
alerts.post('/:id/test', rateLimit({ max: 5, windowSec: 60, prefix: 'rl:alert-test' }), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) throw new AppError(400, 'INVALID_ID', 'Alert ID must be a number');

  const service = new AlertService(getDb());
  const alertList = await service.list(user.id);
  const alert = alertList.find((a) => a.id === id);
  if (!alert) throw new AppError(404, 'ALERT_NOT_FOUND', 'Alert not found');

  // Push a test alert to the delivery queue
  const queues = getQueues();
  await queues.alertDeliver.add('deliver', {
    alertConfigId: alert.id,
    alertType: alert.alertType,
    severity: 'info',
    title: `[TEST] ${alert.alertType} alert for ${alert.walletAddress.slice(0, 10)}...`,
    description: 'This is a test alert to verify your delivery channels are configured correctly.',
    triggerValue: alert.thresholdValue ? parseFloat(alert.thresholdValue) : null,
    triggerTxHash: null,
    agent: {
      name: null,
      wallet: alert.walletAddress,
      chain: alert.chain,
    },
    channels: alert.channels,
    webhookUrl: alert.webhookUrl,
    slackWebhook: alert.slackWebhook,
    discordWebhook: alert.discordWebhook,
    timestamp: new Date().toISOString(),
  });

  return c.json({ success: true, data: { message: 'Test alert queued for delivery' } });
});

alerts.get('/events', async (c) => {
  const user = c.get('user');
  const query = c.req.query();

  const service = new AlertService(getDb());
  const result = await service.getEvents(
    user.id,
    query.limit ? Number(query.limit) : undefined,
    query.offset ? Number(query.offset) : undefined,
  );

  return c.json({ success: true, ...result });
});

export { alerts };
