---
title: "The ACP Leaderboard Audit: What 'Last 7D' Actually Measures"
subtitle: "A ChainWard analysis of the top 50 agents by aGDP reveals three distinct data quality patterns hiding behind one column"
date: "2026-04-29"
slug: "acp-leaderboard-audit"
---

## What We Investigated

The Virtuals ACP scan dashboard at `app.virtuals.io/acp/scan` displays a "Last 7D" sparkline column next to each agent. We audited the top 50 agents by `grossAgenticAmount` (aGDP) to answer three questions:

1. What does the "Last 7D" column actually measure?
2. How many agents show N/A in that column despite having recent on-chain activity?
3. What does `lastActiveAt = 2999-12-31` mean, and why does it appear on 38% of the top 50?

**Method:** ACP list API (pages 1-2, sorted `grossAgenticAmount:desc`), ACP detail API (`/api/agents/{id}/details`), ACP daily-metrics API (`/api/metrics/agent/{id}/daily-metrics`), Blockscout counters and token-transfers for all 50 wallets, frontend bundle analysis of `app.virtuals.io/assets/index-BnzB57mX.js`.

---

## Finding 1: "Last 7D" Measures aGDP Accumulation, Not On-Chain Transfers

The sparkline does not plot token transfer count or wallet activity. Reverse-engineering the frontend bundle reveals it calls:

```
https://acpx.virtuals.io/api/metrics/agent/{id}/daily-metrics
```

That endpoint returns four time-series fields:

| Field | What it tracks |
|-------|---------------|
| `past7dVolume` | Cumulative `grossAgenticAmount` snapshots |
| `past7dNumJobs` | Cumulative successful job count snapshots |
| `past7dRevenue` | Cumulative revenue snapshots |
| `past7dUser` | Cumulative unique buyer count snapshots |

These are **running-total snapshots**, not daily deltas. The sparkline plots the slope of `past7dVolume` — i.e., how fast an agent's aGDP is growing this week.

An agent shows "N/A" when the database has no daily snapshots for that agent in the last 7 days. This can happen because:
- The agent migrated to a new metrics tracking system and its historical snapshots were not back-filled
- The agent is new and has not yet accumulated a full week of snapshots
- The agent is genuinely inactive and the metrics job stopped recording it

Critically: an agent can be generating on-chain transfers every hour and still show N/A if its ACP job-processing pipeline is not actively recording daily snapshots.

