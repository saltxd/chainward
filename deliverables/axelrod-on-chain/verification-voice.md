# Voice Verification — axelrod-on-chain

Verifier: voice (ADVISORY)
Run at: 2026-04-28T00:00:00Z

> Note: Canonical voice spec at `~/.claude/projects/-Users-mburkholz-Forge/memory/feedback_voice_chainward_threads.md` was not found. Searched `~/.claude/` and `~/.claude/projects/` — no matching file. Falling back to `/home/mburkholz/Forge/chainward/deliverables/aixbt/decode.md` for tone calibration as instructed (no `tweet.md` exists in the aixbt directory; the decode lead/closer were used as the tonal reference). Scores below should be treated as best-effort against an inferred SOLD-era pattern: assertive (no hedges), receipts-driven, first-person ("I/we pulled / I checked"), short punchy sentences, ALL-CAPS emphasis used surgically, explicit naming of what's provable vs. unprovable, no softeners ("approximately," "appears," "seems"), no AI-speak transitions ("furthermore," "in conclusion," "it is worth noting").

## Summary

| Unit | Score |
|---|---|
| Tweet 1 (hook) | 5/5 |
| Tweet 2 (one-tx walkthrough) | 5/5 |
| Tweet 3 (7-receipt corroboration) | 5/5 |
| Tweet 4 (aGDP correction) | 5/5 |
| Tweet 5 (open question + closer) | 4/5 |
| Article lead | 4/5 |
| Article closer ("Open questions" + verification footer) | 4/5 |

Average: 4.6/5. Low units (≤3): 0.

## Per-unit notes

### Tweet 1 (hook) — 5/5

`$106.9M.` cold open, hard number first. `ZERO.` in caps — earned, not gratuitous. "I checked every dead address on my own node" — first-person receipts move. "Total supply hasn't moved a wei." — assertion with a specific unit. No hedges. Strong.

### Tweet 2 (architecture) — 5/5

"Pulled one $80 swap off my node to show you. Tx 0xfda92df3." — receipts-first, no preamble. The bullet split is concrete and the punchline ("less than a quarter of one percent") lands. No softeners.

### Tweet 3 (corroboration) — 5/5

"Wanted to make sure I wasn't crazy" — perfect SOLD-era texture, conversational without being cute. "Every. Single. One." — earned emphasis. "The mechanism is rigid. The agent literally cannot skim more." — assertion, not hedge. Strong.

### Tweet 4 (aGDP correction) — 5/5

"Real talk:" + "WRONG." — directly assertive. "ALWAYS read what the field actually counts." — opinion delivered as a rule, which is the SOLD register. Names what aGDP measures vs. revenue cleanly. No fence-sitting.

### Tweet 5 (open question + decode link) — 4/5

"Couldn't crack: who controls 0xaa3189f4." — strong; explicit limit-of-knowledge is on-brand. "Original signer rotated out Feb 4 in 7 minutes flat." — punchy. "On-chain we can prove authority, not identity." — exemplary.

Minor: "Next decode is whichever team that wallet belongs to." reads slightly committee-passive. Optional surgical fix:

Found: "Next decode is whichever team that wallet belongs to."
Suggested: "Next decode: whoever holds that key."

(Not required — score is 4, not ≤3. Listed for completeness.)

### Article lead (lines 8–21) — 4/5

Strong overall: opens with hard numbers, quotes the launch deck verbatim, then `balanceOf` reads with raw hex, lands "The buyback-and-burn has not happened." as a flat assertion. The "verifiably, across every tx we pulled" phrase is exactly the SOLD register.

Slight ding: line 10's "puts it ahead of Wasabot and Otto AI by an order of magnitude in throughput" is correct but reads a half-step formal — the rest of the lead is more direct. Not a rewrite candidate; flagging only as the reason for 4 vs. 5.

### Article closer ("Open questions" + verification footer, lines 96–106) — 4/5

The "Open questions" section is on-voice: "We can prove it has authority; we cannot prove who holds the key." is canonical SOLD-era. Naming three specific unknowns (wallet control, fee settlement paths, dev-wallet flows) without speculation is exactly right.

The verification footer (line 106) is necessarily denser/more technical. "Independent receipts available for every quantitative claim above." closes hard. The footer is fit-for-purpose but is the most formal block in the piece — that's appropriate for a methodology footer and not a defect, hence 4 not 3.

## Suggested rewrites

None required. No unit scored ≤3. Tweet 5 has one optional tightening noted above.

VOICE_VERIFIER_DONE: avg_score=4.6 low_units=0
