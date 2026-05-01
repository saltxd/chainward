import type { Discrepancy } from './types.js';

const MIGRATION_PLACEHOLDER = '2999-12-31';

export interface CompareInput {
  acp: {
    lastActiveAt: string | null;
    isOnline: boolean | null;
  };
  chain: {
    latest_transfer_at: string | null;
    active_today: boolean;
    active_7d: boolean;
  };
}

export interface CompareOutput {
  discrepancies: Discrepancy[];
  checks_performed: string[];
}

export function compareACPClaims(input: CompareInput): CompareOutput {
  const discrepancies: Discrepancy[] = [];
  const checks_performed: string[] = [];

  // Check: lastActiveAt
  checks_performed.push('lastActiveAt');
  if (input.acp.lastActiveAt && input.acp.lastActiveAt.startsWith(MIGRATION_PLACEHOLDER)) {
    discrepancies.push({
      field: 'lastActiveAt',
      acp_says: input.acp.lastActiveAt,
      chain_says: input.chain.latest_transfer_at ?? 'no on-chain activity',
      severity: 'info',
      reason: 'migration_artifact',
    });
  }

  // Check: isOnline
  checks_performed.push('isOnline');
  if (input.acp.isOnline === true && !input.chain.active_7d) {
    discrepancies.push({
      field: 'isOnline',
      acp_says: 'true',
      chain_says: 'no transfers in last 7 days',
      severity: 'warn',
    });
  }

  return { discrepancies, checks_performed };
}
