---
title: "Wasabot On-Chain Decode"
subtitle: "$81.6M aGDP, $5.9K revenue — how the ACP dashboard structurally undercounts DeFi agent economics"
date: "2026-04-13"
slug: "wasabot"
---

# Wasabot On-Chain Decode

Wasabot is the ACP-integrated trading agent for Wasabi Protocol, a leveraged perpetual exchange on Base. Users go long or short on majors, memes, and AI agent tokens at up to 10x leverage through the Virtuals Butler.

On the Virtuals ACP leaderboard, Wasabot ranks #3 by aGDP at **$81.63M**. Its reported revenue is **$5,924**. That is a 13,779x gap — the largest of any top-10 agent.

This decode traces the on-chain mechanics behind those numbers.

---

## The Wallet

Wasabot's ACP wallet (`0x5Dfc180212204Fff869d41FAA9f1b430D2036f5D`) is an ERC-4337 smart account with a nonce of 1, zero ETH, and ~$53.60 USDC. All gas is abstracted through a paymaster (`0x2cc0c7...`). The wallet has processed 7,471 token transfers — all ACP coordination micropayments.

---

## How Trades Actually Flow

When a user opens a position through Wasabot, the USDC collateral never touches the ACP wallet. We verified the following architecture via our sentinel Base node:

**Position open ($60 collateral, sentinel-verified):**
```
User 0xcc4188... → Perp Contract 0xa6C9BA... → Pool 0x9bda49...
              $60.00 in                    $60.00 out
              Zero skim at the perp contract
```

**Position close ($0.50, sentinel-verified):**
```
User 0xe12fa9... → Perp Contract → Three outputs:
                    $0.0003 → 0xE968... (platform fee, 0.06%)
                    $0.0012 → counterparty
                    $0.4985 → main payout
```

Opens pass through cleanly. Closes extract a small fee (0.06%–0.10% across the 7 trades we verified) that goes directly to `0xE968...` — the Virtuals platform fee collector. Note: the $0.50 close had additional outputs beyond the fee and main payout — a small amount ($0.0012) routed to a third address we did not fully decompose. This pattern may vary by trade type.

---

## The 80/20 Split Nobody Talks About

Every ACP coordination fee on Virtuals — not just Wasabot's — is split at the PaymentManager contract (`0xEF4364...`):

- **20%** goes to `0xE968...` (Virtuals platform)
- **80%** goes to the agent's wallet

We sentinel-verified this across 5 transactions spanning 2 different agents. The ratio was exactly 4:1 in every case. The 80% recipients were distinct ERC-4337 smart accounts — neither was Wasabot — proving `0xE968...` is a platform-wide fee collector, not Wasabi-specific.

---

## What "$5,924 Revenue" Actually Means

Wasabot has 8 job types. Most charge $0.01 per interaction. The exception is `suggest_trade` at $2.10.

The ACP "Revenue" field represents the agent's 80% share of coordination fees. Reconciled from the API:

- ~3,470 suggest_trade jobs × $1.68 (80% of $2.10) = $5,829.60
- ~11,837 standard jobs × $0.008 (80% of $0.01) = $94.70
- **Total: $5,924.30** (matches API field `revenue: 5924.29`)

This is micropayment revenue for coordination work. It has no relationship to the actual capital flowing through trades.

---

## What "$81.6M aGDP" Actually Means

> **aGDP (Agentic Gross Domestic Product):** Per the Virtuals glossary, aGDP measures the total value of economic activity facilitated by an agent.

For Wasabot, aGDP accumulates from PayableMemoExecuted events emitted by the PaymentManager. We sentinel-verified that these events fire on **both opens and closes** — meaning every round-trip trade stamps aGDP approximately twice.

A user opening a $60 position generates $60 in aGDP. Closing that position generates additional aGDP for whatever flows through on close. The metric structurally counts volume through the agent, not net economic activity.

Average aGDP per job: $81.6M / 15,307 = $5,333. Recent observed trades through the perp contract: $0.50–$60. We could not determine whether early-era trades were orders of magnitude larger (outside both our sentinel's pruning window and Blockscout pagination limits) or whether aGDP captures dimensions beyond collateral flow.

---

## The Close Fee

On position closes, the Wasabi perp contract extracts a fee sent directly to `0xE968...` (the same Virtuals platform address). Across 7 sentinel-verified close transactions:

| Trade Size | Fee | Rate |
|---|---|---|
| $0.50 | $0.0003 | 0.06% |
| $6.00 | $0.006 | 0.10% |
| $10.00 | $0.01 | 0.10% |
| $10.00 | $0.01 | 0.10% |
| $10.00 | $0.01 | 0.10% |
| $15.00 | $0.015 | 0.10% |
| $963.56* | $0.578* | 0.06%* |

*Blockscout-verified only (outside sentinel window).

Fee rate: **0.06%–0.10%** depending on trade parameters we couldn't fully determine. All fees go to `0xE968...`. We found no evidence of a separate Wasabi-controlled fee treasury on-chain.

---

## What We Could Not Determine

1. **aGDP composition.** The $5,333 average aGDP per job vs $0.50–$60 recent trade sizes remains unexplained. Either early trades were massive, or aGDP captures more than just collateral.

2. **Close-fee rate tiers.** 0.06% appeared on the smallest and largest trades; 0.10% on mid-range. Insufficient sample to determine the tier rule.

3. **Wasabi's protocol-level revenue.** All observed fees go to the Virtuals platform address. Where Wasabi Protocol itself earns (vault fees, $BOT tokenomics, off-chain) is not observable on-chain from this data.

4. **Wash trading.** Axelrod's wallet (`0x999a1b60...`) appeared as a recipient in one Wasabot close tx, indicating cross-agent routing. Could not inspect the full 15K+ job history to determine scale.

---

## Summary

The 13,779x gap between aGDP and revenue is not evidence of fraud. It is the predictable result of three compounding factors:

1. **aGDP counts volume, not revenue.** Every dollar of collateral flowing through an open or close stamps aGDP. Revenue counts coordination micropayments.
2. **Both legs count.** Opens and closes both emit PayableMemoExecuted events, so a single round-trip trade contributes ~2x its collateral to aGDP.
3. **The dashboard can't see the close fee.** The 0.06%–0.10% per-close fee goes directly from the perp contract to the Virtuals platform address, bypassing the ACP wallet entirely.

The dashboard presents aGDP and revenue side-by-side without context, inviting a comparison that is structurally meaningless for DeFi-native agents. This is not a Wasabot-specific problem. Any ACP agent that routes capital through an external protocol contract will exhibit the same gap.

---

*Verified April 13, 2026 via ChainWard sentinel Base node and Blockscout API. 12 sentinel-verified transaction receipts, 1 ACP API pull. All claims sourced to specific transaction hashes and block numbers documented in the accompanying findings.*
