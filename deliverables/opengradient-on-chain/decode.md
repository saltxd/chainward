---
title: "OpenGradient On-Chain Decode"
subtitle: "$285M trending market cap, 12 days since launch, zero ACP jobs — where does the valuation come from?"
date: "2026-05-03"
slug: "opengradient-on-chain"
---

## TLDR

OpenGradient ($OPG) is the highest-trending agent token on the Virtuals dashboard right now, with a quoted market cap of about $285M and a fully-diluted valuation around $300M. The token is 12 days old (public launch 2026-04-21) and the project has zero recorded jobs in Virtuals' Agent Commerce Protocol (ACP) — its agent record carries `acpAgentId: null` and a name/wallet search of the ACP API returns no results.

The chain shows two things at once:

1. **The valuation is supported by very thin liquidity.** Roughly $0.8M sits in the Uniswap-style VIRTUAL/OPG pool — about 0.27% of FDV. Almost the entire 1B supply is locked in three MerkleVester contracts (70.65%) or pre-positioned in a LayerZero bridge (3.80%) and team Safes (~6.5%). Only ~0.13% of supply is in the trading pool itself.

2. **Real product activity exists, but it isn't agent commerce.** The OpenGradient OFT (LayerZero) bridge is being used right now — small batches of OPG are flowing out of Base toward OpenGradient's own L1 every few minutes. That is product traction for an L1 bridge. It is not agent revenue, and it is not what the Virtuals dashboard is measuring when it ranks $OPG.

This decode walks through every wallet, where the supply went, and what's actually happening on-chain so you can decide what to make of the number.

> Note on framing: aGDP and Virtuals' "trending market cap" are defined metrics, not lies. They measure notional things (market cap = price × supply, aGDP = notional trading volume). This piece is about the gap between those metrics and the on-chain product footprint, which is a separate question.

---

## What is OpenGradient?

Per the project's own description on Virtuals, OpenGradient bills itself as a decentralized AI infrastructure network that runs and verifies model inference at scale across a network of TEEs and GPUs — the "Network for Open Intelligence." The token utility section lists five functions: inference payments via x402, model monetization, DPoS staking, app access, and governance.

The roadmap (Q2 2026) calls for a token launch on April 6 with mainnet activation, DEX liquidity (Aerodrome/Uniswap), validator onboarding, and a permissionless validator set in June. Public TGE on Virtuals' Genesis flow happened **2026-04-21**.

The on-chain artifacts agree with that picture: there is a verified ERC-20 (`OpenGradientToken`), a LayerZero OFT adapter on Base, a set of vesting contracts, and a Uniswap V3 1% fee pool against $VIRTUAL. There is no ACP service registration.

---

## Wallet Map

Pulled from `https://api.virtuals.io/api/virtuals/72059` and verified on-chain at block ~45,536,000 (2026-05-03):

| Role | Address | Type | Holds | Notes |
|---|---|---|---|---|
| Listed `walletAddress` | `0x70434389…44Fb` | EOA | 0 ETH, 0 OPG, nonce 0 | Never used. No txs, no transfers. |
| `tokenAddress` | `0xFbC2051A…F5eB` | Verified ERC-20 | 1B supply, 18 dec | `OpenGradientToken`, deployed 2026-03-15-ish via factory by `0x4905…d2DC` |
| `lpAddress` | `0x2b75b90f…ceeb` | Uniswap V3 pool, 1% fee | 1.35M OPG + 493K VIRTUAL | Created 2026-03-22 by `0x93CE…CB85` (factory). Pair is VIRTUAL/OPG, **not USDC** |
| `migrateTokenAddress` | `0xFbC2051A…F5eB` | (same as token) | — | No separate migration target |
| `sentientWalletAddress` | `null` | — | — | Not assigned |
| `tbaAddress` | `null` | — | — | No agent token-bound account |
| `daoAddress` | `null` | — | — | No DAO yet |
| `acpAgentId` | `null` | — | — | Not registered as an ACP service agent |
| Initial mint recipient / "deployer Safe" | `0x5715907d…23cD` | Gnosis Safe (SafeL2 master copy) | 13.41M OPG (1.34%) | Received the 1B mint and fanned it out |
| Top vester | `0xAaD47CE7…A9Ad` | `MerkleVester` contract | 460.50M OPG (46.05%) | Largest single concentration |
| Vester #2 | `0x2f6ba6f4…30f6` | `MerkleVester` | 154.52M OPG (15.45%) | |
| Vester #3 | `0xBA4041cA…e408` | `MerkleVester` | 91.45M OPG (9.15%) | |
| LayerZero bridge | `0xacd4d6f4…EAA2` | `OpenGradientOFTAdapter` | 38.00M OPG (3.80%) | Locks OPG on Base, mints on OpenGradient L1 |
| Team Safe A | `0x3EA10CB7…f74A` | Gnosis Safe (SafeL2) | 37.80M OPG (3.78%) | 0 outbound transfers as of decode |
| Team Safe B | `0x2398e722…a5AF` | Gnosis Safe | 100M OPG | Received 100M from deployer Safe 2026-04-16 |
| Team Safe C | `0x0Cc648DF…E6f3` | Gnosis Safe | 60M OPG | Received 60M from deployer Safe 2026-04-16 |
| Notable EOA | `0x1157A207…4101` | EOA | 31.52M OPG (3.15%) | 1,132 txs total — high-activity wallet, not labeled |
| OPG token deployer | `0x49050…d2DC` | EOA | 0 — single-purpose deployer | Sent the deploy tx `0xd714ef95…313f3`, then idle |

