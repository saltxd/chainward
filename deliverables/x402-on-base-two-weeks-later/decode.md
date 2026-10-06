---
title: "x402 on Base, Two Weeks Later: The Loops Kept Running"
subtitle: "Sep 29–Oct 5: $109,151 of x402 settled on Base; 40.6% looped back to its source. Measured the same way, Sep 15–21 was 46.8%."
date: "2026-10-06"
slug: "x402-on-base-two-weeks-later"
seoTitle: "x402 on Base Two Weeks Later: Seller-Funded Buyers, a Cashback Ring and $138,700 From One Account (Sep 22–Oct 5)"
---

# x402 on Base, Two Weeks Later: The Loops Kept Running

On Sep 27 we published [one week of x402 on Base](/decodes/x402-on-base) (Sep 15–21): $128,977 settled, at least 43.6% of it looping back to where it came from.

Short version:

- **Sep 29–Oct 5: $109,151 settled, and $44,344 (40.6%) looped back**: buyers funded by the seller they paid, sellers paying buyers back, wallets paying each other. Measured the same way, Sep 15–21 was 46.8% (we published ≥43.6%).
- **The #2 seller was #1, then stopped taking payments.** Buyers funded through the hub it pays and three distributors carried 99.9% of its volume, until its last payment on Oct 2.
- **Six wallets kept paying each other through the Meridian facilitator, earning MRDN cashback**: $28.5K, $32.7K and $26.0K a week, with no x402 payment in from outside.
- **Payers funded by the account at both ends of September's $30,000 round trip made $138,700 of x402 payments.** $61,700 came back to it within minutes. It may be a service both sides use, so we don't count it as a loop.
- **What changed:** a seller that paid its buyers back wound down, and clashofcoins moved to a new payTo as its volume fell from $8,055 to $435 a week.

---

## The weeks side by side

| | Sep 15–21 (as published) | Sep 15–21 (same method) | Sep 22–28 | Sep 29–Oct 5 |
|---|---:|---:|---:|---:|
| x402 settled on Base | $128,977 | $128,252 | $232,810 | **$109,151** |
| Settlements | 407,959 | 407,299 | 698,210 | 490,626 |
| **Verified loops** | ≥ $56,268 (43.6%) | **≥ $60,040 (46.8%)** | ≥ $59,906 (25.7%) | **≥ $44,344 (40.6%)** |
| Funded by the round-trip account, came back | $30,000 (23.3%) | $30,000 (23.4%) | $54,000 (23.2%) | $7,700 (7.1%) |
| Funded by the same account, did not come back | – | – | $50,000 (21.5%) | $27,000 (24.7%) |

> **Verified loop:** a payment whose USDC came from the seller it paid, directly or through wallets the seller funds; a seller paying its buyers back; or wallets that pay each other and take no x402 payments from outside. Coverage is partial, so most figures are floors. The exception is the seventh seller below, counted in full though 74–80% of its payer's USDC came from it; at that share the latest week is 40.0%.

**On the same method, the loop share fell from 46.8% to 40.6%,** mostly because clusterprotocol's payments stopped on Oct 2. Our published 43.6% is lower mainly because September's scan didn't trace the payer behind Meridian's proxy for two sellers.

In Sep 22–28, 44.7% of $232,810 was three payments by payers one account funded.

---

## The #2 seller was #1, then stopped taking payments

