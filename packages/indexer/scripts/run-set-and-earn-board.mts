// Runs the Set and Earn board builder (src/workers/setAndEarnBoard.ts) once
// against live BNB Chain and a LOCAL Redis, then prints the totals, timing and
// how many requests went to each RPC host. Refuses any Redis that isn't local,
// so a manual run never writes the production board. The indexer's env check
// still wants DATABASE_URL and BASE_RPC_URL set (the board uses neither DB nor
// Base); the Alchemy BNB URL is picked as the api picks it (sellerDemandRpcUrl).
//
//   REDIS_URL=redis://127.0.0.1:6399 DATABASE_URL=postgres://unused@127.0.0.1/unused \
//   BASE_RPC_URL=<alchemy base url> pnpm --filter @chainward/indexer exec tsx scripts/run-set-and-earn-board.mts
import Redis from 'ioredis';
import { sellerDemandRpcUrl } from '@chainward/decode';
import { runSetAndEarnBoard } from '../src/workers/setAndEarnBoard.js';

const redisUrl = process.env.REDIS_URL ?? '';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(redisUrl || 'redis://invalid').hostname)) {
  console.error('REDIS_URL must point at a local Redis');
  process.exit(1);
}
const alchemyUrl = sellerDemandRpcUrl('bsc', process.env);
if (!alchemyUrl) {
  console.error('No Alchemy BNB URL: set SELLER_DEMAND_BSC_RPC_URL, or an Alchemy Base SELLER_DEMAND_RPC_URL / BASE_RPC_URL');
  process.exit(1);
}

// The key is the URL path; keep it out of anything printed.
const keyPath = new URL(alchemyUrl).pathname;
const scrub = (s: string) => s.split(keyPath).join('/<redacted>');
const log = {
  info: (o: object, m: string) => console.error('[info]', m, scrub(JSON.stringify(o))),
  warn: (o: object, m: string) => console.error('[warn]', m, scrub(JSON.stringify(o))),
};

const requests: Record<string, number> = {};
const throttled: Record<string, number> = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const host = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).hostname;
  requests[host] = (requests[host] ?? 0) + 1;
  const res = await realFetch(input, init);
  if (res.status === 429) throttled[host] = (throttled[host] ?? 0) + 1;
  return res;
};

const redis = new Redis(redisUrl);
const { board, stats } = await runSetAndEarnBoard({ redis, alchemyUrl, log });
console.log(
  JSON.stringify(
    {
      stats,
      requests_by_host: requests,
      http_429_by_host: throttled,
      as_of: board.as_of,
      totals: board.totals,
      rows: board.rows.length,
      passing: board.rows.filter((r) => r.passes_three_independent).map((r) => r.agent_id),
      verdict_statuses: board.rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.verdict_status]: (acc[r.verdict_status] ?? 0) + 1 }), {}),
      top: board.rows.slice(0, 15).map((r) => ({
        id: r.agent_id,
        campaign: r.registered_during_campaign,
        registered_at: r.registered_at,
        marketplace: r.marketplace,
        hires: r.hires_total,
        completed: r.completed,
        hirers: r.distinct_hirers,
        verdict: r.verdict_status,
        independent: r.independent_within_limits,
        owner_linked: r.owner_linked,
        inconclusive: r.inconclusive,
        pass: r.passes_three_independent,
      })),
    },
    null,
    2,
  ),
);
await redis.quit();
