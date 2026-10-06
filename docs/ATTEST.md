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
- **Example agent:** [`examples/check-counterparty.ts`](../examples/check-counterparty.ts) finds the latest ChainWard attestation for an address, re-reads it from the EAS contract, verifies the report hash, and applies a sample payment policy (`pnpm install`, then `npx tsx examples/check-counterparty.ts 0x…`).

## Guarding x402 payments

[`examples/x402-guard`](../examples/x402-guard) is an x402 client hook. Before the client signs a payment, it reads ChainWard's latest attestation for the seller's `payTo` address from the EAS contract on Base and refuses to pay if the report carries a high-severity flag. Nothing is signed when it refuses.

```ts
const client = new x402Client().register('eip155:8453', new ExactEvmScheme(account));
client.onBeforePaymentCreation(counterpartyGuard()); // { blockUnknown, maxReportAgeDays, onDecision }
```

`cd examples/x402-guard && npm install && npx tsx demo.ts` runs two local x402 sellers against a guarded buyer: one `payTo` with a high-severity attestation (refused before signing), one without (allowed). No money moves; the demo wallet is empty.

## Pay per check (x402)

Need a report that isn't on-chain yet, or one fresher than the last attestation? `GET https://api.chainward.ai/api/risk/x402?address=<address>` (or `/api/risk/x402/<address>`) answers with a report no older than 24 hours, running a fresh check when needed. It is paid per request over [x402](https://x402.org): **0.05 USDC on Base**, no account, no API key. The first request returns `402` with the payment requirements; an x402 client signs a USDC authorization and retries. Settlement runs through the PayAI facilitator, which pays the gas, and only after the check succeeds: a failed or timed-out check (`>= 400`) is never charged. Send paid requests to `https://api.chainward.ai` directly, not through `chainward.ai/api/…`: a fresh check can take close to a minute.

```
cd examples/pay-per-check && npm install
BUYER_PRIVATE_KEY=0x… npx tsx index.ts 0x…
```

The response is the same report the site shows (`band`, `flags` with evidence and sources, `not_assessed`, `freshness`, and `attestation` when one exists), or `status: "no_history"` for an address with no on-chain activity. Reports that flag observed behavior are attested on Base by the next sweep.

## x402 seller check

`GET https://api.chainward.ai/api/risk/seller-demand?address=<payTo>` (`npx tsx index.ts --seller 0x…` in `examples/pay-per-check`) answers the question an x402 buyer can't answer from volume or buyer counts: **where do this seller's buyers get their USDC?** It samples the address's last 30 days of USDC inflows (up to 1,000 transfers), walks each of its top 30 buyers' funding back through their largest funder up to 4 hops, and reports:

- how many of those buyers, and how much of their volume, trace back to the seller itself (and at how many hops);
- how much USDC the seller sends back to its own buyers;
- whether one wallet is the largest funder of most buyers;
- how concentrated its buyers are.

Walks stop at high-throughput hubs (exchanges, routers, custodians), where a funding trail stops saying anything about the seller. Payments that arrive through a facilitator proxy or another high-throughput sender are reported as `via_intermediary_share` rather than counted as buyers; the payers behind them are not traced. Signals are neutral (`buyers_funded_by_seller`, `money_flows_back`, `common_funder`, `concentrated_buyers`) and describe where money moved, never why; a common funder can be a legitimate faucet or custodian. **0.10 USDC over x402**, not charged if the check fails, cached for an hour. The method is the one behind [the x402-on-Base decode](https://chainward.ai/decodes/x402-on-base); run against the cases there, it reproduces each classification.

## Verifying a report

`canonical_json` is `{address, as_of_block, band, chain, classifier_version, flags[{evidence,id,severity,source,title}], not_assessed}` with every object's keys sorted and the address lowercased. Hash its UTF-8 bytes with keccak256; the result must equal the attestation's `reportHash`. Implementation: [`packages/decode/src/attestation.ts`](../packages/decode/src/attestation.ts).

## What gets attested

The newest public report per address, when all of these hold:

- it was filed in the last 7 days, behind the head-freshness guard (no report built on a stale chain head goes on-chain);
- it carries at least one flag based on observed activity. `inactive_no_history` ("no non-spam ERC-20 transfers in ~30 days") and `activity_truncated` record missing data, not behavior: they fire on token contracts and on busy wallets that only move ETH, so they never go on-chain by themselves;
- the address isn't one of ChainWard's own wallets.

An internal sort key used on the site is never published.

## Revocations

Attestations are revocable, and ChainWard revokes its own when they no longer meet the rules above. The first sweeps attested seventeen reports that fail them: filed before the head-freshness guard existed or weeks old, several flagged only for missing transfers (two of them contracts, USDC's among them). All seventeen were revoked on 2026-09-27 when the gate was tightened (txs `0x6ad9fd68…` and `0x8467f181…`). Revoked attestations stay readable on EAS with `revoked: true`, so always filter on `revoked: false` (the example agent does).

`asOfBlock` is the block the report was read at, not the time it was attested. Check it: `examples/check-counterparty.ts` treats a report older than 30 days as unknown.
