---
title: "Private Agent Payments Are Live, and the Pool Has One Paying User"
subtitle: "Two weeks in, px402's pool on Base has two funded reserves, one of them PRXVT's own $1 test. Privacy needs a crowd."
plain: "px402 lets an AI agent pay for an online service without the payment showing which wallet paid: a PRXVT relay wallet pays the seller for it. That only hides a wallet among the others using px402, and on Oct 19 one wallet besides PRXVT's own test was using it, so the privacy is real in design but thin in practice."
date: "2026-10-19"
slug: "px402-private-payments"
seoTitle: "px402 v2 on Base: How Private Are PRXVT's x402 Payments? Usage Check, Oct 2026"
---

# Private Agent Payments Are Live, and the Pool Has One Paying User

x402 is a way for one program to pay another a few cents in USDC per request. A facilitator is the service that carries each payment to the chain. Every x402 payment on Base names the wallet that paid. px402 v2, built by PRXVT, removes that: the agent pays through a PRXVT relay wallet, and the seller never sees the agent's address.

On Oct 19 at 12:05 UTC, Virtuals posted "Private agent payments are live on Virtuals Protocol", quoting PRXVT's Oct 6 launch post ([post](https://x.com/virtuals_io/status/2112153249017143314), 46,378 views when we read it on Oct 20 at 00:23 UTC). We read the px402 contract to see how it is being used.

Short version, as of Base block 52,833,048 (Oct 20, 00:17:23 UTC):

- **The design is careful.** PRXVT's issuer signs coins without seeing them, so it cannot recognize them when they are spent. The contract has no owner and no admin withdrawal, its source is verified, its signing keys are committed on chain, and PRXVT's own guide warns that timing can link a payment to a withdrawal.
- **Two reserves have ever been funded.** A reserve is one agent's balance inside the contract. One of the two is PRXVT's own $1 launch-day test. Together they have deposited $11.00.
- **691 payments, $0.82, to 43 sellers in 14 days**, every one $0.001 or $0.002.
- **The announcement did not add a user.** From the Virtuals post to our snapshot: 57 payments, one top-up by a reserve that already existed, no new reserve.
- **With one active user, "private" hides little.** The chain cannot say which reserve paid a given payment; that is the point of the design. It can say there are two candidates, and one is a $1 test that has not deposited or withdrawn since Oct 5. That is a fact about adoption, not a flaw in the cryptography.
- **For anyone screening payments:** the payer you see on a px402 payment is one of two PRXVT relayer wallets. Screening the payer screens the relay.

---

## How px402 works

As the contract and PRXVT's SDK implement it:

1. **Fund.** The agent deposits USDC into its own reserve in the `PX402Reserve` contract. The SDK deposits in whole "floats" ($5 by default), so an observer "learns your float, not your price".
2. **Withdraw coins.** The agent withdraws from its reserve and PRXVT's issuer signs coins for it without seeing them (blind signatures). The withdrawal is public and names the reserve.
3. **Pay.** When a seller asks for payment, a PRXVT relayer signs an ordinary USDC transfer from its own balance for exactly the price, and the seller's usual facilitator settles it. The agent's address is not in that transaction.
4. **Reimburse.** A day later the relayer is repaid from the reserve, price plus fee.

The protocol's wallets, all PRXVT's:

