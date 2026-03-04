import type { Tier } from '@chainward/common';

/** Hono context variable types for the API */
export interface AppVariables {
  user: {
    id: string;
    walletAddress: string;
    displayName: string | null;
    tier: Tier;
  };
}
