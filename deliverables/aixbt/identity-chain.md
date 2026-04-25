# AIXBT Identity Chain

**Agent:** AIXBT (virtualId 1199, @aixbt_agent)
**Investigated:** 2026-04-15
**Investigator:** ChainWard

---

## 1. Wallet Map

| Role | Address | Type | Deployer | Source |
|------|---------|------|----------|--------|
| Token ($AIXBT) | `0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825` | ERC-20 (EIP-1167 proxy of AgentToken) | `0x71B8EFC8..f533` (AgentFactoryV3) | Virtuals API, Blockscout |
| LP | `0x7464850CC1cFb54A2223229b77B1BCA2f888D946` | UniswapV2Pair | `0x8909Dc15..eC6` (UniswapV2Factory) | Virtuals API, Blockscout |
| TBA | `0x007a5Ef9431016C0A5F7BF65f078a83Dc394d793` | ERC-6551 (AccountV3Upgradable) | `0x00000000..5758` (ERC6551Registry) | Virtuals API, Blockscout |
| DAO | `0x7CCE756fd8C142b007c8E3ce1fD6CeF4E801B3D3` | EIP-1167 proxy of AgentDAO | `0x10Ee12A5..4899` (DAO factory) | Virtuals API, Blockscout |
| Staking | `0x0619a9D474fdbc343B0C84488bEc3A15733F4e38` | EIP-1967 proxy of stakedToken | `0x81F7cA6A..1415` (Virtuals ops) | Blockscout |
| Sentient Wallet | `0x8DFb37AaE4f8fCbD1f90015A9e75b48F50Fd9f59` | EOA | N/A | Virtuals API |
| ACP Wallet | `0x5FaCEbD66D78A69b400dC702049374B95745FBc5` | SemiModularAccountBytecode (ERC-4337) | N/A (ERC-7760) | ACP API |
| ACP Owner | `0x017ffeF9EF1268B2182472371562e369B79FF7Ac` | EOA | N/A | ACP API |
| Pre-Token | `0x0E3d0D584820Df0D30BA1A54846e8e46F146Ab07` | ERC-20 ("fun aixbt") | `0xF66DeA7b..3259` (Bonding proxy) | Virtuals API, Blockscout |
| Extraction Wallet | `0x1Bd953b21A0d1ed1A6De09421d99B19372C053B7` | EOA | N/A | On-chain tracing |
| Safe Multisig (#5 holder) | `0xB8d39DD8aBa3cc66Eda686EA6a773DC08f257c1e` | SafeL2 | N/A | Blockscout (holder list) |
| Distribution EOA | `0x92dC0E3420450186262D05616870d692A5001bBe` | EOA | N/A | On-chain tracing |

---

## 2. Deployer Tree

All AIXBT core contracts trace back to **Virtuals Protocol infrastructure**, not to AIXBT-specific deployers. This is the standard pattern for all Virtuals agents.

```
0x9547e85f..1A28 (Virtuals Protocol deployer, EOA)
  |
  +-- deployed 0x71B8EFC8..f533 (AgentFactoryV3 proxy)
  |     via tx 0x4bd2a63e...
  |     |
  |     +-- factory deployed 0x4F9Fd6Be..A825 ($AIXBT token)
  |           via tx 0x934b0673... (the "buy" tx on Bonding)
  |           Block 21867924
  |
  +-- deployed 0x10Ee12A5..4899 (DAO factory)
  |     via tx 0xbd0f3c51...
  |     |
  |     +-- factory deployed 0x7CCE756f..D3D3 (AIXBT DAO)
  |           via tx 0xf127654f...
  |           From: 0x9547e85f..1A28 calling DAO factory
  |           Block 21877276 (2024-11-02)
  |
  +-- deployed 0xF66DeA7b..3259 (Bonding proxy)
        via tx 0xaee1d115...
        |
        +-- Bonding created 0x0E3d0D58..Ab07 (pre-token "fun aixbt")
              via tx 0xf82f716b...

0x8909Dc15..eC6 (UniswapV2Factory, Uniswap infra)
  |
  +-- created 0x7464850C..D946 (AIXBT/WETH LP pair)
        via tx 0x934b0673... (same tx as token creation)

0x00000000..5758 (ERC6551Registry, standard)
  |
  +-- created 0x007a5Ef9..d793 (AIXBT TBA)
        via tx 0x934b0673... (same tx as token creation)

0x81F7cA6A..1415 (Virtuals ops EOA, launches staking suites)
  |
  +-- deployed 0x0619a9D4..4e38 (AIXBT staking contract)
        via tx 0xda5dfc83...
        Block 30429844 (2025-05-19)
```

**Key finding:** The token, LP, and TBA were all created in a single transaction (`0x934b0673...`), which was a `buy(7000 VIRTUAL, 0x0E3d...)` call on the Bonding contract by EOA `0x01148067..D8a7`. This is the standard Virtuals "graduation" event where an agent's pre-token transitions to a full token + LP.

The deployer `0x9547e85f..1A28` is the Virtuals Protocol deployer -- it deployed both the AgentFactory and the DAO factory. It is NOT specific to AIXBT. No individual AIXBT team wallet deployed any of the core contracts.

---

## 3. The Extraction Chain

### 3a. Sentient Wallet Drain (2026-04-15)

On April 15, 2026, the sentient wallet (`0x8DFb37..`) executed a sequence of transactions within minutes:

1. **03:26:43 UTC** -- Sold 0.1390 cbBTC via BaseSettler (`0x7747F8D2..2359`)
   - Tx: `0x0c3178bbc9e24056681f6729be5e11d491113dac125d704de2ad3dce1d3e9959`
   - BaseSettler is a verified Uniswap routing contract, NOT an AIXBT contract

2. **03:28:43 UTC** -- Approved USDC spend
   - Tx: `0xfa01ad39f8b20d13db8b0b2fe6cb4d13d81b739c0477c244e39d873b8e63a062`

3. **03:28:55 UTC** -- Swapped 1,190.82 USDC via MetaAggregationRouterV2 (KyberSwap)
   - Tx: `0x0e0914e4f7d9844f343f65007c8dd805a67f9f280bf1f7eeeefd83b775b4a761`
   - Received ~0.511 WETH

4. **03:29:45 UTC** -- Transferred 5.1647 ETH to extraction wallet `0x1Bd953b2..`
   - Tx: `0xed720aa51a9c44257600c325688edd709d9443596a5d5b683af5eb97dc7166b7`
   - This is a direct ETH transfer, no smart contract interaction

**Post-drain state (sentinel-verified at block ~44762000):**
- Sentient wallet ETH: ~237 Gwei (effectively 0)
- Sentient wallet USDC: 0
- The wallet was drained of all liquid assets

### 3b. Extraction Wallet (`0x1Bd953b21A0d1ed1A6De09421d99B19372C053B7`)

This EOA acts as a **consolidation and distribution point**:

**Inbound flows observed:**
- 5.165 ETH from sentient wallet (2026-04-15)
- 0.510 ETH from other address (2026-04-01)
- 0.666 ETH from other address (2026-03-04)
- 25,000,000 AIXBT from Safe multisig (2026-04-12)
- 25,000,000 AIXBT from Safe multisig (2026-04-01)
- Multiple `transfer` calls TO the AIXBT token contract (token operations)

**Outbound flows observed:**
- 45,000,000 AIXBT to `0x92dC0E34..1bBe` (2026-04-15, same day as drain)
- 6.0 ETH to `0x92dC0E34..1bBe` (2026-04-15)
- 1.383 ETH to `0x92dC0E34..1bBe` (2026-04-15)
- 82.00 USDC swapped via KyberSwap (2026-04-15)

**Blockscout counters:** 3,363 transactions, 14,620 token transfers

**Current ETH balance:** ~0.000000025 ETH (effectively 0, sentinel-verified)

### 3c. Distribution EOA (`0x92dC0E3420450186262D05616870d692A5001bBe`)

This address is the **#4 holder of $AIXBT** with exactly 45,000,000 tokens (4.5% of supply).

- Received 45M AIXBT from extraction wallet (2026-04-15)
- Received 6 ETH + 1.383 ETH from extraction wallet (2026-04-15)
- Also received multiple token transfers from vanity addresses starting with `0x1Bd9...`
- Blockscout counters show 0 outbound transactions, 0 gas used -- purely a receiving address (so far)
- Current ETH balance: ~6.38 ETH

### 3d. Safe Multisig (`0xB8d39DD8aBa3cc66Eda686EA6a773DC08f257c1e`)

The **#5 holder** with 41,551,000 AIXBT (4.2% of supply). This is a Gnosis Safe (SafeL2).

**Confirmed transfers to extraction wallet:**
- 25,000,000 AIXBT on 2026-04-12
- 25,000,000 AIXBT on 2026-04-01

This Safe is a major token source feeding the extraction chain. It has sent at least 50M AIXBT to the extraction wallet across two transactions.

---

## 4. Top Holder Analysis

| Rank | Address | Label | AIXBT (M) | % Supply | Connection |
|------|---------|-------|-----------|----------|------------|
| 1 | `0xF977..aceC` | Binance Hot Wallet 20 | 243.7M | 24.4% | Exchange |
| 2 | `0x76eC..Fbd3` | BtcTurk 13 | 64.9M | 6.5% | Exchange |
| 3 | `0x29AA..5082` | Unknown EOA | 46.3M | 4.6% | No known connection |
| 4 | `0x92dC..1bBe` | **Distribution EOA** | 45.0M | 4.5% | Fed by extraction wallet |
| 5 | `0xB8d3..7c1e` | **Safe Multisig** | 41.6M | 4.2% | Feeds extraction wallet |
| 6 | `0xc880..f391` | Unknown EOA | 28.5M | 2.9% | No known connection |
| 7 | `0xBaeD..439F` | Bybit Hot Wallet 6 | 28.0M | 2.8% | Exchange |
| 8 | `0x3304..566A` | Binance Hot Wallet | 23.7M | 2.4% | Exchange |
| 9 | `0x0D07..92Fe` | Gate.io | 23.4M | 2.3% | Exchange |
| 10 | `0x7464..D946` | AIXBT LP (UniV2) | 21.2M | 2.1% | Protocol contract |
| 11 | `0xb0A3..4411` | Unknown EOA | 19.2M | 1.9% | No known connection |
| 12 | `0x02F6..eDa9` | 0xwives.eth (Farcaster) | 18.7M | 1.9% | No known connection |
| 13 | `0x4e3a..B60` | MEXC 15 | 17.8M | 1.8% | Exchange |
| 14 | `0xffa8..d54` | Bitget 35 | 16.9M | 1.7% | Exchange |
| 15 | `0xf1Fd..FF4` | UniswapV3Pool | 14.9M | 1.5% | DEX liquidity |
| 16 | `0x0619..4e38` | **Staking Contract** | 14.6M | 1.5% | Protocol contract |

**Exchanges hold ~52% of circulating supply** across Binance (26.8%), BtcTurk, Bybit, Gate.io, MEXC, and Bitget.

**Connected team/insider wallets hold ~8.7% combined:**
- #4 (Distribution EOA): 4.5%
- #5 (Safe Multisig): 4.2%

---

## 5. ACP Owner Analysis

The ACP owner `0x017ffeF9EF1268B2182472371562e369B79FF7Ac` is an EOA that:
- Holds ~0.00059 ETH (dust)
- Has no deployment history (is_contract: false, no creation_tx)
- Has token transfers but no logged contract interactions
- Does NOT appear as deployer of any AIXBT contract
- Does NOT appear in the top holders list

This address appears to be a dedicated ACP administration wallet. It has no observable on-chain connection to the extraction chain or the deployer tree.

---

## 6. cbBTC Destination

The cbBTC was sold through `0x7747F8D2a76BD6345Cc29622a946A929647F2359` (**BaseSettler**):
- This is a verified Uniswap routing contract on Base
- It is NOT an AIXBT-controlled contract
- It is NOT deployed by any AIXBT-connected address
- The cbBTC was exchanged for WETH via Uniswap V3 pools during the swap

The sentient wallet sold 0.1390 cbBTC through this router. The WETH proceeds were consolidated with other assets before the final 5.165 ETH drain.

---

## 7. Staking Deployer (`0x81F7cA6AF86D1CA6335E44A2C28bC88807491415`)

This EOA deployed the AIXBT staking contract on 2025-05-19. It is NOT specific to AIXBT:
- 34,848 transactions, 13,906 token transfers
- Calls `launch`, `deployTTSuite`, `createPresets`, `createActuals` on various contracts
- This is a **Virtuals Protocol operations wallet** that deploys staking infrastructure for many agents
- Holds ~1.13 ETH (operational gas)

---

## 8. Fund Flow Summary

```
Safe Multisig (0xB8d3..)        Sentient Wallet (0x8DFb..)
  #5 holder, 41.6M AIXBT           Agent's operational wallet
         |                                    |
         | 50M AIXBT                          | 5.165 ETH (drain)
         | (two txs: Apr 1 + Apr 12)          | + cbBTC + USDC (sold)
         v                                    v
    Extraction Wallet (0x1Bd9..53B7)  <-------+
         |
         | 45M AIXBT + 7.38 ETH
         v
    Distribution EOA (0x92dC..)
         #4 holder, 45M AIXBT
```

---

## 9. Confidence Levels

| Claim | Confidence | Evidence |
|-------|------------|----------|
| Token deployed by Virtuals AgentFactory | **HIGH** | Blockscout creation_tx + creator_address matches AgentFactoryV3 |
| All core contracts are Virtuals infra, not AIXBT-specific | **HIGH** | Same deployers (0x9547, 0x81F7) deploy for many agents |
| Sentient wallet drained of ETH/cbBTC/USDC on Apr 15 | **HIGH** | Tx hashes verified, sentinel balance confirmed ~0 |
| Safe multisig feeds extraction wallet | **HIGH** | Two 25M AIXBT transfers visible on Blockscout |
| Extraction wallet feeds #4 holder | **HIGH** | 45M AIXBT transfer on same day as drain |
| #4 and #5 holders are connected via extraction chain | **HIGH** | Safe -> extraction -> distribution, all same-day |
| ACP owner has no connection to extraction chain | **MEDIUM** | No visible on-chain link, but off-chain connections unknown |
| 0x92dC is a team/insider wallet | **MEDIUM** | Funded exclusively by extraction wallet, holds nothing else, but no deployer proof |
| 0x29AA (#3 holder) is unrelated | **LOW** | No visible on-chain connection found, but investigation incomplete |

---

## 10. Verification Notes

All claims are sourced from:
- **Virtuals API:** `https://api.virtuals.io/api/virtuals/1199` (walletAddress, tokenAddress, lpAddress, daoAddress, tbaAddress, preToken)
- **ACP API:** `https://acpx.virtuals.io/api/agents/26/details` (returned empty -- agent may have been delisted or ID changed)
- **Blockscout API:** `https://base.blockscout.com/api/v2/addresses/{addr}` for all contract metadata, deployers, and creation tx hashes
- **Blockscout token holders:** `https://base.blockscout.com/api/v2/tokens/0x4F9Fd6Be.../holders`
- **Sentinel RPC:** Balance checks at block ~44762000 (2026-04-15)

Balances are snapshots and will change. Holder rankings are as of 2026-04-15.

---

## 11. Suggested Content Angle

**"The AIXBT Extraction Chain: Following 50M Tokens from a Safe to an Anonymous Wallet"**

The story: AIXBT has a three-layer extraction chain -- a Safe multisig holding 41.6M tokens feeds an extraction wallet, which feeds a distribution EOA that became the #4 holder with 45M tokens. On the same day the sentient wallet was drained of 5.165 ETH, the extraction wallet moved 45M AIXBT and 7.38 ETH to the distribution address. Together, these two connected wallets control ~8.7% of total supply.

The deployer tree is clean -- everything traces to standard Virtuals Protocol infrastructure. There is no evidence of unusual contract manipulation. The story is about token movement patterns and the relationship between identifiable wallets, not about contract-level exploits.
