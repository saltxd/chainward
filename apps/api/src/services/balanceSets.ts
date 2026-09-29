import { sql, type SQL } from 'drizzle-orm';

/**
 * Snapshot "sets" (all rows one poll wrote for a wallet at one timestamp) that
 * reflect the wallet's full holdings.
 *
 * Two pollers write balance_snapshots: the user-agent poll (every 15 min,
 * native ETH plus every non-zero token) and the observatory poll (every 2 h,
 * native ETH only). A wallet that is both a user agent and an observatory
 * agent gets both, and BullMQ aligns the two schedules, so an ETH-only set
 * lands seconds after a full one. Reading "the latest snapshot" then drops
 * every token. A native-only set with a fuller set for the same wallet within
 * 60 seconds is that duplicate, so it's skipped.
 *
 * Yields CTEs `sets` and `usable (wallet_address, timestamp)`.
 */
export function usableSnapshotSets(walletArray: string, fromStr: string, toStr: string): SQL {
  return sql`
    sets AS (
      SELECT wallet_address, timestamp, count(*) AS n, bool_and(token_address IS NULL) AS native_only
      FROM balance_snapshots
      WHERE wallet_address = ANY(${walletArray}::text[])
        AND timestamp >= ${fromStr}::timestamptz
        AND timestamp <= ${toStr}::timestamptz
      GROUP BY wallet_address, timestamp
    ),
    usable AS (
      SELECT s.wallet_address, s.timestamp
      FROM sets s
      WHERE NOT (
        s.native_only AND EXISTS (
          SELECT 1 FROM sets o
          WHERE o.wallet_address = s.wallet_address
            AND o.timestamp <> s.timestamp
            AND o.timestamp BETWEEN s.timestamp - interval '60 seconds' AND s.timestamp + interval '60 seconds'
            AND (o.n > s.n OR (o.n = s.n AND o.timestamp < s.timestamp))
        )
      )
    )`;
}
