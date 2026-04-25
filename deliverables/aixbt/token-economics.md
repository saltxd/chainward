# AIXBT Token Economics: On-Chain Analysis

**Date:** 2026-04-15
**Token:** 0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825 ($AIXBT, ERC-20, 18 decimals)
**Chain:** Base L2
**Data sources:** ChainWard sentinel node (live RPC), Blockscout API (full history)

---

## 1. Supply Analysis

### Total Supply

| Metric | Value | Source |
|--------|-------|--------|
| Total supply (on-chain) | 998,914,867.38 AIXBT | Blockscout token API |
| Assumed original supply | 1,000,000,000 AIXBT | Standard Virtuals launch |
| Reduction from 1B | 1,085,132.62 AIXBT (0.11%) | Calculated |

The total supply is 998.9M, not a round 1B. The ~1.09M reduction comes from the totalSupply decreasing (likely via a burn function that reduces supply rather than just sending to dead addresses). This is separate from the 4.04M sitting at 0x...dEaD.

**Zero address (0x0000...0000):** 0 AIXBT. Burns were not directed here.

### Burns to 0x...dEaD

| Date | Amount | Notes |
|------|--------|-------|
| 2025-03-04 | ~1,985,073 AIXBT | Three large burns from 3 addresses (647K, 724K, 613K) |
| 2025-02-03 | ~17,277 AIXBT | Multiple ~2.9K burns from 2 addresses |
| 2025-06-04 | 52,054 AIXBT | Single burn |
| Other | Dust amounts | Tiny burns throughout 2025-2026 |

**Dead address total (sentinel-verified):** 4,040,547.12 AIXBT (0.40% of supply)

Combined with the totalSupply reduction, approximately **5.13M AIXBT (0.51%)** has been permanently removed from circulation. This is minimal -- there was no significant burn program.

**Verification:** Sentinel `eth_call` balanceOf at 0x...dEaD returned `0x00...03579e7f7e6068d1b616d8` = 4,040,547.12 AIXBT at latest block.

---

## 2. Supply Breakdown

| Category | AIXBT | % Supply | Type |
|----------|------:|:--------:|------|
| **Exchange wallets (10 identified)** | **424,045,816** | **42.5%** | Custodial |
| Unknown whale EOAs (7) | 178,328,875 | 17.9% | Non-custodial |
| SafeL2 Multisig | 41,551,000 | 4.2% | Contract |
| LP reserve (AIXBT/VIRTUAL) | 19,619,308 | 2.0% | Contract |
| EIP7702 Delegator | 18,691,533 | 1.9% | Contract |
| Bridge contract | 14,094,829 | 1.4% | Contract |
| Staking contract | 11,925,783 | 1.2% | Contract |
| Dead address (burned) | 4,040,547 | 0.4% | Dead |
| Aerodrome CLPool (AIXBT/WETH) | 1,575,360 | 0.2% | Contract |
| **Remaining (~458K holders)** | **285,041,817** | **28.5%** | Distributed |

### Exchange Breakdown

| Exchange | AIXBT | % Supply |
|----------|------:|:--------:|
| Binance (2 wallets) | 267,392,230 | 26.8% |
| BtcTurk | 64,852,628 | 6.5% |
| Bybit | 27,978,305 | 2.8% |
| Gate.io | 23,412,898 | 2.3% |
| MEXC | 17,838,319 | 1.8% |
| Bitget | 16,855,243 | 1.7% |
| KuCoin | 2,281,256 | 0.2% |
| CoinEx | 1,987,784 | 0.2% |
| Indodax | 1,447,153 | 0.1% |
| **Total** | **424,045,816** | **42.5%** |

Binance alone holds more than a quarter of the entire supply. All exchange addresses are tagged and verified on Blockscout via OLI (Open Labels Initiative) and hildobby compilations.

### Top 10 Holders

| Rank | Address | AIXBT | % | Identity |
|------|---------|------:|:-:|----------|
| 1 | 0xF977...aceC | 243,678,631 | 24.4% | Binance Hot Wallet 20 |
| 2 | 0x76eC...Fbd3 | 64,852,628 | 6.5% | BtcTurk 13 |
| 3 | 0x29AA...5082 | 46,338,134 | 4.6% | Unknown EOA |
| 4 | 0x92dC...1bBe | 45,000,000 | 4.5% | Unknown EOA |
| 5 | 0xB8d3...7c1e | 41,551,000 | 4.2% | SafeL2 Multisig |
| 6 | 0xc880...f391 | 28,492,054 | 2.9% | Unknown EOA |
| 7 | 0xBaeD...439F | 27,978,305 | 2.8% | Bybit Hot Wallet 6 |
| 8 | 0x3304...566A | 23,713,599 | 2.4% | Binance Hot Wallet |
| 9 | 0x0D07...92Fe | 23,412,898 | 2.3% | Gate.io |
| 10 | 0x7464...D946 | 21,209,493 | 2.1% | UniswapV2 LP |

**Top 10 concentration:** ~566.2M AIXBT (56.7% of supply).

