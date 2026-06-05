import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from '@chainward/db';
import { sql } from 'drizzle-orm';

const SKIP_FILES = ['publish-checklist.md', 'thread.md', 'findings.md', 'architecture.md', 'review-report.md'];

export interface DeliverableFile { dir: string; file: string; content: string; }

/** Recover already-decoded agent NAME tokens from deliverables frontmatter titles.
 * Mirrors scripts/decode-candidates.ts — do NOT assume slugify(name) === dirname. */
export function recoverDecodedNames(files: DeliverableFile[]): Set<string> {
  const names = new Set<string>();
  for (const f of files) {
    if (SKIP_FILES.includes(f.file) || !f.file.endsWith('.md')) continue;
    const fm = f.content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fm || !fm[1]) continue;
    const t = fm[1].match(/^title:\s*"?([^"\n]+?)"?\s*$/m);
    if (!t || !t[1]) continue;
    const token = (t[1].toLowerCase().split(/\s+(on-chain|deep dive|decode)/)[0] ?? '').trim();
    if (token) names.add(token);
  }
  return names;
}

/** Read the deliverables dir from disk into DeliverableFile[]. */
export function readDeliverables(deliverablesDir: string): DeliverableFile[] {
  if (!existsSync(deliverablesDir)) return [];
  const out: DeliverableFile[] = [];
  for (const d of readdirSync(deliverablesDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dirPath = join(deliverablesDir, d.name);
    for (const file of readdirSync(dirPath)) {
      if (!file.endsWith('.md')) continue;
      out.push({ dir: d.name, file, content: readFileSync(join(dirPath, file), 'utf-8') });
    }
  }
  return out;
}

export function isDecoded(agentName: string, decoded: Set<string>): boolean {
  const n = agentName.toLowerCase().trim();
  return decoded.has(n) || decoded.has(n.split(/\s+/)[0] ?? n);
}

/** Wallets surfaced (pinged) within the cooldown window — re-pinging these is spam. */
export async function recentlySurfaced(db: Database, weeks = 4): Promise<Set<string>> {
  const rows = await db.execute(
    sql`SELECT wallet_address FROM scout_surfaced WHERE surfaced_at > now() - make_interval(weeks => ${weeks})`,
  );
  return new Set((rows as unknown as Array<{ wallet_address: string }>).map((r) => r.wallet_address.toLowerCase()));
}

/** Record a surfaced candidate AFTER successful webhook delivery (deliver-then-record). */
export async function recordSurfaced(db: Database, walletAddress: string, slug: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO scout_surfaced (wallet_address, slug, surfaced_at)
        VALUES (${walletAddress.toLowerCase()}, ${slug}, now())
        ON CONFLICT (wallet_address) DO UPDATE SET slug = EXCLUDED.slug, surfaced_at = now()`,
  );
}
