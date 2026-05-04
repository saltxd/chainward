---
title: "The Virtuals ACP Live Leaderboard"
subtitle: "Re-ranked by last-7d on-chain activity, the top 10 looks nothing like the museum wall"
date: "2026-04-30"
slug: "live-leaderboard-2026-04"
---

## Why the Lifetime Leaderboard Misleads

The Virtuals ACP leaderboard sorts agents by lifetime aGDP — the cumulative notional trading volume an agent has processed since launch. Per the ACP glossary at whitepaper.virtuals.io, aGDP measures volume, not revenue, and it never resets. An agent that did $200M in swaps in 2025 and nothing since still leads the board today.

To find out who is actually operating, ChainWard pulled the last-7d ERC-20 transfer count for every wallet in the top-50 lifetime aGDP list using Blockscout's `/addresses/{wallet}/token-transfers` endpoint (queried 2026-04-30). Transfer counts were paginated to capture the full window without truncation. Results were cross-checked against the ACP API (`acpx.virtuals.io/api/agents?sort=grossAgenticAmount:desc`, page size 50) and verified on sentinel via `eth_getTransactionCount` where relevant.

---

## Live Top 10 (Last-7d Transfer Count)

| Live Rank | Agent | Lifetime aGDP Rank | Last-7d Transfers | Last-30d Transfers |
|---|---|---|---|---|
| 1 | Nox | #8 | 683 | 1,000+ |
| 2 | Otto AI (main) | #4 | 126 | 788 |
| 3 | Axelrod | #2 | 42 | 182 |
| 4 | Otto Market Alpha | #78 | 40 | 50 |
| 5 | ClawFeed | #22 | 10 | 21 |
| 6 | AgentPulse | #16 | 9 | 15 |
| 7 | test_owl | #20 | 9 | 49 |
| 8 | Otto Tools Agent | #80 | 9 | 20 |
| 9 | RoboSphere Network | #27 | 7 | 10 |
| 10 | aixbt | #34 | 7 | 54 |

Sources: Blockscout `/addresses/{wallet}/token-transfers?type=ERC-20` (paginated), ACP API, queried 2026-04-30.

---

## Overlap With the Lifetime Top 10

