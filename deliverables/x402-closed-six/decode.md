---
title: "Six x402 Wallets Paid Only by Each Other Now Rank 3 to 8 on Base"
subtitle: "The six wallets from our two earlier x402 decodes, ranks 3 to 8 on x402scan on Oct 9, have moved $981K between them through Meridian since May 5."
date: "2026-10-09"
slug: "x402-closed-six"
seoTitle: "x402 on Base: Six Wallets Paid Only by Each Other, $981K Since May Through Meridian's Facilitator (Oct 2026)"
---

# Six x402 Wallets Paid Only by Each Other Now Rank 3 to 8 on Base

x402 is a way for one program to pay another a few cents in USDC per request. A facilitator is the service that moves each payment and may take a fee. x402scan ranks sellers by how much USDC reached them in the last 7 days. It does not ask where the payers got that money. If a seller's payers are its own wallets, the same dollars can go round and round and the seller still climbs the chart.

In [our first x402 decode](/decodes/x402-on-base) (Sep 27) and [its follow-up](/decodes/x402-on-base-two-weeks-later) (Oct 6) we showed six wallets on Base that pay only each other, through the Meridian facilitator. On Oct 9 they held ranks 3 to 8 on x402scan's 7-day Base leaderboard, up from 9 to 14 on Oct 5, while the money they moved fell 19%. Six of the eight sellers that were above them on Oct 5 have dropped out of the top 20. Our free [x402 board](https://chainward.ai/x402) labels all six **self-funded demand**.

This time we read their whole history on-chain, back to May 5.

Short version:

