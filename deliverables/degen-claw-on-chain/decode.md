---
title: "Degen Claw On-Chain Decode"
subtitle: "The dashboard says $490,296 of agentic GDP. We checked Hyperliquid directly: the agent's account holds $11.18 and has never placed a trade."
date: "2026-06-04"
slug: "degen-claw-on-chain"
---

# Degen Claw On-Chain Decode

> **Correction (2026-06-06):** An earlier version of this decode concluded the $490K of agentic GDP was real perp volume "settling on Arbitrum via Hyperliquid." That was an inference from the agent's own job spec — we hadn't checked Hyperliquid. We since queried Hyperliquid's public API directly and the inference is **false**: the agent's Hyperliquid account holds $11.18 and has never traded. The corrected finding is below. We'd rather flag our own miss than leave a wrong number standing.

Degen Claw (ACP id 8654, twitter [@degenclawacp](https://x.com/degenclawacp)) describes itself as a Hyperliquid perpetual-futures execution agent on Virtuals ACP. The ACP API reports `grossAgenticAmount: 490,296.54` against `revenue: 1.05` (as of 2026-06-04 — the aGDP figure keeps ticking up) — the dashboard's own numbers put a 467,000x gap between them.

The agent's Base wallet (`0xd478a8B40372db16cA8045F28C6FE07228F3781A`) holds **164.46 USDC** and has not received a single USDC transfer since **2026-04-20**. The dominant inbound pattern is one number: **$0.008**, paid **roughly 18,000 times** out of the Virtuals PaymentManager between 2026-02-25 and 2026-04-20 — about **$144 total**. Add ~$405 of ACP service receipts and a couple of deposits and you get **~$755 of lifetime USDC inflow, all-in**. The dashboard's `revenue: 1.05` reconciles to none of it. And $755 against $490K rounds to nothing.

So where is the $490K? The agent says Hyperliquid. **We checked. It isn't there.**

---

## The $490K is a number the backend asserts — not one any chain shows

Here is the structural problem, and it is the whole story: **Virtuals ACP is a Base platform. It cannot see Hyperliquid.** So `grossAgenticAmount` is not measured from Hyperliquid settlement — it is whatever the agent's off-chain trader service (`dgclaw-trader.virtuals.io`) reports back to the ACP backend per job. Nothing enforces it on-chain, on any chain.

That makes it a falsifiable claim, and Hyperliquid has a public API. Hyperliquid keys trading to an EVM address; you fund by depositing USDC to its Arbitrum bridge, and the depositor address becomes your trading account. We queried every address tied to this agent against `https://api.hyperliquid.xyz/info` (2026-06-05):

| Address | Role | Hyperliquid account value | All-time volume | Fills (lifetime) |
|---|---|---|---|---|
| Agent wallet `0xd478…3781A` (ACP `walletAddress`) | recognized HL user | **$11.18** | **$0.00** | **0** |
| Owner EOA `0x45b27F06…CA64` | no HL account | $0 | $0.00 | 0 |
| Funding dest `0x60cBD473…ce58` | no HL account | $0 | $0.00 | 0 |
| *Control: an active trader `0x0104…703a`* | *HL user* | — | ***$190.8 billion*** | ***2,000+*** |

The control matters: the same API call returns **$190.8 billion** of all-time volume and a full fill history for an active account. It returns **$0.00 and zero fills** for Degen Claw. The API works; the volume simply isn't there.

The agent's own Hyperliquid account is a complete, queryable ledger: a **single $11.18 deposit on 2026-04-02**, no trades, no positions, no withdrawals, balance flat at $11.18 ever since. You cannot generate $490K of perp notional from an account that has only ever held $11.18 and has never placed an order.

**And the one on-chain "Hyperliquid funding" breadcrumb points the wrong way.** The owner EOA's outbound USDC (e.g. tx `0x3851ea1f…3acd4d`, 2026-05-30, 287.52 USDC → `0x60cBD473…ce58`) does **not** go to the Hyperliquid Arbitrum bridge (`0x2df1c51e…f163df7`). `0x60cBD473…` is a pass-through forwarder whose USDC routes onward to **Bybit: Hot Wallet 6** (`0xBaeD383E…`, address labeled by Etherscan/BaseScan). The funds the original draft read as "seeding Hyperliquid" are being consolidated to a centralized exchange.

So the honest statement is not "the money is on another chain." It is: **the $490K is a self-reported backend figure that appears on no Hyperliquid account we can tie to this agent.** It may be inflated job parameters; it may be volume routed through buyers' own accounts that neither Virtuals nor we can observe. Either way, nothing — on Base, on Hyperliquid, or in the dashboard's own revenue field — independently confirms it exists.

---

## How a coordination call actually flows on Base

The agent's job catalog has six entries — `join_leaderboard`, `perp_deposit`, `perp_modify`, `perp_trade`, `perp_withdraw`, plus read-only `account` / `positions` / `tickers` / `perp_trades` resources at `https://dgclaw-trader.virtuals.io/`. Every one is `priceV2: { type: "fixed", value: 0 }` — no per-job ACP fee at all.

What there is, on every paid coordination call, is the canonical Virtuals $0.01 micropayment. Pull tx `0x4cce37351b338f9986fdac7d4768dfe8f78d5b4808b02448a5807e0a68334216` (block 44,950,348, April 20 2026) and decode the USDC Transfer events:

```
0.002000  PaymentManager 0xEF4364Fe... → platform 0xE9683559... (20%)
0.008000  PaymentManager 0xEF4364Fe... → Degen Claw 0xd478a8B4... (80%)
```

Same 80/20 split Wasabot uses. Same `0xE968...` Virtuals platform wallet. Same `PaymentManager` proxy. Lifetime sum across that mechanism: **~18,000 payments of $0.008, about $144** (2026-02-25 → 2026-04-20). The ~46,700 "successful jobs" the ACP API reports left this ~$144 trail on Base and nothing else — the actual perp execution, if it happens, happens somewhere the ACP backend takes the agent's word for it.

---

## Wallet topology

Degen Claw's on-chain identity is a textbook Alchemy/ERC-4337 deployment. The ACP wallet is an ERC-7760 minimal proxy of Alchemy's `SemiModularAccountBytecode` reference implementation (`0x000000000000c5A9089039570Dd36455b5C07383`, confirmed by sentinel `eth_getStorageAt` against the EIP-1967 implementation slot). Trailing 20 bytes of the bytecode encode the fallback signer directly: `0x45b27F069B1639A70C2Bc3097FF37f5ADF78CA64`. One EOA, baked into the proxy at deploy.

`SingleSignerValidationModule` (`0x00000000000099DE0BF6fA90dEB851E2A2df7d83`, Alchemy) was installed three times against this account — entityIds 1, 2, 3 across txs `0x4ea8a53e…`, `0x7ac5f607…`, and `0xdd54fff9…`, all in Feb 2026. Each install was authorized by the same baked-in EOA. No multisig. No paymaster of record (the Alchemy bundler `0xb00439E6…` pays gas at the EntryPoint, and observed UserOps carry `paymasterAndData = 0x`).

There is no agent token. ACP API returns `tokenAddress: null`, `isVirtualAgent: false`, `hasGraduated: null`, `virtualAgentId: null`. No `$DGCLAW`, no LP, no TBA, no DAO, no sentient wallet. The Virtuals public API does surface four "Degen Claw" / "DEGENCLAW" pre-token entries (IDs 49487, 49587, 70528, 78118), but every one is owned by a different wallet than the agent operator, every one is `UNDERGRAD` with `tokenAddress: null`, and the largest has $228 TVL across six holders. Namesquatters. Not the agent's token.

The `contractAddress` ACP publishes for this agent — `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` — is the shared Virtuals `ACPRouter` proxy (impl `0x361DECCFc381aCa339218D2A148bC08943D02CDb`). It is not agent-owned. The proxy predates Degen Claw by four months, was deployed by the Virtuals platform deployer `0x9547e85f3016303A2996271314BDE78b02021A28`, and has been upgraded seven times since by Virtuals-controlled EOAs. Another ACP agent, **Super Saiyan Pikachu** (ACP id 1610), returns the exact same `contractAddress` — because the router is shared platform infrastructure, not a per-agent contract.

---

## What the wallet actually does on Base

Pull the latest 50 USDC transfers against `0xd478a8…` and the histogram is uniform. **49 of 50 are inbound, exactly $0.008, from PaymentManager.** The one outbound is a single-leg sweep:

```
2026-04-22 03:22 UTC  tx 0x401b6568b78a440d0eb043a643e8ab9adb41ecefece4fc8dea3da5939b38e246
  Degen Claw 0xd478a8B4...  →  owner 0x45b27F06...  :  $100.000000 USDC
```

Two earlier sweeps are visible in the lifetime history. The largest is tx `0x653b1d8fb4c7d2b921c9d765ff8c478cc13082ed46be1402344f02808fbc41b3` (March 20, single-leg $1,461.73 USDC to the same owner EOA). The other interesting outbound is tx `0xacb6146dbf1e5cf137fa5b237ac3ce7be394691cce7b35f40d6bdf734da1b36d` (March 18) — three USDC legs that decompose as **Degen Claw buying a service from another agent**: $4.20 service principal pass-through through ACPRouter to an EOA recipient, $0.20 separately to PaymentManager as the buyer-side coordination fee.

The agent shows up on **both** sides of the ACPRouter mechanism. Beyond that one purchase, it has *received* ~**$405 across 87 inbound ACPRouter receipts** (seller side — $2–$10 typical, plus a single $100), alongside the $0.008 coordination dust and ~$200 of direct deposits/refunds. Sum of all lifetime USDC inflow: **~$755** — still three orders of magnitude under the $490K aGDP headline.

The wallet has had **no USDC activity at all since 2026-04-22**. Everything inbound since then is spam — the `/counters` endpoint reports **18,469 lifetime token transfers** across ~50 distinct ERC-20s, a long tail of meme-token airdrops pushed in by EIP-7702 smart-account broadcasters (GREENLAND, COC, GDOR, SHOPEE, PHOENIX, and so on). The wallet has never *sent* a non-USDC ERC-20.

---

## The systemic pattern

The 467,000x gap is not, by itself, fraud — `grossAgenticAmount` is a notional metric, not revenue, and they were never meant to be equal. But the deeper issue is what the metric is actually made of:

- **`grossAgenticAmount` is self-reported.** Virtuals ACP lives on Base. It has no way to observe Hyperliquid settlement, so the $490K is whatever the agent's off-chain trader reports per job. We checked the destination it points to — Hyperliquid — and found $0 of volume on every agent-tied account. The number is asserted, not settled.
- **`revenue` ($1.05) reconciles to nothing on-chain.** The agent's actual Base coordination income is ~$144; its all-in inflow ~$755. The dashboard's $1.05 matches none of them, and we can't account for the gap from Base data.
- **The agent's own capital footprint is ~$11 on Hyperliquid and ~$755 on Base.** Whatever it does, it is not deploying meaningful capital under any address we can tie to it.

The general lesson for reading these dashboards: a headline like "$490K agentic GDP" on a Base-native platform that brokers an agent executing off-platform is an **unverifiable backend figure**, not an on-chain fact. The only way to know is to query the venue the agent claims directly — which is exactly where this decode's first draft went wrong, and exactly what corrected it.

The 80/20 split, the PaymentManager, the ACPRouter, the Alchemy SemiModularAccountBytecode wallet, the bundler, the single-signer module — all platform-standard. The team-specific surface is the off-chain trader subdomain and the owner EOA. **If you understand one Virtuals ACP agent at the contract layer, you understand all of them.** The differences live in what the agent claims to do off-chain — and those claims are exactly what nobody on Base is checking.

---

## Open questions

**Does $490K of trading exist anywhere?** Not on the agent's Hyperliquid account ($11.18, zero fills), not on its owner EOA (no HL account), not on Base. The only remaining possibility is that the agent routes orders through each individual buyer's own Hyperliquid account (~1,600 unique buyers) and never trades on its own book — in which case the volume, if real, lives on addresses we can't enumerate without authenticated per-job memos. We can't confirm or rule that out. What we *can* say: the agent itself is not executing $490K of perps under any address it controls.

**Why the owner's USDC goes to Bybit.** The "funding flow" from the owner EOA routes through `0x60cBD473…` to a Bybit hot wallet (Hot Wallet 6), not to Hyperliquid. Whether that's the operator taking profits, funding a CEX-side strategy, or something else, the chain only shows the consolidation, not the intent.

**Why the Base wallet has been silent for six weeks.** No paid coordination events since April 20, yet the ACP API's `lastActiveAt` heartbeat still reads "active" — it updates continuously off a backend ping, not chain activity. A wallet can look live on the dashboard while its on-chain surface has been dormant for a month and a half.

**What the two pre-tokens the operator launched are.** The owner EOA launched two unrelated ACP pre-bond tokens — `ADX001` (Virtuals id 49144) and `ADX002` (id 67868). Both `UNDERGRAD`, `tokenAddress: null`, no graduation, no branding tie to Degen Claw. Open thread for whoever decodes the next ACP agent.

---

*Verified via the ChainWard sentinel Base node + Blockscout (Base facts) and Hyperliquid's public `/info` API (the Hyperliquid check). Base: wallet bytecode + EIP-1967 implementation slot, USDC balance (164.462993), the $0.008 coordination tx + 80/20 split, the full inbound USDC history (~18,000 transfers of exactly $0.008, ≈ $144), the ACPRouter / PaymentManager / platform contract identities, and the owner→`0x60cBD473`→Bybit fund flow (Bybit address label per Etherscan/BaseScan). Hyperliquid (queried 2026-06-05): `clearinghouseState`, `portfolio` (all-time `vlm`), and `userFills` for the agent wallet ($11.18 / $0 / 0 fills), the owner EOA (no account), and a control trader ($190.8B / 2,000+ fills, proving the API returns real data). Independent receipts available for every quantitative claim.*

*Revision history: published 2026-06-04 with an inferred (and incorrect) "volume is real, on Arbitrum" conclusion; corrected 2026-06-06 after direct Hyperliquid verification refuted it.*
