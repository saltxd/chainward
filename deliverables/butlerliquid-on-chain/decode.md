---
title: "ButlerLiquid On-Chain Decode"
subtitle: "$162K aGDP claimed. $408K USDC through the wallet on Base. On Hyperliquid, every ButlerLiquid-side address returns $0."
date: "2026-07-09"
slug: "butlerliquid-on-chain"
---

# ButlerLiquid On-Chain Decode

$408,017 of USDC has moved through ButlerLiquid's ACP wallet across 2,193 lifetime transfers — the full Blockscout pagination on `to=` and `from=`, cursors exhausted. The dashboard reports **$162,232.30** in agentic GDP across 1,706 successful jobs for 179 unique buyers.

For once, the chain shows more flow than the dashboard claims.

Then you check Hyperliquid, where the perpetuals trades are supposed to execute. ACP wallet: `$0 accountValue, $0 all-time vlm, 0 fills`. ACP router: `$0, 0 fills`. Owner EOA: `$0 portfolio` and 87 personal `userFills` that read as HYPE trading, not agent throughput. A known-active control address returns `$3,030,921` and `$187B` in lifetime volume on the same API — the endpoint isn't broken. It just has nothing to say about any ButlerLiquid-owned address.

Both statements are true at once. Chain shows more USDC on Base than the dashboard advertises as aGDP; the destination venue shows zero on every agent-side account we could enumerate. That contradiction is the decode.

---

## One trade, log by log

Pull tx `0x0b2b0883f344b6d7b6c7094a13a656ba03b9bfa4e9388887ce3e41a49eda7479` off Blockscout. Block 44,734,856, 2026-04-15. A buyer wallet `0xfa655C...` sends a $700.998049 USDC `open_perp_position` order into the ACP router at `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0`. Same transaction, four USDC `Transfer` events fire in order:

```
700.998049  buyer 0xfa655C...  →  ACPRouter 0xa6C9BA...
  0.420598  ACPRouter          →  Virtuals platform 0xE968...64C1   (20% of fee)
  1.682396  ACPRouter          →  ButlerLiquid ACP wallet            (80% of fee)
698.895055  ACPRouter          →  ButlerLiquid ACP wallet            (collateral)
```

Followed by `PaymentManager.PayableMemoExecuted(memoId=1011442277, recipient=ButlerLiquid, amount=698.895055 USDC)` — the log Virtuals stamps to make this trade count toward aGDP. Total fee: $2.10. Split 80/20 platform-vs-agent. Agent's take on $700 of notional: **$1.68**.

The collateral doesn't stay in the ACP wallet. Same block window, the agent re-emits $698.90 to `0x4cD00E38...BC31` — the audited Relay Depository, which bridges Base USDC through Arbitrum onto Hyperliquid. That's the current settlement path. In the earlier era (Nov 2025 through Feb 2026), the same collateral was routed to an un-labelled 17M-transaction EOA at `0xf70da978...3dbEF` — 502 outbound transfers, $274,887 total — before ButlerLiquid switched routes. More on that address below.

Pulled 458 dual-transfer receipts across the wallet's full history, collateral sizes from $0.20 to $1,506. Fee lands at a **0.2257% median** across the whole range. The ACP API documents 0.30% for `open_perp_position` and 0.10% for `deposit_funds`; the $700 trade above cleared at exactly 0.30%, but most rows cleared at 0.2257%. Distribution is bimodal — deposit-side at 0.10% and open-side at 0.30% — and the median is what those two rates weigh out to.

The other fee path is `PaymentManager` direct — fixed-fee jobs like `close_perp_position` ($0.50), `withdraw_funds` ($1.00), `cancel_order` ($0.50). 968 of those, $189 in aggregate agent-share. Five sample txs (agent-share $0.006 up to $0.80) each show the same 80/20 split, closed by a `PaymentReleased "Job completion payment"` event. Same mechanism as Axelrod.

