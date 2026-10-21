// ─── Getting labels in ────────────────────────────────────────────────────────
//
// Pure helpers for the label scripts (scripts/labels-*.ts): read a CSV of labels (tips
// go in this way, private), turn a published dataset into labels, and check every label
// before it is written. The database also refuses a public label from a tip.

import type { LabelKind, WalletLabel } from './labels.js';

/** A label as the scripts write it: the public shape plus a private note and an expiry. */
export interface LabelRecord extends WalletLabel {
  note: string | null;
  expires_at: string | null;
}

const KINDS: ReadonlySet<string> = new Set<LabelKind>(['run_together', 'self_funded_seller', 'serial_launcher', 'launch_dumper', 'operator_wallet', 'service']);
const SOURCE_TYPES: ReadonlySet<string> = new Set(['decode', 'dataset', 'detector', 'tip', 'list']);
const CHAINS: ReadonlySet<string> = new Set(['base', 'bsc']);
const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Words a label never uses: it describes money flows, not intent, and never clears anyone. */
const BANNED = /\b(scam|scammer|scams|fraud|fraudulent|sybil|safe)\b/i;

/** Everything wrong with a label, or an empty list. */
export function checkLabel(l: LabelRecord): string[] {
  const errors: string[] = [];
  if (!ADDRESS_RE.test(l.address)) errors.push(`address: not a lowercase 0x address (${l.address})`);
  if (!CHAINS.has(l.chain)) errors.push(`chain: base or bsc, not ${l.chain}`);
  if (!KINDS.has(l.kind)) errors.push(`kind: unknown kind ${l.kind}`);
  if (l.strength !== 'strong' && l.strength !== 'weak') errors.push(`strength: strong or weak, not ${l.strength}`);
  if (l.visibility !== 'public' && l.visibility !== 'private') errors.push(`visibility: public or private, not ${l.visibility}`);
  if (!SOURCE_TYPES.has(l.source_type)) errors.push(`source_type: unknown source type ${l.source_type}`);
  if (!l.source_ref.trim()) errors.push('source_ref: empty');
  if (l.visibility === 'public' && l.source_type === 'tip') errors.push('a label from a tip is private');
  if (l.visibility === 'public' && !l.source_url) errors.push('a public label needs a public source link');
  const sentence = l.sentence.trim();
  if (!sentence) errors.push('sentence: empty');
  else if (BANNED.test(sentence)) errors.push('sentence: uses a word labels never use (scam, fraud, sybil, safe)');
  else if (sentence.includes('—')) errors.push('sentence: no em dashes');
  else if (sentence.length > 300) errors.push('sentence: over 300 characters');
  if (!DATE_RE.test(l.as_of)) errors.push(`as_of: YYYY-MM-DD, not ${l.as_of}`);
  if (l.group_size !== null && (!Number.isInteger(l.group_size) || l.group_size < 1)) errors.push(`group_size: a whole number, not ${l.group_size}`);
  return errors;
}

/** A minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const CSV_COLUMNS = ['address', 'chain', 'kind', 'strength', 'group_key', 'group_size', 'sentence', 'evidence_url', 'as_of'] as const;

/**
 * Labels from a CSV (columns: address, chain, kind, strength, group_key, group_size,
 * sentence, evidence_url, as_of, and optionally note), with the source given once for
 * the whole file. One bad row refuses the whole file, naming its line.
 */
export function labelsFromCsv(
  text: string,
  source: { visibility: 'public' | 'private'; source_type: WalletLabel['source_type']; source_ref: string; source_url: string | null },
): { labels: LabelRecord[]; errors: string[] } {
  const [head, ...rows] = parseCsv(text);
  const cols = (head ?? []).map((c) => c.trim().toLowerCase());
  const missing = CSV_COLUMNS.filter((c) => !cols.includes(c));
  if (missing.length) return { labels: [], errors: [`missing columns: ${missing.join(', ')}`] };
  const at = (r: string[], c: string) => (r[cols.indexOf(c)] ?? '').trim();
  const labels: LabelRecord[] = [];
  const errors: string[] = [];
  rows.forEach((r, i) => {
    if (r.every((v) => !v.trim())) return;
    const size = at(r, 'group_size');
    const label: LabelRecord = {
      chain: at(r, 'chain').toLowerCase(),
      address: at(r, 'address').toLowerCase(),
      kind: at(r, 'kind') as LabelKind,
      strength: at(r, 'strength') as LabelRecord['strength'],
      visibility: source.visibility,
      group_key: at(r, 'group_key') || null,
      group_size: size ? Number(size) : null,
      sentence: at(r, 'sentence'),
      source_type: source.source_type,
      source_ref: source.source_ref,
      source_url: source.source_url,
      evidence_url: at(r, 'evidence_url') || null,
      as_of: at(r, 'as_of'),
      note: (cols.includes('note') && at(r, 'note')) || null,
      expires_at: null,
    };
    for (const e of checkLabel(label)) errors.push(`line ${i + 2}: ${e}`);
    labels.push(label);
  });
  return errors.length ? { labels: [], errors } : { labels, errors };
}

