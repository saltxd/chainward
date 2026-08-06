import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { WebhookProvider, NormalizedActivity } from '@chainward/common';
import { logger } from '../../lib/logger.js';

const activitySchema = z.object({
  fromAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/i),
  toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/i),
  blockNum: z.string().regex(/^0x[a-fA-F0-9]+$/),
  hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/i),
  value: z.number(),
  asset: z.string(),
  category: z.string(),
  rawContract: z.object({
    rawValue: z.string(),
    address: z.string(),
    decimals: z.number(),
  }).optional(),
});

// Envelope is validated separately from activities so one malformed activity
// can't discard the rest of the batch.
const webhookPayloadSchema = z.object({
  webhookId: z.string(),
  id: z.string(),
  createdAt: z.string(),
  type: z.string(),
  event: z.object({
    network: z.string().optional(),
    activity: z.array(z.unknown()),
  }),
});

const ALCHEMY_NOTIFY_API = 'https://dashboard.alchemy.com/api';

export class AlchemyWebhookProvider implements WebhookProvider {
  private authToken: string | undefined;
  private webhookId: string | undefined;
  private signingKey: string = '';

  init(): void {
    this.authToken = process.env.ALCHEMY_AUTH_TOKEN;
    this.webhookId = process.env.ALCHEMY_WEBHOOK_ID;
    this.signingKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY ?? '';
  }

  async addAddress(address: string): Promise<void> {
    if (!this.authToken || !this.webhookId) {
      logger.warn('Alchemy webhook not configured (missing ALCHEMY_AUTH_TOKEN or ALCHEMY_WEBHOOK_ID), skipping addAddress');
      return;
    }

    try {
      const response = await fetch(`${ALCHEMY_NOTIFY_API}/update-webhook-addresses`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Alchemy-Token': this.authToken,
        },
        body: JSON.stringify({
          webhook_id: this.webhookId,
          addresses_to_add: [address.toLowerCase()],
          addresses_to_remove: [],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error({ status: response.status, body: text, address }, 'Failed to add address to Alchemy webhook');
      } else {
        logger.info({ address }, 'Added address to Alchemy webhook');
      }
    } catch (err) {
      logger.error({ err, address }, 'Error adding address to Alchemy webhook');
    }
  }

  async removeAddress(address: string): Promise<void> {
    if (!this.authToken || !this.webhookId) {
      logger.warn('Alchemy webhook not configured, skipping removeAddress');
      return;
    }

    try {
      const response = await fetch(`${ALCHEMY_NOTIFY_API}/update-webhook-addresses`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Alchemy-Token': this.authToken,
        },
        body: JSON.stringify({
          webhook_id: this.webhookId,
          addresses_to_add: [],
          addresses_to_remove: [address.toLowerCase()],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error({ status: response.status, body: text, address }, 'Failed to remove address from Alchemy webhook');
      } else {
        logger.info({ address }, 'Removed address from Alchemy webhook');
      }
    } catch (err) {
      logger.error({ err, address }, 'Error removing address from Alchemy webhook');
    }
  }

  verifySignature(rawBody: string, signature: string): boolean {
    if (!this.signingKey) return false;

    const expectedSignature = createHmac('sha256', this.signingKey).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedSignature, 'hex');

    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  }

  parsePayload(rawBody: string): NormalizedActivity[] {
    const raw = JSON.parse(rawBody);
    const parsed = webhookPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, 'Rejected malformed Alchemy webhook envelope');
      return [];
    }
    const body = parsed.data;
    const network = body.event.network ?? 'BASE_MAINNET';

    const normalized: NormalizedActivity[] = [];
    let skipped = 0;
    for (const rawActivity of body.event.activity) {
      const activity = activitySchema.safeParse(rawActivity);
      if (!activity.success) {
        skipped++;
        logger.warn(
          { issues: activity.error.issues, activity: rawActivity, webhookEventId: body.id },
          'Skipped malformed activity in Alchemy webhook batch',
        );
        continue;
      }
      const a = activity.data;
      normalized.push({
        txHash: a.hash,
        blockNumber: parseInt(a.blockNum, 16),
        fromAddress: a.fromAddress,
        toAddress: a.toAddress,
        value: a.value,
        asset: a.asset,
        category: a.category,
        rawContract: a.rawContract,
        network,
      });
    }

    if (skipped > 0) {
      logger.warn(
        { skipped, kept: normalized.length, webhookEventId: body.id },
        'Alchemy webhook batch contained malformed activities',
      );
    }
    return normalized;
  }
}