| Role | Address | Source |
|---|---|---|
| Reserve contract | [0xdd31c57E…119f](https://basescan.org/address/0xdd31c57E8F7CAC78090a516292f0C9Dea6c6119f#code) | Deployed Oct 5, 20:29:55 UTC, block 52,221,424 ([tx](https://basescan.org/tx/0xf48758770e9633cda7ca261ef59c41aecdad0023c8164b9b95e8f1175e8fdeaf)); source verified on Basescan, exact match |
| Deployer | [0xa116959F…8e9F](https://basescan.org/address/0xa116959Ffe4f64B82e294eF2209B34423C078e9F) | Sent the deploy; funded both relayers with $200 each |
| Issuer | [0xb1025af1…7ab8](https://basescan.org/address/0xb1025af12f16dce40b27057d22d0518674857ab8) | `issuer()` on the contract |
| Registry | [0x3a647497…3d1e](https://basescan.org/address/0x3a647497dc0d0806991ada9752cafeee34553d1e) | `registry()` on the contract |
| Relayer A | [0x6f890cc6…2b8e](https://basescan.org/address/0x6f890cc63aa57da9695528c9f5e3434897b32b8e) | Registered at deploy; $100 bond ([tx](https://basescan.org/tx/0x6e3e7840ba3b991072eb09482513b17e51591a8726db63b4309452c0e89cb303)) |
| Relayer B | [0x47e5499c…a0b4](https://basescan.org/address/0x47e5499c44ecf8c78da82b9b64183df1e301a0b4) | Registered with a $100 bond ([tx](https://basescan.org/tx/0x941204003dae596af0b78ac36d33fb8b9bd8bbc9a565df11bbaa00d5ecea384e)) |

`relayerCount()` is 2 at the snapshot block.

**What the design gets right.** Funds stay under the agent's key: the verified source has no owner, no pause and no admin withdrawal, and `reclaimBalance` lets a reserve take back unspent USDC with its own signature. The issuer's keys were committed on chain eight minutes after deploy ([tx](https://basescan.org/tx/0x4f4ef46861ce93cc42a9352921130a85982561d2b72b64061f3ab69ce15a04d5)), and the SDK refuses any key the contract did not commit, which makes it hard for the issuer to give one wallet a key that marks its coins. And the docs are candid: the SDK guide has a table of what each party can see, including what "one operator running issuer, registry and facilitator, logging network addresses" would learn.

## What the seller sees

PRXVT's launch-day test payment shows the shape ([tx](https://basescan.org/tx/0xd8f4212c2d13f77d29f7ce791182df8f765d20cefa4440dc99c88f00df1e4468), block 52,223,235, Oct 5 21:30:17 UTC). A Coinbase facilitator wallet sends the transaction, USDC records relayer A as the payer who signed, and $0.001 moves from relayer A to the seller.

All 691 payments have that shape. Coinbase's facilitator settled 687 of them, PayAI 3 and Dexter 1. None was a native px402 settlement, which PRXVT's own facilitator would send from a relayer: every payment so far used px402's bridge into a seller's ordinary x402 checkout.

## Two weeks of use

| As of block 52,833,048 | Value |
|---|---|
| Reserves ever funded | 2 (one is PRXVT's launch test) |
| Deposits | 3, $11.00, from 2 funding wallets |
| Withdrawals | 12, $8.37 |
| Payments to sellers | 691, $0.820 (562 at $0.001, 129 at $0.002) |
| Sellers paid | 43 |
| Relayer reimbursements | 576, $1.260 |
| Relayer bonds | $200.00 |
| USDC in the contract | $209.74, of which $200 is the relayers' bonds |

| Day (UTC) | Payments | Paid to sellers | Sellers paid |
|---|---:|---:|---:|
| Oct 5 | 4 | $0.004 | 1 |
| Oct 6 to 14 | 0 | $0 | 0 |
| Oct 15 | 157 | $0.189 | 34 |
| Oct 16 | 192 | $0.230 | 25 |
| Oct 17 | 111 | $0.135 | 23 |
| Oct 18 | 112 | $0.126 | 25 |
| Oct 19 | 115 | $0.136 | 22 |
| **Total** | **691** | **$0.820** | **43** |

**Who is paying.** One reserve is PRXVT's own test: its funding wallet received 1.1 USDC and 0.001 ETH from PRXVT's deployer at 21:27 UTC on Oct 5, deposited $1.00 a minute later, and the reserve has not deposited or withdrawn since. The other reserve's funding did not come from PRXVT's wallets, and nothing we read ties it to Virtuals. Since Oct 15 the payments have come about every seven minutes (median), spread over 42 sellers. Whether that is a PRXVT demo, an integration test or an outside developer is not visible on chain.

We are not publishing that reserve's address or its funder's. Both can be read from the contract; we see no reason to point at them.

## What "private" means with one user

A privacy pool hides you in a crowd. Someone looking at a payment knows it was paid by one of the reserves that held coins at the time. The bigger that set, the less a payment says about who made it. Here is the set, measured on all 691 payments:

| Measure | Result |
|---|---|
| Reserves that had withdrawn coins before the payment | 2, for 687 payments; 1, for the 4 on launch day |
| Reserves that withdrew in the 24 hours before the payment | none for 484 payments; 1 for 207; never 2 |
| Time from the latest withdrawal by any reserve to the payment | median 34 hours; 39 payments within an hour |
| Time from each deposit to that reserve's first withdrawal | 2 to 20 seconds, all three deposits |

The SDK does what PRXVT's guide advises. It keeps a buffer of coins, so most payments spend coins withdrawn more than a day earlier, which is what defeats timing analysis in a busy pool. The guide puts the risk plainly: "a payment made soon after your own withdrawal can be matched to it by timing when few other wallets withdraw in between." The FAQ's claim, "No address links a payment to the agent's deposit", holds on chain. What links them today is a count, and the count is two, one of them a dormant $1 test.

One number shows the second reserve is the one paying. The issuer publishes the total value of coins spent about every 12 hours. By Oct 19 23:08 UTC it was $1.688 ([tx](https://basescan.org/tx/0xe17bdf42f57d7050210a3ea9b7b30a98ad263f7e33af40436fb5b5f30ddef847)). PRXVT's test reserve only ever withdrew $1.00, so at least $0.68 of the coins spent came from the other reserve.

That spend total and the relayers' one `PayoutRecorded` event per payment (691 events, 691 payments) also mean the pool's total volume is public by design, even though who paid is not.

With a few thousand reserves withdrawing every day, none of this counting would work, and the timing advice in the docs would be what matters. The design is built for that case; the pool is not there yet.

## What privacy costs at a tenth of a cent

The 576 reimbursements so far match the first 576 payments one for one at the price plus $0.001: 468 payments of $0.001 against 468 reimbursements of $0.002, and 108 payments of $0.002 against 108 reimbursements of $0.003. PRXVT's facilitator lists its fee as rounded up to the smallest coin, $0.001. For those 576 payments, sellers received $0.684 and the relayers were repaid $1.260. On a $0.001 call, privacy at least doubles the cost. The rounding matters less as prices rise.

## For anyone screening payments

**The payer you see is the relay.** A seller paid through px402 sees relayer A or relayer B as the payer. Both got their first USDC and ETH from PRXVT's deployer on Oct 5. A screen on them describes PRXVT's relay, not the agent behind the payment, whoever that is.

**The contract takes deposits from anyone.** `deposit(reserveAddr, amount)` has no allowlist, blocklist, owner or pause. Screening, per PRXVT's SDK guide, happens off chain: its error table lists `RESERVE_SCREENED` ("the issuer will not issue coins to your reserve") and `PAYEE_SCREENED` (the facilitator will not pay that seller), and says the service fails closed when "a screening source could not be checked". Which lists those checks use is not documented, and none of it shows on chain.

**What the chain does show is the pool.** How many reserves are funded, from which wallets, and how much USDC is inside. As of the snapshot, none of the pool's four user-side addresses (two reserves, two funders) and none of PRXVT's six protocol addresses is on the OFAC SDN snapshot ChainWard screens against (124 EVM addresses, fetched Oct 11).

ChainWard's checks now recognize the reserve and both relayers (live since Oct 19): the counterparty check answers **Unknown: Payer hidden** and the wallet check answers Review, both with the reason "Payments from this address come through the px402 privacy pool: the real payer is hidden and can't be screened." A newer relayer or another privacy pool is not recognized yet.

## Limits

- **Which reserve paid a given payment is not on chain.** That is the design. "One paying user" rests on there being two funded reserves, one of them PRXVT's test.
- **Who controls the active reserve is not visible**, and we chose not to publish its address or its funder's.
- **Off-chain behavior is from PRXVT's docs and SDK, not tested.** That covers screening, issuance caps and what the hosted services log.
- **A snapshot.** One new reserve changes these counts. Numbers are as of block 52,833,048.
- **One reimbursement is missing from Blockscout.** Its address lists for the contract lack a $0.002 reimbursement to relayer B ([tx](https://basescan.org/tx/0xa4416674f9cbd4b8986b315be5ef3a08a4c08285d35b13dce59f5d22c005e329), block 52,809,468). The totals here use the contract's own `redeemed()` and balances, which include it.

## Method

Every log of the reserve contract and every USDC transfer of the contract and both relayers were read from Blockscout's v2 API, from the deploy block to block 52,833,048. In an earlier pass the same day, history up to block 52,794,207 was read from ChainWard's own Base node and matched Blockscout exactly. Contract state (`totalBonded`, `redeemed`, `finalizedDebits`, `relayerCount`, `issuer`, `registry`, USDC balances) was read with `eth_call` at block 52,833,048 on three public RPCs, which agreed. The event history, plus the one reimbursement Blockscout lacks, reconciles exactly to the contract's USDC balance and to both relayers' balances. Settling facilitators were read per transaction and matched against x402scan's facilitator list. Quotes are from [docs.prxvt.com](https://docs.prxvt.com/) and the guide shipped with the px402 2.0.2 SDK on npm.

> Disclosure: ChainWard sells x402 payer screening (a wallet check and a counterparty check), and px402 is built so that a seller cannot see, and so cannot screen, the real payer. We did not contact PRXVT or Virtuals before publishing.