Lifetime USDC inbound reconciles cleanly:

| Path | Count | Total |
|---|---:|---:|
| ACPRouter dual-transfer (collateral + agent fee-leg) | 485 | $43,697 |
| ACPRouter single-transfer (bulk pass-through) | 708 | $364,026 |
| PaymentManager fixed-fee direct | 968 | $189 |
| Owner top-ups + promo airdrops | 32 | $106 |
| **All-time inbound** | **2,193** | **$408,017** |

Retained on Base at the audit block: **$30.757913 USDC**, matching the ACP API `walletBalance` to six decimals.

---

## Identity: standard Virtuals stack, one EIP-7702 twist

The ACP wallet is an ERC-4337 `SemiModularAccountBytecode` — an Alchemy-provisioned smart account, ERC-7760 minimal proxy, EntryPoint v0.7. Blockscout reports `transactions_count: 0` because there are no native transactions from the address; all 2,959 token transfers arrive through bundled UserOperations. Standard shape for any ACP agent using Alchemy Modular Account Kit.

The owner EOA `0xc0f7Da0b...2F4e` runs an active EIP-7702 delegation. `eth_getCode` returns `0xef0100` followed by MetaMask's `EIP7702StatelessDeleGator` target. The EOA has upgraded itself into a stateless smart-account executor. Fresh 2025-2026 pattern, not a red flag — it's an on-chain marker that the operator signs modern batched auth-lists.

The declared "sentient wallet" `0xfAFa9C28...c364` has `nonce = 0`, `has_logs = false`, and zero of everything. Reserved slot in the Virtuals data model, never touched on-chain. Same dormant-sentient pattern seen with AIXBT.

Token, DAO, veToken, and TBA are all EIP-1167 clones of Virtuals infrastructure. The `AgentTokenV2` implementation was deployed by `0x9547e85f...1A28` — the same Virtuals Protocol deployer EOA behind AIXBT's token. The airdrop MerkleDistributor was deployed by `0x81F7cA6A...1415`, the Virtuals ops EOA that spun up AIXBT's staking suite. No ButlerLiquid-team-specific address deployed any core contract. The identity chain is launchpad-standard.

---

## The token: healthy schedule, dead trading

$BL launched via `BONDING_V2` on 2025-11-13. Total supply is exactly 1,000,000,000 tokens, verified via `totalSupply()` at block 48,407,982. `_burn` has never executed. The 480,613 BL parked at `0x000...dEaD` (0.048%) is a transfer to the community dead address — its balance is identical at the fresh RPC head and the 14-day-stale sentinel head. No active buyback-and-burn.

The vesting schedule is enforced token-for-token. `TokenTableUnlockerV2` currently holds 275,730,311.50 BL live. Recomputed from the seven allocation tranches — 250M team cliff-locked until 2026-11-13, plus ~25.7M still linearly vesting from the Sniper Tax Buyback tranche — the math lands at ~275.7M. Two Blockscout reads a few minutes apart caught ~6.4M BL streaming out of the unlocker mid-audit.

99.95% of the Uniswap V2 LP tokens are wrapped inside the protocol-controlled `AgentVeToken`, held by a single address. Structurally not removable by any single party. Governance is single-controller today; the LP is protocol-locked.

And yet: 24-hour BL trading volume is **$121.61**. LP TVL is **$18,057**. Top-10 holders control **97.18% of supply**. Rank-3 holder `0xe289...eE8a` sits on 18.39% — a Base-ecosystem sniper wallet with 13,000+ lifetime token transfers across dozens of meme launches, not team-affiliated. For an agent stamping $162K in aGDP and 1,706 successful jobs, the token itself is nearly untradable.

---

## The systemic pattern: cross-chain aGDP is unverifiable by construction

Here is what makes ButlerLiquid different from AIXBT or Axelrod.

