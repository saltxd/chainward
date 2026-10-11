// The /base observatory: API shapes it reads and the plain-language numbers it
// leads with. Pure helpers only; the server fetch lives in observatoryServer.ts.

import { reportPath } from './risk';
import { isAddress, isAgentSlug } from './params';
import { parseChainParam } from './chains';

export interface ObservatoryOverview {
  /** Shown wallets: named, or moved money in the last 30 days. */
  agentsTracked: number;
  /** Absent from APIs built before the roster fix. */
  namedAgents?: number;
  agentsBySource?: { virtuals: number; erc8004: number; other: number };
  transactions24h: number;
  transactions7d: number;
  activeAgents24h: number;
  activeAgents7d: number;
  activeAgents30d?: number;
  updatedAt: string;
}

export interface ObservatoryFeedItem {
  timestamp: string;
  agentName: string;
  slug?: string | null;
  walletAddress: string;
  direction: string;
  tokenSymbol: string | null;
  amountUsd: number | null;
  txHash: string;
}

export interface MostActiveEntry {
  walletAddress: string;
  agentName: string;
  agentFramework: string | null;
  slug: string;
  txCount?: number;
  rank: number;
}

export interface TrendPoint {
  date: string;
  count?: number;
}

export interface ObservatoryTrends {
  dailyTxCount: TrendPoint[];
  dailyActiveAgents: TrendPoint[];
}

/** One seller from the weekly x402 board, trimmed to what /base shows. */
export interface X402SellerRow {
  seller: string;
  label: string | null;
  volumeUsd: number;
  buyers: number;
  verdict: string | null;
}

export interface X402Top {
  generatedAt: string;
  rows: X402SellerRow[];
}

/** The subset of GET /api/x402/board that /base reads. */
export interface X402BoardLike {
  generated_at: string;
  rows: Array<{
    seller: string;
    label: string | null;
    x402scan_7d: { volume_usd: number; buyers: number };
    report: { verdict?: { text: string } } | null;
  }>;
}

export interface ObservatoryInitial {
  overview: ObservatoryOverview | null;
  mostActive: MostActiveEntry[] | null;
  feed: ObservatoryFeedItem[] | null;
  trends: ObservatoryTrends | null;
  x402: X402Top | null;
}

/** "about 490", "about 20": exact below 20, then to the nearest 5, 10 or 100. */
export function roundAbout(n: number): number {
  if (n < 20) return n;
  if (n < 100) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 10) * 10;
  return Math.round(n / 100) * 100;
}

/** Median agents active per day over the trailing window. The newest bucket is
 * today and still filling, so it is left out. */
export function typicalDailyActive(trends: ObservatoryTrends | null): number | null {
  const days = (trends?.dailyActiveAgents ?? []).slice(0, -1).map((d) => d.count ?? 0);
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

const FALLBACK_LEDE =
  'We watch named agent wallets on Base, mostly Virtuals, plus ERC-8004 registrations, and show which of them move money.';

function mostlyVirtuals(overview: ObservatoryOverview, named: number): string {
  const virtuals = overview.agentsBySource?.virtuals ?? 0;
  return virtuals * 2 > named ? ', mostly Virtuals,' : '';
}

const n = (v: number) => v.toLocaleString('en-US');

/** The hero sentence, from real counts. */
export function observatoryLede(
  overview: ObservatoryOverview | null,
  trends: ObservatoryTrends | null,
): string {
  const named = overview?.namedAgents;
  if (!overview || named == null || named === 0) return FALLBACK_LEDE;

  const daily = typicalDailyActive(trends) ?? overview.activeAgents24h;
  const who = `We watch about ${n(roundAbout(named))} named agent wallets on Base${mostlyVirtuals(overview, named)} plus ERC-8004 registrations.`;
  const day =
    daily === 0
      ? 'On a typical day none of them move money.'
      : `On a typical day about ${n(roundAbout(daily))} of them move money.`;
  return `${who} ${day}`;
}

/** Search and link-preview description, from real counts; null without them. */
export function observatoryDescription(overview: ObservatoryOverview | null): string | null {
  const named = overview?.namedAgents;
  if (!overview || named == null || named === 0) return null;
  return (
    `About ${n(roundAbout(named))} named AI agent wallets on Base${mostlyVirtuals(overview, named)} plus ERC-8004 registrations. ` +
    `${n(overview.activeAgents7d)} moved money in the last 7 days, ${n(overview.activeAgents24h)} in the last 24 hours.`
  );
}

export function topX402Sellers(board: X402BoardLike | null, n = 5): X402Top | null {
  if (!board || !Array.isArray(board.rows) || board.rows.length === 0) return null;
  return {
    generatedAt: board.generated_at,
    rows: board.rows.slice(0, n).map((r) => ({
      seller: r.seller,
      label: r.label,
      volumeUsd: r.x402scan_7d.volume_usd,
      buyers: r.x402scan_7d.buyers,
      verdict: r.report?.verdict?.text ?? null,
    })),
  };
}

/** A wire row opens the agent's /base page when it has one, else its report. */
export function feedHref(item: Pick<ObservatoryFeedItem, 'slug' | 'walletAddress'>): string {
  if (item.slug && isAgentSlug(item.slug) && !/^agent-[0-9a-f]{8}$/.test(item.slug)) {
    return `/base/${item.slug}`;
  }
  return reportPath(item.walletAddress);
}

export type AgentFetchOutcome<T> =
  | { kind: 'agent'; agent: T }
  | { kind: 'moved'; slug: string }
  | { kind: 'missing' };

/** GET /api/observatory/agent/:slug answers 200 with the agent, or 301 with
 * `movedTo` for an old slug, or 404. */
export function agentFetchOutcome<T>(status: number, body: unknown): AgentFetchOutcome<T> {
  const b = (body ?? {}) as { success?: boolean; data?: T; movedTo?: unknown };
  if (status === 301 || status === 308) {
    return typeof b.movedTo === 'string' && isAgentSlug(b.movedTo)
      ? { kind: 'moved', slug: b.movedTo }
      : { kind: 'missing' };
  }
  if (status === 200 && b.success && b.data) return { kind: 'agent', agent: b.data };
  return { kind: 'missing' };
}

/** /agent/<wallet> is retired: where it now goes, or null for a 404. */
export function legacyAgentRedirect(
  wallet: string,
  chain: string | string[] | undefined,
): string | null {
  const parsed = parseChainParam(chain);
  if (!isAddress(wallet) || !parsed) return null;
  return reportPath(wallet, parsed);
}

export interface SitemapAgent {
  slug: string;
  lastActiveAt?: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Agent pages worth indexing: moved money in the last 30 days. */
export function activeSitemapAgents(agents: SitemapAgent[], now: Date): Array<{ slug: string; lastActiveAt: Date }> {
  return agents.flatMap((a) => {
    if (!a.lastActiveAt || !isAgentSlug(a.slug)) return [];
    const at = new Date(a.lastActiveAt);
    if (Number.isNaN(at.getTime()) || now.getTime() - at.getTime() > THIRTY_DAYS_MS) return [];
    return [{ slug: a.slug, lastActiveAt: at }];
  });
}
