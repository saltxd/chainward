// ─── Wallet labels ────────────────────────────────────────────────────────────
//
// What ChainWard's published investigations and automated detectors found about a
// wallet: one of a group that appears to be run together, a seller that funds its
// own buyers, a serial token launcher, a known service. The API keeps the public
// labels in memory and passes them in; nothing here reads a database or the chain.
//
// Rules: wallets, contracts and organizations only, never people. "Appear to be run
// together", never fraud, scam or sybil, and never "safe": a wallet with no label is
// not cleared. Private labels (from tips sent privately to a program) never reach a
// public answer; every function here ignores them.

export type LabelKind = 'run_together' | 'self_funded_seller' | 'serial_launcher' | 'launch_dumper' | 'operator_wallet' | 'service';

export interface WalletLabel {
  chain: string;
  /** Lowercase. */
  address: string;
  kind: LabelKind;
  /** strong: enough to stop a payment. weak: worth a note (linked by timing only, a known service). */
  strength: 'strong' | 'weak';
  visibility: 'public' | 'private';
  group_key: string | null;
  group_size: number | null;
  /** The plain sentence a check shows. */
  sentence: string;
  source_type: 'decode' | 'dataset' | 'detector' | 'tip' | 'list';
  source_ref: string;
  /** A public page for the source (public labels). */
  source_url: string | null;
  /** An on-chain reference: a transaction or an explorer page. */
  evidence_url: string | null;
  /** The day it was read on chain (YYYY-MM-DD or ISO). */
  as_of: string;
}

/** The labels for one address on one chain (the API looks them up per request). */
export type LabelsFor = (address: string, chain: string) => readonly WalletLabel[] | Promise<readonly WalletLabel[]>;

/** Which kind a payer most needs to hear about first. */
const KIND_ORDER: Record<LabelKind, number> = {
  run_together: 0,
  self_funded_seller: 1,
  launch_dumper: 2,
  serial_launcher: 3,
  operator_wallet: 4,
  service: 5,
};

/** The public labels in the order a check names them: strong first, then by kind. */
export function publicLabels(labels: readonly WalletLabel[]): WalletLabel[] {
  return labels
    .filter((l) => l.visibility === 'public')
    .sort((a, b) => (a.strength === b.strength ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind] : a.strength === 'strong' ? -1 : 1));
}

/** The label a check leads with, or null when the wallet has no public label. */
export function strongestPublicLabel(labels: readonly WalletLabel[]): WalletLabel | null {
  return publicLabels(labels)[0] ?? null;
}

const day = (iso: string) => iso.slice(0, 10);

export function runTogetherSentence(p: { size: number; program: string; source: string }): string {
  return `One of ${p.size.toLocaleString('en-US')} wallets that appear to be run together in ${p.program}, from ${p.source}.`;
}

export function selfFundedSellerSentence(source: string): string {
  return `An x402 seller whose buyers it funded, from ${source}.`;
}

export function serialLauncherSentence(launches: number, seen: string): string {
  return `Launched ${launches.toLocaleString('en-US')} tokens through Clanker in one day (seen ${day(seen)}).`;
}

export function launchDumperSentence(launches: number, seen: string): string {
  return `Sent out the tokens it got at launch within the hour, on ${launches.toLocaleString('en-US')} launches in 7 days (seen ${day(seen)}).`;
}

/** What a label match can and cannot tell a payer, in one line. */
export const LABEL_LIMITS =
  "Matched against ChainWard's labels from its published investigations and detectors; a wallet with no label is not cleared.";
