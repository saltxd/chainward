import {
  encodeAbiParameters,
  encodePacked,
  keccak256,
  parseAbi,
  parseAbiParameters,
  toBytes,
  zeroAddress,
  type Hex,
} from 'viem';
import type { RiskAssessment, RiskBand, RiskFlag } from './risk-flags.js';

// ChainWard Attest — a risk report published as an EAS attestation on Base.
// Shared by the indexer (writes attestations) and the api (serves the exact
// canonical JSON so anyone can recompute the attested hash).
// Design: docs/ATTEST.md

/** EAS + SchemaRegistry are OP-stack predeploys at fixed addresses on Base. */
export const EAS_ADDRESS = '0x4200000000000000000000000000000000000021' as const;
export const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020' as const;

export const ATTEST_SCHEMA =
  'string band,string[] flagIds,uint8 highCount,uint8 mediumCount,uint8 lowCount,uint8 infoCount,uint64 asOfBlock,string classifierVersion,string reportURI,bytes32 reportHash,string scope';

/** Registered with no resolver, revocable — the UID is fully determined by these. */
export const ATTEST_SCHEMA_UID = keccak256(
  encodePacked(['string', 'address', 'bool'], [ATTEST_SCHEMA, zeroAddress, true]),
);

/** Travels with every attestation so the caveat can't be stripped by reading only the chain. */
export const ATTEST_SCOPE =
  'On-chain behavior only. Absence of flags is not a clearance. Not a safety verdict.';

export const EAS_ABI = parseAbi([
  'struct AttestationRequestData { address recipient; uint64 expirationTime; bool revocable; bytes32 refUID; bytes data; uint256 value; }',
  'struct AttestationRequest { bytes32 schema; AttestationRequestData data; }',
  'function attest(AttestationRequest request) payable returns (bytes32)',
  'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)',
]);

export const SCHEMA_REGISTRY_ABI = parseAbi([
  'struct SchemaRecord { bytes32 uid; address resolver; bool revocable; string schema; }',
  'function register(string schema, address resolver, bool revocable) returns (bytes32)',
  'function getSchema(bytes32 uid) view returns (SchemaRecord)',
]);

export interface AttestableReport {
  address: string;
  chain: string;
  asOfBlock: number;
  classifierVersion: string;
  assessment: Pick<RiskAssessment, 'band' | 'flags' | 'not_assessed'>;
}

export function reportUri(address: string): string {
  return `https://chainward.ai/report/${address.toLowerCase()}`;
}

export function easScanUrl(uid: string): string {
  return `https://base.easscan.org/attestation/view/${uid}`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/**
 * The exact bytes that get hashed into `reportHash`. Only the fields a reader
 * needs to verify the claim — never the internal `signal_density`.
 */
export function canonicalReportJson(r: AttestableReport): string {
  const flags = r.assessment.flags.map((f: RiskFlag) => ({
    id: f.id,
    severity: f.severity,
    title: f.title,
    evidence: f.evidence,
    source: f.source,
  }));
  return JSON.stringify(
    sortKeys({
      address: r.address.toLowerCase(),
      chain: r.chain,
      as_of_block: r.asOfBlock,
      classifier_version: r.classifierVersion,
      band: r.assessment.band,
      flags,
      not_assessed: r.assessment.not_assessed,
    }),
  );
}

export function reportHash(r: AttestableReport): Hex {
  return keccak256(toBytes(canonicalReportJson(r)));
}

export function encodeAttestationData(r: AttestableReport): Hex {
  const count = (s: RiskFlag['severity']) => r.assessment.flags.filter((f) => f.severity === s).length;
  return encodeAbiParameters(parseAbiParameters(ATTEST_SCHEMA), [
    r.assessment.band,
    r.assessment.flags.map((f) => f.id),
    count('high'),
    count('medium'),
    count('low'),
    count('info'),
    BigInt(r.asOfBlock),
    r.classifierVersion,
    reportUri(r.address),
    reportHash(r),
    ATTEST_SCOPE,
  ]);
}

/** Thin reports (no flags, low-signal) say nothing worth putting on-chain, and
 * ChainWard never attests about its own wallets. */
export function isAttestable(
  r: { address: string; flagCount: number; band: RiskBand | string },
  selfAllowlist: Set<string>,
): boolean {
  if (selfAllowlist.has(r.address.toLowerCase())) return false;
  return r.flagCount > 0 || r.band !== 'low-signal';
}