Three unknown EOAs in the top 10 collectively hold 119.8M AIXBT (12.0%). Notably, holder #4 (0x92dC...) holds exactly 45,000,000 -- a suspiciously round number that may indicate a team or institutional allocation.

The SafeL2 multisig at #5 (41.6M AIXBT, 4.2%) is a Gnosis Safe contract -- likely a team, treasury, or VC wallet.

---

## 3. LP Health Assessment

### Primary LP: AIXBT/VIRTUAL (Uniswap V2)

| Metric | Value | Source |
|--------|-------|--------|
| Contract | 0x7464850CC1cFb54A2223229b77B1BCA2f888D946 | Blockscout |
| Type | UniswapV2Pair | Verified on Blockscout |
| AIXBT reserve | 19,619,308 AIXBT | Sentinel balanceOf |
| VIRTUAL reserve | 714,974 VIRTUAL | Sentinel balanceOf |
| VIRTUAL USD value | ~$500,275 | At $0.6997/VIRTUAL |
| AIXBT USD value | ~$541,493 | At $0.0276/AIXBT |
| **Total LP value** | **~$1,041,768** | Sum of both sides |
| Implied AIXBT price | $0.0255 | From LP ratio |
| LP token supply | 2,831,427 UNI-V2 | Blockscout |
| LP token holders | 22 | Blockscout |

The LP holds only 2.0% of total AIXBT supply. For a token with $15.5M daily volume, $1.04M in LP reserves is extremely thin.

### LP Token Distribution

| Holder | LP Tokens | % of LP |
|--------|----------:|:-------:|
| AgentVeToken (0x3d5e...8a62) | 2,805,446 | 99.08% |
| Unknown EOA (0xFF32...B4d1) | 25,883 | 0.91% |
| 20 other holders | ~98 | 0.01% |

**99.08% of LP tokens are locked in the AgentVeToken contract.** This is the Virtuals Protocol's standard ve-token mechanism. LP is not freely removable by a single party -- it is protocol-controlled. This is a structural feature of Virtuals launches, not a unique AIXBT decision.

### Secondary Pool: Aerodrome CLPool (AIXBT/WETH)

| Metric | Value |
|--------|-------|
| Contract | 0x22A52bB644f855ebD5ca2edB643FF70222D70C31 |
| Type | Concentrated liquidity (CLPool) |
| AIXBT held | 1,575,360 AIXBT |
| WETH held | 13.07 WETH (~$30,847) |

Minimal secondary liquidity. The vast majority of on-chain trading routes through the primary VIRTUAL pair.

### LP Activity

The LP contract shows 118 transactions and 1,184,341 token transfers -- indicating heavy swap volume despite a small number of direct LP management transactions. Liquidity has been stable; no major add/remove events are visible in recent transfer history.

---

## 4. Staking Analysis

| Metric | Value | Source |
|--------|-------|--------|
| Contract | 0x0619a9D474fdbc343B0C84488bEc3A15733F4e38 | Blockscout |
| Type | EIP-1967 proxy -> stakedToken | Blockscout impl |
| AIXBT staked (sentinel live) | 11,925,783 AIXBT | Sentinel balanceOf |
| AIXBT staked (Blockscout cached) | 14,567,577 AIXBT | Holder list |
| Total transactions | 13,263 | Blockscout counters |
| Token transfers | 7,572 | Blockscout counters |
| APY | 0% | Virtuals API |
| Utilization | 0% | Virtuals API |

**Key observation:** The sentinel shows 2.6M fewer AIXBT in staking than Blockscout's cached holder list. This means tokens are actively being unstaked -- people are leaving. At 0% APY and 0% utilization, there is currently no economic incentive to stake AIXBT.

The staking contract has 13,263 transactions, indicating it was historically active. The 0% APY suggests the reward mechanism has either been depleted or deactivated.

**Only 1.2% of supply is staked.** For context, healthy staking ecosystems typically see 20-50% of supply locked. This is a ghost town.

---

## 5. Volume vs. Liquidity Analysis

| Metric | Value |
|--------|-------|
| 24h trading volume | $15,456,513 |
| On-chain LP liquidity | $1,041,768 |
| Daily turnover ratio | **14.8x** |

A 14.8x daily turnover ratio means the entire LP is theoretically traded through nearly 15 times per day. This is elevated but not necessarily indicative of wash trading -- AIXBT is listed on multiple major CEXes (Binance, Bybit, Gate.io, MEXC, Bitget, KuCoin, etc.) where the majority of volume likely occurs.

**Important context:** The $15.5M volume figure from CoinGecko/Blockscout aggregates both on-chain and CEX volume. The on-chain LP only needs to support on-chain trades, not the full $15.5M. CEX order books provide their own liquidity.

However, the combination of:
- 42.5% of supply on exchanges
- Only 2.0% in LP
- Only 1.2% staked
- $1M in on-chain liquidity

...means AIXBT is overwhelmingly a **CEX-traded token** at this point. On-chain activity is a thin layer on top of centralized exchange trading.

---

## 6. DAO Wallet

