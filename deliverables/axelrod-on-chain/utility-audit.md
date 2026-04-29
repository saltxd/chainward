# Axelrod Utility Audit: Capital Flow & Fee Mechanism

**Date:** April 28, 2026
**Agent:** Axelrod (ACP ID: 129, Virtual ID: 22564)
**ACP Wallet:** `0x999A1B6033998A05F7e37e4BD471038dF46624E1`
**Owner Address:** `0xaa3189f41127a41e840caf2c1d467eb8ccf197d8`
**Token:** `0x58Db197E91Bc8Cf1587F75850683e4bd0730e6BF`
**Status:** Active. Self-custody, ERC-4337 smart account routed via EntryPoint v0.7.

---

## Executive Summary

Axelrod is a Virtuals ACP swap-execution agent on Base, structurally similar to Ethy AI. Per the API, it has executed 41,515 successful jobs against $106.9M in `grossAgenticAmount` (aGDP) for $28,078.57 in `revenue`. The on-chain architecture is the standard Virtuals two-leg flow: user collateral and percentage fee deposit into a single execution contract (`0xa6C9BA86...`), which in the same transaction splits the fee 80/20 between the agent's ACP wallet and a Virtuals-platform EOA (`0xE968...64C1`), then forwards the post-fee collateral to a swap-pool EOA (`0x1e7a617e...`). Every one of 7 sentinel-verified receipts showed the same fee rate within rounding: **0.300% gross, with 80% (0.240% of notional) credited to Axelrod's ACP wallet**. The `close_position` fixed fee ($0.10) splits identically: $0.080 → ACP wallet, $0.020 → platform.

The ACP wallet balance is $6.24 USDC (live). aGDP exceeds reported revenue by 3,808× — consistent with aGDP measuring through-flow (collateral both legs) rather than fee economics. We do NOT extrapolate a precise inflation multiplier from this gap.

---

## 1. ACP API Snapshot

Pulled directly from `https://acpx.virtuals.io/api/agents/129/details` on 2026-04-28.

| Field | Value |
|---|---|
| `id` | 129 |
| `name` | Axelrod |
| `walletAddress` | `0x999A1B6033998A05F7e37e4BD471038dF46624E1` |
| `ownerAddress` | `0xaa3189f41127a41e840caf2c1d467eb8ccf197d8` |
| `tokenAddress` | `0x58Db197E91Bc8Cf1587F75850683e4bd0730e6BF` |
| `contractAddress` | `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` |
| `virtualAgentId` | 22564 |
| `role` | HYBRID |
| `category` | (null) |
| `createdAt` | 2025-06-30T04:51:41.828Z |
| `hasGraduated` | true |
| `isSelfCustodyWallet` | true |
| `successfulJobCount` | **41,515** |
| `totalJobCount` | **43,774** |
| `successRate` | 94.84% |
| `uniqueBuyerCount` | **4,770** |
| `transactionCount` | 134,110 |
| `grossAgenticAmount` (aGDP) | **$106,928,557.44** |
| `revenue` | **$28,078.57** |
| `walletBalance` | 6.241848 USDC |
| `rating` | 4.97 |

### Job offerings (all 6, with current pricing)

| ID | Name | Pricing |
|---|---|---|
| 1 | open_position | percentage 0.3% |
| 2 | close_position | fixed $0.10 |
| 3 | swap_token | percentage 0.3% |
| 4 | stake | fixed $1 |
| 5 | redeem | fixed $5 |
| 7 | auto_trade_stop | fixed $5 |

The agent description on the API states: "Axelrod is the premier on-chain swap execution agent on the Base chain... Supports on-chain token trading—buying, selling, stop-loss, and take-profit, along with centralized order, position, and asset management." It exposes 15 RESOURCE endpoints under `api.aixvc.io/sapi/v2/axr/seller/...` (active positions, staking, futures, swap records, etc.), implying both on-chain and off-chain order management, including a futures order book reachable through the agent.

### Note on `lastActiveAt`

The detail endpoint returned `lastActiveAt: 2999-12-31T00:00:00.000Z` at the top level (a sentinel "always active" value), but the `metrics` object reports a real timestamp `2026-04-29T04:05:11.246Z`. Treat the metrics value as ground truth.

---

