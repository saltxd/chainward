# OpenGradient Decode — Publish Checklist

Every numerical or factual claim in `decode.md` and `thread.md` mapped to a source. All values verified at block ~45,536,000 (Base, 2026-05-03).

## Identity / metadata

| Claim | Source |
|---|---|
| Virtual id 72059, status AVAILABLE | https://api.virtuals.io/api/virtuals/72059 |
| Symbol OPG, name OpenGradient | Same. Also Blockscout token name: `OpenGradientToken` |
| Public TGE 2026-04-21 | `launchedAt` field in Virtuals API |
| LP first created 2026-03-22 (block 43,714,851) | Blockscout tx 0x19861e1767bfd930b462b9412f1ca34b03b413a756b6b94e6006a19839968272 |
| 12 days since launch (as of 2026-05-03) | Date math from `launchedAt` |
| 9 squatter UNDERGRAD listings with same name | https://api.virtuals.io/api/virtuals?filters[symbol][$eqi]=OPG |

## Valuation numbers

| Claim | Source |
|---|---|
| Trending mcap ~$285M | User-supplied input from Virtuals dashboard 2026-05-03 |
| FDV ~$300–303M | `fdvInVirtual: 388,472,406.1` × VIRTUAL/USD $0.781846 = $303.7M |
| Circulating mcap ~$57M (Blockscout) | https://base.blockscout.com/api/v2/tokens/0xFbC2051AE2265686a469421b2C5A2D5462FbF5eB → `circulating_market_cap: 57152392.99` |
| OPG token price ~$0.30 | Blockscout `exchange_rate: 0.300623` |
| VIRTUAL price $0.78 | https://api.coingecko.com/api/v3/simple/price?ids=virtual-protocol&vs_currencies=usd |
| Launch FDV target $180M | `launchParams.targetFdvUsd` |
| Launch token price $0.025 | `launchParams.tokenPriceInUSD` |
| Token up ~12× from launch | $0.30 / $0.025 |

## ACP registration

| Claim | Source |
|---|---|
| `acpAgentId: null`, `v3AcpAgentId: null` | https://api.virtuals.io/api/virtuals/72059 |
| ACP search by name returns empty | https://acpx.virtuals.io/api/agents?filters[name][$eqi]=OpenGradient → `data: [], total: 0` |
| ACP search by wallet returns empty | https://acpx.virtuals.io/api/agents?filters[walletAddress][$eqi]=0x70434389e58F5aFcf8e43B9EeF066472Af3044Fb → `data: [], total: 0` |

## Wallets

| Claim | Source |
|---|---|
| Listed `walletAddress` 0x70434389…44Fb is unused EOA | `eth_getCode → 0x`, `eth_getTransactionCount → 0x0`, Blockscout counters all 0 |
| Listed wallet 0 ETH | `eth_getBalance → 0x0` |
| Listed wallet 0 OPG | `eth_call balanceOf(token=OPG, holder=listed) → 0x0` |
| Total OPG supply 1B (18 dec) | `eth_call totalSupply` returned `0x033b2e3c9fd0803ce8000000` = 1e27 wei = 1e9 OPG |
| OPG decimals = 18 | `eth_call decimals` returned `0x12` = 18 |
| Token deployer 0x4905…d2DC | Blockscout `creator_address_hash` on token contract |
| Token deploy tx 0xd714ef95…313f3 | Blockscout `creation_transaction_hash` |
| Initial mint recipient 0x5715907d…23cD (SafeProxy) | Last 32 bytes of token deploy tx `raw_input` are the recipient |
| Pool is Uniswap V3 1% fee, VIRTUAL=token0, OPG=token1 | `eth_call token0/token1/fee` → `0x0b3e…7E1b` (VIRTUAL), `0xFbC2…F5eB` (OPG), `0x2710` (10000 = 1%) |

## Supply distribution (from Blockscout holders endpoint)

