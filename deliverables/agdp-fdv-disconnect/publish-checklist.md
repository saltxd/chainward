# Publish Checklist — aGDP vs FDV Disconnect

All claims must be verified before publishing. Mark each as confirmed.

---

## Claim-to-Source Map

| Claim | Source | Status |
|---|---|---|
| Ethy AI aGDP = $218.1M | `acpx.virtuals.io/api/agents?sort=grossAgenticAmount:desc` field `grossAgenticAmount` agent id=84 | VERIFIED |
| Ethy revenue = $573K | Same endpoint, field `revenue`, agent id=84 | VERIFIED |
| Ethy tokenAddress = 0xC44141... | Same endpoint, field `tokenAddress` | VERIFIED |
| Ethy FDV = $1.17M | GeckoTerminal `api/v2/networks/base/tokens/0xC44141a684f6AA4E36cD9264ab55550B03C88643` field `fdv_usd` | VERIFIED |
| Ethy 24h vol = $52K | Same GeckoTerminal response, `volume_usd.h24` | VERIFIED |
| Ethy holders = 16,872 | Blockscout `/api/v2/tokens/0xC44141a684f6AA4E36cD9264ab55550B03C88643/counters` field `token_holders_count` | VERIFIED |
| Axelrod aGDP = $106.9M | ACP API agent id=129 | VERIFIED |
| Axelrod FDV = $680K | GeckoTerminal `0x58Db197E91Bc8Cf1587F75850683e4bd0730e6BF` | VERIFIED |
| Wasabot aGDP = $81.6M | ACP API agent id=1048 | VERIFIED |
| Wasabot FDV = $2.15M | GeckoTerminal `0xC2427Bf51d99b6ED0dA0Da103bC51235638eE868` | VERIFIED |
| aixbt aGDP = $37.9K | ACP API agent id=26, rank=34 in dataset | VERIFIED |
| aixbt FDV = $28.5M | GeckoTerminal `0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825` | VERIFIED |
| aixbt 24h vol = $307K | Same GeckoTerminal response | VERIFIED |
| Linear Pearson(aGDP, FDV) = -0.004 | Computed from 33 paired data points (script at /tmp/enriched_agents.json) | VERIFIED |
| Log-log Pearson(aGDP, FDV) = 0.46 | Same computation | VERIFIED |
| Graduated avg FDV = $2.73M | Computed from 13 graduated agents with FDV data | VERIFIED |
| Non-graduated avg FDV = $395K | Computed from 20 non-graduated agents with FDV data | VERIFIED |
| Top-50 combined FDV = $43.4M | Sum of 33 agents with FDV data | VERIFIED |
| Top-10 combined FDV = $11.1M | Sum of top-10 agents with FDV data | VERIFIED |
| $696M total Virtuals cap | app.virtuals.io banner, 2026-04-29 | NOTE: this is self-reported by Virtuals, not independently verified on-chain |
| aixbt = 65.6% of top-50 FDV | $28.5M / $43.4M | VERIFIED (arithmetic) |
| Capminal and Captain Dackie share token | Both have tokenAddress = 0xbfa73370... | VERIFIED |
| x402guard and x402guard_pentester share token | Both have tokenAddress = 0xc4047680... | VERIFIED |

---

## Tone / Framing Check

- [ ] aGDP described as a defined metric (notional volume by design), not as "fake" or "inflated"
- [ ] No adversarial language (dirty, broken, scam, fraud, lie)
- [ ] Claims scoped to this dataset ("top 50 by aGDP", "as of 2026-04-29")
- [ ] Correlation noted as suggestive, not deterministic
- [ ] $696M Virtuals cap flagged as self-reported
- [ ] All tweets under 280 characters
- [ ] aGDP definition quoted from Virtuals glossary

---

## Pre-Publish Technical Checks

- [ ] All token addresses verified to be checksummed correctly in the article
- [ ] "no token" rows confirmed (Otto AI, ButlerLiquid, Degen Claw, test_owl, Betty, Luvi return null tokenAddress from API)
- [ ] GeckoTerminal data noted as live market data (prices will change)
- [ ] Blockscout holder counts noted as of 2026-04-29

---

## Files in this deliverable

- `decode.md` — Full article, renders at `chainward.ai/decodes/agdp-fdv-disconnect`
- `thread.md` — 5-tweet thread draft
- `publish-checklist.md` — This file
- `/tmp/enriched_agents.json` — Raw analysis data (local, not published)
