---
title: "The #2 x402 Seller on Base Funded Its Own Buyers"
subtitle: "One week of x402 on Base (Sep 15–21): $128,977 settled. At least $56,268 of it looped back through the seller or a closed ring, and $30,000 more was a round trip. The #2 seller had 715 buyers; at least 675 were funded from its own revenue."
date: "2026-09-27"
slug: "x402-on-base"
seoTitle: "x402 on Base, One Week On-Chain: Seller-Funded Buyers, Cashback Rings and Round Trips (Sep 15–21)"
---

# The #2 x402 Seller on Base Funded Its Own Buyers

x402 is the HTTP-402 payment standard that lets an agent pay for an API call in USDC. Its numbers are everywhere: x402.org shows **75.41M transactions, $24.24M volume, 94.06K buyers and 22K sellers** under "Last 30 Days", and x402 Arena repeats them.

We measured one week of x402 on Base from ChainWard's own node: every settlement a known x402 facilitator submitted, who paid, who got paid, and where the buyers' USDC came from.

Short version: **Base settled $128,977 of x402 payments from Sep 15 to 21, and at least $56,268 of it (43.6%) was money looping back**: buyers funded by the seller they paid, a seller whose revenue funds its own buyers, and six wallets paying only each other while earning token cashback. **Another $30,000 (23.3%) was a round trip**: two payments whose USDC reached, within minutes, the account that had funded the payer. That account may be one service used by both sides, so we count it separately. The part that looks like independent buying is about $31,000 at most, and most of it was not checked.

---

## The week in numbers

Window: Base blocks 51,320,527 to 51,622,926, **2026-09-15 00:00 to 09-21 23:59 UTC**. A settlement counts as x402 when a transaction submitted by an address on x402scan's facilitator list consumes a USDC EIP-3009 authorization, directly or through a facilitator proxy.

| | |
|---|---|
| x402 settlements | **407,959** |
| USDC volume | **$128,977.37** |
| Buyer addresses / payTo addresses | 7,660 / 4,920 |
| Median / mean payment | $0.008 / $0.316 |
| Buyers who paid more than one seller | 1,016 (13.3%) |
| Coinbase facilitator share of settlements | 92.2% |

Thirty payments over $100 carry 30.2% of the week's volume. The typical x402 payment on Base is under a cent.

**The headline number doesn't move.** Scaled to 30 days, Base's week is about 1.75M settlements and $553K, roughly 2.3% of x402.org's panel, which doesn't say which chains or period it covers. The panel is fixed page text: the same **75.41M / $24.24M / 94.06K** appears in the Internet Archive's capture of x402.org from **2026-04-17** and on the live page today. It is not a rolling 30-day window.

---

## Where the week's volume came from

We traced where buyers got their USDC (in-window transfers into the top 40 buyers of 21 sellers, outflows from 28 sellers, plus longer histories for the hubs named below) and sorted the volume into tiers. Each settlement lands in one tier.

| What the chain shows | Settlements | Volume | Share |
|---|---:|---:|---:|
| **Money loops back:** buyers funded by the seller, by wallets funded only by the seller, or a closed ring | 47,358 | **$56,268.13** | **43.6%** |
| **Round trip** through one high-throughput account (possibly one shared service) | 2 | $30,000.00 | 23.3% |
| Buyer = seller, or a facilitator-listed address as buyer or seller | 1,753 | $859.51 | 0.7% |
| Most buyers funded by one drip wallet or a shared hub (ambiguous) | 116,874 | $10,631.75 | 8.2% |
| Sellers with a single buyer (not checked) | 11,749 | $9,928.90 | 7.7% |
| No loop found (mostly not checked) | 230,223 | $21,289.09 | 16.5% |

The loops break down as: the Meridian ring $29,074.32, the #2 seller $21,316.74, the botpay tree $2,902.70, and three sellers that paid their buyers back $2,974.37. The last row is an upper bound on independent buying, not a measurement of it, and half of it is one seller.

---

## The #2 seller funds its own buyers

