---
title: "BridgeKitty: 595 Daily Jobs, Zero On-Chain Footprint"
subtitle: "A top-10 agent on the Virtuals ACP scan dashboard has never sent a transaction on Base — across two wallets, an owner address, and every endpoint we could query"
date: "2026-05-16"
slug: "bridgekitty-on-chain"
---

## TLDR

On 2026-05-16, the Virtuals ACP "Scan / Agents" view at `app.virtuals.io/acp/scan/agents` ranked **BridgeKitty** at #3 by aGDP for the day: **$56.11 aGDP, 4 offerings, 595 jobs, 1 unique user, 100% success rate.** That made BridgeKitty's 595 jobs ~31% of the entire day's 1,926 ACP jobs network-wide.

We then queried every BridgeKitty-related address we could resolve, against every ACP API endpoint we could find, and against Base via Blockscout and our sentinel node.

Every other source returns zero:

- **2** ACP agent records named `bridgekitty` (ids `39920` and `40009`), both with the same owner
- **2** ACP wallets, **1** owner wallet — all 3 have 0 transactions, 0 token transfers, 0 gas usage on Base
- **6** ACP API endpoints queried, all return `totalJobCount: 0` / empty time series
- **0 ETH, 0 USDC** in either ACP wallet at the decode block

The dashboard's headline number does not match anything that we could verify against the chain or against the discoverable APIs that power adjacent views. That gap — and what plausibly explains it — is the entire decode.

> Framing: this is not "BridgeKitty is fake." A perfectly reasonable explanation is that BridgeKitty is an off-chain MCP service whose "jobs" are query signals that never need to settle on Base. The point is what the *leaderboard* is measuring when it puts that number in front of readers next to agents that *do* settle on Base. Same column, different units.

---

## What we Investigated

A reader viewing the screen at `app.virtuals.io/acp/scan/agents` on 2026-05-16 sees BridgeKitty at #3 daily. The agent's own ACP detail page (`/acp/agent/{documentId}`) lists no completed jobs and no transactions. So which number is right?

To answer that we resolved every BridgeKitty wallet, owner, and contract, and queried each one against:

- ACP list API — `https://acpx.virtuals.io/api/agents?filters[name][$containsi]=bridgekitty`
- ACP detail API — `/api/agents/{id}/details`
- ACP per-agent metrics — `/api/metrics/agent/{id}` and `/api/metrics/agent/{id}/daily-metrics`
- ACP top-agents — `/api/metrics/top-agents` (the endpoint that powers leaderboard cards)
- ACP unique-pairs — `/api/jobs/unique-pairs` (job pair listings)
- ACP engagements — `/api/agents/{id}/engagements`
- Base via our sentinel node at block ~31,950,000 (eth_getBalance, eth_call USDC.balanceOf, eth_getTransactionCount, eth_getCode)
- Blockscout — `/api/v2/addresses/{addr}/counters`, `/token-transfers`, `/internal-transactions`

---

## Finding 1: Two BridgeKitty Records, One Owner, Zero Differentiation

ACP list API returns **two** records matching `bridgekitty`, both created on 2026-03-24 by the same owner address. Both sit in the `OPENCLAW` cluster. Only one carries the descriptive text.

| Field | Record 39920 | Record 40009 |
|---|---|---|
| `id` | 39920 | 40009 |
| `documentId` | `hhns6mzddmgb6rfdn880ites` | `h5dc02h77a5aat97ugu3j8gp` |
| `name` | `bridgekitty` | `bridgekitty` |
| `description` | `null` | *"Cross-chain bridge aggregator MCP server for AI agents. One server, 5 bridge backends, best routes across EVM, Solana, and Cosmos chains."* |
| `walletAddress` | `0xA40B7f0FBcB428D21c6383f621ebC702c16411BE` | `0x4c3006438Ef048e8A1E3AfA1B38113b7501FAd1c` |
| `ownerAddress` | `0x44e7cb3f38abaf1a7448cf40bd7ee19e3678ecad` | `0x44e7cb3f38abaf1a7448cf40bd7ee19e3678ecad` |
| `cluster` | `OPENCLAW` | `OPENCLAW` |
| `contractAddress` | `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` | `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` (ERC1967Proxy, verified) |
| `successfulJobCount` | 0 | 0 |
| `totalJobCount` | 0 | 0 |
| `transactionCount` | 0 | 0 |
| `uniqueBuyerCount` | 0 | 0 |
| `walletBalance` | "0" | "0" |
| `grossAgenticAmount` | 0 | 0 |
| `revenue` | 0 | 0 |

It is not clear from the public API which of the two records the dashboard's #3 entry refers to. Both are equally empty on the agent table.

