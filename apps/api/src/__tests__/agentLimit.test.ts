import { describe, expect, it } from 'vitest';
import { TIER_LIMITS } from '@chainward/common';
import type { Database } from '@chainward/db';
import { AgentService } from '../services/agentService.js';

// There is no paid plan to upgrade to. A free account at its limit is told the
// real number and who to email, not "Upgrade to add more".

const WALLET = '0x42A09A72eC47647FE9BE1f450Ab8F835D0FF556a';

/** Just enough of drizzle for create() to reach the limit check. */
function dbWithAgentCount(total: number): Database {
  return {
    select: () => ({ from: () => ({ where: async () => [{ total }] }) }),
  } as unknown as Database;
}

describe('AgentService.create at the wallet limit', () => {
  it('tells a free account the real limit and to email for more', async () => {
    const limit = TIER_LIMITS.free.agentLimit;
    const service = new AgentService(dbWithAgentCount(limit));

    await expect(
      service.create('u1', 'free', { chain: 'base', walletAddress: WALLET }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'AGENT_LIMIT_REACHED',
      message: `Free accounts watch up to ${limit} wallets. Need more? Email hello@chainward.ai.`,
    });
  });

  it('names the plan and its limit for other tiers, without an upgrade pitch', async () => {
    const limit = TIER_LIMITS.starter.agentLimit;
    const service = new AgentService(dbWithAgentCount(limit));

    await expect(
      service.create('u1', 'starter', { chain: 'base', walletAddress: WALLET }),
    ).rejects.toMatchObject({
      message: `The starter plan watches up to ${limit} wallets. Need more? Email hello@chainward.ai.`,
    });
  });
});
