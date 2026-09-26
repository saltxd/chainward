# ChainWard Attest

ChainWard's free risk check files a public report for any Base address: a neutral signal band and every flag it can prove on-chain, each tied to the transactions behind it. **ChainWard Attest publishes those reports as [EAS](https://attest.org) attestations on Base**, so any agent, contract, or indexer can read what ChainWard found about a counterparty from the chain itself and verify it against the full report.

It is never a safety verdict. Every attestation carries that caveat in its own `scope` field.

## On-chain

| | |
|---|---|
| EAS | `0x4200000000000000000000000000000000000021` (Base predeploy) |
| SchemaRegistry | `0x4200000000000000000000000000000000000020` |
| Schema UID | `0x09573690adba41164227b57600aa02061b0ce79dc0655e4c8b36bfe95bb41552` |
| Resolver / revocable | none / yes |
| **Attester** | **`0x5edc6276B89CC185aC8D6A7eCfdE076e1ACf50DF`** — the schema is public, so only trust attestations from this address |
| Recipient | the assessed address |
| refUID | ChainWard's previous attestation for the same address (lineage), else `0x0` |

Schema:

```
string band,string[] flagIds,uint8 highCount,uint8 mediumCount,uint8 lowCount,uint8 infoCount,uint64 asOfBlock,string classifierVersion,string reportURI,bytes32 reportHash,string scope
```

- `band`: `low-signal` · `mixed` · `elevated` · `high-signal`. A count of what surfaced, not a rating.
- `reportURI`: `https://chainward.ai/report/<address>`.
- `reportHash`: `keccak256` of the UTF-8 canonical report JSON (below).
- `scope`: `On-chain behavior only. Absence of flags is not a clearance. Not a safety verdict.`

## Reading it

- **API:** `GET https://api.chainward.ai/api/risk/attestation/<address>` returns the latest attestation (uid, tx, explorer link) plus `canonical_json` and `report_hash`. 404 if the address has never been attested.
- **EAS explorer / GraphQL:** `https://base.easscan.org` — filter by schema UID and recipient.
- **MCP:** the `check_counterparty` tool in [`chainward-mcp-server`](../packages/mcp-server).
- **Example agent:** [`examples/check-counterparty.ts`](../examples/check-counterparty.ts) finds the latest ChainWard attestation for an address, re-reads it from the EAS contract, verifies the report hash, and applies a sample payment policy (`npx tsx examples/check-counterparty.ts 0x…`).

## Verifying a report

`canonical_json` is `{address, as_of_block, band, chain, classifier_version, flags[{evidence,id,severity,source,title}], not_assessed}` with every object's keys sorted and the address lowercased. Hash its UTF-8 bytes with keccak256; the result must equal the attestation's `reportHash`. Implementation: [`packages/decode/src/attestation.ts`](../packages/decode/src/attestation.ts).

## What gets attested

The newest public report per address, when it says something (at least one flag, or a band other than `low-signal`). ChainWard never attests about its own wallets. An internal sort key used on the site is never published.