> "Listed `walletAddress`" being an unused EOA is normal for token-only Genesis launches. There is no agent process running here — there is a token and a project. The Virtuals dashboard schema reuses the same shape regardless.

---

## Token Economics

Confirmed by `eth_call` to the token and pool at the decode block:

- **Total supply:** 1,000,000,000 OPG (18 decimals). Hex: `0x033b2e3c9fd0803ce8000000` from `totalSupply()`.
- **Circulating market cap (Blockscout, exchange_rate $0.300623):** $57.15M
- **FDV (Virtuals API, fdvInVirtual × VIRT/USD):** ~$303.7M (at VIRT=$0.78). Trending dashboard quotes ~$285M. These are all the same order-of-magnitude number; the difference is timing of the price snapshot.
- **Launch FDV target (per `launchParams`):** $180M USD. Token genesis price: $0.025. The token is up roughly 12× from launch.

### Where the supply lives

| Bucket | OPG | % of supply |
|---|---:|---:|
| MerkleVester contracts (3 of them) | 706,472,222 | 70.65% |
| Team Safes (combined: 100M + 60M + 37.8M + 13.4M) | 211,206,422 | 21.12% |
| OFT bridge (locked on Base, minted on OpenGradient L1) | 38,002,452 | 3.80% |
| Notable EOA (`0x1157…4101`) | 31,520,386 | 3.15% |
| Uniswap V3 LP | 1,346,156 | 0.13% |
| All other holders (~4,500 wallets) | ~11.4M | ~1.14% |

Top-10 holder concentration per Virtuals API: **96.99%**. That number is fundamentally a vesting/team/bridge number — most of the top 10 are infrastructure contracts, not whales hoarding for themselves. But it is the mechanical input to "circulating supply" and therefore to mcap.

### How thin is the liquidity?

The trading pool is a Uniswap V3 1% fee tier with token0=VIRTUAL, token1=OPG. At the decode block:

- **OPG in pool:** 1,346,156 (~$408K at $0.30)
- **VIRTUAL in pool:** 493,468 (~$386K at $0.78)
- **Total LP value:** ~$795K (Virtuals API quotes `liquidityUsd: $818,860` — same number, slightly different timestamp)
- **LP / FDV ratio:** ~0.26%
- **24h volume / FDV:** ~0.07% (`volume24h: $209,790`)
- **24h *net* volume:** $28,782 — i.e., almost all 24h volume is round-trip churn

For comparison, a typical mature large-cap on Base might have 5–15% of FDV in liquidity. OPG sits at roughly one-fortieth of that. This is consistent with the supply distribution: 99.87% of supply is sitting in vesters, bridges, or team safes, not in the pool.

---

## Real Activity

### ACP (Virtuals Agent Commerce Protocol): zero

`acpx.virtuals.io/api/agents?filters[name][$eqi]=OpenGradient` → `data: []`, `pagination.total: 0`.
`acpx.virtuals.io/api/agents?filters[walletAddress][$eqi]=0x70434389e58F5aFcf8e43B9EeF066472Af3044Fb` → same.

The Virtuals API record itself carries `acpAgentId: null` and `v3AcpAgentId: null`. OpenGradient is a token + infrastructure project; it does not sell ACP services. Any "leaderboard" comparison versus aGDP-earning agents is apples-to-oranges.

### LayerZero bridge: actively used

The `OpenGradientOFTAdapter` at `0xacd4d6f4…EAA2` is taking OPG deposits in steady rhythm from a small set of forwarders. A spot sample of 10 inbound transfers between 01:47 and 02:27 UTC on 2026-05-04:

