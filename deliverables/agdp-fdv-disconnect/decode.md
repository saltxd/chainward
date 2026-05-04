---
title: "aGDP vs FDV: The Virtuals Disconnect"
subtitle: "The top three ACP agents generated $406M in lifetime trading volume. Their tokens are worth $4M combined. Here's what the chain shows."
date: "2026-04-29"
slug: "agdp-fdv-disconnect"
---

## Overview

Virtuals Protocol operates two parallel products: ACP (Agent Commerce Protocol, where AI agents execute paid jobs) and Capital Markets (ERC-20 tokens for each agent). Both publish headline numbers. The question this decode asks is straightforward: does the market care about ACP performance?

The answer, across all 50 top-ranked ACP agents, is: barely — and only at the lower end of the range.

All data sourced from `acpx.virtuals.io/api` (ACP leaderboard and agent details), GeckoTerminal API (token market data), and Blockscout `base.blockscout.com/api/v2` (holder counts). As of 2026-04-29.

---

## Definitions

Before the numbers, one important definition from Virtuals' own glossary at `whitepaper.virtuals.io`:

> **aGDP (Agentic Gross Domestic Product):** The total notional value of all transactions facilitated by an agent. For swap agents, this counts the value of tokens swapped — not the fee captured.

aGDP is a volume metric by design, not a revenue metric. Virtuals also reports **revenue** separately as the actual fees collected from successful jobs. Both fields are present in the API. Both are used in this analysis.

---

## Top 20 Agents by aGDP

*Sources: ACP API `acpx.virtuals.io/api/agents?sort=grossAgenticAmount:desc`, GeckoTerminal API for FDV/volume, Blockscout `/api/v2/tokens/{addr}/counters` for holder counts. Market data as of 2026-04-29.*

| # | Name | aGDP | Revenue | Symbol | FDV | 24h Vol | Holders |
|---|------|------|---------|--------|-----|---------|---------|
| 1 | Ethy AI | $218.1M | $573K | ETHY | $1.17M | $52K | 16,872 |
| 2 | Axelrod | $106.9M | $28K | AXR | $680K | $0 | 52,746 |
| 3 | Wasabot | $81.6M | $6K | BOT | $2.15M | $0 | 4,453 |
| 4 | Otto AI | $18.3M | $2K | — | no token | — | — |
| 5 | Luna | $907K | $700K | LUNA | $6.13M | $5K | 420,163 |
| 6 | Sympson | $420K | $2K | SYMP | $95K | $0 | 70,875 |
| 7 | Director Lucien | $263K | $263K | LUCIEN | $147K | $0 | 2,065 |
| 8 | Nox | $190K | $76K | NOX | $350K | $9K | 4,325 |
| 9 | Capminal | $179K | $121K | CAP | $347K | $2K | 9,956 |
| 10 | ButlerLiquid | $162K | $2K | — | no token | — | — |
| 11 | ASCII Artist | $126K | $92K | ASC2A | no price | $0 | 242 |
| 12 | Finwizz | $119K | $119K | FIN | $35K | $3K | 979 |
| 13 | WhaleIntel | $114K | $115K | WINT | $156K | $0 | 10,823 |
| 14 | x402guard | $93K | $93K | X40G | $214K | $0 | 4,958 |
| 15 | Degen Claw | $89K | $1 | — | no token | — | — |
| 16 | AgentPulse | $81K | $81K | PULSE | $14K | $0 | 241 |
| 17 | Hyperbet | $75K | $81K | HBET | $314K | $0 | 3,821 |
| 18 | MORSE | $72K | $72K | MORSE | $98K | $0 | 2,335 |
| 19 | Loky | $65K | $65K | LOKY | $218K | $0 | 97,734 |
| 20 | test_owl | $63K | $30 | — | no token | — | — |

The two largest entries in this table by a wide margin — Ethy ($218M aGDP) and Axelrod ($107M aGDP) — are swap routing agents. Their aGDP represents the notional value of tokens moved through their routes, not fees collected. Ethy's documented revenue for the same period is $573K; Axelrod's is $28K.

---

## Token Coverage

Of the top 50 ACP agents by aGDP:

- **6 agents** have no tokenAddress at all (Otto AI, ButlerLiquid, Degen Claw, test_owl, Betty, Luvi)
- **11 agents** have a tokenAddress registered but returned no price data from GeckoTerminal (likely pre-bonding curve or zero liquidity)
- **33 agents** have a tokenAddress with confirmed FDV data

The token field is present in `acpx.virtuals.io/api/agents/{id}/details` as `tokenAddress`. Graduation status (`hasGraduated`) indicates whether the bonding curve has been completed and a real LP exists.

---

## Correlation: Does aGDP Predict FDV?

Computed across the 33 agents with both aGDP and confirmed FDV data.

| Metric pair | Linear Pearson r | Log-log Pearson r |
|---|---|---|
| aGDP vs FDV | -0.004 | 0.46 |
| Revenue vs FDV | 0.096 | 0.25 |

**Linear correlation is essentially zero** (r = -0.004). If you plot aGDP on one axis and FDV on the other, it looks like noise.

**Log-log correlation is moderate** (r = 0.46). This says: across orders of magnitude, bigger agents *tend* to have bigger tokens — but the relationship is loose and noisy. A log-log r of 0.46 with 33 data points is not a strong predictive signal. It would not pass a useful trading threshold.

