/**
 * Concurrent-fetch deduplication for API calls.
 *
 * If two components both fire `fetchDedup('/api/foo')` in the same render
 * cycle (e.g., StatusTicker in the layout + a page-specific component both
 * fetching `/api/observatory` on mount), they share a single in-flight
 * promise instead of issuing two parallel network requests.
 *
 * The promise is removed from the cache as soon as it resolves — this
 * deduplicates *concurrent* requests but does not cache results. Each new
 * caller after settle re-fetches fresh data.
 */

type ApiResponse<T> = { data?: T } | null;

const inflight = new Map<string, Promise<unknown>>();

export async function fetchDedup<T>(path: string): Promise<T | null> {
  const existing = inflight.get(path) as Promise<T | null> | undefined;
  if (existing) return existing;

  const promise = fetch(path)
    .then((r): Promise<ApiResponse<T>> => (r.ok ? r.json() : Promise.resolve(null)))
    .then((j) => j?.data ?? null)
    .finally(() => {
      inflight.delete(path);
    });

  inflight.set(path, promise);
  return promise as Promise<T | null>;
}
