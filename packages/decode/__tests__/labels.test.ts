import { describe, expect, it } from 'vitest';
import {
  launchDumperSentence,
  runTogetherSentence,
  selfFundedSellerSentence,
  serialLauncherSentence,
  strongestPublicLabel,
  type WalletLabel,
} from '../src/labels.js';
import { RISK_CHECKS, withLabelFlags, withSanctionsFlag, type RiskAssessment } from '../src/risk-flags.js';
import { counterpartyVerdict } from '../src/verdict.js';
import { isAttestable } from '../src/attestation.js';

// The label set: what our published investigations and detectors found about a wallet,
// read by every check. Public labels only; a strong label is enough to stop a payment,
// a weak one is a note. Never "safe", never fraud or scam.

const ADDR = `0x${'a'.repeat(40)}`;
const SANCTIONED = '0x098b716b8aaf21512996dc57eb0615e2383e2f96';

function label(over: Partial<WalletLabel> = {}): WalletLabel {
  return {
    chain: 'base',
    address: ADDR,
    kind: 'run_together',
    strength: 'strong',
    visibility: 'public',
    group_key: 'set-and-earn-ring-48',
    group_size: 48,
    sentence: "One of 48 wallets that appear to be run together in Set and Earn, from our decode Set and Earn's First Week.",
    source_type: 'dataset',
    source_ref: 'set-and-earn-week-one',
    source_url: 'https://chainward.ai/decodes/set-and-earn-week-one',
    evidence_url: 'https://bscscan.com/tx/0x1',
    as_of: '2026-10-01',
    ...over,
  };
}

const empty: RiskAssessment = { band: 'low-signal', flags: [], not_assessed: [], classifier_version: 'test', signal_density: 0 };
const activity = { transfers_30d: 40, unique_counterparties_30d: 9, latest_transfer_age_hours: 2 };

describe('sentences', () => {
  it('titles the flag for investigations and detectors alike', () => {
    expect(withLabelFlags(empty, [label()]).flags[0]!.title).toBe('Labeled in our records');
  });

  it('words each kind plainly, naming the source', () => {
    expect(runTogetherSentence({ size: 48, program: 'Set and Earn', source: "our decode Set and Earn's First Week" })).toBe(
      "One of 48 wallets that appear to be run together in Set and Earn, from our decode Set and Earn's First Week.",
    );
    expect(selfFundedSellerSentence("our decode Three of the Top Ten x402 Sellers")).toBe(
      'An x402 seller whose buyers it funded, from our decode Three of the Top Ten x402 Sellers.',
    );
    expect(serialLauncherSentence(97, '2026-10-20T05:00:00Z')).toBe('Launched 97 tokens through Clanker in one day (seen 2026-10-20).');
    expect(launchDumperSentence(3, '2026-10-20')).toBe('Sent out the tokens it got at launch within the hour, on 3 launches in 7 days (seen 2026-10-20).');
  });

  it('never says safe, fraud, scam or sybil', () => {
    const all = [
      runTogetherSentence({ size: 2, program: 'X', source: 'Y' }),
      selfFundedSellerSentence('Y'),
      serialLauncherSentence(5, '2026-10-20'),
      launchDumperSentence(2, '2026-10-20'),
    ].join(' ');
    expect(all).not.toMatch(/\b(safe|fraud|scam|sybil)\b/i);
    expect(all).not.toContain('—');
  });
});

describe('strongestPublicLabel', () => {
  it('prefers a strong label, then the kind that matters most to a payer', () => {
    const weak = label({ kind: 'service', strength: 'weak', sentence: 'A facilitator signer.' });
    const serial = label({ kind: 'serial_launcher', sentence: 'Launched 9 tokens.' });
    const ring = label();
    expect(strongestPublicLabel([weak, serial, ring])).toBe(ring);
    expect(strongestPublicLabel([weak])).toBe(weak);
  });

  it('never picks a private label', () => {
    expect(strongestPublicLabel([label({ visibility: 'private' })])).toBeNull();
  });
});