- **Nobody else pays them.** In the 30 days to Oct 9 the six made 3,554 payments to each other, $120,249 in all, and not one payment came in from outside. Since May 5, exactly two did, both on the first day, for $98.35 paid.
- **A little money, moved many times.** $981,397 has passed between them since May 5. At the end of any day, the six together never held more than $1,598 of USDC.
- **The cashback pays for the fees.** Meridian keeps 1% of each payment and gives the payer about 1.9% back in its own token, MRDN. In the last 30 days the six collected 89.8% of all the MRDN cashback Meridian paid out on Base.
- **Everything that left went to one address.** Apart from fees and $12.50 swapped for gas, all $7,749 that ever left the six reached [`0x30c2282e`](https://basescan.org/address/0x30c2282e7e238a977ec710cf67a5d1e1a1bfe85f), on Base or on Arbitrum. A second address on Arbitrum that received at least $3,245 from it put $3,948 into Railgun, a privacy tool that hides where money goes next.
- **They sell nothing we can find.** None of the six is listed in any catalog we searched, and we found no web address for any of them that answers a request.

Two words used below: **paid** is what the payer sent, **delivered** is what reached the seller after Meridian's 1% fee. Amounts are delivered unless marked paid.

---

## The numbers

As of block 52,358,611 (Oct 9, 00:42 UTC):

| | 30 days | Since May 5 |
|---|---:|---:|
| x402 payments among the six | 3,554 | 35,142 |
| USDC delivered | $120,249 | $981,397 |
| USDC paid, before Meridian's 1% | $121,464 | $991,310 |
| Meridian fees | $1,215 | $9,913 |
| MRDN cashback sold for USDC | $2,320 | $18,786 |
| x402 payments in from outside the six | 0 | 2 ($98.35 paid) |
| x402 payments out of the six | 6 ($973 paid), all to 0x30c2282e | 23 ($4,994 paid: 22 through Meridian, 1 through PayAI), all to 0x30c2282e |
| USDC the six held | $1,032 at the start, $1,165 at the end | never above $1,598 at a day's end |

Measured block by block rather than at day's end, their combined balance peaked at $1,624, on May 28. x402scan's index holds 3,503 of the 3,554 payments, and every one of them matches the chain. x402scan counts USDC that reached a seller in 7 days. Where the payers got that USDC is outside what it counts.

## The matrix

Every payment among the six in the 30 days. The payer is down the side, the receiver across the top: number of payments, then USDC delivered. The six are named by the first eight characters of their addresses.

| payer \ payee | [1cec447d](https://basescan.org/address/0x1cec447da1915f018bd74006ff6d695468b68dd4) | [fe8f511d](https://basescan.org/address/0xfe8f511d8542f687cf70b798c388ef4c3265794d) | [a6a90366](https://basescan.org/address/0xa6a90366a307080bccb859642d3378121fe8809d) | [475436ef](https://basescan.org/address/0x475436ef0a97286081d0fc2a762ad6296949327b) | [13db4caf](https://basescan.org/address/0x13db4caf175f23f1429c2df6b333350c24705192) | [e55eb84c](https://basescan.org/address/0xe55eb84c37e90dfb7304969e5c6bff02c600f748) |
|---|---|---|---|---|---|---|
| **1cec447d** | | 143 · $4,673 | 125 · $4,246 | 109 · $3,724 | 113 · $3,718 | 125 · $4,280 |
| **fe8f511d** | 126 · $4,168 | | 113 · $3,764 | 114 · $3,793 | 118 · $4,160 | 120 · $4,048 |
| **a6a90366** | 108 · $3,836 | 123 · $4,327 | | 108 · $3,558 | 135 · $4,488 | 125 · $4,068 |
| **475436ef** | 112 · $3,677 | 110 · $3,726 | 110 · $3,676 | | 99 · $3,231 | 128 · $4,363 |
| **13db4caf** | 127 · $4,306 | 101 · $3,409 | 128 · $4,368 | 107 · $3,788 | | 118 · $4,023 |
| **e55eb84c** | 127 · $4,552 | 108 · $3,587 | 135 · $4,470 | 122 · $4,090 | 117 · $4,133 | |

Every wallet paid every other wallet, between 99 and 143 times. Each wallet received between $18,953 and $20,780. There is no center: the money goes round evenly.

## Where the money came from

The six started with $98.35. At 13:04 UTC on May 5, a busy wallet that sends USDC and ETH to many addresses, [`0x51dbd97f`](https://basescan.org/address/0x51dbd97fa14f4d78f8afc2e92a692a9e087efb5c), sent [`0x2e2d22bf`](https://basescan.org/address/0x2e2d22bf1a796049648cd83dbf1602ebc05fd43c) exactly $98.351706 ([tx](https://basescan.org/tx/0x488d3271c45bc95230144b8461c917d8483bfe570df84b70c7a94487269a0a1d)). Six minutes later 0x2e2d22bf paid 13db4caf $50 ([tx](https://basescan.org/tx/0x4862c0e4b015cf73e716dadc20fd4a4cd78aae88a76b4088d540465c3b9e2420)) and fe8f511d $48.35 ([tx](https://basescan.org/tx/0x0740d9c9eee1a6b25f600a16b779b33c7852c3395d69749b4b7afc98b0d940ac)) through Meridian. It has made no transfer since. An hour later, 13db4caf made the first payment among the six ([tx](https://basescan.org/tx/0x12e32d02154b9061c4a5d572666be29d3575981629bf4afafff4e4e67aff2510)). Every other wallet got its first USDC from one of the six, and 13db4caf made the first payment to three of them.

No other outside USDC above a cent ever arrived. Everything else they gained came from selling cashback. Meridian's payment contract keeps 1% of each payment and gives the payer about 1.9% back in MRDN, up to $5 per payment. That cap has been in all four versions of the contract since May. Since May 12 the contract also pays no cashback when the payer and the receiver are the same address. The version running when the six began had no such rule.

The six sold their MRDN for USDC on the MRDN trading pool. So each $1 that goes round costs a cent in fees and brings back about two cents in cashback. The same dollars go round about 100 times a month.

Since June the six have earned close to 320,000 MRDN a month, whatever the dollar volume. Dollar volume moved with MRDN's price: $223K in August at about $0.013 a token, $131K in September at about $0.008. The chain doesn't show why.

Transaction fees (gas) came from swapping a few dollars of their own USDC or MRDN for ETH. A service that gives small amounts of ETH to many wallets covered the first swap for four of them.

## Where it went

Apart from Meridian's fees and $12.50 swapped for gas, every dollar that left the six reached one address. On Base, 0x30c2282e is paid by no one but the six. It received $4,449 in 22 x402 payments through Meridian, $500 in one x402 payment handled by a different facilitator (PayAI) on Jun 16, and $500 in a plain transfer on Jun 8. The six also moved $2,300 to Arbitrum through Circle's bridge, and every one of those transfers names 0x30c2282e as the receiver. Three of them came from three different wallets of the six within 3 minutes 8 seconds on Jul 31 ([1](https://basescan.org/tx/0x2db4eb269985a3ecdf951d11208ee1113bef19930b67fc5df9c3f19b054aaf76), [2](https://basescan.org/tx/0x1c3ab1babc7f1cd1a96b660906d34e4c1fb55be0232c5c2f41c31f7581876f0f), [3](https://basescan.org/tx/0x788473b0836310f194b850fb37594d6668469618cf6cc49326f6908a50739e58)).

0x30c2282e passed everything on, mostly to Arbitrum. There a second address, [`0xc1d8a0f4`](https://arbiscan.io/address/0xc1d8a0f4f78f946f582116045486784f2ef83aaf), received $3,948 of USDC, at least $3,245 of it from 0x30c2282e. It put all of it into Railgun in six deposits between Jun 8 and Aug 26 ([latest](https://arbiscan.io/tx/0x3d5a87152469779b3a20a6dc56466402c82a25d0b8063e63f7614c3e1f562083)). Railgun hides where money goes next, so the trail ends there.

## What they sell

An x402 seller normally has a web address that answers requests and asks for payment. x402scan lists no such address for any of the six. Three catalogs of x402 sellers (PayAI's, Coinbase's x402 Bazaar and Agent402's index) list none of them either, searched Oct 9 between 01:00 and 01:30 UTC, although two of those catalogs do list other sellers from the same board. None of the six owns an agent identity (ERC-8004) on Base. With no address to call, there was nothing to test.

## The seventh

[`0xc2204317`](https://basescan.org/address/0xc2204317799b521cd1ff1f7c6cab84d3ac5f774e), ninth on the board, works the same way with a single payer. In the 30 days, payments from [`0x1cfffac9`](https://basescan.org/address/0x1cfffac9aa5590338f2650f1461b70feddad0fcb) delivered it $13,458 ($13,594 paid), and it sent exactly $13,458 back ([example](https://basescan.org/tx/0x0085d9a8d555b23d522a31f97a47ae4291c7958642a5531e79a3095843ee705e)), which is 79% of the USDC that payer received in those 30 days. The payments it receives stop at $263 paid, the size at which cashback hits the $5 cap. Its first USDC came from 0xee7ae85f, a very busy account from our last decode that may be a service many wallets use. We found no transfer between this pair and the six, and apart from Meridian's contract and the MRDN pool they share no counterparty that moved USDC or MRDN. Same mechanism, no money link.

## Limits

- This describes where money moved, not who controls these addresses or why.
- Meridian's proxy changed code on May 12, Jul 11 and Sep 14. Fees and cashback here are measured from transfers, not computed from the code.
- We could not identify 0x51dbd97f, and BaseScan has no public name tag for it.
- A service that hands out small amounts of ETH and a shared wallet contract appear in the trail. Both serve many unrelated wallets, so we do not count them as a link.
- Two later exits to Arbitrum, on Sep 4 and Oct 1, were not followed to their final recipient.
- x402scan's public API doesn't return past ranks. Ranks come from our Oct 5 and Oct 9 board snapshots.

## Method

To test whether anyone else pays them, we read every USDC transfer into and out of the six over their full history, through any contract, from Alchemy's transfer index. A payment from outside, through any facilitator, would show up as USDC arriving from an address other than the six, directly or through the facilitator's contract. Above a cent, only three outside sources ever appear: 0x2e2d22bf on May 5, the MRDN trading pool, and one MRDN sale routed through a contract on May 14. Adding up every transfer gives the six's combined balance to the cent. For a Meridian payment, the payer is whoever paid Meridian's contract in the same transaction. Sixteen key transactions were re-read from a public Base RPC and matched. x402scan was the cross-check, and the Arbitrum figures come from Arbitrum's Blockscout.

The board's verdict comes from ChainWard's seller check. For each of the six, 5 of 6 checked buyers trace back within one hop, 98% of their volume. The sixth is the MRDN pool. Its stated limit: "Top buyers' largest funders are followed up to 4 hops and the walk stops at exchanges: a loop through an exchange account is not visible."

---

*Verified October 9, 2026, at block 52,358,611. Window: blocks 51,062,612 to 52,358,611 (Sep 9 00:42 to Oct 9 00:42 UTC). Amounts are USDC delivered to the payee unless marked as paid. Counts are addresses, not people.*

> Disclosure: ChainWard sells the $0.10 x402 seller check this decode uses and runs the free board at chainward.ai/x402. The "self-funded demand" verdict is ChainWard's own method, not x402scan's. On Sep 29 to 30, through @SaltCx, ChainWard offered Meridian a paid ($500) audit of these six wallets' activity and offered Merit Systems, which runs x402scan, a paid demand-quality feed. Neither had replied as of Oct 9, and neither is a customer. ChainWard's own paid endpoints are x402 sellers on Base (payTo 0xf7Ee65130Fb2B3bb42Cc5cbFED085d7D482667cD). They rank below the board's top 20, and no ChainWard address appears in these wallets' transfers. We did not ask Meridian for comment before publishing.
