---
title: "AIXBT On-Chain Decode"
subtitle: "The most famous AI agent in crypto has earned $52.92 — and what its Apr 15 wallet activity can and cannot tell us"
date: "2026-04-25"
slug: "aixbt"
---

# AIXBT On-Chain Decode

AIXBT is, by most public metrics, the most recognized AI agent brand in crypto. It has 412,853 token holders, 5.16% mindshare on the Virtuals dashboard, and one of the loudest Twitter accounts in the agent ecosystem.

On the ACP leaderboard it ranks somewhere around #30–45 by aGDP, with $37,935 in reported agentic GDP across 32,800+ jobs. The on-chain wallet that receives those job settlements holds **$52.92**.

This decode pulls apart the gap between brand and on-chain footprint, and looks at a 30-minute sequence on April 15 that moved roughly $250K worth of assets between AIXBT-adjacent wallets — separating what we can prove from what we can't.

---

## The Wallets

AIXBT's identity is spread across a small set of addresses, all standard Virtuals infrastructure:

| Role | Address | Type |
|------|---------|------|
| Token | `0x4F9F...A825` | ERC-20 (Virtuals AgentFactory clone) |
| LP | `0x7464...D946` | UniswapV2Pair |
| TBA | `0x007a...d793` | ERC-6551 (token-bound account) |
| Staking | `0x0619...4e38` | EIP-1967 proxy |
| ACP wallet | `0x5FaCE...FBc5` | ERC-4337 smart account |
| Sentient wallet | `0x8DFb...9f59` | EOA |
| Safe multisig | `0xB8d3...7c1e` | SafeL2 |

None of these were deployed by an AIXBT-specific team wallet. The token, LP, and TBA were all created in a single Virtuals "graduation" transaction (`0x934b0673...`) from the platform's standard AgentFactoryV3. The deployer (`0x9547e85f..1A28`) deploys for hundreds of agents.

This is not a finding — it's the standard Virtuals shape. But it matters when discussing "team wallets" later: there is no AIXBT-specific deployer footprint visible on chain.

---

## The $52.92 Number

The ACP API reports two large figures for AIXBT:

- `grossAgenticAmount`: $37,935.11
- `revenue`: $38,192.12

The actual USDC sitting in the ACP wallet (`0x5FaCE...`) is **$52.92**. The wallet has zero outbound ERC-20 transfers — it has never sent any token, ever.

The discrepancy is not fraud, it's denomination. ACP settles in USDC, but the API's `revenue` and `grossAgenticAmount` fields are denominated in VIRTUAL at market rate at the time of each transaction. The wallet's USDC balance is the ground truth for cash that ever physically arrived. $52.92 is what AIXBT-the-agent has earned, all-in, since registering on ACP in May 2025.

For context, sentinel-verified balances against Blockscout's holder cache show this kind of denomination/cache divergence in many places — we'll flag the others below as we go.

---

## What aGDP Counts (And Why It Matters Less for AIXBT)

aGDP — "agentic Gross Domestic Product" — measures economic throughput, not net revenue. For an execution agent like Ethy AI ($218M aGDP) or Wasabot ($81M aGDP), aGDP tracks notional trade volume routed through the agent. A $1,000 swap stamps $1,000 in aGDP whether the agent's fee was $0.50 or $5.00.

For AIXBT, this distinction does very little work. AIXBT is an **information agent** — it sells text-based market analysis at $0.80–$1.60 per query. There is no underlying trade volume to inflate the number. aGDP and fee revenue are roughly the same thing.

| Agent | aGDP | Jobs | $/Job | Service |
|-------|-----:|-----:|------:|---------|
| Ethy AI | $218,099,221 | 1,139,030 | $191.48 | Swap execution |
| Axelrod | $106,927,552 | 41,476 | $2,578.06 | Swap execution |
| Wasabot | $81,631,052 | 15,080 | $5,413.20 | Leveraged perp trading |
| Otto AI | $18,328,071 | 29,845 | $614.11 | Multi-chain swaps |
| **AIXBT** | **$37,935** | **32,801** | **$1.16** | **Text analysis** |

