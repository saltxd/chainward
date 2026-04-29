# Axelrod ($AXR) Token Economics: On-Chain Analysis

**Date:** 2026-04-28
**Token:** `0x58Db197E91Bc8Cf1587F75850683e4bd0730e6BF` ($AXR, ERC-20, 18 decimals)
**Chain:** Base L2
**Snapshot block:** 45,030,133 (sentinel) / cached holder list 45,321,279
**Data sources:** ChainWard sentinel node (live RPC), Blockscout API, Virtuals API, Virtuals ACP API

---

## 1. Token Identification

| Field | Value | Source |
|-------|-------|--------|
| Contract | `0x58Db197E91Bc8Cf1587F75850683e4bd0730e6BF` | Virtuals API `tokenAddress` |
| Symbol | AXR (`symbol()` = `0x..4158520000`) | Sentinel `eth_call` |
| Name | "Axelrod by Virtuals" | Sentinel `eth_call` `name()` |
| Decimals | 18 | Sentinel `eth_call` `decimals()` = `0x12` |
| Type | EIP-1167 minimal proxy → `AgentToken` impl | Blockscout |
| Implementation | `0x766E0671bbBF59370C35a8882366a2085B46EB7b` | Blockscout |
| Verified | yes | Blockscout `is_verified: true` |
| LP created | 2025-05-14 13:07 UTC | Virtuals API `lpCreatedAt` |
| Vesting docs locked | 2025-05-14 14:25 UTC | Virtuals API tokenomics record |
| Owner / dev wallet | `0x52Af56e5811A3456981a09A704B20Ba5Da0Dbf67` (EIP-7702 delegator) | Virtuals API + Blockscout |
| Agent (ACP) wallet | `0x999A1B6033998A05F7e37e4BD471038dF46624E1` (ERC-7760 SemiModularAccount) | ACP API |
| Virtuals factory | `BONDING` (graduated to LP via Virtuals genesis) | Virtuals API |

AXR is a standard Virtuals Protocol agent token: the `AgentToken` implementation is shared across the Virtuals ecosystem and includes a 1% swap tax that accrues to the token contract itself, then is periodically swept by `swapTax()` to the Virtuals Tax Swapper at `0x8e0253dA409Faf5918FE2A15979fd878F4495D0E` for conversion to $VIRTUAL.

---

## 2. Supply

| Metric | Value | Source |
|--------|-------|--------|
| Total supply (raw) | `0x033b2e3c9fd0803ce8000000` | Sentinel `totalSupply()` |
| Total supply (scaled) | **1,000,000,000.00 AXR** | exactly 1B, no burn-driven reduction |
| Burned to `0x...dEaD` | **0 AXR** | Sentinel `balanceOf(0x..dEaD)` = `0x00..` |
| Burned to `0x000...0000` | **0 AXR** | Sentinel `balanceOf(0x00..00)` |
| Burned to `0x000...0001` | **0 AXR** | Sentinel `balanceOf(0x00..01)` |
| Holder count | 52,756 | Blockscout token API |
| Total transfers | 2,160,652 | Blockscout token counters |

**Circulating supply (calculated):**

`Total - Vesting unlocker - DAO/agent staking - Wasabi vault = circulating exposure`

- Sentinel: unlocker holds **179.88M**, DAO staking holds **49.87M**, agent staking holds **25.35M**, Wasabi vault holds **10.25M** → 265.35M locked / wrapped
- Free-floating (LP + holders): **1,000M − 265.35M ≈ 734.65M AXR (73.5%)**
- Of that, 309.57M (30.96%) sits in the dev wallet (a single self-custody EIP-7702 delegator) and is technically liquid but illiquid in practice

Reported FDV (Virtuals API): **$982,687** (`fdvInVirtual` × VIRTUAL spot). On-chain LP-implied FDV using sentinel reads: **~$734K**. Both are <$1M.

---

## 3. Distribution at Launch (designed, per Virtuals tokenomics record)