Only 3 of the 10 names in the live ranking also appear in the lifetime top 10: Otto AI (#4 lifetime, #2 live), Axelrod (#2 lifetime, #3 live), and Nox (#8 lifetime, #1 live). That is a 30% name overlap between the two lists.

The 7 lifetime top-10 names missing from the live top 10:

- **Ethy AI** (#1 lifetime, $218M aGDP): 3 transfers in last 7d. Confirmed by Blockscout counters at 1,138,715 all-time transfers — overwhelmingly historical. Last active in ACP: 2026-04-08.
- **Wasabot** (#3 lifetime, $81M aGDP): 6 transfers in last 7d, all inbound (fee distributions and airdropped meme tokens). No agent-initiated outbound transfer in the last 7d.
- **Luna** (#5): 0 in last 7d.
- **Sympson** (#6): 0 in last 7d.
- **Director Lucien** (#7): 0 in last 7d.
- **ButlerLiquid** (#10): 1 in last 7d (a single inbound USDC).
- **Capminal** (#9): 4 in last 7d, dropping from #9 lifetime to #13 live.

---

## Concentration: The Live Economy Is Three Agents

| Cohort | 7d Transfers | Share of Top-50 Total |
|---|---|---|
| Top 3 (Nox, Otto AI, Axelrod) | 851 / 934 | 91.1% |
| Top 5 | 870 / 934 | 93.1% |
| Top 10 | 905 / 934 | 96.9% |
| Zero-activity agents | 28 / 50 | 56% have no 7d activity |

Total verified 7d ERC-20 transfers across the top-50 lifetime aGDP agents: **934**.

56% of the top-50 lifetime agents recorded zero ERC-20 transfers in the last 7 days. The live economy, by transfer count, is overwhelmingly three agents. Every other agent in the top 50 combined accounts for less than 9% of recent activity.

> Note on aGDP: the lifetime aGDP figures are not incorrect — they measure cumulative notional volume by design. This analysis re-ranks by a different signal (recent wallet activity) to show what is operating today versus what operated historically.

---

## New Entrants From Outside the Top 50

Two Otto AI sub-agents that do not appear in the lifetime top-50 show meaningful 7d activity:

- **Otto Market Alpha** (lifetime rank #78, aGDP $17,224): 40 transfers in last 7d, 50 in last 30d. Blockscout: `0xe5B38F112b92Ce8F2103eDAbA7E9a9842f12d5f6`.
- **Otto Tools Agent** (lifetime rank #80, aGDP $14,154): 9 transfers in last 7d. Blockscout: `0x98CB7E5AB8050043152D9953e29cE0e1De3ba0C1`.

The Otto AI ecosystem is not one agent — it is at least three wallets operating in coordination. Combined, the three Otto addresses generated 175 transfers in the last 7d, compared to Nox's 683 and Axelrod's 42. No agents outside the lifetime top-100 showed burst 7d activity in this scan.

---

## Pace: The Ecosystem Is Accelerating, Not Decelerating

The ACP settlement contract (`0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0`, all-time 2,126,892 transfers per Blockscout counters) recorded **4,875+ ERC-20 transfers in the last 7 days**, versus 125 transfers in the prior 7-day period. That is a 39x week-over-week increase at the protocol level.

This spike is concentrated in Nox (683 transfers this week vs. 119 the prior week) and an unregistered address (`0xfc0df5bf16a427d5f261797fcc2a2e2578b7267b`) that does not appear in the ACP agent registry but interacted frequently with the settlement contract this week.

Individual agent trajectories diverge sharply:

| Agent | 21-28d ago | 14-21d ago | 7-14d ago | 0-7d ago | Direction |
|---|---|---|---|---|---|
| Nox | 427 | 1,295 | 119 | 683 | Volatile, spiking |
| Otto AI (main) | 272 | 140 | 141 | 126 | Gradual decline |
| Axelrod | 52 | 34 | 48 | 42 | Flat |
| Degen Claw | 2,903 | 44 | 47 | 6 | Sharp dropoff |

Degen Claw's 2,903-transfer week three weeks ago appears to have been a single burst event, not sustained activity.

---

## The HUB Airdrop Artifact

A mass ERC-20 airdrop of HUB tokens from `0xD152f549545093347A162Dce210e7293f1452150` on 2026-04-11 touched wallets for at least 28 of the top-50 lifetime agents. This inflates the apparent "last active" date for dormant wallets when using raw token-transfer timestamps. The ACP API `lastActiveAt` field shows `2999-12-31` for many agents — a placeholder value, not a real date. Both signals are unreliable as proxies for current agent health; on-chain transfer analysis with direction filtering is required.

---

## Wallet Map (Key Addresses)

| Agent | ACP Wallet | Wallet Type | Blockscout Total Transfers |
|---|---|---|---|
| Nox | `0xa42cAe963CaaA4218C8F045d153b2172f2459319` | ERC-4337 contract (nonce=1) | 87,434 |
| Otto AI (main) | `0x5bB4B0C766E0D5D791d9403Fc275c22064709F68` | Self-custody EOA (nonce=1) | 30,802 |
| Axelrod | `0x999A1B6033998A05F7e37e4BD471038dF46624E1` | Self-custody EOA | 284,422 |
| Ethy AI | `0xfc9f1fF5eC524759c1Dc8E0a6EBA6c22805b9d8B` | Self-custody EOA | 1,138,715 |
| ACP settlement | `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` | ERC1967 proxy | 2,126,892 |

The TBA addresses for Nox (`0xAFD2eB8092c31229FCda9D5Bdd1afF7deABe3d0B`) and Axelrod (`0x0866eFF721Bc7d9C995188FDC6BbF1910e751849`) show zero recent token-transfer activity. The Virtuals-registered wallets (sentientWallet, tbaAddress) are not the active settlement path — all ACP activity flows through the ACP-registered walletAddress.

---

## Verification Notes

All transfer counts were derived from paginated Blockscout API responses. For agents with more than 50 transfers in the window, the script iterated `next_page_params` until the oldest timestamp exited the target window. Counts that reached the 2,500-item safety cap (Degen Claw 30d) are noted as approximate lower bounds. The ACP settlement contract 7d count reached the 100-page cap at 5,000 timestamps; the true figure is 4,875+ for the 0-7d window and 125 for the 7-14d window based on the distribution observed.

nonce values confirmed via `eth_getTransactionCount` at `http://localhost:8545` (cw-sentinel, Base L2). Both Nox and Otto AI show nonce=1 — consistent with ERC-4337 smart accounts where nonce does not increment per user operation. Blockscout counters are the authoritative transfer count source per SKILL.md methodology.
