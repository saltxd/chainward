/**
 * check-counterparty — read ChainWard's risk attestation for an address from
 * Base (EAS), verify it, and apply a payment policy. A starting point for any
 * agent that pays other addresses (x402, ACP, plain transfers).
 *
 *   npx tsx examples/check-counterparty.ts 0x…
 *
 * Only dependency: viem. Docs: docs/ATTEST.md
 */
import {
  createPublicClient,
  decodeAbiParameters,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  toBytes,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';

const EAS = '0x4200000000000000000000000000000000000021';
const SCHEMA_UID = '0x09573690adba41164227b57600aa02061b0ce79dc0655e4c8b36bfe95bb41552';
// The schema is public — anyone can attest with it. Trust ChainWard's attester only.
const CHAINWARD_ATTESTER = '0x5edc6276B89CC185aC8D6A7eCfdE076e1ACf50DF';
const SCHEMA =
  'string band,string[] flagIds,uint8 highCount,uint8 mediumCount,uint8 lowCount,uint8 infoCount,uint64 asOfBlock,string classifierVersion,string reportURI,bytes32 reportHash,string scope';

const EAS_ABI = parseAbi([
  'struct Attestation { bytes32 uid; bytes32 schema; uint64 time; uint64 expirationTime; uint64 revocationTime; bytes32 refUID; address recipient; address attester; bool revocable; bytes data; }',
  'function getAttestation(bytes32 uid) view returns (Attestation)',
]);

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

async function main(): Promise<void> {
  const target = getAddress(process.argv[2] ?? '');
  const client = createPublicClient({ chain: base, transport: http() });

  const uid = await latestUid(target);
  if (!uid) {
    console.log(`No ChainWard attestation for ${target}.`);
    console.log('Policy: unknown counterparty → review manually, or run a free check at https://chainward.ai');
    return;
  }

  // Re-read from the EAS contract itself — the indexer is only used to find the uid.
  const att = await client.readContract({ address: EAS, abi: EAS_ABI, functionName: 'getAttestation', args: [uid] });
  if (att.attester !== CHAINWARD_ATTESTER || att.schema !== SCHEMA_UID || att.revocationTime !== 0n) {
    throw new Error(`attestation ${uid} is not a live ChainWard attestation`);
  }

  const [band, flagIds, high, medium, low, info, asOfBlock, , reportURI, reportHash, scope] =
    decodeAbiParameters(parseAbiParameters(SCHEMA), att.data);

  // Verify the full report (evidence + "not assessed" list) against the on-chain hash.
  const api = await fetch(`https://api.chainward.ai/api/risk/attestation/${target}`).then((r) => r.json());
  const verified = keccak256(toBytes(api.data.canonical_json)) === reportHash;

  console.log(`ChainWard on ${target} (as of block ${asOfBlock}):`);
  console.log(`  band ${band} · flags ${flagIds.join(', ') || 'none'} · high ${high} / medium ${medium} / low ${low} / info ${info}`);
  console.log(`  report ${reportURI} · hash ${verified ? 'verified' : 'MISMATCH'}`);
  console.log(`  ${scope}`);

  // Example policy — yours to change. Flags describe behavior, not intent.
  if (!verified) console.log('Policy: hash mismatch → do not rely on this attestation.');
  else if (high > 0) console.log('Policy: high-severity flag on record → hold the payment for review.');
  else console.log('Policy: no high-severity flags on record → proceed under your normal limits.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