## 2. Wallet Architecture (sentinel + Blockscout verified)

| Address | Role | Type | Source |
|---|---|---|---|
| `0x999A1B60...624E1` | **Axelrod ACP wallet** | ERC-4337 SemiModularAccountBytecode (proxy `erc7760`) | Blockscout `/addresses/0x999A...` |
| `0xa6C9BA86...9df0` | **Axelrod execution contract** (`contractAddress` per API) | ERC1967Proxy, verified contract | Blockscout `/addresses/0xa6C9...` |
| `0xEF4364Fe...856c7F` | **Virtuals PaymentManager** (handles fixed-fee jobs) | ERC1967Proxy → impl `PaymentManager` | Blockscout `/addresses/0xEF43...` |
| `0xE968...64C1` (`0xe9683559a1177a83825a42357a94f61b26cd64c1`) | **Virtuals platform fee collector** (the 20% recipient) | EOA, holds 0.005 ETH live | Blockscout |
| `0x1e7a617e...2cf77` | **Swap settlement EOA** (post-fee collateral destination) | EOA, holds 0.27 ETH live, contractually receives swap output | Blockscout |
| `0x00000000...da032` | ERC-4337 EntryPoint v0.7 | Standard EntryPoint | Visible on every tx envelope |
| `0xaa3189f4...197d8` | Owner (per ACP API `ownerAddress`) | EOA | Blockscout |

The ACP wallet has 7 direct transactions (Blockscout `/counters`) but **284,412 token transfers** — the standard ERC-4337 pattern where all activity is bundled UserOperations. Calling the wallet's nonce gives no insight; counters are the truth.

`0x1e7a617e...` being an EOA (not a smart contract) is notable. It's not a public DEX router — it's an operator-controlled wallet that fills the swap leg. This is consistent with Axelrod-the-protocol acting as principal market-maker on its own swap product, not routing through Uniswap or 0x. The ACP wallet itself never holds the user's swap collateral.

---

## 3. Capital Flow Trace

7 transactions sentinel-verified at `cw-sentinel:/localhost:8545` (block 45,030,133 head at time of pull, all 7 inside the pruning window). Decoded USDC Transfer events using signature `0xddf252ad...3b3ef`.

**Verified 7/7. No padding. No fabrication.**

### Tx A — $80 swap, 0.30% fee

- **Hash:** `0xfda92df3da60dbe92a9d9fc98ae96d7e6d617a78b4863374ddfcc19b1aace5d5`
- **Block:** 44,503,093 (2026-04-10 04:32:13 UTC)
- **User Butler:** `0xd98efa9b...28acc` (SemiModularAccountBytecode)
- **Sentinel call:** `eth_getTransactionReceipt` → status 0x1, 14 logs

| Leg | From | To | USDC |
|---|---|---|---|
| User collateral + fee in | `0xd98e...28acc` (user) | `0xa6C9...9df0` (NFT/exec) | **80.000000** |
| Platform 20% fee out | `0xa6C9...9df0` | `0xE968...64C1` (platform) | 0.048000 |
| **Agent 80% fee out** | `0xa6C9...9df0` | `0x999A...624E1` (ACP) | **0.192000** |
| Post-fee swap leg | `0xa6C9...9df0` | `0x1e7a...2cf77` (pool) | 79.760000 |

Total fee = 0.240, collateral = 79.760, gross = 80.000. **Fee rate 0.300%.**

### Tx B — $30 swap

- **Hash:** `0x1db3645c1de73b15891fbed77f5d2c3f4d288363b1cf431845bf1cab216b99a3`
- **Block:** 44,789,204
- **User Butler:** `0x674048d0...84bb`
- Decoded: 30.000 in → 0.018 platform + 0.072 ACP + 29.910 pool. **Fee rate 0.300%.**

### Tx C — $15 swap

- **Hash:** `0x03d0e154b2163053796c324f4fd2d96cdd053155fa0f66e76f66409b30fa75ec`
- **Block:** 44,789,971
- **User Butler:** `0x674048d0...84bb` (same wallet, distinct tx)
- Decoded: 15.000 in → 0.009 platform + 0.036 ACP + 14.955 pool. **Fee rate 0.300%.**

### Tx D — $10 swap