---

## Finding 2: All Three Addresses Are Untouched On Base

Sentinel node (`eth_getTransactionCount`, `eth_getBalance`, `eth_call` to USDC `0x8335…2913`) and Blockscout (`/counters`) agree on every wallet:

| Address | Role | nonce | ETH | USDC | Blockscout txs | Token transfers | Internal txs |
|---|---|---|---|---|---|---|---|
| `0x4c30…Fad1c` | Record 40009 ACP wallet | 1 | 0 | 0 | 0 | 0 | — |
| `0xA40B…11BE` | Record 39920 ACP wallet | — | — | 0 | 0 | 0 | — |
| `0x44e7…ecad` | Owner (both records) | — | — | — | 0 | 0 | 0 |

Nonce 1 on a "smart account" can be misleading — ERC-4337 accounts often show nonce 1 while having millions of user-operation transfers (see our [ACP leaderboard audit](/decodes/acp-leaderboard-audit) for the WhaleIntel example). The way to defeat that ambiguity is to check Blockscout's `transactions_count` and `token_transfers_count`, which count every value-moving operation including ERC-4337 user-ops. Both counters are `0` for both BridgeKitty wallets and for the owner. There is no version of "this account is active on Base" that is consistent with these counters.

The contract at `0xa6C9BA86…9df0` (recorded as `contractAddress` on both BridgeKitty records) is the OPENCLAW cluster's `ERC1967Proxy` — an upgradeable proxy used by the cluster, not a per-agent contract. Its activity is shared across all OPENCLAW agents, not attributable to BridgeKitty.

---

## Finding 3: Every API Surface Returns Zero

We queried five different ACP API endpoints across both BridgeKitty record IDs. Every one returns zero or empty:

| Endpoint | Result |
|---|---|
| `/api/agents?filters[name][$containsi]=bridgekitty` | 2 records, both `totalJobCount: 0` |
| `/api/agents/40009/details` | `totalJobCount: 0`, `transactionCount: 0`, `successfulJobCount: 0`, `metrics.isOnline: false` |
| `/api/agents/40009/engagements` | `data: []` |
| `/api/metrics/agent/40009` | `volume: 0, grossAgenticAmount: 0, revenue: 0, successfulJobCount: 0` |
| `/api/metrics/agent/40009/daily-metrics` | `past7dVolume: [], past7dNumJobs: [], past7dUser: [], past7dRevenue: []` |
| `/api/metrics/top-agents` (31 days of top-5 per day) | No `bridgekitty` row in any day's jobs or volume series |

Adjacent agents on the same daily view (HyperSage at $222 aGDP, OctodamusAI at $16 aGDP, Rafli Enroller at $11 aGDP) similarly do not appear in `top-agents` — that endpoint truncates to top 5 + "Other", so absence from it does not contradict the daily view. What does contradict the daily view is the agent's *own* records: detail, metrics, daily-metrics, and engagements all report nothing happened, ever.

---

## Finding 4: The Economics Don't Fit On-Chain Settlement Anyway

$56.11 aGDP ÷ 595 jobs = **$0.0943 per job**. Base mainnet gas for a single USDC `transfer` runs roughly $0.0005–$0.003 depending on congestion — economically possible for the agent operator, but the total ACP settlement flow (job-create, accept, work-submit, payment-release) typically costs $0.01–$0.03 per job at current Base prices in the receipts we've reviewed for other agents. At a 9.4¢ job price, on-chain settlement consumes 30–60% of the agent's gross — usable but tight.

Combined with the description ("MCP server for AI agents... best routes across EVM, Solana, and Cosmos") the most parsimonious read is: BridgeKitty is a query-serving MCP endpoint, the "595 jobs" are MCP requests for bridge route quotes, and they don't settle on Base for the same reason that "list my files" doesn't settle on Base — there's nothing to settle.

That is a reasonable product. It is not what readers see when they look at the same column that contains Ethy AI, Axelrod, and Wasabot — all agents whose lifetime job counts and gross volumes are verifiable on Blockscout in the hundreds of thousands to millions of transfers each (see the [acp-leaderboard-audit decode](/decodes/acp-leaderboard-audit) for the per-agent transfer counts).

---

## Finding 5: We Could Not Identify the Endpoint Powering the Dashboard's Daily View

This is the honest part. We grepped the Virtuals frontend bundle at `https://app.virtuals.io/assets/index-eo2NWYzX.js` (8.0 MB) for every API path. We tried `/api/v1/scan/*`, `/api/scan/*`, `/api/metrics/*`, `/api/leaderboard*`, `/api/agents` with every `period`, `window`, `view`, `scope`, `aggregation`, and `sort` query parameter we could think of. Nothing reproduces the daily view's "595 jobs, $56.11 aGDP, 1 unique user" for BridgeKitty.

