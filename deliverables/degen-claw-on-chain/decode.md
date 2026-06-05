---
title: "Degen Claw On-Chain Decode"
subtitle: "$490,296 of agentic GDP, ~$144 of on-chain coordination dust, and a Base wallet that has not seen a USDC transfer in six weeks"
date: "2026-06-04"
slug: "degen-claw-on-chain"
---

# Degen Claw On-Chain Decode

Degen Claw (ACP id 8654, twitter [@degenclawacp](https://x.com/degenclawacp)) is a Hyperliquid perpetual-futures execution agent on Virtuals ACP. The ACP API reports `grossAgenticAmount: 490,296.54` against `revenue: 1.05` — the dashboard's own numbers put a 467,000x gap between them.

The agent's Base wallet (`0xd478a8B40372db16cA8045F28C6FE07228F3781A`) holds **164.46 USDC**, and has not received a single USDC transfer since **2026-04-20**. The dominant inbound USDC pattern is a single number: **$0.008** — paid **18,001 times** out of the Virtuals PaymentManager between 2026-02-25 and 2026-04-20, about **$144 in total**. That coordination dust is most of the wallet's life; the rest of the inflow is ~$405 of ACP service receipts (the agent does sell services on Base) plus a couple of deposits — **~$755 of lifetime USDC inflow, all-in**. The dashboard's `revenue: 1.05` matches none of it. And $755 against $490K of claimed agentic GDP rounds to nothing — because that GDP was never on Base.

The trade economics are not missing. They are on **Arbitrum**.

---

## How a trade actually flows

The agent's job catalog has six entries — `join_leaderboard`, `perp_deposit`, `perp_modify`, `perp_trade`, `perp_withdraw`, plus the read-only `account` / `positions` / `tickers` / `perp_trades` resources at `https://dgclaw-trader.virtuals.io/`. Every single one is `priceV2: { type: "fixed", value: 0 }`. There is no per-job ACP fee at all.

What there is, on every paid coordination call, is the canonical Virtuals $0.01 micropayment. Pull tx `0x4cce37351b338f9986fdac7d4768dfe8f78d5b4808b02448a5807e0a68334216` (block 44,950,348, April 20 2026) and decode the USDC Transfer events:

```
0.002000  PaymentManager 0xEF4364Fe... → platform 0xE9683559... (20%)
0.008000  PaymentManager 0xEF4364Fe... → Degen Claw 0xd478a8B4... (80%)
```

Same 80/20 split Wasabot uses. Same `0xE968...` Virtuals platform wallet. Same `PaymentManager` proxy. The agent's wallet receives less than a penny per paid coordination event — that, plus a few hundred dollars of ACP service receipts (below), is the agent's entire on-chain economic surface on Base.

Lifetime sum across that mechanism: **18,001 payments of $0.008 ≈ $144** (2026-02-25 → 2026-04-20). Job fees themselves are zero — every job is `priceV2: 0`. The 46,680 successful jobs the ACP API reports ran through the off-chain trader at `dgclaw-trader.virtuals.io`, which — per the agent's own job spec — routes user collateral into Hyperliquid subaccounts on Arbitrum. None of that throughput touches the agent's Base wallet.

The fee that pays for the actual product — the `dgFee` referenced in the `account` resource as *"hlBalance minus unsettled dgFee"* — accrues inside each user's Hyperliquid subaccount on Arbitrum. We could not characterize it. It is not visible from Base. **N=0 on this chain.**

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

Total owner extraction visible in our sample: **$1,561.73 lifetime**. The on-chain accumulation rate is at most a couple of dollars a month at the $0.008-per-event pace, and the wallet has had **no USDC activity at all since 2026-04-22**.

Everything inbound since then is spam. The `/counters` endpoint reports **18,469 lifetime token transfers** across ~50 distinct ERC-20s; the long tail is meme-token airdrops pushed in by EIP-7702 smart-account broadcasters (GREENLAND, COC, GDOR, SHOPEE, PHOENIX, NANNO, HumanityProtocol, OctaFX, and so on). The wallet has never sent a non-USDC ERC-20. Every spam token sits there until it gets garbage-collected from the front-end view.

---

## The systemic pattern

The four-hundred-and-sixty-seven-thousand-x gap is not fraud, and it is not an accounting bug. It is a clean measurement mismatch the ACP dashboard does not flag:

- `grossAgenticAmount` here is notional perp deposit + withdrawal + Hyperliquid trade volume recorded by the ACP backend. **None of it lives on Base.** It is the running total of dollars Degen Claw users have bridged into their Hyperliquid subaccounts on Arbitrum, plus the notional of every order those users have routed through the off-chain trader.
- `revenue` is meant to be the agent's 80% share of $0.01 ACP coordination fees. On-chain, those coordination micropayments total **~$144** across 18,001 receipts; the agent's all-in Base inflow (coordination dust + ~$405 of ACP service receipts + deposits) is **~$755** lifetime — yet the dashboard reports just **$1.05**, which reconciles to none of them from Base data alone. It doesn't matter to the thesis: $755, $144, and $1.05 are all rounding error against $490K of aGDP, and **none reflects the agent's actual product economics**, which settle on Arbitrum.
- The actual product fee — `dgFee` — is charged inside the Hyperliquid subaccount and is unsettled until withdrawal. **It is not in either number.**

The same dashboard surfaces both fields side by side as if they belonged in the same comparison. For an execution agent like Wasabot whose collateral flows through a Base perp contract, aGDP at least double-counts on-chain volume the agent's contracts touch. For Degen Claw — a Base-coordinated, Arbitrum-executing agent — aGDP measures a different chain entirely. Comparing it to Base revenue is like dividing a Hyperliquid trade tape by a Stripe ACH receipt.

The 80/20 split, the PaymentManager, the ACPRouter, the Alchemy SemiModularAccountBytecode wallet, the bundler, the single-signer validation module — all platform-standard. The team-specific surface is the off-chain trader subdomain and the owner EOA. **If you understand one Virtuals ACP cluster at the contract layer, you understand all of them.** The differences live in what the agent does off-chain, and for Degen Claw that off-chain is an entirely separate L2.

---

## Open questions

**What `dgFee` actually is.** The `account` resource describes *"hlBalance minus unsettled dgFee"* and that is the entire on-chain breadcrumb. The rate, the schedule, the settlement cadence — none of it is observable from Base. Characterizing it would require Hyperliquid sequencer data plus the agent's Arbitrum subaccount addresses, neither of which is exposed by the ACP API.

**Where the $1,561.73 in owner sweeps went.** Both visible sweeps land at the owner EOA `0x45b27F06…`, which separately runs a Hyperliquid-funding flow of its own (e.g. tx `0x3851ea1f298e21abf66b7e261986c483e134d484655f1bcdbecacf2ca63acd4d`, May 30, 287.519105 USDC to `0x60cBD4736102b032497ce54c1273b0d166c4ce58`). Whether the swept ACP coordination dust gets recycled back through the trading product or just consolidated to a personal address, we did not trace.

**Why the Base wallet has been silent for six weeks.** No paid coordination events since April 20 (the last $0.008 inbound; the final USDC movement was an owner sweep on April 22) means either the off-chain trader is no longer issuing coordination calls that hit PaymentManager, or job routing has migrated entirely to a path that bypasses the agent's Base wallet. The `lastActiveAt` heartbeat the ACP API exposes (`2026-06-05T03:43:51Z`) flips on a backend ping, not on chain activity — so a wallet can look "live" on the dashboard while its on-chain economic surface has been dormant for a month and a half.

**What the two pre-tokens the operator did launch are.** The owner EOA has launched two unrelated ACP pre-bond tokens — `ADX001` (Virtuals id 49144) and `ADX002` (id 67868). Both are `UNDERGRAD`, `tokenAddress: null`, no graduation, no branding tie to Degen Claw. We did not trace what they do or whether they relate to the trading product at all. Open thread for whoever decodes the next ACP agent.

---

*Verified 2026-06-04 via ChainWard sentinel Base node (head block 46,853,147, ~30-day pruning window) and Blockscout API. Sentinel-verified: wallet bytecode, EIP-1967 implementation slot, transaction count (`0x1`), USDC `balanceOf` (`0x09cd8191` = 164.462993 USDC), and the platform-mechanism reference tx `0x03f4a8b1ed00d2a461a6f8eeb70d6cc4129571c1def626b5fe55fab0dc1bb17d` (ACPRouter four-way split, status `0x1`, 14 logs). Degen Claw's own historical sweeps (`0x4cce3735…`, `0x401b6568…`, `0x653b1d8f…`, `0xacb6146d…`) sit below the sentinel pruning floor (~block 45,553,000) and are Blockscout-verified via `transactions/{hash}/token-transfers`. Independent receipts available for every quantitative claim above.*

*Re-verified independently 2026-06-05 before publication: the full inbound USDC history was paginated end-to-end (18,143 inbound transfers; 18,001 of exactly $0.008 from PaymentManager, 2026-02-25 → 2026-04-20) — correcting an earlier draft that under-counted these micropayments. Headline aGDP/revenue (live ACP API), wallet balance (164.462993 USDC), the decoded coordination tx and its 80/20 split, and the PaymentManager / platform / ACPRouter contract identities were each re-confirmed against chain. The Arbitrum/Hyperliquid leg is inferred from the agent's job spec plus the absence of any trade-sized flow on Base; it is not directly observable from a Base node.*
