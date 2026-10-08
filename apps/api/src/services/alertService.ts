import { eq, and, desc, count, inArray } from 'drizzle-orm';
import { alertConfigs, alertEvents, agentRegistry } from '@chainward/db';
import type { Database } from '@chainward/db';
import { validateAddress } from '@chainward/common';
import { AppError } from '../middleware/errorHandler.js';

/** Per-user cap; each config is an outbound delivery target we fire on their behalf. */
const MAX_ALERT_CONFIGS_PER_USER = 25;

interface CreateAlertInput {
  walletAddress: string;
  chain: string;
  alertType: string;
  thresholdValue?: string;
  thresholdUnit?: string;
  lookbackWindow?: string;
  channels: string[];
  webhookUrl?: string;
  telegramChatId?: string;
  discordWebhook?: string;
  cooldown?: string;
}

interface UpdateAlertInput {
  thresholdValue?: string;
  thresholdUnit?: string;
  lookbackWindow?: string;
  channels?: string[];
  webhookUrl?: string;
  telegramChatId?: string;
  discordWebhook?: string;
  enabled?: boolean;
  cooldown?: string;
}

/**
 * The address as agentService stores it (checksummed on base), so an alert
 * matches the registered agent however the caller spelled the wallet.
 */
export function normalizeAlertWallet(chain: string, walletAddress: string): string {
  if (chain !== 'base' && chain !== 'solana') throw new AppError(400, 'INVALID_CHAIN', 'chain must be base or solana');
  const { valid, normalized } = validateAddress(chain, walletAddress);
  if (!valid || !normalized) throw new AppError(400, 'INVALID_ADDRESS', `Invalid ${chain} wallet address`);
  return normalized;
}

export class AlertService {
  constructor(private db: Database) {}

  async create(userId: string, input: CreateAlertInput) {
    const walletAddress = normalizeAlertWallet(input.chain, input.walletAddress);
    // Verify user owns an agent with this wallet
    const [agent] = await this.db
      .select({ id: agentRegistry.id })
      .from(agentRegistry)
      .where(
        and(
          eq(agentRegistry.userId, userId),
          eq(agentRegistry.walletAddress, walletAddress),
        ),
      )
      .limit(1);

    if (!agent) {
      throw new AppError(403, 'FORBIDDEN', 'You can only create alerts for wallets you have registered as agents');
    }

    const [existing] = await this.db
      .select({ total: count() })
      .from(alertConfigs)
      .where(eq(alertConfigs.userId, userId));
    if ((existing?.total ?? 0) >= MAX_ALERT_CONFIGS_PER_USER) {
      throw new AppError(409, 'ALERT_LIMIT', `Alert limit reached (${MAX_ALERT_CONFIGS_PER_USER}). Delete one first.`);
    }

    const [alert] = await this.db
      .insert(alertConfigs)
      .values({
        userId,
        walletAddress,
        chain: input.chain,
        alertType: input.alertType,
        thresholdValue: input.thresholdValue ?? null,
        thresholdUnit: input.thresholdUnit ?? null,
        lookbackWindow: input.lookbackWindow ?? null,
        channels: input.channels,
        webhookUrl: input.webhookUrl ?? null,
        telegramChatId: input.telegramChatId ?? null,
        discordWebhook: input.discordWebhook ?? null,
        cooldown: input.cooldown ?? '5 minutes',
      })
      .returning();

    return alert;
  }

  async list(userId: string) {
    return this.db
      .select()
      .from(alertConfigs)
      .where(eq(alertConfigs.userId, userId))
      .orderBy(desc(alertConfigs.createdAt));
  }

  async update(userId: string, id: number, input: UpdateAlertInput) {
    const [existing] = await this.db
      .select()
      .from(alertConfigs)
      .where(and(eq(alertConfigs.id, id), eq(alertConfigs.userId, userId)))
      .limit(1);

    if (!existing) throw new AppError(404, 'ALERT_NOT_FOUND', 'Alert not found');

    const [updated] = await this.db
      .update(alertConfigs)
      .set({
        ...(input.thresholdValue !== undefined && { thresholdValue: input.thresholdValue }),
        ...(input.thresholdUnit !== undefined && { thresholdUnit: input.thresholdUnit }),
        ...(input.lookbackWindow !== undefined && { lookbackWindow: input.lookbackWindow }),
        ...(input.channels !== undefined && { channels: input.channels }),
        ...(input.webhookUrl !== undefined && { webhookUrl: input.webhookUrl }),
        ...(input.telegramChatId !== undefined && { telegramChatId: input.telegramChatId }),
        ...(input.discordWebhook !== undefined && { discordWebhook: input.discordWebhook }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        ...(input.cooldown !== undefined && { cooldown: input.cooldown }),
        updatedAt: new Date(),
      })
      .where(and(eq(alertConfigs.id, id), eq(alertConfigs.userId, userId)))
      .returning();

    return updated;
  }

  async delete(userId: string, id: number) {
    const [existing] = await this.db
      .select({ id: alertConfigs.id })
      .from(alertConfigs)
      .where(and(eq(alertConfigs.id, id), eq(alertConfigs.userId, userId)))
      .limit(1);

    if (!existing) throw new AppError(404, 'ALERT_NOT_FOUND', 'Alert not found');

    await this.db
      .delete(alertConfigs)
      .where(and(eq(alertConfigs.id, id), eq(alertConfigs.userId, userId)));
  }

  async getEvents(userId: string, limit = 50, offset = 0) {
    // Get user's alert config IDs
    const configs = await this.db
      .select({ id: alertConfigs.id })
      .from(alertConfigs)
      .where(eq(alertConfigs.userId, userId));

    const configIds = configs.map((c) => c.id);
    if (configIds.length === 0) {
      return { data: [], pagination: { total: 0, limit, offset, hasMore: false } };
    }

    const events = await this.db
      .select()
      .from(alertEvents)
      .where(inArray(alertEvents.alertConfigId, configIds))
      .orderBy(desc(alertEvents.timestamp))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await this.db
      .select({ total: count() })
      .from(alertEvents)
      .where(inArray(alertEvents.alertConfigId, configIds));

    const total = totalResult?.total ?? 0;

    return {
      data: events,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    };
  }
}