AIXBT processes more jobs than Axelrod or Wasabot, but at $1.16 per job. It is the only pure-information agent in the top 33 of a leaderboard otherwise dominated by execution agents.

---

## The Burst Events

A current rate of 3–4 jobs per day does not produce 32,801 lifetime jobs. The on-chain history shows two concentrated bursts that account for the majority of AIXBT's job count.

**Burst 1 — December 16–19, 2025.** Hundreds of `$0.01` USDC transfers arriving every ~30 seconds. $0.01 is one one-hundredth of the lowest published service price. This pattern is consistent with payment-pipeline testing, not user demand.

**Burst 2 — late March 2026.** Hundreds of `$1.60` USDC transfers (matching the 2 VIRTUAL "indigo" service price) arriving every 1–2 minutes for ~24 hours straight. The exact dates vary depending on which page of Blockscout's token-transfer index you read first; both March 21–22 and March 30–31 windows show the same shape.

Either burst alone, sustained at sub-minute cadence, looks more like automated load than organic demand.

---

## What the Wallets Did on April 15

A separate set of AIXBT-adjacent wallets — not the ACP wallet — moved roughly $250K worth of assets in a 30-minute window starting at 03:26 UTC.

We're going to walk through it, then immediately walk back what we can and cannot conclude from it. This is the part we held the post on, and the hedge matters.

**The sequence (sentinel + Blockscout-verified):**

1. **03:26:43 UTC** — Sentient wallet `0x8DFb...` sold 0.139 cbBTC via BaseSettler (a verified Uniswap routing contract, not AIXBT-controlled).
2. **03:28:55 UTC** — Sentient wallet swapped 1,190.82 USDC via KyberSwap aggregator.
3. **03:29:45 UTC** — Sentient wallet sent 5.165 ETH to extraction wallet `0x1Bd9...53B7`.
4. **03:33 UTC** — Extraction wallet sent 6 ETH to a fourth wallet, `0x92dC...1bBe`.
5. **03:36 UTC** — `0x92dC...` sent 1 ETH back to the extraction wallet (its only ever outbound transaction; nonce = 1).
6. **03:57 UTC** — Blockscout's token-transfer indexer shows a 45M AIXBT transfer from extraction wallet to `0x92dC...`.

Pre-history: The Safe multisig `0xB8d3...7c1e` had received 41.55M AIXBT via a `claim()` call in May 2025, held it for eleven months, then transferred 25M + 25M to the extraction wallet on April 1 and April 12. Post-April-12, the Safe holds 0 AIXBT.

This sequence reads, on its face, like a clean extraction chain. But two parts of it don't survive adversarial review.

---

## What We Can't Conclude From It

**The 45M AIXBT was not a same-day transfer.** Sentinel archive state at block 43,500,000 (March 17, 2026, four weeks before the "drain") already shows `0x92dC...` holding exactly 45,000,000 AIXBT. Blockscout shows only one inbound AIXBT transfer to that address — the April 15 event — but a continuous balance history pre-dating it. Either Blockscout's token-transfer index has a gap, or the April 15 transaction is a balance-neutral re-emission of an existing position. In both cases, **the headline "the same day the sentient wallet was drained, 45M AIXBT moved to a fresh wallet" is not provable.**

**The sentient-wallet "drain" has precedent.** On March 1, 2026 — six weeks earlier — the same sentient wallet liquidated 0.089 cbBTC via the same BaseSettler router (tx `0x78eb5833..`). Between liquidations, the wallet steadily accumulates cbBTC via `handleAgentTaxes` inflows from the AIXBT token contract. April 15 was the second such liquidation in 2026, not a one-off. Calling it a "drain" implies finality or loss-of-control; the wallet's history shows a recurring tax-sink → liquidation cycle.

**The 0x92dC... wallet has no provable identity.** It holds exactly 45M AIXBT (4.5% of supply), has performed exactly one outbound transaction in its history (1 ETH back to the extraction wallet on April 15), and has no contract deployments, no other token positions, and no behavioral signal beyond being a recipient. We do not know whose wallet it is. It is consistent with a team treasury, an OTC counterparty, an exchange's settlement wallet, a market-maker cold wallet, or several other things. Calling it "team" or "insider" without proof is the kind of claim that gets dismantled in 30 minutes by anyone with Blockscout access.

