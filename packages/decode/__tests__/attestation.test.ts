import { describe, it, expect } from 'vitest';
import { decodeAbiParameters, encodePacked, keccak256, parseAbiParameters, toBytes, zeroAddress } from 'viem';
import {
  ATTEST_SCHEMA,
  ATTEST_SCHEMA_UID,
  ATTEST_SCOPE,
  canonicalReportJson,
  encodeAttestationData,
  isAttestable,
  reportHash,
  reportUri,
  type AttestableReport,
} from '../src/attestation.js';

const report: AttestableReport = {
  address: '0x4BAADBA26C3C0BDEF9E8FAF173925D463AA53BB2',
  chain: 'base',
  asOfBlock: 51799275,
  classifierVersion: '1.0.0',
  assessment: {
    band: 'high-signal',
    flags: [
      {
        id: 'dormant_wallet',
        severity: 'medium',
        title: 'Wallet is dormant',
        evidence: 'no transfers in last 7 days; last activity 120 days ago',
        source: 'https://base.blockscout.com/address/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
      },
      {
        id: 'stranded_value',
        severity: 'high',
        title: 'USDC balance held in a dormant wallet',
        evidence: 'Holds 5451.386272 USDC while classified dormant',
        source: 'https://base.blockscout.com/address/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
      },
    ],
    not_assessed: ['Contract bytecode or source auditing'],
  },
};

describe('attestation schema', () => {
  it('derives the schema UID the way the EAS SchemaRegistry does', () => {
    const expected = keccak256(
      encodePacked(['string', 'address', 'bool'], [ATTEST_SCHEMA, zeroAddress, true]),
    );
    expect(ATTEST_SCHEMA_UID).toBe(expected);
  });
});

describe('canonicalReportJson', () => {
  it('is independent of object key order and lowercases the address', () => {
    const shuffled: AttestableReport = {
      ...report,
      assessment: {
        not_assessed: report.assessment.not_assessed,
        flags: report.assessment.flags.map((f) => ({
          source: f.source,
          evidence: f.evidence,
          title: f.title,
          severity: f.severity,
          id: f.id,
        })),
        band: report.assessment.band,
      },
    };
    const json = canonicalReportJson(report);
    expect(canonicalReportJson(shuffled)).toBe(json);
    expect(json).toContain('"address":"0x4baadba26c3c0bdef9e8faf173925d463aa53bb2"');
  });

  it('never includes the internal signal_density', () => {
    const withDensity = {
      ...report,
      assessment: { ...report.assessment, signal_density: 0.9 },
    } as AttestableReport;
    expect(canonicalReportJson(withDensity)).not.toContain('signal_density');
  });

  it('hashes the canonical UTF-8 bytes', () => {
    expect(reportHash(report)).toBe(keccak256(toBytes(canonicalReportJson(report))));
  });
});

describe('encodeAttestationData', () => {
  it('round-trips through the schema with severity counts, URI, hash and scope', () => {
    const decoded = decodeAbiParameters(parseAbiParameters(ATTEST_SCHEMA), encodeAttestationData(report));
    expect(decoded).toEqual([
      'high-signal',
      ['dormant_wallet', 'stranded_value'],
      1, // high
      1, // medium
      0, // low
      0, // info
      51799275n,
      '1.0.0',
      reportUri(report.address),
      reportHash(report),
      ATTEST_SCOPE,
    ]);
  });
});

describe('isAttestable', () => {
  const allowlist = new Set(['0x7eae90d4aac511491694e2f1854db54f53d59e92']);

  it('skips thin reports (no flags, low-signal)', () => {
    expect(isAttestable({ address: '0xabc', flagCount: 0, band: 'low-signal' }, allowlist)).toBe(false);
  });

  it('keeps reports with flags or a non-low band', () => {
    expect(isAttestable({ address: '0xabc', flagCount: 1, band: 'low-signal' }, allowlist)).toBe(true);
    expect(isAttestable({ address: '0xabc', flagCount: 0, band: 'mixed' }, allowlist)).toBe(true);
  });

  it('never attests ChainWard-owned wallets', () => {
    expect(
      isAttestable({ address: '0x7EAE90D4AAC511491694E2F1854DB54F53D59E92', flagCount: 3, band: 'elevated' }, allowlist),
    ).toBe(false);
  });
});
