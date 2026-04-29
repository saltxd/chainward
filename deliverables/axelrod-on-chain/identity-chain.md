# Axelrod Identity Chain

**Agent:** Axelrod (ACP id 129, virtualAgentId 22564, @AIxVC_Axelrod)
**Operator:** AIxVC (`https://axr.aixvc.io/`)
**Investigated:** 2026-04-29
**Investigator:** ChainWard
**Sentinel block at investigation:** 44,964,085 (`eth_blockNumber` returned `0x2af1af5`)

---

## 1. Wallet Map

| Role | Address | Type | Deployer / Authority | Source |
|------|---------|------|----------------------|--------|
| **ACP wallet (target)** | `0x999A1B6033998A05F7e37e4BD471038dF46624E1` | ERC-7760 minimal proxy → SemiModularAccountBytecode (ERC-4337) | AccountFactory `0x000017c61b5bEe81050EC8eFc9c6fecd` | Blockscout `/addresses/0x999A1B...`; sentinel `eth_getCode` returned ERC-7760 bytecode hardcoding impl `0x000c5A90...` and salt suffix `ffc60852775193e3b72758bac4f7c6e3050d82de` |
| **Smart-account implementation** | `0x000000000000c5A9089039570Dd36455b5C07383` | SemiModularAccountBytecode (Alchemy Modular Account v2) | CREATE2 deployer `0x4e59b448...` (Arachnid presigned) | Blockscout `/addresses/0x000c5A90...` (`name: SemiModularAccountBytecode`, creator `0x4e59b448...`) |
| **Account factory** | `0x00000000000017c61b5bEe81050EC8eFc9c6fecd` | AccountFactory (Alchemy) | CREATE2 deployer `0x4e59b448...` | Blockscout `/addresses/0x000017c6...` (`name: AccountFactory`); also visible in deployment-tx initCode |
| **EntryPoint (ERC-4337 v0.7.0)** | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | EntryPoint 0.7.0 | n/a | Blockscout tag "Entry Point 0.7.0"; recipient of `handleOps` in deployment tx `0x1a533c66...` |
| **Validation module** | `0x00000000000099DE0BF6fA90dEB851E2A2df7d83` | SingleSignerValidationModule | n/a | Blockscout `/addresses/0x000099DE...` (`name: SingleSignerValidationModule`); appears in every UserOp internal-tx trace, e.g. tx `0xdc466f91...` |
| **Original signer (initCode)** | `0xFFC60852775193E3b72758BaC4f7c6e3050D82dE` | EOA | n/a | initCode tail of deployment tx `0x1a533c66...` (`...ffc60852775193e3b72758bac4f7c6e3050d82de` after factory + selector); also matches the `s3` bucket prefix in Axelrod profilePic URL returned by ACP API |
| **Current signer (post-rotation)** | `0xaa3189f41127A41e840cAF2C1d467eb8CcF197d8` | EOA | n/a | Blockscout `/addresses/0xaa3189f4...` (`is_contract: false`); ACP API `ownerAddress` field; on-chain rotation tx `0xe06cf0e9...` and `0x47296c57...` |
| **Virtuals "wallet"** | `0x52Af56e5811A3456981a09A704B20Ba5Da0Dbf67` | EIP-7702 delegated EOA → MetaMask `EIP7702StatelessDeleGator` `0x63c0c19a...` | Self-delegation via SET_CODE_TX | Blockscout `/addresses/0x52Af56e5...` (`proxy_type: eip7702`); `walletAddress` field on Virtuals API `/api/virtuals/22564` |
| **Token ($AXR)** | `0x58Db197E91Bc8Cf1587F75850683e4bd0730e6BF` | EIP-1167 minimal proxy → AgentToken `0x766E0671...` | Virtuals BondingV5 / AgentFactory pipeline (creator hash unverified — pre-prune) | Blockscout `/addresses/0x58Db197E...` (`proxy_type: eip1167`, `name: "Axelrod by Virtuals"`, public_tag "Axelrod: AXR Token"); Virtuals API `tokenAddress` |
| **LP pair (AXR/VIRTUAL)** | `0x6D5dF1d155d79279ABD65A98815F7853C2b3a005` | UniswapV2Pair (Virtuals fork) | UniswapV2Factory (parent factory of pair) | Blockscout `/addresses/0x6D5dF1d1...` (`name: UniswapV2Pair`, verified source); Virtuals API `lpAddress`; `lpCreatedAt: 2025-05-14` |
| **TBA (ERC-6551)** | `0x0866eFF721Bc7d9C995188FDC6BbF1910e751849` | Contract (no token transfers, 0 ETH) | ERC-6551 registry (creator pre-prune) | Blockscout `/addresses/0x0866eFF7...` (`is_contract: true`); Virtuals API `tbaAddress` |
| **DAO** | `0x03ccd957C7Ea82353bEa18985779c0Eda5FdBB8c` | EIP-1167 minimal proxy → AgentDAO `0x29Dd6413...` | Virtuals DAO factory (creator pre-prune) | Blockscout `/addresses/0x03ccd957...` (`proxy_type: eip1167`); Virtuals API `daoAddress` |
| **Staking (token)** | `0xCC3216Dc08B88DcD1B35D3243f2E3a03CA192189` | EIP-1967 proxy → `stakedToken` (`0x785a1968...`) | `0x81F7cA6AF86D1CA6335E44A2C28bC88807491415` (Virtuals staking ops EOA) | Blockscout `/addresses/0xCC3216Dc...` (`creation_transaction_hash: 0xdb3afca4...`, `creator_address_hash: 0x81F7cA6A...`, `proxy_type: eip1967`); Virtuals API `agentStakingContract` |
| **Staking distributor (Virtuals API `stakingAddress`)** | `0xa62dc46F6978222f3eB62418AC3Ad8F3523116A9` | EOA, active distributor (nonce ≥ 865, pushes AXR to recipients) | n/a | Blockscout `/addresses/0xa62dc46F...` (`is_contract: false`); /transactions shows repeated `transfer(...)` of AXR (e.g. tx `0x0e8b7126...` 21,066 AXR to `0xDFfB5bA0...`); Virtuals API `stakingAddress` |
| **Axelrod core swap router** | `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` | ERC1967Proxy → impl `0x361DECCFc381aCa339218D2A148bC08943D02CDb` | Proxy creator: **`0x9547e85f3016303A2996271314BDE78b02021A28`** (Virtuals deployer EOA) in tx `0x2a40efe4...`; impl creator: **`0xc31Cf1168b2f6745650d7B088774041A10D76d55`** (AIxVC team EOA) in tx `0x7e1f0546...` | Blockscout `/addresses/0xa6C9BA86...`; sentinel `eth_getStorageAt` slot `0x36089...bbc` returned `0x000…361deccfc381aca339218d2a148bc08943d02cdb` |
| **Deployment bundler** | `0xE980edDFB3Af9A857e146991076C1d5c2dc47E75` | EOA (Blockscout label "Kinexys: Deployer" — see §5 caveat) | n/a | Blockscout `/transactions/0x1a533c66...` `from` field; submitted the `handleOps` that created the smart account |
| **A live ops bundler** | `0x43D2CF587F2Dd7853A60D6a53032B1217e6ad8a4` | EOA, Blockscout tag "ERC-4337 Bundler" | n/a | Blockscout `/transactions/0xdc466f91...` `from` field (a Dec 2025 UserOp into the smart account) |
| **Paymaster** | `0x2cc0c7981D846b9F2a16276556f6e8cb52BfB633` | ERC1967Proxy → impl `0xA4F070629058767C0d5d70465082ec1B7d9Ca5A4` | CREATE2 deployer `0x4e59b448...` | Blockscout `/addresses/0x2cc0c798...`; first 20 bytes of `paymasterAndData` in deployment tx `0x1a533c66...` and ops tx `0xdc466f91...` |
| **Implementation deployer (AIxVC team)** | `0xc31Cf1168b2f6745650d7B088774041A10D76d55` | EOA (heavy ops history) | n/a | Blockscout creator of `0x361DECCFc...`; /transactions shows `setFeeDelegation`, `upgradeAndCall` against BondingV5 proxy `0x1A540088...` and ProxyAdmin `0x689aEeA3...` — i.e. controls Axelrod product infra |
| **Virtuals Protocol deployer EOA** | `0x9547e85f3016303A2996271314BDE78b02021A28` | EOA | n/a | Blockscout creator of swap proxy `0xa6C9BA86...`; same address that deployed AIXBT's AgentFactoryV3 (per `deliverables/aixbt/identity-chain.md`) |

