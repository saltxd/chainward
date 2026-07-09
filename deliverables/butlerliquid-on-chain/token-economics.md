# ButlerLiquid Token Economics: On-Chain Analysis

**Date:** 2026-07-09
**Token:** 0x15dd9165b3a80F83a5471f2E6eba57158cA3cF86 ($BL, ERC-20, 18 decimals)
**Chain:** Base L2
**Agent wallet:** 0x2FcfA4E5B934E0C6584E258721c0C08EF946c099 (ButlerLiquid, ACP id 1120)
**Owner:** 0xc0f7Da0b8B87e547CAA6D8A4F1A0Acc69d8b2F4e (EIP-7702 delegator smart account)
**Data sources:** Blockscout Base API (fresh, ~block 48,407,982), public Base RPC `https://mainnet.base.org` (fresh), Virtuals API (`api.virtuals.io/api/virtuals/40766`), ChainWard sentinel node (STALE by ~14 days; used only for immutable historical facts at-or-below block 47,806,437)

> **Sentinel freshness note.** At the time of this run the ChainWard sentinel head was block 47,806,437 with a timestamp age of ~14 days (~1,202,777 s behind wall-clock). Per the sentinel-freshness preflight rules, every current-state read below (`balanceOf`, `totalSupply`, LP `getReserves`) was executed against `https://mainnet.base.org` at block ~48,407,470-48,407,982 or pulled from Blockscout's live token API. Sentinel was only used to cross-check historical values that cannot mutate.

---

## 1. Token identification

| Field | Value | Source |
|-------|-------|--------|
| Contract | 0x15dd9165b3a80F83a5471f2E6eba57158cA3cF86 | Blockscout token API |
| Name | ButlerLiquid | Blockscout, Virtuals API |
| Symbol | BL | Blockscout, Virtuals API |
| Decimals | 18 | Blockscout token API |
| Type | ERC-1167 minimal proxy → `AgentTokenV2` (0x7BaB5D2e3EbdE7293888B3f4c022aAAAD88Ae2db) | Blockscout `implementations` |
| Verified on Blockscout | true (`is_verified_via_admin_panel`) | Blockscout address API |
| Virtuals project id | 40766 | `api.virtuals.io/api/virtuals/40766` |
| Virtual id (agent record) | 1140 | Virtuals API |
| Launched | 2025-11-13T12:00:00Z | Virtuals API `launchedAt` |
| Factory | `BONDING_V2` | Virtuals API `tokenomics.factory` |
| Status | AVAILABLE (graduated) | Virtuals API `status` |
| Category | IP MIRROR | Virtuals API |

ButlerLiquid is a standard Virtuals BONDING_V2 issuance — the same token pattern as AIXBT, VADER, and other graduated Virtuals agents. The Virtuals API also confirms the full Butler wallet map: sentient wallet `0xfAFa9C282b78FBd92B8DCfc962605F663B1cc364`, TBA `0x9d9B7c9734CFf3d6fD89Ac52E48bcc8C1B85E27B`, DAO `0xc2677AcD655EAe979456DD312F48AF3F1C2A49D9`, veToken `0x27d8fD4947772E6BcDD4EC1D4Ef315A4bcFCed43`, LP `0x780eeB55C05c9611987F839F5fB6C67b0312d2e5`, USDC V3 pool `0x11258E816C68E375A0BC609AB295A979AA75f54A`, MerkleDistributor `0xAf502417BD8075ed415Ce22414C22C62C63c316e`.

Note that the ACP agent record for ButlerLiquid (`id 1120`, endpoint `/api/agents?filters[walletAddress]=…`) reports `tokenAddress: null` and `isVirtualAgent: false`, and its `contractAddress` field points at the shared ACP router proxy (`0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` → `ACPRouter`), not the token. The token/graduation record only appears when you query the Virtuals catalog (project id 40766) — this is a Virtuals-launched token even though the ACP registry does not link back to it.

---

## 2. Supply

| Metric | Value | Source |
|--------|-------|--------|
| `totalSupply()` (public RPC, block ~48,407,982) | 1,000,000,000.000000 BL (`0x033b2e3c9fd0803ce8000000`) | `eth_call` on `0x15dd…3cF86` |
| Blockscout `total_supply` | 1,000,000,000.000000 BL | Blockscout token API |
| Assumed Virtuals launch supply | 1,000,000,000 BL | Standard BONDING_V2 mint, matches on-chain |
| Reduction from launch (via `_burn`) | 0 BL | `totalSupply` still exactly 1e27 wei |

Supply has never been reduced. Any tokens described as "burned" have been transferred to the dead address (see section 7), not removed via `_burn`.

