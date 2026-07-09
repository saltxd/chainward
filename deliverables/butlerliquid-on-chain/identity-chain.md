# ButlerLiquid Identity Chain

**Agent:** ButlerLiquid (ACP #1120, virtualId 1140, `$BL`, @ButlerLiquid)
**Investigated:** 2026-07-09
**Investigator:** ChainWard
**Sentinel freshness note:** cw-sentinel head was **20,406 minutes (~14 days) behind tip** at start of investigation (block 47,806,437 vs public tip ~48,407,900). Per runbook, sentinel used **only for immutable historical facts**; all current-state reads (balances, nonces, contract code, holder snapshots) come from `https://mainnet.base.org` and Blockscout, timestamped to a specific block.

---

## 1. Wallet Map

| Role | Address | Type / Proxy | Deployer / Authority | Source |
|------|---------|--------------|---------------------|--------|
| ACP Wallet (target) | `0x2FcfA4E5B934E0C6584E258721c0C08EF946c099` | SemiModularAccountBytecode (ERC-4337, ERC-7760 proxy) | Alchemy Modular Account Kit impl `0x00000000..7383` | ACP API `agents/1120` `walletAddress`; Blockscout `implementations` |
| ACP / Virtuals Owner EOA | `0xc0f7Da0b8B87e547CAA6D8A4F1A0Acc69d8b2F4e` | EOA with **EIP-7702** delegation to MetaMask StatelessDelegator `0x63c0c19a..E32B` | Self-delegating EOA | ACP API `ownerAddress`; Virtuals API `walletAddress`; `eth_getCode` prefix `0xef0100` |
| Sentient Wallet | `0xfAFa9C282b78FBd92B8DCfc962605F663B1cc364` | EOA — **never used**, `nonce=0`, `has_logs=false`, 0 transfers | N/A | Virtuals API `sentientWalletAddress`; Blockscout counters |
| Token ($BL) | `0x15dd9165b3a80F83a5471f2E6eba57158cA3cF86` | EIP-1167 proxy of AgentTokenV2 `0x7BaB5D2e..E2db` | Virtuals AgentFactory (impl deployed by `0x9547e85f..1A28` in tx `0xc569f265..1935`) | Virtuals API `tokenAddress`; Blockscout `implementations` + creator of impl |
| LP (BL / VIRTUAL) | `0x780eeB55C05c9611987F839F5fB6C67b0312d2e5` | UniswapV2Pair | UniswapV2Factory (Uniswap infra) | Virtuals API `lpAddress`; Blockscout `name: "Uniswap V2"` |
| USDC V3 Pool | `0x11258E816C68E375A0BC609AB295A979AA75f54A` | UniswapV3Pool (unverified) | UniV3Factory | Virtuals API `usdcV3PoolAddress`; Blockscout token holder row |
| veToken (Staked $BL, sBL) | `0x27d8fD4947772E6BcDD4EC1D4Ef315A4bcFCed43` | EIP-1167 proxy of AgentVeTokenV2 `0xE561031A..6756` | Virtuals staking factory | Virtuals API `veTokenAddress`; Blockscout `implementations` |
| DAO | `0xc2677AcD655EAe979456DD312F48AF3F1C2A49D9` | EIP-1167 proxy of AgentDAO `0x29Dd6413..D53c` | Virtuals DAO factory | Virtuals API `daoAddress`; Blockscout `implementations` |
| TBA (ERC-6551) | `0x9d9B7c9734CFf3d6fD89Ac52E48bcc8C1B85E27B` | EIP-1167 proxy of ERC-6551 AccountV3 `0x55266d75..96e7` | ERC6551Registry (standard) | Virtuals API `tbaAddress`; runtime code prefix `0x363d3d373d3d3d363d73...` |
| Pre-token pair (bonding) | `0x819fEd7c2B27820e71bfB3D3d801C284ED516A5d` | Bonding curve pair contract (unverified) | Virtuals Bonding proxy | Virtuals API `preTokenPair` |
| Airdrop MerkleDistributor | `0xAf502417BD8075ed415Ce22414C22C62C63c316e` | MerkleDistributor (verified) | `0x81F7cA6A..1415` (Virtuals ops EOA) in tx `0x32f77b73..d5bb` | Virtuals API `airdropMerkleDistributor`; Blockscout `creator_address_hash` |
| Vesting (TokenTable Unlocker) | `0x368B0d4094bfE7c336DB7099c84f2c9b14197609` | EIP-1167 proxy of TokenTableUnlockerV2 `0x6C0717A2..578A` | TokenTable factory (third-party vesting infra, not Virtuals) | Blockscout `implementations`; holds 282.16M $BL (28.22% supply) |
| ERC-4337 EntryPoint (v0.7) | `0x0000000071727DE22E5E9d8BAf0edAc6f37da032` | Canonical EntryPoint | N/A (protocol infra) | Blockscout `name: "EntryPoint"`; called by ACP wallet's bundler |
| Observed Bundler EOA | `0x2d3fAEac23567d32b249B2325689f6f76dDa4A28` | EOA (`is_contract: false`, ~0.10 ETH) | N/A | First observed `handleOps` caller for ACP wallet, tx `0x6a7b9334..cccd8` |
| Virtuals ACP PaymentManager | `0xEF4364Fe4487353dF46eb7c811D4FAc78b856c7F` | ERC1967Proxy → PaymentManager `0x61683355..d6Fe` | Virtuals infra | Blockscout `implementations`; visible as inbound funder to ACP wallet (`0xcc596d85..eda8`) |
| Merkle Airdrop Claim Router | `0xD4D1e8F000BCE71b2fe89d59989FcD2Cd5128275` | CumulativeMerkleDrop (verified) | Third-party airdrop infra | Blockscout `name`; observed inbound to ACP wallet (`0x3cdf8b6c..5fbb`) |

---

## 2. Deployer Tree

All core ButlerLiquid contracts trace to **Virtuals Protocol infrastructure**, not to ButlerLiquid-specific deployers. This matches the standard Virtuals graduation pattern — same deployer tree as AIXBT.

```
0x9547e85f..1A28 (Virtuals Protocol deployer, EOA)
  |
  +-- deployed 0x7BaB5D2e..E2db (AgentTokenV2 implementation)
        via tx 0xc569f265..1935
        [Blockscout: creation_transaction_hash + creator_address_hash]
        |
        +-- Virtuals AgentFactory cloned it via EIP-1167 into
            0x15dd9165..cF86 ($BL token)
            Graduated 2025-11-13T13:38:26Z (Virtuals API lpCreatedAt)

0x9547e85f..1A28 also deploys AgentDAO / AgentVeTokenV2 / Bonding implementations
  used by the DAO (0xc2677A..49D9), veToken (0x27d8fD..Ced43), preTokenPair (0x819fEd..6A5d)

0x81F7cA6A..1415 (Virtuals ops EOA — same wallet that deployed AIXBT's staking suite)
  |
  +-- deployed 0xAf502417..316e (BL Airdrop MerkleDistributor)
        via tx 0x32f77b73..d5bb

Uniswap V2 Factory (Uniswap infra, not Virtuals)
  |
  +-- created 0x780eeB55..d2e5 (BL / VIRTUAL LP)
        at ~2025-11-13T13:38:26Z (per Virtuals API)

ERC6551Registry (standard, chain-wide)
  |
  +-- created 0x9d9B7c97..E27B (BL agent's TBA)

Alchemy Modular Account Kit infra
  |
  +-- SemiModularAccountBytecode 0x00000000..7383 (impl)
        is cloned via ERC-7760 into
        0x2FcfA4E5..c099 (ACP wallet)
        First on-chain activity: 2025-11-02T20:02:59Z, block 37,662,216
        Deployed via ERC-4337 UserOp bundled by 0x2d3fAEac..4A28 → EntryPoint 0x00000000..a032
        [tx: 0x6a7b9334..cccd8]

Self-authored:
  0xc0f7Da0b..2F4e (owner EOA)
    delegates via EIP-7702 to 0x63c0c19a..E32B (MetaMask StatelessDelegator)
    [code prefix 0xef0100 + 20-byte target]
```

**Key finding:** The token, DAO, and veToken are all EIP-1167 clones of Virtuals-owned implementations, and the implementation contracts themselves were deployed by the Virtuals Protocol deployer `0x9547e85f..1A28` — the same EOA that deploys AgentTokenV2 for every graduated Virtuals agent. The staking/airdrop suite was deployed by the Virtuals ops EOA `0x81F7cA6A..1415`, which is also the wallet observed deploying AIXBT staking. No ButlerLiquid-team-specific address deployed any of the core contracts.

The ACP wallet was created via Alchemy's Modular Account Kit (ERC-4337 + ERC-7760) at agent registration on 2025-11-02, deployed lazily by a bundler UserOp against EntryPoint v0.7. The Virtuals API `createdAt` (2025-11-02T20:02:10Z) matches the on-chain first-activity timestamp (2025-11-02T20:02:59Z) to within a minute.

---

## 3. Ownership Extraction

### 3a. ACP Wallet (`0x2FcfA4E5B934E0C6584E258721c0C08EF946c099`)

- **Type:** ERC-4337 smart account, deployed as an **ERC-7760** minimal proxy.
- **Runtime code:** 162 bytes, prefix `0x363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076cc3735...` — the ERC-7760 clone bytecode with the EIP-1967 implementation-slot marker (`0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`). [`eth_getCode` at block 48,407,900 via public RPC]
- **Implementation:** `0x000000000000c5A9089039570Dd36455b5C07383` — Alchemy Modular Account Kit's `SemiModularAccountBytecode` (Blockscout-verified).
- **EntryPoint:** `0x0000000071727DE22E5E9d8BAf0edAc6f37da032` — canonical ERC-4337 v0.7 EntryPoint on Base. Observed as the direct caller in the wallet's earliest activity tx `0x6a7b9334..cccd8`.
- **Bundler observed:** EOA `0x2d3fAEac23567d32b249B2325689f6f76dDa4A28`, which posted the first `handleOps` batch for this account.
- **Upgrade authority:** The ERC-7760 pattern makes the implementation slot immutable at the proxy layer — the account cannot be upgraded to a new implementation. Owner-level authority (signing UserOps) is held by whatever key(s) are registered in the SemiModularAccountBytecode's own owner storage (not enumerated here — would require the wallet's initcode replay).
- **Nonce (public RPC, block 48,407,900):** `1` — classic ERC-4337 pattern. Real activity count comes from Blockscout `token_transfers_count = 2,959`.
- **`transactions_count` (Blockscout):** `0` — expected. All ops arrive through the EntryPoint.

