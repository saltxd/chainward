---
title: "Axelrod On-Chain Decode"
subtitle: "$106.9M of swap volume, 41,515 jobs, and zero AXR burned eleven months after the buyback promise"
date: "2026-04-28"
slug: "axelrod-on-chain"
---

# Axelrod On-Chain Decode

Axelrod is the highest-volume Virtuals ACP agent on Base. Its agentic-GDP figure of **$106,928,557.44** across **41,515 successful jobs** (ACP API `/agents/129/details`) puts it ahead of Wasabot and Otto AI by an order of magnitude in throughput.

The Virgen Alpha launch deck and the AXR project overview both promised the same thing in plain language:

> "A portion of fund PnL buys back & burns $AXR. Reducing circulating supply and driving long-term value."

Eleven months in, sentinel `balanceOf` against the standard burn destinations returns zero. `0x...dEaD`: 0. `0x000...0000`: 0. `0x000...0001`: 0. Total supply has not moved off `0x033b2e3c9fd0803ce8000000` — exactly 1,000,000,000 AXR, the number it launched with.

The buyback-and-burn has not happened.

What the agent has done — verifiably, across every tx we pulled — is route a clean 0.300% fee on every swap, split 80/20 between the ACP wallet and a Virtuals platform collector. That part works. The token is the part that doesn't.

---

## How a swap actually settles

Pull tx `0xfda92df3da60dbe92a9d9fc98ae96d7e6d617a78b4863374ddfcc19b1aace5d5` off our sentinel node. Block 44,503,093, April 10. A user's "Butler" wallet (`0xd98efa9b...28acc`, an ERC-4337 SemiModularAccountBytecode — the standard Virtuals user-facing smart wallet) sends an $80 USDC open-position order. Status `0x1`, 14 logs.

Decode the four USDC Transfer events in order:

```
80.000000  user 0xd98e...28acc  →  exec contract 0xa6C9...9df0
 0.048000  exec contract        →  platform 0xE968...64C1   (20% of fee)
 0.192000  exec contract        →  Axelrod ACP 0x999A...624E1   (80% of fee)
79.760000  exec contract        →  swap pool 0x1e7a...2cf77
```

Total fee: $0.240 on $80. **0.300% gross.** The agent gets $0.192. Platform gets $0.048. The remaining $79.76 — the user's actual collateral — never touches the ACP wallet at all. It goes straight to `0x1e7a617e...2cf77`, an EOA holding 0.27 ETH live, which is the principal swap-settlement counterparty.

We pulled six more receipts spanning 1,800× notional range, $0.044 to $80.00. Every one returned the same 0.300% fee at the same 80/20 split. The fixed-fee `close_position` job (tx `0xd4e2083974d467713ff9629ef3cd85bb81797ea80f2589735e33a16b2362e1fc`) splits a $0.10 close fee identically: $0.080 to the ACP wallet, $0.020 to the platform, both legs emitted by Virtuals' `PaymentManager` proxy at `0xEF4364Fe...`.

The mechanism is rigid. The contract enforces the split atomically inside the same tx as the user's deposit. There is no version of this where the agent quietly skims more.

The other side of that rigidity: the ACP wallet is not a custody wallet. Live USDC balance is **6.241848 USDC**, matching the ACP API field exactly. Across $106.9M of through-flow it has never accumulated more than coffee money — because by design, the agent earns 0.24% of the user's notional and that is all.

---

## The wallet topology, and a signer rotation

The ACP wallet `0x999A1B6033998A05F7e37e4BD471038dF46624E1` is an ERC-7760 minimal proxy of Alchemy's `SemiModularAccountBytecode` (ERC-4337 v0.7.0). Sentinel `eth_getCode` returns the canonical ERC-7760 stub with the implementation pointer baked into bytecode and the trailing 20 bytes encoding the immutable signer salt. Sentinel `eth_getStorageAt` against the EIP-1967 implementation slot (`0x36089...bbc`) confirms the implementation: `0x000000000000c5A9089039570Dd36455b5C07383`.

