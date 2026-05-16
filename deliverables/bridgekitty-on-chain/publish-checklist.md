# BridgeKitty Publish Checklist

Every claim in `decode.md` mapped to its source. Source URLs/commands retrieved 2026-05-16 14:00–15:30 UTC.

## Headline / dashboard claims

| Claim in decode | Source |
|---|---|
| "#3 by aGDP, $56.11 aGDP, 4 offerings, 595 jobs, 1 unique user, 100% success rate" | Screenshot of `app.virtuals.io/acp/scan/agents` Daily view, 2026-05-16 13:42 UTC. Saved as `dashboard-2026-05-16.png` (to add). |
| "1,926 daily jobs network-wide" | Same screenshot, "No. of Jobs Daily" headline card. |
| "595 / 1,926 = 30.89%" (called ~31% in copy) | Arithmetic on dashboard values. |

## Agent record claims

| Claim | Source |
|---|---|
| Two `bridgekitty` records (ids 39920 and 40009) | `curl 'https://acpx.virtuals.io/api/agents?filters[name][$containsi]=bridgekitty'` → returns 2 records |
| Both same owner `0x44e7…ecad` | `ownerAddress` field on both records |
| Both created 2026-03-24 | `createdAt` field on both records |
| Both in `OPENCLAW` cluster | `cluster` field on both records |
| Description text | `description` field on record 40009 only |
| Wallet A `0x4c30…Fad1c` for record 40009 | `walletAddress` on record 40009 |
| Wallet B `0xA40B…11BE` for record 39920 | `walletAddress` on record 39920 |
| `totalJobCount: 0` on both | Detail endpoint `/api/agents/{id}/details` |
| `transactionCount: 0` on both | Detail endpoint, top-level field |
| `successfulJobCount: 0` on both | `metrics.successfulJobCount` |
| `walletBalance: "0"` on both | Top-level field |

## On-chain claims (Blockscout)

| Claim | Source |
|---|---|
| Wallet A: 0 transactions, 0 token transfers, 0 gas usage | `https://base.blockscout.com/api/v2/addresses/0x4c3006438Ef048e8A1E3AfA1B38113b7501FAd1c/counters` |
| Wallet B: 0 transactions, 0 token transfers, 0 gas usage | `https://base.blockscout.com/api/v2/addresses/0xA40B7f0FBcB428D21c6383f621ebC702c16411BE/counters` |
| Owner: 0 transactions, 0 token transfers, 0 internal txs | `https://base.blockscout.com/api/v2/addresses/0x44e7cb3f38abaf1a7448cf40bd7ee19e3678ecad/counters` + `/internal-transactions` |
| `contractAddress` `0xa6C9BA86…9df0` is verified ERC1967Proxy | `https://base.blockscout.com/api/v2/addresses/0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` → `is_verified: true`, `name: "ERC1967Proxy"` |

## On-chain claims (sentinel node)

All against `ssh cw-sentinel` → `http://localhost:8545`, block ~31,950,000.

| Claim | Source |
|---|---|
| Wallet A nonce = 1 | `eth_getTransactionCount(0x4c30…Fad1c, latest)` returned `0x1` |
| Wallet A ETH = 0 | `eth_getBalance(0x4c30…Fad1c, latest)` returned `0x0` |
| Wallet A USDC = 0 | `eth_call` to USDC `0x833589fCD…02913`, `balanceOf(0x4c30…Fad1c)` returned `0x0` |
| Wallet B USDC = 0 | Same `balanceOf` against wallet B → `0x0` |
| Owner USDC = 0 | Same `balanceOf` against owner → `0x0` |

## API claims

| Claim | Source |
|---|---|
| `/api/agents/40009/engagements` returns empty `data: []` | Direct `curl` to that URL |
| Per-agent metrics for 40009 all zero | `/api/metrics/agent/40009` returns `volume: 0, grossAgenticAmount: 0, revenue: 0, successfulJobCount: 0` |
| Daily-metrics for 40009: empty arrays | `/api/metrics/agent/40009/daily-metrics` returns all-empty `past7d*` arrays |
| Daily-metrics for 39920: empty arrays | Same endpoint for 39920 |
| Top-agents 31-day series (2026-04-16 → 2026-05-16) has no `bridgekitty` entry | `curl /api/metrics/top-agents`, search both `data.jobs.{date}` and `data.volume.{date}` for substring `bridge` / `kitty` |
| Top-agents endpoint truncates to top 5 + "Other" per day | Sampled `data.jobs["2026-05-16"]` → 6 entries: Ethy AI, Axelrod, ArAIstotle, Director Lucien, Otto AI - Market Alpha, Other |

## Economic-analysis claims

| Claim | Source |
|---|---|
| $0.094 per job | $56.11 / 595 from dashboard |
| Base gas for USDC `transfer` ~ $0.0005–$0.003 | Empirical from prior decode receipts; sample tx hash from Ethy AI decode `0x…` (any USDC transfer receipt on `cw-sentinel`). Cited as a range; conservative. |
| ACP full settlement flow $0.01–$0.03 per job | Same — empirical from prior decode receipts; conservative range, not a precise per-job claim. |

## Bundle / endpoint-discovery claims

| Claim | Source |
|---|---|
| 8.0 MB frontend bundle | `curl -o /tmp/v-bundle.js https://app.virtuals.io/assets/index-eo2NWYzX.js && wc -c /tmp/v-bundle.js` → 8,069,097 bytes |
| Bundle does NOT expose the daily-view endpoint | `grep -oE '/api/[a-z0-9/_-]+' /tmp/v-bundle.js | sort -u` produces the list quoted in Finding 5 |
| Tried query parameters (`period`, `window`, `view`, etc.) — none reproduce | All returned the same default lifetime list |

## Cross-reference claims

| Claim | Source |
|---|---|
| Links to /decodes/acp-leaderboard-audit | Existing decode at `deliverables/acp-leaderboard-audit/decode.md` |
| Links to /decodes/agdp-fdv-disconnect | Existing decode at `deliverables/agdp-fdv-disconnect/decode.md` |
| Links to /decodes/opengradient-on-chain | Existing decode at `deliverables/opengradient-on-chain/decode.md` |
| Ethy AI's lifetime transfers in the hundreds of thousands | acp-leaderboard-audit table shows 1,138,715 chain total transfers for Ethy AI |

## Disclosure claim (footer)

| Claim | Source |
|---|---|
| ChainWard appears at $10 aGDP on the same daily list | Same dashboard screenshot, row 9 |
| 1 unique user is our own buyer test wallet | `chainward-decoder` review on the agent detail page; we operate both endpoints |

## Pre-publish gates

- [ ] Verify dashboard numbers still match at publish time (re-screenshot)
- [ ] Confirm slug `bridgekitty-on-chain` is unique under `apps/web/public/decodes/`
- [ ] OG image `apps/web/public/decodes/bridgekitty-on-chain/og.png` exists (1200x675)
- [ ] `decode.md` frontmatter renders via `apps/web/src/lib/decodes.ts`
- [ ] Run `pnpm typecheck` if anything in the web app changes
- [ ] `./deploy/deploy.sh --skip-migrate`
- [ ] Verify `https://chainward.ai/decodes/bridgekitty-on-chain` renders (status 200, OG card present)
- [ ] Twitter card preview check via `curl -A 'Twitterbot' https://chainward.ai/decodes/bridgekitty-on-chain` → confirm `og:image` URL points at the static `og.png`, not the dynamic `/api/decodes/.../og` route
- [ ] Post tweet via `gh workflow run post-digest.yml --repo saltxd/chainward-bot -f text=...` (5-tweet thread)