**Example:** Axelrod (rank #2, $106.9M aGDP) shows a populated sparkline with +14 jobs and +$0.91 revenue in 7 days. Its wallet (`0x999A...24E1`) had 44 token transfers in the 7-day sample window and 284,422 total transfers on chain. The sparkline accurately reflects low job-fee activity. Source: `https://acpx.virtuals.io/api/metrics/agent/129/daily-metrics` (retrieved 2026-04-29).

---

## Finding 2: The 2999-12-31 Sentinel — A Backend Migration Artifact

19 of the top 50 agents (38%) have `lastActiveAt: "2999-12-31T00:00:00.000Z"` in the top-level API response. This looks like a dormancy flag but is not. Every one of these 19 agents also returns `metrics.isOnline: true` and `metrics.minsFromLastOnlineTime: 0` on the same endpoint.

The explanation: Virtuals migrated `lastActiveAt` tracking from a top-level field to the nested `metrics` sub-object. Agents that were registered before the migration retain the sentinel date in the legacy field. The canonical activity timestamp is now `data.metrics.lastActiveAt`.

One behavioral difference: when `metrics.isOnline = true`, `metrics.lastActiveAt` returns the current server timestamp on every request (confirmed by pulling the same agent twice, 3 seconds apart, and observing the timestamp advance by 3.4 seconds). When `metrics.isOnline = false`, it returns the fixed last-seen time.

**What this means for the dashboard:** The "Last Active" tooltip (if any) reading from the top-level field would show "year 2999" for 38% of the top leaderboard. The sparkline column itself is independent of this field and reads from `daily-metrics` instead.

---

## Finding 3: Chain vs. Dashboard Mismatch Count

Of the 50 agents audited, 22 had at least one token transfer in the 7-day sample window via Blockscout (`/api/v2/addresses/{wallet}/token-transfers`, 50-transfer sample per wallet). Of those 22:

- **14** show `lastActiveAt = 2999-12-31` (sentinel, not a dormancy indicator)
- **8** show a real but stale date (more than 7 days ago) in the top-level field

That is **22 of 22 on-chain-active agents** have misleading top-level `lastActiveAt` data. Zero of the 22 active agents have a fresh, accurate top-level `lastActiveAt` date.

The `daily-metrics` sparkline fares better but still has gaps: of the 22 chain-active agents sampled, 14 returned no sparkline data (all nulls from `daily-metrics`), while 8 had populated sparklines with job deltas consistent with chain activity.

### Wallet State Table (Top 50, key fields)

| Rank | Name | Sentinel? | Chain 7d xfers | daily-metrics data | Chain total xfers |
|------|------|-----------|----------------|-------------------|-------------------|
| 1 | Ethy AI | no | 3 | NO | 1,138,715 |
| 2 | Axelrod | YES | 44 | YES (+14 jobs) | 284,422 |
| 3 | Wasabot | YES | 6 | YES (vol only) | 15,244 |
| 4 | Otto AI | YES | 50 | YES (+33 jobs) | 30,801 |
| 5 | Luna | YES | 0 | NO | 119,826 |
| 8 | Nox | YES | 50 | YES (+252 jobs) | 87,434 |
| 9 | Capminal | YES | 4 | YES (null delta) | 11,975 |
| 13 | WhaleIntel | YES | 3 | NO | ~0 (ERC-4337) |
| 15 | Degen Claw | YES | 6 | YES (+142 jobs) | 18,453 |
| 34 | aixbt | YES | 7 | YES (+2 jobs) | 24,581 |
| 45 | ArAIstotle | YES | 3 | YES (null delta) | 78,863 |

*Source: Blockscout `/api/v2/addresses/{wallet}/token-transfers` (50-transfer sample), retrieved 2026-04-29. "Chain 7d xfers" = count within 7-day window in 50-sample.*

---

## Finding 4: The April 11 Batch Airdrop Contamination

21 agents in the top 50 show `chain_latest_transfer = 2026-04-11T04:11:xx`. Investigation reveals all 21 received the same inbound `disperseToken` call for the HUB token:

- **Tx:** `0x4c111e27464e5eb01c848607ff82c0495b1a21952238bb3fa94211a5b30aeebd`
- **From:** `0xD152f549545093347A162Dce210e7293f1452150`
- **Method:** `disperseToken` (batch airdrop)
- **Token:** HUB (`0xFa31F55B07B9fA29aD909fA744B4f96CF8839457`)

For agents whose chain latest activity is this batch airdrop, the wallets have had zero self-generated on-chain activity since at least April 11. These are genuinely inactive agents whose "chain latest transfer" is an inbound airdrop they did not initiate.

This is relevant context when interpreting transfer counts: Blockscout token-transfers includes both inbound and outbound. An agent that appears "recently active" on chain may only have received an airdrop.

---

## Finding 5: The Degen Claw Revenue Anomaly

Degen Claw (rank #15, `0xd478...781A`) has:
- `grossAgenticAmount`: $88,615
- `revenue`: $1.05
- Chain total token transfers: 18,453
- Sparkline: active (daily-metrics shows +142 jobs in 7d)

The ratio of revenue to aGDP is approximately 0.0000012%, compared to agents like Capminal ($121K revenue on $178K aGDP) or Finwizz ($119K revenue on $119K aGDP). aGDP counts notional trading volume by design (per Virtuals' own glossary). Degen Claw appears to be routing large trading volume through its execution path while collecting near-zero job fees. This is not a data error — it reflects an agent business model that prioritizes volume over fee capture.

---

## Finding 6: totalJobs = null Across All 50 Agents (Detail API Bug)

Every one of the 50 agents returns `"totalJobs": null` from the `/api/agents/{id}/details` endpoint. The same data is available as `totalJobCount` in the list response (`/api/agents?...`). For Ethy AI, `totalJobCount` = 1,147,916 on the list endpoint but `totalJobs` = null on the detail endpoint.

This is an API field naming inconsistency. Any integration consuming the detail endpoint for job count will receive null data for all agents.

---

## Summary

| Question | Answer |
|----------|--------|
| What does "Last 7D" sparkline measure? | aGDP (grossAgenticAmount) accumulation rate, sourced from `/api/metrics/agent/{id}/daily-metrics` — NOT on-chain transfer count |
| How many agents mislabeled? | 22/50 chain-active agents have stale or sentinel top-level `lastActiveAt`; 14/22 have no sparkline data despite chain activity |
| What does 2999-12-31 mean? | Backend migration artifact; those agents have correct activity data in `metrics.lastActiveAt` (nested field) |
| Is revenue/jobs data populated? | `revenue` populated for 49/50; `totalJobs` null for 50/50 (detail endpoint field name bug) |

**Verification sources:** ACP API at `https://acpx.virtuals.io/api/`, Blockscout at `https://base.blockscout.com/api/v2/`, frontend bundle `https://app.virtuals.io/assets/index-BnzB57mX.js`. All data retrieved 2026-04-29.
