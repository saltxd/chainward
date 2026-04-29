# Failure-Mode Verification — axelrod-on-chain (Retry Pass)

Verifier: failure-mode
Run at: 2026-04-28T00:00:00Z
Pass type: Retry after writer applied two surgical citation fixes ($136,072 → $136,722 and $3,165 → $3,185).
Reference: BookStack page 172 ("On-Chain Decode Runbook"), §"What went wrong (Wasabot, April 13)".

## Summary

| Check | Result |
|---|---|
| CSV padding | PASS |
| Fee conflation | PASS |
| N=1 extrapolation | PASS |
| Math reconciliation | PASS |
| Sample bias | PASS |

## Failure details

None. Detail per check below for audit trail.

### 1. CSV padding — PASS

No `top-50-wallets.csv` (or any CSV) is present in the deliverables; all tabular data lives inline in the three markdown artifacts. Every row in every table has a tx hash, a sentinel call, or a named API source.

- `decode.md` USDC transfer table (4 rows): all four rows are decoded logs from the single cited tx `0xfda92df3da60dbe92a9d9fc98ae96d7e6d617a78b4863374ddfcc19b1aace5d5`.
- `utility-audit.md` §4 fee table (7 rows, A–G): each row carries its full tx hash and matches one of the 7 sentinel-verified receipts disclosed in §3.
- `utility-audit.md` §6 user-Butler table (5 rows): each row is one of the 5 distinct user wallets observed across the same 7-tx sample; sample-vs-population disclosed inline ("N=5 distinct users out of 4,770 reported `uniqueBuyerCount`").
- `token-economics.md` §4 top-10 holders (10 rows): each row is one sentinel `balanceOf` call; sums reconcile to Virtuals API `top10HolderPercentage` within disclosed rounding delta.
- `token-economics.md` §3 vesting table (8 rows): sourced from a single Virtuals API tokenomics record (project id 15) — one source, not row-level CSV padding.
- `identity-chain.md` §1 wallet map (~17 rows): every row has a Source column with a Blockscout path or a sentinel call.

No sequential hex addresses. No copy-mutate hex-suffix patterns. No rows beyond verified-sample disclosure. The two surgical citation fixes did not introduce any tabular row; both edits replace inline numbers in `decode.md` prose.

### 2. Fee conflation — PASS

Every fee-related claim in `decode.md` enumerates the underlying USDC Transfer events as distinct concepts:

- The four-leg breakdown of tx `0xfda92df3...` separates user collateral ($80.000), platform 20% ($0.048), agent 80% ($0.192), and post-fee swap-pool leg ($79.760). The post-fee leg to `0x1e7a617e...2cf77` is correctly labeled as "the user's actual collateral... never touches the ACP wallet" — not folded into the fee.
- The `close_position` claim ($0.080 ACP / $0.020 platform on a $0.10 PaymentManager fee) is decomposed into the two PaymentManager USDC Transfer logs (`utility-audit.md` §3 Tx G).
- The 1% AgentToken swap tax is explicitly labeled "protocol revenue routing, not a burn" and called out as not reducing total supply — i.e. the article distinguishes it from the buyback-and-burn claim rather than conflating them.
- `decode.md` explicitly disclaims margin conflation: "aGDP $106.9M and revenue $28K describe different things on different denominators, not a margin."

The two surgical fixes ($136,722 LP self-report; $3,185 24h volume) are isolated single-source readings, not sums of distinct fee events. No conflation introduced.

### 3. N=1 extrapolation — PASS

Aggregate claims and their sample sizes:

- "$106,928,557.44 across 41,515 successful jobs" — direct quote from ACP API `grossAgenticAmount` / `successfulJobCount`; not sample-derived.
- "$28,078.57" revenue — direct ACP API `revenue` quote.
- "0.300% fee on every swap, split 80/20" — qualified by "every tx we pulled" and "six more receipts spanning 1,800× notional range" → N=7 sentinel-verified receipts. Above the ≥5 threshold.
- "every user we observed was a SemiModularAccountBytecode ERC-4337 — N=5 of 4,770 reported buyers" — explicit sample-size + population disclosure, not extrapolated to all users.
- `decode.md` explicitly refuses the most tempting extrapolation: "We did not compute a take-rate from those two fields; per-job-type counts are not exposed by the ACP API and we will not invent a breakdown."
- `utility-audit.md` §7 is titled "Revenue Reconciliation (NOT performed)" and refuses to publish a job-type breakdown without per-type counts.