### 3b. ACP Owner EOA (`0xc0f7Da0b8B87e547CAA6D8A4F1A0Acc69d8b2F4e`)

- **Type:** EOA with an active **EIP-7702** delegation.
- **Runtime code (public RPC, block 48,407,900):** `0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b` — EIP-7702 delegation designator (`0xef0100`) + 20-byte target `0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B`.
- **Delegation target:** `EIP7702StatelessDeleGator` (Blockscout-verified) — MetaMask's stateless smart-account implementation. The EOA itself signs 7702 auth-lists that grant this implementation the ability to execute batched calls on the EOA's behalf.
- **Nonce:** `345` (public RPC, block 48,407,900) — normal EOA usage plus 7702 auth-lists.
- **Balances (block 48,407,900):** `0.000800655 ETH` (Blockscout `coin_balance`); `0 USDC` (public RPC `balanceOf`).
- **On-chain activity:** 352 txs, 2,281 token transfers (Blockscout `/counters`).
- **Cross-linked from Virtuals:** Virtuals API `virtuals/40766` lists this exact EOA under `creator.userSocials[0].walletAddress`, alongside 5 other EVM wallets and 3 Solana wallets tied to the same `did:privy:cmhi44zvf00k6js0cxf0k9gzj` Privy identity. The other declared EVM wallets are `0x15891eEA..74e8`, `0x64b58FC8..3BD1`, `0x76FDc0A3..8D51`, `0x683799415..c98a`. These share the ButlerLiquid `did:privy` operator but were not resolved on-chain here — flagged for follow-up in token-economics.

