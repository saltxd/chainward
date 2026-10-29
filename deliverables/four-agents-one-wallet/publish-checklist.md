# Publish checklist: four-agents-one-wallet

**Privacy rule for this file** (it lands in the public repo): no buyer wallet addresses, and no owner name or handle. The owner wallet appears only as its public ACP `ownerAddress`. The raw data (buyer leaderboards, transfer sweeps, overlap files, review notes) stays in the gitignored `data/` and `scripts/` folders.

## Slug

- `four-agents-one-wallet`, final before any post.

## Frontmatter

- title, subtitle (134 characters, under the 140 og:description limit), plain box, date 2026-10-29, slug, seoTitle.

## Review

- **Skeptic round 1 (2026-10-29): publishable with fixes, 8 must-fix and 10 should-fix, all applied.** The second inbound contract is Virtuals' Revenue Network USDC prize drop (identified in our earlier virtuals-top-dog decode), so $36,972.84 is prize money, not buyer revenue. "Mid-size" became top-20 earners. The ACP router leg is the four agents paying for jobs as buyers. The $5.10 third outflow leg is disclosed. Window completeness is scoped and the $67.86 outside-window balance is disclosed. "Near-identical" is softened. The plain box no longer overclaims.
- **Buyer overlap check (2026-10-29).** All twelve Revenue Network buyer leaderboards (four agents, epochs 3 to 5), every page, ranks contiguous, no duplicate wallets. Buyer spend ties to each ranking's revenue to the cent on all twelve; per agent, 80% of spend ties to the PaymentManager USDC to the cent; seller prize shares tie to the prize-drop USDC to the cent.
- **Skeptic round 2 (2026-10-29): publishable with fixes, 5 must-fix, all applied.** The 5,076 dashboard buyers, 4,552 leaderboard entries and 1,152 distinct wallets are reconciled, with about 900 off-leaderboard Synapse buyers disclosed. Lockstep is scoped to the per-week figures. The buyerScore claim is restated as a fixed per-wallet ratio. "Not the owner paying itself" is narrowed to the known addresses. Ranks are stated against the 444 to 546 agents paid each week. An independent recompute from the raw pages reproduced every buyer figure.

## Numbers that must match the data

- USDC in $255,560.94 = PaymentManager $218,588.10 + prize drop $36,972.84. Out = owner $200,864.85 + ACP router $54,690.99 + PaymentManager $5.10. In equals out per wallet inside the window.
- 1,152 distinct buyer wallets; 1,101 paid all four (99.45% of buyer spend); exactly 1 / 2 / 3 / 4 agents: 2 / 1 / 48 / 1,101.
- Identical spend at all four agents: epoch 3 682 of 741, epoch 4 493 of 594, epoch 5 841 of 1,100.
- Controls (epoch 5): Capminal 299 of its top 300 and Captain Dackie 99 of its top 100 are the same wallets (a different owner); eight other top-15 agents share none.

## Privacy and style

- The owner's handle is not printed anywhere. The sweep transaction to the owner is described, not linked. Only the PaymentManager settlement transaction is linked.
- No buyer wallet addresses are published.
- Zero em dashes. Disclosure footer present.

## Build

- `node scripts/build-decode-manifest.mjs` regenerated `apps/api/src/data/decode-manifest.json`.
- `pnpm decode:og-render four-agents-one-wallet` wrote the static `apps/web/public/decodes/four-agents-one-wallet/og.png`.
- Tests: the api `decodeManifest` test and the web suite.

## Verify after Flux rolls

- `/api/health` shows the merge commit.
- `chainward.ai/decodes/four-agents-one-wallet` returns 200.
- `chainward.ai/decodes/four-agents-one-wallet/og.png` returns 200 image/png.
- The page's `og:image` meta points at the static PNG, not `/api/...`.
- `api.chainward.ai/api/public/decodes` lists `four-agents-one-wallet` first.

## Post

- Thread draft in `thread.md`, NOT POSTED. Needs the user's OK; one @chainwardai post per UTC day.
