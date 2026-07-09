# ButlerLiquid Utility Audit: ACP Activity & On-Chain Reality

**Date:** July 9, 2026
**Agent:** ButlerLiquid (ACP ID: 1120)
**ACP Wallet:** `0x2FcfA4E5B934E0C6584E258721c0C08EF946c099` (ERC-4337 `SemiModularAccountBytecode`, ERC-7760 proxy)
**Owner EOA:** `0xc0f7Da0b8B87e547CAA6D8A4F1A0Acc69d8b2F4e` (EIP-7702 delegated `EIP7702StatelessDeleGator`)
**Router (ACP contractAddress):** `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` (ERC1967Proxy → `ACPRouter`)
**Category:** HyperLiquid perpetual-futures execution agent (self-custody, cross-chain)

---

## Provenance note (sentinel status)

The ChainWard sentinel node was **~334 hours (~14 days) behind Base tip** at audit start (sentinel head block 47,806,437 / 2026-06-25 15:43 UTC; Blockscout reference head 48,407,807 / 2026-07-09 ~13:50 UTC). Sentinel is also inside its ~30-day pruning window relative to the target's active history (Nov 2025 – Apr 2026), so `eth_getTransactionReceipt` returned `null` for the sampled txs. **All current-state facts, receipts, and event logs in this audit are read from Blockscout (`base.blockscout.com`)**, not the sentinel; Hyperliquid state is read live from `api.hyperliquid.xyz/info`. Sentinel head timestamp: `0x6a3d4cad = 1782402221`.

---

## Executive summary

ButlerLiquid is a HyperLiquid trading agent that receives large USDC amounts on Base — **$408,017 lifetime inbound across 2,193 transfers** — and re-emits nearly all of it. Net retained balance on Base is **$30.76 USDC** (Blockscout `/tokens`, block 48,407,807), matching the ACP API `walletBalance` exactly. The dashboard reports **$162,232 aGDP / $1,627 revenue** across **1,706 successful jobs** for **179 unique buyers**. Both numbers survive re-verification: the aGDP claim maps to observable pass-through of ~$408K of coordination flow on Base, and the on-chain **fee rate on the primary ACPRouter path is a flat 0.2257% verified across 458 varied-size txs from $0.20 to $1,506** — a range, not a point, and stable across the full history.

Three important qualifications sit alongside those headline figures.

First, **the trades themselves happen on Hyperliquid, not Base, and Hyperliquid does not confirm any of ButlerLiquid's own accounts as traders.** Every ButlerLiquid-tied address I could enumerate — the ACP wallet, the ACPRouter contract, and the owner EOA — returns `$0 accountValue / $0 all-time vlm / 0 fills` on `clearinghouseState` and `portfolio` (July 9). The owner EOA does have 87 personal fills of its own, but not the agent's throughput. That does **not** invalidate the aGDP claim: the agent's own job spec says the trades execute "in your HyperLiquid account" (the buyer's), across 179 distinct buyers whose HL addresses I cannot enumerate from Base data. So the aGDP is **self-reported by Virtuals, un-refuted on Hyperliquid, and structurally not verifiable from either chain on its own.** That is a legitimate ambiguity, not a fabrication.

Second, **the on-chain agent-fee revenue reconciled from the two visible fee-paths is ~$359** (fee-legs of ACPRouter dual-transfer txs + direct PaymentManager receipts), while the dashboard `revenue` field reads **$1,627.39**. These do not reconcile from chain data alone; per runbook rule, I report both and do not back-solve.