The payTo that x402scan lists for `api.clusterprotocol.ai`, [`0x68396bd3…`](https://base.blockscout.com/address/0x68396bd35874695ad86cd29410bd80a550991a2b), looked like the most organic large seller of the week: **27,727 settlements, $21,984.27, 715 buyers**, and no buyer above about 1% of its volume.

Its only USDC outflows in the window were 151 transfers totalling **$21,936.11** to one address, [`0x0a4135f9…`](https://base.blockscout.com/address/0x0a4135f9b7af754033bb7af6dc581ec0dc6e15d5). Since Aug 29, every inflow to that address above a cent came from the seller. It funds three distributor wallets, and those send $8–$16 to other wallets. **At least 675 of the seller's 715 buyers were funded by those three distributors, and they account for at least 97.0% of its volume.**

One full cycle, four hops:

| Hop | Transfer | Tx |
|---|---|---|
| Seller → hub | `0x68396bd3` → `0x0a4135f9`, $40.03 | [`0x9a7c172a…`](https://base.blockscout.com/tx/0x9a7c172a908c0f6bb89cfa89c6dbd7a8f83de4162473810aba440b291fad0d13) |
| Hub → distributor | `0x0a4135f9` → [`0x82b551e8`](https://base.blockscout.com/address/0x82b551e820efc3503a3a27fc450e07e328daf91c), $197.79 | [`0xa88238e8…`](https://base.blockscout.com/tx/0xa88238e8ea666cdae41466c59c30b82cfc8ac73652b7e8f651c15e88c710cc01) |
| Distributor → buyer | `0x82b551e8` → [`0x6eb0e84e`](https://base.blockscout.com/address/0x6eb0e84ed094b41659cf8e2e95dbc9554b8d3034), $10.00 | [`0xcd4dbfe1…`](https://base.blockscout.com/tx/0xcd4dbfe1ea06e4932e9fe6d1b277a0cf976e2d5c37e1a110df0ef2fa42eb6b3a) |
| Buyer → seller (x402, Coinbase facilitator) | `0x6eb0e84e` → `0x68396bd3`, $1.00 | [`0xe6a4d0b8…`](https://base.blockscout.com/tx/0xe6a4d0b8c27c17e88a0b2d30ccf8e0d5f12375e915fa5ac662382c9912050158) |

When a seller's revenue funds its buyers, its buyer count doesn't measure outside demand.

---

## Six wallets, one ring, MRDN cashback

Six wallets paid only each other through the Meridian facilitator, earning MRDN cashback: **771 settlements, $29,074.32, 22.5% of the week's volume**, and 89% of everything Meridian settled. Every ordered pair of the six appears 17 to 33 times, and each wallet paid out and received back within about $160.

Meridian's proxy contract pays cashback in its own token. In [`0x36b70906…`](https://base.blockscout.com/tx/0x36b70906d04d3d984a97b3e47e49440a5b0b618f756a655e6368680d01164230), [`0x475436ef…`](https://base.blockscout.com/address/0x475436ef0a97286081d0fc2a762ad6296949327b) pays 42.11 USDC; the proxy keeps 1%, forwards 41.68 USDC to [`0x1cec447d…`](https://base.blockscout.com/address/0x1cec447da1915f018bd74006ff6d695468b68dd4), and sends the payer **105.14 MRDN**. The contract's verified source pays cashback only when `from != recipient`, so paying yourself earns nothing and paying a second wallet does. At the week's on-chain prices, a $1 hop cost $0.01 in fee and returned about $0.019 in MRDN, with the facilitator paying the gas.

In the window the six wallets sold MRDN for **$585.92** and paid **$290.75** in fees.

---

## $30,000 that went back to its source

The largest single "purchase" of the week was two payments through the Fluxa facilitator: **$10,000** ([`0xa60fb201…`](https://base.blockscout.com/tx/0xa60fb201b4144456684f8eee1f69a17d8235dd15697ca217a40514f79c9c41c7)) and **$20,000** ([`0xe289d41e…`](https://base.blockscout.com/tx/0xe289d41efb500ef2cc8b51aa0378a07e454a70000ef4bb70c053a30de446cd1f)) from [`0x15eae079…`](https://base.blockscout.com/address/0x15eae0792636b3dca7b5002f673b66d27c9d7aff) to [`0xfa02300b…`](https://base.blockscout.com/address/0xfa02300b1a598daba1b27b2bf79f9775355dac82). Together they are **23.3% of Base's x402 volume that week.**

88 and 105 blocks later (about three minutes each), the recipient sent both amounts on to [`0xee7ae85f…`](https://base.blockscout.com/address/0xee7ae85f2fe2239e27d9c1e23fffe168d63b4055): [`0x2a77866b…`](https://base.blockscout.com/tx/0x2a77866b6faa77545fb409ab1c94b3772b421f3d1174b691a4bee45905cd0beb), [`0x32b9ce93…`](https://base.blockscout.com/tx/0x32b9ce9331823fa5d0d092f9e6f90b1ef194b1c90c1f540fa24d3ab21b4350b6). Earlier in the same week, `0xee7ae85f` had funded the payer: $50,000, $20,000 and $10,000. At `0xee7ae85f`, the USDC ended where it started. The same $30,000 pattern appears on Aug 13, 18 and 21, and $50,000 on Sep 24.

`0xee7ae85f` is a high-throughput smart account that moves millions of USDC across hundreds of counterparties, and it also funded a few buyers of other sellers that week, which is how a shared service would behave. `0xfa02300b` forwards everything it receives to it within minutes, as a deposit address does. The chain can't show whether this is one party or two customers of the same service, which is why it sits in its own row above.

---

## Smaller loops

- **botpay.** The two payTo addresses x402scan lists for `botpay.network` took **$733.80 from 344 buyers**. Walking the payments backward, every one of those buyers traces to one root wallet, [`0x8736ae11…`](https://base.blockscout.com/address/0x8736ae11c1f3c6eba0a023baa455b2372fca2aab). The root is funded by the seller: [`0xcc1984e7…`](https://base.blockscout.com/address/0xcc1984e79726e7a0ae2b9df2ac9e79fb4983930e) sent it **$718.30** in the window, and the root paid **$718.30** back down the tree in x402 settlements. Counting every settlement inside the tree, $2,902.70 moved through it.
- **Ping-pong.** [`0x17cd53c0…`](https://base.blockscout.com/address/0x17cd53c04d707ef0dd615ef56c633f02915a7905) received 5,874 payments of $0.05 (plus one of $0.001) from 57 buyers and sent 5,860 transfers of $0.05 to 51 of them. In the pairs we sampled, the seller's transfer came 3 to 30 blocks before the buyer's payment. Example: seller → buyer ([`0x8d1e2ce4…`](https://base.blockscout.com/tx/0x8d1e2ce4af9cc0fd872c1f4de2cc0a393e63545a1471db29e713d113b3d0ef3c), block 51,326,519), then buyer → seller six blocks later ([`0x29f850e6…`](https://base.blockscout.com/tx/0x29f850e6da67d32554aed0d75de51652cbcf26aa81ae659be965da528c208053)).
- **Paying buyers back.** `0xed9fcd0d…` took $2,656.43 from 12 buyers and sent $2,415.15 (91%) back to 11 of them, in alternating, stepping amounts. That fits a game or betting loop. It may be the product working as designed, but it is not net buying.

Not a loop, but worth knowing: Polymer's settler [`0x66c40946…`](https://base.blockscout.com/address/0x66c40946b0dffd04be467e18309857307ecd37cb) paid itself $0.10 about every nine minutes, 1,332 settlements where sender, buyer and seller are the same address ([example](https://base.blockscout.com/tx/0x171edde4606c9d517282abf105208bcadf37f67b8e2a0ee7e41a92b8d7da42e4)). Those sit in the buyer = seller row.

---

## Seeded buyers: neither a loop nor independent

The top seller by count, the payTo x402scan lists for `ax1.vc` ([`0x7284d41b…`](https://base.blockscout.com/address/0x7284d41b5b852f2bd4c99bdf95043d84452d299c)), took **108,865 payments of exactly $0.02 from 775 buyers**, none of whom paid any other seller. At least 378 of those buyers were funded by one wallet, [`0x3dd6f35c…`](https://base.blockscout.com/address/0x3dd6f35c88f3ae22feccbde524caf9874aab1af7), which has sent **5,499 transfers of exactly $0.10**, five calls' worth, since at least Sep 18. We found no path from the seller back to that wallet, and the seller has never sent a token. This reads like an app seeding embedded wallets for its users; the chain can't show whether anyone paid for those credits off-chain. We counted it as ambiguous, not as a loop.

---

## What independent buying looks like

Some sellers show the opposite pattern:

- **clashofcoins** ([`0x93862e5b…`](https://base.blockscout.com/address/0x93862e5b2b1fa10a01772e7e9ca7cdc7deb5ca25)): $10,969.79 from 132 buyers, whose top 40 had **112 different funders**: bridges, DEX routers and others.
- **blockrun.ai** ([`0xe9030014…`](https://base.blockscout.com/address/0xe9030014f5dae217d0a152f02a043567b16c1abf)): 118 buyers paying **2,745 different amounts**, the shape of metered per-token pricing; 43% of its buyers also pay other sellers.
- **stableenrich.dev**: 121 buyers, 63% of whom also pay other services.
- **claw402.ai** ([`0xa9dd7cc9…`](https://base.blockscout.com/address/0xa9dd7cc9cbf0e05551332209289f04be36bc2315)): 94,386 payments of about $0.002 from 44 diversely funded buyers at machine cadence. Heavy automated use, not a loop.

Many funders, buyers who also pay other services, amounts that move with usage. That is what a customer base looks like on-chain.

---

## x402 buyers draw look-alike dust

Among the 602 buyers we traced (the top 40 by volume of 21 sellers, plus the ring), **84 (14%) received sub-cent transfers from addresses that copy the first four and last three characters of a seller they had paid.** Separately, 797 zero-value transfers appeared to come from 28 of the sellers themselves. An agent that picks a payTo from its own recent transfer history can be steered to a look-alike.

---

## How to check an x402 seller before you trust its numbers

1. **Don't read volume, settlement count or buyer count on their own.** This week the largest seller by volume was a $30,000 round trip, and the largest by count was a seller whose buyers one wallet mostly seeded.
2. **Look at where the buyers' USDC comes from.** If the seller, its cash-out address, or one common wallet funds most of its buyers, the buyer count is not outside demand.
3. **Check whether buyers pay anyone else.** Only 13.3% of Base x402 buyers paid more than one seller in the week.
4. **Check whether money flows back.** A seller that sends USDC back to its buyers is not being paid on net.
5. **Pin payTo addresses** from the seller's 402 response or a registry, never from transfer history.

ChainWard's free check reads an address's on-chain behavior, and reports that flag observed behavior are attested on Base so an agent can read them before it pays: [chainward.ai](https://chainward.ai).

---

## Open questions

**Who runs the clusterprotocol hub and distributors.** The chain links the seller, the hub and the buyers; it doesn't show who controls them, or whether x402scan's origin label maps to the same operator.

**Whether `0xee7ae85f` is one party or a custodial service** used by both sides of the $30,000 round trip.

**Whether the loops continue.** Our node was about five days behind the chain tip when we ran this, so the window ends Sep 21. Blockscout shows at least one ring wallet still active on Sep 27.

**Where x402.org's 75.41M comes from.** x402scan's own cross-chain count for roughly the last 30 days is 16.9M transactions and $959K, and about 85% of those transactions go to one Solana seller with 72 buyers. We checked nothing off Base.

---

*Verified September 27, 2026. Settlement counts, amounts and in-window flows were read from ChainWard's own Base node for blocks 51,320,527–51,622,926, a range the node had fully synced (it was about 5 days behind the tip at the time); longer funding histories and current balances come from Blockscout. Facilitator addresses come from x402scan's public list (commit f205fbe); seller names are x402scan's origin labels, not ownership claims. Excluded: settlements by facilitators not on that list and Permit2-style settlements. Unlisted senders moved $10.07M of USDC authorizations that week, but the part shaped like x402 payments is at most about $5.7K. Each payment's buyer and payTo come from the authorization and the USDC transfer that follows it in the same transaction, with one hop of proxy forwarding. Funding was traced for the top 40 buyers of 21 sellers and the outflows of 28 sellers, so most small sellers were not checked, and history reads stop at page limits: "at least 675" and "at least 378" are floors. A common funder can be a legitimate faucet, exchange or custodial service. Every transaction linked above was re-read from a public Base RPC before publishing. Counts are addresses, not people, and the chain shows where money went, not why. Nothing here is a verdict on any project.*

> Disclosure: ChainWard sells an x402 endpoint (a $0.05 counterparty check through the PayAI facilitator) and is listed on x402 Arena and x402scan. Its only settled payment so far is our own test on Sep 27, which is a self-payment like the ones counted above. It falls outside this window, and no ChainWard address appears in the data.