Not a Safe. Not a multisig. Not a governance proxy. A **single-signer smart account** with a single fallback-signer slot.

The original signer baked into the deployment `initCode` was `0xFFC60852775193E3b72758BaC4f7c6e3050D82dE`. That same address is also the S3 prefix in the Axelrod profile-pic URL the ACP API returns — `https://acpcdn-prod.s3.../0xffc60852775193e3b72758bac4f7c6e3050d82de/...` — strongly suggesting `0xffc60852...` was the original AIxVC team signer at agent registration.

On 2026-02-04, two consecutive UserOps rotated control:

1. **07:01:47 UTC**, tx `0x47296c5760e27813e41d8c09e1f7464c70cc1f5d127e99fae84960e08b117f4b`: the original signer authorized `0xaa3189f41127A41e840cAF2C1d467eb8CcF197d8` as fallback signer.
2. **07:08:37 UTC**, tx `0xe06cf0e9e189539d22973fcbb2d62c39bf407072b378f31743abcd0ff05d7e3d`: the new signer disabled the original.

Seven minutes, end to end. Subsequent attempts from `0xffc60852...` to call `updateFallbackSignerData` revert (`status: error`), confirming it lost authority. Every UserOp since has validated against `0xaa3189f4...`, the address the ACP API now reports as `ownerAddress`.

What we cannot tell you from on-chain alone: who controls `0xaa3189f4...`. The ACP API treats it as the owner. The S3 URL in the same API response still references the old signer. Whether the rotation was a routine ops handoff inside the AIxVC team, a cold-to-hot key migration, or something more interesting — we can't decode it from the chain.

---

## The token: a 1B-supply Virtuals graduated agent with one very large bag

AXR (`0x58Db197E91Bc8Cf1587F75850683e4bd0730e6BF`) is a standard Virtuals `AgentToken` EIP-1167 clone, 18 decimals, total supply 1,000,000,000 — verified by sentinel `totalSupply()` returning `0x033b2e3c9fd0803ce8000000`.

The vesting schedule (publicly committed via TokenTableUnlockerV2) allocates 50% of supply across team, vault, community-rewards, and mindshare-mining buckets, all streaming to one recipient: `0x52Af56e5811A3456981a09A704B20Ba5Da0Dbf67`, an EIP-7702-delegated EOA. That wallet holds **309,572,750 AXR** at sentinel snapshot. **30.96% of total supply.** Single largest holder. Larger than the LP. Larger than the unlocker still has left to distribute. Larger than every staking surface combined.

Top-10 concentration sums to 70.22% (sentinel-verified across 10 `balanceOf` calls); Virtuals' own API reports 71.52% in its cached field. Most of that delta is whether the unlocker is read live (179.88M AXR remaining) or cached (450M).

The trading footprint is thin. The Uniswap V2 AXR/VIRTUAL pair `0x6D5dF1d155d79279ABD65A98815F7853C2b3a005` holds 96.28M AXR and 101,697 VIRTUAL at block 45,030,133, totaling **~$141,364 in TVL** at the VIRTUAL spot price of $0.6950 (Blockscout token API). The Virtuals API's own `liquidityUsd` reports $136,722 — same order of magnitude. 24h volume is **$3,185**. Daily turnover: 2.2% of LP, 0.6% of FDV. By the standard of agents that route nine-figure aGDP, it is illiquid.

98.78% of the LP token is wrapped in the Virtuals ve-style locker `0xf706d49A839cDEF08B10A46da1AC55bc986fe037` — protocol-controlled, not unilaterally rugable. That part is structurally sound.