### 3c. Sentient Wallet (`0xfAFa9C282b78FBd92B8DCfc962605F663B1cc364`)

- **Type:** EOA.
- **`eth_getCode`:** empty (0 bytes).
- **Nonce (public RPC, block 48,407,900):** `0` — has never sent a transaction.
- **Balances:** `0 ETH`, `0 USDC` (public RPC + Blockscout, block 48,407,900).
- **Blockscout `/counters`:** 0 txs, 0 token transfers, no logs, no tokens. `has_logs=false`, `has_token_transfers=false`.
- **Interpretation:** Declared by Virtuals as `sentientWalletAddress` but **never observed on-chain**. This is the "dormant sentient" pattern noted in `SKILL.md` (Anomaly Patterns § "Dormant wallets") — reserved slot in the Virtuals data model with no realized on-chain footprint. Not a discrepancy per se, but the on-chain reality is: this is a fresh, unused key.

### 3d. TBA (`0x9d9B7c9734CFf3d6fD89Ac52E48bcc8C1B85E27B`)

- **Type:** ERC-6551 Token Bound Account.
- **Runtime code:** 346 bytes, prefix `0x363d3d373d3d3d363d7355266d75d1a14e4572138116af39863ed6596e7f5af4...` — EIP-1167 minimal proxy pattern with target `0x55266d75d1a14e4572138116af39863ed6596e7f` (ERC-6551 AccountV3 implementation).
- **Nonce:** `1` (public RPC) — has been "initialized" but with negligible direct activity.
- **Blockscout `/counters`:** 0 txs, 0 token transfers. Last balance-refresh block was 38,125,877 (Nov 2025), consistent with an unused reserved slot.
- **Bound NFT:** not resolved (would require reading the TBA's initialization salt and the ERC6551Registry's account-derivation function).

