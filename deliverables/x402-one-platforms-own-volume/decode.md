---
title: "The x402 Growth Curve Is One Platform's Own Volume"
subtitle: "Base x402 volume is up 22x since Oct 19. We ran DefiLlama's query against the blocks: 95% is one facilitator, which warned about this first."
plain: "The headline number for AI agent payments jumped 22 times in October. We checked the blockchain: almost all of it is one company's own wallets paying each other. That company published a warning that its totals are not real demand, archived a day and a half before the jump. The charts quoting the number carry none of it."
date: "2026-10-31"
slug: "x402-one-platforms-own-volume"
seoTitle: "x402 Volume on Base, October 2026: 95% of DefiLlama's Surge Is One Facilitator's Own Settlement, Disclosed Before It Happened"
---

# The x402 Growth Curve Is One Platform's Own Volume

DefiLlama's x402 adapter shows Base settlement volume doing something remarkable in the second half of October 2026. From Oct 11 to Oct 18 it sits between $6,830 and $13,569 a day. On Oct 19 it jumps to $34,584. By Oct 27 it reads **$533,397**.

Over Oct 19 to Oct 30, DefiLlama books **$2,479,685** of x402 volume on Base, which is 88.5% of everything it records across all chains. That curve is the number being quoted as proof that agent payments are taking off.

We reproduced DefiLlama's own query against Base blocks. **95.05% of it is one facilitator.** On the two biggest days, a **single wallet** paying a **single counterparty** is 99.17% and 98.72% of that facilitator's volume, and that wallet's money comes from the facilitator's own sales wallet and its own treasury.

Central City, the facilitator, publishes all of this. Its documentation says in plain words that its totals "are not a measure of independent customer demand". The index layer that resells the number does not carry that sentence, and that is what this piece is about.

## The short answer

- **One facilitator is the curve.** Central City's own published daily volume accounts for **$2,356,998.83** of DefiLlama's **$2,479,685** on Base over Oct 19 to Oct 30: **95.05% of Base**, **84.13% of all x402 volume on every chain** DefiLlama tracks.
- **Everything else on Base flatlined.** Strip Central City out and Base x402 went from **$8,143 a day** (Oct 11 to 18) to **$10,224 a day** (Oct 19 to 30). That is **1.26x**. On the same two windows the headline grew **22.09x**.
- **One wallet is most of Base's x402 volume.** `0x64e8ffb4…0cf82c13` paid **$2,036,581.25** through Central City between 2026-10-22 and 2026-10-30. That is **86.41%** of the facilitator's measured volume and **82.13% of DefiLlama's entire Base x402 figure for the window**. Every day of it is measured off blocks, not inferred. On 2026-10-24 it was **99.17%** of the day and on 2026-10-27, the $533,397 peak, **98.72%**. Both days every dollar went to one counterparty at an exactly 10.00% fee split.
- **One wallet is not the whole curve, and the date matters.** That wallet's first payment is on **2026-10-22**, three days after the curve breaks. 2026-10-19 to 21 is thousands of small wallets, which is the same shape at small scale that we document for 2026-10-20: ten busy buyers, one funding source each, each source a top seller the same day. The concentration is the story; one address is not the whole of it.
- **That wallet's money is Central City's.** Between fee router 3's deployment and the end of Oct 30 it received **$2,036,606.17** in 444 transfers from exactly **three** addresses: the payout address on Central City's own listings ($940,216.20), a conduit that gets 96% of its own inflow from that same payout address ($730,179.00), and Central City's treasury ($366,210.98). **In $2,036,606.17, out $2,036,581.25.** The loop closes to **$24.92**.
- **The conduit nets zero.** `0xb48a2519…64edb86a` took in **$876,811.37** and paid out **$876,811.37**. To the cent.
- **The same shape at small scale.** The ten busiest buyer wallets on 2026-10-20 each have **exactly one** funding source, and each of those is a top seller the same day. Those ten sellers took in **$30,806.21** and paid out **$30,806.21**, every wallet balancing to the cent.
- **The product is a built-in.** Central City's docs list `base-usdc-balance` and `address-checksum` among fixed service kinds a seller can offer, next to `base64` and `slugify`, at a seller-chosen price from $0.05 to $100. The same payout address lists the identical built-in at **$0.05** and at **$20.00**. Third parties on the same feed sell a Base balance read for **$0.001**.
- **It is not a token artefact.** The adapter has no token allowlist, which is a real weakness, but the surge is USDC. Non-USDC tokens passed its filter on 121 of 105,592 transactions and added no measurable dollars.

