# Failure-Mode Verification — butlerliquid-on-chain (round 2)

Verifier: failure-mode
Run at: 2026-07-09T15:14:00Z

## Summary

| Check | Result |
|---|---|
| CSV padding | PASS |
| Fee conflation | PASS |
| N=1 extrapolation | PASS |
| Math reconciliation (incl. API/on-chain trap) | PASS |
| Sample bias | PASS |
| Sample-as-lifetime (full-history) | PASS |
| Destination-chain verification | PASS |

## Failure details

No failures. All seven checks still pass after the four surgical fixes were applied. Per-check re-verification notes below, with explicit attention to the Fix 3 cascade (softened `0xf70da97…` framing) and its interaction with PR #26.

---

### 1. CSV padding — PASS (unchanged)

The two tables in `decode.md` are still tightly anchored to verified data. The "One trade, log by log" table is a 4-row USDC.Transfer decode of tx `0x0b2b0883…`, matching `utility-audit.md` §4 logs 491/493/494/496 exactly. The "Lifetime USDC inbound" table remains a 4-row + total aggregation of cursor-exhausted pagination (485/$43,697 + 708/$364,026 + 968/$189 + 32/$106 = 2,193/$408,017), reconciling to `utility-audit.md` §3. No rows were added or extended past verified data. No standalone CSV in the article.

### 2. Fee conflation — PASS (unchanged)

The $700-example decomposition is untouched by the four fixes: $700.998049 principal, $0.420598 platform 20%, $1.682396 agent 80% (fee sum $2.10), $698.895055 collateral pass-through — each cited to a distinct log. "Agent's take on $700 of notional: **$1.68**" correctly reports the 80% fee-share only and does not conflate with the $698.90 collateral. PaymentManager fixed-fee path preserves the same clean separation ($0.50, $1.00, $0.50 split 80/20 across five sample txs).

### 3. N=1 extrapolation — PASS (unchanged)

Every aggregate claim retains its full-history or ≥N=5 backing:

| Claim | Sample |
|---|---|
| $408,017 inbound / 2,193 txs | Cursor-exhausted, 45 pages |
| $407,992 outbound / 724 txs | Cursor-exhausted, 15 pages |
| 0.2257% median fee rate | N=458 dual-txs of 485 total |
| $359.04 on-chain fee revenue | Full history (485 fee-legs + 968 PM receipts) |
| $274,887 to `0xf70da…` | N=502 outbound txs |
| $103,991 owner extraction | N=19 txs (incl. $100K on 2025-11-18) |
| 968 PaymentManager receipts, $189 | Full history + 5 hand-decoded samples |

The $700 walkthrough and $100K owner tx remain called out as single-tx anecdotes, not headline extrapolations.

### 4. Math reconciliation — PASS (spine intact after fixes)

Fix 1 (frontmatter `$407K → $408K`) is the ONLY revision touching this check, and it moves the frontmatter into agreement with the body's $408,017 figure — reducing internal disagreement, not manufacturing new agreement between on-chain and API.

- Subtitle: "$162K aGDP claimed. $408K USDC through the wallet on Base. On Hyperliquid, every ButlerLiquid-side address returns $0." — still names the three-way contradiction as the finding, offers no derivation.
- Body: on-chain agent-fee revenue = $359.04 vs dashboard `revenue` = $1,627.39 explicitly stated as not-reconcilable ("we do not back-solve. Both numbers reported side by side.").
- aGDP still framed as backend field for HL execution, structurally not verifiable from Base or from agent-side HL addresses.

Verified against `utility-audit.md` §7 "On-chain totals vs dashboard — divergence, not reconciliation."

### 5. Sample bias — PASS (unchanged)

The 0.2257% median-fee claim still cites N=458 dual-transfer txs spanning $0.20 → $1,506.47 (four orders of magnitude, entire Nov 2025 – Apr 2026 active window). Bimodal distribution note (0.10% deposit-side, 0.30% open-side) is empirically supported in `utility-audit.md` §4 sample table. Five hand-decoded PaymentManager fixed-fee txs span three orders of magnitude and all match 80/20.

### 6. Sample-as-lifetime — PASS (unchanged)

Every lifetime/cumulative figure is still backed by cursor-exhausted pagination:

- 2,193 inbound / 45 pages / cursor exhausted (oldest 2025-11-02, newest 2026-05-25)
- 724 outbound / 15 pages / cursor exhausted
- $408,017 inbound total, $407,992 outbound total, $30.76 retained → matches ACP API `walletBalance` to 6 decimals
- Path counts (485 / 708 / 968 / 32) sum to 2,193 (reconciles)
- 502 to `0xf70da…`, 156 to Relay Depository, 19 to owner — all from full paginated dataset

No `?limit=50` slice restated as lifetime. This check is the anti-Degen-Claw guardrail and remains intact.

### 7. Destination-chain verification — PASS (Fix 3 cascade preserved honest uncertainty)

This is the check the retry brief flagged. I re-read the softened paragraph on `0xf70da97…` (decode.md line 93) against the fix directive and PR #26 rules.

**Direct HL queries** (unchanged, still in the article): ACP wallet, ACPRouter, and owner EOA all return $0 accountValue / 0 fills; control address `0x31ca8395…` returns $3,030,921 and $187B lifetime vlm on the same API. API is functioning; all agent-side accounts are empty. Owner's 87 personal fills are correctly categorized as HYPE trading, not agent throughput.

**aGDP framing** (unchanged): "self-reported by Virtuals, un-refuted on Hyperliquid, and structurally not verifiable from either chain on its own" → "not-verifiable, not fake." This is the PR #26 stance. Decode also preserves the honest structural note: "trades land on the client's HL address… 179 HL addresses we cannot enumerate from Base transfer data."

**Fix 3 cascade audit** — the softened `0xf70da97…` framing now reads: "plausibly a smaller CEX, a market-maker hot wallet, or an unattributed high-throughput operator. Not tier-1 CEX-sized once the numbers are right." Verified against the directive and against the destination-chain rule:

- No new attribution is introduced. The prior "Binance-tier CEX" language was removed as instructed; the replacement enumerates three category possibilities with "plausibly" hedging.
- The "Not tier-1 CEX-sized" claim is a size-based category exclusion (not a positive attribution). With the corrected cbBTC ($424K), USDT ($60K), USDC ($2.6M), and ~138 ETH on Base + 384 ETH on mainnet, total observable value is low-single-digit millions — legitimately not tier-1 CEX scale (which would be $100M+).
- The cross-venue implication is preserved as an open question ("Who owns `0xf70da97…`"), not resolved into any specific claim about where the routed collateral ends up.
- The migration to Relay Depository is still framed as an operational routing change, not accusation.

The framing does NOT overclaim in either direction: it does not assert this address is a specific CEX/MM, and it does not assert this address is not one either — it presents three plausible categories and rules out only "tier-1 CEX-sized" based on visible balance evidence. This is the correct application of PR #26.

**Minor observation (out of scope for failure-mode; noted for citation verifier):** the phrase "mid-six-figure balances across USDC / cbBTC / USDT / ETH" slightly undersells the $2.6M USDC and $1.15M mainnet ETH balances (both are 7-figure). Does not create any of the 7 failure modes — it's a citation-scope wording precision issue, not an honest-uncertainty violation.

---

FAILURE_MODE_VERIFIER_DONE: pass=7 correctable=0 fundamental=0