### 3e. DAO (`0xc2677AcD655EAe979456DD312F48AF3F1C2A49D9`)

- EIP-1167 clone of `AgentDAO` (`0x29Dd6413B7a0B6a380326894FF839903c73CD53c`).
- Standard Virtuals DAO — the DAO's proposals are gated on veToken (sBL) holdings.
- Governance authority is delegated to sBL holders. Since sBL has only **1 holder** (see § 4), governance is effectively single-controller today.

### 3f. LP (`0x780eeB55C05c9611987F839F5fB6C67b0312d2e5`)

- UniswapV2Pair, unverified but Blockscout-labeled `"Uniswap V2"`.
- Total UNI-V2 LP token supply: 2,273,925,970 (18-decimal units), split between only 2 holders.
- One of those 2 holders is the veToken contract (see § 4) — this is the standard Virtuals pattern where LP tokens are locked into the staking/veToken contract at graduation.

### 3g. veToken (`0x27d8fD4947772E6BcDD4EC1D4Ef315A4bcFCed43`)

- EIP-1167 clone of `AgentVeTokenV2` (`0xE561031A2992C3b6E0e5eaF6f19Ea04d3a5A6756`).
- Blockscout name: "Staked ButlerLiquid" (sBL).
- sBL total supply: 2,273,925,970.759 (matches LP supply minus 1 unit dust) — the veToken represents 1:1 wrapping of the LP.
- **Holder count: 1** — the veToken has a single holder. This means all initial LP has been staked into a single sBL position controlled by one address. That address governs the DAO and controls unstaking of the LP.

---

## 4. Declared vs Observed Reconciliation