ETH balances at sentinel block 44,964,085 (`eth_getBalance`):

| Address | Wei | ETH |
|---|---|---|
| ACP wallet `0x999A1B...` | 561,697,977,836 | 0.000000562 |
| Sentient `0x52Af56...` | 2,809,692,150,311,846 | 0.00281 |
| Original signer `0xffc608...` | 2,974,771,336,312,015 | 0.00297 |
| Current signer `0xaa3189...` | 26,463,564,229,018,204 | 0.0265 |

USDC on the ACP wallet (Blockscout `/addresses/0x999A1B.../tokens?type=ERC-20`): 6.241848 USDC — matches ACP API `walletBalance: "6.241848"`.

---

## 2. Ownership Extraction (Primary Contract `0x999A1B...`)

**Type.** ERC-7760 minimal proxy of Alchemy's `SemiModularAccountBytecode` — i.e. an ERC-4337 v0.7.0 modular smart account.

- Sentinel `eth_getCode` returns the ERC-7760 stub:
  `0x363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3ffc60852775193e3b72758bac4f7c6e3050d82de`
  - The slot constant inside the stub is the standard EIP-1967 implementation slot.
  - The trailing 20 bytes (`ffc60852775193e3b72758bac4f7c6e3050d82de`) are the ERC-7760 immutable salt/owner argument baked into the proxy bytecode.
