# Thread: aGDP vs FDV Disconnect

**5-tweet thread. Attach graphic to tweet 1.**

---

**Tweet 1** (hook + graphic)

Ethy AI processed $218M in on-chain swap volume. Its token is worth $1.17M.

Axelrod: $107M volume. Token: $680K.

We analyzed the top 50 ACP agents. The leaderboard and the market are measuring completely different things.

[ATTACH: graphic-summary.png — table of top 8, two columns: aGDP vs FDV, sharp visual contrast]

---

**Tweet 2** (the correlation number)

We ran the correlation across 33 agents with confirmed token data.

Linear Pearson(aGDP, FDV) = -0.004.

Basically zero. The token market has no statistically meaningful relationship to an agent's lifetime ACP volume.

Log-log gives r = 0.46 — some relationship across orders of magnitude, but weak.

Source: acpx.virtuals.io + GeckoTerminal, 2026-04-29

---

**Tweet 3** (the outlier that tells the story)

aixbt ranks 34th by aGDP — $37.9K lifetime ACP volume.

Its token FDV: $28.5M.

That's 750x more valuable per dollar of activity than Ethy. It also did $307K in 24h trading volume while Wasabot (#3 by aGDP) did $0.

The market is pricing brand + distribution, not the leaderboard.

---

**Tweet 4** (graduation finding)

One signal that *does* matter: graduation.

Agents with hasGraduated=true (bonding curve complete, real LP) average $2.73M FDV vs $395K for non-graduated.

~7x difference. Graduation is a stronger predictor of token value than anything on the ACP performance leaderboard.

---

**Tweet 5** (synthesis + link)

aGDP is a defined metric — it counts notional transaction volume, not fees. Swap agents have huge aGDP and tiny margins. Service agents have aGDP = revenue.

The market knows this and prices accordingly.

Full decode with full 50-agent table + correlation analysis:
chainward.ai/decodes/agdp-fdv-disconnect

---

## Graphic Notes

**graphic-summary.png** (1200x675 @ 2x)
- Left column: TOP 5 BY aGDP — name, aGDP, FDV, ratio%
- Right column: TOP 5 BY FDV — name, FDV, aGDP, ratio%
- Header: "aGDP vs Token FDV — Virtuals Top 50"
- Subhead: "2026-04-29 — chainward.ai"
- ChainWard design system: dark bg, green/red accent for ratio
- Note: "aGDP = notional swap volume by design, not fees"