| Field | Declared source | Declared value | Observed on-chain | Match? |
|-------|-----------------|----------------|-------------------|--------|
| ACP `walletAddress` | ACP API `agents/1120` | `0x2FcfA4E5..c099` | Contract exists at that address, ERC-4337 smart account, active | Yes |
| ACP `ownerAddress` | ACP API `agents/1120` | `0xc0f7Da0b..2F4e` | EOA with EIP-7702 delegation, active | Yes |
| ACP `hasGraduated` | ACP API `agents/1120` | `true` | Token exists, LP live at UniV2, sBL supply matches LP | Yes |
| ACP `walletBalance` | ACP API `agents/1120` | `"30.757913"` (USDC) | `balanceOf` USDC on ACP wallet = 30.757913 (block 48,407,900) | Yes (exact) |
| Virtuals `walletAddress` | virtuals/40766 | `0xc0f7Da0b..2F4e` | Same as ACP ownerAddress | Yes (identity: creator == owner) |
| Virtuals `sentientWalletAddress` | virtuals/40766 | `0xfAFa9C28..c364` | EOA, `nonce=0`, `has_logs=false`, 0 balance, no transfers ever | **Declared but never used on-chain** |
| Virtuals `tokenAddress` | virtuals/40766 | `0x15dd9165..cF86` | EIP-1167 proxy of AgentTokenV2, 6,156 holders, 1B total supply | Yes |
| Virtuals `preToken` | virtuals/40766 | `0x15dd9165..cF86` | **Same as tokenAddress** — no separate pre-token contract | Legacy field carryover; ButlerLiquid apparently launched under BONDING_V2 with tokenAddress == preToken |
| Virtuals `lpAddress` | virtuals/40766 | `0x780eeB55..d2e5` | UniV2 pair, live | Yes |
| Virtuals `usdcV3PoolAddress` | virtuals/40766 | `0x11258E81..f54A` | UniV3-shaped contract, holds 58.75M $BL (5.88% supply) | Yes |
| Virtuals `daoAddress` | virtuals/40766 | `0xc2677AcD..49D9` | EIP-1167 of AgentDAO | Yes |
| Virtuals `tbaAddress` | virtuals/40766 | `0x9d9B7c97..E27B` | ERC-6551 AccountV3 clone, unused | Yes (exists but dormant) |
| Virtuals `veTokenAddress` | virtuals/40766 | `0x27d8fD49..Ced43` | Staked ButlerLiquid, 1 holder | Yes |
| Virtuals `totalSupply` | virtuals/40766 | `1,000,000,000` | Blockscout `total_supply` = 1,000,000,000e18 | Yes |
| Virtuals `holderCount` | virtuals/40766 | `4,579` | Blockscout `holders_count` = `6,156` | **Mismatch** — Virtuals is stale (Virtuals `updatedAt: 2025-11-06`); Blockscout is current at block 48,407,189 |
| Virtuals `top10HolderPercentage` | virtuals/40766 | `92.67%` | Corroborated: top 4 holders alone (LP + Vesting + one EOA + USDC pool) = ~85% of supply | Directionally yes |
| Virtuals `factory` | virtuals/40766 | `BONDING_V2` | Consistent with token being an EIP-1167 clone of AgentTokenV2 | Yes |
| Virtuals `launchedAt` / `lpCreatedAt` | virtuals/40766 | `2025-11-13T12:00:00Z` / `2025-11-13T13:38:26Z` | LP contract exists with token transfers from that period | Directionally yes |

**Flagged mismatches:**
1. **Sentient wallet has zero on-chain footprint.** Declared but unrealized. Consistent with the AIXBT/Wasabot pattern — Virtuals reserves the slot in metadata but the operator never funds it. Not a red flag on its own; it is a factual gap between the declared architecture and observed state.
2. **Virtuals `holderCount` (4,579) is stale.** Blockscout shows 6,156 at block 48,407,189. The Virtuals API's `updatedAt` for this virtual is 2025-11-06 — before graduation — so the field never refreshed.

---

## 5. Deployment Provenance

### 5a. Token ($BL, `0x15dd9165..cF86`)

- **Type:** EIP-1167 minimal proxy — Blockscout returns `creation_transaction_hash: null` and `creator_address_hash: null` for factory-cloned proxies of this shape.
- **Implementation `AgentTokenV2` (`0x7BaB5D2e3EbdE7293888B3f4c022aAAAD88Ae2db`):** deployed by `0x9547e85f3016303A2996271314BDE78b02021A28` (Virtuals Protocol deployer, EOA) via tx `0xc569f26501264b4f800aec2b9c3e49cdd9bcc76dd75e976b2882eabe53e01935`. [Blockscout `addresses/0x7BaB..E2db`]
- **Clone (this $BL) creation time:** Virtuals API `lpCreatedAt: 2025-11-13T13:38:26.428Z`. Direct on-chain confirmation not extracted here (would require replaying Uniswap `PairCreated` events at that block).