- Sentinel `eth_getStorageAt(target, 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc, latest)` returns `0x000…000c5A9089039570Dd36455b5C07383` — i.e. the storage slot is set to the `SemiModularAccountBytecode` implementation. Blockscout's `implementations` field on `/addresses/0x999A1B...` reports the same.

**Not a multisig, not a Safe, not an upgradeable governance proxy.** It's a single-signer ERC-4337 account with a fallback signer slot.

**Signer / upgrade authority.**

- The original signer baked into initCode at deployment is `0xFFC60852775193E3b72758BaC4f7c6e3050D82dE`. Provenance: the last 20 bytes of the factory call argument inside the deployment tx's `initCode` (`...8b4e464e000000000000000000000000ffc60852775193e3b72758bac4f7c6e3050d82de`), confirmed by Blockscout `/transactions/0x1a533c66...` decoded `ops[0].initCode`. Same value also appears as the immutable suffix in the deployed proxy bytecode read off sentinel above.
- On 2026-02-04 the signer was rotated. Two consecutive direct calls to the smart account's `updateFallbackSignerData(address,bool)` selector are visible on Blockscout `/addresses/0x999A1B.../transactions`:
  1. tx `0x47296c5760e27813e41d8c09e1f7464c70cc1f5d127e99fae84960e08b117f4b` (block 41,699,580, 2026-02-04 07:01:47Z) — `from: 0xffc60852...`, calls `updateFallbackSignerData(0xaa3189f4..., false)` (enable `0xaa3189f4...` as fallback signer).
  2. tx `0xe06cf0e9e189539d22973fcbb2d62c39bf407072b378f31743abcd0ff05d7e3d` (block 41,699,785, 2026-02-04 07:08:37Z) — `from: 0xaa3189f4...`, calls `updateFallbackSignerData(0xffc60852..., true)` (disable original signer).