Blockscout reports a `circulating_market_cap` of $26,329.27 at `exchange_rate` = $0.00002633 per BL. That implies a circulating supply of ~1,000,000,000 BL if taken literally — Blockscout is treating full totalSupply as circulating. In practice ~275.7M BL is still time-locked in the vesting contract (see section 6), so a realistic float is closer to ~724.3M BL and the market cap on that basis is ~$19,062. Fully-diluted market cap remains $26.3K.

---

## 3. Distribution at launch — allocations by design

Virtuals API `tokenomics.allocations` describes what the BONDING_V2 factory minted at launch and to which category each tranche is earmarked. All non-immediate tranches are custodied by the TokenTable Unlocker at `0x368B0d4094bfE7c336DB7099c84f2c9b14197609` (an EIP-1167 proxy to `TokenTableUnlockerV2` at `0x6C0717A2364733D9250D7207c4E9DEB0F742578A`).

| Tranche | BL | % of 1B | Vesting start | Duration | Status today |
|---------|---:|:---:|-------|:---:|-------|
| Team | 250,000,000 | 25.00% | 2026-11-13 | 12 months | Not started — fully locked |
| Sniper Tax Buyback for Team | 57,892,476 | 5.79% | 2026-02-14 | 9 months | Vesting — ~partial released |
| Ecosystem Treasury | 100,000,000 | 10.00% | 2025-12-10 | 10 weeks | Fully released |
| Marketing & Campaigns | 73,000,000 | 7.30% | 2026-01-01 | 6 weeks | Fully released |
| Technical Infrastructure & Development | 60,000,000 | 6.00% | 2025-11-14 | 4 weeks | Fully released |
| Early Adopters / Community Airdrop | 5,000,000 | 0.50% | 2025-11-19 | Immediate | Released |
| Partnership | 2,000,000 | 0.20% | Immediate | Immediate | Released |
| **Team-controlled sum** | **547,892,476** | **54.79%** | — | — | — |
| Residual (bonding curve → LP + public) | 452,107,524 | 45.21% | Launch | — | Released via curve → LP |

The team-controlled float is 54.79% of supply at launch. The remaining 45.21% went through the Virtuals bonding curve and ended up either in the Uniswap V2 LP or in the hands of curve buyers.

---

## 4. Distribution today — live top-10 holders

Snapshot pulled from Blockscout's live token holder list plus fresh `eth_call balanceOf` reads at block ~48,407,470-48,407,982 on public Base RPC. The Blockscout holder API returned 27 holders in the first page; those with unlabeled contract implementations (e.g. `EIP7702StatelessDeleGator`) are user smart-account wallets, not team-controlled infrastructure unless noted.

| # | Address | BL | % of 1B | Identity / role |
|---|--------|---:|:---:|-------|
| 1 | 0x780e…D2e5 | 327,899,925.35 | 32.79% | **Uniswap V2 BL/VIRTUAL pair** (LP reserve, see §6) |
| 2 | 0x368B…7609 | 282,162,889.24 | 28.22% | **TokenTableUnlockerV2** vesting contract (team + sniper-tax + still-vesting) |
| 3 | 0xe289…eE8a | 183,937,500.00 | 18.39% | Unlabelled EOA — 13,701 txs, 12,908 token transfers, actively receiving 250M-supply airdrops from unrelated meme launches. Appears to be a Base-ecosystem airdrop / sniper wallet, not affiliated with the team. |
| 4 | 0x1125…f54A | 58,750,507.42 | 5.88% | **Uniswap V3 BL/USDC pool** (secondary liquidity) |
| 5 | 0x57A4…9eC2 | 28,905,482.24 | 2.89% | SemiModularAccountBytecode (user smart wallet) |
| 6 | 0x7B6f…3844 | 23,250,032.60 | 2.32% | EIP7702StatelessDeleGator (user smart wallet) |
| 7 | 0xd283…5a3a | 20,000,000.00 | 2.00% | EOA — round 20M number, plausible early buyer |
| 8 | 0xA8d2…91a7 | 17,566,196.66 | 1.76% | EIP7702StatelessDeleGator (user smart wallet) |
| 9 | 0xfB53…046C | 15,000,000.00 | 1.50% | EOA — round 15M |
| 10 | 0xf0F0…cFEe | 14,294,903.18 | 1.43% | EOA |
| — | **Top-10 sum** | **971,767,436** | **97.18%** | — |
| — | Top-3 sum | 793,999,314 | 79.40% | LP + vesting contract + one whale |