### 5b. ACP Wallet (`0x2FcfA4E5..c099`)

- **Type:** ERC-7760 clone of `SemiModularAccountBytecode`; deployed lazily by a bundler UserOp.
- **First observed on-chain activity:** block **37,662,216** at **2025-11-02T20:02:59 UTC**, tx `0x6a7b933449a1ab83675f5294e68560446f131ff46f6bf50fd40fc1d9c0ccccd8` (public Base RPC `eth_getBlockByNumber` + Blockscout logs).
- **Caller of that tx:** bundler EOA `0x2d3fAEac23567d32b249B2325689f6f76dDa4A28`, calling EntryPoint v0.7 `0x0000000071727DE22E5E9d8BAf0edAc6f37da032`.
- **Match:** ACP API `createdAt: "2025-11-02T20:02:10.651Z"` — within seconds of the first on-chain UserOp, confirming this tx is the ACP registration / first-op deployment.

### 5c. Airdrop MerkleDistributor (`0xAf502417..316e`)

- Deployed by `0x81F7cA6AF86D1CA6335E44A2C28bC88807491415` (Virtuals ops EOA — same wallet observed as staking-suite deployer for AIXBT and other Virtuals agents) via tx `0x32f77b73335dac0bd6893f0fca63be50ad972454890567438a92b65bb11fd5bb`. [Blockscout `creation_transaction_hash` + `creator_address_hash`]

### 5d. Vesting deposits (Virtuals `tokenomics` field)

Virtuals API `virtuals/40766` records 7 tokenomics buckets with individual `depositTx` hashes:

| Bucket | Amount | Deposit tx |
|--------|--------|-----------|
| Team | 250,000,000 | `0x27b719bb726581cd86c315f4e35f2fa30f56717380eeee279fc16510001bc1ca` |
| Technical Infrastructure | 60,000,000 | `0xb375ab29623040b2b275bd1566c1f285ddfa6a9ab546c0b0de437687f7f68e12` |
| Ecosystem Treasury | 100,000,000 | `0xc47594e028b7196749c78dbba28ee0ecdcd671bf70f1f73bf57f126e90f6b1b9` |
| Marketing & Campaigns | 73,000,000 | `0x3bc359fa5da48abdeaee23343976731ec6e754036073ca19f7a0389601227c66` |
| Early Adopters Airdrop | 5,000,000 | `0x675e35db75d922448afa7353cafe2d0f84c298e651baf47e04b8c1d4381e7a69` |
| Partnership | 2,000,000 | `0x254634c52ac00032fdf4705de0cf43a9e05b959e5837c92a4dced2d41c4f47dd` |
| Sniper Tax Buyback (Team) | 57,892,476 | `0x893b5976e2ec04d608c84d6a451cd01181b7de6704638e1cc564b3732323c524` |

Total pre-locked: **547,892,476 $BL (54.79% of 1B supply)**. Vesting is administered via TokenTable Unlocker (see § 3g).

---

## 6. Top-Holder Snapshot (Blockscout, block 48,407,189)

Blockscout `/tokens/0x15dd..cF86/holders` — first 20 rows shown, values in whole $BL (18 decimals):