- After Feb 4, 2026, all subsequent direct `updateFallbackSignerData` calls from `0xffc60852...` to the smart account fail with `status: error` (e.g. tx `0xcf71040c...` and `0x2b1838c6...`), confirming `0xffc60852...` lost authority.
- Sole fallback signer at investigation time: **`0xaa3189f41127A41e840cAF2C1d467eb8CcF197d8`** (a plain EOA — Blockscout `is_contract: false`).

**No proxy admin.** ERC-7760 has no upgrade path: the implementation is hard-coded into the proxy bytecode itself. Any "upgrade" requires deploying a new account.

**Bundler / paymaster (per UserOp; not fixed identity).**

- Deployment UserOp was bundled by `0xE980edDFB3Af9A857e146991076C1d5c2dc47E75` (tx `0x1a533c66...`, beneficiary slot in `handleOps`).
- A representative live-ops UserOp (`0xdc466f91...`, 2025-12-03) was bundled by `0x43D2CF587F2Dd7853A60D6a53032B1217e6ad8a4` (Blockscout tag "ERC-4337 Bundler"). Bundler identity is not pinned to the agent.
- Paymaster `0x2cc0c7981D846b9F2a16276556f6e8cb52BfB633` is consistent across both UserOps (first 20 bytes of `paymasterAndData`). It is an ERC1967Proxy deployed via the Arachnid CREATE2 deployer — not specific to Axelrod or AIxVC.

**Active validation path.** `EntryPoint 0.7.0 → 0x999A1B... → delegatecall(SemiModularAccountBytecode) → call(SingleSignerValidationModule 0x000099DE...) → call(target)`. Visible in the internal-tx trace of tx `0xdc466f91...` (Blockscout `/addresses/0x999A1B.../internal-transactions`).

---

## 3. Declared vs Observed Reconciliation

