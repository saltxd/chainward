import type { Tier } from '@agentguard/common';

/** Hono context variable types for the API */
export interface AppVariables {
  user: {
    id: string;
    email: string;
    name: string;
    tier: Tier;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
}
