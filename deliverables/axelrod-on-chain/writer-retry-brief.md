# Writer Retry Brief — axelrod-on-chain

The citation verifier flagged 2 correctable claims in the first draft. Both are continuously-drifting market-data fields. Apply the surgical fixes below to `decode.md`. Do NOT touch any other text. Do NOT re-research. Do NOT change tone. Do NOT touch `tweet.md` (the failures are in decode.md only, and the tweet thread does not surface either of these two specific values).

After applying these fixes, re-emit `decode.md` and `tweet.md` (the latter unchanged).

## Fix 1 — Virtuals API `liquidityUsd`

- Failed claim: "$136,072"
- Verified value at re-fetch: $136,722
- Surgical fix: change the figure "$136,072" to "$136,722" wherever it appears in `decode.md`. The surrounding sentence ("Virtuals API's own `liquidityUsd` reports... — same order of magnitude") stays intact.

## Fix 2 — 24h volume

- Failed claim: "$3,165"
- Verified value at re-fetch: $3,185
- Surgical fix: change "$3,165" to "$3,185" wherever it appears in `decode.md`.

## Hard constraints for this retry

- Frontmatter (title, subtitle, date, slug) must remain identical.
- Every other claim already PASSED (51 of 53). Do not modify them.
- The 5-tweet thread did not fail anything. Re-emit `tweet.md` byte-identical to the prior version.
- Voice verifier (advisory, non-blocking) scored the draft 4.6/5 average with zero low units. No voice changes needed.
- After saving, end with the standard sentinel:
  `WRITER_DONE: /home/mburkholz/Forge/chainward/deliverables/axelrod-on-chain/decode.md /home/mburkholz/Forge/chainward/deliverables/axelrod-on-chain/tweet.md`