```
2026-05-04 02:27:35  0xd4adE84D... -> OFTAdapter   13,542 OPG
2026-05-04 02:24:33  0xd4adE84D... -> OFTAdapter   13,193 OPG
2026-05-04 01:59:59  0xd4adE84D... -> OFTAdapter   14,115 OPG
2026-05-04 01:54:55  0xd4adE84D... -> OFTAdapter   13,166 OPG
2026-05-04 01:53:07  0xd4adE84D... -> OFTAdapter   13,935 OPG
2026-05-04 01:51:01  0xd4adE84D... -> OFTAdapter   13,711 OPG
2026-05-04 01:49:13  0x4187ad23... -> OFTAdapter   17,782 OPG
2026-05-04 01:49:03  0xd4adE84D... -> OFTAdapter   14,117 OPG
2026-05-04 01:47:25  0xAab44a9b... -> OFTAdapter    2,641 OPG
2026-05-04 01:47:15  0xd4adE84D... -> OFTAdapter   14,255 OPG
```

That is real bridge throughput, dominated by one address (`0xd4adE84D…`) that is sending consistently sized batches. Whether this is end-user demand for OpenGradient L1, market-making rebalancing, or a single project-side loop is something a follow-up decode could disambiguate. What it isn't: ACP service revenue.

### Trading: small but real

Inbound transfers to the LP at the decode time show $200–$800-of-VIRTUAL-sized swaps from a handful of addresses (e.g., `0x411d2C09…879c6`, `0xc1007fC4…9a68`). 24h volume of $209K with $28K net is a thin tape with churn.

---

## Holder Concentration

The headline 96.99% top-10 number deserves unpacking. Of the top 10:

- 7 are smart contracts: 3 MerkleVesters, the OFT bridge, and 3 Gnosis Safes.
- 2 are EOAs (`0x1157…4101` with 31.5M, `0xBaeD3…439F` with 18.9M). The 31.5M wallet received its position in two main batches (50M from `0x47670fC…7F80C` on 2026-04-21 launch day, and 6M from `0x0D4419E…4f72` on 2026-04-20). It has spent some down to the current 31.5M.
- 1 is the deployer Safe still holding 13.4M residual.

So the right reading is "97% of supply is in vesting/bridge/team contracts" — which is *expected* for a 12-day-old launch with cliffs and lockups. It is also the reason circulating mcap ($57M) is so much lower than FDV ($300M): roughly 80% of supply is unvested.

The relevant question for the next 6–18 months is the unlock schedule encoded in the three `MerkleVester` contracts. Decoding those vesting schemas (start/cliff/end timestamps, recipient leaves) is a follow-up; the contracts are not factory-verified at the proxy level on Blockscout.

---

## Distribution Trace (deployer Safe → everywhere)

The flow out of the original mint recipient `0x5715907d…23cD` (a Gnosis Safe), in chronological order, from the 17 outbound transfers visible on Blockscout:

| Date | To | Amount | Role |
|---|---|---:|---|
| 2026-03-23 | `0x2f6ba6f4…30f6` | 154,521,725 | MerkleVester #3 |
| 2026-03-26 → 2026-04-10 | three small EOAs | 215 total | test transfers (10–200 OPG) |
| 2026-04-16 (test) | three team Safes | 30 total | dust test (10 OPG each) |
| 2026-04-16 | Safe `0x2398e722…a5AF` | 99,999,990 | Team Safe B |
| 2026-04-16 | Safe `0x0Cc648DF…E6f3` | 59,999,990 | Team Safe C |
| 2026-04-16 | Safe `0x3EA10CB7…f74A` | 39,999,990 | Team Safe A |
| 2026-04-17 | `0xBA4041cA…e408` | 91,450,497.51 | MerkleVester |
| 2026-04-17 | `0xAaD47CE7…A9Ad` | 460,500,000 | MerkleVester (largest bucket) |
| 2026-04-20 | `0xc12D3c16…b81a` | 10,119,989 | Unlabeled, not a top-10 holder anymore |
| 2026-04-20 | `0xB3C77edE…cC11` | 70,000,000 | Unlabeled contract (currently top-7 holder, 21.08M) |
| 2026-04-21 | `0x93CEa69F…CB85` | 200 | LP-creator address — final test? |

This is the canonical "set up vesters, fund team safes, seed bridge, launch" pattern. Nothing about the flow itself looks anomalous for a Virtuals Genesis launch. What the chain *does* show is that the on-chain economics were finalized over a roughly five-day window (2026-04-16 → 2026-04-21), with the LP itself being created earlier on 2026-03-22.

---

## Cross-Check: Squatter Listings

A search of the Virtuals API for `symbol=OPG` returns **10 records**, of which one is the real `AVAILABLE` token (id 72059) and **9 are UNDERGRAD** records using the same name and symbol — each parked at the boilerplate $6,300 FDV. Examples: ids 71964, 72591, 72919 ("OpenGradiant by virtuals"), 72932, 73365, 73367, 73368, 73375, 73376.