## How the number is built

DefiLlama's adapter is open source. The core of it is one Dune query:

```sql
select blockchain, contract_address, SUM(amount_raw)
from tokens.transfers t
where t.tx_from IN ( <123 facilitator addresses> )
  and t."from" != tx_from and t."from" != t."to"
  …
group by blockchain, contract_address
```

(elided: a chain filter, the time range, and a parallel Solana branch.)

That is the definition of "x402 volume". It takes a list of 123 relayer addresses, sums every ERC-20 transfer in any transaction those addresses sent, and prices whatever token comes out. No token allowlist, no function selector, no check that an x402 payment event was emitted.

So the metric answers a narrower question than its name: **how much value moved through transactions a known relayer broadcast.** A relayer looks identical whether it is clearing a tenth-of-a-cent API call or moving a treasury between two wallets its operator controls.

## The convergence

DefiLlama's Base series against Central City's own published daily volume. Both pulled by us, 2026-10-31 UTC.

| Day | DefiLlama Base | Central City (own API) | Residual | CC share |
|---|---|---|---|---|
| 2026-10-14 | $13,569 | $0.00 | $13,569 | 0.0% |
| 2026-10-15 | $9,499 | $16.71 | $9,482 | 0.2% |
| 2026-10-16 | $9,052 | $453.90 | $8,598 | 5.0% |
| 2026-10-17 | $8,854 | $1,515.68 | $7,338 | 17.1% |
| 2026-10-18 | $11,949 | $7,716.94 | $4,232 | 64.6% |
| **2026-10-19** | **$34,584** | $30,643.47 | $3,941 | **88.6%** |
| 2026-10-20 | $109,062 | $104,788.94 | $4,273 | 96.1% |
| 2026-10-21 | $89,870 | $79,752.48 | $10,118 | 88.7% |
| 2026-10-22 | $123,303 | $119,099.10 | $4,204 | 96.6% |
| 2026-10-23 | $157,401 | $146,509.63 | $10,891 | 93.1% |
| 2026-10-24 | $421,862 | $412,310.20 | $9,552 | 97.7% |
| 2026-10-25 | $318,879 | $308,152.91 | $10,726 | 96.6% |
| 2026-10-26 | $205,077 | $194,733.60 | $10,343 | 95.0% |
| **2026-10-27** | **$533,397** | $522,124.81 | $11,272 | **97.9%** |
| 2026-10-28 | $229,569 | $219,308.98 | $10,260 | 95.5% |
| 2026-10-29 | $130,965 | $105,536.00 | $25,429 | 80.6% |
| 2026-10-30 | $125,716 | $114,038.70 | $11,677 | 90.7% |

The residual never moves. It sits between $3,941 and $25,429 a day across the whole surge, which is the size of Base x402 before the surge began. Everything above that line is one facilitator.

The date lines up. Central City's third fee router was deployed on 2026-10-19 at block 52,804,453, by its own documentation. That is the day the curve breaks.

Over the same window Solana stayed inside its ordinary $4,563 to $29,843 band. Celo fell off a cliff for an unrelated reason: $11,378 on Oct 27, then $664, $643, $634. Nothing was growing except one address on one chain.

## Verifying it against the blocks

Published numbers agreeing with each other is not evidence. So we re-ran DefiLlama's query ourselves, from Base blocks, using its own 123-address list and its own two exclusions. `eth_getBlockReceipts` for every block of **2026-10-24**, blocks 53,005,327 to 53,048,526, **43,200 blocks, zero failures, 105,592 matching transactions**.

### Which facilitator