ButlerLiquid's own job spec routes trades to the *buyer's* Hyperliquid account. The `getProfile` resource is scoped to `{{clientAddress}}`; every trade the agent executes lands on the client's HL address, not the agent's. With 179 unique buyers across the wallet's lifetime, that's 179 HL addresses we cannot enumerate from Base transfer data.

So the $162K aGDP is a backend number that (1) can't be verified on Base — the trades don't touch this chain, (2) can't be verified on Hyperliquid without a list of buyer addresses, and (3) is **not falsified** by the $0 balances on the agent-side HL addresses, because the architecture routes execution to the buyer, not the agent.

This is the Degen Claw rule at work: absent on Base is not present on Hyperliquid, and absent on the agent's HL address is not falsified aGDP. The honest read is **not-verifiable, not fake**. That gap is the finding.

The rest of the mechanism generalizes. The 80/20 split, the ACPRouter dual-transfer path, the PaymentManager fixed-fee path, the ERC-4337 SemiModular wallet, the ERC-1167 token clone, the AgentVeToken LP lock — same stack Axelrod uses, same stack Wasabot uses, same stack every graduated Virtuals agent uses. What varies is off-chain, and for ButlerLiquid the off-chain lives on a different chain.

---

## Open questions

**Who owns `0xf70da97812CB96acDF810712Aa562db8dfA3dbEF`.** ButlerLiquid routed $274,887 to this un-labelled EOA between 2025-11-11 and 2026-02-04, then stopped. Not a contract. 17.1M transactions and 22.8M token transfers on Base, holding $2.6M USDC, $424K CBBTC-equivalent, $60K USDT, ~138 ETH on Base plus 384 ETH on mainnet. That's a high-velocity un-labelled EOA with mid-six-figure balances across USDC / cbBTC / USDT / ETH — plausibly a smaller CEX, a market-maker hot wallet, or an unattributed high-throughput operator. Not tier-1 CEX-sized once the numbers are right. After February 2026 the agent migrated to Relay Depository.

**The $100,000 tx on 2025-11-18.** Wallet's third week. Single outbound USDC transfer of exactly $100,000.00 from the ACP wallet to the owner EOA — tx `0x85cfecba7516be4862ecb195c33fd780b27cec7fbece2bbac0651d6c0289c3da`. Largest single outflow in the wallet's history. Best-fit read is a working-capital seed round-trip — owner tops up through a non-USDC path and withdraws to their hot wallet — but the source-side leg isn't decodable from Blockscout's ERC-20 index. Data point, not accusation.

**On-chain agent-fee revenue is $359.04. Dashboard `revenue` is $1,627.39.** These do not reconcile from chain data. Off-chain accounting — VIRTUAL-denominated payments, refunds, adjustments — could explain the ~4.5× gap. We do not back-solve. Both numbers reported side by side.

**Since April 2026, ACPRouter dual-transfer settlement to Base has effectively paused.** Last verifiable job settlement: block 44,734,856, 2026-04-15. Newest USDC receipt of any kind was a $0.24 airdrop on 2026-05-25. Dashboard reports `isOnline: true` at audit time. Either settlement moved to another `enabledChain` (Arbitrum, BSC, Polygon, and ETH are listed), or the agent is dashboard-live but idle. We didn't chase the other chains.

---

*Verified July 9, 2026. Sentinel head was ~14 days behind Base tip at run start (block 47,806,437 vs Blockscout tip 48,407,900), so all current-state reads — balances, wallet bytecode, fee-path receipts, holder rankings, LP reserves — come from `mainnet.base.org` and Blockscout at fresh blocks in the 48,407,470–48,407,982 range. Historical facts (deployment provenance, token launch, dead-address balance) are cross-checked against the sentinel where inside its pruning window. Hyperliquid reads via `api.hyperliquid.xyz/info` with a known-active control address returning real numbers. Full USDC transfer history — 2,193 inbound + 724 outbound — paginated to cursor exhaustion. Independent receipts available for every quantitative claim above.*