Three possibilities:

1. **Separate dashboard service**: the `/acp/scan/*` route is served by a backend service whose endpoint is not embedded in the main bundle (probably loaded as a Vite chunk on route entry).
2. **MCP-side ledger**: BridgeKitty's MCP server reports job counts directly to a Virtuals ingestion endpoint that bypasses the standard `agents` and `metrics` tables. The standard tables stay at zero because nothing settled on-chain.
3. **Reporting bug**: the dashboard is reading from a counter that includes signaling traffic (heartbeats, capability advertisements, route queries) and labeling them "jobs."

We can't distinguish between these without backend access. What we *can* say is that the standard public API surface and the chain itself are mutually consistent and contain no record of the activity that the dashboard advertises.

---

## What This Pairs With

We've now shipped four decodes that touch the same underlying question — *what is the "aGDP" / "jobs" column actually measuring?*

| Decode | What it shows |
|---|---|
| [The ACP Leaderboard Audit](/decodes/acp-leaderboard-audit) | The "Last 7D" sparkline measures cumulative aGDP snapshots, not on-chain transfers. 22/22 sampled chain-active agents have stale or sentinel `lastActiveAt`. |
| [aGDP vs FDV: the Virtuals Disconnect](/decodes/agdp-fdv-disconnect) | aGDP and FDV are unrelated metrics — high aGDP agents can have tiny token caps and vice versa. |
| [OpenGradient On-Chain Decode](/decodes/opengradient-on-chain) | A top-trending agent token with $0 ACP revenue — real product traction lives on a separate L1 bridge. |
| **BridgeKitty** (this) | A top-daily agent with **no on-chain footprint and no record in any agent-level API**. |

The cumulative message isn't that any of these agents is bad. It's that "aGDP" and "Jobs" on the Virtuals dashboard are sums of several distinct things that mostly don't share units, and the column doesn't disclose which kind you're looking at on any given row.

---

## What Would Change Our Read

If Virtuals or BridgeKitty's operator publishes any of the following, the framing here shifts immediately:

- A breakdown of the 595 daily jobs by phase (REQUEST / NEGOTIATE / EVALUATE / TRANSACTION) — knowing how many actually reach the on-chain TRANSACTION phase would explain the gap.
- The endpoint URL that produces the daily-view aggregation, so independent verifiers can reproduce.
- Disclosure that "jobs" includes off-chain MCP signaling, with a separate column for on-chain-settled jobs.

We'd happily update this decode with that information.

---

## Verification

All data retrieved 2026-05-16 between 14:00 and 15:30 UTC. Sentinel block ~31,950,000.

- ACP list API: `https://acpx.virtuals.io/api/agents?filters[name][$containsi]=bridgekitty`
- ACP detail (40009): `https://acpx.virtuals.io/api/agents/40009/details`
- ACP detail (39920): `https://acpx.virtuals.io/api/agents/39920/details`
- ACP per-agent metrics: `https://acpx.virtuals.io/api/metrics/agent/40009`
- ACP daily metrics: `https://acpx.virtuals.io/api/metrics/agent/40009/daily-metrics`
- ACP top-agents (31-day series): `https://acpx.virtuals.io/api/metrics/top-agents`
- Blockscout counters (wallet 40009): `https://base.blockscout.com/api/v2/addresses/0x4c3006438Ef048e8A1E3AfA1B38113b7501FAd1c/counters`
- Blockscout counters (wallet 39920): `https://base.blockscout.com/api/v2/addresses/0xA40B7f0FBcB428D21c6383f621ebC702c16411BE/counters`
- Blockscout counters (owner): `https://base.blockscout.com/api/v2/addresses/0x44e7cb3f38abaf1a7448cf40bd7ee19e3678ecad/counters`
- Cluster proxy contract: `https://base.blockscout.com/api/v2/addresses/0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0`
- Sentinel: `ssh cw-sentinel` → `eth_getBalance` / `eth_call` USDC at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Frontend bundle: `https://app.virtuals.io/assets/index-eo2NWYzX.js` (8,069,097 bytes)
- Dashboard screenshot: `app.virtuals.io/acp/scan/agents`, captured 2026-05-16 ~13:42 UTC (Daily view, Agents tab)

> Disclosure: ChainWard itself appears as a $10 aGDP entry on the same daily list (rank #9, 1 unique user, 1 job — that one job is a self-test against our own buyer wallet to verify the seller loop end-to-end). That number is real and on-chain; the limitation we're pointing out elsewhere on the page is structural, not relative.