The 1% swap tax that the `AgentToken` implementation enforces on every transfer routes to the token contract itself, then is swept periodically via `swapTax()` to Virtuals' Tax Swapper at `0x8e0253dA409Faf5918FE2A15979fd878F4495D0E` (most recent observed sweep: tx `0x6f3c2a3ba9322f5b5d69c5513545062c4cad659db1d9287560c8a2caa0d983ce`, April 28). The swept AXR gets converted to VIRTUAL and forwarded to a Virtuals fee pool. **This is protocol revenue routing, not a burn.** It does not reduce AXR total supply. The supply has not changed.

And the buyback-and-burn that the launch deck promised? Sentinel `balanceOf` at the three standard burn destinations is zero. After 11+ months of trading, 41,515 successful jobs, and $106.9M in stamped through-flow — zero AXR has been retired through any common burn mechanism we could check.

---

## The systemic pattern

Axelrod is not bespoke. The ERC-7760 ACP wallet, the AccountFactory deployer, the SingleSignerValidationModule, the ERC1967 execution contract, the PaymentManager, the swap-settlement EOA, the 80/20 platform/agent split, the V2 LP locked into the protocol's ve-wrapper, the AgentToken with its built-in 1% swap tax — is the Virtuals stack as it ships. The same Virtuals deployer EOA `0x9547e85f3016303A2996271314BDE78b02021A28` that created Axelrod's swap proxy `0xa6C9BA86...` also deployed AIXBT's AgentFactoryV3.

What changes per agent is the team's wallet (here: AIxVC EOA `0xc31Cf1168b2f6745650d7B088774041A10D76d55`, which deployed the swap implementation and runs `setFeeDelegation` against the AIxVC BondingV5 proxy), the swap-settlement counterparty (`0x1e7a617e...`, an EOA — Axelrod is acting as principal market-maker on its own pool, not routing to Uniswap or 0x), and the size of the dev-wallet bag.

The 80/20 split is the same one Wasabot uses. The PaymentManager is the same contract. The Butler wallet pattern (every user we observed was a SemiModularAccountBytecode ERC-4337 — N=5 of 4,770 reported buyers) is the same. If you understand one Virtuals agent at the contract layer, you understand all of them; the differences live in what the agent does off-chain and what its team does with its dev wallet.

The leaderboard's `grossAgenticAmount` field measures notional through-flow on the agent's job ledger, and for an execution agent like Axelrod that double-counts on round-trip trades. **aGDP $106.9M and revenue $28K describe different things on different denominators, not a margin.** The 3,808× gap is not a discrepancy — it is the metric working as designed. We did not compute a take-rate from those two fields; per-job-type counts are not exposed by the ACP API and we will not invent a breakdown.

---

## Open questions

**Who controls `0xaa3189f4...`.** The current sole signer of the ACP wallet. The ACP API calls it the owner. We can prove it has authority; we cannot prove who holds the key.

**Where the `swap_token`, `stake`, `redeem`, and `auto_trade_stop` fees actually settle.** We verified the fee mechanism for `open_position` (percentage path) and `close_position` (PaymentManager fixed-fee path). The other four job types did not appear in our 7-tx sample. The ACP API publishes their prices but not their on-chain settlement paths.

**What the dev wallet does with its 30.96%.** `0x52Af56e5...` has 89 transactions and 1,615 token transfers. We did not trace every outbound flow. Whether AXR has been retired through some non-standard burn destination, sold OTC, or simply held — that requires a flow trace we did not perform here.

---

*Verified April 28, 2026 via ChainWard sentinel Base node (block 45,030,133 head, ~10 days behind Blockscout tip). All 7 fee-trace transactions sat inside the sentinel pruning window. Deployment-provenance facts are Blockscout-only; the deployment tx `0x1a533c66...` at block 32,234,883 sits ~12.7M blocks behind tip and was outside the pruning window. Live-state facts (signer rotation txs, swap-proxy implementation slot, balances, account bytecode, top-10 holder reads, burn-address `balanceOf`) are sentinel-verified. Independent receipts available for every quantitative claim above.*
