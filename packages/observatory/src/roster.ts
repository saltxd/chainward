/**
 * Which observatory wallets the public pages count and list.
 *
 * agent_registry holds thousands of ERC-8004 registrations that have no name and
 * never move money. Counting them made the observatory claim ~3,400 agents when
 * about 500 have a name and ~20 move money on a typical day. A wallet is shown
 * when it has a real name, or when it moved money in the last 30 days.
 */

export interface RosterRow {
  wallet_address: string;
  registry_source: string | null;
  named: boolean;
  active_30d: boolean;
}

export interface RosterSummary {
  /** Shown wallets, deduped, in registry order. */
  wallets: string[];
  /** Shown wallets with a real name. */
  named: number;
  /** Shown wallets by where they came from. */
  bySource: { virtuals: number; erc8004: number; other: number };
}

/** Unnamed rows carry a placeholder `agent-<8 hex>` slug. */
export const PLACEHOLDER_SLUG_RE = /^agent-[0-9a-f]{8}$/;

export function isShownAgent(row: Pick<RosterRow, 'named' | 'active_30d'>): boolean {
  return row.named || row.active_30d;
}

export function summarizeRoster(rows: RosterRow[]): RosterSummary {
  const seen = new Set<string>();
  const summary: RosterSummary = { wallets: [], named: 0, bySource: { virtuals: 0, erc8004: 0, other: 0 } };

  for (const row of rows) {
    if (!isShownAgent(row) || seen.has(row.wallet_address)) continue;
    seen.add(row.wallet_address);
    summary.wallets.push(row.wallet_address);
    if (row.named) summary.named++;
    if (row.registry_source === 'virtuals') summary.bySource.virtuals++;
    else if (row.registry_source === 'erc8004') summary.bySource.erc8004++;
    else summary.bySource.other++;
  }

  return summary;
}
