// Server-side reads for /base, so the page's HTML carries the numbers (crawlers
// and link previews never run the client fetch). Each read is cached and time
// boxed; a slow or failed one renders as an empty panel, never a broken page.

import {
  topX402Sellers,
  type MostActiveEntry,
  type ObservatoryFeedItem,
  type ObservatoryInitial,
  type ObservatoryOverview,
  type ObservatoryTrends,
  type X402BoardLike,
} from './observatory';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';
const TIMEOUT_MS = 4_000;

async function apiData<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}${path}`, {
      next: { revalidate },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

/** The /base summary on its own (generateMetadata uses it; Next dedupes the fetch). */
export function getObservatoryOverview(): Promise<ObservatoryOverview | null> {
  return apiData<ObservatoryOverview>('/api/observatory', 300);
}

export async function getObservatoryInitial(): Promise<ObservatoryInitial> {
  const [overview, leaderboard, feed, trends, board] = await Promise.all([
    getObservatoryOverview(),
    apiData<{ mostActive?: MostActiveEntry[] }>('/api/observatory/leaderboard', 300),
    apiData<ObservatoryFeedItem[]>('/api/observatory/feed', 60),
    apiData<ObservatoryTrends>('/api/observatory/trends', 300),
    // Same URL and cache window as the /x402 page, so they share one cached read.
    apiData<X402BoardLike>('/api/x402/board', 1800),
  ]);

  return {
    overview,
    mostActive: leaderboard?.mostActive ?? null,
    feed,
    // Only the series the page draws travel to the client.
    trends: trends
      ? { dailyTxCount: trends.dailyTxCount ?? [], dailyActiveAgents: trends.dailyActiveAgents ?? [] }
      : null,
    x402: topX402Sellers(board, 5),
  };
}
