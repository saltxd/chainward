import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { walletLabels } from '@chainward/db';
import { serialLauncherSentence, type LabelKind, type TokenCheck, type WalletLabel } from '@chainward/decode';
import { getDb } from './db.js';
import { logger } from './logger.js';

// ─── Wallet labels, as the public checks read them ────────────────────────────
//
// Looked up per request by address (indexed), not held in memory: the API process
// stays request-only, with no periodic work of its own. Only public, live labels:
// the query filters them, and rowToLabel drops anything else again, so a private
// label (from a tip sent privately to a program) can never reach a public answer.

type LabelRow = typeof walletLabels.$inferSelect;

const KINDS: ReadonlySet<string> = new Set<LabelKind>(['run_together', 'self_funded_seller', 'serial_launcher', 'launch_dumper', 'operator_wallet', 'service']);
const SOURCE_TYPES: ReadonlySet<string> = new Set(['decode', 'dataset', 'detector', 'list']);

/** A row as a public check reads it, or null for anything a public answer must not show. */
export function rowToLabel(row: LabelRow, now: Date = new Date()): WalletLabel | null {
  if (row.visibility !== 'public' || !SOURCE_TYPES.has(row.sourceType)) return null;
  if (row.removedAt || (row.expiresAt && row.expiresAt.getTime() <= now.getTime())) return null;
  if (!KINDS.has(row.kind) || (row.strength !== 'strong' && row.strength !== 'weak')) return null;
  return {
    chain: row.chain,
    address: row.address,
    kind: row.kind as LabelKind,
    strength: row.strength,
    visibility: 'public',
    group_key: row.groupKey,
    group_size: row.groupSize,
    sentence: row.sentence,
    source_type: row.sourceType as WalletLabel['source_type'],
    source_ref: row.sourceRef,
    source_url: row.sourceUrl,
    evidence_url: row.evidenceUrl,
    as_of: String(row.asOf),
  };
}

/** The public labels for these addresses on this chain, by lowercase address. A read error answers none. */
export async function publicLabelsFor(chain: string, addresses: readonly string[]): Promise<Map<string, WalletLabel[]>> {
  const out = new Map<string, WalletLabel[]>();
  const wanted = [...new Set(addresses.map((a) => a.toLowerCase()))];
  if (!wanted.length) return out;
  try {
    const now = new Date();
    const rows = await getDb()
      .select()
      .from(walletLabels)
      .where(
        and(
          eq(walletLabels.chain, chain),
          inArray(walletLabels.address, wanted),
          eq(walletLabels.visibility, 'public'),
          isNull(walletLabels.removedAt),
          or(isNull(walletLabels.expiresAt), gt(walletLabels.expiresAt, now)),
        ),
      );
    for (const row of rows) {
      const label = rowToLabel(row, now);
      if (label) out.set(label.address, [...(out.get(label.address) ?? []), label]);
    }
  } catch (err) {
    logger.warn({ err }, 'labels: lookup failed, answering without labels');
  }
  return out;
}

/** The public labels for report rows, which can be on different chains, by `chain:address`. */
export async function publicLabelsForRows(rows: ReadonlyArray<{ chain: string; walletAddress: string }>): Promise<Map<string, WalletLabel[]>> {
  const byChain = new Map<string, string[]>();
  for (const r of rows) byChain.set(r.chain, [...(byChain.get(r.chain) ?? []), r.walletAddress]);
  const out = new Map<string, WalletLabel[]>();
  for (const [chain, addresses] of byChain) {
    for (const [address, labels] of await publicLabelsFor(chain, addresses)) out.set(`${chain}:${address}`, labels);
  }
  return out;
}

/** The public labels for one address (the decode functions' labelsFor). */
export async function labelsFor(address: string, chain: string): Promise<WalletLabel[]> {
  return (await publicLabelsFor(chain, [address])).get(address.toLowerCase()) ?? [];
}

/** Detector labels last this long after the check that saw them. */
const DETECTOR_LABEL_DAYS = 30;

/**
 * The rug check as a detector: a launch wallet that launched 5 or more tokens through
 * Clanker in a day (creator_serial_launcher, which the check never raises for a launch
 * made for another admin) gets a public serial_launcher label for 30 days. A re-detection
 * refreshes the sentence and dates; a removal (a correction) stays.
 */
export async function recordSerialLauncher(check: TokenCheck, now: Date = new Date()): Promise<void> {
  const launches = check.creator?.clanker_launches_24h;
  if (!check.flags.includes('creator_serial_launcher') || !check.creator || !launches) return;
  const day = now.toISOString().slice(0, 10);
  const values = {
    chain: 'base',
    address: check.creator.address.toLowerCase(),
    kind: 'serial_launcher',
    strength: 'strong',
    visibility: 'public',
    sentence: serialLauncherSentence(launches, day),
    sourceType: 'detector',
    sourceRef: 'rugcheck',
    sourceUrl: 'https://chainward.ai/rugcheck',
    evidenceUrl: check.launch?.tx ? `https://basescan.org/tx/${check.launch.tx}` : null,
    asOf: day,
    expiresAt: new Date(now.getTime() + DETECTOR_LABEL_DAYS * 86_400_000),
  };
  await getDb()
    .insert(walletLabels)
    .values(values)
    .onConflictDoUpdate({
      target: [walletLabels.chain, walletLabels.address, walletLabels.kind, walletLabels.sourceType, walletLabels.sourceRef],
      set: { sentence: values.sentence, evidenceUrl: values.evidenceUrl, asOf: values.asOf, expiresAt: values.expiresAt, updatedAt: now },
    });
}
