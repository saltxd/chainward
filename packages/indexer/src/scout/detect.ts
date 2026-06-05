import type { Database } from '@chainward/db';
import { sql } from 'drizzle-orm';
import type { AgentRow } from './scoring.js';

/** Pull candidate rows directly from acp_agent_data. Mirrors getEconomics() SQL shape
 * (observatoryService.ts) but WITHOUT its LIMIT 50 / successful_job_count>0 filter, which
 * would bias away from the zero-revenue outliers we hunt. Lean single query (shared pool max=10). */
export async function fetchCandidates(db: Database): Promise<AgentRow[]> {
  const rows = await db.execute(sql`
    SELECT
      acp_id                                         AS "acpId",
      name,
      wallet_address                                 AS "walletAddress",
      twitter_handle                                 AS "twitterHandle",
      CAST(gross_agentic_amount AS double precision) AS "grossAgenticAmount",
      CAST(revenue AS double precision)              AS "revenue",
      unique_buyer_count                             AS "uniqueBuyerCount",
      transaction_count                              AS "transactionCount",
      wallet_balance                                 AS "walletBalance",
      successful_job_count                           AS "successfulJobCount",
      last_active_at                                 AS "lastActiveAt"
    FROM acp_agent_data
    WHERE gross_agentic_amount IS NOT NULL
      AND CAST(gross_agentic_amount AS double precision) >= 5000
    ORDER BY gross_agentic_amount DESC
  `);
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    acpId: Number(r.acpId),
    name: (r.name as string) ?? '(unnamed)',
    walletAddress: r.walletAddress as string,
    twitterHandle: (r.twitterHandle as string) ?? null,
    grossAgenticAmount: r.grossAgenticAmount === null ? null : Number(r.grossAgenticAmount),
    revenue: r.revenue === null ? null : Number(r.revenue),
    uniqueBuyerCount: r.uniqueBuyerCount === null ? null : Number(r.uniqueBuyerCount),
    transactionCount: r.transactionCount === null ? null : Number(r.transactionCount),
    walletBalance: (r.walletBalance as string) ?? null,
    successfulJobCount: r.successfulJobCount === null ? null : Number(r.successfulJobCount),
    lastActiveAt: r.lastActiveAt ? new Date(r.lastActiveAt as string).toISOString() : null,
  }));
}

export const MALFUNCTION = {
  emptyRows: (n: number) => n === 0,
  allNullAgdp: (rows: AgentRow[]) => rows.length > 0 && rows.every((r) => r.grossAgenticAmount === null),
  noDecodedNames: (decoded: Set<string>) => decoded.size === 0,
};
