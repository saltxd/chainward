# Writer Retry Brief — butlerliquid-on-chain

Round-1 verification: citation 62/66 PASS, 4 FAIL/correctable, 0 fundamental. Failure-mode 7/7 PASS. Voice 4.7/5. Apply the surgical fixes below to `decode.md` (and to `tweet.md` if any numbers propagated). Do NOT rewrite the article. Do NOT add new claims or research. Every fix is either a literal number change or a small prose adjustment forced by a number change.

---

## Fix 1 (correctable) — Frontmatter subtitle "$407K" is inconsistent with body "$408,017"

**Where:** `decode.md` line 3, in the frontmatter `subtitle` field.

**Current:** `"$162K aGDP claimed. $407K USDC through the wallet on Base. On Hyperliquid, every ButlerLiquid-side address returns $0."`

**Fix:** Change `$407K` → `$408K`. The body of the decode already says `$408,017` on line 10; the frontmatter should round consistently.

---

## Fix 2 (correctable) — Rank-3 whale transfer count is stale ($12,908 → 13,012 as of re-verify)

**Where:** the paragraph in the "Token economics" section that describes the 18.39% holder as "a Base-ecosystem sniper wallet with 12,908 lifetime token transfers".

**Fix:** Change `12,908` → `13,000+` (a hedged figure survives future drift on this live-updating counter). Keep the rest of the sentence.

---

## Fix 3 (correctable, cascading) — `0xf70da97…` cbBTC balance overclaimed 1000× ($416M → $424K); this WEAKENS the "major CEX hot wallet" framing

**Where:** the paragraph that inventories `0xf70da97…`'s Base holdings (currently reads: "holding $2.6M USDC, $416M CBBTC-equivalent, $60K USDT, 210 ETH on Base plus 384 ETH on mainnet").

**Primary number fix:** Change `$416M CBBTC-equivalent` → `$424K CBBTC-equivalent`. Root cause was a units mixup — the actual raw balance is 6.726 cbBTC × ~$63K = ~$424K, not $416M.

**Cascading prose fix (mandatory):** The paragraph currently uses the (implied) massive cbBTC number to justify calling `0xf70da97…` a "major CEX hot wallet" / tier equivalent to Binance/Bybit/OKX. A wallet with $2.6M USDC + $424K cbBTC + $60K USDT + 138 ETH on Base is NOT that tier. **You MUST soften or remove the "major CEX / Binance-tier hot wallet" framing.** The honest read is: high-velocity un-labelled EOA with mid-6-figure holdings across USDC/cbBTC/USDT/ETH — plausibly a smaller CEX, a market-maker hot wallet, or an unattributed high-throughput operator. Frame it that way. Do NOT keep the "Binance/Bybit/OKX-tier" language once the $416M number is corrected downward.

**Also update tweet 5** if it names this wallet or hints at the size ("17M-tx un-labelled EOA that ate $275K of ButlerLiquid's collateral before the flow migrated to Relay") — the collateral figure ($275K) is still correct, but if the tweet's "next decode is whichever CEX that is" language implies a top-tier CEX, either soften ("whoever runs that address") or leave it as a stated open question without the CEX assumption. Do not remove tweet 5 entirely.

---

## Fix 4 (correctable) — `0xf70da97…` ETH balance overclaimed ("210 ETH on Base" → 138 ETH)

**Where:** same paragraph as Fix 3.

**Fix:** Change `210 ETH on Base` → `~138 ETH on Base`. This is not a units mixup, just a stale number — the writer's inherited figure was already wrong. Round down and hedge with `~`. Leave "384 ETH on mainnet" untouched (verifier did not re-fetch mainnet; not falsified).

---

## What NOT to change

- All 62 PASS claims. Do not touch them.
- Voice, prose flow, section structure — these all passed. Do not rewrite.
- Any claim the verifier marked PASS with drift notes (LP TVL $18,057, HL control $3,030,921) — the verifier explicitly approved these as time-of-research values.
- Failure-mode verification passed all 7 checks. Do NOT re-frame the destination-chain narrative or the $162K-vs-$408K spine — the honest-uncertainty framing is what saved this decode.

## After you fix

Re-emit the completion sentinel exactly:
```
WRITER_DONE: /home/mburkholz/Forge/chainward/deliverables/butlerliquid-on-chain/decode.md /home/mburkholz/Forge/chainward/deliverables/butlerliquid-on-chain/tweet.md
```