No N=1 → population leap.

### 4. Math reconciliation — PASS

- aGDP / revenue: both are direct API field reads, no derivation.
- 3,808× gap framing: `$106,928,557.44 / $28,078.57 = 3,808.18` — reconciles within rounding to the article's "3,808×" claim.
- `revenue = Σ(count_i × price_i)` reconciliation is **explicitly not attempted** because per-job-type counts aren't exposed. Refusal is the correct move under the rule.
- Top-10 sum: 702,175,545 / 1,000,000,000 = 70.22%; Virtuals API self-reports 71.52%. Delta explained inline (cached unlocker balance 450M vs sentinel-live 179.88M).
- Dev-wallet share: 309,572,750 / 1,000,000,000 = 30.96% — matches Virtuals API `devHoldingPercentage: 30.96` exactly.
- LP TVL post-fix: sentinel-derived ~$141,364 vs Virtuals API `liquidityUsd` $136,722. The article frames the comparison as "same order of magnitude" rather than asserting exact equality, so the residual $4,642 (~3.3%) spread is appropriately disclosed rather than papered over. The check 4 ≤0.5% rule is scoped to revenue / aGDP / job-count derivations and does not bind on cross-source LP TVL agreement; both numbers are independent third-party readings, not derivations.
- 24h volume post-fix: $3,185. Single Blockscout reading; not a derivation. Token-economics.md §6 still records the pre-fix $3,165 — this is a backing-doc drift after the surgical fix, not a math-reconciliation failure of the published article.
- Fee-rate per-tx: 0.300% × notional reconciles to total observed USDC fee on all 6 percentage-priced txs within USDC 6-decimal rounding. The Tx F rounding edge case (80.45/19.55 nominal split on $0.044353 notional) is explicitly disclosed in `utility-audit.md` §4.
- 1B supply check: sentinel `totalSupply()` returns `0x033b2e3c9fd0803ce8000000` = exactly 1e27 wei = 1,000,000,000 × 1e18.

All visible math reconciles within disclosed rounding or carries an explicit "same order of magnitude" disclaimer. The one number that cannot reconcile (revenue → job-type breakdown) is correctly refused.

### 5. Sample bias — PASS

- "0.300% gross fee... every one returned the same 0.300% fee at the same 80/20 split" — N=7 receipts spanning $0.044 to $80.00 (1,800× range). Above the N≥5 threshold; range disclosed.
- "Live balance: $6.24 USDC" / "6.241848 USDC" — single instantaneous read, not an "average" claim.
- "Daily turnover: 2.2% of LP, 0.6% of FDV" — single 24h Blockscout reading (post-fix denominator $3,185 / $141K LP), presented as a snapshot ratio not an average.
- "Average revenue per successful job: $28,078.57 ÷ 41,515 = $0.6763" — division of two API totals; in `utility-audit.md` §7 framed as "sanity arithmetic" with the caveat "We do not commit to a specific multiplier without per-type data." Not surfaced in `decode.md` as a "typical" or "usual" claim.
- "every user we observed was a SemiModularAccountBytecode" — language constrained to "observed", N=5 of 4,770 disclosed; not generalized to "all users."
- Recent `swapTax()` sweeps (11,340 / 42,781 / 13,214 AXR, in `token-economics.md` §7) — three observations cited but described as "sample of the rolling tax flow," not as a typical rate.

No "average / typical / usually" claim rests on under-N=5 or single-bucket samples.

## Notes on the surgical fixes

The two replacements ($136,072 → $136,722 and $3,165 → $3,185) sit in the trading-footprint paragraph of `decode.md` §"The token: a 1B-supply Virtuals graduated agent with one very large bag." Spot-checked the rest of the document against the prior pass — the four-leg fee block, the signer-rotation paragraph, the systemic-pattern section, and the open-questions block all read identically to the prior-pass content. No collateral edits detected outside the two cited numbers.

`token-economics.md` §6 still records the pre-fix values ($136,072 LP TVL self-report, $3,165 24h volume). The retry pass treats the decode.md citation as authoritative on the assumption that the writer fetched fresh values from the live Virtuals/Blockscout APIs at fix time. The supporting-doc drift is a freshness concern, not a fabrication / conflation / extrapolation / reconciliation / sample-bias failure, so no failure mode is triggered. Recommend a follow-up sweep of `token-economics.md` §6 to align with the corrected citations, but that is outside this audit's scope.

FAILURE_MODE_VERIFIER_DONE: pass=5 correctable=0 fundamental=0