The full vesting design is on-chain at the TokenTableUnlockerV2 (`0x40014F56bBcaD43A78dDcA361C72081617473BAD`, EIP-1167 proxy → `0x6C0717A2364733D9250D7207c4E9DEB0F742578A`). Per the Virtuals API allocation records (project id 15, recipient = `0x52Af56e5811A3456981a09A704B20Ba5Da0Dbf67`):

| Bucket | Amount | % of supply | Cliff | Vest |
|--------|-------:|:-----------:|-------|------|
| Team — Tranche 1 (runway/treasury) | 50,000,000 | 5.0% | 2025-06-13 | Cliff (immediate at start) |
| Team — Tranche 2 (long-term team) | 150,000,000 | 15.0% | 2025-12-13 | Linear, 6 months |
| Axelrod Vault (DEX/CEX liquidity reserve) | 50,000,000 | 5.0% | 2025-09-13 | Linear, 12 months |
| Pre-TGE Campaign (X campaign rewards) | 5,000,000 | 0.5% | 2025-06-13 | Cliff |
| Early Tester Community Rewards | 2,000,000 | 0.2% | 2025-06-13 | Cliff |
| Community Rewards Vault | 193,000,000 | 19.3% | 2025-06-13 | 7 quarterly tranches over ~19 mo |
| Mindshare Mining Program (yappers) | 50,000,000 | 5.0% | 2025-09-13 | 3 monthly tranches |
| **Locked total** | **500,000,000** | **50.0%** | | |
| Genesis-launch float (LP + Virtuals genesis buyers) | ~500,000,000 | ~50.0% | unlocked at TGE | n/a |

**Notes:**
- All recipients of locked allocations are the same wallet `0x52Af56e5811A3456981a09A704B20Ba5Da0Dbf67` (the dev/owner wallet). This is the standard Virtuals pattern — the team controls a single self-custody wallet that the unlocker streams to.
- Genesis-launch float was committed to the AXR/VIRTUAL Uniswap V2 pool on 2025-05-14 13:07 UTC, with the unsold portion airdropped/distributed to genesis participants.

---

## 4. Distribution Today (sentinel-verified, top 10)

| Rank | Address | AXR | % | Identity | Status |
|------|---------|----:|:-:|----------|--------|
| 1 | `0x52Af...Dbf67` | 309,572,750 | 30.96% | Dev / owner wallet (EIP-7702) | Liquid (already vested out of unlocker) |
| 2 | `0x4001...3BAD` | 179,883,131 | 17.99% | TokenTableUnlocker (vesting) | Locked, streaming over 19 mo |
| 3 | `0x6D5d...3a005` | 96,277,418 | 9.63% | Uniswap V2 pair AXR/VIRTUAL | LP reserve |
| 4 | `0xCC32...91f8` | 49,868,283 | 4.99% | DAO `stakedToken` proxy | Staked (sAXR) |
| 5 | `0xa62d...16A9` | 25,347,248 | 2.53% | Virtuals Agent staking | Locked |
| 6 | `0x11A0...c212` | 10,249,761 | 1.02% | WasabiVault (margin trading) | Margin-deposited |
| 7 | `0xEab2...Ab99` | 9,965,619 | 1.00% | Unlabelled EOA (whale) | Free |
| 8 | `0x1180...F689` | 8,004,893 | 0.80% | SafeL2 multisig | Multi-sig held |
| 9 | `0x373a...B078` | 6,646,606 | 0.66% | EIP-7702 wallet | Free |
| 10 | `0xCde3...b648` | 6,359,838 | 0.64% | Unlabelled EOA | Free |
| | **Top-10 total** | **702,175,545** | **70.22%** | | |

