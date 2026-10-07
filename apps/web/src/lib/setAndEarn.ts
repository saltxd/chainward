/**
 * The Set and Earn board as the web app shows it (GET /api/set-and-earn/board,
 * built daily by packages/indexer/src/workers/setAndEarnBoard.ts). The API is
 * the authority on the document; this is presentation only.
 */

const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const CAMPAIGN_END = Date.parse('2026-11-05T23:59:59Z');

export type VerdictStatus = 'checked' | 'fewer_than_3_hirers' | 'error' | 'pending';

export interface SetAndEarnRow {
  agent_id: number;
  name: string | null;
  /** null when the registry could not be read for this agent. */
  owner: string | null;
  marketplace: string | null;
  registered_at: string | null;
  registered_during_campaign: boolean;
  ours?: boolean;
  hires_total: number;
  completed: number | null;
  distinct_hirers: number;
  by_source: { termix_escrow: number; erc8183_shared: number };
  verdict_status: VerdictStatus;
  owner_linked: number | null;
  independent_within_limits: number | null;
  inconclusive: number | null;
  passes_three_independent: boolean | null;
  checked_at: string | null;
}

export interface SetAndEarnBoard {
  generated_at: string;
  as_of: { block: number; time: string };
  window: { from_block: number; start: string; end: string };
  totals: {
    agents_registered: number;
    agents_on_campaign_marketplaces: number;
    agents_with_hires: number;
    agents_hired: number;
    hires: { total: number; by_source: { termix_escrow: number; erc8183_shared: number } };
    agents_with_3_distinct_hirers: number;
    agents_passing: number;
  };
  rows: SetAndEarnRow[];
  method: string;
  limits: string[];
}

const MARKETPLACES: Record<string, string> = {
  termix: 'TermiX',
  agent_souk: 'Agent Souk',
  dolphin: 'Dolphin',
  hellofugu: 'HelloFugu',
  kattegat: 'KATTEGAT',
  marque: 'Marque Trade',
  pokter: 'Pokter',
  agent_atlas: 'Agent Atlas',
  mandate: 'Mandate',
  none: 'no card',
};

export function marketplaceLabel(marketplace: string | null): string {
  if (marketplace === null) return '—';
  return MARKETPLACES[marketplace] ?? marketplace;
}

/** "Oct 3": a date in UTC, short. */
export const utcDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "new · Oct 3" for an agent registered during the campaign, "registered Sep 12" for an older one, null when unknown. */
export function registeredLabel(row: SetAndEarnRow): string | null {
  if (!row.registered_at) return null;
  return row.registered_during_campaign ? `new · ${utcDay(row.registered_at)}` : `registered ${utcDay(row.registered_at)}`;
}

export function verdictLabel(row: SetAndEarnRow): { text: string; tone: 'pass' | 'fail' | 'none' } {
  if (row.ours) return { text: 'ours, not counted', tone: 'none' };
  switch (row.verdict_status) {
    case 'checked':
      return row.passes_three_independent ? { text: 'pass', tone: 'pass' } : { text: 'fail', tone: 'fail' };
    case 'fewer_than_3_hirers':
      return { text: 'not enough hires', tone: 'none' };
    case 'pending':
      return { text: 'check pending', tone: 'none' };
    default:
      return { text: 'check did not finish', tone: 'none' };
  }
}

/** The agent's ERC-8004 token on BscScan. */
export function agentUrl(agentId: number): string {
  return `https://bscscan.com/nft/${IDENTITY_REGISTRY}/${agentId}`;
}

/** The paid hire check (0.10 USDC over x402) for one agent, or the `<id>` template. */
export function hireCheckCurl(agentId?: number): string {
  return `curl -i "https://api.chainward.ai/api/risk/hires?agent=${agentId ?? '<id>'}&chain=bsc"`;
}

export function campaignClosed(now: Date): boolean {
  return now.getTime() > CAMPAIGN_END;
}