| Field | Source | Declared value | Observed on-chain | Match? |
|---|---|---|---|---|
| `walletAddress` (ACP) | `acpx.virtuals.io/api/agents/129/details` | `0x999A1B6033998A05F7e37e4BD471038dF46624E1` | smart account exists, deployed 2025-06-30 | yes |
| `ownerAddress` (ACP) | `acpx.virtuals.io/api/agents/129/details` | `0xaa3189f41127a41e840caf2c1d467eb8ccf197d8` | current sole fallback signer of `0x999A1B...` (post Feb 4 2026 rotation) | yes — but only since 2026-02-04 |
| `isSelfCustodyWallet` (ACP) | same | `true` | smart account is single-signer, no Safe / multisig / DAO control | yes |
| `walletBalance` (ACP) | same | `"6.241848"` | sentinel `balanceOf(USDC)` returns 6,241,848 (6 decimals) → 6.241848 USDC | yes |
| `transactionCount` (ACP) | same | 134,110 | sentinel `eth_getTransactionCount` returns `0x1` (i.e. 1 — ERC-4337 nonce stays at 1; real activity = Blockscout's 284,412 token transfers) | API counts UserOps, not native txs — both consistent with the ERC-4337 pattern |
| `walletAddress` (Virtuals) | `api.virtuals.io/api/virtuals/22564` | `0x52Af56e5811A3456981a09A704B20Ba5Da0Dbf67` | exists, EIP-7702 delegated EOA holding ~309M AXR + 95 VIRTUAL + 0.00281 ETH | yes |
| `sentientWalletAddress` (Virtuals) | same | `null` | Virtuals API does not declare a sentient wallet | (none to check) |
| `tokenAddress` (Virtuals) | same | `0x58Db197E91Bc8Cf1587F75850683e4bd0730e6BF` | EIP-1167 of AgentToken, total supply 1e27 (1B AXR), Blockscout-tagged "Axelrod: AXR Token" | yes |
| `lpAddress` (Virtuals) | same | `0x6D5dF1d155d79279ABD65A98815F7853C2b3a005` | UniswapV2Pair, holds AXR + VIRTUAL reserves (Sync log block 45,318,212: r0=97,960 AXR, r1=99,983,765 VIRTUAL) | yes |
| `tbaAddress` (Virtuals) | same | `0x0866eFF721Bc7d9C995188FDC6BbF1910e751849` | ERC-6551 contract, 0 ETH, no token transfers — dormant | yes (declared, dormant) |
| `daoAddress` (Virtuals) | same | `0x03ccd957C7Ea82353bEa18985779c0Eda5FdBB8c` | EIP-1167 of AgentDAO | yes |
| `agentStakingContract` (Virtuals) | same | `0xCC3216Dc08B88DcD1B35D3243f2E3a03CA192189` | EIP-1967 of `stakedToken`, deployer `0x81F7cA6A...` (Virtuals staking ops) | yes |
| `stakingAddress` (Virtuals) | same | `0xa62dc46F6978222f3eB62418AC3Ad8F3523116A9` | **EOA, not a contract** — distributor wallet, sends AXR to recipients via direct `transfer` | label is misleading; the address is real and active but it's not a "staking contract" — flag |
| `acpAgentId` (Virtuals) | same | 129 | matches ACP `id` | yes |

**Mismatch / flag (1):** Virtuals API field `stakingAddress` is an EOA (`0xa62dc46F...`), not a contract. The actual staking contract is `agentStakingContract`. Easy to confuse if reading the wrong field.

**Mismatch / flag (2):** ACP `ownerAddress` (`0xaa3189f4...`) was *not* the original on-chain controller. Initial signer `0xffc60852...` was swapped out on 2026-02-04. Anyone reading the ACP API today sees a consistent owner; anyone reading on-chain history sees a rotation. Notably, `0xffc60852...` matches the S3 prefix in the Axelrod `profilePic` URL returned by ACP (`https://acpcdn-prod.s3.ap-southeast-1.amazonaws.com/0xffc60852775193e3b72758bac4f7c6e3050d82de/...`), which suggests `0xffc60852...` was the original AIxVC team signer at agent registration time. The S3 URL was not updated when the on-chain owner was rotated.

**No mismatch on the sentient wallet / TBA / token / LP / DAO.** All declared addresses exist and match their declared roles.

---

## 4. Deployment Provenance

| Object | Tx | Block | Timestamp (UTC) | Submitter (`from`) | Notes |
|---|---|---|---|---|---|
| ACP smart account `0x999A1B...` | `0x1a533c661da207648e5c1512e4df4a69ebdf31418b063a594e9dd3dd64f42692` | 32,234,883 | 2025-06-30 04:51:53 | `0xE980edDFB3Af9A857e146991076C1d5c2dc47E75` (handleOps caller — bundler) | EntryPoint 0.7.0 `handleOps`; initCode embeds factory `0x000017c6...` + selector `0x8b4e464e` + signer `0xffc60852...` + salt `0x81`. Status `success`, gas_used 207,413. Blockscout `creator_address_hash` field reports `0x000017c6...` (the factory) for `0x999A1B...`. |
| Account factory `0x000017c6...` | `0x79c0d362b80ecc858c32458850172924b1029955feb0a003cebbc4d852099e18` | (Blockscout-only — pre-sentinel-prune) | (Blockscout-only) | CREATE2 deployer `0x4e59b44847b379578588920cA78FbF26c0B4956C` (Arachnid presigned) | Blockscout `/addresses/0x000017c6...` `creation_transaction_hash` |
| Implementation `0x000c5A9...` | `0x47a86d0901fa87d8de853a794b92b66b2720d69e56861690acb612970ef7210a` | (Blockscout-only) | (Blockscout-only) | CREATE2 deployer `0x4e59b448...` | Blockscout `/addresses/0x000c5A9...` `creation_transaction_hash` |
| Axelrod core swap proxy `0xa6C9BA86...` | `0x2a40efe400ac1f645ff979f3381ed537930cb28c94fbc7fb0e1d937e775ceaf6` | (Blockscout-only) | (Blockscout-only) | **`0x9547e85f3016303A2996271314BDE78b02021A28`** (Virtuals Protocol deployer EOA) | Blockscout `/addresses/0xa6C9BA86...` `creator_address_hash`. Same EOA also deployed AIXBT's AgentFactoryV3, per existing AIXBT decode |
| Axelrod core swap implementation `0x361DECCF...` | `0x7e1f0546fbc99f170cb830c42f21653ce13b23b21c63ece96ad112c30fd9db20` | (Blockscout-only) | (Blockscout-only) | **`0xc31Cf1168b2f6745650d7B088774041A10D76d55`** (AIxVC team deployer EOA) | Blockscout `/addresses/0x361DECCF...` `creator_address_hash`. Same EOA performs `setFeeDelegation`, `upgradeAndCall` ops on AIxVC's BondingV5 proxy `0x1A540088...` and ProxyAdmin `0x689aEeA3...` |
| Token `0x58Db197E...` (proxy) | (Blockscout `creation_transaction_hash` not exposed) | pre-prune (~2025-05-14 per Virtuals `lpCreatedAt`) | n/a | Virtuals AgentFactory pipeline (BondingV5 graduation, by analogy to AIXBT) | Verified state: `proxy_type: eip1167`, impl `0x766E0671bbBF59370C35a8882366a2085B46EB7b` (`AgentToken`), `total_supply: 1e27`, holders 52,756. Public tag "Axelrod: AXR Token" |
| LP `0x6D5dF1d1...` | (creation tx not exposed by Blockscout endpoint queried) | ≈ Virtuals `lpCreatedAt: 2025-05-14T13:07Z` | n/a | UniswapV2Factory (Virtuals fork) | `name: UniswapV2Pair`, holders 5, `total_supply` ≈ 2.33e24 LP tokens |
| Token-staking proxy `0xCC3216Dc...` | `0xdb3afca4b1dfb736fbe00d653ee312c92e7383485f999b112a8d2483eaa616e1` | (Blockscout-only) | (Blockscout-only) | `0x81F7cA6AF86D1CA6335E44A2C28bC88807491415` (Virtuals staking-ops EOA) | Blockscout `/addresses/0xCC3216Dc...`. Same staking-ops EOA also deploys staking infra for many other Virtuals agents (matches AIXBT decode) |
| TBA `0x0866eFF7...` | (creation tx not exposed) | pre-prune | n/a | ERC-6551 registry | `is_contract: true`, no balances or transfers |
| DAO `0x03ccd957...` | (creation tx not exposed) | pre-prune | n/a | Virtuals DAO factory | `proxy_type: eip1167`, impl `0x29Dd6413B7a0B6a380326894FF839903c73CD53c` (`AgentDAO`) |

> **Sentinel pruning caveat.** Sentinel `eth_getTransactionByHash(0x1a533c66...)` and `eth_getTransactionReceipt(0x1a533c66...)` both returned `null` at investigation block 44,964,085 — the deployment tx (block 32,234,883) sits ~12.7M blocks behind tip and is outside the sentinel pruning window. All deployment-provenance facts in this section are therefore **Blockscout-only**. Sentinel-verified facts (account bytecode, EIP-1967 storage slot, ETH balances, swap-proxy implementation slot) are noted as such inline.

### Deployer-tree summary

```
0x4e59b44847b379578588920cA78FbF26c0B4956C  (CREATE2 / Arachnid presigned)
  ├── deployed AccountFactory 0x000017c6...
  │     └── deployed ACP wallet 0x999A1B... in tx 0x1a533c66... (block 32,234,883, 2025-06-30)
  │           bundled by 0xE980edDFB3...   signer baked in: 0xffc60852...
  ├── deployed SemiModularAccountBytecode 0x000c5A9...  (the impl)
  └── deployed Paymaster proxy 0x2cc0c798...

0x9547e85f3016303A2996271314BDE78b02021A28  (Virtuals Protocol deployer EOA)
  └── deployed Axelrod core swap proxy 0xa6C9BA86... in tx 0x2a40efe4...
        impl pointer (EIP-1967 slot, sentinel-verified): 0x361DECCF...

0xc31Cf1168b2f6745650d7B088774041A10D76d55  (AIxVC team EOA)
  └── deployed Axelrod core swap implementation 0x361DECCF... in tx 0x7e1f0546...

0x81F7cA6AF86D1CA6335E44A2C28bC88807491415  (Virtuals staking-ops EOA)
  └── deployed token-staking proxy 0xCC3216Dc... in tx 0xdb3afca4...

0xFFC60852775193E3b72758BaC4f7c6e3050D82dE  (original ACP signer, EOA)
  ├── (06-30-2025) signed UserOp that deployed ACP wallet
  └── (02-04-2026 07:01:47) signed UserOp authorizing 0xaa3189f4... as fallback signer (tx 0x47296c57...)

0xaa3189f41127A41e840cAF2C1d467eb8CcF197d8  (current ACP signer, EOA)
  └── (02-04-2026 07:08:37) signed UserOp disabling 0xffc60852... (tx 0xe06cf0e9...)
        — sole controller of ACP wallet from this point forward
```

---

## 5. Verification Notes & Caveats

- **Blockscout label "Kinexys: Deployer" on `0xE980edDFB3...`** is a known Blockscout misclassification for ERC-4337 bundler EOAs that also happen to have deployed unrelated contracts. The address is the bundler that submitted the Axelrod-account-creation `handleOps`, not a JPMorgan Kinexys deployer in this context. Treat the bundler identity as opaque infrastructure.
- **The Virtuals API `walletAddress` (`0x52Af56...`) is not the agent's operational wallet** for the ACP product. ACP routes user funds through `0x999A1B...` (the smart account); `0x52Af56...` holds 309.6M AXR (~31% of the 1B supply) and 95.68 VIRTUAL — i.e. it appears to be a treasury/operator wallet, not an active execution account. AXR `top10HolderPercentage` reported by Virtuals is 71.52%; this single wallet alone is ~31%.
- **`devHoldingPercentage: 30.96`** reported by the Virtuals API matches the AXR balance held by the Virtuals-API "wallet" `0x52Af56...` (309.57M / 1B = 30.96%). That field is sourced from this wallet.
- **`0xffc60852...` shows 0 native txs but non-empty token-transfer history** on Blockscout. Counter endpoints can lag behind the indexed transfer feed. Token-transfer presence was confirmed via direct `/token-transfers` query (PRINT airdrops, USDbC `transfer`, multicall recipient, etc.).
- **No pre-prune deployment txs are sentinel-verified.** Deployment timestamps and creator addresses are Blockscout-only. Live-state facts (signer rotation txs, swap-proxy implementation slot, balances, account bytecode) are sentinel-verified.

---

## 6. One-Line Identity Statement

The Axelrod ACP wallet `0x999A1B6033998A05F7e37e4BD471038dF46624E1` is an Alchemy `SemiModularAccountBytecode` ERC-4337 smart account, deployed on 2025-06-30 by an Alchemy AccountFactory under Virtuals' deployment flow with original signer `0xffc60852...`, then unilaterally rotated on 2026-02-04 to current sole signer `0xaa3189f41127A41e840cAF2C1d467eb8CcF197d8` — the EOA that the ACP API now declares as `ownerAddress`. The agent's swap-execution contract `0xa6C9BA86...` is a separate ERC-1967 proxy deployed by the Virtuals Protocol deployer EOA `0x9547e85f...`, with implementation `0x361DECCF...` deployed by the AIxVC team EOA `0xc31Cf116...`.