Revenue vs FDV is even weaker (r = 0.25 log-log), meaning actual earned fees are a worse predictor of token value than raw volume.

---

## Outlier Scan

### High aGDP, Low FDV (the market is ignoring performance)

| Name | aGDP | FDV | FDV/aGDP |
|---|---|---|---|
| Ethy AI | $218.1M | $1.17M | 0.54% |
| Axelrod | $106.9M | $680K | 0.64% |
| Wasabot | $81.6M | $2.15M | 2.63% |

The top three ACP agents by lifetime volume collectively show a token-to-activity ratio under 3%. Ethy processed $218M in swap volume; its token FDV is $1.17M. Axelrod processed $107M; its token is valued at $680K. These three agents account for roughly 94% of all aGDP in the top 50, but their combined token FDV is approximately $4M — under 10% of the total token value held in the top-50 agent set.

### Low aGDP, High FDV (the market is pricing something else)

| Name | aGDP | FDV | FDV/aGDP |
|---|---|---|---|
| aixbt | $37.9K | $28.5M | 750x |
| ArAIstotle | $21.7K | $1.85M | 85x |
| Luna | $907K | $6.13M | 6.8x |

**aixbt** is the clearest example of a token valued almost entirely on factors outside of ACP performance. It ranks 34th by aGDP ($37.9K lifetime) but holds the largest FDV of any agent in the top 50 at $28.5M. aixbt is also the only agent with meaningful 24-hour trading volume ($307K) — roughly 6x Ethy's despite processing 5,750x less ACP activity. Its token represents 65.6% of the total FDV held across all top-50 agent tokens.

---

## Graduated vs Non-Graduated

Agents with `hasGraduated: true` (bonding curve completed, real LP active) show meaningfully higher token values:

| Group | Count | Avg FDV | Median FDV |
|---|---|---|---|
| Graduated | 13 | $2.73M | $218K |
| Non-graduated | 20 | $395K | $35K |

Graduation is a stronger predictor of FDV than aGDP. The avg FDV for graduated agents is ~7x higher than non-graduated, while aGDP order does not drive a comparable split. Note that the graduated group includes aixbt and Luna, which skew the average significantly upward.

---

## Concentration

Of the $696M total Virtuals ecosystem market cap (as reported by app.virtuals.io):

- The top 50 ACP agents' tokens account for approximately **$43.4M** in combined FDV — **6.2%** of ecosystem total
- The top 10 ACP agents' tokens account for approximately **$11.1M** — **1.6%** of ecosystem total
- aixbt's token alone accounts for **$28.5M** of that top-50 total, or **4.1%** of the full ecosystem cap

This suggests the large majority of Virtuals ecosystem value is held in agents and tokens outside the top ACP performers — or is concentrated in the VIRTUAL governance token rather than individual agent tokens.

---

## Notable Data Quirks

**Shared token addresses:** Two pairs of agents in the top 50 share the same tokenAddress:
- Capminal (rank 9) and Captain Dackie (rank 21) both resolve to `0xbfa73370...`
- x402guard (rank 14) and x402guard_pentester (rank 29) both resolve to `0xc4047680...`

This means the FDV and holder counts for these pairs are identical in the table — the token is shared, not distinct.

**Revenue vs aGDP divergence:** For swap agents like Ethy, Axelrod, and Wasabot, the revenue/aGDP ratio is extremely low (Ethy: 0.26%, Axelrod: 0.026%). For service agents — Director Lucien ($263K revenue on $263K aGDP, a 100% ratio), WhaleIntel ($115K on $114K), Finwizz ($119K on $119K) — revenue and aGDP are nearly identical. This reflects the definitional difference: pure-service agents have aGDP = their fee revenue, while swap agents have aGDP = notional flow.

---

## Synthesis

The Virtuals Capital Market and the ACP leaderboard are measuring different things, and the market is treating them that way.

aGDP ranks agents by throughput — a useful operational metric for understanding which agents are handling the most activity. But the top three agents by aGDP are all swap routers, and swap routing volume has an inherently low fee margin. The market, in assigning FDV, appears to price a combination of: brand recognition, social following (aixbt is the clearest case), token distribution breadth (Luna has 420K holders vs Ethy's 17K), and graduation status — not the aGDP leaderboard ranking.

The log-log correlation of 0.46 shows there is *some* relationship — the market is not completely ignoring on-chain activity. But the linear correlation of -0.004 makes clear that raw aGDP number has essentially no predictive power for token valuation. An agent ranking first by aGDP can have a smaller token than one ranked 34th.

---

## Verification Notes

All sources are queryable and reproducible:

| Claim | Source |
|---|---|
| ACP agent list, aGDP, revenue | `https://acpx.virtuals.io/api/agents?sort=grossAgenticAmount:desc&pagination[pageSize]=50` |
| tokenAddress, hasGraduated per agent | `https://acpx.virtuals.io/api/agents/{id}/details` |
| FDV, 24h volume, price | `https://api.geckoterminal.com/api/v2/networks/base/tokens/{addr}` |
| Holder counts | `https://base.blockscout.com/api/v2/tokens/{addr}/counters` |
| Market data timestamp | 2026-04-29, approximately 18:00 UTC |
| $696M total Virtuals cap | app.virtuals.io homepage banner, same date |
