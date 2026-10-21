/**
 * Every label (public and private) for a list of addresses, for paid screens and
 * audits. Private labels come from tips sent privately to a program: use them in
 * that work, never in anything published. Prints CSV to stdout.
 *
 * Run (DATABASE_URL set):
 *   pnpm labels:screen addresses.txt [--chain base]     # one address per line, or a CSV with an address column
 */
import { readFileSync } from 'node:fs';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { walletLabels } from '@chainward/db';
import { parseCsv } from '@chainward/decode';
import { args, connect } from './db.mts';

const ADDRESS_RE = /0x[0-9a-fA-F]{40}/;
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main(): Promise<void> {
  const { flags, rest } = args(process.argv.slice(2));
  const file = rest[0];
  if (!file) throw new Error('usage: labels-screen <file> [--chain base|bsc]');
  const addresses = [
    ...new Set(
      parseCsv(readFileSync(file, 'utf8'))
        .flat()
        .map((v) => v.match(ADDRESS_RE)?.[0]?.toLowerCase())
        .filter((a): a is string => !!a),
    ),
  ];
  const chain = flags.get('chain');
  const db = connect();
  const found = [];
  for (let i = 0; i < addresses.length; i += 1000) {
    const batch = addresses.slice(i, i + 1000);
    found.push(
      ...(await db
        .select()
        .from(walletLabels)
        .where(and(inArray(walletLabels.address, batch), isNull(walletLabels.removedAt), ...(chain ? [eq(walletLabels.chain, chain)] : [])))),
    );
  }
  const cols = ['address', 'chain', 'kind', 'strength', 'visibility', 'group_key', 'group_size', 'sentence', 'source_type', 'source_ref', 'source_url', 'evidence_url', 'as_of', 'note'];
  console.log(cols.join(','));
  for (const r of found) {
    console.log(
      [r.address, r.chain, r.kind, r.strength, r.visibility, r.groupKey, r.groupSize, r.sentence, r.sourceType, r.sourceRef, r.sourceUrl, r.evidenceUrl, String(r.asOf), r.note]
        .map(csvCell)
        .join(','),
    );
  }
  console.error(`${addresses.length} addresses, ${new Set(found.map((r) => r.address)).size} with labels, ${found.length} labels`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
