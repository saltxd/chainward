# Wasabot On-Chain Decode -- Verified Findings

Investigation date: April 13, 2026
Verified by: @SaltCx (inline, not agent-generated)
Target: Wasabot (ACP Agent #1048)

---

## Methodology

All "sentinel-verified" claims trace to `eth_getTransactionReceipt` calls via `ssh cw-sentinel` to our Base L2 node at `http://localhost:8545`. Blockscout (`base.blockscout.com/api/v2`) was used for discovery and cross-checks only. The sentinel was at block 44,575,804 (2026-04-11 20:55 UTC) during this investigation, so all sentinel-verified txs are from blocks <= 44,575,804.

ACP API data pulled directly from `acpx.virtuals.io/api/agents/1048/details`.

---

## Proof 1: 80/20 ACP Coordination Fee Split

**Claim:** The Virtuals ACP PaymentManager (`0xEF4364Fe4487353dF46eb7c811D4FAc78b856c7F`, ERC1967Proxy → PaymentManager impl) splits every coordination payment: 20% to `0xE968...` (Virtuals platform), 80% to the agent's wallet.

**Evidence (sentinel-verified, 5 txs):**

| Tx Hash | Block | Total | To 0xE968... (20%) | To Agent (80%) | Agent Address |
|---|---|---|---|---|---|
| `0x4f42c3a5f302e97fbf4eb4b89c4b675e36e0d20860d2498d4563c63763323926` | 44,574,706 | $0.25 | $0.05 | $0.20 | `0x19013661b6...` |
| `0x245b65fa2052a7649a5e95954b933cb16f2e56f39f173f731edcb92e04a0a2e6` | 44,574,687 | $0.02 | $0.004 | $0.016 | `0x19013661b6...` |
| `0x2763a9c05393a56ca9926ae34061396f37fec533eca7a15e246ac31c9b68581a` | 44,574,668 | $0.02 | $0.004 | $0.016 | `0x19013661b6...` |
| `0x28dd79b1293aad77b017610f1060fa3bab4914c4189c1889dd008cc601075284` | 44,574,651 | $0.25 | $0.05 | $0.20 | `0xa23f0e3432...` |
| `0x667f1fb0ac074e7b3e16b04cec6bca2d32c38bfe7a58a9d9854c55ef77c269b5` | 44,574,626 | $0.15 | $0.03 | $0.12 | `0xa23f0e3432...` |

All 5 txs show exact 4:1 ratio (0% variance). Both 80% recipients are ERC-4337 smart accounts (SemiModularAccountBytecode), same architecture as Wasabot, but distinct addresses — neither is Wasabot's `0x5Dfc18...`. This proves `0xE968...` collects fees across multiple ACP agents, not Wasabot specifically.

---

## Proof 2: Perp Contract Architecture

**Claim:** Wasabi perp contract (`0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0`) acts as a pass-through for trade collateral on position opens. No fee extracted at the perp layer for opens.

**Evidence (sentinel-verified, 1 tx):**

| Tx Hash | Block | USDC In | USDC Out | Skim |
|---|---|---|---|---|
| `0x2c010232b747af334e2f54d10346cbf68cac8c49ee44658018db74645892b89d` | 44,574,123 | $60.00 (from `0xcc4188...`) | $60.00 (to `0x9bda49...`) | $0.00 |

Status 0x1 (success). 11 logs total. Exactly 2 USDC Transfer events. User `0xcc4188...` → PERP → destination `0x9bda49...` (pool/counterparty). Zero fee extracted.

**Cross-check (Blockscout):** The $322 architecture tx (`0x065de654e58efe8aaa097e421a3fc4d5b0d71bbcbbfb9d40e778a76d738c724c`, block 44,666,892) shows the same pattern on Blockscout but is outside sentinel's window and cannot be sentinel-verified as of this investigation. Architecture claim stands on the $60 sentinel-verified example.

---

## Proof 3: Close-Position Fee Extraction

**Claim:** On position closes, the Wasabi perp contract extracts a small fee (0.06%–0.10% of trade size) sent DIRECTLY to `0xE968...` (same Virtuals platform address). This is a separate mechanism from the PaymentManager 80/20 split.

**Evidence (sentinel-verified, 7 txs):**

| Tx Hash | Block | Trade Size | Fee to 0xE968... | Fee Rate |
|---|---|---|---|---|
| `0x3c667a16fe7cb3b011402efdef63a19f489a88c4fedaf66a2a962e1eb37d99d0` | 44,399,932 | $0.50 | $0.0003 | 0.06% |
| `0x6aea2a6a1cb6fdcec2b991e4a1b5eac09a8cdf31aad80029c4f0462d2a8ee0bb` | 44,444,707 | $6.00 | $0.006 | 0.10% |
| `0x3418618126cfc26a83611b79aca9bebd5c902a8a266717e030ad1ced53c0b365` | 44,446,282 | $10.00 | $0.01 | 0.10% |
| `0xdaeffa9fd0e63c115ab7ca1f2915b48b1f16abd30772673b8d715be52413c757` | 44,447,038 | $10.00 | $0.01 | 0.10% |
| `0x7709b51010383ada2e5f22458c054812813f59ba662af2294c06ca04681ee085` | 44,447,416 | $10.00 | $0.01 | 0.10% |
| `0xf8224d9726b8d7d2f930fac10738a9cf02c2c1cfbafce7f1dd6fa9b52ba3d802` | 44,499,631 | $15.00 | $0.015 | 0.10% |

Plus Blockscout-verified (outside sentinel window):

| Tx Hash | Block | Trade Size | Fee to 0xE968... | Fee Rate |
|---|---|---|---|---|
| `0xd5c55f1b4979c299c4e18567bc19c2a45e54be7c7e62a16187eb2366c00daefc` | 44,666,074 | $963.56 | $0.578 | 0.06% |

Fee rate range: **0.06%–0.10%** (possibly tier-based by trade size or time). All fees go to `0xE968...`, the same Virtuals platform address that collects 20% of ACP coordination fees. No evidence of a separate Wasabi-controlled fee treasury.

---

## Proof 4: PayableMemoExecuted on Both Opens AND Closes

**Claim:** Both position opens and position closes emit PayableMemoExecuted events at the PaymentManager. This means aGDP counts BOTH legs of a round-trip trade, inflating it by ~2x vs actual single-leg collateral.

**Evidence:**
- Open tx at block 44,574,123: PaymentManager event signature `0x5c6a329...` emitted with amount = $60 (matches the collateral). Sentinel-verified.
- All 5 close txs in the fee verification above: PaymentManager events detected in the receipt logs. Sentinel-verified.

This means a single $60 open + eventual close stamps aGDP approximately twice: once for the $60 open, once for whatever flows through on close.

---

## Proof 5: ACP Revenue Reconciliation

**Claim:** Wasabot's ACP revenue of $5,924.29 represents the agent's 80% share of coordination fees. The math reconciles when you use the correct job-type proportions.

**Source:** ACP API (`acpx.virtuals.io/api/agents/1048/details`)

**Job types and prices (from API):**

| Job Type | Price (gross) | Agent Keeps (80%) |
|---|---|---|
| open_position | $0.01 | $0.008 |
| close_position | $0.01 | $0.008 |
| set_tp_sl | $0.01 | $0.008 |
| deposit_funds | $0.01 | $0.008 |
| withdraw_funds | $0.01 | $0.008 |
| suggest_trade | $2.10 | $1.680 |
| refund | $0.01 | $0.008 |
| add_collateral | $0.01 | $0.008 |

**Reconciliation:**
- Total jobs: 15,307 (API field `totalJobCount`)
- Successful: 15,074 (API field `successfulJobCount`)
- Let S = suggest_trade count. Standard jobs = 15,307 - S.
- Revenue = S × $1.68 + (15,307 - S) × $0.008 = $5,924.29
- Solving: S ≈ 3,470 suggest_trade jobs + ~11,837 standard jobs
- Check: 3,470 × $1.68 + 11,837 × $0.008 = $5,829.60 + $94.70 = $5,924.30 ✓

---

## What Could Not Be Determined

1. **aGDP composition.** Average aGDP per job = $81.6M / 15,307 = $5,333. But recent observed trades through the perp contract are $0.50–$60. Early perp activity (blocks 41M–44M) was also small ($0.13–$6). The $5,333 average implies either: (a) massive early trades outside the observable window, (b) aGDP includes leveraged notional values rather than collateral only, or (c) aGDP calculation includes components not visible in PayableMemoExecuted events. Could not resolve with available data.

2. **Close-fee rate tiers.** The 0.06% rate appeared on the smallest ($0.50) and largest ($963.56) trades, while 0.10% appeared on mid-range ($6–$15). This could be size-tiered, time-tiered, asset-tiered, or position-type-tiered. Insufficient sample to determine the rule.

3. **Wash trading.** The Wasabi perp contract routes between ACP agent wallets (Axelrod `0x999a1b60...` appeared as a recipient in one close tx). This could indicate legitimate cross-agent trading or circular flows. The full 15K+ job history was not inspectable due to Blockscout rate limits and sentinel pruning window. Upper bound estimate: inconclusive.

4. **Where Wasabi Protocol itself earns revenue.** All observed fees from the perp contract go to `0xE968...` (Virtuals platform). No on-chain evidence of a separate Wasabi-controlled fee address or treasury. Wasabi may earn through: vault management fees (not investigated), token economics ($BOT), or off-chain mechanisms. Could not determine.

---

## Wallet Registry

| Role | Address | Type | Status |
|---|---|---|---|
| ACP wallet | `0x5Dfc180212204Fff869d41FAA9f1b430D2036f5D` | ERC-4337 | Active, $53.60 USDC |
| Owner/signer | `0x6d4f100406774daddefd3ea486e44c2962030f24` | EOA | ~$0.002 ETH |
| Perp contract | `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0` | ERC1967 Proxy (21 upgrades) | 655,620 txs, 2.1M transfers |
| Bundler | `0x718f3b1099234501875423D780A7a30104503EAC` | EOA | ERC-4337 Bundler |
| Paymaster | `0x2cc0c7981D846b9F2a16276556f6e8cb52BfB633` | ERC1967 Proxy | Active |
| PaymentManager | `0xEF4364Fe4487353dF46eb7c811D4FAc78b856c7F` | ERC1967 Proxy → PaymentManager | 6.4M transfers, all-agent |
| Virtuals platform fee | `0xE9683559A1177A83825A42357a94F61b26cd64C1` | EOA | Receives 20% of all ACP fees + per-trade close fees |
| $BOT token | `0xC2427Bf51d99b6ED0dA0Da103bC51235638eE868` | ERC-20 | ~$0.0024, 4,449 holders, 92.69% top-10 concentration |
| Sentient wallet | `0x18362A8e1Fd9Cbe40908B5Eb45f52B08e957E829` | Contract | Dormant |
| TBA | `0xceaa3DB845Eb0CfEEc2e4a0DdF489877b1f85Dd7` | Contract | Dormant |
