---
title: "Venice's On-Chain Credit Burn Grew 2.35x Since July"
subtitle: "A viral chart says Venice's API calls are up 400% since July. On Base, the swaps Venice runs to burn VVV for credit purchases grew about 2.35x in the same months. Its x402 payments stayed small and uneven, and staked DIEM stayed flat."
plain: "Venice says its API use is up 400% since July. Venice also burns some of its token on-chain every time it sells credits, and those burns grew about 2.35x over the same months. Both can be true: calls can grow faster than dollars. If you judge an AI service by a usage chart, its on-chain sales are the steadier number."
date: "2026-10-21"
slug: "venice-on-chain"
draft: true
seoTitle: "Venice AI On-Chain: VVV Credit-Burn Swaps Grew 2.35x Since July, x402 Small and DIEM Flat (Base, Oct 2026)"
---

# Venice's On-Chain Credit Burn Grew 2.35x Since July

On Oct 20 a widely shared post said Venice's "API calls are up 400% since July", with a chart of tokens processed per day going from about 100 billion in June and July to about 500 billion in late October. Venice is a private AI service. It sells API access for dollars, for USDC over x402 on Base, and through DIEM, a token whose stakers get $1 a day of API credit each.

API calls are not on a blockchain. Some of Venice's money is. We read everything Venice does on Base from June 1 to Oct 20 to see which part of the boom shows up there. All values are as of Base block 52,875,726 (Oct 21 00:00 UTC) unless a row says otherwise.

## The short answer

- **Credit-burn swaps grew about 2.35x.** Venice says that since July 17 it burns $5 of its VVV token for every $100 of credits it sells. Those burns run on-chain as swaps of exactly $5.07 from one Venice wallet: 1,193 a day on Jul 18 to 24, and 2,804 a day on Oct 14 to 20. Under Venice's stated rule, that would be about $119K of credits sold a day rising to about $280K; the dollar levels are that rule's arithmetic, not something the chain shows.
- **New-subscription burns grew about 2.65x.** By its rule, Venice also burns $2, $5 or $10 per new Pro, Pro+ or Max subscription: 1,205 such burns a day in June, 3,198 a day on Oct 14 to 20.
- **x402 is small and uneven.** Venice's x402 address on Base took in $541.60 in June, $607 in July, $170 in August, $2,832.52 in September ($2,005 of it from one wallet) and $707.37 on Oct 1 to 20, from 23 to 44 paying wallets a month.
- **DIEM is flat.** Staked DIEM, the cap on DIEM-funded credit, was 28,983 on July 1 and 28,369 on Oct 21: about $28K of credit a day.

So between July and October, nothing Venice does on Base grew 5x: the credit burns grew about 2.35x and the new-subscription burns about 2.4x (2.65x from June). The 400% can still be true. Calls and tokens can grow faster than dollars (cheaper models, more DIEM credit used, free usage), and the chain sees neither calls nor how much DIEM credit is used.

## Venice's burn meter

On July 17 Venice announced burns for credit purchases "starting today". The first swap of exactly $5.07 from wallet `0xe3157fc4…82e7` came that evening ([tx](https://basescan.org/tx/0x4d65504418147bfa6c58c0cc070b46d6762bf225d82911a650102fe7bfa99298), block 48,768,778, 22:21 UTC), and none appears in the wallet's history before it. In the 40 minutes before that swap the wallet made 90 swaps of $5.0375, the Pro+ size, which normally runs about 3 an hour: the credit burn most likely started at that size. We count those as Pro+; it does not change the ratios.

- **The wallet.** From June 1 to Oct 20 it sent 435,604 transactions, and 432,623 of them sold USDC for VVV on Aerodrome. 432,612 of those come in four sizes and send the VVV they buy to the zero address in the same transaction: $2.015, $5.0375 and $10.075 (the $2, $5 and $10 subscription burns plus a 0.75% fee) and $5.07 (the credit burn). [Example](https://basescan.org/tx/0x35bc2414335180e2faf6bef3f85c79e5e24a6370265a96ba266b2738850a2267). On Oct 14, all 2,751 of the day's $5.07 swaps burned their VVV, and every burn that day traces to this wallet.
- **Consistent with purchases, not a timer.** Both streams peak in the afternoon UTC and bottom at 09:00 (Aug 1 to 21: credit swaps 1.57x from bottom to peak, subscription swaps 1.53x), and they grew in a smooth ramp with no steps.
- **It is Venice's.** $567,000 of its USDC came from a Safe whose six signers are the same six who sign the owner and treasury of Venice's staking contract (verified source). Most of the rest, $1.13M, came from two hot-wallet contracts that look like a third party's, such as a payment processor; they are not evidence of who controls the wallet. Venice's own burn page reports exactly the VVV that reached the zero address each month (June 14,579.44 to September 36,417.98).
- **The totals check.** Each month, the USDC spent in the swap logs equals the wallet's inflows minus its balance change, to the cent.

## Month by month

Month-end values are read at 00:00 UTC on the 1st of the next month (October: Oct 21 00:00).

| | Jun | Jul | Aug | Sep | Oct 1-20 |
|---|---|---|---|---|---|
| Credit-burn swaps ($5.07) | 0 | 17,001 (from Jul 17) | 53,883 | 65,208 | 54,835 |
| Credits sold under Venice's rule ($100 each) | 0 | $1.70M | $5.39M | $6.52M | $5.48M |
| New-subscription burn swaps | 36,164 | 41,513 | 48,913 | 57,849 | 57,246 |
| x402 top-ups of $1 or more, USD | 541.60 | 607.00 | 170.00 | 2,832.52 | 707.37 |
| x402 paying wallets | 44 | 25 | 23 | 43 | 32 |
| DIEM staked, month end ($/day credit cap) | 28,983 | 29,097 | 29,193 | 27,233 | 28,369 |
| DIEM stakers, month end | 2,094 | 2,130 | 2,162 | 2,112 | 2,167 |

## What the chain cannot see

- API calls or tokens processed.
- How much staked DIEM credit is used: $28K a day is a ceiling, and if more of it was used, DIEM-funded calls grew with no on-chain trace.
- Card payments, except through Venice's own burn rule.
- Subscription renewals (Venice's rule burns only for new subscriptions), free usage and enterprise deals.

## Limits

- **The meter is Venice's policy.** The chain proves Venice spent the USDC. It cannot prove that each $5.07 swap stands for $100 sold, or show how purchases under $100 are rounded. Venice can change the rule at any time, and "credits" may cover app credits as well as API.
- **The size labels are our reading.** They rest on the amounts and the start time; Venice's burn page now shows monthly totals only.
- **x402 payments under $1 are left out of the top-ups.** 3,167 of 3,186 of them come from one wallet funded once with $100.

## Method and sources

- **Base logs:** USDC transfers from the burn wallet and VVV transfers to the zero address, read from our own Base node, an archive RPC and Alchemy, day by day for the samples above; an independent second pass re-derived the counts, the start, the Safe signers, DIEM and x402.
- **DIEM, staked VVV and stakers:** contract reads at each month boundary, plus every stake and unstake transfer.
- **Venice's x402 address:** taken from the 402 challenge of Venice's own top-up endpoint; its inflows were cross-checked against x402scan.
- **Venice's public numbers:** its blog posts of Apr 9 (x402), Apr 15 (buy-and-burn) and Jul 17 (credit burns), and its burn and DIEM stats pages, fetched Oct 21.
