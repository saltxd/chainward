import { getEnv } from '../config.js';
import { logger } from './logger.js';

const ALCHEMY_NOTIFY_API = 'https://dashboard.alchemy.com/api';

/**
 * Manage Alchemy Address Activity webhook addresses.
 * Adds/removes addresses via the Alchemy Notify API when agents are registered/deleted.
 */
class AlchemyWebhookManager {
  private authToken: string | undefined;
  private webhookId: string | undefined;

  init() {
    const env = getEnv();
    this.authToken = env.ALCHEMY_AUTH_TOKEN;
    this.webhookId = env.ALCHEMY_WEBHOOK_ID;
  }

  private isConfigured(): boolean {
    if (!this.authToken || !this.webhookId) {
      return false;
    }
    return true;
  }

  /** Add an address to the Alchemy webhook */
  async addAddress(address: string): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn('Alchemy webhook not configured (missing ALCHEMY_AUTH_TOKEN or ALCHEMY_WEBHOOK_ID), skipping addAddress');
      return;
    }

    try {
      const response = await fetch(`${ALCHEMY_NOTIFY_API}/update-webhook-addresses`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Alchemy-Token': this.authToken!,
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

  /** Remove an address from the Alchemy webhook */
  async removeAddress(address: string): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn('Alchemy webhook not configured, skipping removeAddress');
      return;
    }

    try {
      const response = await fetch(`${ALCHEMY_NOTIFY_API}/update-webhook-addresses`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Alchemy-Token': this.authToken!,
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
}

export const webhookManager = new AlchemyWebhookManager();