describe('withLabelFlags', () => {
  it('adds one known_label flag, medium for a strong label, citing the source', () => {
    const a = withLabelFlags(empty, [label()]);
    expect(a.flags).toHaveLength(1);
    expect(a.flags[0]).toMatchObject({ id: 'known_label', severity: 'medium', source: 'https://chainward.ai/decodes/set-and-earn-week-one' });
    expect(a.flags[0]!.evidence).toMatch(/^One of 48 wallets that appear to be run together/);
    expect(a.band).toBe('mixed');
  });

  it('notes a weak label at info severity, without moving the band', () => {
    const a = withLabelFlags(empty, [label({ strength: 'weak' })]);
    expect(a.flags[0]).toMatchObject({ id: 'known_label', severity: 'info' });
    expect(a.band).toBe('low-signal');
  });

  it('says how many more labels the wallet has', () => {
    const a = withLabelFlags(empty, [label(), label({ kind: 'serial_launcher', source_ref: 'x', sentence: 'Launched 9 tokens.' })]);
    expect(a.flags[0]!.evidence).toMatch(/from our decode Set and Earn's First Week\. Plus 1 more label\.$/);
  });

  // The same wallet can be in two published groups: the reason must not flip between reads.
  it('leads with the same label whatever order the labels come in', () => {
    const termix = label({ kind: 'hiring_loop', source_ref: 'termix-wallets', sentence: 'One of 5,384 TermiX wallets that hire each other.' });
    const ring = label({ kind: 'hiring_loop', source_ref: 'set-and-earn-week-one', sentence: 'One of 48 wallets that hire only each other.' });
    expect(withLabelFlags(empty, [termix, ring]).flags[0]!.evidence).toBe(withLabelFlags(empty, [ring, termix]).flags[0]!.evidence);
  });

  it('goes after a privacy relay flag too', () => {
    const relay = '0xdd31c57e8f7cac78090a516292f0c9dea6c6119f';
    const withRelay = { ...empty, flags: [{ id: 'privacy_relay', severity: 'info' as const, title: 't', evidence: 'e', source: 's' }] };
    expect(withLabelFlags(withRelay, [label({ address: relay })]).flags.map((f) => f.id)).toEqual(['privacy_relay', 'known_label']);
  });

  it('ignores private labels', () => {
    expect(withLabelFlags(empty, [label({ visibility: 'private' })])).toBe(empty);
  });

  it('is idempotent, and gives back an unlabeled assessment unchanged', () => {
    const once = withLabelFlags(empty, [label()]);
    expect(withLabelFlags(once, [label()]).flags).toHaveLength(1);
    expect(withLabelFlags(empty, [])).toBe(empty);
  });

  it('goes after a sanctions flag', () => {
    const a = withLabelFlags(withSanctionsFlag(empty, SANCTIONED), [label({ address: SANCTIONED })]);
    expect(a.flags.map((f) => f.id)).toEqual(['ofac_sanctioned', 'known_label']);
  });

  it('is in the catalog, worded as what it looks for', () => {
    const check = RISK_CHECKS.find((c) => c.id === 'known_label');
    expect(check?.looks_for).toMatch(/our published investigations or detectors/);
    expect(check?.reads_transfers).toBeUndefined();
  });
});

describe('the counterparty verdict', () => {
  it('holds on a strong label, giving its sentence as the reason', () => {
    const v = counterpartyVerdict(withLabelFlags(empty, [label()]), activity);
    expect(v.label).toBe('hold');
    expect(v.reason).toMatch(/^One of 48 wallets that appear to be run together/);
  });

  it('still says Pay on a weak label alone', () => {
    expect(counterpartyVerdict(withLabelFlags(empty, [label({ strength: 'weak' })]), activity).label).toBe('pay');
  });

  // A list match needs no chain read.
  it('holds on a strong label even when the transfers could not be read', () => {
    expect(counterpartyVerdict(withLabelFlags(empty, [label()]), null, { transfersUnavailable: true }).label).toBe('hold');
  });

  it('gives sanctions first', () => {
    const v = counterpartyVerdict(withLabelFlags(withSanctionsFlag(empty, SANCTIONED), [label({ address: SANCTIONED })]), activity);
    expect(v.reason).toMatch(/OFAC/);
  });
});

describe('attestations', () => {
  it('never attest on a label alone', () => {
    const r = { address: ADDR, flagIds: ['known_label'], generatedAt: new Date(), headStale: false };
    expect(isAttestable(r, new Set())).toBe(false);
  });
});
