import { getEnv } from '../config.js';
import { logger } from './logger.js';

const ALCHEMY_NOTIFY_API = 'https://dashboard.alchemy.com/api';

/**
 * Manage Alchemy Address Activity webhook addresses.
 * Uses a single webhook and adds/removes addresses via the Alchemy Notify API.
 */
export class AlchemyWebhookManager {
  private apiKey: string;
  private webhookId: string | null = null;

  constructor() {
    this.apiKey = getEnv().ALCHEMY_API_KEY;
  }

  /** Add an address to the Alchemy webhook */
  async addAddress(address: string): Promise<void> {
    try {
      const webhookId = await this.getOrCreateWebhookId();
      const response = await fetch(`${ALCHEMY_NOTIFY_API}/update-webhook-addresses`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Alchemy-Token': this.apiKey,
        },
        body: JSON.stringify({
          webhook_id: webhookId,
          addresses_to_add: [address],
          addresses_to_remove: [],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error({ status: response.status, body: text }, 'Failed to add address to webhook');
      }
    } catch (err) {
      logger.error({ err, address }, 'Error adding address to Alchemy webhook');
    }
  }

  /** Remove an address from the Alchemy webhook */
  async removeAddress(address: string): Promise<void> {
    try {
      const webhookId = await this.getOrCreateWebhookId();
      const response = await fetch(`${ALCHEMY_NOTIFY_API}/update-webhook-addresses`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Alchemy-Token': this.apiKey,
        },
        body: JSON.stringify({
          webhook_id: webhookId,
          addresses_to_add: [],
          addresses_to_remove: [address],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error({ status: response.status, body: text }, 'Failed to remove address from webhook');
      }
    } catch (err) {
      logger.error({ err, address }, 'Error removing address from Alchemy webhook');
    }
  }

  private async getOrCreateWebhookId(): Promise<string> {
    if (this.webhookId) return this.webhookId;

    // List existing webhooks to find ours
    const response = await fetch(`${ALCHEMY_NOTIFY_API}/team-webhooks`, {
      headers: { 'X-Alchemy-Token': this.apiKey },
    });

    if (response.ok) {
      const data = (await response.json()) as { data: Array<{ id: string; type: string }> };
      const existing = data.data?.find(
        (w: { type: string }) => w.type === 'ADDRESS_ACTIVITY',
      );
      if (existing) {
        this.webhookId = existing.id;
        return this.webhookId;
      }
    }

    // Would create webhook via API - for now, expect manual setup
    logger.warn('No Alchemy ADDRESS_ACTIVITY webhook found. Create one manually in the Alchemy dashboard.');
    this.webhookId = 'manual-setup-required';
    return this.webhookId;
  }
}
