/**
 * Import labels from a CSV. Tips go in this way, private.
 *
 * Columns: address, chain, kind, strength, group_key, group_size, sentence,
 * evidence_url, as_of, and optionally note. The source is given once, for the file.
 * One bad row refuses the whole file. A public import refuses --source-type tip.
 *
 * Run (DATABASE_URL set):
 *   pnpm labels:import-csv file.csv --visibility private --source-type tip --source-ref predictex-2026-10-20
 *   pnpm labels:import-csv file.csv --visibility public --source-type decode --source-ref <slug> --source-url https://chainward.ai/decodes/<slug>
 *   add --dry-run to check the file and write nothing
 */
import { readFileSync } from 'node:fs';
import { labelsFromCsv } from '@chainward/decode';
import type { WalletLabel } from '@chainward/decode';
import { args, connect, upsertLabels } from './db.mts';

async function main(): Promise<void> {
  const { flags, rest } = args(process.argv.slice(2));
  const file = rest[0];
  const visibility = flags.get('visibility');
  const sourceType = flags.get('source-type');
  const sourceRef = flags.get('source-ref');
  if (!file || (visibility !== 'public' && visibility !== 'private') || !sourceType || !sourceRef) {
    throw new Error('usage: labels-import-csv <file.csv> --visibility public|private --source-type <type> --source-ref <ref> [--source-url <url>] [--dry-run]');
  }
  const { labels, errors } = labelsFromCsv(readFileSync(file, 'utf8'), {
    visibility,
    source_type: sourceType as WalletLabel['source_type'],
    source_ref: sourceRef,
    source_url: flags.get('source-url') ?? null,
  });
  if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  console.log(`${labels.length} labels read (${visibility}, ${sourceType}:${sourceRef})`);
  if (flags.has('dry-run')) return;
  const written = await upsertLabels(connect(), labels);
  console.log(`${written} labels written`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
