// packages/indexer/src/reconcile/index.ts
//
// Fleet reconcile: one-off (re-runnable) tool to close the observatory tracking gap.
//
// Context: the 852 observatory agents were bulk-seeded directly into agent_registry,
// which bypassed the API's register→backfill+webhook path. So they got balance polling
// but no transaction history and no live webhook capture. After pruning dead-legacy and
// adding the popular ACP agents (done via SQL), this captures the missing tx data:
//   - BACKFILL: run backfillWalletViaTransfers() for every observatory agent that has
//     ZERO transactions indexed (the gap). Idempotent; agents already indexed are skipped.
//     Uses paginated alchemy_getAssetTransfers (no eth_getLogs 10k-range limit).
//   - REGISTER: add every observatory address to the Alchemy webhook so future txs are
//     captured live (so the gap doesn't recur).
//
// Run as an in-cluster Job on the indexer image (has backfillAgent + Alchemy creds).
// Env: DATABASE_URL, ALCHEMY_API_KEY (backfill), ALCHEMY_AUTH_TOKEN + ALCHEMY_WEBHOOK_ID
// (register). RECONCILE_MODE = backfill|register|all (default all). DRY_RUN=1 to preview.
// RECONCILE_LIMIT=N to cap the backfill set (staged runs).

import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { backfillWalletViaTransfers } from '../workers/transferBackfill.js';

const ALCHEMY_NOTIFY_API = 'https://dashboard.alchemy.com/api';
const REGISTER_CHUNK = 100;

const MODE = process.env.RECONCILE_MODE ?? 'all';
const DRY_RUN = !!process.env.RECONCILE_DRY_RUN;
const LIMIT = process.env.RECONCILE_LIMIT ? parseInt(process.env.RECONCILE_LIMIT, 10) : null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function observatoryAddresses(onlyMissingTx: boolean): Promise<string[]> {
  const db = getDb();
  const rows = await db.execute(
    onlyMissingTx
      ? sql`SELECT r.wallet_address FROM agent_registry r
             WHERE r.is_observatory = true AND r.chain = 'base'
               AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.wallet_address = r.wallet_address)`
      : sql`SELECT r.wallet_address FROM agent_registry r
             WHERE r.is_observatory = true AND r.chain = 'base'`,
  );
  return (rows as unknown as Array<{ wallet_address: string }>).map((r) => r.wallet_address);
}

async function runBackfill(): Promise<void> {
  let targets = await observatoryAddresses(true);
  if (LIMIT) targets = targets.slice(0, LIMIT);
  logger.info({ count: targets.length, dryRun: DRY_RUN }, '[reconcile] backfill targets (observatory agents with 0 indexed txs)');
  if (DRY_RUN) {
    logger.info({ sample: targets.slice(0, 10) }, '[reconcile] DRY RUN — would backfill these');
    return;
  }
  let ok = 0;
  let failed = 0;
  for (const [i, wallet] of targets.entries()) {
    try {
      await backfillWalletViaTransfers(wallet);
      ok++;
    } catch (e) {
      failed++;
      logger.error({ wallet, err: String(e) }, '[reconcile] backfill failed for agent');
    }
    if ((i + 1) % 25 === 0) logger.info({ done: i + 1, total: targets.length, ok, failed }, '[reconcile] backfill progress');
    await sleep(250); // be gentle on the RPC
  }
  logger.info({ ok, failed, total: targets.length }, '[reconcile] backfill complete');
}

async function runRegister(): Promise<void> {
  const authToken = process.env.ALCHEMY_AUTH_TOKEN;
  const webhookId = process.env.ALCHEMY_WEBHOOK_ID;
  if (!authToken || !webhookId) {
    logger.error('[reconcile] ALCHEMY_AUTH_TOKEN or ALCHEMY_WEBHOOK_ID missing — cannot register');
    throw new Error('missing Alchemy webhook config');
  }
  const addrs = (await observatoryAddresses(false)).map((a) => a.toLowerCase());
  logger.info({ count: addrs.length, dryRun: DRY_RUN }, '[reconcile] register: observatory addresses → Alchemy webhook');
  if (DRY_RUN) {
    logger.info({ sample: addrs.slice(0, 10), chunks: Math.ceil(addrs.length / REGISTER_CHUNK) }, '[reconcile] DRY RUN — would register these');
    return;
  }
  let registered = 0;
  for (let i = 0; i < addrs.length; i += REGISTER_CHUNK) {
    const chunk = addrs.slice(i, i + REGISTER_CHUNK);
    const res = await fetch(`${ALCHEMY_NOTIFY_API}/update-webhook-addresses`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Alchemy-Token': authToken },
      body: JSON.stringify({ webhook_id: webhookId, addresses_to_add: chunk, addresses_to_remove: [] }),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text.slice(0, 300), chunkStart: i }, '[reconcile] webhook register chunk failed');
    } else {
      registered += chunk.length;
    }
    await sleep(500);
  }
  logger.info({ registered, total: addrs.length }, '[reconcile] register complete');
}

async function main(): Promise<void> {
  logger.info({ mode: MODE, dryRun: DRY_RUN, limit: LIMIT }, '[reconcile] start');
  if (MODE === 'backfill' || MODE === 'all') await runBackfill();
  if (MODE === 'register' || MODE === 'all') await runRegister();
  logger.info('[reconcile] done');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error({ err: String(e) }, '[reconcile] fatal');
    process.exit(1);
  });