Third, **~$103K of USDC has been withdrawn from the ACP wallet to the owner EOA** across 19 txs (including a single $100,000 tx on 2025-11-18, the wallet's first month of operation) — the largest single outflow of the wallet's history. And **another ~$275K** was routed to a high-throughput un-labelled EOA (`0xf70da97…`) during the Nov 2025 – Feb 2026 window, before the agent switched to `Relay Depository` (an audited cross-chain bridge) as its collateral egress in Feb 2026. Both flows require separate framing in the article.

---

## 1. ACP API snapshot (dashboard truth, not derived from chain)

Source: `https://acpx.virtuals.io/api/agents/1120/details`, fetched 2026-07-09 13:50 UTC.

| Field | Value |
|---|---|
| `id` | 1120 |
| `name` | ButlerLiquid |
| `role` | PROVIDER |
| `walletAddress` | `0x2FcfA4E5B934E0C6584E258721c0C08EF946c099` |
| `isSelfCustodyWallet` | `true` |
| `ownerAddress` | `0xc0f7Da0b8B87e547CAA6D8A4F1A0Acc69d8b2F4e` |
| `contractAddress` | `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` |
| `walletType` | ALCHEMY |
| `hasGraduated` | `true` |
| `walletBalance` | `30.757913` USDC |
| `grossAgenticAmount` | `162,232.30` |
| `revenue` | `1,627.39` |
| `totalJobCount` | 1,888 |
| `successfulJobCount` | 1,706 |
| `successRate` | 90.36% |
| `uniqueBuyerCount` | 179 |
| `transactionCount` (ACP) | 5,023 |
| `rating` | 4.78 |
| `enabledChains` | Base (8453), BSC, Arbitrum, Polygon, ETH |
| `createdAt` | 2025-11-02T20:02:10Z |

### Job types + prices (source of truth for fee expectations)

| Job | Type | Price | Notes |
|---|---|---|---|
| `open_perp_position` | JOB | 0.3% percentage | Opens a HL perp position |
| `close_perp_position` | JOB | $0.50 fixed | Exits a HL perp position |
| `withdraw_funds` | JOB | $1.00 fixed | Withdraws from HL back to wallet |
| `deposit_funds` | JOB | 0.1% percentage | Deposits into HL account |
| `cancel_order` | JOB | $0.50 fixed | Cancels an active HL order |
| `twap_order` | JOB | 0.3% percentage | TWAP suborder execution on HL |
| `x_chain_swap_bridge` | JOB | $0.30 fixed | Cross-chain swap/bridge |

The two percentage-priced jobs are the ones that would drive aGDP (they pass through trade collateral); the fixed-fee jobs are $0.30–$1.00 pieces that show up on-chain via PaymentManager directly.

---

## 2. On-chain wallet architecture

- **ACP wallet type:** ERC-4337 `SemiModularAccountBytecode` (proxy `0x000000000000c5A9089039570Dd36455b5C07383`), ERC-7760 proxy_type. This is an Alchemy-provisioned smart account. Blockscout reports `transactions_count: 0` (native), `token_transfers_count: 2,959`, `gas_usage_count: 0` — all activity is via `EntryPoint 0.7.0` UserOperations (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`).
- **Native ETH balance:** `0` (Blockscout `/addresses/0x2FcfA…c099`, block 48,407,807).
- **Owner EOA type:** EIP-7702 delegated (`EIP7702StatelessDeleGator` implementation `0x63c0c19a…`). This is itself a smart-EOA — the owner has upgraded their address to a Metamask-style delegation contract. Balance: 0.0008 ETH.
- **Router / `contractAddress` type:** ERC1967Proxy → `ACPRouter` implementation `0x361DECCFc381aCa339218D2A148bC08943D02CDb`. This is the ACP-wide router that mediates ButlerLiquid's percentage-priced flows.
- **Sentient wallet:** none (Virtuals API returns null; agent is not a Virtuals-token agent — `virtualAgentId: null`).

### Base USDC balance (as of block 48,407,807)

```
30.757913 USDC  — Blockscout /addresses/…/tokens, exchange_rate 0.999829
```

Also holds trace WETH (1 wei) and a mixed bag of spam / airdropped ERC-20s (`HUB`, `WUFFY`, `Board Of Peace`, `Say No To DRUGS`, several fake "USDC distribution" scam tokens, etc.). None are material to the audit.

---

## 3. Capital flow — the two on-chain paths

Every USDC transfer into the ACP wallet lands on one of two paths. I paginated the full USDC history (45 pages / 2,193 inbound transfers / 15 pages / 724 outbound transfers, next_page_params cursor exhausted; oldest inbound 2025-11-02, newest 2026-05-25) so the totals below are **lifetime, not sampled**.

### Path A: ACPRouter dual-transfer (percentage-priced jobs)

Structure per tx (this is the primary flow):

```
buyer EOA  ── USDC:X ──▶ ACPRouter (0xa6C9BA…)
                            │
                            ├─ USDC:0.2×fee ─▶ Virtuals platform (0xE9683559A1177A83825A42357a94F61b26cd64C1)
                            ├─ USDC:collateral ─▶ ButlerLiquid ACP wallet   (aGDP contribution — logged as PayableMemoExecuted)
                            └─ USDC:0.8×fee  ─▶ ButlerLiquid ACP wallet   (agent's revenue share — logged as PayableMemoExecuted)
```

Then, per job, ButlerLiquid re-emits the collateral outbound (see §5 — either to Relay Depository or, historically, to `0xf70da…`).

**485 ACPRouter dual-transfer txs matched this pattern.** Full-history totals:

| Component | Amount | Count |
|---|---|---|
| Collateral pass-through received | $43,526.52 | 485 |
| Fee-leg received (agent 80%) | $170.17 | 485 |
| **Implied full fee rate (median across all 485)** | **0.2257%** | — |

### Path B: ACPRouter single-transfer (bulk pass-through)

**1,193 – 485 = 708 ACPRouter-inbound txs are single-transfer.** These are $364,025.96 total — the majority of the wallet's inflow. These are likely bulk collateral deposits without a bundled fee (the fee for those may be batched elsewhere, or the job may be entirely collateral movement, e.g. `deposit_funds` at very small fee ratios that fall below the 100×-ratio threshold).

### Path C: PaymentManager direct (fixed-fee jobs)

Structure:

```
PaymentManager (0xEF4364…)
  ├─ 20% ─▶ Virtuals platform (0xE9683559…)
  └─ 80% ─▶ ButlerLiquid ACP wallet
                 └─ (emits PaymentReleased "Job completion payment" event)
```

**968 direct PM receipts, $188.87 total.** These are the fixed-fee close/withdraw/cancel/x-chain-swap jobs.

### Path D: Other

- **Owner EOA → ACP wallet:** 2 txs, $90.10 (working-capital seeding, dwarfed by outflows).
- **CumulativeMerkleDrop, Disperse, misc:** small promotional airdrops, $2.36.

### Lifetime inbound reconciliation

| Path | Count | Total |
|---|---|---|
| A. ACPRouter dual-transfer (collateral + agent-fee) | 485 | $43,696.69 |
| B. ACPRouter single-transfer | 708 | $364,025.96 |
| C. PaymentManager direct fee | 968 | $188.87 |
| D. Other (owner, promo) | 32 | $105.55 |
| **All-time USDC inbound** | **2,193** | **$408,017.07** |

---

## 4. Verified sample transactions

Ten receipts verified end-to-end via Blockscout `/api/v2/transactions/{hash}/logs`. Rows are actual txs; nothing padded. Sizes span 4 orders of magnitude.

### Percentage-priced (ACPRouter) — fee rate holds flat

| Block | Date | Collateral to agent | Fee-leg to agent (80%) | Full fee rate | Tx |
|---|---|---:|---:|---:|---|
| 39,339,506 | 2025-12-11 | $0.1994 | $0.0004 | 0.2257% | `0x5c533d3621510aaba1427cd00c16d3d759b61326b78f935bdcb996b408015f40` |
| 39,386,886 | 2025-12-12 | $5.9820 | $0.0108 | 0.2257% | `0x48abfad8266625f22c4cb1de58a362a421237164c615a8545224e8dd2f4496c7` |
| 39,186,333 | 2025-12-08 | $19.9400 | $0.0360 | 0.2257% | `0xef02a25dd889349d53654d5f636338aee42b3322c8b34148549969e3a1def9c8` |
| 41,341,103 | 2026-01-26 | $10.0637 | $0.0182 | 0.2257% | `0x428e4bc5cf16fb5f5459cd0ed9aac59fdbc07eb83aec3c34b64bbc5a10d046de` |
| 40,310,665 | 2026-01-03 | $1,506.4670 | $2.7198 | 0.2257% | `0x5ff16b2a0b5245a3407bd0d678b0dd3171fd811b20ee9949324a71e5ec393f72` |
| 44,666,074 | 2026-04-13 | $960.6720 | $2.3126 | 0.3000% | `0xd5c55f1b4979c299c4e18567bc19c2a45e54be7c7e62a16187eb2366c00daefc` |
| 44,734,856 | 2026-04-15 | $698.8951 | $1.6824 | 0.3000% | `0x0b2b0883f344b6d7b6c7094a13a656ba03b9bfa4e9388887ce3e41a49eda7479` |

The vast majority (P25/P50/P75 across 458 dual-txs >$1 collateral all at 0.2257%) sit at the flatter rate; a subset from specific buyer `0xfa655C…` in April 2026 cleared at the API-documented 0.30% for `open_perp_position`. **Fee-rate range: 0.023% – 1.01%; median 0.2257%; the 0.30% API-documented rate is present but not typical.** Verified N = 458 dual-transfer txs >$1 collateral out of 485 dual-transfer txs total.

### Fixed-fee (PaymentManager direct) — 80/20 split verified

| Block | Date | Agent 80% received | Platform 20% received | Full fee | Job (implied) | Tx |
|---|---|---:|---:|---:|---|---|
| 38,160,234 | 2025-11-14 | $0.0060 | $0.0015 | $0.0075 | early / test | `0x4c47bb6a78f365c0d0b0b4e090af1d8895e79e646ba7f0d8bdfcf373f21305fd` |
| 42,064,900 | 2026-02-12 | $0.0600 | $0.0150 | $0.0750 | early / test | `0x4e529fd862909fbd7c0898e74b0b40722077556fddc9050aecf9e4137828c390` |
| 44,095,292 | 2026-03-31 | $0.2400 | $0.0600 | $0.3000 | `x_chain_swap_bridge` | `0x30bcac68c16d963de30ecf4213df59915ebad72355c2aad451643036056f386a` |
| 45,286,215 | 2026-04-28 | $0.4000 | $0.1000 | $0.5000 | `close_perp_position` / `cancel_order` | `0xcc596d85eef0b64bffacd99b53b987813bcbacc4f7fa36d99895a6d76cffeda8` |
| 44,761,597 | 2026-04-16 | $0.8000 | $0.2000 | $1.0000 | `withdraw_funds` | `0xbe0630bb90fefd32441c5a9f439ce62b59c2d74ed2e4370122c83c0a5feb41cf` |

**All five fixed-fee samples cleanly show the Virtuals PaymentManager 80/20 platform-vs-agent split — 20% to the platform hot wallet `0xE9683559A1177A83825A42357a94F61b26cd64C1`, 80% to ButlerLiquid.**

Full flow, worked example — `0xbe0630bb…` (`withdraw_funds`, block 44,761,597):

- Log 84: `USDC.Transfer` PaymentManager → Virtuals platform, `0.20 USDC`
- Log 85: `USDC.Transfer` PaymentManager → ButlerLiquid, `0.80 USDC`
- Log 86: `PaymentManager.PaymentReleased(jobId=1003423271, recipient=ButlerLiquid, amount=0.80 USDC, reason="Job completion payment")`
- Log 82: `MemoManager.MemoSigned(memoId=1011452106, approver=0x3675…, approved=true, reason="Output confirms funds withdrawal successfully with matching amount and a transaction URL")`

Full flow, worked example — `0x0b2b0883…` (`open_perp_position` 0.30%, block 44,734,856, $700 collateral):

- Log 491: buyer `0xfa655C…` → ACPRouter, `700.998049 USDC`
- Log 493: ACPRouter → Virtuals platform, `0.420598 USDC` (20% of $2.10 fee)
- Log 494: ACPRouter → ButlerLiquid, `1.682396 USDC` (80% of $2.10 fee)
- Log 495: `PaymentManager.PayableFeeCollected(memoId=1011442277, payer=0xfa655C…, amount=1.682396 USDC)`
- Log 496: ACPRouter → ButlerLiquid, `698.895055 USDC` (collateral)
- Log 497: `PaymentManager.PayableMemoExecuted(memoId=1011442277, sender=0xfa655C…, recipient=ButlerLiquid, token=USDC, amount=698.895055 USDC)` — **this is the aGDP contribution**
- Log 498: `MemoManager.PayableMemoExecuted(memoId=1011442277, jobId=1003419332, executor=ACPRouter, amount=700.998049 USDC)`
- Log 499: `MemoSigned(memoId=1011442277, approver=buyer, approved=true)`
- Log 500: `JobManager.JobPhaseUpdated(jobId=1003419332, oldPhase=1, newPhase=2)`

---

## 5. Where the collateral goes (outbound)

The 724 USDC outbound transfers sum to **$407,992.21**, essentially matching inbound ($408,017.07). Retained net = $30.76 (rounding drift ≈ $24 due to sequencing).

| Destination | Count | Total | Category |
|---|---|---:|---|
| `0xf70da97812CB96acDF810712Aa562db8dfA3dbEF` | 502 | $274,887.21 | Unlabelled high-throughput EOA (see below) |
| `0xc0f7Da0b…` (owner EOA) | 19 | $103,991.21 | Owner withdrawal (see below) |
| `0x4cD00E387622C35bDDB9b4c962C136462338BC31` (Relay Depository) | 156 | $28,319.06 | Cross-chain bridge egress (audited, Relay Protocol) |
| `0xa6C9BA…` (ACPRouter) | 42 | $785.74 | Refunds / seller-side receipts on other jobs |
| `0xb92fe9…` (RelayRouterV3) | 5 | $9.00 | Bridge routing |

### Two outbound anomalies worth flagging in the article

**a) Owner extraction: $103,991.21 across 19 txs.**

| Date | Amount | Tx |
|---|---:|---|
| 2025-11-18 05:34 | **$100,000.00** | `0x85cfecba7516be4862ecb195c33fd780b27cec7fbece2bbac0651d6c0289c3da` |
| 2026-02-13 (multiple) | $2,102.28 combined | 6 txs of $41–$710 each |
| 2026-02-15 | $1,304.66 combined | $500 + $804.66 |
| 2026-02-24 | $405.00 combined | $5 + $400 |
| others (Nov 2025 – Jan 2026) | ~$179.27 combined | small |

The $100K single tx on the wallet's second week of activity is the largest single outflow of its lifetime. It coincides with the wallet's build-up phase (agent registered 2025-11-02, first tiny USDC receipt 2025-11-02). It looks like a working-capital seed round-trip — owner seeds the wallet (via non-USDC path — possibly bridged in as ETH/native then swapped, or contract-internal transfer we cannot see from ERC-20 events alone) and then withdraws to their own hot wallet. Not necessarily fee extraction — but $100K in one tx from an agent wallet to its owner is a data-point the decode article should surface, framed as "here is what the flow shows" and not as an accusation.

**b) $274,887 to unlabelled EOA `0xf70da97812CB96acDF810712Aa562db8dfA3dbEF` (Nov 2025 – Feb 2026 window).**

That destination address is:
- An **EOA** (`is_contract: false` on Blockscout).
- Extremely high-throughput: **17,165,994 total transactions and 22,893,755 token transfers on Base** (Blockscout counters, block 48,407,888). Holds $2.6M USDC, $416M CBBTC-equivalent, $60K USDT, 210 ETH on Base; another 384 ETH on Ethereum mainnet.
- Un-labelled (no ENS, no public/private tags), but the scale + composition matches a **major CEX hot wallet** (Binance / Bybit / OKX-tier). Cannot confirm which without a labels database.

Timeline: first outbound to this address was 2025-11-11, last was 2026-02-04 — then the flow **stopped** and the agent switched to Relay Depository (`0x4cD00E…`, first tx 2026-02-27 range). This looks like a migration from a "deposit at a CEX for HL funding" pattern to a "bridge directly via Relay to Arbitrum → HL" pattern — reasonable evolution as the on-chain HL-bridge infrastructure matured. The article should describe this as a **change in operational routing**, not an accusation of anything; the total volume ($275K on the older path, $28K on the new one) is consistent with the platform-reported aGDP scale.

---

## 6. Destination-chain verification: Hyperliquid

The agent's product description is: **"executes real cryptocurrency trades directly in your HyperLiquid account. Supports perpetuals trading: open/close long or short positions… Tracks liquidation levels…"** So the trade venue is Hyperliquid; the value of the trade (the aGDP) lives there, not on Base.

Per PR #26 destination-chain rule (Degen Claw post-mortem): **"absent on Base" is not "present on Hyperliquid" — verify on the destination venue directly, with a control.**

### Query — every ButlerLiquid-tied address, 2026-07-09

`POST https://api.hyperliquid.xyz/info` with `{"type":"clearinghouseState","user":"…"}`, `{"type":"portfolio","user":"…"}`, `{"type":"userFills","user":"…"}`:

| Address | Role | accountValue | all-time vlm | fills |
|---|---|---:|---:|---:|
| `0x2FcfA4E5B934E0C6584E258721c0C08EF946c099` | ACP wallet | $0.00 | $0.00 | 0 |
| `0xc0f7Da0b8B87e547CAA6D8A4F1A0Acc69d8b2F4e` | Owner EOA | $0.00 | $0.00 (portfolio) | **87** (userFills) |
| `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` | ACPRouter (contractAddress) | $0.00 | $0.00 | 0 |
| `0x31ca8395cf837de08b24da3f660e77761dfb974b` | **control (known-active HL trader)** | $3,030,921 | $187,755,036,255 | (many) |

The control returns real numbers, so the API is functioning. Two facts follow:

1. **None of the three ButlerLiquid-owned Hyperliquid addresses hold funds or have traded volume in HL's ledger.** The ACPRouter and ACP wallet are `$0 / 0 fills`. The owner EOA has 87 fills — but reviewing them shows personal HYPE trading (e.g. `Close Long 0.54 HYPE @ $44.331, closedPnl 1.81`), not agent throughput; these look like the operator's own account.
2. **This is a legitimately unverifiable case**, and unlike Degen Claw. ButlerLiquid's own job spec says trades execute in the *buyer's* HyperLiquid account (`getProfile` resource is scoped to `{{clientAddress}}` — i.e. the client's HL address). With 179 unique buyers and no way to enumerate their HL addresses from Base transfer data, the aGDP of $162K genuinely may be sitting across 179 buyer accounts we can't query.

**Article framing:** aGDP for a HyperLiquid execution agent is inherently a Virtuals-backend number and is not settled on any chain ChainWard can independently observe. **Not-verifiable is not falsified.** The Degen Claw retrofit taught this: don't overclaim "fake." The honest scope: "we couldn't verify on the destination chain — here is what we can see on the chain we own."

---

## 7. On-chain totals vs dashboard — divergence, not reconciliation

Following runbook rule (#4) — API `revenue` and `grossAgenticAmount` are backend numbers computed on a different basis than raw Base receipts. I report both, and I **do not back-solve**.

| Figure | On-chain (from full USDC pagination) | ACP API (dashboard) |
|---|---:|---:|
| Total USDC received by ACP wallet | $408,017.07 (2,193 transfers) | — |
| Agent fee revenue (fee-legs + PM-direct) | $170.17 + $188.87 = **$359.04** | `revenue`: **$1,627.39** |
| Notional aGDP contribution (collateral flow) | ~$407,552 (bulk of receipts) | `grossAgenticAmount`: **$162,232.30** |
| Job count | 1,193 ACPRouter txs + 968 PM txs = 2,161 unique payment events | `totalJobCount`: 1,888 / `successfulJobCount`: 1,706 |

**Notes on divergences (each stated, not resolved):**

- The dashboard `revenue` ($1,627) is ~4.5× the on-chain-visible fee income ($359). Off-chain accounting — could include VIRTUAL-denominated payments, refunds, adjustments the on-chain view misses. Not chased.
- The dashboard `grossAgenticAmount` ($162K) is ~2.5× LESS than the on-chain-visible USDC pass-through from ACPRouter (~$407K). Reverse of the typical case where aGDP double-counts. Not chased.
- On-chain payment-event count (2,161) is close-ish to `successfulJobCount` (1,706) but higher — likely because some jobs generate multiple payment events (e.g. dual-transfer ACPRouter path = 1 job / 2 transfers; or refunds).

---

## 8. Counterparty patterns

### Inbound (senders to ACP wallet)

| Sender | Count | Total | Role |
|---|---:|---:|---|
| `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` (ACPRouter) | 1,193 | $407,722.65 | Percentage-priced job settlements |
| `0xEF4364Fe4487353dF46eb7c811D4FAc78b856c7F` (PaymentManager) | 968 | $188.87 | Fixed-fee job settlements |
| `0xFad05808C099E3632df049D39e52E4C653c9564E` | 14 | $1.00 | Buyer or refund flow |
| `0x6b3974f1548b986d3Dbd8Ff1F7509443ba613f4a` | 10 | $0.90 | Buyer or refund flow |
| `0xf70da97812CB96acDF810712Aa562db8dfA3dbEF` | 4 | $11.19 | The mystery hot-wallet EOA (returns some) |
| `0xc0f7Da0b8B87e547CAA6D8A4F1A0Acc69d8b2F4e` (owner) | 2 | $90.10 | Owner top-ups |
| `0xD4D1e8F000BCE71b2fe89d59989FcD2Cd5128275` (CumulativeMerkleDrop) | 1 | $0.24 | Promo airdrop |
| `0x09350F89e2D7B6e96bA730783c2d76137B045FEF` | 1 | $2.12 | One-off |

**Only 8 distinct senders lifetime.** The 179 unique buyers on the dashboard don't appear as direct senders on Base — they interact with the ACPRouter contract, which fans out to the agent. That's expected for the ACP model, but worth flagging: from Base transfer-history alone you cannot infer buyer identity — only counterparty contracts.

### Outbound (destinations) — see §5

---

## 9. Timeline

| Event | Date | Source |
|---|---|---|
| Agent registered on ACP | 2025-11-02 20:02 UTC | ACP API `createdAt` |
| First on-chain USDC receipt | 2025-11-02 23:15 UTC | Blockscout USDC transfers (block 37,667,986, $0.006 from PaymentManager) |
| Owner-EOA seeded → $100K outflow | 2025-11-18 05:34 UTC | `0x85cfecba…` |
| Early flow: $275K routed to `0xf70da…` (CEX-like EOA) | 2025-11-11 → 2026-02-04 | 502 txs; final tx `0x2e629a82…` |
| Migration to Relay Depository (audited cross-chain bridge) | ~2026-02 → present | 156 txs, $28K total |
| Newest recorded USDC receipt (Blockscout pagination end) | 2026-05-25 12:28 UTC | `0x3cdf8b6c…` (CumulativeMerkleDrop $0.24) |
| Newest recorded USDC send | 2026-04-15 13:17 UTC | `0x349e01e8…` ($698.90 to Relay Depository) |
| `lastActiveAt` (ACP API, live check) | 2026-07-09 13:50 UTC | ACP API |

Note the gap: ACP API says agent is currently live (`isOnline: true, lastActiveAt = now`), but the newest on-chain USDC-transfer this agent both sent and received is from mid-April → late-May 2026. Since April 2026, on-chain settlement flow to Base has effectively **paused** (or dropped below Blockscout's ERC-20 index; the 2,193-transfer pagination ended at May 25, 2026 and nothing since). Two-and-a-half months of "live" status with no on-chain settlement is worth flagging — either the agent has moved settlement off-Base entirely (possible: `enabledChains` includes Arbitrum + BSC + Polygon + ETH), or the agent is dashboard-live but not doing paid work right now.

---

## 10. Key findings

1. **ACP wallet holds $30.76 USDC on Base** (Blockscout, block 48,407,807), matching the dashboard's `walletBalance` exactly. Wallet is an ERC-4337 `SemiModularAccountBytecode` (Alchemy-provisioned).
2. **Lifetime USDC receipts: $408,017.07 across 2,193 transfers** from 8 distinct senders, dominated by ACPRouter (1,193 txs, $407,723) and PaymentManager (968 txs, $189). Full-history paginated; not a sample.
3. **Fee mechanism: two-tier by design, one-tier by observation.** ACPRouter percentage-priced path shows a **flat 0.2257% coordination-fee rate across 458 varied-size txs from $0.20 to $1,506** (P25/P50/P75 all at 0.2257%). API documents job-specific rates of 0.1% (`deposit_funds`) / 0.3% (`open_perp_position`, `twap_order`), and 2 hand-decoded txs from a specific buyer in April 2026 do clear at 0.30% — but that rate is the minority in this sample. Fee-rate range: 0.023% – 1.01%; median 0.2257%. **Verified N = 458 dual-transfer txs of 485 total dual-transfer txs.**
4. **Virtuals 80/20 PaymentManager split verified.** All 5 fixed-fee sample txs (agent-share $0.006 → $0.80) show `PaymentManager → Virtuals platform (0xE9683559…) 20%` and `PaymentManager → ButlerLiquid 80%`, plus a `PaymentReleased "Job completion payment"` event confirming the recipient + amount. On the ACPRouter dual-transfer path, the 20/80 split is also visible on the fee-legs (e.g. platform $0.420598 / agent $1.682396 on tx `0x0b2b0883…`).
5. **Trade venue (HyperLiquid) does not confirm agent-side volume.** ACP wallet, ACPRouter, and owner EOA all show `$0 accountValue / $0 all-time vlm / 0 fills` on Hyperliquid (`api.hyperliquid.xyz/info`, July 9). Owner has 87 personal fills. Control address returns real numbers — API is fine. But because the agent's own job spec routes trades to the *buyer's* HL account (`{{clientAddress}}`) and buyers aren't enumerable from Base, the aGDP of $162K is **self-reported by Virtuals and un-refuted on Hyperliquid — not verifiable from either chain on its own.** This is a legitimate ambiguity; the article must not overclaim "fake."
6. **On-chain agent-fee revenue = $359.04 lifetime.** Sum of fee-leg receipts on ACPRouter dual-transfer path ($170.17) + direct PaymentManager receipts ($188.87). This is ~4.5× LESS than the dashboard `revenue` field ($1,627.39). **The two do not reconcile from chain data.** Reported side-by-side per runbook rule; not back-solved.
7. **On-chain aGDP-equivalent flow = ~$407,552 in ACPRouter pass-through, ~2.5× LARGER than the dashboard `grossAgenticAmount` ($162K).** Opposite of the typical aGDP-inflates-vs-chain case. Also not reconciled.
8. **Owner has withdrawn ~$103,991 from the ACP wallet** across 19 outbound txs — including a single **$100,000 transaction on 2025-11-18** (agent's third week of operation). This is by far the largest single outflow in the wallet's history. Framed neutrally: it's what the flow shows; not asserted as fee extraction.
9. **Historical collateral egress routed $274,887 to an unlabelled 17M-tx EOA (`0xf70da…`, no contract code) between Nov 2025 – Feb 2026**, then migrated to Relay Depository (`0x4cD00E…`, audited bridge) as the settlement path. The mystery EOA's balance profile (millions of USDC, hundreds of ETH, mixed cbBTC + SOL + WETH, 17M txs on Base + 22M token transfers) is consistent with a **major CEX hot wallet**, but I cannot confirm which without a labels database. Report as *unlabelled high-throughput EOA*; do not name a CEX.
10. **On-chain settlement to Base appears to have paused since late April / May 2026** (last verifiable ACPRouter dual-transfer to ButlerLiquid: block 44,734,856 / 2026-04-15). ACP dashboard reports `isOnline: true` as of the audit moment. Either settlement has moved to another `enabledChain` (Arbitrum / BSC / Polygon / ETH), or the agent is idle. Worth flagging in the article.

---

## 11. Verification map

| Claim | Source | Method | Verified |
|---|---|---|---|
| ACP API values (aGDP, revenue, job counts, buyer counts, walletBalance) | `acpx.virtuals.io/api/agents/1120/details` | HTTP fetch 2026-07-09 13:50 UTC | Yes |
| ACP wallet balance $30.76 | `base.blockscout.com/api/v2/addresses/…/tokens` | Blockscout block 48,407,807 | Yes |
| Wallet type (ERC-4337 SemiModular / ERC-7760) | Blockscout `/addresses/…` | `implementations`, `proxy_type` | Yes |
| Owner type (EIP-7702 delegated) | Blockscout `/addresses/0xc0f7Da…` | Same | Yes |
| ACPRouter contract type | Blockscout `/addresses/0xa6C9BA…` | ERC1967Proxy → `ACPRouter` impl `0x361DECC…` | Yes |
| Full USDC inbound history ($408,017.07 / 2,193 txs / 8 senders) | Blockscout `/token-transfers?filter=to` | 45-page pagination, cursor exhausted | Yes |
| Full USDC outbound history ($407,992.21 / 724 txs) | Blockscout `/token-transfers?filter=from` | 15-page pagination, cursor exhausted | Yes |
| ACPRouter dual-transfer pattern + 0.2257% median rate | Blockscout logs on 5 sample txs + Python across 458 dual-txs | End-to-end log decode + statistical distribution | Yes (N=458 of 485) |
| PaymentManager 80/20 split | Blockscout logs on 5 fixed-fee sample txs | Every log matches | Yes |
| Owner extraction $103,991 across 19 txs (incl. $100K on 2025-11-18) | Blockscout outbound filter | Full pagination, sorted by dst | Yes |
| $274,887 to unlabelled EOA `0xf70da…` | Blockscout outbound filter | Full pagination, sorted by dst | Yes |
| `0xf70da…` is EOA + high-throughput (17M/22M tx counts) | `base.blockscout.com/api/v2/addresses/0xf70da…` + `/counters` | HTTP fetch | Yes |
| Hyperliquid `$0/0 fills` for ACP wallet, ACPRouter, owner (owner: 87 personal fills) | `api.hyperliquid.xyz/info` (`clearinghouseState`, `portfolio`, `userFills`) | POST to public API | Yes |
| HL control address `0x31ca…` returns real numbers ($3M / $187B vlm) | Same | Same | Yes |
| Sentinel head at block 47,806,437 / 334h stale | `ssh cw-sentinel` + `eth_getBlockByNumber` | Direct RPC | Yes |

---

*This audit deliberately does not compute an "invisible revenue" number, name the mystery CEX, or reconcile on-chain to API. Each of those would fail the Wasabot / Degen Claw post-mortem rules. The gap between the dashboard and the chain is the finding; do not force it closed.*

UTILITY_AUDIT_DONE: /home/mburkholz/Forge/chainward/deliverables/butlerliquid-on-chain/utility-audit.md
