import { eq, and, count } from 'drizzle-orm';
import { agentRegistry } from '@chainward/db';
import { validateAddress } from '@chainward/common';
import { TIER_LIMITS } from '@chainward/common';
import type { CreateAgentInput, UpdateAgentInput } from '@chainward/common';
import type { Tier } from '@chainward/common';
import type { Database } from '@chainward/db';
import { AppError } from '../middleware/errorHandler.js';

export class AgentService {
  constructor(private db: Database) {}

  async create(userId: string, tier: Tier, input: CreateAgentInput) {
    // Validate address
    const { valid, normalized } = validateAddress(input.chain, input.walletAddress);
    if (!valid || !normalized) {
      throw new AppError(400, 'INVALID_ADDRESS', `Invalid ${input.chain} address`);
    }

    // Check tier agent limit
    const limits = TIER_LIMITS[tier];
    if (limits.agentLimit !== -1) {
      const [result] = await this.db
        .select({ total: count() })
        .from(agentRegistry)
        .where(eq(agentRegistry.userId, userId));
      if (result && result.total >= limits.agentLimit) {
        throw new AppError(
          403,
          'AGENT_LIMIT_REACHED',
          `Your ${tier} plan allows ${limits.agentLimit} agents. Upgrade to add more.`,
        );
      }
    }

    // Check for duplicate
    const existing = await this.db
      .select({ id: agentRegistry.id })
      .from(agentRegistry)
      .where(
        and(
          eq(agentRegistry.chain, input.chain),
          eq(agentRegistry.walletAddress, normalized),
          eq(agentRegistry.userId, userId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(409, 'AGENT_EXISTS', 'This wallet is already registered');
    }

    const [agent] = await this.db
      .insert(agentRegistry)
      .values({
        chain: input.chain,
        walletAddress: normalized,
        agentName: input.agentName ?? null,
        agentFramework: input.agentFramework ?? null,
        tags: input.tags ?? [],
        userId,
      })
      .returning();

    return agent;
  }

  async list(userId: string) {
    return this.db
      .select()
      .from(agentRegistry)
      .where(eq(agentRegistry.userId, userId))
      .orderBy(agentRegistry.createdAt);
  }

  async getById(userId: string, id: number) {
    const [agent] = await this.db
      .select()
      .from(agentRegistry)
      .where(and(eq(agentRegistry.id, id), eq(agentRegistry.userId, userId)))
      .limit(1);

    if (!agent) {
      throw new AppError(404, 'AGENT_NOT_FOUND', 'Agent not found');
    }

    return agent;
  }

  async update(userId: string, id: number, input: UpdateAgentInput) {
    // Verify ownership
    await this.getById(userId, id);

    const [updated] = await this.db
      .update(agentRegistry)
      .set({
        ...(input.agentName !== undefined && { agentName: input.agentName }),
        ...(input.agentFramework !== undefined && { agentFramework: input.agentFramework }),
        ...(input.tags !== undefined && { tags: input.tags }),
        ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
        updatedAt: new Date(),
      })
      .where(and(eq(agentRegistry.id, id), eq(agentRegistry.userId, userId)))
      .returning();

    return updated;
  }

  async delete(userId: string, id: number) {
    // Verify ownership
    await this.getById(userId, id);

    await this.db
      .delete(agentRegistry)
      .where(and(eq(agentRegistry.id, id), eq(agentRegistry.userId, userId)));
  }
}
