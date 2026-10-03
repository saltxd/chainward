---
title: "Bankr Earned $1.74M in September. The Chain Agrees With Its Dashboard"
subtitle: "Fee receipts on Base and Robinhood Chain match 99.3% of Bankr's own Sep 1–28 figure. The number that's off is DefiLlama's $1.03M."
date: "2026-10-03"
slug: "bankr-on-chain"
seoTitle: "Bankr Revenue in September 2026: On-Chain Fees vs the Bankr Dashboard vs DefiLlama (Base and Robinhood Chain)"
---

# Bankr Earned $1.74M in September. The Chain Agrees With Its Dashboard

Bankr is an AI agent on X and Farcaster that trades for its users and launches tokens for them. Every trade in those tokens pays a fee, and Bankr keeps part of it. By fees, it is the biggest earner among the crypto AI projects we track: its public dashboard shows $3.17M of trading fees on Bankr-launched tokens for Sep 1–28, and **$1,751,372** of that as Bankr's own revenue.

We checked that revenue figure against the chain. **For Sep 1–28, Bankr's fee wallet and two fee Safes received $1,739,683 from Bankr's fee contracts, in the assets the dashboard counts. That is 99.3% of the dashboard.** Robinhood Chain, which few outside tools read, accounts for 79% of the fees Bankr's addresses received.

The number that's off is the third-party one. DefiLlama, the usual source for protocol fees, shows **$1.03M** for the same 28 days. Its adapter copies Bankr's dashboard before each day is filled in, and keeps the early reading.

---

## How Bankr gets paid

Tokens launched through Bankr trade in Uniswap v4 pools with a Doppler "Rehype" hook attached. The hook charges its own fee on every swap, on top of the pool's normal LP fee, and splits it according to settings stored in the contract. Bankr's cut arrives in one of two ways:

- **Per swap.** On Bankr's older hooks (`0xbf41…d123` and `0x6ab5…14be` on Base, `0x6f02…0f77` on Robinhood Chain), the hook converts Bankr's share into the pool's paired asset and sends it to Bankr's fee wallet, `0xF606…163e`, in the same transaction. On Base that was 61,323 transfers in four weeks ([example](https://base.blockscout.com/tx/0x9eb7814904de8a594779d1c57b836036941ed45ebf8e7be38fc23e0cd7ac6ed9)).
- **Claimed.** On the newer hook (`0x9982…fdbb`, at the same address on both chains), fees build up in the contract for two Safes: `0x0424…9b13`, which we call SafeA (one third), and `0x5f8d…e508`, SafeB (two thirds). They claim several times a day: 124 claim transactions on Base in September and 285 on Robinhood Chain ([largest](https://robinhoodchain.blockscout.com/tx/0xf99c984255bd1ffa6f38bac7ae362dbea9bb3755606b2a9026f25cac565a07c9)).

Smaller amounts come from Bankr's share of LP fees in older Doppler pools (36.1% in most of them) and from its share of Clanker fees, both on Base.

Take musebook/META, the largest pool on Robinhood Chain. Its hook fee is 1.05% of each swap. Doppler takes 5% of that. Of the rest, 71.4% goes to the two Safes and 28.6% goes back into the pool as liquidity. The pool's separate 0.70% LP fee goes 95% to the token's creator. Net, about **0.475% of each trade goes to SafeB and 0.2375% to SafeA**: the same 2:1 split a community fee breakdown shows for "Bankr" and "BNKR buyback".

Fees are paid in whatever the token is paired with. On Base that is mostly WETH. On Robinhood Chain it is often a tokenized stock (META, GME, SPY, NVDA) or the USDG stablecoin.

## Sep 1–28: the chain against the dashboard

We listed every token transfer into the three addresses on both chains, then counted only the ones sent by fee contracts: 149,345 transfers. Bridge inflows, transfers between Bankr's own addresses, swap proceeds and unsolicited airdrops are left out.

| | Dashboard (claimed) | On-chain (measured) |
|---|---:|---:|
| Base | not published (≈$320,790, our estimate) | $382,164 |
| Robinhood Chain | not published (≈$1,430,582, our estimate) | $1,434,068 |
| Both chains, all liquid fees | $1,751,372 | $1,816,231 (103.7%) |
| **Both chains, fees the dashboard appears to count** | **$1,751,372** | **$1,739,683 (99.3%)** |

The dashboard publishes Bankr's revenue only as one number for both chains, so the per-chain claims are our estimate. The combined comparison doesn't depend on that estimate.

The difference between the last two rows is **$76.5K of Base fees paid in tokenized stocks, TAO and BNKR**. The dashboard's daily totals line up only when that leg is left out, so it appears not to count it. Only Bankr can confirm that.

The match holds day by day. On 25 of 28 days, the receipts are within 10% of the dashboard's daily figure, and the biggest days match almost exactly:

| Day | On-chain | Dashboard |
|---|---:|---:|
| Sep 16 | $265.9K | $263.8K |
| Sep 22 | $264.8K | $264.1K |
| Sep 23 | $113.2K | $113.6K |

The remaining gap is **$11.7K (0.7%)**. The likeliest causes are Clanker lockers older than v4, which we didn't read (about $15K implied), timing at the month boundary, and different price sources.

Two amounts sit outside these totals, and both would add to Bankr's side rather than subtract:

- **$388.6K of fees paid in Bankr-launched tokens**, marked at the pool price when received: $17.9K on Base and $370.7K on Robinhood Chain, mostly musebook. These pools are thin. At current prices the Robinhood part is worth about $125.8K. The dashboard appears to leave these out, which is the conservative choice.
- **$82.8K of fees still unclaimed** in the contracts around Oct 1, almost all of it older LP fees in Base pools. This is cumulative, not September's.

## Robinhood Chain: 79% of the money

**$1,434,068 of the $1,816,231 arrived on Robinhood Chain.** Most of it came through the claimed hook: $472.5K in WETH and $845.0K in tokenized stocks and USDG, $716K of it in META. The per-swap hook added $115.7K, mostly in GME, SPY and NVDA. Against our estimate of Robinhood's share of the dashboard figure, that is 100.2%. The dashboard itself puts 74% of September's creator fees on Robinhood Chain.

DefiLlama books Bankr's revenue there at $0 (see below), and we haven't seen another public check of this leg. Part of the difficulty is pricing: a fee paid in META or GME needs a stock price on a chain few tools index. We used DefiLlama's price series and checked it against swaps in the stock/USDG pools on Robinhood Chain. On Sep 2, META traded at $592.9 on-chain against $583.9 on DefiLlama, and SPY at $763.7 against about $768. GME was the exception. DefiLlama had no price for Sep 1–3 and a stale $34.44 for Sep 4–7, while GME traded at $18.6–20.0 on-chain. We used the on-chain price, which lowered the GME leg by about $39K.

## Why DefiLlama shows $1.03M

DefiLlama's Bankr adapter (`fees/bankr.ts` in `DefiLlama/dimension-adapters`, last changed Sep 5) reads no contracts. Once a day it fetches Bankr's public dashboard and copies that day's row.

Bankr's dashboard fills in each day over the following one to three days. Between our Sep 29 and Sep 30 fetches, for example, its Robinhood creator fees for Sep 28 went from $254 to $6,412. The adapter runs shortly after each day closes, so it often copies a row that is still nearly empty, and keeps it.

For Sep 1–28 it stored **$1,030,374, 58.8% of the dashboard**. 17 of the 28 days are low, and on 11 of them it stored less than 1% of the final value:

| Day | DefiLlama stored | Dashboard (Sep 30) | On-chain |
|---|---:|---:|---:|
| Sep 9 | $60 | $39,238 | $38,005 |
| Sep 16 | **$104** | $263,786 | $265,921 |
| Sep 19 | $58 | $89,525 | $89,171 |
| Sep 24 | $481 | $56,479 | $56,155 |

Because the dashboard publishes Bankr's revenue only as a combined number, the adapter books all of it on Base. That is a reasonable choice given the input, but it means DefiLlama shows **$0 of Bankr revenue on Robinhood Chain**, where 79% of it is received.

Both problems have simple fixes: re-read recent days (or wait about three days before storing one), and have Bankr publish its revenue per chain. An adapter that sums transfers from the fee contracts above, chain by chain, gives about $1.82M for the same 28 days.

## From Robinhood Chain to BNKR

The fees don't stay on Robinhood Chain.

- **Sep 25.** Bankr's fee wallet bridged 249,749.97 USDG out of Robinhood Chain through Relay ([tx](https://robinhoodchain.blockscout.com/tx/0x284c3fc5040aab8ba64658a4fa51b90b4cd1fa267254fca77c1e22bea67dbf8a)) and received 249,632.81 USDC on Base ([tx](https://base.blockscout.com/tx/0x74eb26b55b751a1c2411d10f53443a33ddd72f6d39fcaf92e8f013bc0a8fbd3a)). Within a minute it swapped the USDC into BNKR ([tx](https://base.blockscout.com/tx/0xc3bc151b8a548b0584c18da1aa3c16528e28f597e499fae01f1127ca1ddbf02c)).
- **Buybacks.** SafeA, the Safe that collects the one-third share, acquired about **1.50B BNKR** in September: about 988M from the BNKR/WETH pool for 121.45 WETH, and 516M through Relay's router.
- **Sep 29.** SafeA funded the first BNKR staking reward period: **124,969,995 BNKR** (about $51K), paid out over seven days through the BnkrStakingV3 contract ([tx](https://base.blockscout.com/tx/0xc4bb37ac3e1bb17907d4f1fc8734f7b1a9dd28c3ec5d94941220355e2775c167)). Staking opened around Sep 27.

## What stakers may ask

None of these are errors. They are things a BNKR staker would want to know, so we state them plainly.

- **Concentration.** One Robinhood pool, musebook/META ([launched Sep 16](https://robinhoodchain.blockscout.com/tx/0xf240cad9fdfc2aceeb4d9e87208f72025bc1f8ebbdd411357909ad9b1d1a7259)), produced **$548K**. That is 42% of the claimed-hook fees on Robinhood Chain and about 30% of all liquid fees received. The top 10 pools produced 67% of the claimed-hook fees on Base and 71% on Robinhood Chain.
- **Bankr's own stake.** SafeB staked **3.29B BNKR** on Sep 28 and Sep 30 ([tx](https://base.blockscout.com/tx/0x12eb364a5ad1ad6c29b56ba7ac26773994dfe143a4f51c91e2964241a4552ed7), [tx](https://base.blockscout.com/tx/0xe65c028634f1adf0e423fac67d63166624a8f24bca14239fa89b26f1797b1ac0)). That is **13.6% of the 24.28B BNKR staked**, so it earns about 13.5% of the rewards SafeA funds. SafeA held 1.41B BNKR around Oct 1.
- **The per-token table.** The dashboard's per-token figures don't follow the chain. For musebook it shows $241,013 of Bankr revenue, while the pool released 798.9 META (about $560K) plus 988M musebook to the Safes in September. Every Clanker token is booked at exactly 40% for Bankr, which suggests the per-token split is modeled. The daily totals, by contrast, follow what was received.
- **Whose Safes are these?** Treating SafeA and SafeB as Bankr's is our inference, not something Bankr has told us. The evidence: they are the only fee beneficiaries on the `0x9982` hook in every Bankr pool we sampled. Bankr's fee wallet is an owner of SafeA and executes its claims. Money moves directly between the fee wallet and both Safes, in both directions. Bankr's own API lists them as fee claimants at 33.33% and 66.66%. And the dashboard's total lines up only when both are counted. **We'd welcome Bankr confirming or correcting this.** If either Safe belongs to a partner, its share should come out of these totals.

## What we didn't check

- **The last two days.** The window ends Sep 28 because the dashboard hadn't filled in Sep 29–30 when we fetched it (it showed $4,436). On-chain, those two days brought $66.6K on Base and $44.0K on Robinhood Chain in liquid fees, plus $16.8K in launched tokens.
- **Other revenue.** Club subscriptions, x402 payments and Bankr's LLM gateway are outside this check. So are creator fees and volume.
- **Older Clanker lockers** (before v4), which likely account for most of the $11.7K gap.
- **Wash trading.** We didn't try to separate it. A fee paid by a wash trade is still a fee received.
- **Unclaimed fees** were read only for pools that paid out in September or appear in the dashboard's top lists. Older pools that were never claimed could hold more.

---

*Verified September 30 – October 1, 2026. On Base, every token transfer into Bankr's fee wallet (`0xF60633D02690e2A15A54AB919925F3d038Df163e`), SafeA (`0x042455f9990098e11592be1fbd72e6dc68419b13`) and SafeB (`0x5f8da8f88ec81e27f2e22fcb9ca5d926c595e508`) was read with full transfer scans via an Alchemy archive endpoint and Base's public RPC, with Blockscout for contract labels; Sep 1–28 is blocks 50,715,727–51,925,326. ChainWard's own Base node was stalled at block 51,816,528 (about Sep 26) and was not used for any figure. Robinhood Chain (chain 4663) was read from its public RPC with full log scans over blocks 51,274,668–75,210,573 for Sep 1–28. Block boundaries are the first block at or after 00:00 UTC. Fee contracts were identified from pool configuration read on-chain; Bankr's hooks are not in Doppler's public deployment list. Prices come from DefiLlama's coins API (third party, 2-hour series), cross-checked against on-chain stock/USDG swaps on Robinhood Chain, with GME for Sep 1–7 taken from those swaps. Launched-token receipts are marked at pool prices and reported separately; 286 dust receipts are unpriced. Dashboard: `api.bankr.bot/public/dashboard`, fetched Sep 30 at 23:40 UTC. DefiLlama: `api.llama.fi/summary/fees/bankr`, fetched Oct 1, and the adapter source on GitHub. Hook settings, beneficiaries, unclaimed fees and staking state were read from contract state around Oct 1 (staking at Base block 52,014,774). Bridge details come from Relay's request API. Per-chain dashboard figures are our estimate. Counts are transfers and addresses, not people. The chain shows where money moved, not why. This checks a published number; it is not a rating of Bankr or advice on BNKR.*

> Disclosure: Before publishing, ChainWard offered Bankr a paid, private version of this reconciliation. Bankr has not paid for, reviewed or approved this article.

*ChainWard checks published revenue and activity numbers against the chain, privately, for the teams that publish them. DM [@SaltCx](https://x.com/SaltCx) on X.*
