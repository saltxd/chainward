/**
 * Shared database helpers for the label scripts (apps/api/scripts/labels). They connect with
 * DATABASE_URL; from the Mac, port-forward the cluster's postgres first.
 */
import { sql } from 'drizzle-orm';
import { createDb, walletLabels } from '@chainward/db';
import type { LabelRecord } from '@chainward/decode';

export type Db = ReturnType<typeof createDb>;

export function connect(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return createDb(url);
}

const CHUNK = 500;

/**
 * Writes labels, one row per address, kind and source, all or nothing (one transaction).
 * A re-import updates the row's words, group, links and dates; a removal (removed_at)
 * stays as it was.
 */
export async function upsertLabels(db: Db, labels: readonly LabelRecord[]): Promise<number> {
  return db.transaction(async (tx) => {
    let written = 0;
    for (let i = 0; i < labels.length; i += CHUNK) {
      const rows = labels.slice(i, i + CHUNK).map((l) => ({
        chain: l.chain,
        address: l.address,
        kind: l.kind,
        strength: l.strength,
        visibility: l.visibility,
        groupKey: l.group_key,
        groupSize: l.group_size,
        sentence: l.sentence,
        sourceType: l.source_type,
        sourceRef: l.source_ref,
        sourceUrl: l.source_url,
        evidenceUrl: l.evidence_url,
        note: l.note,
        asOf: l.as_of,
        expiresAt: l.expires_at ? new Date(l.expires_at) : null,
      }));
      await tx
        .insert(walletLabels)
        .values(rows)
        .onConflictDoUpdate({
          target: [walletLabels.chain, walletLabels.address, walletLabels.kind, walletLabels.sourceType, walletLabels.sourceRef],
          set: {
            strength: sql`excluded.strength`,
            visibility: sql`excluded.visibility`,
            groupKey: sql`excluded.group_key`,
            groupSize: sql`excluded.group_size`,
            sentence: sql`excluded.sentence`,
            sourceUrl: sql`excluded.source_url`,
            evidenceUrl: sql`excluded.evidence_url`,
            note: sql`excluded.note`,
            asOf: sql`excluded.as_of`,
            expiresAt: sql`excluded.expires_at`,
            updatedAt: sql`now()`,
          },
        });
      written += rows.length;
    }
    return written;
  });
}

/** --flag value pairs and the rest. */
export function args(argv: string[]): { flags: Map<string, string>; rest: string[] } {
  const flags = new Map<string, string>();
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags.set(a.slice(2), 'true');
      else {
        flags.set(a.slice(2), next);
        i++;
      }
    } else rest.push(a);
  }
  return { flags, rest };
}