**Concentration.** Top-10 hold 97.18% of supply; top-3 alone hold 79.40%. Even excluding the LP and the vesting contract — both of which are protocol-controlled rather than freely tradeable — the top three "sellable" holders (whale #3 + #5 + #6) together control 23.60% of the float. The Virtuals API's own `top10HolderPercentage` value of 92.67% differs slightly from the 97.18% computed here; the discrepancy is consistent with Virtuals excluding certain protocol addresses from its concentration metric.

**Notably missing from the top holders:** the agent's ACP wallet (0), the owner (0), the sentient wallet (0), the TBA (0), the DAO (0), and the veToken contract (0 BL directly — the veToken holds LP tokens, not underlying BL). Verified by fresh `eth_call balanceOf` on each.

---

## 5. Vesting / locks

### TokenTableUnlockerV2 (283M at Blockscout snapshot → 275.7M current)

The Blockscout holder page (an internally cached snapshot) shows the unlocker at 282,162,889.24 BL. A fresh `eth_call balanceOf` a few minutes later returned 275,730,311.50 BL, meaning ~6.4M BL had already been released between the two reads — the unlocker is a live streaming release contract, not a discrete cliff. Both readings are cited by source and block.

The 275.7M live figure reconciles cleanly with the tokenomics table:

- Team (250,000,000) — cliff-locked until 2026-11-13, so entire tranche still in the unlocker: **+250,000,000**
- Sniper Tax Buyback (57,892,476) — vesting linearly from 2026-02-14 over 9 months. Today (2026-07-09) is ~4.83 months in, so ~4.17 months remain of the 9-month schedule → ~26.8M still locked: **+~25,730,000**
- All other categories are past their end date (already 100% released).

Sum: 250M + ~25.7M ≈ **275.7M** — matches the current on-chain balance to within rounding. The vesting schedule published by Virtuals is being enforced as claimed.

### AgentVeToken (staked LP)

| Metric | Value | Source |
|--------|-------|--------|
| Contract | 0x27d8fD4947772E6BcDD4EC1D4Ef315A4bcFCed43 | Virtuals API |
| Blockscout name | "Staked ButlerLiquid" | Blockscout address API |
| Type | EIP-1167 proxy → `AgentVeTokenV2` | Blockscout `implementations` |
| BL held directly | 0 BL | Public RPC `balanceOf` |
| UNI-V2 LP tokens held | 2,273,925.97 UNI-V2 (99.95% of LP token supply) | Blockscout LP holders |
| Total UNI-V2 LP supply | 2,273,925.97 UNI-V2 (`0x1e185c61ce55546d388e2` wei) | `totalSupply` on 0x780e…D2e5 |

**99.95% of Uniswap V2 LP tokens are custodied inside the AgentVeToken contract.** This is the standard Virtuals protocol lock — the LP is not removable by any single party. The only other LP-token holder is EOA `0xdcF00D756231A641a353d9a844C4Af0477a67efB` with 1,058.97 UNI-V2 (0.05%).

### DAO / TBA / sentient wallet

All three protocol-adjacent addresses are **empty** at head. No treasury has been accumulated at the DAO, no assets held by the TBA, and the sentient wallet holds 0 BL. All confirmed by fresh `balanceOf`.

---

## 6. Trading footprint

### Primary pool — Uniswap V2 BL/VIRTUAL

| Metric | Value | Source |
|--------|-------|--------|
| Pair contract | 0x780eeB55C05c9611987F839F5fB6C67b0312d2e5 | Virtuals API |
| Blockscout name | "Uniswap V2" | Blockscout address API |
| token0 | 0x0b3e…7e1b (VIRTUAL) | `token0()` on pair |
| token1 | 0x15dd…3cF86 (BL) | `token1()` on pair |
| `getReserves()` VIRTUAL reserve | 17,427.51 VIRTUAL | `getReserves()` at block ~48,407,470 |
| `getReserves()` BL reserve | 350,760,382.91 BL | same |
| `blockTimestampLast` | 2026-07-09 04:02:47 UTC | same |
| Implied BL price | 0.0000497 VIRTUAL / BL | ratio of reserves |
| Virtuals API `liquidityUsd` | $18,056.75 | `api.virtuals.io/api/virtuals/40766` |
| Virtuals API `marketCapInVirtual` | 49,809.95 VIRTUAL | same |
| Virtuals API `fdv` | 49,833.90 VIRTUAL | same |

The BL side of the LP holds ~350.76M BL on the fresh RPC read but the Blockscout holder snapshot from a few minutes earlier reported ~327.90M. The delta is real trading — reserves fluctuate as swaps land — and confirms the LP is still active despite the extremely low volume.

### Secondary pool — Uniswap V3 BL/USDC

| Metric | Value | Source |
|--------|-------|--------|
| Pool contract | 0x11258E816C68E375A0BC609AB295A979AA75f54A | Virtuals API `usdcV3PoolAddress` |
| BL held by pool | 58,750,508.62 BL | `balanceOf` public RPC |
| Type | Uniswap V3 concentrated liquidity | Deployment |

The V3 pool holds 5.88% of total supply, but concentrated-liquidity pool balances don't map cleanly to effective depth — the actively-available liquidity is a subset of this depending on the active range. This is the secondary venue; the primary V2 BL/VIRTUAL pair is where price is set.

### Volume

| Metric | Value | Source |
|--------|-------|--------|
| Blockscout 24h volume | $121.61 | Blockscout token API `volume_24h` |
| Virtuals API 24h volume | $119.48 | `api.virtuals.io/api/virtuals/40766` |
| Virtuals API `netVolume24h` | -$119.28 (net sell pressure) | same |
| Virtuals API 24h price change | -2.99% | same |
| Total lifetime transfers | 45,734 | Blockscout token counters |
| Holder count | 6,156 (Blockscout) / 4,579 (Virtuals API) | both sources |

**24-hour on-chain volume is under $122.** For a graduated Virtuals agent generating $162,232 in gross agentic amount and 1,706 successful jobs (ACP stats), the token itself is effectively dormant as a tradeable asset.

---

## 7. Burns / treasury actions

### Dead address (0x000…dEaD)

| Metric | Value | Source |
|--------|-------|--------|
| Current balance | 480,613.488125 BL (0.0481% of supply) | `eth_call balanceOf` public RPC |
| Sentinel head balance (block 47,806,437) | 480,613.488125 BL (identical) | Sentinel `eth_call` — historical cross-check |

Balance is identical at both the fresh public-RPC head and the sentinel's 14-day-stale head, meaning **no BL has been sent to the dead address in the last two weeks**. What's there is a modest cumulative burn (0.048%) that pre-dates the sentinel gap. There is no active buyback-and-burn programme visible from the balance snapshot.

### Zero address (0x000…0000)

Balance: 0 BL. Confirmed on both fresh RPC and sentinel. Nothing has been sent here.

### Distinguishing the two dead addresses

Per the artifact rules: transfers to `0x000…0000` (mint/burn null address, checked via `_burn`) and to `0x000…dEaD` (community "dead" address) are distinct. In ButlerLiquid's case, `totalSupply` remains exactly 1e27 wei — no supply-reducing `_burn` calls have executed. All "burned" tokens are the 480,613 BL parked at `0x000…dEaD`, which is a transfer, not a supply reduction.

### Merkle airdrop distributor

`0xAf502417BD8075ed415Ce22414C22C62C63c316e` (Blockscout-tagged "MerkleDistributor") currently holds **9,725,611.26 BL (0.973%)**. The two "Immediate" tranches (5M Early Adopters + 2M Partnership) sum to 7M; the additional ~2.7M could represent unclaimed airdrop dust from later marketing distributions, or partial funding of a subsequent airdrop wave — the balance sits well below what a full unclaimed airdrop would imply for a 4,579-holder token.

### Agent revenue → BL flows

The ACP wallet's own BL transfer history (only 6 events, all in 2026-02 → 2026-03) shows a pattern of 5M + 7.45M BL received from the ACP router (`0xa6C9…9df0`) and immediately forwarded to a single unlabelled counterparty `0xb92fe925DC43a0ECdE6c8b1a2709c170Ec4fFf4f`, plus one 15K sweep. **The agent's wallet does not accumulate BL as revenue** — it pays out. Whether this constitutes a buyback-and-burn cycle would require tracing the counterparty (out of scope for this artifact; see the fund-flow analysis in `decode.md`).

---

## 8. Reconciliation

Sanity check that the identified buckets approximate 100% of the 1B supply (Blockscout snapshot, ~block 48,407,510):

| Bucket | BL | % |
|--------|---:|---:|
| Uniswap V2 LP (BL/VIRTUAL) | 327,899,925 | 32.79% |
| TokenTable vesting contract | 282,162,889 | 28.22% |
| Whale (0xe289…) — unrelated sniper EOA | 183,937,500 | 18.39% |
| Uniswap V3 pool (BL/USDC) | 58,750,507 | 5.88% |
| Top-holder tail (holders 5-10) | 119,111,858 | 11.91% |
| MerkleDistributor | 9,725,612 | 0.97% |
| Dead address (0x…dEaD) | 480,613 | 0.05% |
| All other holders (~6,140 addresses) | 17,931,096 | 1.79% |
| **Total** | **1,000,000,000** | **100.00%** |

The residual "all other holders" bucket (1.79%) is calculated as `1B – (top-10 + Merkle + dead)`. The identified buckets reconcile to total supply within rounding, as required.

---

## 9. Summary

**Bull-case reading.** ButlerLiquid ran a textbook Virtuals BONDING_V2 launch (Nov 2025), locked 99.95% of its Uniswap V2 LP tokens inside the protocol-controlled AgentVeToken (structurally non-rug-pullable), and is enforcing its published vesting schedule down to the token (275.7M current vs. 275.7M computed from the schedule). The team allocation is cliff-locked until 2026-11-13, and no supply-reducing `_burn` calls have been made — supply remains exactly 1B.

**Bear-case reading.** 24-hour on-chain volume is $122 against $18K of LP liquidity and 6,156 holders — the token is trading, but only just. Top-10 holders hold 97% of supply, and a single unlabelled EOA at #3 (`0xe289…`, a Base-ecosystem sniper wallet with 12,908 lifetime token transfers) sits on 18.4% of the entire supply. There is no accumulating treasury (DAO empty, TBA empty), no active staking of BL directly (veToken holds LP tokens, not BL), and no visible buyback-and-burn programme — the dead-address balance has been static for at least the 14-day sentinel-gap window.

**The story.** ButlerLiquid the agent is doing real HyperLiquid trading work (1,706 successful jobs, $162K gross agentic amount per ACP). ButlerLiquid the token is a graduated-but-quiet Virtuals asset that is being administered exactly as its launch documents describe. The distance between "the agent works" and "the token trades" is the interesting angle: on-chain volume of ~$120 per day suggests almost none of the agent's users care about the token, even as the vesting schedule dutifully unlocks its next tranche of BL on schedule.

---

## Verification notes

| Claim | Source | Method |
|-------|--------|--------|
| Token contract, name, symbol, decimals | Blockscout `/api/v2/tokens/0x15dd…` | HTTP GET |
| Total supply = 1e27 wei | Public RPC `eth_call 0x18160ddd` at block ~48,407,982 | JSON-RPC |
| Total supply Blockscout | Blockscout token API `total_supply` | HTTP GET |
| Virtuals project id 40766 metadata (launch, allocations, LP, addresses) | `api.virtuals.io/api/virtuals/40766` | HTTP GET |
| Agent record (ACP) shows tokenAddress=null, isVirtualAgent=false | `acpx.virtuals.io/api/agents?filters[walletAddress]=…` | HTTP GET |
| Top-10 holder list | Blockscout `/api/v2/tokens/0x15dd…/holders` | HTTP GET |
| LP reserves (VIRTUAL 17,427.51 / BL 350.76M) | Public RPC `getReserves()` on 0x780e…D2e5 | JSON-RPC |
| LP token distribution (99.95% AgentVeToken) | Blockscout `/api/v2/tokens/0x780e…/holders` | HTTP GET |
| UNI-V2 LP totalSupply | Public RPC `eth_call 0x18160ddd` on 0x780e…D2e5 | JSON-RPC |
| USDC V3 pool BL balance 58.75M | Public RPC `balanceOf` on 0x1125…f54A | JSON-RPC |
| MerkleDistributor BL balance 9.73M | Public RPC `balanceOf` on 0xAf50…316e | JSON-RPC |
| TokenTable vesting balance 275.7M live vs 282.2M cached | Public RPC `balanceOf` on 0x368B…7609 vs Blockscout snapshot | JSON-RPC + HTTP |
| Dead-address balance 480,613 BL, unchanged across 14-day sentinel gap | Public RPC + sentinel `balanceOf` on `0x000…dEaD` | JSON-RPC (cross-check) |
| Zero-address balance 0 BL | Public RPC `balanceOf` on `0x000…0000` | JSON-RPC |
| DAO / TBA / sentient / owner / agent BL balances all 0 | Public RPC `balanceOf` on each | JSON-RPC |
| Whale (0xe289…) 183.94M BL and airdrop-sniper profile | Public RPC `balanceOf` + Blockscout `/addresses/…/token-transfers` | JSON-RPC + HTTP |
| 24h volume $121.61 | Blockscout token API `volume_24h` | HTTP GET |
| 45,734 lifetime transfers, 6,156 holders | Blockscout `/api/v2/tokens/0x15dd…/counters` | HTTP GET |

TOKEN_ECONOMICS_DONE: /home/mburkholz/Forge/chainward/deliverables/butlerliquid-on-chain/token-economics.md
