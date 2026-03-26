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

const webhookPayloadSchema = z.object({
  webhookId: z.string(),
  id: z.string(),
  createdAt: z.string(),
  type: z.string(),
  event: z.object({
    network: z.string(),
    activity: z.array(activitySchema),
  }),
});

const ALCHEMY_NOTIFY_API = 'https://dashboard.alchemy.com/api';

interface AlchemyWebhookPayload {
  webhookId: string;
  id: string;
  createdAt: string;
  type: string;
  event: {
    network: string;
    activity: Array<{
      fromAddress: string;
      toAddress: string;
      blockNum: string;
      hash: string;
      value: number;
      asset: string;
      category: string;
      rawContract?: {
        rawValue: string;
        address: string;
        decimals: number;
      };
    }>;
  };
}

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
      logger.warn({ errors: parsed.error.flatten().fieldErrors }, 'Rejected malformed Alchemy webhook payload');
      return [];
    }
    const body = parsed.data;
    const activities = body.event.activity;
    if (activities.length === 0) return [];

    return activities.map((a) => ({
      txHash: a.hash,
      blockNumber: parseInt(a.blockNum, 16),
      fromAddress: a.fromAddress,
      toAddress: a.toAddress,
      value: a.value,
      asset: a.asset,
      category: a.category,
      rawContract: a.rawContract,
      network: body.event.network,
    }));
  }
}