/** A dataset row as dataset_lookup holds it. */
export interface DatasetRow {
  chain: string;
  address: string;
  tier: string;
  fields: Record<string, unknown>;
}

const TERMIX_SOURCE = 'https://chainward.ai/decodes/termix-on-chain';
const SET_AND_EARN_SOURCE = 'https://chainward.ai/decodes/set-and-earn-week-one-closed';

/**
 * Public labels from a published dataset (both have a free per-address lookup, so their
 * members are public already). TermiX: tier A1 (cycling, with a direct on-chain link to
 * another participant) is strong, by cluster; A2 (linked by timing only) is weak; other
 * tiers get none. Set and Earn week one: the 48- and 14-wallet hiring groups.
 */
export function datasetLabels(slug: string, rows: readonly DatasetRow[]): LabelRecord[] {
  const base = { visibility: 'public' as const, source_type: 'dataset' as const, source_ref: slug, note: null, expires_at: null };
  if (slug === 'termix-wallets') {
    const clusterSize = new Map<string, number>();
    for (const r of rows) if (r.tier === 'A1') clusterSize.set(String(r.fields.cluster), (clusterSize.get(String(r.fields.cluster)) ?? 0) + 1);
    return rows.flatMap((r): LabelRecord[] => {
      const address = r.address.toLowerCase();
      const common = { ...base, chain: r.chain, address, source_url: TERMIX_SOURCE, evidence_url: null, as_of: '2026-09-29' };
      if (r.tier === 'A1') {
        const cluster = String(r.fields.cluster);
        const n = clusterSize.get(cluster) ?? 1;
        return [
          {
            ...common,
            kind: 'run_together',
            strength: 'strong',
            group_key: `termix:${cluster}`,
            group_size: n,
            sentence: `One of ${n.toLocaleString('en-US')} TermiX wallets (cluster ${cluster}) that hire each other, each with a direct on-chain link to another participant, from our TermiX decode.`,
          },
        ];
      }
      if (r.tier === 'A2') {
        return [
          {
            ...common,
            kind: 'run_together',
            strength: 'weak',
            group_key: null,
            group_size: null,
            sentence:
              'A TermiX wallet that hired in a cycle with other participants, linked by timing only (a shared withdrawal burst, or hired within minutes of registering), from our TermiX decode.',
          },
        ];
      }
      return [];
    });
  }
  if (slug === 'set-and-earn-week-one') {
    const groups = [
      {
        field: 'in_48_wallet_group',
        key: 'set-and-earn:48',
        size: 48,
        sentence: "One of 48 wallets that hire only each other's agents in BNB Chain's Set and Earn, from our Set and Earn decode.",
        evidence: 'https://bscscan.com/tx/0x785d52874b0273144bff467bfffacd2791370d81911847d9865a512be3c01d6d',
      },
      {
        field: 'in_14_wallet_group',
        key: 'set-and-earn:14',
        size: 14,
        sentence: "One of 14 wallets that hired each other in BNB Chain's Set and Earn, from our Set and Earn decode.",
        evidence: 'https://bscscan.com/tx/0x677a5904e712537d3aa93c4c8c1b498bf4d0e3cb7564a3f3f1e9124659f7fc12',
      },
    ];
    return rows.flatMap((r) =>
      groups
        .filter((g) => r.fields[g.field] === true)
        .map(
          (g): LabelRecord => ({
            ...base,
            chain: r.chain,
            address: r.address.toLowerCase(),
            kind: 'run_together',
            strength: 'strong',
            group_key: g.key,
            group_size: g.size,
            sentence: g.sentence,
            source_url: SET_AND_EARN_SOURCE,
            evidence_url: g.evidence,
            as_of: '2026-10-08',
          }),
        ),
    );
  }
  throw new Error(`no label mapping for dataset ${slug}`);
}