| Metric | Value | Source |
|--------|-------|--------|
| Address | 0x7CCE756fd8C142b007c8E3ce1fD6CeF4E801B3D3 | Virtuals |
| Type | EIP-1167 proxy -> AgentDAO | Blockscout |
| ETH balance | 0 | Blockscout |
| Token holdings | 0 | Blockscout |
| Transactions | 151 | Blockscout counters |
| Token transfers | 1 | Blockscout counters |

The DAO wallet is empty. It had 151 transactions historically and exactly 1 token transfer. Whatever was in here has been moved out. The DAO mechanism appears inactive.

---

## 7. Price Context

| Timeframe | Price | Fully Diluted Mcap | Notes |
|-----------|------:|-------------------:|-------|
| ATH (~Jan 2025) | ~$1.00 | ~$999M | AI agent hype peak |
| Current (Apr 2026) | $0.0276 | $27.4M | -97.2% from ATH |

### The Math

- At $1.00, the 243M AIXBT in Binance Hot Wallet 20 was worth **$243M notional**
- At $0.0276, those same tokens are worth **$6.7M**
- The SafeL2 multisig (likely team/treasury) went from $41.6M to $1.1M
- Exchange reserves went from ~$424M notional to ~$11.7M

### What the Decline Looks Like

The token traded near $1.00 briefly during the AI agent speculation wave in early 2025. It has since declined 97.2%, tracking the broader collapse in AI agent token valuations on Virtuals Protocol.

Key context: AIXBT is one of the highest-profile Virtuals agents (458K holders, 15.7M total transfers). The decline is not unique to AIXBT -- it reflects a sector-wide repricing. The Virtuals Protocol token ($VIRTUAL) itself has declined significantly from its highs.

---

## 8. Summary of Findings

### The Bull Case
- 458K holders across 15.7M transfers -- genuine adoption breadth
- Listed on 10+ exchanges including Binance -- serious distribution
- LP locked in AgentVeToken (99% of LP tokens) -- protocol-controlled, not rug-pullable
- Still generating $15.5M daily volume despite price decline
- Bridge contract holds 14.1M AIXBT -- cross-chain activity exists

### The Bear Case
- 97.2% decline from ATH with no signs of reversal
- Staking at 0% APY, actively being drained (2.6M unstaked between Blockscout cache and live sentinel)
- DAO wallet completely empty -- no treasury, no governance resources
- Only 3.3% of supply in DeFi (LP + staking + Aerodrome) -- effectively a CEX token
- 42.5% of supply sits on exchanges -- either for sale or already abandoned
- Unknown whale wallets hold 17.9% -- concentration risk with no transparency
- Three unknown EOAs in the top 6 holders -- who are they?
- Exactly 45M AIXBT in one wallet (round number = likely team/insider allocation)
- $1.04M on-chain liquidity for a $27.4M market cap = 3.8% depth ratio

### The Story
AIXBT token economics tell the story of an agent that achieved massive distribution (458K holders, 10+ exchange listings) but has seen its economic infrastructure hollow out. The staking system is dead (0% APY, active withdrawals), the DAO is empty, and the on-chain presence is a shell around what is now essentially a centralized exchange trading instrument. 97% of the value is gone, and every operational wallet is either empty or draining.

---

## Verification Notes

| Claim | Source | Method |
|-------|--------|--------|
| Total supply: 998,914,867.38 | Blockscout token API | `GET /api/v2/tokens/{addr}` |
| LP AIXBT reserve: 19,619,308 | Sentinel RPC | `eth_call` balanceOf at latest block |
| LP VIRTUAL reserve: 714,974 | Sentinel RPC | `eth_call` balanceOf at latest block |
| Staking balance: 11,925,783 | Sentinel RPC | `eth_call` balanceOf at latest block |
| Dead addr balance: 4,040,547 | Sentinel RPC | `eth_call` balanceOf at latest block |
| Zero addr balance: 0 | Sentinel RPC | `eth_call` balanceOf at latest block |
| Top holders list | Blockscout | `GET /api/v2/tokens/{addr}/holders` |
| Exchange labels | Blockscout/OLI | Address metadata tags |
| LP token distribution | Blockscout | `GET /api/v2/tokens/{lp_addr}/holders` |
| Staking contract type | Blockscout | Address implementations field |
| DAO wallet empty | Blockscout | `GET /api/v2/addresses/{addr}/tokens` + counters |
| LP verified as UniswapV2Pair | Blockscout | Address `name` field, verified contract |
| AgentVeToken holds 99% LP | Blockscout | LP token holder list |
| Burn events | Blockscout | `GET /addresses/0x...dEaD/token-transfers` |
| Volume/price data | Blockscout/CoinGecko | Token API exchange_rate and volume_24h fields |

---

## Suggested Content Angle

**"The $1B Ghost Town"** -- AIXBT hit a billion-dollar fully diluted market cap in early 2025. Fifteen months later, the token is down 97%, the staking system is dead, the DAO is empty, and 42% of supply sits on exchanges. But 458K holders and $15.5M daily volume say it is still alive. This is not a rug pull story -- the LP is protocol-locked and the burns are real. This is the story of what happens to an AI agent token after the hype cycle ends. The infrastructure decays, the incentives disappear, and what remains is a CEX trading instrument with a ghost-town on-chain presence.