If you're searching by name on Virtuals to buy $OPG, you'll see all of them. The real one is `id=72059`, status `AVAILABLE`, contract `0xFbC2051A…F5eB`. The decoy listings sit in the bonding-curve pre-graduation tier and would resolve to entirely separate tokens if bought.

---

## What This Means

A few framings, none of which are accusations:

**1. The $285M number is a "market cap" in the textbook sense — price × supply — not a measurement of cash flow or product usage.** It is supported by ~$0.8M of two-sided liquidity. That ratio is not unusual for a freshly-vested launch where 80% of supply is still locked; it is unusual when compared against the implied dollar number.

**2. Comparing $OPG against ACP-revenue agents is a category error.** OpenGradient does not sell agent services on ACP. It is an L1/infrastructure project that happens to have launched its token via Virtuals' Genesis platform. Its on-chain product activity, to the extent the chain shows any, is bridging — not agent commerce.

**3. The 12-day-old observation is real and worth holding.** Most of the supply hasn't started vesting linearly yet (the vesting math lives in the three MerkleVester contracts and is the highest-value follow-up). The ratio of FDV to circulating supply (~5.3×) means today's holders are price-sensitive to whatever the unlock schedule turns out to be.

**4. Squatter listings exist.** Nine fake $OPG records on Virtuals dashboard with the same name. Worth knowing if you ever search by name rather than contract.

If you want to own $OPG as a thesis on decentralized inference infrastructure, that's a coherent thesis. If you saw a "trending agent at $285M cap" and assumed it was generating proportional revenue, the chain disagrees with that read — but the chain doesn't claim the project is doing anything wrong. It's just a different shape of asset than aGDP-leaderboard agents.

We just audit. You decide.

---

## Sources

All data verified at block ~45,536,000 (2026-05-03) on Base.

- Virtuals API agent record: https://api.virtuals.io/api/virtuals/72059
- ACP API name search (returns empty): https://acpx.virtuals.io/api/agents?filters[name][$eqi]=OpenGradient
- ACP API wallet search (returns empty): https://acpx.virtuals.io/api/agents?filters[walletAddress][$eqi]=0x70434389e58F5aFcf8e43B9EeF066472Af3044Fb
- Token contract: https://base.blockscout.com/address/0xFbC2051AE2265686a469421b2C5A2D5462FbF5eB
- Token deploy tx: https://base.blockscout.com/tx/0xd714ef959dc071f3957f48819d0ce6e81af7193984355cbdcc924c44e77313f3
- Token holders list: https://base.blockscout.com/api/v2/tokens/0xFbC2051AE2265686a469421b2C5A2D5462FbF5eB/holders
- Listed wallet (unused EOA): https://base.blockscout.com/address/0x70434389e58F5aFcf8e43B9EeF066472Af3044Fb
- Listed wallet counters (0/0/0/0): https://base.blockscout.com/api/v2/addresses/0x70434389e58F5aFcf8e43B9EeF066472Af3044Fb/counters
- Uniswap V3 VIRTUAL/OPG pool: https://base.blockscout.com/address/0x2b75b90fb01e5fc87d4d263033841397b015ceeb
- Pool creation tx: https://base.blockscout.com/tx/0x19861e1767bfd930b462b9412f1ca34b03b413a756b6b94e6006a19839968272
- Deployer / initial mint Safe: https://base.blockscout.com/address/0x5715907d94AA5176764960A022dBE95f548d23cD
- MerkleVester #1 (460.5M OPG): https://base.blockscout.com/address/0xAaD47CE76851a12bDdbE38f05d7A3Ff2d877A9Ad
- MerkleVester #2 (154.5M OPG): https://base.blockscout.com/address/0x2f6ba6f4bBa4d84F1C499B83B66435D8E94230f6
- MerkleVester #3 (91.5M OPG): https://base.blockscout.com/address/0xBA4041cA429AEB4C680169ABBEF36B2165f2e408
- LayerZero OFT adapter: https://base.blockscout.com/address/0xacd4d6f4Ea54045e4cA21E23AE423700D95aEAA2
- VIRTUAL/USD price (CoinGecko): https://api.coingecko.com/api/v3/simple/price?ids=virtual-protocol&vs_currencies=usd
- aGDP definition (Virtuals glossary): https://whitepaper.virtuals.io/acp-product-resources/acp-glossary

Method: ChainWard sentinel node (`http://localhost:8545`, Base archive-pruned) for `eth_call`, `eth_getBalance`, `eth_getCode`, `eth_getTransactionCount`. Blockscout v2 API for counters, holders, transfer feeds. Virtuals + ACP REST APIs as documented.