| Rank | Address | Label / Type | $BL | % Supply |
|------|---------|--------------|-----|----------|
| 1 | `0x780eeB55..d2e5` | UniswapV2 LP (BL/VIRTUAL) | 327,899,925 | 32.79% |
| 2 | `0x368B0d40..7609` | TokenTableUnlockerV2 (vesting) | 282,162,889 | 28.22% |
| 3 | `0xe2890629..EE8a` | EOA (unlabeled, 1.06 ETH) | 183,937,500 | 18.39% |
| 4 | `0x11258E81..f54A` | Uniswap V3 pool (BL/USDC) | 58,750,507 | 5.88% |
| 5 | `0x57A4EA91..9eC2` | SemiModularAccountBytecode (ERC-4337) — **another ACP wallet** | 28,905,482 | 2.89% |
| 6 | `0x7B6f24Bd..3844` | EIP-7702-delegated EOA | 23,250,032 | 2.33% |
| 7 | `0xd283cFff..5a3a` | EOA | 20,000,000 | 2.00% |
| 8 | `0xA8d2355D..91a7` | EIP-7702-delegated EOA | 17,566,196 | 1.76% |
| 9 | `0xfB53D0CB..046C` | EOA | 15,000,000 | 1.50% |
| 10 | `0xf0F0EC4f..cFEe` | EOA | 14,294,903 | 1.43% |
| 11 | `0x99c602e3..8fe3` | EOA | 13,686,613 | 1.37% |
| 12 | `0x79101706..3b8f` | EOA | 12,568,061 | 1.26% |
| 13 | `0x85C3fb0c..570e` | EOA | 12,093,624 | 1.21% |
| 14 | `0xED439F6E..1Eb2` | EOA | 11,454,130 | 1.15% |
| 15 | `0x21Eb5755..5056` | EOA | 10,094,093 | 1.01% |
| 16 | `0xC1aD8462..324E` | EOA | 10,075,245 | 1.01% |
| 17 | `0x27fd42dC..13Dd` | EOA | 10,006,334 | 1.00% |
| 18 | `0xAf502417..316e` | **BL Airdrop MerkleDistributor** | 9,726,067 | 0.97% |
| 19 | `0x68d925Cf..fCf1` | EOA | 9,359,425 | 0.94% |
| 20 | `0xd7D7b710..1956` | EIP-7702-delegated EOA | 9,163,532 | 0.92% |

**Observations:**
- Circulating float is thin: LP (32.79%) + TokenTable vesting (28.22%) + one EOA (18.39%) + UniV3 pool (5.88%) + MerkleDistributor (0.97%) = **86.25% locked in structural buckets**.
- Rank #3 (`0xe289..EE8a`) is a plain EOA holding 18.39% of supply, funded by the graduation event (initial purchase — `initialPurchase: 16161616161616161616162` VIRTUAL from the API corresponds to 240M $BL initial buy per `initialPurchasedAmount`, which sits close to this EOA's 183.9M balance). Provenance of this EOA vs the operator's declared wallets is not resolved here — flagged for token-economics follow-up.
- Rank #5 (`0x57A4EA91..9eC2`) is another SemiModularAccountBytecode — an ERC-4337 wallet not tied to ButlerLiquid via ACP API. Could be an unrelated Alchemy MAK user, or a related agent's ACP wallet.
- Several top-20 holders use EIP-7702 delegation via the same MetaMask StatelessDelegator (`0x63c0c19a..E32B`) as the operator's owner EOA — this is not a linkage claim, EIP-7702 is a chain-wide pattern; noted only because it recurs.

---

## 7. Current Balances Summary

All reads at public Base RPC head (block **48,407,900**, 2026-07-09 timeframe):

| Address | ETH | USDC | $BL |
|---------|-----|------|-----|
| ACP wallet `0x2FcfA4..c099` | 0 | 30.757913 | 28,905,482 (per Blockscout row #5 — see caveat below) |
| Owner EOA `0xc0f7Da..2F4e` | 0.000800655 | 0 | — (not in top-20; some balance held; not counted here) |
| Sentient wallet `0xfAFa9C..c364` | 0 | 0 | 0 (has_tokens=false) |

**Caveat on ACP wallet $BL:** Blockscout's top-holder row #5 (`0x57A4EA91..9eC2`) is a *different* SemiModularAccountBytecode wallet from the ACP wallet. The ACP wallet itself (`0x2FcfA4..c099`) does not appear in the top-20 $BL holders list, so its $BL balance is <9.16M (rank 20's balance). Exact $BL balance not resolved in this artifact.

---

## 8. Confidence Levels