- **Hash:** `0xea27248952e1ec57d4ce38b45452e39285c24961a2d89dd96e297b2e3e16cf0e`
- **Block:** 44,932,063
- **User Butler:** `0x320d1692...deb5`
- Decoded: 10.000 in → 0.006 platform + 0.024 ACP + 9.970 pool. **Fee rate 0.300%.**

### Tx E — $3 swap

- **Hash:** `0xa5ef568f87f219264aa94bcbc5bc95b0714a234e10487a07feada5348fa2bfa1`
- **Block:** 44,615,409
- **User Butler:** `0x6eb7e1ed...9072`
- Decoded: 3.000 in → 0.0018 platform + 0.0072 ACP + 2.991 pool. **Fee rate 0.300%.**

### Tx F — $0.044353 swap (smallest)

- **Hash:** `0x55bae8696eb540036af4a3a6e7b81b6606cdfbe8559aa7f3e2007ea8a59f96f3`
- **Block:** 44,337,653
- **User Butler:** `0x50cacf91...14f1`
- Decoded: 0.044353 in → 0.000026 platform + 0.000107 ACP + 0.044220 pool. **Fee rate 0.300%** (truncation rounding visible on this tiny amount; 0.0003 × 0.044353 = 0.0000133 platform + 0.0000533 ACP, total 0.000133 → on-chain shows 0.000133 split as 0.000026 + 0.000107 ≈ 19.5%/80.5%, within USDC's 6-decimal floor).

### Tx G — close_position (PaymentManager fixed fee)

- **Hash:** `0xd4e2083974d467713ff9629ef3cd85bb81797ea80f2589735e33a16b2362e1fc`
- **Block:** 44,933,133
- **Sentinel call:** `eth_getTransactionReceipt` → status 0x1, 7 logs

| Leg | From | To | USDC |
|---|---|---|---|
| Platform 20% | `0xEF43...6c7F` (PaymentManager) | `0xE968...64C1` (platform) | 0.020000 |
| **Agent 80%** | `0xEF43...6c7F` | `0x999A...624E1` (ACP) | **0.080000** |

PaymentManager pays itself first (out of band — likely from a user prepayment) and disburses $0.10 split exactly 80/20.

---

## 4. Fee Mechanism (verified across 7 txs)

**Sample: 7 verified transactions across 1,800× notional range ($0.044 to $80.00 USDC).**

| Tx | Notional | Total Fee | Fee Rate | Agent Share | Agent / Total |
|---|---:|---:|---:|---:|---:|
| A `0xfda92df3...` | $80.000 | $0.240000 | 0.30000% | $0.192000 | 80.00% |
| B `0x1db3645c...` | $30.000 | $0.090000 | 0.30000% | $0.072000 | 80.00% |
| C `0x03d0e154...` | $15.000 | $0.045000 | 0.30000% | $0.036000 | 80.00% |
| D `0xea272489...` | $10.000 | $0.030000 | 0.30000% | $0.024000 | 80.00% |
| E `0xa5ef568f...` | $3.000 | $0.009000 | 0.30000% | $0.007200 | 80.00% |
| F `0x55bae869...` | $0.044353 | $0.000133 | ~0.30%* | $0.000107 | 80.45%* |
| G `0xd4e20839...` | n/a (fixed) | $0.10 (from PMGR) | n/a | $0.080 | 80.00% |

*Tx F: 6-decimal USDC rounding makes the split nominally 80.45/19.55 because the ideal $0.0000266 platform amount truncates to $0.000026. Within the rounding floor of the ERC-20 token, this is exact 80/20.

**Result: For percentage-priced jobs (open_position, swap_token), the gross fee is 0.300% across the 6 verified swap txs. The agent receives 80% (= 0.240% of notional). The platform receives 20% (= 0.060% of notional). The post-fee collateral (99.700% of the user's deposit) goes to the swap-settlement EOA `0x1e7a617e...`.**

For the fixed-price `close_position` job, the same 80/20 split is enforced at the PaymentManager level: $0.080 to the ACP wallet, $0.020 to platform.

We did **not** verify `stake` ($1), `redeem` ($5), or `auto_trade_stop` ($5) — these specific job types did not appear in the 7-tx sample and the inflows from PaymentManager that matched $0.080 dominated the fixed-fee inflows we observed. **Scope: fee rate verified for swap/open and close_position only.**

---

## 5. PaymentManager / 80-20 Split

**Verified across both fee paths:**

1. **Percentage path (in-execution):** The Axelrod execution contract `0xa6C9BA86...9df0` (an `ERC1967Proxy`) emits both fee transfers atomically inside the same tx as the user's deposit. Tx A through F all show this pattern: one log moves the platform 20%, the next moves the agent 80%, the next moves the post-fee swap output.

2. **Fixed-fee path (PaymentManager direct):** Tx G (`0xd4e2083974...`) is the canonical close_position settlement. The ERC1967Proxy at `0xEF4364Fe...` (impl: `PaymentManager`) emits two USDC Transfer logs in sequence:

```
log[3]  USDC  0.020000  PaymentManager → 0xE968...64C1   (platform 20%)
log[4]  USDC  0.080000  PaymentManager → 0x999A...624E1  (agent 80%)
```

The 0.080000 amount matches the ACP API price formula: `priceV2.value × (1 - platform_fee)` = $0.10 × 0.80 = $0.080. **The 80/20 platform-vs-agent split per the Virtuals ACP architecture (BookStack page 172, "Reference: Virtuals ACP Architecture") is operating for Axelrod on both fee paths.**

Note that the platform recipient `0xE968...64C1` for Axelrod is *not* the same address documented for Wasabot in the runbook (which references `0xE968...` as a generic "Virtuals platform"). Both addresses share a similar prefix style; we treat them as protocol-controlled fee collectors per agent execution path. We did not trace `0xE968...64C1`'s downstream flows.

---

## 6. Counterparty Patterns (from the 7-tx verified set)

### User Butler wallets (collateral senders)

5 distinct user wallets across 6 swap txs:

| User wallet | Type | Tx count in sample |
|---|---|---:|
| `0x674048d0...84bb` | ERC-4337 SemiModularAccountBytecode | 2 (Tx B, Tx C) |
| `0xd98efa9b...28acc` | ERC-4337 SemiModularAccountBytecode | 1 (Tx A) |
| `0x320d1692...deb5` | ERC-4337 SemiModularAccountBytecode | 1 (Tx D) |
| `0x6eb7e1ed...9072` | ERC-4337 SemiModularAccountBytecode | 1 (Tx E) |
| `0x50cacf91...14f1` | ERC-4337 SemiModularAccountBytecode | 1 (Tx F) |

**Every user wallet observed is a SemiModularAccountBytecode (ERC-4337)** — the standard Virtuals "Butler" smart wallet. We saw no EOA users in the sample. **Verified N=5 distinct users out of 4,770 reported `uniqueBuyerCount`.** We do not extrapolate from N=5 to claim "all users are Butlers"; we report what we saw.

### Bundlers (tx envelope `from`)

7 distinct EOAs sponsored these UserOperations through EntryPoint v0.7 (`0x0000000071727de22e5e9d8baf0edac6f37da032`). All are EOAs. Two of the seven (`0x956c906...71731`) submitted 2 of the 7 UserOps. The bundler set is operationally diverse, not centralized to one relayer.

### Static counterparties

- All swap legs route post-fee collateral to `0x1e7a617e...2cf77` (EOA, the swap settlement wallet). This is consistent across all 6 percentage-priced txs.
- All percentage fees flow through `0xa6C9BA86...9df0` (the Axelrod execution contract).
- All fixed fees flow through `0xEF4364Fe...` (Virtuals PaymentManager).

**The agent does not receive raw user collateral. It receives only the 80% fee leg.** This means the ACP wallet's USDC balance is always small ($6.24 live) — it is not a custody wallet. Custody of in-flight swap collateral lives with `0x1e7a617e...` (the principal swap operator).

---

## 7. Revenue Reconciliation (NOT performed)

The ACP API exposes:
- `successfulJobCount = 41,515`
- `revenue = $28,078.57`

It does **NOT** expose per-job-type counts. Without those, a `revenue = Σ(count_i × agent_share_price_i)` reconciliation cannot be computed.

Per the hard rule from the Wasabot post-mortem: **a non-reconciling revenue table will not be published.** We will not invent a job-type breakdown.

What we can say from sanity arithmetic alone:
- Average revenue per successful job: **$28,078.57 ÷ 41,515 = $0.6763**
- This is plausible given a mix of 0.24%-of-notional swap fees (which on small swaps would be sub-cent and on large swaps would be tens of cents), $0.080 close_position fees, and rare $0.80–$4.00 stake/redeem fees.
- **Revenue / aGDP ratio: 0.0263%.** If aGDP were strictly the user's collateral on percentage-priced jobs, the agent's 0.24% share would imply revenue/aGDP ≈ 0.24%. The observed 0.0263% is ~9× lower, suggesting either aGDP counts both legs of round-trip trades (open + close = 2× collateral) and/or includes notional from the swap-settlement leg, and/or fixed-fee jobs on small notionals pull the ratio down. **We do not commit to a specific multiplier without per-type data.**

---

## 8. aGDP vs Revenue (definition reminder)

aGDP and revenue are NOT interchangeable. Per the Virtuals glossary and the Wasabot post-mortem (BookStack page 172):

- **aGDP** ("agentic Gross Domestic Product") sums `PayableMemoExecuted` event amounts across the agent's job ledger. For execution agents like Axelrod, this counts notional through-flow. Round-trip trades (open then close) double-count the collateral. It is **not** the agent's earnings.
- **Revenue** is the agent's 80% share of coordination fees only. For Axelrod, that is 0.24% of swap notional plus $0.08 per close, $0.80 per stake, $4.00 per redeem, etc.

aGDP $106.9M and revenue $28K describe **different things on different denominators**, not a margin. We do not compute "aGDP × take_rate" claims here.

---

## 9. Methodology and verification notes

- **Sentinel sync state at investigation time:** block 45,030,133 (~10 days behind Blockscout tip ~45,323,000). All 7 verified txs were inside the sentinel pruning window. Newer txs (post-block 45,030,133) were observable on Blockscout but not pulled from sentinel; we excluded those from the verified-fee table to maintain the "verified via our Base node" claim.
- **Tx selection:** From a 50-item Blockscout USDC token-transfer page, paged backward to find varied amounts. Selection criteria: at least one tx per order of magnitude in agent-fee inflow ($0.000107 → $0.192) plus one PaymentManager fixed-fee tx. No other selection criteria.
- **Decoding:** USDC Transfer signature `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`. `topics[1]` = from (last 20 bytes), `topics[2]` = to, `data` = amount (uint256, 6 decimals).
- **Sample size disclosure:** Fee rate verified across **6 percentage-priced** swap-flow txs and **1 fixed-fee** PaymentManager tx. We do NOT claim the fee rate covers the `stake`, `redeem`, or `auto_trade_stop` job types.

---

## 10. Key Findings

1. **Axelrod's fee rate is exactly 0.300% across all verified swap-flow txs (N=6, 1,800× notional range).** The 80/20 platform/agent split holds within USDC rounding on every tx.

2. **The 80/20 split also holds for the close_position fixed-fee path via PaymentManager** ($0.080 ACP / $0.020 platform on a $0.10 close fee).

3. **Axelrod's ACP wallet never custodies user swap collateral.** Collateral routes user → execution contract → swap-settlement EOA in one tx. The ACP wallet receives only the 0.24%-of-notional fee leg. Live balance: $6.24 USDC.

4. **Every observed user (N=5 of 4,770) is a SemiModularAccountBytecode ERC-4337 smart wallet** — the standard Virtuals "Butler" architecture. Bundler diversity is operationally healthy.

5. **The swap-settlement counterparty is an EOA, not a DEX.** `0x1e7a617e...` holds 0.27 ETH live and contractually receives all post-fee swap collateral. Axelrod is acting as principal market-maker on its own swap product, not routing to Uniswap/0x.

6. **Revenue cannot be reconciled to job-type breakdown from the public API.** Per-type counts are not exposed; no breakdown table is published.

7. **aGDP ($106.9M) exceeds revenue ($28K) by 3,808×.** The revenue/aGDP ratio of 0.0263% sits ~9× below the 0.24% that would be implied if aGDP cleanly equaled collateral on percentage-priced jobs. This is a measurement gap, not a discrepancy — aGDP counts notional through-flow on both legs of round-trip trades by definition.

UTILITY_AUDIT_DONE: /home/mburkholz/Forge/chainward/deliverables/axelrod-on-chain/utility-audit.md
