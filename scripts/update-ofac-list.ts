/**
 * Refresh the bundled OFAC sanctions snapshot (packages/decode/src/ofac-snapshot.ts).
 *
 * Downloads every EVM-format asset file of the nightly SDN extract at
 * https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses (lists
 * branch), validates every line (0x + 40 hex; a malformed file aborts the run),
 * lowercases, dedupes, and rewrites the snapshot with the source URL and today's
 * date in its header. Prints what was added and removed so the diff can be
 * reviewed before it is committed. Deploy api + indexer after committing.
 *
 * Run:
 *   pnpm ofac:update             # fetch and rewrite the snapshot
 *   pnpm ofac:update --dry-run   # fetch and print the changes, write nothing
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OFAC_SNAPSHOT } from '../packages/decode/src/ofac-snapshot.js';
import { OFAC_LIST_FILES, ofacListUrl, parseOfacList, renderOfacSnapshot } from '../packages/decode/src/ofac.js';

const SNAPSHOT_PATH = fileURLToPath(new URL('../packages/decode/src/ofac-snapshot.ts', import.meta.url));
const FETCH_TIMEOUT_MS = 20_000;

async function fetchList(asset: string, skipNonEvm: boolean): Promise<string[]> {
  const url = ofacListUrl(asset);
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return parseOfacList(await res.text(), { skipNonEvm });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const all = new Set<string>();
  for (const { asset, skipNonEvm } of OFAC_LIST_FILES) {
    const list = await fetchList(asset, skipNonEvm);
    console.log(`${asset}: ${list.length} EVM addresses`);
    for (const a of list) all.add(a);
  }
  if (all.size === 0) throw new Error('Every OFAC list came back empty; refusing to write an empty snapshot.');

  const next = [...all].sort();
  const prev = new Set(OFAC_SNAPSHOT.addresses);
  const added = next.filter((a) => !prev.has(a));
  const removed = OFAC_SNAPSHOT.addresses.filter((a) => !all.has(a));
  console.log(`Total: ${next.length} unique addresses (was ${prev.size}); +${added.length} -${removed.length}`);
  for (const a of added) console.log(`  + ${a}`);
  for (const a of removed) console.log(`  - ${a}`);

  if (dryRun) return;
  const fetchedAt = new Date().toISOString().slice(0, 10);
  writeFileSync(SNAPSHOT_PATH, renderOfacSnapshot(next, fetchedAt));
  console.log(`Wrote ${SNAPSHOT_PATH} (fetched ${fetchedAt}).`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