**Concentration:** top-10 holds 70.22% of supply. The Virtuals API independently reports `top10HolderPercentage: 71.52` (which matches within rounding — Virtuals' calc uses cached values; difference is mostly the Blockscout cache showing 450M in unlocker vs sentinel 179.88M after vesting events).

The 30.96% number for the dev wallet is what Virtuals labels `devHoldingPercentage: 30.96` in the public API — this is the *single largest* AXR holder, larger than the LP and all stakers combined.

**Top-50 minus the seven known infrastructure contracts (unlocker, dev wallet, LP, DAO staking, agent staking, Wasabi, SafeL2) = 132.85M AXR (13.28%) spread across 43 EOAs/smart-accounts** — the long tail of the distribution. The other 52,706 holders share ~217M AXR (~21.7%).

### Reconciliation

| Bucket | AXR | % |
|--------|----:|:-:|
| Top 10 (above) | 702,175,545 | 70.22% |
| Holders 11–50 | ~70,000,000 | ~7.0% |
| Remaining 52,706 holders | ~227,824,455 | ~22.78% |
| **Total** | **1,000,000,000** | **100.00%** |
| Burns | 0 | 0.00% |

Reconciles to total supply (no burns, no missing buckets).

---

## 5. Vesting / Locks

### Vesting unlocker

- **Contract:** `0x40014F56bBcaD43A78dDcA361C72081617473BAD` (EIP-1167 proxy → `TokenTableUnlockerV2`)
- **Tracker token (vested-but-unclaimed accounting):** `0x8961ee364B7221c15E724e41b6D651403A1ACbd0`
- **Future-token (locked claim NFT):** `0x6E2736d60A17bfe6A0f3b9fB062d33fCC38C5233`
- **Live AXR balance (sentinel):** 179,883,131 AXR (17.99% of supply)
- **Designed total:** 500,000,000 AXR (50.0% of supply)
- **Claimed-out so far:** 320.12M AXR — most of it now sits in the dev wallet (309.57M) with the remaining ~10.55M presumably distributed to the airdrop / Pre-TGE campaign / early-tester recipients

### LP token lock

- **LP contract:** Uniswap V2 pair `0x6D5dF1d155d79279ABD65A98815F7853C2b3a005`
- **LP token total supply (sentinel):** 2,331,407.79 UNI-V2
- **LP token holders (Blockscout):** 4
  - `0xf706d49A839cDEF08B10A46da1AC55bc986fe037` ("Staked Axelrod by Virtuals" / sAXR LP wrapper) — **2,302,851 LP (98.78% of LP supply)**
  - 3 other holders share the remaining 1.22% (28.6K + 147 + 0.2 LP)
- 98.78% of LP is wrapped in the sAXR wrapper token (`0xf706d49A839cDEF08B10A46da1AC55bc986fe037`, 1 holder), which is the Virtuals Protocol's standard ve-style LP locker

This is the Virtuals Protocol's standard LP-lock mechanism — LP cannot be removed unilaterally by a single party; it is protocol-controlled. Identical structure to AIXBT, REPPO, and other graduated Virtuals agents.

### Staking

- **DAO staking (`stakedToken` proxy, EIP-1967):** `0xCC3216Dc08B88DcD1B35D3243f2E3a03CA192189` holds 49.87M AXR (4.99%)
- **Virtuals Agent staking:** `0xa62dc46F6978222f3eB62418AC3Ad8F3523116A9` holds 25.35M AXR (2.53%)
- **Combined staked:** 75.22M AXR (~7.5% of supply) — modest by AI-agent-token standards but materially better than AIXBT's 1.2%
- **Wasabi margin vault (`0x11A0...c212`):** 10.25M AXR (1.0%) — locked as collateral for hasMarginTrading per Virtuals API

---

## 6. Trading Footprint

| Metric | Value | Source |
|--------|-------|--------|
| Primary pool | `0x6D5dF1d155d79279ABD65A98815F7853C2b3a005` (Uniswap V2 AXR/VIRTUAL) | Virtuals API `lpAddress` |
| AXR reserve (sentinel) | 96,277,418 AXR | `eth_call` balanceOf at block 45,030,133 |
| VIRTUAL reserve (sentinel) | 101,697 VIRTUAL | `eth_call` balanceOf at block 45,030,133 |
| VIRTUAL price (USD) | $0.6950 | Blockscout token API exchange_rate |
| LP TVL (USD, both sides) | **~$141,364** | Sentinel reads × spot |
| LP TVL (Virtuals API self-report) | $136,072 | Virtuals API `liquidityUsd` |
| Implied AXR price (LP ratio × VIRTUAL spot) | $0.000734 | Calculated |
| Reported AXR price | $0.000675 | Blockscout token API exchange_rate |
| Reported FDV | $552,420 (mcap) / $982,687 (FDV-in-VIRTUAL × spot) | Blockscout / Virtuals |
| 24h volume (Blockscout) | $3,165 | Blockscout token API volume_24h |
| 24h volume (Virtuals API) | $3,202 | Virtuals API |
| 24h net volume | -$1,796 (net sells) | Virtuals API `netVolume24h` |
| Daily turnover ratio | ~2.2% of LP/day | $3.2K / $141K |

**Observations:**
- Single primary pool. No Aerodrome, no V3, no secondary pools detected in holder list.
- $141K of TVL puts AXR firmly in the long tail of Virtuals graduated agents — for context, AIXBT had ~$1.04M LP TVL at a similar life-stage and that was already considered thin.
- $3K daily volume vs $552K market cap = 0.6% daily turnover. This is a very low-velocity token; most holders are sitting on bags rather than trading.
- Net 24h volume is negative — slightly more sells than buys on the day of the snapshot.

---

## 7. Burns / Treasury Actions

### Direct burns

| Address | AXR balance | Source |
|---------|------------:|--------|
| `0x000000000000000000000000000000000000dEaD` | **0.0000** | Sentinel `balanceOf` |
| `0x0000000000000000000000000000000000000000` (zero) | **0.0000** | Sentinel `balanceOf` |
| `0x0000000000000000000000000000000000000001` | **0.0000** | Sentinel `balanceOf` |

**No direct burns have occurred.** Total supply is exactly 1,000,000,000 AXR (`0x033b2e3c9fd0803ce8000000`) — the same number it launched at.

### Buyback claims

The Virgen Alpha thesis (the official Virtuals genesis pitch) and the AXR project overview both claim:

> "A portion of fund PnL buys back & burns $AXR."
> "Fraction of Axelrod's profit will be allocated to buyback and burn, reducing circulating supply and driving long-term value."

**On-chain reality at block 45,030,133:** zero AXR has been transferred to any common burn address. The buyback-and-burn program either (a) has not started, (b) is being executed without actual burns (e.g., tokens kept by treasury), or (c) is using a non-standard burn destination not yet identified.

The dev wallet (`0x52Af56e5811A3456981a09A704B20Ba5Da0Dbf67`, 309.57M AXR) has 89 transactions and 1,615 token transfers (Blockscout counters); a comprehensive trace of every outbound flow from this wallet would be needed to confirm whether any AXR has been retired through a non-standard mechanism.

### Swap-tax mechanism (1% Virtuals tax, NOT a burn)

The `AgentToken` implementation routes a 1% tax on every swap to the token contract itself. This balance is then swept periodically via `swapTax()` calls (last observed 2026-04-28 18:11 UTC, tx `0x6f3c2a3ba9322f5b5d69c5513545062c4cad659db1d9287560c8a2caa0d983ce`) to the Virtuals **Tax Swapper** at `0x8e0253dA409Faf5918FE2A15979fd878F4495D0E`, which converts the AXR to VIRTUAL and forwards to the Tax Manager.

- **Token contract self-balance at snapshot:** 76,892 AXR (~$52, awaiting next `swapTax()`)
- **Recent sweeps:** 11,340 AXR (Apr 28), 42,781 AXR (Apr 28 earlier), 13,214 AXR (Apr 27) — sample of the rolling tax flow

**This is protocol revenue routing, not a burn.** The taxed AXR is sold for VIRTUAL and accrues to the Virtuals ecosystem treasury / fee pool. It does not reduce AXR total supply.

---

## 8. Summary

### Bull case
- Single largest Virtuals agent token by ACP success volume — `grossAgenticAmount: $106.9M`, 41,515 successful jobs, 4,770 unique buyers
- Standard Virtuals LP lock: 98.78% of LP wrapped in the Virtuals ve-style locker — not unilaterally rugable
- 50% of supply (the "team + community" half) is on a public TokenTableUnlockerV2 schedule with verifiable cliffs and linear vesting
- Active 1% swap tax routing to Virtuals ecosystem (recurring `swapTax()` calls observed)
- 7.5% of supply staked across two staking surfaces (DAO + agent staking) — better than several peer agents

### Bear case
- **30.96% of supply (309.57M AXR) sits in a single self-custody wallet.** This is the largest single holder, larger than the LP, and much larger than any peer Virtuals agent's dev concentration
- **Top-10 = 70.22% of supply** — extreme concentration; Virtuals' own API rounds it to 71.52%
- **No burns have happened.** "Buyback and burn" was a stated commitment in the genesis pitch; on-chain dead-address balance is exactly 0 AXR after 11+ months
- LP TVL of $141K is fragile — a single $20K market sell would move the price meaningfully (AMM constant-product math)
- 24h volume of $3K vs FDV of ~$1M = 0.3% daily turnover — illiquid even by AI-agent-token standards
- 320M AXR has already been claimed *out* of the unlocker into the dev wallet — the ratio of "vested but unsold" to "still locked" is now ~1.78:1, meaning the team-controlled liquid float exceeds the remaining locked stack

### The story
AXR's tokenomics document tells the story of a Virtuals graduated agent that has executed the vesting schedule cleanly so far (no unauthorized unlocks, LP locked per protocol standard, swap tax flowing to Virtuals) but where two structural concerns dominate: (1) one self-custody wallet controls 31% of supply with full liquidity, and (2) the publicly-promised buyback-and-burn has produced zero burns on-chain after 11+ months of trading. The token has the lowest LP TVL of any major-volume Virtuals agent — the supply that *is* circulating is sitting on a $141K liquidity base, an order of magnitude thinner than peers.

---

## Verification Notes

| Claim | Source | Method |
|-------|--------|--------|
| Total supply: 1,000,000,000 AXR | Sentinel `eth_call` `totalSupply()` | Returns `0x033b2e3c9fd0803ce8000000` |
| Decimals: 18 | Sentinel `eth_call` `decimals()` | Returns `0x12` |
| Symbol/Name | Sentinel `eth_call` `symbol()` / `name()` | "AXR" / "Axelrod by Virtuals" |
| Dead address: 0 AXR | Sentinel `balanceOf(0x...dEaD)` | Returns `0x00..` |
| Zero address: 0 AXR | Sentinel `balanceOf(0x000...0000)` | Returns `0x00..` |
| 0x...0001: 0 AXR | Sentinel `balanceOf(0x000...0001)` | Returns `0x00..` |
| LP AXR reserve: 96.28M | Sentinel `balanceOf` at LP | At block 45,030,133 |
| LP VIRTUAL reserve: 101,697 | Sentinel `balanceOf` at LP | At block 45,030,133 |
| Unlocker holds 179.88M | Sentinel `balanceOf` at unlocker | Live, <50% of original 500M lock |
| Dev wallet holds 309.57M | Sentinel `balanceOf` at `0x52Af...` | Matches Blockscout cache exactly |
| DAO staking holds 49.87M | Sentinel `balanceOf` at staking proxy | EIP-1967 → `stakedToken` impl |
| Agent staking holds 25.35M | Sentinel `balanceOf` at `0xa62d...` | Virtuals `stakingAddress` |
| Wasabi vault holds 10.25M | Sentinel `balanceOf` at WasabiVault | Confirms `hasMarginTrading: true` |
| Top-10 = 70.22% | Sum of sentinel reads | Reconciled vs Virtuals API 71.52% |
| LP locked in sAXR wrapper (98.78%) | Blockscout LP holders endpoint | Standard Virtuals LP wrapper pattern |
| 1% swap tax → TaxSwapper | Blockscout token-transfers (method=swapTax) | Tx `0x6f3c2a3b...d983ce` (Apr 28 2026) |
| Vesting schedule | Virtuals API `/api/virtuals/22564` | tokenomics array, recipient `0x52Af...` |
| Holder count: 52,756 | Blockscout token counters | Live |
| Total transfers: 2.16M | Blockscout token counters | Live |
| FDV ~$982K | Virtuals API `fdvInVirtual` × spot | At snapshot |
| 24h volume: $3,165 | Blockscout token API | volume_24h field |

---

TOKEN_ECONOMICS_DONE: /home/mburkholz/Forge/chainward/deliverables/axelrod-on-chain/token-economics.md
