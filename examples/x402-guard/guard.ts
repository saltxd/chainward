/**
 * counterpartyGuard — an x402 client hook that checks who you're about to pay.
 *
 * Before the client signs a payment, it looks up ChainWard's latest EAS
 * attestation for the seller's `payTo` address on Base, re-reads it from the
 * EAS contract, and refuses to pay when the report carries a high-severity
 * flag. Nothing is signed when it refuses, so no money moves.
 *
 *   const client = new x402Client().register('eip155:8453', new ExactEvmScheme(account));
 *   client.onBeforePaymentCreation(counterpartyGuard());
 *
 * Attestations describe on-chain behavior, not intent; absence of flags is not
 * a clearance. Docs: docs/ATTEST.md
 */
import type { BeforePaymentCreationHook } from '@x402/core/client';
import {
  createPublicClient,
  decodeAbiParameters,
  getAddress,
  http,
  parseAbi,
  parseAbiParameters,
  type Hex,
  type PublicClient,
} from 'viem';
import { base } from 'viem/chains';

const BASE_MAINNET = 'eip155:8453';
const EAS = '0x4200000000000000000000000000000000000021';
const SCHEMA_UID = '0x09573690adba41164227b57600aa02061b0ce79dc0655e4c8b36bfe95bb41552';
// The schema is public; only this attester's attestations are ChainWard's.
const CHAINWARD_ATTESTER = '0x5edc6276B89CC185aC8D6A7eCfdE076e1ACf50DF';
const SCHEMA =
  'string band,string[] flagIds,uint8 highCount,uint8 mediumCount,uint8 lowCount,uint8 infoCount,uint64 asOfBlock,string classifierVersion,string reportURI,bytes32 reportHash,string scope';
const BLOCKS_PER_DAY = 43_200n; // Base: one block every 2 seconds

const EAS_ABI = parseAbi([
  'struct Attestation { bytes32 uid; bytes32 schema; uint64 time; uint64 expirationTime; uint64 revocationTime; bytes32 refUID; address recipient; address attester; bool revocable; bytes data; }',
  'function getAttestation(bytes32 uid) view returns (Attestation)',
]);

export interface CounterpartyVerdict {
  address: string;
  /** flagged: high-severity flag on record · no-high-flags: attested, none high (not a clearance) · unknown: never attested · stale: report too old */
  status: 'flagged' | 'no-high-flags' | 'unknown' | 'stale';
  band?: string;
  flagIds?: readonly string[];
  highCount?: number;
  asOfBlock?: bigint;
  explorerUrl?: string;
}

export interface GuardOptions {
  /** Refuse sellers with a high-severity flag on record. Default true. */
  blockFlagged?: boolean;
  /** Refuse sellers ChainWard has no current attestation for. Default false. */
  blockUnknown?: boolean;
  /** Reports older than this count as unknown. Default 30. */
  maxReportAgeDays?: number;
  /** Base RPC for re-reading the attestation. Default: viem's public Base RPC. */
  rpcUrl?: string;
  /** Called with every decision, e.g. for logging. */
  onDecision?: (verdict: CounterpartyVerdict, allowed: boolean) => void;
}

async function latestUid(recipient: string): Promise<Hex | null> {
  const res = await fetch('https://base.easscan.org/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `query ($schema: String!, $recipient: String!, $attester: String!) {
        attestations(
          where: { schemaId: { equals: $schema }, recipient: { equals: $recipient },
                   attester: { equals: $attester }, revoked: { equals: false } }
          orderBy: [{ time: desc }], take: 1
        ) { id }
      }`,
      variables: { schema: SCHEMA_UID, recipient, attester: CHAINWARD_ATTESTER },
    }),
  });
  const json = (await res.json()) as { data?: { attestations: Array<{ id: Hex }> } };
  return json.data?.attestations[0]?.id ?? null;
}

/** ChainWard's current read on an address, straight from the EAS contract on Base. */
export async function lookupCounterparty(
  address: string,
  client: PublicClient,
  maxReportAgeDays = 30,
): Promise<CounterpartyVerdict> {
  const target = getAddress(address);
  const uid = await latestUid(target);
  if (!uid) return { address: target, status: 'unknown' };

  // The indexer only finds the uid; trust comes from the contract.
  const att = await client.readContract({ address: EAS, abi: EAS_ABI, functionName: 'getAttestation', args: [uid] });
  if (att.attester !== CHAINWARD_ATTESTER || att.schema !== SCHEMA_UID || att.revocationTime !== 0n) {
    return { address: target, status: 'unknown' };
  }
  const [band, flagIds, highCount, , , , asOfBlock] = decodeAbiParameters(parseAbiParameters(SCHEMA), att.data);
  const verdict = {
    address: target,
    band,
    flagIds,
    highCount,
    asOfBlock,
    explorerUrl: `https://base.easscan.org/attestation/view/${uid}`,
  };
  const age = (await client.getBlockNumber()) - asOfBlock;
  if (age > BigInt(maxReportAgeDays) * BLOCKS_PER_DAY) return { ...verdict, status: 'stale' };
  return { ...verdict, status: highCount > 0 ? 'flagged' : 'no-high-flags' };
}

/** An x402 `onBeforePaymentCreation` hook that refuses to pay flagged counterparties. */
export function counterpartyGuard(options: GuardOptions = {}): BeforePaymentCreationHook {
  const { blockFlagged = true, blockUnknown = false, maxReportAgeDays = 30, rpcUrl, onDecision } = options;
  const client = createPublicClient({ chain: base, transport: http(rpcUrl) }) as PublicClient;
  const cache = new Map<string, Promise<CounterpartyVerdict>>();

  return async ({ selectedRequirements }) => {
    // ChainWard attests on Base; other networks pass through untouched.
    if (selectedRequirements.network !== BASE_MAINNET) return;
    const payTo = getAddress(selectedRequirements.payTo);
    if (!cache.has(payTo)) cache.set(payTo, lookupCounterparty(payTo, client, maxReportAgeDays));
    const verdict = await cache.get(payTo)!;

    const refuse =
      (verdict.status === 'flagged' && blockFlagged) ||
      ((verdict.status === 'unknown' || verdict.status === 'stale') && blockUnknown);
    onDecision?.(verdict, !refuse);
    if (!refuse) return;

    const detail =
      verdict.status === 'flagged'
        ? `high-severity flag on record (${verdict.flagIds?.join(', ')}) as of block ${verdict.asOfBlock}: ${verdict.explorerUrl}`
        : `no current ChainWard attestation (${verdict.status})`;
    return { abort: true, reason: `counterparty ${payTo}: ${detail}` };
  };
}
