// The data-fetch implementation now lives in @chainward/decode so the indexer's
// risk-check worker can reuse the exact same live-fetch path. This module is kept
// as a thin re-export to preserve acp-decoder's existing import sites (handler,
// simulate script, tests) without behavioral change.
export {
  fetchFixtures,
  fetchBlockscoutTransfers,
  type FetchedFixtures,
  type FetchOptions,
  type FetchLogger,
} from '@chainward/decode';