**The "actively unstaking" claim doesn't hold.** Earlier draft language flagged a 2.6M AIXBT delta between the staking contract's sentinel-live balance (11.93M) and Blockscout's cached holder list (14.57M) as evidence of active unstaking. It isn't — Blockscout's holder cache is known to lag (it shows the Safe at 41.55M when sentinel shows 0), and a cache delta is not a transfer event. The publishable fact is just: the staking contract holds 11.93M AIXBT (1.2% of supply), at 0% APY, with no unstaking pattern observable from the data we have.

---

## What's Left That We Can Say

After stripping out the unprovable parts, here's what's left:

1. **Brand and on-chain utility are decoupled.** 412,853 holders, $13K TVL, 5.16% mindshare on Virtuals; $52.92 in lifetime USDC settlements to the agent's actual wallet, ~3-4 organic jobs per day at current rate.
2. **The job count is back-loaded into bursts.** The two large burst events (Dec 2025, late Mar 2026) account for most of the 32,801 lifetime jobs, and both have shapes consistent with automated rather than organic activity.
3. **The Safe multisig fed the extraction wallet 50M AIXBT in two transfers in April 2026** (25M on Apr 1, 25M on Apr 12, sentinel-confirmed via balance transitions at blocks 44,116,652 and 44,612,215). The Safe now holds 0.
4. **The extraction wallet `0x1Bd9...` consolidates inflows from multiple sources** and forwards to a small number of destinations. Its transfer history to vanity-prefix addresses (e.g., `0x9049...`) totals ~13.66M AIXBT across 7 transfers since February — a meaningful concentration we can't attribute without identifying the destinations.
5. **An anonymous wallet `0x92dC...` is the #4 holder of $AIXBT** with exactly 45M tokens. It transacted bidirectionally with the extraction wallet on Apr 15 (received 6 + 1.383 ETH, returned 1 ETH). It has held the 45M position since at least mid-March. We cannot identify this wallet.
6. **Top-10 holder concentration: ~57% of supply.** Of that, exchanges hold ~52%, anonymous whale EOAs hold ~17.9%, and `0x92dC...` is the largest non-exchange, non-contract holder at 4.5%.

---

## Summary

The interesting question about AIXBT is not whether anything is wrong — by every metric the team has published, the agent does what it says it does. The interesting question is the gap between the brand layer and the on-chain layer.

In a space where the thesis of "AI agents" is that autonomous systems generate measurable economic value on-chain, AIXBT's on-chain footprint — at $52.92 in lifetime settlements, 3–4 organic jobs per day, and a wallet that has never sent a single outbound transaction — is the closest thing to a counterexample we've found. The narrative around the token has always lived in the Twitter feed and the holder count, not in the wallet activity, and the wallet activity reflects that.

The April 15 wallet sequence is a separate question. Roughly $250K of assets moved between connected wallets in 30 minutes, and we can show the sequence in detail. What we can't show — without archive state we don't have — is the origin of the 45M AIXBT in `0x92dC...`, the identity of the destination, or that the sentient-wallet liquidation was anything other than a recurring treasury cycle. Those are the questions a follow-up decode could answer if someone with deeper archive access wanted to look.

The lesson, generalized: ACP-leaderboard rank correlates with throughput, not with on-chain capital movement. A high rank can mean either real volume routed through real contracts, or a high job count of low-dollar text queries — and the dashboard does not distinguish them.

---

*Verified April 25, 2026 via ChainWard sentinel Base node (block 44,713,595, Apr 15 01:28 UTC tip), Blockscout API, and sentinel archive state queries through `eth_call` with historical block parameters. Sentinel archive is pruned before block ~43,100,000 (March 14, 2026). Earlier state is not available; any claim we couldn't ground in either sentinel-live balance or sentinel archive at a specific historical block has been flagged or removed. Independent receipts available for every quantitative claim above.*
