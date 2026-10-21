/**
 * Public labels from a published dataset (dataset_lookup): termix-wallets (tier A1
 * strong by cluster, A2 weak) and set-and-earn-week-one (the 48- and 14-wallet
 * hiring groups). Both datasets already have a free per-address lookup.
 *
 * Run (DATABASE_URL set):
 *   pnpm labels:import-dataset termix-wallets [--dry-run]
 */
import { eq } from 'drizzle-orm';
import { datasetLookup } from '@chainward/db';
import { checkLabel, datasetLabels } from '@chainward/decode';
import { args, connect, upsertLabels } from './db.mts';

async function main(): Promise<void> {
  const { flags, rest } = args(process.argv.slice(2));
  const slug = rest[0];
  if (!slug) throw new Error('usage: labels-import-dataset <slug> [--dry-run]');
  const db = connect();
  const rows = await db
    .select({ chain: datasetLookup.chain, address: datasetLookup.address, tier: datasetLookup.tier, fields: datasetLookup.fields })
    .from(datasetLookup)
    .where(eq(datasetLookup.slug, slug));
  const labels = datasetLabels(
    slug,
    rows.map((r) => ({ ...r, fields: (r.fields ?? {}) as Record<string, unknown> })),
  );
  const bad = labels.flatMap((l) => checkLabel(l).map((e) => `${l.address}: ${e}`));
  if (bad.length) {
    for (const e of bad.slice(0, 20)) console.error(e);
    process.exit(1);
  }
  const tally = new Map<string, number>();
  for (const l of labels) tally.set(`${l.visibility} ${l.strength} ${l.kind}`, (tally.get(`${l.visibility} ${l.strength} ${l.kind}`) ?? 0) + 1);
  console.log(`${slug}: ${rows.length} rows, ${labels.length} labels`);
  for (const [k, n] of [...tally].sort()) console.log(`  ${k}: ${n}`);
  if (flags.has('dry-run')) process.exit(0);
  console.log(`${await upsertLabels(db, labels)} labels written`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