| Facilitator address | Transactions | USDC moved |
|---|---|---|
| `0xc8d6bac2…261a6cec` (Central City) | 26,238 | **$412,310.20** |
| `0xa32ccda9…de10d101` | 8,186 | $583.46 |
| `0x42dd5390…04634b00` | 3,674 | $130.87 |
| `0x67b9ce70…2fe662af` | 3,673 | $187.31 |
| `0xca5e87f8…7d79c70d` | 3,673 | $137.68 |
| `0x68a96f41…e7c07863` | 3,673 | $178.21 |
| `0x8f5cb67b…fb746e531` | 3,671 | $177.09 |
| `0x64cc42b1…ddbf1f0a` | 3,671 | $202.50 |
| **All USDC under DefiLlama's filter** | | **$422,469.10** |

Central City is **97.6%** of it. The rows above are ordered by transaction count, not by money, so read them as the busiest rather than the biggest: **33** of DefiLlama's 123 addresses were active on Base that day, and the other 32 moved **$10,158.86** between them. Over half of that is one facilitator the count ordering hides, Meridian (`0x3210d7b2…9029a584`), with 115 transactions and **$5,621.07**.

Our $412,310.20 matches Central City's published `volume_usdc` for that day **to the cent**. So does the count: 109,804 USDC transfer legs, divided by the two legs each payment generates, is **54,902**, exactly the `payments: 54902` their API reports.

### One wallet

The concentration inside that day is the finding.

**2026-10-24**, from our receipt scan:

