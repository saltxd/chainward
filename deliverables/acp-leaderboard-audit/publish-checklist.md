# Publish Checklist: ACP Leaderboard Audit

## Claim → Source Map

| Claim | Source | Verified? |
|-------|--------|-----------|
| "Last 7D" sparkline reads from `/api/metrics/agent/{id}/daily-metrics` | Frontend bundle `https://app.virtuals.io/assets/index-BnzB57mX.js` — search `past7dVolume` | YES |
| Fields: past7dVolume, past7dNumJobs, past7dRevenue, past7dUser | Same bundle, same search | YES |
| 19/50 agents have sentinel lastActiveAt = 2999-12-31 | ACP list API `https://acpx.virtuals.io/api/agents?pagination[page]=1&pageSize=25&sort=grossAgenticAmount:desc` + page 2 | YES |
| All 19 sentinel agents have metrics.isOnline=True | `/api/agents/{id}/details` endpoint, metrics sub-object, confirmed for all 19 | YES |
| metrics.lastActiveAt advances in real-time when isOnline=True | Two consecutive pulls of agent 129 (Axelrod), timestamps differed by ~3.4s | YES |
| 22/50 chain-active agents have stale/sentinel top-level lastActiveAt | Blockscout `/api/v2/addresses/{wallet}/token-transfers` (50-sample) cross-matched with ACP | YES |
| Ethy AI: 1,138,715 total token transfers | Blockscout `https://base.blockscout.com/api/v2/addresses/0xfc9f1fF5eC524759c1Dc8E0a6EBA6c22805b9d8B/counters` | YES |
| Ethy AI active on 2026-04-29T19:27 UTC | Blockscout token-transfers, first item timestamp | YES |
| Ethy AI lastActiveAt = April 8 (stale) | ACP detail `/api/agents/84/details` — top-level and metrics.lastActiveAt both show April 8, isOnline=False | YES |
| April 11 04:11 cluster = disperseToken batch airdrop | Blockscout token-transfers for ASCII Artist (0x1E16...) — method=disperseToken, from=0xD152..., token=HUB | YES |
| April 11 airdrop tx hash | `0x4c111e27464e5eb01c848607ff82c0495b1a21952238bb3fa94211a5b30aeebd` via Blockscout | YES |
| 21 agents share the April 11 04:11 timestamp | Cross-reference of chain_latest_transfer values across all 50 | YES |
| totalJobs = null on detail endpoint for all 50 | `/api/agents/{id}/details` responses, field `totalJobs`, all null | YES |
| totalJobCount available in list response | `/api/agents?...` list response, field `totalJobCount` — e.g., Ethy AI = 1,147,916 | YES |
| Degen Claw: $88,615 aGDP, $1.05 revenue | ACP list response, rank #15, id=8654 | YES |
| Degen Claw: 18,453 total transfers | Blockscout `/api/v2/addresses/0xd478a8B40372db16cA8045F28C6FE07228F3781A/counters` | YES |
| Degen Claw sparkline: +142 jobs | `/api/metrics/agent/8654/daily-metrics` — past7dNumJobs delta | YES |
| Axelrod sparkline: +14 jobs, +$0.91 revenue in 7d | `/api/metrics/agent/129/daily-metrics` retrieved 2026-04-29 | YES |

## Pre-Publish Checks

- [ ] All wallet addresses double-checked against ACP list endpoint (no manual typos)
- [ ] Ethy AI counters re-pulled within 24h of publish (balance/count changes)
- [ ] "Last 7D = N/A" framing checked against live dashboard before publish
- [ ] aGDP explained as defined metric (notional volume by design) — NOT described as "inflated"
- [ ] sentinel pattern described as migration artifact — NOT described as "dormancy flag" or "hidden"
- [ ] No adversarial language (scam, lying, fake, broken) in main article
- [ ] All tweets under 280 characters (verify with character counter)
- [ ] Article does not claim ALL agents have this issue — scoped to "top 50 by aGDP, 2026-04-29"

## Ambiguities to Note

- The daily-metrics sparkline plots CUMULATIVE snapshots. We inferred "slope of aGDP" from the data shape. Virtuals has not published documentation for this endpoint. Label as "observed behavior."
- WhaleIntel (rank #13) shows chain_total_transfers = 0 from counters but has recent token-transfers in sample. Likely an ERC-4337 smart account where `transactions_count` is 0 but `token_transfers_count` would differ. Not investigated further.
- "22/50 mislabeled" uses 50-transfer sample from Blockscout. Some agents may have activity beyond sample window. This is a lower bound on chain-active count, not an upper bound on mislabeling.
