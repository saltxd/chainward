import type { IAgentRuntime } from '@elizaos/core';
import { z } from 'zod';
import { ChainWard } from '@chainward/sdk';

const configSchema = z.object({
  CHAINWARD_API_KEY: z.string().startsWith('ag_', 'API key must start with ag_'),
  CHAINWARD_BASE_URL: z.string().url().optional(),
  CHAINWARD_AGENT_WALLET: z.string().optional(),
  CHAINWARD_AGENT_NAME: z.string().optional(),
});

export type ChainWardConfig = z.infer<typeof configSchema>;

export function validateConfig(runtime: IAgentRuntime): ChainWardConfig {
  return configSchema.parse({
    CHAINWARD_API_KEY: runtime.getSetting('CHAINWARD_API_KEY'),
    CHAINWARD_BASE_URL: runtime.getSetting('CHAINWARD_BASE_URL') || undefined,
    CHAINWARD_AGENT_WALLET: runtime.getSetting('CHAINWARD_AGENT_WALLET') || undefined,
    CHAINWARD_AGENT_NAME: runtime.getSetting('CHAINWARD_AGENT_NAME') || undefined,
  });
}

export function createClient(runtime: IAgentRuntime): ChainWard {
  const config = validateConfig(runtime);
  return new ChainWard({
    apiKey: config.CHAINWARD_API_KEY,
    baseUrl: config.CHAINWARD_BASE_URL,
  });
}