| Holder | OPG | % | Source |
|---|---:|---:|---|
| MerkleVester `0xAaD47CE7…A9Ad` | 460,500,000 | 46.05% | Blockscout `/tokens/0xFbC2.../holders` row 1 |
| MerkleVester `0x2f6ba6f4…30f6` | 154,521,725 | 15.45% | row 2 |
| MerkleVester `0xBA4041cA…e408` | 91,450,498 | 9.15% | row 3 |
| OFTAdapter `0xacd4d6f4…EAA2` | 38,002,453 | 3.80% | row 4 |
| Safe A `0x3EA10CB7…f74A` | 37,799,092 | 3.78% | row 5 |
| EOA `0x1157A207…4101` | 31,520,386 | 3.15% | row 6 |
| Contract `0xB3C77edE…cC11` | 21,084,000 | 2.11% | row 7 |
| EOA `0xBaeD383E…439F` | 18,940,739 | 1.89% | row 8 |
| Deployer Safe `0x5715907d…23cD` | 13,407,348 | 1.34% | row 9 |
| EOA `0x5CB710D1…Fd4D` | 4,271,926 | 0.43% | row 10 |
| Top-10 total | 871,498,167 | 87.15% | sum |
| Top-10 % per Virtuals API (slightly different snapshot) | — | 96.99% | `top10HolderPercentage` |
| Total holders | 4,527 | — | Blockscout token meta `holders_count` |
| Holders per Virtuals API | 3,116 | — | `holderCount` (snapshot lag — Virtuals updates less often) |

> Note: Virtuals' 96.99% top-10 number is higher than the 87.15% computed from Blockscout — most likely Virtuals counts the deployer Safe and other team Safes that are not all in the Blockscout top-10 row set. We cite both numbers and let the reader pick.

## Pool composition

| Claim | Source |
|---|---|
| OPG in pool: 1,346,156 | `eth_call balanceOf(OPG, pool) → 0x011d0f498c9639d746d608` = 1.346e24 wei → 1,346,156 OPG |
| VIRTUAL in pool: 493,468 | `eth_call balanceOf(VIRTUAL, pool) → 0x687f008ce407e75266ff` = 4.93e23 wei → 493,469 VIRT |
| USDC in pool: 0 | `eth_call balanceOf(USDC, pool) → 0x0` |
| LP value ~$795K | (1,346,156 × $0.300623) + (493,468 × $0.781846) |
| Virtuals quoted liquidityUsd | `liquidityUsd: 818860.7` (close to our calc) |
| LP / FDV: 0.26% | $795K / $303.7M |
| 24h volume $209,790, net $28,782 | `volume24h`, `netVolume24h` |
| 24h volume / FDV: 0.07% | calc |
| OPG % of supply in LP: 0.13% | 1,346,156 / 1,000,000,000 |

## Distribution flow

| Claim | Source |
|---|---|
| 17 outbound transfers from deployer Safe | https://base.blockscout.com/api/v2/addresses/0x5715907d94AA5176764960A022dBE95f548d23cD/token-transfers?filter=from |
| 154.5M to MerkleVester 0x2f6ba6f4…30f6 on 2026-03-23 (tx 0x21bcc723… is the test, full tx is in the 154.5M outbound row) | Same endpoint |
| 460.5M to MerkleVester 0xAaD47CE7…A9Ad on 2026-04-17 | Same |
| 91.5M to MerkleVester 0xBA4041cA…e408 on 2026-04-17 | Same |
| 100M / 60M / 39.99M to three Safes on 2026-04-16 | Same |
| 70M to 0xB3C77edE…cC11 on 2026-04-20 | Same |
| 10.1M to 0xc12D3c16…b81a on 2026-04-20 | Same |

## OFT bridge activity

| Claim | Source |
|---|---|
| OFTAdapter at 0xacd4d6f4…EAA2 | `creator_address_hash` and verified Blockscout label |
| Recent inbound batches ~13K OPG, mostly from 0xd4adE84D… | https://base.blockscout.com/api/v2/addresses/0xacd4d6f4Ea54045e4cA21E23AE423700D95aEAA2/token-transfers?type=ERC-20 (10 most recent shown in article) |
| Created by 0x93CEa69F…CB85 | Blockscout `creator_address_hash` |

## Method / infra

| Claim | Source |
|---|---|
| Sentinel node = Base archive-pruned | ChainWard infra, `ssh cw-sentinel`, RPC `http://localhost:8545` |
| Decode block 45,536,185 | `eth_blockNumber → 0x2b390a6` mid-decode; Blockscout `block_number_balance_updated_at` |
| aGDP definition | https://whitepaper.virtuals.io/acp-product-resources/acp-glossary |

## Final pre-publish checks

- [ ] Slug in frontmatter (`opengradient-decode`) matches directory name and tweet 5 link
- [ ] All wallet addresses checksummed correctly (Blockscout returns mixed case — match exactly)
- [ ] No adversarial verbs (scam/dirty/fake/broken). aGDP framed as a "defined metric"
- [ ] Tweet character counts: 272 / 269 / 271 / 273 / 266 — all under 280
- [ ] Numbers timestamp: noted "decode block ~45.5M, 2026-05-03"
- [ ] Hedging: "one verified route" / "as of decode block" / "follow-up could disambiguate"
- [ ] Sources block at bottom of decode.md is complete and clickable