| Claim | Confidence | Evidence |
|-------|------------|----------|
| ACP wallet is ERC-4337 SemiModularAccountBytecode (ERC-7760 proxy) | **HIGH** | `eth_getCode` bytecode + Blockscout `implementations` + `proxy_type: erc7760` |
| Owner EOA uses EIP-7702 with MetaMask delegator | **HIGH** | `eth_getCode` prefix `0xef0100` + 20-byte target = verified impl address |
| Sentient wallet never used on-chain | **HIGH** | `nonce=0`, `has_logs=false`, 0 balances, 0 transfers |
| Token is EIP-1167 clone of AgentTokenV2 | **HIGH** | Blockscout `proxy_type: eip1167` + verified impl |
| AgentTokenV2 impl deployed by Virtuals deployer `0x9547e85f..1A28` | **HIGH** | Blockscout `creation_transaction_hash` + `creator_address_hash` |
| Airdrop MerkleDistributor deployed by Virtuals ops `0x81F7cA6A..1415` | **HIGH** | Blockscout `creation_transaction_hash` + `creator_address_hash` |
| ACP wallet created 2025-11-02T20:02:59Z via bundler UserOp | **HIGH** | Public RPC block timestamp + Blockscout logs pagination |
| ACP `walletBalance` (30.757913 USDC) matches on-chain | **HIGH** | `balanceOf` via public RPC, exact match to 6 decimals |
| Virtuals `holderCount` is stale (Virtuals 4,579 vs Blockscout 6,156) | **HIGH** | API `updatedAt: 2025-11-06`; Blockscout `holders_count` current |
| Rank #3 EOA `0xe289..` is related to team initial purchase | **MEDIUM** | Balance (183.9M) aligns with `initialPurchasedAmount` (240M) minus visible transfers; direct provenance not extracted |
| Bundler `0x2d3fAEac..4A28` is the persistent bundler for this wallet | **LOW** | Only 1 tx sampled; would need to enumerate handleOps callers to confirm |
| ButlerLiquid trades happen on Hyperliquid (per ACP job description) | **NOT VERIFIED HERE** | Cross-chain execution is a token-economics / utility-audit concern; see runbook Phase 2 § 7 for destination-chain gate |

---

## 9. Verification Notes

All facts sourced from:
- **ACP API:** `https://acpx.virtuals.io/api/agents?filters[walletAddress]=0x2FcfA4E5B934E0C6584E258721c0C08EF946c099`
- **Virtuals API:** `https://api.virtuals.io/api/virtuals?filters[name]=ButlerLiquid` (returned virtual 40766, virtualId 1140)
- **Blockscout API:** `https://base.blockscout.com/api/v2/addresses/{addr}`, `/tokens/{addr}`, `/tokens/{addr}/holders`, `/tokens/{addr}/counters`, `/addresses/{addr}/counters`, `/addresses/{addr}/token-transfers`, `/addresses/{addr}/logs`
- **Public Base RPC:** `https://mainnet.base.org` for `eth_getBlockByNumber`, `eth_getBalance`, `eth_getCode`, `eth_getTransactionCount`, `eth_call` (USDC `balanceOf`, `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- **Sentinel head at start:** block 47,806,437, ts 2026-06-25T09:03:41Z (~14 days stale). Not used for any current-state fact in this artifact.

Balances and holder rankings are point-in-time (block 48,407,189–48,407,900); they will drift with time.

---

## 10. Suggested Content Angle

**"ButlerLiquid: Virtuals Wrapper Over a Hyperliquid Agent"**

ButlerLiquid presents as a HyperLiquid perpetuals trading agent, but its on-chain footprint on Base is the canonical Virtuals stack — SemiModularAccountBytecode ACP wallet, EIP-1167 clones of AgentTokenV2 / AgentDAO / AgentVeTokenV2, all deployed by the same two Virtuals infra EOAs that spun up AIXBT and others. Nothing about the identity chain is agent-specific.

The interesting fact isn't on Base at all — it's the mismatch between where the token/vesting/governance lives (Base) and where the product's actual value creation is claimed to happen (Hyperliquid perps). The identity chain here is a launchpad-standard shell; the substantive question is whether the Hyperliquid side of the story matches the aGDP the platform reports ($162,232.30 gross, per ACP API). That's a destination-chain gate (Phase 2 § 7 of the runbook) and belongs to token-economics / utility-audit, not identity.

Also worth surfacing: the operator's EIP-7702 delegation on the owner EOA. That's a fresh 2025-2026 pattern — the owner EOA is signing 7702 auth-lists that give MetaMask's StatelessDelegator batched-execution rights on its behalf. Not a red flag; it's just an on-chain marker that the operator is using modern account tooling, not vanilla EOA signing.