[`0x68396bd3…`](https://base.blockscout.com/address/0x68396bd35874695ad86cd29410bd80a550991a2b), the payTo x402scan lists for `api.clusterprotocol.ai`, was the top Base x402 seller from Sep 29 to Oct 5. It took $10,840 on Sep 29–Oct 1 and $99 on Oct 2, the last at 12:00 UTC. Its distributors had stopped sending on Oct 1, and none of its 715 buyers paid another x402 seller afterwards that week. None had arrived by Oct 6, and x402scan still lists only this payTo for api.clusterprotocol.ai. The chain doesn't show why: a paused service, or a move off x402 or off Base, would look the same. Until then:

| | Sep 15–21 (same method) | Sep 22–28 | Sep 29–Oct 5 |
|---|---:|---:|---:|
| x402 volume | $21,942 | $21,874 | $10,939 |
| Buyers | 715 | 718 | 715 |
| Buyers funded by its three distributors | 687 | 633 | 645 |
| Their share of its volume | 99.9% | 99.9% | 99.9% |

Every week the seller sent its revenue to the same hub, [`0x0a4135f9…`](https://base.blockscout.com/address/0x0a4135f9b7af754033bb7af6dc581ec0dc6e15d5). In each 30-day window we read, all the hub's inflow above a cent came from the seller, and all the distributors' from the hub. One example per hop, in time order, about an hour end to end:

| Hop | Transfer | Tx |
|---|---|---|
| Seller → hub | $28.09 | [`0x69eb9479…`](https://base.blockscout.com/tx/0x69eb9479983fc9fb5496334384ad19308b1982783af73e2c436f8240ada16fea) |
| Hub → distributor [`0xdab0581c`](https://base.blockscout.com/address/0xdab0581c75f069a13f2cfc1378018c9710fadf92) | $196.29 | [`0x73880567…`](https://base.blockscout.com/tx/0x73880567ba50b6fc6977913e0a6c6eae547449d73bbae3fe7ef6801f228f7ab1) |
| Distributor → buyer [`0xa390b343`](https://base.blockscout.com/address/0xa390b343115cb1aedf14d502e26b88528c280159) | $21.27 | [`0x211eb3af…`](https://base.blockscout.com/tx/0x211eb3af5e3ad4c66b7cd16c2250eae7b5ce689ecbdf45e8257577d16a6d348c) |
| Buyer → seller (x402) | $5.00 | [`0xe7cde083…`](https://base.blockscout.com/tx/0xe7cde08395b6b27ca04279bacfb0b127927778202956b5318813fe2421e062c7) |

The chain doesn't show who controls the hub or the distributors, or why. A platform funding its users' agent wallets from revenue would look the same. Either way, this is the seller's own USDC coming back, not outside demand.

---

## Six wallets kept paying each other

Six wallets paid each other through the Meridian facilitator, earning cashback in Meridian's MRDN token, and took no x402 payments from outside. Their only other x402 payments were $815 and $149 to `0x30c2282e` in the two new weeks.

| | Sep 15–21 (same method) | Sep 22–28 | Sep 29–Oct 5 |
|---|---:|---:|---:|
| Payments among the six | 764 | 797 | 766 |
| Volume | $28,514 | $32,685 | $26,031 |
| Payer→payee pairs, of 30 | 30 | 30 | 30 |
| x402 payments in from outside | $0 | $0 | $0 |

Cashback was still paid: in [`0x1d5bf7ba…`](https://base.blockscout.com/tx/0x1d5bf7baa9d48e5da170d7f7c134a25e8e26d9af94aaab9c0714bd5450403b28), [`0x13db4caf`](https://base.blockscout.com/address/0x13db4caf175f23f1429c2df6b333350c24705192) pays $47.17, and the proxy forwards $46.70 to [`0xa6a90366`](https://base.blockscout.com/address/0xa6a90366a307080bccb859642d3378121fe8809d) and sends the payer 127.6 MRDN.

**A seventh seller works the same way with one payer.** [`0xc2204317…`](https://base.blockscout.com/address/0xc2204317799b521cd1ff1f7c6cab84d3ac5f774e) took $2,648, $3,416 and $3,201 through Meridian, all from [`0x1cfffac9…`](https://base.blockscout.com/address/0x1cfffac9aa5590338f2650f1461b70feddad0fcb). In each 30-day window we read, 74–80% of that payer's USDC came from 0xc2204317 ([example](https://base.blockscout.com/tx/0x0085d9a8d555b23d522a31f97a47ae4291c7958642a5531e79a3095843ee705e)), and a $263 payment earned it 727.6 MRDN ([tx](https://base.blockscout.com/tx/0x0beade8a82de601ba91a39330cd163fd9aa7514a9fdc2774fde5cad233715855)). The chain doesn't show whether the two are one operator.

**How we saw the payers.** Meridian pays sellers from a proxy contract. We used x402scan's payer field, the wallet that paid into the proxy; all 12 receipts we read, across the three weeks, matched it.

---

## The round-trip account's money reached new payTos

In September, $30,000 left [`0xee7ae85f…`](https://base.blockscout.com/address/0xee7ae85f2fe2239e27d9c1e23fffe168d63b4055), a high-throughput smart account, as x402 payments and reached it again within minutes. In the next two weeks, payers it had funded made $138,700 more:

- **Sep 23:** [`0xacc7aebf…`](https://base.blockscout.com/address/0xacc7aebf890612432522c7971cf3882272cdb406), which 0xee7ae85f had funded since at least December 2025 and again two hours earlier, paid [`0x1f9fd037…`](https://base.blockscout.com/address/0x1f9fd037b19a20e4f36790c4e4d992c54fccd61a) $4,000 ([tx](https://base.blockscout.com/tx/0x604c844d22e8fb6b6354813b26738520226db30a7f87da1a9f56f1b8373b4fb6)). Back to 0xee7ae85f 187 blocks later ([tx](https://base.blockscout.com/tx/0xbe733c53f9f2fdb5301175232baa2a6d093163e9c5606b30bc1514dba47aa211)).
- **Sep 24:** September's payer, [`0x15eae079…`](https://base.blockscout.com/address/0x15eae0792636b3dca7b5002f673b66d27c9d7aff), paid September's payTo, [`0xfa02300b…`](https://base.blockscout.com/address/0xfa02300b1a598daba1b27b2bf79f9775355dac82), $50,000 ([tx](https://base.blockscout.com/tx/0x98de74eafb3627e3c6b352ba767a122d794dce9e791493d8edafc9d817bb6805)). Back 147 blocks (about five minutes) later ([tx](https://base.blockscout.com/tx/0x0522f70d8374bc7fc176f10c9b29d766e394bb81905ab5795e027ad109906832)).
- **Sep 28:** the same payer sent $50,000 to a different payTo, [`0xce2646d8…`](https://base.blockscout.com/address/0xce2646d8b6ab269987f3c8823022ed4a0ce31318) ([tx](https://base.blockscout.com/tx/0xb4586a6e772cd57aace8929352de77229e8da2d9c9f91b4f251247fcffa6fe08)). As of block 52,235,882 (Oct 6), it hadn't moved.
- **Sep 30, 14:34:49 UTC:** 0xee7ae85f sent 0xacc7aebf, the payer behind the Sep 23 round trip, **$34,700** ([tx](https://base.blockscout.com/tx/0x6f7f6cbb9ef2449c48a46bc04b0b6108d70b21adda6b47c1d8cef500a2d0db33)). Five minutes later, in block 51,994,932, it made six x402 payments via the Fluxa facilitator totalling exactly $34,700:

| payTo | Amount | Paid before (x402scan)? | Where it went next |
|---|---:|---|---|
| [`0x6d3d6df3`](https://base.blockscout.com/address/0x6d3d6df3f5394d588e4a4ce798fe59820b901ace) | [$10,000](https://base.blockscout.com/tx/0xb93483f279f75117049554f2384cd42fe6a1ddae1bcd96f7cf7bb13845f15b5f) | No | Another address, 3.5 days later |
| [`0x1a199cd4`](https://base.blockscout.com/address/0x1a199cd404b4eea21678fe6713c8bc807f9dacf4) | [$8,000](https://base.blockscout.com/tx/0x9925516e616f0ef3e3018418646f575a22738df282313b934d59d46e736084e5) | Since May, only by this payer | Two other addresses, 1–2 days later |
| [`0x63f10330`](https://base.blockscout.com/address/0x63f103304ed9f0f1b47b90b10b30e47b639c46c9) | [$7,500](https://base.blockscout.com/tx/0x03a7080f8c3ba05a14bfce42f3d2789bae397d587bfb83200d7d56bf87718873) | Once, in May, by another payer | Hadn't moved by Oct 6 |
| [`0xe0f54e20`](https://base.blockscout.com/address/0xe0f54e20ecd4829a8a80526173531132c1e48873) | [$6,700](https://base.blockscout.com/tx/0x81c6ed2e014d18ecdb00fce69cdca5b293d771baf296c2e5554c70d512a49507) | No | Back to 0xee7ae85f, 10 minutes later ([tx](https://base.blockscout.com/tx/0xcd85ef923861cdfa45d843ca88a101d985aa827f9812f44058977d4894cf512a)) |
| [`0xba6018c9`](https://base.blockscout.com/address/0xba6018c96b41761a3a48b6d371445ddf912bce48) | [$1,500](https://base.blockscout.com/tx/0x636f43f658dda752068830832285c1f1ff08278fe0ec9035a41f09b67b2515f1) | No | Another address, about 3 hours later |
| [`0xe2768dfd`](https://base.blockscout.com/address/0xe2768dfdb47fb0237c6079b967fbbbd10cb16723) | [$1,000](https://base.blockscout.com/tx/0x1a1a3aa4ab3a4d215f8e4cc674207e2de7faa623c458c393956ee1da0a7e5121) | No | Back to 0xee7ae85f, 10 minutes later ([tx](https://base.blockscout.com/tx/0x3284879861b6e275602a3a57821a92a09a24b0729bb015e7e7649b9fc90d6e27)) |

Four of the latest week's top 10 payTos are on that list; two of them, 0x6d3d6df3 (#2) and 0xe0f54e20 (#6), were first paid in that block, and x402scan lists no service for either.

A payTo that forwards everything to one account within minutes behaves like a deposit address at an exchange or payment service. Of the $138,700, $61,700 went back to 0xee7ae85f; the rest stayed put or moved elsewhere. The chain can't show whether 0xee7ae85f is one party or a service both sides use, so none of it counts as a loop.

---

## Everything else we checked

- **botpay:** In both new weeks, 345 of its 346 buyers trace back through x402 payments to one root wallet whose only USDC funder was the seller ($416.59 in the latest week, [example](https://base.blockscout.com/tx/0xc5320eae2a6f3cb56d5fd80ac63c85711b29cb4e369f00d2aa7c2774f6385164)). Payments inside the tree add $1,649 to the loop total; botpay's payTos took $411, down from $727.
- **Ping-pong:** [`0x17cd53c0…`](https://base.blockscout.com/address/0x17cd53c04d707ef0dd615ef56c633f02915a7905) still sends a buyer $0.05 and gets $0.05 back 38 seconds later ([out](https://base.blockscout.com/tx/0xfcb9025017611600dce7fce699a820c86938ea65680a56993e681eca6cb80f20), [back](https://base.blockscout.com/tx/0xdecada676485bd8a23808335aec0ff0ed290c045898e732bc9474df1f04573eb)), and funded all 30 buyers we checked each week. It looks like a test loop; either way it isn't outside demand.
- **Wound down:** `0xed9fcd0d…`, which paid 91% of its takings back to its buyers, fell from $2,651 to $2.75; its buyers paid no other seller.
- **New to the top 30:** [`0x589a2314…`](https://base.blockscout.com/address/0x589a2314a2e05f45e40c4823da3ba58d421db3d8), listed on x402scan as X Pay (pay-per-request utility APIs), took $959 and sent 32 of its 37 buyers $992 in the latest week. Refunds, rebates or credit: either way its buyers paid it nothing on net. With 0x17cd and smaller sellers that fund or pay back their buyers, these loops total $2,538.
- **Moved and shrank:** clashofcoins' September payTo took its last payment on Sep 28 at 12:04 UTC. A day later [`0x2588c78d…`](https://base.blockscout.com/address/0x2588c78ddb0015f033fba8485beeae8e9a05db63), now listed on x402scan under `x402.clashofcoins.com`, took over; 16 of its 18 latest-week buyers had paid the old one. Across the brand's listed payTos, weekly volume fell from $8,055 to $435.
- **blockrun.ai** had 193 buyers in the latest week. None of the 22 we checked was funded by the seller and no wallet funded more than two of them; one buyer was 61% of the sampled volume.
- **New to the top 10:** KORUS ([`0x8a12157b…`](https://base.blockscout.com/address/0x8a12157b27c22fb239e558dc3cb43c7d1a8c0881), #8, $4,751), whose API sells music licenses. 2,256 buyers paid it once each, in 14 active hours; only one paid any other seller. All 30 trails we checked stopped at high-throughput wallets our method can't see past; the week before, one such wallet was the largest funder of 26 of 30. One-off checkout wallets funded through an on-ramp would look like this.

---

## What the paid check catches, and what it misses

ChainWard's paid seller check is `GET api.chainward.ai/api/risk/seller-demand?address=0x…` ($0.10 over x402). It reads where a payTo's buyers got their USDC and whether money flows back. In the latest week it flagged clusterprotocol, 0x17cd, X Pay and the smaller sellers above.

It can't see past facilitator proxies or trees of x402 payments yet. On the ring, the seventh seller and botpay's tree, 69.6% of the latest week's loop dollars, it gives no flag; our free board's Oct 5 snapshot shows each ring wallet at 98% "via an intermediary" and nothing else. In the Sep 15–21 window it also stopped at clusterprotocol's hub, because sub-cent inflows made the hub look like an exchange wallet. We traced all of those by hand. The weekly board runs the same check and is free at [chainward.ai/x402](https://chainward.ai/x402).

---

*Verified October 6, 2026. Weeks are UTC: Sep 15–21 (blocks 51,320,527–51,622,926), Sep 22–28 (51,622,927–51,925,326), Sep 29–Oct 5 (51,925,327–52,227,726). Settlements: x402scan's public index, pulled Oct 6 04:18–04:24 UTC; for Sep 15–21 it matched our node's scan (the "as published" column) within 0.2% of settlements and 0.6% of volume. Our node was resyncing, so funding reads used Alchemy's transfer index and every linked transaction was re-read from mainnet.base.org. The funding check covered every top-30 seller in the latest week (91% of volume) and all but four single-payment payTos (five weekly entries) earlier. Per seller it reads the 1,000 latest inflows and walks the 30 largest buyers, largest funder first, up to four hops, stopping at wallets with 1,000+ inflows in 30 days. Unchecked volume (7.4% of the latest week) is not counted as a loop. "Did not come back" means no transfer back within 24 hours. A common funder can be a faucet, exchange or custodian; seller names are x402scan's labels. Counts are addresses, not people; the chain shows where money went, not why.*

> Disclosure: ChainWard is an x402 seller on Base (`api.chainward.ai`, listed on x402scan) and sells the check described above. On Sep 29–30, through @SaltCx, it offered Meridian a paid ($500) audit of this ring and offered Merit Systems, which runs x402scan, a paid data feed; neither had replied as of Oct 6, and neither is a customer. Its 8 checks on Oct 2 ($0.80) and a Sep 27 self-test ($0.05) are excluded from every total and ranking.