| | Legs | Amount | Share of the day |
|---|---|---|---|
| `0x64e8ffb4…` to `0x524c827c…` (Central City's listing payout) | 33,528 | $368,004.60 | |
| `0x64e8ffb4…` to the treasury (the 10% fee leg) | 33,528 | $40,889.40 | |
| **One wallet, one counterparty** | **67,056** | **$408,894.00** | **99.17%** |
| Second-largest payer that day | | $5.86 | 0.00% |

**2026-10-27**, the $533,397 peak, measured through the archive:

| | Legs | Amount |
|---|---|---|
| `0x64e8ffb4…` to `0x524c827c…` | 17,606 | $463,896.00 |
| `0x64e8ffb4…` to the treasury | 17,606 | $51,544.00 |
| **Total** | **35,212** | **$515,440.00** |

That is **98.72%** of Central City's published $522,124.81 and **96.63%** of DefiLlama's entire Base x402 figure for the day. We checked it a second way, by counting fee legs arriving at the treasury across the same blocks: 61,975 legs totalling **$52,217.49**, against Central City's published `fees_usdc` of $52,212.481, which at the documented 10% rule implies $522,174.86 of volume.

### Which token

This is where we expected a problem and did not find one. The adapter prices any ERC-20 that passes its filter, so a facilitator moving its own token could manufacture volume. On 2026-10-24, non-USDC tokens appear on **121 of 105,592 transactions**:

| Token | Legs | Amount |
|---|---|---|
| USDC | 189,028 | $422,469.10 |
| MRDN (Meridian) | 115 | 10,563.7 |
| FARVERSE | 6 | 500,000 |
| three others | 4 | negligible |

DefiLlama reported $421,862 for Base that day against our $422,469.10 of USDC, so the non-USDC tokens contributed nothing in dollars. **The surge is USDC.** The missing token allowlist is a real latent weakness worth fixing, but it is not what happened here, and we are not going to pretend otherwise.

### Are they real payments

Yes. All 26,238 Central City transactions call fee router 3 at `0xe807a763…9d0a1403`, and every one emits `AuthorizationUsed(address,bytes32)`, topic `0x98de5035…`, the event USDC emits when an EIP-3009 gasless authorisation is spent. These are not plain transfers that happen to share a sender. They are genuine x402 settlements.

Which is the point. Everything here is real except the demand.

## Whose money is it

Central City publishes its addresses, and every one we found by scanning blind is named in its own documentation.

| Role | Address | In their docs | Measured at block 53,250,839 |
|---|---|---|---|
| Facilitator | `0xc8d6bac2…261a6cec` | yes | EOA, nonce **922,498**, USDC balance **$0.000011** |
| Fee router 3 | `0xe807a763…9d0a1403` | yes | 3,509 bytes of code |
| Treasury | `0xaf36084a…140c92aa9` | yes | EIP-7702 delegated, holds **$8,942.23** |

A relayer with 922,498 transactions and eleven millionths of a dollar is a wallet that pays gas and never touches the money. Their docs say so. Measured and claimed agree.

### The big buyer's three funders

We pulled every inbound USDC transfer to `0x64e8ffb4…` from fee router 3's deployment, block 52,804,453, to the last block of 2026-10-30, block 53,307,726. 444 transfers, zero errors. Its balance was $0.00 before the first of them, so this is its whole funding history over that period.

| Source | Amount | Transfers | Share | What it is |
|---|---|---|---|---|
| `0x524c827c…107578b1` | $940,216.20 | 148 | 46.2% | the payout address on Central City's own listings |
| `0xb48a2519…64edb86a` | $730,179.00 | 95 | 35.9% | a conduit, see below |
| `0xaf36084a…140c92aa9` | $366,210.98 | 201 | 18.0% | Central City's treasury, named in its docs |
| **Total** | **$2,036,606.17** | **444** | | **three addresses, no others** |

The third address is not named anywhere in Central City's documentation, so we traced it rather than labelling it. Over the same window it received **$876,811.37** and sent **$876,811.37**. Net retained: **$0.00**.

| `0xb48a2519…` | In | Out |
|---|---|---|
| `0x524c827c…` (the listing payout address) | **$843,511.35** (96.2%) | |
| Central City's treasury | $31,347.81 | $122,864.48 |
| `0x64e8ffb4…` (the big buyer) | | **$730,179.00** (83.3%) |
| others | $1,952.21 | $23,767.89 |
| **Total** | **$876,811.37** | **$876,811.37** |

So it is not an outside source of funds. It is a second hop in the same circle: it takes the first-party seller's proceeds and hands them to the buyer, with a side channel to and from the treasury. Counting both routes, **82.02% of the big buyer's $2,036,606.17 reaches it from the wallet Central City's own listings are paid to**, directly or through the conduit, and the remaining **17.98%** comes straight from Central City's treasury. Those two sum to 100.00%, because there is no third source. Attributing the conduit's outflow pro rata to its own inflow mix, rather than wholly to the seller, gives 80.66% instead.

### The same shape at small scale

On 2026-10-20 the facilitator served **2,985 distinct payers** and **172 sellers**. The top 100 payers made **83.1%** of the day's payments. Not one payer appeared as a payee, so at address level buyers and sellers look cleanly separate.

They are not. We took the ten busiest payer wallets and pulled every inbound USDC transfer across blocks 52,600,000 to 53,250,000. 1,070 transfers, zero errors. **Each has exactly one funding source, and each of those is a top seller on the same platform.**

| Buyer wallet | Legs 10-20 | Funded by | Amount | That funder on 10-20 |
|---|---|---|---|---|
| `0x4e1b80bd…` | 2,072 | `0xf0006bfc…` | $3,967.10 | #1 seller, $2,738.74 |
| `0x9b5f8e9c…` | 1,850 | `0xfa53eaf2…` | $4,028.29 | #2 seller, $2,592.18 |
| `0x71b0c416…` | 1,888 | `0x3cac6996…` | $3,499.86 | #4 seller, $2,091.83 |
| `0xb5945d8a…` | 1,806 | `0xbf0310f0…` | $3,269.31 | #3 seller, $2,163.19 |
| `0xfac73e95…` | 1,770 | `0x6ec065fe…` | $3,392.15 | #7 seller, $1,897.11 |
| `0x389c28e8…` | 1,868 | `0x00fdf5a0…` | $2,980.24 | #5 seller, $2,037.35 |
| `0x67bb13f3…` | 1,986 | `0x84c121ee…` | $2,797.24 | top-10 payee |
| `0x415fcdd5…` | 1,788 | `0xd7924c82…` | $2,519.59 | seller |
| `0x69eb3dd9…` | 1,792 | `0x71c76257…` | $2,468.83 | top-10 payee |
| `0x25f65fd2…` | 1,862 | `0x15dd339b…` | $1,883.60 | seller |

The transfer sizes name the mechanism. Alongside round top-ups of $10.00 and $100.00, the funding arrives in amounts like **$8.964, $8.91, $17.928, $6.255, $4.05**. Those are precisely **90% of $9.96, $9.90, $19.92, $6.95 and $4.50**: a seller's take after the 10% fee, forwarded on whole.

Traced the other way, those ten seller wallets received **$30,806.21** from 912 buyer wallets across 16,544 settlement legs, and sent **$30,806.21** out to ten buyer wallets. Every individual wallet balanced to the cent. Net retained: **$0.00**.

These ten are a sample, not the whole: their fifteen-day throughput is $30,806.21 against $2.36M for the window. They show the shape. The single wallet above shows the scale.

Every address in that ten-wallet cohort is the same object: a 61-byte proxy pointing at implementation `0x000100ab…17339e72`, whose bytecode contains the string **"Coinbase Smart Wallet"**. Nonce 1, no ETH, balances between $0.00 and $0.016. The larger circuit is built differently: its buyer and its conduit are plain EOAs, with **400** and **138** transactions behind them.

### What is being bought

Not a differentiated product. Central City's own docs list the **built-in service kinds** a seller can offer, and `base-usdc-balance` and `address-checksum` sit in that list next to `base64`, `url-encode`, `slugify` and `roman-numerals`. The docs also state the price is the seller's choice, "a price per call from 0.05 to 100 USDC when fee router 2 is enabled".

The same payout address sells the same built-in at both ends of that range. All six Central City first-party listings in the public feed pay `0x524c827c…107578b1`:

| Listing | Price | Calls, 30d |
|---|---|---|
| Central City · Base USDC balance **enterprise** | **$20.00** | |
| Central City · Address checksum **enterprise** | **$20.00** | |
| Central City · Base USDC balance audit | $1.30 | 592 |
| Central City · Address checksum 9c | $0.09 | 2,470 |
| Central City · Address checksum 5c | $0.05 | 5,951 |
| Central City · Base USDC balance | **$0.05** | 359 |

Third parties on the same feed sell a Base balance read for **$0.001** and **$0.003**.

By value settled, Central City's own dashboard (as read 2026-10-31) reports its top five services, all first-party:

| Service | Calls | Value settled | Implied price |
|---|---|---|---|
| Central City · Base USDC balance enterprise | 52,909 | **$1,058,180.00** | $20.00 |
| Central City · Address checksum premium | 28,567 | $57,134.00 | $2.00 |
| Central City · Base USDC balance enterprise plus | 18,397 | **$735,880.00** | $40.00 |
| Central City · Address checksum pro | 14,352 | $17,222.40 | $1.20 |
| Central City · Address checksum 5c | 18,810 | $940.50 | $0.05 |
| **Top five** | | **$1,869,356.90** | **78.9% of all value** |

The two listings priced at $20.00 and $40.00 are **$1,794,060** of the platform's $2.37M, which is **75.7% of everything it has settled**.

We did not pay the endpoint, so we cannot report what it returns. We did run the read its description names: "The USDC balance of any address on Base mainnet, read live from chain." That is one `eth_call` to `balanceOf`. We made that call several hundred times over this investigation against a public endpoint, with no account and no key, at a cost of **$0.00**. One of them, for the symmetry, returned the balance of Central City's own seller wallet: **$2.16**.

### Central City published the warning first

From `centralcity.ai/docs/protocol-fees.md`, dated 2026-10-19:

> These totals measure recorded protocol fees. **They are not a measure of independent customer demand, profit, or net new funds entering the system. Repeated payments using previously funded balances can generate additional fees without bringing new external funding into Central City.**

> Wallet funding, float top-ups, transfers between balances and treasury sweeps are not service fees. A fee event and treasury receipt establish a collected fee, not by themselves delivery of a service or the seller's completed settlement.

> The fee routers are permissionless: anyone can call them directly. The totals therefore include other self-dealing (a payer paying an address it controls), purchases between agents of the same owner, and sponsored and fleet traffic.

> Central City's reported protocol-fee totals include fees from payments made by all agents created on Central City. This includes payments by Central City-operated agents.

Read the first passage again. **Central City published a description of the exact mechanism we spent two days measuring, before anyone measured it.**

And that does not rest on Central City's own date stamp, or on ours. The Internet Archive captured the page on **2026-10-17 at 22:57:49 UTC**, which is **1 day 9 hours and 26 minutes** before fee router 3 was deployed (block 52,804,453, 2026-10-19T08:24:13Z) and a day and an hour before the first surge day begins:

> `web.archive.org/web/20261017225749/https://centralcity.ai/docs/protocol-fees.md`

We pulled that snapshot and checked each passage against it, and the result narrows the claim. **The first two are present verbatim**, under the same heading, including "not a measure of independent customer demand" and the sentence about recycled balances generating fees without new outside money. **The third and fourth are not.** The explicit self-dealing language, "the fee routers are permissionless" and "This includes payments by Central City-operated agents", was added after Oct 17. The page has grown from 4,163 bytes to 7,005, and the archived copy does not yet carry the "Updated 19 October 2026" line the live page shows.

So the defensible claim is the narrower one, and it is also the load-bearing one: **Central City warned that its own totals were not a measure of independent customer demand a day and a half before the volume existed**, and a third party holds the proof. It did not disclose the self-dealing in advance. We are not going to stretch that, because stretching a disclosure past what the record supports is the same failure we are reporting in the indexes.

On the question this piece is about, Central City is the only party in the chain that got it right. A new facilitator bootstrapping its own volume with its own capital, and saying so in writing, is not deception. The indexes that republish its number, and the charts that quote those indexes, carry none of this.

## A second finding: three sources, three different answers

While checking the adapter's address list we found a different kind of error, in the registries themselves.

x402-list.com books **$845,239** of 30-day Base settlement to a facilitator called FluxA, across six settler addresses sourced from x402scan. We confirmed x402scan carries the same six. **None of those six are in DefiLlama's list.** DefiLlama does carry `0x3be45f57…07ab311D`, the address FluxA's own facilitator declares, but files it under a different operator entirely, `xecho`. **DefiLlama's list contains no entry named FluxA at all.**

```
GET https://facilitator.fluxapay.xyz/supported
  → "signers": { "eip155:8453": ["0x3be45f576696a2fD5a93C1330cD19F1607ab311D"] }
```

That address has a nonce of **12,233**, which moved by exactly **one** between 2026-10-09 and 2026-10-21. The six carrying the $845,239 have a combined nonce of **2,352,834**.

The six are nonetheless bound to the declared signer by contract deployment:

| Contract | Created | By |
|---|---|---|
| `0x6d274867…304d09d31`, which **10,229 of 10,267** daily settler transactions call | block 37,738,135, 2025-11-04T14:13:37Z, tx `0x4eb34777…63d38ed` | **`0x3be45f57…`** |
| `0xdc158887…8e886b09`, which in turn created the hub `0x9c955c40…070e6e299` | block 37,738,145, tx `0x996fee64…159225fb` | **`0x3be45f57…`** |

Both direct creations, `to: null`, ten blocks apart. The deployment link establishes that the six relayers operate the declared signer's contracts. It does not establish who holds their keys, and we did not try to find out.

The two halves of that volume are not the same thing:

- **The $0.001 traffic runs through those contracts.** 10,229 transactions on 2026-10-20, each emitting two USDC transfers of a tenth of a cent, payer to hub to a terminal address that has **never sent a transaction** and holds $1,464.61. The whole day comes to **$10.27**. FluxA's documentation describes products that fit: AEP2 micropayments "as low as $0.001", and a social gifting feature.
- **The $90,000 transfers do not.** On 2026-10-20 the same relayer set sent 38 transactions straight to the USDC contract, bypassing every one of those contracts. Two carry **$180,000**, the same payer `0x15eae079…` to the same payee `0xfa02300b…`, 60 blocks apart, both EIP-3009. We scanned 2026-10-22 as well: **$90,000.20 of $90,250.07**, same pair, one transaction. The payer has **nonce 0** and holds $51.21. Across the month, **eight days carry $836,353 of the $845,239**, and we have now read all eight off blocks rather than off a daily series: 345,600 blocks, zero failures, agreeing with x402-list to 0.012%. Every one is the same shape. **One payer-payee pair is $829,000.00 across those eight days, in ten transfers, which is 97.96% of everything x402-list credits to FluxA over thirty days**, and not one of the ten touches FluxA's own contracts.

So one relayer set does two unrelated things; x402scan and x402-list say those six are FluxA's; FluxA's own endpoint names a seventh address it does not share with them; and DefiLlama carries that seventh address under the name xecho. Three sources, three different answers, and no two agree.

## What this means for the numbers everyone quotes

On DefiLlama's own data, for Oct 19 to Oct 30:

| | |
|---|---|
| All chains, all facilitators | $2,801,594 |
| Base | $2,479,685 (88.5%) |
| Central City | **$2,356,999 (84.13% of everything)** |
| Base excluding Central City | $122,686, or $10,224 a day |
| Base excluding Central City, Oct 11 to 18 | $8,143 a day |

The non-Central-City part of Base x402 grew **1.26x**, measured as daily average over Oct 19 to 30 against Oct 11 to 18. On the same two windows the headline grew **22.09x**.

The general lesson is not about any one company. Any index that attributes settlement to the address that **pays the gas** will count a treasury movement as commerce. And any platform that is simultaneously the buyer, the seller and the fee collector will produce real USDC, real transactions, real EIP-3009 authorisations and real fees, every one of which is true, and none of which is demand.

What is missing is one sentence of provenance. Central City wrote it. DefiLlama, x402-list and x402scan do not carry it, and they do not agree with each other about who owns the addresses they are measuring.

We have traced a headline agent-economy number back to the operator's own wallets several times now, on Virtuals and on x402. This is the largest, and the first where the number is a whole protocol's growth chart.

## What the chain does not show

- **Who holds the keys** to the six settler addresses x402-list credits to FluxA, to the $90,000 payer and payee, or to the conduit `0xb48a2519…`. The deployment and flow links tie wallets to contracts and to each other. They do not tie keys to anyone, and we did not try.
- **Where the loop's original capital came from.** The circle is closed over the window we measured. Pushing back past router 3's deployment would show where it was first funded.
- **DefiLlama's query cannot see all of Central City's volume, and on two days that matters.** The adapter counts only transactions broadcast by the facilitator address in its list. Central City's fee routers are permissionless, so some payments reach them through ERC-4337 bundlers calling the EntryPoint instead. On six of the eight days we could split by broadcaster the two sets are the same to within 0.13%, but on 2026-10-19 the filter misses $3,047.54 and on 2026-10-22 it misses $4,720.10, which is the big buyer taking that route. Like-for-like those two rows are about **79.8%** and **92.8%**, not 88.6% and 96.6%, and the window share is about **94.7%** rather than 95.05%. "95.05% of Base" is a correct statement about the two published series; recompute it from blocks and you land a third of a point lower. We would rather name that than have a reader find it.
- **What is still broadcaster-unsplit.** 2026-10-20, 28, 29 and 30 were measured but not split by broadcaster, so their shares could move slightly for the same reason. On the evidence of the five days that split at exactly 100%, not by much.
- **x402-list's daily figures are not perfectly reproducible.** Its 2026-10-20 Central City number matched our seller-leg total to the cent; its 2026-10-22 number is about 47% of it. We report our own measurements as ours.
- **Whether the EIP-7702 delegation shared by FluxA's signer and Central City's treasury means anything.** It does not. Both point at `0x63c0c19a…`, MetaMask's off-the-shelf `EIP7702StatelessDeleGator`. Shared library, not shared operator. We note it only so nobody else reads it as a link.

One incidental finding, because readers can act on it: these wallets are being address-poisoned. Among the transfers touching the treasury and the conduit are zero-value transfers from look-alike addresses whose first and last characters match the real counterparties, for example `0x64e8fb13…2c13` and `0x64e63b4b…2c13` against the real `0x64e8ffb4…82c13`. If you ever copy an address out of a transaction history, this is why you should not.

## Method

Read-only throughout. Public endpoints only: `https://mainnet.base.org` for current state, a keyless Base archive gateway at two requests a second for historical logs, and ChainWard's own Base node for the full-day block scans. No production keys. Nothing was published, sent or spent.

- **Reproducing DefiLlama:** we pulled `dexs/x402/index.ts` and `facilitators.ts` from the DefiLlama/dimension-adapters repository, extracted all **123 EVM addresses**, and applied the adapter's exact filter to receipts from every block of 2026-10-24. Published series from `api.llama.fi/summary/dexs/x402`.
- **Full-day scans.** `eth_getBlockReceipts` under DefiLlama's exact 123-address filter, on our own Base node. **688,767 blocks, zero failures**: 343,167 for Central City (seven full days plus 94.4% of 2026-10-27) and 345,600 for FluxA's eight spike days. Every one of the twelve days in the window is measured off blocks; none rests on anyone's API. UTC day boundaries were checked against block timestamps rather than assumed. 2026-10-24 was re-scanned from scratch as a control and reproduced every figure in this piece to the cent, including the 33,528 payment legs and the $5.86 second payer. The window reconciles to **seven cents on $2.36 million**.
- **Flow traces:** `eth_getLogs` on the USDC `Transfer` topic with the address in position 2 or 3, in 1,000-block chunks.
- **Account state:** `eth_getCode`, `eth_getTransactionCount`, `eth_getBalance`, `eth_getStorageAt` on the EIP-1967 slot, and USDC `balanceOf`, at Base block 53,250,839.
- **Contract and token identification:** ASCII strings recovered from implementation bytecode; `symbol()`, `name()` and `decimals()` for tokens. Contract creation blocks found by binary search on `eth_getCode`, then the creating transaction read from the block's receipts.
- **Published figures:** `centralcity.ai/api/public/protocol/fees`, `/api/public/dashboard`, `/api/public/feed/services`, `/docs/protocol-fees.md`, `/docs/feed.md`; `x402-list.com/api/v1/facilitators`; `facilitator.fluxapay.xyz/supported`; `x402scan.com/facilitators`. All fetched 2026-10-30 and 2026-10-31 UTC. The archived copy of the disclosure is `web.archive.org/web/20261017225749/https://centralcity.ai/docs/protocol-fees.md`. Directory data from x402-list.com is CC BY 4.0.

A second verification note, since it nearly cost us the central quote. The pivotal sentence wraps across lines in the source: "not a measure of" ends one line and "independent customer demand" begins the next. A line-based `grep` for the phrase returns zero on the live page and on the archived copy alike, which reads as if the sentence were absent. Both were confirmed by flattening newlines before matching.

**One correction we made to ourselves.** An earlier pass of our log-collection script deduplicated rows on a key that did not include the log index. Central City batches dozens of identical payments into a single transaction, so identical legs inside one transaction collapsed into one, and dense queries silently undercounted by up to 4x with no error raised. We caught it by running a range whose answer we already knew from the node receipt scan: the script returned 1,959 legs where the correct answer was 8,905. Every flow figure in this piece comes from the corrected script, and the two biggest days were cross-checked by a second, independent route. The node receipt scans were never affected.

Balances change. Every balance quoted is as of Base block 53,250,839 unless stated otherwise. Central City's dashboard counters are live and were read 2026-10-31 UTC.

---

*Disclosure: ChainWard sells x402 endpoint checks and is itself listed on x402 catalogues, including PayAI's. We have no commercial relationship with Central City, FluxA, DefiLlama, x402-list or x402scan. Each is welcome to a right of reply and we will publish it.*
